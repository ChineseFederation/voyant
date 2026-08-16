# @voyant-travel/catalog

## 0.260.2

### Patch Changes

- c1f2ed2: Prepare a Session payment for every target kind, not only products. The Session
  payment port returned `not_required` for `owned_entity`, `catalog_item` and
  `trip_snapshot` before it read anything, so an accommodation, a cruise cabin, a
  sourced entry or a composite trip committed with no payment session, no deposit
  and no card ever presented. The port now resolves the policy cascade per target
  kind: an owned entity and a sourced entry through the entity-keyed cascade
  commerce already composes, an owned product through the product reader that
  carries its category layer and localized name, and a Trip through the composite
  handler that owns it. A vertical with no payment context still collects nothing,
  but that is now its own answer rather than a consequence of the target enum.

## 0.260.1

### Patch Changes

- Updated dependencies [72c2616]
  - @voyant-travel/finance@0.260.0

## 0.260.0

### Minor Changes

- c5b12ba: Add travel insurance as a sellable ancillary.

  `@voyant-travel/insurance-contracts` is the provider-neutral vocabulary — quote
  requests expressed as ages and dates, quotes carrying eligibility as structured
  reasons rather than exceptions, applications with their own insured persons and
  bounded validity window, issued policies, and the five-method provider port an
  insurer adapter binds. The `insurance` module owns persistence for applications
  and policies, encrypts insured persons' identity data at rest, and fans out
  across every connected insurer.

  Checkout gains a provider-neutral ancillary seam: `commerce.ancillary-offer-source`
  is many-valued, always returns a list, and degrades a slow or failing provider to
  a diagnostic instead of blocking a purchase. Commerce learns nothing about
  insurance — an operator with a direct supplier contract binds their own source.

  A premium is a pass-through line: excluded from operator markup and commission,
  carrying its own tax treatment rather than inheriting the booking's, and
  reconciled against the issued policy so the booking total cannot drift from the
  document the traveller receives.

  The legal module gains acceptance targets for an insurer's product information
  document, its terms pinned to the version in force at the time of sale, and a
  demands-and-needs statement, with the artifact archived rather than re-fetched
  from a URL that will later serve something else.

### Patch Changes

- Updated dependencies [c5b12ba]
  - @voyant-travel/catalog-contracts@0.137.0
  - @voyant-travel/bookings@0.249.0
  - @voyant-travel/finance@0.259.2

## 0.259.3

### Patch Changes

- Updated dependencies [380c46e]
  - @voyant-travel/bookings@0.248.0
  - @voyant-travel/finance@0.259.1

## 0.259.2

### Patch Changes

- 007953d: Publish the payment plan on the Quote, so checkout can say what is due now and when the balance falls due.

  A shopper under a deposit policy was never told they were paying a deposit. They reviewed a total, accepted a contract stating that total, pressed pay, and were charged something else — €378 reviewed and agreed, €189 charged. Nothing in the Session lifecycle carried the plan until Commit answered `payment_required`, which happens after the review step and after contract acceptance, so no storefront could state the terms at the moment the shopper agreed to them.

  `quote.paymentPlan` now carries `policySource`, `currency`, `totalCents`, `dueNowCents` and every scheduled entry. It is a projection over the Quote's total and the selected departure — `resolveEffectivePaymentPolicy` then `computePaymentSchedule`, the same derivation Commit charges from, shared rather than duplicated so the two cannot come apart. Nothing is stored and no table changes; the field sits beside `pricing` rather than inside it, keeping it out of the price fingerprint that supersession compares.

  `resolveContractVariables` accepts the quoted plan and prefers it over a host-computed schedule, so the accepted document states the real deposit, the real balance and its due date. A new `payment.dueNowCents` names what the card will actually be charged; `payment.amountCents` still means the booking total, so existing templates render unchanged.

  Additive throughout — a deployment that wires no payment ports publishes no plan, and a storefront that does not read the field is unaffected.

- Updated dependencies [007953d]
  - @voyant-travel/catalog-contracts@0.136.1

## 0.259.1

### Patch Changes

- 9dc9848: Measure the customer payment policy at checkout from the departure the shopper selected, not from `products.startDate`.

  The policy gates on the distance to departure, and Commit measured that distance from the product row's own `startDate` — which, for any slot-based product, is the listing's window and not the departure being bought. A product seeded with today's date collapsed a 50% deposit policy to full payment on a departure five weeks out; a product dated months ahead did the reverse, offering a deposit on a trip leaving tomorrow and dating the balance in the past. Checkout and `generatePaymentScheduleForBooking`, which has always read the Booking's selected `startDate`, could therefore compute two different plans for one booking from one policy.

  Resolution now mirrors exactly what the Booking itself records — the selected slot's local date, then the product row — so the two schedules agree by construction. The checkout line item a hosted payment provider renders names the same departure.

  Operators running a deposit policy will see checkout start collecting the deposit on departures where it previously collected the full amount.

## 0.259.0

### Minor Changes

