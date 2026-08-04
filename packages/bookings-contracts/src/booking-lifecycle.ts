/**
 * Shared booking lifecycle vocabulary — the one place the "this booking is
 * still live" and "this allocation still holds inventory" sets are written
 * down.
 *
 * Both sets were copy-pasted into at least five packages (operations'
 * availability queries, bookings' extras manifest and sharing groups,
 * notifications' reminder gating, bookings' own resource-capacity helper). The
 * copies drifted in shape — array, `Set`, `||` chain — while agreeing on the
 * values, which is exactly the arrangement that silently disagrees the next
 * time the enum moves. The v1 commitment lifecycle (#4100) already contracted
 * `booking_status` once; the pre-commitment statuses these lists used to carry
 * (`on_hold`, `awaiting_payment`) are booking sessions now, not bookings.
 *
 * Values only. These are bound as parameters against the `booking_status` and
 * `booking_allocation_status` Postgres enums, so every member must stay a
 * member of the enum or Postgres rejects the whole query with `22P02`. The
 * type-level pin against the Drizzle enum lives in `@voyant-travel/bookings`'s
 * `status.ts`, and the Drizzle `sql` fragment builders live in the runtime
 * packages — a contracts package depends on `zod` only (ADR-0002).
 */

/**
 * Booking statuses that still count: a committed booking that has not been
 * cancelled. These consume slot capacity, are owed money, are carried on a
 * departure manifest, and are reminded about.
 *
 * Deliberately *not* the same list as finance's duplicate-booking guard
 * (`confirmed`/`in_progress` only, in `service-booking-create.ts`), which asks
 * a narrower question — "would a new booking for this party duplicate one that
 * has not yet been delivered" — and must not be widened to include
 * `completed`.
 */
export const ACTIVE_BOOKING_STATUSES = ["confirmed", "in_progress", "completed"] as const

export type ActiveBookingStatus = (typeof ACTIVE_BOOKING_STATUSES)[number]

const activeBookingStatuses = new Set<string>(ACTIVE_BOOKING_STATUSES)

export function isActiveBookingStatus(status: string): boolean {
  return activeBookingStatuses.has(status)
}

/**
 * `booking_allocations.status` values that still bind a booking to a
 * departure. The remaining members of the enum (`released`, `expired`,
 * `cancelled`) have given the seat back and must never be counted as
 * consumption.
 */
export const ACTIVE_BOOKING_ALLOCATION_STATUSES = ["held", "confirmed", "fulfilled"] as const

export type ActiveBookingAllocationStatus = (typeof ACTIVE_BOOKING_ALLOCATION_STATUSES)[number]

const activeBookingAllocationStatuses = new Set<string>(ACTIVE_BOOKING_ALLOCATION_STATUSES)

export function isActiveBookingAllocationStatus(status: string): boolean {
  return activeBookingAllocationStatuses.has(status)
}

/**
 * Allocation statuses that gave the seat back. The complement of
 * `ACTIVE_BOOKING_ALLOCATION_STATUSES` within `booking_allocation_status`,
 * spelled out so a counter can report *why* an allocation stopped consuming
 * capacity instead of only that it did.
 */
export const RELEASED_BOOKING_ALLOCATION_STATUSES = ["released", "expired", "cancelled"] as const

export type ReleasedBookingAllocationStatus = (typeof RELEASED_BOOKING_ALLOCATION_STATUSES)[number]
