# Catalog architecture — design

Status: draft / proposal
Audience: anyone designing or implementing cross-vertical sellable inventory in Voyant - products, cruises, accommodation resale, charters, extras - and the cross-cutting infrastructure that supports them.

This document captures the architecture for how Voyant models sellable inventory across multiple verticals, and how that inventory is searched, merchandised, snapshotted at booking, and reconciled across mixed sources (owned, Voyant Connect, GDS, direct supplier APIs, bedbanks).

It is the meta-contract that vertical modules and resale surfaces adopt:
`packages/inventory` (operated tours / experiences, OCTO-aligned),
`packages/cruises` (see
[`cruises-module.md`](./cruises-module.md)), accommodation resale
surfaces (hotel/lodging catalog inventory, room options, board/rate choices,
and stay booking lines), `packages/charters` (yacht charters, see
[`charters-module.md`](./charters-module.md)), and extras as owner paths under
Inventory and Bookings. It is not itself a vertical module.

Accommodation is in scope here as resale, sourced inventory, or trip
composition. Hotel/property operations are out of scope for first-party
starters; see
[`accommodation-resale-boundary.md`](./accommodation-resale-boundary.md).

This document covers the catalog foundation plus the catalog-owned semantic
search primitives: embeddings, hybrid/semantic search orchestration, and
cross-audience search helpers now live in `@voyant-travel/catalog`. Agent runtimes
wrap the catalog HTTP APIs directly; MCP packaging is an application/runtime
concern, not a first-party catalog package. Phase 3 (the flights vertical and
the swappable `ReferenceDataProvider`) is designed in
[`catalog-flights-architecture.md`](./catalog-flights-architecture.md).

## 1. Why this exists

Voyant today has a clear story for **operated inventory**: a tour operator owns a tour, manages its day-by-day execution, and sells it through Voyant. Products, suppliers, bookings, finance, and the existing modules all assume this shape. That works well for DMCs, tour operators, and expedition operators.

It does not have a clear story for **sourced inventory**. There is a real and common case where an operator or agency:

- Resells packages from a wholesaler (e.g. TUI).
- Resells cruises from a cruise line (e.g. Viking).
- Books hotels through a bedbank (e.g. Hotelbeds).
- Pulls flights or transfers from a GDS (Amadeus, Sabre, Travelport).
- Mixes their own operated inventory with one or more of the above.

In each of those cases the operator is **selling someone else's inventory without operating it**. They do not run TUI. They do not crew the Viking ship. They do not own the hotel. They do, however, need to:

- Search across all of it in admin and on the storefront as one normalized catalog.
- Merchandise it (rewrite titles, swap hero images, add SEO copy, attach internal tags) without mutating the upstream source.
- Take a booking and capture an immutable record of what the customer saw, what they paid, what the cancellation terms were, and which upstream booking handle to call back to.
- Sync it to a CMS or storefront so it appears alongside the operator's own inventory.
- Add or remove sources over time (today Voyant Connect, tomorrow a GDS, next year a direct API) without re-architecting the platform.

Today, Voyant forces a choice: import everything as if you owned it, or build something hacky on top. Voyant Connect attempted to bridge this but feels disconnected — it lives as a parallel pipeline rather than as one variant of a general primitive.

The missing concept is not another supplier field on `products`, and not a forced unification of every vertical into one polymorphic root. It is a **catalog plane** — a contract and a shared infrastructure layer — that lets vertical modules (operated or sourced) project into one normalized discovery surface, while keeping each vertical's operational complexity in its own module.

### 1.1. Relationship to pricing Quotes, Proposals, and Booking

Voyant's active vocabulary is documented in
[`UBIQUITOUS_LANGUAGE.md`](../../UBIQUITOUS_LANGUAGE.md). The catalog plane sits
upstream of commitment:

- The catalog plane answers *what is sellable, in what shape, projected from
  where, with which editorial overlays applied*. It is the discovery / browse /
  merchandising / search-index surface.
- Direct catalog booking uses **Product → Booking Session → Pricing Quote +
  optional Hold → Commit → Booking → Fulfillment**. A pricing Quote is an
  immutable, expiring price and terms answer for an exact Booking Session
  revision. A Hold, where supported, is a temporary inventory claim. Commit
  creates the durable Booking only at the policy-defined commitment point from
  [ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md).
- Bespoke staff sales use **Proposal → accepted Proposal Version → Booking
  Session → Pricing Quote + optional Hold → Commit → Booking / Component
  Booking → Fulfillment**. A Proposal Version freezes the
  bespoke Trip Envelope revision and records customer intent; it is distinct
  from a pricing Quote and still requires fresh Quote and availability before
  Commit.

The layers connect at two clean points:

1. **Pricing Quote creation reads the catalog plane.** When a customer or staff
   member prices a Catalog Item through `POST /v1/{admin,public}/catalog/quote`,
   the resolver returns the overlay-resolved view and live volatile fields
   (price, availability, terms) flow through the source adapter.
2. **Booking commit captures the catalog snapshot graph.** When a Booking
   commits (per §5.3), it captures `booking_catalog_snapshot` rows alongside the
   Booking / Booking Item structures. The snapshot freezes what was projected and
   overlay-resolved at the moment of commitment; the Booking Items hold the
   per-line transactional state.

**There is no generic `Offer` or first-party `Order` in the catalog plane.**
Vertical-specific upstream/provider terms may still appear where an external
system uses them, but the unifying catalog noun is **Catalog Item** (discovery
and booking shape) and the pricing response is a **Quote**.

## 2. Goals and non-goals

### Goals

- **Distinguish operator from reseller** without forcing the data model to lie. A product can be operated, sourced, or both, and the catalog plane should treat each honestly.
- **Per-vertical operational truth.** Existing vertical modules and resale surfaces - `products`, `cruises`, accommodation resale, `charters`, `extras` - each keep their own schemas, pricing engines, availability engines, and booking flows where those differences are real. The catalog plane does not flatten them into one table or one polymorphic root, and any future verticals (e.g. a composite tour-package module) join the same way.
- **Shared cross-cutting infrastructure** for the concerns that genuinely benefit from being unified — provenance, editorial overlays, snapshot capture at booking, search index projection, drift detection.
- **A single field-policy contract** that every vertical implements, so editorial overrides, freshness expectations, snapshot semantics, and reindex behavior are coherent across kinds.
- **Booking-time immutability.** A booking captures a frozen, self-contained view of what was sold — even if the upstream source mutates or disappears later.
- **Source-extensibility through a public adapter contract.** Adding a new source — a GDS, a new direct API, a new bedbank, a wholesaler's own integration, a cruise line's direct feed, an operator's hand-rolled connector — is an adapter that emits into the catalog plane against a documented, stable contract. The contract is intended as a public extension point: any third party (Voyant Connect, a wholesaler's engineering team, an operator, a system integrator) can build an adapter and plug it in without changes to bookings, finance, CRM, or the catalog plane itself. No source is privileged; Voyant Connect is one adapter among many that satisfy the same contract.
- **Near-real-time cross-deployment freshness via webhooks.** When Operator A's catalog mutates (price, availability, edits, bookings reducing inventory), Agency B reselling A's inventory learns within seconds — not via polling. The catalog plane defines the event taxonomy and visibility-filtered payloads (§5.8); Voyant's existing webhook subscription / delivery infrastructure handles transport. Same mechanism serves third-party CMS sync, partner storefront updates, and any other external consumer.
- **A foundation that supports first-class semantic search and AI agent access.** Catalog ships keyword, hybrid, and semantic search through the `IndexerAdapter` contract and catalog-owned embedding/search helpers. Agents query `/v1/admin/catalog/search`, `/v1/public/catalog/search`, and drill-down APIs through ordinary credentials; runtimes may define local tool wrappers over those HTTP APIs, but Voyant does not ship a first-party catalog MCP package.
- **Coordinated adoption across all existing verticals in Phase 1, with explicit per-vertical participation scope.** The catalog plane and adoption by each in-scope vertical or resale surface (`products`, `cruises`, accommodation resale, `charters`, `extras`) ship together. Each surface's intended-for-Phase-1 participation is fully live at release; there is no transitional period where intended scope is partially delivered. **`extras` is a deliberate bounded exception**: it adopts the snapshot and provenance shapes only, with full overlay / indexer participation explicitly deferred per §3.3.1. That is its intended Phase 1 scope, not a transitional gap. The architecture accepts varied participation depths across verticals; what it rules out is shipping with a surface's intended scope half-implemented.

### Non-goals (for v1)

- **A universal `CatalogEntry` table or polymorphic root.** Vertical modules stay separate. The catalog plane is a contract and a set of shared infrastructure tables (overlay, snapshot, search projection, drift events), not a monolithic sellable-inventory entity.
- **A universal pricing or availability engine.** Hotel availability is room-night based; cruise availability is cabin-departure based; tour availability is per-departure-grid. These differ by design. The catalog plane does not try to unify them.
- **Per-provider connector implementations bundled in this package.** The catalog plane defines the adapter contract; concrete connectors (Voyant Connect, a wholesaler's TUI bridge, a cruise-line direct feed, an Amadeus/Sabre GDS integration, a Hotelbeds bedbank adapter, an operator's hand-rolled CSV importer) live outside this layer. They are independent packages, plugins, or services that implement the contract. The catalog plane has no opinion on who builds them or where they ship from.
- **A new top-level vertical module shipped alongside the catalog plane.** v1 is contract + adoption across the existing five verticals — no new vertical is introduced as part of this work. Composite tour-package, flight-only, transfer-only modules remain future possibilities (see §10).
- **Approval workflow engine.** The contract reserves an `overrideFriction: "approval"` value, but the actual approval routing/UI is left to the consuming surface. A formal `approverRole` axis is deferred until a second concrete case appears.
- **Audience vocabulary expansion.** The overlay store accepts an `audience` axis, and v1 ships with the actor-aligned vocabulary used everywhere else in Voyant — `staff`, `customer`, `partner`, `supplier` — matching `Actor` in `packages/core/src/env.ts`. White-label-tenant slugs and per-channel sub-audiences are deferred until a real deployment needs them.

## 3. Core architectural conclusions

### 3.1. CatalogEntry is a contract, not a root entity

Vertical modules and resale surfaces - accommodation, cruise, product, package, excursion - remain separate where their schema, lifecycle, and operational logic differ. There is **no shared `catalog_entries` table** and **no `kind` discriminator** at the data level.

Instead, the catalog plane defines:

- A **field-policy contract** (the 12-attribute governance shape every field must satisfy).
- A **provenance shape** (`source_kind`, `source_ref`, `source_freshness`).
- A **snapshot table** that captures frozen views of any vertical at booking time.
- An **overlay store** that holds editorial overrides keyed by entity-module + entity-id.
- A **search index projection contract** that vertical-specific feeders emit against.
- A **drift event stream** that vertical sources emit when upstream changes are detected.

Each vertical module **implements** this contract — it does not inherit a base table or extend a parent type. Hotel writes its own field-policy file. Cruise writes its own. Package writes its own. They share the contract types, the overlay infrastructure, the snapshot table, and the indexer pipeline; they do not share a row shape.

This is the architectural call that prevents two failure modes:

- **Polymorphic root rot.** A single `catalog_entries` table with `kind` + JSONB or sparse columns produces a lowest-common-denominator schema, fragile JSONB queries, and a resolver fragmented across kind-specific branches.
- **Total siloing.** Reimplementing editorial overrides, snapshot capture, and provenance four times produces four subtly-different policies that drift apart over months and have to be reconciled later.

The contract-not-root model gives per-vertical schema honesty plus cross-cutting consistency.

### 3.2. Three composition patterns

Once a sellable entity exists, its sub-structure falls into one of three composition patterns. The pattern determines where the data lives and how it is governed.

**Pattern 1 — Nested fields.** The structure has no independent lifecycle, no independent query surface from outside the parent, no separate snapshot identity. It lives as paths under the parent's field-policy registry.

Examples: `inclusions[]`, `exclusions[]`, `transfers[]`, `itinerary_days[]`, `airport_pickup_included`.

**Pattern 2 — Promoted child entity.** The structure has its own table inside the parent vertical's package, its own micro-registry, and a foreign key back to the parent. It is **not** independently sellable. Promotion is gated by the rule in §6.2.

Examples: cruise `departures[]`, package `flights[]`, accommodation `room_options[]`, cruise `cabin_categories[]`.

**Pattern 3 — Referenced CatalogEntry.** The structure is its own root entity in its own vertical module, linked to the referencing vertical via the existing `defineLink` infrastructure. It is independently sellable, or reused across multiple parents with shared editorial. Promotion is gated by the rule in §6.3.

Examples: a TUI package referencing sourced accommodation; a tour referencing an excursion; a DMC re-using a 3-day mini-tour module across multiple longer tours.

A fourth category exists for non-sellable infrastructure: **shared master entities** (ports, airports, accommodation brands/chains). These are plain reference tables outside the catalog plane, referenced by FK from vertical modules. They are not CatalogEntries.

Ships and accommodation properties need a narrower distinction: they are not sellable CatalogEntries, but their customer-facing presentation content can be material storefront content. A ship or property may therefore register as a presentation subject with a durable local id, provenance, field policy, source-content reader, effective-content projector, and reverse references. Identifiers, source refs, operational facts, machine rules, availability, pricing, and booking semantics remain provider-managed; only explicitly merchandisable presentation fields are overlayable.

