import { type SQL, sql } from "drizzle-orm"

/**
 * Booking statuses that still hold a slot's inventory. Must stay a subset of
 * `booking_status`: these values are bound as parameters against `bookings.
 * status`, so Postgres types them as the enum and rejects the whole query
 * with `22P02` on any value the enum no longer has. The v1 commitment
 * lifecycle (#4100) contracted the enum to
 * confirmed/in_progress/completed/cancelled -- the pre-commitment statuses
 * this list used to carry (`on_hold`, `awaiting_payment`) are booking
 * sessions now, not bookings. Mirrors the same list in bookings'
 * `extras/service-manifest.ts`.
 */
export const ACTIVE_BOOKING_STATUSES_FOR_SLOT = ["confirmed", "in_progress", "completed"] as const

const activeBookingStatusesForSlot = new Set<string>(ACTIVE_BOOKING_STATUSES_FOR_SLOT)

export function activeBookingStatusesForSlotSql(): SQL {
  return sql.join(
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    ACTIVE_BOOKING_STATUSES_FOR_SLOT.map((status) => sql`${status}`),
    sql`, `,
  )
}

export function isActiveBookingStatusForSlot(status: string): boolean {
  return activeBookingStatusesForSlot.has(status)
}
