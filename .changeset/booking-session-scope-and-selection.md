---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
---

Give the Booking Session a commercial scope and a declarative selection.

**Scope.** `bookingSessionScopeV1` (`locale`, `market`, optional `currency`) is
accepted on Session create, stored on `booking_sessions`, and returned on every
Session record. It replaces the three places `sessions-production` hardcoded
`{ locale: "en", audience: "customer", market: "default" }` — the sourced live
resolve, the supplier reserve request, and the owned compute request — so a
Session now quotes in the market it belongs to with labels in its own locale.

Scope is fixed at create: PATCH carries no scope, and the update path does not
write the columns, so a Quote, the Hold taken against it, and the Commit that
consumes both cannot mean three different prices.

`audience` is deliberately not part of the client-supplied scope. It is derived
server-side from the Session's `actorKind` via
`bookingSessionAudienceForActorV1`, so a public caller cannot request
staff-audience pricing or staff-visible content by naming it on the wire.

**Selection.** `bookingSelectionV1` is split into `bookingSelectionPublicV1`
(what any caller may send), `bookingSelectionStaffOnlyV1` (`priceOverride`,
`internalNotes`, `suppressNotifications`, `documentGeneration`, `saveAsDraft`,
`travelCreditRedemption`) and `bookingSelectionEngineOwnedV1` (`entity`).
`bookingSelectionV1` remains their union, so the operator journey draft type is
unchanged.

The Booking Session's selection gate is now derived from those schemas instead
of a hand-maintained denylist: a top-level key the public schema does not
declare is rejected rather than dropped, and the privileged key set is computed
from the staff-only and engine-owned schemas. Extending either schema extends
the boundary; a newly added field is denied by default. The staff booking
authority gate on `selection.staffBooking` and the recursive passport /
`documentClass` PII rejection are unchanged.

Migration `20260804160000_booking_session_scope` adds `locale`, `market` and
`currency` to `booking_sessions`, backfilling existing rows with `'en'` /
`'default'` — the values they really were quoted at — and then dropping the
defaults so a new Session must supply a real scope.