### 3.3. Vertical packages and the shared catalog package

The existing vertical modules are:

```
packages/inventory     operator-owned tours, experiences, multi-day itineraries (OCTO-aligned)
packages/products      compatibility entrypoint for the existing operated product implementation
                       — also the natural home for standalone excursions / day-trips
                         (a 1-day product, optionally linked from a longer parent product)
packages/cruises       cruise root + departures + cabin_categories + itinerary_days
                       see cruises-module.md
accommodation resale   sourced or composed lodging inventory for OTAs, tour
                       operators, and DMCs: content, room options, board/rate
                       choices, cancellation terms, and booking snapshots.
                       Hotel-operations surfaces are out of scope; see
                       accommodation-resale-boundary.md
packages/charters      yacht-style products that don't fit the cruise schema:
                       per-suite flat pricing, MYBA contract, APA — see charters-module.md
inventory/bookings extras
                       booking add-ons: optional line items layered on a booked product
                       (not independently sellable; see §3.3.1 for ownership/adoption nuance)
```

Additional verticals / operational packages:

- **Composite tour-package module** — for TUI-style flight + hotel + transfer bundles. Today, multi-component sellables are modeled either inside `products` or via cross-module links. A dedicated composite module would appear if reseller scenarios make package-level pricing, cancellation, and snapshot semantics non-trivial.
- **`packages/flights`** — partial-adoption vertical for live-API flight search and booking. Borrows voyant-cloud's `FlightConnectorAdapter` contract shape. Participates in the catalog plane only for booking snapshots, provenance, webhook events, and source disconnection — explicitly opts out of search index, overlays, embeddings, and drift detection. Designed in [`catalog-flights-architecture.md`](./catalog-flights-architecture.md) (Phase 3).
- **`packages/ground`** — operational ground-transport module for operators, vehicles, drivers, dispatch, execution, assignments, positions, shifts, and related workflows. It is not the same as a catalog-projected transfer-only vertical; a sellable transfer/search surface is still a separate design question if Voyant needs OTA-style transfer composition.

The shared catalog package:

```
packages/catalog       shared cross-cutting infrastructure:
  src/contract.ts        FieldPolicy type, FieldClass enum, inheritance loader
  src/provenance.ts      source pointer shape and helpers
  src/overlay/           overlay store schema + resolver-merge logic
  src/snapshot/          booking_catalog_snapshot table and capture helpers
  src/indexer/           search projection — IndexerAdapter contract,
                         native Typesense implementation, per-vertical doc emitters
  src/search/            search orchestration helpers (rerank for two-stage search,
                         result-set provenance markers); see §5.4.3
  src/drift/             drift event types + queue contract
  src/events/            catalog event taxonomy, payload builders with
                         visibility filtering; emits via @voyant-travel/core/events,
                         consumed by the existing webhook delivery pipeline (§5.8)
```

Semantic search lives in `packages/catalog`: `src/embeddings` carries
embedding providers and model compatibility helpers, while `src/search`
carries reranking, semantic/hybrid orchestration, and cross-audience federation
helpers. Phase 3 (Flights, see `catalog-flights-architecture.md`) lives as
`packages/flights`.

Vertical packages depend on `packages/catalog` for the contract types and the shared infrastructure interfaces. `packages/catalog` does not depend on any vertical module - it knows nothing about cruises, accommodation resale, or charters specifically.

#### 3.3.1. Extras are Product-owned, never a standalone vertical

An Extra is a lifecycle-dependent child of the Product Booking that carries it,
not independently-sellable inventory. It is authored on the Product's Plan and
Options, selected while the Booking is made, and fulfilled on the Departure. It
is exposed through `@voyant-travel/inventory/extras` for authoring and catalog
projection, and `@voyant-travel/bookings/extras` for booking-time selection and
the Departure manifest.

Its participation in the catalog plane is therefore deliberately partial:

- It **does** need provenance (extras can be sourced from upstream alongside their parent product).
- It **does** need snapshot capture (a refund needs to know the extra was a $50 spa credit, not just "a line item"), including the cost and fulfillment configuration in force at the moment of sale.
- It **never** gets a search index projection. Extras are discovered through the parent's surface; there is no standalone catalog browse.
- It **does not** need editorial overlay infrastructure.

This is not "deferred until a concrete case demands it" — it is a rule. It is
enforced structurally rather than by convention:

- `PRODUCT_OWNED_VERTICALS` in `@voyant-travel/catalog-contracts/indexer/contract`
  names the verticals that exist only so their parent can freeze a snapshot, and
  maps each to the vertical that owns and sells it.
- `extras` is absent from `DEFAULT_CATALOG_VERTICALS`, so no slice and no
  collection is ever provisioned for it, and every extras field policy is
  `reindex: "none"`.
- The catalog search route refuses a product-owned vertical with
  `400 { reason: "not_independently_sellable", ownedBy }` rather than returning
  an empty result, so an old deep link can render a compatibility explanation
  instead of looking broken.
- `verify:extras-lifecycle` holds all of the above, and additionally refuses any
  migration that would promote an existing Extra into a Product or a Component
  Booking.

The escalation rule belongs with the authoring UI as well as here: **an addition
that must be independently confirmed, cancelled, taxed, fulfilled, or supported
is a Product / Component Booking under a Trip Envelope, not an Extra.**

#### 3.3.2. Product family recast (`product_types`)

