# @voyant-travel/accommodations

## 0.202.7

### Patch Changes

- Updated dependencies [9a10fa5]
  - @voyant-travel/operations@0.20.0

## 0.202.6

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/operations@0.19.0

## 0.202.5

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/accommodations-contracts@0.105.21
  - @voyant-travel/operations@0.18.3

## 0.202.4

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/accommodations-contracts@0.105.20
  - @voyant-travel/operations@0.18.2

## 0.202.3

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/accommodations-contracts@0.105.19
  - @voyant-travel/operations@0.18.1

## 0.202.2

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/operations@0.18.0

## 0.202.1

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3
  - @voyant-travel/accommodations-contracts@0.105.18
  - @voyant-travel/operations@0.17.4

## 0.202.0

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
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/accommodations-contracts@0.105.17
  - @voyant-travel/operations@0.17.3

## 0.201.0

### Minor Changes

- da20433: Carry Booking Requirements through the v1 Booking Session lifecycle. The
  descriptor a host renders the wizard from now survives the quote seam instead
  of being discarded on the way through it.

  - `bookingSessionRecordV1` gains an optional `requirements` — present whenever
    the Session is `active` and its target resolves, absent for terminal or
    purged Sessions. A host can render the Configure step before it can quote.
  - `bookingQuoteRecordV1.requirements` is required: a Quote always has a
    resolvable target.
  - The `quote_unavailable` lifecycle rejection gains an optional
    `requirements`, so a priced-out or sold-out target still renders a correct
    wizard.
  - `OwnedBookingHandler` gains a required `computeRequirements(ctx, request)`.
    Each vertical's `computeQuote` now derives its descriptor through that same
    method — one derivation, so what a host renders and what a Commit validates
    against cannot drift.
  - `ComputeQuoteResult.shape` is renamed to `ComputeQuoteResult.requirements`.
    `quoteResponseV1.shape` and `QuoteEntityResult.shape` on the beta quote path
    are unchanged.
  - `BookingSessionModulePorts`, `BookingSessionCompositeLeafRuntime` and
    `BookingSessionCompositeHandler` gain `composeRequirements`, so trip-composite
    targets publish requirements too.
  - `booking_session_quotes` gains a `requirements` jsonb column. Quotes carry a
    10-minute TTL and are not commitments, so the migration expires in-flight
    Quotes rather than backfilling a fabricated descriptor.

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/accommodations-contracts@0.105.16
  - @voyant-travel/operations@0.17.2

## 0.200.0

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
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/accommodations-contracts@0.105.15
  - @voyant-travel/operations@0.17.1

## 0.199.5

### Patch Changes

- Updated dependencies [0404299]
  - @voyant-travel/operations@0.17.0

## 0.199.4

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/catalog@0.237.2

## 0.199.3

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/operations@0.16.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1

## 0.199.2

### Patch Changes

- Updated dependencies [e1c5e39]
  - @voyant-travel/operations@0.15.0

## 0.199.1

### Patch Changes

- Updated dependencies [a3c04c4]
  - @voyant-travel/operations@0.14.0

## 0.199.0

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/mice@0.95.0
  - @voyant-travel/operations@0.13.7
  - @voyant-travel/accommodations-contracts@0.105.14

## 0.198.1

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/operations@0.13.6
  - @voyant-travel/core@0.137.2

## 0.198.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/distribution@0.227.0
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/mice@0.94.0
  - @voyant-travel/operations@0.13.5
  - @voyant-travel/accommodations-contracts@0.105.13

## 0.197.1

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/catalog@0.234.2
  - @voyant-travel/operations@0.13.4

## 0.197.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/operations@0.13.3
  - @voyant-travel/mice@0.93.0

## 0.196.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/distribution@0.226.0
  - @voyant-travel/operations@0.13.2
  - @voyant-travel/bookings@0.236.0
  - @voyant-travel/mice@0.92.0

## 0.195.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/bookings@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/distribution@0.225.0
- @voyant-travel/mice@0.91.0
- @voyant-travel/operations@0.13.1

## 0.194.0

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/operations@0.13.0
  - @voyant-travel/distribution@0.224.0
  - @voyant-travel/mice@0.90.0
  - @voyant-travel/db@0.119.4

## 0.193.0

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/distribution@0.223.0
  - @voyant-travel/operations@0.12.2
  - @voyant-travel/mice@0.89.0
  - @voyant-travel/db@0.119.3

## 0.192.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/accommodations-contracts@0.105.11
  - @voyant-travel/distribution@0.222.0
  - @voyant-travel/operations@0.12.1
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0
  - @voyant-travel/mice@0.88.0

## 0.191.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/distribution@0.221.0
  - @voyant-travel/operations@0.12.0
  - @voyant-travel/mice@0.87.0
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0

## 0.190.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/distribution@0.220.0
  - @voyant-travel/operations@0.11.14
  - @voyant-travel/mice@0.86.0
  - @voyant-travel/accommodations-contracts@0.105.10

## 0.189.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/distribution@0.219.0
  - @voyant-travel/operations@0.11.13
  - @voyant-travel/accommodations-contracts@0.105.9
  - @voyant-travel/bookings@0.229.0
  - @voyant-travel/mice@0.85.0

## 0.188.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/catalog@0.226.0
- @voyant-travel/distribution@0.218.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/mice@0.84.0
- @voyant-travel/operations@0.11.12

## 0.187.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/mice@0.83.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/distribution@0.217.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/db@0.119.2
  - @voyant-travel/operations@0.11.11

