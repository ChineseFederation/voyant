# @voyant-travel/storefront-react

## 0.267.0

### Minor Changes

- 7b8ef95: Product-analytics events from the booking engine, admin, and customer portal,
  emitted through a vendor-neutral port.

  None of these surfaces emitted any product-analytics signal, so a host could not
  measure where a traveller abandons a booking journey or where staff get stuck in
  the admin. This adds the **vendor-neutral half**: a port, the domain events that
  travel through it, and a conformance check binding the taxonomy to the code. It
  adds no analytics vendor, SDK, key, host, or proxy, and a checker now enforces
  that it never will.

  **`AnalyticsPort`** (`@voyant-travel/core/analytics`) is `track` / `identify` /
  `group`, bound by the host through the existing runtime-contributor mechanism on
  the server and through `<VoyantReactProvider analytics={…}>` (or
  `<VoyantAnalyticsProvider>`) in the browser. Four properties are guaranteed by
  the framework rather than left to each implementation:

  - **Unbound is a supported, silent state.** The default is `noopAnalytics`; a
    deployment that binds nothing behaves exactly as before and pays nothing.
  - **Fire-and-forget.** `track` returns `void`, so nothing can put an analytics
    round-trip on a booking's critical path.
  - **It cannot fail a booking.** `createSafeAnalytics` swallows a provider that
    throws, synchronously or from a returned promise.
  - **No PII in the contract.** Identifiers and enumerations only. `field` carries
    a requirement key, never the value entered against it; `entry_referrer` is
    reduced to an origin; an admin `route` is the matched route pattern, never a
    resolved URL; a search emits its result count and never the query text.

  **Booking engine, server.** `withBookingSessionAnalytics` decorates
  `BookingSessionModule` rather than scattering `track()` through the 2,500-line
  service: every lifecycle method already answers one discriminated
  `bookingSessionOutcomeV1`, so the outcome-to-event mapping is total and
  reviewable in one place, and the decorator returns the service's own value
  untouched.

  `failure_reason` is derived from the contract's own rejection kinds by one rule —
  _when a rejection carries a nested `reason`, that reason is the failure reason_ —
  so it is a closed enumeration rather than a message string. A test asserts the
  enumeration is **exactly** the set of failure outcomes `catalog-contracts` can
  publish, in both directions; a new rejection kind fails there rather than
  arriving in production as an `unknown` bucket. `engine.commit.failed` carries
  `missing_requirements[]` from `selection_incomplete.unsatisfied[]`. A Commit that
  suspends waiting for a payment guarantee or a supplier emits neither `succeeded`
  nor `failed` — it has not failed, and a buyer who never returns arrives as
  `engine.session.abandoned`.

  **Booking engine, client.** `engine.journey.started` fires from
  `useBookingSession().create()`, and `engine.field.errored` — the stuck-point
  signal — fires from `useBookingQuote` and `useCommitBookingSession` whenever the
  server answers `selection_incomplete`, with no host instrumentation at all.
  `engine.step.viewed` / `.completed` are host-driven through
  `useBookingJourneyAnalytics()`, because the Booking Requirements descriptor
  decides which steps exist; the hook derives `duration_ms` and `retries` itself.

  **Admin** events are derived from the operation descriptor in `useAdminQuery` /
  `useAdminMutation`, so every packaged admin read and write is covered without
  per-page work. `admin.nav.viewed` and `admin.extension.opened` come from the
  shell.

  **Customer portal**: `portal.session.started` and `portal.booking.viewed` are
  automatic; `portal.document.downloaded` is a callback, because the package ships
  no download action. `portal.payment.made` and `portal.support.contacted` are
  **deliberately undeclared** — the portal has no payment or support-contact leg to
  emit them from, and an event with no emitter is a dashboard line that reads zero
  forever.

  **Conformance.** `verify:analytics-conformance` is declarative
  (`scripts/checks/analytics/event-catalogue.json`) and asserts three directions
  plus vendor neutrality: the declared catalogue matches
  `docs/architecture/analytics-events.md`, every declared event is emitted by some
  tracked source, no `track()` call names an undeclared event or property, and no
  tracked manifest or emitter imports an analytics vendor. It reads the tracked
  tree via `trackedFilesIn`, and `verify:tracked-tree-scan` holds both halves of
  that line.

  Also removes the dead `POSTHOG_API_KEY` / `POSTHOG_HOST` passthrough from
  `turbo.json`, left over from a retired stack that nothing in this repository
  read.

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/catalog-react@0.263.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/i18n@0.122.1
  - @voyant-travel/storefront@0.253.0
  - @voyant-travel/auth-react@0.151.0
  - @voyant-travel/storefront-sdk@0.259.0

## 0.266.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0
  - @voyant-travel/storefront@0.252.0
  - @voyant-travel/storefront-sdk@0.258.0
  - @voyant-travel/catalog-react@0.262.0

## 0.265.0

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/storefront@0.251.0
  - @voyant-travel/catalog-react@0.261.0
  - @voyant-travel/storefront-sdk@0.257.0
  - @voyant-travel/accommodations@0.204.0

## 0.264.0

### Patch Changes

- @voyant-travel/storefront@0.250.0
- @voyant-travel/storefront-sdk@0.256.0
- @voyant-travel/catalog-react@0.260.0

## 0.263.0

### Patch Changes

- @voyant-travel/storefront@0.249.0
- @voyant-travel/storefront-sdk@0.255.0
- @voyant-travel/catalog-react@0.259.0

## 0.262.0

### Patch Changes

- @voyant-travel/accommodations@0.203.0
- @voyant-travel/storefront@0.248.0
- @voyant-travel/storefront-sdk@0.254.0
- @voyant-travel/catalog-react@0.258.0

## 0.261.0

### Patch Changes

- @voyant-travel/storefront@0.247.0
- @voyant-travel/catalog-react@0.257.0
- @voyant-travel/storefront-sdk@0.253.0

## 0.260.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0
  - @voyant-travel/catalog-react@0.256.0
  - @voyant-travel/storefront-sdk@0.252.0
  - @voyant-travel/storefront@0.246.0

## 0.259.0

### Patch Changes

- @voyant-travel/catalog-react@0.255.0

## 0.258.0

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0
  - @voyant-travel/catalog-react@0.254.0

## 0.257.0

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

## 0.256.0

### Minor Changes

