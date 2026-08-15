---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/trips": patch
---

Hold capacity for the party the Booking Session is already for. An unstated
Hold quantity is now derived from the Session's own selection instead of
becoming a literal `1`, which no multi-traveler checkout could ever satisfy: the
capacity port expects the real traveler count, so every Hold for two or more
people was rejected as a quantity mismatch, and the rejection asked the client
to retry — with the same invented `1`, forever.

`placeBookingHoldV1.quantity` loses its `.default(1)`. A default there was not a
fallback at all — parsing filled the field in before any code could consult the
Session — and the same invented `1` was applied again in `useBookingHold` and
required by the shared journey. All three now leave it absent and let the server
derive it. `partySizeFromSelection` is that one derivation, replacing the two
private copies in the capacity port and the Trips composite handler.

A genuine mismatch — a caller that names a quantity other than the Session's
party size — no longer answers `request_new_hold`. Repeating a request whose
quantity is derived cannot succeed, so that next action described a livelock;
`hold_quantity_mismatch` now answers `request_hold_for_expected_quantity` and
`expectedQuantity` is the value to hold instead.
