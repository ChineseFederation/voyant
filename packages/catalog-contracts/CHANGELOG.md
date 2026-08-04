# @voyant-travel/catalog-contracts

## 0.118.0

### Minor Changes

- d2a571f: Rename the booking journey descriptor from `BookingDraftShape` to `BookingRequirements`, promoting it from beta to v1 vocabulary. This is a breaking rename with no behavior change:

  - `BookingDraftShape` → `BookingRequirements`, `defaultDraftShapeFlags` → `defaultRequirementsFlags` (`@voyant-travel/catalog-contracts/booking-engine/requirements`, formerly `.../draft-shape`)
  - `bookingDraftShapeV1` / `BookingDraftShapeV1` → `bookingRequirementsV1` / `BookingRequirementsV1`
  - Per-vertical builders: `buildAccommodationDraftShape` → `buildAccommodationRequirements`, `buildCharterDraftShape` → `buildCharterRequirements`, `buildCruiseDraftShape` → `buildCruiseRequirements`, `buildProductDraftShape` → `buildProductRequirements`, `buildExtraDraftShape` → `buildExtraRequirements`, `buildOwnedProductDraftShape` → `buildOwnedProductRequirements`, each moved from `draft-shape` to a `requirements` module/subpath
  - `@voyant-travel/catalog-react`'s `useBookingDraftShape` → `useBookingRequirements`
  - The redundant `@voyant-travel/catalog/booking-engine/draft-shape` re-export shim is removed; import `BookingRequirements` from `@voyant-travel/catalog-contracts/booking-engine/requirements` (re-exported from `@voyant-travel/catalog/booking-engine` as before)

  No other exported names, wire-format fields (e.g. `shape` on a quote response), or behavior changed.

## 0.117.1

### Patch Changes

- 524fd25: Let an option sell several tiers of one traveler category.

  `deriveTravelerCategory` mapped every age window under 18 onto `child`, and
  `loadPaxBands` deduped the product's traveler types by `categoryType`. An
  operator selling "Child 6-12" at 13600 and "Child 0-5" at 10400 on one option
  therefore got a single `child` stepper in the journey, and only the
  first-sorting tier was ever quoted or reserved. #4118 stopped the resulting
  double charge by letting one tier claim the contested band; the second tier
  stayed unsellable at any pax combination, with no signal to the operator that
  it was dead.

  A pax band now identifies the traveler type the operator configured. The first
  tier of each category keeps its canonical code (`adult`, `child`, …) and every
  further tier is qualified by its pricing category
  (`child:pricing_categories_01j…`). `loadPaxBands`, `loadPaxBandDependencies`
  and `loadResolvedOptionPrice` derive those codes from one shared, ordered
  category list, so the code a shopper is offered is the code the price rule is
  matched on and the #4118 claim guard becomes a no-op rather than a tie-break.

  Keeping the first tier on the bare code is what makes this safe on live data:
  a product with one tier per category emits exactly the codes it emitted
  before, and a session, accepted quote or traveler row written against `child`
  still resolves — to the same tier #4118's tie-break already picked.
  `travelerEntryV1.band` widens from an enum to a string for the qualified
  codes; every canonical code stays valid. Downstream surfaces typed by
  canonical category — booking traveler categories, sourced commitments,
  `appliesToBands`, contract `paxAdult`/`paxChild`/`paxInfant` — read the base
  code off the band, so a tier rolls up into the category it belongs to.

  Products with no configured traveler types are unchanged: they still get the
  generic adult / child / infant defaults, and a price row with no pricing
  category still resolves its band from the unit's age window.

## 0.117.0

### Minor Changes

