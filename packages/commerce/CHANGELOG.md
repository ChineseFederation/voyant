# @voyant-travel/commerce

## 0.51.3

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/bookings@0.243.0
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/catalog@0.256.2
  - @voyant-travel/distribution@0.228.3

## 0.51.2

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/catalog@0.256.1
  - @voyant-travel/distribution@0.228.2

## 0.51.1

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog@0.256.0
  - @voyant-travel/products-contracts@0.111.5
  - @voyant-travel/distribution@0.228.1

## 0.51.0

### Minor Changes

- 36f3085: Enforce the PK/SK capability line on the public API, and give secret keys scopes.

  `vpk_`/`vsk_` existed at issuance, in storage and on an admin label, and nothing
  branched on them for authorization: no route required a secret key and none was
  denied to a publishable one, so a leaked `vpk_` could commit bookings and open
  payment sessions — bounded only by an `Origin` header, which any non-browser
  client sets freely.

  - Every `/v1/public/*` API bundle now declares `publishable` (and
    `guardedIntake`, for routes that capture person data with nothing challenging
    the submitter). One middleware enforces it, and **an undeclared route is
    secret-key-only** — silence is a denial, not an omission.
  - Every published operation carries `x-voyant-key-kind: publishable | secret`,
    derived from the same declaration the middleware reads.
  - Origin handling is split by kind: a publishable key still requires an origin
    (it is the only thing narrowing where a browser-resident credential may be
    used); a secret key no longer does, so a genuine server-to-server caller can
    use the API without a BFF forwarding a synthetic header. An origin that IS
    presented is still checked, whichever kind sent it. Dynamic CORS applies to
    the publishable path only.
  - A secret key now authenticates `/v1/admin/*` and carries a scope grant in the
    deployment's own access-catalog vocabulary, defaulting to a commerce-shaped
    set at mint. `{"*": ["*"]}` is an explicit opt-in and is called out in the
    admin surface.
  - The `voy_` deployment API key on `/v1/admin/*` is deprecated. It still works
    and now logs on use; close the window with
    `VOYANT_DEPLOYMENT_API_KEY_MODE=disabled`, which stops minting as well as
    authenticating. Admin sessions are unaffected, as are `voy_` keys with a
    customer, partner or supplier audience.

  **Breaking for custom public routes.** A deployment-authored `ApiModule` that
  mounts `/v1/public/*` routes must declare `publishable` for browser clients to
  reach them; without it the routes are secret-key-only. First-party modules are
  already declared. See `docs/architecture/storefront-key-capability-line.md`.

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [1f4e14c]
- Updated dependencies [c805276]
- Updated dependencies [df9f45b]
- Updated dependencies [599ffed]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/distribution@0.228.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/catalog@0.255.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/bookings@0.242.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0

## 0.50.1

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/catalog@0.254.1
  - @voyant-travel/distribution@0.227.29

## 0.50.0

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

### Patch Changes

- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/bookings@0.241.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/tools@0.10.3
  - @voyant-travel/distribution@0.227.28
  - @voyant-travel/products-contracts@0.111.4

## 0.49.5

### Patch Changes

- e993e19: Deliver post-payment booking document bundles only after every template-required attachment is ready, including final provider invoices, contracts, and product brochures. Emit a booking-keyed checkout-finalized event after Booking Session settlement, retry pending bundles on document and brochure readiness events, encode storage metadata safely for Unicode values, and record the managed-runtime release identity for the new delivery contract.
- Updated dependencies [e993e19]
  - @voyant-travel/finance@0.246.1

## 0.49.4

### Patch Changes

- ca68f42: Apply the default customer number series to automatically generated booking contracts and promote paid storefront acceptances through issue, send, and electronic signature. Bank-transfer contracts remain drafts until payment confirmation.

## 0.49.3

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/catalog@0.253.1
  - @voyant-travel/distribution@0.227.27

## 0.49.2

### Patch Changes

- Updated dependencies [b95e995]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/finance@0.245.7
  - @voyant-travel/products-contracts@0.111.2
  - @voyant-travel/distribution@0.227.26

## 0.49.1

### Patch Changes

- ea04a28: Bind frozen cancellation-policy entitlement into the approved Booking cancellation consequence snapshot and recheck it under item locks. Keep per-person option bases from being multiplied twice when unit rules already price each traveler. Pin the packaged operator API reference to the tested version so clean consumer installs do not resolve a broken transitive release.
- Updated dependencies [ea04a28]
  - @voyant-travel/bookings@0.240.8
  - @voyant-travel/finance@0.245.4

## 0.49.0

### Minor Changes

- 8fc2d25: Declare whether occupancy prices supplement traveler fares or already include them, and quarantine legacy configurations whose composition is ambiguous.

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/products-contracts@0.111.0
  - @voyant-travel/finance@0.245.2
  - @voyant-travel/bookings@0.240.5

## 0.48.13

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3
  - @voyant-travel/products-contracts@0.110.4
  - @voyant-travel/distribution@0.227.25

## 0.48.12

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/catalog@0.251.3
  - @voyant-travel/distribution@0.227.24

## 0.48.11

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/distribution@0.227.23
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.48.10

### Patch Changes

- fe28815: Commit a paid Booking Session from `payment.completed`, even when the shopper
  does not return from hosted checkout.

  The settlement subscriber now re-enters the canonical Booking Session Commit
  with the exact paid payment-session id, so booking creation, hold consumption,
  payment transfer, invoice creation, and retries retain the same invariants as a
  shopper-initiated commit. A concurrent returning shopper and settlement event
  converge on the single durable Session commit.

- Updated dependencies [fe28815]
  - @voyant-travel/catalog@0.251.1

## 0.48.9

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/finance@0.244.1
  - @voyant-travel/products-contracts@0.110.3
  - @voyant-travel/distribution@0.227.21

## 0.48.8

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog@0.250.0
  - @voyant-travel/products-contracts@0.110.2
  - @voyant-travel/distribution@0.227.20

## 0.48.7

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/catalog@0.249.1
  - @voyant-travel/distribution@0.227.19

## 0.48.6

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/db@0.120.6
  - @voyant-travel/distribution@0.227.18
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1

