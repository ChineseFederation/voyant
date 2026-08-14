# @voyant-travel/catalog-contracts

## 0.133.1

### Patch Changes

- c805276: Settle a paid Booking Session against the Quote its payment was collected for.

  A shopper left on the "payment is confirming" screen goes on quoting, and every
  refresh superseded the Quote behind them and released its Hold. Settlement then
  looked for "the Session's one active Quote", found one nobody had paid for, and
  was refused — on all eight retries — leaving a captured card payment with no
  booking and no seat.

  Re-quoting is now refused outright while a processor holds the shopper's money,
  settlement replays the Quote and Hold recorded on the payment rather than
  re-deriving today's, and a refused settlement no longer releases the Hold it was
  collected against. When a delivery does exhaust its attempts, `event.dead_lettered`
  now announces it and raises a stranded-payment staff alert instead of leaving a
  `failed` outbox row nobody reads.

  Also stops every anonymous storefront checkout resolving to the same payment
  processor Customer: the `anonymous-storefront` placeholder is no longer passed as
  a customer reference, and `verify:symbol-policy` now pins the sentinel to its one
  definition.

## 0.133.0

### Minor Changes

- 3d7ed59: Honour promotion codes on the Booking Session v1 quote.

  `promotionCode` had been declared on the public booking selection and accepted
  by the offer-preview and create-session routes since the beta quote path, but
  `normalizeBookingSelection` projected it away before any handler saw it — so a
  code could never change a price, and `createCatalogPromotionEvaluator`, the
  adapter written for exactly this hook, had no call sites at all after
  voyant#4188 deleted the beta `quoteEntity`.

  The code now survives normalization and `composeQuote` evaluates promotions
  through a new optional `CatalogCommerceRuntimeExtension.createPromotionEvaluator`
  seam. Auto-applied offers are evaluated too, not only code-gated ones: the
  catalog plane already advertises their discounted price, so quoting without
  them left the listing and the quote disagreeing. The discount lands as negative
  `discount` lines with `subtotal`/`taxTotal` scaled to preserve both the
  effective tax rate and `subtotal + taxTotal === total`; base lines are left
  alone so `fillMissingBookingItemSellAmounts` reconciles the booking to the
  discounted total at commit. A deployment with no promotions module wired quotes
  exactly as before.

  `pricingBreakdownV1` gains `appliedOffers` and `promotionCodeStatus`. The
  second is the missing piece behind voyant#4615: a rejected code does not make a
  departure unbookable, so a valid quote needs somewhere to say the code was
  wrong. Without it the operator's New booking form had to infer rejection from
  `available === false` and told them a departure with 13 places left was invalid.

  Redemption recording is live again. The `booking.confirmed` subscriber reads
  the applied offers through catalog's new `readAppliedOffersForBooking`, which
  spans `booking_session_quotes` and the legacy `catalog_quotes`, replacing a
  direct cross-module select that only ever saw the dead legacy table.

  On the manual booking form, `submitBlocked` no longer contains a bare
  `hasPromotionCode` (with an unreachable guard beneath it) and the persistent
  "not authoritative in Booking Session v1" alert is gone. A valid code applies
  and reprices; a rejected one blocks submission with copy that names why —
  unrecognised, expired, not yet valid, or not applicable — rather than a single
  generic "not valid for this booking".

## 0.132.1

### Patch Changes

- a1f9523: Preserve the exact server-selected supplier kind, connection, and source reference when a Trip composite session quotes and books sourced inventory.

## 0.132.0

### Minor Changes

- c164b40: Carry explicit storefront contract acceptance through Booking Session checkout so paid card bookings sign their numbered contract automatically and deferred bank transfers retain a numbered draft until settlement.

## 0.131.1

### Patch Changes

- 1a98c8a: Carry server-resolved sourced-stay identities and exact date, room, rate, and occupancy pins through opaque Trip selections, then revalidate price, lock, and confirm through the managed Connect lifecycle without exposing supplier authority to storefront clients.

## 0.131.0

### Minor Changes

- b95e995: Convert an exact opaque Storefront Trip selection revision into a server-priced
  composite Catalog Booking Session without exposing Trip or supplier authority
  identifiers to browser clients.
- b760ac6: Add a closed provider-first live cruise shopping seam with exact admitted-source ownership, managed presentation FX, opaque offer references, and Catalog Booking Session reservation/reconciliation payloads.

## 0.130.0

### Minor Changes

- 03a91d0: Add provider-neutral presentation-money and FX provenance contracts, fail-closed mixed-currency ranking for availability and flight fan-outs, and a server-only Voyant Data FX adapter for storefront shopping.