- 06a79a0: Stop treating Extras as independently sellable catalog inventory.

  An Extra — an optional lunch, an attraction ticket — is lifecycle-dependent on
  the Product Booking that carries it. It is authored on the Product's Plan and
  Options, selected while the Booking is made, and fulfilled on the Departure. It
  was nonetheless still modelled as a first-class catalog vertical: it had a
  browse tab, filters, an entry in `DEFAULT_CATALOG_VERTICALS`, and document
  builders that could write it into the search index.

  `PRODUCT_OWNED_VERTICALS` in `@voyant-travel/catalog-contracts/indexer/contract`
  now names the verticals that exist only so their parent can freeze a booking
  snapshot, with `isProductOwnedVertical` / `owningVerticalFor` to read it.
  Consequently:

  - `extras` leaves `DEFAULT_CATALOG_VERTICALS`, so no extras slice or collection
    is provisioned and nothing can be indexed into one.
  - `POST /v1/{admin,public}/catalog/search` answers a product-owned vertical with
    `400 { reason: "not_independently_sellable", ownedBy }` instead of silently
    returning nothing, so an old deep link can explain itself.
  - The shared Catalog page drops the Extras tab, its columns and its filters, and
    renders a compatibility notice for `?tab=extras` pointing at the owning
    Product rather than falling through to a different result set.
  - `@voyant-travel/inventory/extras` no longer exports `createExtraDocumentBuilder`
    or `createExtraDocumentEmitter`; every extras field policy is now
    `reindex: "none"`. Snapshot and provenance helpers are unchanged — they are how
    the owning Product records what it sold.
  - `CatalogVertical` in the Trip composer no longer admits `extras`.

  `verify:extras-lifecycle` holds the line, and also refuses any migration that
  would promote an existing Extra into a Product or Component Booking — that is a
  commercial decision an operator makes deliberately, not a backfill.

## 0.116.0

### Minor Changes

- 4c694f6: Gate sourced catalog entries on channel publication, and let operators choose
  which supply sources each channel sells.

  Sourced entries never passed a listability gate: `syncSources` emitted every
  discovered projection into every slice the deployment materialized, so
  attaching a supply connection published that supplier's whole catalogue to the
  operator's live storefront with no publish step. Channel publication could not
  reach them either — its subjects are a product id and a canonical Supplier, and
  a sourced entry has neither.

  `channel_source_publications` adds the missing subject: an include/exclude
  decision on a `(source_kind, source_connection_id)` pair, resolved
  default-deny with connection beating source kind, mirroring the existing
  product-beats-supplier ordering. The discovery sync and the catalog document
  builder both consult it, so revoking publication removes the inventory on the
  next index pass; staff slices stay ungated so operators can still browse a
  connected supplier to decide what to sell. Admin gets a Supply sources tab
  alongside Products and Suppliers, with the same preview-and-confirm step that
  supplier rules use.

  Index documents now carry `isSourced`, `sourceKind`, and `sourceConnectionId`
  in every vertical, so storefronts can scope on ownership directly instead of
  inferring it from `supplyModel` or an id prefix.

  Deployments with inventory already indexed are backfilled with an explicit
  `include` rule per connection per active channel, so nothing disappears from a
  live storefront on upgrade — the status quo becomes something the operator can
  see and revoke rather than something implied by having connected at all.
  Connections attached after this ships are unpublished until chosen.

## 0.115.2

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

## 0.115.1

### Patch Changes

- eeaa5b5: Make Booking Sessions the sole Booking Platform v1 pre-commit lifecycle.

  The transactional beta-data cutover verifies genuine commitments, releases
  owned capacity, preserves resumable staff attempts as canonical Sessions,
  redacts disposable attempts into audited tombstones, and then removes
  `booking_drafts`. The duplicate quote/draft/hold routes, draft capability,
  reaper, low-level quote tool, and deployment source-provider gate are removed.

## 0.115.0

### Minor Changes

- e93c0a7: Generalize durable Supplier Operations from Session-only reserve intents to
  explicit Booking Session or Booking Amendment subjects, with linked Booking
  Items and reserve, modify, and cancel operation kinds. Add the source-adapter
  desired-state modification contract and Amendment-safe dispatch,
  idempotency, ambiguity, and reconciliation behavior.

## 0.114.0

### Minor Changes

- 79606bb: Add Booking Platform v1 supplier-first Commit orchestration with durable
  Supplier Operations, typed pending and ambiguous outcomes, operator
  reconciliation and manual resolution, and a replay-safe sourced cruise tracer.

## 0.113.0

### Minor Changes

