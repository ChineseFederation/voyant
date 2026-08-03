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
