---
"@voyant-travel/public-api": minor
"@voyant-travel/bookings": minor
"@voyant-travel/flights": minor
---

Move the parts of the public API layer that have a real domain home (#4627,
part 1). `createGuestBookingGuard` goes to `@voyant-travel/bookings`, which
already owns the capability cookie and header it reads. Transport eligibility
goes to `@voyant-travel/flights`, and its exported symbols drop the `publicApi`
prefix, which named the layer they sat in rather than what they do.