- 9ef6a65: Price storefront detail pages through the non-binding Offer Preview.

  The product, accommodation and cruise detail pages still called
  `useBookingQuote`, which POSTs to `/v1/{surface}/catalog/quote` — a route v1
  deleted. All three have been 404ing in production: no price, no availability,
  a sidebar stuck on "pricing pending". They now call
  `POST /v1/{surface}/catalog/offers/preview`.

  **Why not just open a Booking Session.** A shopper nudging a pax stepper has
  not attempted to book anything. Sessions are persisted, revisioned,
  capability-bearing, expiring rows that a sweep has to reap; minting one per
  keystroke floods `booking_sessions` at real traffic, and it also asserts
  something untrue — that this shopper has started a booking. A price probe is a
  read. The preview mints no identifier, persists nothing, and says
  `binding: false`.

  **The preview target union is wider than the Session-create one, deliberately.**
  `offerPreviewTargetV1` admits `product | catalog_item | owned_entity`;
  `createBookingSessionTargetV1` still admits only `product | catalog_item`. A
  preview is a read, so it admits any bookable target. Creating a Session is a
  write that allocates capability and capacity, so it stays narrower. The
  practical consequence: accommodations and cruises are `owned_entity` targets,
  and without the widening two of the three shipped detail pages could not ask
  what anything costs. The members are reused from `bookingSessionTargetV1`
  rather than redeclared so the two unions cannot drift field by field;
  `trip_snapshot` is excluded, being composed server-side from an accepted
  Proposal and never what a detail page points at.

  **`useOfferPreview`** (`@voyant-travel/catalog-react/booking-engine`) is the
  client. It keeps the parts of `useBookingQuote` that encode fixed bugs: the
  250ms debounce, the pricing-significant signature so a cosmetic edit costs no
  round trip, `placeholderData` so the price swaps in place instead of blanking,
  and — the voyant#2643 case — dropping the previous result on a scope change, so
  a stale-market price can never be shown while the re-scoped read is in flight.
  A rejected outcome raises `OfferPreviewRejectedError` rather than arriving as
  data, keeping "there is no preview" distinct from "here is a preview that says
  unavailable"; the latter is a normal renderable result.

  **Detail pages now render the server's requirements, not their own guesses.**
  The preview returns `requirements` even when there is no price, so `PaxBlock`
  takes each band's real `minCount`/`maxCount` from `requirements.paxBands`
  instead of the hardcoded "8 adults, 6 children, 4 infants" that was true of no
  product in particular, and the cruise occupancy stepper takes its bounds from
  the sailing's adult band. Tier-qualified band codes
  (`"child:pricing_categories_…"`) collapse onto their canonical code. The
  hardcoded values survive only as the fallback covering the moment before the
  first preview lands.

  `BookingSidebar` takes `preview` / `isPreviewing` in place of `quoteData` /
  `isQuoting`, and translates the preview's five-member `unavailableReason`
  vocabulary (en + ro) instead of beta's open per-vertical strings — which would
  otherwise have reached shoppers as raw enum members.

  `useBookingQuote`, `useBookingDraft` and `useBookingHold` are untouched; two
  other hosts still use them.

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog-react@0.252.0
  - @voyant-travel/storefront-sdk@0.251.0

## 0.255.0

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/storefront-sdk@0.250.0
  - @voyant-travel/catalog-react@0.251.0

## 0.254.0

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog-react@0.250.0
  - @voyant-travel/storefront-sdk@0.249.0

## 0.253.0

### Patch Changes

- @voyant-travel/storefront@0.245.0
- @voyant-travel/catalog-react@0.249.0
- @voyant-travel/storefront-sdk@0.248.0

## 0.252.0

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog-react@0.248.0
  - @voyant-travel/storefront-sdk@0.247.0

## 0.251.0

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
  - @voyant-travel/accommodations@0.202.0
  - @voyant-travel/catalog-react@0.247.0
  - @voyant-travel/storefront-sdk@0.246.0
  - @voyant-travel/storefront@0.244.0

## 0.250.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/accommodations@0.201.0
  - @voyant-travel/catalog-react@0.246.0
  - @voyant-travel/storefront-sdk@0.245.0
  - @voyant-travel/storefront@0.243.0

## 0.249.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/accommodations@0.200.0
  - @voyant-travel/catalog-react@0.245.0
  - @voyant-travel/storefront-sdk@0.244.0
  - @voyant-travel/storefront@0.242.0

## 0.248.0

### Patch Changes

- @voyant-travel/catalog-react@0.244.0

## 0.247.0

### Patch Changes

- Updated dependencies [ff0b8cc]
- Updated dependencies [b3cfd05]
  - @voyant-travel/i18n@0.121.0
  - @voyant-travel/storefront@0.241.0
  - @voyant-travel/catalog-react@0.243.0
  - @voyant-travel/storefront-sdk@0.243.0

## 0.246.0

### Patch Changes

- @voyant-travel/catalog-react@0.242.0

## 0.245.0

### Patch Changes

- @voyant-travel/catalog-react@0.241.0

## 0.244.0

### Patch Changes

- @voyant-travel/storefront@0.240.0
- @voyant-travel/catalog-react@0.240.0
- @voyant-travel/storefront-sdk@0.242.0

## 0.243.0

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/i18n@0.120.0
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog-react@0.239.0
  - @voyant-travel/accommodations@0.199.0
  - @voyant-travel/storefront@0.239.0
  - @voyant-travel/storefront-sdk@0.241.0

## 0.242.0

### Patch Changes

- @voyant-travel/catalog-react@0.238.0

## 0.241.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0
  - @voyant-travel/accommodations@0.198.0
  - @voyant-travel/catalog-react@0.237.0
  - @voyant-travel/storefront-sdk@0.240.0

## 0.240.0

### Patch Changes

- @voyant-travel/catalog-react@0.236.0

## 0.239.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/i18n@0.119.4
  - @voyant-travel/storefront-sdk@0.239.0
  - @voyant-travel/accommodations@0.197.0
  - @voyant-travel/catalog-react@0.235.0

## 0.238.0

### Patch Changes

- @voyant-travel/accommodations@0.196.0
- @voyant-travel/storefront@0.238.0
- @voyant-travel/storefront-sdk@0.238.0
- @voyant-travel/catalog-react@0.234.0

## 0.237.0

### Patch Changes

- @voyant-travel/storefront@0.237.0
- @voyant-travel/storefront-sdk@0.237.0
- @voyant-travel/catalog-react@0.233.0
- @voyant-travel/accommodations@0.195.0

## 0.236.0

### Minor Changes

- 2ed62d3: Remove the beta Booking-backed session and low-level public Booking creation
  surfaces. Custom storefronts now construct reservations exclusively through
  Catalog Booking Session v1, while Bookings exposes only committed-reservation
  overview and guest-access routes.

### Patch Changes

- Updated dependencies [2ed62d3]
  - @voyant-travel/storefront@0.236.0
  - @voyant-travel/storefront-sdk@0.236.0
  - @voyant-travel/accommodations@0.194.0
  - @voyant-travel/catalog-react@0.232.0

## 0.235.0

### Patch Changes

- @voyant-travel/accommodations@0.193.0
- @voyant-travel/storefront@0.235.0
- @voyant-travel/storefront-sdk@0.235.0
- @voyant-travel/catalog-react@0.231.0

## 0.234.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/catalog-react@0.230.0
  - @voyant-travel/storefront-sdk@0.234.0
  - @voyant-travel/accommodations@0.192.0
  - @voyant-travel/storefront@0.234.0

## 0.233.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog-react@0.229.0
  - @voyant-travel/i18n@0.119.3
  - @voyant-travel/storefront@0.233.0
  - @voyant-travel/accommodations@0.191.0
  - @voyant-travel/storefront-sdk@0.233.0

## 0.232.0

### Patch Changes

- Updated dependencies [79606bb]
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/accommodations@0.190.0
  - @voyant-travel/storefront@0.232.0
  - @voyant-travel/storefront-sdk@0.232.0
  - @voyant-travel/catalog-react@0.228.0

## 0.231.1

## 0.231.0

### Patch Changes

- 5d3b563: Complete the Booking Session v1 owned Product tracer with server-derived access context,
  creation-only anonymous capability material, idempotent Quote/Hold/update/abandon/Commit
  operations, and production Commit wiring through the admitted Finance self-service create
  transaction callback.
- f25ad34: Add the Booking Platform v1 lifecycle commitment-policy schemas and reusable conformance scenarios.

  Implement the first owned Product Booking Session v1 tracer with exact-revision
  Quote, capability-gated public mutations, real-capacity Hold, atomic Commit
  outcome, persistent repository adapter, Storefront SDK, and React hook surfaces.

- 2601445: Continue owned Product Booking Session Commit through an idempotent pre-Booking
  Finance payment session, selected payment adapter, and atomic transfer to the
  created Booking. Expose typed payment-required continuation and recovery through
  the shared route contract, Storefront SDK, and React hooks.
- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/storefront-sdk@0.231.0
  - @voyant-travel/accommodations@0.189.0
  - @voyant-travel/catalog-react@0.227.0
  - @voyant-travel/storefront@0.231.0

## 0.230.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/auth-react@0.150.0
  - @voyant-travel/catalog-react@0.226.0
  - @voyant-travel/storefront@0.230.0
  - @voyant-travel/accommodations@0.188.0

