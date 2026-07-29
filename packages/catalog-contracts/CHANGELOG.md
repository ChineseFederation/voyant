# @voyant-travel/catalog-contracts

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
