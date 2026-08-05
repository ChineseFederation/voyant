---
"@voyant-travel/payments": minor
"@voyant-travel/finance": minor
"@voyant-travel/finance-contracts": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/react": minor
"@voyant-travel/schema-kit": patch
---

A card dispute has somewhere to land: `payment_disputes` in finance, bound to
the payment session it contests and reachable from the booking.

There was no card-dispute model. The `disputed` value that existed is a
**supplier-invoice** status — an accounts-payable state for a bill the operator
is contesting — and is unrelated to a customer charging back a payment. So when a
traveller disputed a card payment the runtime had nowhere to record it: the
booking kept reading as paid, the money was gone or frozen, and the only trace
lived in whatever processor console the operator happened to check.

A chargeback is a generic commerce event, not a property of any one processor.
Every card processor produces them with the same shape, so the record belongs in
the framework and nothing in it names a processor — `provider`,
`processor_reference` and `reason_code` are opaque strings stored and handed back
verbatim.

**The model.** `payment_disputes` carries the contested amount and currency
(which may be partial), the lifecycle status, `opened_at` and the processor's
`respond_by` deadline where it supplies one, an opaque processor reference,
`resolved_at`, and `evidence_submitted_at`. `PaymentDisputeStatus` is the
framework's vocabulary — `opened`, `under_review`, `won`, `lost`, `withdrawn` —
and an adapter maps its own stage names onto it. The last three are terminal and
each names the resolution; there is no separate outcome column, because one
could only ever disagree with the status.

**Terminal is absorbing.** A processor that contests a payment again issues a new
dispute rather than reviving a resolved one, so a replayed or out-of-order
callback can never walk a resolution backwards. The ingest path tolerates such a
report rather than failing — a webhook that 500s is retried forever — while the
deliberate `PATCH` rejects an illegal transition with `409`.

**A second dispute does not overwrite the first.** The record is idempotent on
`(payment_session_id, processor_reference)`: a repeat report advances the dispute
it already made, a different reference opens a second row. A hand-entered dispute
with no reference always opens a new record, which is the safe default — two rows
are recoverable, a silently overwritten dispute is not. The unresolved contested
total is capped at the payment it contests.

**The booking can tell the truth.** `GET /v1/admin/finance/bookings/{bookingId}/disputes`
answers what payments and sessions cannot: a contested payment still reads
`paid`, so `hasOpenDispute`, the per-currency contested total, and the soonest
`respondBy` are how a caller distinguishes a cleanly paid booking from one whose
money is being taken back. Plus `GET`/`POST /v1/admin/finance/payment-disputes`
and `GET`/`PATCH .../{id}`.

**The callback contract can deliver one.** `PaymentCallbackEvent` gains an
optional `dispute` alongside `nextState` rather than inside it: a chargeback does
not move the payment's own lifecycle — the session stays `paid`, which is exactly
the problem — so the event reports the session's current state and puts what
changed in `dispute`. The conformance kit validates the signal's shape and folds
it into the duplicate-callback identity, so an adapter cannot vary a dispute
across a replay.

**An agent can record one too.** `record_payment_dispute` fronts the dispute
endpoints for an agent reconciling a processor console. It declares its
`adminWrites` rather than leaning on the name match, because `/finance/payments`
and `/finance/invoices/{id}/payments` share the trailing noun `payment` and the
inference would have reported *recording a payment* as covered by a Tool that
only records a dispute against one.

**The banner degrades, it does not crash.** `BookingDisputeBanner` renders on the
booking detail page whether or not the host asked for it, so it reads the finance
context through the new `useOptionalVoyantReactContext`: a host that has not
mounted `VoyantFinanceProvider` gets no banner rather than a crashed page. Every
other finance hook stays strict — they are the point of the screen they are on.

**Deliberately not in scope.** Payouts acquire no model here — money moving from
a processor to the operator's bank is not the booking ledger's concern. Evidence
assembly and submission stay behind the adapter port, where they belong; the
framework records only that evidence was submitted and when, without knowing what
was in it.