## 0.229.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/i18n@0.119.2
  - @voyant-travel/accommodations@0.187.0
  - @voyant-travel/storefront@0.229.0
  - @voyant-travel/catalog-react@0.225.0

## 0.228.0

### Patch Changes

- @voyant-travel/accommodations@0.186.0
- @voyant-travel/storefront@0.228.0
- @voyant-travel/catalog-react@0.224.0

## 0.227.0

### Patch Changes

- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/storefront@0.227.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/accommodations@0.185.0
  - @voyant-travel/auth-react@0.149.0
  - @voyant-travel/catalog-react@0.223.0

## 0.226.0

### Patch Changes

- @voyant-travel/accommodations@0.184.0
- @voyant-travel/storefront@0.226.0
- @voyant-travel/admin@0.132.0
- @voyant-travel/auth-react@0.148.0
- @voyant-travel/catalog-react@0.222.0

## 0.225.1

## 0.225.0

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/storefront@0.225.0
  - @voyant-travel/accommodations@0.183.0
  - @voyant-travel/catalog-react@0.221.0

## 0.224.0

### Patch Changes

- Updated dependencies [90361d6]
  - @voyant-travel/auth-react@0.147.0
  - @voyant-travel/catalog-react@0.220.0
  - @voyant-travel/storefront@0.224.0
  - @voyant-travel/accommodations@0.182.0

## 0.223.1

## 0.223.0

### Minor Changes

- 52c794d: Remove the anonymous `contact-exists` endpoints.

  `GET /v1/public/customer-portal/contact-exists` and its `/phone` sibling told
  any unauthenticated caller whether an address had an auth account, whether it
  had a customer record, and whether that record was already claimed by someone
  else. That is an account enumeration oracle, and rate limiting only slows it
  down.

  **Breaking.** Both routes are gone, along with `getCustomerPortalContactExists`,
  `getCustomerPortalPhoneContactExists`, their query options, hooks, filters, and
  result types. The customer-portal public bundle now declares no anonymous
  routes at all.

  Storefronts should start a verification challenge instead: the API response is
  identical whether or not an account exists, the delivered message differs, and
  the client branches on what the user does next rather than on an answer the
  server should not give an anonymous caller.

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/storefront@0.223.0
  - @voyant-travel/accommodations@0.181.0
  - @voyant-travel/catalog-react@0.219.0
  - @voyant-travel/auth-react@0.146.1

## 0.222.0

### Patch Changes

- Updated dependencies [7496159]
- Updated dependencies [7496159]
  - @voyant-travel/auth-react@0.146.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/accommodations@0.180.0
  - @voyant-travel/storefront@0.222.0
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/catalog-react@0.218.0

## 0.221.1

### Patch Changes

- Updated dependencies [268f341]
  - @voyant-travel/storefront@0.221.1

## 0.221.0

### Patch Changes

- @voyant-travel/storefront@0.221.0
- @voyant-travel/catalog-react@0.217.0
- @voyant-travel/accommodations@0.179.0

## 0.220.0

### Patch Changes

- @voyant-travel/accommodations@0.178.0
- @voyant-travel/storefront@0.220.0
- @voyant-travel/catalog-react@0.216.0

## 0.219.0

### Patch Changes

- @voyant-travel/storefront@0.219.0
- @voyant-travel/accommodations@0.177.0
- @voyant-travel/catalog-react@0.215.0

## 0.218.1

### Patch Changes

- Updated dependencies [a653664]
  - @voyant-travel/storefront@0.218.1
  - @voyant-travel/catalog-react@0.214.1

## 0.218.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/accommodations@0.176.0
  - @voyant-travel/storefront@0.218.0
  - @voyant-travel/catalog-react@0.214.0

## 0.217.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/storefront@0.217.0
  - @voyant-travel/catalog-react@0.213.0
  - @voyant-travel/accommodations@0.175.0

## 0.216.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/auth-react@0.145.0
  - @voyant-travel/catalog-react@0.212.0
  - @voyant-travel/storefront@0.216.0
  - @voyant-travel/accommodations@0.174.0

## 0.215.0

### Patch Changes

- @voyant-travel/storefront@0.215.0
- @voyant-travel/catalog-react@0.211.0
- @voyant-travel/accommodations@0.173.0

## 0.214.0

### Patch Changes

- @voyant-travel/accommodations@0.172.0
- @voyant-travel/catalog-react@0.210.0
- @voyant-travel/storefront@0.214.0

## 0.213.0

### Patch Changes

- @voyant-travel/accommodations@0.171.0
- @voyant-travel/catalog-react@0.209.0
- @voyant-travel/storefront@0.213.0

## 0.212.0

### Patch Changes

- @voyant-travel/accommodations@0.170.0
- @voyant-travel/catalog-react@0.208.0
- @voyant-travel/storefront@0.212.0

## 0.211.0

### Patch Changes

- @voyant-travel/accommodations@0.169.0
- @voyant-travel/storefront@0.211.0
- @voyant-travel/catalog-react@0.207.0

## 0.210.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/auth-react@0.144.0
  - @voyant-travel/catalog-react@0.206.0
  - @voyant-travel/storefront@0.210.0
  - @voyant-travel/accommodations@0.168.0

## 0.209.2

### Patch Changes

- Updated dependencies [560f7c3]
- Updated dependencies [560f7c3]
  - @voyant-travel/accommodations@0.167.2
  - @voyant-travel/storefront@0.209.2
  - @voyant-travel/catalog-react@0.205.1

## 0.209.1

### Patch Changes

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/accommodations@0.167.1
  - @voyant-travel/storefront@0.209.1

## 0.209.0

### Patch Changes

- @voyant-travel/accommodations@0.167.0
- @voyant-travel/storefront@0.209.0
- @voyant-travel/catalog-react@0.205.0

## 0.208.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/storefront@0.208.0
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/catalog-react@0.204.0
  - @voyant-travel/accommodations@0.166.0

## 0.207.0

### Patch Changes

- @voyant-travel/accommodations@0.165.0
- @voyant-travel/storefront@0.207.0
- @voyant-travel/catalog-react@0.203.0

## 0.206.0

### Patch Changes

- @voyant-travel/catalog-react@0.202.0
- @voyant-travel/storefront@0.206.0
- @voyant-travel/accommodations@0.164.0

## 0.205.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/catalog-react@0.201.0
  - @voyant-travel/accommodations@0.163.0
  - @voyant-travel/storefront@0.205.0
  - @voyant-travel/auth-react@0.143.6

## 0.204.0

### Patch Changes

- @voyant-travel/accommodations@0.162.0
- @voyant-travel/catalog-react@0.200.0
- @voyant-travel/storefront@0.204.0

## 0.203.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/accommodations@0.161.1
  - @voyant-travel/storefront@0.203.1
  - @voyant-travel/auth-react@0.143.5
  - @voyant-travel/catalog-react@0.199.1

## 0.203.0

### Patch Changes

- @voyant-travel/accommodations@0.161.0
- @voyant-travel/storefront@0.203.0
- @voyant-travel/catalog-react@0.199.0

## 0.202.0

### Patch Changes

- @voyant-travel/storefront@0.202.0
- @voyant-travel/accommodations@0.160.0
- @voyant-travel/ui@0.109.6
- @voyant-travel/catalog-react@0.198.0
- @voyant-travel/auth-react@0.143.4

## 0.201.0

### Patch Changes

- Updated dependencies [c03ff60]
  - @voyant-travel/accommodations@0.159.0
  - @voyant-travel/storefront@0.201.0
  - @voyant-travel/catalog-react@0.197.0
  - @voyant-travel/auth-react@0.143.3

## 0.200.1

### Patch Changes

