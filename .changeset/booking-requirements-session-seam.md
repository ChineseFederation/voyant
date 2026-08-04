---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/accommodations": minor
"@voyant-travel/cruises": minor
"@voyant-travel/inventory": minor
"@voyant-travel/trips": minor
---

Carry Booking Requirements through the v1 Booking Session lifecycle. The
descriptor a host renders the wizard from now survives the quote seam instead
of being discarded on the way through it.

- `bookingSessionRecordV1` gains an optional `requirements` — present whenever
  the Session is `active` and its target resolves, absent for terminal or
  purged Sessions. A host can render the Configure step before it can quote.
- `bookingQuoteRecordV1.requirements` is required: a Quote always has a
  resolvable target.
- The `quote_unavailable` lifecycle rejection gains an optional
  `requirements`, so a priced-out or sold-out target still renders a correct
  wizard.
- `OwnedBookingHandler` gains a required `computeRequirements(ctx, request)`.
  Each vertical's `computeQuote` now derives its descriptor through that same
  method — one derivation, so what a host renders and what a Commit validates
  against cannot drift.
- `ComputeQuoteResult.shape` is renamed to `ComputeQuoteResult.requirements`.
  `quoteResponseV1.shape` and `QuoteEntityResult.shape` on the beta quote path
  are unchanged.
- `BookingSessionModulePorts`, `BookingSessionCompositeLeafRuntime` and
  `BookingSessionCompositeHandler` gain `composeRequirements`, so trip-composite
  targets publish requirements too.
- `booking_session_quotes` gains a `requirements` jsonb column. Quotes carry a
  10-minute TTL and are not commitments, so the migration expires in-flight
  Quotes rather than backfilling a fabricated descriptor.
