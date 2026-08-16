---
"@voyant-travel/commerce": minor
"@voyant-travel/finance": minor
"@voyant-travel/bookings": patch
---

Capture FX rates, and stamp foreign-currency documents with the rate of their own date.

The FX model was fully built and never populated: on a live tenant with 53
foreign-currency invoices, `exchange_rates` held zero rows and not one document
carried an `fx_rate_set_id`. The platform could say a contract was worth
1,980 EUR but not what that was in the operator's reporting currency on the day
it was transacted — which is the figure the regulator asks for.

Four things were missing, and all four are here.

**The operator's FX settings never reached the write paths.** `createFinanceRuntime`
resolved the document-generation seams but not `resolveInvoiceFxSettings`, so every
document-stamping path saw "no configured base currency", fell through to null, and
left `base_*` and `fx_rate_set_id` empty. The operator-settings port now supplies them.

**Nothing could persist a resolved rate.** Markets owns `fx_rate_sets`/`exchange_rates`
and finance only reads them, so finance had no way to turn a rate into a durable
identity. Markets now provides `finance.fx-rate-capture.runtime`, an idempotent
capture keyed on (source, reporting currency, day). A captured rate is never
rewritten: re-capturing a day leaves the standing rate alone, because restating a
number under an id historical documents already point at would silently restate them.

**The rate source ignored the requested date.** The Voyant Data resolver called the
live pair route whatever date it was handed, so an invoice issued last March
resolved at today's rate. It now uses the dated history route, and the host's own
`finance.fx-reference.runtime` — shipped as a seam and never bound — is wired as the
preferred source, which is what lets a Romanian operator use BNR without a cloud key.

**The margin was applied but never recorded.** `exchange_rates` gains
`effective_rate_decimal` and `commission_bps`, so a row shows both halves of the
arithmetic on the invoice: the published rate, and the rate the document was actually
converted at once the operator's currency-risk commission is folded in. A stamped
document keeps the margin in force when it was stamped, so changing the setting no
longer restates history.

Resolution order now puts the document's own day first — a rate captured for that
day, else a fresh capture for that day, and only then an older standing rate, never
one observed after the document. Reaching for the newest rate on hand is worth about
1.8% across one month of BNR quotes, which is the difference between a figure tied to
documents and one that is derived.

Also:

- `payments` gains `reporting_currency` / `reporting_amount_cents` /
  `reporting_fx_rate_set_id`, stamped at the payment's own date. These are new
  columns rather than a reuse of `payments.base_*`, which on this table alone means
  the *invoice's* currency — a settlement conversion `paymentSettlementAmountSql`
  depends on. Unifying that naming needs a data migration and is left for follow-up.
- `POST /v1/admin/finance/invoices/{id}/fx-stamp` and
  `POST /v1/admin/finance/payments/{id}/fx-stamp` let an operator repair a historical
  document, either from the configured source or from the rate printed on the
  paperwork their accounting provider issued. Both are also agent Tools
  (`stamp_invoice_fx_rate`, `stamp_payment_fx_rate`), because reading a month of rates
  off PDFs is exactly the work that made the last period return manual.
- Booking FX rollups use the applied rate too, so a booking total and the invoice
  raised from it no longer disagree by exactly the margin. An applied rate read in
  the reverse direction is now `1 / applied` in both finance and bookings: a row
  saying the operator converts at 5.352144 RON per EUR means one RON is 1/5.352144
  EUR. Inverting the source rate and re-applying the margin — which finance did —
  implied 5.1443 RON per EUR, contradicting the row it came from.
- A payment whose amount, currency or date changes and can no longer be converted
  has its reporting stamp **cleared** rather than left describing the values it no
  longer has.
- `fx_rate_source` gains `bnr`.
