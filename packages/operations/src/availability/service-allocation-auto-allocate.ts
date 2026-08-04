/**
 * Auto-allocation: turning a departure's travelers and resources into a plan,
 * previewing it, and committing it.
 *
 * Split out of `service-allocation-automation.ts`, which now owns
 * materialisation only. The two halves share nothing but the allocator.
 */

import type { AllocationResource } from "@voyant-travel/availability/schema"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import {
  type AllocatorResource,
  type AllocatorTraveler,
  planRoomAllocation,
  planVehicleSeatAllocation,
} from "./auto-allocator.js"
import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import {
  type AllocationMutationOptions,
  getSlotAllocationManifest,
  recordAllocationAudit,
  type SlotAllocationManifest,
} from "./service-allocation.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import {
  type ResourceCapacityViolation,
  validateSlotAllocationCapacity,
} from "./service-allocation-resource-capacity.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"
import type { allocationAutomationSchema } from "./validation.js"

export type AllocationAutomationInput = z.infer<typeof allocationAutomationSchema>

export interface AllocationAutomationResult {
  kind: string
  assigned?: number
  skipped?: number
  created?: number
  /**
   * Template groups that already had resources on this slot and were left
   * alone. Both materialisation paths report it, so a retry is visibly a
   * no-op rather than an error.
   */
  skippedExisting?: number
  resources?: AllocationResource[]
}

export interface AllocationPlanEntry {
  travelerId: string
  travelerName: string
  bookingId: string
  bookingNumber: string
  sharingGroupId: string | null
  resourceId: string
  resourceLabel: string | null
  /** The resource the traveler holds today; `null` when unassigned. */
  currentResourceId: string | null
  /** `true` when the plan would leave the traveler exactly where they are. */
  unchanged: boolean
}

export interface AllocationPlanPreview {
  kind: string
  assigned: number
  skipped: number
  /** Entries the plan would write, in allocator order. */
  entries: AllocationPlanEntry[]
  /**
   * Capacity violations the plan would create. Always empty in practice — the
   * plan is computed under the same lock the writer takes — but returned so a
   * caller can render the backstop rather than trusting it silently.
   */
  violations: ResourceCapacityViolation[]
}

/**
 * Dry-run auto-allocation: compute the plan and hand it back **without
 * writing**. The transaction is opened so `validateSlotAllocationCapacity`'s
 * `FOR UPDATE` spans the whole check, and it commits having changed nothing.
 *
 * This is the first production caller of `validateSlotAllocationCapacity`,
 * which shipped exported and unused.
 */
export async function previewAutoAllocateSlotResources(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
): Promise<AllocationPlanPreview> {
  const kind = input.kind ?? "room"

  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    const manifest = await getSlotAllocationManifest(scoped, slotId)
    if (!manifest) throw new AllocationServiceError("Availability slot not found", 404)

    const resources = manifest.resources.filter((resource) => resource.kind === kind)
    if (resources.length === 0) {
      throw new AllocationServiceError("No resources for this allocation kind", 400, { kind })
    }

    const travelers = toAllocatorTravelers(manifest, kind)
    const planned =
      kind === "vehicle_seat"
        ? planVehicleSeatAllocation(travelers, resources.map(toAllocatorResource))
        : planRoomAllocation(travelers, resources.map(toAllocatorResource))

    const resourceLabelById = new Map(resources.map((resource) => [resource.id, resource.label]))
    const travelerById = new Map(
      manifest.bookings.flatMap((booking) =>
        booking.travelers.map((traveler) => [traveler.id, { traveler, booking }] as const),
      ),
    )

    const entries = planned.assignments.flatMap((assignment): AllocationPlanEntry[] => {
      const found = travelerById.get(assignment.travelerId)
      if (!found) return []
      const currentResourceId = found.traveler.allocations[kind] ?? null
      return [
        {
          travelerId: assignment.travelerId,
          travelerName: found.traveler.fullName,
          bookingId: found.booking.id,
          bookingNumber: found.booking.bookingNumber,
          sharingGroupId: found.traveler.sharingGroupId,
          resourceId: assignment.resourceId,
          resourceLabel: resourceLabelById.get(assignment.resourceId) ?? null,
          currentResourceId,
          unchanged: currentResourceId === assignment.resourceId,
        },
      ]
    })

    const violations = await validateSlotAllocationCapacity(
      scoped,
      slotId,
      planned.assignments.map((assignment) => ({ ...assignment, kind })),
    )

    return {
      kind,
      assigned: planned.assignments.length,
      skipped: planned.skipped,
      entries,
      violations,
    }
  })
}

