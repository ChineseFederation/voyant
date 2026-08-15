---
"@voyant-travel/bookings-contracts": minor
"@voyant-travel/finance": minor
"@voyant-travel/notifications": minor
"@voyant-travel/bookings-react": minor
---

Issue the invoice a booking creates, and stop billing a buyer the invoice cannot name.

An invoice created from a booking was never issued. Nothing called the issuing path, so `invoice.issued` never fired: an external number series stayed on its `PENDING-…` placeholder, an installed accounting app received nothing for the lifetime of the deployment, and the only route to a real invoice number was an operator opening each one and pressing the app's own button. Booking create now issues the invoice it writes, and hands `invoice.issued` (or `invoice.proforma.issued`) plus any `invoice.payment.recorded` to the transactional outbox, so the events commit or roll back with the booking that caused them. `FinanceServiceRuntime` gains `domainEventSink` for services that raise events inside a caller's transaction, where an event-bus emit would escape a rollback.

The manual booking form collected no billing address, so an operator-created booking carried none and its invoice was fiscally invalid — the buyer's name and address are mandatory. The form now collects the billing address and a company's fiscal code, prefilled from the selected person's or organization's primary address, and requires them when the booking will produce a document. `missingFiscalBillingFields` in `@voyant-travel/bookings-contracts` is the single rule behind the form, the issuance decision, and the booking detail; an invoice whose buyer is incomplete stays a draft and says what is missing rather than becoming an invalid fiscal record. The booking's fiscal code and postal code now reach `invoice.issued`, which hardcoded `clientVatCode: null`.

A booking confirmation whose template declares a document attachment no longer sends before the document exists. The readiness gate that `payment_complete` already had now applies to any booking event whose template promises an attachment, and the `invoice.rendered` / `contract.document.generated` retries re-deliver the confirmation too, not only the post-payment bundle.
