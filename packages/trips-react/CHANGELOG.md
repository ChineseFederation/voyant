# @voyant-travel/trips-react

## 0.248.0

### Minor Changes

- f569b10: Replace the beta booking hooks with a v1 Booking Session journey client.

  `@voyant-travel/catalog-react/booking-engine` spoke three routes that no longer
  exist server-side — `GET/PUT/DELETE /catalog/drafts/:id`, `POST
/catalog/holds/{place,release}` and `POST /catalog/quote` — so every hook in it
  returned 404. It now speaks the v1 Session lifecycle instead:

  - `useBookingSession` — create / resume / PATCH the selection, tracking the
    revision and feeding it back as `expectedRevision`
  - `useBookingQuote` — price the current Session revision, returning the Quote
    with its `requirements` and `requirementsFingerprint`
  - `useBookingHold` — hold real capacity against a Quote
  - `useBookingCommit` — commit `quoteId` + `holdId?` + `requirementsFingerprint`
  - `useOfferPreview` — the stateless, non-binding price a detail page shows
    before anything that looks like booking has happened
  - `useBookingDraft` is removed; a draft is a Session's selection

  Lifecycle outcomes are returned, not thrown: callers branch on the discriminated
  `bookingSessionOutcomeV1`, so `selection_incomplete` reaches a host with its
  machine-readable `unsatisfied[]` list intact instead of collapsed into a
  sentence. Idempotency keys are derived from (journey root, action, revision,
  payload) rather than minted per attempt.

  The create → quote → hold → commit choreography that `bookings-react` kept as a
  private hand-rolled client is now shared as `commitBookingSessionJourneyV1`,
  continuation and all.

### Patch Changes

- Updated dependencies [f569b10]
  - @voyant-travel/catalog-react@0.253.0
  - @voyant-travel/bookings-react@0.255.0
  - @voyant-travel/flights-react@0.255.0
  - @voyant-travel/relationships-react@0.255.0

## 0.247.0

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/catalog-react@0.252.0
  - @voyant-travel/bookings-react@0.254.0
  - @voyant-travel/flights-react@0.254.0
  - @voyant-travel/relationships-react@0.254.0

## 0.246.0

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/bookings-react@0.253.0
  - @voyant-travel/catalog-react@0.251.0
  - @voyant-travel/flights-react@0.253.0
  - @voyant-travel/relationships-react@0.253.0

## 0.245.0

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/bookings-react@0.252.0
  - @voyant-travel/catalog-react@0.250.0
  - @voyant-travel/flights-react@0.252.0
  - @voyant-travel/relationships-react@0.252.0

## 0.244.0

### Patch Changes

- @voyant-travel/bookings-react@0.251.0
- @voyant-travel/catalog-react@0.249.0
- @voyant-travel/flights-react@0.251.0
- @voyant-travel/relationships-react@0.251.0

## 0.243.0

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings-react@0.250.0
  - @voyant-travel/catalog-react@0.248.0
  - @voyant-travel/flights-react@0.250.0
  - @voyant-travel/relationships-react@0.250.0

## 0.242.0

### Minor Changes

- 9b9e8ac: Split the booking-engine contracts by concern and collapse the duplicated
  requirements type families onto the Zod schemas. Breaking renames, no behavior
  change.

  **File / subpath split.** `booking-engine/draft-contracts.ts` is deleted and its
  contents redistributed. `booking-engine/requirements.ts` is deleted and split in
  two, so each file's name matches what it holds:

  - `@voyant-travel/catalog-contracts/booking-engine/requirements-contracts` —
    every schema describing what a booking _requires_ (`paxBandSpecV1`,
    `paxBandDependencyV1`, `cabinCategoryOptionV1`, `cabinNumberOptionV1`,
    `productVariantUnitOptionV1`, `productVariantOptionV1`, `ratePlanOptionV1`,
    `roomOptionV1`, `extensionOptionV1`, `addonOfferV1`, `configureSubStepV1`,
    `accommodationSubStepV1`, `addonGroupV1`, `travelerFieldRequirementV1`,
    `bookingFieldRequirementV1`, `bookingRequirementsV1`) plus their inferred types
  - `@voyant-travel/catalog-contracts/booking-engine/requirements-defaults` — the
    runtime values and helpers only (`DEFAULT_PAX_BANDS`, `DEFAULT_PAX_TOTAL`,
    `DEFAULT_PAYMENT_INTENTS`, `PAX_BAND_TIER_SEPARATOR`, `paxBandBaseCode`,
    `paxBandTierCode`, `paxBandsAllowedTotalFrom`, `defaultRequirementsFlags`,
    `defaultTravelerFields`, `defaultBookingFields`)
  - `@voyant-travel/catalog-contracts/booking-engine/selection-contracts` — what
    the buyer selected (`bookingSelectionV1`, `travelerEntryV1`,
    `travelerBandCodeSchema`, `paxBandCodeSchema`)
  - `@voyant-travel/catalog-contracts/booking-engine/pricing-contracts` —
    `pricingLineV1`, `pricingTaxV1`, `pricingBreakdownV1`,
    `bookingPolicyEvidenceV1`, `bookingPaymentScheduleV1`

  The `booking-engine/requirements` subpath is gone; all of the above remain
  re-exported from `booking-engine/contracts` (except the defaults, which stay on
  their own subpath and the package root).

  **One name per concept.** The hand-written interfaces that duplicated the Zod
  schemas are deleted; each type is now `z.infer` of its schema and keeps the
  `…V1` contract name: `BookingRequirements` → `BookingRequirementsV1`,
  `PaxBandSpec` → `PaxBandSpecV1`, `PaxBandDependency` → `PaxBandDependencyV1`,
  `CabinCategoryOption` → `CabinCategoryOptionV1`, `CabinNumberOption` →
  `CabinNumberOptionV1`, `ProductVariantOption` → `ProductVariantOptionV1`,
  `ProductVariantUnitOption` → `ProductVariantUnitOptionV1`, `RatePlanOption` →
  `RatePlanOptionV1`, `RoomOption` → `RoomOptionV1`, `ExtensionOption` →
  `ExtensionOptionV1`, `AddonOffer` → `AddonOfferV1`, `AddonGroup` →
  `AddonGroupV1`, `ConfigureSubStep` → `ConfigureSubStepV1`,
  `AccommodationSubStep` → `AccommodationSubStepV1`, `TravelerFieldRequirement` →
  `TravelerFieldRequirementV1`, `BookingFieldRequirement` →
  `BookingFieldRequirementV1`. The collection fields loosen from `ReadonlyArray<T>`
  to `T[]`, matching the schema.

  **Beta vocabulary retired.** `bookingDraftV1` / `BookingDraftV1` →
  `bookingSelectionV1` / `BookingSelectionV1`, and `@voyant-travel/trips`'
  `toBookingDraftV1` → `toBookingSelectionV1`.

  With one type family the documented `as unknown as BookingRequirementsV1` cast in
  the catalog session plane is deleted. Wire formats are unchanged — `quoteRequest.draft`,
  `quoteResponse.shape`, `session.statePayload`, and the persisted
  `tripComponent.metadata.bookingDraftV1` key all keep their names.

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/catalog-react@0.247.0
  - @voyant-travel/bookings-react@0.249.0
  - @voyant-travel/trips@0.231.0
  - @voyant-travel/flights-react@0.249.0
  - @voyant-travel/relationships-react@0.249.0

## 0.241.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/trips@0.230.0
  - @voyant-travel/bookings-react@0.248.0
  - @voyant-travel/catalog-react@0.246.0
  - @voyant-travel/flights-react@0.248.0
  - @voyant-travel/relationships-react@0.248.0

## 0.240.0

### Minor Changes

- d2a571f: Rename the booking journey descriptor from `BookingDraftShape` to `BookingRequirements`, promoting it from beta to v1 vocabulary. This is a breaking rename with no behavior change:

  - `BookingDraftShape` → `BookingRequirements`, `defaultDraftShapeFlags` → `defaultRequirementsFlags` (`@voyant-travel/catalog-contracts/booking-engine/requirements`, formerly `.../draft-shape`)
  - `bookingDraftShapeV1` / `BookingDraftShapeV1` → `bookingRequirementsV1` / `BookingRequirementsV1`
  - Per-vertical builders: `buildAccommodationDraftShape` → `buildAccommodationRequirements`, `buildCharterDraftShape` → `buildCharterRequirements`, `buildCruiseDraftShape` → `buildCruiseRequirements`, `buildProductDraftShape` → `buildProductRequirements`, `buildExtraDraftShape` → `buildExtraRequirements`, `buildOwnedProductDraftShape` → `buildOwnedProductRequirements`, each moved from `draft-shape` to a `requirements` module/subpath
  - `@voyant-travel/catalog-react`'s `useBookingDraftShape` → `useBookingRequirements`
  - The redundant `@voyant-travel/catalog/booking-engine/draft-shape` re-export shim is removed; import `BookingRequirements` from `@voyant-travel/catalog-contracts/booking-engine/requirements` (re-exported from `@voyant-travel/catalog/booking-engine` as before)

  No other exported names, wire-format fields (e.g. `shape` on a quote response), or behavior changed.

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/catalog-react@0.245.0
  - @voyant-travel/bookings-react@0.247.0
  - @voyant-travel/flights-react@0.247.0
  - @voyant-travel/relationships-react@0.247.0

## 0.239.0

### Patch Changes

- @voyant-travel/bookings-react@0.246.0
- @voyant-travel/catalog-react@0.244.0
- @voyant-travel/flights-react@0.246.0
- @voyant-travel/relationships-react@0.246.0

## 0.238.0

### Patch Changes

