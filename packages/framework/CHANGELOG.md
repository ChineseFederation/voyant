# @voyant-travel/framework

## 0.79.7

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.
- Updated dependencies [3cbf7fb]
  - @voyant-travel/db@0.120.7
  - @voyant-travel/operator-standard@0.20.46

## 0.79.6

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.24.0
- @voyant-travel/operator-standard@0.20.44
- @voyant-travel/cruises@0.238.14

## 0.79.5

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.23.0
- @voyant-travel/operator-standard@0.20.43
- @voyant-travel/cruises@0.238.13

## 0.79.4

### Patch Changes

- 4f9a097: The retired ledger sources a package absorbed are declared in `package.json`, so
  the source-free managed image can see them.

  A module consolidation moves another package's migration tags under a new ledger
  source name. The ledger is keyed `(source, tag)`, so a database that already
  applied them looks for `availability/0000_availability_baseline` while the plan
  offers `operations/0000_availability_baseline` — nothing matches, and the moved
  baseline re-runs against the tables the retired package built.

  `MigrationSource.legacyNames` is the mapping, and the previous release made it
  authorable as `legacySources` on the graph migration facet. That declaration is
  invisible to the managed image, which is **source-free**: it resolves a module by
  package NAME, reads its committed `migrations/` folder, and never resolves a
  graph. So every deployment carrying the retired history was blocked, and only
  those — a fresh database has nothing to adopt, which is why CI did not see it.

  The declaration therefore moves to package metadata, `voyant.legacyMigrationSources`,
  next to `requiresSchemas` and for the same reason:

  - `loadModuleBundleSource` reads it, so the managed runtime adopts the identities
    without a graph;
  - `buildMigrationPlan` resolves it from the same package record, so the
    graph-driven plan reads one declaration rather than a second one that can drift;
  - `VoyantGraphMigrationFacet.legacySources` is removed — a facet field that only
    half the callers can read is worse than none.

  `verify:migration-cutline` now fails when a source the cutline manifest records
  as absorbed is not claimed by the absorbing package, and when a claimed source
  still ships its own migrations folder.

  Unchanged: this is for a pure ownership move, where the tags carry over
  byte-identical and their content hashes still match. Changed SQL is still
  rejected.

  Fixes voyant#4330.

- Updated dependencies [4f9a097]
  - @voyant-travel/framework-migrations@0.10.14
  - @voyant-travel/operator-standard@0.20.39
  - @voyant-travel/core@0.140.1
  - @voyant-travel/voyant-connect-adapter@0.22.1

## 0.79.3

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/cruises@0.238.11
  - @voyant-travel/db@0.120.6
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/operator-standard@0.20.36
  - @voyant-travel/storage@0.115.4
  - @voyant-travel/voyant-connect-adapter@0.22.0

## 0.79.2

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.21.0
- @voyant-travel/cruises@0.238.9
- @voyant-travel/operator-standard@0.20.34

## 0.79.1

### Patch Changes

- @voyant-travel/operator-standard@0.20.33
- @voyant-travel/cruises@0.238.8
- @voyant-travel/voyant-connect-adapter@0.20.0

## 0.79.0

### Minor Changes

- 9d18306: Require an explicit Redis binding on the Node runtime deployment.

  `VoyantNodeRuntimeDeployment.redis` is now required, and the runtime no longer
  infers Redis isolation and network from the deprecated `deployment.mode`. A host
  that composes a deployment knows which Redis it bound and must say so; a caller
  that cannot state the binding is a caller whose Redis safety posture nobody has
  decided.

  The generated Node runtime entry now resolves the binding its recorded mode has
  always implied, so generated artifacts keep their exact posture. No deployment
  changes behaviour.

### Patch Changes

- Updated dependencies [9d18306]
  - @voyant-travel/db@0.120.4
  - @voyant-travel/operator-standard@0.20.28

## 0.78.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

  Fourteen compatibility surfaces in private packages had no caller left anywhere in
  the repository — not in product code, not in tests, and in several cases not
  even a re-export. Each one is now gone rather than carried. Nothing here touches
  a published package, a database column, or an API response an external
  storefront could read; those cases are inventoried for a separate decision.

  - **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
    one-line re-export behind it. Every importer in the repository, including
    catalog's own modules, already names
    `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
    been the canonical dependency since the engine contracts moved out of the
    runtime. The README and the catalog/promotions architecture docs no longer
    describe the alias.
  - **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
    alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
    classification retirement, and the `providers` option on
    `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
    under `resources` on every path; no host, generated artifact or test ever
    passed it.
  - **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
    limiter. Limits are configured per policy through `RateLimitPolicy`; the
    constants were re-exported twice and read nowhere.
  - **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
    a pass-through to `findDefaultActiveByScope`. Callers and tests already use
    the canonical name.
  - **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
    `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
    them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
    they could not travel to a subscriber even if something had.
  - **`@voyant-travel/finance-react`** — the `orderId` filter on
    `FinancePaymentSessionListFilters`. Its only reader was the
    `legacyOrderId ?? orderId` fallback in the query builder, which now reads
    `legacyOrderId` directly.
  - **`@voyant-travel/operations-react`** — `KpiStrip` and
    `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
    manifest happened to be loaded, using its own paid-amount rule; the departure
    workspace reads whole-departure figures from `GET /slots/{id}/summary`
    instead. `KpiStrip` was not reachable from the package surface at all.

  A second group carried no `@deprecated` tag, only a "back-compat" comment, and
  was equally unreachable:

  - **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
    `SlotMutationRuntime`, left over from when the runtime type covered updates
    only. Zero references, including tests.
  - **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
    `inventoryProductCompatibilityLinkable`, exported from three places. Both real
    callers (inventory's and legal's `standard-links`) import the canonical symbol
    and rename it locally. The compatibility linkable itself stays: it is what
    keeps the `products` module name resolving.
  - **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
    `./extras.js`. Its two importers were both inside the package.
  - **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
    and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
    a booking origin. Nothing called it; its only exercise was a unit test, which
    goes with it. The origin columns and the `legacy_transaction` origin source
    are untouched — this removes a reader, not the data.
  - **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
    ids re-exported from the detail hosts "for backwards compatibility". Every
    consumer already imports them from the lean `./slots.js` the comment points
    at, which is the whole reason that module exists. The distribution-react one
    was already annotated as an unused export.

  The three deleted files are pinned in `retired-paths.json` so they stay deleted.

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/operator-standard@0.20.27
  - @voyant-travel/cruises@0.238.7
  - @voyant-travel/voyant-connect-adapter@0.19.0
  - @voyant-travel/action-ledger@0.115.14

## 0.77.0

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/operator-standard@0.20.26
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/cruises@0.238.6
  - @voyant-travel/db@0.120.3
  - @voyant-travel/storage@0.115.3

## 0.76.0

### Minor Changes

