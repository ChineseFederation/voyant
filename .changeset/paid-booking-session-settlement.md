---
"@voyant-travel/catalog": patch
"@voyant-travel/commerce": patch
---

Commit a paid Booking Session from `payment.completed`, even when the shopper
does not return from hosted checkout.

The settlement subscriber now re-enters the canonical Booking Session Commit
with the exact paid payment-session id, so booking creation, hold consumption,
payment transfer, invoice creation, and retries retain the same invariants as a
shopper-initiated commit. A concurrent returning shopper and settlement event
converge on the single durable Session commit.