- e2cb9f5: Clean up misused Card components. Cards that added their own vertical padding on
  top of the Card's built-in padding (double-padded content) now rely on the
  card's spacing, and the booking "Internal notes" card uses a proper card header
  and title instead of a label buried in the body. Empty-state, edge-to-edge, and
  image-tile cards are unchanged.
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
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/auth-react@0.143.2
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/catalog-react@0.196.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/storefront@0.200.1

## 0.200.0

### Patch Changes

- @voyant-travel/storefront@0.200.0
- @voyant-travel/accommodations@0.158.0
- @voyant-travel/catalog-react@0.196.0

## 0.199.0

### Patch Changes

- @voyant-travel/accommodations@0.157.0
- @voyant-travel/storefront@0.199.0
- @voyant-travel/catalog-react@0.195.0
- @voyant-travel/auth-react@0.143.1

## 0.198.0

### Patch Changes

- Updated dependencies [0190317]
- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
  - @voyant-travel/accommodations@0.156.0
  - @voyant-travel/storefront@0.198.0
  - @voyant-travel/auth-react@0.143.0
  - @voyant-travel/catalog-react@0.194.0

## 0.197.0

### Patch Changes

- @voyant-travel/accommodations@0.155.0
- @voyant-travel/storefront@0.197.0
- @voyant-travel/catalog-react@0.193.0

## 0.196.0

### Patch Changes

- @voyant-travel/accommodations@0.154.0
- @voyant-travel/catalog-react@0.192.0
- @voyant-travel/storefront@0.196.0

## 0.195.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/accommodations@0.153.0
  - @voyant-travel/storefront@0.195.0
  - @voyant-travel/auth-react@0.142.0
  - @voyant-travel/catalog-react@0.191.0

## 0.194.1

### Patch Changes

- @voyant-travel/accommodations@0.152.1
- @voyant-travel/storefront@0.194.1
- @voyant-travel/auth-react@0.141.5
- @voyant-travel/catalog-react@0.190.1

## 0.194.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/storefront@0.194.0
  - @voyant-travel/catalog-react@0.190.0
  - @voyant-travel/accommodations@0.152.0

## 0.193.0

### Patch Changes

- @voyant-travel/accommodations@0.151.0
- @voyant-travel/storefront@0.193.0
- @voyant-travel/catalog-react@0.189.0

## 0.192.1

### Patch Changes

- Updated dependencies [bacae5e]
  - @voyant-travel/storefront@0.192.1

## 0.192.0

### Patch Changes

- @voyant-travel/accommodations@0.150.0
- @voyant-travel/storefront@0.192.0
- @voyant-travel/catalog-react@0.188.0
- @voyant-travel/auth-react@0.141.4

## 0.191.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/accommodations@0.149.0
  - @voyant-travel/catalog-react@0.187.0
  - @voyant-travel/storefront@0.191.0

## 0.190.0

### Patch Changes

- @voyant-travel/accommodations@0.148.0
- @voyant-travel/storefront@0.190.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/catalog-react@0.186.0
- @voyant-travel/auth-react@0.141.3

## 0.189.1

### Patch Changes

- Updated dependencies [406cebb]
  - @voyant-travel/storefront@0.189.1

## 0.189.0

### Patch Changes

- @voyant-travel/catalog-react@0.185.0
- @voyant-travel/storefront@0.189.0
- @voyant-travel/accommodations@0.147.0

## 0.188.0

### Patch Changes

- @voyant-travel/catalog-react@0.184.0
- @voyant-travel/storefront@0.188.0
- @voyant-travel/accommodations@0.146.0

## 0.187.0

### Patch Changes

- @voyant-travel/accommodations@0.145.0
- @voyant-travel/storefront@0.187.0
- @voyant-travel/catalog-react@0.183.0

## 0.186.0

### Patch Changes

- @voyant-travel/catalog-react@0.182.0
- @voyant-travel/storefront@0.186.0
- @voyant-travel/accommodations@0.144.0

## 0.185.0

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/storefront@0.185.0
  - @voyant-travel/catalog-react@0.181.0
  - @voyant-travel/accommodations@0.143.0

## 0.184.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/auth-react@0.141.2
  - @voyant-travel/catalog-react@0.180.2
  - @voyant-travel/storefront@0.184.2

## 0.184.1

### Patch Changes

- @voyant-travel/accommodations@0.142.1
- @voyant-travel/storefront@0.184.1
- @voyant-travel/auth-react@0.141.1
- @voyant-travel/catalog-react@0.180.1

## 0.184.0

### Patch Changes

- @voyant-travel/auth-react@0.141.0
- @voyant-travel/storefront@0.184.0
- @voyant-travel/catalog-react@0.180.0
- @voyant-travel/accommodations@0.142.0

## 0.183.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/accommodations@0.141.0
  - @voyant-travel/storefront@0.183.0
  - @voyant-travel/catalog-react@0.179.0

## 0.182.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/auth-react@0.140.2
  - @voyant-travel/catalog-react@0.178.1
  - @voyant-travel/storefront@0.182.1

## 0.182.0

### Minor Changes

- ecf1680: Remove the redundant singular storefront branding admin surface and make the
  organization (operator) profile the single home for org brand identity.

  Storefronts are plural (many per org, managed under the top-level "Storefronts"
  surface). The leftover singular "storefront" Settings page edited a separate
  branding blob (logo/favicon/brand mark/colors/languages) that duplicated brand
  identity already modeled on the operator profile. Per-storefront visuals are a
  developer's frontend concern, not an admin one, so the surface and its storage
  schema are dropped.

  - storefront: drop the module `admin` block (branding settings page + branding
    setup step) and remove the `branding` shape from the storefront settings
    schema, service, admin/public routes, and OpenAPI documents. No database
    migration is required — storefront branding was never persisted to a table;
    it lived only in static deployment settings.
  - storefront-react / storefront-sdk: remove `createSelectedStorefrontAdminExtension`,
    the storefront settings page/form, and the `./admin`, `./ui`, and
    `./components/storefront-settings-page` package exports. `StorefrontSettingsRecord`
    and the settings schemas no longer carry `branding`.
  - operator-settings-react / i18n / legal: rename the user-facing "Operator
    profile" label to "Organization" ("Organizație" in Romanian) across the
    settings nav, page title, saved-toast copy, and contract template-authoring
    descriptions. The API path, `operator_profile` table, ids, and query keys are
    unchanged.

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront@0.182.0
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/auth-react@0.140.1
  - @voyant-travel/catalog-react@0.178.0
  - @voyant-travel/accommodations@0.140.0

## 0.181.0

### Patch Changes

- Updated dependencies [4f34425]
  - @voyant-travel/auth-react@0.140.0
  - @voyant-travel/storefront@0.181.0
  - @voyant-travel/catalog-react@0.177.0
  - @voyant-travel/accommodations@0.139.0

## 0.180.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/auth-react@0.139.0
  - @voyant-travel/catalog-react@0.176.0
  - @voyant-travel/storefront@0.180.0
  - @voyant-travel/accommodations@0.138.0

## 0.179.0

### Patch Changes

- @voyant-travel/accommodations@0.137.0
- @voyant-travel/storefront@0.179.0
- @voyant-travel/auth-react@0.138.0
- @voyant-travel/catalog-react@0.175.0

## 0.178.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/auth-react@0.137.0
  - @voyant-travel/storefront@0.178.0
  - @voyant-travel/accommodations@0.136.0
  - @voyant-travel/catalog-react@0.174.0

## 0.177.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/storefront@0.177.0
  - @voyant-travel/auth-react@0.136.0
  - @voyant-travel/accommodations@0.135.0
  - @voyant-travel/catalog-react@0.173.0

## 0.176.0

### Patch Changes

- @voyant-travel/accommodations@0.134.0
- @voyant-travel/storefront@0.176.0
- @voyant-travel/catalog-react@0.172.0
- @voyant-travel/auth-react@0.135.1

