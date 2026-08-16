# @voyant-travel/catalog

Catalog plane foundation for Voyant. The shared cross-cutting infrastructure
that Inventory, vertical modules, resale modules, and booking add-on surfaces
adopt to participate in a normalized discovery / overlay / snapshot / search
surface.

This package owns the catalog plane foundation plus semantic search primitives:
embedding providers, model compatibility helpers, hybrid/semantic search, and
cross-audience federation. Agent runtimes wrap the catalog HTTP APIs directly;
MCP packaging is application-owned.

See [`docs/architecture/catalog-architecture.md`](../../docs/architecture/catalog-architecture.md) for the full design.

## Install

```bash
pnpm add @voyant-travel/catalog
```

Install `@voyant-travel/catalog-contracts` instead when you only need the pure
adapter payload types, adapter Zod schemas, field-policy contracts,
provenance, drift payloads, or content locale/overlay helpers. Use this package
when you also need Drizzle schema, Hono routes, booking-engine integration,
search services, or catalog runtime services.

## What's in the box

- **`./contract`** — `FieldPolicy` type and the eleven governance enums. The load-bearing schema decision: every field on every Catalog Item projection is declared with a row in a per-vertical policy file.
- **`./provenance`** — `Provenance` shape (`source_kind`, `source_ref`, `source_freshness`) carried by every Catalog Item projection.
- **`./overlay/schema`** — drizzle table schema for editorial overrides keyed `(entity_module, entity_id, field_path, locale, audience, market)`.
- **`./overlay/resolver`** — resolver-merge logic with full locale × audience × market fallback chain.
- **`./snapshot/schema`** — `booking_catalog_snapshot` table for immutable booking-time Catalog Item projection views.
- **`./indexer/provider`** — the `catalog.indexer` runtime port used by deployment
  composition.
- **`./indexer/postgres`** — native Postgres `IndexerAdapter`, the first-party
  managed-cloud default. It keeps a rebuildable catalog projection in the
  deployment database and uses the deployment-owned resident pool. Set the
  recorded `POSTGRES_SEARCH_TEXT_STRATEGY=lakebase` and/or
  `POSTGRES_SEARCH_VECTOR_STRATEGY=lakebase` only when Lakebase Search has
  provisioned `lakebase_text` and/or `lakebase_vector`; use
  `POSTGRES_SEARCH_VECTOR_STRATEGY=pgvector` with a deployment vector dimension
  when only the `vector` extension is provisioned. Native FTS remains the
  portable lexical fallback, and `POSTGRES_SEARCH_TYPO_STRATEGY=pgtrgm` enables
  curated-term typo recovery when `pg_trgm` is provisioned.
  Its private `projectionGeneration(slice)` token changes after successful
  writes and is intended for deployment-level cache keys, not public responses.
  On transaction-capable deployments, each search reads candidates and facets
  from a repeatable-read, read-only projection snapshot.
  Its signed cursors include every searched projection generation and reject
  continuation after a write or rebuild, preventing mixed-generation pagination.
  Policy-backed scalar filters are maintained in typed facet rows before search
  candidate generation. A successful full rebuild retains one predecessor per
  slice; deployment maintenance may use the private `rollbackProjection(slice)`
  operation before steady writes invalidate that rollback snapshot. Interrupted
  bulk streams retain their staged chunks for a retry when callers reuse the
  same `rebuildRunId` for one source snapshot; a changed source uses a new run
  id and cannot publish stale staging rows. `projectionState(slice)` reports
  the pending staged-document count until atomic publication succeeds.
- **`./indexer/typesense`** — native Typesense `IndexerAdapter`, retained as a
  selectable first-party provider.
- **`./indexer/postgres-provider`** — graph provider factory selected by
  `deployment.providers.search: "postgres"`.
- **`./indexer/relevance`** — shared travel relevance corpus and comparison
  harness for measuring Postgres against a selected baseline adapter.
- **`./indexer/typesense-provider`** — graph provider factory selected by
  `deployment.providers.search: "typesense"`.
- **`./search/rerank`** — Tier 2 two-stage-search orchestration helper for browse-time pricing.
- **`./drift/events`** — drift event types for upstream change detection.
- **`./events/taxonomy`** — catalog event names + visibility-filtered payload builders, emitted via `@voyant-travel/core/events` and consumed by the existing webhook pipeline.
- **`./adapter/contract`** — public source-adapter contract. Voyant Connect, third-party providers, operator-built adapters all implement this.
- **`./adapter/schemas`** — zod schemas for source-adapter runtime payloads. Use these at HTTP, queue, RPC, and adapter boundaries instead of re-declaring validators.
- **`./booking-engine`** — quote/book services plus the Hono route module that backs `@voyant-travel/catalog-react/booking-engine` and `@voyant-travel/bookings-react/journey`.

