# Catalog sourced content — architecture

Status: draft / proposal — pre-implementation
Audience: anyone designing how Voyant displays, caches, and books rich content from external upstream sources (TUI direct, Voyant Connect peers, GDS, bedbanks).

This document fills a real gap in the catalog plane: there is currently no shared infrastructure for **rich detail content** on sourced rows. Search-shaped projections live in the indexer; live-volatile values flow through `liveResolve`; booking-time snapshots are deep but post-commit. Between those, **no layer exists** for "give me this sourced row's itinerary, media, departure dates, terms, room types so I can render it on a detail page or feed it to the booking engine."

This means today:

- The cruises vertical wires `adapter.fetchCruise(sourceRef)` directly into its detail route, bypassing the catalog plane (`packages/cruises/src/routes.ts:265`). Vertical-specific. Not a shared pattern.
- The booking journey's Configure step needs departures, options, and room types — for sourced rows, those don't exist anywhere standard.
- Storefront templates can't render a sourced product's detail page the same way as an owned product's. "5-day Turkey tour from TUI" can land in search results but has no detail page that pulls TUI's itinerary / media / departure schedule.
- Operators can't browse the full content of a sourced row in admin without falling back to the upstream's own UI.

This is a **prerequisite for Phase B** of [`booking-journey-architecture.md`](./booking-journey-architecture.md). The journey's descriptor-driven UI assumes the engine can reach a sourced row's full content; today it can't.

## 1. What we mean by "content"

For owned products, "content" is the union of:

- Identity / lifecycle (name, status, dates, currency)
- Marketing copy (description, highlights, inclusions, exclusions)
- Media (gallery, hero, day-strip)
- Itinerary (day-by-day plan, services per day, included activities)
- Variants / options (room types, departure dates, fare classes, cabin categories)
- Operational metadata (cancellation policy, payment terms, supplier notes, requirements)
- Per-traveler requirements (passport / visa / health for the route)

For sourced products, **the same content needs to be reachable**, sourced from the upstream and cached locally. The shape per vertical varies (a cruise has cabin categories + sailings; a hotel has room types + rate plans + meal plans; a tour has days + services + departures), but every vertical needs a known place to read from.

Importantly, **content is NOT what gets indexed**. The indexer takes a search-shaped projection of *some* fields (name, status, facets). The content layer is a superset: everything the detail page and the booking engine need.

## 2. What's already in place

- **`SourceAdapter` contract** — `connect`, `discover`, `liveResolve`, `reserve`, `cancel`. None of these returns rich content. `discover` emits indexer-shaped projections; `liveResolve` is for volatile-live single-field reads. (`packages/catalog/src/adapter/contract.ts`)
- **`CatalogProjection`** — the shape `discover` returns. Field-policy-declared fields only. Not rich content. (`packages/catalog/src/adapter/contract.ts:79`)
- **`ResolvedView`** — overlay-merged indexer projection. Same depth as `CatalogProjection` plus editorial overrides. Still not rich content. (`packages/catalog/src/overlay/resolver.ts:55`)
- **`bookingCatalogSnapshot.frozenPayload`** — captured at book time. Deep, but only for committed bookings; can't be the source for a pre-book detail page. (`packages/catalog/src/snapshot/schema.ts`)
- **Cruises' ad-hoc fetch** — `CruiseAdapter.fetchCruise(sourceRef)` directly called from the cruises module's routes. Vertical-specific. Not part of the catalog-plane contract. (`packages/cruises/src/routes.ts:265`)
- **No cache table** — no `*_sourced_content`, `catalog_content_cache`, or similar exists.
- **No durable sourced-entry store** — `sync.ts` discovers projections into the indexer + field-policy registry but does NOT persist a local sourced-entry row (`packages/catalog/src/booking-engine/sync.ts:121`). `Provenance` is a TypeScript interface (`packages/catalog/src/provenance.ts:33`), not a table. The `catalog` package's `schema.ts` exports overlay, snapshots, and quotes only — no provenance storage. This is a foundational gap; before the content cache can dispatch owned-vs-sourced reads, sourced-entry identity, provenance, last-seen, and source refs must live somewhere durable.
- **Drift events are field-level only** — `FieldDrift` carries `field_path, severity, before, after, had_overlay`. No locale, no content-section, no etag. Adequate for indexed-field drift; insufficient for content drift (`packages/catalog/src/drift/events.ts:18`).
- **Overlay resolver is field-policy-bound** — `resolveOverlay` iterates only over fields keyed in the field-policy registry (`packages/catalog/src/overlay/resolver.ts:210`). Nested content blobs (`days[]`, `media[]`, `cabinCategories[]`) are not addressable by the current resolver.

The cruise-style ad-hoc pattern works for one vertical but doesn't generalize, and three of the catalog plane's primitives (provenance store, drift event shape, overlay resolver scope) need extension before a content cache can be built on top of them. We address each as part of this proposal.

## 2.5. Prerequisite: durable sourced-entry store

This is the load-bearing prerequisite. The content cache, the read service, drift invalidation, and snapshot capture all assume there's a durable local row per sourced entity that records *what we know about it locally*. Today there isn't. We add one before anything else.

### 2.5.1. Schema

```sql
-- packages/catalog/src/schema-sourced-entries.ts (new)
catalog_sourced_entries (
  id                       text primary key,    -- typeid: cse_*; canonical Voyant-side id
  entity_module            text not null,       -- "products", "cruises", "accommodations", ...
  entity_id                text not null,       -- typeid in the vertical (prod_*, crus_*, ...)

  -- Provenance (mirrors Provenance interface, made durable)
  source_kind              text not null,
  source_provider          text,
  source_connection_id     text,
  source_ref               text,
  source_freshness         text not null,       -- "static" | "volatile" | "live"
  last_sourced_at          timestamptz,

  -- Lifecycle
  status                   text not null default 'active', -- "active" | "withdrawn" | "delisted"
  first_seen_at            timestamptz not null default now(),
  last_seen_at             timestamptz not null,

  -- Indexed-projection capture (denormalized snapshot of what discover()
  -- returned, persisted locally so thin fallback and synthesizer reads
  -- have a canonical source — not a search index round-trip; see §3.6).
  projection               jsonb not null,
  projection_etag          text,
  projection_seen_at       timestamptz not null,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (entity_module, entity_id),
  unique (source_kind, source_connection_id, source_ref)
)
-- index on (entity_module, source_kind)             — vertical × source listings
-- index on (status, last_seen_at)                    — withdrawal sweepers
-- index on (source_kind, source_connection_id, last_sourced_at) — per-connection age
```

`catalog_sourced_entries` is the single durable record keyed two ways: by Voyant-side `(entity_module, entity_id)` for read-path lookup, and by upstream-side `(source_kind, source_connection_id, source_ref)` for discover-time idempotency.

### 2.5.2. Discover writes here

`sync.ts` is extended: each projection from `adapter.discover` upserts a sourced-entry row before the indexer write. The projection itself is stored in `projection jsonb` — this is the **canonical local copy of what the adapter said**, used by:

- The read service to dispatch owned-vs-sourced (§3.3).
- The thin-content synthesizer when no `getContent` is available (§3.6) — pulled from this column, NOT from Typesense.
- The `pickBestCachedLocale` query when there's no cache row yet but a projection exists.

