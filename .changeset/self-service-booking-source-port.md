---
"@voyant-travel/finance": minor
---

Add the `finance.self-service-booking-source.runtime` port that gates public
booking creation.

Finance owns the durable create command but not the catalog state a public
caller quotes against, so resolving a draft + quote into a server-derived
command is a runtime port with a new `./self-service-booking-source` subpath
export. The contract splits deliberately into `resolveBookingSource` (before
the durable claim, returning typed rejections) and `consumeBookingSource`
(inside the command transaction, so an exact idempotent replay short-circuits
at the claim and never re-enters it).

The `create-booking-self-service` action is now declared unavailable and only
enabled when a deployment selects a provider for this port, so a vertical
without durable public creation never advertises the capability.