## 0.186.0

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/distribution@0.216.0
  - @voyant-travel/mice@0.82.0
  - @voyant-travel/operations@0.11.10

## 0.185.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/distribution@0.215.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/mice@0.81.0
  - @voyant-travel/operations@0.11.9
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.184.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/distribution@0.214.0
  - @voyant-travel/finance@0.224.0
  - @voyant-travel/mice@0.80.0
  - @voyant-travel/operations@0.11.8

## 0.183.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/distribution@0.213.0
  - @voyant-travel/finance@0.223.0
  - @voyant-travel/mice@0.79.0
  - @voyant-travel/operations@0.11.7

## 0.182.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/distribution@0.212.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/mice@0.78.0
- @voyant-travel/operations@0.11.6

## 0.181.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/operations@0.11.5

## 0.181.0

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
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/catalog@0.219.0
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/distribution@0.211.0
  - @voyant-travel/operations@0.11.4
  - @voyant-travel/mice@0.77.0

## 0.180.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/catalog@0.218.0
  - @voyant-travel/distribution@0.210.0
  - @voyant-travel/mice@0.76.0
  - @voyant-travel/operations@0.11.3

## 0.179.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/distribution@0.209.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/mice@0.75.0
  - @voyant-travel/operations@0.11.2

## 0.178.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/distribution@0.208.0
  - @voyant-travel/mice@0.74.0
  - @voyant-travel/operations@0.11.1

## 0.177.0

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/operations@0.11.0
  - @voyant-travel/mice@0.73.0
  - @voyant-travel/bookings@0.217.0
  - @voyant-travel/catalog@0.215.0
  - @voyant-travel/distribution@0.207.0
  - @voyant-travel/finance@0.217.0

## 0.176.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/distribution@0.206.0
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/mice@0.72.0
  - @voyant-travel/operations@0.10.7

## 0.175.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/bookings@0.215.0
- @voyant-travel/catalog@0.213.0
- @voyant-travel/distribution@0.205.0
- @voyant-travel/mice@0.71.0
- @voyant-travel/operations@0.10.6

## 0.174.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/catalog@0.212.0
- @voyant-travel/distribution@0.204.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/mice@0.70.0
- @voyant-travel/operations@0.10.5

## 0.173.0

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/catalog@0.211.0
- @voyant-travel/distribution@0.203.0
- @voyant-travel/finance@0.213.0
- @voyant-travel/mice@0.69.0
- @voyant-travel/operations@0.10.4

## 0.172.0

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/distribution@0.202.0
  - @voyant-travel/operations@0.10.3
  - @voyant-travel/bookings@0.212.0
  - @voyant-travel/finance@0.212.0
  - @voyant-travel/mice@0.68.0

## 0.171.0

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/distribution@0.201.0
  - @voyant-travel/operations@0.10.2
  - @voyant-travel/bookings@0.211.0
  - @voyant-travel/finance@0.211.0
  - @voyant-travel/mice@0.67.0

## 0.170.0

### Patch Changes

- @voyant-travel/mice@0.66.0
- @voyant-travel/bookings@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/distribution@0.200.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/operations@0.10.1

## 0.169.0

### Patch Changes

- Updated dependencies [8abbdd6]
  - @voyant-travel/operations@0.10.0
  - @voyant-travel/mice@0.65.0
  - @voyant-travel/bookings@0.209.0
  - @voyant-travel/catalog@0.207.0
  - @voyant-travel/distribution@0.199.0
  - @voyant-travel/finance@0.209.0

## 0.168.0

### Patch Changes

- Updated dependencies [7547f67]
  - @voyant-travel/operations@0.9.5
  - @voyant-travel/bookings@0.208.0
  - @voyant-travel/catalog@0.206.0
  - @voyant-travel/distribution@0.198.0
  - @voyant-travel/finance@0.208.0
  - @voyant-travel/mice@0.64.0

## 0.167.3

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.
- Updated dependencies [2cfce32]
  - @voyant-travel/distribution@0.197.2
  - @voyant-travel/operations@0.9.3
  - @voyant-travel/catalog@0.205.2
  - @voyant-travel/action-ledger@0.115.2

## 0.167.2

### Patch Changes

- 560f7c3: Quarantine `action.pickup-room-block` and remove it from the legacy
  execute+tools allowlist. Dedup only applies when the optional
  `stayBookingItemId` is supplied; a retry without it (or after a crash before
  the caller learns the id) inserts a second pickup row against the same
  inventory, so this is not yet crash-safe for an agent to retry blindly.
  Declares `availability: { status: "unavailable", reasonCode:
"unsafe-unclaimed-create-target" }`. No runtime changes.
- Updated dependencies [560f7c3]
- Updated dependencies [560f7c3]
  - @voyant-travel/bookings@0.207.1
  - @voyant-travel/catalog@0.205.1

