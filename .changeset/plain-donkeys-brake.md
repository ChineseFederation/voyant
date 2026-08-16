---
"@voyant-travel/finance-contracts": minor
"@voyant-travel/finance": minor
---

Derive the default booking payment plan from the `PaymentPolicy` cascade

`POST /v1/admin/finance/bookings/{id}/payment-schedules/default-plan` and the
checkout collection runtime carried their own deposit model — `depositMode` /
`depositValue` / `balanceDueDaysBeforeStart`, defaulted to 30% with the balance
30 days before start — and never consulted `resolveEffectivePaymentPolicy`. An
operator who configured 50% with the balance 14 days before departure on the
settings page got 30% / 30 days from these two surfaces, so which route an
agent happened to call decided what the customer owed and when.

Both now resolve the operator's effective policy through the same cascade
`booking.confirmed` walks (booking → proposal → listing → category → supplier →
operator default) and run it through `computePaymentSchedule`, which also means
the near-departure deposit gate and the balance-due floor apply where they
previously could not be expressed at all.

Stating deposit terms on the call is still honoured verbatim as a deliberate
override, `depositDueDate` included.

**Behaviour change.** A deployment that relied on the implicit 30% default now
gets whatever its `PaymentPolicy` says. An operator that has configured no
policy gets `noDepositPolicy` — payment in full — rather than a 30% deposit
nobody asked for. Configure an operator-default payment policy before upgrading
if you were depending on the old implicit split.
