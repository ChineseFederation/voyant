import { and, asc, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { ACTIVE_BOOKING_STATUSES } from "./booking-statuses.js"
import { bookingItemsRef, bookingsRef } from "./bookings-ref.js"
import { optionUnitsRef } from "./option-units-ref.js"
import { availabilitySlots } from "./schema.js"

export interface SlotUnitAvailability {
  optionUnitId: string
  unitName: string
  occupancyMax: number | null
  /** option_units.max_quantity — `null` when no cap is configured. */
  initial: number | null
  /** Active reservations against this unit on this slot. */
  reserved: number
  /** `initial - reserved`, or `null` when the pool is unlimited. */
  remaining: number | null
}

/**
 * Returns per-option-unit availability for a slot. `reserved` is derived from
 * `booking_items` on active bookings that point at this slot via
 * `metadata.availabilitySlotId` (stamped by the product→booking convert flow)
 * and from the corresponding `option_unit_id` column.
 *
 * Returns `null` when the slot does not exist. The slot must have an
 * `optionId` for per-unit breakdown to make sense; when it's absent, the
 * result is an empty array.
 */
export async function getSlotUnitAvailability(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<SlotUnitAvailability[] | null> {
  const [slot] = await db
    .select({ id: availabilitySlots.id, optionId: availabilitySlots.optionId })
    .from(availabilitySlots)
    .where(eq(availabilitySlots.id, slotId))
    .limit(1)

  if (!slot) return null
  if (!slot.optionId) return []

  // Sum booking_items.quantity per option_unit for active bookings whose
  // metadata.availabilitySlotId matches this slot. Items without a set unit
  // (legacy or single-unit products) don't appear in the per-unit breakdown.
  // metadata is jsonb; use Postgres ->> to extract the slot id.
  const reservedRows = await db
    .select({
      optionUnitId: bookingItemsRef.optionUnitId,
      reserved: sql<number>`coalesce(sum(${bookingItemsRef.quantity}), 0)::int`,
    })
    .from(bookingItemsRef)
    .innerJoin(bookingsRef, eq(bookingsRef.id, bookingItemsRef.bookingId))
    .where(
      and(
        inArray(bookingsRef.status, [...ACTIVE_BOOKING_STATUSES]),
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${bookingItemsRef.optionUnitId} IS NOT NULL`,
        // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`${bookingItemsRef.metadata}->>'availabilitySlotId' = ${slotId}`,
      ),
    )
    .groupBy(bookingItemsRef.optionUnitId)

  const reservedByUnit = new Map(
    reservedRows
      .filter((row): row is { optionUnitId: string; reserved: number } => row.optionUnitId !== null)
      .map((row) => [row.optionUnitId, row.reserved]),
  )

  const units = await db
    .select({
      id: optionUnitsRef.id,
      name: optionUnitsRef.name,
      occupancyMax: optionUnitsRef.occupancyMax,
      maxQuantity: optionUnitsRef.maxQuantity,
    })
    .from(optionUnitsRef)
    .where(eq(optionUnitsRef.optionId, slot.optionId))
    .orderBy(asc(optionUnitsRef.sortOrder), asc(optionUnitsRef.id))

  return units.map((unit) => {
    const reserved = reservedByUnit.get(unit.id) ?? 0
    const initial = unit.maxQuantity
    const remaining = initial === null ? null : Math.max(0, initial - reserved)
    return {
      optionUnitId: unit.id,
      unitName: unit.name,
      occupancyMax: unit.occupancyMax,
      initial,
      reserved,
      remaining,
    }
  })
}
