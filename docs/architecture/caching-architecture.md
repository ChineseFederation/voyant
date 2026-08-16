# Voyant Caching Architecture

This guide defines how Node-hosted Voyant deployments should select and use
cache providers. Edge applications outside the unified deployment graph own
their caching independently.

Scope: this guide covers cache-aside *data* caching — what a service keeps in a
key/value store and which backend the deployment selects for it. HTTP response
caching is a separate concern with a separate contract; its tier model,
semantics, and deployment posture are decided in
[ADR 0021](../adr/0021-http-response-cache-tiers.md).

The goal is simple:

- keep caching useful and cheap
- keep runtime defaults aligned with deployment shape
- support multiple cache backends through a small shared contract
- avoid turning cache into a correctness or coordination primitive

Caching should be a performance optimization, not part of the correctness model.

This guide governs cache-aside *data* caching. HTTP *response* caching — the
tier in front of the origin, the `Cache-Control` a public route declares, and
which deployment postures can honour it — is owned by
[ADR 0021](../adr/0021-http-response-cache-tiers.md). Rule 12 below states only
what a deployment has to declare; the reasoning lives in the ADR.

For active guidance on transactions, row locks, and when a first-class locking
surface is still deferred, see
[`locking-and-concurrency-policy.md`](./locking-and-concurrency-policy.md).

## Core Rules

### 1. Cache is not coordination

Voyant should not use cache as the source of truth for:

- locks
- leader election
- counters that require strong consistency
- transactional state
- concurrency control

Those concerns belong in the database, runtime coordination layer, or a future
locking primitive.

Rule:

If stale or lost cache state would break correctness, it does not belong in the
cache.

### 2. Cache providers come from the deployment graph

The resolved deployment graph selects the cache provider. A managed Node host
may supply a remote KV-compatible provider; a self-hosted deployment may select
Redis, Postgres-backed cache, or in-memory storage for local development.

Reasons:

- it keeps runtime wiring consistent with the resolved graph
- it keeps the default operationally simple
- it permits cheap, read-heavy reference caching without coupling application
  code to one vendor
- it avoids treating the mere presence of provider environment variables as
  runtime selection

Rule:

The graph-selected provider is authoritative; application code targets the
shared cache contract.

### 3. Redis should be a first-class alternative, not the only answer

Redis is still a valid cache backend when a deployment needs:

- fresher invalidation behavior
- richer cache operations
- Node/container-oriented runtime support
- a backend already present in the hosting environment

Voyant should support Redis through the same cache contract instead of making
Redis the universal default.

Rule:

Redis is a supported adapter, not the mandatory cache backend.

## Backend Guidance

### 4. KV is good for read-heavy, staleness-tolerant caching

KV is a good fit for:

- storefront settings
- market/config lookups
- localization bundles
- cached reference data
- cacheable query results that can tolerate staleness

KV is not the right fit for:

- hot write-heavy keys
- strongly consistent invalidation-sensitive state
- atomic coordination primitives

Rule:

Use KV for read-heavy, best-effort caching where eventual consistency is
acceptable.

### 5. Redis is better when cache freshness matters more

Redis is a better fit when the deployment needs:

- faster invalidation visibility
- richer cache patterns
- stronger expectations around write/read freshness

That does not make Redis the better default for every template. It simply means
the backend can be swapped when the workload needs it.

Rule:

Choose Redis when the cache workload needs its semantics, not because cache
exists at all.

## Shared Cache Contract

### 6. Keep the portable cache interface small

Voyant should expose a narrow shared cache contract for common caching
operations.

Examples:

- `get(key)`
- `set(key, value, ttl?)`
- `delete(key)`
- optional batched helpers such as `getMany(...)` when they are genuinely
  useful

The shared contract should stay small enough that both KV and Redis adapters
can implement it honestly.

Rule:

Portable cache usage should target the smallest common contract that real
backends can support clearly.

### 7. Do not promise Redis semantics through a KV adapter

If a feature needs:

- immediate invalidation visibility
- atomic operations
- distributed locks
- rich data structures

then it is not a pure cache concern anymore, or it should require a backend
with those semantics explicitly.

Rule:

Do not pretend all cache backends behave like Redis.

## Cacheable Workloads

### 8. Cache reference and response-shaped data

Good cache candidates include:

- public settings
- catalog-derived reference payloads
- expensive but repeatable read models
- derived storefront/public query results
- locale-aware rendered fragments

Rule:

Cache read-heavy derived data, not primary mutable business state.

For public API route classification and the route-level `Cache-Control` matrix,
see [`public-route-cache-policy.md`](./public-route-cache-policy.md).

For the boundary between cacheable read models and explicit derived
projections, see
[`cross-module-indexing-and-projection-policy.md`](./cross-module-indexing-and-projection-policy.md).

### 9. Keep code tolerant of misses

Every cache usage should assume:

- cache misses will happen
- entries may expire
- entries may be invalidated
- backends may differ in propagation timing

The code path behind the cache should still work correctly when the cache is
empty.

Rule:

A cache miss should be a performance event, not a product bug.

## Template And Deployment Guidance

### 10. Template defaults should match the hosting model

Voyant should not force one universal cache default across every template.

A reasonable default split is:

- local Node development: in-memory
- managed or self-hosted Node: choose a remote KV-compatible, Redis, or
  Postgres-backed provider based on deployment assumptions

Rule:

Template defaults should follow the runtime model instead of pretending every
deployment has the same cache needs.

### 11. Self-hosted deployments should choose the cache backend explicitly

Self-hosted Voyant users should be able to choose the backend that matches
their platform:

- KV-compatible setup
- Redis
- in-memory for local/dev only

