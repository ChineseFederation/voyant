# Charters module — design

Status: draft / proposal
Branch: `feature/charters-module-design`
Audience: anyone implementing or reviewing the charters module before code lands.

## 1. Why this exists

We just shipped the [cruises module](./cruises-module.md). During that design we explicitly carved yacht-style products **out** of cruises — the cabin grid is the wrong abstraction for them. Charters is the home for those products.

The brands in scope for v1 (Aman, Four Seasons, Ritz-Carlton, SeaDream, Abercrombie & Kent, Orient Express) all share three characteristics that make them genuinely different from cruises:

1. **The booking unit is a named suite at a flat price** — not a cabin grade × occupancy variant.
2. **Per-suite multi-currency pricing is native** — these brands publish USD / GBP / EUR / AUD simultaneously per suite, not derived from a base rate via FX.
3. **Whole-yacht charter exists as a parallel mode** — one party books the entire vessel under a negotiated contract, not the sum of individual suite prices.

There's a fourth less-obvious one that shapes the whole design: **these brands position themselves as luxury hospitality, not cruise lines.** Aman calls it a "hotel at sea." Four Seasons' marketing literally says "It's not a cruise, it's a yacht." That positioning is reflected in the data: per-suite (not per-person) pricing, hotel-style concierge instead of cruise programming, brand-agnostic destination focus. Schema-wise this means we lean closer to the hospitality model than the cruises model — even though the surface (ship + ports + dates) looks similar.

So: a new opt-in `@voyant-travel/charters` package, modeled native to Voyant's existing module conventions, designed for **per-suite** voyages and **whole-yacht** charters as two booking modes on the same product, with MYBA-style charter contracts and APA (Advance Provisioning Allowance) as first-class concerns.

Connectivity to upstream charter brands (direct yacht-line APIs, charter aggregators if they emerge) is **out of scope for this module and out of scope for OSS Voyant** — same rule we applied for cruises. That layer is Voyant Connect's job (when it ships charter coverage); agencies that don't use Connect can build their own adapter against the contract this module exposes (§11). OSS Voyant ships zero charter connectors itself.

## 2. Goals and non-goals

### Goals

- A model that fits all six known luxury yacht brands without forcing them through cruise-shaped abstractions (no cabin grades, no occupancy grids, no fare codes).
- Both booking modes — **per-suite** and **whole-yacht charter** — supported on the same voyage definition. A voyage can be sold either way (most are; the broker chooses based on the inquiry).
- Multi-currency stored natively. Per-suite pricing carries USD / GBP / EUR / AUD columns directly, populated at sync time from the upstream feed. Display-time FX conversion can layer on for tertiary currencies, but the four primaries are first-class.
- **MYBA contract** integration via the existing `@voyant-travel/legal/contracts` module — whole-yacht charters auto-generate a contract from the MYBA template at booking time.
- **APA (Advance Provisioning Allowance)** modeled as a first-class deposit type on the booking finance side — typically 25-30% of the charter fee, separate from the charter fee itself.
- **Broker-mediated booking** as a workflow, not just a flag: appointment-only voyages route through an inquiry/quote/contract flow rather than a self-serve checkout.
- v1 is migration-complete for an operator that sells the six known brands. No "we'll add MYBA later" or "broker workflow comes in phase 2" — it ships in v1 or it's not in v1.

### Non-goals (for v1)

