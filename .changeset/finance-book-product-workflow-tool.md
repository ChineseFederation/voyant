---
"@voyant-travel/finance": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/tools": minor
---

Add `book_product`, an intent-level booking workflow tool, and retire
`generate_booking_number` (voyant#3933).

`book_product` books a product for a client in a single call — product and
option, the billing party (`personId` or `organizationId`), travelers, and
rooms. It replaces the multi-call sequence the old `create_booking` description
scripted in prose (find the client with `list_people`/`list_organizations`,
resolve options with `list_product_options`/`list_option_units`, allocate a
reference with `generate_booking_number`, then create). The platform now
orchestrates all of it: the booking reference **and** the action-ledger
idempotency key are resolved server-side, so the model never carries a token
across turns — the failure mode that produced duplicate bookings. Like
`compose_product`, an incomplete request returns actionable issues and writes
nothing. It carries its own action policy and does not bypass the action-ledger
gate.

**Breaking change.** `generate_booking_number` is removed — no alias, no
deprecation window (the product is in beta). `book_product` subsumes it, and
`create_booking` now allocates the reference server-side too, so
`booking.bookingNumber` is optional and callers no longer pre-allocate. The
orchestration prose is deleted from `create_booking`'s description.

First-party migration in the same change: `@voyant-travel/bookings-react`'s
manual-booking MCP client and dialog no longer call `generate_booking_number`
(`REQUIRED_TOOLS` is now `["create_booking"]`); they submit `create_booking`
without a client-invented reference and keep the stable client idempotency key
that makes a retry replay the original booking.

`@voyant-travel/tools` gains `withServerResolvedIdempotencyKey`, the sanctioned
way for a handler-owned workflow tool to seat a server-derived idempotency key
on an already-authentic admission — the created-target analogue of the
server-owned `requestId` a generic server-owned-target action already uses.
