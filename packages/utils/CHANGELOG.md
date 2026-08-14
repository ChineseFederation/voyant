# @voyant-travel/utils

## 0.111.1

### Patch Changes

- Updated dependencies [36f3085]
  - @voyant-travel/types@0.110.0

## 0.111.0

### Minor Changes

- 2bc1570: Add an optional conditional-write `putIfAbsent` to the shared KV contract.

  Coalescing concurrent misses onto one origin computation needs a way to elect a
  single revalidator across processes: exactly one caller gets `true` and performs
  the origin work, every other caller gets `false` and serves what it already has.
  `KVStore` gains `putIfAbsent(key, value, options?)` for that, and it never
  blocks — a loser is told it lost rather than made to wait.

  The member is optional because it is only worth having when the backend decides
  it atomically. Each store that implements it does so in one round trip:

  - `createMemoryKvNamespace` reads and writes without awaiting in between, which
    a single-threaded isolate cannot interleave.
  - `createRedisKvStore` issues `SET key value NX [EX ttl]` and reports the write
    only on the `OK` reply, never on a nil one.
  - `createPostgresKvStore` issues one `INSERT … ON CONFLICT (key) DO UPDATE …
WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= now()
RETURNING`, so the conflicting caller re-reads the committed expiry under the
    row lock and `RETURNING` yields a row only to the caller that wrote.

  All three treat an entry that exists but has expired as absent, matching how
  `get` already treats it, so a lapsed slot can be won again rather than
  deadlocking behind a holder that is gone.

  `createTieredKvStore` exposes `putIfAbsent` only when its L2 does, and delegates
  the decision there. L1 is per-process and would hand every process its own
  winner, so it cannot arbitrate; it only mirrors the winner's value, still capped
  by `l2PromotionTtlSeconds`. A tier over an L2 that cannot elect omits the member
  entirely, degrading callers to no coalescing rather than to a false election.

  The node-redis TCP adapter in `@voyant-travel/framework` now forwards `nx` as
  the SET `NX` condition. It previously dropped unrecognised options, which would
  have turned a conditional write into an unconditional one that always reported
  success — every caller a winner, which is the failure this contract exists to
  prevent.

  See ADR 0021 §5.

### Patch Changes

- @voyant-travel/types@0.109.12

## 0.110.1

### Patch Changes

- 268f341: Keep anonymous departure browsing in the configured cache store for 15 minutes and invalidate every cached query variant when `availability.slot.changed` is delivered. Managed runtimes use Redis through the provider-neutral cache interface, with process-local tiered-cache entries capped at 60 seconds to bound cross-replica invalidation lag. Checkout continues to verify availability against the transactional database, and deployments without a cache provider continue to use the live query path.

## 0.110.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

## 0.109.0

### Minor Changes

- 9db4363: Add framework-owned Redis namespacing for managed regional cache and rate-limit
  state, plus a Node-only persistent TCP Redis adapter in the Framework boundary.
  Redis KV and rate-limit adapters still preserve the Upstash-compatible HTTP(S)
  REST path for edge and self-hosted consumers. Resident Node now accepts
  `redis://` and `rediss://` TCP Redis URLs in addition to HTTP(S) REST, reuses
  one lazy Redis client across cache, shared-state, and rate-limit roles, and
  wires `REDIS_NAMESPACE` to `voyant:v1:<namespace>:cache:`,
  `voyant:v1:<namespace>:state:`, and `voyant:v1:<namespace>:rate:` prefixes.
  Managed Cloud requires `REDIS_NAMESPACE` for every Redis role, requires
  `rediss://` for TCP while retaining HTTPS REST compatibility, rejects plaintext
  `redis://`, and keeps managed shared state on Postgres by default.

## 0.108.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

## 0.107.1

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/templating@0.104.2

## 0.107.0

### Minor Changes

- 4d0eeed: Remove deprecated beta compatibility surfaces in favor of their canonical APIs.

  - Import Hono transport bundles from `@voyant-travel/hono/bundle` and use
    `HonoBundle`, `defineHonoBundle`, and `expandHonoBundles`.
  - Import public document delivery APIs from
    `@voyant-travel/public-document-delivery`.
  - Use permission-named API key helpers instead of the removed scope aliases.
  - Use `createRedisKvStore` for Redis-backed caching instead of the removed
    no-op Redis compatibility functions.
  - Use `entityTagColumns` instead of `tagsCoreColumns`.

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/types@0.109.0

## 0.106.1

### Patch Changes

- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0

## 0.106.0

### Minor Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.

### Patch Changes

- @voyant-travel/types@0.107.1

## 0.105.6

### Patch Changes

- Updated dependencies [c9a356f]
  - @voyant-travel/types@0.107.0

## 0.105.5