- Updated dependencies [ff0b8cc]
- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/i18n@0.121.0
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/bookings-react@0.245.0
  - @voyant-travel/flights-react@0.245.0
  - @voyant-travel/catalog-react@0.243.0
  - @voyant-travel/relationships-react@0.245.0

## 0.237.0

### Patch Changes

- @voyant-travel/bookings-react@0.244.0
- @voyant-travel/catalog-react@0.242.0
- @voyant-travel/flights-react@0.244.0
- @voyant-travel/relationships-react@0.244.0

## 0.236.0

### Patch Changes

- @voyant-travel/bookings-react@0.243.0
- @voyant-travel/catalog-react@0.241.0
- @voyant-travel/flights-react@0.243.0
- @voyant-travel/relationships-react@0.243.0

## 0.235.0

### Patch Changes

- @voyant-travel/bookings-react@0.242.0
- @voyant-travel/catalog-react@0.240.0
- @voyant-travel/flights-react@0.242.0
- @voyant-travel/relationships-react@0.242.0

## 0.234.0

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

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings-react@0.241.0
  - @voyant-travel/i18n@0.120.0
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/catalog-react@0.239.0
  - @voyant-travel/flights-react@0.241.0
  - @voyant-travel/relationships-react@0.241.0

## 0.233.0

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/bookings-react@0.240.0
  - @voyant-travel/catalog-react@0.238.0
  - @voyant-travel/flights-react@0.240.0
  - @voyant-travel/relationships-react@0.240.0

## 0.232.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/catalog-contracts@0.116.0
  - @voyant-travel/bookings-react@0.239.0
  - @voyant-travel/catalog-react@0.237.0
  - @voyant-travel/flights-react@0.239.0
  - @voyant-travel/relationships-react@0.239.0

## 0.231.0

### Patch Changes

- @voyant-travel/relationships-react@0.238.0
- @voyant-travel/bookings-react@0.238.0
- @voyant-travel/catalog-react@0.236.0
- @voyant-travel/flights-react@0.238.0

## 0.230.0

### Minor Changes

- f69e880: Make commercial commitment the sole Booking creation boundary for Booking
  Platform v1.

  Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
  states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
  their respective domains. The beta-data migration preserves evidenced
  commitments, fails closed on ambiguous external effects, restores capacity for
  abandoned attempts, and removes the obsolete Booking-backed session state.

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-react@0.237.0
  - @voyant-travel/i18n@0.119.4
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/flights-react@0.237.0
  - @voyant-travel/catalog-react@0.235.0
  - @voyant-travel/relationships-react@0.237.0

## 0.229.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/catalog-contracts@0.115.1
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/bookings-react@0.236.0
  - @voyant-travel/flights@0.236.0
  - @voyant-travel/trips@0.229.0
  - @voyant-travel/flights-react@0.236.0
  - @voyant-travel/catalog-react@0.234.0
  - @voyant-travel/relationships-react@0.236.0

## 0.228.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/trips@0.228.0
- @voyant-travel/bookings-react@0.235.0
- @voyant-travel/catalog-react@0.233.0
- @voyant-travel/flights-react@0.235.0
- @voyant-travel/relationships-react@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/flights@0.235.0

## 0.227.0

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/bookings-react@0.234.0
  - @voyant-travel/flights@0.234.0
  - @voyant-travel/trips@0.227.0
  - @voyant-travel/flights-react@0.234.0
  - @voyant-travel/catalog-react@0.232.0
  - @voyant-travel/relationships-react@0.234.0

## 0.226.0

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/bookings-react@0.233.0
  - @voyant-travel/flights@0.233.0
  - @voyant-travel/trips@0.226.0
  - @voyant-travel/flights-react@0.233.0
  - @voyant-travel/catalog-react@0.231.0
  - @voyant-travel/relationships-react@0.233.0

## 0.225.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/bookings-react@0.232.0
  - @voyant-travel/catalog-react@0.230.0
  - @voyant-travel/flights@0.232.0
  - @voyant-travel/trips@0.225.0
  - @voyant-travel/flights-react@0.232.0
  - @voyant-travel/relationships-react@0.232.0
  - @voyant-travel/finance@0.232.0

## 0.224.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/bookings-react@0.231.0
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/catalog-react@0.229.0
  - @voyant-travel/i18n@0.119.3
  - @voyant-travel/trips@0.224.0
  - @voyant-travel/flights-react@0.231.0
  - @voyant-travel/relationships-react@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/flights@0.231.0

## 0.223.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/bookings-react@0.230.0
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/flights@0.230.0
  - @voyant-travel/trips@0.223.0
  - @voyant-travel/catalog-react@0.228.0
  - @voyant-travel/flights-react@0.230.0
  - @voyant-travel/relationships-react@0.230.0

## 0.222.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/bookings-react@0.229.0
  - @voyant-travel/flights@0.229.0
  - @voyant-travel/trips@0.222.0
  - @voyant-travel/catalog-react@0.227.0
  - @voyant-travel/flights-react@0.229.0
  - @voyant-travel/relationships-react@0.229.0

## 0.221.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/bookings-react@0.228.0
  - @voyant-travel/catalog-react@0.226.0
  - @voyant-travel/flights-react@0.228.0
  - @voyant-travel/relationships-react@0.228.0
  - @voyant-travel/catalog@0.226.0
  - @voyant-travel/finance@0.228.0
  - @voyant-travel/flights@0.228.0
  - @voyant-travel/trips@0.221.0

## 0.220.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/relationships-react@0.227.0
  - @voyant-travel/i18n@0.119.2
  - @voyant-travel/bookings-react@0.227.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/trips@0.220.0
  - @voyant-travel/flights-react@0.227.0
  - @voyant-travel/catalog-react@0.225.0
  - @voyant-travel/flights@0.227.0

## 0.219.1

### Patch Changes

- Updated dependencies [5694a2b]
  - @voyant-travel/i18n@0.119.1

## 0.219.0

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/bookings-react@0.226.0
  - @voyant-travel/trips@0.219.0
  - @voyant-travel/catalog-react@0.224.0
  - @voyant-travel/flights-react@0.226.0
  - @voyant-travel/relationships-react@0.226.0
  - @voyant-travel/flights@0.226.0

## 0.218.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/bookings-react@0.225.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/flights@0.225.0
  - @voyant-travel/flights-react@0.225.0
  - @voyant-travel/trips@0.218.0
  - @voyant-travel/catalog-react@0.223.0
  - @voyant-travel/relationships-react@0.225.0

## 0.217.0

### Patch Changes

- @voyant-travel/catalog@0.222.0
- @voyant-travel/finance@0.224.0
- @voyant-travel/flights@0.224.0
- @voyant-travel/trips@0.217.0
- @voyant-travel/admin@0.132.0
- @voyant-travel/bookings-react@0.224.0
- @voyant-travel/catalog-react@0.222.0
- @voyant-travel/flights-react@0.224.0
- @voyant-travel/relationships-react@0.224.0

## 0.216.0

### Patch Changes

- @voyant-travel/catalog@0.221.0
- @voyant-travel/finance@0.223.0
- @voyant-travel/flights@0.223.0
- @voyant-travel/trips@0.216.0
- @voyant-travel/bookings-react@0.223.0
- @voyant-travel/catalog-react@0.221.0
- @voyant-travel/flights-react@0.223.0
- @voyant-travel/relationships-react@0.223.0

## 0.215.0

### Patch Changes

- @voyant-travel/bookings-react@0.222.0
- @voyant-travel/catalog-react@0.220.0
- @voyant-travel/flights-react@0.222.0
- @voyant-travel/relationships-react@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/flights@0.222.0
- @voyant-travel/trips@0.215.0

## 0.214.1

## 0.214.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/catalog@0.219.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/bookings-react@0.221.0
  - @voyant-travel/flights@0.221.0
  - @voyant-travel/trips@0.214.0
  - @voyant-travel/flights-react@0.221.0
  - @voyant-travel/catalog-react@0.219.0
  - @voyant-travel/relationships-react@0.221.0

## 0.213.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/catalog@0.218.0
  - @voyant-travel/bookings-react@0.220.0
  - @voyant-travel/trips@0.213.0
  - @voyant-travel/flights@0.220.0
  - @voyant-travel/flights-react@0.220.0
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/catalog-react@0.218.0
  - @voyant-travel/relationships-react@0.220.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings-react@0.219.0
- @voyant-travel/trips@0.212.0
- @voyant-travel/catalog-react@0.217.0
- @voyant-travel/flights-react@0.219.0
- @voyant-travel/relationships-react@0.219.0
- @voyant-travel/catalog@0.217.0
- @voyant-travel/finance@0.219.0
- @voyant-travel/flights@0.219.0

## 0.211.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/bookings-react@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/trips@0.211.0
  - @voyant-travel/flights@0.218.0
  - @voyant-travel/flights-react@0.218.0
  - @voyant-travel/catalog-react@0.216.0
  - @voyant-travel/relationships-react@0.218.0

## 0.210.0

### Patch Changes

- @voyant-travel/bookings-react@0.217.0
- @voyant-travel/trips@0.210.0
- @voyant-travel/catalog-react@0.215.0
- @voyant-travel/flights-react@0.217.0
- @voyant-travel/relationships-react@0.217.0
- @voyant-travel/catalog@0.215.0
- @voyant-travel/finance@0.217.0
- @voyant-travel/flights@0.217.0

## 0.209.1

### Patch Changes

- Updated dependencies [a653664]
  - @voyant-travel/catalog@0.214.1
  - @voyant-travel/trips@0.209.1
  - @voyant-travel/bookings-react@0.216.2
  - @voyant-travel/catalog-react@0.214.1

