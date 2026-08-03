---
"@voyant-travel/inventory": minor
---

Evaluate product publish readiness once, expose it as a read, and freeze a
Product Version when publication changes how a departure would operate.

Publish readiness was a single check — a scheduled product needed one future
open departure — thrown only when a publish attempt was refused. An operator
had no way to see what was missing before trying, and the reasons a product
could not be sold (no default option, no units, no price, a multi-day product
with no itinerary) were not among them.

`evaluateProductReadiness` is now the one evaluator, shared by the admin API
and the publish gate so a readiness panel and a 422 can never disagree. It is a
pure function over already-loaded facts; `service-readiness.ts` loads them.
Issues carry a stable `code`, the `field` to fix, and a new `severity`:

- `blocking` refuses publication — missing/inactive default option, no option
  units, no price, and for multi-day products a missing, empty, or
  non-consecutive itinerary, alongside the existing departure check.
- `warning` permits it — unresolved duration, missing family, no capacity
  source, no meeting point, no allocation template, uncosted planned services,
  missing description/default language/contract template, and no active
  channel. Per the product model RFC a product with an unresolved duration or
  family stays discoverable and raises an actionable warning instead of
  silently disappearing from a view.

Checks are gated on behaviour — booking mode, capacity mode, resolved
duration, composition — never on the merchandising family, so a 60-minute Boat
Tour and a seven-day coach Tour are asked for different things by the same
evaluator. Dynamically supplied products (`open`, `stay`) are still never asked
for a departure, and a product being created is not refused for child rows it
has had no opportunity to author yet.

New: `GET /products/{id}/readiness` returns `ready`, `blocking`, `warnings`,
and the combined `issues`. `severity` was added additively to the existing
422 `product_not_ready_to_publish` payload, which still carries only blocking
issues.

Publishing an active product whose operationally relevant definition changed
now creates an immutable Product Version automatically. Comparison covers the
product columns a departure depends on plus the structure it materializes from
(options, units, itineraries, days, day services); marketing copy, media, and
record timestamps are excluded, so rewording a description does not invalidate
a sold departure's provenance. Re-publishing an unchanged product creates
nothing. `buildSnapshot` is split out of `createVersion` so the candidate is
compared before anything is written.

Distribution stays a non-dependency of inventory: the channel check is
supplied through an optional `resolveActiveChannelCount` and skipped — not
guessed — when a deployment cannot resolve it.
