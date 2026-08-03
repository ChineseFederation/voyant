---
"@voyant-travel/graph-contracts": minor
"@voyant-travel/framework": minor
"@voyant-travel/operator-standard": minor
"@voyant-travel/runtime": patch
---

Make the response-cache posture of a deployment declarable, and report it.

A route that declares `Cache-Control: public, s-maxage=900` is addressing every
shared cache at once, but nothing told its author which of them the deployment
actually has. The standard self-hosted profile selects `cache: "postgres"`, so
the tier meant to shield the database *is* the database, with only a per-process
in-memory cache in front of it whose entries are capped at 60 seconds. Managed
deployments select Redis and put the Voyant Cloud dispatcher at the edge. The
two products cached public responses very differently and neither said so.

`deployment.responseCache` is where a deployment now states how it serves shared
public responses:

    responseCache: { edge: "declared" | "none" }

`"declared"` means an HTTP cache in front of the origin honours the route's
`Cache-Control` — a CDN, a reverse proxy, or the dispatcher. `"none"` means the
origin is the only shared cache. The field is optional and absent reads as
`"none"`, never as a tier that might be there.

It is deliberately not a provider role. Nothing is bound or constructed from it,
so it has no entry in `VoyantDeploymentProviders` or
`DEPLOYMENT_PROVIDER_CONTRACTS`. It records the one thing the provider
selections cannot express — whether anything sits in front of the origin — and
it travels with the deployment through `defineProject`, the resolved graph, and
the generated Node artifact.

The Node runtime reports three postures once at startup, on the console channel
the generated entrypoint already uses for boot messages:

- public routes mounted over `cache: "postgres"` with no declared edge tier,
  naming both remedies: a response cache that is not the database, or an edge
  tier the deployment declares;
- `rateLimit: "memory"`, which keeps counters per process — the runtime cannot
  observe the instance count, so it states the condition rather than guessing
  the multiplier;
- `sharedState: "memory"`, which is not shared across processes despite the name.

None of these fail the boot. Every posture is supported; what was not supported
was the deployment being unable to tell.

`@voyant-travel/operator-standard` declares `{ edge: "none" }`, which is what it
already was. Its `cache` provider is unchanged — the point is to make the choice
visible, not to change it. The guardrail in
`scripts/check-public-cache-policy.mjs` now asserts that the standard profile
declares a posture rather than pinning the `cache: "postgres"` literal that kept
the pattern in place.

See ADR 0021 section 7 and `docs/architecture/caching-architecture.md` rule 12,
which documents the two postures a self-hosted deployment can declare to reach
managed response-caching behaviour without adopting a Voyant-specific component.
