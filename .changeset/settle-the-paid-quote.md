---
"@voyant-travel/catalog": patch
"@voyant-travel/catalog-contracts": patch
"@voyant-travel/finance": patch
"@voyant-travel/core": patch
"@voyant-travel/db": patch
"@voyant-travel/notifications": patch
"@voyant-travel/notifications-react": patch
"@voyant-travel/auth": patch
"@voyant-travel/trips": patch
---

Settle a paid Booking Session against the Quote its payment was collected for.

A shopper left on the "payment is confirming" screen goes on quoting, and every
refresh superseded the Quote behind them and released its Hold. Settlement then
looked for "the Session's one active Quote", found one nobody had paid for, and
was refused — on all eight retries — leaving a captured card payment with no
booking and no seat.

Re-quoting is now refused outright while a processor holds the shopper's money,
settlement replays the Quote and Hold recorded on the payment rather than
re-deriving today's, and a refused settlement no longer releases the Hold it was
collected against. When a delivery does exhaust its attempts, `event.dead_lettered`
now announces it and raises a stranded-payment staff alert instead of leaving a
`failed` outbox row nobody reads.

Also stops every anonymous storefront checkout resolving to the same payment
processor Customer: the `anonymous-storefront` placeholder is no longer passed as
a customer reference, and `verify:symbol-policy` now pins the sentinel to its one
definition.
