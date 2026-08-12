---
"@voyant-travel/relationships": minor
"@voyant-travel/finance": minor
---

Record instruments a payment provider stored against the person who paid.

`person_payment_methods` promised processor-issued tokens the booking flow could
charge and held free text an operator typed by hand, because nothing in the
payment path could write to it. It now carries a `source`, the provider that
issued the token, what the customer authorized it for, and whether it is still
usable, with a partial unique index on (provider, token) that makes projection
idempotent across a callback and a reconciliation poll reporting the same card.

Finance defines `finance.stored-instrument.runtime` and relationships provides
it, so the payment path can hand an instrument to the CRM without either module
depending on the other. A deployment that does not wire it takes payments
exactly as before and records no instruments.

Existing rows are all hand-entered and become `source = 'manual'` with no
authorized reuse, which is what they are: on the operator's own records,
chargeable by nobody.
