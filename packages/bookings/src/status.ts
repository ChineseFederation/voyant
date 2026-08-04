/**
 * Runtime-typed view of the shared booking lifecycle vocabulary.
 *
 * The values live in `@voyant-travel/bookings-contracts` (a contracts package
 * depends on `zod` only, per ADR-0002). This module is where they are pinned
 * against the Drizzle enum: `satisfies readonly BookingStatus[]` fails the
 * build the moment a status is dropped from `booking_status`, which is the
 * check the copy-pasted duplicates never had. Packages that already depend on
 * `@voyant-travel/bookings` should import from here
 * (`@voyant-travel/bookings/status`) rather than restating the list.
 */

import { ACTIVE_BOOKING_STATUSES } from "@voyant-travel/bookings-contracts"
import type { BookingStatus } from "./state-machine.js"

export {
  ACTIVE_BOOKING_ALLOCATION_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  isActiveBookingAllocationStatus,
  isActiveBookingStatus,
  RELEASED_BOOKING_ALLOCATION_STATUSES,
} from "@voyant-travel/bookings-contracts"

export const BOOKING_RESOURCE_AVAILABILITY_STATUSES = [
  "confirmed",
  "in_progress",
] as const satisfies readonly BookingStatus[]

/**
 * Bookings that still consume a departure's capacity — the same set as
 * `ACTIVE_BOOKING_STATUSES`, re-exported under the capacity call sites' own
 * name and pinned against the enum here.
 */
export const BOOKING_RESOURCE_CAPACITY_STATUSES =
  ACTIVE_BOOKING_STATUSES satisfies readonly BookingStatus[]

const bookingResourceAvailabilityStatuses = new Set<string>(BOOKING_RESOURCE_AVAILABILITY_STATUSES)

export function isBookingResourceAvailabilityStatus(status: string): boolean {
  return bookingResourceAvailabilityStatuses.has(status)
}
