# Cruises module — design

Status: draft / proposal
Branch: `feature/cruises-module`
Audience: anyone implementing or reviewing the cruise module before code lands.

## 1. Why this exists

Voyant today is a tour-operator platform. Its `products` module models day-by-day itineraries with per-person pricing, sold per-departure. That is the right shape for DMCs and tour operators, and it covers most of what travel agencies sell.

It does not cover cruises. Cruises are a different product vertical with their own vocabulary (sailings, ships, decks, cabin grades, fare codes), their own pricing topology (a grid keyed by sailing × cabin category × occupancy, with date-bounded promotions and onboard credits), and their own booking unit (a cabin holding N occupants, not a per-person seat).

We have travel agencies that sell cruises and want to be on Voyant. Reverse-engineering the upstream feeds across mainstream and long-tail cruise lines (Silversea, Viking, Uniworld, Avalon, Scenic, Tauck, Windstar, Seabourn, Ponant, Oceanwide, Antarctica21, Swan Hellenic, plus the third-party aggregator layer that fronts many of them) shows the cross-line model is consistent enough to deserve a first-class module — and different enough that bolting it onto `products` would corrupt that module for everyone else.

So: a new opt-in `@voyant-travel/cruises` package, modeled native to Voyant's existing conventions, providing the canonical cruise schema + service layer + admin/public routes + a booking-extension table so it slots into the existing booking pipeline without forcing non-cruise tenants to inherit any of it.

The module supports two provenance modes for cruise inventory, side by side:

- **Self-managed cruises** — operators that publish their own cruise products (a boutique line, a private charter operation) own those rows in their local DB. Full canonical schema, full admin CRUD.
- **External cruises** — sourced from an upstream **adapter**. Deployments choose
  the adapter package at startup. Admin reads external cruises live through the
  adapter; bookings for them snapshot the upstream state into the local booking
  row.

Both modes coexist in the same admin experience — a unified list with an `External` badge on adapter-sourced rows — and the bookings/payments/CRM/finance plumbing is identical across them. The architectural details are in §3.5.

## 2. Goals and non-goals

### Goals

- A deep, idiomatic cruise model that a developer who has worked with cruise APIs recognizes without translation. Use the industry's words (sailing, ship, cabin category, grade code, fare code, occupancy, onboard credit) — not invented Voyant-isms.
- Strict opt-in. Tenants that don't sell cruises must not have cruise tables in their database, cruise routes mounted, or cruise types bleeding into their TypeScript surface.
- Full integration with the rest of Voyant — bookings, finance, CRM, suppliers, storage — through the same extension and link patterns the platform already uses.
- Lead-gen and payment-capable booking, switchable per template (some agencies want one, some the other, some both depending on the line).
- A small, well-defined **adapter contract** so external adapter packages can
  serve cruise inventory through the same admin and storefront paths
  self-managed cruises use.
- A pricing model that survives the real shape of cruise pricing: occupancy variants, fare codes, dated promotions, onboard credits, gratuities, port charges, taxes, currency, and per-sailing schedule overrides.
- **v1 is migration-complete.** A real luxury-cruise reseller (multi-line, mixed inquiry/payment, party bookings, specific-cabin selection, dated promo overlays) can run end-to-end on v1 without waiting for a follow-up release. Anything left for "later" is called out explicitly in the non-goals; everything else ships.

### Non-goals (for v1)

- **Yacht charters** (Aman, Four Seasons, Ritz-Carlton, SeaDream, A&K, Orient Express). The booking unit is a named suite at a flat price, sometimes whole-yacht. They look like cruises on the website and nothing like cruises in the schema. A separate `charters` module is the right home; until it lands, agencies that need to model these can use `products`. Forcing them into the cruise grid would re-pollute the namespace we're trying to keep clean.
- **Cruise-line connectors bundled in OSS.** Connectivity packages own provider
  applications, connections, gateway data planes, normalized replica reads, and
  per-line connectors. This module defines the adapter contract; it does not
  ship the connectors themselves.
- **Sync orchestration / scheduling / polling.** Adapter packages own their
  polling and retry loops. The cruises module is the canonical storage +
  service + routes layer plus the adapter contract that runs in front of it.
- **Real-time hold / live-book against cruise reservation systems.** Connect's domain when it lands; the cruise schema reserves `connectorBookingRef` so live bookings have somewhere to land.
- **Wholesaler net-rate / commission split modeling.** Will piggyback on the existing channels module when it lands.

## 3. Scope: what's a cruise

A cruise, for this module, is anything where:

1. The product is anchored to a **named ship** that has multi-cabin inventory with **categorized cabins** (grades, suites, classes — not just "rooms").
2. The booking unit is a **cabin (or stateroom or suite) on a specific sailing**, sold to **N occupants** with per-occupancy pricing.
3. The product has a **port-by-port itinerary** with embark/disembark dates, and possibly per-sailing variations (skipped ports, alternate routings).
4. Pricing is a **grid** keyed by (sailing, cabin category, occupancy), not a flat per-person seat price.

That covers ocean cruises, river cruises, and expedition cruises across all the mainstream and most expedition lines. River and expedition fit as discriminated sub-variants on the same core schema (more in §9).

Yacht-style products fail criterion 4 — they're flat per-suite prices without occupancy variants — and probably criterion 1 in spirit: the suites are unique sellable units, not categorized inventory. They go to `products`.

## 3.5 Provenance: self-managed vs. external

The same cruise the operator's customer sees can come from one of two places:

**Self-managed (`source: 'local'`)** — operator publishes their own cruises. The full canonical schema in §6 is populated locally. Admin offers full CRUD. Bookings against these cruises don't talk to any upstream. Use case: a boutique line, a private charter, an in-house product an operator owns end-to-end.

**External (`source: 'external'`)** — cruise lives in an upstream system reached
via an **adapter**. The adapter's identity is captured by `sourceProvider`
(adapter name) and `sourceRef` (the upstream pointer). The local DB stores
nothing about the cruise itself; all reads go through the adapter. Bookings
snapshot the upstream state into the local booking row at confirmation time.

### What lives where