## 0.167.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on three room-block actions and remove them
  from the legacy execute+tools allowlist:

  - `action.create-room-block` already claims its command idempotently via
    `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
    `createdTarget` contract was already declared); this adds `availability`
    and `effectBoundary: "local"`.
  - `action.set-room-block-nights` upserts the night rows for an existing
    block (`onConflictDoUpdate`, deterministic final state), so it declares
    `targetLifecycle: "existing"` plus `availability`/`effectBoundary: "local"`.
  - `action.reverse-room-block-pickup` runs a single row-locked transaction
    that reverses an already-recorded pickup on an existing block; it declares
    `targetLifecycle: "existing"` plus `availability`/`effectBoundary: "local"`.

  `action.pickup-room-block` is intentionally left on the allowlist: its
  natural-key dedup on `stayBookingItemId` returns the prior pickup on retry,
  but it does not reject a same-key retry whose room count or date range
  differs from the original, so declaring the `handler-command-claim-v1`
  created-target contract would overclaim replay safety. Wiring it through
  `executeAdmittedCreatedTargetCommand` (like `create-room-block`) is follow-up
  work, not part of this batch.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/distribution@0.197.1
  - @voyant-travel/finance@0.207.1

## 0.167.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/distribution@0.197.0
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/mice@0.63.0
  - @voyant-travel/operations@0.9.2

## 0.166.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/distribution@0.196.0
  - @voyant-travel/mice@0.62.0
  - @voyant-travel/operations@0.9.1

## 0.165.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/operations@0.9.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/mice@0.61.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/distribution@0.195.0
  - @voyant-travel/bookings@0.205.0

## 0.164.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/distribution@0.194.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/mice@0.60.0
- @voyant-travel/operations@0.8.47

## 0.163.0

### Minor Changes

- 17f1239: Replace the inline Finance booking-create HTTP and dual-create surfaces with one
  handler-admitted, idempotent created-target Tool command. Booking rows, dependent
  finance records, the canonical action-ledger result, and domain-event outbox
  entries now settle in one transaction; exact retries resolve the original booking.

  Remove the retired booking-create React mutation, sheet, page, and slot shortcut.
  Unmount the legacy admin new/journey routes and semantic destinations, remove
  catalog and inventory booking actions, and remove the standard storefront
  `/shop/book/:entityModule/:entityId` route plus its booking page/journey exports.
  Catalog browsing, booking read/detail, customer-portal sessions, and reusable
  draft sections remain available; new booking creation is a Finance staff Tool.
  Remove raw Bookings, Charter, and Cruise creation APIs and Tools. Delete the
  dormant Catalog owned-commit contract and Inventory, Accommodations, Cruises,
  Commerce, Storefront, and Storefront SDK booking-row creation bridges rather
  than retaining unavailable legacy mutations. Require registry-minted,
  unforgeable handler admission plus a single-use Finance-specific mutation lease
  for Bookings domain settlement, and remove the Finance command's public
  subpath.

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/distribution@0.193.0
  - @voyant-travel/operations@0.8.46
  - @voyant-travel/mice@0.59.0

## 0.162.0

### Patch Changes

- @voyant-travel/mice@0.58.0
- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/distribution@0.192.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/operations@0.8.45

## 0.161.1

### Patch Changes

- a02a76b: Move generic MCP action targets, idempotency fingerprints, and approval preflight
  behind a discoverable server-owned Tool contract. Migrated packages resolve ledger
  targets from validated input, approval-required calls return structured server-issued
  approval metadata, and exact retries are validated against the stored command and
  principal. Route every handler-created target through the selected Tool admission,
  remove the raw created-target executor from the public package surface, and reject
  future package-level bypasses during manifest convergence. Validate graph risk
  against the loaded Tool tier before release and keep the Operator MCP health check
  from accepting startup failures.
- Updated dependencies [a02a76b]
  - @voyant-travel/tools@0.6.0
  - @voyant-travel/action-ledger@0.114.0
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/distribution@0.191.1
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/mice@0.57.1
  - @voyant-travel/operations@0.8.44

## 0.161.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/mice@0.57.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/distribution@0.191.0
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/operations@0.8.43

## 0.160.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/distribution@0.190.0
  - @voyant-travel/operations@0.8.42
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/mice@0.56.0

## 0.159.0

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
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/distribution@0.189.0
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/mice@0.55.0
  - @voyant-travel/operations@0.8.41

## 0.158.0

### Patch Changes

- @voyant-travel/mice@0.54.0
- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/distribution@0.188.0
- @voyant-travel/finance@0.198.0
- @voyant-travel/operations@0.8.40

## 0.157.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/distribution@0.187.0
  - @voyant-travel/mice@0.53.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operations@0.8.39

## 0.156.0

### Minor Changes

- 0190317: Make product, product-composition, MICE-program, trip, and room-block creation
  Tools use handler-owned atomic created-target command claims with exact replay
  and drift conflicts.

### Patch Changes

- Updated dependencies [71c08aa]
- Updated dependencies [0190317]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/distribution@0.186.0
  - @voyant-travel/mice@0.52.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operations@0.8.38
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.155.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/distribution@0.185.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/mice@0.51.0
  - @voyant-travel/operations@0.8.37

## 0.154.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/distribution@0.184.0
  - @voyant-travel/operations@0.8.36
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/mice@0.50.0

## 0.153.0

### Patch Changes

- 2c79bef: Add referenced presentation-subject overlay support for cruise ships and accommodation properties.
- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/distribution@0.183.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/operations@0.8.35
  - @voyant-travel/mice@0.49.0

## 0.152.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/distribution@0.182.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/mice@0.48.1
  - @voyant-travel/operations@0.8.34

## 0.152.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/distribution@0.182.0
  - @voyant-travel/mice@0.48.0
  - @voyant-travel/operations@0.8.33

## 0.151.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/distribution@0.181.0
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/operations@0.8.32
  - @voyant-travel/mice@0.47.0

## 0.150.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
- Updated dependencies [fafc12e]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/distribution@0.180.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/mice@0.46.0
  - @voyant-travel/operations@0.8.31

## 0.149.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/distribution@0.179.0
  - @voyant-travel/operations@0.8.30
  - @voyant-travel/accommodations-contracts@0.105.8
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0
  - @voyant-travel/mice@0.45.0

## 0.148.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/distribution@0.178.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/mice@0.44.0
  - @voyant-travel/operations@0.8.29

## 0.147.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/distribution@0.177.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/mice@0.43.0
- @voyant-travel/operations@0.8.28

## 0.146.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/distribution@0.176.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/mice@0.42.0
- @voyant-travel/operations@0.8.27

## 0.145.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/distribution@0.175.0
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/operations@0.8.26
  - @voyant-travel/mice@0.41.0

## 0.144.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/catalog@0.182.0
- @voyant-travel/distribution@0.174.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/mice@0.40.0
- @voyant-travel/operations@0.8.25

## 0.143.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/distribution@0.173.0
- @voyant-travel/mice@0.39.0
- @voyant-travel/operations@0.8.24

## 0.142.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/distribution@0.172.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/mice@0.38.1
  - @voyant-travel/operations@0.8.23

## 0.142.0

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/distribution@0.172.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/mice@0.38.0
- @voyant-travel/operations@0.8.22

## 0.141.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/distribution@0.171.0
  - @voyant-travel/mice@0.37.0
  - @voyant-travel/operations@0.8.21

## 0.140.0

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/distribution@0.170.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/mice@0.36.0
- @voyant-travel/operations@0.8.20

## 0.139.0

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/distribution@0.169.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/mice@0.35.0
- @voyant-travel/operations@0.8.19

## 0.138.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/distribution@0.168.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/mice@0.34.0
- @voyant-travel/operations@0.8.18

## 0.137.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/distribution@0.167.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/mice@0.33.0
  - @voyant-travel/operations@0.8.17

## 0.136.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/distribution@0.166.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/mice@0.32.0
  - @voyant-travel/operations@0.8.16

## 0.135.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/distribution@0.165.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/mice@0.31.0
  - @voyant-travel/operations@0.8.15

## 0.134.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/distribution@0.164.0
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/mice@0.30.0
  - @voyant-travel/operations@0.8.14

## 0.133.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/distribution@0.163.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/mice@0.29.0
- @voyant-travel/operations@0.8.13

## 0.132.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/distribution@0.162.0
  - @voyant-travel/mice@0.28.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/operations@0.8.12

## 0.131.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/distribution@0.161.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/mice@0.27.1
  - @voyant-travel/operations@0.8.11

## 0.131.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/distribution@0.161.0
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/operations@0.8.10
  - @voyant-travel/mice@0.27.0

## 0.130.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/distribution@0.160.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/mice@0.26.0
  - @voyant-travel/operations@0.8.9

## 0.129.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/distribution@0.159.1
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/mice@0.25.1
  - @voyant-travel/operations@0.8.8

## 0.129.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/distribution@0.159.0
  - @voyant-travel/operations@0.8.7
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/mice@0.25.0

## 0.128.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/distribution@0.158.0
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/operations@0.8.6
  - @voyant-travel/mice@0.24.0

## 0.127.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/distribution@0.157.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/operations@0.8.5
  - @voyant-travel/mice@0.23.0

## 0.126.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/distribution@0.156.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/mice@0.22.0
  - @voyant-travel/operations@0.8.4

## 0.125.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/distribution@0.155.0
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/operations@0.8.3
  - @voyant-travel/mice@0.21.0

## 0.124.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/distribution@0.154.0
  - @voyant-travel/operations@0.8.2
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0
  - @voyant-travel/mice@0.20.0

## 0.123.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/distribution@0.153.0
  - @voyant-travel/mice@0.19.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operations@0.8.1

## 0.122.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/distribution@0.152.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/mice@0.18.0
  - @voyant-travel/operations@0.8.0
  - @voyant-travel/db@0.114.8

## 0.121.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/distribution@0.151.0
  - @voyant-travel/mice@0.17.0
  - @voyant-travel/operations@0.7.1

## 0.120.0

### Minor Changes

- 5617f37: Add provider-neutral, typed Tools for owned accommodation search and quotes, localized content,
  and room-block read/create/night/pickup/reversal workflows with selected graph action bindings.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [6c8d46a]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [4f66e89]
- Updated dependencies [90e8d6d]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/operations@0.7.0
  - @voyant-travel/distribution@0.150.0
  - @voyant-travel/mice@0.16.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.119.0

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/operations@0.6.14
  - @voyant-travel/db@0.114.6
  - @voyant-travel/distribution@0.149.0
  - @voyant-travel/mice@0.15.0

## 0.118.0

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
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/distribution@0.148.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/mice@0.14.0
  - @voyant-travel/operations@0.6.13

## 0.117.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/accommodations-contracts@0.105.7
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/distribution@0.147.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/operations@0.6.12
  - @voyant-travel/mice@0.13.0

## 0.116.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/accommodations-contracts@0.105.6
  - @voyant-travel/allotments@0.2.1
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/distribution@0.146.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/mice@0.12.1
  - @voyant-travel/operations@0.6.11

## 0.116.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/distribution@0.146.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/mice@0.12.0
  - @voyant-travel/accommodations-contracts@0.105.5
  - @voyant-travel/db@0.114.3
  - @voyant-travel/operations@0.6.10

## 0.115.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/distribution@0.145.1
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/mice@0.11.1
  - @voyant-travel/operations@0.6.9

## 0.115.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/distribution@0.145.0
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/mice@0.11.0
  - @voyant-travel/operations@0.6.8

## 0.114.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/distribution@0.144.0
  - @voyant-travel/mice@0.10.0
  - @voyant-travel/operations@0.6.7

## 0.113.0

### Minor Changes

- 047c3f9: Add package-owned graph runtime factories and typed deployment ports for Catalog search, booking, and offers; Inventory core, content, and brochures; Accommodations and Cruises content; and Action Ledger health.
- 490d132: Move owned product, accommodation, and cruise booking runtime behavior out of the Operator starter and into package-owned runtime surfaces.
- 490d132: Publish package-owned OpenAPI registries and selected-graph documents for accommodation content, Flights, and public quote proposal APIs.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Make selected package API facets the exclusive OpenAPI document authority and reject unclaimed or duplicate operations.
- 490d132: Move travel-product OpenAPI ownership into selected graph manifests and package route registries.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/distribution@0.143.0
  - @voyant-travel/mice@0.9.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/operations@0.6.6
  - @voyant-travel/hono@0.125.1

## 0.112.5

### Patch Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/operations@0.6.5
  - @voyant-travel/db@0.112.2

## 0.112.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/operations@0.6.4

## 0.112.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/operations@0.6.3

## 0.112.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/operations@0.6.2

## 0.112.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/operations@0.6.1

## 0.112.0

### Minor Changes

- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- a370024: Publish package-owned deployment manifests for the travel modules.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
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
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/operations@0.6.0
  - @voyant-travel/hono@0.122.4

## 0.111.6

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/operations@0.5.23

## 0.111.5

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/operations@0.5.22
  - @voyant-travel/hono@0.122.2

## 0.111.4

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0
- @voyant-travel/operations@0.5.21

## 0.111.3

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0
- @voyant-travel/operations@0.5.20

## 0.111.2

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/operations@0.5.19

## 0.111.1

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0
- @voyant-travel/operations@0.5.18

## 0.111.0

### Minor Changes

- 4829ef3: Add a bounded catalog batch quote endpoint for room/rate price matrices, plus an accommodations batch stay quote path that shares room/date availability and rate reads across selections.

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/operations@0.5.17
  - @voyant-travel/accommodations-contracts@0.105.4
  - @voyant-travel/bookings@0.145.0

## 0.110.0

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
  - @voyant-travel/catalog@0.142.0
  - @voyant-travel/operations@0.5.16

## 0.109.11

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/operations@0.5.15

## 0.109.10

### Patch Changes

- @voyant-travel/bookings@0.142.0
- @voyant-travel/catalog@0.140.0
- @voyant-travel/operations@0.5.14

## 0.109.9

### Patch Changes

- 71adbdd: Return the bridge-created booking id from accommodation booking-engine commits so catalog checkout snapshots point at the real stay booking.

## 0.109.8

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/operations@0.5.13
  - @voyant-travel/bookings@0.141.0

## 0.109.7

### Patch Changes

- @voyant-travel/bookings@0.140.0
- @voyant-travel/catalog@0.138.0
- @voyant-travel/operations@0.5.12

## 0.109.6

### Patch Changes

- 98503c9: Gate customer storefront documents and owned detail content to bookable accommodation rooms and cruises so seed/demo rows that are inactive, draft, closed, unpriced, or out of inventory do not appear as bookable cards.

## 0.109.5

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/operations@0.5.10
  - @voyant-travel/db@0.109.5

## 0.109.4

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
- Updated dependencies [fead555]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/operations@0.5.9
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3

## 0.109.3

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/operations@0.5.8

## 0.109.2

### Patch Changes

- @voyant-travel/bookings@0.138.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/operations@0.5.6

## 0.109.1

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.
- Updated dependencies [61410dd]
  - @voyant-travel/catalog@0.135.3
  - @voyant-travel/bookings@0.137.4

## 0.109.0

### Minor Changes

- 6d3e0a5: Add first-party owned accommodation daily rates, room-night inventory, and a service-backed booking/search quote path.

## 0.108.3

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/operations@0.5.3

## 0.108.2

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/operations@0.5.2

## 0.108.1

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/operations@0.5.1

## 0.108.0

### Minor Changes

- 787c852: Space blocks + shared allotment-lifecycle primitive (Phase 2b).

  - New `@voyant-travel/allotments`: the canonical allotment lifecycle contract
    (status state machine, counter math, pickup-progress derivation, slot
    enumeration) — one contract reused by type-specific tables (RFC §9-Q2).
  - accommodations: room-block service refactored onto the shared primitive
    (behavior-preserving; enum values unchanged, no migration).
  - operations: `space_blocks` / `space_block_slots` / `space_block_pickups` —
    held function-space inventory over a date range, the 2nd allotment consumer;
    transactional pickup/reversal/cutoff service + admin routes + `spaceBlockLinkable`.
  - schema-kit: TypeID prefixes `spbl` / `spsl` / `sppu`.

### Patch Changes

- Updated dependencies [787c852]
- Updated dependencies [293e5e4]
  - @voyant-travel/allotments@0.2.0
  - @voyant-travel/operations@0.5.0
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0

## 0.107.0

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
  - @voyant-travel/operations@0.4.0
  - @voyant-travel/db@0.109.1
  - @voyant-travel/bookings@0.135.0
  - @voyant-travel/catalog@0.133.0

## 0.106.1

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/operations@0.3.0
  - @voyant-travel/catalog@0.132.0

## 0.106.0

### Minor Changes

- bbd8675: Add `createAccommodationOwnedSearchHandler` — the owned-arm availability-search handler for the accommodation vertical (dynamic packaging, voyant#2093). It lets owned accommodation inventory participate in the catalog availability fan-out (`fanOutAvailabilitySearch`) so owned and sourced supply land in one ranked candidate list.

  Mirrors the existing `createAccommodationBookingHandler` thin-shell + injected-bridge pattern: the handler owns the vertical-agnostic parts (criteria validation, `nightsBetween`, `StayMatch → AvailabilityCandidate` assembly with a deterministic composed `candidateRef` and a reserve-ready `selection`), and a caller-supplied `AccommodationSearchBridge` owns the inventory query (owned accommodations have no date-aware rate/availability table in the schema yet, and the location lookup spans the operations places/facility schema — both deployment-specific). `source` is left for the fan-out to stamp as `{ kind: "owned", module: "accommodations" }`. Exported from `@voyant-travel/accommodations/booking-engine`.

## 0.105.31

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/operations@0.2.8

## 0.105.30

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/accommodations-contracts@0.105.3
  - @voyant-travel/operations@0.2.7
  - @voyant-travel/bookings@0.132.0

## 0.105.29

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0
- @voyant-travel/operations@0.2.4

## 0.105.28

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0
- @voyant-travel/operations@0.2.3

## 0.105.27

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/operations@0.2.2
  - @voyant-travel/bookings@0.129.0

## 0.105.26

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/catalog@0.126.0
- @voyant-travel/operations@0.2.1

## 0.105.25

### Patch Changes

- 435a5d1: Extract the availability domain into a new foundational `@voyant-travel/availability` package, and complete D.2 per-package migration onboarding for the last schema-owning packages.

  - **@voyant-travel/availability (new):** owns the `availability_*` schema (slots, rules, start times, holds, pickups, capacity) — previously buried in operations. Ships its own D.2 migration.
  - **operations:** its availability **services and routes stay**, now importing the schema from `@voyant-travel/availability` (the barrel re-exports it for runtime consumers); operations' migration no longer owns the availability tables. Fixes the module direction — bookings/operations/accommodations consume availability, rather than reaching into operations for an inventory primitive.
  - **bookings:** drops the hard cross-package FK from `booking_allocations.availability_slot_id` to `availability_slots` (it referenced a stale local duplicate); the column is now a plain indexed id per module decoupling. The refund workflow keeps a runtime-only reference to the availability table.
  - **framework-migrations:** bundle migration drops the removed FK constraint.

  All package sources verified column-for-column against the bundle and apply together cleanly on a fresh D.2 database (union).

- Updated dependencies [435a5d1]
  - @voyant-travel/operations@0.2.0
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/catalog@0.125.0

## 0.105.24

### Patch Changes

- @voyant-travel/bookings@0.126.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/operations@0.1.6

## 0.105.23

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/bookings@0.125.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/operations@0.1.5

## 0.105.22

### Patch Changes

- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0
- @voyant-travel/operations@0.1.4

## 0.105.21

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [39d48fe]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/operations@0.1.3

## 0.105.20

### Patch Changes

- @voyant-travel/bookings@0.122.0
- @voyant-travel/catalog@0.120.0
- @voyant-travel/operations@0.1.2

## 0.105.19

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/bookings@0.121.0
  - @voyant-travel/operations@0.1.1

## 0.105.18

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- eb1ad4b: Move shared place handling into Operations-owned places surfaces while
  preserving existing `facilityId` database fields.

  Remove direct cross-package database constraints from ground, distribution, and
  accommodations into the legacy facilities/property tables; those references now
  remain indexed loose ids for deployment-level linking.

- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/operations@0.1.0

## 0.105.17

### Patch Changes

- d4e3d54: Split oversized cruise route, service, booking, search, and catalog policy modules into smaller vertical slices while preserving the existing public exports and behavior.

  Split oversized flights UI, charter booking, and accommodation content modules into smaller internal slices while preserving the existing public exports and behavior.

- Updated dependencies [bd74fb0]
  - @voyant-travel/catalog@0.117.2
  - @voyant-travel/bookings@0.119.2

## 0.105.16

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/catalog@0.117.1
  - @voyant-travel/facilities@0.107.11

## 0.105.15

### Patch Changes

- @voyant-travel/bookings@0.119.0
- @voyant-travel/catalog@0.117.0
- @voyant-travel/facilities@0.107.10

## 0.105.14

### Patch Changes

- @voyant-travel/bookings@0.118.0
- @voyant-travel/catalog@0.116.0
- @voyant-travel/facilities@0.107.9

## 0.105.13

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/db@0.107.0
  - @voyant-travel/catalog@0.115.1
  - @voyant-travel/facilities@0.107.8

## 0.105.12

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/facilities@0.107.7

## 0.105.11

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/db@0.105.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/catalog@0.114.0
  - @voyant-travel/facilities@0.107.6

## 0.105.10

### Patch Changes

- @voyant-travel/bookings@0.115.0
- @voyant-travel/catalog@0.113.0
- @voyant-travel/facilities@0.107.5

## 0.105.9

### Patch Changes

- @voyant-travel/bookings@0.114.0
- @voyant-travel/catalog@0.112.0
- @voyant-travel/facilities@0.107.4

## 0.105.8

### Patch Changes

- @voyant-travel/bookings@0.113.0
- @voyant-travel/catalog@0.111.0
- @voyant-travel/facilities@0.107.3

## 0.105.7

### Patch Changes

- @voyant-travel/bookings@0.112.0
- @voyant-travel/catalog@0.110.0
- @voyant-travel/facilities@0.107.2

## 0.105.6

### Patch Changes

- @voyant-travel/bookings@0.111.0
- @voyant-travel/catalog@0.109.0
- @voyant-travel/facilities@0.107.1

## 0.105.5

### Patch Changes

- @voyant-travel/bookings@0.110.0
- @voyant-travel/catalog@0.108.0
- @voyant-travel/db@0.104.4
- @voyant-travel/facilities@0.107.0

## 0.105.4

### Patch Changes

- @voyant-travel/bookings@0.109.0
- @voyant-travel/catalog@0.107.0
- @voyant-travel/facilities@0.106.0

## 0.105.3

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0
  - @voyant-travel/accommodations-contracts@0.105.1
  - @voyant-travel/bookings@0.108.0
  - @voyant-travel/facilities@0.105.2

## 0.105.2

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/catalog@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/facilities@0.105.0

## 0.105.1

### Patch Changes

- @voyant-travel/bookings@0.106.0
- @voyant-travel/facilities@0.104.3

## 0.105.0

### Minor Changes

- 921f4fc: Add a canonical board-basis contract enum and reuse it across accommodation meal plans, product options, and cruise sailings.

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/accommodations-contracts@0.105.0
  - @voyant-travel/catalog@0.104.4
  - @voyant-travel/bookings@0.105.0
  - @voyant-travel/facilities@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/accommodations-contracts@0.104.1
- @voyant-travel/bookings@0.104.1
- @voyant-travel/catalog@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/facilities@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.104.0
- @voyant-travel/bookings@0.104.0
- @voyant-travel/catalog@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/facilities@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.103.0
- @voyant-travel/bookings@0.103.0
- @voyant-travel/catalog@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/facilities@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.102.0
- @voyant-travel/bookings@0.102.0
- @voyant-travel/catalog@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/facilities@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/accommodations-contracts@0.101.2
- @voyant-travel/bookings@0.101.2
- @voyant-travel/catalog@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/facilities@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/accommodations-contracts@0.101.1
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/catalog@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/facilities@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.101.0
- @voyant-travel/bookings@0.101.0
- @voyant-travel/catalog@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/facilities@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.100.0
- @voyant-travel/bookings@0.100.0
- @voyant-travel/catalog@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/facilities@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.99.0
- @voyant-travel/bookings@0.99.0
- @voyant-travel/catalog@0.99.0
- @voyant-travel/db@0.99.0
- @voyant-travel/facilities@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/accommodations-contracts@0.98.0
- @voyant-travel/bookings@0.98.0
- @voyant-travel/catalog@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/facilities@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/accommodations-contracts@0.97.0
  - @voyant-travel/bookings@0.97.0
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/facilities@0.97.0

## 0.96.0

### Minor Changes

- 465fb31: Extend the lightweight contract-package pattern to the remaining content
  verticals.

  `@voyant-travel/accommodations-contracts`, `@voyant-travel/products-contracts`,
  `@voyant-travel/extras-contracts`, and `@voyant-travel/charters-contracts` now own their
  respective `<vertical>/v1` rich content schema, version constant, types, and
  validator as zod-only packages, so external consumers (Voyant Connect, adapter
  authors, the Admin API SDK) can validate content payloads without installing the
  framework runtime.

  The runtime `@voyant-travel/accommodations`, `@voyant-travel/products`,
  `@voyant-travel/extras`, and `@voyant-travel/charters` packages re-export their content
  shape from the matching contract package, so existing
  `@voyant-travel/<vertical>/content-shape` import paths are unchanged. The
  `mergeOverlaysInto<Vertical>Content` overlay composition stays in the runtime
  package.

  See `docs/adr/0002-contract-packages.md` for the codified pattern.

### Patch Changes

- Updated dependencies [2d8d59b]
- Updated dependencies [465fb31]
  - @voyant-travel/accommodations-contracts@0.96.0
  - @voyant-travel/bookings@0.96.0
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/facilities@0.96.0

## 0.95.0

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/bookings@0.95.0
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/db@0.95.0
  - @voyant-travel/facilities@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/catalog@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/facilities@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/catalog@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/facilities@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/bookings@0.92.0
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/db@0.92.0
  - @voyant-travel/facilities@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/catalog@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/facilities@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/catalog@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/facilities@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/bookings@0.89.0
- @voyant-travel/catalog@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/facilities@0.89.0

## 0.88.0

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/bookings@0.88.0
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/db@0.88.0
  - @voyant-travel/facilities@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/bookings@0.87.1
- @voyant-travel/catalog@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/facilities@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/bookings@0.87.0
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/db@0.87.0
  - @voyant-travel/facilities@0.87.0

## 0.86.0

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/bookings@0.86.0
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/db@0.86.0
  - @voyant-travel/facilities@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/bookings@0.85.4
- @voyant-travel/catalog@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/facilities@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/bookings@0.85.3
- @voyant-travel/catalog@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/facilities@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/catalog@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/facilities@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/bookings@0.85.1
- @voyant-travel/catalog@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/facilities@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/catalog@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/facilities@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/bookings@0.84.4
- @voyant-travel/catalog@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/facilities@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/catalog@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/facilities@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/catalog@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/facilities@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/catalog@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/facilities@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/catalog@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/facilities@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/catalog@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/facilities@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/catalog@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/facilities@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/catalog@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/facilities@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/bookings@0.82.0
- @voyant-travel/catalog@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/facilities@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/catalog@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/facilities@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/catalog@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/facilities@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/catalog@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/facilities@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/bookings@0.81.18
- @voyant-travel/catalog@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/facilities@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/catalog@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/facilities@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/facilities@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/bookings@0.81.15
- @voyant-travel/catalog@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/facilities@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/bookings@0.81.14
- @voyant-travel/catalog@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/facilities@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/catalog@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/facilities@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/catalog@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/facilities@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/bookings@0.81.11
- @voyant-travel/catalog@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/facilities@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/bookings@0.81.10
- @voyant-travel/catalog@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/facilities@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/catalog@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/facilities@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/catalog@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/facilities@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/catalog@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/facilities@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/bookings@0.81.6
- @voyant-travel/catalog@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/facilities@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/bookings@0.81.5
- @voyant-travel/catalog@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/facilities@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/catalog@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/facilities@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/catalog@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/facilities@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/catalog@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/facilities@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/bookings@0.81.1
- @voyant-travel/catalog@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/facilities@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/catalog@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/facilities@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/catalog@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/facilities@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/catalog@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/facilities@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/bookings@0.80.16
- @voyant-travel/catalog@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/facilities@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/catalog@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/facilities@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/catalog@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/facilities@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/bookings@0.80.13
- @voyant-travel/catalog@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/facilities@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/catalog@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/facilities@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/catalog@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/facilities@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/bookings@0.80.10
- @voyant-travel/catalog@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/facilities@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/catalog@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/facilities@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/bookings@0.80.8
- @voyant-travel/catalog@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/facilities@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/bookings@0.80.7
- @voyant-travel/catalog@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/facilities@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/bookings@0.80.6
- @voyant-travel/catalog@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/facilities@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/bookings@0.80.5
- @voyant-travel/catalog@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/facilities@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/bookings@0.80.4
- @voyant-travel/catalog@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/facilities@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/bookings@0.80.3
- @voyant-travel/catalog@0.80.3
- @voyant-travel/db@0.80.3
- @voyant-travel/facilities@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/catalog@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/facilities@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/bookings@0.80.1
- @voyant-travel/catalog@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/facilities@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/bookings@0.80.0
- @voyant-travel/catalog@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/facilities@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/catalog@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/facilities@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/catalog@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/facilities@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/bookings@0.77.13
- @voyant-travel/catalog@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/facilities@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/bookings@0.77.12
- @voyant-travel/catalog@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/facilities@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/bookings@0.77.11
- @voyant-travel/catalog@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/facilities@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/bookings@0.77.10
- @voyant-travel/catalog@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/facilities@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/bookings@0.77.9
- @voyant-travel/catalog@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/facilities@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/catalog@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/facilities@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/catalog@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/facilities@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/catalog@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/facilities@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/bookings@0.77.5
- @voyant-travel/catalog@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/facilities@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/catalog@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/facilities@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/catalog@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/facilities@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/catalog@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/facilities@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/catalog@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/facilities@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/bookings@0.77.0
- @voyant-travel/catalog@0.77.0
- @voyant-travel/db@0.77.0
- @voyant-travel/facilities@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/bookings@0.76.0
- @voyant-travel/catalog@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/facilities@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/bookings@0.75.7
- @voyant-travel/catalog@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/facilities@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/bookings@0.75.6
- @voyant-travel/catalog@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/facilities@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/bookings@0.75.5
- @voyant-travel/catalog@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/facilities@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/catalog@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/facilities@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/bookings@0.75.3
- @voyant-travel/catalog@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/facilities@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/catalog@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/facilities@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/catalog@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/facilities@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/catalog@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/facilities@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/bookings@0.74.2
- @voyant-travel/catalog@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/facilities@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/bookings@0.74.1
- @voyant-travel/catalog@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/facilities@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/catalog@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/facilities@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/catalog@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/facilities@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/bookings@0.73.0
- @voyant-travel/catalog@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/facilities@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/catalog@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/facilities@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/catalog@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/facilities@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/catalog@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/facilities@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/catalog@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/facilities@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/catalog@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/facilities@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/catalog@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/facilities@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/catalog@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/facilities@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/bookings@0.66.6
- @voyant-travel/catalog@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/facilities@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/catalog@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/facilities@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/catalog@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/facilities@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/catalog@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/facilities@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/catalog@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/facilities@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/bookings@0.66.1
- @voyant-travel/catalog@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/facilities@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/catalog@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/facilities@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/catalog@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/facilities@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/bookings@0.64.1
- @voyant-travel/catalog@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/facilities@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/catalog@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/facilities@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/catalog@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/facilities@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/catalog@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/facilities@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/catalog@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/facilities@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/catalog@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/facilities@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/catalog@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/facilities@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/catalog@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/facilities@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/catalog@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/facilities@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/bookings@0.60.0
- @voyant-travel/catalog@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/facilities@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/bookings@0.59.0
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/db@0.59.0
  - @voyant-travel/facilities@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/bookings@0.58.0
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/db@0.58.0
  - @voyant-travel/facilities@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/catalog@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/facilities@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/catalog@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/facilities@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/facilities@0.55.1

## 0.55.0

### Minor Changes

- f0c2a6d: Add the accommodation resale package and retire the legacy hospitality package family.

  Accommodation inventory remains available as catalog resale content for OTAs, DMCs, and tour operators, while first-party hotel-managed operations surfaces are removed from the active package, template, and UI registry surfaces. Consumers should use `@voyant-travel/accommodations` for lodging catalog and stay booking-line integrations instead of the removed `@voyant-travel/hospitality`, `@voyant-travel/hospitality-react`, and `@voyant-travel/hospitality-ui` package family.

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/catalog@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/facilities@0.55.0