## 0.48.5

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/catalog@0.248.1
  - @voyant-travel/distribution@0.227.17

## 0.48.4

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/products-contracts@0.110.1
  - @voyant-travel/distribution@0.227.16

## 0.48.3

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/catalog@0.247.0
  - @voyant-travel/distribution@0.227.15

## 0.48.2

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/distribution@0.227.14
  - @voyant-travel/action-ledger@0.115.14

## 0.48.1

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/products-contracts@0.110.0
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3
  - @voyant-travel/distribution@0.227.13

## 0.48.0

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

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog@0.245.0
  - @voyant-travel/products-contracts@0.109.5
  - @voyant-travel/distribution@0.227.12

## 0.47.14

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/products-contracts@0.109.3
  - @voyant-travel/distribution@0.227.11

## 0.47.13

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/products-contracts@0.109.2
  - @voyant-travel/distribution@0.227.10

## 0.47.12

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/products-contracts@0.109.1
  - @voyant-travel/distribution@0.227.9

## 0.47.11

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/products-contracts@0.109.0

## 0.47.10

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3
  - @voyant-travel/products-contracts@0.108.10
  - @voyant-travel/distribution@0.227.8

## 0.47.9

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/products-contracts@0.108.9
  - @voyant-travel/distribution@0.227.7

## 0.47.8

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/products-contracts@0.108.8
  - @voyant-travel/distribution@0.227.6

## 0.47.7

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/products-contracts@0.108.7
  - @voyant-travel/distribution@0.227.5

## 0.47.6

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/catalog@0.237.2
  - @voyant-travel/distribution@0.227.4

## 0.47.5

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/db@0.120.2
  - @voyant-travel/distribution@0.227.3
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1

## 0.47.4

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/distribution@0.227.2
  - @voyant-travel/products-contracts@0.108.6

## 0.47.3

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/distribution@0.227.1
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/core@0.137.2

## 0.47.2

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/distribution@0.227.0
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/products-contracts@0.108.5

## 0.47.1

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
  - @voyant-travel/distribution@0.226.2
  - @voyant-travel/types@0.109.12

## 0.47.0

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
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/distribution@0.226.1

## 0.46.10

### Patch Changes

- eeaa5b5: Make Booking Sessions the sole Booking Platform v1 pre-commit lifecycle.

  The transactional beta-data cutover verifies genuine commitments, releases
  owned capacity, preserves resumable staff attempts as canonical Sessions,
  redacts disposable attempts into audited tombstones, and then removes
  `booking_drafts`. The duplicate quote/draft/hold routes, draft capability,
  reaper, low-level quote tool, and deployment source-provider gate are removed.

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/distribution@0.226.0
  - @voyant-travel/bookings@0.236.0

## 0.46.9

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/bookings@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/distribution@0.225.0

## 0.46.8

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
  - @voyant-travel/distribution@0.224.0
  - @voyant-travel/db@0.119.4
  - @voyant-travel/products-contracts@0.108.3

## 0.46.7

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/distribution@0.223.0
  - @voyant-travel/db@0.119.3
  - @voyant-travel/products-contracts@0.108.2

## 0.46.6

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/products-contracts@0.108.1
  - @voyant-travel/distribution@0.222.0
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0

## 0.46.5

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/distribution@0.221.0
  - @voyant-travel/products-contracts@0.108.0
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0

## 0.46.4

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/distribution@0.220.0
  - @voyant-travel/products-contracts@0.107.13

## 0.46.3

### Patch Changes

- bdc0443: Add Distribution-owned channel publication contracts, persistence, TypeID prefixes, exact cutover snapshots, effective publication resolver primitives, and provider-neutral runtime wiring for Storefront and Commerce.
- Updated dependencies [bdc0443]
  - @voyant-travel/distribution@0.219.1
  - @voyant-travel/catalog@0.227.1

## 0.46.2

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/distribution@0.219.0
  - @voyant-travel/products-contracts@0.107.12
  - @voyant-travel/bookings@0.229.0

## 0.46.1

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/catalog@0.226.0
- @voyant-travel/distribution@0.218.0
- @voyant-travel/finance@0.228.0

## 0.46.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/proposals-contracts@0.109.0
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/distribution@0.217.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/db@0.119.2
  - @voyant-travel/products-contracts@0.107.11

## 0.45.6

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/distribution@0.216.0

## 0.45.5

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
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.45.4

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/distribution@0.214.0
  - @voyant-travel/finance@0.224.0

## 0.45.3

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/distribution@0.213.0
  - @voyant-travel/finance@0.223.0

## 0.45.2

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/distribution@0.212.0
- @voyant-travel/finance@0.222.0

## 0.45.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/distribution@0.211.1

## 0.45.0

### Minor Changes

- 52c794d: Require a booking-scoped capability to start checkout.

  `POST /v1/public/catalog/checkout/start` accepted a bare `bookingId` and loaded
  the booking with no authorization check, so starting a payment against someone
  else's booking was a matter of guessing an id. It now requires the same
  `payment:start` capability the Finance collection routes require — the one
  booking creation issues and sets as an HttpOnly cookie.

  **Breaking.** Any caller that reached this route with only a booking id now
  receives 401 (no capability) or 403 (a capability for a different booking).
  Storefronts should obtain the capability from the booking-create response,
  which returns it in the body and as the `voyant_checkout_session` cookie.

### Patch Changes

- 52c794d: Close price, identity, and double-spend holes in self-service booking creation.

  **Price.** `catalog_quotes` records what a quote cost but not what it was priced
  for, and the only other binding was `draft.current_quote_id` — a value the
  caller writes on the public draft PUT. A caller could quote one traveller for
  one night, rewrite the draft to a larger party keeping the cheap quote id, and
  every check still passed. Resolution now re-prices the current draft through
  the owning vertical, in the quote's own scope, and rejects any difference.

  **Identity.** The guest contact check passed if _either_ email or phone
  matched, while `upsertPersonFromContact` resolves by email then phone — so an
  SMS-verified caller could put a victim's email in the draft and have the
  booking attached to the victim's CRM person, with confirmations delivered to an
  address they never proved control of. The unverified channel is now dropped
  rather than merely unchecked.

  **Double spend.** Draft and quote consumption are now conditional UPDATEs that
  throw when they claim no row, so two concurrent creates cannot both commit from
  one draft, one quote, and one hold.

  **Attribution.** `verificationChallengeId` is refused when the caller is already
  authenticated — it reached both the ledger principal and the durable
  idempotency scope, letting an authenticated caller choose either. An
  authenticated customer now audits under their own account instead of as
  `verified_guest`.

  Also: checkout capability issuance reads the merged runtime env (it previously
  threw after the booking had committed on Node deployments); an idempotent
  replay reports the original booking's number and real status rather than a
  speculatively allocated one; `checkout/start` accepts the `guest-booking`
  capability that also grants `payment:start`, matching the Finance collection
  routes.

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

