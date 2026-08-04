---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
---

Add a non-binding Offer Preview read.

Storefront detail pages — product, accommodation, cruise — have to show a live
price and render the right configuration controls *before* any Booking Session
exists. Beta served that with `POST /catalog/quote`, which v1 deleted, and the
only v1 replacement was to open a Session. That is the wrong trade: Sessions are
persisted, revisioned, capability-bearing, expiring rows that a sweep has to
reap, and a shopper nudging a pax stepper is not yet an attempt to book. One
Session per keystroke floods `booking_sessions` at real traffic.

`POST /v1/{admin,public}/catalog/offers/preview` answers the same question
statelessly. `offerPreviewRequestV1` takes the Session create target union, the
Session commercial scope and the public selection schema;
`offerPreviewResultV1` returns `binding: false`, `available`, the Booking
Requirements, and `pricing` only when there is a price.

`requirements` is required and `pricing` is the optional half, which is the
load-bearing part of the shape: a sold-out or unpriced target must still render
a wizard, or the shopper cannot change the selection that made it unavailable.

Four structural invariants keep this from becoming beta's `/quote` under a new
name. It mints no identifier — no `id`, `quoteId` or token, so nothing can be
presented later as authority. It persists nothing: the preview is handed only
`normalizeSelection`, `composeRequirements` and `composeQuote`, never the
repository, so it cannot write a Session, Quote, Hold, operation claim or audit
row. It says `binding: false` explicitly. And because it has no id at all, the
result is not assignable where `commitBookingSessionV1` or `placeBookingHoldV1`
require a `quoteId` — asserted in `preview-contracts.test.ts` so a later field
addition cannot quietly undo it.

The preview reuses the same `composeRequirements` / `composeQuote` ports the
Session lifecycle uses, over an ephemeral in-memory session-shaped value, rather
than adding a third derivation path — the price a detail page shows and the
price the wizard quotes come from one place. Quoting audience is derived from
the caller's `actorKind` exactly as on the Session path, so a storefront visitor
cannot preview at staff or partner price tiers, and the public route sits behind
the same active-storefront-channel admission as the public Session routes.

`composeQuote` now falls back to the module's read connection when there is no
open Session transaction, matching what `composeRequirements` already did.