## 0.209.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings-react@0.216.0
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/trips@0.209.0
  - @voyant-travel/catalog-react@0.214.0
  - @voyant-travel/flights-react@0.216.0
  - @voyant-travel/relationships-react@0.216.0
  - @voyant-travel/flights@0.216.0

## 0.208.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/trips@0.208.0
  - @voyant-travel/bookings-react@0.215.0
  - @voyant-travel/catalog-react@0.213.0
  - @voyant-travel/flights-react@0.215.0
  - @voyant-travel/relationships-react@0.215.0
  - @voyant-travel/catalog@0.213.0
  - @voyant-travel/flights@0.215.0

## 0.207.0

### Patch Changes

- Updated dependencies [1c0eecc]
  - @voyant-travel/trips@0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/bookings-react@0.214.0
  - @voyant-travel/catalog-react@0.212.0
  - @voyant-travel/flights-react@0.214.0
  - @voyant-travel/relationships-react@0.214.0
  - @voyant-travel/catalog@0.212.0
  - @voyant-travel/finance@0.214.0
  - @voyant-travel/flights@0.214.0
  - @voyant-travel/trips@0.206.0

## 0.205.0

### Patch Changes

- Updated dependencies [f50ab57]
  - @voyant-travel/trips@0.205.0
  - @voyant-travel/bookings-react@0.213.0
  - @voyant-travel/catalog-react@0.211.0
  - @voyant-travel/flights-react@0.213.0
  - @voyant-travel/relationships-react@0.213.0
  - @voyant-travel/catalog@0.211.0
  - @voyant-travel/finance@0.213.0
  - @voyant-travel/flights@0.213.0

## 0.204.0

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/bookings-react@0.212.0
  - @voyant-travel/flights@0.212.0
  - @voyant-travel/trips@0.204.0
  - @voyant-travel/catalog-react@0.210.0
  - @voyant-travel/flights-react@0.212.0
  - @voyant-travel/relationships-react@0.212.0
  - @voyant-travel/finance@0.212.0

## 0.203.0

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/bookings-react@0.211.0
  - @voyant-travel/flights@0.211.0
  - @voyant-travel/trips@0.203.0
  - @voyant-travel/catalog-react@0.209.0
  - @voyant-travel/flights-react@0.211.0
  - @voyant-travel/relationships-react@0.211.0
  - @voyant-travel/finance@0.211.0

## 0.202.0

### Patch Changes

- @voyant-travel/bookings-react@0.210.0
- @voyant-travel/catalog-react@0.208.0
- @voyant-travel/flights-react@0.210.0
- @voyant-travel/relationships-react@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/flights@0.210.0
- @voyant-travel/trips@0.202.0

## 0.201.0

### Patch Changes

- @voyant-travel/bookings-react@0.209.0
- @voyant-travel/flights-react@0.209.0
- @voyant-travel/catalog-react@0.207.0
- @voyant-travel/relationships-react@0.209.0
- @voyant-travel/catalog@0.207.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/flights@0.209.0
- @voyant-travel/trips@0.201.0

## 0.200.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/bookings-react@0.208.0
  - @voyant-travel/catalog-react@0.206.0
  - @voyant-travel/flights-react@0.208.0
  - @voyant-travel/relationships-react@0.208.0
  - @voyant-travel/catalog@0.206.0
  - @voyant-travel/finance@0.208.0
  - @voyant-travel/flights@0.208.0
  - @voyant-travel/trips@0.200.0

## 0.199.2

### Patch Changes

- Updated dependencies [2cfce32]
  - @voyant-travel/catalog@0.205.2
  - @voyant-travel/trips@0.199.2
  - @voyant-travel/catalog-react@0.205.2

## 0.199.1

### Patch Changes

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/trips@0.199.1

## 0.199.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings-react@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/trips@0.199.0
  - @voyant-travel/catalog-react@0.205.0
  - @voyant-travel/flights-react@0.207.0
  - @voyant-travel/relationships-react@0.207.0
  - @voyant-travel/flights@0.207.0

## 0.198.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/trips@0.198.0
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings-react@0.206.0
  - @voyant-travel/catalog-react@0.204.0
  - @voyant-travel/flights-react@0.206.0
  - @voyant-travel/relationships-react@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/flights@0.206.0

## 0.197.0

### Patch Changes

- Updated dependencies [113edfc]
- Updated dependencies [58baffe]
  - @voyant-travel/flights@0.205.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/bookings-react@0.205.0
  - @voyant-travel/relationships-react@0.205.0
  - @voyant-travel/trips@0.197.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/flights-react@0.205.0
  - @voyant-travel/catalog-react@0.203.0

## 0.196.0

### Patch Changes

- @voyant-travel/bookings-react@0.204.0
- @voyant-travel/catalog-react@0.202.0
- @voyant-travel/flights-react@0.204.0
- @voyant-travel/relationships-react@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/flights@0.204.0
- @voyant-travel/trips@0.196.0

## 0.195.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/catalog-react@0.201.0
  - @voyant-travel/bookings-react@0.203.0
  - @voyant-travel/trips@0.195.0
  - @voyant-travel/flights@0.203.0
  - @voyant-travel/flights-react@0.203.0
  - @voyant-travel/relationships-react@0.203.0

## 0.194.0

### Patch Changes

- Updated dependencies [3201e48]
  - @voyant-travel/trips@0.194.0
  - @voyant-travel/bookings-react@0.202.0
  - @voyant-travel/catalog-react@0.200.0
  - @voyant-travel/flights-react@0.202.0
  - @voyant-travel/relationships-react@0.202.0
  - @voyant-travel/catalog@0.200.0
  - @voyant-travel/finance@0.202.0
  - @voyant-travel/flights@0.202.0

## 0.193.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/flights@0.201.1
  - @voyant-travel/trips@0.193.1
  - @voyant-travel/bookings-react@0.201.1
  - @voyant-travel/catalog-react@0.199.1
  - @voyant-travel/flights-react@0.201.1

## 0.193.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/bookings-react@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/flights@0.201.0
  - @voyant-travel/flights-react@0.201.0
  - @voyant-travel/trips@0.193.0
  - @voyant-travel/catalog-react@0.199.0
  - @voyant-travel/relationships-react@0.201.0

## 0.192.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/bookings-react@0.200.0
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/trips@0.192.0
  - @voyant-travel/flights@0.200.0
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/relationships-react@0.200.0
  - @voyant-travel/ui@0.109.6
  - @voyant-travel/catalog-react@0.198.0
  - @voyant-travel/flights-react@0.200.0

## 0.191.0

### Patch Changes

- Updated dependencies [c03ff60]
  - @voyant-travel/trips@0.191.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/flights@0.199.0
  - @voyant-travel/bookings-react@0.199.0
  - @voyant-travel/catalog-react@0.197.0
  - @voyant-travel/flights-react@0.199.0
  - @voyant-travel/relationships-react@0.199.0

## 0.190.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/bookings-react@0.198.1
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/catalog-react@0.196.1
  - @voyant-travel/flights-react@0.198.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/catalog@0.196.1
  - @voyant-travel/finance@0.198.1
  - @voyant-travel/flights@0.198.1
  - @voyant-travel/trips@0.190.1

## 0.190.0

### Patch Changes

- @voyant-travel/relationships-react@0.198.0
- @voyant-travel/bookings-react@0.198.0
- @voyant-travel/trips@0.190.0
- @voyant-travel/flights-react@0.198.0
- @voyant-travel/catalog-react@0.196.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/finance@0.198.0
- @voyant-travel/flights@0.198.0

## 0.189.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/trips@0.189.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/flights@0.197.0
  - @voyant-travel/bookings-react@0.197.0
  - @voyant-travel/relationships-react@0.197.0
  - @voyant-travel/catalog-react@0.195.0
  - @voyant-travel/flights-react@0.197.0

## 0.188.0

### Patch Changes

- Updated dependencies [0190317]
- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/trips@0.188.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/flights@0.196.0
  - @voyant-travel/bookings-react@0.196.0
  - @voyant-travel/relationships-react@0.196.0
  - @voyant-travel/flights-react@0.196.0
  - @voyant-travel/catalog-react@0.194.0

## 0.187.0

### Patch Changes

- @voyant-travel/bookings-react@0.195.0
- @voyant-travel/catalog@0.193.0
- @voyant-travel/finance@0.195.0
- @voyant-travel/trips@0.187.0
- @voyant-travel/catalog-react@0.193.0
- @voyant-travel/flights-react@0.195.0
- @voyant-travel/relationships-react@0.195.0
- @voyant-travel/flights@0.195.0

## 0.186.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/bookings-react@0.194.0
  - @voyant-travel/flights@0.194.0
  - @voyant-travel/trips@0.186.0
  - @voyant-travel/catalog-react@0.192.0
  - @voyant-travel/flights-react@0.194.0
  - @voyant-travel/relationships-react@0.194.0
  - @voyant-travel/finance@0.194.0

## 0.185.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/bookings-react@0.193.0
  - @voyant-travel/trips@0.185.0
  - @voyant-travel/catalog-react@0.191.0
  - @voyant-travel/flights-react@0.193.0
  - @voyant-travel/relationships-react@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/flights@0.193.0

## 0.184.1

### Patch Changes

- @voyant-travel/catalog@0.190.1
- @voyant-travel/finance@0.192.1
- @voyant-travel/flights@0.192.1
- @voyant-travel/trips@0.184.1
- @voyant-travel/bookings-react@0.192.1
- @voyant-travel/catalog-react@0.190.1
- @voyant-travel/flights-react@0.192.1

## 0.184.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/trips@0.184.0
  - @voyant-travel/bookings-react@0.192.0
  - @voyant-travel/catalog-react@0.190.0
  - @voyant-travel/flights-react@0.192.0
  - @voyant-travel/relationships-react@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/flights@0.192.0

