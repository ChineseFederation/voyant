---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/storefront-sdk": minor
"@voyant-travel/bookings-react": minor
---

Validate the selection against the published Booking Requirements.

Requirements reached the host in the earlier phases of #4188 but stayed
advisory: nothing checked that the selection a host collected answered the
descriptor the server published. A host that rendered the wrong field set did
not error — it collected a plausible-looking set and failed at commit, or
committed something incomplete. That is the #4113 class of bug.

`validateSelectionAgainstRequirements(requirements, selection)` is the one
validator, in `@voyant-travel/catalog-contracts/booking-engine/requirements-validation`.
It walks what the descriptor declares — pax band windows and cross-band
dependencies, required configure sub-steps, required traveler and booking
fields — and returns machine-readable `{ requirementKey, reason }` entries, never
prose. The Booking Session calls it at quote time so a host learns what is
missing while it can still fix it, and again at commit because the server never
trusts that the client quoted first.

A Quote now carries `requirementsFingerprint` alongside `priceFingerprint`,
computed the same way. `commitBookingSessionV1` requires the client to echo the
fingerprint it rendered against, and the commit path re-derives and compares
exactly as `price_changed` does. Two new recoverable outcomes on
`bookingSessionLifecycleErrorV1`: `selection_incomplete` (with the unsatisfied
list, `update_selection`) and `requirements_changed` (`request_fresh_quote`).
No Booking, Allocation, or supplier operation is created when either fires.

The lifecycle conformance suite holds third-party verticals to the same
contract: a satisfying selection must commit on an otherwise clear path, an
unsatisfying one must produce no side effects, and every entry a descriptor
marks required must be something the validator actually checks.

Migration `20260804190000_booking_session_quote_requirements_fingerprint`
expires in-flight Quotes rather than backfilling a fingerprint no descriptor
produced.
