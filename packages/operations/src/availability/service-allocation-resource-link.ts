/**
 * Attach a global fleet `resources` row to one departure.
 *
 * Until now `allocation_resources.ref_type` only ever carried `"option"` or
 * `"option_unit"`, so a coach that exists as a `resources` record could never be
 * pointed at the departure it actually operates. The departure workspace and the
 * Resources admin section each had their own idea of "the coach on this
 * departure" and nothing reconciled them.
 *
 * ## Authority
 *
 * The two tables answer different questions and both stay, with one write path:
 *
 *   - **`allocation_resources` (`ref_type = "resource"`) is authoritative for
 *     what the departure operates.** It is slot-scoped, carries the capacity
 *     travelers are assigned against, parents the seats, and is what every
 *     manifest, export, conflict and capacity counter already reads. A departure
 *     never has to consult the Resources module to render or validate its plan.
 *   - **`resource_slot_assignments` is authoritative for fleet commitment across
 *     departures.** It is the only table that spans slots, so it is the only one
 *     that can answer "is this coach already committed to an overlapping
 *     departure". `allocation_resources` is slot-scoped by construction and can
 *     never see a clash.
 *
 * A coach therefore cannot be attached twice, because both rows are written and
 * released together inside one transaction, and the fleet ledger is consulted as
 * the conflict oracle *before* the allocation resource is created. An assignment
 * the Resources admin already made for this slot is **adopted**, not duplicated:
 * a live `resource_slot_assignments` row for the same (slot, resource) is reused
 * and its id recorded on the allocation resource's `flags.resourceAssignmentId`.
 *
 * `docs/architecture/operated-departure-logistics.md` records the decision.
 */

import { newId } from "@voyant-travel/db/lib/typeid"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { AllocationMutationOptions } from "./service-allocation.js"
import { recordAllocationAudit } from "./service-allocation-audit.js"
import { AllocationServiceError } from "./service-allocation-errors.js"
import { clearTravelerAllocationsForResource } from "./service-allocation-resource-capacity.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"

/** Fleet-assignment statuses that still hold the resource for a departure. */
const LIVE_ASSIGNMENT_STATUSES = ["reserved", "assigned"] as const

/**
 * Default departure-workspace kind for each `resources.kind`. Kinds absent here
 * (guide, equipment, other) are not traveler-assignable containers, so the
 * caller must name the workspace kind explicitly.
 */
const WORKSPACE_KIND_BY_RESOURCE_KIND: Readonly<Record<string, string>> = {
  vehicle: "vehicle",
  boat: "vehicle",
  room: "room",
}

export interface AttachDepartureResourceInput {
  /** `resources.id` of the fleet record to attach. */
  resourceId: string
  /**
   * Departure-workspace kind for the created `allocation_resources` row.
   * Defaults from the fleet record's own kind; required for kinds that have no
   * default (guide, equipment, other).
   */
  kind?: string
  /**
   * Capacity of the departure container. Defaults to the fleet record's
   * `capacity`; required when the fleet record does not declare one.
   */
  capacity?: number
  /** Label override. Defaults to the fleet record's name (and code, if set). */
  label?: string | null
  flags?: Record<string, unknown>
  sortOrder?: number
  notes?: string | null
}

export interface DepartureResourceLink {
  /** The `allocation_resources` row the departure operates. */
  resource: DepartureResourceRow
  /** The `resource_slot_assignments` row holding the fleet commitment. */
  assignmentId: string
  /** `false` when an identical link already existed and was returned as-is. */
  created: boolean
}

