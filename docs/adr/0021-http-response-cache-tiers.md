# ADR 0021: HTTP response cache tiers and deployment posture

Status: Accepted

## Context

[`caching-architecture.md`](../architecture/caching-architecture.md) governs
cache-aside *data* caching: which backend a deployment selects, and what is safe
to keep in a key/value store. It says nothing about HTTP response caching, which
is a different concern with different failure modes — the unit is a whole
response, the policy is declared as a header on the route, and the cache sits in
front of authentication and the database rather than inside a service.

[`public-route-cache-policy.md`](../architecture/public-route-cache-policy.md)
classifies public routes and defines the header contract those routes emit.
Routes have followed it: commerce, inventory, legal, storefront, cruise, and
charter public reads all ship
`Cache-Control: public, s-maxage=…, stale-while-revalidate=…`.

The implementations behind that contract diverged from it in both directions.

`publicResponseCache` in `@voyant-travel/hono` parses only `public` and
`s-maxage`. It never reads `stale-while-revalidate`, so every route that
declares one is declaring it to nothing. It keys entries on the request URL
alone, ignores `Vary`, and does not bypass on `Authorization` — while public
storefront reads are scoped to a sales channel resolved from the `x-api-key`
storefront key, which the URL cannot express. It floors every TTL at 60 seconds
to satisfy a Cloudflare KV constraint, so a declared 30-second policy is not the
policy in force. It has no request coalescing, so each expiry hands the full
uncached latency to every concurrent arrival.

Voyant Cloud's dispatcher, needing a cache for `POST /v1/public/catalog/search`
that the URL-keyed middleware could not provide, implemented its own: a
hardcoded route path, a canonicalized body hash for a key, its own 30/60-second
TTL, and no `stale-while-revalidate`. It is stricter than the framework in some
respects (it refuses responses carrying `Vary` or `Content-Encoding`, and
bypasses on `Authorization` and `Cookie`) and weaker in others (no SWR). A
production storefront failed on the gap: at each TTL lapse the first arrival
paid a 5-8 second uncached search, and a client whose timeout was shorter than
that aborted before repopulating the entry, so the site could not recover on its
own.

The provider posture compounds it. Managed deployments select
`cache: "redis"`. The standard self-hosted profile selects `cache: "postgres"`,
which makes the shared response cache a table in the database the cache exists
to protect, and it has no edge tier at all. Nothing surfaces that difference to
the author of a route who has just written an `s-maxage` header.

## Decision

### 1. Response caching is a tiered concern, and the framework owns two tiers

| Tier | Mechanism | Owner |
| --- | --- | --- |
| T0 browser | `max-age` | route declaration |
| T1 shared/edge | any standards-compliant HTTP cache | deployment |
| T2 origin shared | `publicResponseCache` over `env.CACHE` | framework |
| T3 process | in-memory L1 of the tiered KV store | framework |
| T4 data | `cached()`, KV read models | modules |

T1 is a deployment choice, not a framework feature. Voyant Cloud's dispatcher is
one implementation of T1; a CDN in front of a self-hosted origin is another.

### 2. The framework's obligation is standard semantics, not a private protocol

The route's `Cache-Control` is the single declaration of policy, and it is
addressed to every tier at once. The framework must therefore emit and honour
*standard* HTTP cache semantics — `s-maxage`, `stale-while-revalidate`, `Vary`,
and request-side `no-cache`/`no-store` — so that any conforming shared cache
substitutes for any other.

A host-specific cache that recognises a hardcoded route path instead of reading
the declaration is a defect, not an optimization. It cannot be replicated by a
self-hosted deployment and it drifts from the contract it shadows.

### 3. The cache key must express everything the response is scoped to

A shared cache entry may only be served to a request that would have produced
it. For the public surface that means the key incorporates the request signals
that select the response variant — today, the storefront key that resolves the
sales channel — and a response carrying a `Vary` the key does not model is not
stored.

Keying must not require resolving the variant through the database. The value of
T2 is that a hit costs no connection, no session lookup, and no module-graph
instantiation; a key derived from a normalized request signal preserves that,
and a key derived from a resolved entity destroys it.