## 0.44.20

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
  - @voyant-travel/types@0.109.10

## 0.44.19

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/distribution@0.209.0
  - @voyant-travel/finance@0.219.0

## 0.44.18

### Patch Changes

- d367d9f: Enforce an optional, concurrency-safe monthly booking allowance at every accepted-booking boundary.
- Updated dependencies [d367d9f]
  - @voyant-travel/bookings@0.218.2
  - @voyant-travel/finance@0.218.2

## 0.44.17

### Patch Changes

- a799849: Expose non-PII booking line details to Tools and add an exact, fingerprinted payer/line/tax preview plus an approval-gated command for atomically issuing a proforma without external synchronization. Serialize checkout tax materialization with approved invoice issuance so the issued tax snapshot cannot drift.
- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/distribution@0.208.0

## 0.44.16

### Patch Changes

- @voyant-travel/bookings@0.217.0
- @voyant-travel/catalog@0.215.0
- @voyant-travel/distribution@0.207.0
- @voyant-travel/finance@0.217.0

## 0.44.15

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/catalog@0.214.1
  - @voyant-travel/db@0.118.6
  - @voyant-travel/distribution@0.206.1

## 0.44.14

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/distribution@0.206.0
  - @voyant-travel/finance@0.216.0

## 0.44.13

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/bookings@0.215.0
- @voyant-travel/catalog@0.213.0
- @voyant-travel/distribution@0.205.0

## 0.44.12

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/catalog@0.212.0
- @voyant-travel/distribution@0.204.0
- @voyant-travel/finance@0.214.0

## 0.44.11

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/catalog@0.211.0
- @voyant-travel/distribution@0.203.0
- @voyant-travel/finance@0.213.0

## 0.44.10

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/distribution@0.202.0
  - @voyant-travel/bookings@0.212.0
  - @voyant-travel/finance@0.212.0

## 0.44.9

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/distribution@0.201.0
  - @voyant-travel/bookings@0.211.0
  - @voyant-travel/finance@0.211.0

## 0.44.8

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/distribution@0.200.0
- @voyant-travel/finance@0.210.0

## 0.44.7

### Patch Changes

- @voyant-travel/bookings@0.209.0
- @voyant-travel/catalog@0.207.0
- @voyant-travel/distribution@0.199.0
- @voyant-travel/finance@0.209.0

## 0.44.6

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/catalog@0.206.0
- @voyant-travel/distribution@0.198.0
- @voyant-travel/finance@0.208.0

## 0.44.5

### Patch Changes

- accb1cf: Declare safety-contract metadata on the six remaining grandfathered
  pricing/promotions actions and remove them from the legacy execute+tools
  allowlist:

  - `action.create-cancellation-policy` and `action.create-price-catalog`
    already claim their command idempotently via `executeCommerceCreate`
    (the shared `handler-command-claim-v1` `createdTarget` contract), with a
    plain local Postgres insert and no outbox write, so they declare
    `availability` and `effectBoundary: "local"`.
  - `action.update-cancellation-policy`, `action.update-price-catalog`,
    `action.update-promotion`, and `action.archive-promotion` are single
    local Postgres updates against an existing policy/catalog/promotion id
    (already declared via `commandTargetField: "id"`); the two promotion
    actions notify an in-process event bus (not a durable outbox, unlike
    `create-promotion`), so all four declare `availability`,
    `effectBoundary: "local"`, and `targetLifecycle: "existing"`.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/distribution@0.197.1
  - @voyant-travel/finance@0.207.1

## 0.44.4

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/distribution@0.197.0
  - @voyant-travel/finance@0.207.0

## 0.44.3

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/distribution@0.196.0

## 0.44.2

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/distribution@0.195.0
  - @voyant-travel/bookings@0.205.0

## 0.44.1

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/distribution@0.194.0
- @voyant-travel/finance@0.204.0

## 0.44.0

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

## 0.43.3

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/distribution@0.192.0
- @voyant-travel/finance@0.202.0

## 0.43.2

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

## 0.43.1

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/distribution@0.191.0
  - @voyant-travel/bookings@0.201.0

## 0.43.0

### Minor Changes

- 952d817: Replace unsafe booking-contract document generation with the Legal-owned
  durable operation/provider protocol. Legacy generation routes and direct
  generator services and exports are removed. Standard Operator now selects and
  constructs the shipped provider from its exact database, document-storage, and
  renderer bindings; startup and action activation require behavioral provider
  preflight, and pending recovery fails loudly if that provider disappears.
  Local Standard document bytes now require probed, atomic filesystem durability,
  and the bundled renderer embeds a Latin Extended Unicode font. Custom font
  bytes are also supported by the basic PDF utility. Opaque renderer/S3
  transports require explicit backend identity. Remove the
  Notifications document-bundle lifecycle callbacks, fully-paid orchestration
  subscriber, and its Realtime invalidation declaration; document generation is
  available only through admitted Legal actions.

  Recognize transaction-bound outbox appends as durable domain-event emissions
  and publish the existing Trips requirement-sourcing event contracts.

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/distribution@0.190.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/products-contracts@0.107.10

## 0.42.2

### Patch Changes

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

## 0.42.1

### Patch Changes

- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/distribution@0.188.0
- @voyant-travel/finance@0.198.0

## 0.42.0

### Minor Changes