export interface DepartureResourceRow {
  id: string
  slotId: string
  kind: string
  refType: string | null
  refId: string | null
  label: string | null
  capacity: number
  flags: Record<string, unknown>
  parentId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface AllocationResourceSqlRow {
  id: string
  slot_id: string
  kind: string
  ref_type: string | null
  ref_id: string | null
  label: string | null
  capacity: number
  flags: Record<string, unknown> | null
  parent_id: string | null
  sort_order: number
  created_at: string | Date
  updated_at: string | Date
}

function toDepartureResourceRow(row: AllocationResourceSqlRow): DepartureResourceRow {
  return {
    id: row.id,
    slotId: row.slot_id,
    kind: row.kind,
    refType: row.ref_type,
    refId: row.ref_id,
    label: row.label,
    capacity: row.capacity,
    flags: row.flags ?? {},
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

const ALLOCATION_RESOURCE_COLUMNS = sql`
  id, slot_id, kind, ref_type, ref_id, label, capacity, flags, parent_id, sort_order,
  created_at, updated_at
`

/**
 * Attach a fleet resource to a departure.
 *
 * Idempotent: re-attaching the same resource to the same departure returns the
 * existing link with `created: false` rather than raising, which is the same
 * "already there is success" rule the materialisation paths follow.
 */
export async function attachDepartureResource(
  db: PostgresJsDatabase,
  slotId: string,
  input: AttachDepartureResourceInput,
  options: AllocationMutationOptions = {},
): Promise<DepartureResourceLink> {
  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    const slot = await lockSlot(scoped, slotId)
    const resource = await loadFleetResource(scoped, input.resourceId)

    const existing = await findLinkedAllocationResource(scoped, slotId, input.resourceId)
    if (existing) {
      const assignmentId =
        typeof existing.flags.resourceAssignmentId === "string"
          ? existing.flags.resourceAssignmentId
          : await ensureFleetAssignment(scoped, slotId, input.resourceId, options.actorId ?? null)
      return { resource: existing, assignmentId, created: false }
    }

    const kind = input.kind ?? WORKSPACE_KIND_BY_RESOURCE_KIND[resource.kind]
    if (!kind) {
      throw new AllocationServiceError(
        "This resource kind has no default departure kind; name one explicitly",
        400,
        { resourceKind: resource.kind },
      )
    }
    const capacity = input.capacity ?? resource.capacity
    if (capacity == null || capacity < 1) {
      throw new AllocationServiceError(
        "The resource declares no capacity; supply one when attaching it",
        400,
        { resourceId: input.resourceId },
      )
    }

    await assertNoOverlappingCommitment(scoped, {
      slotId,
      resourceId: input.resourceId,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
    })

    const assignmentId = await ensureFleetAssignment(
      scoped,
      slotId,
      input.resourceId,
      options.actorId ?? null,
      input.notes ?? null,
    )

    const label = input.label ?? defaultResourceLabel(resource)
    const flags = {
      ...(input.flags ?? {}),
      resourceAssignmentId: assignmentId,
      resourceKind: resource.kind,
      ...(resource.code ? { resourceCode: resource.code } : {}),
    }
    const rows = await executeRows<AllocationResourceSqlRow>(
      scoped,
      sql`
        INSERT INTO allocation_resources
          (id, slot_id, kind, ref_type, ref_id, label, capacity, flags, sort_order)
        VALUES (
          ${newId("allocation_resources")},
          ${slotId},
          ${kind},
          'resource',
          ${input.resourceId},
          ${label},
          ${capacity},
          ${JSON.stringify(flags)}::jsonb,
          ${input.sortOrder ?? 0}
        )
        RETURNING ${ALLOCATION_RESOURCE_COLUMNS}
      `,
    )
    const created = rows[0]
    if (!created) throw new AllocationServiceError("Resource attach failed", 500)

    // Audit inside the transaction: a rolled-back attach must not leave an
    // entry claiming the coach is on the departure.
    await recordAllocationAudit(scoped, {
      slotId,
      action: "resource.attach",
      actorId: options.actorId ?? null,
      resourceId: created.id,
      after: {
        fleetResourceId: input.resourceId,
        assignmentId,
        kind,
        capacity,
        label,
      },
    })

    return { resource: toDepartureResourceRow(created), assignmentId, created: true }
  })
}

export interface DetachDepartureResourceOptions extends AllocationMutationOptions {
  /**
   * Optimistic-concurrency precondition: the `updatedAt` the caller read. A
   * mismatch rejects with 409 rather than detaching a coach someone else
   * reconfigured in the meantime.
   */
  expectedUpdatedAt?: string
  /**
   * Delete the resource's children (a coach's seats) too. Without it a coach
   * that has been laid out is refused, matching manual resource deletion.
   */
  cascade?: boolean
}

/**
 * Detach a fleet resource from a departure: remove the `allocation_resources`
 * row (and, with `cascade`, its seats), clear traveler allocations that pointed
 * at them, and release the fleet commitment so the coach is free again.
 */
export async function detachDepartureResource(
  db: PostgresJsDatabase,
  slotId: string,
  resourceId: string,
  options: DetachDepartureResourceOptions = {},
): Promise<{ removedResourceIds: string[]; assignmentId: string | null } | null> {
  return db.transaction(async (tx) => {
    const scoped = tx as PostgresJsDatabase
    await lockSlot(scoped, slotId)

    const link = await findLinkedAllocationResource(scoped, slotId, resourceId)
    if (!link) return null
    assertExpectedUpdatedAt(link.updatedAt, options.expectedUpdatedAt, link.id)

    const children = await executeRows<{ id: string }>(
      scoped,
      sql`
        SELECT id FROM allocation_resources
        WHERE slot_id = ${slotId} AND parent_id = ${link.id}
        ORDER BY sort_order, created_at
      `,
    )
    if (children.length > 0 && !options.cascade) {
      throw new AllocationServiceError(
        "Remove child resources before detaching their parent",
        409,
        { childCount: children.length },
      )
    }

    const removedResourceIds = [...children.map((child) => child.id), link.id]
    for (const removedId of removedResourceIds) {
      await clearTravelerAllocationsForResource(scoped, removedId)
    }
    await scoped.execute(sql`
      DELETE FROM allocation_resources
      WHERE slot_id = ${slotId} AND id = ANY(${sqlTextArray(removedResourceIds)})
    `)

    const assignmentId =
      typeof link.flags.resourceAssignmentId === "string" ? link.flags.resourceAssignmentId : null
    await scoped.execute(sql`
      UPDATE resource_slot_assignments
      SET status = 'released', released_at = now()
      WHERE slot_id = ${slotId}
        AND resource_id = ${resourceId}
        AND status IN (${liveAssignmentStatusesSql()})
    `)

    await recordAllocationAudit(scoped, {
      slotId,
      action: "resource.detach",
      actorId: options.actorId ?? null,
      resourceId: link.id,
      before: {
        fleetResourceId: resourceId,
        assignmentId,
        kind: link.kind,
        capacity: link.capacity,
        label: link.label,
        removedChildCount: children.length,
      },
    })

    return { removedResourceIds, assignmentId }
  })
}

/** Every fleet resource currently attached to a departure. */
export async function listDepartureResourceLinks(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<DepartureResourceRow[]> {
  const rows = await executeRows<AllocationResourceSqlRow>(
    db,
    sql`
      SELECT ${ALLOCATION_RESOURCE_COLUMNS}
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND ref_type = 'resource'
      ORDER BY kind, sort_order, created_at
    `,
  )
  return rows.map(toDepartureResourceRow)
}

function assertExpectedUpdatedAt(
  currentUpdatedAt: string,
  expectedUpdatedAt: string | undefined,
  resourceId: string,
): void {
  if (expectedUpdatedAt === undefined) return
  const expected = new Date(expectedUpdatedAt)
  if (Number.isNaN(expected.getTime())) {
    throw new AllocationServiceError("expectedUpdatedAt must be a valid instant", 400, {
      expectedUpdatedAt,
    })
  }
  if (expected.getTime() !== new Date(currentUpdatedAt).getTime()) {
    throw new AllocationServiceError("Allocation resource changed after it was read", 409, {
      reason: "revision_conflict",
      resourceId,
      expectedUpdatedAt,
      currentUpdatedAt,
    })
  }
}

function liveAssignmentStatusesSql() {
  return sql.join(
    // agent-quality: raw-sql reviewed -- owner: availability; each status is a bound parameter from a frozen literal tuple, never caller input.
    LIVE_ASSIGNMENT_STATUSES.map((status) => sql`${status}`),
    sql.raw(", "),
  )
}

interface SlotRow {
  id: string
  starts_at: string | Date
  ends_at: string | Date | null
}

async function lockSlot(db: PostgresJsDatabase, slotId: string): Promise<SlotRow> {
  const rows = await executeRows<SlotRow>(
    db,
    sql`
      SELECT id, starts_at, ends_at
      FROM availability_slots
      WHERE id = ${slotId}
      FOR UPDATE
    `,
  )
  const slot = rows[0]
  if (!slot) throw new AllocationServiceError("Availability slot not found", 404)
  return slot
}

interface FleetResourceRow {
  id: string
  kind: string
  name: string
  code: string | null
  capacity: number | null
  active: boolean
}

async function loadFleetResource(
  db: PostgresJsDatabase,
  resourceId: string,
): Promise<FleetResourceRow> {
  const rows = await executeRows<FleetResourceRow>(
    db,
    sql`
      SELECT id, kind::text AS kind, name, code, capacity, active
      FROM resources
      WHERE id = ${resourceId}
      LIMIT 1
    `,
  )
  const resource = rows[0]
  if (!resource) throw new AllocationServiceError("Resource not found", 404)
  if (!resource.active) {
    throw new AllocationServiceError("Resource is inactive and cannot be attached", 400, {
      resourceId,
    })
  }
  return resource
}

function defaultResourceLabel(resource: FleetResourceRow): string {
  return resource.code ? `${resource.name} (${resource.code})` : resource.name
}

async function findLinkedAllocationResource(
  db: PostgresJsDatabase,
  slotId: string,
  resourceId: string,
): Promise<DepartureResourceRow | null> {
  const rows = await executeRows<AllocationResourceSqlRow>(
    db,
    sql`
      SELECT ${ALLOCATION_RESOURCE_COLUMNS}
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND ref_type = 'resource' AND ref_id = ${resourceId}
      ORDER BY created_at
      LIMIT 1
    `,
  )
  return rows[0] ? toDepartureResourceRow(rows[0]) : null
}

/**
 * The fleet ledger is the conflict oracle. A live assignment on any *other*
 * departure whose operating window overlaps this one means the coach is already
 * committed; `allocation_resources` is slot-scoped and can never see that.
 *
 * A slot without `ends_at` is treated as instantaneous — it still collides with
 * a multi-day departure that spans it, which is the case that matters.
 */
async function assertNoOverlappingCommitment(
  db: PostgresJsDatabase,
  input: {
    slotId: string
    resourceId: string
    startsAt: string | Date
    endsAt: string | Date | null
  },
): Promise<void> {
  const startsAt = new Date(input.startsAt).toISOString()
  const endsAt = new Date(input.endsAt ?? input.startsAt).toISOString()
  const conflicts = await executeRows<{
    assignment_id: string
    slot_id: string
    starts_at: string | Date
    ends_at: string | Date | null
  }>(
    db,
    sql`
      SELECT rsa.id AS assignment_id, rsa.slot_id, s.starts_at, s.ends_at
      FROM resource_slot_assignments rsa
      JOIN availability_slots s ON s.id = rsa.slot_id
      WHERE rsa.resource_id = ${input.resourceId}
        AND rsa.slot_id <> ${input.slotId}
        AND rsa.status IN (${liveAssignmentStatusesSql()})
        AND tstzrange(s.starts_at, COALESCE(s.ends_at, s.starts_at), '[]')
            && tstzrange(${startsAt}::timestamptz, ${endsAt}::timestamptz, '[]')
      ORDER BY s.starts_at
      LIMIT 1
    `,
  )
  const conflict = conflicts[0]
  if (!conflict) return
  throw new AllocationServiceError(
    "Resource is already committed to an overlapping departure",
    409,
    {
      reason: "resource_double_booked",
      resourceId: input.resourceId,
      conflictingSlotId: conflict.slot_id,
      conflictingAssignmentId: conflict.assignment_id,
    },
  )
}

/**
 * Adopt the departure's existing live fleet assignment, or open one. Adoption is
 * what keeps the Resources admin section and the departure workspace from
 * producing two commitments for the same coach on the same departure.
 */
async function ensureFleetAssignment(
  db: PostgresJsDatabase,
  slotId: string,
  resourceId: string,
  actorId: string | null,
  notes: string | null = null,
): Promise<string> {
  const existing = await executeRows<{ id: string }>(
    db,
    sql`
      SELECT id
      FROM resource_slot_assignments
      WHERE slot_id = ${slotId}
        AND resource_id = ${resourceId}
        AND status IN (${liveAssignmentStatusesSql()})
      ORDER BY assigned_at
      LIMIT 1
      FOR UPDATE
    `,
  )
  const adopted = existing[0]
  if (adopted) return adopted.id

  const inserted = await executeRows<{ id: string }>(
    db,
    sql`
      INSERT INTO resource_slot_assignments (id, slot_id, resource_id, status, assigned_by, notes)
      VALUES (
        ${newId("resource_slot_assignments")},
        ${slotId},
        ${resourceId},
        'assigned',
        ${actorId},
        ${notes}
      )
      RETURNING id
    `,
  )
  const row = inserted[0]
  if (!row) throw new AllocationServiceError("Fleet assignment could not be opened", 500)
  return row.id
}