### 4. A declared TTL is the TTL

A backend constraint may not silently redefine a route's policy. Where a backend
cannot express the declaration (Cloudflare KV's 60-second minimum; the in-memory
L1's promotion ceiling), the deployment reports the clamp rather than absorbing
it.

### 5. Expiry is a behaviour, not an event

Serving stale while revalidating, and collapsing concurrent misses onto one
origin computation, are part of the shared response cache — not optional
refinements. A cache that hard-expires into an unbounded number of concurrent
origin queries converts a slow query into an outage, which is what it was
deployed to prevent.

Coalescing requires one addition to the shared KV contract: a conditional
`putIfAbsent`. Redis (`SET NX`), Postgres (an `INSERT … ON CONFLICT` whose
update branch is filtered on the committed expiry), and the in-memory store all
implement it honestly, so it does not violate the existing rule against
promising Redis semantics through a KV adapter. Every implementation must treat
an entry that exists but has expired as absent — a plain `DO NOTHING` cannot,
and would leave a lapsed slot permanently unelectable.

An elected refresher may hold the request it was elected on. What the contract
requires is that no *other* arrival waits: losers are told they lost and serve
what they already have. Moving the refresh off the requesting handler entirely
is desirable but not always available — a middleware cannot always observe the
response of work it schedules after returning.

### 6. Time-based expiry is a fallback, not an invalidation strategy

Where a content generation is available, it belongs in the cache key, and the
TTL then bounds only how long a cache may retain an unreferenced entry. A short
TTL standing in for invalidation is a clock-driven origin query on every key
forever — the worst access pattern for a scale-to-zero database, and a bound on
staleness rather than a guarantee of freshness.

### 7. Serving a public storefront is a declared deployment posture

`cache: "postgres"` remains supported and remains a reasonable default for a
small single-instance deployment. It is not a posture for serving a public
storefront under load, because the tier meant to shield the database is the
database.

Whatever the posture, it has to be one the deployment can observe. The Postgres
store's TTL'd writes threw on every call for as long as it has existed — the
expiry was bound as a `Date`, which the postgres.js adapter cannot serialize —
and the response cache's best-effort write catch swallowed it, so the tier
reported nothing while storing nothing. A cache whose failures are invisible is
indistinguishable from one that is merely cold.

A deployment that mounts public routes declares how it serves them — a
non-database T2 (Redis or platform KV), or a declared T1 in front of the origin.
The deployment reports when neither is present. Self-hosted parity with managed
performance is reached by declaring the same posture, not by adopting a
Voyant-specific component.

## Compatibility and migration

No route changes. Every `Cache-Control` header in the repository today is already
the correct declaration; the framework begins honouring the half of it that was
being dropped, which shortens no TTL and widens no audience.

Fixing the cache key is a behaviour change for deployments serving more than one
storefront channel from one origin: entries that were previously shared across
channels stop being shared. That is the correction, and it can only reduce what a
requester receives.

`putIfAbsent` is added to `KVStore` as an optional member. Stores that do not
implement it degrade to no coalescing, not to incorrect results.

The standard self-hosted profile keeps `cache: "postgres"` until the posture
declaration exists to replace it with a deliberate choice. The guardrail in
`scripts/check-public-cache-policy.mjs` currently asserts that value directly;
it moves to asserting that a posture is declared.

## Consequences

- `docs/architecture/caching-architecture.md` remains the data-caching guide and
  gains a pointer here; this ADR owns response caching.
- `docs/architecture/public-route-cache-policy.md` keeps the route matrix and
  gains a policy class for body-keyed reads once the key can express one.
- The dispatcher's catalog-search cache becomes a T1 implementation reading the
  route's declaration, and its hardcoded path constant is removed.
- Two deployment defaults outside the response-cache path are inconsistent with
  this reasoning and are handled separately: the standard self-hosted profile
  selects per-process `sharedState` and `rateLimit`, which a multi-instance
  deployment does not get the declared behaviour from.