- e44781c: Restore the `create_promotion` Tool with a fingerprinted created-target command, atomic product-scope materialization, and deterministic transactional-outbox delivery.

  The response is now an immutable `{ status, promotion: { id }, replayed }` envelope rather than the full mutable offer. See `docs/migrations/created-target-commerce-charters-cruises.md` for caller migration guidance.

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/distribution@0.187.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.41.0

### Minor Changes

- 78423d3: Require a stable `idempotencyKey` for cancellation-policy, price-catalog,
  charter-product, charter-yacht, and cruise-ship create Tools. Successful calls
  now return an immutable created-target reference (`status`, target `id`, and
  `replayed`) instead of a mutable full-row snapshot. Exact retries return the
  original reference and altered same-key commands conflict.
- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [71c08aa]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/distribution@0.186.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.40.6

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/distribution@0.185.0
  - @voyant-travel/finance@0.195.0

## 0.40.5

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/distribution@0.184.0
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0

## 0.40.4

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/products-contracts@0.107.8
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/distribution@0.183.0
  - @voyant-travel/finance@0.193.0

## 0.40.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/distribution@0.182.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1

## 0.40.2

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/distribution@0.182.0

## 0.40.1

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/distribution@0.181.0
  - @voyant-travel/bookings@0.191.0

## 0.40.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.
- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.

### Patch Changes

- 228b57d: Migrate package-owned scheduled product operations from workflow registrations to payload-free jobs selected through the deployment graph. The jobs retain durable authority in their owning domains and resolve execution dependencies through package runtime ports.
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
  - @voyant-travel/types@0.109.9

## 0.39.25

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/distribution@0.179.0
  - @voyant-travel/products-contracts@0.107.6
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.39.24

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/distribution@0.178.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/workflow-runs@0.122.18
  - @voyant-travel/workflows@0.122.18

## 0.39.23

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/distribution@0.177.0
- @voyant-travel/finance@0.187.0

## 0.39.22

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/distribution@0.176.0
- @voyant-travel/finance@0.186.0

## 0.39.21

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/distribution@0.175.0
  - @voyant-travel/bookings@0.185.0

## 0.39.20

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/products-contracts@0.107.5
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/catalog@0.182.0
  - @voyant-travel/distribution@0.174.0
  - @voyant-travel/finance@0.184.0

## 0.39.19

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/distribution@0.173.0

## 0.39.18

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/distribution@0.172.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/workflow-runs@0.122.15
  - @voyant-travel/workflows@0.122.15

## 0.39.17

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/distribution@0.172.0
- @voyant-travel/finance@0.182.0

## 0.39.16

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/distribution@0.171.0

## 0.39.15

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/distribution@0.170.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/workflow-runs@0.122.13
- @voyant-travel/workflows@0.122.13

## 0.39.14

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/distribution@0.169.0
- @voyant-travel/finance@0.179.0

## 0.39.13

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/distribution@0.168.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/workflow-runs@0.122.12
- @voyant-travel/workflows@0.122.12

## 0.39.12

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/distribution@0.167.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflow-runs@0.122.11
  - @voyant-travel/workflows@0.122.11

## 0.39.11

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/distribution@0.166.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflow-runs@0.122.10
  - @voyant-travel/workflows@0.122.10

## 0.39.10

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/distribution@0.165.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/workflow-runs@0.122.9
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.39.9

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/distribution@0.164.0
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/workflow-runs@0.122.8
  - @voyant-travel/workflows@0.122.8

## 0.39.8

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/distribution@0.163.0
- @voyant-travel/finance@0.173.0

## 0.39.7

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/distribution@0.162.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/workflow-runs@0.122.7
  - @voyant-travel/workflows@0.122.7

## 0.39.6

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/distribution@0.161.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/workflow-runs@0.122.6
  - @voyant-travel/workflows@0.122.6

## 0.39.5

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/distribution@0.161.0
  - @voyant-travel/bookings@0.171.0

## 0.39.4

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/distribution@0.160.0
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/workflow-runs@0.122.5
  - @voyant-travel/workflows@0.122.5

## 0.39.3

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/distribution@0.159.1
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/workflow-runs@0.122.4
  - @voyant-travel/workflows@0.122.4

## 0.39.2

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/distribution@0.159.0
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0

## 0.39.1

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/distribution@0.158.0
  - @voyant-travel/bookings@0.168.0

## 0.39.0

### Minor Changes

