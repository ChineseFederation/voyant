---
"@voyant-travel/finance": minor
"@voyant-travel/bookings": minor
"@voyant-travel/storefront": minor
"@voyant-travel/catalog": patch
---

Actually wire public self-service booking creation.

`POST /v1/public/bookings` returned 501 in every deployment: Finance declared
`providePort(bookingsSelfServiceCreateRuntimePort)` but never contributed an
implementation under that id, Bookings never resolved it, the route action was
registered only inside a test, and `peekVerifiedDestination` had no
implementation at all. Nothing caught it because no test exercised the route.

Finance now contributes the create runtime — only when a booking-source
provider is selected, so the route reports 501 rather than half-working — and
mints the route admission against the graph-registered action. Bookings
resolves both that port and the new `bookings.guest-verification.runtime`,
which Storefront provides, and reads the authenticated customer from the
customer realm. Storefront gains `peekVerifiedChallengeDestination`, which
applies the same binding predicate as consumption so a caller cannot probe a
challenge that could not authorize their booking.

Regression tests cover both halves of what was missing: that Finance
contributes the port when a source is selected and omits it otherwise, and that
the route itself refuses an unauthenticated caller, refuses a challenge id from
an authenticated one, and returns a booking with its checkout capability.