- 076c246: Delete the beta booking-engine quote path (voyant#4188).

  Voyant is beta: nothing below is aliased, deprecated, or kept for
  compatibility.

  **Deleted.** `quoteEntity` / `quoteEntitiesBatch` and the whole
  `catalog/src/booking-engine/quote.ts` module, including `QuoteEntityRequest`,
  `QuoteEntityResult`, `QuoteEntityDeps`, `QuoteContentEnricher`,
  `QuoteContentEnrichmentInput`, `QuoteScope` and `DEFAULT_QUOTE_TTL_MS`;
  `serializeQuoteResult`; the shape-enrichment seam
  (`createProductQuoteShapeEnricher`, `CatalogProductQuoteEnricher`,
  `inventory`'s `enrichProductQuoteShape`), superseded by the owned handler's
  `computeRequirements`; the beta tax recompute
  (`applyCatalogTaxToQuoteResult`, `applyOperatorTaxToQuoteResult`, and
  `CatalogRuntimeServices.applyTaxToQuoteResult`, which was its only caller and
  the last writer into `catalog_quotes`).

  From the **published** `@voyant-travel/catalog-contracts`: `quoteResponseV1`,
  `quoteRequestV1`, `quoteScopeV1`, `quoteBatchRequestV1`, `quoteBatchResultV1`,
  `quoteBatchResponseV1`, `quoteBatchCriteriaV1`, `quoteBatchSelectionV1` and
  their inferred types. No subpath changed. `bookRequestV1` / `bookResponseV1`
  are untouched.

  **Added.** `CatalogRuntimeServices.previewOffer(context, input)` — the v1
  stateless Offer Preview, exposed on the runtime surface so a server-side
  composer reaches the same `composeRequirements` / `composeQuote` ports the
  Booking Session lifecycle uses instead of opening a second pricing path. It
  replaces `applyTaxToQuoteResult` in the port's conformance set.

  **Trips moved onto the v1 lifecycle.** `createCatalogComponentAdapter().quote`
  prices a catalog-backed component through Offer Preview and returns
  `OfferPreviewResultV1`; `PriceTripDeps.quoteCatalogComponent` and
  `ReserveTripDeps.quoteCatalogComponentBeforeReserve` are retyped to match. The
  adapter no longer takes `ownedHandlers`, `evaluatePromotions` or
  `transformQuoteResult`. Because a preview is non-binding by construction, a
  priced catalog component no longer records `catalogQuoteId` and its
  `priceExpiresAt` is null — the binding price and its expiry are minted later by
  the accepted-Proposal Booking Session.

  **Kept, deliberately.** The `catalog_quotes` table. Commerce's
  `booking.confirmed` redemption recorder still reads historical
  `pricing_applied_offers` from it by `consumed_booking_id`; that subscriber is
  mounted and sits outside the retired quote path, so dropping the table would
  delete evidence read for already-shipped bookings. It now has no writer.
  Consequently promotion codes are not evaluated at quote time — the v1 Session
  `composeQuote` has no promotion hook yet, and adding one is separate work.
  `createCatalogPromotionEvaluator` and `recordPromotionRedemptionsForBooking`
  remain exported and are documented as unwired.

  The deleted identifiers are pinned to nowhere by a new
  `beta-quote-path-authority` entry in `symbol-policy.json`, and the deleted files
  are pinned in `retired-paths.json`.

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.18.0
- @voyant-travel/cruises@0.238.5
- @voyant-travel/operator-standard@0.20.25

## 0.75.7

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.17.0
- @voyant-travel/cruises@0.238.4
- @voyant-travel/operator-standard@0.20.21

## 0.75.6

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.16.0
- @voyant-travel/cruises@0.238.3
- @voyant-travel/operator-standard@0.20.20

## 0.75.5

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.15.0
- @voyant-travel/cruises@0.238.2
- @voyant-travel/operator-standard@0.20.19

## 0.75.4

### Patch Changes

- @voyant-travel/voyant-connect-adapter@0.14.0
- @voyant-travel/cruises@0.238.1
- @voyant-travel/operator-standard@0.20.17

## 0.75.3

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/cruises@0.238.0
  - @voyant-travel/voyant-connect-adapter@0.13.0
  - @voyant-travel/operator-standard@0.20.16

## 0.75.2

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/cruises@0.237.0
  - @voyant-travel/voyant-connect-adapter@0.12.0
  - @voyant-travel/operator-standard@0.20.15

## 0.75.1

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/cruises@0.236.0
  - @voyant-travel/voyant-connect-adapter@0.11.0
  - @voyant-travel/operator-standard@0.20.14

## 0.75.0

### Minor Changes

- 3552f14: Wake the expired-hold reaper instead of polling for it.

  An availability hold records the instant it becomes reapable, so nothing has to
  poll to discover that work. `operations.release-expired-availability-holds` is
  now `wakeup: true`: placing or extending a hold reports the new expiry, the
  reaper re-arms itself from the earliest outstanding expiry after every run, and
  the cron drops to a six-hourly backstop for a wake lost to a restart.

  Hosts gain a target-neutral way to carry that request.
  `VoyantRuntimeHostPrimitives.jobs.wakeAt(jobId, at)` asks the deployment to
  invoke a wakeable job at an instant; the Node host arms one in-process timer per
  job, keeps the earliest pending instant, and declines anything past its horizon.
  A requested wake is a prompt and never durable — the declared cadence stays the
  recovery authority, as it already is for a wake arriving over
  `POST /__voyant/jobs/:id`.

  On a managed deployment this is what stops an idle tenant from paying for its
  database. A tenant with no live holds now arms nothing and never wakes its
  compute for this job; one with holds wakes exactly when there is capacity to
  give back, which is sooner than the fifteen-minute sweep it replaces.

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/cruises@0.235.6
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/operator-standard@0.20.7
  - @voyant-travel/storage@0.115.2

## 0.74.1

### Patch Changes

- @voyant-travel/cruises@0.235.5
- @voyant-travel/operator-standard@0.20.1
- @voyant-travel/plugin-voyant-connect@0.10.0

## 0.74.0

### Minor Changes

- e4833a1: Make the response-cache posture of a deployment declarable, and report it.

  A route that declares `Cache-Control: public, s-maxage=900` is addressing every
  shared cache at once, but nothing told its author which of them the deployment
  actually has. The standard self-hosted profile selects `cache: "postgres"`, so
  the tier meant to shield the database _is_ the database, with only a per-process
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

### Patch Changes

- Updated dependencies [c35841b]
- Updated dependencies [e4833a1]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/operator-standard@0.20.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/cruises@0.235.4
  - @voyant-travel/plugin-voyant-connect@0.9.0
  - @voyant-travel/core@0.137.2

## 0.73.1

### Patch Changes

- @voyant-travel/operator-standard@0.19.15
- @voyant-travel/cruises@0.235.3
- @voyant-travel/plugin-voyant-connect@0.8.0

## 0.73.0

### Patch Changes

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

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/operator-standard@0.19.14
  - @voyant-travel/runtime-core@0.6.8
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/cruises@0.235.2
  - @voyant-travel/types@0.109.12

## 0.72.0

### Minor Changes

- 472c829: Stop encoding a specific payment processor in the deployment contract.

  `deployment-requirements` hardcoded Netopia's credential schema, so supporting a
  new processor meant a framework release per country. It was also stale: it
  demanded `NETOPIA_MERCHANT_ID`, which the provider catalog documents as not
  existing ("the POS signature is the identifier"), plus private/public keys that
  are not the credential model either.

  Managed deployments bind one generic remote adapter and the control plane
  resolves the connected processor and its credentials, so the deployment needs no
  processor environment at all. Self-hosted deployments use `custom` and bind
  their own adapter, which declares its own requirements.

  `providers.payments: "netopia"` is deprecated but still accepted, and the
  invalid-selection hint no longer names a vendor.

### Patch Changes

- @voyant-travel/cruises@0.235.0
- @voyant-travel/operator-standard@0.19.11
- @voyant-travel/plugin-voyant-connect@0.7.0

## 0.71.8

### Patch Changes

- @voyant-travel/operator-standard@0.19.10
- @voyant-travel/cruises@0.234.0
- @voyant-travel/plugin-voyant-connect@0.6.0

## 0.71.7

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [c986bd5]
  - @voyant-travel/plugin-voyant-connect@0.5.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/cruises@0.233.0
  - @voyant-travel/operator-standard@0.19.9
  - @voyant-travel/db@0.119.4

## 0.71.6

### Patch Changes

- 5ed518e: Move the Voyant Connect sources plugin into the monorepo at
  `packages/plugins/voyant-connect` and consume it as a workspace package.

  `packages/catalog` previously depended on the published plugin, whose peer
  ranges resolved back to `@voyant-travel/catalog` and `@voyant-travel/cruises`.
  That cycle meant the monorepo could not resolve its own lockfile until its own
  publish had landed, and it dragged a stale `@voyant-travel/bookings-contracts`
  into catalog's resolution — breaking two catalog suites on import. Both are
  fixed by the move.

  The plugin keeps its registry dependencies on `@voyant-travel/connect-adapter`,
  `connect-cruises`, `connect-sdk`, and `data-sdk`: those are Connect's own public
  surface and remain in the connect repository.

- Updated dependencies [5ed518e]
  - @voyant-travel/plugin-voyant-connect@0.4.0
  - @voyant-travel/operator-standard@0.19.8
  - @voyant-travel/cruises@0.232.0
  - @voyant-travel/db@0.119.3

## 0.71.5

### Patch Changes

- @voyant-travel/cruises@0.231.0
- @voyant-travel/operator-standard@0.19.7

## 0.71.4

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/operator-standard@0.19.5
  - @voyant-travel/cruises@0.230.0

## 0.71.3

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/cruises@0.229.0
  - @voyant-travel/operator-standard@0.19.4

## 0.71.2

### Patch Changes

- @voyant-travel/cruises@0.228.0
- @voyant-travel/operator-standard@0.19.2

## 0.71.1

### Patch Changes

- @voyant-travel/operator-standard@0.19.1
- @voyant-travel/cruises@0.227.0

## 0.71.0

### Minor Changes

- 28a6fe2: Allow one built Operator artifact to select deployment provider bindings at boot through `VOYANT_DEPLOYMENT_BINDINGS_JSON` while keeping its compiled application graph fixed.

  Model Redis keyspace isolation and network trust as explicit, independent binding constraints. Runtime-selected Redis bindings now require those properties, shared bindings require `REDIS_NAMESPACE`, and untrusted-network bindings require secure transport. Existing generated artifacts keep their previous provider selection and Redis safety behavior when no boot override is supplied.

## 0.70.1

### Patch Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

- Updated dependencies [e65bd25]
  - @voyant-travel/operator-standard@0.19.0
  - @voyant-travel/framework-migrations@0.10.9
  - @voyant-travel/db@0.119.2
  - @voyant-travel/cruises@0.226.0

## 0.70.0

### Minor Changes

- d77269c: Build and install relocatable workspace packages for production instead of
  inlining their source.

  The operator Docker image built cleanly and had never booted (voyant#3994). The
  root cause was that `ssr.noExternal: [/^@voyant-travel\//]` inlined workspace
  packages from source into the server bundle. That absorbs their **code** but not
  their **dependencies**, and `pnpm deploy --prod` prunes to what the application
  itself declares — so every external dependency reached only through an inlined
  package became undeclared and unresolvable. 36 were, including
  `@pdf-lib/fontkit`, `@aws-sdk/client-s3`, `@neondatabase/serverless`, `exceljs`
  and `liquidjs`. The image would have failed progressively, one feature at a
  time; booting was simply the first path exercised.

  `voyantStartViteConfig` gains `bundleWorkspaceSource` (default `true`). The
  development server keeps inlining from source, because that is what makes a
  `packages/*/src` edit a member of the Vite module graph and therefore
  hot-reloadable. A build now passes `false`, so `@voyant-travel/*` stay external,
  `pnpm deploy` installs them as real packages, and their own dependency trees
  come with them. Both directions are pinned by tests — only one of them is
  visible in a production failure.

  This also makes the complete production artifact explicit:

  - the workspace dists are built before the app build (~7 minutes, ~80MB, once
    per release), with `NODE_OPTIONS=--max-old-space-size=8192` because `tsc`
    needs more than the default 2GB for the larger packages
  - `scripts/apply-publish-config.mjs` runs after `pnpm deploy`, because
    `pnpm deploy` copies workspace manifests verbatim and does **not** apply
    `publishConfig` — a pack/publish-time transform. Our manifests point
    `exports` at `./src/*.ts` while `files: ["dist"]` means `src/` is never
    shipped, so without it every deployed package references files that do not
    exist. The script performs the same substitution npm consumers already get.
  - generated package references use relocatable bare specifiers when the package
    is a declared production dependency, while transitive selections stay
    project-relative to the location selected through the product BOM and prefer
    built `publishConfig` targets. This preserves strict pnpm nesting without
    capturing absolute build-machine paths; generated link definitions are
    compiled into the server alongside the graph runtime
  - TanStack Start's core virtual-module hosts remain bundled so its Vite plugin
    can replace the `#tanstack-*` imports required by the production server
  - the operator manifest declares the product BOM runtime closure as production
    dependencies, and the image includes an explicit graph-native migration
    command for use before rollout

### Patch Changes

- @voyant-travel/operator-standard@0.18.4

## 0.69.1

### Patch Changes

- @voyant-travel/operator-standard@0.18.1
- @voyant-travel/cruises@0.225.0

## 0.69.0

### Minor Changes

- 0c30250: Make `createStandardOperatorRouteFiles` a pure function of resolved
  deployment-graph data (voyant#3976 item 10.1).

  The standard operator route generator previously hardcoded the presentation
  IDs and route tables for auth, storefront, finance, quotes, and MCP consent, so
  a package could not get admin routes emitted without editing
  `@voyant-travel/operator-standard`. Each presentation now declares its own
  route contribution on its `presentations` graph entry via `contribution` and
  `routes`, and the generator emits from those declarations.

  `VoyantGraphPresentationDeclaration` gains optional `contribution` and `routes`
  fields (`VoyantGraphPresentationRouteDeclaration`), validated in the deployment
  graph: when `routes` is non-empty, `contribution` must be a non-empty string,
  each `route` must start with `/`, and each `member` must be a non-empty string.
  The product BOM now carries the full presentation declarations rather than just
  their IDs. This is a behaviour-preserving refactor — the emitted route-file set
  is byte-identical to before.

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/operator-standard@0.18.0
  - @voyant-travel/cruises@0.224.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/storage@0.115.1

## 0.68.1

### Patch Changes

- cbda0bd: Gate the injected-auth-integration requirement on the `adminAuth` provider
  binding rather than on `deployment.mode`.

  A deployment binding `adminAuth: "voyant-cloud"` needs the integration injected
  wherever it runs, not only under `mode: "managed-cloud"`. `better-auth` is
  self-contained and requires nothing.

  The two Redis rules are unchanged and remain context-gated — they encode
  "shared, untrusted infrastructure", which no provider value expresses.

  - @voyant-travel/operator-standard@0.17.6

## 0.68.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/operator-standard@0.17.4
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/cruises@0.223.0

## 0.67.2

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/cruises@0.222.0
  - @voyant-travel/operator-standard@0.17.1

## 0.67.1

### Patch Changes

- Updated dependencies [90361d6]
  - @voyant-travel/operator-standard@0.17.0
  - @voyant-travel/cruises@0.221.0

## 0.67.0

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/operator-standard@0.16.4
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/cruises@0.220.2

## 0.66.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/cruises@0.220.0
  - @voyant-travel/operator-standard@0.16.2

## 0.65.1

### Patch Changes

- ef80127: Bind durable event delivery to the composed internal subscriber bus without
  making the generic Node host depend on a product package.

## 0.65.0

### Patch Changes

- 8adeb23: Make agent-driven booking create, confirmation, cancellation, passenger capacity, persisted option/unit/extra pricing, invoice reconciliation, approval admission, paid-settlement previews, immediate reads, idempotent lifecycle replay, notification suppression, and required-schema deployment admission coherent.
- fa75fe3: Allow resident Node database clients enough time to reconnect after a suspended
  database wakes, deliver durable outbox events through the composed internal
  subscriber bus, and reconcile obsolete Lakebase vector storage when a
  deployment uses pgvector.
- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/operator-standard@0.16.0
  - @voyant-travel/cruises@0.219.0
  - @voyant-travel/types@0.109.10

## 0.64.24

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/operator-standard@0.15.48
  - @voyant-travel/cruises@0.218.0

## 0.64.23

### Patch Changes

- bc0b223: Cache non-personalized public product catalog responses in shared caches for fifteen minutes, keeping repeated storefront browsing off application and database computes while leaving availability, booking, customer, and payment routes untouched. Publish a new Framework runtime coordinate so managed images can roll this cache policy together with the serverless database idle-connection fix.
  - @voyant-travel/operator-standard@0.15.45

## 0.64.22

### Patch Changes

- @voyant-travel/operator-standard@0.15.42
- @voyant-travel/cruises@0.217.0

## 0.64.21

### Patch Changes

- @voyant-travel/operator-standard@0.15.41
- @voyant-travel/cruises@0.216.0

## 0.64.20

### Patch Changes

- @voyant-travel/operator-standard@0.15.34
- @voyant-travel/cruises@0.215.0

## 0.64.19

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0
  - @voyant-travel/operator-standard@0.15.33

## 0.64.18

### Patch Changes

- 6c76de3: Rename the first-party processor to Voyant Pay while accepting legacy provider identifiers, and add readiness-aware active processor selection to managed payment settings.
  - @voyant-travel/operator-standard@0.15.32
  - @voyant-travel/cruises@0.214.0

## 0.64.17

### Patch Changes

- @voyant-travel/operator-standard@0.15.30
- @voyant-travel/cruises@0.213.0

## 0.64.16

### Patch Changes

- @voyant-travel/operator-standard@0.15.27
- @voyant-travel/cruises@0.212.0

## 0.64.15

### Patch Changes

- @voyant-travel/cruises@0.211.0
- @voyant-travel/operator-standard@0.15.25

## 0.64.14

### Patch Changes

- @voyant-travel/cruises@0.210.0
- @voyant-travel/operator-standard@0.15.22

## 0.64.13

### Patch Changes

- @voyant-travel/operator-standard@0.15.21
- @voyant-travel/cruises@0.209.0

## 0.64.12

### Patch Changes

- @voyant-travel/operator-standard@0.15.18
- @voyant-travel/cruises@0.208.0

## 0.64.11

### Patch Changes

- @voyant-travel/operator-standard@0.15.17
- @voyant-travel/cruises@0.207.0

## 0.64.10

### Patch Changes

- b7c42c0: Share framework runtime ownership and activation attestation across bundled module copies via a frozen Symbol.for facade on globalThis (WeakSet/WeakMap stay closed over), so MCP no longer fail-closes with NOT_FRAMEWORK_OWNED when Vite SSR duplicates the framework package.

## 0.64.9

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/operator-standard@0.15.0
  - @voyant-travel/cruises@0.206.0

## 0.64.8

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/operator-standard@0.14.1
  - @voyant-travel/cruises@0.205.0

## 0.64.7

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/operator-standard@0.14.0
  - @voyant-travel/cruises@0.204.0

## 0.64.6

### Patch Changes

- @voyant-travel/operator-standard@0.13.5
- @voyant-travel/cruises@0.203.0

## 0.64.5

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/cruises@0.202.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/operator-standard@0.13.4

## 0.64.4

### Patch Changes

- Updated dependencies [3201e48]
  - @voyant-travel/operator-standard@0.13.3
  - @voyant-travel/cruises@0.201.0

## 0.64.3

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/action-ledger@0.114.0
  - @voyant-travel/cruises@0.200.1
  - @voyant-travel/operator-standard@0.13.2

## 0.64.2

### Patch Changes

- 5e03ae7: Replace every notification mutation path with required-idempotency durable
  admission, outbox publication, leased worker delivery, and canonical provider
  replay. This major release explicitly supersedes the `0.136.0`
  compatibility surface: request-scoped provider sends, `NotificationProvider.send`,
  `NotificationService` exports, generic direct-send routes, bundled local/Cloud
  provider shims, and optional notification idempotency are no longer supported.
  Provider packages now implement the public durable provider port and its
  non-delivering restart/replay/drift conformance probe. The send action becomes
  available only for the exact selected graph provider that passes that behavioral
  contract.

  Framework graph resolution now treats an absent external provider package as a
  valid disabled state for a conditional action. The action remains unavailable;
  selection, typed-port conformance, and ambiguity checks still apply when a
  provider is present.

  - @voyant-travel/operator-standard@0.13.1
  - @voyant-travel/cruises@0.200.0

## 0.64.1

### Patch Changes

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

- Updated dependencies [952d817]
  - @voyant-travel/operator-standard@0.13.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/cruises@0.199.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/runtime-core@0.6.7

## 0.64.0

### Minor Changes

- 3651ff7: Add fail-closed provider-conditional action availability. An unavailable action
  may name one-valued typed provider ports with explicit `all` or `any` semantics;
  the resolved graph keeps it provisional even for exactly selected provider declarations.
  Malformed, unknown, or ambiguous conditions fail graph validation, while
  missing or unselected providers keep the action out of Tool imports, MCP,
  action-ledger policy, and enumerable runtime lowering. The framework retains
  activation-only Tool loaders privately, instantiates the exact selected provider
  factory, runs the action owner's imported typed-port conformance kit, and only
  then creates a non-forgeable activated runtime view for composition, direct Tool
  registration, action-ledger lowering, and MCP discovery. MCP now accepts only a
  runtime whose object identity was minted by framework lowering, so a fabricated
  structural graph cannot expose a conditional Tool by claiming it is available.
  Framework lowering first takes a detached, deeply immutable metadata snapshot;
  raw and activated runtimes therefore cannot have actions, provider conditions,
  Tool/reference loaders, or provider selections rewritten after minting.
  The MCP graph adapter declares framework 0.64 as a required peer rather than a
  direct runtime dependency. This keeps the package contract explicit without
  introducing a direct framework → operator distribution → MCP → framework
  runtime dependency cycle.

### Patch Changes

- c03ff60: Restore `source_trip_requirement_candidates` as an available handler-owned
  existing-target command backed by a Trips-owned durable sourcing operation and
  fixed wakeable worker.

  The Tool now returns an immutable `{ status: "accepted", operationId,
requirementId, statusTool }` result instead of waiting for provider fan-out and
  returning mutable requirement/candidate rows. The read-only
  `get_trip_requirement_sourcing_operation` Tool and matching tenant-bound HTTP
  route expose pending, retry, completion, and dead-letter outcomes. See
  `docs/migrations/durable-trips-requirement-sourcing.md` for rollout and caller
  guidance.

  The old synchronous `sourceRequirementCandidates`, `reshopRequirement`, and
  `reshopTrip` services, Tools, and HTTP routes are removed. They discarded live
  candidates before an unfenced provider call and cannot safely coexist with the
  durable worker.

  Owned availability-search handlers now participate in the same deterministic
  fan-out as sourced adapters, including owned-only deployments.

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/cruises@0.198.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/operator-standard@0.12.7
  - @voyant-travel/storage@0.113.6

## 0.63.4

### Patch Changes

- 0aead49: Generate starter archives with the current framework, runtime, and standard Operator package releases so new projects avoid stale dependency graphs.
  - @voyant-travel/operator-standard@0.12.5

## 0.63.3

### Patch Changes

- @voyant-travel/operator-standard@0.12.4
- @voyant-travel/cruises@0.197.0

## 0.63.2

### Patch Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.
- Updated dependencies [b07a0a3]
- Updated dependencies [a310395]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/mcp@0.5.1
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/cruises@0.196.0
  - @voyant-travel/operator-standard@0.12.3
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/storage@0.113.5

## 0.63.1

### Patch Changes

- d12672f: Treat omitted action availability as callable once lifecycle, effect-boundary, or
  durability metadata is present, so removing an unavailable marker cannot bypass
  stable-target and tested-durability validation.

## 0.63.0

### Minor Changes

- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.
- a6460e2: Add explicit created-target action metadata and fail closed unless handler-owned
  Tools declare a durable command claim, replay, and canonical result-reference
  contract. Adopt the shared transaction-owning created-command executor for
  Bookings reservations, stop asking MCP callers to invent generated target IDs,
  and fail approval-bearing created commands closed until handler control
  propagation exists.
- 8a4f3cd: Add fail-closed graph availability and tested-durability metadata for execute Tool actions.
  Unavailable actions remain diagnosable in resolved graph metadata while their Tool runtime is
  excluded from action-ledger and MCP lowering. Reclassify Trips pricing as a write and keep it
  unavailable until its provider and persistence stages gain tested durable orchestration.

### Patch Changes

- Updated dependencies [78423d3]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/cruises@0.195.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/mcp@0.5.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-standard@0.12.2
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/storage@0.113.4

## 0.62.8

### Patch Changes

- e9950cf: Advance the managed runtime release train so platform images can include the
  canonical operator webhook administration route without mutating the existing
  0.62.7 image.

## 0.62.7

### Patch Changes

- Updated dependencies [6b1e647]
  - @voyant-travel/operator-standard@0.12.0

## 0.62.6

### Patch Changes

- @voyant-travel/cruises@0.194.0
- @voyant-travel/operator-standard@0.11.11

## 0.62.5

### Patch Changes

- 8ef8b37: Keep live booking travelers authoritative at commit time and let room-based journeys reach their option picker before a quote is priceable.
  - @voyant-travel/operator-standard@0.11.9

## 0.62.4

### Patch Changes

- dd370ca: Add a provider-agnostic, durable catalog product reindex job that walks canonical inventory
  products in bounded pages and rebuilds their projections through the selected indexer runtime.
  Product job hosts now pass concrete deployment bindings to fixed job runtimes.
- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/cruises@0.193.0
  - @voyant-travel/operator-standard@0.11.8

## 0.62.3

### Patch Changes

- 88a89bc: Accept empty streamed product-job requests while rejecting non-empty request bodies with bounded memory use.

## 0.62.2

### Patch Changes

- 373186a: Preserve package-declared setup steps while lowering selected graph units so runtime setup flows receive the selected project contract.

## 0.62.1

### Patch Changes

- Updated dependencies [2c79bef]
  - @voyant-travel/cruises@0.192.0
  - @voyant-travel/operator-standard@0.11.6

## 0.62.0

### Minor Changes

- a668d0d: Add package-declared, bounded scheduling profiles for product jobs. Deployments can select global or per-job profiles without defining handlers, identifiers, payloads, or arbitrary cadences.

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/cruises@0.191.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/mcp@0.4.11
  - @voyant-travel/operator-standard@0.11.4
  - @voyant-travel/storage@0.113.3

## 0.61.2

### Patch Changes

- e68a705: Add processor identity to payment adapter contracts and persist managed payment
  connection ids on finance payment sessions. Payment callbacks now reject
  verified provider/connection mismatches, payment-session provider payload and
  metadata updates merge instead of overwrite, duplicate paid callbacks serialize
  under a row lock, and the public payment-link callback/start-card routes accept
  managed `connectionId` callback forwarding, additive refreshed session
  responses, and non-redirect processor continuations.
  Processor callbacks now compare and adopt identities under the payment-session
  row lock, preserve monotonic session states during concurrent delivery, and
  reject callback-routing metadata and return URLs supplied by public clients.
  Provider-neutral cancel and shipping fields flow through the selected adapter
  contract, with processor return and cancel URLs derived from server-owned
  session and deployment configuration.
  Public payment-session reads can refresh provider status through the selected
  adapter while resending the session's pinned processor identity and preserving
  the same locked monotonic transition rules as callbacks. Persisted, uniquely
  fenced leases bound anonymous status polling, and processor session/payment
  references cannot change after they are first pinned. Card initiation now uses
  a single atomic claim so active or ambiguous attempts cannot create duplicate
  processor payments.
  - @voyant-travel/operator-standard@0.11.3
  - @voyant-travel/cruises@0.191.0

## 0.61.1

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/operator-standard@0.11.2
  - @voyant-travel/cruises@0.190.0

## 0.61.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.
- 9848276: Host package-owned product jobs by default in the standard self-hosted Operator. The Node host consumes the resolved job inventory and fixed runtime handlers, adds authenticated payload-free invocation, schedule recovery, per-job overlap protection, bounded retry, and minimal health state.
- dffbdad: Add package-owned product jobs to the resolved deployment graph. Selected
  modules and plugins can declare fixed scheduled or wakeable jobs with named
  runtime exports, while project config and runtime invocation cannot supply
  arbitrary handlers, payloads, or workflow controls.
- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.
- fafc12e: Add the generated Cloudflare Worker product-job bridge, including fixed trusted
  inventory/invocation routes, Worker lifetime handling, terminal health callbacks,
  and an explicit Cloudflare-versus-managed schedule projection. Align distribution
  recovery with the minimum one-minute hosted scheduler cadence.

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/cruises@0.189.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/operator-standard@0.11.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/types@0.109.9
  - @voyant-travel/mcp@0.4.10
  - @voyant-travel/storage@0.113.2

## 0.60.0

### Minor Changes

- d9ff078: Add the first-party Postgres catalog search provider, its public adapter and
  relevance utilities, snapshot-identified rebuild retries, and the `postgres`
  managed search-provider selection.

### Patch Changes

- @voyant-travel/cruises@0.188.0
- @voyant-travel/operator-standard@0.10.28

## 0.59.0

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

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/cruises@0.187.0
  - @voyant-travel/mcp@0.4.9
  - @voyant-travel/operator-standard@0.10.23
  - @voyant-travel/runtime-core@0.6.6
  - @voyant-travel/workflows@0.122.18
  - @voyant-travel/workflows-orchestrator@0.122.18

## 0.58.1

### Patch Changes

- 406cebb: Add host-owned app webhook signing-key provisioning, confirmation-gated subscriptions, selected external-event durable intake, app-specific worker composition, a resident Node worker lifecycle, and server-authorized replay.
- Updated dependencies [406cebb]
  - @voyant-travel/runtime-core@0.6.5
  - @voyant-travel/operator-standard@0.10.18

## 0.58.0

### Minor Changes

- d8a225c: Add a selectable `gateway` object-storage provider. Managed deployments can now
  resolve their `media`/`documents` stores through the platform asset-storage
  gateway (via the existing `createGatewayStorageProvider`) instead of holding raw
  bucket credentials: both stores talk to `STORAGE_GATEWAY_ENDPOINT` with a
  workspace-scoped `STORAGE_GATEWAY_TOKEN` bearer token, and the gateway brokers
  R2 access scoped to the caller's `<jurisdiction>/<org>` prefix.

  The storage manifest exposes the provider under `selection { role: "storage",
value: "gateway" }`, and the Node runtime provider plan accepts `storage:
"gateway"` (requiring `STORAGE_GATEWAY_ENDPOINT` + `STORAGE_GATEWAY_TOKEN`) and
  maps it to the `object-storage` deployment resource. Self-hosters are
  unaffected — they continue to use `s3-compatible` or the local memory provider,
  with no token.

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/operator-standard@0.10.15

## 0.57.6

### Patch Changes

- @voyant-travel/operator-standard@0.10.13
- @voyant-travel/cruises@0.186.0

## 0.57.5

### Patch Changes

- @voyant-travel/operator-standard@0.10.5
- @voyant-travel/cruises@0.185.0

## 0.57.4

### Patch Changes

- @voyant-travel/cruises@0.184.0
- @voyant-travel/operator-standard@0.10.4

## 0.57.3

### Patch Changes

- @voyant-travel/operator-standard@0.10.3
- @voyant-travel/cruises@0.183.0

## 0.57.2

### Patch Changes

- @voyant-travel/operator-standard@0.10.2
- @voyant-travel/cruises@0.182.0

## 0.57.1

### Patch Changes

- Updated dependencies [05aa1d5]
  - @voyant-travel/operator-standard@0.10.0

## 0.57.0

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/cruises@0.181.1
  - @voyant-travel/mcp@0.4.8
  - @voyant-travel/operator-standard@0.9.15
  - @voyant-travel/workflows@0.122.15
  - @voyant-travel/workflows-orchestrator@0.122.15

## 0.56.3

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/operator-standard@0.9.13

## 0.56.2

### Patch Changes

- @voyant-travel/operator-standard@0.9.12
- @voyant-travel/cruises@0.181.0

## 0.56.1

### Patch Changes

- @voyant-travel/operator-standard@0.9.9
- @voyant-travel/cruises@0.180.0

## 0.56.0

### Minor Changes

- c2ca4a3: Add a Settings → Payments surface where operators browse first-party payment
  processors and connect one (single active provider per org). Introduces the
  payment provider catalog + credential-field schema + registry port and a remote
  adapter transport in `@voyant-travel/payments`, a `payment_provider_config`
  table, service, and `/v1/admin/settings/payments/*` routes in
  `@voyant-travel/operator-settings`, the Payments settings page in
  `@voyant-travel/operator-settings-react`, the `managed` payments provider value
  in the framework deployment graph, and en/ro catalog strings. Self-host
  deployments configure their processor via environment variables (read-only in
  the UI); managed connect brokering lands in a follow-up.

### Patch Changes

- @voyant-travel/operator-standard@0.9.8
- @voyant-travel/db@0.117.1
- @voyant-travel/cruises@0.179.1
- @voyant-travel/workflows@0.122.14
- @voyant-travel/workflows-orchestrator@0.122.14

## 0.55.5

### Patch Changes

- @voyant-travel/operator-standard@0.9.7
- @voyant-travel/cruises@0.179.0
- @voyant-travel/workflows@0.122.13
- @voyant-travel/workflows-orchestrator@0.122.13

## 0.55.4

### Patch Changes

- @voyant-travel/operator-standard@0.9.6
- @voyant-travel/cruises@0.178.0

## 0.55.3

### Patch Changes

- @voyant-travel/operator-standard@0.9.5
- @voyant-travel/cruises@0.177.0
- @voyant-travel/workflows@0.122.12
- @voyant-travel/workflows-orchestrator@0.122.12

## 0.55.2

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/cruises@0.176.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/operator-standard@0.9.4
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11
  - @voyant-travel/workflows-orchestrator@0.122.11

## 0.55.1

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/operator-standard@0.9.2
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/cruises@0.175.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10
  - @voyant-travel/workflows-orchestrator@0.122.10

## 0.55.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/operator-standard@0.9.1
  - @voyant-travel/cruises@0.174.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/mcp@0.4.7
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9
  - @voyant-travel/workflows-orchestrator@0.122.9

## 0.54.0

### Minor Changes

- b8b25b7: Add the composable reporting platform: module-owned semantic datasets and widget presets,
  cross-module full-page templates, persisted editable report drafts, immutable published versions,
  bounded query parsing and execution, source-scope authorization, and standard Operator selection.
  Bookings and Finance now contribute initial operational reporting content.

### Patch Changes

- Updated dependencies [b8b25b7]
- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/operator-standard@0.9.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/cruises@0.173.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/mcp@0.4.6
  - @voyant-travel/storage@0.111.5
  - @voyant-travel/workflows@0.122.8
  - @voyant-travel/workflows-orchestrator@0.122.8

## 0.53.0

### Minor Changes

- 16e2c2c: Mount the isolated customer Better Auth realm in managed Node runtimes while keeping Voyant Cloud as the admin broker. Resolve managed storefront auth configuration asynchronously, use its public API base for OAuth callbacks and password-reset links, and export the standard Voyant Cloud auth email sender for host composition.

### Patch Changes

- @voyant-travel/operator-standard@0.8.2
- @voyant-travel/cruises@0.172.0

## 0.52.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/auth@0.134.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/operator-standard@0.8.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/cruises@0.171.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/mcp@0.4.5
  - @voyant-travel/storage@0.111.4
  - @voyant-travel/runtime-core@0.6.4
  - @voyant-travel/workflows@0.122.7
  - @voyant-travel/workflows-orchestrator@0.122.7

## 0.51.1

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.
- Updated dependencies [1881293]
  - @voyant-travel/auth@0.133.5
  - @voyant-travel/hono@0.129.1
  - @voyant-travel/operator-standard@0.7.11

## 0.51.0

### Minor Changes

- 96c91b9: Compose provider-neutral remote-app OAuth and session exchange from host-owned
  runtime inputs, add exact client-authenticated route posture, and augment app
  access-token resolution without replacing staff authentication.

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/operator-standard@0.7.10
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/auth@0.133.4
  - @voyant-travel/cruises@0.170.1
  - @voyant-travel/mcp@0.4.4
  - @voyant-travel/workflows@0.122.6
  - @voyant-travel/workflows-orchestrator@0.122.6

## 0.50.3

### Patch Changes

- @voyant-travel/operator-standard@0.7.9
- @voyant-travel/cruises@0.170.0

## 0.50.2

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/operator-standard@0.7.8
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/auth@0.133.3
  - @voyant-travel/cruises@0.169.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/mcp@0.4.3
  - @voyant-travel/storage@0.111.3
  - @voyant-travel/workflows@0.122.5
  - @voyant-travel/workflows-orchestrator@0.122.5

## 0.50.1

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/auth@0.133.2
  - @voyant-travel/core@0.126.1
  - @voyant-travel/db@0.114.12
  - @voyant-travel/hono@0.128.5
  - @voyant-travel/operator-standard@0.7.7

## 0.50.0

### Minor Changes

- 698ddb6: Add first-class adapter and provider graph-unit kinds while keeping plugin
  manifests recognized for backward compatibility.

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/auth@0.133.1
  - @voyant-travel/cruises@0.168.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/mcp@0.4.2
  - @voyant-travel/operator-standard@0.7.6
  - @voyant-travel/storage@0.111.2
  - @voyant-travel/workflows@0.122.4
  - @voyant-travel/workflows-orchestrator@0.122.4

## 0.49.4

### Patch Changes

- @voyant-travel/operator-standard@0.7.2
- @voyant-travel/auth@0.133.0
- @voyant-travel/cruises@0.168.0

## 0.49.3

### Patch Changes

- 3a90c27: Publish the first versioned remote App API surface with app-token routing,
  service-boundary installation and scope checks, custom-field owner isolation,
  finance action approval enforcement, webhook/audit self-read endpoints, and
  runtime app-token resolution.
- Updated dependencies [3a90c27]
- Updated dependencies [3a90c27]
  - @voyant-travel/core@0.125.2
  - @voyant-travel/types@0.109.4
  - @voyant-travel/hono@0.128.3
  - @voyant-travel/operator-standard@0.7.1

## 0.49.2

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/operator-standard@0.7.0
  - @voyant-travel/cruises@0.167.0

## 0.49.1

### Patch Changes

- @voyant-travel/operator-standard@0.6.16
- @voyant-travel/cruises@0.166.0

## 0.49.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [926ea47]
  - @voyant-travel/operator-standard@0.6.15
  - @voyant-travel/cruises@0.165.0
  - @voyant-travel/auth@0.132.5
  - @voyant-travel/workflows@0.122.3
  - @voyant-travel/workflows-orchestrator@0.122.3

## 0.48.3

### Patch Changes

- @voyant-travel/cruises@0.164.0
- @voyant-travel/operator-standard@0.6.14

## 0.48.2

### Patch Changes

- 2c863ab: Grant managed-cloud admin sessions explicit access-catalog scopes for admin-only resources such as Team management.
- Updated dependencies [2c863ab]
  - @voyant-travel/auth@0.132.4
  - @voyant-travel/types@0.109.3
  - @voyant-travel/operator-standard@0.6.13

## 0.48.1

### Patch Changes

- 4b6145d: The typesense search provider's deployment requirements now advertise the optional `TYPESENSE_COLLECTION_PREFIX` variable, so requirement-driven env provisioning surfaces it alongside `TYPESENSE_HOST` and `TYPESENSE_API_KEY`.
  - @voyant-travel/operator-standard@0.6.7
  - @voyant-travel/cruises@0.163.0

## 0.48.0

### Minor Changes

- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

- 52352c4: Persist custom-field namespace, owner, lifecycle, and provenance metadata.
  Operator definitions use the reserved `custom` namespace, app operations are
  owner-constrained, platform definitions derive ownership from the selected
  target, and Settings renders non-operator definitions as read-only.

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/operator-standard@0.6.6
  - @voyant-travel/framework-migrations@0.10.0
  - @voyant-travel/cruises@0.162.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/auth@0.132.3
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/mcp@0.4.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/workflows@0.122.2
  - @voyant-travel/workflows-orchestrator@0.122.2

## 0.47.4

### Patch Changes

- de6bd94: Skip TypeScript convention analysis for source-free projects while preserving
  their deterministic generated artifact set.

## 0.47.3

### Patch Changes

- bbfb2f8: Load TypeScript only when project convention source is analyzed so production
  runtime imports do not require the compiler to be installed.

## 0.47.2

### Patch Changes

- b4941e2: Remove TypeScript from framework production dependencies so snapshot-driven runtimes do not require the compiler.

## 0.47.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/operator-standard@0.6.4

## 0.47.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/cruises@0.161.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/mcp@0.4.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/operator-standard@0.6.3
  - @voyant-travel/auth@0.132.1
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/workflows-orchestrator@0.122.0
  - @voyant-travel/db@0.114.8

## 0.46.2

### Patch Changes

- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/operator-standard@0.6.2
  - @voyant-travel/auth@0.132.0
  - @voyant-travel/cruises@0.160.0

## 0.46.1

### Patch Changes

- c9b6144: Add graph-composed, module-owned Tools for navigation preferences and organization setup,
  including exact action policies and owner-scoped project configuration for MCP context wiring.
- Updated dependencies [cabf662]
- Updated dependencies [848b581]
- Updated dependencies [372f4f4]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [0979758]
- Updated dependencies [c9b6144]
- Updated dependencies [0297ef5]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/mcp@0.3.0
  - @voyant-travel/auth@0.131.0
  - @voyant-travel/operator-standard@0.6.1
  - @voyant-travel/cruises@0.159.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/storage@0.110.2
  - @voyant-travel/workflows@0.121.0
  - @voyant-travel/workflows-orchestrator@0.121.0

## 0.46.0

### Minor Changes

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.
- 75494ca: Version the self-host export and starter contracts with exact dependency
  coordinates, deterministic registry install provenance, explicit secret-free
  config validation, and machine-readable migration no-replay/drift policy.
- 9c85101: Compile one canonical event catalog from selected package manifests and expose it through
  generated deployment artifacts, graph runtimes, a package-owned admin API, and an admin event
  reference page. Reject duplicate event type authorities while preserving legitimate emitters,
  and ratchet persistence mutation coverage in the phase-5 authority checker.

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [a98ec27]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/operator-standard@0.6.0
  - @voyant-travel/auth@0.130.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/cruises@0.158.0
  - @voyant-travel/db@0.114.6
  - @voyant-travel/mcp@0.2.6
  - @voyant-travel/storage@0.110.1
  - @voyant-travel/workflows@0.120.4
  - @voyant-travel/workflows-orchestrator@0.120.4

## 0.45.0

### Minor Changes

- 46e7edf: Add the validated resolved-graph export bundle and deterministic self-host
  projection contract, including provider remaps, provisioning diagnostics,
  standard Node starter metadata, and a shared migration-journal lineage.
- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [46e7edf]
- Updated dependencies [73ab096]
  - @voyant-travel/framework-migrations@0.9.0
  - @voyant-travel/auth@0.129.0
  - @voyant-travel/operator-standard@0.5.0
  - @voyant-travel/storage@0.110.0
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/core@0.122.2
  - @voyant-travel/cruises@0.157.0
  - @voyant-travel/db@0.114.5
  - @voyant-travel/mcp@0.2.5
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3
  - @voyant-travel/workflows-orchestrator@0.120.3

## 0.44.4

### Patch Changes

- @voyant-travel/operator-standard@0.4.5
- @voyant-travel/cruises@0.156.0

## 0.44.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/auth@0.128.3
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/runtime-core@0.6.3
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/cruises@0.155.1
  - @voyant-travel/framework-migrations@0.8.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/mcp@0.2.4
  - @voyant-travel/operator-standard@0.4.4
  - @voyant-travel/storage@0.109.4
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2
  - @voyant-travel/workflows-orchestrator@0.120.2

## 0.44.2

### Patch Changes

- @voyant-travel/cruises@0.155.0
- @voyant-travel/operator-standard@0.4.3
- @voyant-travel/db@0.114.3
- @voyant-travel/auth@0.128.2
- @voyant-travel/workflows@0.120.1
- @voyant-travel/workflows-orchestrator@0.120.1

## 0.44.1

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.
- Updated dependencies [d83d237]
  - @voyant-travel/operator-standard@0.4.2

## 0.44.0

### Minor Changes

- df3e4ec: Publish the engine-neutral catalog indexer adapter and provider contracts under
  `./indexer/contract`, including optional admin lifecycle operations. Add the
  framework-neutral `./indexer/conformance` kit for external adapter packages.

  Make `deployment.providers.search` authoritative through the `catalog.indexer`
  runtime port, ship Typesense as the selected first-party provider, support
  explicit project-owned overrides, and remove direct Typesense search and
  maintenance bypasses.

### Patch Changes

- Updated dependencies [df3e4ec]
  - @voyant-travel/cruises@0.154.2
  - @voyant-travel/operator-standard@0.4.1

## 0.43.0

### Minor Changes

- 2cc954a: Make outbound webhook enqueue authority an explicit deployment provider. Standard Operator and managed-cloud deployments select `outboundWebhooks: "postgres"`; projects may instead select `"host"` with an injected `host.deliverEvent`, or `"none"` to omit graph outbound composition. `@voyant-travel/webhook-delivery` now owns provider resolution and the Postgres enqueuer adapter, while generic Runtime no longer calls the concrete Postgres enqueue function. Regenerate graphs so the provider role is present. See [Migrating to Framework 0.42](../docs/migrations/migrating-to-0.42.md#outbound-webhook-enqueue-provider).
- 07a6ee3: Make `deployment.providers.workflows` authoritative for Node workflow execution and Workflow Runs admin ownership. Self-hosted Operators now use the durable Postgres driver and receive package-owned orchestrator migrations; local mode uses the in-memory adapter, `none` omits workflow composition, and Voyant Cloud fails closed when credentials are missing.

  Scheduled one-shot dispatch disables resident scheduler and time-wheel loops and always shuts down its driver. Managed Cloud snapshots must select `voyant-cloud` before this release is deployed.

  See the [Framework 0.42 migration guide](../docs/migrations/migrating-to-0.42.md) for provider, migration, and rollout steps.

### Patch Changes

- 2669577: Start production operator projects through their Vite-built TanStack server
  entry so virtual router imports and the React SSR singleton resolve from the
  generated server graph.
- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.
- Updated dependencies [818ea84]
- Updated dependencies [2cc954a]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/workflows@0.120.0
  - @voyant-travel/operator-standard@0.4.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/runtime-core@0.6.2
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/workflows-orchestrator@0.120.0
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/auth@0.128.1
  - @voyant-travel/cruises@0.154.1
  - @voyant-travel/mcp@0.2.3

## 0.42.0

### Minor Changes

- 318ca57: Require generated runtime units to provide explicit selected IDs and admitted API runtime reference IDs instead of inferring compatibility metadata during runtime lowering.

  See [Migrating Framework to 0.42](https://github.com/voyant-travel/voyant/blob/main/docs/migrations/migrating-to-0.42.md) for required caller and fixture updates.

- 3f6694b: Select the customer Storefront presentation through the deployment graph. Project resolution now emits a selected presentation factory artifact, and the standard Operator emits Storefront routes only when that presentation is selected.

### Patch Changes

- Updated dependencies [4bc540f]
- Updated dependencies [3f6694b]
  - @voyant-travel/auth@0.128.0
  - @voyant-travel/core@0.121.0
  - @voyant-travel/operator-standard@0.3.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/cruises@0.154.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/mcp@0.2.2
  - @voyant-travel/storage@0.109.2
  - @voyant-travel/workflows@0.119.0
  - @voyant-travel/workflows-orchestrator@0.119.0

## 0.41.0

### Minor Changes

- abbb9cd: Remove the duplicate standard Operator scheduled-job catalog. Product schedules now come exclusively from their owning package manifests.
- bef5b7c: Remove retired preset lineage metadata from project authoring and resolved deployment graphs.

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
- Updated dependencies [d4fa159]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/auth@0.127.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/cruises@0.153.0
  - @voyant-travel/mcp@0.2.1
  - @voyant-travel/operator-standard@0.2.3
  - @voyant-travel/runtime-core@0.6.1
  - @voyant-travel/storage@0.109.1
  - @voyant-travel/workflows@0.118.0
  - @voyant-travel/workflows-orchestrator@0.118.0

## 0.40.0

### Minor Changes

- 490d132: Move credential invitations and cloud team management into auth-owned graph
  units, with deployment configuration and email delivery supplied through a
  typed runtime port.
- 490d132: Expose deterministic facet-level upgrade and uninstall consequences, including retained durable data, explicitly released resources, and enforced package `upgradeFrom` compatibility ranges.
- 490d132: Resolve runtime contributors directly from admitted package metadata and remove generated runtime discovery catalogs.
- 490d132: Move selected-graph workflow loading, scheduled-job planning, and lazy API/auth dispatch into the generic Node host surface.
- 047c3f9: Retire migrated package factories from the central lazy composition registry and route their Node host behavior through package-declared runtime ports.
- 490d132: Expose the selected graph and runtime-port providers to package runtime factories, then make MCP compose its graph and tool context without Operator-specific wiring.
- 490d132: Move generated deployment artifact validation and Node provider planning into the reusable framework Node host surface.
- c65b05c: Add the explicit standard Operator product distribution package, move standard
  selection and exact-pinned dependency ownership into it, and resolve selected
  package manifests relative to the distribution under strict pnpm installs.
- 490d132: Add explicit many-valued graph runtime ports and move invoice settlement poller composition into Finance so selected invoicing adapters aggregate deterministically without starter-owned bridges.
- 490d132: Add the graph-native generic Node runtime API and boot generated project and
  deployment artifacts without constructing or reading a managed-profile
  compatibility snapshot.
- 490d132: Add graph-lowered upgrade and uninstall execution contracts with retry-safe rollback state, explicit resource cleanup, and versioned emitted-event payload schema compatibility validation.
- 047c3f9: Release the generic Node operator host and minimal project authoring surface, with standard product
  BOM expansion, convention-driven project runtime adapters, and an independently bootable starter.
- 490d132: Move Commerce, Catalog, Finance, Legal, and Storage runtime authority out of the
  resident Node compatibility provider container. Compose selected routes through
  package graph factories and typed runtime ports, and resolve Catalog and Finance
  MCP services through package-owned tool-context contributions.
- 490d132: Boot packaged Operator projects with the statically selected package runtime contributors and reusable generic Node host primitives instead of fail-on-use runtime port stubs.
- 490d132: Delete the framework-owned compatibility composition catalog. Standard modules and extensions now compose exclusively from admitted package manifests and the generated graph runtime, including local `src/extensions/*/index.ts` conventions. Keep `createVoyantApp` as generic explicit Hono composition machinery, remove the Operator bindings registry, and generate framework OpenAPI from graph-owned factories. This cutover preserves the SmartBill `^0.140.0` package runtime and typed host-port integration from the governance rollup.
- 490d132: Remove the framework's snapshot-era profile, managed runtime, managed jobs, profile-to-graph conversion, and dynamic profile composition exports. Graph projects and the generic Node runtime are now the only framework deployment authority; generic deployment mode and provider validation remain supported.
- 490d132: Govern tool, action, MCP, and outbound webhook eligibility from selected graph declarations and emit inspectable project manifests.
- 047c3f9: Add versioned standard product BOM provenance, inspectable expansion artifacts, and the minimal Node starter contract. Replace the final SmartBill package-ID bridge with its typed Node host port and package-owned runtime, subscribers, and settlement pollers.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Allow disjoint selected API bundles to contribute to one package-owned OpenAPI document and move the Bookings admin and public surfaces onto that authority.
- c65b05c: Bound generated composition types by using one runtime-contributor host contract and pairing the selected-admin ESM artifact with a declaration facade.
- c65b05c: Move the process-owned Node database lifecycle API into the generic database runtime so deployment hosts do not need local facades.
- 490d132: Move standard Node runtime construction for Flights, Notifications, and Quotes proposal wiring into their domain packages.
- c65b05c: Expose graph-derived Google Cloud Scheduler provisioning as a framework API so
  Node projects and the external CLI do not need project-owned scheduler scripts.
- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Select package-owned Node workflow services through additive graph runtime contributors instead of composing Catalog, Cruises, and DB services in the Operator starter. Notifications keeps its existing package graph bootstrap.
- c65b05c: Move the complete graph-native Node application host into runtime,
  including generated graph admission, local and managed auth, API/admin serving,
  workflow services and schedules, outbound delivery, links, and runtime ports.
  Move the generic Postgres webhook enqueue boundary out of Distribution and into
  the neutral webhook-delivery package.
- c65b05c: Discover application public API routes from the generated starter's
  `src/api/public` convention and validate that a new starter can build and run a
  route authored there.
- 490d132: Remove the retired framework runtime-manifest, extension-ownership, capability,
  and synthetic manifest projections. Standard product selection remains owned by
  the graph-native Operator distribution and package `./voyant` manifests.
- c65b05c: Resolve graph-relative runtime entries from their generated runtime directory
  when composing an admitted project in memory, and refresh Finance OpenAPI
  artifacts with their package-owned API identifiers.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Allow generated Node boot probes to validate arbitrary package-owned runtime ports through generic fail-on-use stubs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- c65b05c: Generate standard Operator TypeScript, environment, Vite, and Vitest metadata beneath `.voyant` instead of shipping copied starter configuration.
- 490d132: Move standard Node contract document variables, generation, and subscriber provider composition into the Legal domain package.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move Operator Settings and Relationships admin presentation authority into selected package graph factories.
- 490d132: Publish package-owned OpenAPI registries and graph document declarations for storage, realtime, and public document delivery APIs, with exact operation ownership for overlapping route mounts.
- 490d132: Move charter/cruise route activation and travel/infrastructure scheduled work
  to graph-selected package manifests. Distribution, Cruises, and DB now publish
  their scheduled workflow implementations, while Workflow Runs owns generic
  schedule dispatch and the Operator supplies only Node runtime dependencies.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- 490d132: Declare that the standard Node starter has no default plugins so external integrations such as SmartBill are admitted only when a project selects them explicitly.
- cda53b6: Preserve legacy migration and route behavior in the unified Node host, align generated admin assets with their graph artifacts, restore auth email and media compatibility, and publish the selected-graph OpenAPI entry.
- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.
- 490d132: Provide validated subscription mutations, durable projected webhook enqueue, restart-safe payload storage, and one claim-driven signed, retrying, audited delivery worker.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Make selected package API facets the exclusive OpenAPI document authority and reject unclaimed or duplicate operations.
- 490d132: Move Storefront OpenAPI authority into the package and require exact operation ownership for root-mounted graph bundles.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [1f6effe]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [c65b05c]
  - @voyant-travel/auth@0.126.0
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/cruises@0.152.0
  - @voyant-travel/storage@0.109.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/mcp@0.2.0
  - @voyant-travel/operator-standard@0.2.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/framework-migrations@0.8.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/runtime-core@0.6.0
  - @voyant-travel/workflows@0.117.0
  - @voyant-travel/workflows-orchestrator@0.117.0

## 0.39.0

### Minor Changes

- d771be3: Activate Notifications reminder and booking-confirmation subscribers through the selected Operator graph and a typed Node host runtime port.
- d771be3: Activate the package-owned catalog checkout subscribers and workflow runner through selected-graph runtime ports, with explicit composition failure when required Node host services are missing.
- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- d771be3: Expose package-scoped project config through the generic graph runtime factory
  context and reuse one typed context across each selected unit's API and
  subscriber facets.
- d26a820: Lower package-owned admin factories from the selected deployment graph into a
  dedicated generated admin bundle, beginning with the action-ledger nav, route,
  lazy page surface, localized Operator label, and standard icon. Selected admin
  factories compose in stable graph-declared order.
- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.
- bd7a830: Emit selected-graph OpenAPI documents from route-owned metadata, beginning with
  the identity admin API authority.
- 263fb4d: Activate Storefront booking-bootstrap write intents through the package-owned selected-graph subscriber runtime and generic Node database lifecycle capability.

### Patch Changes

- 60b1970: Activate the package-owned booking-schedule subscriber through selected graph lowering and shared host-provided runtime capabilities.
- 8f537b0: Lower package-owned ordinary subscriber runtime descriptors from the selected deployment graph and move distribution channel-push subscribers out of the Operator hand list.
- 0a7eab6: Move Trips payment completion to its package-owned graph subscriber runtime and publish the descriptor subpath.
- Updated dependencies [d771be3]
- Updated dependencies [c54cd3d]
- Updated dependencies [0c19298]
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [d771be3]
- Updated dependencies [18d8aa0]
- Updated dependencies [9b15ebe]
- Updated dependencies [d771be3]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [d771be3]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [a799a34]
- Updated dependencies [02b4103]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
- Updated dependencies [0a7eab6]
- Updated dependencies [263fb4d]
- Updated dependencies [d771be3]
  - @voyant-travel/notifications@0.124.0
  - @voyant-travel/mice@0.8.0
  - @voyant-travel/quotes@0.127.0
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/commerce@0.34.0
  - @voyant-travel/distribution@0.142.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/flights@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/inventory@0.8.6
  - @voyant-travel/accommodations@0.112.5
  - @voyant-travel/storefront@0.154.0
  - @voyant-travel/legal@0.152.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/relationships@0.124.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/auth@0.125.0
  - @voyant-travel/identity@0.152.0
  - @voyant-travel/trips@0.143.0
  - @voyant-travel/cruises@0.151.0
  - @voyant-travel/operations@0.6.5
  - @voyant-travel/db@0.112.2
  - @voyant-travel/operator-settings@0.3.5
  - @voyant-travel/storage@0.108.1
  - @voyant-travel/mcp@0.1.1
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/workflows@0.116.0
  - @voyant-travel/workflows-orchestrator@0.116.0

## 0.38.0

### Minor Changes

- 062db9d: Make the standard Operator distribution the selection authority and derive the legacy runtime, extension ownership, capability, and managed-profile catalogs from it. Verify every standard selection against its package-owned `./voyant` manifest.
- c66f9a5: Add package-owned typed runtime factories and deployment port binding, then migrate storage and realtime away from Operator package-id bindings.

### Patch Changes

- daecf67: Lower deployment migration sources directly from selected package manifests.
- 3f5000a: Load graph workflow exports through facet-specific lazy loaders and emit a dedicated workflow-only runtime artifact without exposing API or module imports to workflow bundles.
- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [62b68aa]
- Updated dependencies [2ec05ae]
- Updated dependencies [1081483]
- Updated dependencies [6e3ec4e]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/distribution@0.141.5
  - @voyant-travel/inventory@0.8.5
  - @voyant-travel/notifications@0.123.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/storage@0.108.0
  - @voyant-travel/accommodations@0.112.4
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/commerce@0.33.5
  - @voyant-travel/cruises@0.150.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/flights@0.151.4
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/identity@0.151.4
  - @voyant-travel/legal@0.151.4
  - @voyant-travel/mice@0.7.4
  - @voyant-travel/operations@0.6.4
  - @voyant-travel/operator-settings@0.3.4
  - @voyant-travel/quotes@0.126.4
  - @voyant-travel/relationships@0.123.4
  - @voyant-travel/storefront@0.153.4
  - @voyant-travel/trips@0.142.4
  - @voyant-travel/runtime-core@0.5.2
  - @voyant-travel/workflows@0.115.2
  - @voyant-travel/workflows-orchestrator@0.115.2

## 0.37.0

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/accommodations@0.112.3
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/auth@0.124.2
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/commerce@0.33.4
  - @voyant-travel/cruises@0.150.3
  - @voyant-travel/distribution@0.141.4
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/flights@0.151.3
  - @voyant-travel/identity@0.151.3
  - @voyant-travel/inventory@0.8.4
  - @voyant-travel/legal@0.151.3
  - @voyant-travel/mice@0.7.3
  - @voyant-travel/notifications@0.123.4
  - @voyant-travel/operations@0.6.3
  - @voyant-travel/operator-settings@0.3.3
  - @voyant-travel/quotes@0.126.3
  - @voyant-travel/relationships@0.123.3
  - @voyant-travel/storefront@0.153.3
  - @voyant-travel/trips@0.142.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1
  - @voyant-travel/workflows-orchestrator@0.115.1

## 0.36.2

### Patch Changes

- 625f3db: Add a public, target-neutral writer and staleness checker for resolved project artifacts under `.voyant`.
- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/accommodations@0.112.2
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/commerce@0.33.3
  - @voyant-travel/cruises@0.150.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/distribution@0.141.3
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/flights@0.151.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/identity@0.151.2
  - @voyant-travel/inventory@0.8.3
  - @voyant-travel/legal@0.151.2
  - @voyant-travel/mice@0.7.2
  - @voyant-travel/notifications@0.123.3
  - @voyant-travel/operations@0.6.2
  - @voyant-travel/operator-settings@0.3.2
  - @voyant-travel/quotes@0.126.2
  - @voyant-travel/relationships@0.123.2
  - @voyant-travel/storage@0.107.2
  - @voyant-travel/storefront@0.153.2
  - @voyant-travel/trips@0.142.2
  - @voyant-travel/workflows-orchestrator@0.115.0

## 0.36.1

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/workflows-orchestrator@0.114.0
  - @voyant-travel/bookings@0.151.2
  - @voyant-travel/commerce@0.33.2
  - @voyant-travel/distribution@0.141.2
  - @voyant-travel/hono@0.123.1
  - @voyant-travel/inventory@0.8.2
  - @voyant-travel/notifications@0.123.2

## 0.36.0

### Minor Changes

- 2f403d1: Resolve project subscribers and links into graph facets and explicit generated runtime artifacts.
- 8ee3a45: Resolve project workflows and scheduled jobs into graph facets, provisioning metadata, and explicit generated runtime definitions.
- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- 965cc84: Add the framework-owned standard Operator distribution declaration and resolver-facing defaults for modules, extensions, and external plugins.
- 953e418: Add the application-local API route authoring contract, method-aware graph metadata, and build-time convention compiler.
- 7e969cc: Add the public import-cheap `defineConfig` project authoring helper, which expands the standard Operator distribution before returning an explicit resolver-ready project.
- 1092bf9: Activate index-only application modules from `src/modules` during project resolution and lower their generated runtime imports to project-relative source files.
- 2153e48: Add unit-level graph runtime references for single-entry application modules and extensions while retaining route runtime fallback.
- 2680d96: Add the build-time compiler and deterministic static artifacts for application-local subscriber descriptors and link definitions.
- 9563ade: Add build-time project workflow and job convention analysis with deterministic static registry generation.
- 1abde76: Compile project API and admin source conventions into the resolved deployment graph and disposable project artifacts.

### Patch Changes

- 3dce1bc: Compile app-local admin conventions into a deterministic, type-checked client module.
- 70691c2: Add build-time discovery for source-backed project conventions.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/accommodations@0.112.1
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/commerce@0.33.1
  - @voyant-travel/cruises@0.150.1
  - @voyant-travel/distribution@0.141.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/inventory@0.8.1
  - @voyant-travel/mice@0.7.1
  - @voyant-travel/quotes@0.126.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/flights@0.151.1
  - @voyant-travel/identity@0.151.1
  - @voyant-travel/legal@0.151.1
  - @voyant-travel/notifications@0.123.1
  - @voyant-travel/operations@0.6.1
  - @voyant-travel/operator-settings@0.3.1
  - @voyant-travel/relationships@0.123.1
  - @voyant-travel/storage@0.107.1
  - @voyant-travel/storefront@0.153.1
  - @voyant-travel/trips@0.142.1
  - @voyant-travel/workflows-orchestrator@0.113.0

## 0.35.0

### Minor Changes

- a370024: Lower selected deployment graph API runtime references into deterministic lazy package module and plugin loaders for generated runtime artifacts.
- a370024: Replace synthetic standard operator ownership keys with canonical package modules and extensions.

  Keep provider-wired runtime compatibility factories while deployment graphs select package-owned
  catalog, content, storage, storefront, legal, workflow, and vertical units directly.

- a370024: Accept package, package-subpath, and local-path project selections, retain
  serializable selection config and provenance, and replace admitted selections
  with package-owned `./voyant` manifests.
- e3dc5a9: Generate executable Node schema and setup migration plans with idempotency ledgers, and run the finance voucher backfill through its package-owned setup migration reference.
- e3dc5a9: Add the import-cheap project deployment authoring contract and framework-owned
  project resolver with deterministic target-neutral graph, runtime, and migration
  artifacts for CLI lifecycle commands.
- e3dc5a9: Lower every admitted package-owned runtime reference into the generated Node
  runtime and expose lazy typed loading by stable graph reference ID.
- e3dc5a9: Emit deterministic graph action metadata and selected binding ids in generated runtimes, expose validated lowering into the action-ledger capability registry, and instantiate that registry in managed and operator runtimes.
- e3dc5a9: Expose graph-selected tools and access scopes through the generated Node runtime, validate tool scope and export metadata before registration, and use the same graph-derived registry in self-hosted and managed MCP transports.
- e3dc5a9: Register graph-selected outbound webhook events in Node runtimes and enqueue enabled subscriptions as redacted, idempotent pending delivery records without claiming HTTP delivery or retry support.
- e3dc5a9: Load package-owned workflow and subscriber runtime references from the selected Node deployment graph, and move the commerce promotion reindex workflow and event filter out of framework-owned catalogs.
- a370024: Add an ID-bound graph runtime composition adapter for generated package loaders and deployment-local runtime overrides.
- a370024: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.
- e3dc5a9: Promote package-owned config, secrets, resources, providers, access, admin, tools, webhooks, actions, setup migrations, and lifecycle metadata into the deployment graph contract.
- e3dc5a9: Add explicit deployment provider selection and lazy, redacted graph provider resolution, with the Node Postgres database provider as the first end-to-end declaration and factory.
- e3dc5a9: Derive the bookings graph action manifest and canonical action-ledger registry
  from one package-owned declaration source, preserving persisted capability
  identity, established graph action names, and policy metadata with an end-to-end
  parity test.
- e3dc5a9: Carry graph config, secret, resource, and provider declarations into generated
  Node runtimes, resolve and validate project/deployment values before managed
  boot, and expose redacted secret accessors plus lazy admitted provider loaders.
- e3dc5a9: Compile selected graph webhook declarations into generated deployment/runtime plans, validate typed inbound API and outbound event references, enforce inbound route posture, and expose outbound webhook event eligibility at runtime.

### Patch Changes

- e3dc5a9: Admit and validate the complete Node runtime-reference package closure before generating project importers.
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/commerce@0.33.0
  - @voyant-travel/inventory@0.8.0
  - @voyant-travel/legal@0.151.0
  - @voyant-travel/storefront@0.153.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/distribution@0.141.0
  - @voyant-travel/mice@0.7.0
  - @voyant-travel/quotes@0.126.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/flights@0.151.0
  - @voyant-travel/accommodations@0.112.0
  - @voyant-travel/cruises@0.150.0
  - @voyant-travel/notifications@0.123.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/trips@0.142.0
  - @voyant-travel/relationships@0.123.0
  - @voyant-travel/operations@0.6.0
  - @voyant-travel/identity@0.151.0
  - @voyant-travel/operator-settings@0.3.0
  - @voyant-travel/storage@0.107.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/auth@0.124.1
  - @voyant-travel/types@0.107.2
  - @voyant-travel/runtime-core@0.5.1
  - @voyant-travel/workflows@0.112.0
  - @voyant-travel/workflows-orchestrator@0.112.0

## 0.34.0

### Minor Changes

- 496f2ef: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/accommodations@0.111.6
  - @voyant-travel/commerce@0.32.0
  - @voyant-travel/cruises@0.149.0
  - @voyant-travel/distribution@0.140.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/legal@0.150.0
  - @voyant-travel/notifications@0.122.2
  - @voyant-travel/storefront@0.152.0
  - @voyant-travel/trips@0.141.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/identity@0.150.0
  - @voyant-travel/inventory@0.7.11
  - @voyant-travel/mice@0.6.10
  - @voyant-travel/operations@0.5.23
  - @voyant-travel/quotes@0.125.9
  - @voyant-travel/relationships@0.122.12
  - @voyant-travel/flights@0.150.0
  - @voyant-travel/operator-settings@0.2.35

## 0.33.0

### Minor Changes

- f0e8e5c: Add typed provider port declarations, conformance kits, and deployment graph validation for required ports.

### Patch Changes

- e2d6bfe: Respect lower-bound framework compatibility ranges such as `>=0.26.0` when resolving deployment graphs.

## 0.32.0

### Minor Changes

- 5786b55: Validate graph-declared Postgres, Redis, and HTTP endpoint environment values before managed runtime boot.

## 0.31.0

### Minor Changes

- ea82216: Allow graph resource requirements to declare compatible environment aliases, including `DATABASE_URL_DIRECT` for Postgres runtime validation.
- d19cd34: Allow managed runtime entries to apply graph-resolved deployment mode and provider bindings instead of snapshot compatibility values.

## 0.30.0

### Minor Changes

- 560155a: Derive deployment graph resource requirements from declared standard providers.
- 03ccb9c: Allow managed runtime startup to validate requirements supplied by a resolved deployment graph.

## 0.29.5

### Patch Changes

- ec36232: Resolve public document delivery provenance to the package that ships it and
  make generated managed runtime entries validate graph artifacts before importing
  the managed runtime package.
- 682d7d0: Publish `voyant.package.v1` compatibility metadata from graph substrate packages
  and allow package metadata records to distinguish framework and library packages
  from selectable modules and plugins.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/accommodations@0.111.5
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/commerce@0.31.1
  - @voyant-travel/cruises@0.148.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/distribution@0.139.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/flights@0.149.1
  - @voyant-travel/identity@0.149.1
  - @voyant-travel/inventory@0.7.10
  - @voyant-travel/legal@0.149.1
  - @voyant-travel/mice@0.6.9
  - @voyant-travel/notifications@0.122.1
  - @voyant-travel/operations@0.5.22
  - @voyant-travel/operator-settings@0.2.34
  - @voyant-travel/quotes@0.125.8
  - @voyant-travel/relationships@0.122.11
  - @voyant-travel/storefront@0.151.1
  - @voyant-travel/trips@0.140.1
  - @voyant-travel/hono@0.122.2
  - @voyant-travel/workflows@0.111.19
  - @voyant-travel/workflows-orchestrator@0.111.19

## 0.29.4

### Patch Changes

- d23fa74: Add package-backed migration source metadata to deployment artifact manifests so
  deployment graph artifact consumers can validate the schema-manifest migration
  closure against graph package records.

## 0.29.3

### Patch Changes

- 74a0b2f: Carry workflow schedule dispatch metadata through deployment graph scheduled jobs.
- cc4e55e: Project cron-backed workflow schedules into deployment graph provisioning metadata.

## 0.29.2

### Patch Changes

- f6ff1a9: Make resolved deployment graph module and plugin ordering deterministic.

## 0.29.1

### Patch Changes

- 67f7a84: Validate deployment graph API route bundle metadata and required scope syntax.

## 0.29.0

### Minor Changes

- 0049ba7: Expose graph-derived scheduled-job provisioning metadata on resolved deployment graphs.

## 0.28.1

### Patch Changes

- e232b21: Support stable schedule-id dispatch for scheduled Node runtime hooks.
- Updated dependencies [e232b21]
  - @voyant-travel/runtime-core@0.5.0

## 0.28.0

### Minor Changes

- 4d70808: Lower workflow schedule descriptors into deployment graph workflow facets.

## 0.27.0

### Minor Changes

- 410afa7: Add deployment graph doctor diagnostics for generated artifacts and lower first-party workflow event-filter metadata into resolved graph facets.

## 0.26.1

### Patch Changes

- 0a4beea: Expose graph resource requirements from resolved deployment graphs.

## 0.26.0

### Minor Changes

- 57d3e71: Add deployment graph artifact helpers for deterministic resolved graph JSON,
  artifact manifests, and managed Node runtime entry generation.

## 0.25.0

### Minor Changes

- fd5c97d: Add the `@voyant-travel/framework/deployment-graph` subpath with v1 graph declarations, resolver diagnostics, managed-profile graph bridging, deterministic graph hashing, and an author test harness.

## 0.24.1

### Patch Changes

- 60a4bcd: Mount managed `customSource` modules/extensions at runtime (voyant#3079,
  follow-up to #3069).

  `framework@0.22.0` derived `customSource.modules` into migration sources, so a
  bring-your-own schema-owning module's tables migrated in a managed deployment —
  but the managed runtime never wired `customSource`, so those modules' API routes
  404'd and their admin extensions never composed.

  `loadManagedProfileRuntime` now resolves each `customSource.modules` and
  `customSource.extensions` specifier — the analog of `resolveManagedPlugins` for
  schema-owning modules — and merges the resulting factories into
  `createManagedProfileApp` → `createVoyantApp`'s `modules`/`extensions` channel,
  so routes mount and admin extensions compose against the deployment's installed
  dependency tree. A declared-but-unresolved `customSource` entry fails loud at
  boot, mirroring the existing `plugins` check. New `resolveManagedCustomModules`
  / `resolveManagedCustomExtensions` APIs are exported, with an injectable
  `importCustomSourceModule` loader for pre-bundled registries and tests.

## 0.24.0

### Minor Changes

- 954fbbb: Make demo-backed standard families optional so a deployment never has to wire (or
  install a data source for) a family it doesn't run.

  `FrameworkProviders.loadFlightAdminRoutes` is now **optional**. When it isn't
  provided, `createVoyantApp` auto-excludes `@voyant-travel/flights` (no routes, no
  admin nav) via the ADR-0007 subsetting path — "not wired" is treated as "not run"
  — instead of forcing the deployment to stub it. The flights family has no
  first-party real connector yet (only the demo adapter), so an operator that
  doesn't sell flights should not need one.

  The mechanism is a small `OPTIONAL_FAMILY_LOADERS` map (specifier → the
  `FrameworkProviders` field that mounts it) plus the exported
  `optionalFamiliesToExclude(providers)` helper; more families can opt in as they
  gain deployment-injected, optional loaders. Deployments that DO provide the loader
  (the operator starter, the managed runtime) are unaffected.

## 0.23.1

### Patch Changes

- c5d4b20: Harden the managed custom-module migration path (voyant#3069 follow-ups).

  - `loadModuleBundleSource` now resolves ESM-only ("import"-only `exports`)
    packages. `require.resolve` applies the CommonJS `require` condition and throws
    `ERR_PACKAGE_PATH_NOT_EXPORTED` for import-only packages (the repo's publish
    shape), which silently skipped a schema-owning package's committed
    `migrations/`. It now falls back to a `node_modules` package-root walk that
    ignores export conditions when `require.resolve` rejects.
  - `customSource` is now validated: `validateVoyantProject` rejects a non-object
    `customSource` or a non-string-array `customSource.modules`/`.extensions`, and
    `getVoyantProjectMigrationMetadata` defensively coerces the value before
    deriving migration sources — so a malformed snapshot (e.g. a string instead of
    an array) no longer yields one "package" per character.

## 0.23.0

### Minor Changes

- 4720352: Module subsetting: cascade standard-extension exclusion from declared ownership
  (voyant#2104, ADR-0007 follow-up a).

  Excluding a standard module now drops the extensions it owns in the **core**
  `subsetStandardManifest` primitive, not only in the managed-profile wrapper.
  Previously a direct `createVoyantApp({ exclude })` caller (self-host, tooling,
  tests) could drop a module while an augmenting extension stayed mounted on the
  now-absent surface — e.g. removing `bookings` while
  `@voyant-travel/finance/bookings-create-extension` (mounting under
  `/v1/admin/bookings`) leaked.

  - `FRAMEWORK_EXTENSION_OWNERSHIP` — declares which standard module(s) each
    standard extension augments, co-located with `FRAMEWORK_RUNTIME_MANIFEST` /
    `FRAMEWORK_CAPABILITY_GRAPH` and typed against them so it cannot drift. An
    extension's mount prefix is a path, not a foreign key to a module `name`, so
    path-mounted extensions with no same-named module (e.g.
    `operator/proposal-extension` under `quote-versions`) cascade by declaration
    rather than an unsound name-match.
  - `ownedExtensionsForExcludedModules(excluded)` — the shared, exported cascade
    helper. `subsetStandardManifest` and the managed-profile exclude computation
    now use the single source of truth (the hand-maintained ownership map
    previously duplicated in `profile.ts` is removed).

  The pure subset math (`subsetStandardManifest`, `ownedExtensionsForExcludedModules`,
  `FRAMEWORK_EXTENSION_OWNERSHIP`) lives in `manifest.js`, so the lightweight
  `@voyant-travel/framework/profile` subpath no longer transitively imports the
  runtime composition graph (`create-app.js` → `composition-lazy.js` → `@hono/zod-openapi`).
  Snapshot/requirements math stays free of runtime bundle weight.

  Schema stays whole: subsetting gates runtime + admin surfaces only; the standard
  migration bundle is unchanged (an unselected module's tables are migrated but
  inert). This keeps the fixed-operator and subset paths on the same single-bundle
  managed-migration model.

## 0.22.0

### Minor Changes

- b9f3608: Give source-free managed images a migration path for custom schema-owning
  modules (voyant#3069, Option 1 — modules ship pre-built migrations).

  A managed image runs migrations with no drizzle-kit generation, so a custom
  "bring-your-own" module that owns schema previously had no way to create its
  tables. It now does, following the same per-package `migrations/` convention
  standard packages already use.

  `@voyant-travel/framework-migrations`:

  - `loadModuleBundleSource(packageName, { priority, resolveFrom })` — resolve a
    module package's committed `migrations/` folder by name into a
    `MigrationSource`, or `null` when it ships none (schema-less modules/plugins
    are skipped). Ledger source name is the unscoped package name, stable across
    source and managed modes.
  - `collectManagedMigrationSources({ modulePackages, resolveFrom })` — the
    managed migration path: `[framework, ...customModules]` deps-first, ready for
    `runDeploymentMigrations`.

  `@voyant-travel/framework`:

  - `getVoyantProjectMigrationMetadata(project)` now returns
    `moduleSources: { packageName, priority }[]` derived from the snapshot's
    `customSource.modules`, so the platform migrate booter enumerates the custom
    schema-owning packages to apply after the framework bundle. Adds the
    `VoyantProfileModuleMigrationSource` type.

## 0.21.0

### Minor Changes

- 73f67b1: Export the standard profile's scheduled-jobs and workflow manifests from the
  framework so Voyant Cloud can provision managed deployments with no build
  (voyant#3032).

  Managed-profile deployments run a fixed `voyant-runtime:<framework-version>`
  image with no build step, so Cloud needs both the Cloud Scheduler job set and the
  workflow release manifest derivable purely from a profile snapshot. Both were
  reachable only from `apps/operator` (the cron list) or a build artifact (the
  workflow manifest).

  New subpath `@voyant-travel/framework/managed-jobs`:

  - `getManagedProfileScheduledJobs(project)` — the cron jobs to create for a
    snapshot, each `{ id, cron, description, route, module }`, gated by the
    resolved module subset (always-on framework infra like `outbox-drain` plus one
    job per active owning module — e.g. dropping `@voyant-travel/distribution`
    drops the `channel-push-*` jobs). Every job POSTs `SCHEDULED_JOB_ROUTE`
    (`/__voyant/scheduled?cron=<expr>`).
  - `getManagedProfileWorkflowManifest(project)` — the profile's workflow
    definitions at `{ id, config }` grain (voyant#2925), for active modules only.
  - `getManagedProfileEventFilters(project)` — the `event → workflow` routing
    bindings for active modules, registered alongside the workflows (a workflow
    registered without its event filter never fires on the events meant to
    trigger it).
  - `STANDARD_OPERATOR_SCHEDULED_JOBS` — the full all-modules set.

  The `operator` starter now derives `OPERATOR_CRON_JOBS` (and its cron dispatch
  constants) from `STANDARD_OPERATOR_SCHEDULED_JOBS` instead of a hand-maintained
  list, appending only its deployment-local `external-cruise-catalog-refresh`
  (`@voyant-travel/cruises` is not a standard framework module) — so the operator
  and a source-free managed deployment provision the same jobs from one source.

## 0.20.0

### Minor Changes

- a97e845: Expose the managed profile's active module set at runtime so the source-free
  admin can gate its composition by the deployment's module subset (voyant#3063).

  The managed runtime already honors a profile's `modules: [...]` subset for the
  API (`createVoyantApp({ exclude })`), but the shared, framework-version-tagged
  admin image composed _every_ `create<Module>AdminExtension()` factory
  unconditionally — so every managed operator saw the full nav even when its
  profile activated a subset, with nav entries linking to pages whose API isn't
  mounted (dead links / 404s).

  `@voyant-travel/framework`:

  - Add `resolveActiveModuleIds(project)` (`/profile`) — the resolved module `include`
    set (the same one that drives `createVoyantApp({ exclude })`) as `moduleId`s.
  - `GET /auth/bootstrap-status` now returns `modules` on `ManagedBootstrapStatus`,
    so the workspace bootstrap probe learns what's active for this deployment.

  `@voyant-travel/admin`:

  - `AdminBootstrapStatus` carries an optional `modules` module-id list the
    source-free admin filters its nav/widget composition by (fail-open when
    absent).
  - `AdminWorkspaceShell` accepts `activeModuleIds`; when provided, the packaged
    **base** nav is gated to those modules (`filterAdminNavigationByModules` /
    `OPERATOR_ADMIN_NAV_MODULE_IDS`), so a shared image's static nav (Flights,
    Finance, Legal, …) is hidden for a profile subset — not just
    extension-contributed items. Fail-open when omitted, so self-hosted starters
    are unaffected.

### Patch Changes

- @voyant-travel/auth@0.124.0
- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0
- @voyant-travel/cruises@0.148.0
- @voyant-travel/distribution@0.139.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/flights@0.149.0
- @voyant-travel/identity@0.149.0
- @voyant-travel/legal@0.149.0
- @voyant-travel/notifications@0.122.0
- @voyant-travel/trips@0.140.0
- @voyant-travel/accommodations@0.111.4
- @voyant-travel/commerce@0.31.0
- @voyant-travel/storefront@0.151.0
- @voyant-travel/inventory@0.7.9
- @voyant-travel/operations@0.5.21
- @voyant-travel/operator-settings@0.2.33
- @voyant-travel/relationships@0.122.10
- @voyant-travel/quotes@0.125.7

## 0.19.0

### Minor Changes

- efebfb1: Expose the admin-session auth endpoints on the managed profile runtime so a
  source-free managed admin host can resolve its current user and bootstrap
  status from the managed API in one process (voyant#3044, on the #2987 runtime).

  `createManagedCloudAuthApp` now serves `GET /auth/me` (the current staff user,
  or 401) and `GET /auth/bootstrap-status` (`{ hasUsers, authMode }`) — the
  endpoints the packaged admin's `ManagedProfileAdminAuthRuntime` port fetches.
  They mirror the operator starter's `getCurrentUserForRequest` /
  `getBootstrapStatusForRequest` using packaged primitives
  (`createManagedBetterAuth` + `@voyant-travel/db/schema/iam`). Also exports
  `createManagedCloudAuthApp`, `ManagedCurrentUser`, and `ManagedBootstrapStatus`.

## 0.18.3

### Patch Changes

- @voyant-travel/auth@0.123.0
- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0
- @voyant-travel/cruises@0.147.0
- @voyant-travel/distribution@0.138.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/flights@0.148.0
- @voyant-travel/identity@0.148.0
- @voyant-travel/legal@0.148.0
- @voyant-travel/notifications@0.121.0
- @voyant-travel/trips@0.139.0
- @voyant-travel/accommodations@0.111.3
- @voyant-travel/commerce@0.30.0
- @voyant-travel/storefront@0.150.0
- @voyant-travel/inventory@0.7.8
- @voyant-travel/operations@0.5.20
- @voyant-travel/operator-settings@0.2.32
- @voyant-travel/relationships@0.122.9
- @voyant-travel/quotes@0.125.6

## 0.18.2

### Patch Changes

- @voyant-travel/auth@0.122.0
- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/cruises@0.146.0
- @voyant-travel/distribution@0.137.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/flights@0.147.0
- @voyant-travel/identity@0.147.0
- @voyant-travel/legal@0.147.0
- @voyant-travel/notifications@0.120.0
- @voyant-travel/trips@0.138.0
- @voyant-travel/accommodations@0.111.2
- @voyant-travel/commerce@0.29.0
- @voyant-travel/storefront@0.149.0
- @voyant-travel/inventory@0.7.7
- @voyant-travel/operations@0.5.19
- @voyant-travel/operator-settings@0.2.31
- @voyant-travel/relationships@0.122.8
- @voyant-travel/quotes@0.125.5

## 0.18.1

### Patch Changes

- @voyant-travel/auth@0.121.0
- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0
- @voyant-travel/cruises@0.145.0
- @voyant-travel/distribution@0.136.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/flights@0.146.0
- @voyant-travel/identity@0.146.0
- @voyant-travel/legal@0.146.0
- @voyant-travel/notifications@0.119.0
- @voyant-travel/trips@0.137.0
- @voyant-travel/accommodations@0.111.1
- @voyant-travel/commerce@0.28.0
- @voyant-travel/storefront@0.148.0
- @voyant-travel/inventory@0.7.6
- @voyant-travel/operations@0.5.18
- @voyant-travel/operator-settings@0.2.30
- @voyant-travel/relationships@0.122.7
- @voyant-travel/quotes@0.125.4

## 0.18.0

### Minor Changes

- b4b24bc: Resolve a managed profile's `plugins` list at boot so the standard `operator`
  profile can run snapshot-declared plugins source-free (issue #2983).

  `@voyant-travel/framework/managed-runtime` now imports each `plugins[]` npm
  specifier and invokes its managed-plugin factory (`voyantPlugin` /
  `createVoyantPlugin` / `createPlugin` / a `default` factory) with the plugin's
  `settings[specifier]` and the deployment env, then registers the result like a
  starter's inline `plugins: [...]`. A declared plugin that exposes no managed
  entry fails loud at boot instead of being silently dropped. The previous
  blanket "snapshot plugins are not yet resolved" boot error is removed.

  `importPluginModule` is injectable on `loadManagedProfileRuntime` /
  `ManagedProfileRuntimeOptions` so Cloud (or tests) can resolve plugins from a
  pre-bundled registry instead of node resolution. `resolveManagedPlugins` and
  the managed-plugin factory/context types are exported from
  `@voyant-travel/framework/managed-runtime`.

## 0.17.1

### Patch Changes

- 4829ef3: Add a bounded catalog batch quote endpoint for room/rate price matrices, plus an accommodations batch stay quote path that shares room/date availability and rate reads across selections.
- Updated dependencies [4829ef3]
  - @voyant-travel/accommodations@0.111.0
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/mice@0.6.8
  - @voyant-travel/commerce@0.27.0
  - @voyant-travel/cruises@0.144.0
  - @voyant-travel/distribution@0.135.0
  - @voyant-travel/flights@0.145.0
  - @voyant-travel/inventory@0.7.5
  - @voyant-travel/operations@0.5.17
  - @voyant-travel/trips@0.136.0
  - @voyant-travel/bookings@0.145.0
  - @voyant-travel/quotes@0.125.3
  - @voyant-travel/finance@0.145.0
  - @voyant-travel/identity@0.145.0
  - @voyant-travel/legal@0.145.0
  - @voyant-travel/notifications@0.118.6
  - @voyant-travel/storefront@0.147.0
  - @voyant-travel/operator-settings@0.2.29
  - @voyant-travel/relationships@0.122.6

## 0.17.0

### Minor Changes

- ba6c30a: Add a vertical enrichment seam to the public guest-booking overview so
  storefront "manage my booking" / confirmation surfaces can render
  accommodation specifics from the public API alone (issue #2969).

  Deployments can register a per-`booking_item_type` enricher via the new
  `overviewItemEnrichers` option on the bookings route runtime. Each enricher
  receives the overview items of its type and returns an opaque `details`
  block that is attached to the matching overview item, keyed by booking item
  id. Enrichment is best-effort — a failing enricher is skipped rather than
  failing the guest-authorized overview.

  `@voyant-travel/accommodations` ships the first enricher
  (`enrichStayBookingOverviewItems`, exported from
  `@voyant-travel/accommodations/booking-overview-enricher`), contributing
  property, room type, rate plan, meal plan and per-night rate details. The
  framework composition wires it to the `accommodation` item type.

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/accommodations@0.110.0
  - @voyant-travel/commerce@0.26.0
  - @voyant-travel/cruises@0.143.0
  - @voyant-travel/distribution@0.134.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/legal@0.144.0
  - @voyant-travel/notifications@0.118.5
  - @voyant-travel/storefront@0.146.0
  - @voyant-travel/trips@0.135.0
  - @voyant-travel/mice@0.6.7
  - @voyant-travel/catalog@0.142.0
  - @voyant-travel/flights@0.144.0
  - @voyant-travel/identity@0.144.0
  - @voyant-travel/operator-settings@0.2.28
  - @voyant-travel/quotes@0.125.2
  - @voyant-travel/inventory@0.7.4
  - @voyant-travel/operations@0.5.16
  - @voyant-travel/relationships@0.122.5

## 0.16.1

### Patch Changes

- 772439e: Wire the managed profile runtime to the Voyant Cloud admin auth flow. Managed
  Cloud apps now install the Cloud Better Auth plugin, resolve Better Auth cookie
  sessions with Cloud revalidation, revalidate Cloud-backed API-key users, and
  redirect unauthenticated admin UI requests into the Cloud sign-in flow while
  leaving API callers on JSON 401 responses.

  Add an optional `onUnauthorized` hook to the Hono auth integration contract so
  deployments can customize the final unauthenticated response after all shared
  credential strategies fail.

- Updated dependencies [772439e]
  - @voyant-travel/hono@0.122.1

## 0.16.0

### Minor Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/runtime-core@0.4.2
  - @voyant-travel/inventory@0.7.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/legal@0.143.0
  - @voyant-travel/relationships@0.122.4
  - @voyant-travel/storefront@0.145.0
  - @voyant-travel/accommodations@0.109.11
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/commerce@0.25.0
  - @voyant-travel/cruises@0.142.0
  - @voyant-travel/distribution@0.133.0
  - @voyant-travel/flights@0.143.0
  - @voyant-travel/identity@0.143.0
  - @voyant-travel/mice@0.6.6
  - @voyant-travel/notifications@0.118.4
  - @voyant-travel/operations@0.5.15
  - @voyant-travel/operator-settings@0.2.27
  - @voyant-travel/quotes@0.125.1
  - @voyant-travel/trips@0.134.0
  - @voyant-travel/workflows@0.111.18
  - @voyant-travel/workflows-orchestrator@0.111.18

## 0.15.2

### Patch Changes

- @voyant-travel/bookings@0.142.1

## 0.15.1

### Patch Changes

- badea94: Mount cruise catalog-content routes in the source-free managed runtime and add a provider-neutral card-payment starter hook for managed payment links.

## 0.15.0

### Minor Changes

- 05c10f2: Promote booking-maintenance tax-line rebuild routes into package-owned source-free managed runtime wiring.
- 961cc49: Support package-owned booking schedule and payment-policy routes in source-free managed runtime wiring.
- effdd55: Support package-owned catalog-checkout routes in source-free managed runtime wiring.
- 9a49384: Support package-owned catalog-offers routes in source-free managed runtime wiring.
- 5028f42: Support package-owned flights admin routes in source-free managed runtime wiring.
- 8903982: Promote the operator media route family into the source-free managed runtime defaults.
- 742dbfc: Wire the source-free managed runtime default providers for the package-owned
  `operator/payment-link`, `operator/contract-document`, and
  `operator/action-ledger-health-extension` route surfaces.
- fa1424b: Support package-owned MCP routes in source-free managed runtime wiring.
- 97d1c14: Support package-owned quote-version snapshot routes in source-free managed runtime wiring.

### Patch Changes

- 0f8c804: Promote catalog booking and catalog content route loaders into the managed runtime.
- ee09a7f: Promote the package-owned channel-push extension factory into the managed runtime.
- d019fd3: Promote proposal extension route loaders into the managed runtime.
- Updated dependencies [05c10f2]
- Updated dependencies [ee09a7f]
- Updated dependencies [5028f42]
- Updated dependencies [97d1c14]
  - @voyant-travel/commerce@0.24.0
  - @voyant-travel/distribution@0.132.0
  - @voyant-travel/flights@0.142.0
  - @voyant-travel/quotes@0.125.0
  - @voyant-travel/inventory@0.7.2
  - @voyant-travel/storefront@0.144.0
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/finance@0.142.0
  - @voyant-travel/identity@0.142.0
  - @voyant-travel/legal@0.142.0
  - @voyant-travel/trips@0.133.0
  - @voyant-travel/accommodations@0.109.10
  - @voyant-travel/notifications@0.118.3
  - @voyant-travel/operations@0.5.14
  - @voyant-travel/operator-settings@0.2.26
  - @voyant-travel/relationships@0.122.3

## 0.14.0

### Minor Changes

- d921329: Add the published `@voyant-travel/framework/managed-runtime` entry for booting
  a standard managed profile from a serialized profile snapshot without
  starter-local imports. Managed Cloud boot now fails fast when required substrate,
  auth integration, or snapshot plugin resolution is missing, and source-free
  profile composition excludes standard surfaces whose route loaders still live in
  the operator starter.

## 0.13.0

### Minor Changes

- 9c2369e: Add the managed admin/API operator profile contract at `@voyant-travel/framework/profile`, including `defineVoyantProject`, modules/plugins/settings validation, implicit managed-cloud provider/resource requirements with shared resource keys, migration metadata, and the `createVoyantApp` subset bridge.

## 0.12.22

### Patch Changes

- @voyant-travel/bookings@0.141.3

## 0.12.21

### Patch Changes

- @voyant-travel/bookings@0.141.2
- @voyant-travel/finance@0.141.1

## 0.12.20

### Patch Changes

- @voyant-travel/bookings@0.141.1

## 0.12.19

### Patch Changes

- Updated dependencies [71adbdd]
  - @voyant-travel/accommodations@0.109.9

## 0.12.18

### Patch Changes

- Updated dependencies [0811565]
  - @voyant-travel/notifications@0.118.2

## 0.12.17

### Patch Changes

- 1ab266f: Allow trips route options to be provided lazily so deployment-specific booking and payment runtime wiring is not imported into the eager API composition closure.
- Updated dependencies [1ab266f]
  - @voyant-travel/trips@0.132.1

## 0.12.16

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/accommodations@0.109.8
  - @voyant-travel/commerce@0.23.0
  - @voyant-travel/distribution@0.131.0
  - @voyant-travel/flights@0.141.0
  - @voyant-travel/inventory@0.7.1
  - @voyant-travel/operations@0.5.13
  - @voyant-travel/trips@0.132.0
  - @voyant-travel/bookings@0.141.0
  - @voyant-travel/finance@0.141.0
  - @voyant-travel/identity@0.141.0
  - @voyant-travel/legal@0.141.0
  - @voyant-travel/quotes@0.124.2
  - @voyant-travel/notifications@0.118.1
  - @voyant-travel/storefront@0.143.0
  - @voyant-travel/operator-settings@0.2.25
  - @voyant-travel/relationships@0.122.2

## 0.12.15

### Patch Changes

- bbefc34: Add lazy provider and lazy Hono bundle helpers so deployments can keep heavy
  provider/plugin service graphs out of the eager app closure while preserving
  request-time route, bootstrap, subscriber, and anonymous webhook behavior.
  Lazy bundles can also declare eager transactional module/path metadata so the
  first request selects the transaction-capable DB before the bundle is imported.

  Narrow the framework relationships provider surface to the async methods the
  framework consumes, so lazy provider call sites do not proxy query-builder or
  plain-property service members.

- Updated dependencies [bbefc34]
  - @voyant-travel/hono@0.121.3

## 0.12.14

### Patch Changes

- 621f989: Allow modules to register workflow and event-filter manifest metadata without importing run-bearing workflow definitions into request-serving apps.
- Updated dependencies [621f989]
  - @voyant-travel/commerce@0.22.1
  - @voyant-travel/hono@0.121.2

## 0.12.13

### Patch Changes

- Updated dependencies [62e87ee]
- Updated dependencies [8405bee]
  - @voyant-travel/flights@0.140.0
  - @voyant-travel/inventory@0.7.0
  - @voyant-travel/trips@0.131.0
  - @voyant-travel/commerce@0.22.0
  - @voyant-travel/storefront@0.142.0
  - @voyant-travel/bookings@0.140.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/distribution@0.130.0
  - @voyant-travel/finance@0.140.0
  - @voyant-travel/identity@0.140.0
  - @voyant-travel/legal@0.140.0
  - @voyant-travel/notifications@0.118.0
  - @voyant-travel/quotes@0.124.1
  - @voyant-travel/accommodations@0.109.7
  - @voyant-travel/operations@0.5.12
  - @voyant-travel/operator-settings@0.2.24
  - @voyant-travel/relationships@0.122.1

## 0.12.12

### Patch Changes

- Updated dependencies [98503c9]
  - @voyant-travel/accommodations@0.109.6

## 0.12.11

### Patch Changes

- @voyant-travel/bookings@0.139.5

## 0.12.10

### Patch Changes

- Updated dependencies [ec207bd]
  - @voyant-travel/storefront@0.141.2

## 0.12.9

### Patch Changes

- Updated dependencies [4504abb]
  - @voyant-travel/inventory@0.6.1

## 0.12.8

### Patch Changes

- 32d0e1c: Split the framework standard runtime composition into lightweight per-module
  lazy route loaders, and allow overlapping lazy route mounts to fall through on
  wrapper route misses so lazy modules/extensions preserve eager route composition
  semantics without swallowing handler-authored 404 responses.
- Updated dependencies [32d0e1c]
  - @voyant-travel/hono@0.121.1
  - @voyant-travel/commerce@0.21.2
  - @voyant-travel/finance@0.139.3

## 0.12.7

### Patch Changes

- Updated dependencies [9678a59]
  - @voyant-travel/bookings@0.139.4

## 0.12.6

### Patch Changes

- 386595a: Expose a booking cancellation settlement runtime hook and persist cancellation reasons plus settlement metadata on booking activity entries.
- Updated dependencies [386595a]
  - @voyant-travel/bookings@0.139.3

## 0.12.5

### Patch Changes

- Updated dependencies [79447ce]
  - @voyant-travel/catalog@0.137.1

## 0.12.4

### Patch Changes

- Updated dependencies [ecff8cf]
  - @voyant-travel/operations@0.5.11
  - @voyant-travel/bookings@0.139.2
  - @voyant-travel/storefront@0.141.1

## 0.12.3

### Patch Changes

- Updated dependencies [a69f820]
  - @voyant-travel/commerce@0.21.1
  - @voyant-travel/bookings@0.139.1

## 0.12.2

### Patch Changes

- Updated dependencies [79cc498]
  - @voyant-travel/finance@0.139.2

## 0.12.1

### Patch Changes

- bbc2334: Expose booking tax settings through the finance admin route mount so local starters can reach `/v1/admin/finance/tax-settings` without the bookings detail route capturing the request.
- Updated dependencies [bbc2334]
  - @voyant-travel/finance@0.139.1

## 0.12.0

### Patch Changes

- 52c52fc: Declare storefront public offer detail, apply, and redeem routes as anonymous surfaces so standard hosts admit them without hand-maintained `publicPaths` entries.
- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [bf2d4a5]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [77f139b]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [2453207]
- Updated dependencies [922d0fd]
- Updated dependencies [f000bb3]
- Updated dependencies [28c59ea]
- Updated dependencies [05961f1]
- Updated dependencies [e1290d9]
- Updated dependencies [0c75844]
- Updated dependencies [22f0457]
- Updated dependencies [52c52fc]
- Updated dependencies [92e170a]
- Updated dependencies [f3b8bef]
- Updated dependencies [13f21a1]
- Updated dependencies [9f29b74]
- Updated dependencies [fcad28b]
- Updated dependencies [ca14f6f]
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/relationships@0.122.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/quotes@0.124.0
  - @voyant-travel/notifications@0.117.0
  - @voyant-travel/inventory@0.6.0
  - @voyant-travel/mice@0.6.5
  - @voyant-travel/commerce@0.21.0
  - @voyant-travel/storefront@0.141.0
  - @voyant-travel/distribution@0.129.0
  - @voyant-travel/trips@0.130.0
  - @voyant-travel/identity@0.139.0
  - @voyant-travel/legal@0.139.0
  - @voyant-travel/operations@0.5.10
  - @voyant-travel/accommodations@0.109.5
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/flights@0.139.0
  - @voyant-travel/operator-settings@0.2.23

## 0.11.5

### Patch Changes

- Updated dependencies [5e6a2ff]
- Updated dependencies [92bac99]
- Updated dependencies [5fa49b1]
- Updated dependencies [c7bd13f]
  - @voyant-travel/relationships@0.121.14
  - @voyant-travel/bookings@0.138.10
  - @voyant-travel/catalog@0.136.4

## 0.11.4

### Patch Changes

- Updated dependencies [7df89ab]
- Updated dependencies [8cb2124]
- Updated dependencies [e002da8]
  - @voyant-travel/relationships@0.121.13
  - @voyant-travel/bookings@0.138.9

## 0.11.3

### Patch Changes

- Updated dependencies [ae115de]
  - @voyant-travel/inventory@0.5.18

## 0.11.2

### Patch Changes

- Updated dependencies [b615127]
- Updated dependencies [f9c3449]
  - @voyant-travel/relationships@0.121.12
  - @voyant-travel/finance@0.138.9
  - @voyant-travel/bookings@0.138.8
  - @voyant-travel/identity@0.138.3

## 0.11.1

### Patch Changes

- Updated dependencies [46d7d52]
  - @voyant-travel/relationships@0.121.11
  - @voyant-travel/bookings@0.138.7

## 0.11.0

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
- Updated dependencies [fead555]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/operations@0.5.9
  - @voyant-travel/accommodations@0.109.4
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/commerce@0.20.5
  - @voyant-travel/distribution@0.128.4
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/flights@0.138.2
  - @voyant-travel/identity@0.138.2
  - @voyant-travel/inventory@0.5.17
  - @voyant-travel/legal@0.138.2
  - @voyant-travel/mice@0.6.4
  - @voyant-travel/notifications@0.116.13
  - @voyant-travel/operator-settings@0.2.22
  - @voyant-travel/quotes@0.123.14
  - @voyant-travel/relationships@0.121.10
  - @voyant-travel/storefront@0.140.2
  - @voyant-travel/trips@0.129.2

## 0.10.0

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/accommodations@0.109.3
  - @voyant-travel/action-ledger@0.105.10
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/commerce@0.20.4
  - @voyant-travel/distribution@0.128.3
  - @voyant-travel/flights@0.138.1
  - @voyant-travel/identity@0.138.1
  - @voyant-travel/inventory@0.5.16
  - @voyant-travel/legal@0.138.1
  - @voyant-travel/mice@0.6.3
  - @voyant-travel/notifications@0.116.12
  - @voyant-travel/operations@0.5.8
  - @voyant-travel/operator-settings@0.2.21
  - @voyant-travel/quotes@0.123.13
  - @voyant-travel/relationships@0.121.9
  - @voyant-travel/storefront@0.140.1
  - @voyant-travel/trips@0.129.1

## 0.9.47

### Patch Changes

- Updated dependencies [1544a59]
- Updated dependencies [dd03968]
- Updated dependencies [2d3b039]
- Updated dependencies [bcd76ae]
- Updated dependencies [37e7758]
  - @voyant-travel/bookings@0.138.4
  - @voyant-travel/operations@0.5.7
  - @voyant-travel/catalog@0.136.1
  - @voyant-travel/inventory@0.5.15
  - @voyant-travel/commerce@0.20.3
  - @voyant-travel/finance@0.138.6

## 0.9.46

### Patch Changes

- Updated dependencies [569e2a0]
  - @voyant-travel/commerce@0.20.2
  - @voyant-travel/relationships@0.121.8

## 0.9.45

### Patch Changes

- Updated dependencies [ec41b3e]
  - @voyant-travel/finance@0.138.5

## 0.9.44

### Patch Changes

- Updated dependencies [a424cae]
  - @voyant-travel/finance@0.138.4

## 0.9.43

### Patch Changes

- Updated dependencies [9ebd8e8]
- Updated dependencies [c081c71]
- Updated dependencies [3fc4487]
- Updated dependencies [aa0135c]
- Updated dependencies [51003c6]
  - @voyant-travel/inventory@0.5.14
  - @voyant-travel/bookings@0.138.3
  - @voyant-travel/finance@0.138.3

## 0.9.42

### Patch Changes

- Updated dependencies [d388565]
- Updated dependencies [d1b4da2]
  - @voyant-travel/bookings@0.138.2
  - @voyant-travel/commerce@0.20.1
  - @voyant-travel/finance@0.138.2

## 0.9.41

### Patch Changes

- Updated dependencies [a5dfd8f]
- Updated dependencies [3cacf39]
- Updated dependencies [3757b75]
- Updated dependencies [88edbe6]
  - @voyant-travel/bookings@0.138.1
  - @voyant-travel/distribution@0.128.2
  - @voyant-travel/hono@0.118.4

## 0.9.40

### Patch Changes

- Updated dependencies [bd59b12]
- Updated dependencies [ee4cbf0]
  - @voyant-travel/distribution@0.128.1
  - @voyant-travel/finance@0.138.1

## 0.9.39

### Patch Changes

- Updated dependencies [2325c93]
  - @voyant-travel/distribution@0.128.0
  - @voyant-travel/commerce@0.20.0
  - @voyant-travel/legal@0.138.0
  - @voyant-travel/bookings@0.138.0
  - @voyant-travel/catalog@0.136.0
  - @voyant-travel/finance@0.138.0
  - @voyant-travel/flights@0.138.0
  - @voyant-travel/identity@0.138.0
  - @voyant-travel/trips@0.129.0
  - @voyant-travel/notifications@0.116.11
  - @voyant-travel/storefront@0.140.0
  - @voyant-travel/accommodations@0.109.2
  - @voyant-travel/inventory@0.5.13
  - @voyant-travel/operations@0.5.6
  - @voyant-travel/operator-settings@0.2.20
  - @voyant-travel/relationships@0.121.7
  - @voyant-travel/quotes@0.123.12

## 0.9.38

### Patch Changes

- Updated dependencies [2156dcb]
  - @voyant-travel/commerce@0.19.6
  - @voyant-travel/bookings@0.137.7

## 0.9.37

### Patch Changes

- Updated dependencies [04aa601]
  - @voyant-travel/legal@0.137.9
  - @voyant-travel/distribution@0.127.3
  - @voyant-travel/storefront@0.139.5

## 0.9.36

### Patch Changes

- Updated dependencies [cb8df9c]
- Updated dependencies [f6c8fcf]
- Updated dependencies [1d65f48]
  - @voyant-travel/catalog@0.135.8
  - @voyant-travel/legal@0.137.8
  - @voyant-travel/bookings@0.137.6
  - @voyant-travel/storefront@0.139.4

## 0.9.35

### Patch Changes

- Updated dependencies [5288b85]
- Updated dependencies [cc29167]
  - @voyant-travel/legal@0.137.7

## 0.9.34

### Patch Changes

- Updated dependencies [5928f32]
  - @voyant-travel/legal@0.137.6

## 0.9.33

### Patch Changes

- Updated dependencies [bb3b29c]
  - @voyant-travel/commerce@0.19.5

## 0.9.32

### Patch Changes

- Updated dependencies [fd17317]
- Updated dependencies [c5cd9cd]
- Updated dependencies [4c18cc6]
- Updated dependencies [53f949c]
- Updated dependencies [1e5251d]
  - @voyant-travel/hono@0.118.3
  - @voyant-travel/inventory@0.5.12
  - @voyant-travel/notifications@0.116.10
  - @voyant-travel/legal@0.137.5
  - @voyant-travel/bookings@0.137.5
  - @voyant-travel/flights@0.137.6

## 0.9.31

### Patch Changes

- Updated dependencies [5c1294f]
  - @voyant-travel/inventory@0.5.11

## 0.9.30

### Patch Changes

- @voyant-travel/flights@0.137.5

## 0.9.29

### Patch Changes

- Updated dependencies [ed5463f]
- Updated dependencies [a10b9ba]
- Updated dependencies [e005c4d]
- Updated dependencies [ad02eae]
  - @voyant-travel/operations@0.5.5
  - @voyant-travel/inventory@0.5.10
  - @voyant-travel/commerce@0.19.4
  - @voyant-travel/flights@0.137.4

## 0.9.28

### Patch Changes

- Updated dependencies [7bdd9cc]
  - @voyant-travel/finance@0.137.8
  - @voyant-travel/catalog@0.135.7

## 0.9.27

### Patch Changes

- @voyant-travel/storefront@0.139.3

## 0.9.26

### Patch Changes

- Updated dependencies [b1f90b0]
- Updated dependencies [49ffcd9]
- Updated dependencies [37e9543]
- Updated dependencies [c1d8f71]
  - @voyant-travel/trips@0.128.5
  - @voyant-travel/flights@0.137.3

## 0.9.25

### Patch Changes

- Updated dependencies [776bafd]
  - @voyant-travel/trips@0.128.4

## 0.9.24

### Patch Changes

- Updated dependencies [c6acfa5]
  - @voyant-travel/trips@0.128.3

## 0.9.23

### Patch Changes

- Updated dependencies [54041a9]
  - @voyant-travel/trips@0.128.2

## 0.9.22

### Patch Changes

- Updated dependencies [ce0f92d]
  - @voyant-travel/storefront@0.139.2
  - @voyant-travel/finance@0.137.7

## 0.9.21

### Patch Changes

- 8848457: Allow the standard public finance voucher validation route to be reached without an authenticated storefront session.
- Updated dependencies [5c53561]
- Updated dependencies [790a18d]
- Updated dependencies [2427218]
- Updated dependencies [7850b66]
- Updated dependencies [bddb539]
  - @voyant-travel/flights@0.137.2
  - @voyant-travel/quotes@0.123.11
  - @voyant-travel/finance@0.137.6

## 0.9.20

### Patch Changes

- 7d70797: Validate quote participant person IDs before creating participant records.
- Updated dependencies [7d70797]
  - @voyant-travel/quotes@0.123.10

## 0.9.19

### Patch Changes

- Updated dependencies [5cc83f5]
  - @voyant-travel/quotes@0.123.9

## 0.9.18

### Patch Changes

- Updated dependencies [23d9ee3]
  - @voyant-travel/quotes@0.123.8

## 0.9.17

### Patch Changes

- Updated dependencies [6d8f054]
  - @voyant-travel/quotes@0.123.7

## 0.9.16

### Patch Changes

- Updated dependencies [0108ccf]
  - @voyant-travel/catalog@0.135.6
  - @voyant-travel/finance@0.137.5

## 0.9.15

### Patch Changes

- Updated dependencies [dda92bd]
- Updated dependencies [24413e3]
- Updated dependencies [951409a]
- Updated dependencies [24413e3]
  - @voyant-travel/commerce@0.19.3
  - @voyant-travel/catalog@0.135.5
  - @voyant-travel/finance@0.137.4
  - @voyant-travel/hono@0.118.2

## 0.9.14

### Patch Changes

- @voyant-travel/catalog@0.135.4

## 0.9.13

### Patch Changes

- Updated dependencies [61410dd]
  - @voyant-travel/accommodations@0.109.1
  - @voyant-travel/catalog@0.135.3
  - @voyant-travel/inventory@0.5.9
  - @voyant-travel/bookings@0.137.4

## 0.9.12

### Patch Changes

- @voyant-travel/bookings@0.137.3

## 0.9.11

### Patch Changes

- @voyant-travel/bookings@0.137.2

## 0.9.10

### Patch Changes

- @voyant-travel/distribution@0.127.2

## 0.9.9

### Patch Changes

- Updated dependencies [eb9285a]
  - @voyant-travel/commerce@0.19.2

## 0.9.8

### Patch Changes

- Updated dependencies [6d3e0a5]
  - @voyant-travel/accommodations@0.109.0
  - @voyant-travel/mice@0.6.2

## 0.9.7

### Patch Changes

- d2ec289: Expose a framework provider override for finance payment-schedule line description formatting.

## 0.9.6

### Patch Changes

- Updated dependencies [98e270c]
- Updated dependencies [d2351e0]
  - @voyant-travel/inventory@0.5.8
  - @voyant-travel/catalog@0.135.2

## 0.9.5

### Patch Changes

- Updated dependencies [154a6c2]
  - @voyant-travel/hono@0.118.1
  - @voyant-travel/finance@0.137.3

## 0.9.4

### Patch Changes

- Updated dependencies [bcea95d]
  - @voyant-travel/legal@0.137.4

## 0.9.3

### Patch Changes

- Updated dependencies [5145a69]
  - @voyant-travel/legal@0.137.3

## 0.9.2

### Patch Changes

- Updated dependencies [4eda12a]
- Updated dependencies [89cc2c4]
  - @voyant-travel/finance@0.137.2
  - @voyant-travel/notifications@0.116.9

## 0.9.1

### Patch Changes

- Updated dependencies [fcb8b88]
- Updated dependencies [d2df4c1]
  - @voyant-travel/inventory@0.5.7
  - @voyant-travel/operations@0.5.4
  - @voyant-travel/legal@0.137.2

## 0.9.0

### Minor Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/storefront@0.139.1
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/inventory@0.5.6
  - @voyant-travel/legal@0.137.1
  - @voyant-travel/accommodations@0.108.3
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/commerce@0.19.1
  - @voyant-travel/distribution@0.127.1
  - @voyant-travel/flights@0.137.1
  - @voyant-travel/identity@0.137.1
  - @voyant-travel/mice@0.6.1
  - @voyant-travel/notifications@0.116.8
  - @voyant-travel/operations@0.5.3
  - @voyant-travel/operator-settings@0.2.19
  - @voyant-travel/quotes@0.123.6
  - @voyant-travel/relationships@0.121.6
  - @voyant-travel/trips@0.128.1

## 0.8.1

### Patch Changes

- Updated dependencies [ed31e95]
  - @voyant-travel/mice@0.6.0

## 0.8.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/commerce@0.19.0
  - @voyant-travel/accommodations@0.108.2
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/distribution@0.127.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/flights@0.137.0
  - @voyant-travel/identity@0.137.0
  - @voyant-travel/inventory@0.5.5
  - @voyant-travel/legal@0.137.0
  - @voyant-travel/mice@0.5.2
  - @voyant-travel/notifications@0.116.7
  - @voyant-travel/operations@0.5.2
  - @voyant-travel/operator-settings@0.2.18
  - @voyant-travel/quotes@0.123.5
  - @voyant-travel/relationships@0.121.5
  - @voyant-travel/storefront@0.139.0
  - @voyant-travel/trips@0.128.0

## 0.7.7

### Patch Changes

- Updated dependencies [12a1eb2]
  - @voyant-travel/accommodations@0.108.1
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/commerce@0.18.1
  - @voyant-travel/distribution@0.126.2
  - @voyant-travel/finance@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/inventory@0.5.4
  - @voyant-travel/legal@0.136.2
  - @voyant-travel/mice@0.5.1
  - @voyant-travel/notifications@0.116.6
  - @voyant-travel/operations@0.5.1
  - @voyant-travel/quotes@0.123.4
  - @voyant-travel/relationships@0.121.4
  - @voyant-travel/identity@0.136.2

## 0.7.6

### Patch Changes

- 6a8e6bc: Expose standard finance checkout policy and notifications auto-dispatch policy as optional framework provider fields.

## 0.7.5

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/catalog@0.134.1
- @voyant-travel/distribution@0.126.1
- @voyant-travel/finance@0.136.1
- @voyant-travel/flights@0.136.1
- @voyant-travel/identity@0.136.1
- @voyant-travel/legal@0.136.1
- @voyant-travel/notifications@0.116.5
- @voyant-travel/trips@0.127.1

## 0.7.4

### Patch Changes

- Updated dependencies [4ad1bf7]
  - @voyant-travel/mice@0.5.0

## 0.7.3

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/mice@0.4.0

## 0.7.2

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/mice@0.3.0

## 0.7.1

### Patch Changes

- Updated dependencies [787c852]
- Updated dependencies [293e5e4]
  - @voyant-travel/accommodations@0.108.0
  - @voyant-travel/operations@0.5.0
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/inventory@0.5.3
  - @voyant-travel/storefront@0.138.0
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/distribution@0.126.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/flights@0.136.0
  - @voyant-travel/identity@0.136.0
  - @voyant-travel/legal@0.136.0
  - @voyant-travel/trips@0.127.0
  - @voyant-travel/commerce@0.18.0
  - @voyant-travel/notifications@0.116.4
  - @voyant-travel/operator-settings@0.2.17
  - @voyant-travel/relationships@0.121.3
  - @voyant-travel/quotes@0.123.3

## 0.7.0

### Minor Changes

- 924d201: Room-block allotment (Phase 1) + MICE program spine.

  - accommodations: `room_blocks` / `room_block_nights` / `room_block_pickups` with
    per-night counters, CHECK invariants, an append-only pickup ledger, and a
    transactional pickup/reversal/cutoff-release service; first
    `accommodationsHonoModule` (registered in the framework standard set) +
    `roomBlockLinkable`.
  - operations: `property` / `facility` linkable definitions.
  - mice (new): `mice_programs` umbrella + admin routes + `programLinkable`,
    mounted operator-local.
  - schema-kit: TypeID prefixes `hrbn` / `hrbp` / `prog`.

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/accommodations@0.107.0
  - @voyant-travel/mice@0.2.0
  - @voyant-travel/operations@0.4.0
  - @voyant-travel/inventory@0.5.2
  - @voyant-travel/storefront@0.137.0
  - @voyant-travel/bookings@0.135.0
  - @voyant-travel/catalog@0.133.0
  - @voyant-travel/distribution@0.125.0
  - @voyant-travel/finance@0.135.0
  - @voyant-travel/flights@0.135.0
  - @voyant-travel/identity@0.135.0
  - @voyant-travel/legal@0.135.0
  - @voyant-travel/trips@0.126.0
  - @voyant-travel/commerce@0.17.0
  - @voyant-travel/notifications@0.116.3
  - @voyant-travel/operator-settings@0.2.16
  - @voyant-travel/relationships@0.121.2
  - @voyant-travel/quotes@0.123.2

## 0.6.1

### Patch Changes

- Updated dependencies [fac9297]
  - @voyant-travel/notifications@0.116.2

## 0.6.0

### Minor Changes

- 2542715: Transactional-path declarations (ADR-0008 Phase 2). `HonoModule`/`HonoExtension` gain `transactionalPaths?: string[]` — absolute API path prefixes that must be served by the transaction-capable db client, for routes mounted outside the name-based surface where only a _subset_ transacts (e.g. a lazy family at `/v1/admin/catalog/quote`). `mountApp` folds these into the transactional-prefix map alongside the existing name-based `requiresTransactionalDb`, so a deployment no longer hand-maintains `dbTransactionalPaths`.

  The standard families now declare their own transactional surface: `@voyant-travel/trips` is name-based `requiresTransactionalDb` (every trips route reserves), and the catalog booking engine (`operator/catalog-booking`) declares its `quote`/`book`/`holds`/`orders` prefixes via `transactionalPaths` (search/draft/snapshot reads stay on the cheap default client). The operator starter's `dbTransactionalPaths` list is removed entirely.

  Additive and non-breaking: `dbTransactionalPaths` is still honored as an escape hatch; a module that declares neither flag is unaffected.

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/commerce@0.16.1
  - @voyant-travel/distribution@0.124.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/flights@0.134.1
  - @voyant-travel/identity@0.134.1
  - @voyant-travel/inventory@0.5.1
  - @voyant-travel/legal@0.134.1
  - @voyant-travel/notifications@0.116.1
  - @voyant-travel/operations@0.3.1
  - @voyant-travel/operator-settings@0.2.15
  - @voyant-travel/quotes@0.123.1
  - @voyant-travel/relationships@0.121.1
  - @voyant-travel/storefront@0.136.1
  - @voyant-travel/trips@0.125.1

## 0.5.0

### Minor Changes

- 04b257c: Anonymous-access declarations (ADR-0008 Phase 1). A module/extension can now declare which of its PUBLIC routes are reachable without a session via an `anonymous?: boolean | string[]` field on `HonoModule`/`HonoExtension` — `true` opens the whole public mount, a string array opens specific sub-paths relative to it. `createApp` assembles the global anonymous allow-list from these declarations (unioned with any explicit `publicPaths`, now an escape hatch) and feeds it to both the auth middleware and the public-write rate-limit matcher, so the "reachable-without-auth" decision lives next to the route instead of in a hand-maintained list. New pure helper `assembleAnonymousPaths(modules, extensions, explicit)` is exported for tooling/audit.

  The standard framework families that own anonymous routes now declare it (catalog, bookings, finance payment/collections/accountant sub-paths, legal, public-document-delivery, storefront verification + intake, customer-portal contact-exists, proposals); the framework's `anonymous-surface` test asserts the full assembled standard surface as an auditable snapshot.

  Additive and non-breaking: a deployment that declares no `anonymous` and passes `publicPaths` explicitly gets identical behavior.

- 78c15fa: Module subsetting, Phase 1 (ADR-0007). The standard set is default-on; `createVoyantApp` now accepts `exclude` — a list of standard module/extension specifiers to REMOVE from the framework set, for a deployment that doesn't run them (e.g. `@voyant-travel/flights`).

  Excludes are validated against the new `FRAMEWORK_CAPABILITY_GRAPH` (declaring `provides`/`requires`/`isRequired`): excluding a module another mounted module depends on, an `isRequired` foundational module, or a specifier not in the standard set throws a named boot error listing what's wrong — never a runtime 500. Adds the pure validators `findCapabilityGaps` (`@voyant-travel/hono/composition`) and `subsetStandardManifest` (`@voyant-travel/framework`).

  Additive and non-breaking: omitting `exclude` mounts the full standard set exactly as before.

  Capability _replacement_ (swap Voyant CRM for HubSpot via override-by-capability + injected ports) is the documented v2 design and intentionally not wired yet — the `PeopleDirectory` port doesn't exist, so a replace knob would silently mis-resolve. Removal works today; replacement, schema-side subsetting, and the port extraction are tracked follow-ups.

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/commerce@0.16.0
  - @voyant-travel/distribution@0.124.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/identity@0.134.0
  - @voyant-travel/inventory@0.5.0
  - @voyant-travel/legal@0.134.0
  - @voyant-travel/notifications@0.116.0
  - @voyant-travel/operations@0.3.0
  - @voyant-travel/quotes@0.123.0
  - @voyant-travel/relationships@0.121.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/flights@0.134.0
  - @voyant-travel/operator-settings@0.2.14
  - @voyant-travel/storefront@0.136.0
  - @voyant-travel/trips@0.125.0

## 0.4.0

### Patch Changes

- Updated dependencies [4abf9a2]
- Updated dependencies [b68d6a7]
- Updated dependencies [bba70ee]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/legal@0.133.0
  - @voyant-travel/trips@0.124.0
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/commerce@0.15.0
  - @voyant-travel/distribution@0.123.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/flights@0.133.0
  - @voyant-travel/identity@0.133.0
  - @voyant-travel/inventory@0.4.7
  - @voyant-travel/notifications@0.115.0
  - @voyant-travel/operations@0.2.8
  - @voyant-travel/operator-settings@0.2.13
  - @voyant-travel/quotes@0.122.11
  - @voyant-travel/relationships@0.120.13
  - @voyant-travel/storefront@0.135.0

## 0.3.1

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/flights@0.132.0
  - @voyant-travel/commerce@0.14.0
  - @voyant-travel/distribution@0.122.0
  - @voyant-travel/inventory@0.4.6
  - @voyant-travel/operations@0.2.7
  - @voyant-travel/trips@0.123.0
  - @voyant-travel/bookings@0.132.0
  - @voyant-travel/quotes@0.122.10
  - @voyant-travel/finance@0.132.0
  - @voyant-travel/identity@0.132.0
  - @voyant-travel/legal@0.132.0
  - @voyant-travel/notifications@0.114.9
  - @voyant-travel/storefront@0.134.0
  - @voyant-travel/operator-settings@0.2.12
  - @voyant-travel/relationships@0.120.12

## 0.3.0

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/commerce@0.13.1
  - @voyant-travel/distribution@0.121.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/flights@0.131.1
  - @voyant-travel/identity@0.131.1
  - @voyant-travel/inventory@0.4.5
  - @voyant-travel/legal@0.131.1
  - @voyant-travel/notifications@0.114.8
  - @voyant-travel/operations@0.2.6
  - @voyant-travel/operator-settings@0.2.11
  - @voyant-travel/quotes@0.122.9
  - @voyant-travel/relationships@0.120.11
  - @voyant-travel/storefront@0.133.1
  - @voyant-travel/trips@0.122.1

## 0.2.22

### Patch Changes

- Updated dependencies [8c9a402]
  - @voyant-travel/finance@0.131.1

## 0.2.21

### Patch Changes

- Updated dependencies [ba89f0b]
  - @voyant-travel/operations@0.2.5

## 0.2.20

### Patch Changes

- Updated dependencies [fcd2e0b]
  - @voyant-travel/inventory@0.4.4

## 0.2.19

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0
- @voyant-travel/distribution@0.121.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/flights@0.131.0
- @voyant-travel/identity@0.131.0
- @voyant-travel/legal@0.131.0
- @voyant-travel/trips@0.122.0
- @voyant-travel/commerce@0.13.0
- @voyant-travel/notifications@0.114.7
- @voyant-travel/storefront@0.133.0
- @voyant-travel/inventory@0.4.3
- @voyant-travel/operations@0.2.4
- @voyant-travel/operator-settings@0.2.10
- @voyant-travel/relationships@0.120.10
- @voyant-travel/quotes@0.122.8

## 0.2.18

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0
- @voyant-travel/distribution@0.120.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/flights@0.130.0
- @voyant-travel/identity@0.130.0
- @voyant-travel/legal@0.130.0
- @voyant-travel/trips@0.121.0
- @voyant-travel/commerce@0.12.0
- @voyant-travel/notifications@0.114.6
- @voyant-travel/storefront@0.132.0
- @voyant-travel/inventory@0.4.2
- @voyant-travel/operations@0.2.3
- @voyant-travel/operator-settings@0.2.9
- @voyant-travel/relationships@0.120.9
- @voyant-travel/quotes@0.122.7

## 0.2.17

### Patch Changes

- Updated dependencies [733bf33]
  - @voyant-travel/commerce@0.11.1
  - @voyant-travel/storefront@0.131.1

## 0.2.16

### Patch Changes

- Updated dependencies [466e576]
  - @voyant-travel/legal@0.129.1

## 0.2.15

### Patch Changes

- Updated dependencies [c5416cb]
  - @voyant-travel/trips@0.120.1
  - @voyant-travel/quotes@0.122.6

## 0.2.14

### Patch Changes

- Updated dependencies [4a6d62f]
  - @voyant-travel/bookings@0.129.1

## 0.2.13

### Patch Changes

- Updated dependencies [7929dae]
  - @voyant-travel/relationships@0.120.8

## 0.2.12

### Patch Changes

- Updated dependencies [e014a02]
  - @voyant-travel/distribution@0.119.1

## 0.2.11

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/commerce@0.11.0
  - @voyant-travel/distribution@0.119.0
  - @voyant-travel/flights@0.129.0
  - @voyant-travel/inventory@0.4.1
  - @voyant-travel/operations@0.2.2
  - @voyant-travel/trips@0.120.0
  - @voyant-travel/quotes@0.122.5
  - @voyant-travel/bookings@0.129.0
  - @voyant-travel/finance@0.129.0
  - @voyant-travel/identity@0.129.0
  - @voyant-travel/legal@0.129.0
  - @voyant-travel/notifications@0.114.5
  - @voyant-travel/storefront@0.131.0
  - @voyant-travel/operator-settings@0.2.8
  - @voyant-travel/relationships@0.120.7

## 0.2.10

### Patch Changes

- Updated dependencies [63e99ca]
  - @voyant-travel/storefront@0.130.0

## 0.2.9

### Patch Changes

- Updated dependencies [9c47b00]
  - @voyant-travel/inventory@0.4.0
  - @voyant-travel/storefront@0.129.0
  - @voyant-travel/bookings@0.128.0
  - @voyant-travel/catalog@0.126.0
  - @voyant-travel/distribution@0.118.0
  - @voyant-travel/finance@0.128.0
  - @voyant-travel/flights@0.128.0
  - @voyant-travel/identity@0.128.0
  - @voyant-travel/legal@0.128.0
  - @voyant-travel/trips@0.119.0
  - @voyant-travel/commerce@0.10.0
  - @voyant-travel/notifications@0.114.4
  - @voyant-travel/operations@0.2.1
  - @voyant-travel/operator-settings@0.2.7
  - @voyant-travel/relationships@0.120.6
  - @voyant-travel/quotes@0.122.4

## 0.2.8

### Patch Changes

- Updated dependencies [435a5d1]
- Updated dependencies [c143531]
  - @voyant-travel/operations@0.2.0
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/flights@0.127.0
  - @voyant-travel/inventory@0.3.9
  - @voyant-travel/storefront@0.128.0
  - @voyant-travel/commerce@0.9.0
  - @voyant-travel/distribution@0.117.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/legal@0.127.0
  - @voyant-travel/notifications@0.114.3
  - @voyant-travel/trips@0.118.0
  - @voyant-travel/catalog@0.125.0
  - @voyant-travel/identity@0.127.0
  - @voyant-travel/operator-settings@0.2.6
  - @voyant-travel/quotes@0.122.3
  - @voyant-travel/relationships@0.120.5

## 0.2.7

### Patch Changes

- Updated dependencies [fc678e9]
  - @voyant-travel/inventory@0.3.8

## 0.2.6

### Patch Changes

- Updated dependencies [1841ce2]
- Updated dependencies [4893352]
  - @voyant-travel/relationships@0.120.4
  - @voyant-travel/quotes@0.122.2
  - @voyant-travel/identity@0.126.1
  - @voyant-travel/distribution@0.116.1
  - @voyant-travel/inventory@0.3.7
  - @voyant-travel/commerce@0.8.1
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/notifications@0.114.2
  - @voyant-travel/legal@0.126.1
  - @voyant-travel/storefront@0.127.1
  - @voyant-travel/operator-settings@0.2.5
  - @voyant-travel/action-ledger@0.105.3
  - @voyant-travel/trips@0.117.1
  - @voyant-travel/operations@0.1.7

## 0.2.5

### Patch Changes

- Updated dependencies [84b9d4b]
  - @voyant-travel/legal@0.126.0
  - @voyant-travel/commerce@0.8.0
  - @voyant-travel/notifications@0.114.1
  - @voyant-travel/storefront@0.127.0
  - @voyant-travel/inventory@0.3.6
  - @voyant-travel/bookings@0.126.0
  - @voyant-travel/catalog@0.124.0
  - @voyant-travel/distribution@0.116.0
  - @voyant-travel/finance@0.126.0
  - @voyant-travel/flights@0.126.0
  - @voyant-travel/identity@0.126.0
  - @voyant-travel/trips@0.117.0
  - @voyant-travel/operations@0.1.6
  - @voyant-travel/operator-settings@0.2.4
  - @voyant-travel/relationships@0.120.3
  - @voyant-travel/quotes@0.122.1

## 0.2.4

### Patch Changes

- Updated dependencies [e89640b]
  - @voyant-travel/operator-settings@0.2.3
  - @voyant-travel/action-ledger@0.105.2
  - @voyant-travel/trips@0.116.1

## 0.2.3

### Patch Changes

- @voyant-travel/catalog@0.123.1

## 0.2.2

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/quotes@0.122.0
  - @voyant-travel/commerce@0.7.0
  - @voyant-travel/inventory@0.3.5
  - @voyant-travel/storefront@0.126.0
  - @voyant-travel/bookings@0.125.0
  - @voyant-travel/catalog@0.123.0
  - @voyant-travel/distribution@0.115.0
  - @voyant-travel/finance@0.125.0
  - @voyant-travel/flights@0.125.0
  - @voyant-travel/identity@0.125.0
  - @voyant-travel/legal@0.125.0
  - @voyant-travel/notifications@0.114.0
  - @voyant-travel/trips@0.116.0
  - @voyant-travel/operations@0.1.5
  - @voyant-travel/operator-settings@0.2.2
  - @voyant-travel/relationships@0.120.2
  - @voyant-travel/hono@0.112.2

## 0.2.1

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0
- @voyant-travel/distribution@0.114.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/flights@0.124.0
- @voyant-travel/identity@0.124.0
- @voyant-travel/legal@0.124.0
- @voyant-travel/notifications@0.113.0
- @voyant-travel/storefront@0.125.0
- @voyant-travel/trips@0.115.0
- @voyant-travel/commerce@0.6.0
- @voyant-travel/inventory@0.3.4
- @voyant-travel/operations@0.1.4
- @voyant-travel/operator-settings@0.2.1
- @voyant-travel/relationships@0.120.1
- @voyant-travel/quotes@0.121.1

## 0.2.0

### Minor Changes

- 04681f3: Adopt custom fields on `booking` — the first entity consumer of the `@voyant-travel/core/custom-fields` registry.

  - A `custom_fields jsonb default '{}'` column on `bookings` (framework bundle migration `0001`).
  - Booking create/update routes validate the `customFields` payload at the boundary against the deployment's injected registry (`validateBookingCustomFields`): unknown keys, missing required, and wrong types are rejected 400; only registry-approved values are persisted. Writes that carry `customFields` when the deployment declares none are rejected.
  - The registry is injected through `BookingRouteRuntimeOptions.customFields` → `createBookingsHonoModule` → a new optional `FrameworkProviders.customFields` provider, which a deployment supplies (the operator wires its discovered `operatorCustomFields`).

  Read paths return `custom_fields` as part of the booking row. Oracle-verified (`bundle + links == live schema`). Per-entity adoption continues with `person`/`product`; export/invoice/search consumption of `customFieldsVisibleIn` is a follow-up. See `docs/architecture/custom-fields.md`.

- 9c3fe53: Custom-fields unification (phase 2 — person/organization adopt the `custom_fields` column). Both `people` and `organizations` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0002`), and their create/update routes validate `customFields` at the write boundary against the resolved registry (code ∪ runtime `custom_field_definitions`):

  - `relationships`: `RelationshipsRouteRuntime(+Options).customFields` resolver; a `validateRelationshipsCustomFields(c, entity, data)` helper on the accounts route (its `Env` now exposes `container`); person/org writes persist the cleaned value.
  - `relationships-contracts`: `customFields` added to the person/organization core schemas.
  - `framework`: the relationships factory moves Tier 1 → 2 to receive `capabilities.customFields`.

  Values now live on the entity row for `booking`, `person`, and `organization`. Still ahead: repoint the EAV value API to the column + backfill `custom_field_values` → jsonb, then retire the side table. Oracle-verified (bundle + links == live schema).

- 3d0c070: New `@voyant-travel/framework` BOM (bill of materials) package. Its `dependencies` pin the tested runtime-module set (the 16 mounted modules), so a deployment tracks **one framework version** and upgrades atomically — no per-package compatibility matrix. Deliberately not global lockstep: runtime packages keep independent versions (only changed ones republish, avoiding the per-package npm email spam), and the BOM is the single package that tracks the framework version. The dep list is generated from the membership manifest (`scripts/generate-framework-bom.mjs`), gated in CI via `verify:framework-bom`. Exports `FRAMEWORK_RUNTIME_PACKAGES` for `voyant upgrade`.
- d222e9f: **Convergence (Workstream B step 3):** `@voyant-travel/framework` now exports `createVoyantApp({ providers, modules?, extensions?, …config })` — the config-driven front door. It assembles the framework-owned standard set (`FRAMEWORK_RUNTIME_MANIFEST` + `frameworkComposition`) with the deployment's injected providers and any deployment-local module/extension additions, then delegates to `@voyant-travel/hono`'s lower-level `createApp`.

  A standard deployment's `app.ts` collapses to a single `createVoyantApp({ providers: buildOperatorProviders(), modules: deploymentLocalModules, …db/workflows/outbox/publicPaths })` call — no hand-maintained manifest or registry. The operator starter is converged: `buildOperatorCapabilities → buildOperatorProviders`, the two deployment-local module factories are extracted to `deploymentLocalModules`, and `OPERATOR_RUNTIME_MANIFEST` / `operatorComposition` remain only as derived exports for `voyant db doctor` parity + the composition tests.

  (hono: docstring on `createApp` updated to point standard deployments at `createVoyantApp`.)

- c96beb8: Add `modulesFromGlob` + `defineDeploymentModule` — the runtime half of the "build your own module without forking" seam. A deployment feeds a Vite `import.meta.glob("../modules/*/index.ts", { eager: true })` (compiled to static imports at build time — Workers-safe) into `modulesFromGlob`, which keys each custom module by its `<name>` directory and normalizes its default export (a `HonoModule` or `ModuleFactory`, via `defineDeploymentModule`) into the composition registry.

  Pairs with the deployment drizzle config glob (`src/modules/*/schema.ts`) so a custom module's tables are migrated as a deployment source after the framework bundle. See `docs/architecture/custom-modules.md`.

- 7cff632: Add `extensionsFromGlob` + `defineDeploymentExtension` — the extension counterpart to `modulesFromGlob`/`defineDeploymentModule`. A deployment drops a `HonoExtension` into `src/extensions/<name>/index.ts` (custom routes on an _existing_ module, e.g. `/v1/admin/bookings/notes`) and it is auto-discovered and mounted via `import.meta.glob`, keyed by directory name. Pairs with the deployment drizzle config glob (`src/extensions/*/schema.ts`) so an extension that owns tables is migrated as a deployment source after the framework bundle.

  Completes the "build your own routes/modules without forking" seam (custom module + custom extension). See `docs/architecture/custom-modules.md`.

- 0f65f95: `FRAMEWORK_RUNTIME_MANIFEST` now owns the `operator/*` **standard** family entries (the 6 lazy modules — mcp, catalog-booking, catalog-content, media, payment-link, contract-document — and all 7 lazy extensions), matching the `frameworkComposition` registry that already owns their factories.

  The deployment's `OPERATOR_RUNTIME_MANIFEST` collapses to `[...FRAMEWORK_RUNTIME_MANIFEST.modules, "operator/invitations", "operator/operator-settings"]` for modules and `[...FRAMEWORK_RUNTIME_MANIFEST.extensions]` for extensions — i.e. it appends only the two genuinely deployment-local module families and zero deployment-local extensions.

  Composed module/extension counts are unchanged (29 / 15). The relative mount order of the standard families is preserved; only `invitations` + `operator-settings` (disjoint absolute-path lazy families) move to the end of the module list, which is mount-order-immaterial. This is the manifest-ownership prerequisite for the `createApp({ config, providers, extensions })` convergence.

- 74574cd: `@voyant-travel/framework` now owns the standard runtime composition manifest (`FRAMEWORK_RUNTIME_MANIFEST` — the ordered 21 package modules + 8 package extensions). The operator deployment spreads it and appends only its deployment-local `operator/*` families, so adding a standard module to the framework auto-joins the default set without the deployment re-listing it. First slice of Workstream B (the standard composition relocation); the registry factories relocate next.
- cfa613b: The framework now owns the **standard runtime composition registry**, not just the BOM + manifest. New exports:

  - `frameworkComposition` — a `CompositionRegistry` of the package-owned standard factories a deployment spreads into its own registry (`{ ...frameworkComposition.modules }`), so `composeFromManifest` sees one complete registry while the deployment shrinks.
  - `FrameworkProviders` — the typed, injected provider surface the standard factories read off `ctx.capabilities` (the deployment's capability container is a structural superset).

  This first slice (Workstream B, Tier 1) relocates the pure singleton module factories — action-ledger, relationships, quotes, operations, identity, distribution, commerce, inventory — which take no providers. Capability-shaped factories and the lazy `operator/*` route loaders follow in later tiers.

- ec8018f: Relocate the first capability-shaped standard module factories into `frameworkComposition` (Workstream B, Tier 2a): **bookings, storefront/customer-portal, storefront/verification, trips**. These read injected providers off `ctx.capabilities` rather than being hand-wired in the deployment.

  `FrameworkProviders` gains its first real fields — `relationshipsService`, `closePaymentSchedulesForBooking`, `resolveDocumentDownloadUrl`, `resolveNotificationProviders`, `createTripsRoutesOptions` — each typed by the package option type it feeds (`NonNullable<XOptions["field"]>`) or by a package service (`typeof relationshipsService`), so the provider contract can't drift from what the factories pass it into. A deployment's capability container now structurally `extends FrameworkProviders`.

  `public-document-delivery` is intentionally deferred: its storage provider takes the deployment's narrow `CloudflareBindings`, which surfaces a bindings-variance design question for the provider contract — to be resolved with the storage/document group rather than papered over.

- c31e566: Relocate the **catalog** and **storefront** module factories into `frameworkComposition` (Workstream B, Tier 2b). `FrameworkProviders` gains:

  - `resolveCatalogRuntime` — typed `CatalogSearchRoutesOptions["resolveRuntime"]`. The deployment adapts its `buildCatalogContext` (a Hono-`Context` → catalog runtime mapping) into this shape, so the framework factory consumes the package's runtime contract directly.
  - `storefrontIntakePersistence` — the exported `StorefrontIntakePersistence`, built from the deployment's relationships-backed intake runtime.

  The framework's storefront factory builds its commerce offer resolvers from the package (`createCommerceStorefrontOfferResolvers`); only the deployment-specific intake persistence + `resolveDb` are injected.

- 529f340: Relocate the **public-document-delivery** and **notifications** module factories into `frameworkComposition` (Workstream B, Tier 2b). `FrameworkProviders` gains `resolvePublicCheckoutBaseUrl` and `readDocumentContentBase64` (notifications); public-document-delivery reuses the `createOperatorDocumentStorage` provider added with legal.

  This resolves the public-document-delivery deferral from Tier 2a: routing its `resolveStorage` through the uniform `unknown`-bindings `createOperatorDocumentStorage` adapter (rather than the narrow-`CloudflareBindings` `createDocumentStorage`) keeps the provider contract uniform and lets the deployment retire `createDocumentStorage` entirely.

- e5ce077: Relocate the **inventory/extras** and **bookings/requirements** module factories into `frameworkComposition` (Workstream B, Tier 2b).

  - `inventory/extras` — the combined inventory+bookings extras surface (`new Hono().route(inventoryExtrasRoutes).route(bookingsExtrasRoutes)`) is now built in the framework. This adds `hono` as a **dev + peer** dependency (the framework's first plain-`hono` value usage; kept out of the BOM-locked `dependencies`).
  - `bookings/requirements` — `FrameworkProviders` gains `resolveBookingRequirementsProductSnapshot`, typed via `BookingRequirementsHonoModuleOptions` indexed access.

- 9dc4aa0: Relocate the **finance** module factory into `frameworkComposition` (Workstream B, Tier 2b — completes Tier 2). This is the last and largest capability-shaped module: its notifications→checkout adapter helpers (`toCheckoutNotificationDelivery`, `toCheckoutReminderRun`, `optionalDateTime` + the `NotificationDeliveryLike`/`NotificationReminderRunLike` types) move into the framework alongside the factory.

  `FrameworkProviders` gains `createInvoiceExchangeRateResolver`, `createInvoiceSettlementPollers`, `resolveBankTransferDetails` (typed via `FinanceHonoModuleOptions` indexed access) and `netopiaCheckoutStarter` (`CheckoutPaymentStarter` — Netopia stays injected, never imported by the framework). Finance also reuses the already-relocated `resolveDocumentDownloadUrl`, `resolvePublicCheckoutBaseUrl`, and `resolveNotificationProviders` providers, confirming those shared fields satisfy multiple package option contracts.

  With finance done, all 21 standard `@voyant-travel/*` modules are framework-owned; only the standard extensions (Tier 3) and the `operator/*` lazy families (Tier 4) remain in the deployment registry.

- ba387e0: Relocate the **legal** module factory into `frameworkComposition` (Workstream B, Tier 2b). `FrameworkProviders` gains the legal provider fields — `resolveDb`, `createOperatorDocumentStorage`, `resolveContractDocumentGenerator`, `createBookingPiiService`, `autoGenerateContractOnConfirmed` — each typed by `CreateLegalHonoModuleOptions` indexed access (drift-proof). All are `unknown`/`Record<string,unknown>`-bindings adapters, so the `OperatorCapabilities extends FrameworkProviders` guard passes cleanly.
- 54fc04a: Relocate the 6 pure singleton standard **extensions** into `frameworkComposition.extensions` (Workstream B, Tier 3a): bookings/booking-supplier, finance/bookings-create, inventory/booking, inventory/authoring, quotes/booking, and distribution (booking) extensions. These take no providers, so they move like the Tier 1 singletons; the deployment now spreads `...frameworkComposition.extensions`. The two injection-shaped extensions (distribution/channel-push, finance/booking-tax) remain in the deployment for Tier 3b.
- 4e5bb43: Relocate the 2 injection-shaped standard extensions into `frameworkComposition.extensions` (Workstream B, Tier 3b — completes Tier 3):

  - **finance/booking-tax** — `createBookingTaxHonoExtension` now lives in the framework factory; `FrameworkProviders` gains `resolveBookingTaxSettings` + `updateBookingTaxSettings` (typed via `BookingTaxRouteOptions`).
  - **distribution/channel-push** — its builder is genuinely deployment-wired (booking-engine registry), so it's injected as a `createChannelPushExtension: () => HonoExtension` provider; the framework owns the manifest entry while the deployment supplies the builder. This previews the Tier 4 injected-builder pattern.

  All standard `@voyant-travel/*` extensions are now framework-owned.

- a9fd30a: Relocate the 7 lazy `operator/*` standard module factories into `frameworkComposition.modules` (Workstream B, Tier 4a): flights, mcp, catalog-booking, catalog-content, media, payment-link, contract-document.

  The framework now owns each family's manifest entry **and its stable absolute route-path matchers** (the URL contract); the deployment injects only the `load` closure that wires its providers into the package-owned route bundle. `FrameworkProviders` gains 7 `LazyRoutesLoader` fields (`loadFlightAdminRoutes`, `loadMcpAdminRoutes`, `loadCatalogBookingRoutes`, `loadCatalogContentRoutes`, `loadMediaRoutes`, `loadPaymentLinkRoutes`, `loadContractDocumentRoutes`). `OPERATOR_RUNTIME_MANIFEST` is unchanged, preserving exact mount order. Only `operator/invitations` and `operator/operator-settings` remain in the deployment registry.

- 29086c7: Relocate the 7 lazy `operator/*` standard extension factories into `frameworkComposition.extensions` (Workstream B, Tier 4b — completes Tier 4): booking-schedule, quote-version-snapshot, booking-maintenance, action-ledger-health, proposal, catalog-offers, catalog-checkout.

  The framework owns each extension's `{ name, module }` metadata + `publicPath`; the deployment injects the builders/loaders. `FrameworkProviders` gains 8 fields — 2 `() => HonoExtension` builders (`createBookingScheduleExtension`, `createQuoteVersionSnapshotExtension`) and 6 `LazyRoutesLoader`s (`loadBookingMaintenanceRoutes`, `loadActionLedgerHealthRoutes`, `loadProposalAdminRoutes`, `loadProposalPublicRoutes`, `loadCatalogOffersRoutes`, `loadCatalogCheckoutRoutes`).

  The deployment's `operatorComposition.extensions` is now just `{ ...frameworkComposition.extensions }`. All standard modules **and** extensions are framework-owned; only `operator/invitations` + `operator/operator-settings` remain as deployment-local module factories (→ `extensions[]` at convergence).

- d45dd31: Collapse the booking-tax reader injection (Workstream B step 4, Stage 2a). The framework's `finance/booking-tax-extension` factory now reads `resolveBookingTaxSettings` / `updateBookingTaxSettings` straight from the standard `@voyant-travel/operator-settings` package instead of from injected providers.

  `FrameworkProviders` drops `resolveBookingTaxSettings` + `updateBookingTaxSettings`, and the operator deployment stops wiring them in `buildOperatorProviders`. This is the decided framework-layer wiring (open-question 2): no leaf module depends on operator-settings — only the framework assembly layer does (added as a dev + peer dependency, kept out of the BOM-locked `dependencies`). operator-settings stays `additionalSchemas`-only, so the runtime/BOM lockstep set is unchanged (16).

- cc82783: Promote `@voyant-travel/operator-settings` to a standard mounted module (Workstream B step 4, Stage 2b — completes the extraction).

  - The package gains a HonoModule: `./hono-module` (`createOperatorSettingsHonoModule()`, lazyRoutes at the stable absolute paths `/v1/admin/settings/*`, `/v1/public/operator-profile`, `/v1/public/settings/operator`) + `./routes` (the handlers). New deps: `@voyant-travel/hono` + `hono`.
  - It moves from `voyant.config` `additionalSchemas` → `modules`, so it joins the runtime/BOM **lockstep set (16 → 17)** and is added to the framework BOM `dependencies`. `FRAMEWORK_RUNTIME_MANIFEST` + `frameworkComposition` own its factory.
  - The deployment drops `operator/operator-settings` from `deploymentLocalModules` (now only `invitations` remains) and **deletes** `src/api/routes/settings.ts` — the settings routes are package-owned.

  Migration parity holds (schema byte-identical, already in snapshot 0067; `additionalSchemas`→`modules` only changes the schema's position in the drizzle list, not its DDL). Composed module/extension counts are unchanged (29 / 34 / 15) — the module just moved framework-owned. `check-public-cache-policy` updated to the package's new routes path.

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [a3bd51c]
- Updated dependencies [170388e]
- Updated dependencies [e9d9dbb]
- Updated dependencies [9c3fe53]
- Updated dependencies [d29dd47]
- Updated dependencies [ce2a568]
- Updated dependencies [3aa90b4]
- Updated dependencies [39d48fe]
- Updated dependencies [9616f1f]
- Updated dependencies [d222e9f]
- Updated dependencies [6d75244]
- Updated dependencies [cc82783]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/relationships@0.120.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/quotes@0.121.0
  - @voyant-travel/operator-settings@0.2.0
  - @voyant-travel/commerce@0.5.0
  - @voyant-travel/distribution@0.113.0
  - @voyant-travel/legal@0.123.0
  - @voyant-travel/notifications@0.112.0
  - @voyant-travel/storefront@0.124.0
  - @voyant-travel/trips@0.114.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/identity@0.123.0
  - @voyant-travel/inventory@0.3.3
  - @voyant-travel/operations@0.1.3
  - @voyant-travel/flights@0.123.0