- ca3713e: Scope the operator invoicing mode to the deferred bank-transfer payment path.

  Payment method now determines the document flow. Card payments always issue the fiscal invoice at checkout finalize and never consult `invoicing.mode`. Bank transfer (deferred payment) is the configurable path: `proforma-first` (now the default, matching the platform's historical behaviour) issues a proforma at order placement and mints the fiscal invoice on settlement; `direct` issues the fiscal invoice at order placement and collects the transfer against it.

  The mode consult that PR #3462 added to the checkout finalize saga is removed — finalize once again always issues the fiscal invoice (or converts an existing proforma). The mode is instead wired at the bank-transfer issuance site, and its default flips from `direct` to `proforma-first` (schema default, normalization, and an additive migration that also backfills existing rows). The finance proforma-conversion subscriber no longer gates on the mode: any fully-paid proforma converts, which is correct in every mode and avoids stranding a proforma left outstanding across a mode switch.

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/distribution@0.157.0
  - @voyant-travel/bookings@0.167.0

## 0.38.0

### Minor Changes

- c3bdcbc: Wire checkout finalization to the operator invoicing mode. When an operator runs `proforma-first`, a fresh checkout now issues a proforma instead of a fiscal invoice; the fiscal invoice is minted later once the proforma settles. `direct` mode is unchanged, an explicitly requested proforma conversion always wins over the mode default, and deployments without an operator-settings runtime fall back to `direct`.

### Patch Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.
- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/distribution@0.156.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflow-runs@0.122.3
  - @voyant-travel/workflows@0.122.3

## 0.37.3

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/distribution@0.155.0
  - @voyant-travel/bookings@0.165.0

## 0.37.2

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/distribution@0.154.0
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0

## 0.37.1

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
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/workflow-runs@0.122.2
  - @voyant-travel/products-contracts@0.107.3
  - @voyant-travel/workflows@0.122.2

## 0.37.0

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
  - @voyant-travel/workflow-runs@0.122.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.36.1

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/distribution@0.151.0

## 0.36.0

### Minor Changes

- 7ac40a0: Add provider-neutral catalog booking Tools for live quote, guarded commit, and
  immutable order reads. Add Commerce Tools for sellability resolution,
  cancellation-policy and price-catalog management, and promotion lifecycle
  management, with package-owned runtime bindings and structural result schemas.

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
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/distribution@0.150.0
  - @voyant-travel/workflow-runs@0.121.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/workflows@0.121.0

## 0.35.9

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
  - @voyant-travel/db@0.114.6
  - @voyant-travel/distribution@0.149.0
  - @voyant-travel/workflow-runs@0.120.4
  - @voyant-travel/workflows@0.120.4

## 0.35.8

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
  - @voyant-travel/quotes-contracts@0.108.3
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflow-runs@0.120.3
  - @voyant-travel/workflows@0.120.3

## 0.35.7

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/products-contracts@0.107.2
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/distribution@0.147.0
  - @voyant-travel/finance@0.157.0

## 0.35.6

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/distribution@0.146.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/products-contracts@0.107.1
  - @voyant-travel/quotes-contracts@0.108.2
  - @voyant-travel/workflow-runs@0.120.2
  - @voyant-travel/workflows@0.120.2

## 0.35.5

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/products-contracts@0.107.0
  - @voyant-travel/distribution@0.146.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflow-runs@0.120.1
  - @voyant-travel/workflows@0.120.1

## 0.35.4

### Patch Changes

- df3e4ec: Publish the engine-neutral catalog indexer adapter and provider contracts under
  `./indexer/contract`, including optional admin lifecycle operations. Add the
  framework-neutral `./indexer/conformance` kit for external adapter packages.

  Make `deployment.providers.search` authoritative through the `catalog.indexer`
  runtime port, ship Typesense as the selected first-party provider, support
  explicit project-owned overrides, and remove direct Typesense search and
  maintenance bypasses.

- Updated dependencies [df3e4ec]
  - @voyant-travel/catalog@0.153.2

## 0.35.3

### Patch Changes

- Updated dependencies [818ea84]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/workflows@0.120.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/workflow-runs@0.120.0
  - @voyant-travel/distribution@0.145.1
  - @voyant-travel/catalog@0.153.1

## 0.35.2

### Patch Changes

- Updated dependencies [3f6694b]
- Updated dependencies [37031e9]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/workflow-runs@0.119.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/distribution@0.145.0
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/workflows@0.119.0

## 0.35.1

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/distribution@0.144.0
  - @voyant-travel/workflow-runs@0.118.0
  - @voyant-travel/workflows@0.118.0

## 0.35.0

### Minor Changes

- 490d132: Publish package-owned runtime-port contributor factories for Node deployments.

### Patch Changes

- 047c3f9: Move booking and payment runtime configuration behind package-owned graph factories and typed deployment ports.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Replace temporary nested owner exports with intentional validation, linkable, scheduling, and workflow public surfaces.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
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
- Updated dependencies [047c3f9]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/distribution@0.143.0
  - @voyant-travel/workflow-runs@0.117.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.34.0

### Minor Changes

- d771be3: Activate the package-owned catalog checkout subscribers and workflow runner through selected-graph runtime ports, with explicit composition failure when required Node host services are missing.
- 9b15ebe: Activate Commerce promotion redemption and its bulk-reindex host service through package-declared selected-graph runtime ports.

### Patch Changes

- 18d8aa0: Publish inert catalog-checkout subscriber descriptors and package-owned workflow runner registration contracts for later graph activation.
- Updated dependencies [0c19298]
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [a799a34]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/quotes@0.127.0
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/workflow-runs@0.116.0
  - @voyant-travel/distribution@0.142.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/legal@0.152.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/workflows@0.116.0

## 0.33.5

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [62b68aa]
- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/distribution@0.141.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/legal@0.151.4
  - @voyant-travel/quotes@0.126.4
  - @voyant-travel/workflow-runs@0.115.2
  - @voyant-travel/workflows@0.115.2

## 0.33.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/distribution@0.141.4
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/legal@0.151.3
  - @voyant-travel/quotes@0.126.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflow-runs@0.115.1
  - @voyant-travel/workflows@0.115.1

## 0.33.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/distribution@0.141.3
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/legal@0.151.2
  - @voyant-travel/quotes@0.126.2
  - @voyant-travel/workflow-runs@0.115.0

## 0.33.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/bookings@0.151.2
  - @voyant-travel/distribution@0.141.2
  - @voyant-travel/hono@0.123.1
  - @voyant-travel/workflow-runs@0.114.0

## 0.33.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/distribution@0.141.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/quotes@0.126.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/legal@0.151.1
  - @voyant-travel/workflow-runs@0.113.0

## 0.33.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for catalog, commerce, and inventory
  runtime, persistence, orchestration, and extension surfaces.
- e3dc5a9: Load package-owned workflow and subscriber runtime references from the selected Node deployment graph, and move the commerce promotion reindex workflow and event filter out of framework-owned catalogs.
- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- a370024: Publish package-owned deployment declarations and runtime descriptors for the
  catalog booking engine, catalog offers, catalog checkout, booking maintenance,
  and action-ledger health surfaces.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
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
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/legal@0.151.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/distribution@0.141.0
  - @voyant-travel/quotes@0.126.0
  - @voyant-travel/workflow-runs@0.112.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.32.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/distribution@0.140.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/legal@0.150.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/quotes@0.125.9

## 0.31.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/distribution@0.139.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/legal@0.149.1
  - @voyant-travel/quotes@0.125.8
  - @voyant-travel/workflow-runs@0.111.19
  - @voyant-travel/hono@0.122.2
  - @voyant-travel/workflows@0.111.19

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0
- @voyant-travel/distribution@0.139.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/legal@0.149.0
- @voyant-travel/quotes@0.125.7

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0
- @voyant-travel/distribution@0.138.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/legal@0.148.0
- @voyant-travel/quotes@0.125.6

## 0.29.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/distribution@0.137.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/legal@0.147.0
- @voyant-travel/quotes@0.125.5

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0
- @voyant-travel/distribution@0.136.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/legal@0.146.0
- @voyant-travel/quotes@0.125.4

## 0.27.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/distribution@0.135.0
  - @voyant-travel/products-contracts@0.106.1
  - @voyant-travel/bookings@0.145.0
  - @voyant-travel/quotes@0.125.3
  - @voyant-travel/finance@0.145.0
  - @voyant-travel/legal@0.145.0

## 0.26.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/distribution@0.134.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/legal@0.144.0
  - @voyant-travel/catalog@0.142.0
  - @voyant-travel/quotes@0.125.2

## 0.25.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/legal@0.143.0
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/distribution@0.133.0
  - @voyant-travel/quotes@0.125.1
  - @voyant-travel/types@0.107.1
  - @voyant-travel/workflow-runs@0.111.18
  - @voyant-travel/workflows@0.111.18

## 0.24.0

### Minor Changes

- 05c10f2: Promote booking-maintenance tax-line rebuild routes into package-owned source-free managed runtime wiring.

### Patch Changes

- Updated dependencies [ee09a7f]
- Updated dependencies [97d1c14]
  - @voyant-travel/distribution@0.132.0
  - @voyant-travel/quotes@0.125.0
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/finance@0.142.0
  - @voyant-travel/legal@0.142.0

## 0.23.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/distribution@0.131.0
  - @voyant-travel/bookings@0.141.0
  - @voyant-travel/finance@0.141.0
  - @voyant-travel/legal@0.141.0
  - @voyant-travel/quotes@0.124.2

## 0.22.1

### Patch Changes

- 621f989: Allow modules to register workflow and event-filter manifest metadata without importing run-bearing workflow definitions into request-serving apps.
- Updated dependencies [621f989]
  - @voyant-travel/core@0.112.2
  - @voyant-travel/hono@0.121.2
  - @voyant-travel/workflows@0.111.17
  - @voyant-travel/workflow-runs@0.111.17

## 0.22.0

### Patch Changes

- Updated dependencies [8405bee]
  - @voyant-travel/products-contracts@0.106.0
  - @voyant-travel/bookings@0.140.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/distribution@0.130.0
  - @voyant-travel/finance@0.140.0
  - @voyant-travel/legal@0.140.0
  - @voyant-travel/workflow-runs@0.111.16
  - @voyant-travel/workflows@0.111.16
  - @voyant-travel/quotes@0.124.1

## 0.21.2

### Patch Changes

- 32d0e1c: Split the framework standard runtime composition into lightweight per-module
  lazy route loaders, and allow overlapping lazy route mounts to fall through on
  wrapper route misses so lazy modules/extensions preserve eager route composition
  semantics without swallowing handler-authored 404 responses.
- Updated dependencies [32d0e1c]
  - @voyant-travel/hono@0.121.1
  - @voyant-travel/finance@0.139.3

## 0.21.1

### Patch Changes

- a69f820: Snapshot accepted bank-transfer checkout payment terms into booking activity and show pre-payment checkout lifecycle rows in the admin activity timeline.
  - @voyant-travel/bookings@0.139.1

## 0.21.0

### Patch Changes

- 0c75844: Validate promotion product scopes against real products before creating or updating offers, preventing dangling `promotional_offer_products` rows for unknown product ids.
- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
- Updated dependencies [92e170a]
- Updated dependencies [f3b8bef]
- Updated dependencies [13f21a1]
- Updated dependencies [9f29b74]
- Updated dependencies [fcad28b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/quotes@0.124.0
  - @voyant-travel/distribution@0.129.0
  - @voyant-travel/legal@0.139.0
  - @voyant-travel/workflow-runs@0.111.15
  - @voyant-travel/db@0.109.5
  - @voyant-travel/workflows@0.111.15

## 0.20.5

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/distribution@0.128.4
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/legal@0.138.2
  - @voyant-travel/quotes@0.123.14
  - @voyant-travel/workflow-runs@0.111.14
  - @voyant-travel/workflows@0.111.14

## 0.20.4

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/distribution@0.128.3
  - @voyant-travel/legal@0.138.1
  - @voyant-travel/quotes@0.123.13
  - @voyant-travel/workflow-runs@0.111.13
  - @voyant-travel/workflows@0.111.13

## 0.20.3

### Patch Changes

- bcd76ae: Reject invalid or dangling pricing and tax reference-data before writing.
  `POST /v1/admin/pricing/price-schedules` now rejects a nonexistent
  `priceCatalogId` with a deterministic `invalid_reference` 400 instead of a 500.
  Tax regime rates are bounded to the 0..100 percent domain (matching the
  booking-tax calculator that divides by 100), and `POST
/v1/admin/finance/tax-policy-rules` rejects dangling `profileId`/`taxRegimeId`
  references with an `invalid_reference` 400 (mirroring the existing tax-class
  regime guard).
- Updated dependencies [1544a59]
- Updated dependencies [2d3b039]
- Updated dependencies [bcd76ae]
- Updated dependencies [37e7758]
  - @voyant-travel/bookings@0.138.4
  - @voyant-travel/catalog@0.136.1
  - @voyant-travel/finance@0.138.6

## 0.20.2

### Patch Changes

- 569e2a0: Settings reference-data creates now return a deterministic 409 conflict on
  duplicate unique keys instead of a generic 500, so the admin UI can render an
  inline field error. `POST /v1/admin/pricing/price-catalogs` maps a duplicate
  `code` to `duplicate_price_catalog_code`, and
  `POST /v1/admin/relationships/custom-fields` maps a duplicate `(entityType,
key)` to `duplicate_custom_field_key`. Both use `onConflictDoNothing` and throw
  a 409 `ApiHttpError` carrying `details.fields` / `details.issues`, matching the
  existing product-type / product-tag duplicate-error shape.

## 0.20.1

### Patch Changes

- d1b4da2: Preserve proforma conversion linkage while checkout finalization issues final invoices so invoice-issued subscribers can convert existing provider estimates instead of creating standalone invoices.
- Updated dependencies [d388565]
- Updated dependencies [d1b4da2]
  - @voyant-travel/bookings@0.138.2
  - @voyant-travel/finance@0.138.2

## 0.20.0

### Patch Changes

- Updated dependencies [2325c93]
  - @voyant-travel/distribution@0.128.0
  - @voyant-travel/legal@0.138.0
  - @voyant-travel/bookings@0.138.0
  - @voyant-travel/catalog@0.136.0
  - @voyant-travel/finance@0.138.0
  - @voyant-travel/quotes@0.123.12

## 0.19.6

### Patch Changes

- 2156dcb: Map duplicate active promotion slug and code constraints to 409 API errors with field-level details.
  - @voyant-travel/bookings@0.137.7

## 0.19.5

### Patch Changes

- bb3b29c: Add a read-only public market discovery endpoint. `GET /v1/public/markets` is now reachable anonymously (no admin auth) and returns the supported markets, each with its active locales and currencies, using a narrow customer projection — `id`, `code`, `name`, `regionCode`, `countryCode`, `defaultLocale`, `defaultCurrency`, plus `locales` and `currencies`. No admin/tenant-internal fields (`status`, `timezone`, `taxContext`, `metadata`, FX rate sets, exchange rates, price catalogs, product/channel rules, or the per-currency `isSettlement`/`isReporting` flags) are exposed. Only `active` markets are listed. The market `id` is the catalog-search scope key storefronts thread into search as the `market` parameter (the catalog runtime indexes/searches slices keyed by `market.id`); `code`/`name` are for display.

## 0.19.4

### Patch Changes

- e005c4d: Reject inverted product option-unit age ranges and commerce pricing ranges across schemas and service mutations.
- Updated dependencies [e005c4d]
  - @voyant-travel/products-contracts@0.105.16

## 0.19.3

### Patch Changes

- dda92bd: Validate bank-transfer proforma number-series setup before materializing catalog snapshot bookings.
- Updated dependencies [24413e3]
- Updated dependencies [951409a]
- Updated dependencies [24413e3]
  - @voyant-travel/catalog@0.135.5
  - @voyant-travel/finance@0.137.4
  - @voyant-travel/hono@0.118.2

## 0.19.2

### Patch Changes

- eb9285a: Prevent partial pricing update schemas from reapplying insert defaults to omitted fields.
- Updated dependencies [db1acc4]
  - @voyant-travel/products-contracts@0.105.15

## 0.19.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/legal@0.137.1
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/distribution@0.127.1
  - @voyant-travel/quotes@0.123.6
  - @voyant-travel/workflow-runs@0.111.10
  - @voyant-travel/workflows@0.111.10

## 0.19.0

### Minor Changes

- 7c5ee80: Modules can own their OpenAPI contract (voyant#2114).

  The composed app root is now an `OpenAPIHono`, so routes authored with
  `@hono/zod-openapi`'s `createRoute(...).openapi(...)` contribute to a generated
  OpenAPI document at their real composed path. A new
  `@voyant-travel/hono/openapi` entrypoint exposes `generateOpenApiDocument` +
  `selectSurface` for build-time generation (kept off the package barrel so the
  doc generator stays out of the Worker runtime bundle). Existing plain routes are
  unaffected.

  The `commerce` markets list route is the first to declare its contract this way,
  using `listResponseSchema(...)` from `@voyant-travel/types` for its response
  envelope.

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/distribution@0.127.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/legal@0.137.0
  - @voyant-travel/quotes@0.123.5
  - @voyant-travel/workflow-runs@0.111.9
  - @voyant-travel/workflows@0.111.9

## 0.18.1

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/distribution@0.126.2
  - @voyant-travel/finance@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/legal@0.136.2
  - @voyant-travel/quotes@0.123.4

## 0.18.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/products-contracts@0.105.12
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/distribution@0.126.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/legal@0.136.0
  - @voyant-travel/quotes@0.123.3

## 0.17.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/products-contracts@0.105.11
- @voyant-travel/bookings@0.135.0
- @voyant-travel/catalog@0.133.0
- @voyant-travel/distribution@0.125.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/legal@0.135.0
- @voyant-travel/quotes@0.123.2

## 0.16.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/distribution@0.124.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/legal@0.134.1
  - @voyant-travel/quotes@0.123.1
  - @voyant-travel/workflow-runs@0.111.6
  - @voyant-travel/workflows@0.111.6

## 0.16.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/types@0.106.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/distribution@0.124.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/legal@0.134.0
  - @voyant-travel/quotes@0.123.0
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/workflow-runs@0.111.5
  - @voyant-travel/workflows@0.111.5

## 0.15.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/legal@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/distribution@0.123.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/quotes@0.122.11
  - @voyant-travel/workflow-runs@0.111.4
  - @voyant-travel/products-contracts@0.105.10
  - @voyant-travel/workflows@0.111.4

## 0.14.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/products-contracts@0.105.9
  - @voyant-travel/distribution@0.122.0
  - @voyant-travel/bookings@0.132.0
  - @voyant-travel/quotes@0.122.10
  - @voyant-travel/finance@0.132.0
  - @voyant-travel/legal@0.132.0

## 0.13.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/distribution@0.121.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/legal@0.131.1
  - @voyant-travel/quotes@0.122.9
  - @voyant-travel/workflow-runs@0.111.3
  - @voyant-travel/db@0.108.5
  - @voyant-travel/workflows@0.111.3

## 0.13.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0
- @voyant-travel/distribution@0.121.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/legal@0.131.0
- @voyant-travel/quotes@0.122.8

## 0.12.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0
- @voyant-travel/distribution@0.120.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/legal@0.130.0
- @voyant-travel/quotes@0.122.7

## 0.11.1

### Patch Changes

- 733bf33: Stop a bookable departure from rendering "price on request" when an option has a stray empty default rate plan (#1601).

  - **commerce** — `createOptionPriceRule`/`updateOptionPriceRule` now enforce a single active default rate plan per `(option, price catalog)`. Writing or promoting a default plan demotes any sibling default in the same scope inside a transaction, so a save path can no longer fan out several active `is_default` rows where only the newest carries prices.
  - **storefront** — the public departures pricing reader now prefers a rate plan that actually carries a price (positive base amount or a priced active unit rule) before falling back to the `is_default` flag, so a stray empty default can't mask the real priced plan and force a "price on request".

## 0.11.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/distribution@0.119.0
  - @voyant-travel/quotes@0.122.5
  - @voyant-travel/bookings@0.129.0
  - @voyant-travel/finance@0.129.0
  - @voyant-travel/legal@0.129.0

## 0.10.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/catalog@0.126.0
- @voyant-travel/distribution@0.118.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/legal@0.128.0
- @voyant-travel/quotes@0.122.4

## 0.9.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/distribution@0.117.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/legal@0.127.0
  - @voyant-travel/catalog@0.125.0
  - @voyant-travel/quotes@0.122.3

## 0.8.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/quotes@0.122.2
  - @voyant-travel/distribution@0.116.1
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/legal@0.126.1
  - @voyant-travel/workflow-runs@0.111.2
  - @voyant-travel/workflows@0.111.2

## 0.8.0

### Patch Changes

- Updated dependencies [84b9d4b]
  - @voyant-travel/legal@0.126.0
  - @voyant-travel/bookings@0.126.0
  - @voyant-travel/catalog@0.124.0
  - @voyant-travel/distribution@0.116.0
  - @voyant-travel/finance@0.126.0
  - @voyant-travel/quotes@0.122.1

## 0.7.0

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/quotes@0.122.0
  - @voyant-travel/db@0.108.3
  - @voyant-travel/products-contracts@0.105.6
  - @voyant-travel/bookings@0.125.0
  - @voyant-travel/catalog@0.123.0
  - @voyant-travel/distribution@0.115.0
  - @voyant-travel/finance@0.125.0
  - @voyant-travel/legal@0.125.0
  - @voyant-travel/workflow-runs@0.111.0
  - @voyant-travel/workflows@0.111.0
  - @voyant-travel/hono@0.112.2

## 0.6.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/workflow-runs@0.110.0
- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0
- @voyant-travel/distribution@0.114.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/legal@0.124.0
- @voyant-travel/workflows@0.110.0
- @voyant-travel/quotes@0.121.1

## 0.5.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [e9d9dbb]
- Updated dependencies [d29dd47]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/quotes@0.121.0
  - @voyant-travel/distribution@0.113.0
  - @voyant-travel/legal@0.123.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/workflow-runs@0.109.4
  - @voyant-travel/workflows@0.109.4

## 0.4.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [85caeef]
- Updated dependencies [85a13d3]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/legal@0.122.0
  - @voyant-travel/quotes@0.120.1
  - @voyant-travel/bookings@0.122.0
  - @voyant-travel/catalog@0.120.0
  - @voyant-travel/distribution@0.112.0

## 0.3.0

### Minor Changes

- 13fe70b: The commerce module now owns the catalog-checkout materialization/finalize logic: new `@voyant-travel/commerce/checkout` surface (`createCatalogCheckoutRoutes`, `startCatalogCheckout`, `materializeBookingFromSnapshot`, `dispatchCheckoutFinalize`, `rebuildBookingItemTaxLines`, etc.). Deployment specifics — tax settings, owned-product lookup, bank-transfer instructions, contract-pdf generator, and the card-payment provider start (`startCardPayment`) — are injected as options. `quotes` and `legal` are now optional peer dependencies (used only on the quote-version / contract checkout paths).

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [503a634]
- Updated dependencies [a860e15]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/legal@0.121.0
  - @voyant-travel/quotes@0.120.0
  - @voyant-travel/bookings@0.121.0
  - @voyant-travel/distribution@0.111.0
  - @voyant-travel/workflow-runs@0.109.2
  - @voyant-travel/workflows@0.109.2

## 0.2.3

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.
- Updated dependencies [756213e]
  - @voyant-travel/hono@0.110.3

## 0.2.2

### Patch Changes

- @voyant-travel/hono@0.110.2
- @voyant-travel/workflows@0.109.0
- @voyant-travel/distribution@0.110.2

## 0.2.1

### Patch Changes

- 0c003f3: Make workflows node-only and remove the stale Cloudflare edge/Node step split.

  Workflow runtime annotations now accept only `runtime: "node"`, legacy
  `runtime: "edge"` is rejected, and the old split-runner wiring has been removed.
  The legacy Cloudflare workflow adapter packages, Worker reference apps, and
  standalone external step-server artifact have been removed. Managed Cloud apps
  should forward workflow calls to the hosted Node runtime, and self-hosted
  deployments should use the Node/Postgres runtime package.

- Updated dependencies [0c003f3]
  - @voyant-travel/workflows@0.108.0
  - @voyant-travel/db@0.108.1
  - @voyant-travel/hono@0.110.1
  - @voyant-travel/distribution@0.110.1

## 0.2.0

### Minor Changes

- e388bc9: Introduce the Commerce commercial decision Interface with adapter-registered
  price-availability evaluation and explicit snapshot recording.
- 6bff46f: Add Commerce runtime wiring for the pricing, markets, sellability, and
  promotions cluster. Templates can now declare one Commerce runtime entry while
  preserving the existing package route prefixes during the v1 migration.

  Allow manifest module factories in `@voyant-travel/hono/composition` to expand to
  multiple Hono modules. Remove the Promotions package's direct Storefront
  dependency by keeping the storefront offer resolver structurally typed.

- a4e0909: Move Markets, Pricing, Promotions, and Sellability runtime source behind the
  Commerce owner path. The old package names are removed from the v1 workspace
  surface, and schema/template manifests now point at Commerce directly.

### Patch Changes

- eb17d3d: Add owner-path schema manifest metadata for Commerce and Operations, expose the
  Distribution counterparty interface, and refresh operator schema/link generated
  artifacts for the v1 package restructure.
- 063f2b5: Remove Sellability's legacy construct-offer route, service method, validation
  schemas, and public `service-construct-offer` export. Commerce now keeps
  sellability focused on commercial resolution and persisted decision snapshots;
  Quote, Trips, and Booking flows own downstream materialization.
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
- Updated dependencies [081e310]
- Updated dependencies [eb17d3d]
- Updated dependencies [3e160d3]
- Updated dependencies [47fef18]
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/distribution@0.110.0
  - @voyant-travel/workflows@0.107.11