export async function autoAllocateSlotResources(
  db: PostgresJsDatabase,
  slotId: string,
  input: AllocationAutomationInput,
  options: AllocationMutationOptions = {},
): Promise<AllocationAutomationResult> {
  const kind = input.kind ?? "room"

  // The capacity invariant lives in the *decision*, not in the write, so the
  // manifest read, the plan and the upsert all sit inside one transaction
  // behind the same `FOR UPDATE` over the slot's resources of this kind.
  // Planning from a snapshot taken before the lock let a manual assignment
  // (or a second auto-allocate) land in between; the plan was then applied
  // verbatim and could push a resource past its capacity with no conflict
  // raised. Serialising the writes alone never serialised the decision.
  const plan = await db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase

    await scoped.execute(sql`
      SELECT id
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND kind = ${kind}
      FOR UPDATE
    `)

    const manifest = await getSlotAllocationManifest(scoped, slotId)
    if (!manifest) throw new AllocationServiceError("Availability slot not found", 404)

    const resources = manifest.resources.filter((resource) => resource.kind === kind)
    if (resources.length === 0) {
      throw new AllocationServiceError("No resources for this allocation kind", 400, { kind })
    }

    const travelers = toAllocatorTravelers(manifest, kind)
    const allocatorResources = resources.map(toAllocatorResource)
    const planned =
      kind === "vehicle_seat"
        ? planVehicleSeatAllocation(travelers, allocatorResources)
        : planRoomAllocation(travelers, allocatorResources)

    if (planned.assignments.length > 0) {
      const travelerIds = planned.assignments.map((assignment) => assignment.travelerId)
      const resourceIds = planned.assignments.map((assignment) => assignment.resourceId)
      await scoped.execute(sql`
        INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
        SELECT
          row.traveler_id,
          jsonb_build_object(${kind}::text, row.resource_id::text)
        FROM unnest(${sqlTextArray(travelerIds)}, ${sqlTextArray(resourceIds)}) AS row(traveler_id, resource_id)
        ON CONFLICT (traveler_id) DO UPDATE SET
          allocations =
            COALESCE(booking_traveler_travel_details.allocations, '{}'::jsonb)
            || EXCLUDED.allocations,
          updated_at = now()
      `)
      await assertPlannedResourcesWithinCapacity(scoped, slotId, kind, resourceIds)
    }

    // Audit inside the transaction. A rolled-back allocation must not leave a
    // record claiming travelers were placed, and an audit insert that fails
    // must take the allocation with it — see #4164.
    await recordAllocationAudit(scoped, {
      slotId,
      action: "auto-allocate",
      actorId: options.actorId ?? null,
      after: { kind, assigned: planned.assignments.length, skipped: planned.skipped },
    })

    return planned
  })

  return { kind, assigned: plan.assignments.length, skipped: plan.skipped }
}

/**
 * Post-write invariant check for the resources an auto-allocate plan
 * touched. Re-planning under the lock already keeps the plan inside
 * capacity, so this is a backstop against an allocator regression rather
 * than the primary guard -- it runs inside the writing transaction, so a
 * violation rolls the whole plan back instead of shipping an oversold slot.
 * One aggregate query over the planned resources only: an unrelated
 * resource that was already over capacity must not block the operator.
 */
async function assertPlannedResourcesWithinCapacity(
  db: PostgresJsDatabase,
  slotId: string,
  kind: string,
  resourceIds: string[],
): Promise<void> {
  const overflowing = await executeRows<{
    id: string
    label: string | null
    capacity: number
    assigned: number
  }>(
    db,
    sql`
      SELECT ar.id, ar.label, ar.capacity, usage.assigned
      FROM allocation_resources ar
      JOIN LATERAL (
        SELECT COUNT(DISTINCT btd.traveler_id)::int AS assigned
        FROM booking_traveler_travel_details btd
        JOIN booking_travelers bt ON bt.id = btd.traveler_id
        JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
        JOIN bookings b ON b.id = bt.booking_id
        WHERE btd.allocations ->> ar.kind = ar.id
          AND ba.availability_slot_id = ar.slot_id
          AND b.status IN (${activeBookingStatusesSql()})
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
      ) usage ON true
      WHERE ar.slot_id = ${slotId}
        AND ar.kind = ${kind}
        AND ar.id = ANY(${sqlTextArray([...new Set(resourceIds)])})
        AND usage.assigned > ar.capacity
    `,
  )

  if (overflowing.length === 0) return

  throw new AllocationServiceError("Resource over capacity", 409, {
    kind,
    resources: overflowing.map((resource) => ({
      id: resource.id,
      label: resource.label,
      capacity: resource.capacity,
      assigned: resource.assigned,
    })),
  })
}

function toAllocatorTravelers(manifest: SlotAllocationManifest, kind: string): AllocatorTraveler[] {
  const travelers: AllocatorTraveler[] = []
  for (const booking of manifest.bookings) {
    for (const traveler of booking.travelers) {
      travelers.push({
        id: traveler.id,
        bookingId: booking.id,
        bookingStatus: booking.status,
        isLeadTraveler: traveler.isLeadTraveler,
        sharingGroupId: traveler.sharingGroupId,
        hasAccessibilityNeeds: traveler.hasAccessibilityNeeds,
        existingAllocationId: traveler.allocations[kind] ?? null,
        optionId: traveler.optionId,
        optionUnitId: traveler.optionUnitId,
        optionUnitCode: traveler.optionUnitCode,
      })
    }
  }
  return travelers
}

function toAllocatorResource(resource: AllocationResource): AllocatorResource {
  return {
    id: resource.id,
    kind: resource.kind,
    capacity: resource.capacity,
    flags: resource.flags ?? {},
    parentId: resource.parentId,
    refType: resource.refType,
    refId: resource.refId,
    label: resource.label,
    row: typeof resource.flags?.row === "number" ? resource.flags.row : undefined,
    column: typeof resource.flags?.column === "string" ? resource.flags.column : undefined,
    position:
      resource.flags?.position === "window" ||
      resource.flags?.position === "aisle" ||
      resource.flags?.position === "middle"
        ? resource.flags.position
        : undefined,
  }
}
