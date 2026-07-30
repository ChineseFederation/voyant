---
"@voyant-travel/catalog": minor
---

Resolve the billing party for a verified guest, completing self-service
booking creation.

A guest has no account, so the booking's billing party is resolved from the
contact they proved control of, via the existing `bookings.relationships.runtime`
port. That port is consumed optionally: a deployment without it still serves
authenticated customers, who already are the billing party.

`upsertPersonFromContact` matches on email then phone before creating, so a
retry reuses the same person rather than creating another, and resolution stays
outside the durable command rather than changing what it fingerprints.