## 0.175.0

### Patch Changes

- @voyant-travel/auth-react@0.135.0
- @voyant-travel/catalog-react@0.171.0
- @voyant-travel/storefront@0.175.0
- @voyant-travel/accommodations@0.133.0

## 0.174.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/storefront@0.174.0
  - @voyant-travel/auth-react@0.134.0
  - @voyant-travel/accommodations@0.132.0
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/catalog-react@0.170.0

## 0.173.1

### Patch Changes

- @voyant-travel/accommodations@0.131.1
- @voyant-travel/storefront@0.173.1
- @voyant-travel/auth-react@0.133.4
- @voyant-travel/catalog-react@0.169.1

## 0.173.0

### Patch Changes

- @voyant-travel/accommodations@0.131.0
- @voyant-travel/storefront@0.173.0
- @voyant-travel/catalog-react@0.169.0

## 0.172.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/accommodations@0.130.0
  - @voyant-travel/storefront@0.172.0
  - @voyant-travel/catalog-react@0.168.0
  - @voyant-travel/auth-react@0.133.3

## 0.171.2

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/auth-react@0.133.2
  - @voyant-travel/storefront@0.171.2

## 0.171.1

### Patch Changes

- @voyant-travel/accommodations@0.129.1
- @voyant-travel/storefront@0.171.1
- @voyant-travel/auth-react@0.133.1
- @voyant-travel/catalog-react@0.167.1

## 0.171.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/auth-react@0.133.0
  - @voyant-travel/catalog-react@0.167.0
  - @voyant-travel/storefront@0.171.0
  - @voyant-travel/accommodations@0.129.0

## 0.170.0

### Patch Changes

- @voyant-travel/accommodations@0.128.0
- @voyant-travel/storefront@0.170.0
- @voyant-travel/catalog-react@0.166.0

## 0.169.0

### Patch Changes

- @voyant-travel/storefront@0.169.0
- @voyant-travel/accommodations@0.127.0
- @voyant-travel/catalog-react@0.165.0

## 0.168.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/storefront@0.168.0
  - @voyant-travel/accommodations@0.126.0
  - @voyant-travel/auth-react@0.132.5
  - @voyant-travel/catalog-react@0.164.0

## 0.167.0

### Patch Changes

- @voyant-travel/accommodations@0.125.0
- @voyant-travel/storefront@0.167.0
- @voyant-travel/catalog-react@0.163.0

## 0.166.0

### Patch Changes

- @voyant-travel/accommodations@0.124.0
- @voyant-travel/catalog-react@0.162.0
- @voyant-travel/storefront@0.166.0

## 0.165.0

### Patch Changes

- @voyant-travel/accommodations@0.123.0
- @voyant-travel/storefront@0.165.0
- @voyant-travel/catalog-react@0.161.0
- @voyant-travel/auth-react@0.132.3

## 0.164.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/accommodations@0.122.0
  - @voyant-travel/storefront@0.164.0
  - @voyant-travel/catalog-react@0.160.0
  - @voyant-travel/auth-react@0.132.1

## 0.163.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/auth-react@0.132.0
  - @voyant-travel/catalog-react@0.159.0
  - @voyant-travel/storefront@0.163.0
  - @voyant-travel/accommodations@0.121.0

## 0.162.0

### Patch Changes

- Updated dependencies [5617f37]
- Updated dependencies [eae32f8]
  - @voyant-travel/accommodations@0.120.0
  - @voyant-travel/storefront@0.162.0
  - @voyant-travel/auth-react@0.131.0
  - @voyant-travel/catalog-react@0.158.0

## 0.161.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- b459761: Accept current Lucide releases in public peer ranges so the standard Operator package closure
  resolves for external npm consumers.
- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/auth-react@0.130.0
  - @voyant-travel/storefront@0.161.0
  - @voyant-travel/catalog-react@0.157.0
  - @voyant-travel/accommodations@0.119.0

## 0.160.0

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/auth-react@0.129.0
  - @voyant-travel/accommodations@0.118.0
  - @voyant-travel/catalog-react@0.156.0
  - @voyant-travel/storefront@0.160.0

## 0.159.0

### Patch Changes

- 0808b21: Publish canonical catalog search sort resolution, strengthen adapter conformance coverage, verify the Typesense implementation against the public runner, and remove provider-specific UI wording.
- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/catalog-react@0.155.0
  - @voyant-travel/storefront@0.159.0
  - @voyant-travel/accommodations@0.117.0

## 0.158.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/accommodations@0.116.1
  - @voyant-travel/auth-react@0.128.3
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/catalog-react@0.154.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/storefront@0.158.1
  - @voyant-travel/ui@0.109.1

## 0.158.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/storefront@0.158.0
  - @voyant-travel/accommodations@0.116.0
  - @voyant-travel/catalog-react@0.154.0
  - @voyant-travel/auth-react@0.128.2

## 0.157.2

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.
- Updated dependencies [d83d237]
  - @voyant-travel/storefront@0.157.2

## 0.157.1

### Patch Changes

- @voyant-travel/accommodations@0.115.1
- @voyant-travel/storefront@0.157.1
- @voyant-travel/auth-react@0.128.1
- @voyant-travel/catalog-react@0.153.1

## 0.157.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/storefront@0.157.0
  - @voyant-travel/auth-react@0.128.0
  - @voyant-travel/accommodations@0.115.0
  - @voyant-travel/catalog-react@0.153.0

## 0.156.0

### Patch Changes

- Updated dependencies [8bd906f]
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/accommodations@0.114.0
  - @voyant-travel/storefront@0.156.0
  - @voyant-travel/auth-react@0.127.0
  - @voyant-travel/catalog-react@0.152.0

## 0.155.0

### Minor Changes

- 490d132: Move Storefront intake persistence, customer presentation routes, route policy,
  and locale provider composition into package-owned selected graph contributions.
- 490d132: Expose package-owned storefront browse, content resolution, slot selection, and
  product, accommodation, and cruise detail components.

### Patch Changes

- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
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
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/storefront@0.155.0
  - @voyant-travel/auth-react@0.126.0
  - @voyant-travel/accommodations@0.113.0
  - @voyant-travel/catalog-react@0.151.0

## 0.154.0

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [263fb4d]
  - @voyant-travel/storefront@0.154.0

## 0.153.4

### Patch Changes

- @voyant-travel/storefront@0.153.4

## 0.153.3

### Patch Changes

- @voyant-travel/storefront@0.153.3

## 0.153.2

### Patch Changes

- @voyant-travel/storefront@0.153.2

## 0.153.1

### Patch Changes

- @voyant-travel/storefront@0.153.1

## 0.153.0

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/storefront@0.153.0

## 0.152.0

### Patch Changes

- @voyant-travel/storefront@0.152.0

## 0.151.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/storefront@0.151.1

## 0.151.0

### Patch Changes

- @voyant-travel/storefront@0.151.0

## 0.150.0

### Patch Changes

- @voyant-travel/storefront@0.150.0

## 0.149.0

### Patch Changes

- @voyant-travel/storefront@0.149.0

## 0.148.0

### Patch Changes

- @voyant-travel/storefront@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/storefront@0.147.0

## 0.146.0

### Patch Changes

- @voyant-travel/storefront@0.146.0

## 0.145.0

### Patch Changes

- @voyant-travel/storefront@0.145.0
- @voyant-travel/ui@0.108.11

## 0.144.0

### Patch Changes

- @voyant-travel/storefront@0.144.0

## 0.143.0

### Patch Changes

- @voyant-travel/storefront@0.143.0

## 0.142.0

### Patch Changes

- @voyant-travel/storefront@0.142.0

## 0.141.2

### Patch Changes

