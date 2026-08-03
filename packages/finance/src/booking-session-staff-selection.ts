import type { z } from "zod"

import { bookingSessionStaffSelectionV1 } from "./service-booking-create.js"

/**
 * Staff-only details that may deepen a server-derived Booking Session command.
 *
 * Product identity, Slot, authoritative quoted price, Hold, booking number, and
 * Booking lifecycle state never come from this payload. Those remain owned by
 * the Booking Session Commit workflow. The remaining fields are the explicit
 * operator choices already supported by the manual-booking surface.
 */
export { bookingSessionStaffSelectionV1 }

export type BookingSessionStaffSelectionV1 = z.infer<typeof bookingSessionStaffSelectionV1>

export function normalizeBookingSessionStaffSelectionV1(
  input: unknown,
): BookingSessionStaffSelectionV1 {
  return bookingSessionStaffSelectionV1.parse(input)
}

/**
 * Merge admitted staff choices into the command derived from the immutable
 * Quote and live Hold. The base command wins for every engine-owned field.
 */
export function applyBookingSessionStaffSelectionV1(
  baseCommand: Record<string, unknown>,
  selection: unknown,
): Record<string, unknown> {
  const staff = normalizeBookingSessionStaffSelectionV1(selection)
  return {
    ...baseCommand,
    ...staff,
    // Re-assert every engine-owned value after the staff merge. The trusted
    // derived command may also contain quote-derived internal fields (for
    // example `sellAmountCentsOverride`), so do not round-trip it through the
    // narrower staff input schema and accidentally strip them.
    productId: baseCommand.productId,
    optionId: baseCommand.optionId,
    slotId: baseCommand.slotId,
    catalogId: baseCommand.catalogId,
    availabilityHoldToken: baseCommand.availabilityHoldToken,
  }
}
