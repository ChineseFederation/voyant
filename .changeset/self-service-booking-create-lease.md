---
"@voyant-travel/finance": patch
---

Settle a self-service booking create under the action it was admitted with.

The action-ledger mints the created-target mutation lease under the action that
was admitted, and domain settlement re-checks that name by identity. The
self-service entrypoint admits
`bookings-create-extension.action.create-booking-self-service` but left the
settle expectation at its default, which names the staff
`action.create-booking` — so every verified-guest booking failed closed with
`invalid_mutation_lease` at the last step of the create, after the shopper had
verified a contact, chosen a room and been quoted.

The staff entrypoint matches the default and `book_product` was fixed in
voyant#3992; this entrypoint was missed, so nothing surfaced it.
