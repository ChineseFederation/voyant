---
"@voyant-travel/finance": minor
"@voyant-travel/finance-contracts": minor
"@voyant-travel/finance-react": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/i18n": minor
"@voyant-travel/schema-kit": patch
---

Refunds have a money leg: `refund_settlements` in finance, bound to what the
refund reverses and to how the customer was actually paid back.

Finance modelled refunds well as **accounting** and not at all as **money**.
Credit notes existed, a `finance:refund` capability existed with `risk: critical`
and `approvalPolicy: required`, booking amendments carried `refundAmountCents`,
and none of it recorded that anyone had paid the customer. Issuing a credit note
moves nothing. So a deployment could produce a correct accounting document while
leaving no trace that money had — or had not — gone back.

The record is deliberately not card-shaped. `method` is
`processor_reversal | bank_transfer | cash | cheque | travel_credit | voucher |
counterparty_offset | other`, and a self-hosted deployment with no card processor
at all can record every one of them except the first.

**A refund can be owed and not yet paid.** That state had nowhere to live, and it
is the normal state of a bank-transfer refund for a day or two. `status` is
`pending | settled | failed`, separate from the credit note's status on purpose:
the accounting document is issued once, but the money leg can be owed, retried,
or settled long afterwards. `GET /v1/admin/finance/bookings/{id}/refund-settlements`
answers what a credit note cannot — whether the booking still owes somebody money.

**A pending refund keeps holding its amount.** The refundable remainder subtracts
`pending` alongside `settled`, and only a positive failure gives an amount back.
That is the whole reason the record has its own status: a processor refund can
come back indeterminate — a timeout on a refund the processor accepted — and
freeing its amount would let a retry return the same money twice, which is the
one error here that trying again cannot undo. The bound is re-read inside the
write transaction under `SELECT … FOR UPDATE` on the payment, so two concurrent
refunds cannot both see the same remainder and both pass.

**`finance:refund` now reaches the payment adapter.** The capability, the
approval evaluation and the credit note all existed and nothing connected an
authorized refund to `adapter.refund()`, so even a deployment with a working card
processor could not return money through it.
`POST /v1/admin/finance/refund-settlements/{id}/execute` drives a
`processor_reversal` and records the outcome: `accepted` settles it, `pending`
leaves it owed, a decline fails it and releases the amount, and a thrown error
resolves nothing — the row stays `pending`, its amount stays held, and the note
says the outcome is unknown.

**Authorization is the existing one, not a second path.** The money leg's
capability is spread from `finance:refund`, so the grant it demands, its
`critical` risk and its irreversibility are the same values and cannot drift; it
carries its own id only because the graph keys one capability per action.

It differs in exactly one respect, deliberately: `approvalPolicy` is
`conditional`, not `required`. **A member of staff holding `finance:refund` is
the authority** — routing them through an approval they would grant themselves
is not a control, it is a second click plus a screen explaining why the first
one did nothing. Approval is required for an agent, whatever grant it carries,
because the point of it is that a person signed off on money leaving. Issuing
the credit note is unchanged: `required` for everyone.

The route still preserves the `authorized` / `approval_required` distinction —
`202` with the pending approval when one is needed, `201` with the settlement
when it is not — so one endpoint serves both and the UI needs one button rather
than two flows.

## The operator can see it and do it

Backend-only, this would have been invisible. The money leg is now on the four
screens where the question comes up:

- **Booking detail, above the tabs** — a banner when a refund is owed. An issued
  credit note reads identically whether or not the money left, so nothing else
  on that page could say a customer is still waiting.
- **Booking detail, finance tab** — a **Refunds** section directly under the
  payments summary, with a primary **Refund customer** action, *Still owed* /
  *Already paid* totals, and per-refund *Mark as paid* / *Mark as failed*. Money
  out sits next to money in.
- **Invoice detail, credit notes** — a *Refund* column and a per-row **Refund**
  action. The credit note is issued on that screen, so "and did they get the
  money?" belongs there rather than one screen away.
- **Payment detail** — *Still refundable*, the figure that stops a double
  refund, with a note when a pending refund is holding part of it.

The dialog asks how the customer was paid back with a **select**, and the fields
under it change with the answer: a card reversal asks which payment session it
reverses, a voucher can be worth more than the refund, an offset asks whose
account is credited. The currency is the payment's whenever there is one — the
refundable bound is currency-matched server-side — and a currency **picker**
otherwise, never a typed ISO code. Status badges carry the shared status tones,
so *Not paid yet* is amber, *Paid* green and *Failed* red wherever they appear.
Full `en` + `ro` parity.

Two dimensions come from operator practice rather than the schema:

- **Credit and voucher are different instruments.** A travel credit is bound to
  the person refunded; a voucher is transferable, carries its own expiry, and is
  frequently worth more than the cash it replaces — 110% in credit to avoid
  paying out 100% is a standard cancellation tactic. They are two `method` values
  rather than one with a flag, and `instrumentAmountCents` records the uplift,
  because a refund settled by an instrument worth more than the amount refunded
  is not an accounting identity and the credit note and the instrument would
  otherwise disagree with no way to tell which was right.
- **B2B refunds net rather than pay.** Refunding a reseller is usually a credit
  applied against what they owe on other bookings, so the method is
  `counterparty_offset` against a **counterparty balance** — not against another
  booking, which is too narrow to express the case.

`record_refund_settlement` is the agent-facing Tool, on the same
`finance:refund` scope and the same approve-then-retry shape as
`issue_invoice_refund`.