### Patch Changes

- 6b672c0: Commit sourced dynamic packages through a freshly validated Voyant Connect
  hold while preserving Catalog Booking Session quote and supplier-operation
  idempotency semantics.

## 0.129.0

### Minor Changes

- 21a28ef: Carry a quote-supported checkout intent through Booking Session commit, reject stale or unsupported choices before side effects, and return durable bank-transfer instructions when the host configures offline-payment orchestration.

## 0.128.0

### Minor Changes

- 688f164: The negotiated checkout handoff reaches the storefront that asked for it.

  The previous release let a Booking Session Commit state
  `payment.acceptedCheckoutHandoffs` and forwarded it to the adapter. Nothing
  carried the answer back: `payment_required.paymentSession` projected
  `redirectUrl`, which is only the redirect arm's flattened value and is `null`
  for an embedded one. So a storefront could ask for an in-page form, have the
  preference honoured all the way to the adapter, and be handed a
  `payment_required` with a null URL and no client secret — the token dying
  between the adapter and the only outcome the storefront reads. Half the path was
  inert.

  - `payment_required.paymentSession` gains `checkout`, the whole
    `PaymentHostedCheckout` union, alongside the unchanged `redirectUrl`. It is
    required-and-nullable like `redirectUrl`, so a lifecycle implementor that
    omits it fails to parse rather than silently starving the storefront.
  - The schema is re-exported from `@voyant-travel/finance-contracts` as
    `bookingPaymentCheckoutV1` rather than mirrored a third time. It is finance's
    object and that mirror is already pinned to the port by an annotated
    projection in finance's public service; a private copy here would be the drift
    the pin exists to prevent. Both are zod-only packages, so nothing
    runtime-shaped enters the closure.
  - `commitBookingSessionJourneyV1`'s `payment_required` result carries
    `paymentSessionId` and `checkout`.
  - An initiation that produces an embedded arm is recorded as `pending`, not
    `requires_redirect`. That state asserts there is somewhere to send the shopper
    and this arm has nowhere, so the two columns contradicted each other and every
    reader keyed on it — the status pollers, the pending aggregates, the reuse
    arms — would wait on a return trip nobody was sent on. `PaymentSessionState`
    is the framework's vocabulary and the conformance kit pins no state to the
    arm, so the framework settles it rather than trusting each adapter to.

## 0.127.0

### Minor Changes

- 56e2050: A Booking Session commit can state which checkout handoffs the storefront can
  render, and forwards it to the payment adapter.

  The payment port gained an `embedded` handoff and
  `PaymentInitiationInput.acceptedCheckoutHandoffs` to negotiate it, but nothing
  connected a Booking Session to either: `commitBookingSessionV1.payment` carried
  only `returnUrl` and `cancelUrl`, and the commit never set
  `acceptedCheckoutHandoffs` on the initiation. So the negotiation had no caller —
  a control plane could implement the embedded arm in full and still only ever be
  asked for a redirect.

  - `commitBookingSessionV1.payment.acceptedCheckoutHandoffs` is an ordered
    preference, most-preferred first. Absent means `["redirect"]`, so an existing
    storefront keeps getting a hosted page rather than a client secret it cannot
    mount.
  - The commit forwards it verbatim. It interprets none of it: the storefront is
    the only party that knows what it can render, and an adapter without
    `embeddedCheckout` still answers a client that prefers `embedded` with a
    redirect through the existing `negotiatePaymentCheckoutHandoff`.
  - `returnUrl` stays optional and is still accepted alongside an `embedded`
    preference — the shopper is not sent anywhere, but an issuer authentication
    step still wants a URL to return to.

  The `payment_required` outcome continues to project `redirectUrl` rather than
  the handoff union, so a storefront that asked for `embedded` reads the handoff
  back from `GET /v1/public/finance/payment-sessions/{id}`. `redirectUrl` is
  `null` for that arm, so `commitBookingSessionJourneyV1`'s `payment_required`
  result now also carries `paymentSessionId` — without it the preference the
  helper can now state would have nowhere to land.

## 0.126.0

### Minor Changes

