---
"@voyant-travel/distribution": minor
"@voyant-travel/distribution-react": minor
"@voyant-travel/auth": minor
"@voyant-travel/auth-react": minor
---

Provision the Direct channel, and let the public surface resolve to it without being configured.

Publication is default-deny per channel and every public catalog read resolves a channel before it answers, so serving your own website meant hand-creating a row in `channels` — a table of commercial counterparties, sitting next to `suppliers`, carrying contracts, rate limits and contact projections — that represents yourself, then binding a storefront to it. Nothing provisioned that row on an ongoing basis: a one-shot setup cutover backfilled the storefronts that existed when it ran, and every storefront created afterwards got a 403 on `/settings`, `/departures/*`, `/products/*`, `/offers/*`, `/leads`, `/newsletter/*`, on the anonymous booking-session routes, and on checkout start.

`channels` now carries a `system_key`, and a migration provisions exactly one row marked `direct`. It adopts before it inserts — the cutover's own `chan_storefront_direct` row first, then the oldest active `direct` channel — because publication rules and storefront bindings are keyed by channel id, and a fresh row beside an existing one would silently unpublish everything already published.

A storefront with no explicit binding now resolves to that channel instead of to nothing, and so does one whose explicitly bound channel has gone inactive. `StorefrontChannelBindingDto` gains `implicit`, so an admin surface can show the default as a default; clearing a binding means "back to Direct" rather than "off the air". A binding that names another channel still wins, so `affiliate` / `reseller` / `api_partner` keep working.

The system channel cannot be deleted or moved off `active` through the API (409, not a 404 that reads like the row is gone), and its `kind` is fixed; its name and contact details stay the operator's to edit. `GET /v1/admin/distribution/channels` takes `system=include|exclude|only`, defaulting to `include` — publication and product-mapping pickers read that endpoint and must still be able to target Direct. Only the Distribution counterparty list passes `exclude`.

Batch update and batch delete now isolate failures per id rather than rejecting the whole batch when one id is refused.

The storefront admin's channel section stops warning about something that is no longer true. It said "Default-deny is enforced: customer requests are rejected until this storefront is bound to an active channel", in an amber alert, and offered "Clear binding" with a confirmation warning that customer API access would be denied. It now states the default plainly, shows "Publishing to Direct (default)" for an implicit binding, and the clear action reads "Use Direct" and is disabled when Direct is already what you have.
