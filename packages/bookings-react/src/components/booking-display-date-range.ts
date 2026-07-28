export interface BookingDisplayDateRangeSource {
  startDate?: string | null
  endDate?: string | null
  startsAt?: string | null
  endsAt?: string | null
}

/**
 * Booking-level dates are the operator-editable travel period. Item timestamps
 * are immutable booking-time snapshots and only fill dates for legacy records
 * that do not have the canonical booking fields populated.
 */
export function resolveBookingDisplayDateRange(booking: BookingDisplayDateRangeSource) {
  return {
    start: booking.startDate ?? booking.startsAt ?? null,
    end: booking.endDate ?? booking.endsAt ?? null,
  }
}
