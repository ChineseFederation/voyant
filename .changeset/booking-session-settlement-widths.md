---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-react": patch
"@voyant-travel/commerce": minor
"@voyant-travel/core": minor
---

Refuse an over-long billing value at the Booking Session write path instead of after the card is captured, and stop a settled payment from being stranded by the Session's own expiry.

The Session's selection normalizer projected the billing block field by field rather than parsing it, so the widths `bookingSelectionPublicV1` declared never ran while the Booking create enforced its own. A 25-character postal code was accepted at every step and refused once, at settlement. `requirements.bookingFields` now publishes `maxLength`, advertises the whole billing address, and the write path rejects with `invalid_selection` / `value_too_long` naming the field as the caller sent it (`billing.address.postal`, not `contactPostalCode`).

A Session whose money is with a processor is no longer expired by the commit preflight or the expiry sweep, and can no longer be abandoned; `BookingSessionRecordV1` carries `requirementsFingerprint`, so a Commit is reachable from a read rather than only from a Quote. A settlement that produces no Booking emits `booking_session.settlement.failed`, and `ANALYTICS_FAILURE_REASONS` gains `value_too_long` so the new rejection reaches the breakdown rather than the `unknown` bucket.
