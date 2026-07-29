# Booking lifecycle notification suppression

`@voyant-travel/bookings` now persists `bookings.notifications_suppressed`.
Deployments must apply the package migration before running the matching
Bookings, Finance, or Notifications releases.

Booking-create callers should omit `manualPriceOverride` to use the persisted
catalog price. A manual total must be sent as
`manualPriceOverride: { amountCents, reason }`; the reason and actor are stored
in `bookings.price_override` and the booking activity log.

The `create_booking` Tool now returns the created booking detail (including
items and travelers) in addition to `bookingId`. The Bookings Tool surface adds
`confirm_booking`; confirmation and cancellation outputs include the same
immediately readable detail and a `replayed` flag. Consumers that validate Tool
outputs must refresh their discovered contracts.