- 5d3b563: Complete the Booking Session v1 owned Product tracer with server-derived access context,
  creation-only anonymous capability material, idempotent Quote/Hold/update/abandon/Commit
  operations, and production Commit wiring through the admitted Finance self-service create
  transaction callback.
- 2601445: Continue owned Product Booking Session Commit through an idempotent pre-Booking
  Finance payment session, selected payment adapter, and atomic transfer to the
  created Booking. Expose typed payment-required continuation and recovery through
  the shared route contract, Storefront SDK, and React hooks.

### Patch Changes

- f25ad34: Add the Booking Platform v1 lifecycle commitment-policy schemas and reusable conformance scenarios.

  Implement the first owned Product Booking Session v1 tracer with exact-revision
  Quote, capability-gated public mutations, real-capacity Hold, atomic Commit
  outcome, persistent repository adapter, Storefront SDK, and React hook surfaces.

## 0.112.2

### Patch Changes

- 87668e8: Make manual booking creation actionable and predictable: submit errors are visible, existing CRM contacts no longer require duplicate data entry, room assignments fill selected capacity, authoritative quotes preserve per-person/per-room pricing, and Finance tool failures explain how to correct invalid room or payment inputs.

## 0.112.1

### Patch Changes

- a43267a: Add node-aware localized editorial overlays for sourced product content, including stable content-node targeting, optimistic overlay versions, audit history, product admin read/write/clear routes, and public provenance redaction.

  Tighten editorial overlay scope isolation for product content reads and writes, require admin overlay mutations to carry an authenticated user id, and make overlay mutations/history atomic with race-safe optimistic version checks.

## 0.112.0

### Minor Changes

- d9ff078: Add the first-party Postgres catalog search provider, its public adapter and
  relevance utilities, snapshot-identified rebuild retries, and the `postgres`
  managed search-provider selection.

## 0.111.1

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.

## 0.111.0

### Minor Changes

- 0808b21: Publish canonical catalog search sort resolution, strengthen adapter conformance coverage, verify the Typesense implementation against the public runner, and remove provider-specific UI wording.

## 0.110.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.110.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

## 0.109.1

### Patch Changes

- df3e4ec: Publish the engine-neutral catalog indexer adapter and provider contracts under
  `./indexer/contract`, including optional admin lifecycle operations. Add the
  framework-neutral `./indexer/conformance` kit for external adapter packages.

  Make `deployment.providers.search` authoritative through the `catalog.indexer`
  runtime port, ship Typesense as the selected first-party provider, support
  explicit project-owned overrides, and remove direct Typesense search and
  maintenance bypasses.

## 0.109.0

### Minor Changes

- 4829ef3: Add a bounded catalog batch quote endpoint for room/rate price matrices, plus an accommodations batch stay quote path that shares room/date availability and rate reads across selections.

## 0.108.2

### Patch Changes

- aa27c44: Reject malformed booking draft email addresses in contracts and gate the booking journey when billing or traveler emails are syntactically invalid.

## 0.108.1

### Patch Changes

- 2d3b039: Offer bank transfer and inquiry on owned-product storefront checkout.

  The owned-product booking draft shape hardcoded `paymentIntents: ["hold",
"card"]`, so the storefront Payment step collapsed to card-only for owned
  products even though the deployment advertised bank transfer and inquiry
  (sourced products already offered all three). Both product draft shapes now
  declare the full engine allow list via a shared `DEFAULT_PAYMENT_INTENTS`
  constant, and deployment/surface `PaymentProviderCapabilities` narrow it at
  render time — so owned and sourced products offer the same payment paths. The
  `/checkout/start` flow already handled bank transfer and inquiry generically on
  the booking row, so no server change was needed.

## 0.108.0

### Minor Changes

