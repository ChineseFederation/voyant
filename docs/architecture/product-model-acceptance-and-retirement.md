# Product-model acceptance and retirement

This document records the lifecycle rules that carry the unified Product /
Departure model (RFC #4027) across every experience family and retire the
transitional beta surfaces safely. The domain rules for families, subtype, and
duration live in [`catalog-architecture.md` §3.3.2](./catalog-architecture.md);
this document covers what happens around the edges: terminology, legacy
migration, compatibility, metrics, and the deletion gate.

## One model, many families

A Tour, an Activity, an Attraction Admission, an Event and a Transportation
Transfer are the **same** aggregate: one Product, an immutable Product Version,
`availability_slots` bound to that Version, the Departure workspace, Travelers,
allocation, operations, and Finance. There is no per-family scheduling engine.
The `experience-families-tracer` integration suite in `@voyant-travel/operations`
proves this end to end — including the 60-minute whale-watch Boat Tour running
as recurring timed **Sessions** (several occurrences a day, each bound to one
frozen Version, with a meeting point, capacity and a manifest) and **no
itinerary days**.

## Operator-facing schedule term

`resolveScheduleTerm` (`@voyant-travel/inventory`) derives one presentation token
— `session | occurrence | departure` — from the resolved Product duration, and
the operator UI localizes it (`common.scheduleTermLabels`, en + ro). It is a
label, not a domain fork: the underlying row is the same
`availability_slots` departure regardless of the noun shown. See
[`catalog-architecture.md` §3.3.2](./catalog-architecture.md).

## Conservative legacy migration and the review queue

Legacy classification is migrated **conservatively — ambiguous rows are never
guessed**:

- The `20260804120000_conservative_family_backfill` migration assigns the
  standard `tour` family only to Products that have authored itinerary days but
  no family (an unambiguous positive signal). It never overwrites an existing
  family and is idempotent.
- Duration is not materialized: the shared resolver derives itinerary-derived
  duration live, and a Product with neither an explicit duration nor an
  itinerary stays `unresolved`.
- Any Product with no family, or an unresolved duration, surfaces in the
  **operator classification-review queue**: the product list read accepts
  `classificationReview=pending | missing_family | unresolved_duration`, whose
  SQL predicates mirror `resolveProductClassification` exactly so the queue and
  the rendered review badge never disagree. The operator resolves each row by
  assigning a family or authoring a duration.

The `conservative-family-backfill` migration test runs the real migration SQL
against Postgres over a beta-shaped fixture that deliberately includes ambiguous
rows, and proves no Product disappears and no capacity claim (availability slot)
is lost.

## Legacy Slots are Version-bound

Every new departure binds `availability_slots.product_version_id` to an immutable
Version, so an operated departure reads frozen truth, not mutable Product state.
Legacy slots with no Version are reported (the departure summary carries a null
`productVersionId`) rather than silently reading mutable Product truth.

## Compatibility redirects and usage counting

Four families of first-party deep link were superseded. During the measured
compatibility period each resolves to its canonical successor
(`resolveLegacyRedirect` in `@voyant-travel/core`) instead of breaking:

| Legacy family | Example legacy path | Canonical successor |
|---|---|---|
| Extras | `/extras/:id` | `/products/options/:id` |
| Scheduled Catalog | `/catalog/scheduled/:id` | `/products/:id` |
| Product detail | `/product/:id` | `/products/:id` |
| Operator Availability | `/availability/slots/:id` | `/operations/departures/:id` |

Every hit is counted against a stable key (`LegacyPathUsageStore`), seeded so
every known key reports even at zero — a route absent from the report means "no
such route", which is not the same as "zero usage". This makes **"usage is
zero" a fact a release review can check** rather than an assumption. The
redirects and the counter are **built and instrumented only**; they are not
deleted here.

**Where this runs.** `legacyRedirects`
(`@voyant-travel/hono/middleware/legacy-redirects`) is the HTTP edge, mounted
unconditionally by `serveAdminHost` ahead of static serving and auth. That is
the only seam that sees these paths: they are UI deep links at the origin root,
and the admin host routes only `/api/*` into the composed framework app, so a
superseded bookmark would otherwise reach the SSR handler and render a not-found
page. It is deliberately **not** mounted in `mountApp`: a storefront deployment
serves `/catalog/*slug` as real published content at the origin root, and
redirecting it there would break a live public URL to repair an operator
bookmark. The writer (the middleware) and the reader (the dashboard below) share
one store through `get`/`setLegacyPathUsageStore` in `@voyant-travel/core`;
a multi-process deployment must bind a durable store there before serving, or
the reported zero is only one process's zero.

## Acceptance dashboard metrics (no PII)

`computeAcceptanceMetrics` (`@voyant-travel/operations`) reports six health
signals over injectable providers: readiness failures, reconciliation drift,
unassigned travelers, missing costs, legacy-path usage, and rollup
disagreement. Every field is a **count** or a route-keyed usage row — no
traveler name, email, booking reference, or any other PII is read or emitted.

It is served at `GET /v1/admin/operations/acceptance/aggregates`, following the
same `/aggregates` convention as the availability dashboard read-models, with
two deliberate differences: the response is `no-store` (legacy-path usage gates
a deletion review and must not answer from a snapshot), and the envelope carries
a `meta.financeProviderBound` flag so an unmeasured `0` for the two money
signals is not mistaken for a measured one.

`createAcceptanceMetricsProviders` binds the providers. Readiness failures,
reconciliation drift and unassigned travelers are single fleet-wide raw-SQL
counts — raw SQL because the tables belong to other modules and the
`operations->availability` reach-in budget is exhausted. Missing costs and
rollup disagreement are read from the departure-profitability port that already
backs the departure workspace, because money is Finance's and Operations must
not recompute it. The readiness mirror expresses the **blocking** rules of
`evaluateProductReadiness`; Inventory owns that evaluator, so a new blocking
rule there must be reflected here or this count silently understates.

## The deletion gate (out of scope here)

Transitional routes, projections, flags and redirects are **not** deleted as
part of this work. Deletion is gated on: first-party callers migrated, measured
**zero** legacy-path usage, the canonical browser scenarios passing, and a human
release review approving the removal. Build and instrument now; remove in a
later, evidence-backed change.
