import { BOOKING_RESOURCE_AVAILABILITY_STATUSES } from "@voyant-travel/bookings/status"
import { type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface PublicApiSlotResourceAvailability {
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

type SlotResourceAvailabilityDbRow = {
  id: string
  slot_id: string
  kind: string
  label: string | null
  ref_type: string | null
  ref_id: string | null
  parent_id: string | null
  capacity: number | string
  assigned: number | string | null
  flags: Record<string, unknown> | null
  sort_order: number | string
}

function isRowsResult(value: unknown): value is { rows: unknown[] } {
  return (
    typeof value === "object" && value !== null && Array.isArray((value as { rows?: unknown }).rows)
  )
}

async function executeBoundaryRows<T extends object>(
  db: PostgresJsDatabase,
  query: SQL,
): Promise<T[]> {
  const result: unknown = await db.execute(query)
  return (Array.isArray(result) ? result : isRowsResult(result) ? result.rows : []) as T[]
}

function sqlList(values: readonly string[]): SQL {
  // agent-quality: raw-sql reviewed -- owner: storefront; callers pass only parameter-bound scalar ids into this SQL fragment.
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

export async function getPublicApiSlotResourceAvailability(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<PublicApiSlotResourceAvailability[]> {
  const map = await getPublicApiSlotsResourceAvailability(db, [slotId])
  return map.get(slotId) ?? []
}

export async function getPublicApiSlotsResourceAvailability(
  db: PostgresJsDatabase,
  slotIds: string[],
): Promise<Map<string, PublicApiSlotResourceAvailability[]>> {
  const uniqueIds = [...new Set(slotIds)].filter(Boolean)
  if (uniqueIds.length === 0) return new Map()

  const rows = await executeBoundaryRows<SlotResourceAvailabilityDbRow>(
    db,
    // agent-quality: raw-sql reviewed -- owner: storefront; slot resource manifests are read-only and slot ids are parameter-bound.
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
          AND b.status IN (${sqlList(BOOKING_RESOURCE_AVAILABILITY_STATUSES)})
          AND ba.status IN ('held', 'confirmed', 'fulfilled')
      ) usage ON true
      WHERE ar.slot_id IN (${sqlList(uniqueIds)})
      ORDER BY ar.slot_id, ar.kind, ar.sort_order, ar.created_at
    `,
  )

  const out = new Map<string, PublicApiSlotResourceAvailability[]>()
  for (const row of rows) {
    const capacity = Number(row.capacity)
    const assigned = Number(row.assigned ?? 0)
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
      sortOrder: Number(row.sort_order),
    })
    out.set(row.slot_id, list)
  }
  return out
}
