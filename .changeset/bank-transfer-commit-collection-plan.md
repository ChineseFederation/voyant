---
"@voyant-travel/catalog": patch
"@voyant-travel/finance": patch
---

Establish a booking's collection plan and bank-transfer document at Session Commit.

A Commit now persists the payment schedule the Quote published against the Booking it just wrote, in the same transaction, resolved through the same policy cascade the shopper was quoted from. A confirmed Booking therefore states what is owed and when, so the reminder runs have rows to anchor to and the guest portal has something to offer.

The bank-transfer arm of Commit deferred to an optional `establishBankTransfer` port that no deployment supplied, so it did nothing: the shopper left with a booking reference and no amount, beneficiary, IBAN, reference or due date. The production payment ports now establish it themselves through finance's own bank-transfer collection — the proforma for the amount actually due now, carrying that schedule row's due date — and return the instructions on the Commit outcome. A host-supplied override still wins, and an operator with no account configured establishes nothing rather than issuing a document naming a placeholder.

The `booking.confirmed` schedule subscriber now rethrows after logging. Swallowing the failure reported success to the durable outbox, which marked the event delivered, so a booking whose schedule generation failed once never got another attempt.
