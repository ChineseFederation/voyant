---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/accommodations": minor
"@voyant-travel/charters": minor
"@voyant-travel/cruises": minor
"@voyant-travel/cruises-react": minor
"@voyant-travel/inventory": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/catalog-react": minor
"@voyant-travel/bookings-react": minor
"@voyant-travel/storefront-react": minor
"@voyant-travel/trips": minor
"@voyant-travel/trips-react": minor
---

Split the booking-engine contracts by concern and collapse the duplicated
requirements type families onto the Zod schemas. Breaking renames, no behavior
change.

**File / subpath split.** `booking-engine/draft-contracts.ts` is deleted and its
contents redistributed. `booking-engine/requirements.ts` is deleted and split in
two, so each file's name matches what it holds:

- `@voyant-travel/catalog-contracts/booking-engine/requirements-contracts` —
  every schema describing what a booking *requires* (`paxBandSpecV1`,
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
