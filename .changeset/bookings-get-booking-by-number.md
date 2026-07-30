---
"@voyant-travel/bookings": minor
---

`get_booking` now accepts the unique human-readable `bookingNumber` as an
alternative to the opaque booking id, so an agent can resolve a booking with the
reference operators actually quote. The booking output already carried
`bookingNumber` and per-item product/option/unit name snapshots alongside their
typeids. Added `bookingsService.getBookingByNumber` to back the lookup.