- ec207bd: Resolve localized public departure itinerary reads by accepting `languageTag`/`lang`
  query parameters, applying day and segment translations with base-content fallback,
  and exposing the query through first-party storefront clients.
- Updated dependencies [ec207bd]
  - @voyant-travel/storefront@0.141.2

## 0.141.1

### Patch Changes

- 1a3bd68: Serve owned cruise rows through the public cruise content service and re-enable
  cruises in storefront customer product routing.
- Updated dependencies [ecff8cf]
  - @voyant-travel/storefront@0.141.1

## 0.141.0

### Patch Changes

- Updated dependencies [52c52fc]
  - @voyant-travel/storefront@0.141.0

## 0.140.2

### Patch Changes

- @voyant-travel/storefront@0.140.2

## 0.140.1

### Patch Changes

- Updated dependencies [b254511]
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/storefront@0.140.1

## 0.140.0

### Patch Changes

- @voyant-travel/storefront@0.140.0

## 0.139.5

### Patch Changes

- 72a6324: Stop the storefront customer surface from linking to cruise detail pages that
  cannot render. The public cruise content endpoint serves sourced cruises only
  (no owned-cruise content projector), so owned/demo cruises surfaced by catalog
  search linked to a detail page that 404s or 400s. Cruises are removed from
  `storefrontCustomerBookableProductVerticals` so search and the customer detail
  route no longer offer them, mirroring the charter/flight gating from
  voyant#2640. Cruises remain fully searchable and admin-manageable; re-add the
  vertical once owned cruises can render public content end-to-end.
  - @voyant-travel/storefront@0.139.5

## 0.139.4

### Patch Changes

- cb8df9c: Add anonymous market discovery to the storefront client. `useStorefrontMarkets` (plus the `listStorefrontMarkets` operation and `getStorefrontMarketsQueryOptions`) fetches `GET /v1/public/markets` and validates the response against a local `storefrontMarketSchema` mirroring the public projection (`id`, `code`, `name`, `regionCode`, `countryCode`, `defaultLocale`, `defaultCurrency`, `locales`, `currencies`). Storefronts use this to present a market/currency/locale scope selector; the market `id` is the catalog-search scope key threaded into search as the `market` parameter.
  - @voyant-travel/storefront@0.139.4

## 0.139.3

### Patch Changes

- b58a2ec: Expose customer storefront product-detail routing helpers that exclude charters until a dedicated charter booking path exists.
  - @voyant-travel/storefront@0.139.3

## 0.139.2

### Patch Changes

- Updated dependencies [ce0f92d]
  - @voyant-travel/storefront@0.139.2

## 0.139.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storefront@0.139.1

## 0.139.0

### Patch Changes

- @voyant-travel/storefront@0.139.0

## 0.138.0

### Patch Changes

- @voyant-travel/storefront@0.138.0

## 0.137.0

### Patch Changes

- @voyant-travel/storefront@0.137.0

## 0.136.1

### Patch Changes

- @voyant-travel/storefront@0.136.1

## 0.136.0

### Patch Changes

- @voyant-travel/storefront@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/storefront@0.135.0
- @voyant-travel/ui@0.108.1

## 0.134.0

### Patch Changes

- @voyant-travel/storefront@0.134.0

## 0.133.1

### Patch Changes

- @voyant-travel/storefront@0.133.1

## 0.133.0

### Patch Changes

- @voyant-travel/storefront@0.133.0

## 0.132.0

### Patch Changes

- @voyant-travel/storefront@0.132.0

## 0.131.1

### Patch Changes

- Updated dependencies [733bf33]
  - @voyant-travel/storefront@0.131.1

## 0.131.0

### Patch Changes

- @voyant-travel/storefront@0.131.0

## 0.130.0

### Patch Changes

- Updated dependencies [63e99ca]
  - @voyant-travel/storefront@0.130.0

## 0.129.0

### Patch Changes

- @voyant-travel/storefront@0.129.0

## 0.128.0

### Patch Changes

- @voyant-travel/storefront@0.128.0

## 0.127.1

### Patch Changes

- Updated dependencies [1841ce2]
  - @voyant-travel/storefront@0.127.1

## 0.127.0

### Patch Changes

- @voyant-travel/storefront@0.127.0

## 0.126.0

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/storefront@0.126.0

## 0.125.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/storefront@0.125.0

## 0.124.0

### Patch Changes

- @voyant-travel/storefront@0.124.0

## 0.123.1

### Patch Changes

- Updated dependencies [832ac35]
  - @voyant-travel/storefront@0.123.1

## 0.123.0

### Patch Changes

- @voyant-travel/storefront@0.123.0

## 0.122.0

### Patch Changes

- Updated dependencies [13fe70b]
  - @voyant-travel/storefront@0.122.0

## 0.121.2

### Patch Changes

- Updated dependencies [756213e]
  - @voyant-travel/storefront@0.121.2

## 0.121.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
  - @voyant-travel/storefront@0.121.1

## 0.121.0

### Minor Changes

- 6196b3b: Move customer portal runtime and React surfaces under Storefront owner paths and
  remove the old customer-portal workspace packages. Remove the retired Checkout
  workspace packages now that Finance and Finance React own checkout collection
  services, hooks, and UI.

### Patch Changes

- Updated dependencies [3cc83b6]
- Updated dependencies [23fc4bd]
- Updated dependencies [47fef18]
- Updated dependencies [c8189fc]
- Updated dependencies [f916094]
- Updated dependencies [6196b3b]
  - @voyant-travel/storefront@0.121.0

## 0.120.1

### Patch Changes

- Updated dependencies [f71eddf]
  - @voyant-travel/storefront@0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/storefront@0.120.0

## 0.119.0

### Patch Changes

- @voyant-travel/storefront@0.119.0
- @voyant-travel/ui@0.106.1

## 0.118.0

### Patch Changes

- Updated dependencies [004fc38]
  - @voyant-travel/storefront@0.118.0

## 0.117.1

### Patch Changes

- @voyant-travel/storefront@0.117.1

## 0.117.0

### Patch Changes

- @voyant-travel/storefront@0.117.0

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/storefront@0.116.0

## 0.115.0

### Patch Changes

- @voyant-travel/storefront@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/storefront@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/storefront@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/storefront@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/storefront@0.111.0

## 0.110.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- @voyant-travel/storefront@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/storefront@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/storefront@0.108.0

## 0.107.1

### Patch Changes

- @voyant-travel/storefront@0.107.1

## 0.107.0

### Patch Changes

- @voyant-travel/storefront@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/storefront@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/storefront@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/react@0.104.1
- @voyant-travel/storefront@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/react@0.104.0
- @voyant-travel/storefront@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/react@0.103.0
- @voyant-travel/storefront@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/react@0.102.0
- @voyant-travel/storefront@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/react@0.101.2
- @voyant-travel/storefront@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/react@0.101.1
- @voyant-travel/storefront@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/react@0.101.0
- @voyant-travel/storefront@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/react@0.100.0
- @voyant-travel/storefront@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/react@0.99.0
- @voyant-travel/storefront@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/react@0.98.0
- @voyant-travel/storefront@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/react@0.97.0
- @voyant-travel/storefront@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/react@0.96.0
- @voyant-travel/storefront@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/react@0.95.0
- @voyant-travel/storefront@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/react@0.94.0
- @voyant-travel/storefront@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/react@0.93.0
- @voyant-travel/storefront@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/react@0.92.0
  - @voyant-travel/storefront@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/react@0.91.0
