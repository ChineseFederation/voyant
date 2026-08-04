import { allocationResources } from "@voyant-travel/availability/schema"
import { asc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { activeBookingAllocationStatusesSql, activeBookingStatusesSql } from "./booking-statuses.js"
import { executeRows, type SqlExecutor, sqlTextArray } from "./service-allocation-sql.js"

export async function listAllocationResources(db: PostgresJsDatabase, slotId: string) {
  return db
    .select()
    .from(allocationResources)
    .where(eq(allocationResources.slotId, slotId))
    .orderBy(
      asc(allocationResources.kind),
      asc(allocationResources.sortOrder),
      asc(allocationResources.createdAt),
    )
}

/**
 * Per-resource availability summary for a single slot: capacity, how
 * many travelers are currently assigned to that resource (across all
 * live bookings on the slot), and the resulting remaining headroom.
 * The summary is consumer-facing -- `assigned` is the same DISTINCT-
 * traveler count `countResourceOccupants` uses internally, so the
 * read-side and the per-traveler assignment guardrail agree.
 *
 * Returned in (kind, sortOrder, createdAt) order so consumers can
 * render rooming grids without resorting.
 */
export interface SlotResourceAvailability {
  id: string
  slotId: string
  kind: string
  label: string | null
  refType: string | null
  refId: string | null
  parentId: string | null
  capacity: number
  assigned: number
  available: number
  flags: Record<string, unknown>
  sortOrder: number
}

export async function getSlotResourceAvailability(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<SlotResourceAvailability[]> {
  const map = await getSlotsResourceAvailability(db, [slotId])
  return map.get(slotId) ?? []
}

export async function getSlotsResourceAvailability(
  db: PostgresJsDatabase,
  slotIds: string[],
): Promise<Map<string, SlotResourceAvailability[]>> {
  const uniqueIds = [...new Set(slotIds)].filter(Boolean)
  if (uniqueIds.length === 0) return new Map()

  const rows = await executeRows<{
    id: string
    slot_id: string
    kind: string
    label: string | null
    ref_type: string | null
    ref_id: string | null
    parent_id: string | null
    capacity: number
    assigned: number
    flags: Record<string, unknown> | null
    sort_order: number
  }>(
    db,
    sql`
      SELECT
        ar.id,
        ar.slot_id,
        ar.kind,
        ar.label,
        ar.ref_type,
        ar.ref_id,
        ar.parent_id,
        ar.capacity,
        COALESCE(usage.assigned, 0)::int AS assigned,
        ar.flags,
        ar.sort_order
      FROM allocation_resources ar
      LEFT JOIN LATERAL (
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
      WHERE ar.slot_id = ANY(${sqlTextArray(uniqueIds)})
      ORDER BY ar.slot_id, ar.kind, ar.sort_order, ar.created_at
    `,
  )

  const out = new Map<string, SlotResourceAvailability[]>()
  for (const row of rows) {
    const capacity = row.capacity
    const assigned = row.assigned ?? 0
    const list = out.get(row.slot_id) ?? []
    list.push({
      id: row.id,
      slotId: row.slot_id,
      kind: row.kind,
      label: row.label,
      refType: row.ref_type,
      refId: row.ref_id,
      parentId: row.parent_id,
      capacity,
      assigned,
      available: Math.max(0, capacity - assigned),
      flags: row.flags ?? {},
      sortOrder: row.sort_order,
    })
    out.set(row.slot_id, list)
  }
  return out
}

export interface PlannedAllocation {
  /** Traveler id whose allocation is being planned. */
  travelerId: string
  /** Resource kind, e.g. "room" or "vehicle_seat". */
  kind: string
  /** Resource id the traveler is being assigned to. */
  resourceId: string
}

export interface ResourceCapacityViolation {
  slotId: string
  resourceId: string
  kind: string
  capacity: number
  existingAssigned: number
  requested: number
}

/**
 * Validate that a batch of planned traveler->resource assignments fits
 * inside the per-resource capacity of the given slot. Read-only --
 * callers run this before persisting so they can surface
 * `resource_capacity_exhausted` with the offending resource cited.
 *
 * Travelers in `planned` are deduped per (kind, resourceId) so the
 * caller can pass the full booking payload (one row per traveler)
 * without inflating the count. Existing usage already credited to a
 * traveler being re-planned is excluded so re-saving the same payload
 * is idempotent.
 */
export async function validateSlotAllocationCapacity(
  db: PostgresJsDatabase,
  slotId: string,
  planned: PlannedAllocation[],
): Promise<ResourceCapacityViolation[]> {
  if (planned.length === 0) return []

  const byResource = new Map<string, { kind: string; travelerIds: Set<string> }>()
  for (const entry of planned) {
    if (!entry.resourceId || !entry.kind) continue
    const bucket = byResource.get(entry.resourceId) ?? {
      kind: entry.kind,
      travelerIds: new Set<string>(),
    }
    bucket.travelerIds.add(entry.travelerId)
    byResource.set(entry.resourceId, bucket)
  }

  if (byResource.size === 0) return []

  const resourceIds = [...byResource.keys()]
  // Lock the targeted rows so a concurrent caller cannot pass the
  // same check before this one persists. Callers must run inside a
  // transaction for the lock to span until commit; outside one this
  // is the same race as before, but the helper at least documents
  // the contract.
  const resources = await executeRows<{
    id: string
    kind: string
    capacity: number
    slot_id: string
  }>(
    db,
    sql`
      SELECT id, kind, capacity, slot_id
      FROM allocation_resources
      WHERE slot_id = ${slotId} AND id = ANY(${sqlTextArray(resourceIds)})
      FOR UPDATE
    `,
  )
  const resourceById = new Map(resources.map((r) => [r.id, r]))

  const violations: ResourceCapacityViolation[] = []
  for (const [resourceId, plan] of byResource) {
    const resource = resourceById.get(resourceId)
    if (!resource) {
      violations.push({
        slotId,
        resourceId,
        kind: plan.kind,
        capacity: 0,
        existingAssigned: 0,
        requested: plan.travelerIds.size,
      })
      continue
    }
    if (resource.kind !== plan.kind) {
      violations.push({
        slotId,
        resourceId,
        kind: plan.kind,
        capacity: resource.capacity,
        existingAssigned: 0,
        requested: plan.travelerIds.size,
      })
      continue
    }

    const travelerIdsArr = [...plan.travelerIds]
    const existingRows = await executeRows<{ count: number }>(
      db,
      sql`
        SELECT COUNT(DISTINCT btd.traveler_id)::int AS count
        FROM booking_traveler_travel_details btd
        JOIN booking_travelers bt ON bt.id = btd.traveler_id
        JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
        JOIN bookings b ON b.id = bt.booking_id
        WHERE btd.allocations ->> ${plan.kind} = ${resourceId}
          AND ba.availability_slot_id = ${slotId}
          AND b.status IN (${activeBookingStatusesSql()})
          AND ba.status IN (${activeBookingAllocationStatusesSql()})
          AND btd.traveler_id <> ALL(${sqlTextArray(travelerIdsArr)})
      `,
    )
    const existingAssigned = existingRows[0]?.count ?? 0
    const total = existingAssigned + plan.travelerIds.size
    if (total > resource.capacity) {
      violations.push({
        slotId,
        resourceId,
        kind: plan.kind,
        capacity: resource.capacity,
        existingAssigned,
        requested: plan.travelerIds.size,
      })
    }
  }
  return violations
}

export async function countResourceOccupants(
  db: SqlExecutor,
  slotId: string,
  kind: string,
  resourceId: string,
  excludeTravelerId?: string,
) {
  const rows = await executeRows<{ count: number }>(
    db,
    sql`
    SELECT COUNT(DISTINCT btd.traveler_id)::int AS count
    FROM booking_traveler_travel_details btd
    JOIN booking_travelers bt ON bt.id = btd.traveler_id
    JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
    JOIN bookings b ON b.id = bt.booking_id
    WHERE btd.allocations ->> ${kind} = ${resourceId}
      AND ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesSql()})
      AND ba.status IN (${activeBookingAllocationStatusesSql()})
      AND (${excludeTravelerId ?? null}::text IS NULL OR btd.traveler_id <> ${excludeTravelerId ?? null})
  `,
  )

  return rows[0]?.count ?? 0
}

export async function clearTravelerAllocationsForResource(db: SqlExecutor, resourceId: string) {
  await db.execute(sql`
    UPDATE booking_traveler_travel_details btd
    SET allocations = COALESCE((
      SELECT jsonb_object_agg(key, value)
      FROM jsonb_each(COALESCE(btd.allocations, '{}'::jsonb))
      WHERE value <> to_jsonb(${resourceId}::text)
    ), '{}'::jsonb),
    updated_at = now()
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_each(COALESCE(btd.allocations, '{}'::jsonb))
      WHERE value = to_jsonb(${resourceId}::text)
    )
  `)
}