`packages/products`' existing `product_types` table is recast as the
merchandising **Product family** — no physical table rename, no new table.
Standard first-party deployments idempotently seed five families (`tour`,
`activity`, `attraction`, `event`, `transportation`). Operators may add custom
families and rename display labels or deactivate choices; codes are immutable,
and standard or referenced families cannot be deleted. Family (`products.productTypeId`), the
optional **Product subtype** (`products.productSubtypeCode`), the resolved
duration, and the review state (flagged when a product has no family or an
unresolved duration) are computed by one shared resolver and emitted
identically by the product list/detail read paths, the catalog-plane
projection, and the legacy Catalog search document builder — there is no
per-surface reimplementation. Family, subtype, and duration are orthogonal to
`bookingMode`, `capacityMode`, `supplyModel`, and schedule; see
[`catalog-supply-models.md`](./catalog-supply-models.md#21-product-family-and-subtype-are-a-third-independent-axis)
for how this interacts with the supply-mechanic axis. "Excursion" (as used
elsewhere in this document, e.g. §3.3, §8.2) is contextual vocabulary, not a
`<= 1-day` family — a product casually called an "excursion" still carries
whichever family and subtype actually apply, most often Tour.

## 4. The field-policy contract

The field-policy registry is the load-bearing schema decision of this architecture. Every field on every CatalogEntry, in every vertical, is declared with a row in a per-vertical policy file. The contract has 12 attributes (one path identifier plus 11 governance attributes).

### 4.1. The contract type

```ts
type FieldClass =
  | "managed"             // not user-overrideable; covers external-source-fed AND system-managed identity
  | "structural"          // overrideable with constraints; drives search facets and filters
  | "merchandisable"      // freely overrideable copy, media, marketing fields
  | "volatile-indexed"    // cached projection with TTL; safe to be slightly stale (browse)
  | "volatile-live";      // never indexed as a live value; always fetched on demand (quote / checkout)

type MergeRule =
  | "source-only"         // overlay forbidden even if class would allow
  | "replace"             // override fully replaces source value
  | "additive-set"        // override unions with source (set semantics, e.g. tags)
  | "additive-list"       // override appends to source list
  | "list-position";      // sparse override per list position (e.g. gallery[2].caption)

type DriftSeverity = "none" | "low" | "medium" | "high" | "critical";
type ReindexScope  = "none" | "entry" | "entry-locale" | "facet-affecting" | "global";
type SnapshotMode  = "never" | "on-quote" | "on-book" | "on-quote-and-book";
type Queryability  = "blob-only" | "indexed-column" | "first-class-table";
type Visibility    = "staff" | "customer" | "partner" | "supplier";
type EditRole      = "none" | "marketing" | "ops" | "finance" | "admin";
type OverrideFriction = "none" | "confirm" | "approval";
type SourceFreshness  = "sync" | "event" | "request" | "static" | null;
//   "sync"    — periodic batch pull from source
//   "event"   — push from source via webhook
//   "request" — fetched on read (live API call)
//   "static"  — set once at creation, never refreshes (system-managed identity)
//   null      — no source side at all (purely editorial)

type FieldPolicy = {
  path: string;              // dotted path; supports `gallery[]`, `geography.countries[].name`
  class: FieldClass;
  merge: MergeRule;
  drift: DriftSeverity;
  reindex: ReindexScope;
  snapshot: SnapshotMode;
  query: Queryability;
  localized: boolean;
  visibility: Visibility[];  // set, not single value — same field may be visible to multiple actors
  editRole: EditRole;
  overrideFriction: OverrideFriction;
  sourceFreshness: SourceFreshness;
};
```

### 4.2. The five field classes

**`managed`** — not user-overrideable, period. This covers two origins: external sources (a Viking departure date, a Hotelbeds property ID) and system-managed identity (a tenant ID assigned at creation, an entity's typed ID). The class name was chosen to be neutral about origin; what unites managed fields is that no editor role can overwrite them via the overlay store.

**`structural`** — overrideable with constraints; drives search facets. Examples: `category`, `geography.country`, `facet_tags`, `duration_nights`. Changes to structural fields trigger `facet-affecting` reindex, because storefront filters depend on them. Some structural fields are `merge: "source-only"` — meaning they belong in the structural class for the purpose of facet-affecting drift, but are not editable (e.g. `duration_nights` for a sourced product).

**`merchandisable`** — freely overrideable copy, media, marketing fields. Examples: `title`, `description`, `hero_image`, `gallery[]`, `marketing_tags`, `internal_notes`. Marketing edits these without ceremony. Reindex scope is typically `entry` or `entry-locale`.

**`volatile-indexed`** — cached projection with TTL. Examples: `from_price`, `has_upcoming_availability`, `next_departure_date`. These are allowed to be slightly stale on the storefront browse; they are refreshed periodically from source.

**`volatile-live`** — never indexed as a live value, always fetched on demand. Examples: `quote_price`, `inventory_count`, `bookable_now`, `hold_expiry`. These appear at quote time and at checkout, never on a list page.

### 4.3. Inheritance rule

Most CatalogEntries have nested structures (lists, sub-objects). The policy registry uses path-based inheritance:

- **Path precedence (resolving which policy applies):** exact field path wins over collection path; element path beats collection path; collection path beats ancestor object path; finally, fallback to the parent object's policy if no more specific row exists.
- **Path inheritance (filling defaults):** when a leaf is declared without explicit values for some axes, those axes default to the nearest declared ancestor's values.

**The inheritance rule operates per axis, not per row.** Some axes are non-inheriting because they cannot safely default from a parent:

- **Non-inheriting** (must be explicit on every leaf where the parent has mixed-class children): `class`, `merge`, `editRole`, `overrideFriction`, `snapshot`.
- **Inheriting** (default to nearest declared ancestor): `drift`, `reindex`, `query`, `localized`, `visibility`, `sourceFreshness`.

Composite list elements (e.g. `itinerary_days[].port` is `managed`, `itinerary_days[].description` is `merchandisable`) must declare their class explicitly. This is the registry loader's job to enforce; ambiguous parents emit a build-time error.

### 4.4. Path grammar

Kept intentionally small for v1:

```
field
field.subfield
list[]
list[].field
list[].nested.field
```

`map{}.field` (keyed objects) is deferred until a real case demands it. Anything more expressive risks turning the policy file into a configuration language.

## 5. Cross-cutting infrastructure

`packages/catalog` provides the following shared infrastructure. Vertical modules consume these through interfaces; nothing in `packages/catalog` knows what a hotel or cruise is.

### Graceful-scale principle

The catalog plane is designed so that **simple deployments pay for what they use, and scale concerns kick in only when an operator has actually grown into them.** Most agencies and operators run in a default shape that's deliberately small:

- Two effective audiences: `staff` (admin / ops / marketing internal use) and `customer` (storefront).
- One market: `default`. Multi-market overlays are unused.
- One CMS feeding `customer`-audience overlays, or just admin UI editing.
- Two index document sets per locale per vertical: admin (denormalized — see §5.4.4) + customer.

That's the 80% case. Same overlay store, same field-policy contract, same resolver, same indexer, same webhook taxonomy.

Scale-stage opt-ins — additional audiences (`partner`, `supplier`, white-label slugs), multiple markets, multiple CMS plugins, denormalized cross-audience admin search — become available without re-architecting. The deployment configures which axis values it actually uses; the indexer materializes documents accordingly. Voyant Cloud and at-scale operators absorb the materialization fan-out without strain — modern search engines (Typesense, Algolia) scale to tens of millions of documents at predictable cost, which is rounding error compared to the value of the catalog itself.

The architecture does not have separate "small operator" and "enterprise" paths. There is one model that grows linearly with the operator's actual surface area, and every cross-cutting concern in this section is designed to read sensibly at both ends of that range.

### 5.1. Provenance

Every vertical's CatalogEntry carries a provenance shape:

```ts
type Provenance = {
  source_kind:        string;   // "owned" | "voyant-connect" | "gds:amadeus" | "direct:tui" | "bedbank:hotelbeds" | …
  source_provider?:   string;   // optional sub-identifier (e.g. specific Connect peer)
  source_connection_id?: string; // FK to voyant-cloud connection or local config
  source_ref?:        string;   // upstream identifier (e.g. Viking sailing code)
  source_freshness:   SourceFreshness;
  last_sourced_at?:   Date;
};
```

Owned inventory uses `source_kind: "owned"`. Sourced inventory uses one of the external kinds. The provenance shape is uniform across all verticals and all sources.

### 5.2. Overlay store

#### 5.2.1. Shape and key

A single overlay table holds editorial overrides for every vertical. Rows are keyed by:

```
(entity_module, entity_id, field_path, locale, audience, market)
```

Where:

- `entity_module` — the vertical that owns the entity (`"products"`, `"cruises"`, `"accommodations"`, `"charters"`, `"extras"`).
- `entity_id` — the typed ID within that vertical's table.
- `node_kind` / `node_key` — stable content-node identity. Existing flat overlays use `root/root`; nested overlays use source- or locally-derived keys such as an itinerary-day id and never array positions.
- `field_path` — the dotted path matching a row in that vertical's field-policy file.
- `locale` — IETF language tag (`"en-GB"`, `"fr-FR"`, …) plus a `default` sentinel for non-localized fields and fallback.
- `audience` — actor-aligned vocabulary: `staff`, `customer`, `partner`, `supplier`, plus a `default` sentinel.
- `market` — geographic / commercial market identifier (consumed from `packages/markets`) plus a `default` sentinel that most deployments use universally.

The resolver applies a fallback chain when reading. With three variant axes, the chain walks from most-specific to least-specific:

```
(locale=L, audience=A, market=M) →
(locale=L, audience=A, market=default) →
(locale=L, audience=default, market=M) →
(locale=L, audience=default, market=default) →
(locale=default, audience=A, market=M) →
(locale=default, audience=A, market=default) →
(locale=default, audience=default, market=M) →
(locale=default, audience=default, market=default) →
source projection
```

Overrides are entity-scoped — never cross-reference scoped. A package's editorial override on `title` does not propagate to its referenced hotel's or ship's `title`. Referenced presentation-subject overrides live on the referenced subject row and reindex referencing entries through the reverse-reference index.

Overlay writes carry a monotonically increasing version and append history so staff-facing compare/revert workflows can use optimistic concurrency instead of silent last-write-wins. Public reads never expose source/origin/history details; they receive only the effective projection and compact locale/fallback metadata.

#### 5.2.2. Variant axes — default vs scale

The three variant axes (`locale`, `audience`, `market`) are sparse: most overlays target only the combinations a deployment actively uses. The architecture is the same across deployment scales; only the materialization fan-out differs.

**Default deployment shape (the 80% case).** Most agencies and operators run with two effective audiences and a single market:

- `audience ∈ {staff, customer}` — `staff` for admin / ops; `customer` for the storefront. Marketing's CMS edits flow to `customer`-audience overlays; internal ops notes (when they exist) go to `staff`-audience overlays.
- `market = default` — never set; the `default` sentinel is used universally.
- `locale` — usually 1–3 active locales depending on the operator's geographic reach.

This produces effectively **two index document sets per locale per vertical** (admin + customer), which is what the simple case wants. No partner or supplier audiences. No market-specific overrides. No white-label slugs.

**Scale-stage opt-ins** become available — and are added only when the operator actually has the surface area:

- A `partner` audience is added when the operator stands up a B2B partner portal. CMS plugin (or admin UI) writes partner-specific copy; partner-audience documents materialize.
- A `supplier` audience is added when suppliers gain a self-service portal needing supplier-only views.
- Additional markets are added when the operator sells into multiple geographic markets with different content / pricing / disclosures (UK customer copy ≠ US customer copy, even in the same locale).
- White-label slugs (`white-label-{slug}`) are added when the operator supports white-label tenants reselling their inventory under a different brand.

The architecture supports all of these from day one; the contract does not change. The deployment configures which axis values it actually uses, and the indexer materializes documents accordingly.

**Voyant Cloud and at-scale operators** absorb the materialization fan-out without strain — Typesense and Algolia both scale comfortably to tens of millions of documents, and the operational cost is rounding error compared to the catalog plane's other moving parts. The architecture does not flinch at multi-axis materialization; it just doesn't impose it on operators who don't need it.

#### 5.2.3. Multiple writers, provenance, and conflict resolution

The overlay store is **not** Voyant-admin-UI-only. It accepts writes from multiple sources, all governed by the same field-policy contract:

- **Voyant admin UI** — the built-in editorial surface; default writer for deployments that don't run an external CMS.
- **External CMS plugins** — Sanity, Payload, Contentful, WordPress, Strapi. Each CMS has a Voyant plugin (the inbound mirror of the existing outbound `@voyant-travel/plugin-payload-cms`) that listens to CMS webhooks and writes overlay rows. Marketing teams keep their existing tools; their edits land in the overlay store.
- **Bulk import** — CSV upload, spreadsheet sync, batch operations for migration or large editorial moves.
- **AI-generated copy** — automated SEO copywriters, alt-text generators, multilingual translation pipelines.
- **Storefront-driven** — analytics-driven auto-tuning (e.g. underperforming titles get rewritten), gated by overlay-friction policies.

All writers go through the same overlay write path, the same field-policy filtering, and the same reindex / webhook / drift-detection pipeline. A CMS plugin is not privileged; it cannot write overlays for fields whose policy disallows it (`managed` class, or a `merchandisable` field with an `editRole` the CMS isn't authorized to act as).

**Provenance.** Every overlay row carries an `origin` field recording where the override came from:

```ts
type OverlayOrigin =
  | { kind: "admin-ui"; user_id: string }
  | { kind: "cms"; provider: string; cms_doc_id: string }    // e.g. provider: "sanity", "payload", "contentful"
  | { kind: "bulk-import"; batch_id: string }
  | { kind: "ai-generated"; model: string; prompt_hash?: string }
  | { kind: "external-api"; api_key_id: string };
```

Used for audit ("who wrote this title?"), filter-driven workflows ("show CMS-sourced overrides untouched in 6 months"), safe revert ("revert all AI-generated overrides on this product"), and debugging.

**Conflict resolution.** Default policy is **last-write-wins** by `updated_at`. When multiple writers act on the same overlay key in flight, whichever commit lands last persists; earlier values are preserved in the overlay history table for audit and revert.

Per-field canonical-writer configuration (e.g. "Sanity is the only writer that may modify `title` overlays; admin UI writes silently fail or are flagged for review") is a deferred refinement. v1 ships last-write-wins; per-field canonical-writer policy is added when a real deployment hits a problem with it.

**Bidirectional CMS sync.** A typical CMS plugin handles both directions:

- **Outbound** (already implemented in `@voyant-travel/plugin-payload-cms`): listens for `catalog.entity.*` events, upserts the corresponding doc in the CMS so editors see the entity in their tool.
- **Inbound** (new for this architecture): listens for CMS webhooks, writes overlay rows when editors save changes.

Single package per CMS, two subscriber sets, one bidirectional contract.

### 5.3. Booking snapshot graph

When a booking commits, the system captures a **graph of frozen views** — one snapshot row per CatalogEntry that participates in the booking. A package booking captures: the package, the referenced hotel, each selected excursion, the chosen departure, the selected flight. Each is a separate row in `booking_catalog_snapshot`, all keyed to the same `booking_id`.

Snapshot row shape:

```ts
type CatalogSnapshot = {
  booking_id:                  string;
  entity_module:               string;
  entity_id:                   string;
  source_kind:                 string;
  source_ref?:                 string;
  source_connection_id?:       string;
  captured_at:                 Date;
  frozen_payload:              Json;          // resolved view including overlays applied at capture time
  overlay_state_at_capture:    Json;          // which override values were live at capture, for audit
  pricing_basis?:              {              // structured columns alongside the JSONB blob
    base_amount: number;
    taxes: number;
    fees: number;
    surcharges: number;
    currency: string;
    breakdown: Json;
  };
};
```

**Why both pointer AND snapshot.** The snapshot is audit truth — what the customer saw, what they paid, what the cancellation terms were. The source pointer (`source_kind`, `source_ref`, `source_connection_id`) is the durable callback handle for post-book operations: modify, cancel, status sync, refund. Snapshot alone would force every post-book operation to spelunk for the right adapter; pointer alone would lose audit truth as soon as the source mutated.

`pricing_basis` is structured columns rather than buried in the JSONB blob, because finance, invoicing, and refund engines query it constantly.

### 5.4. Search index projection

The search index is the place where cross-entity denormalization happens. Vertical adapters emit normalized search documents; the indexer joins referenced entities (hotel data inside a package's search doc) at index time. The catalog plane ships **Postgres and Typesense as first-party integrations** (§5.4.1), with a **swappable adapter interface** (§5.4.2) so deployments that prefer Algolia, Meilisearch, Elasticsearch, or any other engine can substitute their own implementation without touching the catalog plane itself. Browse-time **price sorting and filtering** is a first-class concern handled through an explicit pricing-tier pattern (§5.4.3) — Tier 1 indexed price summaries by default, with Tier 2 live rerank available as opt-in orchestration.

Three rules govern the indexer regardless of which engine sits behind it:

1. **The resolver runs in two places.** The read path (API responses) resolves one entity at a time and does not auto-traverse references. The indexer denormalizes referenced entities into the search document. Auto-traversal in the read path is forbidden — it explodes blast radius and makes overlay-merge precedence ambiguous when locales mismatch across entities.
2. **Search documents are per-(locale, audience, market, channel).** A document indexed for `(en-GB, customer, UK, website)` is distinct from `(en-GB, customer, UK, b2b)` and from `(de-DE, partner, default, reseller)`. The indexer materializes the resolver's output for each combination the deployment actively serves; for default deployments this is `(locale × {staff, customer}, market=default)` plus channel-scoped customer slices when distribution channels are configured (§5.2.2).
3. **Reindex is targeted, not bulk.** When an editorial override changes, when a source projection updates a non-overridden field, when channel publication changes, or when a referenced entity changes (hotel inside a package), the affected document(s) get re-enqueued — scoped per entity, per locale, per audience, per market, per channel. A reverse-lookup index (`referenced_by`) supports the cross-entity case.

Volatile-live fields **never** appear in the search index. Volatile-indexed fields appear with a TTL, refreshed via the source's freshness mode.

#### 5.4.1. First-party Postgres and Typesense integrations

Typesense is the default search engine because it fits Voyant's deployment model: open-source (Apache-2.0, aligned with Voyant's licensing posture), self-hostable (aligned with single-tenant-per-deployment), fast, low operational overhead, with first-class support for faceted search, typo tolerance, locale-aware tokenization, and hybrid keyword+vector search. The native Typesense adapter ships as part of `packages/catalog` and provides:

- **Collection schema generation** from the field-policy registry. Fields with `query: "indexed-column"` and the appropriate `class` become Typesense fields with the right type / facet / sort flags. Fields with `query: "blob-only"` are stored but not indexed.
- **Per-(locale, audience, market, channel) collection management.** A separate Typesense collection (or filterable shard, depending on scale) per combination, with its own schema synthesized from the field policy. Channel is optional only for legacy/default slices; channel-aware storefronts materialize one customer collection per sales surface.
- **Document upsert / delete on reindex events** with the targeted-reindex semantics from rule 3 above.
- **Search query construction** for the storefront and admin layers, exposing facet aggregations driven by the registry's structural fields.
- **Bulk reindex tooling** for cold-starts and major schema changes (e.g. when a vertical's field-policy file gains a new indexed field).

Voyant maintains two first-party adapters. The Postgres provider is declared for `{ role: "search", value: "postgres" }` and owns a rebuildable search projection in the deployment database. It records optional `lakebase_text`, `lakebase_vector`, `pgvector`, and `pg_trgm` capabilities at deployment composition; it never probes provider management APIs on a search request. Native FTS remains available when Lakebase Text is not provisioned, and pgvector remains available when Lakebase Vector is not provisioned. Typesense is declared for `{ role: "search", value: "typesense" }` and remains a selectable first-party provider. Deployments select either provider explicitly. The standard self-hosted operator starts with `search: "none"` until an operator enables a search provider. `TYPESENSE_HOST` and `TYPESENSE_API_KEY` configure the selected Typesense provider; the presence of those values never selects it. Operational expectations and composition examples live in `packages/catalog/README.md`.

#### 5.4.2. Swap-in alternatives

The engine-neutral `IndexerAdapter`, `IndexerProvider`, and optional `IndexerAdmin` contracts live in `@voyant-travel/catalog-contracts/indexer/contract`. This keeps external engine packages dependent on the pure contract package rather than the catalog runtime. `@voyant-travel/catalog/indexer/contract` remains a compatibility re-export, not the canonical adapter dependency.

A deployment selects one graph provider by setting `deployment.providers.search` to `postgres`, `typesense`, `algolia`, `custom`, or `none`. A selected adapter package declares a provider for runtime port `catalog.indexer` with a matching `{ role: "search", value }`. `custom` is the public selection for an operator-owned engine; it is not an implicit fallback and does not mean "choose any provider." Embedded hosts and tests may inject an `IndexerAdapter` or `IndexerProvider` directly at that port only when the deployment selects `search: "custom"`; the host value then takes precedence over a graph-declared custom provider. For every non-custom selection, the host value is ignored and the selected graph provider remains authoritative.

The contract is intentionally narrow:

- `ensureCollection(slice, fieldPolicy)` — set up or migrate the engine-side schema for one variant slice.
- `upsert(slice, documents)` / `delete(slice, ids)` — write paths from the reindex queue.
- `search(slice, request)` — portable read path for storefront and admin search, including filters, facets, sorting, and pagination.
- `bulkReindex(slice, stream)` — cold-start and migration path.
- `capabilities` — declare keyword, hybrid/vector, cross-audience, and admin-denormalization support plus vector limits so consuming code can fail fast on unsupported features rather than producing wrong results silently.
- optional `admin` — provider-neutral `list`, `drop`, and streaming `scan` operations for deployment tooling. Raw Typesense collection and document maintenance APIs are not public catalog surface.

The portable sort vocabulary has canonical semantics in `SEARCH_SORT_SEMANTICS`, and adapters resolve it through `resolveSearchSort`. The resolver chooses the first indexed field-policy path available for the vertical and visible in the requested slice, then returns an engine-neutral field and direction. `blob-only` policies are never sort candidates. Providers translate that result into native syntax; they do not maintain private field-precedence tables. `relevance` remains the provider's native ranking and resolves without an explicit field.

Swap-in implementers can be:

- **External Algolia package** — an Algolia adapter package implements the contracts, declares `{ role: "search", value: "algolia" }`, and is admitted by deployments that select `deployment.providers.search: "algolia"`. Algolia is not bundled or maintained as a first-party catalog implementation.
- **Operator-built** — a deployment with an existing Elasticsearch cluster writes its own adapter against the contract.
- **Third-party** — a vendor or integrator publishes an adapter package the same way they would publish a source adapter (§5.6).

An external provider is packaged and admitted as follows:

1. Publish a plugin package with runtime and import-cheap `./voyant` exports. `package.json#voyant` uses `schemaVersion: "voyant.package.v1"`, `kind: "plugin"`, points `manifest` at `./voyant`, and declares compatible framework versions, Node target, and deployment modes.
2. Implement `IndexerAdapter` and `IndexerProvider` using `@voyant-travel/catalog-contracts` as the adapter dependency. The runtime factory export may create the vendor client from declared resources, config, and secrets; request-runtime `IndexerProvider.create()` remains synchronous.
3. In the `definePlugin` manifest, declare every consumed config value, secret, and resource. Declare one provider on port `catalog.indexer`, including its runtime export, `uses` references, and selection `{ role: "search", value: "algolia" }` or `{ role: "search", value: "custom" }`.
4. Install the package and explicitly admit it through the application's `plugins: [{ resolve: "<package>" }]`. Package installation alone does not admit executable behavior.
5. Select the matching value in `deployment.providers.search`. Graph resolution rejects incompatible metadata, unresolved exports, duplicate IDs, invalid port values, or a selection with no admitted matching provider. Credentials configure only the selected provider and never select one by their presence.

For example, an operator package declaring `{ role: "search", value: "custom" }` is admitted with `plugins: [{ resolve: "@acme/voyant-search" }]` and selected with `deployment: { providers: { search: "custom" } }`. A vendor Algolia package follows the same shape with `value: "algolia"`. The complete package, manifest, runtime-factory, admission, and custom-selection examples live in `packages/catalog-contracts/README.md`.

External and operator-built adapters must execute `assertIndexerAdapterConformance` from `@voyant-travel/catalog-contracts/indexer/conformance` in their own test suites. The runner verifies non-empty keyword matching, replacement by document id, structural hit fidelity, slice isolation, ordered sorting, pagination limits and terminal cursors, filters, exact facet buckets, bulk reindexing, deletion, and optional admin behavior without imposing a test framework. Facet limits are bounded by the portable `MAX_FACET_BUCKETS` value of 250; omitted and larger limits use that maximum, while invalid explicit limits are rejected. Declared semantic search must ignore query text for matching and rank by vector similarity. Hybrid search must retain the union of keyword-only and vector-only candidates, expose larger-is-better scores within each response, and honor `alpha`. Scores from independent audience queries are not comparable, so client-side cross-audience federation uses reciprocal-rank fusion over each response's order; duplicate ids accumulate rank contributions and use the best-ranked occurrence as their deterministic representative. Fusion is intentionally bounded: it fetches 50 candidates per audience by default, raises that depth to the requested output limit, and caps both at 250. Federated cursor requests are rejected until exact continuation exists. `SearchResults.total` is the number of unique considered candidates; `totalRelation: "eq"` is emitted only when every audience result is exhausted, otherwise `"gte"` declares a lower bound. Normal adapter results may omit the relation as equivalent to `"eq"`. Vector-aware admin scans must preserve every fixture's exact embeddings and model ids. These are portable observable behaviors. Provider-specific query topology, native federation, and proprietary ranking quality belong in provider-owned tests. Hosted engines use the runner's `settle` hook for eventual consistency.

The swap is per-deployment, not per-vertical. A single Voyant deployment runs one indexer adapter; mixing engines across verticals inside the same deployment is not supported and is unlikely to ever be worth the operational complexity.

#### 5.4.3. Pricing patterns for browse-time search

Browse-time **sort by price**, **filter by price range**, and **show "from €X"** are first-class concerns of the catalog plane, not afterthoughts. Hotels are the most demanding case (multi-room, multi-board, multi-rate, refundable / non-refundable variants), but cruises (cabin × occupancy × fare-code grids), tour packages (date-grid prices, occupancy variants), and charters all face the same shape of problem.

The fundamental tension: computing exact live prices for every result on a results page is too expensive (many supplier calls, latency cliffs, partial-failure handling) — but click-through-only pricing is too imprecise (the customer can't sort or filter by what they will actually pay). The catalog plane resolves this with an explicit three-tier pattern stack. Deployments pick a tier per use case; v1 ships Tier 1 with hooks for Tier 2.

##### Tier 1 — Indexed price summaries (cheap, fast, approximate)

The search index stores cached `volatile-indexed` price fields synthesized at index time from the source's current pricing. For hotels, this typically means **multiple variant fields**, not just one global cheapest:

- `price_from` — overall cheapest offer.
- `price_from_refundable` — cheapest refundable offer.
- `price_from_breakfast` — cheapest with breakfast included.
- `price_from_double_occupancy` — cheapest for 2 adults.
- Plus availability flags: `has_upcoming_availability`, `next_available_date`.

Each is a separate row in the vertical's field-policy registry, all `class: "volatile-indexed"`, refreshed on the source's freshness mode. Storefront browse sorts and filters directly on these fields. Fast and stable, but **approximate** — the indexed value reflects the source's pricing at the last sync, not the live pricing for the customer's exact query.

This is the **default tier the catalog plane ships in v1.** It matches the "Cheap/simple" pattern from industry practice and is sufficient for most operators.

##### Tier 2 — Two-stage search with live rerank (more accurate, slower)

For deployments where Tier 1's approximation is unacceptable (high-end hotel resellers, bedbank-heavy storefronts where indexed prices drift quickly, currency-volatile markets), the storefront orchestrates a two-stage search:

1. **Narrow:** the indexer returns top-N candidates ranked by Tier 1 indexed price (typical N = 50–200 — bounded so latency stays predictable).
2. **Rerank:** a helper calls the relevant source adapters' live-pricing operations for those N candidates, with the customer's exact dates / occupancy / market / currency.
3. **Resort:** results are resorted by the live price; missing or timed-out source responses fall back to the indexed price with a `priceSource: "stale"` marker.
4. **Return:** the reranked set goes to the customer with exact-ish prices and per-result provenance.

This pattern is implemented as a `packages/catalog/src/search/rerank.ts` helper — input: indexer candidates + rerank parameters; output: reranked candidates with per-result provenance. Storefront BFFs import it; admin search may use it for high-value workflows. The `IndexerAdapter` contract is unchanged — rerank is orchestration above the indexer, not inside it.

Important constraints:

- **Rerank is opt-in per query** (a search-request flag), not always-on. The default browse experience uses Tier 1; rerank kicks in for "refresh prices for these dates" actions, high-intent queries, or admin workflows.
- **Rerank is bounded** — always top-N, never the full result set. Running it unbounded defeats the purpose of having an index.
- **Latency budgets and source-adapter timeouts** are deployment configuration. A source that times out doesn't block the response; it returns its Tier 1 value with a stale marker.

##### Tier 3 — Date-bucketed cached pricing (advanced, costly)

For high-traffic storefronts with predictable query shapes, Tier 1's price summaries can be expanded into many **pre-computed bucketed variants**:

- Cheapest offer for *each* of the next 12 monthly date windows.
- Cheapest offer per stay-length bucket (1–3 nights, 4–7 nights, 8+ nights).
- Cheapest offer per occupancy bucket (single, double, family, group).
- Cheapest offer per market / currency, where pricing varies by either.

The bucketed variants are still `volatile-indexed` fields in the registry — they are just more numerous and parameterized by query shape. The indexer's `bulkReindex` pipeline regenerates them on a schedule (or on source freshness events) by calling the source adapter for each bucket combination per entity.

Tradeoff: dramatically improves price-sort accuracy for common queries without paying the rerank cost per request, but materially increases indexer storage and refresh load. The bucket vocabulary needs careful curation — too many buckets and the index bloats; too few and accuracy doesn't improve where it matters.

**v1 does not ship Tier 3.** Deployments add it once they have measured Tier 1 + Tier 2 limits and have a concrete query-shape distribution to design buckets against.

##### The product decision: what does "sort by price" mean?

Storefronts must commit explicitly to one of two semantics, and surface that semantics in their UX:

- **Option A — sort by cached starting price** (Tier 1 only). Fast, stable, may be slightly wrong; the customer sees "from €X" prices that match the index, and the exact total appears at the detail / quote step. **This is the v1 default.**
- **Option B — sort by live cheapest valid offer for these exact dates** (Tier 2, optionally backed by Tier 3). More accurate, slower (latency depends on source timeouts and N), operationally more complex; the customer sees prices closer to what they will actually pay.

Most production travel systems use a hybrid: Option A for the initial results page render, Option B invoked for "refresh prices for these dates" actions or for high-intent queries. The catalog plane supports both; the storefront chooses per query.

##### Volatile-live remains uncached

None of the three tiers caches `volatile-live` fields like `quote_price` (the actual room-level total with all taxes / fees / surcharges) or `inventory_count`. Those are always fetched at quote / checkout time through the source adapter. The tiers are about how `volatile-indexed` price summaries are populated and consumed for browse — the live-truth path at quote and book time is unchanged.

##### What the customer actually sees

This is why production hotel results pages display:

- "From €359"
- "Starting at €424 per person"
- "Only 3 rooms left at this price" (Tier 1 inventory flag)
- A staleness indicator when Tier 2 reranking timed out for some results

Then the detail / quote page shows:

- Specific room types
- Refundable vs non-refundable variants
- Exact taxes / fees / surcharges
- Final total in the customer's currency

Those two layers are different by design. The catalog plane supports both — it does not try to make them the same.

#### 5.4.4. Admin vs storefront search topology

Storefront and admin search have different free-text needs, so the catalog plane materializes their index documents differently — even though both ride the same underlying engine.

**Storefront search documents** are audience- and channel-scoped (per §5.4 rule 2). A customer searching the website storefront hits `(vertical, locale, audience=customer, market=M, channel=website)` documents and finds matches against marketing-overlayed text for products published to that channel. A B2B storefront hits its own channel slice, so products can be listed on B2B but absent from the website, or vice versa. Customer documents do not contain source SKUs, internal aliases, or partner-only copy — those fields are not visible to the customer audience and are not indexed in customer documents at all. Same shape for `partner` and `supplier` audiences when they exist.

**Admin search documents** are different. Admin users have legitimate cross-audience search needs: ops types a source SKU; marketing types the storefront title; customer service types what the customer said on the phone. A single staff-audience-only index can't satisfy all three. The clean solution is **denormalization at index time**:

The staff-audience search document for each entity carries a richer field set than any storefront document — it includes the staff-resolved view, plus denormalized text from other audiences, plus internal-only aliases:

```
staff-audience document for entity prod_xxx (locale=en-GB, market=default):
  title:                <staff-audience resolved>
  description:          <staff-audience resolved>
  customer_title:       <denormalized customer-audience overlay>
  customer_description: <denormalized customer-audience overlay>
  partner_title:        <denormalized partner-audience overlay>   // if partner audience exists
  partner_description:  <denormalized partner-audience overlay>   // ditto
  aliases:              ["BLI-WELL-7N-2026", "supplier-ref-12345", "sku-001", ...]
  internal_notes:       <staff-only field>
  ...
```

The admin search engine queries across `title, customer_title, partner_title, description, customer_description, aliases` with appropriate weights. Match anywhere → entity surfaces. Three concrete admin workflows all served by one query:

- **Ops typing a source SKU** matches `aliases`.
- **Marketing typing the storefront title** matches `customer_title`.
- **Customer service typing the customer's words** matches `customer_description`.

Customer-audience and partner-audience documents do **not** carry this denormalized cross-audience text — only the staff document does. Field-policy `visibility[]` is enforced at index-build time: customer documents only get customer-visible fields, partner documents only get partner-visible fields. The denormalization is a property of the staff-audience index document, queryable only by staff actors.

This same denormalization powers the "preview as customer" admin feature. The admin already has the customer text inline in the result; flipping the preview is a render-time concern, not a re-fetch.

**The IndexerAdapter contract** declares an additional capability hint:

- `supportsAdminDenormalization: boolean` — does this engine efficiently support documents with multiple weighted text fields? Typesense and Algolia both do natively; Postgres FTS does with care; engines without efficient multi-field weighted search may need to materialize a separate flat-text field that concatenates the cross-audience values, with reduced query expressiveness. The capability lets the catalog plane fail soft when a swap-in engine can't deliver the topology cleanly.

**Keyword vs semantic on admin documents.** The cross-audience text denormalization above applies only to **keyword / free-text** matching. Admin **semantic search** carries a single embedding over staff-audience text only — vectors do not denormalize across audiences. Cross-audience semantic queries from staff actors are an explicit federated request against another audience's pool (`search_audiences: ["customer"]` etc.), not an automatic property of the staff embedding. This split keeps semantic similarity meaningful (one vector = one audience's meaning) while keeping admin keyword search powerful (one query covers SKU, marketing title, customer copy).

### 5.5. Drift events

When a feeder detects a material change in a sourced field — especially structural fields, cancellation rules, or pricing-basis fields — it emits a drift event. Drift events go to an ops queue for review.

Drift severity per field is declared in the policy registry (`drift: "low" | "medium" | "high" | "critical"`). Critical drift (e.g. `source.ref` changes, cancellation rules change) blocks new bookings on the affected entity until ops acknowledges; lower severities just notify.

Drift on overridden fields is the most operationally important case: if marketing wrote SEO copy for a sourced product's title and the source then changed the title, the override stays in effect, but ops gets a signal that the original source intent has shifted under the override.

### 5.6. Source adapter contract (public extension point)

The source adapter contract is the seam through which any external feed projects into the catalog plane. It is explicitly a **public extension point**: Voyant defines and maintains the contract; implementations come from anywhere.

Concrete implementers can include:

- **Voyant Connect** — the default implementation Voyant ships, covering a curated set of providers as connectors land in Connect.
- **A wholesaler or upstream provider** — e.g. TUI's own engineering team builds a TUI-to-catalog adapter and distributes it as a package or plugin so any Voyant tenant reselling TUI can install it.
- **A cruise line, hotel chain, or bedbank** — e.g. a cruise line provides a first-party adapter that bridges its booking API to the catalog plane.
- **An operator** — an agency builds a hand-rolled adapter against its own private feed (a CSV drop, a partner API the agency negotiated directly).
- **A third-party integrator** — a consultancy or platform builds and sells adapters against the contract.

No implementer is privileged. Voyant Connect, a TUI-built adapter, and a hand-rolled CSV importer all satisfy the same contract and project into the same catalog plane on equal terms.

The adapter contract surfaces (concrete API to be settled in `packages/catalog/src/adapter/contract.ts`) cover, at minimum:

- **Discovery** — emit normalized projections of catalog entries the source provides (per vertical the source supports).
- **Provenance** — declare `source_kind`, `source_ref`, `source_freshness` for each emitted entry.
- **Live resolution** — fetch volatile-live fields on demand (price quote, availability check, hold creation).
- **Booking forwarding** — for sourced inventory where the booking is held upstream, forward reserve / modify / cancel / status calls and return durable handles for the snapshot.
- **Drift signals** — emit drift events when the adapter detects material upstream changes in fields the policy registry flags as drift-relevant.
- **Capability declaration** — describe which verticals the adapter feeds, which fields it can populate, and which post-book operations it supports. The catalog plane uses this to route operations and to fail fast when an operation is unsupported.
- **Connection lifecycle** — declare `connect`, `pause` (soft disconnect), and `disconnect` (hard disconnect) operations so the adapter can be added, temporarily paused, or fully removed with a clean data lifecycle. See §5.10 for the data-lifecycle implications of each.

The contract is intentionally narrow at the edges (a small surface adapters must implement) and broad at the center (the field-policy contract that emitted projections must satisfy). That asymmetry is deliberate: making the adapter shape easy to implement maximizes who can build one, while keeping the field-policy contract strict ensures every adapter projects into a coherent catalog regardless of who wrote it.

Versioning: the adapter contract is a public API. Breaking changes follow the same discipline as any public Voyant package — additive-only within a minor version, deprecation cycle before removal, clear migration paths between major versions. Third-party adapters depend on the contract package directly, so they upgrade on their own timeline.

### 5.7. Caching strategy

The catalog plane has five distinct caching layers, each with its own correctness model and invalidation story. Conflating them is the bug class to avoid: "the price is stale" and "the title is stale" are very different problems with very different acceptable tolerances. Each layer is named, scoped, and invalidated independently.

#### 5.7.1. The five layers

| Layer | Caches | TTL / invalidation | Lives in |
| --- | --- | --- | --- |
| **1. Source projection** | Slow-moving fields fed from upstream (title, geography, room types, cancellation rules, ship name, etc.) | Refreshed on the field's `sourceFreshness` mode — `sync` interval, `event` push, `request` on demand, `static` never; drift events flag mid-cycle changes | The vertical module's own table — technically storage, but behaves cache-like relative to the upstream source |
| **2. Editorial overlay rows** | Override rows in the overlay store, keyed `(entity_module, entity_id, field, locale, audience, market)` | Invalidated on write to that key | DB; optionally short-TTL in-process LRU when measured |
| **3. Resolved CatalogEntry views** | The merged result of source + overlay per `(locale, audience, market)` | Bust on either source projection update OR overlay write for that entity | Optional — **not added in v1**; per-worker LRU or distributed cache once profiling justifies it |
| **4. Search index documents** | Per-(locale, audience, market, channel) docs, including referenced entities (hotel inside a package's search doc); admin documents denormalize across audiences (§5.4.4) | Targeted reindex on entity change, overlay change, channel publication change, OR referenced-entity change (via the `referenced_by` index) | Postgres projection (managed default; native FTS foundation with Lakebase/pgvector strategies selected by recorded capability state); Typesense remains selectable, alongside external engines through the `IndexerAdapter` contract (§5.4.2). The index *is* itself a cache. |
| **5. HTTP / CDN response cache** | Whole `/v1/public/*` responses for browse + product-detail | ETag + `Cache-Control` + stale-while-revalidate; busts on entity-version-token change | CDN edge (Cloudflare / Fastly / equivalent) |

**Volatile-live fields are not cached at any of these layers.** `quote_price`, `inventory_count`, `bookable_now`, `hold_expiry` always go through the source adapter live. If a specific hot path measurably needs short-lived caching (5–30s), that lives **inside the source adapter**, not in the catalog plane — keeps the caching decision local to the source's tolerances rather than baked into the contract. See open question 5.

#### 5.7.2. v1 recommendations

1. **Do not cache resolved CatalogEntry views in-process in v1 (Layer 3 stays empty).** The resolver is one DB query for source + a small overlay query + merge logic. Adding an in-process cache adds invalidation complexity (pub/sub across worker instances on overlay writes) and the win is unmeasured. Add only when profiling justifies it.
2. **Lean on the search index as the primary read cache for browse (Layer 4).** Storefront and admin browse hit the index; the expensive resolver work happens at index time, not request time. Storefront browse should rarely call the resolver directly.
3. **HTTP-cache `/v1/public/*` aggressively (Layer 5).** Highest-leverage cache for storefront load. ETag = hash of `(entity_updated_at, max_overlay_updated_at_for_entity, last_source_sync_at)` — busts cleanly on either source or overlay change. `Vary` on the locale and audience headers. Stale-while-revalidate handles the freshness-vs-latency gap. Do **not** HTTP-cache `/v1/admin/*` — staff edit surfaces need fresher reads.
4. **Cache adapter capability declarations in-process.** When a vertical asks "does this source support modify-after-book for entity X?", that answer changes rarely and is hot. A small in-process LRU is fine; capability changes are infrequent enough that even a 5-minute TTL is generous.
5. **The reverse-lookup index (`referenced_by`) is maintained, not cached.** It's data — updated transactionally on link create / delete. It serves a cache-like role for cross-entity reindex fanout, but it has no TTL and no eviction; if it's wrong, that's a bug, not a stale read.

#### 5.7.3. Invalidation cascade

The cascade when a single thing changes:

**Source updates a field on entity X:**

- Layer 1 (storage) writes the new value.
- If the field has a `drift` policy: emit drift event on its severity.
- Layer 4: enqueue reindex for entity X across all `(locale, audience, market)` combinations it appears in.
- Layer 4: enqueue reindex for entities that reference X (via `referenced_by`).
- Layer 5: HTTP cache busts naturally on next request via ETag mismatch.
- Layers 2, 3: not affected — overlays unchanged.

**Editor writes overlay for entity X, field F, locale L, audience A:**

- Layer 2: write overlay row; evict any in-process cache for that key.
- Layer 4: enqueue reindex for entity X **only for `(locale=L, audience=A, market=M)`** — narrow scope.
- Layer 4: enqueue reindex for entities that reference X (via `referenced_by`), still narrow-scoped.
- Layer 5: HTTP cache busts via ETag.
- Layer 1: not affected.

**Quote / availability / inventory request (volatile-live):**

- No cache lookup at any catalog-plane layer.
- Source adapter called live.
- Source adapter may have its own internal short-lived cache, declared in its capability metadata.

The key discipline: **invalidation is asymmetric — sources invalidate broadly (all `(locale, audience, market)` combinations for the affected entity), overlays invalidate narrowly (one `(locale, audience, market)` triple).** That asymmetry keeps overlay edits fast and cheap; source updates are rarer and warrant the broader sweep. The reverse-lookup index applies in both directions: any entity that references the changed one also reindexes.

#### 5.7.4. Edge cache considerations

Voyant deployments run on Node. Separate storefronts and other edge clients may
place KV, CDN cache, or R2-backed delivery in front of the deployment. The
catalog plane does not prescribe those external cache surfaces; it only
requires that:

- ETags are computed deterministically from the entity-version-token, so any edge cache that respects HTTP semantics invalidates correctly.
- The source adapter contract supports a `freshness_check` operation (HEAD-equivalent) so edge caches can revalidate without full payload reads.
- External KV / CDN cache usage is owned by the edge application; this document
  does not standardize a key schema for it.

### 5.8. Outbound change events and webhooks

The catalog plane emits change events when a CatalogEntry's projection or overlays mutate. These events serve two consumers:

1. **Internal:** the indexer reindex queue (§5.4), the drift detector (§5.5), in-deployment subscribers reacting to mutations.
2. **External:** other Voyant deployments, third-party storefronts, partner agencies, CMS systems, internal data lakes — anything holding a downstream copy of catalog data that needs to stay fresh.

The internal case rides Voyant's in-process event bus (`@voyant-travel/core/events`). The external case rides Voyant's existing webhook delivery infrastructure (`infraWebhookSubscriptionsTable` + the delivery pipeline documented in [`event-delivery-and-durable-execution-policy.md`](./event-delivery-and-durable-execution-policy.md)). The catalog plane does **not** reinvent subscription storage, signing, retry, or HTTP delivery — those already exist. This section defines only the catalog-specific event taxonomy and payload-visibility rules that sit on top.

#### 5.8.1. The motivating cross-deployment case

**Operator A** runs a Voyant deployment as the canonical owner of inventory. **Agency B** runs a separate Voyant deployment that resells Operator A's inventory. When A's prices, availability, or product details change — including changes triggered by bookings on A reducing inventory — B should learn within seconds, not via an hourly sync.

The flow:

1. B's source adapter (an implementation of the §5.6 contract pointing at A) registers a webhook subscription on A at adapter-setup time. Subscription declares: which event types, which entities (or "all sourced inventory authorized for this peer"), the delivery URL, the secret, and B's audience scope (typically `partner`).
2. A's catalog plane fires events on every relevant mutation, enqueued via the existing event bus and webhook delivery pipeline.
3. A's webhook delivery worker POSTs the event to B's URL with HMAC signature, retrying per the existing policy.
4. B's adapter receives the event, validates the signature, and updates B's local source projection of that entity.
5. B's drift detector evaluates whether the update conflicts with any of B's editorial overlays on the entity, and emits a drift event for B's ops if so.

The same pattern serves any external consumer: Voyant ↔ Voyant, Voyant ↔ third-party CMS, Voyant ↔ partner storefront. The catalog plane treats them all identically — they verify webhooks the same way and receive payloads filtered by the same visibility rules.

#### 5.8.2. Catalog event taxonomy

The catalog plane emits these event names (using the canonical envelope shape from [`event-delivery-and-durable-execution-policy.md`](./event-delivery-and-durable-execution-policy.md)):

| Event name | Fired when | `metadata.category` |
| --- | --- | --- |
| `catalog.entity.created` | A new CatalogEntry is created in a vertical | `domain` |
| `catalog.entity.updated` | One or more `managed` or `structural` fields change; payload includes which paths changed | `domain` |
| `catalog.entity.archived` / `catalog.entity.deleted` | Entity removed (soft- or hard-delete) | `domain` |
| `catalog.entity.price.changed` | Any `volatile-indexed` price field changed beyond a configurable noise threshold | `domain` |
| `catalog.entity.availability.changed` | Any `volatile-indexed` availability field changed | `domain` |
| `catalog.entity.overlay.changed` | Editorial overlays on the entity changed | `internal` (default — see §5.8.4) |
| `catalog.entity.drift.detected` | Drift detector found a material upstream change conflicting with overlays | `internal` |
| `catalog.booking.committed` | A booking committed against the entity (inventory delta; no PII) | `domain` |
| `catalog.booking.cancelled` | Booking cancelled, inventory restored | `domain` |
| `catalog.source.disconnected` | Source hard-disconnected; affected entities archived (§5.10) | `domain` |
| `catalog.source.reconnected` | Source reconnected within retention window; entities restored (§5.10.5) | `domain` |
| `catalog.entity.reference.missing` | A referenced CatalogEntry has been archived; parents affected (§5.10.4) | `domain` |

Payload data fields (carried in `event.data`):

- `entity_module`, `entity_id` — which vertical, which entity.
- `event_subtype` (where applicable) — e.g. for `catalog.entity.updated`, the changed field paths.
- `before` / `after` snapshots of the affected fields (filtered by §5.8.4 visibility rules).
- `provenance` — `source_kind` and `source_ref` so receivers can correlate with their own source projection.
- `occurred_at` — the source-side mutation timestamp.

#### 5.8.3. Subscription model — reuse, do not reinvent

Catalog event subscriptions store in the existing `infraWebhookSubscriptionsTable` with `events: ["catalog.entity.updated", "catalog.entity.price.changed", ...]`. No new subscription table; no new signing scheme; no new retry policy. The catalog plane's only additions to the subscription record are **audience and market markers** — declared via either:

- Dedicated subscription metadata fields (`audience: "staff" | "customer" | "partner" | "supplier"` and `market: <market_id> | "default"`), set at subscription-creation time, OR
- A namespaced events convention (e.g. subscribing to `catalog.entity.updated:partner:UK` to receive partner-visibility-filtered, UK-market payloads).

The exact mechanism is settled when the catalog event emitter is implemented. The architectural commitment is: every catalog webhook subscription has a single `(audience, market)` scope, and payloads are filtered to fields visible to that audience and resolved against that market's overlay overrides (§5.8.4). Default deployments use `audience: "staff"` for internal subscriptions and `audience: "customer"` for any external storefront-style subscribers, with `market: "default"` always — same simple two-set shape as the rest of the catalog plane.

#### 5.8.4. Visibility-filtered payloads

Webhook payloads MUST respect the field-policy `visibility` axis. A subscriber whose audience is `partner` only receives field values whose policy includes `partner` in the `visibility[]` set. Internal-only fields (`internal_notes`, operator margin data, audit metadata, anything `visibility: ["staff"]`) **never** appear in payloads delivered to external subscribers, regardless of event type.

This is critical for the Operator → Agency case: Operator A's editorial overlays (their SEO copy, internal tags, margin notes) are private to A. Agency B subscribes as a `partner` audience; B's source adapter receives only the fields A has marked partner-visible. The catalog plane filters automatically using the field-policy registry; it is **not** the subscriber's responsibility to ignore fields it shouldn't see.

`catalog.entity.overlay.changed` is `metadata.category: "internal"` by default, meaning external subscribers do not receive it at all. Operator A's editorial decisions are not Agency B's business — B has its own overlays on its own copy of the entity. If a deployment explicitly opts a `staff`-audience subscriber into overlay-change events for cross-deployment ops tooling, the visibility filter still applies to the payload.

#### 5.8.5. What is NOT pushed via webhooks

- **`volatile-live` field changes.** Inventory counts, exact quote prices, hold expirations — fetched live through the source adapter on demand. Webhooks would amplify upstream load without value: receivers cannot trust the value across the gap between event and read anyway.
- **Source adapter capability declarations.** Capabilities change rarely and are pulled at adapter init; not event-driven.
- **Internal overlay changes** to non-staff audiences (per §5.8.4).
- **Booking PII.** `catalog.booking.committed` carries entity / inventory deltas and the booking ID, never customer details. PII flows through booking-PII channels (see [`booking-pii.md`](./booking-pii.md)), not catalog webhooks.
- **Search index reindex events.** Reindex is an internal pipeline concern (§5.4), not an outbound notification — external subscribers don't care which Typesense collection got rewritten.

#### 5.8.6. Responsibility split

The catalog plane is responsible for:

- Detecting which mutations should fire which catalog event names (mutation hooks in vertical service layers + the overlay store).
- Constructing payloads with field-policy-driven visibility filtering.
- Stamping events with provenance.
- Emitting via `@voyant-travel/core/events`; the existing dispatcher routes domain events to the webhook delivery pipeline.

The existing webhook system is responsible for:

- Subscription storage (`infraWebhookSubscriptionsTable`).
- HMAC signature computation.
- HTTP delivery, retry, dead-letter, idempotency.
- Per-policy ordering and replay tooling.

This division mirrors the rule from [`cross-module-indexing-and-projection-policy.md`](./cross-module-indexing-and-projection-policy.md): every projection / pipeline has one explicit owner, and shared infrastructure is consumed, not reinvented.

### 5.9. Semantic Search, Embeddings, And AI Agent Access

Semantic search is a catalog capability, not a sibling package. The
`IndexerAdapter` contract surface (§5.4.2) declares vector support flags
(`supportsVectorFields`, `supportsHybridSearch`, `vectorDimensions`,
`maxVectorsPerDocument`, `supportsCrossAudienceFederation`) and the native
Typesense integration (§5.4.1) can store embeddings without a parallel data
plane.

Catalog owns:

- the `EmbeddingProvider` contract and current OpenAI / Gemini providers;
- embedding model compatibility, stamping, and migration helpers;
- semantic/hybrid/BYO-vector search orchestration;
- per-audience embedding pool rules and cross-audience federation helpers.

AI agents use the catalog HTTP APIs directly. Runtimes may expose local tool
wrappers over those endpoints, but MCP transport/tool packaging is not a
Voyant framework package and should not bypass API auth, visibility,
rate-limit, audit, or tenant controls.

### 5.10. Source disconnection and data lifecycle

When a source is removed from a deployment — a wholesaler partnership ends, bedbank credentials are revoked, an operator stops reselling a peer's inventory, an adapter is uninstalled — the catalog plane must clean up the data that source produced. Failure modes to avoid: orphaned cached data showing up in search results long after the source is gone; embeddings that no longer correspond to current inventory; cross-references pointing to entities that no longer resolve; webhook subscribers continuing to receive events for stale entities.

But cleanup must be **deliberate, not automatic**. A network blip, expired credentials, or a planned maintenance window must not trigger cleanup of weeks of cached data and editorial work. The contract distinguishes two disconnect modes accordingly.

#### 5.10.1. Two disconnect modes

The source adapter contract (§5.6) supports two distinct disconnect operations:

**Soft disconnect (pause).** Stop polling and stop receiving events; mark the source connection as paused; keep all cached source projection data, embeddings, index documents, and overlays untouched; display a "data may be stale" indicator on affected entities. This is the default behavior on transient failures (credential expiry, network outage, source-side maintenance). Auto-recovery resumes on reconnect; nothing is destroyed.

**Hard disconnect (remove).** Explicit admin action only — never triggered by transient failure. Runs the cleanup pipeline below; removes source-fed data; preserves booking snapshots (audit truth); follows a retention policy for editorial overlays. Reversible only via source-side reconnect within the retention window.

The distinction matters: most "the source is gone" events in production turn out to be soft-disconnect cases (transient infrastructure problems, credential rotation). Auto-cleanup on those would be catastrophic.

#### 5.10.2. What is removed vs preserved on hard disconnect

| Data | Behavior on hard disconnect |
| --- | --- |
| Source projection rows | Soft-deleted; hard-deleted after retention window (default 30 days, configurable) |
| Search index documents | Deleted across all `(locale, audience, market, channel)` combinations |
| **Embeddings** | **Removed alongside index documents** because vectors live in the same search engine slice. |
| Editorial overlays | Preserved for retention window (default 90 days, configurable), then GC if no reconnect — keeps marketing work recoverable on reseed |
| Drift events history | Archived but kept — audit trail |
| **Booking snapshots** | **Always preserved** — immutable audit truth, never touched regardless of retention windows |
| `referenced_by` reverse-lookup entries | Updated; parents of disconnected entities receive "missing reference" notifications |
| Webhook subscriptions targeting this source | Notified; marked paused for admin review |
| Source adapter capability marker | `connection_state: "disconnected"` (so the catalog plane fails fast on operations targeting this source) |

Retention windows are deployment configuration, not hardcoded. Defaults are conservative; operators with large catalogs and long sales cycles will extend them.

#### 5.10.3. Cleanup pipeline

A hard disconnect runs as a deliberate, observable, dry-runnable job:

1. **Initiate.** Admin triggers disconnect on a specific source connection. Requires explicit confirmation; cannot be triggered by automated failure detection.
2. **Enumerate.** System lists affected entities — every CatalogEntry whose provenance points to this source.
3. **Dry-run report.** Admin sees: how many entities, which verticals, how many bookings have snapshots referencing them (preserved), how many cross-references would dangle, how many overlays exist on each. Cancel here is a no-op.
4. **Archive.** Affected entities transition to `archived` status (not deleted). Search index documents are removed across all `(locale, audience, market, channel)` combinations; embeddings disappear with them since they share the engine.
5. **Soft-delete projections and overlays.** Source projection rows and editorial overlays are soft-deleted with retention timestamps so they can be restored on reconnect.
6. **Update reverse-lookup.** `referenced_by` index updated; parents of disconnected entities receive `catalog.entity.reference.missing` events.
7. **Emit events.** `catalog.entity.archived` per affected entity, plus a single `catalog.source.disconnected` summary event with affected counts. External webhook subscribers receive these per the visibility rules in §5.8.4.
8. **Mark connection.** Source connection state set to `disconnected`; the source adapter is unloaded; subsequent operations targeting this source fail fast with a clear error.

The pipeline is **resumable**. A failure mid-cleanup leaves the system in a consistent state — partially-archived entities are still queryable but flagged; the job can be re-run to complete.

#### 5.10.4. Cross-reference handling

When a referenced CatalogEntry disappears (a hotel disconnects from its bedbank source, leaving package CatalogEntries that referenced it), the referencing parents do **not** auto-archive. Forced parent archival on referent loss would create cascading deletes that nobody asked for.

Instead:

- The referenced entity exists in `archived` state, not deleted — the link still resolves to a row, but that row has no live data.
- The parent's resolved view returns the reference with a `referent_unavailable: true` marker.
- Reindex regenerates the parent's search document **without** the denormalized referenced data.
- Storefront / API consumers see the parent without its referenced component (a package without its hotel).
- Ops receives a `catalog.entity.reference.missing` event with the count of affected parents per disconnected entity.
- The decision to archive parents is operator-driven — a TUI-style package without its hotel may still be sellable as a partial component, depending on operator policy. The catalog plane surfaces the situation; it does not decide.

#### 5.10.5. Reconnection

If the source reconnects within the retention window, the cleanup is reversible:

- Soft-deleted source projection rows are restored when matching TypeIDs reappear from the source.
- Editorial overlays reapply automatically since they were preserved against the same `entity_id`.
- Reindex regenerates index documents and embeddings via the normal pipeline.
- Webhook subscribers receive `catalog.source.reconnected` events.
- Drift detection runs to compare reconnected source state with preserved overlays — surfaces any conflicts the operator should review (e.g. the source changed a title underneath an existing override during the disconnect window).

If reconnection happens after the retention window has elapsed, the cleanup is irreversible — the source is treated as a fresh integration, overlays must be redone, and prior bookings still resolve correctly via their preserved snapshots.

This makes operator disconnect decisions reversible by default within a generous window, while still cleaning up state for sources that are truly gone for good.

#### 5.10.6. Cross-deployment cascade

If Operator A hard-disconnects Agency B (revokes the peer connection that lets B resell A's inventory):

1. A runs its own internal cleanup — but on A's side, this is a webhook subscription removal, not a source disconnect (A is the source, not the consumer).
2. A emits `catalog.source.disconnected` (from B's perspective) via webhooks targeting B — communicating that B is no longer authorized.
3. B's source adapter for A receives this event and triggers B's local hard-disconnect of A's data, going through the §5.10.3 pipeline.
4. The cascade is bounded — it does not propagate further than one hop. If B was reselling A's inventory to a third deployment C, B's disconnect on A does not auto-trigger C's disconnect on B; C continues to see B's catalog (now with archived entries that came from A).

This keeps disconnect blast radius contained and makes each deployment's data lifecycle independently auditable.

### 5.11. Flights — Phase 3

The flight vertical is designed in detail in [`catalog-flights-architecture.md`](./catalog-flights-architecture.md) and ships in **Phase 3** of the catalog plane.

Flights are a partial-adoption vertical: they participate in the booking snapshot graph (§5.3), provenance shape (§5.1), webhook events (§5.8), and source-disconnection lifecycle (§5.10) — but they explicitly opt out of the search index (§5.4), editorial overlays (§5.2), embeddings / RAG (Phase 2), pricing tiers (§5.4.3), and drift detection (§5.5). Flights are live-API by definition; pre-projecting them would produce strain everywhere and value nowhere.

Phase 3 adopts the `FlightConnectorAdapter` contract verbatim from voyant-cloud's `connect-flight-contract` (slice-based search, intent-driven booking, capability-gated extras, multi-connection fan-out with itinerary fingerprint dedupe), and introduces the swappable `ReferenceDataProvider` contract for global reference data (airlines, airports, aircraft) — implementable at any layer including a plain Postgres table in the operator's own database.

Phase 3 is independent of Phase 2. Either can ship first; both build on the Phase 1 foundation.

## 6. Composition rules

These three rules govern where new structure should live as Voyant adds verticals and as verticals grow.

### 6.1. Nested fields rule

A structure is nested (paths under the parent's field-policy registry) when **none** of the promotion or reference signals apply.

Default. Most fields and small lists fit here.

### 6.2. Promoted child entity rule

A structure is promoted to its own table inside the parent vertical's package when **at least two** of the following apply:

1. **Independent lifecycle** — its state transitions independently of the parent (selling / sold-out / cancelled, scheduled / delayed / rescheduled).
2. **Independent query surface** — outside code wants to filter / sort / list by it without traversing the parent ("all departures after Oct 2026", "all flights from MAN").
3. **Booking-decision identity** — the booking captures *which one* the customer chose, not just that the parent was booked.

Single-signal cases stay nested. Two-signal cases promote.

Examples that promote: cruise `departures[]` (all three), package `flights[]` (all three), `cabin_categories[]` (2 + 3), `room_types[]` (2 + 3).

Examples that stay nested: `inclusions[]` (3 only — partial, captured inside parent's snapshot), `transfers[]` (1 only — weak), `itinerary_days[]` (3 only — partial).

### 6.3. Referenced CatalogEntry rule

A structure is its own first-class CatalogEntry in its own vertical module when **either**:

- (a) it is independently sellable, **or**
- (b) it is reused across multiple parent entries with a single shared editorial / snapshot surface.

An accommodation stay (hotel) qualifies under (a) — sold inside a multi-component package or standalone. A standalone excursion product (a 1-day `products` row sold by itself or linked from a longer parent product) qualifies under (a). A DMC's reusable 3-day mini-tour module — never sold alone, but reused across multiple longer tours with one editorial surface — qualifies under (b).

The practical test: if marketing asks "where do I edit this?" and the right answer is "in one place that affects all uses," it is a referenced CatalogEntry, not nested.

### 6.4. Shared master entities (not CatalogEntries)

Ports, airports, terminals, hotel chains, airlines, currencies. These are referenced by FK from CatalogEntries but are not themselves sellable, not editorially overrideable per-tenant in any meaningful way, and not surfaced through the catalog plane.

Ships and accommodation properties are the exception called out in §3.2: they stay non-sellable reference/presentation subjects, but their names, descriptions, gallery curation, alt text, and amenities/facilities copy may be overlayable when the owning package registers durable identity, provenance, field policy, source reader, effective projector, and reverse references. They must not be promoted into the sellable catalog discriminator just to make their presentation content editable.

They live as plain reference tables (probably in `packages/db` or a small dedicated reference module) and are referenced by ID from vertical schemas. Promoting them to CatalogEntries would balloon the discriminator with non-revenue surfaces and confuse the overlay model.

## 7. Conventions and design laws

### 7.1. Human-readable and machine-evaluable concepts MUST split into separate fields

Any concept that has both a human-readable form (customer-facing copy, marketed text, optionally localized) and a machine-evaluable form (rules, structured data, used by an engine) **must** be modeled as two paired fields with independent policies. Trying to carry both in one field is the leak.

Examples:

- `cancellation_policy_text` (merchandisable, localized, marketing-overridable) **and** `cancellation_policy_rules` (managed, source-only, snapshot on quote and book — pricing engine evaluates this).
- `marketing_tags` (merchandisable, additive-set, edit role marketing, reindex `entry`) **and** `facet_tags` (structural, additive-set, edit role ops, reindex `facet-affecting`, override friction `confirm`).
- `board_basis_label` (merchandisable, localized) **and** `board_basis_code` (managed, structural, source-only).
- `child_friendly_copy` (merchandisable, localized) **and** `children_age_supplements_rules` (managed, snapshot critical).
- Likely future: pricing disclaimers (merchandisable) and `pricing_basis` columns (managed).

This is a design law, not a guideline. One field cannot simultaneously carry customer-facing copy and machine-evaluable rules.

### 7.2. Read path resolves one entity; indexer denormalizes references

Already covered in §5.4 — restated as a law because it is operationally load-bearing. API endpoints return the resolved view of one entity plus link IDs for its references. The storefront then either fetches each reference separately or queries the search index, where denormalization has already happened. The read resolver does not transparently traverse links.

### 7.3. Editorial overlays are entity-scoped

An override on a parent CatalogEntry does not propagate to its referenced CatalogEntries. Each entity owns its own overlay surface. This keeps overlay scope clear and prevents unintentional cross-entity edits.

### 7.4. Volatile-live fields never appear in the search index as live values

The search index is a materialized view; live-volatile fields by definition cannot be materialized accurately. They are fetched at quote time or checkout time only. Volatile-indexed fields (browse-time approximations like `from_price`) are allowed in the index with a TTL.

### 7.5. The vertical identifier is open-ended in code; v1 ships a closed set

The vertical-module names that participate in the catalog plane are open-ended at the type level (it is just a string identifier per vertical, matching the package name). The v1 catalog plane ships with the existing verticals: `products`, `cruises`, `accommodations`, `charters`, and `extras` (with the adoption nuance noted in §3.3.1). Adding a future vertical (composite tour-package module, flight-only, transfer-only) is a mechanical addition — register a new vertical identifier, write its field-policy file, declare its overlay / snapshot / indexer adapters. No contract change.

## 8. Worked examples

### 8.1. Viking cruise — selected fields

A cruise is a `packages/cruises` CatalogEntry. Its field policy is declared in `packages/cruises/src/catalog-policy.ts`. Selected entries:

```ts
// identity / source pointer (managed)
{ path: "source.kind",      class: "managed", merge: "source-only", drift: "critical",
  reindex: "entry",         snapshot: "on-book", query: "indexed-column",
  localized: false, visibility: ["staff"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "sync" },
{ path: "source.ref",       class: "managed", merge: "source-only", drift: "critical",
  reindex: "none",          snapshot: "on-book", query: "indexed-column",
  localized: false, visibility: ["staff"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "sync" },
{ path: "seller.operator_id", class: "managed", merge: "source-only", drift: "critical",
  reindex: "none",          snapshot: "on-book", query: "indexed-column",
  localized: false, visibility: ["staff"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "static" },

// merchandisable copy
{ path: "title",            class: "merchandisable", merge: "replace", drift: "medium",
  reindex: "entry-locale",  snapshot: "on-book", query: "indexed-column",
  localized: true, visibility: ["staff", "customer", "partner"], editRole: "marketing",
  overrideFriction: "none", sourceFreshness: "sync" },
{ path: "gallery[]",        class: "merchandisable", merge: "list-position", drift: "low",
  reindex: "entry",         snapshot: "on-book", query: "blob-only",
  localized: false, visibility: ["staff", "customer", "partner"], editRole: "marketing",
  overrideFriction: "none", sourceFreshness: "sync" },

// structural / facets
{ path: "category",         class: "structural", merge: "replace", drift: "high",
  reindex: "facet-affecting", snapshot: "on-book", query: "indexed-column",
  localized: false, visibility: ["staff", "customer", "partner"], editRole: "ops",
  overrideFriction: "confirm", sourceFreshness: "sync" },
{ path: "facet_tags",       class: "structural", merge: "additive-set", drift: "medium",
  reindex: "facet-affecting", snapshot: "on-book", query: "indexed-column",
  localized: false, visibility: ["staff", "customer", "partner"], editRole: "ops",
  overrideFriction: "confirm", sourceFreshness: "sync" },

// cancellation pair (split rule §7.1)
{ path: "cancellation_policy_text",  class: "merchandisable", merge: "replace", drift: "medium",
  reindex: "entry-locale",  snapshot: "on-book", query: "blob-only",
  localized: true, visibility: ["staff", "customer", "partner"], editRole: "marketing",
  overrideFriction: "approval", sourceFreshness: "sync" },
{ path: "cancellation_policy_rules", class: "managed", merge: "source-only", drift: "high",
  reindex: "none",          snapshot: "on-quote-and-book", query: "blob-only",
  localized: false, visibility: ["staff"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "sync" },

// volatile
{ path: "from_price",       class: "volatile-indexed", merge: "source-only", drift: "low",
  reindex: "entry",         snapshot: "on-quote-and-book", query: "indexed-column",
  localized: false, visibility: ["staff", "customer", "partner"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "sync" },
{ path: "quote_price",      class: "volatile-live", merge: "source-only", drift: "none",
  reindex: "none",          snapshot: "on-quote-and-book", query: "blob-only",
  localized: false, visibility: ["staff", "customer", "partner"], editRole: "none",
  overrideFriction: "none", sourceFreshness: "request" },
```

`departures[]`, `cabin_categories[]`, and `itinerary_days[]` are promoted child entities (per §6.2), each with their own micro-registry. They live in `packages/cruises` schemas, joined to the cruise root by FK.

### 8.2. TUI-style composite package — illustrative

A composite tour-package vertical does not currently exist in Voyant. This example illustrates how one *would* fit if added later, and exists here because it is the case that originally exposed the three composition patterns during design.

A TUI-style package would be its own vertical (call it `packages/tour-packages` or similar — name to be settled when the case becomes real). It demonstrates all three composition patterns:

- **Nested fields:** `inclusions[]`, `exclusions[]`, `transfers[]`, `airport_pickup_included`, `baggage_allowance_kg`.
- **Promoted child entities** (in the composite vertical): `departures[]`, `flights[]`.
- **Referenced CatalogEntries** (cross-package via `defineLink`):
  - **Accommodation stay** — a sourced or composed accommodation CatalogEntry.
    The composite package links to it; the stay has its own merchandising
    surface, its own booking semantics when sold standalone, and its own
    `room_options[]` child shape.
  - **Excursions** — `packages/products` CatalogEntries (1-day products, sold standalone or linked into longer parents).

A booking on such a package would capture a snapshot graph:

```
booking_id: bk_abc
booking_catalog_snapshot rows:
  - entity_module: tour-packages, entity_id: tpkg_xyz, frozen_payload: {…package view…}
  - entity_module: accommodation, entity_id: acc_mno,  frozen_payload: {…stay view at book time…}
  - entity_module: products,      entity_id: prod_111, frozen_payload: {…excursion view…}
  - entity_module: products,      entity_id: prod_222, frozen_payload: {…excursion view…}
  // departures and flights are captured inside the package's frozen_payload
  // (they're promoted children of the composite vertical, not referenced CatalogEntries)
```

Refunding, modifying, or status-syncing this booking eight months later can read each component's frozen view to know exactly what the customer paid for and what cancellation policy applied to each piece. The same pattern applies whether the composite vertical exists today or is added later — the snapshot table accepts any registered `entity_module`.

## 9. Adoption plan

v1 is a single coordinated piece of work: the catalog plane lands and every existing vertical adopts it together. Sequencing inside the work is for development convenience; the release is one cut, not five.

### 9.1. Build order inside v1

The work has natural sequencing because vertical adoption depends on contract types existing first. The order is:

**Phase A — `packages/catalog` infrastructure** (must land before any vertical adoption can compile):

1. `packages/catalog/src/contract.ts` — the `FieldPolicy` type, the enums, the inheritance loader. No fields populated.
2. `packages/catalog/src/provenance.ts` — the `Provenance` shape and helpers.
3. `packages/catalog/src/overlay/schema.ts` — the overlay table schema (drizzle).
4. `packages/catalog/src/overlay/resolver.ts` — the resolver-merge logic (apply overlays to a source projection, with locale + audience + market fallback chain).
5. `packages/catalog/src/snapshot/schema.ts` — the `booking_catalog_snapshot` table schema.
6. `packages/catalog-contracts/src/indexer/contract.ts` and `conformance.ts` — the engine-agnostic `IndexerAdapter` / `IndexerProvider` contracts and portable adapter conformance kit. `packages/catalog/src/indexer/contract.ts` is a compatibility re-export.
7. `packages/catalog/src/indexer/typesense.ts` and `typesense-provider.ts` — native Typesense implementation and first-party `catalog.indexer` graph provider (§5.4.1). Default search selection for managed-cloud deployments.
8. `packages/catalog/src/search/rerank.ts` — Tier 2 two-stage-search orchestration helper for browse-time pricing (§5.4.3). Storefront BFFs import this; v1 ships the helper but storefronts opt in per query.
9. `packages/catalog/src/drift/events.ts` — drift event types.
10. `packages/catalog/src/events/taxonomy.ts` — catalog event names + payload builders with field-policy-driven visibility filtering (§5.8). Emits via `@voyant-travel/core/events`; reuses the existing webhook delivery pipeline.
11. `packages/catalog/src/adapter/contract.ts` — the public source-adapter contract (§5.6).

The `EmbeddingProvider` contract and embedding pipeline ship in `packages/catalog`.
The flight-vertical artifacts ship as part of Phase 3 (`packages/flights`); see
[`catalog-flights-architecture.md`](./catalog-flights-architecture.md) §7.

**Phase B — vertical adoption, in parallel where possible:**

`packages/products` is the **shake-out adopter**: it goes first within Phase B because it is the largest existing vertical with the most consumers (bookings, finance, CRM, transactions, distribution all read from it), so any rough edges in the catalog contract surface against it first. Steps for products:

1. Write `packages/products/src/catalog-policy.ts` — declare every product field under the contract.
2. Wire products' service create/update calls to write provenance fields.
3. Wire products' service into the overlay resolver for read paths.
4. Wire bookings' commit path to emit `booking_catalog_snapshot` rows for the product (and any referenced CatalogEntries - initially none, since products do not yet reference accommodation stays or extras through the catalog plane).
5. Wire products into the indexer adapter (one search document per product, per locale, per audience).

Once products' adoption proves the contract, the remaining in-scope surfaces
adopt in parallel: `packages/cruises`, accommodation resale,
`packages/charters`, and the Inventory/Bookings extras owner paths. Each full adoption is structurally
the same as products' (write the catalog-policy file, wire provenance, wire
overlay reads, wire snapshot capture, wire the indexer adapter). Cruises is
already designed in alignment with this contract (see
[`cruises-module.md`](./cruises-module.md)); charters has its own design notes
(see [`charters-module.md`](./charters-module.md)) and adopts via the same
pattern. Extras adopts partially per §3.3.1 - provenance and snapshot only at
first. Accommodation adoption must follow the resale boundary and exclude
hotel-operations surfaces from first-party starters.

**Phase C — release.** All five verticals are merged behind the same release boundary. No vertical participates in the catalog plane in production until all five do.

### 9.2. Why coordinated, not staggered

A staggered rollout — where one vertical's intended Phase 1 scope ships partially while others lag — is harder to reason about than either pure state:

- Storefront search would return mixed results — some entities surfaced through the catalog plane with proper overlays applied, others surfaced through the legacy read path with no overlay support.
- Editorial teams would have inconsistent override surfaces — some verticals support `locale + audience + market` overrides, others do not.
- Booking snapshot semantics would differ per vertical, complicating refund and audit logic exactly during the transition window when complications are least welcome.
- The adapter contract would have a partially-realized consumer set, making it harder to pressure-test against real adoption load.

Coordinating five vertical adoptions inside one release is more upfront work than rolling out one at a time. It avoids the transition-state complexity that makes staggered rollouts expensive in subtle ways. Voyant deployments are single-tenant per environment, so coordinating a release across five modules is operationally tractable.

**Bounded exception: `extras`.** Per §3.3.1, `extras` ships with overlays and indexer participation deferred — that's its intended Phase 1 scope, not a transitional gap. Each vertical's intended scope is fully live at release; varied participation depths across verticals are explicit and documented, not in flight.

The existing operational schemas are untouched. Catalog adoption is additive — no destructive migration on `products`, `cruises`, `accommodations`, `charters`, or the Inventory/Bookings extras owner paths.

### 9.3. After v1

Once all five verticals are participating, future verticals (composite tour-package, flight-only, transfer-only) adopt from day one when they ship — there is no longer a "v1 cut" to coordinate against, just the standing catalog contract.

Future adapter implementations (Voyant Connect's connectors, third-party adapters built by wholesalers, operator-built CSV importers) plug into the same contract without needing the catalog plane to change.

## 10. Open questions

These are explicit unresolved points. They are tracked here so future decisions inherit the context.

1. **`approverRole` axis.** The contract reserves `overrideFriction: "approval"` but does not yet declare *who* approves. Deferred until a second concrete approval case appears (the first is `cancellation_policy_text`). Likely added as a paired axis: `{ overrideFriction: "approval", approverRole: EditRole }`.
2. **Audience vocabulary growth.** v1 ships with the actor-aligned vocabulary (`staff | customer | partner | supplier`) plus the `default` sentinel on the overlay key. If white-label tenants proliferate, a per-tenant sub-audience pattern (e.g. namespaced sub-values under `partner` for white-label slugs) may earn its keep. Defer until the first multi-white-label deployment.
3. **Reverse-lookup index implementation details.** The `referenced_by` reverse-lookup table is **committed** as a maintained data structure (not an open question) — it is updated transactionally on `defineLink` create/delete operations and is consumed by the reindex pipeline (§5.4 rule 3), the cache invalidation cascade (§5.7.3), and the source-disconnect cleanup (§5.10.3). The remaining open detail is purely operational: whether the table lives in the catalog plane's own schema or piggybacks on the existing link-service tables in `packages/db/src/links` — to be settled when the link-service code is touched for catalog adoption.
4. **Fanout behavior for shared editorial on Pattern 3(b) entities** (the reusable mini-tour case). When a referenced CatalogEntry's editorial changes, every parent that references it needs reindex. Same reverse-lookup question as (3); resolves together.
5. **Volatile-live caching for hot paths.** Some volatile-live fields (e.g. `quote_price` for a frequently-quoted package) may need short-lived caching (5–30s) for storefront performance. Per §5.7, when this need is measured, the cache lives **inside the source adapter**, not in the catalog plane — the source declares its caching tolerance through its capability metadata, and the catalog plane stays out of it. The open question is whether the adapter contract should standardize a `cacheTtlSeconds` capability hint or leave it as a fully-internal adapter concern.
6. **Tenant-configurable field policy.** A field that is `merge: "source-only"` for one tenant might be `merge: "replace"` for a white-label deployment that has negotiated rights with the source. Currently field policy is per-vertical, not per-tenant. Defer until a real tenant case demands it; likely a per-tenant policy override layer above the per-vertical defaults.
7. **Whether a composite tour-package vertical is needed.** TUI-style flight + hotel + transfer bundles are currently modeled either inside `products` or via cross-module links between existing verticals. If reseller scenarios drive package-level pricing, cancellation, and snapshot semantics that are awkward in `products`, a dedicated vertical may earn its keep. Decision deferred until a real reseller case forces it.
8. **`packages/extras` adoption depth.** Partial adoption (provenance + snapshot) is the v1 plan per §3.3.1. Whether extras eventually need editorial overlays and search-index participation depends on whether they ever become discoverable as standalone surfaces. Defer.
9. **Retention window defaults for source disconnect (§5.10).** Phase 1 ships conservative defaults (30 days for source projection rows, 90 days for editorial overlays). These are deployment-configurable but the right default is operator-pattern-dependent — DMCs with multi-year sales cycles may want much longer windows; high-churn agencies may want shorter. Revisit defaults once enough deployments have run a real disconnect cycle.
10. **Forced parent archival on referent loss (§5.10.4).** Phase 1 leaves disconnected-referent handling to the operator (parents stay queryable with `referent_unavailable: true` markers). If a real operator workflow surfaces where automatic parent archival is the desired behavior (e.g. "if any referenced hotel is unavailable, hide the package"), add an opt-in policy field. Defer until the case appears.

Flight adoption carries its own open questions in
[`catalog-flights-architecture.md`](./catalog-flights-architecture.md) §8.

## 11. Glossary

- **Catalog Item** — a normalized sellable discovery and booking record in any vertical. The unifying noun of the catalog plane (the discovery / browse / merchandising layer).
- **Pricing Quote** — an immutable, expiring, server-produced price and terms
  result for an exact Booking Session revision or equivalent provider pricing
  request, created through `/v1/{admin,public}/catalog/quote`. It may be followed
  by an optional Hold and then Commit/Booking under ADR-0019. It is distinct
  from a bespoke Proposal Version.
- **Vertical module** — a package modeling one kind of sellable inventory. Existing verticals: `products` (tours / experiences / standalone excursions), `cruises`, `accommodations` (hotels / stays for resale), `charters` (yachts), `extras` (booking add-ons).
- **Catalog plane** — the cross-vertical projection / overlay / snapshot / indexer surface defined by `packages/catalog`.
- **Provenance** — the `(source_kind, source_ref, source_connection_id, source_freshness)` tuple carried by every CatalogEntry.
- **Overlay** — an editorial override on a specific field of a specific entity, scoped by `(locale, audience, market)`. See §5.2.
- **Variant axes** — the three sparse axes on the overlay key beyond `entity_id` and `field_path`: `locale`, `audience`, `market`. Most overlays use only the combinations the deployment actively serves. See §5.2.2.
- **Default deployment shape** — the simple operating point most agencies use: two audiences (`staff` + `customer`), one market (`default`), 1–3 locales. Two index document sets per locale per vertical. See §5.2.2 and the §5 intro.
- **Live-API vertical** — a vertical whose inventory is fetched live on demand rather than projected and indexed (e.g. flights). Participates in the catalog plane partially. Designed in [`catalog-flights-architecture.md`](./catalog-flights-architecture.md).

Phase 2 (RAG) and Phase 3 (Flights) carry their own glossaries in their respective documents.
- **Snapshot graph** — the set of frozen entity views captured at booking commit time (one snapshot row per participating CatalogEntry).
- **Promoted child entity** — a structure inside a vertical module that has its own table and micro-registry (e.g. `departures` inside `cruises`). Not independently sellable.
- **Referenced CatalogEntry** — a CatalogEntry in one vertical referenced from another vertical via `defineLink` (e.g. a package referencing a hotel). Independently sellable or shares editorial across uses.
- **Shared master entity** — non-sellable reference data (ship, port, airport). Referenced by FK; not in the catalog plane.
- **Source adapter** — an implementation of the public adapter contract (§5.6) that emits provenance + projected fields for a specific source. Implementations can come from Voyant Connect, from a wholesaler or upstream provider's own engineering team, from an operator, or from a third-party integrator. No implementer is privileged.
- **Soft disconnect** — pausing a source connection without destroying cached data. Default response to transient failures (credential expiry, network outage). Reversible without data loss. See §5.10.1.
- **Hard disconnect** — explicit admin-triggered removal of a source. Runs the cleanup pipeline (§5.10.3): archives entities, deletes index documents and embeddings, soft-deletes source projections and overlays under retention windows, preserves booking snapshots. Reversible only via reconnect within the retention window.
- **Drift event** — a notification emitted when a feeder detects a material upstream change in a source-owned or structural field.
- **Operator** — the commercial seller (your tenant in Voyant). Not the same as the upstream fulfillment party for sourced inventory.
- **Operating party / fulfiller** — the entity that physically operates the inventory. For owned products, this is the same as the operator; for sourced products, it is the upstream supplier or operator. Currently kept as glossary, not promoted to schema — derivable from `source.kind` (owned → operator fulfills, sourced → upstream fulfills). Promote to a first-class column only when commercial-vs-fulfillment splits become genuinely non-trivial (e.g. white-label DMC where you are seller-of-record but a partner runs the trip).

## 12. Related documents

### Related Architecture Documents

- [`catalog-rag-architecture.md`](./catalog-rag-architecture.md) — superseded note for the retired `catalog-rag` / `catalog-mcp` package split.
- [`catalog-flights-architecture.md`](./catalog-flights-architecture.md) — **Phase 3.** Flights as a partial-adoption vertical: `FlightConnectorAdapter` contract borrowed from voyant-cloud, slice-based search, intent-driven booking, multi-connection fan-out with itinerary fingerprint dedupe, the swappable `ReferenceDataProvider` contract for global reference data.
- [`provider-catalog-contracts.md`](./provider-catalog-contracts.md) — provider capability declarations, promotion applicability/display contracts, and normalized availability projection semantics for source adapters and downstream SDK/UI consumers.

### Voyant-wide context

- [`UBIQUITOUS_LANGUAGE.md`](../../UBIQUITOUS_LANGUAGE.md) — the canonical
  Voyant vocabulary, including reusable catalog booking (`Product → Booking
  Session → Quote + optional Hold → Commit → Booking`) and bespoke sales
  (`Proposal → accepted Proposal Version → Booking Session → Quote + optional
  Hold → Commit → Booking`).
- [`event-delivery-and-durable-execution-policy.md`](./event-delivery-and-durable-execution-policy.md) — the canonical event envelope and delivery semantics that catalog webhook events ride on (see §5.8).
- [`cruises-module.md`](./cruises-module.md) — the cruise vertical module, which adopts this contract.
- [`schema-discipline.md`](./schema-discipline.md) — the intra-domain FK rule and cross-domain link discipline that this architecture builds on.
- [`cross-module-indexing-and-projection-policy.md`](./cross-module-indexing-and-projection-policy.md) — the broader rule that projections are derived read models, not second sources of truth. This catalog plane is the most substantial concrete projection in Voyant; the rules in that document apply.
- [`link-metadata-and-relationship-policy.md`](./link-metadata-and-relationship-policy.md) — the `defineLink` infrastructure that Pattern 3 (referenced CatalogEntries) reuses.
- [`storefront-architecture.md`](./storefront-architecture.md) — the storefront read paths that consume the catalog plane.
- [`booking-pii.md`](./booking-pii.md) — booking-side concerns; the snapshot graph in §5.3 lives alongside booking storage.
