---
"@voyant-travel/finance": minor
"@voyant-travel/catalog": minor
---

Add public self-service booking creation.

`POST /v1/public/finance/bookings` is the customer-facing adapter to the same
durable command the staff Tool drives. A caller supplies three identifiers —
draft, quote, and (for a guest) verification challenge — and nothing else;
booking numbers, prices, tax lines, relationship ids, and status are derived
server-side. `Idempotency-Key` is required, because a create without a stable
key cannot be retried safely.

Catalog provides `finance.self-service-booking-source.runtime`: it verifies
ownership, public scope, expiry, entity, price, and hold, requires the draft's
billing contact to match the contact the challenge was verified for, and asks
the owning vertical to derive the command. Billing-person resolution runs only
once the whole party would pass the create command's own validation, so a
rejected attempt cannot orphan a CRM row.

The draft, quote, and challenge are all spent inside the create transaction, so
they commit or roll back with the booking, and an exact idempotent retry
replays the original booking without re-consuming any of them.