- 46d00dc: Retire the storefront entity: the key becomes the unit, customer accounts move to the deployment.

  A deployment IS the tenant boundary (ADR-0001), so it serves one set of surfaces, and
  the only scenario that justified N storefront rows — several brands inside one tenant —
  is explicitly not happening. What the row carried splits between the two things that
  genuinely vary: the **key** (allowed origins, channel, cookie scope) and the
  **deployment** (customer-auth methods, buyer-account policy, OAuth credentials).

  **Breaking:**

  - `storefronts`, `storefront_api_keys` and `storefront_customer_auth_credentials` are
    dropped, replaced by `public_api_keys`, `customer_account_settings` (a singleton) and
    `customer_account_credentials`. Key ids are copied verbatim — a key's identity is what
    an operator has already recorded elsewhere, so nothing is rotated by a rename.
  - `storefrontRuntimePort` → `publicApiRuntimePort`, with the DTOs and the local adapter
    reshaped onto the key. The storefront→channel link table and its provider are gone:
    a key names a channel or defaults to Direct.
  - `/v1/admin/storefronts` splits into `/v1/admin/public-api-keys` (keys) and
    `/v1/admin/customer-accounts` (sign-in methods, buyer policy, provider credentials),
    with separate access resources so the two are separately grantable. Revoking a key now
    requires `public-api-keys:delete` rather than `:write`.
  - The `storefront` packages are renamed: `@voyant-travel/storefront` →
    `@voyant-travel/public-api`, `-react` → `@voyant-travel/public-api-react`, `-sdk` →
    `@voyant-travel/public-api-client`. All three are `private: true` with in-repo
    consumers only, so there is no npm surface to deprecate. Its admin API moves from
    `/v1/admin/storefront` to `/v1/admin/public-api`, its `openapi/storefront/*` documents
    to `openapi/public-api/*`, and its capability `storefront.data-owner` to
    `public-api.data-owner`.
  - **Scope rename:** `storefront:read|write` → `public-api:read|write` on the composed
    public surface (offers and customer intake). The key-management resource introduced
    above is `public-api-keys:*`, kept distinct because the two govern different things
    and would otherwise collide on one name.
  - The BFF origin header is renamed `x-voyant-storefront-origin` → `x-voyant-public-origin`.
    Both spellings are NOT accepted: a second accepted spelling on a security-relevant
    header is a second thing to get wrong.
  - Trips and Bookings scope rebinds from `(storefrontId, channelId)` to `channelId` alone.
    Live capabilities and opaque shopping references keep working — the digests are
    unchanged and the surviving half of each check still matches.
  - Error codes `active_storefront_channel_required` → `active_channel_required` and
    `booking_storefront_origin_mismatch` → `booking_channel_mismatch`; the
    `bookingInquiryCreated` event payload drops its required `storefrontId`.
  - `@voyant-travel/distribution/setup/storefront-channel-bindings` is removed. It raised
    on a missing `storefronts` table, so it could only fail after this change.

  Two frontends declaring the same origin is now the ordinary case (a site's publishable
  key and its BFF's secret key), so the cross-storefront origin-overlap ban is gone.
  Keyless CORS preflight instead requires that the matching keys agree on a channel, and
  denies rather than throwing when they do not.

  **Tables renamed:** `trip_storefront_access` → `trip_public_access`,
  `trip_storefront_booking_operations` → `trip_public_booking_operations`, and
  `storefront_verification_challenges` → `customer_verification_challenges` (verification is
  the deployment's, so it sits beside `customer_account_settings`). Pure `ALTER TABLE
RENAME` — rows, keys and indexes survive, and live capabilities keep resolving.

  Note that Postgres does NOT rename constraint-backed indexes with their table, and Drizzle
  derives those names FROM the table. The primary keys and the `capability_digest` unique
  constraint are therefore renamed explicitly in the same migration; splitting them would
  leave an upgraded database disagreeing with a fresh replay, which is exactly what
  `verify:migration-replay-parity` compares.

  **Identifiers:** 351 distinct `Storefront*`/`storefront*` identifiers (3292 occurrences
  across 195 files) become `PublicApi*`/`publicApi*`. The rename is anchored on a following
  uppercase letter, so it can only match camelCase/PascalCase identifiers and cannot touch
  snake_case wire codes (`storefront_shopping_unavailable`), graph port ids, or bare
  literals. Graph port ids move separately and deliberately: `storefront.*` →
  `public-api.*`, and `trips.storefront-offer-resolver.runtime` →
  `trips.public-offer-resolver.runtime`.

  **Published OpenAPI:** every `/v1/public/*` operation was stamped
  `x-voyant-surface: "storefront"`; it is now `"public-api"`, across 17 documents.
  `ApiSurface` and `OperatorOpenApiDocuments` change with it — the latter's
  `storefront` key becomes `"public-api"`.

  The verification routes move with their mount: `/v1/public/storefront-verification/*` →
  `/v1/public/customer-verification/*`.

  **Filenames and constants:** 39 source files carrying `storefront` in their
  basename are renamed with their contents — `auth/src/storefront-credentials.ts`
  → `public-api-credentials.ts`, `trips/src/storefront-access.ts` →
  `public-api-access.ts`, and so on. Six subpath exports move with them
  (`@voyant-travel/auth/storefront-credentials`,
  `@voyant-travel/flights/storefront-booking-lifecycle`,
  `@voyant-travel/relationships-contracts/storefront-intake`,
  `@voyant-travel/trips/storefront-trip-offer-resolver-port`,
  `.../storefront-trip-selections-runtime`, and
  `@voyant-travel/types/storefront-key-scopes`). All six packages are `private`,
  so there is no npm surface to deprecate.

  A further 12 `STOREFRONT_*` constants become `PUBLIC_API_*`. The earlier
  identifier sweep anchored on a following uppercase LETTER, so SCREAMING_SNAKE
  names — where the next character is an underscore — were never matched. Their
  VALUES are untouched; none of them contained the retired name.

  Three exceptions, each because the name is data rather than a name:

  - `env.STOREFRONT_BANK_BENEFICIARY|_IBAN|_NAME` stay. They are already legacy
    fallbacks behind `BANK_TRANSFER_*`, so renaming them would drop the setting
    of exactly the deployments they exist to serve.
  - `"storefront-trip-booking-v1"` stays. It is a version token hashed into the
    operation digest recorded in `trip_public_booking_operations`; renaming it
    changes every digest, so an in-flight idempotent retry would stop matching
    its own recorded operation and book twice.
  - Migration filenames stay. A migration's name is its ledger identity.

  `PUBLIC_API_KEY_HEADER` had been written independently in `@voyant-travel/core`
  and `@voyant-travel/auth`, both as `"x-api-key"`. Auth now re-exports core's
  rather than declaring a second copy.

  **Environment:** `VOYANT_STOREFRONT_CHANNEL_ID` → `VOYANT_PUBLIC_API_CHANNEL_ID`. This one
  IS still read under its old name, which is a deliberate exception to the no-dual-spelling
  rule used for the request headers: an unset channel now resolves to the deployment's Direct
  channel, so a deployment that had pinned another channel would quietly re-route its sales
  rather than fail loudly. `VOYANT_STOREFRONT_ORIGIN` is documentation-only and simply becomes
  `VOYANT_PUBLIC_ORIGIN`.

  ADRs under `docs/adr/` are deliberately NOT rewritten — they record what was decided at
  the time, and this retirement is itself now part of that record.

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/db@0.123.0
  - @voyant-travel/bookings@0.247.0
  - @voyant-travel/finance@0.259.0
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/core@0.144.0
  - @voyant-travel/bookings-contracts@0.119.1

## 0.258.0

### Minor Changes

- f6c85ee: Refuse an over-long billing value at the Booking Session write path instead of after the card is captured, and stop a settled payment from being stranded by the Session's own expiry.

  The Session's selection normalizer projected the billing block field by field rather than parsing it, so the widths `bookingSelectionPublicV1` declared never ran while the Booking create enforced its own. A 25-character postal code was accepted at every step and refused once, at settlement. `requirements.bookingFields` now publishes `maxLength`, advertises the whole billing address, and the write path rejects with `invalid_selection` / `value_too_long` naming the field as the caller sent it (`billing.address.postal`, not `contactPostalCode`).

  A Session whose money is with a processor is no longer expired by the commit preflight or the expiry sweep, and can no longer be abandoned; `BookingSessionRecordV1` carries `requirementsFingerprint`, so a Commit is reachable from a read rather than only from a Quote. A settlement that produces no Booking emits `booking_session.settlement.failed`, and `ANALYTICS_FAILURE_REASONS` gains `value_too_long` so the new rejection reaches the breakdown rather than the `unknown` bucket.

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/catalog-contracts@0.136.0
  - @voyant-travel/core@0.143.0
  - @voyant-travel/bookings@0.246.3
  - @voyant-travel/db@0.122.4
  - @voyant-travel/finance@0.258.1
  - @voyant-travel/hono@0.143.2

## 0.257.4

### Patch Changes

- 1a903c5: Stop settlement refusing a captured payment over a Hold token, and make the refusal it
  does give loud and legible.

  A card checkout was captured and never became a Booking: settlement refused
  `hold_failure` against a Hold that was `active`, unexpired, correctly sized and bound to
  the Session's current Quote, then spent all eight outbox attempts restating it. Two
  independent faults produced that.

  `commitPaidSession` read the Quote and the Hold as a pair off the payment's metadata, and
  took the Hold _only_ when a Quote was recorded with it. `prepare` writes that metadata
  from the Commit it was called on and reuses an existing payment row for the same
  idempotency key without rewriting it, so a checkout that reached `prepare` before taking
  its Hold records the Quote alone — permanently. Settlement then passed no `holdId` and was
  refused `hold_failure: missing` while the Hold sat there. The Hold is now resolved
  independently, from the Session's live Holds bound to the settled Quote.

  Separately, a Hold that is genuinely gone no longer refuses the Commit. Settlement runs
  server-side against a Session whose money has already moved, and no client can keep a
  15-minute reservation alive across a processor — the tab sleeps, 3-D Secure adds minutes,
  a re-quote supersedes the Hold six seconds after taking it. It now asks inventory for the
  capacity again, idempotently across the retry chain, and only a `no` from inventory
  refuses: `hold_failure` gains a `capacity_unavailable` reason so "the token lapsed" and
  "the seat is gone" stop arriving as the same verdict.

  A refusal that no retry can change is now declared permanent, so it dead-letters on the
  spot — the stranded-payment staff alert fires with that verdict instead of the eighth
  attempt's, three quarters of an hour later — and the Session's Holds are released at that
  point rather than left `active` with a null `released_at`. Retryable outcomes are
  unchanged, and still keep their Hold.

  `event_outbox` gains `attempt_errors`, one entry per failed delivery, so a chain that
  fails several times retains what each attempt decided rather than only the last. The
  dead-letter announcement carries it.

- Updated dependencies [1a903c5]
  - @voyant-travel/catalog-contracts@0.135.0
  - @voyant-travel/db@0.122.3

## 0.257.3

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/finance@0.258.0
  - @voyant-travel/bookings@0.246.2
  - @voyant-travel/core@0.142.1

## 0.257.2

### Patch Changes

- Updated dependencies [b11c10e]
  - @voyant-travel/finance@0.257.0
  - @voyant-travel/bookings@0.246.1

## 0.257.1

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/bookings@0.246.0
  - @voyant-travel/bookings-contracts@0.119.0
  - @voyant-travel/finance@0.256.0

## 0.257.0

### Minor Changes

- 70752e1: Retire the Boat Tours catalog surface — a subtype is not a browse scope.

  Every other Catalog entry is a Product family (`tour`, `activity`, `attraction`, `event`, `transportation`) or a vertical with its own index. Boat Tours was neither: it locked `familyCode = tour` plus `subtypeCode = boat-tour`, making it a strict subset of Tours that showed the same products a second time.

  Subtypes are free-form per deployment (`products.productSubtypeCode` accepts any kebab-case code), so promoting one of them to a nav surface hardcoded one operator's vocabulary and left every other subtype — `day-tour`, `wine-tour` — without an equivalent. Families are a closed, seeded set, so a family view means the same thing on every deployment.

  `subtypeCode` remains a facet on the product filter rail, so a Boat Tour is found by filtering Tours the same way any other subtype is. `ScheduledScope` no longer accepts `"boat-tours"`, and `/catalog/boat-tours` (index and detail) is no longer routed.

## 0.256.7

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0

## 0.256.6

### Patch Changes

- 05c2202: Stop the policy capture instant from superseding every Quote it is attached to.

  Commit re-composes the Quote and compares price fingerprints to decide whether
  the price still stands. The composed pricing carries
  `policyEvidence.cancellation.capturedAt`, which
  `captureCancellationPolicySnapshot` stamps with `new Date()` on every read — so
  the two fingerprints could never agree. Every Commit against a product with a
  published cancellation policy was refused `quote_failure / superseded` and had
  its Hold released, deterministically and on the first attempt. Online checkout
  was down for those products, on any payment method, with no race involved.

  The capture instant now leaves the fingerprint input and nothing else does:
  `policyId`, `policyVersionId`, `version` and the rules themselves stay in, so a
  genuine price change or a policy version change still supersedes the Quote.
  Both comparison sites use one helper with the value written at quote time, so a
  normalization cannot be applied to some of them and not others.

  The same comparison in `materialPolicyChanged` had the same defect, reporting
  every catalog-backed Trip component as materially changed and demanding a
  proposal re-acceptance no traveller could clear.

- Updated dependencies [798b05b]
- Updated dependencies [05c2202]
  - @voyant-travel/bookings-contracts@0.118.0
  - @voyant-travel/bookings@0.245.0
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/catalog-contracts@0.134.1

## 0.256.5

### Patch Changes

- Updated dependencies [020de35]
- Updated dependencies [c2aedcb]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/bookings@0.244.1
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1

## 0.256.4

### Patch Changes

- Updated dependencies [8e2133e]
  - @voyant-travel/bookings-contracts@0.117.0
  - @voyant-travel/bookings@0.244.0
  - @voyant-travel/finance@0.252.1

## 0.256.3

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/bookings-contracts@0.116.0
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/bookings@0.243.1

## 0.256.2

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/bookings@0.243.0
  - @voyant-travel/bookings-contracts@0.115.0
  - @voyant-travel/finance@0.251.0

## 0.256.1

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0

## 0.256.0

### Minor Changes

- a41a73a: Hold capacity for the party the Booking Session is already for. An unstated
  Hold quantity is now derived from the Session's own selection instead of
  becoming a literal `1`, which no multi-traveler checkout could ever satisfy: the
  capacity port expects the real traveler count, so every Hold for two or more
  people was rejected as a quantity mismatch, and the rejection asked the client
  to retry — with the same invented `1`, forever.

  `placeBookingHoldV1.quantity` loses its `.default(1)`. A default there was not a
  fallback at all — parsing filled the field in before any code could consult the
  Session — and the same invented `1` was applied again in `useBookingHold` and
  required by the shared journey. All three now leave it absent and let the server
  derive it. `partySizeFromSelection` is that one derivation, replacing the two
  private copies in the capacity port and the Trips composite handler.

  A genuine mismatch — a caller that names a quantity other than the Session's
  party size — no longer answers `request_new_hold`. Repeating a request whose
  quantity is derived cannot succeed, so that next action described a livelock;
  `hold_quantity_mismatch` now answers `request_hold_for_expected_quantity` and
  `expectedQuantity` is the value to hold instead.

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog-contracts@0.134.0

## 0.255.0

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

- c805276: Stop the event bus failing subscribers it was never going to be able to deliver.

  Three faults, all of which showed up as `failed` outbox rows nobody read:

  - **A subscriber's budget is now its own.** The bus timeout is sized for a
    handler that writes a row, and reindexing a product is legitimately longer, so
    it blew the same 15s on every attempt: the bus recorded a failure, the outbox
    retried into the identical wall, and eight attempts later the event was dead
    even though the work was very likely completing. Catalog reindexing now
    declares the budget it needs.
  - **A timeout is reported separately from a throw.** They mean opposite things
    about a retry — a handler that threw is finished and did nothing, one that
    timed out is still running, so redelivering it duplicates the work rather than
    retrying it.
  - **A deterministic failure stops retrying.** `PermanentSubscriberError` marks a
    failure no retry can fix; the drain dead-letters it on the spot. A
    misconfigured indexer no longer spends eight attempts, each overwriting
    `last_error`, until the configuration fault is reported as a timeout.

  Delivery to zero subscribers is also counted and logged rather than recorded as
  a clean delivery, so an event type nobody consumes can no longer look identical
  to one every subscriber handled.

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

- Updated dependencies [1a3ba50]
- Updated dependencies [c805276]
- Updated dependencies [599ffed]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/catalog-contracts@0.133.1
  - @voyant-travel/bookings@0.242.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/bookings-contracts@0.114.2

## 0.254.1

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0

## 0.254.0

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

- c911139: Authorize stored instruments from the operator's booking terms.

  Keeping a shopper's card and charging it later while they are away is a
  merchant-initiated transaction. Card network rules authorize it through the
  merchant's own terms, which the shopper accepts at checkout, and require the
  merchant to keep a record of that acceptance. It is not a checkbox beside the
  card field.

  Storefront settings gain `legal.storedInstrumentMandate` with an `enabled` flag
  and a `revision`. The revision is what makes the record meaningful: without it
  an acceptance says only that some terms were agreed at some point. The Booking
  Session derives the storage intent from the mandate plus its existing contract
  acceptance, and passes an `agreementReference` naming both.

  Absent settings mean nothing is stored. Fail closed is the only safe default:
  the operator is the merchant of record and carries the liability for an
  agreement they never wrote.

  The mandate is operator configuration and is omitted from the public storefront
  settings projection. What a shopper reads is the booking terms themselves,
  through the contract template.

### Patch Changes

- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/bookings@0.241.0
  - @voyant-travel/catalog-contracts@0.133.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/tools@0.10.3

## 0.253.4

### Patch Changes

- a1f9523: Preserve the exact server-selected supplier kind, connection, and source reference when a Trip composite session quotes and books sourced inventory.
- Updated dependencies [a1f9523]
  - @voyant-travel/catalog-contracts@0.132.1

## 0.253.3

### Patch Changes

- c164b40: Carry explicit storefront contract acceptance through Booking Session checkout so paid card bookings sign their numbered contract automatically and deferred bank transfers retain a numbered draft until settlement.
- Updated dependencies [bdc0190]
- Updated dependencies [c164b40]
  - @voyant-travel/bookings@0.240.12
  - @voyant-travel/catalog-contracts@0.132.0

## 0.253.2

### Patch Changes

- 1a98c8a: Carry server-resolved sourced-stay identities and exact date, room, rate, and occupancy pins through opaque Trip selections, then revalidate price, lock, and confirm through the managed Connect lifecycle without exposing supplier authority to storefront clients.
- Updated dependencies [1a98c8a]
  - @voyant-travel/catalog-contracts@0.131.1

## 0.253.1

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0

## 0.253.0

### Minor Changes

- b95e995: Convert an exact opaque Storefront Trip selection revision into a server-priced
  composite Catalog Booking Session without exposing Trip or supplier authority
  identifiers to browser clients.

### Patch Changes

- b760ac6: Add a closed provider-first live cruise shopping seam with exact admitted-source ownership, managed presentation FX, opaque offer references, and Catalog Booking Session reservation/reconciliation payloads.
- 4c2b4ce: Add bound opaque continuations for managed multi-source flight, stay, and package shopping.
- de6e62a: Wire admitted Voyant Connect dynamic-package search into the managed Storefront
  shopping provider without exposing connection or credential selectors.
- 27140ec: Reduce booking-session mutation database round trips by reusing the transaction-locked Session and superseding active Quotes with one set-based write.
- Updated dependencies [b95e995]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
  - @voyant-travel/catalog-contracts@0.131.0
  - @voyant-travel/finance@0.245.7

## 0.252.3

### Patch Changes

- 8ab3f96: Allow keyword-only catalog deployments to explicitly disable embeddings even when a Voyant Cloud API key is configured.
- 6b672c0: Commit sourced dynamic packages through a freshly validated Voyant Connect
  hold while preserving Catalog Booking Session quote and supplier-operation
  idempotency semantics.
- 5cda348: Start a configured payment adapter when optional shopper contact details are absent, and carry missing email and name fields as null provider prefill instead of blocking checkout initiation.
- e04b812: Allow guest Booking Sessions to resolve a billing person from the traveller name when both email and phone are optional.
- Updated dependencies [4c218bc]
- Updated dependencies [6b672c0]
- Updated dependencies [03a91d0]
- Updated dependencies [5cda348]
- Updated dependencies [8688ef1]
  - @voyant-travel/tools@0.10.1
  - @voyant-travel/catalog-contracts@0.130.0
  - @voyant-travel/finance@0.245.6

## 0.252.2

### Patch Changes

- 72bf42c: Capture the applicable published Legal cancellation-policy version in owned-product quote evidence so booking commitment preserves the terms effective at sale.
- Updated dependencies [6afd487]
  - @voyant-travel/bookings@0.240.9
  - @voyant-travel/finance@0.245.5

## 0.252.1

### Patch Changes

- 669a0d7: Preserve accepted quote cancellation terms as an immutable, per-item Booking snapshot during owned and sourced booking commitment.
- Updated dependencies [669a0d7]
  - @voyant-travel/bookings-contracts@0.114.1
  - @voyant-travel/bookings@0.240.6
  - @voyant-travel/finance@0.245.3

## 0.252.0

### Minor Changes

- 21a28ef: Carry a quote-supported checkout intent through Booking Session commit, reject stale or unsupported choices before side effects, and return durable bank-transfer instructions when the host configures offline-payment orchestration.

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0
  - @voyant-travel/core@0.140.3

## 0.251.3

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0

## 0.251.2

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/core@0.140.2

## 0.251.1

### Patch Changes

- fe28815: Commit a paid Booking Session from `payment.completed`, even when the shopper
  does not return from hosted checkout.

  The settlement subscriber now re-enters the canonical Booking Session Commit
  with the exact paid payment-session id, so booking creation, hold consumption,
  payment transfer, invoice creation, and retries retain the same invariants as a
  shopper-initiated commit. A concurrent returning shopper and settlement event
  converge on the single durable Session commit.

## 0.251.0

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

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0
  - @voyant-travel/finance@0.244.1

## 0.250.0

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

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0

## 0.249.1

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0

## 0.249.0

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
  - @voyant-travel/core@0.140.0
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/db@0.120.6
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1

## 0.248.1

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0

## 0.248.0

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

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0

## 0.247.0

### Minor Changes

- 380dad7: A hosted checkout is initiated with what the shopper is buying, in their
  language, keyed to a customer rather than an email address.

  `PaymentInitiationInput` is what a hosted-checkout provider renders to the
  shopper, and three of its fields could not carry the meaning that page needs.

  `description` is the only product-shaped field on the contract, so a caller that
  sends an identifier leaves the provider nothing else to show — and the Booking
  Session commit path sent `Booking Session bses_01k…`. It now names the product
  and, where the target has one, its departure, both resolved in the Session's
  locale. The name comes from `loadProductPaymentPolicyContext`, which takes an
  optional `locale` and returns the product's translated `name`, falling back to
  its base name rather than to a language the shopper did not ask for.

  `locale` is new and optional: a BCP 47 tag for the language the shopper has been
  reading the funnel in, so a hosted page is rendered in it instead of guessed
  from the browser. The Booking Session populates it from its own scope.

  `customer.reference` is new and optional: an opaque, stable reference to the
  runtime's own customer record. Without it a provider that wants to reuse a
  stored customer — and therefore offer a stored payment method — has to key that
  binding on the email address, which binds two people who share an inbox, breaks
  when the address is corrected, and forces the provider to retain personal data
  purely as a join key. The Booking Session populates it from the CRM person the
  buyer was identified as, falling back to the owning principal only on a
  customer-actor Session: on a staff-created one the principal is the agent, not
  the shopper.

  All three are additive. An adapter that ignores them behaves exactly as before.

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0

## 0.246.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

  Fourteen compatibility surfaces in private packages had no caller left anywhere in
  the repository — not in product code, not in tests, and in several cases not
  even a re-export. Each one is now gone rather than carried. Nothing here touches
  a published package, a database column, or an API response an external
  storefront could read; those cases are inventoried for a separate decision.

  - **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
    one-line re-export behind it. Every importer in the repository, including
    catalog's own modules, already names
    `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
    been the canonical dependency since the engine contracts moved out of the
    runtime. The README and the catalog/promotions architecture docs no longer
    describe the alias.
  - **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
    alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
    classification retirement, and the `providers` option on
    `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
    under `resources` on every path; no host, generated artifact or test ever
    passed it.
  - **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
    limiter. Limits are configured per policy through `RateLimitPolicy`; the
    constants were re-exported twice and read nowhere.
  - **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
    a pass-through to `findDefaultActiveByScope`. Callers and tests already use
    the canonical name.
  - **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
    `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
    them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
    they could not travel to a subscriber even if something had.
  - **`@voyant-travel/finance-react`** — the `orderId` filter on
    `FinancePaymentSessionListFilters`. Its only reader was the
    `legacyOrderId ?? orderId` fallback in the query builder, which now reads
    `legacyOrderId` directly.
  - **`@voyant-travel/operations-react`** — `KpiStrip` and
    `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
    manifest happened to be loaded, using its own paid-amount rule; the departure
    workspace reads whole-departure figures from `GET /slots/{id}/summary`
    instead. `KpiStrip` was not reachable from the package surface at all.

  A second group carried no `@deprecated` tag, only a "back-compat" comment, and
  was equally unreachable:

  - **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
    `SlotMutationRuntime`, left over from when the runtime type covered updates
    only. Zero references, including tests.
  - **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
    `inventoryProductCompatibilityLinkable`, exported from three places. Both real
    callers (inventory's and legal's `standard-links`) import the canonical symbol
    and rename it locally. The compatibility linkable itself stays: it is what
    keeps the `products` module name resolving.
  - **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
    `./extras.js`. Its two importers were both inside the package.
  - **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
    and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
    a booking origin. Nothing called it; its only exercise was a unit test, which
    goes with it. The origin columns and the `legacy_transaction` origin source
    are untouched — this removes a reader, not the data.
  - **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
    ids re-exported from the detail hosts "for backwards compatibility". Every
    consumer already imports them from the lean `./slots.js` the comment points
    at, which is the whole reason that module exists. The distribution-react one
    was already annotated as an unused export.

  The three deleted files are pinned in `retired-paths.json` so they stay deleted.

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0

## 0.245.1

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/db@0.120.3

## 0.245.0

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
  - @voyant-travel/catalog-contracts@0.125.0

## 0.244.0

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

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0

## 0.243.0

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

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0

## 0.242.0

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

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0

## 0.241.0

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

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/bookings@0.238.3

## 0.240.0

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

## 0.239.0

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
  - @voyant-travel/catalog-contracts@0.119.0

## 0.238.0

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

## 0.237.2

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0

## 0.237.1

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1

## 0.237.0

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
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog-contracts@0.117.0

## 0.236.0

### Minor Changes

- c35841b: Cache body-keyed public POST reads in the framework, and let catalog search
  declare its own policy.

  `publicResponseCache` was GET-only, so `POST /v1/public/catalog/search` — the
  slowest public read there is — could not declare a cache policy at all. The gap
  was filled downstream by a bespoke cache in the Voyant Cloud dispatcher that
  hardcoded the route path, invented its own TTL, and omitted
  `stale-while-revalidate`. Self-hosted deployments got nothing, and any second
  body-keyed read would have needed the same bespoke treatment.

  A module now declares participation with `bodyKeyedCache`, listing public
  sub-paths whose POST reads are keyed on the canonicalized request body as well
  as the URL and the variant headers. The declaration lives at mount time rather
  than in a response header because the middleware has to canonicalize the body
  _before_ the route runs; the policy itself still lives on the response, which is
  what lets an edge tier honour the same contract instead of matching a path.

  Keying is fail-closed. A request goes to the origin uncached when it carries a
  query string (an unknown parameter must not alias a body-only key), a non-JSON
  or oversized body (64 KiB), `Authorization`, or a caller-specific body field
  anywhere in the payload — embeddings, personalization, session, customer, user,
  preview, or debug. Bodies differing only in property order share an entry.

  `POST /v1/public/catalog/search` declares
  `public, s-maxage=60, stale-while-revalidate=300` for an empty-query browse and
  `s-maxage=30` for a keyword search, on the public surface only. The TTLs stay
  short on purpose: the key carries no catalog projection generation, so the clock
  is still the only invalidation there is (voyant-travel/platform#1726).

  See ADR 0021 §2.

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/core@0.137.2

## 0.235.0

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

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog-contracts@0.116.0

## 0.234.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1

## 0.234.1

### Patch Changes

- f69e880: Make commercial commitment the sole Booking creation boundary for Booking
  Platform v1.

  Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
  states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
  their respective domains. The beta-data migration preserves evidenced
  commitments, fails closed on ambiguous external effects, restores capacity for
  abandoned attempts, and removes the obsolete Booking-backed session state.

- Updated dependencies [f69e880]
  - @voyant-travel/bookings-contracts@0.114.0
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/finance@0.237.0

## 0.234.0

### Minor Changes

- eeaa5b5: Make Booking Sessions the sole Booking Platform v1 pre-commit lifecycle.

  The transactional beta-data cutover verifies genuine commitments, releases
  owned capacity, preserves resumable staff attempts as canonical Sessions,
  redacts disposable attempts into audited tombstones, and then removes
  `booking_drafts`. The duplicate quote/draft/hold routes, draft capability,
  reaper, low-level quote tool, and deployment source-provider gate are removed.

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog-contracts@0.115.1
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/bookings@0.236.0

## 0.233.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/bookings@0.235.0

## 0.232.0

### Minor Changes

- 051e6e3: Resolve the catalog's inventory channel through a runtime port instead of
  importing Voyant Connect.

  `CatalogSourcesRuntimeExtension` is the channel contract — `registerFallback`
  for the synchronous cold window, `warm` for per-connection enumeration, and
  `resolveDestinationNames`. It is optional: a deployment may bind no channel.

  Voyant Connect now provides that port rather than being imported by the catalog
  spine, so it is one channel implementation and a self-hosted integration can
  provide its own. This also removes the
  `catalog -> plugin-voyant-connect -> cruises -> catalog` dependency cycle, which
  had been hiding as a build-ordering race.

- 536ebfc: Remove the last vendor references from the catalog spine.

  `offers-runtime` resolved its offers client by importing
  `@voyant-travel/connect-sdk` directly, contradicting the design already stated
  in `offers/operator-routes.ts` — _"the package never imports
  `@voyant-travel/connect-sdk`"_. The channel now supplies that client through
  `CatalogSourcesRuntimeExtension.createOffersClient`, and catalog no longer
  depends on the SDK.

  `BookingEngineEnv` named seven `VOYANT_*`/`VOYANT_CONNECT_*` variables that
  nothing in catalog read; they were passed straight to the channel. It is now an
  opaque environment record.

- 9f412dd: Add the Booking Platform v1 action projection: authoritative Catalog, Finance,
  and Legal obligation readers, an Operations work queue with deterministic
  incremental and rebuild jobs, a redacted storefront next-action API, explicit
  Payment Schedule timezones, and reminder scheduling from projected deadlines.

### Patch Changes

- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/bookings-contracts@0.113.0
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/db@0.119.4

## 0.231.0

### Minor Changes

- 15c1c64: Add the Booking v1 priced traveler-roster Amendment lifecycle: immutable and
  expiring exact-revision previews, server-owned price/tax and collection/refund
  consequences, acceptance, transactional owned-capacity projection, durable
  sourced Supplier Operation dispatch and reconciliation, explicit partial and
  uncertain outcomes, and consistent authenticated, storefront, and Tool
  transports.

### Patch Changes

- 5ed518e: Move the Voyant Connect sources plugin into the monorepo at
  `packages/plugins/voyant-connect` and consume it as a workspace package.

  `packages/catalog` previously depended on the published plugin, whose peer
  ranges resolved back to `@voyant-travel/catalog` and `@voyant-travel/cruises`.
  That cycle meant the monorepo could not resolve its own lockfile until its own
  publish had landed, and it dragged a stale `@voyant-travel/bookings-contracts`
  into catalog's resolution — breaking two catalog suites on import. Both are
  fixed by the move.

  The plugin keeps its registry dependencies on `@voyant-travel/connect-adapter`,
  `connect-cruises`, `connect-sdk`, and `data-sdk`: those are Connect's own public
  surface and remain in the connect repository.

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/plugin-voyant-connect@0.4.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/db@0.119.3

## 0.230.0

### Minor Changes

- e93c0a7: Generalize durable Supplier Operations from Session-only reserve intents to
  explicit Booking Session or Booking Amendment subjects, with linked Booking
  Items and reserve, modify, and cancel operation kinds. Add the source-adapter
  desired-state modification contract and Amendment-safe dispatch,
  idempotency, ambiguity, and reconciliation behavior.

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0

## 0.229.0

### Patch Changes

- f7adc5b: Make Product status the lifecycle authority and active Channel assignments the distribution authority, while retaining legacy visibility fields as deprecated API compatibility data.
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0

## 0.228.0

### Minor Changes

- 79606bb: Add Booking Platform v1 supplier-first Commit orchestration with durable
  Supplier Operations, typed pending and ambiguous outcomes, operator
  reconciliation and manual resolution, and a replay-safe sourced cruise tracer.

### Patch Changes

- 72c6753: Migrate the admin manual-booking form to authenticated Booking Session v1
  Quote, Hold, and Commit, with validated staff-only booking details and payment
  schedules preserved by the atomic Finance command.
- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/catalog-contracts@0.114.0

## 0.227.1

### Patch Changes

- bdc0443: Add Distribution-owned channel publication contracts, persistence, TypeID prefixes, exact cutover snapshots, effective publication resolver primitives, and provider-neutral runtime wiring for Storefront and Commerce.

## 0.227.0

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

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/bookings@0.229.0

## 0.226.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/finance@0.228.0

## 0.225.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/db@0.119.2

## 0.224.0

### Patch Changes

- 6036dc4: Wire `resolveBillingPerson` regardless of runtime-contributor load order.

  Contributors load in alphabetical order by package name, and the check for
  `bookings.relationships.runtime` ran while this contributor was being built.
  That port is provided by `@voyant-travel/relationships`, which sorts after
  `@voyant-travel/catalog` and therefore cannot ever have run yet — so the port
  always read as absent and `resolveBillingPerson` was dropped from the
  self-service booking source on every runtime.

  `resolveBilling` then returned null and every guest self-service booking was
  refused with `incomplete_draft`, after the shopper had verified a contact.
  Authenticated customers resolve their own billing party and were unaffected,
  which is why it stayed invisible.

  The capability check now happens on call, where every contributor has run. A
  deployment that genuinely ships no relationships runtime still returns null, so
  only authenticated customers can book there.

- Updated dependencies [6beffa2]
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0

## 0.223.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.222.1

### Patch Changes

- 349ff35: Stamp `hold_expires_at` on the draft when `POST /catalog/holds/place` succeeds.

  `hold_expires_at` is the only evidence of a hold that anything downstream reads:
  the public self-service create refuses a draft without it (`hold_required`) for
  precisely the verticals that implement `placeHold`, and the reaper releases by
  it. Nothing on the public path wrote the column — `updateBookingDraft` is its
  only writer and no route called it with `holdExpiresAt` — so placing a hold took
  the inventory and still guaranteed the create would be refused. Public
  self-service booking against a holds-implementing vertical could not succeed at
  all.

## 0.222.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/finance@0.224.0

## 0.221.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/finance@0.223.0

## 0.220.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/finance@0.222.0

## 0.219.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/bookings@0.221.1

## 0.219.0

### Minor Changes

- 52c794d: Provide `finance.self-service-booking-source.runtime` from the catalog booking
  engine, so a deployment that selects catalog gets public self-service booking
  creation without extra wiring.

  The provider resolves the owned-handler registry per request, matching how the
  draft reaper already reaches it. `SelfServiceBookingSourceProviderDeps` now
  takes `resolveOwnedHandlers()` rather than a pre-built registry.

  No billing-person resolver is wired yet: an authenticated customer can book
  (they already are the billing party), while a verified guest is rejected as
  `incomplete_draft` until a deployment supplies one.

- 52c794d: Scope booking drafts to a capability, and close three more review findings.

  **Draft access control (breaking).** A booking draft holds traveller names and
  contact details, and its id is supplied by the caller on `PUT /drafts/{id}` —
  so anyone who learned or guessed one could read it, overwrite it, delete it, or
  book it. Creating a draft now issues a draft-scoped capability, returned in the
  response and set as an HttpOnly cookie, and reading, writing, deleting, or
  booking that draft requires it. Uses the same capability primitive as checkout.

  **Bearer token no longer cached.** The create response carries a checkout
  capability, and the idempotency middleware persisted response bodies for 24
  hours — putting an HMAC bearer credential at rest in a general-purpose infra
  table, and returning it on replay _without_ its `Set-Cookie`, silently dropping
  the caller's session. The endpoint now opts out of body replay: the durable
  command claim still prevents duplicate bookings, and a retry is issued a fresh
  capability and cookie.

  **A hold is required where the vertical manages inventory.** A draft with no
  `hold_expires_at` skipped every hold check, and hold conversion only runs for
  slot-backed products — so a slotless one could oversell. Creation now requires
  a live hold whenever the vertical implements holds.

  **OpenAPI coverage checks parameters.** `diffOpenApiCoverage` compared only
  request-body field names, so the bookings document could declare a required
  `Idempotency-Key` header the runtime route never did — and the check stayed
  green. It now compares parameters by name, location and requiredness, and its
  documentation states plainly what it does not verify (responses, security, and
  anything behind a `$ref`).

- 52c794d: Add public self-service booking creation.

  `POST /v1/public/finance/bookings` is the customer-facing adapter to the same
  durable command the staff Tool drives. A caller supplies three identifiers —
  draft, quote, and (for a guest) verification challenge — and nothing else;
  booking numbers, prices, tax lines, relationship ids, and status are derived
  server-side. `Idempotency-Key` is required, because a create without a stable
  key cannot be retried safely.

  Catalog provides `finance.self-service-booking-source.runtime`: it verifies
  ownership, public scope, expiry, entity, price, and hold, requires the draft's
  billing contact to match the contact the challenge was verified for, and asks
  the owning vertical to derive the command. Billing-person resolution runs only
  once the whole party would pass the create command's own validation, so a
  rejected attempt cannot orphan a CRM row.

  The draft, quote, and challenge are all spent inside the create transaction, so
  they commit or roll back with the booking, and an exact idempotent retry
  replays the original booking without re-consuming any of them.

- 52c794d: Add a per-vertical derivation primitive for public self-service booking.

  `OwnedBookingHandler.deriveSelfServiceCommand()` turns a public draft plus an
  accepted quote into a durable create command. It is pure — Finance still owns
  the mutation inside its claim — which is what distinguishes it from the removed
  `commit()`: the handler now describes the booking, it does not make one.

  Implementations must ignore operator-only draft fields, and the products
  handler does: a public caller can write the draft, so honouring `priceOverride`
  would let them name their own price, `suppressNotifications` would let them
  silence the operator, and `internalNotes` / `documentGeneration` would let them
  write operator-facing state. All four are dropped, with tests asserting each is
  absent from the derived command rather than merely falsy.

  A vertical that does not implement the primitive has no public creation path,
  and the deployment's create action stays unavailable for it. Products is the
  first and only implementation.

  `@voyant-travel/finance` gains a `consumeSources` hook that runs inside the
  booking-create transaction, so the draft, quote, hold, and verification
  challenge commit or roll back with the booking.

- 52c794d: Resolve the billing party for a verified guest, completing self-service
  booking creation.

  A guest has no account, so the booking's billing party is resolved from the
  contact they proved control of, via the existing `bookings.relationships.runtime`
  port. That port is consumed optionally: a deployment without it still serves
  authenticated customers, who already are the billing party.

  `upsertPersonFromContact` matches on email then phone before creating, so a
  retry reuses the same person rather than creating another, and resolution stays
  outside the durable command rather than changing what it fingerprints.

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

### Patch Changes

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

- 52c794d: Actually wire public self-service booking creation.

  `POST /v1/public/bookings` returned 501 in every deployment: Finance declared
  `providePort(bookingsSelfServiceCreateRuntimePort)` but never contributed an
  implementation under that id, Bookings never resolved it, the route action was
  registered only inside a test, and `peekVerifiedDestination` had no
  implementation at all. Nothing caught it because no test exercised the route.

  Finance now contributes the create runtime — only when a booking-source
  provider is selected, so the route reports 501 rather than half-working — and
  mints the route admission against the graph-registered action. Bookings
  resolves both that port and the new `bookings.guest-verification.runtime`,
  which Storefront provides, and reads the authenticated customer from the
  customer realm. Storefront gains `peekVerifiedChallengeDestination`, which
  applies the same binding predicate as consumption so a caller cannot probe a
  challenge that could not authorize their booking.

  Regression tests cover both halves of what was missing: that Finance
  contributes the port when a source is selected and omits it otherwise, and that
  the route itself refuses an unauthenticated caller, refuses a challenge id from
  an authenticated one, and returns a booking with its checkout capability.

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
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.218.0

### Patch Changes

- fa75fe3: Allow resident Node database clients enough time to reconnect after a suspended
  database wakes, deliver durable outbox events through the composed internal
  subscriber bus, and reconcile obsolete Lakebase vector storage when a
  deployment uses pgvector.
- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0

## 0.217.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/finance@0.219.0

## 0.216.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/finance@0.218.0

## 0.215.0

### Patch Changes

- @voyant-travel/bookings@0.217.0
- @voyant-travel/finance@0.217.0

## 0.214.1

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/db@0.118.6

## 0.214.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/finance@0.216.0

## 0.213.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/bookings@0.215.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/finance@0.214.0

## 0.211.0

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/finance@0.213.0

## 0.210.0

### Minor Changes

- e7ab7a6: Make the catalog embedding provider selectable between OpenAI and Gemini.

  `buildCatalogEmbeddingProvider` now reads `CATALOG_EMBEDDING_PROVIDER`
  (`"openai" | "gemini"`) and builds the matching adapter over the Voyant Cloud
  `/ai/v1/{provider}` gateway. Defaults to `gemini` for compatibility; deployments
  that use the OpenAI embeddings proxy (e.g. managed runtimes) set `openai`.

  Switching provider switches the embedding model/dimensionality, so it is a
  deliberate `bulkReindex` operation. The Postgres indexer flips in place (unsized
  `vector` column keyed by `embedding_model_id`); Typesense-backed deployments must
  migrate the vector field's `num_dim` first, as `ensureCollection` does not.

### Patch Changes

- @voyant-travel/bookings@0.212.0
- @voyant-travel/finance@0.212.0

## 0.209.0

### Minor Changes

- 5026d3f: Expose a deployment-callable catalog discovery sync so sourced inventory reaches
  catalog browse.

  `syncSources()` needed the composed catalog `services` — the resolved indexer
  provider, field-policy registries, slice set, embedding provider, and a warmed
  source registry. That composition lives inside the framework runtime host, so a
  managed deployment could resolve Connect connections for live booking but had no
  supported way to index their catalog. Connectors showed 0 results in admin
  browse.

  - New `@voyant-travel/catalog/sources-sync-job` entry: `runCatalogDiscoverySync(
{ env, db, services }, options)` composes the indexer stack the same way the
    projection/reindex path does and runs one discovery pass.
  - New `catalog.sync-sources` job — scheduled hourly (with eager/economical
    profiles) and `wakeup: true`, so adding a connection can trigger an immediate
    pass.
  - New `catalog.sources-sync-job` runtime port, provided by the catalog runtime
    contributor; deployments never assemble `services` by hand.

  Discovered projections land in every slice the deployment materializes, which
  always includes the `market: "default"` / `locale: "en-GB"` staff and customer
  slices the admin browse queries. Withdrawal pruning is opt-in (`pruneMissing`)
  so a partial pass can never empty the browse index.

  `syncSources` gains two related fixes, both reached through the new entry:

  - It no longer discovers through an unscoped `default:<kind>` registration when
    the same kind also has connection-scoped adapters. Adapters forward that
    synthetic key upstream as a real connection id, and it lands in provenance as
    `source_connection_id` on projections missing one — which then fails to
    resolve on the live-book path. Reported as `summary.skippedConnections`.
  - New `continueOnError` option isolates a per-connection `discover()` rejection
    (recorded in `summary.failures`) instead of aborting the fan-out, so one
    unhealthy supplier cannot starve every other catalog. Off by default, so the
    cruise refresh and CLI callers keep surfacing the first failure.

  `SyncAdapterSummary` gains `connectionId` and an optional `error`;
  `SyncSourcesSummary` gains `skippedConnections` and `failures`.

  The scheduled job re-enumerates connections via a new
  `refreshBookingEngineConnectSources` rather than reusing the memoized
  per-isolate warm — otherwise a resident Node deployment would keep syncing the
  connection set it saw first, and the connection-add wakeup would do nothing
  until restart.

### Patch Changes

- @voyant-travel/bookings@0.211.0
- @voyant-travel/finance@0.211.0

## 0.208.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/finance@0.210.0

## 0.207.0

### Patch Changes

- @voyant-travel/bookings@0.209.0
- @voyant-travel/finance@0.209.0

## 0.206.0

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/finance@0.208.0

## 0.205.2

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.

## 0.205.1

### Patch Changes

- 560f7c3: Declare safety-contract metadata on `booking-engine#action.quote-catalog-entity`
  and remove it from the legacy execute+tools allowlist. Each call persists a
  fresh short-lived quote row (10-minute expiry) with no client-supplied
  target id or claim-registry backing for a "created" contract, but a
  duplicate quote from a blind retry is harmless, so it declares
  `availability`, `effectBoundary: "local"`, and a lightweight
  `targetLifecycle: "existing"`. No runtime changes.
- Updated dependencies [560f7c3]
  - @voyant-travel/bookings@0.207.1

## 0.205.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/finance@0.207.0

## 0.204.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0

## 0.203.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/bookings@0.205.0

## 0.202.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/finance@0.204.0

## 0.201.0

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
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0

## 0.200.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/finance@0.202.0

## 0.199.1

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
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/finance@0.201.1

## 0.199.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/bookings@0.201.0

## 0.198.0

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
  - @voyant-travel/core@0.136.0
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5

## 0.197.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4

## 0.196.1

### Patch Changes

- @voyant-travel/bookings@0.198.1
- @voyant-travel/finance@0.198.1

## 0.196.0

### Patch Changes

- @voyant-travel/bookings@0.198.0
- @voyant-travel/finance@0.198.0

## 0.195.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.194.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.193.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/finance@0.195.0

## 0.192.1

### Patch Changes

- 8ef8b37: Keep live booking travelers authoritative at commit time and let room-based journeys reach their option picker before a quote is priceable.
  - @voyant-travel/bookings@0.194.1

## 0.192.0

### Minor Changes

- dd370ca: Add a provider-agnostic, durable catalog product reindex job that walks canonical inventory
  products in bounded pages and rebuilds their projections through the selected indexer runtime.
  Product job hosts now pass concrete deployment bindings to fixed job runtimes.

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0

## 0.191.0

### Patch Changes

- a43267a: Add node-aware localized editorial overlays for sourced product content, including stable content-node targeting, optimistic overlay versions, audit history, product admin read/write/clear routes, and public provenance redaction.

  Tighten editorial overlay scope isolation for product content reads and writes, require admin overlay mutations to carry an authenticated user id, and make overlay mutations/history atomic with race-safe optimistic version checks.

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

- 2c79bef: Add referenced presentation-subject overlay support for cruise ships and accommodation properties.
- Updated dependencies [a43267a]
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0

## 0.190.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1

## 0.190.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/bookings@0.192.0

## 0.189.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/bookings@0.191.0

## 0.188.0

### Minor Changes

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
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0

## 0.187.0

### Minor Changes

- d9ff078: Add the first-party Postgres catalog search provider, its public adapter and
  relevance utilities, snapshot-identified rebuild retries, and the `postgres`
  managed search-provider selection.

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.186.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/workflows@0.122.18

## 0.185.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/finance@0.187.0

## 0.184.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/finance@0.186.0

## 0.183.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/bookings@0.185.0

## 0.182.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/finance@0.184.0

## 0.181.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/bookings@0.183.0

## 0.180.2

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/workflows@0.122.16

## 0.180.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/workflows@0.122.15

## 0.180.0

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/finance@0.182.0

## 0.179.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0

## 0.178.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/db@0.117.1
- @voyant-travel/bookings@0.180.1
- @voyant-travel/workflows@0.122.14

## 0.178.0

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/workflows@0.122.13

## 0.177.0

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/finance@0.179.0

## 0.176.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/workflows@0.122.12

## 0.175.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/workflows@0.122.11

## 0.174.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/workflows@0.122.10

## 0.173.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/workflows@0.122.9

## 0.172.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/workflows@0.122.8

## 0.171.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/finance@0.173.0

## 0.170.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/workflows@0.122.7

## 0.169.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/workflows@0.122.6

## 0.169.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/bookings@0.171.0

## 0.168.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/workflows@0.122.5

## 0.167.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/workflows@0.122.4

## 0.167.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/bookings@0.169.0

## 0.166.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/bookings@0.168.0

## 0.165.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/bookings@0.167.0

## 0.164.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflows@0.122.3

## 0.163.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/bookings@0.165.0

## 0.162.0

### Minor Changes

- fc3224a: The Typesense catalog indexer provider reads an optional `TYPESENSE_COLLECTION_PREFIX` deployment config and namespaces every collection with it, so multi-tenant deployments can share one Typesense cluster with per-tenant key scoping (`<prefix>__.*`).

### Patch Changes

- @voyant-travel/bookings@0.164.0
- @voyant-travel/finance@0.164.0

## 0.161.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/workflows@0.122.2

## 0.160.1

### Patch Changes

- @voyant-travel/bookings@0.162.2
- @voyant-travel/finance@0.162.2
- @voyant-travel/workflows@0.122.1

## 0.160.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.159.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0

## 0.158.0

### Minor Changes

- 7ac40a0: Add provider-neutral catalog booking Tools for live quote, guarded commit, and
  immutable order reads. Add Commerce Tools for sellability resolution,
  cancellation-policy and price-catalog management, and promotion lifecycle
  management, with package-owned runtime bindings and structural result schemas.

### Patch Changes

- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [372f4f4]
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
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/workflows@0.121.0

## 0.157.0

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/db@0.114.6
  - @voyant-travel/workflows@0.120.4

## 0.156.0

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
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/workflows@0.120.3

## 0.155.1

### Patch Changes

- f9a2d77: Keep deployment search selection authoritative while allowing custom hosts to
  supply either a catalog indexer adapter or provider through one shared runtime
  port.

## 0.155.0

### Patch Changes

- 0808b21: Publish canonical catalog search sort resolution, strengthen adapter conformance coverage, verify the Typesense implementation against the public runner, and remove provider-specific UI wording.
- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0

## 0.154.1

### Patch Changes

- 7916020: Add a Node-only, engine-neutral index reconciliation API that requires a deployment-owned distributed write authority, accepts explicit obsolete-slice candidates, applies duplicate expected IDs with deterministic last-occurrence-wins semantics, and processes populated filesystem spool partitions one bucket at a time.
- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2

## 0.154.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1

## 0.153.2

### Patch Changes

- df3e4ec: Publish the engine-neutral catalog indexer adapter and provider contracts under
  `./indexer/contract`, including optional admin lifecycle operations. Add the
  framework-neutral `./indexer/conformance` kit for external adapter packages.

  Make `deployment.providers.search` authoritative through the `catalog.indexer`
  runtime port, ship Typesense as the selected first-party provider, support
  explicit project-owned overrides, and remove direct Typesense search and
  maintenance bypasses.

- Updated dependencies [df3e4ec]
  - @voyant-travel/catalog-contracts@0.109.1

## 0.153.1

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

## 0.153.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/workflows@0.119.0

## 0.152.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/workflows@0.118.0

## 0.151.2

### Patch Changes

- b29e7e8: Keep staff catalog-offer index lookups on the unscoped staff collection when a storefront channel is configured.

## 0.151.1

### Patch Changes

- 0defbd6: Fix catalog-offer index enrichment and dynamic hotel lookup for deployments whose default catalog scope uses a non-default locale, market, or channel.

## 0.151.0

### Minor Changes

- 047c3f9: Add package-owned graph runtime factories and typed deployment ports for Catalog search, booking, and offers; Inventory core, content, and brochures; Accommodations and Cruises content; and Action Ledger health.
- 490d132: Move Catalog slice planning, Typesense behavior, offer enrichment, booking normalization, quote shaping, tax orchestration, and subscriber lifecycle into package-owned runtime factories.
- c65b05c: Own reusable Typesense maintenance and Node SDK adaptation APIs in Catalog, and
  remove product-specific reindex and source-sync implementations from the standard
  Operator starter.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move Commerce, Catalog, Finance, Legal, and Storage runtime authority out of the
  resident Node compatibility provider container. Compose selected routes through
  package graph factories and typed runtime ports, and resolve Catalog and Finance
  MCP services through package-owned tool-context contributions.
- 490d132: Publish package-owned runtime-port contributor factories for Node deployments.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Select package-owned Node workflow services through additive graph runtime contributors instead of composing Catalog, Cruises, and DB services in the Operator starter. Notifications keeps its existing package graph bootstrap.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Provide validated subscription mutations, durable projected webhook enqueue, restart-safe payload storage, and one claim-driven signed, retrying, audited delivery worker.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
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
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/workflows@0.117.0

## 0.150.0

### Minor Changes

- e68bdc1: Declare the Catalog booking snapshot subscriber and its injected runtime contract.
- d771be3: Activate Catalog indexing and booking snapshot subscribers through package-owned selected-graph runtimes and typed deployment ports.
- 8e67fe8: Declare the central Catalog indexing subscribers and publish their inert runtime descriptors.
- 26fe0e5: Add the injected Catalog projection subscriber runtime contract, target validation, and shared collection-setup serialization.

### Patch Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.149.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.149.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0

## 0.149.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2

## 0.149.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1

## 0.149.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for catalog, commerce, and inventory
  runtime, persistence, orchestration, and extension surfaces.
- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- a370024: Publish package-owned deployment declarations and runtime descriptors for the
  catalog booking engine, catalog offers, catalog checkout, booking maintenance,
  and action-ledger health surfaces.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4

## 0.148.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.147.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.147.0

## 0.146.0

## 0.145.0

## 0.144.0

## 0.143.0

### Minor Changes

- 4829ef3: Add a bounded catalog batch quote endpoint for room/rate price matrices, plus an accommodations batch stay quote path that shares room/date availability and rate reads across selections.

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog-contracts@0.109.0

## 0.142.0

## 0.141.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3

## 0.140.0

## 0.139.0

### Minor Changes

- 6711f4c: Add channel-scoped catalog search slices so storefront and partner surfaces can query separate per-channel index collections.

## 0.138.0

## 0.137.1

### Patch Changes

- 79447ce: Thread storefront market, locale, and currency scope through public catalog slots resolution so sourced product departures match the selected market.

## 0.137.0

### Patch Changes

- 689a289: Add catalog MCP tools for search and resolved entry reads.
- 22f0457: Thread sourced package booking drafts into Connect package quote/book parameters, including route, contact, and traveler details.
- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/db@0.109.5

## 0.136.4

## 0.136.3

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0

## 0.136.2

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0

## 0.136.1

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

- Updated dependencies [2d3b039]
  - @voyant-travel/catalog-contracts@0.108.1

## 0.136.0

## 0.135.8

### Patch Changes

- cb8df9c: Preserve the draft payload when `/book` is called with an explicit `quoteId`. The book route now loads the booking draft whenever a `draftId` is present — even alongside an explicit `quoteId` — so the selected departure/room/pax/traveler parameters still feed `engineParametersFromDraft`. An explicit `quoteId` continues to override which quote is booked (e.g. a live re-scoped quote) without dropping the draft-derived options.

## 0.135.7

## 0.135.6

### Patch Changes

- 0108ccf: Harden booking-confirmed side effects for at-least-once event delivery.

  Catalog now exposes an idempotent booking snapshot graph capture helper for
  event subscribers, so duplicate `booking.confirmed` deliveries observe existing
  snapshot rows instead of surfacing unique constraint errors. Finance now treats
  malformed payment-policy JSON as unset and falls back through the cascade,
  preventing schedule generation from throwing on missing `deposit.kind`.

## 0.135.5

### Patch Changes

- 24413e3: Avoid redundant Typesense collection schema patches when the existing collection already matches the desired fields and metadata, and retry transient collection-update conflicts during ensureCollection.
- Updated dependencies [24413e3]
  - @voyant-travel/hono@0.118.2

## 0.135.4

## 0.135.3

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.

## 0.135.2

### Patch Changes

- d2351e0: Fix the Typesense indexer delete filter for reserved document ids so catalog documents are actually removed from search collections.

## 0.135.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0

## 0.135.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0

## 0.134.1

## 0.134.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2

## 0.133.0

### Patch Changes

- @voyant-travel/db@0.109.1

## 0.132.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0

## 0.132.0

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
  - @voyant-travel/hono@0.115.0

## 0.131.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0

## 0.130.0

### Minor Changes

- 6a0edd2: Add the live availability-search primitive (dynamic-packaging RFC, voyant#2081 / voyant#1600) — keystone gap 1.

  - **`@voyant-travel/catalog-contracts`** — new `supportsAvailabilitySearch` capability flag, the `AvailabilitySearchRequest` / `AvailabilityCandidate` / `AvailabilitySearchResult` shapes, and a capability-gated `searchAvailability` method on the `SourceAdapter` contract. `searchAvailability` searches an inventory space (destination + dates + pax → ranked candidates), as opposed to `liveResolve` which resolves volatile fields for an already-selected entity. Internal economics (net/margin/supplier ref) live under `AvailabilityCandidate.providerData` and must never appear in public DTOs.
  - **`@voyant-travel/catalog`** — `fanOutAvailabilitySearch`, the vertical-agnostic counterpart of the flights fan-out: parallelizes `searchAvailability` across sourced connections and owned search handlers with a per-source timeout, partial-success status map, and a price-ranked merge. Adds an owned-availability-search-handler registry (`createOwnedAvailabilitySearchHandlerRegistry`) so owned inventory is a first-class search source alongside sourced adapters, mirroring the owned-booking-handler vs source-adapter split.
  - **`@voyant-travel/flights`** — `mergedFlightOfferToCandidate` / `mergedFlightOffersToCandidates` bridge mapping the flights-native `MergedFlightOffer` onto the normalized `AvailabilityCandidate`. A mapping, not a re-implementation — flights keep their own connector contract and fan-out.

  Additive only; no behavioral change to existing adapters (the new method and capability are optional). Follow-ups on voyant#2081: a concrete accommodations owned-search handler and the Voyant Connect `searchAvailability` implementation.

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0

## 0.129.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/db@0.108.5

## 0.129.0

## 0.128.0

## 0.127.0

### Minor Changes

- 7779772: Surface per-row Typesense bulk-import failures instead of hiding them.

  The `documents/import` endpoint returns HTTP 200 even when individual rows fail validation (e.g. a field serialized as an object where the schema expects `string[]`), so a reindex could silently leave a collection empty while the CLI exited 0. The Typesense indexer now inspects the import response.

  - `createTypesenseIndexer` parses the import response on both `upsert` and `bulkReindex`. When any row fails, it raises a new `TypesenseImportError` (carrying `collection`/`failed`/`total`/`samples`) by default, so the reindex CLI exits non-zero and event-bus subscribers log the failure.
  - New `importFailureMode: "throw" | "best-effort"` option (default `"throw"`) plus an `onImportFailure` reporter and `importErrorSampleSize`. `"best-effort"` logs representative row errors and continues.
  - New exported helpers `parseTypesenseImportResults` / `summarizeImportFailures` and types `TypesenseImportRowResult` / `ImportFailureSummary` / `ImportFailureMode`, handling both the fetch client's NDJSON string body and the SDK's parsed results array.

  The operator `reindex` CLI gains a `--best-effort` flag and fails non-zero on row import failures by default.

## 0.126.0

## 0.125.0

## 0.124.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4

## 0.124.0

## 0.123.1

## 0.123.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/hono@0.112.2

## 0.122.0

### Patch Changes

- @voyant-travel/hono@0.112.1

## 0.121.0

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/db@0.108.2

## 0.120.2

## 0.120.1

## 0.120.0

## 0.119.0

### Minor Changes

- 11095db: The catalog module now owns the catalog-booking route logic. New exports (from
  `@voyant-travel/catalog` + `@voyant-travel/catalog/booking-engine`):
  `mountCatalogBookingRoutes(hono, options)`, `createCatalogBookingOrdersRoutes`,
  and `CatalogBookingRouteModuleOptions`. The deployment injects the booking-engine
  options + a registry resolver; the booking-engine lifecycle (quote/book/holds)
  and order management (list/get/cancel) routes no longer live in the deployment.
  The slots + catalog-snapshot handlers stay a thin deployment extension because
  inventory/operations already depend on catalog (moving them would cycle).
- 13fe70b: The catalog module now owns the offers/search routes: new `@voyant-travel/catalog/offers` export (`createCatalogOffersAdminRoutes(options)`) for package-offers/detail/search/airports/cruise-pricing, with the Connect client, Typesense index lookup, and geo resolver injected as options (catalog keeps no static connect-sdk/typesense import).

### Patch Changes

- Updated dependencies [9ea7220]
  - @voyant-travel/hono@0.111.0

## 0.118.1

## 0.118.0

### Minor Changes

- c9ec9f8: Fold catalog semantic-search primitives into `@voyant-travel/catalog` and retire the first-party catalog MCP package.

  `@voyant-travel/catalog` now exports embedding providers, model compatibility helpers, semantic/BYO-vector search, and cross-audience federation from catalog-owned subpaths. `@voyant-travel/trips` now owns the small local tool registry needed by its trips agent commands instead of depending on catalog MCP tooling.

### Patch Changes

- Updated dependencies [6bff46f]
  - @voyant-travel/hono@0.110.0

## 0.117.2

### Patch Changes

- bd74fb0: Split oversized catalog React, booking route, and contract modules into focused internal files while preserving existing public exports and behavior.
- Updated dependencies [bd74fb0]
  - @voyant-travel/catalog-contracts@0.107.1

## 0.117.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/hono@0.109.1

## 0.117.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0

## 0.116.0

## 0.115.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0

## 0.115.0

### Minor Changes

- 7255353: New `fetchOverlaysForEntities(db, entityModule, entityIds)` — batched form of `fetchOverlaysForEntity` that fetches active overlays for many entities of one module in a single `IN`-list query, returned as a `Map<entityId, ResolverOverlay[]>` (every requested id present; no-overlay entities map to `[]`). Pair it with the existing `resolveEntityViewWithOverlays` to resolve a whole page of entities with one overlay round trip instead of one per entity.

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0

## 0.114.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0

## 0.113.0

## 0.112.0

## 0.111.0

## 0.110.0

## 0.109.0

## 0.108.1

### Patch Changes

- e3fa849: Move shared booking-engine client/server types into `@voyant-travel/catalog-contracts`.

  `BookingDraftShape` and the draft-shape descriptor types + defaults (`PaxBandSpec`, `PaxBandDependency`, `DEFAULT_PAX_BANDS`, `defaultDraftShapeFlags`, `defaultTravelerFields`, `defaultBookingFields`, `paxBandsAllowedTotalFrom`, …) now live at `@voyant-travel/catalog-contracts/booking-engine/draft-shape`, and `BookingPaymentIntent` joins the V1 wire contracts at `@voyant-travel/catalog-contracts/booking-engine/contracts`. This removes the layering leak where client packages (`@voyant-travel/bookings-react`, `@voyant-travel/catalog-react`) imported contract types from the backend `@voyant-travel/catalog/booking-engine` entry — both now depend on `@voyant-travel/catalog-contracts` instead and no longer depend on `@voyant-travel/catalog` at all.

  `@voyant-travel/catalog/booking-engine` re-exports all moved symbols, so existing backend importers keep working with zero changes.

- Updated dependencies [e3fa849]
  - @voyant-travel/catalog-contracts@0.107.0

## 0.108.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3

## 0.107.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/hono@0.105.2

## 0.106.0

### Minor Changes

- 7122c2a: Admin booking journey overhaul + unified new-booking + reusable catalog UI (#1625)

  - **bookings-ui**: the operator books on a single stacked, guided accordion (progressive unlock, auto-advance) instead of the wizard; storefront keeps the wizard. Travelers as add-rows + per-traveler type + CRM linking, Configure with departure-first + nested rooms + occupancy-dependency rules, price override + voucher in the side panel, single payment-link checkbox, notes/docs block, save-as-draft / confirmed-if-paid status, duplicate-departure warning, commit lands on the booking detail. Journey steps split into per-step modules. B2B billing is satisfied by a picked organization; switching the product option clears stale room selections.
  - **catalog / catalog-react / catalog-ui**: the operator catalog browse/detail UI moves into the shared `@voyant-travel/catalog-ui` + `@voyant-travel/catalog-react` packages (detail pages, browse/dynamic/scheduled, gallery, calendar, sheet, enrichment, catalog i18n) so other templates can reuse them; booking-engine commit path returns the booking id and lands on detail.
  - **catalog-contracts**: adds pax-band occupancy dependencies, the option-units configure sub-step, and the sourced stays/package rate pin (`roomTypeId` / `ratePlanId` / `board`) to the booking-engine draft + adapter contracts.
  - **products / i18n**: products booking handler forwards the slot id + breakdown currency; admin booking-journey i18n strings.

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog-contracts@0.106.0

## 0.105.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0

## 0.105.0

### Patch Changes

- c2aef18: Manifest-driven migration schema resolution (#1608).

  - `@voyant-travel/core` `VoyantConfig` gains `additionalSchemas`, `extensions`, and `schemas` fields (with validation) so a template's migrated schema set is derived from `voyant.config.ts`.
  - `catalog`, `flights`, `travel-composer`, and `workflow-runs` declare `package.json#voyant` schema metadata so they resolve into the generated schema manifest (flights pins its non-standard `./reference/local-postgres` subpath).

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/hono@0.104.2

## 0.104.7

### Patch Changes

- 0bd9900: Pin sourced stays/package bookings by stable room/rate keys. Booking drafts now
  preserve `roomTypeId`, `ratePlanId`, and `board` configure fields, and the
  catalog booking engine forwards them to adapter quote/reserve parameters so live
  re-resolution can select the exact room and board the operator picked.
- Updated dependencies [0bd9900]
  - @voyant-travel/catalog-contracts@0.105.1

## 0.104.6

### Patch Changes

- 372295b: Expose policy-derived default Typesense `query_by` helpers and collection metadata so hosted search can apply curated searchable fields when callers omit `query_by`.

## 0.104.5

## 0.104.4

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/catalog-contracts@0.105.0

## 0.104.3

### Patch Changes

- 5c467ab: Map `departure-asc` catalog search sorting to `nextDepartureDate` before falling back to timestamp fields.

## 0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/catalog-contracts@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/hono@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.2
- @voyant-travel/core@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.1
- @voyant-travel/core@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/hono@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/hono@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
- Updated dependencies [c893886]
  - @voyant-travel/catalog-contracts@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/catalog-contracts@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/hono@0.98.0

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

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/catalog-contracts@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0

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

### Patch Changes

- Updated dependencies [2d8d59b]
  - @voyant-travel/catalog-contracts@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/hono@0.96.0

## 0.95.0

### Patch Changes

- a8d3a3f: Carry canonical cruise geography through cruise models and catalog indexing so sourced and owned cruise documents can facet on regions, waterways, ports, and countries.
  - @voyant-travel/core@0.95.0
  - @voyant-travel/db@0.95.0
  - @voyant-travel/hono@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/hono@0.93.0

## 0.92.0

### Minor Changes

- 5de3d72: Extend promotion scopes with fare-code and cabin-grade targeting, and add structured eligibility flags for past-guest, solo-traveler, child-traveler, and family offers.

### Patch Changes

- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/hono@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0

## 0.88.0

### Minor Changes

- 27afa4b: Add provider-agnostic external cruise catalog refresh and reindex helpers.

### Patch Changes

- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/hono@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1

## 0.87.0

### Minor Changes

- 85505e6: Add provider capability, promotion applicability/display, and availability projection contracts for catalog source adapters.

### Patch Changes

- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/hono@0.87.0

## 0.86.0

### Minor Changes

- ddf4a19: Add typed catalog search sort options and an optional storefront card projection for public listing pages.

### Patch Changes

- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/hono@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/core@0.85.2
- @voyant-travel/db@0.85.2
- @voyant-travel/hono@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/core@0.84.3
- @voyant-travel/db@0.84.3
- @voyant-travel/hono@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/hono@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/core@0.81.21
- @voyant-travel/db@0.81.21
- @voyant-travel/hono@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/core@0.81.20
- @voyant-travel/db@0.81.20
- @voyant-travel/hono@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/core@0.81.19
- @voyant-travel/db@0.81.19
- @voyant-travel/hono@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17

## 0.81.16

### Patch Changes

- 0a617cc: Operator-dashboard booking-detail UX polish + finance refactors.

  **Booking list & detail**

  - Bookings index hides `draft` + `expired` by default; new `excludeStatuses` filter on the bookings list endpoint + react query keys.
  - Booking-detail subtitle now shows `Billing person / Product / Dates / PAX` with clickable links to the CRM person, product, and availability slot; product title truncates at 18rem with full-text tooltip.
  - Header action menu replaced by inline outline buttons (Edit / Change status / Cancel / Delete). Delete uses a proper `AlertDialog` instead of `window.confirm`.
  - Stat-card currency layout is now `<symbol> <amount> <code>` for every currency except RON (collapses to `<amount> RON`).
  - Items table dates use the active locale (`formatDateTime` from i18n provider) and show start → end when both timestamps exist.
  - Tabs reordered: Documents now precedes Suppliers.

  **Tab refactors (Items / Travelers / Payments / Invoices / Documents / Suppliers / Payment-schedule)**

  - All seven tabs migrated off `<Card>` + raw `<table>` onto the shared `<div data-slot>` + `DataTable` + `IconActionButton` + `StatusBadge` + `AlertDialog` pattern.
  - Snapshots opened in a `<Sheet>` so operators stay on the booking page.

  **Invoices tab**

  - New `BookingInvoiceDialog` (Dialog, not Sheet) for "New Invoice": Type segmented (Invoice / Proforma), Source segmented (Schedule / Custom), schedule-driven prefill that auto-derives net unit amount, tax%, due date; manual line items with add/remove; auto-derived Subtotal/Tax/Total (always read-only); SmartBill sync toggle (defaults on); Mark as paid switch with method + date pickers; attachment uploader when sync is off; sandboxed iframe contract preview.
  - Generate-from-schedule line items now back the tax out of the gross schedule amount (no more 21% inflation on top).
  - Server omits `subtotalCents/taxCents/totalCents` cross-check when client doesn't pre-compute totals.

  **Add-contract dialog (new)**

  - `BookingContractDialog` replaces the per-row "Generate contract" button. Two modes — Generate (default, preselected) renders an iframe preview via a new `?preview=true` branch on `/v1/admin/bookings/:id/generate-contract`, and Upload (title + PDF) creates a `signed`-status contract row + attaches the file.
  - Legal `autoGenerateContractForBooking` gains a `previewMode` option that stops after rendering HTML without persisting.

  **Payment schedule**

  - Switched `PaymentScheduleValue` from fixed slots to a `installments: PaymentInstallment[]` array. Mode-switch prefills due dates between today and **one day before departure** (clamps to today when lead time ≤ 1 day) and distributes amounts evenly. Add/remove redistributes amounts so the rows always sum to the booking total.
  - New Invoice column on the schedule table links to the invoice/proforma covering each row.
  - Generate-invoice / Generate-proforma actions hide when an invoice (or proforma) already covers the row, preventing accidental duplicate documents.
  - Server-side `assertBookingPaymentScheduleHasPaymentCoverage` no longer requires session-linked payments — it sums every completed payment under the booking's invoices (with FX-equivalent amounts via `baseAmountCents`) and subtracts other schedules already paid, so manually-recorded payments can mark a schedule paid.
  - Schedule edit dialog now surfaces server validation errors inline instead of swallowing them.

  **Record payment dialog**

  - "Convert proforma to invoice" switch shown when the selected invoice is a proforma + status is Completed. Default off; auto-flips on only when the entered amount (directly or via FX) covers the invoice's remaining balance. Heuristic freezes once the operator toggles. Conversion fires post-create so a failure surfaces without rolling back the payment.
  - `useInvoicePaymentMutation` now invalidates the booking-scoped payment lists (`admin-booking-payments`) so the table refreshes after recording.

  **Proforma → invoice linkage**

  - `getInvoiceById` returns `convertedToInvoiceId` + `convertedToInvoiceNumber` (the inverse of `convertedFromInvoiceId`). The invoice sheet shows a green "Invoiced" / "Facturat" status with a deep link to the final invoice when a void proforma was converted. Converted proformas are filtered out of the invoices table on the booking detail page.

  **New booking dialog**

  - The three document-related checkboxes (Generate contract / Generate invoice / Create as draft) collapse into two mutually-exclusive options: "Generate proforma" and "Generate invoice and contract". `invoiceType` plumbs through the catalog booking-engine contract, products handler, finance service, and react hook.

  **Misc**

  - SmartBill plugin honors a new `skipExternalSync` flag on `invoice.issued` / `invoice.proforma.issued` so per-invoice opt-out from external sync is possible.
  - SmartBill rate-limit date parser now anchors `24/05/2026 09:32:48`-style timestamps to UTC instead of the JS host's local time. The instant decoded from the same response is now identical on CI (UTC) and on developer machines in non-UTC zones (e.g. Europe/Bucharest, EEST). Fixes a pre-existing test failure when running locally outside UTC.
  - Bookings list excludeStatuses filter (string-or-array) parsed by `bookingListQuerySchema`.
  - `BookingPaymentsSummary` adds an FX equivalent column with `baseCurrency` + `baseAmountCents` plumbed through `publicFinanceBookingPaymentSchema` and the operator `useAdminBookingPayments` projection.
  - Currency combobox now correctly disables (forwards `disabled` to the inner input and hides the clear button when disabled).
  - New shared primitives in `@voyant-travel/bookings-ui`: `IconActionButton` (icon button with built-in tooltip) and `StatusBadge` (semantic tone mapping for status strings) — exported from the package root.
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/core@0.81.13
- @voyant-travel/db@0.81.13
- @voyant-travel/hono@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/core@0.81.9
- @voyant-travel/db@0.81.9
- @voyant-travel/hono@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/core@0.81.8
- @voyant-travel/db@0.81.8
- @voyant-travel/hono@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/core@0.81.7
- @voyant-travel/db@0.81.7
- @voyant-travel/hono@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/core@0.81.4
- @voyant-travel/db@0.81.4
- @voyant-travel/hono@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/core@0.81.3
- @voyant-travel/db@0.81.3
- @voyant-travel/hono@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/hono@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/core@0.80.15
- @voyant-travel/db@0.80.15
- @voyant-travel/hono@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/core@0.80.9
- @voyant-travel/db@0.80.9
- @voyant-travel/hono@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/core@0.80.2
- @voyant-travel/db@0.80.2
- @voyant-travel/hono@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/core@0.77.1
- @voyant-travel/db@0.77.1
- @voyant-travel/hono@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/hono@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/core@0.66.5
- @voyant-travel/db@0.66.5
- @voyant-travel/hono@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/core@0.66.4
- @voyant-travel/db@0.66.4
- @voyant-travel/hono@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/hono@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/hono@0.60.0

## 0.59.0

### Minor Changes

- 48927be: Release the changes accumulated on main since 0.58.0 that landed without
  their own changesets.

  - **products / products-react / products-ui** — add `inclusionsHtml` and
    `exclusionsHtml` rich-text fields on `ProductRecord` plus the supporting
    product-form + product-detail UI (#994). Consumer test fixtures may need
    `inclusionsHtml: null, exclusionsHtml: null` added.
  - **catalog** — widen `CancelResult.status` to include `"pending"` for
    adapters that submit async cancellations (email / partner portal / batch)
    with a `pending_channel` (#991). Downstream consumers using the narrow
    `"cancelled" | "refused" | "failed"` union need to either widen their
    surface or map `"pending"` at the boundary.
  - **ui** — drop heavy passthrough re-exports from `@voyant-travel/ui/components`
    barrel: `RichTextEditor`, `chart`, `dashboard-widgets`, `phone-input`,
    and all `NotificationTemplate*` / `notification-template-dialog` /
    `notification-{deliveries,reminder-rules,reminder-runs}-page` entries.
    Import these via subpath from `@voyant-travel/ui/components/<file>` instead
    (e.g. `@voyant-travel/ui/components/rich-text-editor`). Was leaking ~600 KB
    of tiptap/prosemirror, ~390 KB of recharts, and ~200 KB of
    libphonenumber-js into every barrel consumer.
  - **admin** — drop `DashboardPage` from the `@voyant-travel/admin` barrel for
    the same reason (recharts leakage). Import from
    `@voyant-travel/admin/dashboard` instead.

### Patch Changes

- @voyant-travel/core@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/hono@0.59.0

## 0.58.0

### Minor Changes

- 5b21488: Add zod runtime schemas for the public catalog source-adapter contract, including request/result payloads, capabilities, provenance, adapter context, and channel-push shapes. Extend reserve/cancel adapter writes with optional request scope and idempotency keys, and model async cancellation with pending status metadata.

### Patch Changes

- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/hono@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0

## 0.55.1

### Patch Changes

- 819c847: Ship the composed trip admin workflow and booking extras integration.

  Admin surfaces now include trip list/detail/composer routes, catalog-backed
  trip assembly, aggregate checkout handoff, payment-link trip summaries, and
  trip-aware navigation. Booking journeys and regular booking creation can route
  operators into the composer when the customer is building a multi-component
  itinerary.

  Catalog booking draft shapes now expose richer add-on offers, and owned product
  booking handlers can price and commit selected extras. Product detail pages can
  manage extras, booking create can select extras, and finance booking creation
  persists selected extras as booking items so invoices and payment links include
  them.

  Checkout payment pages now render clearer trip summaries, flight booking UI
  supports the refined baggage/one-way behavior used by the composer, shared UI
  exports the date-time field, and i18n includes the new trip admin copy.

- Updated dependencies [819c847]
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/core@0.53.0
- @voyant-travel/db@0.53.0
- @voyant-travel/hono@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4
- @voyant-travel/db@0.52.4
- @voyant-travel/hono@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/core@0.52.2
- @voyant-travel/db@0.52.2
- @voyant-travel/hono@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1
- @voyant-travel/db@0.52.1
- @voyant-travel/hono@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8
- @voyant-travel/db@0.50.8
- @voyant-travel/hono@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6
- @voyant-travel/db@0.50.6
- @voyant-travel/hono@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0
- @voyant-travel/db@0.39.0
- @voyant-travel/hono@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0
- @voyant-travel/db@0.37.0
- @voyant-travel/hono@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0
- @voyant-travel/db@0.36.0
- @voyant-travel/hono@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/core@0.34.0
- @voyant-travel/db@0.34.0
- @voyant-travel/hono@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1
- @voyant-travel/db@0.33.1
- @voyant-travel/hono@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0

## 0.29.0

### Minor Changes

- 583326e: PR4 of #497: booking-engine + storefront integration.

  Customers can now enter a promotion code at checkout, see the discount applied to the pre-tax base on the quote, complete the booking, and end up with a redemption row recorded by the post-commit subscriber. Storefront's `/v1/public/products/:productId/offers` and `/v1/public/offers/:slug` endpoints (previously empty) now return real data.

  **`@voyant-travel/catalog`** —

  - **Field rename**: `BookingDraft.voucher: { code }` → `BookingDraft.promotionCode: string`. Avoids permanent collision with the finance `vouchers` domain. Single live consumer (`@voyant-travel/catalog-react`'s `useBookingQuote` hook) updated.
  - **New `./booking-engine` exports**: `AppliedOffer`, `CodeStatus`, `PromotionEvaluationInput`, `PromotionEvaluationOutput` — the contract types templates implement to wire promotions. Catalog stays decoupled from `@voyant-travel/promotions`.
  - **`QuoteEntityDeps.evaluatePromotions`** — optional async hook called inside `quoteEntity` after the adapter returns pricing (only for `entity_module === "products"` in v1). Discounts apply to `pricing.base_amount` pre-tax so the operator template's `applyOperatorTaxToQuoteResult` step downstream recomputes taxes against the new base. Bad-code outcomes surface as `code_*` `invalidReason` on the quote (`code_not_found`, `code_expired`, `code_not_yet_valid`, `code_not_applicable`).
  - **`CatalogBookingRoutesOptions.resolveEvaluatePromotions`** — per-request callback templates wire so the hook closes over the request's `db`.
  - **Schema additions**:
    - `catalog_quotes.pricing_applied_offers` (JSONB, typed `AppliedOffer[]`).
    - `booking_catalog_snapshot.pricing_applied_offers` (JSONB) — frozen for audit; survives source-offer mutation.
    - Index `idx_catalog_quotes_consumed_booking` on `consumed_booking_id` for the post-commit subscriber's lookup.
  - **`PricingBasis.appliedOffers?: AppliedOffer[]`** added in-memory; `readPricingBasis`, `readPricingFromQuote`, `snapshotToPricing`, `captureSnapshot`, and `captureSnapshotGraph` all updated to round-trip the field.

  **`@voyant-travel/promotions`** —

  - **`./service-catalog-evaluator`** — `createCatalogPromotionEvaluator(db)` adapter factory. Bridges catalog's `PromotionEvaluationInput` / `PromotionEvaluationOutput` to the package's internal evaluator (PR2). Operator template wires it via `resolveEvaluatePromotions`.
  - **`./service-booking-confirmed`** — `recordPromotionRedemptionsForBooking(db, bookingId)`. Reads `pricing_applied_offers` from `catalog_quotes` joined to the booking via `consumed_booking_id` (NOT from the snapshot, to avoid an ordering race with `captureSnapshotGraph`). Aggregates per-offer (sums `discount_applied_cents` across multiple line-item snapshots; first non-null `appliedCode` wins). Idempotent upsert into `promotional_offer_redemptions` via `(offer_id, booking_id)` unique index — replay-safe.
  - **`./service-storefront`** — `createPromotionsStorefrontResolvers()` returning `StorefrontOfferResolvers`. Maps offer rows to the `StorefrontPromotionalOffer` DTO (single `discountValue` string for both `percentage` and `fixed_amount` flavors; `applicableDepartureIds: []` per v1 limitation).
  - New deps: `@voyant-travel/catalog`, `@voyant-travel/public-api` (workspace).

  **Operator template** —

  - `catalog-booking.ts` wires `resolveEvaluatePromotions: ({ db }) => createCatalogPromotionEvaluator(db)` so the hook fires for every quote.
  - `app.ts` wires `createPromotionsStorefrontResolvers()` into `createStorefrontHonoModule({ offers })`.
  - `catalog-bridge.ts` registers a second `booking.confirmed` subscriber alongside the existing snapshot capture; the new subscriber calls `recordPromotionRedemptionsForBooking`. Failure logs but doesn't rethrow (sibling subscribers shouldn't be blocked); ops can backfill from snapshot's `pricing_applied_offers`.
  - Drizzle migration `0008_white_bucky.sql` generated for the column + index additions.

  **Validation**:

  - `pnpm -F (@voyant-travel/catalog, @voyant-travel/promotions, @voyant-travel/public-api, operator) typecheck` — clean (operator runs with `NODE_OPTIONS=--max-old-space-size=8192` due to large workspace heap requirements).
  - `pnpm -F @voyant-travel/promotions test` — 84 unit tests pass; 32 integration tests skip without `TEST_DATABASE_URL` (added 6 new for the redemption recorder, 8 new for storefront resolver).
  - Biome lint clean across all touched files.

  **Honest about what the post-commit pattern guarantees**: `bookEntity` doesn't have a single enclosing transaction, so the redemption subscriber accepts a small audit gap on permanent failure (mitigated by `pricing_applied_offers` on the snapshot enabling backfill, and idempotent upsert handling subscriber retries). This was the explicit decision in §15.2 of the architecture doc.

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6
- @voyant-travel/db@0.26.6
- @voyant-travel/hono@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3

## 0.24.2

### Patch Changes

- bec0471: Export the BookingJourney Hono route factory and module from the catalog package root, matching the route-module import pattern used by the vertical packages.
  - @voyant-travel/core@0.24.2
  - @voyant-travel/db@0.24.2
  - @voyant-travel/hono@0.24.2

## 0.24.1

### Patch Changes

- 2d6297d: Expose a reusable BookingJourney Hono route module for the catalog booking engine.
  - @voyant-travel/core@0.24.1
  - @voyant-travel/db@0.24.1
  - @voyant-travel/hono@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
