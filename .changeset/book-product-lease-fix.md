---
"@voyant-travel/bookings": minor
"@voyant-travel/finance": patch
---

Fix `book_product` failing every call with `invalid_mutation_lease`. The
created-target mutation lease was consumed against a hardcoded `create-booking`
action name while the ledger mints it with the executing action's identity, so
the second legitimate entrypoint was rejected by a fail-closed check working as
designed. `settleBookingCreateDomain` now takes the action identity from its
caller — `bookings` cannot import Finance's constants, since Finance depends on
Bookings — defaulting to the original action so existing callers are unchanged.
