---
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/finance-contracts": minor
"@voyant-travel/bookings": minor
"@voyant-travel/finance": minor
"@voyant-travel/legal": minor
---

Make recording a booking's payment separable from issuing a fiscal document for it.

Creating a booking with a recorded payment issued an invoice and mirrored it to the operator's accounting provider, and confirming one generated a contract. Both were consequences of the create rather than calls anyone made, so an operator's explicit "do not issue a proforma, invoice or contract" had nowhere to land, and back-filling a booking for an already-invoiced sale filed a second real fiscal document for it.

- `suppressDocuments` on booking create records the booking without producing documents for it. The invoice is still written, as an unissued draft carrying the payments, so the booking records what was paid. Persisted as `bookings.documents_suppressed` and re-read by contract generation, which runs off an event after the create commits.
- `documentGeneration.externalInvoice` (and `externalDocument` on `POST /invoices/from-booking`) records the sale against a fiscal document the operator already issued in their provider: the platform's invoice is issued so balances and contracts stay right, the mirror is suppressed, and the invoice's external reference names the operator's document.
- Issuing from a booking that already carries a live external fiscal document now refuses with `duplicate_external_document` (HTTP 409) instead of sending a duplicate; `acknowledgeExistingExternalDocument: true` overrides it.
- `POST /invoices/{id}/external-refs/{refId}/supersede` records that a provider document was cancelled outside the platform, keeping the superseded identity, and optionally repoints the reference at its replacement.