That choice should remain a deployment concern behind the shared cache
interface.

Rule:

Cache backend selection is a deployment concern, not a reason to fork the
framework surface.

### 12. A deployment that serves public routes declares its response-cache posture

Rule 11 leaves the cache backend with the deployment. Serving a public
storefront adds a second choice the backend cannot express: whether anything
caches responses *in front of* the origin. `deployment.responseCache` is where
that is stated.

    responseCache: { edge: "declared" | "none" }

Two postures are supported, and both reach the same behaviour:

- **Origin-cached.** A non-database shared cache at the origin —
  `providers.cache: "redis"` — with `responseCache: { edge: "none" }`. Every
  process shares one cache; the database is not in the response path.
- **Edge-cached.** A standards-compliant HTTP cache in front of the origin — a
  CDN, a reverse proxy, or the Voyant Cloud dispatcher — with
  `responseCache: { edge: "declared" }`. The origin cache then only backstops
  what the edge misses, so a small deployment can keep `providers.cache:
  "memory"` behind it.

Absent means undeclared, and undeclared reads as `"none"`. The standard
self-hosted profile declares `{ edge: "none" }` over `providers.cache:
"postgres"`, which is the one combination the Node runtime reports at startup:
shared public responses are read from and written to the same Postgres the
routes query, and the only tier in front of it is a per-process in-memory cache
capped at 60 seconds. That posture is supported and reasonable for a small
single-instance deployment. It is not a posture for serving a storefront under
load, which is why it is reported rather than assumed.

The same profile selects per-process `sharedState` and `rateLimit`, which the
runtime reports for the same reason: a per-process rate limit means N instances
enforce the configured limit N times over. The standard profile is a
single-instance profile until those are moved to a cross-process provider.

**Parity is a declaration, not a component.** Managed deployments get their
response caching from Redis at the origin plus the dispatcher at the edge. A
self-hosted deployment reaches the same behaviour by declaring one of the two
postures above — it does not need any Voyant-specific component to do it. That
holds only because the framework's obligation is *standard* HTTP cache
semantics: routes declare `Cache-Control: public, s-maxage=…,
stale-while-revalidate=…`, and the framework emits and honours `s-maxage`,
`stale-while-revalidate`, `Vary`, and request-side `no-cache`/`no-store`. Any
conforming shared cache can therefore substitute for any other, which is what
makes an ordinary CDN an exact substitute for the dispatcher. A host-specific
cache keyed on a hardcoded route path would not be substitutable, and is a
defect under [ADR 0021](../adr/0021-http-response-cache-tiers.md).

Rule:

A deployment that mounts public routes declares how it serves them. Undeclared
is read as no tier in front of the origin, and a database-backed response cache
with no declared edge tier is reported at startup rather than left for a route
author to discover from a header that did not behave as written.

### 13. The staff surface states a policy too — revalidation, not reuse

Rules 11 and 12 are about what caches *in front of* the origin. The staff
surface has none, by design: `/v1/admin/*` is cookie-bearing and personalized,
so no shared cache may store it. That is not a reason to say nothing.

An admin read with no `Cache-Control` at all is not merely uncached at the
edge — it is unusable by the *browser*, so every repeat navigation and every
reload re-downloads a body the client already holds. `adminResponseRevalidation`
(`@voyant-travel/hono`) stamps safe JSON reads of that surface with an `ETag`
and `Cache-Control: private, no-cache`, and answers a matching `If-None-Match`
with a bodyless 304.

`no-cache` is the operative word, and it is not `no-store`: the browser keeps
the payload and *asks* before reusing it. A repeat read therefore costs one
round trip and an empty 304 instead of a full transfer, with no window in which
a staff member is shown a record they have already changed. Skipping the round
trip as well means `private, max-age=N`, which is a per-route judgement about
how stale that particular read may be — the dashboard aggregates declare
`private, max-age=30` for exactly that reason. A route that sets its own
`Cache-Control` is never restamped, so that opt-in stays with the route.

**This puts admin payloads on the device, and that is a decision rather than a
side effect.** Revalidation requires storage — no directive yields a 304 without
the browser having kept the body — so admin JSON moves from "most browsers store
nothing" (no directives, no validators) to "stored in the operator's own profile
cache". `private` keeps it out of every shared cache, but the browser cache is
not session-scoped: booking and customer payloads persist on the device after
sign-out, and signing out does not evict them.

That is accepted for a staff workstation, whose profile already holds the admin
bundle and the session cookie, and it is bounded — entries are `private`,
revalidated before every reuse, and evicted under ordinary disk-cache pressure.
A deployment that cannot accept device-resident admin payloads sets
`adminRevalidation: false` and gets the previous behaviour back: no directives,
no storage, a full re-transfer per navigation. Revisit this if the staff surface
is ever served to shared or unmanaged devices, where the profile cache stops
being the operator's own.

Rule:

Every admin GET states its cache policy. The default is revalidation, which
means the payload is stored on the member's device; a freshness window on top of
that is a route's decision to make explicitly, and never a shared cache's.

## Practical Checklist

When adding caching in Voyant:

1. Check whether the data is safe to treat as best-effort and stale-tolerant.
2. If not, do not put it in the cache.
3. Use the shared cache contract instead of backend-specific calls where
   portability matters.
4. Prefer KV for Cloudflare-first templates.
5. Use Redis when the workload needs fresher or richer cache semantics.
6. Keep the underlying code path correct even on cache miss.

## Non-Goals

This guide does not introduce:

- a distributed lock manager
- a requirement that every deployment use Redis
- a guarantee that all cache backends have identical semantics

The point is a clean and honest caching model, not a fake universal storage
layer.