- 6a0edd2: Add the live availability-search primitive (dynamic-packaging RFC, voyant#2081 / voyant#1600) — keystone gap 1.

  - **`@voyant-travel/catalog-contracts`** — new `supportsAvailabilitySearch` capability flag, the `AvailabilitySearchRequest` / `AvailabilityCandidate` / `AvailabilitySearchResult` shapes, and a capability-gated `searchAvailability` method on the `SourceAdapter` contract. `searchAvailability` searches an inventory space (destination + dates + pax → ranked candidates), as opposed to `liveResolve` which resolves volatile fields for an already-selected entity. Internal economics (net/margin/supplier ref) live under `AvailabilityCandidate.providerData` and must never appear in public DTOs.
  - **`@voyant-travel/catalog`** — `fanOutAvailabilitySearch`, the vertical-agnostic counterpart of the flights fan-out: parallelizes `searchAvailability` across sourced connections and owned search handlers with a per-source timeout, partial-success status map, and a price-ranked merge. Adds an owned-availability-search-handler registry (`createOwnedAvailabilitySearchHandlerRegistry`) so owned inventory is a first-class search source alongside sourced adapters, mirroring the owned-booking-handler vs source-adapter split.
  - **`@voyant-travel/flights`** — `mergedFlightOfferToCandidate` / `mergedFlightOffersToCandidates` bridge mapping the flights-native `MergedFlightOffer` onto the normalized `AvailabilityCandidate`. A mapping, not a re-implementation — flights keep their own connector contract and fan-out.

  Additive only; no behavioral change to existing adapters (the new method and capability are optional). Follow-ups on voyant#2081: a concrete accommodations owned-search handler and the Voyant Connect `searchAvailability` implementation.

## 0.107.1

### Patch Changes

- bd74fb0: Split oversized catalog React, booking route, and contract modules into focused internal files while preserving existing public exports and behavior.

## 0.107.0

### Minor Changes

- e3fa849: Move shared booking-engine client/server types into `@voyant-travel/catalog-contracts`.

  `BookingDraftShape` and the draft-shape descriptor types + defaults (`PaxBandSpec`, `PaxBandDependency`, `DEFAULT_PAX_BANDS`, `defaultDraftShapeFlags`, `defaultTravelerFields`, `defaultBookingFields`, `paxBandsAllowedTotalFrom`, …) now live at `@voyant-travel/catalog-contracts/booking-engine/draft-shape`, and `BookingPaymentIntent` joins the V1 wire contracts at `@voyant-travel/catalog-contracts/booking-engine/contracts`. This removes the layering leak where client packages (`@voyant-travel/bookings-react`, `@voyant-travel/catalog-react`) imported contract types from the backend `@voyant-travel/catalog/booking-engine` entry — both now depend on `@voyant-travel/catalog-contracts` instead and no longer depend on `@voyant-travel/catalog` at all.

  `@voyant-travel/catalog/booking-engine` re-exports all moved symbols, so existing backend importers keep working with zero changes.

## 0.106.0

### Minor Changes

- 7122c2a: Admin booking journey overhaul + unified new-booking + reusable catalog UI (#1625)

  - **bookings-ui**: the operator books on a single stacked, guided accordion (progressive unlock, auto-advance) instead of the wizard; storefront keeps the wizard. Travelers as add-rows + per-traveler type + CRM linking, Configure with departure-first + nested rooms + occupancy-dependency rules, price override + voucher in the side panel, single payment-link checkbox, notes/docs block, save-as-draft / confirmed-if-paid status, duplicate-departure warning, commit lands on the booking detail. Journey steps split into per-step modules. B2B billing is satisfied by a picked organization; switching the product option clears stale room selections.
  - **catalog / catalog-react / catalog-ui**: the operator catalog browse/detail UI moves into the shared `@voyant-travel/catalog-ui` + `@voyant-travel/catalog-react` packages (detail pages, browse/dynamic/scheduled, gallery, calendar, sheet, enrichment, catalog i18n) so other templates can reuse them; booking-engine commit path returns the booking id and lands on detail.
  - **catalog-contracts**: adds pax-band occupancy dependencies, the option-units configure sub-step, and the sourced stays/package rate pin (`roomTypeId` / `ratePlanId` / `board`) to the booking-engine draft + adapter contracts.
  - **products / i18n**: products booking handler forwards the slot id + breakdown currency; admin booking-journey i18n strings.

## 0.105.1

### Patch Changes

- 0bd9900: Pin sourced stays/package bookings by stable room/rate keys. Booking drafts now
  preserve `roomTypeId`, `ratePlanId`, and `board` configure fields, and the
  catalog booking engine forwards them to adapter quote/reserve parameters so live
  re-resolution can select the exact room and board the operator picked.

## 0.105.0

### Minor Changes

- 921f4fc: Add a canonical board-basis contract enum and reuse it across accommodation meal plans, product options, and cruise sailings.

## 0.104.1

## 0.104.0

## 0.103.0

## 0.102.0

## 0.101.2

## 0.101.1

## 0.101.0

## 0.100.0

## 0.99.0

### Minor Changes

- c893886: Complete `flights-contracts` by moving the flight snapshot builder into it.

  `@voyant-travel/catalog-contracts` now exports `./snapshot` with `PricingBasis` and
  `CaptureSnapshotInput` — pure shapes that were embedded in catalog runtime files
  (`services/snapshot-service.ts`, `snapshot/schema.ts`). `@voyant-travel/catalog`
  re-exports them from their original paths, so every consumer
  (accommodations/charters/cruises/extras/products, catalog-ui) is unchanged.

  `@voyant-travel/flights-contracts` now owns `snapshot.ts` (importing the snapshot
  types from `@voyant-travel/catalog-contracts/snapshot`), so the flight snapshot
  builder no longer needs the catalog runtime. `@voyant-travel/flights/snapshot`
  re-exports it. Resolves #1449.

## 0.98.0

## 0.97.0

### Minor Changes

- 2555264: Extract two more contract surfaces into lightweight packages, closing the
  remaining gaps in the `*-contracts` pattern (ADR-0002 / ADR-0003).

  `@voyant-travel/flights-contracts` (new, zod-only) now owns the pure flight
  `SourceAdapter` contract, request/response schemas, post-book types, and the
  reference-data shapes (`contract/{types,adapter,schemas,post-book-types}`,
  `reference/{contract,static-bundle}`), so flight-provider adapter authors and
  external consumers can integrate without the flights runtime (Drizzle/DB).

  `@voyant-travel/catalog-contracts` gains the pure booking-engine contracts —
  `booking-engine/contracts` (the `BookingDraft` + V1 engine schemas) and
  `booking-engine/promotions-contract` — which were previously trapped in the
  catalog runtime.

  The runtime `@voyant-travel/flights` and `@voyant-travel/catalog` packages re-export from
  the contract packages, so existing `@voyant-travel/flights/contract/*`,
  `@voyant-travel/flights/reference/*`, and `@voyant-travel/catalog/booking-engine/*` import
  paths are unchanged.

  Note: `@voyant-travel/flights`' `snapshot.ts` stays in the runtime for now — it
  depends on catalog's `CaptureSnapshotInput` / `PricingBasis`, which still live in
  catalog runtime files (`services/snapshot-service.ts`, `snapshot/schema.ts`).
  Carving those pure shapes into `catalog-contracts` (which would let the flight
  snapshot move too) is a tracked follow-up.

## 0.96.0

### Minor Changes

- 2d8d59b: Add lightweight catalog and cruises contract packages for external consumers.

  `@voyant-travel/catalog-contracts` now owns the pure catalog adapter contracts,
  adapter Zod schemas, field-policy contracts, provenance, drift event payloads,
  and pure content locale/overlay helpers. `@voyant-travel/cruises-contracts` now owns
  the `cruises/v1` rich content schema (including the cabin feature, bed,
  accessibility, and view-type facet vocabularies), version, types, and validator.

  The pure content primitives (`isStale`, `pickBestCachedLocale`, the JSON-pointer
  overlay applier, and `mergeOverlaysIntoContent`) now have a single source of
  truth in `@voyant-travel/catalog-contracts`; `@voyant-travel/catalog`'s content service
  re-exports them and retains only the runtime-bound (Drizzle/Postgres) primitives.
  The cruise cabin facet vocabularies likewise live in `@voyant-travel/cruises-contracts`
  and are re-exported from `@voyant-travel/cruises`.

  The existing `@voyant-travel/catalog` and `@voyant-travel/cruises` contract import paths
  remain available through compatibility re-exports.
