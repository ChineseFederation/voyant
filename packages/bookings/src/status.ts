import type { BookingStatus } from "./state-machine.js"

export const BOOKING_RESOURCE_AVAILABILITY_STATUSES = [
  "confirmed",
  "in_progress",
] as const satisfies readonly BookingStatus[]

export const BOOKING_RESOURCE_CAPACITY_STATUSES = [
  ...BOOKING_RESOURCE_AVAILABILITY_STATUSES,
  "completed",
] as const satisfies readonly BookingStatus[]

const bookingResourceAvailabilityStatuses = new Set<string>(BOOKING_RESOURCE_AVAILABILITY_STATUSES)

export function isBookingResourceAvailabilityStatus(status: string): boolean {
  return bookingResourceAvailabilityStatuses.has(status)
}
