---
"@voyant-travel/catalog-react": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/trips-react": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/cruises-react": minor
"@voyant-travel/storefront-react": minor
---

Replace the beta booking hooks with a v1 Booking Session journey client.

`@voyant-travel/catalog-react/booking-engine` spoke three routes that no longer
exist server-side — `GET/PUT/DELETE /catalog/drafts/:id`, `POST
/catalog/holds/{place,release}` and `POST /catalog/quote` — so every hook in it
returned 404. It now speaks the v1 Session lifecycle instead:

- `useBookingSession` — create / resume / PATCH the selection, tracking the
  revision and feeding it back as `expectedRevision`
- `useBookingQuote` — price the current Session revision, returning the Quote
  with its `requirements` and `requirementsFingerprint`
- `useBookingHold` — hold real capacity against a Quote
- `useBookingCommit` — commit `quoteId` + `holdId?` + `requirementsFingerprint`
- `useOfferPreview` — the stateless, non-binding price a detail page shows
  before anything that looks like booking has happened
- `useBookingDraft` is removed; a draft is a Session's selection

Lifecycle outcomes are returned, not thrown: callers branch on the discriminated
`bookingSessionOutcomeV1`, so `selection_incomplete` reaches a host with its
machine-readable `unsatisfied[]` list intact instead of collapsed into a
sentence. Idempotency keys are derived from (journey root, action, revision,
payload) rather than minted per attempt.

The create → quote → hold → commit choreography that `bookings-react` kept as a
private hand-rolled client is now shared as `commitBookingSessionJourneyV1`,
continuation and all.