### Patch Changes

- 6bb0425: Remove an unused direct Liquid dependency from the utils package manifest.

## 0.105.4

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0

## 0.105.3

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/types@0.105.0

## 0.105.2

### Patch Changes

- 28898ad: Fix migration-facing publish artifacts by exporting all Distribution-owned supplier and external-reference schemas, republishing contract packages with complete dist files, guarding packed artifacts against legacy package-scope specifiers, and updating Voyant Cloud defaults to `https://api.voyant.travel`.

## 0.105.1

### Patch Changes

- 0b10029: Split oversized shared service, UI, locale, and reference-data modules into focused internal files while preserving the existing public exports and runtime behavior.

## 0.105.0

### Minor Changes

- b0f1e21: New `@voyant-travel/utils/resilience` (RFC #1687 Phase 3.3): `resilientFetch(input, init?, options?)` — per-attempt timeout (default 10s), capped exponential retries with full jitter (default 3 attempts on network errors/timeouts/429/5xx, idempotent methods only unless `retryNonIdempotent`), and an optional per-isolate circuit breaker (`createCircuitBreaker`, `CircuitOpenError`). Outbound calls burn the request's platform-enforced CPU/subrequest budget — a slow third-party now fails fast instead of hanging, and a down one trips the breaker instead of being hammered.

## 0.104.1

### Patch Changes

- @voyant-travel/templating@0.104.1
- @voyant-travel/types@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/templating@0.104.0
- @voyant-travel/types@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/templating@0.103.0
- @voyant-travel/types@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/templating@0.102.0
- @voyant-travel/types@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/templating@0.101.2
- @voyant-travel/types@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/templating@0.101.1
- @voyant-travel/types@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/templating@0.101.0
- @voyant-travel/types@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/templating@0.100.0
- @voyant-travel/types@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/templating@0.99.0
- @voyant-travel/types@0.99.0

## 0.98.0

### Minor Changes

- 485da95: Extract `@voyant-travel/templating` and purify `@voyant-travel/legal-contracts`.

  `@voyant-travel/templating` is a new lean package (`liquidjs` only) holding the
  Liquid/Mustache template renderer and syntax validator, moved out of
  `@voyant-travel/utils`. `@voyant-travel/utils/template-renderer` re-exports it, so existing
  import paths (finance, products, legal runtime) are unchanged.

  `@voyant-travel/legal-contracts` now depends on `@voyant-travel/templating` instead of
  `@voyant-travel/utils` for its contract-body Liquid-syntax validation — dropping the
  transitive Drizzle / `@voyant-travel/db` / pdf-lib dependency. Its tree is now just
  `zod` + `@voyant-travel/schema-kit` + `@voyant-travel/templating` (no data layer).

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/templating@0.98.0
  - @voyant-travel/types@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/types@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/types@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/types@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/types@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/types@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/types@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/types@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/types@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/types@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/types@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/types@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/types@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/types@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/types@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/types@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/types@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/types@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/types@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/types@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/types@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/types@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/types@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/types@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/types@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/types@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/types@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/types@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/types@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/types@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/types@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/types@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/types@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/types@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/types@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/types@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/types@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/types@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/types@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/types@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/types@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/types@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/types@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/types@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/types@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/types@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/types@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/types@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/types@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/types@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/types@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/types@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/types@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/types@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/types@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/types@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/types@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/types@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/types@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/types@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/types@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/types@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/types@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/types@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/types@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/types@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/types@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/types@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/types@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/types@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/types@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/types@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/types@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/types@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/types@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/types@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/types@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/types@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/types@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/types@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/types@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/types@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/types@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/types@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/types@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/types@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/types@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/types@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/types@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/types@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/types@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/types@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/types@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/types@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/types@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/types@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/types@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/types@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/types@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/types@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/types@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/types@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/types@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/types@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/types@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/types@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/types@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/types@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/types@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/types@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/types@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/types@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/types@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/types@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/types@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/types@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/types@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/types@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/types@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/types@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/types@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/types@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/types@0.61.0

## 0.60.0

### Minor Changes

- 4ff7f15: Add a Voyant Cloud Vault KMS provider with per-call encrypt/decrypt support and optional envelope data-key methods.

### Patch Changes

- @voyant-travel/types@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/types@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/types@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/types@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/types@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/types@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/types@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/types@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/types@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/types@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/types@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/types@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/types@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/types@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/types@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/types@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/types@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/types@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/types@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/types@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/types@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/types@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/types@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/types@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/types@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/types@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/types@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/types@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/types@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/types@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/types@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/types@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/types@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/types@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/types@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/types@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/types@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/types@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/types@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/types@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/types@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/types@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/types@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/types@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/types@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/types@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/types@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/types@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/types@0.35.0

## 0.34.0

### Patch Changes

- a37d4af: Validate Liquid syntax in legal contract template bodies before save or preview so rich-text-split tags return structured template errors instead of render-time failures.
  - @voyant-travel/types@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/types@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/types@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/types@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/types@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/types@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/types@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/types@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/types@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/types@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/types@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/types@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/types@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/types@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/types@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/types@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/types@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/types@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/types@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/types@0.30.0

## 0.29.0

### Patch Changes

- @voyant-travel/types@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/types@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/types@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/types@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/types@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/types@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/types@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/types@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/types@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/types@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/types@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/types@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/types@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/types@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/types@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/types@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/types@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/types@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/types@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/types@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/types@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/types@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/types@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/types@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/types@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/types@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/types@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/types@0.18.0

## 0.17.0

### Patch Changes

- @voyant-travel/types@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/types@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/types@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/types@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/types@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/types@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/types@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/types@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/types@0.9.0

## 0.8.0

### Minor Changes

- 24dc253: End-to-end contract generation workflow for the operator template. Four-PR batch riding together on the fixed train:

  **Template renderer filters (#270)** — Three new Liquid filters registered on `@voyant-travel/utils`' shared template engine: `currency`, `cents` (integer cents → currency string), `format_date` with short/medium/long/iso presets. Picked up automatically by `renderStructuredTemplate` consumers (`@voyant-travel/legal`, `@voyant-travel/notifications`).

  **Auto-generate on booking.confirmed (#271)** — `createLegalHonoModule` now accepts `autoGenerateContractOnConfirmed`: an opt-in subscriber that, on every `booking.confirmed` event, creates a contract against the configured template slug, renders its Liquid body with booking + traveler variables, and delegates to the configured PDF generator. Discriminated outcome (`template_not_found` / `template_version_missing` / `booking_not_found` / `contract_create_failed` / `document_failed` / `ok`) surfaces misconfigs at bootstrap. New `findTemplateBySlug` + `findSeriesByName` helpers on the template/series services. `@voyant-travel/legal` now depends on `@voyant-travel/bookings` (no cycle).

  **Booking contract card hook plumbing (#272)** — `@voyant-travel/legal-react` gains `generateDocument` + `regenerateDocument` mutations on `useLegalContractMutation`, `LegalContractsListFilters` now carries `bookingId` / `personId` / `organizationId` (already server-side-supported), new `legalContractGenerateDocumentResponse` schema. Paired registry component `voyant-legal-booking-contract-card` lists contracts for a booking with download + regenerate actions.

  **Operator wiring (#273)** — Operator template now resolves a PDF document generator from the `DOCUMENTS_BUCKET` R2 binding, enables `autoGenerateContractOnConfirmed` against slug `customer-sales-agreement`, and its seed script now writes a proper Liquid-templated contract body + a `contract_template_versions` row so the auto-generate flow resolves end-to-end from first confirm.

### Patch Changes

- @voyant-travel/types@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/types@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/types@0.6.9

## 0.6.8

### Patch Changes

- @voyant-travel/types@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/types@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/types@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/types@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/types@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/types@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/types@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/types@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/types@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/types@0.5.0

## 0.4.5

### Patch Changes

- @voyant-travel/types@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/types@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/types@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/types@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/types@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Add built-in PDF document adapters for legal and finance workflows.

  `@voyant-travel/utils` now exports `renderPdfDocument()` as a shared basic PDF
  renderer for rendered text content. `@voyant-travel/legal` and `@voyant-travel/finance`
  now expose bundled PDF serializers and generator helpers on top of their
  storage-backed document workflows, so apps can generate readable PDF artifacts
  without wiring a custom browser renderer for the common case.

- e84fe0f: Upgrade legal and finance template rendering to support Liquid-style control
  flow.

  - add a shared structured template renderer in `@voyant-travel/utils`
  - keep simple `{{path}}` interpolation compatibility for existing templates
  - support Liquid loops, conditionals, and filters in legal and finance
    html/markdown templates
  - support Liquid rendering inside lexical text nodes for legal and finance
    template bodies
  - @voyant-travel/types@0.4.0

## 0.3.1

### Patch Changes

- @voyant-travel/types@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/types@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/types@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/types@0.1.1

## 1.1.11

### Patch Changes

- @voyant-travel/types@1.1.11

## 1.1.1

### Patch Changes

- @voyant-travel/types@1.1.1

## 1.1.0

### Minor Changes

- [#292](https://github.com/voyant-travel/voyant/pull/292)
  [`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)
  Thanks [@mihaipxm](https://github.com/mihaipxm)! - Initial SDK release

### Patch Changes

- Updated dependencies
  [[`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)]:
  - @voyant-travel/types@1.1.0