## Architectural rules

The catalog plane is a **contract**, not a polymorphic root. Vertical modules keep their own schemas and adopt this contract; they do not share a row shape. See the architecture doc for the full rationale.

- Per-vertical operational truth — separate tables per vertical.
- Shared cross-cutting infrastructure — overlay store, snapshot graph, indexer pipeline, drift events, webhooks.
- Three composition patterns — nested fields, promoted child entities, referenced CatalogEntries.
- Three variant axes on overlays — `locale`, `audience`, `market`; sparse, default deployment uses two audiences and one market.

## Search index providers

Search-engine choice is deployment configuration, not environment detection.
Set `deployment.providers.search` in `voyant.config.ts`; credentials configure
the selected provider but never select it:

```typescript
import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  deployment: {
    target: "node",
    providers: { search: "postgres" },
  },
})
```

`postgres` selects the first-party provider declared by this package. It uses
the same graph-declared Postgres resource as the application and never opens a
separate database pool from an environment variable. `typesense` remains
available and uses `TYPESENSE_HOST` plus `TYPESENSE_API_KEY`. The standard
self-hosted operator configuration uses `search: "none"` until search is
enabled.

Embedded hosts and tests can supply a custom implementation by selecting
`deployment.providers.search: "custom"` and passing either an `IndexerAdapter`
or `IndexerProvider` at the `catalog.indexer` runtime port. The direct adapter
form is useful when the host already owns the configured adapter instance:

```typescript
// voyant.config.ts
import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  deployment: {
    target: "node",
    providers: { search: "custom" },
  },
})
```

```typescript
import { catalogIndexerProviderPort } from "@voyant-travel/catalog/indexer/provider"
import type { IndexerAdapter } from "@voyant-travel/catalog-contracts/indexer/contract"
import { loadVoyantProject } from "@voyant-travel/runtime"

const indexer: IndexerAdapter = createCustomIndexer()

await loadVoyantProject({
  host: {
    runtimePorts: { [catalogIndexerProviderPort.id]: indexer },
  },
})
```

The explicit port is ignored for `none`, `typesense`, `algolia`, and every
other non-`custom` search selection. Those values remain authoritative and
resolve only their selected graph provider. With `custom`, an explicit host
port takes precedence over a graph-declared custom provider; without an
explicit port, the graph-declared custom provider resolves normally.

Algolia and other engines are external adapter packages. They implement
`IndexerAdapter` and `IndexerProvider` from
`@voyant-travel/catalog-contracts/indexer/contract`, publish a graph provider
for port `catalog.indexer`, and declare a matching selection such as
`{ role: "search", value: "algolia" }` or
`{ role: "search", value: "custom" }`. The deployment admits that package and
sets the corresponding `deployment.providers.search` value; no Algolia SDK or
vendor code belongs in `@voyant-travel/catalog`.

Adapter packages should run the test-framework-neutral conformance kit from
`@voyant-travel/catalog-contracts/indexer/conformance` in their own test suite:

```typescript
import { assertIndexerAdapterConformance } from "@voyant-travel/catalog-contracts/indexer/conformance"
import type { IndexerProvider } from "@voyant-travel/catalog-contracts/indexer/contract"

const indexerProvider: IndexerProvider = {
  create: (options) => createCustomIndexer(options),
}

await assertIndexerAdapterConformance({
  createAdapter: () => indexerProvider.create({ registries: new Map() }),
})
```

Provider-neutral maintenance uses the optional `IndexerAdapter.admin` surface
(`list`, `drop`, and `scan`). Raw Typesense collection/search maintenance APIs
are not public catalog package surface.

### Relevance comparison

`@voyant-travel/catalog/indexer/relevance` provides a curated travel corpus and
an adapter-level harness for comparing Postgres with Typesense (or another
approved baseline). It reports recall@k, NDCG@k, zero-result rate, and exact
facet-bucket parity. Provider scores are intentionally excluded from the
comparison because each engine normalizes relevance differently. Run it against
the real deployment adapters and retain the resulting report with the rollout
evidence; the built-in corpus is a minimum regression gate, not a replacement
for operator-approved travel judgments.

## Usage

The catalog plane is consumed by vertical modules; templates wire it together.