| Concern | Self-managed | External |
|---|---|---|
| Cruise / sailing / cabin / pricing rows | local DB (canonical schema) | upstream (adapter resolves on demand) |
| Admin list and detail views | local DB read | adapter live read (with a unified API that interleaves both) |
| Storefront browse (operator's own customer-facing site) | local DB read | optional `cruise_search_index` projection (§6.6); falls back to adapter live read |
| Booking creation | local-only transaction | adapter `createBooking` call + local snapshot |
| Booking snapshot (`booking_cruise_details`) | full quote captured at booking time | full quote captured at booking time, plus `connectorBookingRef` for the upstream confirmation |

### Why not store external cruises locally as a mirror

Two reasons. First, mirroring is what Connect already does on its own infrastructure — duplicating that mirror in every operator's tenant means N copies, N stale-detection problems, N reconciliation jobs, and N migrations every time an upstream provider changes shape. Connect amortizes that work once. Second, the canonical schema in §6 is the operator's contract for **their own** cruises; using it as a forced shoehorn for upstream-shaped data leaks the upstream's quirks into the operator's table and makes both harder to evolve.

### Storefront vs. admin: different defaults

- **Admin** (operator-internal): always reads through the adapter for external rows, and from the local DB for self-managed rows. No local mirror of external cruises is required for admin to work. This is what makes the dual-source experience feel native — the operator searches and filters all their cruises in one UI without caring where each one lives.
- **Storefront** (operator's customer-facing site, if any): the operator opts into populating `cruise_search_index` (§6.6), a slim projection across both local and external cruises, optimized for fast paginated browse + SEO. The adapter pushes external entries into it; local cruises are projected by mutation triggers. Storefront detail pages read full data on demand: from the local DB for self-managed cruises, through the adapter for external ones, optionally cached.

### What the operator can do per source

| Action | Self-managed | External |
|---|---|---|
| Create / edit / delete | yes | no (read-only — edit at the upstream) |
| Refresh from upstream | n/a | yes (re-fetch latest data) |
| Detach to local | n/a | yes (one-way: copy current upstream state into a local cruise row, sever the link, edit freely) |
| Take bookings | yes | yes |
| Apply price catalog / promo overlay (§6.3) | yes | yes (the local promo overlay scopes to a `sourceRef`) |
| Manage media | yes | overrides only (local `cruise_media` rows can shadow upstream media — see §6.5) |

The detach action is the escape hatch for operators who want to take ownership of a previously-external cruise (e.g. negotiating a private charter on a cruise that started as an external listing).

## 4. Reverse-engineered domain model

The research walked ~25 individual cruise-line connectors (9 mainstream + 16 long-tail), a third-party aggregator that fronts many of them, and a normalized cross-line database schema observed in the wild. The entities below are what fell out consistently across all of them. The cross-line vocabulary table is the foundation of the whole module:

| Industry concept | Common synonyms across feeds | Voyant entity (this module) |
|---|---|---|
| The product / route template | Cruise, Voyage, Itinerary, Holiday, Tour, Package | `cruise` |
| A dated departure of that product | Sailing, Voyage, Departure, Date, Event, ItineraryDate | `cruise_sailing` |
| The vessel | Ship, Yacht, Motorship | `cruise_ship` |
| A cabin archetype on a ship | CabinType, Stateroom, Suite, Accommodation, AccommodationType | `cruise_cabin_category` |
| A specific bookable cabin | Cabin number, Stateroom number | `cruise_cabin` (used when the line publishes cabin-number granularity; see §6.2) |
| The fare/rate code that prices a cabin | GradeCode, CategoryCode, FareCode, RateCode, SaleSectorClass | `cruise_fare_code` (held inline on price rows) |
| A pricing row | Price, Rate, Tariff, Fare | `cruise_price` |
| A day on the itinerary | Day, Schedule, ItineraryDay | `cruise_day` (per-cruise template) + `cruise_sailing_day` (per-sailing override) |
| A port | Port, Location, City, Destination | reuse `facilities` |
| A pre/post extension | Extension, Pre/Post Cruise | reuse `products` |
| Onboard credit / gratuities / etc | OBC, NCF, Gratuity | `cruise_price_component` |

The two most load-bearing observations:

1. **Pricing is a grid, not a list.** Every serious cruise feed (Scenic, Avalon, Ponant, Antarctica21, plus aggregator-normalized output) keys pricing on (sailing, cabin category, occupancy basis). The simpler ones (Viking, Tauck, Windstar) collapse occupancy into the category, but normalizing them across lines re-expands them into the grid. We model the grid natively; we don't bend to the simpler lines and force the others to flatten.

2. **Schedule lives at two levels.** Most lines publish a base itinerary (`cruise.days`) and per-sailing overrides (skipped port due to weather, alternate ship). The pragmatic shortcut is to store the schedule as JSONB per sailing — workable but unqueryable ("which sailings visit Reykjavik?" needs ad-hoc JSON paths). We split into `cruise_day` (template) and `cruise_sailing_day` (override, optional, only present when a sailing diverges from the template).

## 5. Module shape

The package follows existing Voyant conventions exactly. File layout mirrors `packages/products/`:

```
packages/cruises/
├── package.json                 # @voyant-travel/cruises, exports map below
├── README.md
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                 # Module + ApiModule + Linkable exports
│   ├── schema.ts                # Re-export rollup of all schema-*.ts
│   ├── schema-shared.ts         # pgEnums (cruiseTypeEnum, cabinRoomTypeEnum, etc.)
│   ├── schema-core.ts           # cruises, cruiseShips, cruiseSailings
│   ├── schema-cabins.ts         # cruiseCabinCategories, cruiseCabins, cruiseDecks
│   ├── schema-pricing.ts        # cruisePrices, cruisePriceComponents
│   ├── schema-itinerary.ts      # cruiseDays, cruiseSailingDays
│   ├── schema-content.ts        # cruiseMedia, cruiseInclusions
│   ├── validation.ts            # rollup of validation-*.ts
│   ├── validation-core.ts
│   ├── validation-cabins.ts
│   ├── validation-pricing.ts
│   ├── validation-itinerary.ts
│   ├── validation-public.ts
│   ├── service.ts               # rollup; cruisesService
│   ├── service-search.ts        # public search by date/destination/ship/price
│   ├── service-pricing.ts       # quoting helpers (assemble grid → quote)
│   ├── service-public.ts        # storefront-shaped reads
│   ├── routes.ts                # admin Hono app
│   ├── routes-public.ts         # public Hono app
│   ├── booking-extension.ts     # extension table + service + routes for bookings
│   ├── adapters/                # adapter contract for external cruise inventory
│   │   ├── index.ts             # CruiseAdapter interface + canonical external types
│   │   ├── registry.ts          # registerCruiseAdapter, listAdapters, resolveBySourceProvider
│   │   ├── memoize.ts           # optional caching decorator templates can wrap adapters in
│   │   └── mock.ts              # MockCruiseAdapter for tests
│   └── tasks/                   # background jobs (e.g. recompute lowest-price aggregates, search-index reconciliation)
└── tests/
    ├── unit/
    └── integration/
```

`package.json` exports map (mirroring `packages/products`):

```json
{
  ".": "./src/index.ts",
  "./schema": "./src/schema.ts",
  "./validation": "./src/validation.ts",
  "./public-validation": "./src/validation-public.ts",
  "./routes": "./src/routes.ts",
  "./public-routes": "./src/routes-public.ts",
  "./booking-extension": "./src/booking-extension.ts",
  "./adapters": "./src/adapters/index.ts"
}
```

`src/index.ts` exports `cruisesModule`, `cruisesApiModule`, `cruisesBookingExtension`, `cruiseLinkable`, `cruiseSailingLinkable`, `cruiseShipLinkable`, plus the schema/validation/service/routes re-exports. Same shape as `packages/products/src/index.ts`.

The adapter contract lives in this package (`./adapters`). It defines the `CruiseAdapter` interface plus the registry templates use to plug Connect (or a custom adapter) in. **No actual connector implementations live here.** See §10 for the contract methods and §3.5 for how external rows participate in the admin and storefront experience.

## 6. Schema

This section is detailed because the schema is most of the design. All tables use the standard `typeId(...)` PK helper, `createdAt`/`updatedAt` with `withTimezone: true`, and Postgres enums via `pgEnum`.

### 6.1 Core entities

#### `cruises` — the route template

| column | type | notes |
|---|---|---|
| `id` | typeId("cruises") | prefix `cru` |
| `slug` | text not null | template-unique, used in URLs |
| `name` | text not null | |
| `cruiseType` | `cruise_type_enum` not null | `'ocean' \| 'river' \| 'expedition' \| 'coastal'` |
| `lineSupplierId` | text | link to `suppliers.id` (cruise line) — soft FK, no constraint per schema-discipline |
| `defaultShipId` | text | most cruises have a primary ship; sailings can override |
| `nights` | integer not null | duration in nights |
| `embarkPortFacilityId` | text | soft FK to `facilities.id` |
| `embarkPortCanonicalPlaceId` | text | canonical place reference, e.g. UN/LOCODE; resolved by external geography service |
| `disembarkPortFacilityId` | text | soft FK to `facilities.id` |
| `disembarkPortCanonicalPlaceId` | text | canonical place reference |
| `description` | text | long-form |
| `shortDescription` | text | |
| `highlights` | jsonb (text[]) | bullet list |
| `inclusionsHtml` | text | what's included (line-specific copy) |
| `exclusionsHtml` | text | |
| `regionIds`, `waterwayIds`, `portIds`, `countryIso` | jsonb (text[]) | canonical data-geo facet/filter keys from sourced geography resolution |
| `regions`, `waterways`, `ports`, `countries` | jsonb (text[]) | localized display labels parallel to canonical geography keys |
| `themes` | jsonb (text[]) | "wine voyage", "wildlife", "cultural" |
| `heroImageUrl` | text | |
| `mapImageUrl` | text | |
| `status` | `cruise_status_enum` not null default `'draft'` | `'draft' \| 'awaiting_review' \| 'live' \| 'archived'` |
| `lowestPriceCached` | numeric(12,2) | denormalized MIN across sailings; recomputed by background task |
| `earliestDepartureCached` | date | |
| `latestDepartureCached` | date | |
| `externalRefs` | jsonb | `{ "<adapter-source>": "...", ... }` source-keyed external IDs |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(cruiseType, status)`, `(lineSupplierId, status)`, `(slug)` unique, `(earliestDepartureCached, status)`.

The `externalRefs` JSONB is deliberate. The same cruise can be pulled from multiple sources (an aggregator may have one ID, the line's direct API another, a manual import yet another). A flat `externalId text` column doesn't survive contact with reality. JSONB lets each source stamp its own key without schema changes.

#### `cruise_sailings` — a dated departure

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crsl` |
| `cruiseId` | text not null | FK to cruises (intra-module, real FK) |
| `shipId` | text not null | FK to cruise_ships (intra-module) |
| `departureDate` | date not null | |
| `returnDate` | date not null | |
| `embarkPortFacilityId` | text | overrides cruise default if set |
| `embarkPortCanonicalPlaceId` | text | canonical place reference |
| `disembarkPortFacilityId` | text | |
| `disembarkPortCanonicalPlaceId` | text | canonical place reference |
| `direction` | text | river-only: `'upstream' \| 'downstream'` |
| `availabilityNote` | text | "limited", "wait list" — freeform from connector |
| `isCharter` | boolean default false | |
| `salesStatus` | `sailing_sales_status_enum` not null default `'open'` | `'open' \| 'on_request' \| 'wait_list' \| 'sold_out' \| 'closed'` |
| `externalRefs` | jsonb | per-connector IDs |
| `lastSyncedAt` | timestamptz | when a connector last touched this row |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(cruiseId, departureDate)`, `(shipId, departureDate)`, `(salesStatus, departureDate)`, unique `(cruiseId, departureDate, shipId)`.

#### `cruise_voyage_groups` — composite voyage identity

Some upstream sources sell products above a single cruise template: back-to-back
combinations, grand/world cruises, and cruise-tours with land before or after
the sailing. These rows give that composite product its own identity, status,
marketing copy, source refs, and price/date roll-ups without overloading
`cruises`.

| column | type | notes |
|---|---|---|
| `id` | typeId("cruise_voyage_groups") | prefix `crvg` |
| `slug` / `name` | text not null | group-level URL/display identity |
| `groupKind` | enum | `combination`, `grand_voyage`, `world_cruise`, `cruise_tour` |
| `lineSupplierId` | text | soft FK to suppliers, same rule as `cruises.lineSupplierId` |
| `nights` | integer not null | total composite duration |
| `embarkPortFacilityId` / `disembarkPortFacilityId` | text | overall journey endpoints |
| `embarkPortCanonicalPlaceId` / `disembarkPortCanonicalPlaceId` | text | canonical place references for group endpoints |
| `description`, `shortDescription`, `highlights`, `regions`, `themes`, media URLs | mixed | group-level merchandising fields |
| `status` | cruise_status enum | draft/review/live/archive lifecycle |
| `lowestPriceCached`, `lowestPriceCurrencyCached` | numeric/text | group pricing roll-up |
| `earliestDepartureCached`, `latestDepartureCached` | date | group date roll-up |
| `externalRefs` | jsonb | provider IDs for the composite product |
| `createdAt` / `updatedAt` | timestamptz | |

#### `cruise_voyage_group_segments` — ordered constituents and extensions

Segments are the ordered itinerary surface for a voyage group. A segment can
point at a local cruise template and/or sailing when the constituent is a cruise
leg, or it can stand alone as a land/hotel/transfer/rail/air segment. `segmentRole`
flags core voyage content versus pre- and post-extensions.

| column | type | notes |
|---|---|---|
| `id` | typeId("cruise_voyage_group_segments") | prefix `crvs` |
| `voyageGroupId` | text not null | FK to `cruise_voyage_groups` |
| `sortOrder` | integer not null | unique inside a voyage group |
| `segmentKind` | enum | `cruise`, `land`, `hotel`, `transfer`, `rail`, `air`, `other` |
| `segmentRole` | enum | `core`, `pre_extension`, `post_extension` |
| `title`, `description` | text | display copy for this leg |
| `cruiseId`, `sailingId` | text | optional same-package FKs for cruise constituents |
| `startDay`, `endDay` | integer | group-relative itinerary range |
| `startDate`, `endDate` | date | dated range when the group is departure-specific |
| `embarkPortFacilityId`, `disembarkPortFacilityId` | text | segment endpoints |
| `embarkPortCanonicalPlaceId`, `disembarkPortCanonicalPlaceId` | text | canonical place references for segment endpoints |
| `nights` | integer | segment duration |
| `externalRefs`, `metadata` | jsonb | provider IDs and provider-neutral extra shape |
| `createdAt` / `updatedAt` | timestamptz | |

#### `cruise_ships`

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crsh` |
| `lineSupplierId` | text | |
| `name` | text not null | |
| `slug` | text not null unique | |
| `shipType` | `ship_type_enum` not null | `'ocean' \| 'river' \| 'expedition' \| 'yacht' \| 'sailing' \| 'coastal'` |
| `capacityGuests` | integer | |
| `capacityCrew` | integer | |
| `cabinCount` | integer | |
| `deckCount` | integer | |
| `lengthMeters` | numeric(8,2) | |
| `cruisingSpeedKnots` | numeric(5,2) | |
| `yearBuilt` | integer | |
| `yearRefurbished` | integer | |
| `imo` | text | International Maritime Organization number; unique across the world's vessels |
| `description` | text | |
| `deckPlanUrl` | text | |
| `gallery` | jsonb (text[]) | |
| `amenities` | jsonb | freeform structured: `{ dining: [...], wellness: [...], entertainment: [...] }` |
| `externalRefs` | jsonb | |
| `isActive` | boolean not null default true | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(lineSupplierId, isActive)`, `(slug)` unique, `(imo)` unique where not null.

### 6.2 Cabins

Cabins are modeled in two layers: **categories** (the archetype) and optionally **specific cabins** (the inventory unit). Most operators sell at the category level; some need cabin-number granularity for "guarantee a forward-facing balcony."

#### `cruise_cabin_categories`

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crcc` |
| `shipId` | text not null | FK |
| `code` | text not null | line's category code, e.g. "VS", "VC", "B2" |
| `name` | text not null | "Veranda Suite" |
| `roomType` | `cabin_room_type_enum` not null | `'inside' \| 'oceanview' \| 'balcony' \| 'suite' \| 'penthouse' \| 'single'` — the canonical taxonomy aggregators converge on |
| `description` | text | |
| `minOccupancy` | smallint not null default 1 | |
| `maxOccupancy` | smallint not null | |
| `squareFeet` | numeric(8,2) | |
| `wheelchairAccessible` | boolean default false | |
| `amenities` | jsonb (text[]) | display labels from the line/operator; not used for machine filtering |
| `featureCodes` | jsonb (text[]) | normalized machine-filterable cabin features |
| `bedConfigurations` | jsonb (text[]) | normalized bed setup codes, e.g. `king`, `convertible_twins`, `pullman` |
| `accessibilityFeatures` | jsonb (text[]) | normalized accessibility capability codes beyond the legacy boolean |
| `viewType` | text | normalized view facet, e.g. `balcony`, `river_view`, `obstructed` |
| `images` | jsonb (text[]) | |
| `floorplanImages` | jsonb (text[]) | |
| `gradeCodes` | jsonb (text[]) | additional codes that map to this category — many lines have several codes for the same physical cabin type |
| `externalRefs` | jsonb | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(shipId)`, unique `(shipId, code)`.

The `gradeCodes` array is the cabin-matching mechanism. A pricing feed gives "GA was $5,995, GB was $6,495" — we look up which category lists `GA` or `GB` in its `gradeCodes` array and join.

#### `cruise_cabins` — specific-cabin inventory

When an operator sells specific cabins (not just categories — "guarantee me cabin 8014, forward-facing balcony, port side"), this table holds them for self-managed cruises. Fully supported in v1: schema, service helpers, admin endpoints (`PUT /v1/admin/cruises/ships/:crshId/cabins/bulk`), booking-time selection via the `cabinId` field on `booking_cruise_details`. For external cruises, the adapter returns cabin-number data when its upstream supports it; sailings without cabin-level data simply book at the category level.

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crcb` |
| `categoryId` | text not null | FK |
| `cabinNumber` | text not null | "8014", "Suite 421" |
| `deckId` | text | FK to cruise_decks |
| `position` | text | "forward", "midship", "aft", "port", "starboard" |
| `connectsTo` | text | another cabin id, for connecting cabins |
| `notes` | text | |
| `isActive` | boolean default true | |

Index: unique `(categoryId, cabinNumber)`.

#### `cruise_decks`

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crdk` |
| `shipId` | text not null | FK |
| `name` | text not null | "Deck 7", "Lido Deck" |
| `level` | smallint | numeric ordering |
| `planImageUrl` | text | |

### 6.3 Pricing

This is the core. Pricing is the table that matters most.

#### `cruise_prices`

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crpx` |
| `sailingId` | text not null | FK |
| `cabinCategoryId` | text not null | FK |
| `occupancy` | smallint not null | 1, 2, 3, 4 (single, double, triple, quad) |
| `fareCode` | text | the line's rate/fare code, e.g. "EARLY_BIRD", "STANDARD", "PAST_GUEST" |
| `fareCodeName` | text | human label |
| `currency` | char(3) not null | ISO 4217 |
| `pricePerPerson` | numeric(12,2) not null | the headline number |
| `secondGuestPricePerPerson` | numeric(12,2) | for the "second guest sails free" pattern |
| `singleSupplementPercent` | numeric(5,2) | when a line expresses single fare as a % uplift on double, store the uplift; renders to a single-occupancy row at quote time if no explicit single price |
| `availability` | `price_availability_enum` not null default `'available'` | `'available' \| 'limited' \| 'on_request' \| 'wait_list' \| 'sold_out'` |
| `availabilityCount` | integer | when the source provides numeric inventory |
| `priceCatalogId` | text | soft FK to `pricing.price_catalogs.id` — which catalog this row belongs to (`'public'`, `'promo'`, `'net'`, `'contract'`, …); `null` = the implicit default public catalog |
| `priceScheduleId` | text | soft FK to `pricing.price_schedules.id` — when this row is active (validFrom/validTo, recurrence, priority); `null` = always active |
| `bookingDeadline` | date | latest booking date for this fare (independent of the schedule's display window) |
| `requiresRequest` | boolean default false | "request only" pricing |
| `notes` | text | |
| `externalRefs` | jsonb | per-source pricing identifiers |
| `lastSyncedAt` | timestamptz | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes:
- `(sailingId, cabinCategoryId, occupancy, fareCode)` — the natural lookup key
- `(sailingId, availability, pricePerPerson)` — for "lowest available price" queries
- `(priceCatalogId)` and `(priceScheduleId)` — for promo-overlay resolution
- Partial unique `(sailingId, cabinCategoryId, occupancy, fareCode) where price_schedule_id is null` — the "current standing offer" must be unique per fare code; dated overlays can stack via additional rows pointing at schedules

**Why no `validFrom`/`validUntil`/`isPromo` on this table:** Voyant already has `pricing.price_catalogs` (with a `'promo'` catalog type) and `pricing.price_schedules` (with `validFrom`/`validTo`/`recurrenceRule`/`priority`/`active`). Accommodation resale uses the same soft-FK pattern for rate and room-option pricing. Cruises follows that pattern too. A "Black Friday $500 OBC overlay" is a `priceCatalog` of type `'promo'` with a `priceSchedule` covering the date window; cruise price rows that participate in the promo carry that catalog/schedule pair. No cruises-local promotions table.

#### `cruise_price_components`

For the line-itemized stuff: gratuities, onboard credit, port charges, taxes, NCF.

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crpc` |
| `priceId` | text not null | FK to cruise_prices |
| `kind` | `price_component_kind_enum` not null | `'gratuity' \| 'onboard_credit' \| 'port_charge' \| 'tax' \| 'ncf' \| 'airfare' \| 'transfer' \| 'insurance'` |
| `label` | text | "Pre-paid gratuities", "Free Air to Europe" |
| `amount` | numeric(12,2) not null | |
| `currency` | char(3) not null | |
| `direction` | `component_direction_enum` not null | `'addition' \| 'inclusion' \| 'credit'` — addition adds to price, inclusion is bundled (display-only), credit reduces price |
| `perPerson` | boolean default true | else per-cabin |

Index: `(priceId)`.

The split keeps cruise_prices clean (one row per fare) and makes promotions composable: an OBC promo is just adding rows of `kind='onboard_credit', direction='credit'` to existing prices, scoped via the parent row's `priceCatalogId`/`priceScheduleId`.

### 6.4 Itinerary

#### `cruise_days` — template

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crdy` |
| `cruiseId` | text not null | FK |
| `dayNumber` | smallint not null | 1-indexed |
| `title` | text | |
| `description` | text | |
| `portFacilityId` | text | nullable for sea days |
| `portCanonicalPlaceId` | text | canonical place reference for itinerary faceting |
| `arrivalTime` | time | |
| `departureTime` | time | |
| `isOvernight` | boolean default false | |
| `isSeaDay` | boolean default false | |
| `isExpeditionLanding` | boolean default false | expedition sub-variant flag |
| `meals` | jsonb | `{ breakfast: bool, lunch: bool, dinner: bool }` |

Index: unique `(cruiseId, dayNumber)`.

#### `cruise_sailing_days` — sailing-specific overrides

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crsd` |
| `sailingId` | text not null | FK |
| `dayNumber` | smallint not null | |
| ... same shape as cruise_days, but everything optional ... | | |
| `isSkipped` | boolean default false | port skipped for this sailing |

Only present when this sailing diverges from the template. Service-layer reads merge `cruise_days` + `cruise_sailing_days` to produce the effective itinerary for a given sailing.

This is the deliberate departure from the JSONB-per-sailing shortcut described in §4. It works, but you can't query "show me sailings that visit Reykjavik" without a custom GIN index and ad-hoc JSON paths. With a normalized table, that's a join.

### 6.5 Content

`cruise_media` mirrors `product_media` exactly — single table for cruise- and sailing-level media, with `sailingId` nullable. TypeID prefix `crme`. Routes mount at `/v1/admin/cruises/:id/media`.

`cruise_inclusions` for the structured "what's included" lists (separate from the freeform `inclusionsHtml` on the cruise row): grouped items with kind (meals, drinks, gratuities, transfers, excursions, wifi). TypeID prefix `crin`. Mostly for storefront UI.

### 6.6 Search index — opt-in storefront projection

`cruise_search_index` is the **only table that holds external cruises locally** — and even then, only when an operator wants to power their own customer-facing storefront from Voyant. Operators using Voyant for back-office only never populate this table; admin works fine without it (see §3.5).

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `crsi` |
| `source` | `cruise_source_enum` not null | `'local' \| 'external'` |
| `sourceProvider` | text | adapter name for `external`; null for `local` |
| `sourceRef` | jsonb | for `external`: `{ connectionId, externalId, ... }` — opaque pointer back to the adapter |
| `localCruiseId` | text | for `source='local'`: FK to `cruises.id`. Null for `external` |
| `slug` | text not null | URL slug for the storefront — unique across the index |
| `name` | text not null | |
| `cruiseType` | `cruise_type_enum` not null | |
| `lineName` | text not null | denormalized — for `external`, the supplier may not be in the local `suppliers` table |
| `shipName` | text not null | denormalized for the same reason |
| `nights` | integer not null | |
| `embarkPortName` | text | denormalized |
| `disembarkPortName` | text | denormalized |
| `regionIds`, `waterwayIds`, `portIds`, `countryIso` | jsonb (text[]) | canonical data-geo facet/filter keys |
| `regions`, `waterways`, `ports`, `countries` | jsonb (text[]) | localized display labels |
| `themes` | jsonb (text[]) | |
| `earliestDeparture` | date | aggregate across the cruise's sailings |
| `latestDeparture` | date | |
| `lowestPrice` | numeric(12,2) | aggregate; native currency |
| `lowestPriceCurrency` | char(3) | |
| `salesStatus` | text | rolled up from the cruise's sailings |
| `heroImageUrl` | text | |
| `refreshedAt` | timestamptz not null | when this row was last reconciled with its source |

Indexes:
- `(source, refreshedAt)` — to drive freshness checks and stale-row sweeps
- `(slug)` unique
- `(cruiseType, lowestPrice)`, `(earliestDeparture)`, `(latestDeparture)` — the storefront's typical filter axes
- GIN indexes on canonical geography, display geography, `regions`, and `themes` for destination/tag filtering
- Partial unique `(sourceProvider, sourceRef->>externalId) where source='external'` — same external cruise can't be indexed twice

How rows arrive in this table:

- **Local cruises**: a service hook inside `cruisesService.upsertCruise` projects a search-index row whenever a local cruise is mutated. No external dependency.
- **External cruises**: the adapter pushes them via `searchProjection()` (see §10) — either as a webhook delivery from Connect's projection delta stream, or via batch refresh from a custom adapter. The cruises module exposes `PUT /v1/admin/cruises/search-index/bulk` for adapters to write into.

The storefront route surface (§9) reads exclusively from this table for list/filter/search; it never fans out to adapters at request time. Detail pages still resolve through the source (local DB or adapter) as needed, which keeps the index stays small and updates cheap.

## 7. TypeID prefixes

Verified against `packages/db/src/lib/typeid-prefixes.ts`. Cruises gets the `cr*` namespace block:

| prefix | entity |
|---|---|
| `cru` | cruises (3 chars; `crui` is the natural 4-char fallback if `cru` collides) |
| `crsl` | cruise_sailings |
| `crsh` | cruise_ships |
| `crdk` | cruise_decks |
| `crcc` | cruise_cabin_categories |
| `crcb` | cruise_cabins |
| `crpx` | cruise_prices |
| `crpc` | cruise_price_components |
| `crdy` | cruise_days |
| `crsd` | cruise_sailing_days |
| `crme` | cruise_media |
| `crin` | cruise_inclusions |
| `crsi` | cruise_search_index |

Check before merging: existing `cr*` prefixes are `crn` (credit_notes) and `crm-derived` codes. None collide.

## 8. Service layer

Hand-written `cruisesService` (no `createCrudService`, matching `productsService` precedent). Notable methods:

```ts
cruisesService.listCruises(db, { cruiseType?, region?, supplierId?, status?, search?, limit, offset })
cruisesService.getCruiseById(db, id, { withSailings?, withDays? })
cruisesService.createCruise(db, data)
cruisesService.updateCruise(db, id, data)
cruisesService.archiveCruise(db, id)
cruisesService.recomputeCruiseAggregates(db, cruiseId) // refreshes lowestPriceCached, earliest/latestDepartureCached

cruisesService.listSailings(db, { cruiseId?, dateFrom?, dateTo?, shipId?, salesStatus?, limit, offset })
cruisesService.getSailingById(db, id, { withPricing?, withItinerary? })
cruisesService.upsertSailing(db, data) // by (cruiseId, departureDate, shipId) — connector-friendly
cruisesService.getEffectiveItinerary(db, sailingId) // merges cruise_days + cruise_sailing_days

cruisesService.upsertCabinCategory(db, data) // by (shipId, code)
cruisesService.upsertPrices(db, sailingId, prices[]) // bulk replace within a transaction
```

Pricing helpers live in `service-pricing.ts`:

```ts
pricingService.lowestAvailablePrice(db, { sailingId, occupancy }) // for grid display
pricingService.assembleQuote(db, { sailingId, cabinCategoryId, occupancy, guestCount })
  // returns: base price, applied price components, total per person, total per cabin, currency
pricingService.gridForSailing(db, sailingId) // full (category, occupancy) → price matrix for booking flow
```

`assembleQuote` is the single place quote math happens. The booking-extension service calls it; the public storefront calls it; admin UI calls it. One implementation, one source of truth.

Quotes are returned in the **native currency** of the underlying price rows — whatever currency the cruise line publishes in. The cruises module never converts at ingest time (lossy, freezes a stale FX rate into the row). Display-time conversion to a tenant or shopper currency is the caller's concern; a future `fx` module will own rate lookups when one is needed. The booking quote snapshot stored on `booking_cruise_details.quotedCurrency` likewise records the native currency that was quoted, so re-displays are unambiguous.

## 9. Routes

Two Hono apps, mounted by template via `createApp({ modules: [cruisesApiModule] })`. The admin surface is **provenance-aware**: list and detail endpoints transparently interleave self-managed cruises (read from the local DB) and external cruises (read live through registered adapters). The storefront surface reads from the local `cruise_search_index` projection.

### Admin routes — `/v1/admin/cruises/*`

Identifiers in admin use a unified key format: local cruises are addressed by
their `cru_*` TypeID; external cruises by
`<sourceProvider>:<encodedSourceRef>` (for example,
`external-cruises:sr_<base64url-json>`). The route layer parses the key and
routes to the appropriate backing store.

```
# unified — works for any source
GET    /                       list (interleaves local + external from all registered adapters; ?source=local|external|all)
GET    /:key                   get cruise (?include=sailings,days)
GET    /:key/sailings          list sailings on this cruise
GET    /:key/days              list itinerary days
GET    /sailings/:key          get sailing (?include=pricing,itinerary,ship)
GET    /sailings/:key/itinerary effective (template + overrides merged)
POST   /sailings/:key/quote    run assembleQuote, return totals
GET    /ships                  list ships (interleaves)
GET    /ships/:key             get ship
GET    /ships/:key/categories  list cabin categories
GET    /ships/:key/decks

# self-managed-only (local) — write operations on the canonical schema
POST   /                       create cruise
PUT    /:cruId                 update
DELETE /:cruId                 archive (soft)
POST   /:cruId/aggregates/recompute
PUT    /:cruId/days/bulk       replace itinerary template
PUT    /sailings/:crslId       update sailing
PUT    /sailings/:crslId/pricing/bulk   replace pricing grid
PUT    /sailings/:crslId/days/bulk      replace per-sailing day overrides
POST   /ships                  create
PUT    /ships/:crshId          update
PUT    /ships/:crshId/categories/bulk   replace
PUT    /ships/:crshId/cabins/bulk       replace specific-cabin inventory

# external-only — adapter-bound actions
POST   /:key/refresh           re-fetch latest data from the source adapter
POST   /:key/detach            convert external → local (one-way snapshot)

# search-index management (only matters when the operator runs a storefront)
PUT    /search-index/bulk      adapter writes external entries here
DELETE /search-index/:crsiId   remove a stale entry
POST   /search-index/rebuild   rebuild local entries from the cruises table
```

Write operations on an external `:key` return `409 Conflict` with a body pointing the caller at the upstream system (or at `POST /:key/detach` if they want local control).

### Public routes — `/v1/public/cruises/*`

Storefront-shaped. Reads exclusively from `cruise_search_index` for list/filter/search, then resolves detail through the appropriate source on demand.

```
GET /                    search/list (date range, region, ship, line, price range, cruiseType) — reads from cruise_search_index
GET /:slug               cruise detail (resolves source from the index entry, then reads local DB or adapter)
GET /sailings/:key       sailing detail with effective itinerary + pricing grid
POST /sailings/:key/quote returns a quote with totals (no booking)
GET /ships/:slug         ship detail with categories + decks
```

Operators that don't run a storefront from Voyant don't need the search index populated; the public routes simply return empty lists. Detail endpoints continue to work for direct sailing/ship key lookups even without the index.

The `POST /sailings/:key/quote` endpoint is what an inquiry-style booking flow calls before submitting an inquiry. A payment-style flow calls the same endpoint, then proceeds to the bookings extension to create the booking.

## 10. Adapter contract

External cruises reach the module through a registered **adapter**. The adapter is
**swappable**, not baked in: a template chooses the adapter package at startup
without changing any cruises-module code. The detailed implementation contract,
compatibility fixture, SourceRef rules, and provider-neutrality checklist live in
[`cruise-adapter-contract.md`](./cruise-adapter-contract.md).

The contract has browse/projection methods, live detail reads, and a booking
commit method:

```ts
// packages/cruises/src/adapters/index.ts
export interface CruiseAdapter {
  readonly name: string
  readonly version: string

  listEntries(options?: ListEntriesOptions): Promise<ListEntriesResult>
  searchProjection(options?: ListEntriesOptions): AsyncIterable<CruiseSearchProjectionEntry>

  fetchCruise(sourceRef: SourceRef): Promise<ExternalCruise | null>
  fetchSailing(sourceRef: SourceRef): Promise<ExternalSailing | null>
  fetchSailingPricing(sourceRef: SourceRef): Promise<ExternalPriceRow[]>
  fetchSailingItinerary(sourceRef: SourceRef): Promise<ExternalItineraryDay[]>
  fetchShip(sourceRef: SourceRef): Promise<ExternalShip | null>
  listSailingsForCruise(cruiseRef: SourceRef): Promise<ExternalSailing[]>

  createBooking(input: CreateExternalBookingInput): Promise<ExternalBookingResult>
}

export type SourceRef = { connectionId?: string; externalId: string; [k: string]: unknown }
```

Cruise sourced-content JSON uses snake_case. Per-sailing browse price
summaries are represented as integer minor units plus currency on the sailing
payload (`lowest_price_cents`, `currency`), not decimal strings. They are a
pair: both fields are present with values, or both are null. Per-sailing
itinerary detail remains under the sailing's `itinerary_stops`; a top-level
`itinerary_stops` array is only an overview/fallback. Adapter/domain objects
remain camelCase (`lowestPriceCents`, `currency`) and are translated at the
sourced-content boundary.

`SourceRef` is round-trippable adapter state, not a display id. Adapter-backed
refs must preserve connection id, source namespace, upstream cruise, sailing,
ship, cabin ids, synced-row ids, and opaque metadata needed by the adapter.
Admin route keys and catalog shim entity ids use the URL-safe
`encodeSourceRef(...)` form (`<provider>:sr_<base64url-json>`) so punctuation
and adapter metadata are not reconstructed from a lossy slug. Two refs with the
same `externalId` but different connection/source context are different rows.

Connect compatibility decisions live next to the adapter contract in
`packages/cruises/src/adapters/connect-compat.ts`:

| Connect concern | Framework mapping |
|---|---|
| cruise type | `ocean`, `river`, `expedition`, `coastal` map directly; `yacht`, `rail`, and `tour` are rejected for products/other vertical routing |
| cabin room type | direct matches stay direct; `studio` maps to `single`; `villa`/unknown suite-like categories map to `suite` |
| inclusion kind | cruise inclusions that affect quote display map to price components; flight inclusions map to `airfare` and still require flight-line orchestration when sold as a separate booking |
| enrichment kind | Connect `domain_expert` maps to framework `expert` |
| price components | taxes, port charges, gratuities, NCF, airfare, transfers, insurance, onboard credit, single supplements, and residual `other` components are preserved with `addition` / `inclusion` / `credit` direction |

Two registration points in a template:

```ts
import { createApp } from "@voyant-travel/hono"
import { cruisesApiModule, registerCruiseAdapter } from "@voyant-travel/cruises"
import { createCruiseAdapter } from "external-cruise-adapter"

registerCruiseAdapter(createCruiseAdapter({ token: env.CRUISE_ADAPTER_TOKEN }))

export const app = createApp({
  modules: [cruisesApiModule, ...],
})
```

The framework never imports the concrete adapter package; the deployment wiring
does.

**Reference wiring:** the operator starter implements this in one place —
`apps/operator/src/api/lib/cruise-adapters-runtime.ts`. Its
`registerCruiseAdapters` seam registers each configured `CruiseAdapter` into both
the vertical registry (above) and the catalog `SourceAdapterRegistry` (via
`cruiseAdapterToSourceAdapter`), and back-fills the vertical registry from any
Connect cruise shims. The same seam runs in the live API and the
external-cruise-refresh cron, while deployment tooling composes source sync from
the selected graph. Admin, public, content, booking, and sync paths therefore
share one configuration. See the starter README's
"External cruise adapters" section.

### Where the adapter sits at request time

- **Admin list (`GET /v1/admin/cruises`)** — backend reads local cruises from the DB AND calls each registered adapter's listing/search endpoint, merging results with provenance markers. Pagination is per-source and recombined; the API surface returns a unified cursor per page.
- **Admin detail (`GET /v1/admin/cruises/:key`)** — for `cru_*` keys, reads the local DB. For `<provider>:<ref>` keys, calls `adapter.fetchCruise(sourceRef)`.
- **Storefront list (`GET /v1/public/cruises`)** — reads only from `cruise_search_index`. Adapter is not called at request time. Index is kept fresh by `searchProjection()` running on the adapter's schedule.
- **Storefront detail (`GET /v1/public/cruises/:slug`)** — resolves the slug to a search-index entry, then dispatches: local entry → DB; external → `adapter.fetchCruise()`. Caching at this layer is the template's call.
- **Booking create (`POST /v1/admin/bookings/.../cruise`)** — local cruise: pure-DB transaction. External: `adapter.createBooking()` first, then snapshot the result into `booking_cruise_details`.

### Caching adapter responses

Adapter calls are not free. Templates can wrap the adapter in a memoizing decorator (the cruises module ships one) keyed on `(provider, sourceRef, kind)` with a short TTL. Default TTL is 60s for detail reads; quotes and bookings always go live. This is template configuration, not module behavior.

### Out of scope for this module

- The list of supported cruise lines. Connect's roadmap.
- Scheduling, retries, backoff, dead-letter queues for the adapter's polling loop. Those live in Connect (or in whatever runs the custom adapter).
- Provider authentication, rate-limiting, screen scraping. Same.
- A general-purpose workflow engine or customer-authored job runner. The
  package contributes its fixed external-catalog refresh job when selected;
  custom adapter orchestration remains external to Voyant.

## 11. Booking integration

A cruise booking is a booking. The bookings module already has the right shape (PII handling, state machine, financial linkage). Cruises plugs in via the standard extension pattern, exactly like `productsBookingExtension`.

`packages/cruises/src/booking-extension.ts` defines:

#### `booking_cruise_details` — 1:1 with bookings

| column | type | notes |
|---|---|---|
| `bookingId` | text primary key | |
| `sailingId` | text not null | which sailing |
| `cabinCategoryId` | text not null | which category booked |
| `cabinId` | text | specific cabin if assigned |
| `occupancy` | smallint not null | how many guests in this cabin |
| `fareCode` | text | the rate booked at |
| `quotedPricePerPerson` | numeric(12,2) not null | snapshot at booking time |
| `quotedCurrency` | char(3) not null | |
| `quotedComponentsJson` | jsonb | full components array snapshotted at booking time — survives later promo edits |
| `bookingTermsSnapshotJson` | jsonb | structured cancellation/payment terms shown at quote or commit time |
| `passengerCompositionSnapshotJson` | jsonb | adapter-bound passenger composition (`adults`, `children`, ages, infants, etc.) |
| `connectorBookingRef` | text | line's confirmation number, if booking goes through |
| `connectorStatus` | text | line-side status |
| `notes` | text | |
| `createdAt` / `updatedAt` | timestamptz | |

TypeID prefix not needed (PK is `bookingId`).

The `quotedComponentsJson` snapshot is critical: if pricing changes after booking (promo expires, OBC removed), the booked quote stays intact. This matches how `booking_product_details` preserves the productId at booking time.

#### Routes

`/v1/admin/bookings/:bookingId/cruise-details` — GET, PUT, DELETE.

`/v1/public/bookings/:bookingId/cruise-details` — GET only (customer can read their own).

#### Booking creation flow

The bookings module exposes `bookings.create()` already. Cruises wraps a higher-level helper in the extension service:

```ts
cruisesBookingService.createCruiseBooking(db, {
  sailingId,
  cabinCategoryId,
  cabinId?,                              // specific cabin if the customer chose one
  occupancy,
  fareCode,
  passengers: [...],                     // delegates to booking_passengers
  contact: { personId | newPersonData }, // delegates to CRM
  mode: 'inquiry' | 'reserve',           // see §12
})
```

This calls `pricingService.assembleQuote`, then `bookingsService.createBooking`, then upserts `booking_cruise_details` — all in one transaction. Idiomatic: same shape as `convertProductToBooking` already uses for products.

For external sailings, the helper detects the provenance from the `sailingId` key, calls `adapter.createBooking()` to commit upstream first, and stamps the returned `connectorBookingRef` + the upstream-resolved quote into the snapshot. If the adapter call fails the local booking row is never created — atomic from the caller's perspective. For local sailings, the upstream call is skipped entirely. The caller doesn't branch; the helper does.

#### Multi-cabin party bookings

A family of 5 booking 3 cabins on the same sailing — parents in one, kids split across two — is one logical purchase. We support this on day 1 by composing the existing `bookingGroupsService` (in `packages/bookings/src/service-groups.ts`, with the existing `booking_groups` + `booking_group_members` tables) with the per-cabin helper above:

```ts
cruisesBookingService.createCruisePartyBooking(db, {
  sailingId,
  cabins: [
    { cabinCategoryId, cabinId?, occupancy, fareCode, passengers: [...] },
    { cabinCategoryId, cabinId?, occupancy, fareCode, passengers: [...] },
    { cabinCategoryId, cabinId?, occupancy, fareCode, passengers: [...] },
  ],
  leadContact: { personId | newPersonData },
  mode: 'inquiry' | 'reserve',
})
```

In one transaction:

1. Create a `booking_group` with `kind = 'cruise_party'` (a new value added to `bookingGroupKindEnum`).
2. Run `createCruiseBooking` for each cabin entry, attaching each result to the group via `booking_group_members`.
3. Upsert a 1:1 `booking_group_cruise_details` extension row.

The group is the unit of: shared confirmation number, atomic cancellation across cabins, single deposit / payment, single invoice. Individual cabin bookings still own their own passengers, cabin selection, and per-cabin quote snapshot.

#### `booking_group_cruise_details` — 1:1 with booking_groups

| column | type | notes |
|---|---|---|
| `bookingGroupId` | text primary key | |
| `sailingId` | text not null | the shared sailing — every member booking must reference the same one (validated in the helper) |
| `cabinCount` | smallint not null | denormalized from member count for fast reads |
| `totalQuotedAmount` | numeric(12,2) not null | sum of per-cabin quotes at group-creation time |
| `quotedCurrency` | char(3) not null | |
| `connectorBookingRef` | text | upstream party-booking reference if the line supports it natively |
| `notes` | text | |
| `createdAt` / `updatedAt` | timestamptz | |

The single-cabin helper (`createCruiseBooking`) stays as the building block. A solo traveler booking one cabin doesn't go through the party flow — no group is created. The party helper composes; it doesn't replace.

## 12. Lead-gen vs. payment

The user is right that this matters and that it's a per-tenant, per-line decision. The way it slots in:

- **Booking mode** is a property of the booking, not the cruise. `mode: 'inquiry' | 'reserve'` on `createCruiseBooking`. Inquiry creates a booking in `state = 'inquiry'`; reserve creates one in `state = 'pending'` and gates payment on the next step.
- **Whether payment is offered** is a starter-level config — the same template can offer payment for `cruiseType='river'` and inquiry-only for `cruiseType='expedition'` based on which cruise lines support which workflow.
- **No new payment plumbing.** The finance + transactions modules already cover invoice + payment. Cruises does not duplicate any of that.
- **Abandoned cart / inquiry follow-up.** Use the common cruise-reseller pattern of treating "no confirmation number yet" as the "started but not finalized" flag. In Voyant terms: bookings in `'inquiry'` or `'pending'` state past N hours fire a `booking.followup.required` event; notification module handles the email. No new tables needed; this is a workflow over existing primitives.

Lead-gen is therefore not a "mode" of the cruises module — it's a state on the booking. The cruise module is mode-agnostic. This is what keeps it clean.

## 13. Cross-module integration

| Voyant module | Linkage |
|---|---|
| **bookings** | `booking_cruise_details` extension (§11) |
| **CRM** | template-defined link `personCruiseLink` (people who have inquired/booked); pre-defined `personCruiseSavedLink` for "favorited" — both via `defineLink` in the template's `links/` directory |
| **suppliers** | cruise lines are `suppliers` rows, linked from `cruises.lineSupplierId` (soft FK, schema-discipline rule) |
| **finance** | bookings → invoices via existing finance module; cruise-specific line items live in the booking quote snapshot, not finance |
| **pricing** | `cruise_prices.priceCatalogId` and `cruise_prices.priceScheduleId` soft-FK into `pricing.price_catalogs` / `pricing.price_schedules`. Same pattern accommodations already use. No promo/discount primitives are reinvented in cruises. |
| **products** | voyage-group segments model the cruise-side itinerary/extension structure. When a pre/post extension is also a reusable sellable `products` row, link it via a template link such as `cruiseProductExtensionLink`; do not add a cross-package FK in cruises. |
| **identity / facilities** | ports are `facilities` rows; cruise schema soft-FKs by `facilityId` |
| **storage** | `cruise_media` uses the same R2/S3 pattern as `product_media`, no new infra |
| **availability** | not used (cruise availability is per-price-row, not per-product-day) |

The CRM linking is done at template level so a tenant can choose what "personCruiseLink" semantics mean (favorited, viewed, inquired about). Connector authors don't pick this.

## 14. Sub-variants: river and expedition

We don't need separate tables. We need discriminators and a few extra fields, all on the existing tables:

**River cruises** — covered by:
- `cruises.cruiseType = 'river'`
- `cruise_ships.shipType = 'river'`
- `cruise_sailings.direction` for upstream/downstream variants
- `cruise_days.isSeaDay` is always false (a river cruise day always has a port)
- River-specific port surcharge (Pandaw) lives in `cruise_price_components` with `kind='port_charge'`

**Expedition cruises** — covered by:
- `cruises.cruiseType = 'expedition'`
- `cruises.themes` array carries "polar", "wildlife", "cultural"
- `cruise_days.isExpeditionLanding` flag for zodiac days
- A `cruise_enrichment_programs` table (TypeID `crep`) for naturalist/historian programs:
  - `cruiseId`, `kind` (naturalist/historian/photographer/lecturer), `name`, `description`, `bioImageUrl`
- Antarctica21 fly-cruise leg: model the flight as a `cruise_price_component` with `kind='airfare', direction='inclusion'`

The reason we don't subclass: the field research shows each cruise type can be modeled with the same core schema as long as you give the schema enough optional dimensions. Subclassing creates query joins and TypeScript discriminated unions everywhere, with marginal benefit. A `cruiseType` enum + a few discriminator-driven optional columns is enough.

## 15. What stays out (and why)

| Pattern observed in the field | Voyant decision |
|---|---|
| Yacht-brand per-suite flat pricing (Aman, Four Seasons, Ritz, SeaDream, A&K, Orient) | Use `products`. The booking unit is one suite; there's no occupancy grid; the model in `products` covers it natively. |
| Whole-yacht charters | `products` for v1; eventually a `charters` module if demand warrants. |
| Multi-storefront architecture | Out of scope; Voyant is single-template per deployment. |
| 60-column denormalized `booking_guests` table | We use `bookings.booking_passengers` with a separate `booking_passenger_travel_details` extension (already exists). Cruise-specific guest fields go there, not in cruises. |
| Loyalty / rewards system | Separate concern; can become its own module later. Cruise bookings produce booking events that any loyalty module can consume. |
| Materialized views for booking search | Use Voyant's existing pattern of cached aggregates (`lowestPriceCached`, etc.) recomputed by background tasks. Add MVs only if measured to be necessary. |

## 16. Test strategy

Following the existing convention (`describe.skipIf(!DB_AVAILABLE)`):

- **Unit tests** for `pricingService.assembleQuote` — pure function over price + components, no DB required. This is where the highest-value coverage lives because pricing is the most error-prone part.
- **Unit tests** for `getEffectiveItinerary` — merge logic for template + overrides.
- **Integration tests** for routes and the ingest pipeline. Seed a fake cruise + ship + 2 sailings + 5 categories + 30 prices and exercise the public + admin endpoints.
- **Connector test fixture** in `packages/cruises/src/connectors/test-fixtures.ts`: a `MockCruiseConnector` with deterministic data that ingest tests run against. Each real connector plugin re-uses this fixture pattern.
- 50+ tests in v1, scaled to the schema's complexity.

## 17. Build phases

**Phase 1 — canonical schema + core service for self-managed cruises (1-2 weeks)**
- Full schema + migrations + TypeID prefix registration (cruises, sailings, ships, decks, cabin categories, cabins, prices, components, days, sailing-day overrides, media, inclusions)
- `cruisesService` CRUD on the canonical tables
- `pricingService.assembleQuote` + the unit-test suite for the pricing math
- Doc landing on this branch

**Phase 2 — routes and bookings extension (1-2 weeks)**
- Admin + public route surface for self-managed cruises (the unified-key parser stubs out external for now)
- `booking_cruise_details` + `booking_group_cruise_details` extension tables, services, routes
- `cruisesBookingService.createCruiseBooking` (single cabin) and `createCruisePartyBooking` (multi-cabin) integration with bookings + bookingGroups; local-only path
- Add `'cruise_party'` to `bookingGroupKindEnum` (small change to bookings module)
- Integration tests on routes including the party-booking happy path and the same-sailing validation

**Phase 3 — adapter contract + Connect adapter wired (1-2 weeks)**
- `CruiseAdapter` interface + `registerCruiseAdapter` registry in `@voyant-travel/cruises/adapters`
- Unified key parsing in admin routes; admin list/detail interleave local + adapter
- External-only routes: `POST /:key/refresh`, `POST /:key/detach`
- Booking flow extended for external sailings (`adapter.createBooking` + snapshot)
- `MockCruiseAdapter` test fixture — exercises every method, drives integration tests for the dual-source paths
- `@voyant-travel/cruises-adapter-connect` — thin wrapper over `@voyant-travel/connect-sdk` implementing the contract; depends on Connect shipping the cruise-shaped read APIs in parallel

**Phase 4 — search index + storefront (1 week)**
- `cruise_search_index` table + bulk write endpoint for adapters
- Local-cruise projection trigger in `cruisesService` mutations
- Public storefront routes pointed at the index

**Phase 5 — sub-variants + polish (1 week)**
- Expedition enrichment programs
- River direction handling end-to-end
- Performance pass on the pricing-grid read path and the admin-list adapter fan-out

Total: ~5-7 weeks for OSS v1. Phase 1-2 are the foundation that ships even before any adapter exists. Phase 3 lands the dual-source experience. Phase 4 is opt-in for operators running a Voyant-powered storefront. Phase 5 closes the long tail. The OSS module is migration-complete after phase 5; cruise-line coverage continues to expand on Connect's roadmap without further OSS changes.

## 18. Open questions

1. **TypeID prefix `cru` vs `crui`** — `cru` is shorter but slightly ambiguous (could be misread as "CRM user"). `crui` is unambiguous but breaks the 3-char preference. Recommendation: `cru`. Decide before the migration lands.
2. **Promo authoring UX — cruises-specific or generic pricing UX?** No new cruise-side schema is needed (we soft-FK into the pricing module's existing `priceCatalogs`/`priceSchedules`), but the admin UX for "spin up a Black Friday OBC overlay across 80 sailings" still has to live somewhere. Recommendation: build it as a generic capability in the pricing module's admin UI, with cruise-specific scoping helpers in cruises (e.g. "apply this promo catalog to every sailing of cruise X"). Re-evaluate once a real authoring flow is sketched.
3. **Inquiry-state booking lifecycle** — does the bookings state machine need a new state, or does the existing `'inquiry'` state cover it? Need to check `packages/bookings/src/state-machine.ts` before committing — placeholder assumption is yes.