- **Bareboat charters.** Mid-market, no-crew yacht rentals (Airbnb-for-boats). Different industry, different APIs (NauSYS, MMK), different schema (skipper certification, fuel deposit, marine insurance). Out of scope.
- **Day charters.** Sub-24-hour charters (yacht-day rentals). Different transactional shape, different pricing (hourly), different workflow (no overnight).
- **Mid-market crewed charter brokerage.** This module isn't a Charter Index / Burgess / Camper & Nicholsons rebuild — that's a broker MLS aggregating thousands of yachts from many owners. We're modeling the six luxury hospitality brands' own published products, where the operator owns the relationship.
- **Brand-specific sync code in OSS Voyant.** Same rule as cruises: OSS Voyant doesn't ship third-party connectors. Charter brand integrations (Aman, Four Seasons, Ritz, SeaDream, A&K, Orient Express, etc.) belong in Voyant Connect (closed product) or in an agency's own custom adapter. The OSS module ships the schema + service + routes + an adapter contract; the connectors live elsewhere.
- **Sync orchestration / scheduling / polling.** Connect (or the agency's adapter) handles that. The charters module is a pure storage + service + routes layer plus the adapter contract that runs in front of it.
- **Real-time hold / live-book against upstream charter systems.** Connect's domain. The charter schema reserves `connectorBookingRef` so live bookings have somewhere to land.
- **Bareboat-style fuel/water/provisioning ledgering.** APA is a single line item; we don't reconcile every gallon.

## 3. Scope: what's a charter

A charter, for this module, is anything where:

1. The product is a **named yacht** (not a cruise ship — the distinction is real, not just marketing) with a small to medium suite count (typically 25-150 suites, 50-300 guests).
2. The booking unit is **a named suite on a voyage at a flat per-suite price** OR **the entire vessel for the duration of a charter window**.
3. Pricing is **per-suite, not per-person**. Occupancy variants don't exist at the price level — a Penthouse Suite costs $X whether two or three guests sleep in it.
4. Multi-currency storage is the norm, not the exception.
5. The provider operates under a **luxury hospitality brand** (the brand is the operator, not just a marketing label on top of a cruise line).

That covers the six brands cleanly. It deliberately excludes:
- Whole-cruise-line products (they go to cruises).
- Bareboat / skippered self-charter (out of scope).
- Day charters and shorter-than-overnight rentals (different vertical).
- Hotel-with-boat-tour products (those are tours sold as `products` with an option for the boat tour as a day day-service).

## 4. Domain model

### 4.1 Booking modes

Two booking modes coexist on every voyage. The voyage definition declares which modes are offered (most yachts offer both):

| Mode | Booking unit | Pricing | Workflow |
|---|---|---|---|
| **Per-suite** | One named suite (e.g. "Owners Suite") | Flat per-suite, multi-currency | Inquiry → quote → confirm or self-serve if pricing is published |
| **Whole-yacht** | Entire vessel for a date range | Single charter rate (often discounted vs sum of suites) | Inquiry → quote → MYBA contract → 50% deposit → 50% + APA → boarding |

This is fundamentally different from cruises, where a sailing has a single mode (cabin booking) with multiple cabin categories. Charter voyages are mode-discriminated at booking time, not at product definition time.

### 4.2 The MYBA contract

Whole-yacht charters in the luxury segment universally operate under the **MYBA Charter Agreement** (Mediterranean Yacht Brokers Association) or equivalent. It's not optional — for any vessel chartered from a Mediterranean base it's effectively regulatory.

The MYBA contract specifies:
- Embarkation / disembarkation times and locations
- Charter area (geographic boundary — "Greek Islands", "Eastern Caribbean")
- Base fee + APA (Advance Provisioning Allowance, 25-30% of fee)
- Force majeure, captain's authority (absolute aboard)
- Insurance requirements
- Dispute resolution (commonly London arbitration)

We model the MYBA template using the existing `@voyant-travel/legal/contracts` module — `contractTemplates` already supports versioned contract templates with variable interpolation and signature capture. Charters templates ship as a seed contract template at module install time; per-charter contracts are instances of it.

### 4.3 APA — Advance Provisioning Allowance

APA is a deposit a charterer pays on top of the charter fee, typically 25-30%, that the captain spends on fuel, port fees, food, beverages, shoreside transport, etc. during the charter. Anything unspent is refunded; anything overspent is invoiced at the end. It's not a markup, it's a true expense pass-through.

For finance, APA gets its own line item and a different lifecycle: collected before the charter, reconciled and refunded/topped-up after. We add it to `booking_charter_details` as `apaPercent` + `apaAmount` and let the finance module handle the actual money movement.

### 4.4 Broker mediation

Most charter inquiries are broker-mediated — the booking flow is conversational, not click-to-pay. Voyages and suites carry an `appointmentOnly` flag (or `bookingMode='inquiry_only'`) that routes the booking flow through a request → broker review → quote → confirm cycle instead of self-serve checkout. The flag can be set at three levels of granularity:

- Per voyage (e.g. all of Four Seasons' inaugural voyages are appointment-only)
- Per suite (e.g. Ritz's Owner's Suite is appointment-only even when other suites self-serve)
- Per booking mode (e.g. per-suite is self-serve but whole-yacht always requires broker)

## 5. Module shape

The package follows existing Voyant conventions exactly. File layout mirrors `packages/cruises/`:

```
packages/charters/
├── package.json                 # @voyant-travel/charters
├── README.md
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                 # Module + ApiModule + Linkable exports
│   ├── schema.ts                # Re-export rollup
│   ├── schema-shared.ts         # pgEnums (charterStatus, charterBookingMode, etc.)
│   ├── schema-core.ts           # charterProducts, charterVoyages
│   ├── schema-yachts.ts         # charterYachts
│   ├── schema-pricing.ts        # charterSuites (per-suite pricing rows)
│   ├── schema-itinerary.ts      # charterScheduleDays
│   ├── validation.ts            # rollup of validation-*.ts
│   ├── validation-core.ts
│   ├── validation-yachts.ts
│   ├── validation-pricing.ts
│   ├── validation-itinerary.ts
│   ├── service.ts               # rollup; chartersService
│   ├── service-pricing.ts       # quoting helpers (resolveCurrency, computeApaAmount)
│   ├── service-bookings.ts      # createPerSuiteBooking + createWholeYachtCharterBooking
│   ├── service-mybacontract.ts  # generates a contract instance from the MYBA template
│   ├── routes.ts                # admin Hono app
│   ├── routes-public.ts         # public/inquiry Hono app
│   ├── booking-extension.ts     # booking_charter_details extension table + service + routes
│   └── tasks/                   # background jobs (e.g. APA reconciliation reminders)
└── tests/
    ├── unit/
    └── integration/
```

`package.json` exports map mirrors `packages/cruises`:

```json
{
  ".": "./src/index.ts",
  "./schema": "./src/schema.ts",
  "./validation": "./src/validation.ts",
  "./public-validation": "./src/validation-public.ts",
  "./routes": "./src/routes.ts",
  "./public-routes": "./src/routes-public.ts",
  "./booking-extension": "./src/booking-extension.ts"
}
```

Notably absent vs cruises: no `./adapters` subpath. Charters has no adapter contract in v1.

## 6. Schema

Five core tables, deliberately fewer than cruises (which has 13). The smaller surface reflects the simpler reality: no cabin categories (suites stand alone), no decks (we don't model the floor plan that granularly), no per-row pricing grid (one suite = one price row per voyage), no separate price components table (charter pricing is monolithic — it's flat or it has one APA percentage; there's no taxes/grats/OBC composition like cruises).

All tables use the standard `typeId(...)` PK helper, `createdAt`/`updatedAt` with `withTimezone: true`, Postgres enums via `pgEnum`. Soft FKs across modules (per the schema-discipline rule).

### 6.1 `charter_products` — the brand × yacht offering

A "product" is what a customer thinks of as the offering — usually one ship branded one way (Four Seasons I, Ritz Evrima, Aman Amangati). Brands with multiple ships have multiple charter products.

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `chrt` |
| `slug` | text not null unique | |
| `name` | text not null | "Aman at Sea — Amangati" |
| `lineSupplierId` | text | soft FK to `suppliers.id` (the operator brand) |
| `defaultYachtId` | text | soft FK; products with multiple yachts can override per-voyage |
| `description` | text | long-form copy |
| `shortDescription` | text | |
| `heroImageUrl` | text | |
| `mapImageUrl` | text | |
| `regions` | jsonb (text[]) | searchable taxonomy ("Mediterranean", "Caribbean") |
| `themes` | jsonb (text[]) | "Wine", "Wellness", "Family", "Expedition" |
| `status` | `charter_status_enum` not null default `'draft'` | `'draft' \| 'awaiting_review' \| 'live' \| 'archived'` |
| `defaultBookingModes` | jsonb (text[]) | `['per_suite', 'whole_yacht']` — per-voyage can override |
| `defaultMybaTemplateId` | text | soft FK to `legal.contractTemplates.id` for the MYBA template used for whole-yacht charters |
| `defaultApaPercent` | numeric(5,2) | typical APA % for this brand (e.g. 27.5) — per-voyage can override |
| `lowestPriceCachedUSD` | numeric(12,2) | denormalized MIN across voyages × suites |
| `earliestVoyageCached` | date | |
| `latestVoyageCached` | date | |
| `externalRefs` | jsonb | per-source IDs |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(status, createdAt)`, `(slug)` unique, `(earliestVoyageCached)`.

### 6.2 `charter_yachts` — the vessel

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `chry` |
| `lineSupplierId` | text | |
| `name` | text not null | "Amangati", "Evrima" |
| `slug` | text not null unique | |
| `yachtClass` | `yacht_class_enum` not null | `'luxury_motor' \| 'luxury_sailing' \| 'expedition' \| 'small_cruise'` |
| `capacityGuests` | integer | typically 50-300 |
| `capacityCrew` | integer | typically equal to or greater than guests for luxury |
| `lengthMeters` | numeric(8,2) | |
| `yearBuilt` | integer | |
| `yearRefurbished` | integer | |
| `imo` | text | International Maritime Organization number; unique where set |
| `description` | text | |
| `gallery` | jsonb (text[]) | |
| `amenities` | jsonb | freeform `{ dining: [...], wellness: [...], decks: [...] }` |
| `crewBios` | jsonb | array of `{ role, name, bio, photoUrl }` — optional but charterers ask for this often |
| `defaultCharterAreas` | jsonb (text[]) | "Mediterranean", "Caribbean", "Adriatic" |
| `externalRefs` | jsonb | |
| `isActive` | boolean not null default true | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(slug)` unique, `(imo)` unique where not null, `(lineSupplierId, isActive)`.

Notably missing vs cruises: no `cruise_decks` / `cruise_cabin_categories` / `cruise_cabins` analogs. Charter brands don't publish deck plans / cabin numbers at the integration level — they publish a fixed list of suite types and a count. The suite types live on per-voyage records (§6.4) since they're priced there.

### 6.3 `charter_voyages` — a dated voyage

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `chrv` |
| `productId` | text not null | FK to charter_products (intra-module FK) |
| `yachtId` | text not null | FK to charter_yachts |
| `voyageCode` | text not null | the brand's voyage code, e.g. "RC-EVR-2026-007" |
| `name` | text | optional voyage name ("Eastern Mediterranean Yacht Escape") |
| `embarkPortFacilityId` | text | soft FK to facilities |
| `embarkPortName` | text | denormalized for display when no facility match |
| `disembarkPortFacilityId` | text | |
| `disembarkPortName` | text | |
| `departureDate` | date not null | |
| `returnDate` | date not null | |
| `nights` | smallint not null | derived but stored for sort/filter |
| `bookingModes` | jsonb (text[]) not null | which modes are offered: `['per_suite']`, `['whole_yacht']`, or both |
| `appointmentOnly` | boolean not null default false | global voyage-level broker-only flag |
| **Whole-yacht pricing** (only relevant when `'whole_yacht'` in bookingModes) ||
| `wholeYachtPriceUSD` | numeric(15,2) | |
| `wholeYachtPriceEUR` | numeric(15,2) | |
| `wholeYachtPriceGBP` | numeric(15,2) | |
| `wholeYachtPriceAUD` | numeric(15,2) | |
| `apaPercentOverride` | numeric(5,2) | overrides product default if this voyage prices APA differently |
| `mybaTemplateIdOverride` | text | overrides product default if this voyage uses a non-default template |
| `charterAreaOverride` | text | "Greek Islands" — geographic constraint MYBA needs |
| `salesStatus` | `voyage_sales_status_enum` not null default `'open'` | `'open' \| 'on_request' \| 'wait_list' \| 'sold_out' \| 'closed'` |
| `availabilityNote` | text | freeform from sync ("3 suites left", "wait list only") |
| `externalRefs` | jsonb | |
| `lastSyncedAt` | timestamptz | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: `(productId, departureDate)`, `(yachtId, departureDate)`, `(salesStatus, departureDate)`, unique `(productId, departureDate, yachtId)`.

The four explicit currency columns are deliberate. We could store pricing as a JSONB map `{USD, EUR, GBP, AUD}`, but the four-column form gives us SQL `WHERE`-clause-friendly filtering and `ORDER BY` — which the storefront and admin lists need. Tertiary currencies (e.g. CHF, JPY) handled via FX at display time.

### 6.4 `charter_suites` — per-suite pricing on a voyage

This is the load-bearing pricing table for per-suite mode.

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `chst` |
| `voyageId` | text not null | FK to charter_voyages |
| `suiteCode` | text not null | upstream code e.g. "OWNERS", "DECK2-PORT" |
| `suiteName` | text not null | "Owners Suite", "Deck 2 Stateroom" |
| `suiteCategory` | `suite_category_enum` | `'standard' \| 'deluxe' \| 'suite' \| 'penthouse' \| 'owners' \| 'signature'` — the broad tier for sort/filter |
| `description` | text | |
| `squareFeet` | numeric(8,2) | |
| `images` | jsonb (text[]) | |
| `floorplanImages` | jsonb (text[]) | |
| `maxGuests` | smallint | typically 2 for stateroom, 4 for suites; not used for pricing — pricing is flat — but used at booking time to validate party size |
| **Multi-currency flat pricing** ||
| `priceUSD` | numeric(12,2) | |
| `priceEUR` | numeric(12,2) | |
| `priceGBP` | numeric(12,2) | |
| `priceAUD` | numeric(12,2) | |
| **Optional per-currency port fees** (separate from price) ||
| `portFeeUSD` | numeric(12,2) | |
| `portFeeEUR` | numeric(12,2) | |
| `portFeeGBP` | numeric(12,2) | |
| `portFeeAUD` | numeric(12,2) | |
| **Inventory / availability** ||
| `availability` | `suite_availability_enum` not null default `'available'` | `'available' \| 'limited' \| 'on_request' \| 'wait_list' \| 'sold_out'` |
| `unitsAvailable` | smallint | for brands that publish a count (rare; most publish a status) |
| `appointmentOnly` | boolean not null default false | suite-level broker-only flag |
| `notes` | text | |
| `externalRefs` | jsonb | |
| `lastSyncedAt` | timestamptz | |
| `createdAt` / `updatedAt` | timestamptz | |

Indexes: unique `(voyageId, suiteCode)`, `(voyageId, availability)`, `(voyageId, suiteCategory, priceUSD)` for "cheapest suite of category X on voyage Y".

Why no cruise-style "fareCode" or occupancy variants: all six brands publish one price per suite per voyage. There's no second-guest discount, no occupancy multiplier, no rate ladder. If a brand starts publishing those (Ritz already does for some inventory), we add columns then — but we don't model a grid we don't have data for.

### 6.5 `charter_schedule_days` — day-by-day itinerary

Charter itineraries are simpler than cruises: they're flat per-voyage (no template + override two-tier model). The whole point of a charter is itinerary flexibility — the published schedule is a starting suggestion, not a binding template, and brokers freely modify it during the contracting phase. So we store one schedule per voyage, mutable, no override layer.

| column | type | notes |
|---|---|---|
| `id` | typeId | prefix `chrd` |
| `voyageId` | text not null | FK |
| `dayNumber` | smallint not null | 1-indexed |
| `portFacilityId` | text | |
| `portName` | text | denormalized when no facility match |
| `scheduleDate` | date | optional explicit date (else derived from voyage.departureDate + dayNumber - 1) |
| `arrivalTime` | time | |
| `departureTime` | time | |
| `isSeaDay` | boolean not null default false | |
| `description` | text | |
| `activities` | jsonb (text[]) | "Snorkel at Mljet", "Caves swim", "Dinner ashore" |

Index: unique `(voyageId, dayNumber)`.

## 7. TypeID prefixes

Verified against `packages/db/src/lib/typeid-prefixes.ts`. Charters gets the `ch[rt-y]*` namespace block. None of the picked prefixes collide with the existing `channel_*` family (which is `chco`, `chcr`, `chpm`, `chbl`, `chwe`, `chia`, `chat`, `chir`, `chsr`, `chsi`, `chrr`, `chri`, `chrx`, `chsp`, `chrp`, `chrs`, `chre`, `chap`).

| prefix | entity |
|---|---|
| `chrt` | charter_products |
| `chrv` | charter_voyages |
| `chry` | charter_yachts |
| `chst` | charter_suites |
| `chrd` | charter_schedule_days |
| `bkch` | booking_charter_details (booking extension table) |

`chr` (3 char) was tempting for charter_products but feels close to `chrs` (channel_release_schedules); `chrt` is unambiguous and stays in the same namespace.

## 8. Service layer

Hand-written `chartersService` (no `createCrudService`, matching cruise/products precedent). Notable methods:

```ts
chartersService.listProducts(db, { region?, supplierId?, status?, search?, limit, offset })
chartersService.getProductById(db, id, { withVoyages?, withYacht? })
chartersService.createProduct(db, data)
chartersService.updateProduct(db, id, data)
chartersService.archiveProduct(db, id)
chartersService.recomputeProductAggregates(db, productId) // refreshes lowestPriceCachedUSD, earliest/latestVoyageCached

chartersService.listVoyages(db, { productId?, dateFrom?, dateTo?, salesStatus?, limit, offset })
chartersService.getVoyageById(db, id, { withSuites?, withSchedule? })
chartersService.upsertVoyage(db, data) // by (productId, departureDate, yachtId) — sync-friendly
chartersService.replaceVoyageSuites(db, voyageId, suites[]) // bulk replace
chartersService.replaceVoyageSchedule(db, voyageId, days[]) // bulk replace

chartersService.upsertYacht(db, data) // by slug

pricingService.resolveCurrency(suite, requestedCurrency) // returns the price in the requested currency, or throws if absent
pricingService.computeApaAmount(charterFee, apaPercent) // utility
```

Pricing helpers in `service-pricing.ts`:

```ts
pricingService.quotePerSuite(db, { suiteId, currency }): { suiteId, suiteName, currency, suitePrice, portFee, total }
pricingService.quoteWholeYacht(db, { voyageId, currency }): { voyageId, currency, charterFee, apaPercent, apaAmount, total }
```

Quote functions return native currency. Display-time conversion to other currencies is a future `fx` module's job — same convention as cruises.

MYBA-contract generation in `service-mybacontract.ts`:

```ts
mybaService.generateContract(db, {
  bookingId,
  voyageId,
  templateId, // resolved from voyage.mybaTemplateIdOverride or product.defaultMybaTemplateId
  variables: { /* charterer name, fee, APA, charter area, embark/disembark times+ports, ... */ }
}): { contractId, signatureUrl }
```

This wraps `legal.contractsService.createContract` — the contract module already handles versioning, signature capture, PDF rendering. Charters just provides the variable-binding layer for the MYBA template.

## 9. Routes

Two Hono apps, mounted by template via `createApp({ modules: [chartersApiModule] })`.

### Admin routes — `/v1/admin/charters/*`

```
GET    /                            list products
POST   /                            create product
GET    /:productId                  get product (?include=voyages,yacht)
PUT    /:productId                  update
DELETE /:productId                  archive
POST   /:productId/aggregates/recompute

GET    /:productId/voyages          list voyages on this product
GET    /voyages/:voyageId           get voyage (?include=suites,schedule)
POST   /voyages                     create voyage
PUT    /voyages/:voyageId           update
PUT    /voyages/:voyageId/suites/bulk      replace per-voyage suite list
PUT    /voyages/:voyageId/schedule/bulk    replace itinerary

POST   /voyages/:voyageId/quote/per-suite  quote a single suite (returns native-currency total)
POST   /voyages/:voyageId/quote/whole-yacht quote whole-yacht charter (returns charter fee + APA + total)

GET    /yachts                      list yachts
POST   /yachts                      create
GET    /yachts/:yachtId             get yacht (with crew bios + amenities)
PUT    /yachts/:yachtId             update
```

### Public/inquiry routes — `/v1/public/charters/*`

Charters routes are inquiry-shaped, not catalog-shaped: most charter sales start with an inquiry, not a "browse and book" flow.

```
GET /                                catalog list (filterable: region, theme, dateFrom, dateTo, currency)
GET /:slug                           product detail (with voyages + suites + schedule)
GET /voyages/:voyageId               voyage detail (with suites + schedule)
POST /voyages/:voyageId/inquiries    submit an inquiry (per-suite or whole-yacht)
```

The public routes don't expose a "create booking" endpoint directly — bookings are created admin-side via the booking-extension service after broker review of the inquiry.

## 10. Booking integration

A charter booking is a booking. The bookings module's PII handling, state machine, financial linkage all apply. Charters plugs in via the same extension pattern cruises uses.

### `booking_charter_details` — 1:1 with bookings

| column | type | notes |
|---|---|---|
| `bookingId` | text primary key | |
| `bookingMode` | `charter_booking_mode_enum` not null | `'per_suite' \| 'whole_yacht'` |
| `voyageId` | text not null | which voyage |
| `suiteId` | text | required when mode=per_suite, null for whole_yacht |
| `wholeYachtCharter` | boolean not null default false | derived flag for fast filter |
| `quotedCurrency` | char(3) not null | the currency the booking was quoted in |
| `quotedSuitePrice` | numeric(15,2) | required when mode=per_suite |
| `quotedCharterFee` | numeric(15,2) | required when mode=whole_yacht |
| `quotedApaPercent` | numeric(5,2) | only set when mode=whole_yacht |
| `quotedApaAmount` | numeric(15,2) | computed at booking time, snapshot |
| `quotedTotalAmount` | numeric(15,2) not null | the customer-facing total |
| `mybaContractId` | text | FK to legal.contracts (1:1 — only set for whole-yacht bookings) |
| `charterAreaOverride` | text | when broker negotiated a different geo than voyage default |
| `embarkationLocationOverride` | text | broker can move this from the voyage default in the contract |
| `embarkationTime` | time | |
| `disembarkationLocationOverride` | text | |
| `disembarkationTime` | time | |
| `apaPaidAmount` | numeric(15,2) | populated as APA is collected — can grow during pre-charter phase |
| `apaSpentAmount` | numeric(15,2) | populated post-charter from captain's reconciliation |
| `apaRefundAmount` | numeric(15,2) | computed at end-of-charter |
| `notes` | text | |
| `connectorBookingRef` | text | upstream confirmation if any |
| `createdAt` / `updatedAt` | timestamptz | |

TypeID prefix: `bkch` for the table (PK is bookingId so the prefix mostly documents identity).

Constraint (in service layer, not DB):
- `mode='per_suite'` requires `suiteId` and `quotedSuitePrice`, must NOT have `mybaContractId`/`apaPercent`
- `mode='whole_yacht'` requires `quotedCharterFee`/`quotedApaPercent`/`quotedApaAmount`, must have `mybaContractId`, must NOT have `suiteId`

### Booking creation helpers

Two distinct entry points — the modes are different enough that one polymorphic `createCharterBooking` would be a footgun:

```ts
chartersBookingService.createPerSuiteBooking(db, {
  voyageId,
  suiteId,
  currency,                            // which of USD/EUR/GBP/AUD to lock pricing in
  passengers: [...],                   // delegates to bookings.createTraveler
  contact: { personId | newPersonData },
  notes?,
  mode: 'inquiry' | 'reserve',
})

chartersBookingService.createWholeYachtCharterBooking(db, {
  voyageId,
  currency,
  charterAreaOverride?,                // if broker negotiated a different area
  embarkationLocationOverride?,
  embarkationTime?,
  disembarkationLocationOverride?,
  disembarkationTime?,
  passengers: [...],                   // typically 0-N at booking time; finalized closer to charter
  charterer: { personId | organizationId | newPersonData }, // the contracting party
  notes?,
  // Auto-actions:
  generateMybaContract: true,          // default true; uses voyage's mybaTemplateIdOverride or product default
})
```

Both helpers do all the work in one transaction:
1. Resolve quote (`quotePerSuite` or `quoteWholeYacht`)
2. Create booking via `bookingsService.createBooking`
3. Insert travelers via `bookingsService.createTraveler`
4. Upsert `booking_charter_details` with the snapshot
5. (Whole-yacht only) `mybaService.generateContract` — produces a contract row in `legal.contracts`, returns `contractId` to thread into `booking_charter_details.mybaContractId`

Failure of any step rolls back the whole transaction. MYBA contract generation must succeed for whole-yacht bookings to land — there's no "create booking now, generate contract later" path because the contract is the contract; without it the charter can't legally proceed.

### Routes for the booking extension

Standard pattern (matches `productsBookingExtension`, `cruisesBookingExtension`):

```
GET    /v1/admin/bookings/:bookingId/charter-details
PUT    /v1/admin/bookings/:bookingId/charter-details
DELETE /v1/admin/bookings/:bookingId/charter-details

# APA-specific actions (whole-yacht only)
POST   /v1/admin/bookings/:bookingId/charter-details/apa/payment   record an APA payment
POST   /v1/admin/bookings/:bookingId/charter-details/apa/reconcile post-charter spent + refund/topup
```

## 11. Adapter contract

External charters reach the module through a registered **adapter** — same pattern cruises uses. Voyant Connect is the default adapter Voyant's own templates wire up; an agency that prefers their own connectivity engine implements the same contract and registers it instead. The adapter is **swappable**, not baked in.

The contract has four method families, deliberately small:

```ts
// packages/charters/src/adapters/index.ts
export interface CharterAdapter {
  readonly name: string                         // 'voyant-connect', 'custom', etc.
  readonly version: string

  // Catalog discovery — used by admin list and any storefront browse the
  // operator opts into.
  listEntries(opts?: { since?: Date; cursor?: string; limit?: number }): Promise<{
    entries: ExternalCharterSummary[]
    nextCursor?: string
  }>

  // Detail reads — called from admin and storefront when resolving an external key.
  fetchProduct(sourceRef: SourceRef): Promise<ExternalCharterProduct | null>
  fetchVoyage(sourceRef: SourceRef): Promise<ExternalCharterVoyage | null>
  fetchVoyageSuites(sourceRef: SourceRef): Promise<ExternalCharterSuite[]>
  fetchVoyageSchedule(sourceRef: SourceRef): Promise<ExternalCharterScheduleDay[]>
  fetchYacht(sourceRef: SourceRef): Promise<ExternalCharterYacht | null>
  listVoyagesForProduct(productRef: SourceRef): Promise<ExternalCharterVoyage[]>

  // Booking commit — used when creating a charter booking against an external
  // voyage. Returns the upstream confirmation reference + a final quote
  // snapshot. For whole-yacht charters the upstream commit may also return
  // the upstream contract reference (e.g. a signed MYBA), which we record on
  // booking_charter_details.connectorContractRef and skip our own MYBA
  // generation.
  createPerSuiteBooking(input: CreateExternalPerSuiteBookingInput): Promise<ExternalBookingResult>
  createWholeYachtBooking(input: CreateExternalWholeYachtBookingInput): Promise<ExternalBookingResult>
}

export type SourceRef = { connectionId?: string; externalId: string; [k: string]: unknown }
```

Two registration points in a template (mirroring cruises):

```ts
// apps/operator/src/index.ts (illustrative)
import { createApp } from "@voyant-travel/hono"
import { chartersApiModule, registerCharterAdapter } from "@voyant-travel/charters"
import { createConnectCharterAdapter } from "@voyant-travel/charters-adapter-connect"

registerCharterAdapter(createConnectCharterAdapter({ apiKey: env.VOYANT_CONNECT_API_KEY }))

export const app = createApp({ modules: [chartersApiModule, ...] })
```

### Where the adapter sits at request time

- **Admin list (`GET /v1/admin/charters`)** — backend reads local products from the DB AND calls each registered adapter's `listEntries`, merging results with provenance markers (`source: 'local' | 'external'`, `sourceProvider`, `sourceRef`). Per-adapter errors collected via `Promise.allSettled` so one slow adapter doesn't block the rest.
- **Admin detail (`GET /v1/admin/charters/:key`)** — for `chrt_*` keys, reads the local DB. For `<provider>:<ref>` keys, calls `adapter.fetchProduct(sourceRef)`.
- **Voyage detail / suite detail / schedule** — same dual dispatch via the unified-key parser.
- **Per-suite booking creation** — local voyage: pure-DB transaction. External: `adapter.createPerSuiteBooking()` first, then snapshot. Atomic from the caller's perspective.
- **Whole-yacht booking creation** — local: `mybaService.generateContract` writes a contract row in `legal.contracts`. External: `adapter.createWholeYachtBooking()` returns the upstream's contract ref; we still write a `legal.contracts` row but mark it as "snapshot of external contract" rather than the contracting source. Operators can fork to local control via a future detach action (out of v1 scope).

### Caching adapter responses

Adapter calls are not free. Templates can wrap the adapter in a memoizing decorator (the charters module ships one, same shape as cruises'). Default TTL 60s for detail reads; quotes and bookings always go live.

### Registry helpers

Same surface as cruises — `registerCharterAdapter`, `unregisterCharterAdapter`, `clearCharterAdapters`, `resolveCharterAdapter`, `listCharterAdapters`, `hasCharterAdapter`. Process-local Map, single-tenant per deployment.

### `MockCharterAdapter` for tests

Ships in `@voyant-travel/charters/adapters` with `add*` seed methods. Same pattern as `MockCruiseAdapter`.

### Out of scope for this module

- The list of supported charter brands. That's Connect's roadmap.
- Scheduling, retries, backoff, dead-letter queues for the adapter's polling loop. Those live in Connect (or in whatever runs the custom adapter).
- Provider authentication, rate-limiting, screen scraping. Same.

## 12. Cross-module integration

| Voyant module | Linkage |
|---|---|
| **bookings** | `booking_charter_details` extension (§10), helpers wrap `bookingsService.createBooking` |
| **legal/contracts** | `mybaService.generateContract` wraps `legal.contractsService.createContract`. The MYBA template ships as a seed `contractTemplate` row at module install — operators can fork it per brand if needed. Whole-yacht bookings get a `contractId` written to `booking_charter_details.mybaContractId`. |
| **finance** | APA is a finance concern. `quoteWholeYacht` returns the breakdown; the finance module records the APA payment as a deposit, the post-charter refund as a credit note, the post-charter topup as an invoice line. We don't reinvent any of this — just wire the line items. |
| **CRM** | Charter contacts are usually ultra-high-net-worth individuals booked via family office or travel concierge — `personId`/`organizationId` foreign keys on the booking row. Charter-specific contact fields (passport, dietary, preference profile) belong in `booking_passenger_travel_details` (already exists in bookings module), not in charter tables. |
| **suppliers** | Each yacht brand is a `suppliers` row, linked from `charter_products.lineSupplierId`. |
| **facilities** | Ports (embark, disembark, schedule day calls) are facility rows — soft FK. |
| **identity** | Crew bios are stored on the yacht row as freeform JSONB, not in identity. The volume is low enough (5-30 crew per yacht, mostly stable) that the identity-module overhead isn't justified. |
| **storage** | Yacht galleries, suite images, schedule activity images — same R2/S3 pattern via `voyant-storage`. |
| **notifications** | Pre-charter reminders (final payment due, MYBA contract pending signature, preference form) flow through the notifications module on a schedule per booking. |

## 13. Relationship to the cruises module

This is the most-asked design question, so explicit:

**Charters does not depend on cruises and does not share schema with it.** Two reasons:
1. Forcing a tenant to install cruises just to use charters is exactly the bloat we built the opt-in module pattern to avoid.
2. The schemas don't overlap as much as the surface suggests. Cruises has cabin grades + occupancy grids + fare codes + per-row pricing — charters has none of those. Cruises has a two-tier itinerary (template + override) — charters has flat per-voyage. Cruises has an adapter contract — charters has direct sync per brand.

**What they do share is conceptual primitives** that already live in shared modules:
- Ports (facilities)
- Booking infrastructure (bookings)
- Contract templates (legal)
- Person/org references (CRM)
- Pricing catalogs / schedules (pricing module — though charters uses these less because pricing is flat)
- Storage (voyant-storage)
- Currency / FX (future `fx` module)

If a future `vessels` base module emerges to factor out yacht/cruise-ship shared metadata, both modules can adopt it via a non-breaking refactor. Not in v1's scope.

## 14. What stays out

| Pattern | Charters decision |
|---|---|
| Bareboat charter | Different vertical entirely (mid-market, NauSYS / MMK aggregators). Not in this module, not in any OSS Voyant module. |
| Cabin grade × occupancy pricing | Not in scope — charter pricing is flat. If a brand publishes occupancy variants (rare in luxury), we add the columns when we have data, not preemptively. |
| Fare codes + dated promo overlays | Not in scope — luxury yacht pricing changes via broker negotiation, not via a published rate ladder. |
| Brand-specific connectors in OSS | Same rule as cruises — OSS Voyant doesn't ship third-party connectors. Charter brand integrations live in Voyant Connect (default adapter) or in agency-built custom adapters against the §11 contract. The OSS module ships the schema + service + routes + adapter contract; the connectors live elsewhere. |
| Day charters / sub-overnight | Different transactional shape; doesn't fit voyage + suite model. |

## 15. Test strategy

Following the existing Voyant convention:

- **Unit tests** for `pricingService.quotePerSuite` and `quoteWholeYacht` — pure functions over suite + voyage rows, no DB. APA computation, currency resolution, missing-currency error paths.
- **Unit tests** for the MYBA template variable resolver — given a voyage + booking, verify the right variable values bind to the template.
- **Integration tests** for the booking helpers (single + party booking happy paths, currency mismatch rejection, missing-MYBA-template fail-loud, suite-availability check).
- **Validation tests** for the input schemas (booking mode discriminator, APA percent bounds, currency enum).
- 60+ tests in v1; pricing logic is the highest-value coverage.

DB-backed integration tests deferred until charters is wired into a template's drizzle.config — same pattern as cruises phase 2.

## 16. Build phases

**Phase 1 — schema + core service (1 week)**
- Schema + migrations + TypeID prefix registration
- `chartersService` core CRUD on products, voyages, yachts, suites, schedule
- `pricingService.quotePerSuite` + `quoteWholeYacht` + APA math
- Currency resolution helpers
- Tests for pricing math
- Doc landing on this branch

**Phase 2 — routes, booking extension, MYBA wiring (1-2 weeks)**
- Admin + public route surface
- `booking_charter_details` extension table + service + routes
- `chartersBookingService.createPerSuiteBooking` and `createWholeYachtCharterBooking`
- `mybaService.generateContract` wraps legal.contractsService — including seeding the default MYBA contract template at module install
- APA reconciliation endpoints
- Integration tests on booking flow

**Phase 3 — adapter contract + dual-source admin (1-2 weeks)**
- `CharterAdapter` interface + canonical external types in `@voyant-travel/charters/adapters`
- `registerCharterAdapter` registry, memoize decorator, `MockCharterAdapter` test fixture
- Unified-key parsing in admin routes (`chrt_*` local + `<provider>:<ref>` external); list endpoints interleave local + adapter via `Promise.allSettled`
- External-only routes: `POST /:key/refresh`, `POST /:key/detach` (deferred to v2 if scope tight)
- Booking flow extended for external voyages (`adapter.createPerSuiteBooking` / `createWholeYachtBooking` + snapshot)
- Provenance fields on `booking_charter_details` (`source`, `sourceProvider`, `sourceRef`)

**Phase 4 — react package + storefront (1-2 weeks)**
- `@voyant-travel/charters-react` mirroring the cruises-react / relationships-react shape
- Hooks for products, voyages, suites, schedule, quoting (per-suite + whole-yacht), bookings, MYBA actions, external adapter actions (refresh, detach)
- shadcn registry components: charter-product-card, voyage-detail, suite-list, suite-card, whole-yacht-quote-display, inquiry-form, external-badge
- Wire into the example app under `/charters`

Total: **~4-6 weeks** for OSS v1. The brand-coverage work itself — actually integrating Aman, Four Seasons, Ritz, SeaDream, A&K, Orient Express — does not live in OSS. Voyant Connect (closed) is where charter brand connectors ship; agencies that don't use Connect build their own adapter against the §11 contract. The OSS module is migration-complete when the schema, services, routes, booking extension, MYBA wiring, adapter contract, and React layer are solid; brand coverage then arrives via Connect on its own cadence without any further OSS changes.

## 17. Open questions

1. **Per-brand quirks at sync time vs canonical schema** — A&K's heavy promo tracking, Ritz's per-suite multi-currency, SeaDream's "Brochure Fare" vs "Today's Rate" dual rate. Do we model the ones we have in the canonical schema, or stamp them in `extra` jsonb and let per-brand logic apply at quote time? Recommendation: minimal canonical, per-brand extras in `extra` jsonb. Decide before phase 1 ships.
2. **Tenant currency normalization at storefront display time** — same question as cruises had. Recommendation: same answer: store native, FX at display via future `fx` module. Do not convert at sync time.
3. **MYBA template authoring** — operators may want to fork the default MYBA template per brand (Aman's brand requires its own contract clauses, etc.). The legal/contracts module already supports template versioning; we just need to settle whether each charter product points at its own forked template or the default. Recommendation: default-templated with per-product override, exactly the pattern §6.1 describes. Already in.
4. **Whole-yacht inventory hold semantics** — when a broker submits an inquiry for a whole-yacht charter on a date range, do we auto-block per-suite availability for the same dates? Recommendation: yes, and the lock has a 14-day default (industry standard "provisional hold"). Implement in phase 2 as a soft lock on `charter_voyages` (a `provisionalHoldUntil` timestamp + `provisionalHoldBookingId` ref) — broker can extend or release.
5. **Adapter detach action for external charters** — when a broker negotiates exclusive terms on an external whole-yacht charter, do we offer a `POST /:key/detach` (mirroring cruises) that snapshots the external product into a local one and severs the link? Recommendation: not in v1 — charter products are usually too negotiated to detach cleanly (each booking's MYBA contract is the operator-to-charterer agreement, not the brand's own contract). Re-evaluate once we have real operator demand.
