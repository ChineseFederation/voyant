import type { bookings } from "./schema-core.js"

export type BookingStatus = (typeof bookings.$inferSelect)["status"]

export const BOOKING_TRANSITIONS = {
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
} as const satisfies Record<BookingStatus, readonly BookingStatus[]>

export class BookingTransitionError extends Error {
  readonly code = "INVALID_BOOKING_TRANSITION"

  constructor(
    readonly from: BookingStatus,
    readonly to: BookingStatus,
  ) {
    super(`Illegal booking status transition: ${from} → ${to}`)
    this.name = "BookingTransitionError"
  }
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return (BOOKING_TRANSITIONS[from] as readonly BookingStatus[]).includes(to)
}

export interface BookingStatusPatch {
  status: BookingStatus
  cancelledAt?: Date
  completedAt?: Date
}

export function transitionBooking(
  from: BookingStatus,
  to: BookingStatus,
  opts: { now?: Date } = {},
): BookingStatusPatch {
  if (!canTransitionBooking(from, to)) {
    throw new BookingTransitionError(from, to)
  }

  const now = opts.now ?? new Date()
  const patch: BookingStatusPatch = { status: to }

  if (to === "cancelled") patch.cancelledAt = now
  if (to === "completed") patch.completedAt = now

  return patch
}