## 0.183.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/bookings-react@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/flights@0.191.0
  - @voyant-travel/flights-react@0.191.0
  - @voyant-travel/trips@0.183.0
  - @voyant-travel/catalog-react@0.189.0
  - @voyant-travel/relationships-react@0.191.0

## 0.182.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f2c9404]
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/bookings-react@0.190.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/trips@0.182.0
  - @voyant-travel/flights@0.190.0
  - @voyant-travel/catalog-react@0.188.0
  - @voyant-travel/flights-react@0.190.0
  - @voyant-travel/relationships-react@0.190.0

## 0.181.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/bookings-react@0.189.0
  - @voyant-travel/flights@0.189.0
  - @voyant-travel/trips@0.181.0
  - @voyant-travel/catalog-react@0.187.0
  - @voyant-travel/flights-react@0.189.0
  - @voyant-travel/relationships-react@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.180.0

### Patch Changes

- @voyant-travel/catalog@0.186.0
- @voyant-travel/finance@0.188.0
- @voyant-travel/flights@0.188.0
- @voyant-travel/trips@0.180.0
- @voyant-travel/relationships-react@0.188.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/bookings-react@0.188.0
- @voyant-travel/catalog-react@0.186.0
- @voyant-travel/flights-react@0.188.0

## 0.179.1

### Patch Changes

- Updated dependencies [c2a9f4f]
  - @voyant-travel/trips@0.179.1

## 0.179.0

### Patch Changes

- @voyant-travel/bookings-react@0.187.0
- @voyant-travel/catalog-react@0.185.0
- @voyant-travel/flights-react@0.187.0
- @voyant-travel/relationships-react@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/flights@0.187.0
- @voyant-travel/trips@0.179.0

## 0.178.1

### Patch Changes

- Updated dependencies [5c912fb]
  - @voyant-travel/trips@0.178.1

## 0.178.0

### Patch Changes

- Updated dependencies [b27847f]
  - @voyant-travel/trips@0.178.0

## 0.177.0

### Patch Changes

- @voyant-travel/bookings-react@0.186.0
- @voyant-travel/catalog-react@0.184.0
- @voyant-travel/flights-react@0.186.0
- @voyant-travel/relationships-react@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/flights@0.186.0
- @voyant-travel/trips@0.177.0

## 0.176.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/trips@0.176.0
  - @voyant-travel/bookings-react@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/flights@0.185.0
  - @voyant-travel/flights-react@0.185.0
  - @voyant-travel/catalog-react@0.183.0
  - @voyant-travel/relationships-react@0.185.0

## 0.175.0

### Patch Changes

- @voyant-travel/bookings-react@0.184.0
- @voyant-travel/catalog-react@0.182.0
- @voyant-travel/flights-react@0.184.0
- @voyant-travel/relationships-react@0.184.0
- @voyant-travel/catalog@0.182.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/flights@0.184.0
- @voyant-travel/trips@0.175.0

## 0.174.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/trips@0.174.0
- @voyant-travel/bookings-react@0.183.0
- @voyant-travel/catalog-react@0.181.0
- @voyant-travel/flights-react@0.183.0
- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/flights@0.183.0

## 0.173.3

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/bookings-react@0.182.2
  - @voyant-travel/catalog-react@0.180.2
  - @voyant-travel/flights-react@0.182.2
  - @voyant-travel/relationships-react@0.182.1
  - @voyant-travel/catalog@0.180.2
  - @voyant-travel/finance@0.182.4
  - @voyant-travel/flights@0.182.2
  - @voyant-travel/trips@0.173.3

## 0.173.2

### Patch Changes

- @voyant-travel/catalog@0.180.1
- @voyant-travel/finance@0.182.3
- @voyant-travel/flights@0.182.1
- @voyant-travel/trips@0.173.2
- @voyant-travel/bookings-react@0.182.1
- @voyant-travel/catalog-react@0.180.1
- @voyant-travel/flights-react@0.182.1

## 0.173.1

### Patch Changes

- @voyant-travel/finance@0.182.2
- @voyant-travel/trips@0.173.1

## 0.173.0

### Patch Changes

- @voyant-travel/bookings-react@0.182.0
- @voyant-travel/catalog-react@0.180.0
- @voyant-travel/flights-react@0.182.0
- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/flights@0.182.0
- @voyant-travel/trips@0.173.0

## 0.172.1

### Patch Changes

- @voyant-travel/trips@0.172.1

## 0.172.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/trips@0.172.0
  - @voyant-travel/bookings-react@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/flights@0.181.0
  - @voyant-travel/flights-react@0.181.0
  - @voyant-travel/catalog-react@0.179.0
  - @voyant-travel/relationships-react@0.181.0

## 0.171.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/trips@0.171.1
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/bookings-react@0.180.1
  - @voyant-travel/catalog-react@0.178.1
  - @voyant-travel/flights-react@0.180.1
  - @voyant-travel/relationships-react@0.180.1
  - @voyant-travel/catalog@0.178.1
  - @voyant-travel/flights@0.180.1

## 0.171.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/trips@0.171.0
  - @voyant-travel/bookings-react@0.180.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/catalog-react@0.178.0
  - @voyant-travel/flights-react@0.180.0
  - @voyant-travel/relationships-react@0.180.0
  - @voyant-travel/catalog@0.178.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/flights@0.180.0

## 0.170.0

### Patch Changes

- @voyant-travel/bookings-react@0.179.0
- @voyant-travel/catalog-react@0.177.0
- @voyant-travel/flights-react@0.179.0
- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/flights@0.179.0
- @voyant-travel/trips@0.170.0

## 0.169.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/bookings-react@0.178.0
  - @voyant-travel/catalog-react@0.176.0
  - @voyant-travel/flights-react@0.178.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/catalog@0.176.0
  - @voyant-travel/finance@0.178.0
  - @voyant-travel/flights@0.178.0
  - @voyant-travel/trips@0.169.0

## 0.168.0

### Patch Changes

- @voyant-travel/catalog@0.175.0
- @voyant-travel/finance@0.177.0
- @voyant-travel/flights@0.177.0
- @voyant-travel/trips@0.168.0
- @voyant-travel/bookings-react@0.177.0
- @voyant-travel/catalog-react@0.175.0
- @voyant-travel/flights-react@0.177.0
- @voyant-travel/relationships-react@0.177.0

## 0.167.0

### Patch Changes

- @voyant-travel/catalog@0.174.0
- @voyant-travel/finance@0.176.0
- @voyant-travel/flights@0.176.0
- @voyant-travel/trips@0.167.0
- @voyant-travel/bookings-react@0.176.0
- @voyant-travel/catalog-react@0.174.0
- @voyant-travel/flights-react@0.176.0
- @voyant-travel/relationships-react@0.176.0

## 0.166.0

### Patch Changes

- @voyant-travel/bookings-react@0.175.0
- @voyant-travel/catalog@0.173.0
- @voyant-travel/finance@0.175.0
- @voyant-travel/trips@0.166.0
- @voyant-travel/flights@0.175.0
- @voyant-travel/catalog-react@0.173.0
- @voyant-travel/flights-react@0.175.0
- @voyant-travel/relationships-react@0.175.0

## 0.165.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/flights@0.174.0
  - @voyant-travel/trips@0.165.0
  - @voyant-travel/bookings-react@0.174.0
  - @voyant-travel/flights-react@0.174.0
  - @voyant-travel/catalog-react@0.172.0
  - @voyant-travel/relationships-react@0.174.0

## 0.164.0

### Patch Changes

- @voyant-travel/bookings-react@0.173.0
- @voyant-travel/catalog-react@0.171.0
- @voyant-travel/flights-react@0.173.0
- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/flights@0.173.0
- @voyant-travel/trips@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/bookings-react@0.172.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/trips@0.163.0
  - @voyant-travel/flights@0.172.0
  - @voyant-travel/flights-react@0.172.0
  - @voyant-travel/relationships-react@0.172.0
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/catalog-react@0.170.0

## 0.162.1

### Patch Changes

- @voyant-travel/catalog@0.169.1
- @voyant-travel/finance@0.171.1
- @voyant-travel/flights@0.171.1
- @voyant-travel/trips@0.162.1
- @voyant-travel/bookings-react@0.171.1
- @voyant-travel/catalog-react@0.169.1
- @voyant-travel/flights-react@0.171.1

## 0.162.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/bookings-react@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/flights@0.171.0
  - @voyant-travel/flights-react@0.171.0
  - @voyant-travel/trips@0.162.0
  - @voyant-travel/catalog-react@0.169.0
  - @voyant-travel/relationships-react@0.171.0

## 0.161.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/flights@0.170.0
  - @voyant-travel/trips@0.161.0
  - @voyant-travel/bookings-react@0.170.0
  - @voyant-travel/catalog-react@0.168.0
  - @voyant-travel/flights-react@0.170.0
  - @voyant-travel/relationships-react@0.170.0

## 0.160.1

### Patch Changes

- @voyant-travel/catalog@0.167.1
- @voyant-travel/finance@0.169.2
- @voyant-travel/flights@0.169.1
- @voyant-travel/trips@0.160.1
- @voyant-travel/bookings-react@0.169.1
- @voyant-travel/catalog-react@0.167.1
- @voyant-travel/flights-react@0.169.1

## 0.160.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/bookings-react@0.169.0
  - @voyant-travel/catalog-react@0.167.0
  - @voyant-travel/flights-react@0.169.0
  - @voyant-travel/relationships-react@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/flights@0.169.0
  - @voyant-travel/trips@0.160.0

## 0.159.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/bookings-react@0.168.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/flights@0.168.0
  - @voyant-travel/flights-react@0.168.0
  - @voyant-travel/trips@0.159.0
  - @voyant-travel/catalog-react@0.166.0
  - @voyant-travel/relationships-react@0.168.0

