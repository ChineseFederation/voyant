---
"@voyant-travel/finance": minor
"@voyant-travel/legal": minor
---

Render the auto-generated booking contract's payment clause from settlement.

The post-confirm variable bag carried the booking's list price and nothing
about what had been paid, so a template branching on `booking.isPaidInFull`
took the `else` arm on every contract and printed the missing-value
placeholder for each amount — telling a customer who had paid in full that
they owed "-" by "-".

Finance gains `getBookingSettlement`, the one answer for what a booking has
paid and still owes: completed payments against non-void invoices, the
invoice balance, and the installments that still stand (cancelled, waived and
expired rows excluded). Legal reads it through that service and emits
`booking.paidAmountCents`, `amountDueCents`, `balanceDueCents`,
`isPaidInFull`, the deposit/balance installments, and `payment.method` /
`latestCompleted` / `schedule`, so the auto-generated contract and the agent
path now render the same clause.

A credit note is a negative receivable, so `getBookingSettlement` nets it out
of the balance rather than summing it as debt, and never presents a
credit-note refund as the customer's latest payment.

The acceptance-evidence digest is matched against a third candidate rendered
with preview-time settlement — nothing paid, the whole price outstanding —
because the shopper accepted the terms before paying, and a card booking is
settled by the time `booking.confirmed` lands.
