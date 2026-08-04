/**
 * Batch traveler↔resource assignment.
 *
 * The per-traveler `PATCH .../travelers/{travelerId}` leg is one traveler per
 * request per transaction, so moving a sharing group of four meant four
 * requests: any of them could fail and leave a family half-placed, and the
 * capacity guard saw each move in isolation. This places a whole set inside one
 * transaction behind the same `FOR UPDATE` over the kind's resources that
 * auto-allocate takes, so a batch and an auto-allocate can never interleave.
 *
 * `validateSlotAllocationCapacity` runs *after* the writes and inside the same
 * transaction: it excludes the travelers being re-planned from the existing
 * count, so running it post-write is what lets a batch that frees a bed and
 * fills it in the same call pass, while a batch that oversells rolls back whole.
 */

import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import type { AllocationMutationOptions } from "./service-allocation.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import {
  type PlannedAllocation,
  validateSlotAllocationCapacity,
} from "./service-allocation-resource-capacity.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"

export interface BatchAllocationAssignment {
  travelerId: string
  /** Target resource, or `null` to unassign the traveler from this kind. */
  resourceId: string | null
  /**
   * Optimistic-concurrency precondition: the resource the caller believed this
   * traveler held. Omit to skip the check; pass `null` to require the traveler
   * to be currently unassigned. A mismatch rejects the whole batch with 409.
   */
  expectedResourceId?: string | null
}

export interface AssignTravelerAllocationsBatchInput {
  kind: string
  assignments: BatchAllocationAssignment[]
}

export interface AssignTravelerAllocationsBatchResult {
  kind: string
  assigned: number
  unassigned: number
  /** Assignments whose target already matched — written anyway, counted here. */
  unchanged: number
  travelerIds: string[]
}

export async function assignTravelerAllocationsBatch(
  db: PostgresJsDatabase,
  slotId: string,
  input: AssignTravelerAllocationsBatchInput,
  options: AllocationMutationOptions = {},
): Promise<AssignTravelerAllocationsBatchResult> {
  const { kind, assignments } = input
  if (assignments.length === 0) {
    throw new AllocationServiceError("A batch assignment needs at least one traveler", 400)
  }
  const travelerIds = assignments.map((assignment) => assignment.travelerId)
  if (new Set(travelerIds).size !== travelerIds.length) {
    throw new AllocationServiceError("A traveler may appear only once in a batch", 400)
  }
  if (kind === "vehicle" && assignments.some((assignment) => assignment.resourceId !== null)) {
    throw new AllocationServiceError(
      "Vehicles are parent resources; assign travelers to vehicle seats instead",
      400,
    )
  }

  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase

    // Same lock statement `autoAllocateSlotResources` takes, so a batch and an
    // auto-allocate serialize against each other rather than racing.
    await scoped.execute(sql`
      SELECT id
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND kind = ${kind}
      FOR UPDATE
    `)

    await assertTravelersBelongToSlot(scoped, slotId, travelerIds)
    const targetResourceIds = [
      ...new Set(
        assignments.flatMap((assignment) => (assignment.resourceId ? [assignment.resourceId] : [])),
      ),
    ]
    await assertResourcesBelongToSlot(scoped, slotId, kind, targetResourceIds)

    const before = await loadCurrentAllocations(scoped, travelerIds, kind)
    assertExpectedResourceIds(assignments, before)

    await scoped.execute(sql`
      INSERT INTO booking_traveler_travel_details (traveler_id)
      SELECT id FROM unnest(${sqlTextArray(travelerIds)}) AS u(id)
      ON CONFLICT (traveler_id) DO NOTHING
    `)

    const assigned = assignments.filter(
      (assignment): assignment is BatchAllocationAssignment & { resourceId: string } =>
        assignment.resourceId !== null,
    )
    const cleared = assignments.filter((assignment) => assignment.resourceId === null)

    if (assigned.length > 0) {
      await scoped.execute(sql`
        UPDATE booking_traveler_travel_details btd
        SET allocations =
              COALESCE(btd.allocations, '{}'::jsonb)
              || jsonb_build_object(${kind}::text, plan.resource_id::text),
            updated_at = now()
        FROM unnest(
          ${sqlTextArray(assigned.map((assignment) => assignment.travelerId))},
          ${sqlTextArray(assigned.map((assignment) => assignment.resourceId))}
        ) AS plan(traveler_id, resource_id)
        WHERE btd.traveler_id = plan.traveler_id
      `)
    }
    if (cleared.length > 0) {
      await scoped.execute(sql`
        UPDATE booking_traveler_travel_details
        SET allocations = COALESCE(allocations, '{}'::jsonb) - ${kind}::text,
            updated_at = now()
        WHERE traveler_id = ANY(${sqlTextArray(cleared.map((assignment) => assignment.travelerId))})
      `)
    }

    const planned: PlannedAllocation[] = assigned.map((assignment) => ({
      travelerId: assignment.travelerId,
      kind,
      resourceId: assignment.resourceId,
    }))
    const violations = await validateSlotAllocationCapacity(scoped, slotId, planned)
    if (violations.length > 0) {
      throw new AllocationServiceError("Resource over capacity", 409, { kind, violations })
    }

    // Audit inside the transaction: a rolled-back batch must not leave an entry
    // claiming the family was moved.
    await recordAllocationAudit(scoped, {
      slotId,
      action: "traveler.assign.batch",
      actorId: options.actorId ?? null,
      before: {
        kind,
        assignments: assignments.map((assignment) => ({
          travelerId: assignment.travelerId,
          resourceId: before.get(assignment.travelerId) ?? null,
        })),
      },
      after: {
        kind,
        assignments: assignments.map((assignment) => ({
          travelerId: assignment.travelerId,
          resourceId: assignment.resourceId,
        })),
      },
    })

    const unchanged = assignments.filter(
      (assignment) => (before.get(assignment.travelerId) ?? null) === assignment.resourceId,
    ).length

    return {
      kind,
      assigned: assigned.length,
      unassigned: cleared.length,
      unchanged,
      travelerIds,
    }
  })
}