## 0.158.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/trips@0.158.0
  - @voyant-travel/bookings-react@0.167.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/flights@0.167.0
  - @voyant-travel/flights-react@0.167.0
  - @voyant-travel/catalog-react@0.165.0
  - @voyant-travel/relationships-react@0.167.0

## 0.157.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/flights@0.166.0
  - @voyant-travel/flights-react@0.166.0
  - @voyant-travel/trips@0.157.0
  - @voyant-travel/bookings-react@0.166.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/catalog-react@0.164.0
  - @voyant-travel/relationships-react@0.166.0

## 0.156.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/bookings-react@0.165.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/flights@0.165.0
  - @voyant-travel/flights-react@0.165.0
  - @voyant-travel/trips@0.156.0
  - @voyant-travel/catalog-react@0.163.0
  - @voyant-travel/relationships-react@0.165.0

## 0.155.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/bookings-react@0.164.0
  - @voyant-travel/flights@0.164.0
  - @voyant-travel/trips@0.155.0
  - @voyant-travel/catalog-react@0.162.0
  - @voyant-travel/flights-react@0.164.0
  - @voyant-travel/relationships-react@0.164.0
  - @voyant-travel/finance@0.164.0

## 0.154.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/bookings-react@0.163.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/trips@0.154.0
  - @voyant-travel/flights@0.163.0
  - @voyant-travel/flights-react@0.163.0
  - @voyant-travel/catalog-react@0.161.0

## 0.153.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/flights@0.162.0
  - @voyant-travel/trips@0.153.0
  - @voyant-travel/bookings-react@0.162.0
  - @voyant-travel/flights-react@0.162.0
  - @voyant-travel/relationships-react@0.162.0
  - @voyant-travel/catalog-react@0.160.0

## 0.152.0

### Patch Changes

- Updated dependencies [c1e37f2]
- Updated dependencies [85bfe2c]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/bookings-react@0.161.0
  - @voyant-travel/catalog-react@0.159.0
  - @voyant-travel/flights-react@0.161.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/flights@0.161.0
  - @voyant-travel/trips@0.152.0

## 0.151.0

### Patch Changes

- Updated dependencies [701ccc4]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [0079873]
- Updated dependencies [497dff2]
- Updated dependencies [db5adce]
- Updated dependencies [6604f9e]
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/flights@0.160.0
  - @voyant-travel/trips@0.151.0
  - @voyant-travel/bookings-react@0.160.0
  - @voyant-travel/flights-react@0.160.0
  - @voyant-travel/relationships-react@0.160.0
  - @voyant-travel/catalog-react@0.158.0

## 0.150.0

### Patch Changes

- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [b459761]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/flights@0.159.0
  - @voyant-travel/trips@0.150.0
  - @voyant-travel/bookings-react@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/catalog-react@0.157.0
  - @voyant-travel/flights-react@0.159.0
  - @voyant-travel/relationships-react@0.159.0

## 0.149.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/bookings-react@0.158.0
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/catalog-react@0.156.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/flights@0.158.0
  - @voyant-travel/flights-react@0.158.0
  - @voyant-travel/relationships-react@0.158.0
  - @voyant-travel/trips@0.149.0

## 0.148.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/catalog-react@0.155.0
  - @voyant-travel/bookings-react@0.157.0
  - @voyant-travel/flights@0.157.0
  - @voyant-travel/trips@0.148.0
  - @voyant-travel/flights-react@0.157.0
  - @voyant-travel/relationships-react@0.157.0
  - @voyant-travel/finance@0.157.0

## 0.147.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/bookings-react@0.156.1
  - @voyant-travel/catalog-react@0.154.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/flights@0.156.1
  - @voyant-travel/flights-react@0.156.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/trips@0.147.1
  - @voyant-travel/ui@0.109.1

## 0.147.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings-react@0.156.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/flights@0.156.0
  - @voyant-travel/flights-react@0.156.0
  - @voyant-travel/trips@0.147.0
  - @voyant-travel/catalog-react@0.154.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/relationships-react@0.156.0

## 0.146.1

### Patch Changes

- Updated dependencies [cc85042]
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/flights@0.155.1
  - @voyant-travel/trips@0.146.1
  - @voyant-travel/bookings-react@0.155.1
  - @voyant-travel/catalog-react@0.153.1
  - @voyant-travel/flights-react@0.155.1

## 0.146.0

### Patch Changes

- @voyant-travel/catalog@0.153.0
- @voyant-travel/finance@0.155.0
- @voyant-travel/flights@0.155.0
- @voyant-travel/trips@0.146.0
- @voyant-travel/bookings-react@0.155.0
- @voyant-travel/catalog-react@0.153.0
- @voyant-travel/flights-react@0.155.0
- @voyant-travel/relationships-react@0.155.0

## 0.145.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/flights@0.154.0
  - @voyant-travel/trips@0.145.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/bookings-react@0.154.0
  - @voyant-travel/relationships-react@0.154.0
  - @voyant-travel/catalog-react@0.152.0
  - @voyant-travel/flights-react@0.154.0

## 0.144.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/flights@0.153.0
  - @voyant-travel/trips@0.144.0
  - @voyant-travel/bookings-react@0.153.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/flights-react@0.153.0
  - @voyant-travel/relationships-react@0.153.0
  - @voyant-travel/catalog-react@0.151.0

## 0.143.0

### Patch Changes

- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [d771be3]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [0a7eab6]
- Updated dependencies [d771be3]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/flights@0.152.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/trips@0.143.0
  - @voyant-travel/flights-react@0.152.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/bookings-react@0.152.0
  - @voyant-travel/catalog-react@0.150.0

## 0.142.4

### Patch Changes

- Updated dependencies [1081483]
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/flights@0.151.4
  - @voyant-travel/trips@0.142.4
  - @voyant-travel/bookings-react@0.151.5
  - @voyant-travel/catalog-react@0.149.4
  - @voyant-travel/flights-react@0.151.4

## 0.142.3

### Patch Changes

- @voyant-travel/catalog@0.149.3
- @voyant-travel/finance@0.151.3
- @voyant-travel/flights@0.151.3
- @voyant-travel/trips@0.142.3
- @voyant-travel/bookings-react@0.151.4
- @voyant-travel/catalog-react@0.149.3
- @voyant-travel/flights-react@0.151.3

## 0.142.2

### Patch Changes

- @voyant-travel/catalog@0.149.2
- @voyant-travel/finance@0.151.2
- @voyant-travel/flights@0.151.2
- @voyant-travel/trips@0.142.2
- @voyant-travel/bookings-react@0.151.3
- @voyant-travel/catalog-react@0.149.2
- @voyant-travel/flights-react@0.151.2

## 0.142.1

### Patch Changes

- Updated dependencies [e4e6621]
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/flights@0.151.1
  - @voyant-travel/trips@0.142.1
  - @voyant-travel/bookings-react@0.151.1
  - @voyant-travel/catalog-react@0.149.1
  - @voyant-travel/flights-react@0.151.1

## 0.142.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/flights@0.151.0
  - @voyant-travel/trips@0.142.0
  - @voyant-travel/flights-react@0.151.0
  - @voyant-travel/bookings-react@0.151.0
  - @voyant-travel/relationships-react@0.151.0
  - @voyant-travel/catalog-react@0.149.0

## 0.141.0

### Patch Changes

- @voyant-travel/bookings-react@0.150.0
- @voyant-travel/finance@0.150.0
- @voyant-travel/trips@0.141.0
- @voyant-travel/catalog@0.148.0
- @voyant-travel/catalog-react@0.148.0
- @voyant-travel/flights-react@0.150.0
- @voyant-travel/relationships-react@0.150.0
- @voyant-travel/flights@0.150.0

## 0.140.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/flights@0.149.1
  - @voyant-travel/trips@0.140.1
  - @voyant-travel/bookings-react@0.149.1
  - @voyant-travel/catalog-react@0.147.1
  - @voyant-travel/flights-react@0.149.1

## 0.140.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/bookings-react@0.149.0
  - @voyant-travel/catalog-react@0.147.0
  - @voyant-travel/flights-react@0.149.0
  - @voyant-travel/relationships-react@0.149.0
  - @voyant-travel/catalog@0.147.0
  - @voyant-travel/finance@0.149.0
  - @voyant-travel/flights@0.149.0
  - @voyant-travel/trips@0.140.0

## 0.139.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/bookings-react@0.148.0
  - @voyant-travel/catalog-react@0.146.0
  - @voyant-travel/flights-react@0.148.0
  - @voyant-travel/relationships-react@0.148.0
  - @voyant-travel/catalog@0.146.0
  - @voyant-travel/finance@0.148.0
  - @voyant-travel/flights@0.148.0
  - @voyant-travel/trips@0.139.0

## 0.138.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/bookings-react@0.147.0
- @voyant-travel/catalog-react@0.145.0
- @voyant-travel/flights-react@0.147.0
- @voyant-travel/relationships-react@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/flights@0.147.0
- @voyant-travel/trips@0.138.0

## 0.137.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/bookings-react@0.146.0
  - @voyant-travel/catalog-react@0.144.0
  - @voyant-travel/flights-react@0.146.0
  - @voyant-travel/relationships-react@0.146.0
  - @voyant-travel/catalog@0.144.0
  - @voyant-travel/finance@0.146.0
  - @voyant-travel/flights@0.146.0
  - @voyant-travel/trips@0.137.0

## 0.136.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/flights@0.145.0
  - @voyant-travel/trips@0.136.0
  - @voyant-travel/bookings-react@0.145.0
  - @voyant-travel/catalog-react@0.143.0
  - @voyant-travel/flights-react@0.145.0
  - @voyant-travel/relationships-react@0.145.0
  - @voyant-travel/finance@0.145.0

