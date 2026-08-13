---
"@voyant-travel/trips": minor
"@voyant-travel/framework": patch
---

Restore the composer pricing and reservation legs on the Trips HTTP surface.

`POST /{envelopeId}/price` and `POST /{envelopeId}/reserve` are the
staff/storefront composer lifecycle, dependency-injected exactly like checkout
and cancellation. Removing them left the admin and storefront composers calling
routes that did not exist — trip creation failed with a bare `404` after the
envelope and its components had already been persisted — and the durable
replacement cannot run at all on a deployment that selects no
`trips.durable-action-runtime` provider.

The agent-facing `price_trip` / `reserve_trip` tools are unchanged: they remain
admitted, asynchronous durable operations behind that port.

Also add `packages/trips/scripts/generate-openapi.ts` and register both Trips
documents with `verify:openapi-drift`. They had no generator, so the checked-in
specs had drifted from the routes — the storefront and admin documents still
advertised `hold` and `inquiry` checkout intents that were removed in #4100.