- @voyant-travel/storefront@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/react@0.90.0
- @voyant-travel/storefront@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/react@0.89.0
- @voyant-travel/storefront@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/react@0.88.0
- @voyant-travel/storefront@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/react@0.87.1
- @voyant-travel/storefront@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/react@0.87.0
- @voyant-travel/storefront@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/react@0.86.0
- @voyant-travel/storefront@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/react@0.85.4
- @voyant-travel/storefront@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/react@0.85.3
- @voyant-travel/storefront@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/react@0.85.2
- @voyant-travel/storefront@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/react@0.85.1
- @voyant-travel/storefront@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/react@0.85.0
- @voyant-travel/storefront@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/react@0.84.4
- @voyant-travel/storefront@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/react@0.84.3
- @voyant-travel/storefront@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/react@0.84.2
- @voyant-travel/storefront@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/react@0.84.1
- @voyant-travel/storefront@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/react@0.84.0
- @voyant-travel/storefront@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/react@0.83.1
- @voyant-travel/storefront@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/react@0.83.0
- @voyant-travel/storefront@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/react@0.82.1
- @voyant-travel/storefront@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/react@0.82.0
- @voyant-travel/storefront@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/react@0.81.21
- @voyant-travel/storefront@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/react@0.81.20
- @voyant-travel/storefront@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/react@0.81.19
- @voyant-travel/storefront@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/react@0.81.18
- @voyant-travel/storefront@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/react@0.81.17
- @voyant-travel/storefront@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/react@0.81.16
- @voyant-travel/storefront@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/react@0.81.15
- @voyant-travel/storefront@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/react@0.81.14
- @voyant-travel/storefront@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/react@0.81.13
  - @voyant-travel/storefront@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/react@0.81.12
- @voyant-travel/storefront@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/react@0.81.11
- @voyant-travel/storefront@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/react@0.81.10
- @voyant-travel/storefront@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/react@0.81.9
- @voyant-travel/storefront@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/react@0.81.8
- @voyant-travel/storefront@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/react@0.81.7
- @voyant-travel/storefront@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/react@0.81.6
- @voyant-travel/storefront@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/react@0.81.5
- @voyant-travel/storefront@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/react@0.81.4
- @voyant-travel/storefront@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/react@0.81.3
- @voyant-travel/storefront@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/react@0.81.2
- @voyant-travel/storefront@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/react@0.81.1
- @voyant-travel/storefront@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/react@0.81.0
- @voyant-travel/storefront@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/react@0.80.18
- @voyant-travel/storefront@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/react@0.80.17
- @voyant-travel/storefront@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/react@0.80.16
- @voyant-travel/storefront@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/react@0.80.15
- @voyant-travel/storefront@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/react@0.80.14
- @voyant-travel/storefront@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/react@0.80.13
- @voyant-travel/storefront@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/react@0.80.12
- @voyant-travel/storefront@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/react@0.80.11
- @voyant-travel/storefront@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/react@0.80.10
- @voyant-travel/storefront@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/react@0.80.9
- @voyant-travel/storefront@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/react@0.80.8
- @voyant-travel/storefront@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/react@0.80.7
- @voyant-travel/storefront@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/react@0.80.6
- @voyant-travel/storefront@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/react@0.80.5
- @voyant-travel/storefront@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/react@0.80.4
- @voyant-travel/storefront@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/react@0.80.3
- @voyant-travel/storefront@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/react@0.80.2
- @voyant-travel/storefront@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/react@0.80.1
- @voyant-travel/storefront@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/react@0.80.0
- @voyant-travel/storefront@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/react@0.79.0
- @voyant-travel/storefront@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/react@0.78.0
- @voyant-travel/storefront@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/react@0.77.13
- @voyant-travel/storefront@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/react@0.77.12
- @voyant-travel/storefront@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/react@0.77.11
- @voyant-travel/storefront@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/react@0.77.10
- @voyant-travel/storefront@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/react@0.77.9
- @voyant-travel/storefront@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/react@0.77.8
- @voyant-travel/storefront@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/react@0.77.7
- @voyant-travel/storefront@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/react@0.77.6
- @voyant-travel/storefront@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/react@0.77.5
- @voyant-travel/storefront@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/react@0.77.4
- @voyant-travel/storefront@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/react@0.77.3
- @voyant-travel/storefront@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/react@0.77.2
- @voyant-travel/storefront@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/react@0.77.1
- @voyant-travel/storefront@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/react@0.77.0
- @voyant-travel/storefront@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/react@0.76.0
- @voyant-travel/storefront@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/react@0.75.7
- @voyant-travel/storefront@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/react@0.75.6
- @voyant-travel/storefront@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/react@0.75.5
- @voyant-travel/storefront@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/react@0.75.4
- @voyant-travel/storefront@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/react@0.75.3
- @voyant-travel/storefront@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/react@0.75.2
- @voyant-travel/storefront@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/react@0.75.1
- @voyant-travel/storefront@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/react@0.75.0
  - @voyant-travel/storefront@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/react@0.74.2
- @voyant-travel/storefront@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/react@0.74.1
- @voyant-travel/storefront@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/react@0.74.0
- @voyant-travel/storefront@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/react@0.73.1
- @voyant-travel/storefront@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/react@0.73.0
- @voyant-travel/storefront@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/react@0.72.0
- @voyant-travel/storefront@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/react@0.71.0
- @voyant-travel/storefront@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/react@0.70.0
- @voyant-travel/storefront@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/react@0.69.1
- @voyant-travel/storefront@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/react@0.69.0
- @voyant-travel/storefront@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/react@0.68.0
- @voyant-travel/storefront@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/react@0.67.0
- @voyant-travel/storefront@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/react@0.66.6
- @voyant-travel/storefront@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/react@0.66.5
- @voyant-travel/storefront@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/react@0.66.4
- @voyant-travel/storefront@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/react@0.66.3
- @voyant-travel/storefront@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/react@0.66.2
- @voyant-travel/storefront@0.66.2

## 0.66.1

### Patch Changes

- Updated dependencies [e0b94f3]
  - @voyant-travel/react@0.66.1
  - @voyant-travel/storefront@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/react@0.66.0
- @voyant-travel/storefront@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/react@0.65.0
- @voyant-travel/storefront@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/react@0.64.1
- @voyant-travel/storefront@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/react@0.64.0
- @voyant-travel/storefront@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/react@0.63.1
- @voyant-travel/storefront@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/react@0.63.0
- @voyant-travel/storefront@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/react@0.62.3
- @voyant-travel/storefront@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/react@0.62.2
- @voyant-travel/storefront@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/react@0.62.1
- @voyant-travel/storefront@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/react@0.62.0
- @voyant-travel/storefront@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/react@0.61.0
- @voyant-travel/storefront@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/react@0.60.0
- @voyant-travel/storefront@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/react@0.59.0
- @voyant-travel/storefront@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/react@0.58.0
- @voyant-travel/storefront@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/react@0.57.0
- @voyant-travel/storefront@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/react@0.56.0
- @voyant-travel/storefront@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/react@0.55.1
- @voyant-travel/storefront@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/react@0.55.0
- @voyant-travel/storefront@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/react@0.54.0
- @voyant-travel/storefront@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/react@0.53.2
- @voyant-travel/storefront@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/react@0.53.1
- @voyant-travel/storefront@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/react@0.53.0
- @voyant-travel/storefront@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/react@0.52.4
- @voyant-travel/storefront@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/react@0.52.3
- @voyant-travel/storefront@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/react@0.52.2
- @voyant-travel/storefront@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/react@0.52.1
- @voyant-travel/storefront@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/react@0.52.0
- @voyant-travel/storefront@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/react@0.51.1
- @voyant-travel/storefront@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/react@0.51.0
- @voyant-travel/storefront@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/react@0.50.8
- @voyant-travel/storefront@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/react@0.50.7
- @voyant-travel/storefront@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/react@0.50.6
- @voyant-travel/storefront@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/react@0.50.5
- @voyant-travel/storefront@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/react@0.50.4
- @voyant-travel/storefront@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/react@0.50.3
- @voyant-travel/storefront@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/react@0.50.2
- @voyant-travel/storefront@0.50.2