## 0.135.0

### Patch Changes

- @voyant-travel/bookings-react@0.144.0
- @voyant-travel/finance@0.144.0
- @voyant-travel/trips@0.135.0
- @voyant-travel/catalog-react@0.142.0
- @voyant-travel/flights-react@0.144.0
- @voyant-travel/relationships-react@0.144.0
- @voyant-travel/catalog@0.142.0
- @voyant-travel/flights@0.144.0

## 0.134.0

### Patch Changes

- @voyant-travel/finance@0.143.0
- @voyant-travel/relationships-react@0.143.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/catalog@0.141.0
- @voyant-travel/flights@0.143.0
- @voyant-travel/trips@0.134.0
- @voyant-travel/bookings-react@0.143.0
- @voyant-travel/catalog-react@0.141.0
- @voyant-travel/flights-react@0.143.0

## 0.133.0

### Patch Changes

- Updated dependencies [5028f42]
  - @voyant-travel/flights@0.142.0
  - @voyant-travel/bookings-react@0.142.0
  - @voyant-travel/catalog-react@0.140.0
  - @voyant-travel/flights-react@0.142.0
  - @voyant-travel/relationships-react@0.142.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/finance@0.142.0
  - @voyant-travel/trips@0.133.0

## 0.132.1

### Patch Changes

- Updated dependencies [1ab266f]
  - @voyant-travel/trips@0.132.1

## 0.132.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/catalog-react@0.139.0
  - @voyant-travel/flights@0.141.0
  - @voyant-travel/trips@0.132.0
  - @voyant-travel/bookings-react@0.141.0
  - @voyant-travel/flights-react@0.141.0
  - @voyant-travel/relationships-react@0.141.0
  - @voyant-travel/finance@0.141.0

## 0.131.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/flights-react@0.140.0
  - @voyant-travel/flights@0.140.0
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/trips@0.131.0
  - @voyant-travel/bookings-react@0.140.0
  - @voyant-travel/catalog-react@0.138.0
  - @voyant-travel/relationships-react@0.140.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/finance@0.140.0

## 0.130.0

### Patch Changes

- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [2613dfb]
- Updated dependencies [22f0457]
- Updated dependencies [ca14f6f]
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/trips@0.130.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/bookings-react@0.139.0
  - @voyant-travel/flights@0.139.0
  - @voyant-travel/flights-react@0.139.0
  - @voyant-travel/catalog-react@0.137.0

## 0.129.2

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/flights@0.138.2
  - @voyant-travel/trips@0.129.2
  - @voyant-travel/bookings-react@0.138.6
  - @voyant-travel/catalog-react@0.136.3
  - @voyant-travel/flights-react@0.138.2

## 0.129.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/bookings-react@0.138.5
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/flights@0.138.1
  - @voyant-travel/trips@0.129.1
  - @voyant-travel/catalog-react@0.136.2
  - @voyant-travel/flights-react@0.138.1

## 0.129.0

### Patch Changes

- @voyant-travel/bookings-react@0.138.0
- @voyant-travel/catalog-react@0.136.0
- @voyant-travel/flights-react@0.138.0
- @voyant-travel/relationships-react@0.138.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/flights@0.138.0
- @voyant-travel/trips@0.129.0

## 0.128.5

### Patch Changes

- b1f90b0: Block trip component mutations after checkout has started and surface the locked state in the admin composer.
- 49ffcd9: Return setup-specific 503 responses when the configured flight demo service is unavailable, and show that message in Trips flight search.
- 37e9543: Require accommodation trip components to carry a valid check-in/check-out date range before add, price, or reserve.
- c1d8f71: Return failed trip reservations as conflict responses, hide internal SQL details from reservation failures, and persist the admin draft-booking toggle before reserve.
- Updated dependencies [f37a3f1]
- Updated dependencies [b1f90b0]
- Updated dependencies [49ffcd9]
- Updated dependencies [37e9543]
- Updated dependencies [c1d8f71]
  - @voyant-travel/ui@0.108.7
  - @voyant-travel/trips@0.128.5
  - @voyant-travel/i18n@0.109.3
  - @voyant-travel/flights@0.137.3
  - @voyant-travel/flights-react@0.137.3

## 0.128.4

### Patch Changes

- f3fd455: Keep the Trips Cruise embarkation field on the same shared accessible date picker path as Flight, and ensure shared calendar days expose named button controls for assistive tooling.
- a96ce05: Recompute Trips reserve validation when component payment schedule mode changes and show payment schedule validation reasons before reserve.
- 9f1feaa: Render Trips total amount filters as unbounded decimal text inputs so assistive technology no longer reports a false maximum value.
- Updated dependencies [776bafd]
- Updated dependencies [f3fd455]
- Updated dependencies [a96ce05]
  - @voyant-travel/trips@0.128.4
  - @voyant-travel/ui@0.108.6
  - @voyant-travel/i18n@0.109.2

## 0.128.3

### Patch Changes

- c6acfa5: Exclude cancelled and removed trip components from active trip aggregate totals, refresh those totals after component cancellation, and label active versus cancelled component value in the admin trip detail.
- Updated dependencies [c6acfa5]
  - @voyant-travel/trips@0.128.3
  - @voyant-travel/i18n@0.109.1

## 0.128.2

### Patch Changes

- Updated dependencies [54041a9]
  - @voyant-travel/trips@0.128.2

## 0.128.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/bookings-react@0.137.1
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/flights@0.137.1
  - @voyant-travel/trips@0.128.1
  - @voyant-travel/catalog-react@0.135.1
  - @voyant-travel/flights-react@0.137.1

## 0.128.0

### Patch Changes

- @voyant-travel/catalog@0.135.0
- @voyant-travel/finance@0.137.0
- @voyant-travel/flights@0.137.0
- @voyant-travel/trips@0.128.0
- @voyant-travel/bookings-react@0.137.0
- @voyant-travel/catalog-react@0.135.0
- @voyant-travel/flights-react@0.137.0
- @voyant-travel/relationships-react@0.137.0

## 0.127.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/bookings-react@0.136.1
  - @voyant-travel/catalog-react@0.134.1
  - @voyant-travel/flights-react@0.136.1
  - @voyant-travel/relationships-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/catalog@0.134.1
  - @voyant-travel/finance@0.136.1
  - @voyant-travel/flights@0.136.1
  - @voyant-travel/trips@0.127.1

## 0.127.0

### Patch Changes

- @voyant-travel/bookings-react@0.136.0
- @voyant-travel/flights-react@0.136.0
- @voyant-travel/catalog-react@0.134.0
- @voyant-travel/relationships-react@0.136.0
- @voyant-travel/catalog@0.134.0
- @voyant-travel/finance@0.136.0
- @voyant-travel/flights@0.136.0
- @voyant-travel/trips@0.127.0

## 0.126.0

### Patch Changes

- @voyant-travel/bookings-react@0.135.0
- @voyant-travel/flights-react@0.135.0
- @voyant-travel/catalog-react@0.133.0
- @voyant-travel/relationships-react@0.135.0
- @voyant-travel/catalog@0.133.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/flights@0.135.0
- @voyant-travel/trips@0.126.0

## 0.125.1

### Patch Changes

- @voyant-travel/catalog@0.132.1
- @voyant-travel/finance@0.134.1
- @voyant-travel/flights@0.134.1
- @voyant-travel/trips@0.125.1
- @voyant-travel/bookings-react@0.134.1
- @voyant-travel/catalog-react@0.132.1
- @voyant-travel/flights-react@0.134.1

## 0.125.0

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/bookings-react@0.134.0
  - @voyant-travel/relationships-react@0.134.0
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/flights@0.134.0
  - @voyant-travel/trips@0.125.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/flights-react@0.134.0
  - @voyant-travel/catalog-react@0.132.0

## 0.124.0

### Patch Changes

- Updated dependencies [4abf9a2]
- Updated dependencies [b68d6a7]
- Updated dependencies [bba70ee]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/trips@0.124.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/flights@0.133.0
  - @voyant-travel/bookings-react@0.133.0
  - @voyant-travel/catalog-react@0.131.0
  - @voyant-travel/flights-react@0.133.0
  - @voyant-travel/relationships-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.123.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/flights@0.132.0
  - @voyant-travel/bookings-react@0.132.0
  - @voyant-travel/catalog-react@0.130.0
  - @voyant-travel/trips@0.123.0
  - @voyant-travel/flights-react@0.132.0
  - @voyant-travel/relationships-react@0.132.0
  - @voyant-travel/finance@0.132.0

## 0.122.1

### Patch Changes

- @voyant-travel/catalog@0.129.1
- @voyant-travel/finance@0.131.2
- @voyant-travel/flights@0.131.1
- @voyant-travel/trips@0.122.1
- @voyant-travel/bookings-react@0.131.1
- @voyant-travel/catalog-react@0.129.1
- @voyant-travel/flights-react@0.131.1

## 0.122.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/bookings-react@0.131.0
  - @voyant-travel/flights-react@0.131.0
  - @voyant-travel/catalog-react@0.129.0
  - @voyant-travel/relationships-react@0.131.0
  - @voyant-travel/catalog@0.129.0
  - @voyant-travel/finance@0.131.0
  - @voyant-travel/flights@0.131.0
  - @voyant-travel/trips@0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/bookings-react@0.130.0
  - @voyant-travel/flights-react@0.130.0
  - @voyant-travel/catalog-react@0.128.0
  - @voyant-travel/relationships-react@0.130.0
  - @voyant-travel/catalog@0.128.0
  - @voyant-travel/finance@0.130.0
  - @voyant-travel/flights@0.130.0
  - @voyant-travel/trips@0.121.0

