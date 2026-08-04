import {
  ACTIVE_BOOKING_ALLOCATION_STATUSES,
  ACTIVE_BOOKING_STATUSES,
} from "@voyant-travel/bookings-contracts"
import { type SQL, sql } from "drizzle-orm"

export {
  ACTIVE_BOOKING_ALLOCATION_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  isActiveBookingAllocationStatus,
  isActiveBookingStatus,
  RELEASED_BOOKING_ALLOCATION_STATUSES,
} from "@voyant-travel/bookings-contracts"

/**
 * Drizzle fragment builders over the shared booking lifecycle vocabulary.
 *
 * The values themselves live in `@voyant-travel/bookings-contracts`
 * (`booking-lifecycle.ts`) — a contracts package cannot import drizzle-orm, so
 * only the `sql` interpolation lives here. The members are bound as parameters
 * against `bookings.status` / `booking_allocations.status`, which Postgres
 * types as the enum: any value the enum no longer carries fails the whole
 * query with `22P02`.
 */
export function activeBookingStatusesSql(): SQL {
  return sql.join(
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    ACTIVE_BOOKING_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )
}

export function activeBookingAllocationStatusesSql(): SQL {
  return sql.join(
    // agent-quality: raw-sql reviewed -- owner: availability; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
    ACTIVE_BOOKING_ALLOCATION_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )
}