## 0.50.1

### Patch Changes

- 7b768c5: Add storefront intake SDK helpers, expand storefront payment settings with split schedules and bank-transfer account metadata, and extend finance admin aggregates with dashboard counts, totals, and filters.
- Updated dependencies [7b768c5]
  - @voyant-travel/react@0.50.1
  - @voyant-travel/storefront@0.50.1

## 0.50.0

### Minor Changes

- 2ca0537: Add first-class admin storefront settings routes, React hooks, and an operator settings page for branding, support, legal, localization, payment defaults, and bank transfer display details.

### Patch Changes

- 875c76e: Extend the public departure price preview response with allocation, unit/room, extras, offer impact, and final totals blocks while preserving the existing simple quote fields.
- Updated dependencies [bf5747e]
- Updated dependencies [875c76e]
- Updated dependencies [2ca0537]
  - @voyant-travel/react@0.50.0
  - @voyant-travel/storefront@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/react@0.49.0
- @voyant-travel/storefront@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [9132fcf]
  - @voyant-travel/react@0.48.0
  - @voyant-travel/storefront@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/react@0.47.0
- @voyant-travel/storefront@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/react@0.46.0
- @voyant-travel/storefront@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [ed25837]
  - @voyant-travel/react@0.45.0
  - @voyant-travel/storefront@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/react@0.44.0
- @voyant-travel/storefront@0.44.0

## 0.43.0

### Minor Changes

- e9241a7: Add public storefront offer apply/redeem contracts, React mutation helpers, and promotions-backed resolver support for customer-facing manual and code-gated offer flows.

### Patch Changes

- Updated dependencies [e9241a7]
  - @voyant-travel/react@0.43.0
  - @voyant-travel/storefront@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/react@0.42.0
- @voyant-travel/storefront@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/react@0.41.3
- @voyant-travel/storefront@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/react@0.41.2
- @voyant-travel/storefront@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/react@0.41.1
- @voyant-travel/storefront@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/react@0.41.0
- @voyant-travel/storefront@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/react@0.40.1
- @voyant-travel/storefront@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/react@0.40.0
- @voyant-travel/storefront@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/react@0.39.0
- @voyant-travel/storefront@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/react@0.38.2
- @voyant-travel/storefront@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/react@0.38.1
- @voyant-travel/storefront@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/react@0.38.0
- @voyant-travel/storefront@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/react@0.37.1
- @voyant-travel/storefront@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/react@0.37.0
- @voyant-travel/storefront@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/react@0.36.0
- @voyant-travel/storefront@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/react@0.35.0
- @voyant-travel/storefront@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/react@0.34.0
- @voyant-travel/storefront@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/react@0.33.1
- @voyant-travel/storefront@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/react@0.33.0
- @voyant-travel/storefront@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/react@0.32.3
- @voyant-travel/storefront@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/react@0.32.2
- @voyant-travel/storefront@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/react@0.32.1
- @voyant-travel/storefront@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/react@0.32.0
- @voyant-travel/storefront@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/react@0.31.4
- @voyant-travel/storefront@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/react@0.31.3
- @voyant-travel/storefront@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/react@0.31.2
- @voyant-travel/storefront@0.31.2

## 0.31.1

### Patch Changes

- e96991c: Expose the selected `itineraryId` on storefront departure itinerary responses.
- Updated dependencies [e96991c]
  - @voyant-travel/react@0.31.1
  - @voyant-travel/storefront@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/react@0.31.0
- @voyant-travel/storefront@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/react@0.30.7
- @voyant-travel/storefront@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/react@0.30.6
- @voyant-travel/storefront@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/react@0.30.5
- @voyant-travel/storefront@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/react@0.30.4
- @voyant-travel/storefront@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/react@0.30.3
- @voyant-travel/storefront@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/react@0.30.2
- @voyant-travel/storefront@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/react@0.30.1
- @voyant-travel/storefront@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/react@0.30.0
- @voyant-travel/storefront@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [3420711]
  - @voyant-travel/react@0.29.0
  - @voyant-travel/storefront@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/react@0.28.3
- @voyant-travel/storefront@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/react@0.28.2
- @voyant-travel/storefront@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/react@0.28.1
- @voyant-travel/storefront@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/react@0.28.0
- @voyant-travel/storefront@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/react@0.27.0
- @voyant-travel/storefront@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/react@0.26.9
- @voyant-travel/storefront@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/react@0.26.8
- @voyant-travel/storefront@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/react@0.26.7
- @voyant-travel/storefront@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/react@0.26.6
- @voyant-travel/storefront@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/react@0.26.5
- @voyant-travel/storefront@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/react@0.26.4
- @voyant-travel/storefront@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/react@0.26.3
- @voyant-travel/storefront@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/react@0.26.2
- @voyant-travel/storefront@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/react@0.26.1
- @voyant-travel/storefront@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/react@0.26.0
- @voyant-travel/storefront@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/react@0.25.0
- @voyant-travel/storefront@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/react@0.24.3
- @voyant-travel/storefront@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [bec0471]
  - @voyant-travel/react@0.24.2
  - @voyant-travel/storefront@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/react@0.24.1
- @voyant-travel/storefront@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/react@0.24.0
- @voyant-travel/storefront@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [d177a55]
  - @voyant-travel/react@0.23.0
  - @voyant-travel/storefront@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/react@0.22.0
- @voyant-travel/storefront@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/react@0.21.1
- @voyant-travel/storefront@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/react@0.21.0
- @voyant-travel/storefront@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/react@0.20.0
- @voyant-travel/storefront@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/react@0.19.0
- @voyant-travel/storefront@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/react@0.18.0
- @voyant-travel/storefront@0.18.0

## 0.17.0

### Patch Changes

- @voyant-travel/react@0.17.0
- @voyant-travel/storefront@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/react@0.16.0
- @voyant-travel/storefront@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/react@0.15.0
- @voyant-travel/storefront@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/react@0.14.0
- @voyant-travel/storefront@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/react@0.13.0
- @voyant-travel/storefront@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/react@0.12.0
- @voyant-travel/storefront@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/react@0.11.0
- @voyant-travel/storefront@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/react@0.10.0
- @voyant-travel/storefront@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/react@0.9.0
- @voyant-travel/storefront@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/react@0.8.0
- @voyant-travel/storefront@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/react@0.7.0
- @voyant-travel/storefront@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/react@0.6.9
- @voyant-travel/storefront@0.6.9

## 0.6.8

### Patch Changes

- @voyant-travel/react@0.6.8
- @voyant-travel/storefront@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/react@0.6.7
- @voyant-travel/storefront@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/react@0.6.6
- @voyant-travel/storefront@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/react@0.6.5
- @voyant-travel/storefront@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/react@0.6.4
- @voyant-travel/storefront@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/react@0.6.3
- @voyant-travel/storefront@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/react@0.6.2
- @voyant-travel/storefront@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/react@0.6.1
- @voyant-travel/storefront@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/react@0.6.0
- @voyant-travel/storefront@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/react@0.5.0
- @voyant-travel/storefront@0.5.0

## 0.4.5

### Patch Changes

- @voyant-travel/react@0.4.5
- @voyant-travel/storefront@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/react@0.4.4
- @voyant-travel/storefront@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/react@0.4.3
- @voyant-travel/storefront@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/react@0.4.2
- @voyant-travel/storefront@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/react@0.4.1
- @voyant-travel/storefront@0.4.1

## 0.4.0

### Minor Changes

- e84fe0f: Add a React client package for the public storefront contract.

  The package includes typed operations, TanStack Query helpers, and hooks for
  storefront settings, departures, pricing preview, extensions, itinerary, and
  promotional offers.

### Patch Changes

- Updated dependencies [e84fe0f]
  - @voyant-travel/react@0.4.0
  - @voyant-travel/storefront@0.4.0