```typescript
import { defineFieldPolicy } from "@voyant-travel/catalog/contract"

export const productCatalogPolicy = defineFieldPolicy([
  {
    path: "title",
    class: "merchandisable",
    merge: "replace",
    drift: "medium",
    reindex: "entry-locale",
    snapshot: "on-book",
    query: "indexed-column",
    localized: true,
    visibility: ["staff", "customer", "partner"],
    editRole: "marketing",
    overrideFriction: "none",
    sourceFreshness: "sync",
  },
  // ...
])
```

See `docs/architecture/catalog-architecture.md` for the full contract and worked examples.

## Source-adapter runtime validation

```typescript
import { reserveRequestSchema } from "@voyant-travel/catalog/adapter/schemas"
import type { ReserveRequest } from "@voyant-travel/catalog/adapter/contract"

const request: ReserveRequest = reserveRequestSchema.parse(await req.json())
```

Reserve and cancel requests may include a `scope` matching live resolution plus
an `idempotency_key`; cancel results may return `status: "pending"` with
`pending_channel` for async upstream workflows.

External adapters that do not run the catalog package can import the same
schemas and types from `@voyant-travel/catalog-contracts/adapter/schemas` and
`@voyant-travel/catalog-contracts/adapter/contract`.

## Booking Session HTTP routes

`@voyant-travel/catalog` exports `createCatalogBookingEngineApiModule(...)` for
Booking Session v1. The module mounts the same Session lifecycle for staff and
public surface callers. Session Commit is the only booking creation authority; it
derives and executes Finance's durable command only after the exact Session
revision, Quote, Hold, buyer, and policy state have been validated:

- `/v1/admin/catalog/*`
- `/v1/public/catalog/*`

Templates provide the runtime dependencies instead of the package importing
deployment code:

```typescript
import { createCatalogBookingApiModule } from "@voyant-travel/catalog"

export const catalogBookingModule = createCatalogBookingApiModule({
  resolveDb: (c) => c.get("db"),
  resolveSourceRegistry: (c) => getBookingEngineRegistryFromContext(c),
  resolveOwnedHandlers: (c) => getOwnedBookingHandlerRegistryFromContext(c),
})
```

Apps that protect public routes by default must allow
`/v1/public/catalog`. Template-specific routes such as slots, admin order
management, checkout start, and booking snapshot enrichment stay in the
template.

## Catalog search HTTP routes

`@voyant-travel/catalog` also exports `createCatalogSearchApiModule(...)`,
`createCatalogSearchRoutes(...)`, and `mountCatalogSearchRoutes(...)` for the
plain JSON catalog search endpoint used by admin and public surface UIs:

- `POST /v1/admin/catalog/search`
- `POST /v1/public/catalog/search`

The module owns audience defaults: admin search uses the runtime
`defaultScope.audience`, while public search defaults to the `customer`
projection. Deployments provide the indexer and optional semantic executor per
request:

```typescript
import {
  createCatalogSearchApiModule,
  executeSemanticSearch,
  type EmbeddingProvider,
} from "@voyant-travel/catalog"

export const catalogSearchModule = createCatalogSearchApiModule({
  resolveRuntime: (c) => buildCatalogSearchRuntime(c),
  executeSearch: ({ adapter, embeddings, slice, request }) =>
    executeSemanticSearch({
      adapter,
      embeddings: embeddings as EmbeddingProvider | undefined,
      slice,
      request,
    }),
})
```

Search defaults to hybrid mode, downgrades to keyword when no embeddings are
available, and retries semantic/hybrid execution as keyword when the semantic
path fails. Pass `fallbackToKeywordOnSearchError: false` to fail closed instead.

Public API listing pages can request typed index-layer sorting and a compact
card projection from the public route:

```typescript
await fetch("/v1/public/catalog/search", {
  method: "POST",
  body: JSON.stringify({
    vertical: "products",
    query: "",
    mode: "keyword",
    sort: "price-asc",
    projection: "public surface-card",
    pagination: { limit: 12 },
    facets: [{ field: "categorySlugs[]" }, { field: "departureMonths[]" }],
  }),
})
```

Supported sort values are `relevance`, `price-asc`, `price-desc`,
`departure-asc`, and `newest`. Sorts are translated by the indexer adapter to
safe indexed fields such as `priceFromAmountCents` and `nextDepartureDate`; they
are not applied after app-side hydration.

When `projection: "public surface-card"` is present, the response keeps the raw
`hits`, `total`, and engine facet counts, and also includes `cards` with the
fields public surface product grids commonly need: localized name/slug, primary
category, media URLs, price-from and offer badge data, departure aggregates,
destinations, and coordinates.