async function assertTravelersBelongToSlot(
  db: PostgresJsDatabase,
  slotId: string,
  travelerIds: readonly string[],
): Promise<void> {
  const rows = await executeRows<{ id: string }>(
    db,
    sql`
      SELECT DISTINCT bt.id
      FROM booking_travelers bt
      JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
      JOIN bookings b ON b.id = bt.booking_id
      WHERE bt.id = ANY(${sqlTextArray([...travelerIds])})
        AND ba.availability_slot_id = ${slotId}
        AND b.status IN (${activeBookingStatusesSql()})
        AND ba.status IN (${activeBookingAllocationStatusesSql()})
    `,
  )
  const found = new Set(rows.map((row) => row.id))
  const missing = travelerIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new AllocationServiceError("Traveler not found for this slot", 404, {
      travelerIds: missing,
    })
  }
}

async function assertResourcesBelongToSlot(
  db: PostgresJsDatabase,
  slotId: string,
  kind: string,
  resourceIds: readonly string[],
): Promise<void> {
  if (resourceIds.length === 0) return
  const rows = await executeRows<{ id: string }>(
    db,
    sql`
      SELECT id
      FROM allocation_resources
      WHERE slot_id = ${slotId}
        AND kind = ${kind}
        AND id = ANY(${sqlTextArray([...resourceIds])})
    `,
  )
  const found = new Set(rows.map((row) => row.id))
  const missing = resourceIds.filter((id) => !found.has(id))
  if (missing.length > 0) {
    throw new AllocationServiceError("Resource not found for this slot/kind", 404, {
      resourceIds: missing,
    })
  }
}

async function loadCurrentAllocations(
  db: PostgresJsDatabase,
  travelerIds: readonly string[],
  kind: string,
): Promise<Map<string, string | null>> {
  const rows = await executeRows<{ traveler_id: string; resource_id: string | null }>(
    db,
    sql`
      SELECT traveler_id, allocations ->> ${kind} AS resource_id
      FROM booking_traveler_travel_details
      WHERE traveler_id = ANY(${sqlTextArray([...travelerIds])})
    `,
  )
  return new Map(rows.map((row) => [row.traveler_id, row.resource_id]))
}

function assertExpectedResourceIds(
  assignments: readonly BatchAllocationAssignment[],
  before: ReadonlyMap<string, string | null>,
): void {
  const conflicts = assignments.flatMap((assignment) => {
    if (assignment.expectedResourceId === undefined) return []
    const current = before.get(assignment.travelerId) ?? null
    if (current === assignment.expectedResourceId) return []
    return [
      {
        travelerId: assignment.travelerId,
        expectedResourceId: assignment.expectedResourceId,
        currentResourceId: current,
      },
    ]
  })
  if (conflicts.length === 0) return
  throw new AllocationServiceError("Traveler allocation changed after it was read", 409, {
    reason: "revision_conflict",
    conflicts,
  })
}