Owned products do NOT have a row here — `provenance.source_kind === "owned"` reads provenance from the vertical's owned schema, not from `catalog_sourced_entries`. The sourced-entry store is sourced-only.

### 2.5.2.1. Discovery does not publish

Landing in the sourced-entry store is not the same as being sellable. Each projection is emitted per slice through a channel publication gate resolved from its `(source_kind, source_connection_id)` pair against `channel_source_publications` (ADR 0020 §8): default-deny, connection rule beating source-kind rule, missing or inactive channel denying outright.

The gate applies to customer, partner, and supplier slices only. **Staff slices stay ungated** — an operator has to be able to browse a connected supplier's inventory in admin in order to decide what to publish, and manual booking discovery reads the same staff slice. Publication governs merchandising, not visibility to the operator.

Returning `null` from the per-slice builder *is* the gate: `reindexEntity` treats it as "this entry does not belong in this slice" and deletes any document already there, so revoking publication takes effect on the next pass with no separate teardown path.

The catalog document builder applies the same gate when rebuilding a single entry from its stored projection, so a publication-rule change can drive a targeted reindex rather than waiting for the next discovery pass.

Before this existed, discovery emitted every projection into every slice, and attaching a supply connection published that supplier's whole catalogue to the operator's live storefront (voyant#4089).

### 2.5.2.2. Provenance is projected into the index

Every catalog collection carries `isSourced`, `sourceKind`, and staff-only `sourceConnectionId`, composed into each vertical's field-policy registry rather than declared per vertical so the facet means the same thing everywhere.

Ownership is a catalog-plane fact, not a vertical one: an entry in the `products` collection may be an operator's own programme or a supplier's package. Without these fields, search could not see the answer that `catalog_sourced_entries` already held, and consumers were reduced to inferring ownership from `supplyModel` or an id prefix — both of which correlate with ownership today, and neither of which states it.

### 2.5.3. Provenance reads

The `readProvenance(db, entityModule, entityId)` helper (referenced throughout this doc) becomes:

```ts
async function readProvenance(db, entityModule, entityId): Promise<Provenance & { entry_id: string } | null> {
  // Owned check first — vertical-specific. If the vertical's table has
  // a row with no source link, treat as owned.
  const ownedRow = await readOwnedRow(db, entityModule, entityId)
  if (ownedRow) return { source_kind: "owned", source_freshness: "static" }

  // Sourced — read from catalog_sourced_entries.
  const entry = await db.select().from(catalogSourcedEntries)
    .where(and(eq(.entity_module, entityModule), eq(.entity_id, entityId)))
    .limit(1)
  return entry ?? null
}
```

This single function anchors every owned-vs-sourced dispatch in the doc.

### 2.5.4. Why catalog and not per-vertical

Provenance is a property of the catalog plane (every adapter produces it), not of any vertical (the products module shouldn't know how to read TUI's connection id). One table in `packages/catalog` keeps the contract uniform; verticals consume it via the read service. Per-vertical *content* still goes in per-vertical tables (§3.2) — only the entry/provenance + projection capture are centralized.

## 3. Proposed shape

Three new pieces:

1. A new **`SourceContentAdapter`** capability — adapters that can serve rich content declare it.
2. A **per-vertical content cache** — each vertical owns a table that mirrors its owned-content schema for sourced rows.
3. A **read service** with owned-vs-sourced dispatch — call one function, get content regardless of source.

### 3.1. Adapter contract extension

`SourceAdapter` gains an optional method:

```ts
export interface SourceAdapter {
  // ... existing methods unchanged ...

  /**
   * Returns rich entity content for one entity_id, in one locale.
   * Distinct from liveResolve — this returns the durable detail-page
   * content (itinerary, media, options, terms), not volatile live
   * values.
   *
   * Capability-gated by `supportsContentFetch`. The catalog plane's
   * content cache calls this on a refresh cadence (TTL or drift event)
   * and stores the result in the per-vertical, per-locale content
   * table.
   */
  getContent?(
    ctx: SourceAdapterContext,
    request: GetContentRequest,
  ): Promise<GetContentResult>
}

export interface GetContentRequest {
  entity_module: string
  entity_id: string
  /** BCP 47 tag (e.g. "ro-RO", "de-DE", "en-GB"). Required — locale is
   *  load-bearing in this contract. See §3.5 for the full multi-
   *  language posture. */
  locale: string
  /** Other scope axes — kept separate from locale for clarity. */
  market?: string
  currency?: string
}

export interface GetContentResult {
  entity_module: string
  entity_id: string
  source_ref: string
  /** The locale this payload is in. May differ from request.locale
   *  when the upstream did its own fallback (e.g. requested ro-RO,
   *  returned en-GB because it had no Romanian content). The catalog
   *  plane records this so subsequent fallback decisions know what's
   *  actually cached vs. what was requested. */
  returned_locale: string
  /** True when the upstream marks the payload as machine-translated.
   *  Read paths can opt out of machine-translated rows for ops-side
   *  views (see §3.5.5). */
  machine_translated?: boolean
  /**
   * Vertical-specific content payload. The catalog plane treats it as
   * opaque; the vertical's content service knows how to read it (and
   * validates against `content_schema_version` before writing to the
   * cache). The shape is the vertical's existing owned-content shape
   * (e.g. for products: { product, options[], days[], media[] }).
   */
  content: unknown
  /** Vertical-managed schema version of the `content` payload (e.g.
   *  "products/v3", "cruises/v1"). Cache writes are gated on the
   *  vertical's validator for this version; cache reads ignore rows
   *  with an unknown / older version. Lets us evolve content shapes
   *  without invalidating mass-rewriting cache rows. */
  content_schema_version: string
  /** When the upstream itself last modified this content (their
   *  updated_at, ETag-derived timestamp, etc.). Used by the reconciler
   *  / drift detector and by snapshot audit trails. */
  source_updated_at?: Date
  /** When the upstream considers this content fresh until. Hint for
   *  the catalog plane's cache; not load-bearing if absent. */
  fresh_until?: Date
  /** ETag-style marker for HTTP-cache revalidation on the next pull. */
  etag?: string
}

export interface AdapterCapabilities {
  // ... existing ...
  /** Whether the adapter implements `getContent`. */
  supportsContentFetch?: boolean
  /** BCP 47 tags this connection can serve content in. The catalog
   *  plane uses this to plan backfills (preload all deployment-
   *  configured locales) and to render an empty-state when the
   *  requested locale is not supported. Empty / absent → unknown,
   *  probe per-call. */
  supportedContentLocales?: ReadonlyArray<string>
  /** Adapter owns content caching; the catalog plane reads `getContent`
   *  as pass-through and does not read/write `*_sourced_content`. */
  ownsContentCache?: boolean
  /** Adapter owns live availability caching; the catalog plane must not
   *  memoize `liveResolve` results. */
  ownsAvailabilityCache?: boolean
}
```

Adapters that don't implement `getContent` (the demo upstream, simple bedbanks that only have prices) declare `supportsContentFetch: false`. The catalog plane then renders thin content from the indexer projection — same as today, no regression.

`@voyant-travel/catalog` also ships zod runtime schemas for the public
`SourceAdapter` payload contract under `@voyant-travel/catalog/adapter/schemas`.
Consumers that cross HTTP, queue, RPC, or adapter-process boundaries should
validate with those shipped schemas rather than maintaining parallel local
validators.

The locale field is required, not optional. Adapters that genuinely have only one locale (a single-language tour operator) accept any value and return their canonical content with `returned_locale` pointing at what they actually have. The contract is "tell me your best for this locale" — never "give me whatever you have."

### 3.1.1. Scoped reserve and async cancellation

Booking-forwarding adapter writes carry their own request scope. `ReserveRequest`
and `CancelRequest` may include the same `{ locale, audience, market, currency? }`
shape used by `LiveResolveRequest.scope`, plus an `idempotency_key` for
replay-safe retries. These fields are optional so existing adapters remain
valid, but multi-market suppliers should treat them as the source of truth for
market-sensitive booking writes rather than deriving scope from connection
credentials.

Cancellation can be synchronous or async. Adapters that can confirm the upstream
state during the `cancel` call return terminal statuses: `"cancelled"`,
`"refused"`, or `"failed"`. Adapters that submit the cancellation out of band
(email, partner portal, batch export, fax) declare
`supportsSyncCancellation: false` and may return `status: "pending"` with an
optional `pending_channel` such as `"partner portal"`. The booking engine
surfaces that channel in the cancel result for audit and consumer messaging;
callers should show "cancellation in progress" until a later transition settles
the booking.

The adapter owns that later transition. Depending on the supplier, it can arrive
through a drift event, connector-managed polling, the next live/status check, or
another reconciliation job. The framework models and preserves the pending
state; it does not add a generic polling loop here.

### 3.2. Per-vertical content cache

Each vertical that needs rich content for sourced rows adds a sibling table mirroring its owned-content schema. **Per-vertical, not generic.** Cruises already proves the shape per-vertical works; we formalize the pattern.

The cache is keyed on **(entity_id, locale, market)** — locale is the dominant content axis (§3.5); `market` is included because some adapters serve content per market (cruise lines often have different itineraries / inclusions for the EU vs. US market; bedbanks sometimes vary descriptions per source-market). `market` is nullable: when the adapter declares no market sensitivity, all reads use `market = NULL` and there's one row per locale. Source identity is NOT in the key — the entity_id resolves through `catalog_sourced_entries` (§2.5) to the (source_kind, source_connection_id, source_ref) tuple, so we don't duplicate that across cache rows.

Examples:

```sql
-- packages/products/src/schema-sourced-content.ts (new)
products_sourced_content (
  entity_id              text not null,           -- typeid: prod_*, matches catalog
  locale                 text not null,           -- BCP 47, e.g. "ro-RO"
  market                 text not null default '*', -- '*' = no market sensitivity
  -- denormalized "content" payload, vertical-shaped + versioned
  payload                jsonb not null,          -- { product, options[], days[], media[] }
  content_schema_version text not null,           -- e.g. "products/v3"
  returned_locale        text not null,           -- what the upstream actually served
  machine_translated     boolean not null default false,
  source_updated_at      timestamptz,             -- upstream's own last-modified
  fetched_at             timestamptz not null,
  fresh_until            timestamptz,
  etag                   text,
  fetch_status           text not null,           -- "ok" | "stale" | "error" | "unsupported"
  fetch_error            text,
  primary key (entity_id, locale, market),
)
-- index on (locale, fresh_until)                 — for "what's stale in ro-RO?"
-- index on (entity_id, returned_locale)          — for fallback diagnostics
-- index on (content_schema_version)              — for migrations / cache flushes per version

-- packages/cruises/src/schema-sourced-content.ts (new)
-- replaces the cruises-routes.ts ad-hoc pattern with a shared cache
cruises_sourced_content (
  entity_id text, locale text, market text default '*', payload jsonb,
  content_schema_version text, returned_locale text, machine_translated bool,
  source_updated_at timestamptz, fetched_at, fresh_until,
  etag, fetch_status, fetch_error,
  primary key (entity_id, locale, market),
)

-- ... and so on per vertical that adopts the pattern ...
```

**Validation before write.** Every vertical exports a Zod (or equivalent) validator for its `content_schema_version`. The cache write goes through the validator; rows that don't validate are rejected (and surfaced to ops as adapter integration bugs) rather than written. On read, rows with a `content_schema_version` the vertical no longer recognizes are treated as cache misses — same path as a stale row. Cache flushes on schema bumps are a single `DELETE WHERE content_schema_version != current` per vertical, no migration of jsonb payloads.

Why per-vertical rather than one big `catalog_content_cache(payload jsonb)` table:

- The vertical knows its content shape and can validate / migrate / index columns out of `payload` without coordinating with other verticals.
- Per-vertical TTLs and refresh policies make sense (a cruise content blob is much more stable than a hotel rate plan).
- Drift signals are per-vertical: cruise drift events care about sailing changes, hotel drift events care about room availability. Routing the cache invalidation through the vertical keeps responsibilities clean.
- Migration is safer: a problem in the products cache doesn't take out cruise rendering.

Why per-locale rows rather than `payload jsonb` keyed by locale: independent TTLs, independent fetch failures, simple "missing locale" SQL queries, per-locale invalidation on drift. See §3.5.2 for the full reasoning.

### 3.3. Read service with owned-vs-sourced dispatch

Each vertical exposes a `getContentForEntity(db, entityId, scope)` function that takes a locale preference chain and returns the best match:

```ts
export async function getProductContent(
  db: AnyDrizzleDb,
  entityId: string,
  scope: ContentScope,
): Promise<ContentLocaleResolution<ProductContent> | null> {
  const provenance = await readProvenance(db, "products", entityId)
  if (!provenance || provenance.source_kind === "owned") {
    // Owned path — read from the products tables (current implementation).
    // Owned content is locale-resolved against product_translations.
    return readOwnedProductContent(db, entityId, scope)
  }
  const adapter = sourceAdapterRegistry.resolveOrThrow(provenance.source_kind)
  const ownsCache = adapter.capabilities.ownsContentCache === true

  if (ownsCache && adapter.getContent) {
    // Pass-through mode — the adapter is authoritative for freshness,
    // locale fallback, and cache invalidation at its source boundary.
    const fresh = await adapter.getContent(adapterCtx, {
      entity_module: "products",
      entity_id: entityId,
      locale: scope.preferredLocales[0],
      market: scope.market,
      currency: scope.currency,
    })
    return resolveFresh(fresh, scope)
  }

  // Catalog-owned mode — pick the best cached locale row against the
  // preference chain (one query, no N+1; see §3.5.3).
  const best = await pickBestCachedLocale(db, "products", entityId, scope)

  if (best && !isStale(best, scope)) {
    // Fresh cache hit — return it, no adapter round-trip.
    return resolveCached(best, scope)
  }

  if (best && isStale(best, scope)) {
    // SWR — return the stale row immediately, schedule a fire-and-
    // forget refresh so the *next* read sees fresh content. Concurrent
    // stale reads for the same (entity, locale) dedupe via the
    // singleflight registry below; only one adapter call is in flight
    // at a time.
    scheduleBackgroundRefresh(adapter, "products", entityId, scope)
    return resolveCached(best, scope)
  }

  // No cache row at all for any preferred locale — must block on the
  // adapter; we have nothing to serve.
  if (!adapter.getContent) {
    // Adapter doesn't support content fetch. Synthesize the most
    // complete content blob we can from projection + overlay + plane
    // metadata. Same return shape as getContent — see §3.6.
    return synthesizeContentFromProjection(db, "products", entityId, scope)
  }
  const fresh = await singleflight.do(
    cacheKey("products", entityId, scope.preferredLocales[0]),
    () => adapter.getContent!(adapterCtx, {
      entity_module: "products",
      entity_id: entityId,
      locale: scope.preferredLocales[0],
      market: scope.market,
      currency: scope.currency,
    }),
  )
  await writeCachedSourcedContent(db, "products", entityId, fresh)
  return resolveFresh(fresh, scope)
}
```

Detail routes (operator and storefront) call this single function. Owned products keep working unchanged. Sourced products read from cache (locale-resolved); adapters that don't support content fetch synthesize the most complete content shape they can from projection + overlay + plane metadata (§3.6) — same return type as `getContent`, so consumers don't branch.

### 3.3.1. Cache ownership modes

The default mode is **catalog-owned caching**: sourced content returned by
`getContent` is validated, written to the vertical's `*_sourced_content`
table, served with locale fallback, and refreshed through SWR / drift events.
This is the right mode for ordinary upstreams where Voyant is the durable
read surface for detail-page content.

Adapters can declare `ownsContentCache: true` when their own source boundary
already has authoritative freshness semantics — for example, a Voyant Connect
peer, an aggregator that sits in front of another cached deployment, or an API
fronted by an upstream edge cache with explicit invalidation. In that mode,
the catalog plane treats `getContent` as pass-through: every read calls the
adapter, no `*_sourced_content` row is read or written, and stale cached rows
are not used as SWR fallback. Content drift events still flow so downstream
projections, search documents, overlays, and other derived state can be
invalidated; there may simply be no content-cache row to evict.

`ownsAvailabilityCache: true` applies the same rule to `liveResolve`: the
adapter owns live availability / price freshness and the catalog plane must not
memoize those results. Content and availability are independent flags because
an adapter may cache stable content while resolving volatile availability
directly, or the reverse.

Pass-through content mode also moves locale fallback responsibility to the
adapter. The catalog plane sends the most-preferred locale; the adapter may
fallback internally, but it must set `returned_locale` to the locale actually
served. `supportedContentLocales` remains useful for planning and UI hints, but
the catalog plane no longer walks cached rows across `ro-RO -> ro -> en-GB` for
that adapter.

### 3.4. Refresh policy: SWR with cross-worker singleflight

Two refresh paths, both invisible to operators:

1. **TTL** — `fresh_until` from the adapter, or a vertical default (cruises: 24h, hotels: 4h, products: 24h). On read, if `fresh_until < now()`, the read returns the **stale row immediately** and schedules a fire-and-forget refresh. Next read sees the fresh row. This is stale-while-revalidate (SWR): customer-facing latency is always cache latency, never adapter latency, even when the adapter is slow or briefly down.
2. **Drift events** — when a content-drift event fires (§3.4.1), the catalog plane invalidates affected cache rows (sets `fresh_until = now()`). The next read serves stale + triggers refresh, same as TTL expiry.

#### Cross-worker singleflight

In-process `Map`-based singleflight only dedupes within one Node process. Voyant
deployments may run multiple processes or pods, so a hot stale row would
otherwise trigger concurrent `getContent` calls from every replica. We need
DB-level dedup.

Two equivalent options; pick one per vertical:

- **Postgres advisory lock** — `pg_try_advisory_lock(hashtext('content:' || entity_module || ':' || entity_id || ':' || locale || ':' || market))` before refresh; release after write. Concurrent stale-readers across workers either get the lock (refresh) or skip (return stale, let the lock-holder do the work). Zero schema cost.
- **`content_refresh_inflight` table** keyed on `(entity_module, entity_id, locale, market)` with `started_at` and `worker_id`. Caller `INSERT ON CONFLICT DO NOTHING`; row-presence acts as the lock. Slightly heavier (a row write) but visible in queries — useful for "what's currently refreshing" diagnostics.

In-process Map *also* runs as a fast-path inside each process so two requests on
the same replica still collapse before they hit the DB.

#### Cache miss is the one blocking case

If there's no row at all for any preferred locale, the read MUST wait for the adapter (we have nothing to return). This is rare in steady state because discovery / backfill populates the sourced-entry projection (§2.5) before customer reads land — and the synthesizer (§3.6) can serve from that projection while a real `getContent` is in flight.

#### No operator-facing manual refresh button

Operators don't think in cache terms; the cache is an internal optimization, not a surface they manage. If something is wrong, drift events handle it; if drift is missing, that's an adapter-integration bug to fix, not something an operator should paper over with a button.

**Engineering / SRE debug tooling can manually invalidate cache rows** (an internal CLI script, a `wrangler` command, or an `/internal/_debug/...` route gated behind a developer flag). This is for cases where drift detection misfires or a faulty cache row needs surgical eviction during incident response. It is not part of the operator UI surface.

#### Snapshot bypass

Snapshot capture (§5.1) is the one exception that bypasses SWR: the booking engine MUST refresh synchronously at commit time so the snapshot reflects what the customer actually agreed to. That path is documented as refresh-with-fallback in §5.1 — it's not a read, it's a write-time freshness guarantee.

#### No scheduled background refresher

A worker that walks expired rows and refreshes proactively is **not planned**. SWR + drift events covers the same surface area without a worker, schedule, backlog monitor, or dead-letter queue. If we ever observe high p99 latency on first-reads of cold rows, we'd revisit — but that's a backfill problem, not a refresh problem.

### 3.4.1. Content drift events

The existing `FieldDrift` / `CatalogDriftEvent` shape (`packages/catalog/src/drift/events.ts`) is field-policy-bound — it carries `field_path, severity, before, after, had_overlay`. That's right for indexed-field drift but doesn't speak to content drift, which has different invalidation granularity (per-locale, per-content-section, per-etag).

Add a sibling event type:

```ts
export interface ContentDriftEvent {
  /** TypeID — same lineage as CatalogDriftEvent. */
  id: string
  entity_module: string
  entity_id: string
  /** When known: the locale that drifted. NULL means "all locales". */
  locale?: string
  /** When known: market that drifted. NULL means "all markets". */
  market?: string
  /** Coarse classification of what changed. */
  kind:
    | "content_changed"        // upstream signaled new content via etag/source_updated_at
    | "content_locale_added"   // upstream added a locale we didn't previously have
    | "content_invalidated"    // explicit invalidation (debug tooling, ops escalation)
  /** ETag we last cached, when the event source can compare. */
  previous_etag?: string
  /** ETag the upstream now reports. */
  current_etag?: string
  /** Optional content-section: when only a section drifted, the cache
   *  could in theory do a section-scoped refresh. v1 always re-pulls the
   *  whole content blob; this field is for future surgical refreshes. */
  section?: string
  detected_at: Date
}
```

When a content-drift event fires, the cache invalidates rows matching `(entity_module, entity_id, locale, market)` — wildcards on locale/market when those event fields are null. The next read for any matched row goes through SWR's stale-serve + background-refresh path.

Owned products use the existing `FieldDrift` events; sourced products use `ContentDriftEvent` for content-shaped invalidation. Field-level drift (e.g. `name` changed on the projection) still uses `FieldDrift` because the projection IS field-policy-shaped.

## 3.5. Multi-language as a first-class axis

Voyant is multilingual at every layer of the catalog plane it already covers — the indexer is sliced per locale (`IndexerSlice.locale`), the overlay store is keyed on `(entity, field, locale, audience, market)`, owned products carry `product_translations` / `product_option_translations` / `option_unit_translations` tables, BCP 47 codes are the lingua franca (`@voyant-travel/utils/languages`). **Sourced content has to match this posture.** Treating it as a "cache afterthought" — one canonical locale stored, translation deferred — silently degrades sourced rows everywhere a non-English customer or operator looks at one.

Real adapters reflect this:

- TUI Connect serves content in 20+ languages; an operator selling TUI inventory in Romania expects ro-RO content, an operator selling in Germany expects de-DE.
- Bedbanks (Hotelbeds, Expedia) routinely return descriptions per locale.
- Cruise lines often have CMS content per market (en-US for North America, en-GB + de + fr + es for Europe).

The catalog plane should not flatten that.

### 3.5.1. Adapter contract is locale-aware

The `getContent` request defined in §3.1 takes a required `locale` (BCP 47) and the result returns a `returned_locale` that may differ. This keeps the contract explicit — adapters MUST tell us which locale they served, no inference. `AdapterCapabilities.supportedContentLocales` lets adapters declare ahead of time which locales they can serve, so the catalog plane can plan backfills against deployment-configured locales without per-call probing.

When the upstream produced a machine translation (rather than authored content), the adapter sets `machine_translated: true`. The read service can be told to skip those rows in operator-side views (see §3.5.5).

### 3.5.2. Per-locale cache rows

The cache table from §3.2 is keyed on **(entity_id, locale)** rather than entity_id alone. Why per-locale rows rather than a single row with `payload jsonb` keyed by locale:

- **Per-locale TTLs.** TUI's de-DE content might refresh hourly, ro-RO daily. Independent `fresh_until` per row.
- **Per-locale fetch failures don't cascade.** If the adapter's en-GB endpoint times out, ro-RO content is still readable.
- **Backfill queries.** "Which products are missing fr-FR?" is a single SQL query against `(entity_id, locale)`; with a JSON map, it's a JSONB scan.
- **Per-locale invalidation on drift.** Drift events name a locale; we invalidate just that row.
- **Symmetric with `product_translations`.** Owned and sourced read paths can share more code.

### 3.5.3. Locale negotiation: read-side fallback chain

`getContentForEntity` takes a **preference chain**, not a single locale. Walks the chain until it finds a row, falls back gracefully when content for the requested locale doesn't exist:

```ts
export interface ContentLocaleRequest {
  /** Ordered preference, most-preferred first. The deployment's
   *  configured fallback chain is appended after caller's preference,
   *  so a ro-RO storefront request resolves like
   *  ["ro-RO", "ro", "en-GB", "en", "*any*"]. */
  preferredLocales: ReadonlyArray<string>
  /** When true, accept machine-translated content. False for ops-side
   *  views where operators want to see "real" content from the upstream
   *  before deciding whether to override. */
  acceptMachineTranslated?: boolean
}

export interface ContentLocaleResolution<T = unknown> {
  content: T
  /** Which locale was actually served. */
  served_locale: string
  /** "exact" — preference matched directly.
   *  "language_match" — language tag matched but region didn't (asked
   *      for "fr-CA", got "fr-FR").
   *  "fallback_chain" — fell through to a deployment-default locale.
   *  "any" — last resort, served whatever the cache had. */
  match_kind: "exact" | "language_match" | "fallback_chain" | "any"
  machine_translated: boolean
}
```

The read service does the chain walk in SQL: pull all available locales for the entity in one query, score them against the preference chain, return the best. One query, no N+1. When **no** locale is available (cache miss for every entry), fall through to the live adapter fetch with the most-preferred locale — same path as §3.3 today, just locale-aware.

For adapters that declare `ownsContentCache: true`, this SQL fallback chain is
not available because the catalog plane deliberately does not read cache rows.
Those adapters receive the most-preferred locale and own any upstream fallback
they want to perform; `returned_locale` is the contract marker that tells the
catalog plane what was actually served.

### 3.5.4. Editorial overlays compose on top — content-shape-aware merger

The existing `catalog_overlay` table now keys logically on `(entity, node_kind, node_key, field_path, locale, audience, market)`. **Overlays already work per-locale.** Existing flat rows are `root/root`. For sourced rows, an operator can curate a `ro-RO` overlay on top of what the adapter served (or didn't serve) — same machinery. Overlay merge happens at read time after locale resolution: pick the best content row, then layer locale-matching overlays on top.

But the existing `resolveOverlay` (`packages/catalog/src/overlay/resolver.ts`) is field-policy-bound — it walks only the fields declared in the field-policy registry, which are flat indexed fields like `title` and `cancellation_policy_rules`. Content blobs are nested (`days[3].description`, `media[0].caption`, `cabinCategories[]`) and not addressable by the current resolver. We need a richer merge engine for content.

Two changes:

1. **`field_path` becomes a JSON-pointer or node-local field path** for content overlays. Root content uses pointers such as `/product/name` or `/media`; nested content uses stable `node_kind` / `node_key` plus a field inside that node, such as `node_kind=itinerary-day`, `node_key=day_abc`, `field_path=description`. Positional paths like `/days/3/description` are not valid durable targets because provider reordering can retarget them.
2. **A per-vertical content-shape-aware merger.** Each vertical that adopts content cache exports a `mergeOverlaysIntoContent(payload, overlays)` function. It walks `overlays`, resolves stable node keys to the current payload location, and applies each overlay. Verticals own this because the content shape is theirs; the catalog plane stays neutral.

Read-time merge order, after locale resolution picks the best content row:

```
content = cached.payload
for overlay in overlaysFor(entity, locale, audience, market):
  pointer = vertical.resolveOverlayPointer(content, overlay)
  applyJsonPointerOverlay(content, pointer, overlay.value)
return content
```

Overlay edits do NOT invalidate the content cache (read-time merge keeps them orthogonal — covered earlier). The overlay store's existing per-(entity, locale) caching applies to sourced reads symmetrically.

This means an operator can ship Romanian content for a TUI product *before* TUI publishes a ro-RO version — an overlay row at `/product/description` with `locale = "ro-RO"` covers it. When TUI later ships ro-RO natively, the operator can decide to keep their override (overlay wins) or remove it (fall back to the upstream).

Overlay writes carry an expected version when a human editor is replacing or clearing a row. The write path appends history with before/after values and refuses stale versions with a conflict, so comparison/revert UI does not silently overwrite another editor's work.

#### Validation guard

The content-shape-aware merger validates the result against the vertical's `content_schema_version` validator (§3.2). An overlay that produces an invalid content shape (operator typo, schema mismatch) is logged + skipped at merge time rather than corrupting the read; the dashboard surfaces "overlay X failed validation" so ops can fix it. This is necessary because content overlays can write arbitrary JSON into nested positions where the type matters.

### 3.5.5. Machine translation: opt-in policy, never implicit

Voyant does not auto-translate sourced content by default. When an operator chooses to (via deployment config: "fill missing locales by machine-translating from English"), the translator runs at content-fetch time and writes a row with `machine_translated: true`. The read service can be told `acceptMachineTranslated: false` to skip those rows in operator-side views.

Translation provider is wired via the existing pattern (Voyant Cloud AI gateway, OpenAI, DeepL, internal model — same provider story as embeddings). Out of scope for this doc; the contract is "machine_translated content rows exist, are flagged, and the read path can include or exclude them."

### 3.5.6. Backfill and supportedContentLocales

When a deployment configures its set of `DEFAULT_SLICES` (operator starter ships with en-GB; storefronts add ro-RO, de-DE, etc.), an admin script can call `adapter.capabilities.supportedContentLocales` (when known) and preload content for every entity × deployment-locale matrix. Background job; out of v1 scope but the data shape supports it cleanly.

For adapters that don't declare `supportedContentLocales`, the cache populates lazily — first read in a new locale fetches and caches.

### 3.5.7. The journey + storefront

The booking journey's locale arrives via `BookingDraft.scope.locale` (set from `accept-language` for the storefront, from the operator's preference for admin). It flows down to:

- The Configure / Accommodation / Add-ons sub-step content via `getContentForEntity`.
- The descriptor's labels (`paxBands[].label`, `addonGroups[].label`) — which themselves come from the content layer, not hardcoded English.
- The pricing breakdown's line-item labels.

If the wizard runs in ro-RO and the upstream served en-GB content (no Romanian available), the `match_kind` and `served_locale` fields surface in the UI as a small "served in English" hint, so the customer knows. The booking still commits — fallback is a degradation, not a failure.

## 3.6. Thin-content fallback: as complete as we can legitimately make it

When an adapter declares `supportsContentFetch: false`, the read service falls through to a per-vertical synthesizer. Its job is **to produce the most complete content blob it can** from what the catalog plane already knows — not a minimum-viable stub. The return shape is identical to what `getContent` produces; consumers (detail pages, the journey, snapshot capture) cannot tell the two paths apart from the type signature. Fields the synthesizer cannot fill render as **typed empty states** (`media: []`, `description: null`), never as missing properties.

Three sources feed the synthesizer, in priority order:

1. **The durable sourced-entry projection** (`catalog_sourced_entries.projection`, §2.5). Every field the adapter declared via field policy at `discover` time was persisted there. This is the canonical local copy — NOT a Typesense round-trip. Search indexes are optimized for full-text/facet queries, not point-reads of rich detail; reading from the durable store is faster, schema-stable, and survives Typesense rebuilds. (Earlier doc revisions said "from the indexer projection" — that was wrong; corrected here.)
2. **The editorial overlay** (`catalog_overlay`). Locale-aware operator-curated content layered on top per §3.5.4 — JSON-pointer paths, content-shape-aware merger. An operator that ships ro-RO copy for a thin-source product fills in fields the adapter never sent. Overlay merge runs at synthesizer time the same way it runs after a full `getContent` — the read paths are symmetric, so an operator's ro-RO description on a TUI product looks identical whether TUI's adapter is rich or thin.
3. **Catalog plane metadata.** Provenance (`source_kind`, `source_provider`, supplier link, `connection_id`), market / audience scope, drift status, last-seen timestamps. This powers UI hints ("served by Bedbank XYZ", "limited content available") and is part of the synthesized output regardless of which path produced it.

Per-vertical mappings (illustrative — each vertical owns its own synthesizer):

- **Products** (`{ product, options[], days[], media[], policies[] }`): `product` populated from projection + overlay (name, status, summary, dates, currency, supplier, country, duration, departure city if indexed). `media[]` populated from projection's primary image plus any media URLs the projection carries. `policies[]` populated from any indexed cancellation/payment summaries plus overlay-supplied policy bodies. `options[]` and `days[]` empty arrays — adapters that don't implement `getContent` typically don't expose these granularly.
- **Cruises** (`{ cruise, sailings[], cabinCategories[], itineraryStops[] }`): `cruise` populated from projection (line, ship, marketing copy, hero media). `itineraryStops[]` populated from the projection's port slice when indexed as a cruise-level overview/fallback. `sailings[]` populated from indexed departure dates when present and keeps richer sailing detail, including per-sailing `itinerary_stops`, embark/disembark ports, and browse prices. Per-sailing browse prices use `lowest_price_cents` integer minor units plus `currency` as a both-valued-or-both-null pair, never decimal strings. `cabinCategories[]` empty — those need a content fetch.
- **Hotels** (`{ hotel, roomTypes[], ratePlans[], mealPlans[], amenities[] }`): `hotel` populated (name, location, geo, star rating, hero image, indexed amenities). `amenities[]` from projection's facet array. `roomTypes[]`, `ratePlans[]`, `mealPlans[]` empty.

The principle: **whatever the projection or overlay legitimately knows, surface it; whatever they don't, surface as a typed empty state, not a `null` property**. UI components render around empty collections gracefully — a detail page with no media still renders, just without a gallery. The journey's descriptor builder treats empty options/days as "not bookable through the descriptor flow" and either offers a thin one-step quote path (when the adapter still implements `liveResolve` + `reserve`) or marks the row not bookable.

What the synthesizer **does not** do:

- **Mine prior snapshot rows** for the same `source_ref` to reconstruct content. Snapshots may carry customer-scoped PII and are point-in-time captures of "what was sold to a specific customer," not generic content sources.
- **Machine-translate fields** to fill missing locales. That's the adapter's `getContent` + `machine_translated: true` path (§3.5.5), not the synthesizer's job. Overlays can supply translations; the synthesizer doesn't generate them.
- **Synthesize plausible-but-unverified fields.** "Hotels usually have a pool" is not a basis for synthesizing `amenities: ["pool"]`. The synthesizer reflects what we know; it doesn't invent. Empty arrays are honest.
- **Cache its own output.** The synthesizer is cheap (projection + overlay reads) and its inputs change at projection / overlay write time. A cache layer would just complicate invalidation. The cache table (§3.2) is for `getContent` results.

This means an adapter can ship `supportsContentFetch: false` and still produce a usable detail page when the operator's overlay supplies the gaps — the same surface that catalogs from rich adapters use, just thinner. As the integration matures, switching the adapter to `supportsContentFetch: true` is a transparent upgrade — same return type, same consumers, the cache plumbing kicks in, and the synthesizer becomes a fallback for the rare case where both adapter and overlay are silent.

## 4. How the booking journey uses it

The journey's Configure / Accommodation / Add-ons steps need departure dates, room types, addon catalogs. Today these are pulled from per-vertical service layers for owned rows; sourced rows have nothing comparable.

After this lands:

- The journey's `BookingDraftShape` is populated by reading `getContentForEntity` and projecting the relevant slices into the descriptor (departures → `configureSubSteps[].kind: "departure"`; room types → `accommodationSubSteps[].kind: "rooms"`; addons → `addonGroups[]`).
- Live pricing in `quoteEntity` reads the same content for option-pricing computations.
- The owned-handler's existing pricing primitives apply unchanged; the sourced equivalent uses the adapter's content + adapter's `liveResolve` for prices.
- Storefront detail pages (`/products/$id`, `/cruises/$id`, etc.) read the same content function and render the full page identically for owned and sourced rows.

## 5. Snapshot relationship

When a sourced booking commits, the snapshot graph captures `frozenPayload`. Today that's the indexed projection. **After this proposal lands, `frozenPayload` includes the full content blob** so the booking row carries a deep audit-grade record of what was sold, not just the indexed fields.

The integration in `bookEntity` (`packages/catalog/src/booking-engine/book.ts`) is a **modest dependency expansion**, not a one-line merge:

- `bookEntity` gains a content-service dependency injected via the engine context (`ctx.contentService`).
- The booking flow needs to forward the original quote's `scope` (locale, market, currency) into snapshot capture so we refresh the right locale.
- Adapter context for the refresh call (the same `connection_id`, `correlation_id`) must propagate from the original quote/reserve through to the snapshot step.
- A new failure mode (`SnapshotContentUnavailableError`, §5.1) needs an HTTP status mapping in the booking-engine route handlers and an operator-dashboard surface.
- The snapshot table schema accepts opaque JSONB — no migration there — but the `frozen_payload` shape grows the `content_capture` envelope (§5.1) and audit consumers (refund flows, invoice rendering) need to read it.

It's not a refactor, but it's not "merge a field" either. Plan a few days of integration plus tests, not an afternoon.

### 5.1. At-commit content capture: refresh-with-fallback

The snapshot must reflect what the customer actually agreed to at the moment of commit, not whatever the cache happened to hold. So at commit time, the engine **refetches from the adapter** rather than reading the cache. If the refetch fails for any reason (network blip, rate limit, transient adapter outage), the engine **falls back to the cache** — the booking succeeds; the snapshot records whatever the most recent cached content was.

```
captureContentForSnapshot(adapter, entityModule, entityId, scope):
  try:
    fresh = adapter.getContent(ctx, { entity_module, entity_id, scope })
    writeCachedSourcedContent(db, ..., fresh)   // also refresh cache
    return { content: fresh.content, source: "fresh", fetched_at: now() }
  catch err:
    cached = readCachedSourcedContent(db, ..., includeStale: true)
    if cached:
      return { content: cached.payload, source: "cache_fallback",
               fetched_at: cached.fetched_at, fallback_reason: err.message }
    // No cache row at all → fail the commit. We do not commit a snapshot
    // with thin indexed-projection content; refunds and audit would have
    // nothing real to look at. Operator sees a clear actionable error.
    throw new SnapshotContentUnavailableError(...)
```

The snapshot row records both the content blob and a `content_capture` envelope so audit can later distinguish a fresh capture from a fallback:

```ts
// inside booking_catalog_snapshot.frozen_payload
{
  // ... existing fields ...
  content_capture: {
    source: "fresh" | "cache_fallback",
    fetched_at: "2026-...",
    fallback_reason?: string,    // present when source == "cache_fallback"
    content_etag?: string,       // mirrors GetContentResult.etag
  },
  content: { /* the vertical-shaped content payload */ },
}
```

**Why fail-on-no-cache rather than synthesize from the indexed projection.** The indexed projection is search-shaped — name, status, a handful of facets. It's not a record of "what was sold" in any audit-grade sense. Refunding a customer eight months later from a stub document with three fields is worse than the operator getting a clear, actionable error at commit time and resolving it (manual confirmation, retry with backoff during a soft hold, or escalating to the upstream).

### 5.2. The hold/commit timing in practice

For sourced rows, the engine usually places a hold via `adapter.reserve` with `payment_intent.type = "hold"` (soft-hold path) earlier in the journey. By commit time we've typically had a recent successful adapter round-trip, so the refresh-on-commit `getContent` call usually succeeds. The fallback path is for genuine edge cases: long-held drafts (operator sat on a quote for two hours and the upstream had a brief outage during commit), aggressive rate limits, partial outages.

If we observe `cache_fallback` rates above a small percentage in production, that's a signal to investigate — usually either an unstable upstream or a refresh window that's too narrow — not a routine outcome.

### 5.3. Owned bookings

Owned bookings don't go through `getContent` at all (the data is in our DB). Their snapshot reads from the vertical's owned-content service, which is always available. The refresh / fallback machinery is sourced-only.

## 6. Channel-push relationship

Channel push is the **outbound** direction of supplier integration: when a booking commits on Voyant, push it upstream to a channel manager / supplier API (e.g. TUI, Hotelbeds, Voyant Connect peer). It is a separate concern from this doc but is **closely related** because:

- The same adapter that fetches content (inbound) usually has a method for pushing bookings (outbound).
- The same `connection_id` carries credentials for both.
- Drift events on a row often imply both content refresh and push-availability.

See [`channel-push-architecture.md`](./channel-push-architecture.md) for the outbound design. The two architectures share the `SourceAdapter` contract and the registry; their methods are distinct.

## 7. Package layout

```
packages/catalog/src/schema-sourced-entries.ts                — catalog_sourced_entries (§2.5) — durable provenance + projection capture
packages/catalog/src/adapter/contract.ts                      — extended with getContent + capabilities + content versioning fields
packages/catalog/src/drift/events.ts                          — extended with ContentDriftEvent (§3.4.1)
packages/catalog/src/overlay/resolver.ts                      — extended to handle JSON-pointer field paths (§3.5.4)
packages/catalog/src/services/content-service.ts              — isStale + ContentDriftEvent→cache invalidation + cross-worker singleflight (advisory lock or refresh-inflight) + applyJsonPointerOverlay primitives
packages/catalog/src/services/sourced-entry-service.ts        — readProvenance + sync.ts integration for sourced-entry upserts
packages/<vertical>/src/schema-sourced-content.ts             — per-vertical content cache (entity_id, locale, market) with content_schema_version
packages/<vertical>/src/service-content.ts                    — getContentForEntity (owned-vs-sourced dispatch, SWR, validator-gated writes)
packages/<vertical>/src/service-content-synthesizer.ts        — synthesizeContentFromProjection (durable sourced-entry projection + overlay + plane metadata; §3.6)
packages/<vertical>/src/content-shape.ts                      — vertical-specific content type, Zod validator, mergeOverlaysIntoContent
```

Each vertical opts in. Verticals that don't yet have detail-page needs (extras, transfers) can defer adopting this — they fall back to thin indexed content, same as today.

## 8. Migration / rollout

**Phase A — Extend the contract** (1 day):
- Add `getContent` (optional), `supportsContentFetch`, `supportedContentLocales`, `ownsContentCache`, `ownsAvailabilityCache`, and content versioning fields to `SourceAdapter` / `AdapterCapabilities` / `GetContentRequest` / `GetContentResult`.
- Add `ContentDriftEvent` to the drift event taxonomy alongside existing `CatalogDriftEvent` (§3.4.1).
- Extend `field_path` semantics in `catalog_overlay` to accept JSON-pointers (§3.5.4) — schema-compatible since `field_path` is already `text`.
- Pure typing / contract changes. Demo adapter declares `supportsContentFetch: false`.

**Phase B — Durable sourced-entry store** (2-3 days):
- Add `catalog_sourced_entries` schema (§2.5).
- Extend `sync.ts` to upsert sourced-entry rows on every `discover` page (writing the projection JSONB alongside the indexer write). Owned products do NOT participate.
- Add `readProvenance(db, entityModule, entityId)` helper.
- Backfill: a one-shot script re-runs `discover` for each existing connection to populate the new table for any sourced rows already in the indexer.
- No content cache yet; this phase only establishes the prerequisite.

**Phase C — Catalog content service primitives** (1-2 days):
- Add `packages/catalog/src/services/content-service.ts` with `isStale`, cross-worker singleflight (advisory-lock or refresh-inflight variant per deployment), `invalidateOnDrift` (consumes `ContentDriftEvent`), and `pickBestCachedLocale` query helpers.
- Add the content-shape-aware overlay merger primitives (`applyJsonPointerOverlay`, validator hookup).
- No vertical adopts yet.

**Phase D — Products vertical adopts** (3-4 days):
- Add `products_sourced_content` schema with `content_schema_version "products/v1"` (§3.2).
- Add the products-vertical content shape definition (`{ product, options[], days[], media[], policies[] }`) + Zod validator + `mergeOverlaysIntoContent` function.
- Wire `getProductContent` (owned-vs-sourced dispatch via `readProvenance`, locale-resolved cache reads, SWR refresh, synthesizer fallback).
- Operator starter's product detail route + storefront detail route use the new service.
- Demo upstream remains thin (declares `supportsContentFetch: false`); detail page renders synthesizer output from the durable projection (§3.6).

**Phase E — Cruises vertical migrates** (3-4 days):
- Define the **cruise content aggregate**: `{ cruise, ship, sailings[], cabinCategories[], itineraryStops[], policies[] }` is one content payload, returned by a single `getContent`. Pricing stays out — it's volatile and continues to flow through `liveResolve`. The cruise adapter's existing `fetchCruise / fetchSailing / fetchShip / fetchItinerary` methods compose internally to produce one `GetContentResult.content` blob; the public adapter contract gets one method, not five.
- Add `cruises_sourced_content` schema with `content_schema_version "cruises/v1"`.
- Replace the ad-hoc `adapter.fetchCruise()` pattern in `packages/cruises/src/routes.ts` with the new content service.
- Detail route reads from cache; existing route shape stays the same from the caller's perspective. The cruises adapter retains its internal multi-call composition; only the public surface narrows.

**Phase F — Accommodations / charters / extras** (2-3 days each, as needed):
- Adopt the pattern per vertical when first sourced integration ships. Each vertical defines its content aggregate boundary (which sub-fetches roll into one `getContent`, what stays in `liveResolve`).

**Phase G — Booking journey integration** (parallel to journey Phase B):
- Journey's `BookingDraftShape` builder reads from `getContentForEntity`.
- Live pricing in `quoteEntity` consults content for option-pricing.
- `bookEntity` gains the snapshot-content-capture path (§5).

## 9. Open questions

1. ~~**Content cache vs. catalog snapshot for "what was sold"** — at booking commit, we capture `frozenPayload`. Should that be the live content cache row, or should it be re-fetched from the adapter to get the freshest at-commit snapshot?~~ **Resolved (§5.1):** refresh from the adapter at commit, fall back to the cache on adapter error. If neither is available (no cache row AND adapter fails), fail the commit — we don't snapshot from the indexed projection because that's not audit-grade. The snapshot row records `content_capture.source: "fresh" | "cache_fallback"` so audit can tell the two apart later.
2. ~~**Multi-locale caching** — TUI returns content in `de-DE`; storefront serves a `ro-RO` user. Cache per locale, or cache one canonical and translate on read?~~ **Resolved (§3.5):** multi-language is a first-class axis. Adapters take a required `locale` and report `returned_locale`; the cache keys on `(entity_id, locale)` per vertical (independent TTLs, independent fetch failures, simple "missing locale" SQL); the read service walks a preference chain in one query and falls back gracefully. Machine translation is opt-in and flagged on the row, never implicit. Editorial overlays compose on top per locale.
3. ~~**Cache invalidation on overlay change** — editorial overlays already exist for owned content. Do they apply to sourced content too? If yes, is the merge done at read time or at content-fetch time?~~ **Resolved (§3.5.4):** overlays apply to sourced content using the same `catalog_overlay` machinery, keyed on `(entity, field_path, locale, audience, market)`. Merge happens at **read time** after locale resolution — pick the best content row, then layer locale-matching overlays on top. Operators can curate a `ro-RO` overlay before TUI publishes ro-RO natively, and overlay edits don't need to invalidate the content cache. Content-fetch-time merge would couple two independent edit paths and force a cache rewrite on every overlay change; read-time merge keeps them orthogonal. Cost is a small extra query per read, mitigated by the same caching the overlay store already uses for owned reads.
4. ~~**Background refresher vs inline-on-read** — Phase C ships inline; v2 considers background.~~ **Resolved (§3.4):** SWR in v1, no scheduled background refresher. Reads always return cached content immediately; stale rows trigger a fire-and-forget adapter refresh in the background so the next read is fresh. Singleflight collapses concurrent refreshes for the same key. A pure-background scheduled refresher is not planned — SWR + drift events covers the same surface without a worker / schedule / backlog monitor.
5. ~~**Per-vertical thin-content synthesizer shape** — when an adapter declares `supportsContentFetch: false`, the fallback synthesizer reads the indexed projection and produces a thin content blob. What's its minimum-viable shape per vertical?~~ **Resolved (§3.6):** the synthesizer is "as complete as we can legitimately make it," not minimum-viable. Returns the same shape as `getContent`, populated from projection + overlay + plane metadata; missing fields render as typed empty states rather than absent properties. It does not mine snapshots, machine-translate, invent plausible-but-unverified fields, or cache its own output. Each vertical owns its synthesizer; the principle is uniform across them.
6. ~~**Stale-while-revalidate** — when a cache row is stale, do we serve it AND fire a background refresh, or block the read while refreshing?~~ **Resolved (§3.4):** SWR in v1. Stale-but-present rows serve immediately and schedule an async refresh; only true cache miss (no row in any preferred locale) blocks. The booking engine snapshot path (§5.1) deliberately bypasses SWR — snapshot writes need synchronous freshness, reads do not.

## 10. Related documents

- [`catalog-architecture.md`](./catalog-architecture.md) — Phase 1 foundation. The content cache is a sibling layer to the indexer, snapshot, and overlay.
- [`catalog-booking-engine.md`](./catalog-booking-engine.md) — the engine consumes content (Configure / Accommodation / Add-ons steps).
- [`booking-journey-architecture.md`](./booking-journey-architecture.md) — the journey UX. Phase B depends on this content layer being in place at least for the products vertical.
- [`channel-push-architecture.md`](./channel-push-architecture.md) — outbound supplier integration. Shares the `SourceAdapter` contract.
