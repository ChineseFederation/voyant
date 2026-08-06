"use client"

import type { BookingDetailHostSlotContext } from "@voyant-travel/bookings-react/admin"

import { BookingRefundPanel } from "../components/refund-settlements/booking-refund-panel.js"

/**
 * Props of the refunds widget: exactly the slot context the bookings detail
 * host hands to `booking.details.finance-start` widget contributions.
 */
export type BookingRefundsWidgetProps = BookingDetailHostSlotContext

/**
 * Booking detail → Finance tab → how the customer was paid back (voyant#4303),
 * delivered as a widget contribution on `booking.details.finance-start`.
 *
 * `finance-start` puts it directly below the payments summary, which is where it
 * belongs: money going out is the mirror of money coming in, and an operator
 * comparing the two should see them together. Finance contributes it rather than
 * the bookings host importing it, for the same cycle reason as every other card
 * here (packaged-admin RFC §4.7).
 */
export function BookingRefundsWidget({ booking }: BookingRefundsWidgetProps) {
  return <BookingRefundPanel bookingId={booking.id} />
}