## 0.120.1

### Patch Changes

- Updated dependencies [c5416cb]
  - @voyant-travel/trips@0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/flights@0.129.0
  - @voyant-travel/trips@0.120.0
  - @voyant-travel/catalog-react@0.127.0
  - @voyant-travel/flights-react@0.129.0
  - @voyant-travel/bookings-react@0.129.0
  - @voyant-travel/relationships-react@0.129.0
  - @voyant-travel/finance@0.129.0

## 0.119.0

### Patch Changes

- @voyant-travel/bookings-react@0.128.0
- @voyant-travel/catalog-react@0.126.0
- @voyant-travel/flights-react@0.128.0
- @voyant-travel/relationships-react@0.128.0
- @voyant-travel/catalog@0.126.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/flights@0.128.0
- @voyant-travel/trips@0.119.0

## 0.118.0

### Patch Changes

- Updated dependencies [c143531]
  - @voyant-travel/flights@0.127.0
  - @voyant-travel/bookings-react@0.127.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/trips@0.118.0
  - @voyant-travel/flights-react@0.127.0
  - @voyant-travel/catalog-react@0.125.0
  - @voyant-travel/relationships-react@0.127.0
  - @voyant-travel/catalog@0.125.0

## 0.117.1

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/trips@0.117.1
  - @voyant-travel/catalog-react@0.124.1

## 0.117.0

### Patch Changes

- @voyant-travel/bookings-react@0.126.0
- @voyant-travel/catalog-react@0.124.0
- @voyant-travel/flights-react@0.126.0
- @voyant-travel/relationships-react@0.126.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/finance@0.126.0
- @voyant-travel/flights@0.126.0
- @voyant-travel/trips@0.117.0

## 0.116.1

### Patch Changes

- Updated dependencies [e89640b]
  - @voyant-travel/trips@0.116.1

## 0.116.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/bookings-react@0.125.0
  - @voyant-travel/catalog-react@0.123.0
  - @voyant-travel/flights-react@0.125.0
  - @voyant-travel/relationships-react@0.125.0
  - @voyant-travel/catalog@0.123.0
  - @voyant-travel/finance@0.125.0
  - @voyant-travel/flights@0.125.0
  - @voyant-travel/trips@0.116.0

## 0.115.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/catalog-react@0.122.0
  - @voyant-travel/flights-react@0.124.0
  - @voyant-travel/bookings-react@0.124.0
  - @voyant-travel/relationships-react@0.124.0
  - @voyant-travel/catalog@0.122.0
  - @voyant-travel/finance@0.124.0
  - @voyant-travel/flights@0.124.0
  - @voyant-travel/trips@0.115.0

## 0.114.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [e9d9dbb]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/bookings-react@0.123.0
  - @voyant-travel/catalog-react@0.121.0
  - @voyant-travel/flights-react@0.123.0
  - @voyant-travel/relationships-react@0.123.0
  - @voyant-travel/trips@0.114.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/flights@0.123.0

## 0.113.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [14f4234]
- Updated dependencies [51dd276]
- Updated dependencies [bf2e822]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/flights@0.122.0
  - @voyant-travel/trips@0.113.0
  - @voyant-travel/flights-react@0.122.0
  - @voyant-travel/bookings-react@0.122.0
  - @voyant-travel/catalog-react@0.120.0
  - @voyant-travel/relationships-react@0.122.0
  - @voyant-travel/catalog@0.120.0

## 0.112.0

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [d44c0ae]
- Updated dependencies [13fe70b]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/flights@0.121.0
  - @voyant-travel/trips@0.112.0
  - @voyant-travel/flights-react@0.121.0
  - @voyant-travel/bookings-react@0.121.0
  - @voyant-travel/catalog-react@0.119.0
  - @voyant-travel/relationships-react@0.121.0

## 0.111.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/bookings-react@0.120.1
  - @voyant-travel/catalog-react@0.118.1
  - @voyant-travel/flights-react@0.120.1
  - @voyant-travel/relationships-react@0.120.1
  - @voyant-travel/catalog@0.118.1
  - @voyant-travel/finance@0.120.1
  - @voyant-travel/flights@0.120.1
  - @voyant-travel/trips@0.111.1

## 0.111.0

### Minor Changes

- f374a58: Rename the Travel Composer runtime and React packages to Trips, including package names, route prefixes, admin extension ids, operator manifests, and template imports.

### Patch Changes

- Updated dependencies [dd71543]
- Updated dependencies [c9ec9f8]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [47fef18]
- Updated dependencies [f374a58]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/trips@0.111.0
  - @voyant-travel/bookings-react@0.120.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/catalog-react@0.118.0
  - @voyant-travel/flights-react@0.120.0
  - @voyant-travel/flights@0.120.0
  - @voyant-travel/relationships-react@0.120.0

## 0.110.2

### Patch Changes

- 81ab5a7: Split oversized travel composer admin page, panel, and detail host surfaces into focused internal modules while preserving the existing admin exports and behavior.
  - @voyant-travel/finance@0.119.4
  - @voyant-travel/travel-composer@0.110.2

## 0.110.1

### Patch Changes

- @voyant-travel/catalog@0.117.1
- @voyant-travel/finance@0.119.1
- @voyant-travel/flights@0.119.1
- @voyant-travel/travel-composer@0.110.1
- @voyant-travel/bookings-react@0.119.1
- @voyant-travel/catalog-react@0.117.1
- @voyant-travel/crm-react@0.119.1
- @voyant-travel/flights-react@0.119.1

## 0.110.0

### Patch Changes

- @voyant-travel/catalog@0.117.0
- @voyant-travel/finance@0.119.0
- @voyant-travel/travel-composer@0.110.0
- @voyant-travel/crm-react@0.119.0
- @voyant-travel/ui@0.106.1
- @voyant-travel/bookings-react@0.119.0
- @voyant-travel/catalog-react@0.117.0
- @voyant-travel/flights-react@0.119.0
- @voyant-travel/flights@0.119.0

## 0.109.0

### Patch Changes

- @voyant-travel/finance@0.118.0
- @voyant-travel/bookings-react@0.118.0
- @voyant-travel/catalog-react@0.116.0
- @voyant-travel/flights-react@0.118.0
- @voyant-travel/crm-react@0.118.0
- @voyant-travel/catalog@0.116.0
- @voyant-travel/flights@0.118.0
- @voyant-travel/travel-composer@0.109.0

## 0.108.1

### Patch Changes

- Updated dependencies [b7056f1]
  - @voyant-travel/finance@0.117.1
  - @voyant-travel/catalog@0.115.1
  - @voyant-travel/travel-composer@0.108.1
  - @voyant-travel/flights@0.117.1
  - @voyant-travel/bookings-react@0.117.1
  - @voyant-travel/catalog-react@0.115.1
  - @voyant-travel/crm-react@0.117.1
  - @voyant-travel/flights-react@0.117.1

## 0.108.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/finance@0.117.0
  - @voyant-travel/flights@0.117.0
  - @voyant-travel/travel-composer@0.108.0
  - @voyant-travel/bookings-react@0.117.0
  - @voyant-travel/catalog-react@0.115.0
  - @voyant-travel/crm-react@0.117.0
  - @voyant-travel/flights-react@0.117.0

## 0.107.0

### Patch Changes

- @voyant-travel/catalog@0.114.0
- @voyant-travel/finance@0.116.0
- @voyant-travel/travel-composer@0.107.0
- @voyant-travel/flights@0.116.0
- @voyant-travel/bookings-react@0.116.0
- @voyant-travel/catalog-react@0.114.0
- @voyant-travel/flights-react@0.116.0
- @voyant-travel/crm-react@0.116.0

## 0.106.0

### Minor Changes

- 6d496d0: Add the `./admin` entry: `createTravelComposerAdminExtension` delivers the trips admin surface per the packaged-admin RFC — the Trips nav group (spliced after Bookings via `insertAfter`, with All trips / New trip sub-items and a host-supplied icon), the trips list (`TripsHost` with the filters popover), and the trip detail page whose Edit mode lazy-mounts the now-packaged admin trips (previously an operator-template component). Loaders are SSR `data-only` and seed the list/detail queries through the host runtime; routes carry `trip.list`/`trip.detail` destination annotations and all cross-route links resolve through semantic destinations (`booking.detail`, `person.detail`). The composer/page stack reads its API client from the shared provider context instead of app env helpers.

### Patch Changes

- Updated dependencies [41b08db]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/catalog-react@0.113.0
  - @voyant-travel/bookings-react@0.115.0
  - @voyant-travel/crm-react@0.115.0
  - @voyant-travel/flights-react@0.115.0
  - @voyant-travel/catalog@0.113.0
  - @voyant-travel/finance@0.115.0
  - @voyant-travel/flights@0.115.0
  - @voyant-travel/travel-composer@0.106.0

## 0.105.8

### Patch Changes

- @voyant-travel/travel-composer@0.105.8

## 0.105.7

### Patch Changes

- @voyant-travel/travel-composer@0.105.7

## 0.105.6

### Patch Changes

- @voyant-travel/travel-composer@0.105.6

## 0.105.5

### Patch Changes

- @voyant-travel/travel-composer@0.105.5

## 0.105.4

### Patch Changes

- @voyant-travel/travel-composer@0.105.4

## 0.105.3

### Patch Changes

- @voyant-travel/travel-composer@0.105.3

## 0.105.2

### Patch Changes

- @voyant-travel/travel-composer@0.105.2

## 0.105.1

### Patch Changes

- @voyant-travel/travel-composer@0.105.1

## 0.105.0

### Minor Changes

- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

### Patch Changes