- 6c77f7d: The booking selection's billing address carries a `region`, and the address it
  already declared now survives to the Booking.

  `bookingSelectionPublicV1.billing.address` had `line1`, `line2`, `city`,
  `postal`, `country` and no administrative subdivision, so a checkout could not
  record a state, province, or county. Romania needs it twice over: an invoice
  carries the _judet_, and Bucharest has no ordinary city/county pair — its six
  Sectors _are_ the county-level subdivision. The only encodings available were
  overloading `city` with `"Sector 3"` or hiding the county in an address line,
  both lossy (voyant#4290).

  `region` is free-form with ISO 3166-2 subdivision codes (`RO-B`, `RO-CJ`,
  `US-CA`) as the recommended encoding. It is not _enforced_ as ISO: the
  `bookings.contact_region` column it lands in is free text and already holds both
  `"Cluj"` and `"Ile-de-France"`, so gating the selection on a code would reject
  data the destination accepts. A Bucharest Sector is modelled as the Sector in
  `city` and `RO-B` in `region`.

  **The rest of the address was being dropped.** `normalizeBookingSelection`
  projected the billing address down to `country` alone — a leftover from the
  Session tracer (voyant#4039) — so a caller that filled in the billing step lost
  every line of it at the Session edge, and the Booking's `contact_*` columns came
  back empty even though the columns had been there all along. The projection now
  keeps all six fields, and they are carried the rest of the way:
  `SelfServiceBillingParty` gained the address, the products handler puts it on
  the booking-create command, and `createSourcedBookingCommitment` writes it for
  supplier-sourced bookings.

  The Session's card-payment handoff also fills `CardPaymentBilling`'s `state`,
  `city`, `postalCode`, and `details`, which it previously left empty — a
  processor that computes tax from the billing address needs the subdivision, not
  just the country.

  Address fields are now width-checked against the columns they settle into
  (`line1`/`line2` 500, `city`/`region` 100, `postal` 20, `country` 2). Previously
  unbounded: a payload that overran a column was admitted at the Session and failed
  at commit, where the caller could no longer tell which field was at fault. This
  is a tightening — a caller sending a full country name in `country` rather than
  an ISO 3166-1 alpha-2 code is now rejected at the Session instead of at commit.

  The operator's booking journey billing step draws a "County / region" input, and
  `address.region` is addressable as a booking-field requirement.

## 0.125.0

### Minor Changes

- 076c246: Delete the beta booking-engine quote path (voyant#4188).

  Voyant is beta: nothing below is aliased, deprecated, or kept for
  compatibility.

  **Deleted.** `quoteEntity` / `quoteEntitiesBatch` and the whole
  `catalog/src/booking-engine/quote.ts` module, including `QuoteEntityRequest`,
  `QuoteEntityResult`, `QuoteEntityDeps`, `QuoteContentEnricher`,
  `QuoteContentEnrichmentInput`, `QuoteScope` and `DEFAULT_QUOTE_TTL_MS`;
  `serializeQuoteResult`; the shape-enrichment seam
  (`createProductQuoteShapeEnricher`, `CatalogProductQuoteEnricher`,
  `inventory`'s `enrichProductQuoteShape`), superseded by the owned handler's
  `computeRequirements`; the beta tax recompute
  (`applyCatalogTaxToQuoteResult`, `applyOperatorTaxToQuoteResult`, and
  `CatalogRuntimeServices.applyTaxToQuoteResult`, which was its only caller and
  the last writer into `catalog_quotes`).

  From the **published** `@voyant-travel/catalog-contracts`: `quoteResponseV1`,
  `quoteRequestV1`, `quoteScopeV1`, `quoteBatchRequestV1`, `quoteBatchResultV1`,
  `quoteBatchResponseV1`, `quoteBatchCriteriaV1`, `quoteBatchSelectionV1` and
  their inferred types. No subpath changed. `bookRequestV1` / `bookResponseV1`
  are untouched.

  **Added.** `CatalogRuntimeServices.previewOffer(context, input)` — the v1
  stateless Offer Preview, exposed on the runtime surface so a server-side
  composer reaches the same `composeRequirements` / `composeQuote` ports the
  Booking Session lifecycle uses instead of opening a second pricing path. It
  replaces `applyTaxToQuoteResult` in the port's conformance set.

  **Trips moved onto the v1 lifecycle.** `createCatalogComponentAdapter().quote`
  prices a catalog-backed component through Offer Preview and returns
  `OfferPreviewResultV1`; `PriceTripDeps.quoteCatalogComponent` and
  `ReserveTripDeps.quoteCatalogComponentBeforeReserve` are retyped to match. The
  adapter no longer takes `ownedHandlers`, `evaluatePromotions` or
  `transformQuoteResult`. Because a preview is non-binding by construction, a
  priced catalog component no longer records `catalogQuoteId` and its
  `priceExpiresAt` is null — the binding price and its expiry are minted later by
  the accepted-Proposal Booking Session.

  **Kept, deliberately.** The `catalog_quotes` table. Commerce's
  `booking.confirmed` redemption recorder still reads historical
  `pricing_applied_offers` from it by `consumed_booking_id`; that subscriber is
  mounted and sits outside the retired quote path, so dropping the table would
  delete evidence read for already-shipped bookings. It now has no writer.
  Consequently promotion codes are not evaluated at quote time — the v1 Session
  `composeQuote` has no promotion hook yet, and adding one is separate work.
  `createCatalogPromotionEvaluator` and `recordPromotionRedemptionsForBooking`
  remain exported and are documented as unwired.

  The deleted identifiers are pinned to nowhere by a new
  `beta-quote-path-authority` entry in `symbol-policy.json`, and the deleted files
  are pinned in `retired-paths.json`.

## 0.124.0

### Minor Changes

- 9ef6a65: Add a non-binding Offer Preview read.

  Storefront detail pages — product, accommodation, cruise — have to show a live
  price and render the right configuration controls _before_ any Booking Session
  exists. Beta served that with `POST /catalog/quote`, which v1 deleted, and the
  only v1 replacement was to open a Session. That is the wrong trade: Sessions are
  persisted, revisioned, capability-bearing, expiring rows that a sweep has to
  reap, and a shopper nudging a pax stepper is not yet an attempt to book. One
  Session per keystroke floods `booking_sessions` at real traffic.

  `POST /v1/{admin,public}/catalog/offers/preview` answers the same question
  statelessly. `offerPreviewRequestV1` takes the Session create target union, the
  Session commercial scope and the public selection schema;
  `offerPreviewResultV1` returns `binding: false`, `available`, the Booking
  Requirements, and `pricing` only when there is a price.

  `requirements` is required and `pricing` is the optional half, which is the
  load-bearing part of the shape: a sold-out or unpriced target must still render
  a wizard, or the shopper cannot change the selection that made it unavailable.

  Four structural invariants keep this from becoming beta's `/quote` under a new
  name. It mints no identifier — no `id`, `quoteId` or token, so nothing can be
  presented later as authority. It persists nothing: the preview is handed only
  `normalizeSelection`, `composeRequirements` and `composeQuote`, never the
  repository, so it cannot write a Session, Quote, Hold, operation claim or audit
  row. It says `binding: false` explicitly. And because it has no id at all, the
  result is not assignable where `commitBookingSessionV1` or `placeBookingHoldV1`
  require a `quoteId` — asserted in `preview-contracts.test.ts` so a later field
  addition cannot quietly undo it.

  The preview reuses the same `composeRequirements` / `composeQuote` ports the
  Session lifecycle uses, over an ephemeral in-memory session-shaped value, rather
  than adding a third derivation path — the price a detail page shows and the
  price the wizard quotes come from one place. Quoting audience is derived from
  the caller's `actorKind` exactly as on the Session path, so a storefront visitor
  cannot preview at staff or partner price tiers, and the public route sits behind
  the same active-storefront-channel admission as the public Session routes.

  `composeQuote` now falls back to the module's read connection when there is no
  open Session transaction, matching what `composeRequirements` already did.

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

## 0.123.0

### Minor Changes

- ef8871d: Validate the selection against the published Booking Requirements.

  Requirements reached the host in the earlier phases of #4188 but stayed
  advisory: nothing checked that the selection a host collected answered the
  descriptor the server published. A host that rendered the wrong field set did
  not error — it collected a plausible-looking set and failed at commit, or
  committed something incomplete. That is the #4113 class of bug.

  `validateSelectionAgainstRequirements(requirements, selection)` is the one
  validator, in `@voyant-travel/catalog-contracts/booking-engine/requirements-validation`.
  It walks what the descriptor declares — pax band windows and cross-band
  dependencies, required configure sub-steps, required traveler and booking
  fields — and returns machine-readable `{ requirementKey, reason }` entries, never
  prose. The Booking Session calls it at quote time so a host learns what is
  missing while it can still fix it, and again at commit because the server never
  trusts that the client quoted first.

  A Quote now carries `requirementsFingerprint` alongside `priceFingerprint`,
  computed the same way. `commitBookingSessionV1` requires the client to echo the
  fingerprint it rendered against, and the commit path re-derives and compares
  exactly as `price_changed` does. Two new recoverable outcomes on
  `bookingSessionLifecycleErrorV1`: `selection_incomplete` (with the unsatisfied
  list, `update_selection`) and `requirements_changed` (`request_fresh_quote`).
  No Booking, Allocation, or supplier operation is created when either fires.

  The lifecycle conformance suite holds third-party verticals to the same
  contract: a satisfying selection must commit on an otherwise clear path, an
  unsatisfying one must produce no side effects, and every entry a descriptor
  marks required must be something the validator actually checks.

  Migration `20260804190000_booking_session_quote_requirements_fingerprint`
  expires in-flight Quotes rather than backfilling a fingerprint no descriptor
  produced.

## 0.122.0

### Minor Changes

- b52433d: Add a non-binding Offer Preview read.

  Storefront detail pages — product, accommodation, cruise — have to show a live
  price and render the right configuration controls _before_ any Booking Session
  exists. Beta served that with `POST /catalog/quote`, which v1 deleted, and the
  only v1 replacement was to open a Session. That is the wrong trade: Sessions are
  persisted, revisioned, capability-bearing, expiring rows that a sweep has to
  reap, and a shopper nudging a pax stepper is not yet an attempt to book. One
  Session per keystroke floods `booking_sessions` at real traffic.

  `POST /v1/{admin,public}/catalog/offers/preview` answers the same question
  statelessly. `offerPreviewRequestV1` takes the Session create target union, the
  Session commercial scope and the public selection schema;
  `offerPreviewResultV1` returns `binding: false`, `available`, the Booking
  Requirements, and `pricing` only when there is a price.

  `requirements` is required and `pricing` is the optional half, which is the
  load-bearing part of the shape: a sold-out or unpriced target must still render
  a wizard, or the shopper cannot change the selection that made it unavailable.

  Four structural invariants keep this from becoming beta's `/quote` under a new
  name. It mints no identifier — no `id`, `quoteId` or token, so nothing can be
  presented later as authority. It persists nothing: the preview is handed only
  `normalizeSelection`, `composeRequirements` and `composeQuote`, never the
  repository, so it cannot write a Session, Quote, Hold, operation claim or audit
  row. It says `binding: false` explicitly. And because it has no id at all, the
  result is not assignable where `commitBookingSessionV1` or `placeBookingHoldV1`
  require a `quoteId` — asserted in `preview-contracts.test.ts` so a later field
  addition cannot quietly undo it.

  The preview reuses the same `composeRequirements` / `composeQuote` ports the
  Session lifecycle uses, over an ephemeral in-memory session-shaped value, rather
  than adding a third derivation path — the price a detail page shows and the
  price the wizard quotes come from one place. Quoting audience is derived from
  the caller's `actorKind` exactly as on the Session path, so a storefront visitor
  cannot preview at staff or partner price tiers, and the public route sits behind
  the same active-storefront-channel admission as the public Session routes.

  `composeQuote` now falls back to the module's read connection when there is no
  open Session transaction, matching what `composeRequirements` already did.

## 0.121.0

### Minor Changes

- 0976af1: Give the Booking Session a commercial scope and a declarative selection.

  **Scope.** `bookingSessionScopeV1` (`locale`, `market`, optional `currency`) is
  accepted on Session create, stored on `booking_sessions`, and returned on every
  Session record. It replaces the three places `sessions-production` hardcoded
  `{ locale: "en", audience: "customer", market: "default" }` — the sourced live
  resolve, the supplier reserve request, and the owned compute request — so a
  Session now quotes in the market it belongs to with labels in its own locale.

  Scope is fixed at create: PATCH carries no scope, and the update path does not
  write the columns, so a Quote, the Hold taken against it, and the Commit that
  consumes both cannot mean three different prices.

  `audience` is deliberately not part of the client-supplied scope. It is derived
  server-side from the Session's `actorKind` via
  `bookingSessionAudienceForActorV1`, so a public caller cannot request
  staff-audience pricing or staff-visible content by naming it on the wire.

  **Selection.** `bookingSelectionV1` is split into `bookingSelectionPublicV1`
  (what any caller may send), `bookingSelectionStaffOnlyV1` (`priceOverride`,
  `internalNotes`, `suppressNotifications`, `documentGeneration`, `saveAsDraft`,
  `travelCreditRedemption`) and `bookingSelectionEngineOwnedV1` (`entity`).
  `bookingSelectionV1` remains their union, so the operator journey draft type is
  unchanged.

  The Booking Session's selection gate is now derived from those schemas instead
  of a hand-maintained denylist: a top-level key the public schema does not
  declare is rejected rather than dropped, and the privileged key set is computed
  from the staff-only and engine-owned schemas. Extending either schema extends
  the boundary; a newly added field is denied by default. The staff booking
  authority gate on `selection.staffBooking` and the recursive passport /
  `documentClass` PII rejection are unchanged.

  Migration `20260804160000_booking_session_scope` adds `locale`, `market` and
  `currency` to `booking_sessions`, backfilling existing rows with `'en'` /
  `'default'` — the values they really were quoted at — and then dropping the
  defaults so a new Session must supply a real scope.

## 0.120.0

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

## 0.119.0

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