- Updated dependencies [c2aef18]
- Updated dependencies [d1ad572]
  - @voyant-travel/travel-composer@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/react@0.104.1
- @voyant-travel/travel-composer@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/react@0.104.0
- @voyant-travel/travel-composer@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/react@0.103.0
- @voyant-travel/travel-composer@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/react@0.102.0
- @voyant-travel/travel-composer@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/react@0.101.2
- @voyant-travel/travel-composer@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/react@0.101.1
- @voyant-travel/travel-composer@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/react@0.101.0
- @voyant-travel/travel-composer@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/react@0.100.0
- @voyant-travel/travel-composer@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/react@0.99.0
- @voyant-travel/travel-composer@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/react@0.98.0
- @voyant-travel/travel-composer@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/react@0.97.0
- @voyant-travel/travel-composer@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/react@0.96.0
- @voyant-travel/travel-composer@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/react@0.95.0
- @voyant-travel/travel-composer@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/react@0.94.0
- @voyant-travel/travel-composer@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/react@0.93.0
- @voyant-travel/travel-composer@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/react@0.92.0
- @voyant-travel/travel-composer@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/react@0.91.0
- @voyant-travel/travel-composer@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/react@0.90.0
- @voyant-travel/travel-composer@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/react@0.89.0
- @voyant-travel/travel-composer@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/react@0.88.0
- @voyant-travel/travel-composer@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/react@0.87.1
- @voyant-travel/travel-composer@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/react@0.87.0
- @voyant-travel/travel-composer@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/react@0.86.0
- @voyant-travel/travel-composer@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/react@0.85.4
- @voyant-travel/travel-composer@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/react@0.85.3
- @voyant-travel/travel-composer@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/react@0.85.2
- @voyant-travel/travel-composer@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/react@0.85.1
- @voyant-travel/travel-composer@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/react@0.85.0
- @voyant-travel/travel-composer@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/react@0.84.4
- @voyant-travel/travel-composer@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/react@0.84.3
- @voyant-travel/travel-composer@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/react@0.84.2
- @voyant-travel/travel-composer@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/react@0.84.1
- @voyant-travel/travel-composer@0.84.1

## 0.84.0

### Patch Changes

- 5462f07: Rename the remaining active trips stay filters from hospitality to accommodations and add a Cloudflare startup profile summary lane.
- Updated dependencies [5462f07]
  - @voyant-travel/react@0.84.0
  - @voyant-travel/travel-composer@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/react@0.83.1
- @voyant-travel/travel-composer@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/react@0.83.0
- @voyant-travel/travel-composer@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/react@0.82.1
- @voyant-travel/travel-composer@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/react@0.82.0
- @voyant-travel/travel-composer@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/react@0.81.21
- @voyant-travel/travel-composer@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/react@0.81.20
- @voyant-travel/travel-composer@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/react@0.81.19
- @voyant-travel/travel-composer@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/react@0.81.18
- @voyant-travel/travel-composer@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/react@0.81.17
- @voyant-travel/travel-composer@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/react@0.81.16
- @voyant-travel/travel-composer@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/react@0.81.15
- @voyant-travel/travel-composer@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/react@0.81.14
- @voyant-travel/travel-composer@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/react@0.81.13
- @voyant-travel/travel-composer@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/react@0.81.12
- @voyant-travel/travel-composer@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/react@0.81.11
- @voyant-travel/travel-composer@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/react@0.81.10
- @voyant-travel/travel-composer@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/react@0.81.9
- @voyant-travel/travel-composer@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/react@0.81.8
- @voyant-travel/travel-composer@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/react@0.81.7
- @voyant-travel/travel-composer@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/react@0.81.6
- @voyant-travel/travel-composer@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/react@0.81.5
- @voyant-travel/travel-composer@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/react@0.81.4
- @voyant-travel/travel-composer@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/react@0.81.3
- @voyant-travel/travel-composer@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/react@0.81.2
- @voyant-travel/travel-composer@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/react@0.81.1
- @voyant-travel/travel-composer@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/react@0.81.0
- @voyant-travel/travel-composer@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/react@0.80.18
- @voyant-travel/travel-composer@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/react@0.80.17
- @voyant-travel/travel-composer@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/react@0.80.16
- @voyant-travel/travel-composer@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/react@0.80.15
- @voyant-travel/travel-composer@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/react@0.80.14
- @voyant-travel/travel-composer@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/react@0.80.13
- @voyant-travel/travel-composer@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/react@0.80.12
- @voyant-travel/travel-composer@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/react@0.80.11
- @voyant-travel/travel-composer@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/react@0.80.10
- @voyant-travel/travel-composer@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/react@0.80.9
- @voyant-travel/travel-composer@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/react@0.80.8
- @voyant-travel/travel-composer@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/react@0.80.7
- @voyant-travel/travel-composer@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/react@0.80.6
- @voyant-travel/travel-composer@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/react@0.80.5
- @voyant-travel/travel-composer@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/react@0.80.4
- @voyant-travel/travel-composer@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/react@0.80.3
- @voyant-travel/travel-composer@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/react@0.80.2
- @voyant-travel/travel-composer@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/react@0.80.1
- @voyant-travel/travel-composer@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/react@0.80.0
- @voyant-travel/travel-composer@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/react@0.79.0
- @voyant-travel/travel-composer@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/react@0.78.0
- @voyant-travel/travel-composer@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/react@0.77.13
- @voyant-travel/travel-composer@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/react@0.77.12
- @voyant-travel/travel-composer@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/react@0.77.11
- @voyant-travel/travel-composer@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/react@0.77.10
- @voyant-travel/travel-composer@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/react@0.77.9
- @voyant-travel/travel-composer@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/react@0.77.8
- @voyant-travel/travel-composer@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/react@0.77.7
- @voyant-travel/travel-composer@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/react@0.77.6
- @voyant-travel/travel-composer@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/react@0.77.5
- @voyant-travel/travel-composer@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/react@0.77.4
- @voyant-travel/travel-composer@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/react@0.77.3
- @voyant-travel/travel-composer@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/react@0.77.2
- @voyant-travel/travel-composer@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/react@0.77.1
- @voyant-travel/travel-composer@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/react@0.77.0
- @voyant-travel/travel-composer@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/react@0.76.0
- @voyant-travel/travel-composer@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/react@0.75.7
- @voyant-travel/travel-composer@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/react@0.75.6
- @voyant-travel/travel-composer@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/react@0.75.5
- @voyant-travel/travel-composer@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/react@0.75.4
- @voyant-travel/travel-composer@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/react@0.75.3
- @voyant-travel/travel-composer@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/react@0.75.2
- @voyant-travel/travel-composer@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/react@0.75.1
- @voyant-travel/travel-composer@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/react@0.75.0
- @voyant-travel/travel-composer@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/react@0.74.2
- @voyant-travel/travel-composer@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/react@0.74.1
- @voyant-travel/travel-composer@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/react@0.74.0
- @voyant-travel/travel-composer@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/react@0.73.1
- @voyant-travel/travel-composer@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/react@0.73.0
- @voyant-travel/travel-composer@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/react@0.72.0
- @voyant-travel/travel-composer@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/react@0.71.0
- @voyant-travel/travel-composer@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/react@0.70.0
- @voyant-travel/travel-composer@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/react@0.69.1
- @voyant-travel/travel-composer@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/react@0.69.0
- @voyant-travel/travel-composer@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/react@0.68.0
- @voyant-travel/travel-composer@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/react@0.67.0
- @voyant-travel/travel-composer@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/react@0.66.6
- @voyant-travel/travel-composer@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/react@0.66.5
- @voyant-travel/travel-composer@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/react@0.66.4
- @voyant-travel/travel-composer@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/react@0.66.3
- @voyant-travel/travel-composer@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/react@0.66.2
- @voyant-travel/travel-composer@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/react@0.66.1
- @voyant-travel/travel-composer@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/react@0.66.0
- @voyant-travel/travel-composer@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/react@0.65.0
- @voyant-travel/travel-composer@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/react@0.64.1
- @voyant-travel/travel-composer@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/react@0.64.0
- @voyant-travel/travel-composer@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/react@0.63.1
- @voyant-travel/travel-composer@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/react@0.63.0
- @voyant-travel/travel-composer@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/react@0.62.3
- @voyant-travel/travel-composer@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/react@0.62.2
- @voyant-travel/travel-composer@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/react@0.62.1
- @voyant-travel/travel-composer@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/react@0.62.0
- @voyant-travel/travel-composer@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/react@0.61.0
- @voyant-travel/travel-composer@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/react@0.60.0
- @voyant-travel/travel-composer@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/react@0.59.0
- @voyant-travel/travel-composer@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/react@0.58.0
- @voyant-travel/travel-composer@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/react@0.57.0
- @voyant-travel/travel-composer@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/react@0.56.0
- @voyant-travel/travel-composer@0.56.0

## 0.55.1

### Patch Changes

- 819c847: Add the Travel Composer foundation for customer-facing composed trips.

  `@voyant-travel/travel-composer` introduces Trip Envelopes and Trip Components,
  durable schema, Zod contracts, deterministic draft/component operations,
  catalog-backed component adaptation, aggregate price and tax snapshots, reserve
  and checkout handoff workflows, component-level cancellation preview/cancel
  operations, Cruise Extension representation helpers, admin/public Hono routes,
  and AI-safe itinerary MCP tools.

  `@voyant-travel/travel-composer-react` adds the matching React client layer:
  admin/public operation helpers, validation-aware fetches, cache writers, query
  keys/options, provider wiring, and hooks for draft, component, pricing,
  reserve, checkout, and cancellation flows.

- Updated dependencies [819c847]
  - @voyant-travel/react@0.55.1
  - @voyant-travel/travel-composer@0.55.1
