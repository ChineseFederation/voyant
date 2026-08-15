# @voyant-travel/trips

## 0.236.8

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0
  - @voyant-travel/catalog@0.256.7
  - @voyant-travel/commerce@0.51.9
  - @voyant-travel/flights@0.237.13
  - @voyant-travel/inventory@0.42.10
  - @voyant-travel/operator-settings@0.18.6
  - @voyant-travel/storefront@0.259.0

## 0.236.7

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
  - @voyant-travel/bookings@0.245.0
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/catalog-contracts@0.134.1
  - @voyant-travel/catalog@0.256.6
  - @voyant-travel/commerce@0.51.8
  - @voyant-travel/inventory@0.42.9
  - @voyant-travel/storefront@0.258.0
  - @voyant-travel/flights@0.237.12
  - @voyant-travel/operator-settings@0.18.5

## 0.236.6

### Patch Changes

- Updated dependencies [020de35]
- Updated dependencies [c2aedcb]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/bookings@0.244.1
  - @voyant-travel/catalog@0.256.5
  - @voyant-travel/commerce@0.51.7
  - @voyant-travel/db@0.122.2
  - @voyant-travel/flights@0.237.11
  - @voyant-travel/hono@0.143.1
  - @voyant-travel/inventory@0.42.7
  - @voyant-travel/operator-settings@0.18.4
  - @voyant-travel/storefront@0.257.6

## 0.236.5

### Patch Changes

- Updated dependencies [8e2133e]
  - @voyant-travel/bookings@0.244.0
  - @voyant-travel/catalog@0.256.4
  - @voyant-travel/finance@0.252.1
  - @voyant-travel/commerce@0.51.5
  - @voyant-travel/inventory@0.42.5
  - @voyant-travel/storefront@0.257.5

## 0.236.4

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/bookings@0.243.1
  - @voyant-travel/catalog@0.256.3
  - @voyant-travel/commerce@0.51.4
  - @voyant-travel/flights@0.237.10
  - @voyant-travel/inventory@0.42.4
  - @voyant-travel/operator-settings@0.18.3
  - @voyant-travel/storefront@0.257.4

## 0.236.3

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/bookings@0.243.0
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/catalog@0.256.2
  - @voyant-travel/commerce@0.51.3
  - @voyant-travel/inventory@0.42.3
  - @voyant-travel/storefront@0.257.3
  - @voyant-travel/flights@0.237.9
  - @voyant-travel/operator-settings@0.18.2

## 0.236.2

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/catalog@0.256.1
  - @voyant-travel/commerce@0.51.2
  - @voyant-travel/flights@0.237.8
  - @voyant-travel/inventory@0.42.2
  - @voyant-travel/operator-settings@0.18.1
  - @voyant-travel/storefront@0.257.2

## 0.236.1

### Patch Changes

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

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog-contracts@0.134.0
  - @voyant-travel/catalog@0.256.0
  - @voyant-travel/flights@0.237.7
  - @voyant-travel/storefront@0.257.1
  - @voyant-travel/commerce@0.51.1
  - @voyant-travel/inventory@0.42.1

## 0.236.0

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

- 1a3ba50: Resolve payment links from a validated organization template, fail closed when
  customer-link configuration is unavailable, and expose the effective template
  consistently to checkout and admin copy flows.
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

- Updated dependencies [9e364c2]
- Updated dependencies [1a3ba50]
- Updated dependencies [c805276]
- Updated dependencies [599ffed]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/inventory@0.42.0
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/operator-settings@0.18.0
  - @voyant-travel/storefront@0.257.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/catalog@0.255.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/flights@0.237.6
  - @voyant-travel/catalog-contracts@0.133.1
  - @voyant-travel/bookings@0.242.0
  - @voyant-travel/commerce@0.51.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0
  - @voyant-travel/payments@0.13.1

## 0.235.1

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/catalog@0.254.1
  - @voyant-travel/commerce@0.50.1
  - @voyant-travel/flights@0.237.5
  - @voyant-travel/inventory@0.41.1
  - @voyant-travel/operator-settings@0.17.33
  - @voyant-travel/storefront@0.256.1

## 0.235.0

### Minor Changes

- 1567d3f: Restore the composer pricing and reservation legs on the Trips HTTP surface.

  `POST /{envelopeId}/price` and `POST /{envelopeId}/reserve` are the
  staff/storefront composer lifecycle, dependency-injected exactly like checkout
  and cancellation. Removing them left the admin and storefront composers calling
  routes that did not exist — trip creation failed with a bare `404` after the
  envelope and its components had already been persisted — and the durable
  replacement cannot run at all on a deployment that selects no
  `trips.durable-action-runtime` provider.

  The agent-facing `price_trip` / `reserve_trip` tools are unchanged: they remain
  admitted, asynchronous durable operations behind that port.

  Also add `packages/trips/scripts/generate-openapi.ts` and register both Trips
  documents with `verify:openapi-drift`. They had no generator, so the checked-in
  specs had drifted from the routes — the storefront and admin documents still
  advertised `hold` and `inquiry` checkout intents that were removed in #4100.

### Patch Changes

- ab7133f: Stop stamping `netopia` on operator-generated payment links, so they are payable on whatever processor the deployment actually runs. `useCollectPayment` defaulted `cardProvider` to `"netopia"` back when that was the only processor in tree, and every "Generate payment link" wrote it to `payment_sessions.provider`. On a deployment running any other processor the shopper could never pay: the card start reached the real adapter and created a live checkout session there, then the initiation result's `processorIdentity` failed the stored-provider guard, and the public route turned that into a bare 502 — leaving a live processor session attached to a payment session still marked `pending`.

  The provider now stays unset until the processor claims it on start, which is what `createOrderPaymentSessions` already documents and what the payment-link retry route already did. Because an unstarted session then has neither a provider nor a redirect URL, the landing page can no longer read "card is on offer" off the session record: `payment-link-config` publishes a `cardPayments.available` flag (the card counterpart of its bank-transfer block, sourced from whether the deployment selected a payment adapter), and `PaymentLinkLandingPage` takes it as `cardPaymentAvailable`. This also restores the card option on sessions created by "Try again", which never carried a provider either. Deployments that supply no flag keep offering card, as they did before it existed.

  The public start-card handler also logs the error it swallows — session id, stored provider, and the error's own code — instead of discarding it. The response stays deliberately opaque to the shopper; diagnosing this one otherwise meant reading platform logs and the session row by hand.

- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [ab7133f]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/bookings@0.241.0
  - @voyant-travel/catalog-contracts@0.133.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/commerce@0.50.0
  - @voyant-travel/storefront@0.256.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/payments@0.13.0
  - @voyant-travel/tools@0.10.3
  - @voyant-travel/inventory@0.41.0
  - @voyant-travel/flights@0.237.4
  - @voyant-travel/operator-settings@0.17.32

## 0.234.6

### Patch Changes

- 7db4d2a: Commit customer-built Trip snapshots without requiring accepted Proposal provenance, while preserving Proposal booking-origin evidence and renewed-acceptance handling for Proposal-backed journeys.
- a1f9523: Preserve the exact server-selected supplier kind, connection, and source reference when a Trip composite session quotes and books sourced inventory.
- Updated dependencies [c56d33a]
- Updated dependencies [a1f9523]
  - @voyant-travel/storefront@0.255.8
  - @voyant-travel/catalog@0.253.4
  - @voyant-travel/catalog-contracts@0.132.1

## 0.234.5

### Patch Changes

- 900c452: Keep production runtime-port startup preflight side-effect free while retaining exhaustive behavioral provider verification for CI and release gates.
- Updated dependencies [900c452]
  - @voyant-travel/flights@0.237.3

## 0.234.4

### Patch Changes

- Updated dependencies [bdc0190]
- Updated dependencies [c164b40]
  - @voyant-travel/bookings@0.240.12
  - @voyant-travel/catalog-contracts@0.132.0
  - @voyant-travel/catalog@0.253.3
  - @voyant-travel/flights@0.237.2
  - @voyant-travel/storefront@0.255.7

## 0.234.3

### Patch Changes

- d5037f3: Carry provider-native, non-binding shopping estimates through opaque offer references so managed Trip selections can freeze before Catalog revalidates every component for booking.
- Updated dependencies [d5037f3]
  - @voyant-travel/storefront@0.255.6

## 0.234.2

### Patch Changes

- 1a98c8a: Carry server-resolved sourced-stay identities and exact date, room, rate, and occupancy pins through opaque Trip selections, then revalidate price, lock, and confirm through the managed Connect lifecycle without exposing supplier authority to storefront clients.
- Updated dependencies [1a98c8a]
  - @voyant-travel/catalog@0.253.2
  - @voyant-travel/catalog-contracts@0.131.1
  - @voyant-travel/storefront@0.255.4

## 0.234.1

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/inventory@0.40.14
  - @voyant-travel/catalog@0.253.1
  - @voyant-travel/commerce@0.49.3
  - @voyant-travel/flights@0.237.1
  - @voyant-travel/operator-settings@0.17.30
  - @voyant-travel/storefront@0.255.2

## 0.234.0

### Minor Changes

- b95e995: Convert an exact opaque Storefront Trip selection revision into a server-priced
  composite Catalog Booking Session without exposing Trip or supplier authority
  identifiers to browser clients.
- 133c737: Add a durable, digest-only Storefront shopping reference issuer and Trips redemption adapter with scope, owner, expiry, and atomic replay enforcement.

### Patch Changes

- b760ac6: Add a closed provider-first live cruise shopping seam with exact admitted-source ownership, managed presentation FX, opaque offer references, and Catalog Booking Session reservation/reconciliation payloads.
- d359373: Redeem bound Storefront package capabilities into stable sourced Catalog booking selections.
- 4c2b4ce: Add bound opaque continuations for managed multi-source flight, stay, and package shopping.
- Updated dependencies [b95e995]
- Updated dependencies [5602eff]
- Updated dependencies [231acfa]
- Updated dependencies [e363b1b]
- Updated dependencies [6945d07]
- Updated dependencies [e06888c]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
- Updated dependencies [2feabd0]
- Updated dependencies [d359373]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog-contracts@0.131.0
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/storefront@0.255.0
  - @voyant-travel/flights@0.237.0
  - @voyant-travel/finance@0.245.7
  - @voyant-travel/operator-settings@0.17.29
  - @voyant-travel/commerce@0.49.2
  - @voyant-travel/inventory@0.40.11

## 0.233.0

### Minor Changes

- 5727c2f: Add storefront-bound opaque itinerary capabilities and persist validated market, locale, and currency scope for managed Trip composition.

### Patch Changes

- f9ea99e: Make approved trip candidate selection use durable existing-target command replay.
- 051f005: Provide the Storefront Trip selection runtime with opaque capability and item references, owner- and scope-bound access, atomic revision checks, and an injected offer reference resolver.
- Updated dependencies [b3cd1a5]
- Updated dependencies [8ab3f96]
- Updated dependencies [e0e62f3]
- Updated dependencies [4c218bc]
- Updated dependencies [6b672c0]
- Updated dependencies [5c9aa4d]
- Updated dependencies [03a91d0]
- Updated dependencies [aea1a83]
- Updated dependencies [334e990]
- Updated dependencies [d03f316]
- Updated dependencies [5cda348]
- Updated dependencies [e04b812]
- Updated dependencies [8688ef1]
- Updated dependencies [34713bd]
- Updated dependencies [3a91bc8]
  - @voyant-travel/action-ledger@0.115.17
  - @voyant-travel/catalog@0.252.3
  - @voyant-travel/storefront@0.254.0
  - @voyant-travel/tools@0.10.1
  - @voyant-travel/catalog-contracts@0.130.0
  - @voyant-travel/inventory@0.40.10
  - @voyant-travel/finance@0.245.6
  - @voyant-travel/flights@0.236.28

## 0.232.14

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/commerce@0.49.0
  - @voyant-travel/storefront@0.253.8
  - @voyant-travel/finance@0.245.2
  - @voyant-travel/bookings@0.240.5
  - @voyant-travel/inventory@0.40.8
  - @voyant-travel/operator-settings@0.17.28

## 0.232.13

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3
  - @voyant-travel/flights@0.236.27
  - @voyant-travel/commerce@0.48.13
  - @voyant-travel/inventory@0.40.7
  - @voyant-travel/storefront@0.253.7

## 0.232.12

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/catalog@0.251.3
  - @voyant-travel/commerce@0.48.12
  - @voyant-travel/flights@0.236.26
  - @voyant-travel/inventory@0.40.6
  - @voyant-travel/operator-settings@0.17.27
  - @voyant-travel/storefront@0.253.5

## 0.232.11

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/storefront@0.253.4
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/commerce@0.48.11
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/flights@0.236.25
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/inventory@0.40.5
  - @voyant-travel/operator-settings@0.17.26
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2
  - @voyant-travel/payments@0.12.2

## 0.232.10

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/finance@0.244.1
  - @voyant-travel/flights@0.236.24
  - @voyant-travel/commerce@0.48.9
  - @voyant-travel/inventory@0.40.3
  - @voyant-travel/storefront@0.253.3

## 0.232.9

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0
  - @voyant-travel/catalog@0.250.0
  - @voyant-travel/flights@0.236.23
  - @voyant-travel/commerce@0.48.8
  - @voyant-travel/inventory@0.40.2
  - @voyant-travel/storefront@0.253.2

## 0.232.8

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/catalog@0.249.1
  - @voyant-travel/commerce@0.48.7
  - @voyant-travel/flights@0.236.22
  - @voyant-travel/inventory@0.40.1
  - @voyant-travel/operator-settings@0.17.25
  - @voyant-travel/storefront@0.253.1

## 0.232.7

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/inventory@0.40.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/commerce@0.48.6
  - @voyant-travel/db@0.120.6
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/flights@0.236.21
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/operator-settings@0.17.24
  - @voyant-travel/storefront@0.253.0

## 0.232.6

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/payments@0.12.0
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/operator-settings@0.17.23
  - @voyant-travel/storefront@0.252.0
  - @voyant-travel/catalog@0.248.1
  - @voyant-travel/commerce@0.48.5
  - @voyant-travel/flights@0.236.20
  - @voyant-travel/inventory@0.39.1

## 0.232.5

### Patch Changes

- d98648a: An embedded checkout handoff now survives from the adapter to the page that
  mounts the form, so a storefront can take an in-page payment end to end.

  `PaymentHostedCheckout` gained an `embedded` arm, but nothing downstream could
  carry it: `payment_sessions.redirect_url` was the only landing slot, so the arm
  was flattened to `null` at `applyPaymentAdapterInitiationResult` and the payer
  still got redirected. This wires the rest of the path.

  **Persistence.** New `payment_sessions.checkout` jsonb column holding the whole
  discriminated union. `redirect_url` stays the redirect arm's flattened
  projection and the column every existing reader uses, so nothing that reads it
  changes. A paid session clears both, which also drops the spent client secret.

  **Negotiation is driven by the page, not guessed.** The chain now threads
  `acceptedCheckoutHandoffs` inward — landing page → `POST /start-card` →
  `PaymentLinkRoutesOptions.startCardPayment` → `CardPaymentStartArgs` →
  `adapter.initiate` — and the handoff back out. Every hop defaults to
  redirect-only when the field is absent, so a client built before this release
  keeps getting a redirect from a processor that has since gained in-page support.

  **The UI seam.** `PaymentLinkLandingPageProps.embeddedCheckoutClient` takes a
  `ComponentType<PaymentEmbeddedCheckoutClientProps>` — the same
  prop-injection shape as `PaymentEmbeddedOnboardingClient` in operator-settings.
  Supplying it is what makes the page request the embedded arm at all. This
  package still imports no provider SDK: the concrete Stripe Elements / Adyen
  Drop-in component belongs to the deployment, code-split at its composition root.
  The client secret reaches it through a `fetchClientSecret` callback rather than
  a prop, so it is not sitting in the rendered tree.

  **Contracts.** `paymentCheckoutSchema` mirrors the port union in zod;
  `finance-contracts` depends only on zod, so an annotated projection in finance's
  public service pins the mirror to `PaymentHostedCheckout` and fails the build if
  the arms drift. `publicPaymentSessionSchema` and the start-card response both
  carry `checkout`.

  Not covered: the commerce booking-engine checkout still requests redirect-only,
  and `POST /payment-sessions/{id}/requires-redirect` is unchanged — it stamps a
  URL by name and by contract. Both are safe by the redirect default rather than
  by omission.

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/inventory@0.39.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/storefront@0.251.0
  - @voyant-travel/flights@0.236.19
  - @voyant-travel/commerce@0.48.4
  - @voyant-travel/operator-settings@0.17.22

## 0.232.4

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/payments@0.11.0
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/inventory@0.38.0
  - @voyant-travel/catalog@0.247.0
  - @voyant-travel/operator-settings@0.17.21
  - @voyant-travel/storefront@0.250.0
  - @voyant-travel/commerce@0.48.3
  - @voyant-travel/flights@0.236.18

## 0.232.3

### Patch Changes

- Updated dependencies [79da374]
  - @voyant-travel/payments@0.10.0
  - @voyant-travel/finance@0.240.1
  - @voyant-travel/operator-settings@0.17.20
  - @voyant-travel/storefront@0.249.0

## 0.232.2

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/inventory@0.37.0
  - @voyant-travel/commerce@0.48.2
  - @voyant-travel/storefront@0.248.0
  - @voyant-travel/flights@0.236.17
  - @voyant-travel/operator-settings@0.17.19
  - @voyant-travel/action-ledger@0.115.14

## 0.232.1

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/inventory@0.36.0
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/storefront@0.247.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/commerce@0.48.1
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3
  - @voyant-travel/flights@0.236.16
  - @voyant-travel/operator-settings@0.17.18

## 0.232.0

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
  - @voyant-travel/catalog@0.245.0
  - @voyant-travel/inventory@0.35.0
  - @voyant-travel/commerce@0.48.0
  - @voyant-travel/flights@0.236.15
  - @voyant-travel/storefront@0.246.0
  - @voyant-travel/operator-settings@0.17.17

## 0.231.5

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/flights@0.236.14
  - @voyant-travel/commerce@0.47.14
  - @voyant-travel/inventory@0.34.3
  - @voyant-travel/storefront@0.245.3

## 0.231.4

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/flights@0.236.13
  - @voyant-travel/commerce@0.47.13
  - @voyant-travel/inventory@0.34.2
  - @voyant-travel/storefront@0.245.2

## 0.231.3

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/flights@0.236.12
  - @voyant-travel/commerce@0.47.12
  - @voyant-travel/inventory@0.34.1
  - @voyant-travel/storefront@0.245.1

## 0.231.2

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/inventory@0.34.0
  - @voyant-travel/commerce@0.47.11
  - @voyant-travel/storefront@0.245.0

## 0.231.1

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3
  - @voyant-travel/flights@0.236.11
  - @voyant-travel/commerce@0.47.10
  - @voyant-travel/inventory@0.33.1
  - @voyant-travel/storefront@0.244.1

## 0.231.0

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
  - @voyant-travel/inventory@0.33.0
  - @voyant-travel/flights@0.236.10
  - @voyant-travel/commerce@0.47.9
  - @voyant-travel/storefront@0.244.0

## 0.230.0

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
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/inventory@0.32.0
  - @voyant-travel/flights@0.236.9
  - @voyant-travel/commerce@0.47.8
  - @voyant-travel/storefront@0.243.0

## 0.229.9

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/inventory@0.31.0
  - @voyant-travel/flights@0.236.8
  - @voyant-travel/commerce@0.47.7
  - @voyant-travel/storefront@0.242.0

## 0.229.8

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b3cfd05]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/inventory@0.30.0
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/storefront@0.241.0
  - @voyant-travel/catalog@0.237.2
  - @voyant-travel/commerce@0.47.6
  - @voyant-travel/flights@0.236.7
  - @voyant-travel/operator-settings@0.17.16

## 0.229.7

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/inventory@0.29.2
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/commerce@0.47.5
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/flights@0.236.6
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/operator-settings@0.17.15
  - @voyant-travel/storefront@0.240.1

## 0.229.6

### Patch Changes

- Updated dependencies [a3c04c4]
  - @voyant-travel/inventory@0.29.0
  - @voyant-travel/storefront@0.240.0

## 0.229.5

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [2df8a92]
- Updated dependencies [06a79a0]
- Updated dependencies [038a576]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/inventory@0.28.0
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/commerce@0.47.4
  - @voyant-travel/flights@0.236.5
  - @voyant-travel/operator-settings@0.17.14
  - @voyant-travel/storefront@0.239.0

## 0.229.4

### Patch Changes

- Updated dependencies [41a6567]
- Updated dependencies [c35841b]
  - @voyant-travel/inventory@0.27.9
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/commerce@0.47.3
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/flights@0.236.4
  - @voyant-travel/operator-settings@0.17.13
  - @voyant-travel/storefront@0.238.4
  - @voyant-travel/core@0.137.2
  - @voyant-travel/payments@0.9.2

## 0.229.3

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/catalog-contracts@0.116.0
  - @voyant-travel/commerce@0.47.2
  - @voyant-travel/flights@0.236.3
  - @voyant-travel/inventory@0.27.8
  - @voyant-travel/storefront@0.238.3

## 0.229.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/inventory@0.27.7
  - @voyant-travel/storefront@0.238.2
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/catalog@0.234.2
  - @voyant-travel/commerce@0.47.1
  - @voyant-travel/flights@0.236.2
  - @voyant-travel/operator-settings@0.17.12
  - @voyant-travel/types@0.109.12

## 0.229.1

### Patch Changes

- f69e880: Make commercial commitment the sole Booking creation boundary for Booking
  Platform v1.

  Bookings now use only `confirmed`, `in_progress`, `completed`, and `cancelled`
  states. Quote, Hold, supplier-operation, and payment lifecycles remain owned by
  their respective domains. The beta-data migration preserves evidenced
  commitments, fails closed on ambiguous external effects, restores capacity for
  abandoned attempts, and removes the obsolete Booking-backed session state.

- Updated dependencies [f69e880]
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/commerce@0.47.0
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/storefront@0.238.1
  - @voyant-travel/inventory@0.27.6
  - @voyant-travel/operator-settings@0.17.11
  - @voyant-travel/flights@0.236.1

## 0.229.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/catalog-contracts@0.115.1
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/commerce@0.46.10
  - @voyant-travel/flights@0.236.0
  - @voyant-travel/inventory@0.27.5
  - @voyant-travel/storefront@0.238.0
  - @voyant-travel/operator-settings@0.17.10
  - @voyant-travel/bookings@0.236.0

## 0.228.0

### Patch Changes

- Updated dependencies [aebc8c6]
  - @voyant-travel/payments@0.9.0
  - @voyant-travel/finance@0.235.0
  - @voyant-travel/operator-settings@0.17.9
  - @voyant-travel/storefront@0.237.0
  - @voyant-travel/bookings@0.235.0
  - @voyant-travel/catalog@0.233.0
  - @voyant-travel/flights@0.235.0
  - @voyant-travel/commerce@0.46.9
  - @voyant-travel/inventory@0.27.4

## 0.227.0

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
  - @voyant-travel/storefront@0.236.0
  - @voyant-travel/commerce@0.46.8
  - @voyant-travel/flights@0.234.0
  - @voyant-travel/inventory@0.27.3
  - @voyant-travel/operator-settings@0.17.8
  - @voyant-travel/db@0.119.4

## 0.226.0

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/commerce@0.46.7
  - @voyant-travel/flights@0.233.0
  - @voyant-travel/inventory@0.27.2
  - @voyant-travel/storefront@0.235.0
  - @voyant-travel/operator-settings@0.17.7
  - @voyant-travel/db@0.119.3

## 0.225.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/flights@0.232.0
  - @voyant-travel/commerce@0.46.6
  - @voyant-travel/inventory@0.27.1
  - @voyant-travel/storefront@0.234.0
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0
  - @voyant-travel/operator-settings@0.17.6

## 0.224.0

### Patch Changes

- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/inventory@0.27.0
  - @voyant-travel/storefront@0.233.0
  - @voyant-travel/commerce@0.46.5
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/flights@0.231.0
  - @voyant-travel/operator-settings@0.17.5

## 0.223.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/commerce@0.46.4
  - @voyant-travel/flights@0.230.0
  - @voyant-travel/inventory@0.26.3
  - @voyant-travel/storefront@0.232.0
  - @voyant-travel/operator-settings@0.17.4

## 0.222.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/inventory@0.26.2
  - @voyant-travel/commerce@0.46.2
  - @voyant-travel/flights@0.229.0
  - @voyant-travel/operator-settings@0.17.3
  - @voyant-travel/storefront@0.231.0
  - @voyant-travel/bookings@0.229.0

## 0.221.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/catalog@0.226.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/flights@0.228.0
- @voyant-travel/storefront@0.230.0
- @voyant-travel/commerce@0.46.1
- @voyant-travel/inventory@0.26.1
- @voyant-travel/operator-settings@0.17.2

## 0.220.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/commerce@0.46.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/inventory@0.26.0
  - @voyant-travel/storefront@0.229.0
  - @voyant-travel/operator-settings@0.17.1
  - @voyant-travel/db@0.119.2
  - @voyant-travel/flights@0.227.0

## 0.219.1

### Patch Changes

- Updated dependencies [5694a2b]
  - @voyant-travel/operator-settings@0.17.0
  - @voyant-travel/inventory@0.25.4

## 0.219.0

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/commerce@0.45.6
  - @voyant-travel/inventory@0.25.3
  - @voyant-travel/storefront@0.228.0
  - @voyant-travel/flights@0.226.0
  - @voyant-travel/operator-settings@0.16.12

## 0.218.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/storefront@0.227.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/commerce@0.45.5
  - @voyant-travel/flights@0.225.0
  - @voyant-travel/inventory@0.25.2
  - @voyant-travel/operator-settings@0.16.11
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/payments@0.8.1

## 0.217.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/commerce@0.45.4
  - @voyant-travel/finance@0.224.0
  - @voyant-travel/flights@0.224.0
  - @voyant-travel/inventory@0.25.1
  - @voyant-travel/operator-settings@0.16.10
  - @voyant-travel/storefront@0.226.0

## 0.216.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/storefront@0.225.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/inventory@0.25.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/commerce@0.45.3
  - @voyant-travel/finance@0.223.0
  - @voyant-travel/flights@0.223.0
  - @voyant-travel/operator-settings@0.16.9

## 0.215.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/flights@0.222.0
- @voyant-travel/storefront@0.224.0
- @voyant-travel/commerce@0.45.2
- @voyant-travel/inventory@0.24.2
- @voyant-travel/operator-settings@0.16.8

## 0.214.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/commerce@0.45.1
  - @voyant-travel/flights@0.221.1
  - @voyant-travel/inventory@0.24.1
  - @voyant-travel/operator-settings@0.16.7
  - @voyant-travel/storefront@0.223.1

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
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/catalog@0.219.0
  - @voyant-travel/commerce@0.45.0
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/storefront@0.223.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/inventory@0.24.0
  - @voyant-travel/flights@0.221.0
  - @voyant-travel/operator-settings@0.16.6

## 0.213.0

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
  - @voyant-travel/commerce@0.44.20
  - @voyant-travel/inventory@0.23.5
  - @voyant-travel/storefront@0.222.0
  - @voyant-travel/flights@0.220.0
  - @voyant-travel/operator-settings@0.16.5
  - @voyant-travel/types@0.109.10

## 0.212.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/storefront@0.221.0
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/flights@0.219.0
  - @voyant-travel/commerce@0.44.19
  - @voyant-travel/inventory@0.23.4
  - @voyant-travel/operator-settings@0.16.4

## 0.211.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/commerce@0.44.17
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/inventory@0.23.1
  - @voyant-travel/storefront@0.220.0
  - @voyant-travel/flights@0.218.0
  - @voyant-travel/operator-settings@0.16.3

## 0.210.0

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/inventory@0.23.0
  - @voyant-travel/storefront@0.219.0
  - @voyant-travel/bookings@0.217.0
  - @voyant-travel/catalog@0.215.0
  - @voyant-travel/finance@0.217.0
  - @voyant-travel/flights@0.217.0
  - @voyant-travel/commerce@0.44.16
  - @voyant-travel/operator-settings@0.16.2

## 0.209.1

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/catalog@0.214.1
  - @voyant-travel/commerce@0.44.15
  - @voyant-travel/db@0.118.6
  - @voyant-travel/storefront@0.218.1

## 0.209.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/commerce@0.44.14
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/inventory@0.22.4
  - @voyant-travel/storefront@0.218.0
  - @voyant-travel/flights@0.216.0
  - @voyant-travel/operator-settings@0.16.1

## 0.208.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/payments@0.8.0
  - @voyant-travel/operator-settings@0.16.0
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/storefront@0.217.0
  - @voyant-travel/inventory@0.22.2
  - @voyant-travel/bookings@0.215.0
  - @voyant-travel/catalog@0.213.0
  - @voyant-travel/flights@0.215.0
  - @voyant-travel/commerce@0.44.13

## 0.207.0

### Minor Changes

- 1c0eecc: Add `list_trips` and `get_trip` Tools.

  The Trips tool surface was write-only: `create_trip`, `revise_trip`,
  `price_trip` and `reserve_trip` all take an envelope id, and nothing could
  produce one. Of 124 read-shaped Tools on the surface, none read a trip — the
  two `get_trip_*` Tools read a pricing/sourcing _operation_, not the trip.

  So a trip id was only ever knowable inside the conversation that created it,
  which made the composed-itinerary flow impossible to resume and left Max
  unable to read back its own work.

  `listTripsQuerySchema`, `listTripsRoute` and `getTripRoute` already existed and
  the admin Trips page uses them; only the Tool declarations were missing. The
  list Tool mirrors the HTTP filters without the query-string coercion — a
  `z.coerce.boolean()` parameter would publish untyped and treat any non-empty
  string as true, which is the wrong contract for a model composing arguments.

## 0.206.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/catalog@0.212.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/flights@0.214.0
- @voyant-travel/storefront@0.216.0
- @voyant-travel/commerce@0.44.12
- @voyant-travel/inventory@0.22.1
- @voyant-travel/operator-settings@0.15.9

## 0.205.0

### Patch Changes

- f50ab57: State the manual-service and accommodation date-range rules for trip components
  in the `components` / `addComponents` descriptions. Both are enforced by a Zod
  refinement over a free-form `metadata` record, and refinements do not serialize
  into JSON Schema, so an agent could not see them when choosing arguments.
- Updated dependencies [9d84e82]
  - @voyant-travel/inventory@0.22.0
  - @voyant-travel/storefront@0.215.0
  - @voyant-travel/bookings@0.213.0
  - @voyant-travel/catalog@0.211.0
  - @voyant-travel/finance@0.213.0
  - @voyant-travel/flights@0.213.0
  - @voyant-travel/commerce@0.44.11
  - @voyant-travel/operator-settings@0.15.8

## 0.204.0

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/commerce@0.44.10
  - @voyant-travel/flights@0.212.0
  - @voyant-travel/inventory@0.21.12
  - @voyant-travel/bookings@0.212.0
  - @voyant-travel/finance@0.212.0
  - @voyant-travel/storefront@0.214.0
  - @voyant-travel/operator-settings@0.15.7

## 0.203.0

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/commerce@0.44.9
  - @voyant-travel/flights@0.211.0
  - @voyant-travel/inventory@0.21.10
  - @voyant-travel/bookings@0.211.0
  - @voyant-travel/finance@0.211.0
  - @voyant-travel/storefront@0.213.0
  - @voyant-travel/operator-settings@0.15.6

## 0.202.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/flights@0.210.0
- @voyant-travel/storefront@0.212.0
- @voyant-travel/commerce@0.44.8
- @voyant-travel/inventory@0.21.9
- @voyant-travel/operator-settings@0.15.5

## 0.201.0

### Patch Changes

- @voyant-travel/inventory@0.21.8
- @voyant-travel/storefront@0.211.0
- @voyant-travel/bookings@0.209.0
- @voyant-travel/catalog@0.207.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/flights@0.209.0
- @voyant-travel/commerce@0.44.7
- @voyant-travel/operator-settings@0.15.4

## 0.200.0

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/catalog@0.206.0
- @voyant-travel/finance@0.208.0
- @voyant-travel/flights@0.208.0
- @voyant-travel/storefront@0.210.0
- @voyant-travel/commerce@0.44.6
- @voyant-travel/inventory@0.21.7
- @voyant-travel/operator-settings@0.15.3

## 0.199.2

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.
- Updated dependencies [2cfce32]
  - @voyant-travel/catalog@0.205.2
  - @voyant-travel/action-ledger@0.115.2

## 0.199.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on the four remaining grandfathered trip
  actions and remove them from the legacy execute+tools allowlist:

  - `action.create-trip` already claims its command idempotently via
    `executeAdmittedCreatedTargetCommand` (the `handler-command-claim-v1`
    `createdTarget` contract was already declared); this adds `availability`
    and `effectBoundary: "local"`.
  - `action.add-requirement` already declared `targetLifecycle: "existing"`
    against an existing trip envelope; this adds `availability` and
    `effectBoundary: "local"`.
  - `action.revise-trip` adds/removes trip-envelope components with plain
    local Postgres writes against an existing envelope, so it declares
    `commandTargetField: "envelopeId"`, `targetLifecycle: "existing"`, and
    `availability`/`effectBoundary: "local"`.
  - `action.select-candidate` promotes a candidate and pins a component on an
    already-existing trip requirement with local Postgres writes, so it
    declares `targetLifecycle: "existing"` plus `availability`/
    `effectBoundary: "local"` against its existing `commandTargetField:
"requirementId"`.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/commerce@0.44.5
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/storefront@0.209.1

## 0.199.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/commerce@0.44.4
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/inventory@0.21.2
  - @voyant-travel/storefront@0.209.0
  - @voyant-travel/flights@0.207.0
  - @voyant-travel/operator-settings@0.15.1

## 0.198.0

### Patch Changes

- 5daf427: Add the managed Voyant Payments transport and honest capability contract, hosted
  Stripe Connect onboarding for operators, and scheduled storefront reconciliation.

  Expose typed fail-closed adapter errors and onboarding state, render embedded
  onboarding with the required narrowly scoped security headers, and keep payment
  authorization distinct from completed settlement.

  Expand the public payment-adapter conformance kit across authorize, capture,
  void, refund, and status, with capability and fixture honesty, strict positive
  minor-unit money, typed fail-closed errors, full idempotency conflict checks,
  callback signature and replay semantics, stable processor identity and
  references, manual capture, partial-operation bounds, and typed health
  diagnostics. Add deterministic conforming and deliberately broken fake adapters
  that exercise every contract case.

- Updated dependencies [5daf427]
  - @voyant-travel/payments@0.7.0
  - @voyant-travel/operator-settings@0.15.0
  - @voyant-travel/storefront@0.208.0
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/inventory@0.21.1
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/flights@0.206.0
  - @voyant-travel/commerce@0.44.3

## 0.197.0

### Patch Changes

- Updated dependencies [113edfc]
- Updated dependencies [58baffe]
  - @voyant-travel/flights@0.205.0
  - @voyant-travel/inventory@0.21.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/storefront@0.207.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/commerce@0.44.2
  - @voyant-travel/operator-settings@0.14.26
  - @voyant-travel/bookings@0.205.0

## 0.196.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/flights@0.204.0
- @voyant-travel/storefront@0.206.0
- @voyant-travel/commerce@0.44.1
- @voyant-travel/inventory@0.20.1
- @voyant-travel/operator-settings@0.14.25

## 0.195.0

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
  - @voyant-travel/inventory@0.20.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/commerce@0.44.0
  - @voyant-travel/storefront@0.205.0
  - @voyant-travel/flights@0.203.0
  - @voyant-travel/operator-settings@0.14.24

## 0.194.0

### Minor Changes

- 3201e48: Replace direct Trip pricing and reservation mutations with handler-admitted,
  asynchronous durable operations. Deployments can enable the actions only by
  selecting an exact provider that passes replay, restart reconciliation, payload
  drift, and backend-identity conformance. Add an immutable operation-status Tool
  and remove the direct price/reserve HTTP routes plus the transitional
  `reserveTripDeps` route authority. `create_trip` now accepts idempotency only
  from the admitted `_voyant` invocation instead of a top-level compatibility
  field.

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/flights@0.202.0
- @voyant-travel/storefront@0.204.0
- @voyant-travel/commerce@0.43.3
- @voyant-travel/inventory@0.19.6
- @voyant-travel/operator-settings@0.14.23

## 0.193.1

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
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/flights@0.201.1
  - @voyant-travel/inventory@0.19.5
  - @voyant-travel/storefront@0.203.1
  - @voyant-travel/operator-settings@0.14.22

## 0.193.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/commerce@0.43.1
  - @voyant-travel/flights@0.201.0
  - @voyant-travel/inventory@0.19.4
  - @voyant-travel/operator-settings@0.14.21
  - @voyant-travel/storefront@0.203.0
  - @voyant-travel/bookings@0.201.0

## 0.192.0

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
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storefront@0.202.0
  - @voyant-travel/flights@0.200.0
  - @voyant-travel/inventory@0.19.3
  - @voyant-travel/operator-settings@0.14.20
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/payments@0.6.5

## 0.191.0

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
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/flights@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/inventory@0.19.2
  - @voyant-travel/operator-settings@0.14.19
  - @voyant-travel/payments@0.6.4
  - @voyant-travel/storefront@0.201.0

## 0.190.1

### Patch Changes

- Updated dependencies [e2cb9f5]
  - @voyant-travel/inventory@0.19.1
  - @voyant-travel/bookings@0.198.1
  - @voyant-travel/catalog@0.196.1
  - @voyant-travel/finance@0.198.1
  - @voyant-travel/flights@0.198.1
  - @voyant-travel/storefront@0.200.1

## 0.190.0

### Patch Changes

- @voyant-travel/inventory@0.19.0
- @voyant-travel/storefront@0.200.0
- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/finance@0.198.0
- @voyant-travel/flights@0.198.0
- @voyant-travel/commerce@0.42.1
- @voyant-travel/operator-settings@0.14.18

## 0.189.0

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [e44781c]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/commerce@0.42.0
  - @voyant-travel/inventory@0.18.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/flights@0.197.0
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operator-settings@0.14.17
  - @voyant-travel/payments@0.6.3
  - @voyant-travel/storefront@0.199.0

## 0.188.0

### Minor Changes

- 0190317: Make product, product-composition, MICE-program, trip, and room-block creation
  Tools use handler-owned atomic created-target command claims with exact replay
  and drift conflicts.
- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.
- 8a4f3cd: Add fail-closed graph availability and tested-durability metadata for execute Tool actions.
  Unavailable actions remain diagnosable in resolved graph metadata while their Tool runtime is
  excluded from action-ledger and MCP lowering. Reclassify Trips pricing as a write and keep it
  unavailable until its provider and persistence stages gain tested durable orchestration.

### Patch Changes

- bba4fec: Anchor generated-child actions to stable existing parents so action policy checks
  do not require IDs that only exist after dispatch. Split relationship child
  creation Tools by person and organization so each selected action has one
  unambiguous parent target type. Bind each generic action's policy target to its
  domain parent-id input before ledger, approval, or handler execution.
- Updated dependencies [0190317]
- Updated dependencies [78423d3]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/inventory@0.17.0
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/storefront@0.198.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/flights@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-settings@0.14.16
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/payments@0.6.2

## 0.187.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/commerce@0.40.6
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/inventory@0.16.2
  - @voyant-travel/storefront@0.197.0
  - @voyant-travel/flights@0.195.0
  - @voyant-travel/operator-settings@0.14.15

## 0.186.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/inventory@0.16.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/flights@0.194.0
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/storefront@0.196.0
  - @voyant-travel/operator-settings@0.14.14

## 0.185.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/inventory@0.16.0
  - @voyant-travel/storefront@0.195.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/flights@0.193.0
  - @voyant-travel/commerce@0.40.4
  - @voyant-travel/operator-settings@0.14.13

## 0.184.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/flights@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/inventory@0.15.3
  - @voyant-travel/operator-settings@0.14.12
  - @voyant-travel/payments@0.6.1
  - @voyant-travel/storefront@0.194.1

## 0.184.0

### Patch Changes

- e68a705: Add processor identity to payment adapter contracts and persist managed payment
  connection ids on finance payment sessions. Payment callbacks now reject
  verified provider/connection mismatches, payment-session provider payload and
  metadata updates merge instead of overwrite, duplicate paid callbacks serialize
  under a row lock, and the public payment-link callback/start-card routes accept
  managed `connectionId` callback forwarding, additive refreshed session
  responses, and non-redirect processor continuations.
  Processor callbacks now compare and adopt identities under the payment-session
  row lock, preserve monotonic session states during concurrent delivery, and
  reject callback-routing metadata and return URLs supplied by public clients.
  Provider-neutral cancel and shipping fields flow through the selected adapter
  contract, with processor return and cancel URLs derived from server-owned
  session and deployment configuration.
  Public payment-session reads can refresh provider status through the selected
  adapter while resending the session's pinned processor identity and preserving
  the same locked monotonic transition rules as callbacks. Persisted, uniquely
  fenced leases bound anonymous status polling, and processor session/payment
  references cannot change after they are first pinned. Card initiation now uses
  a single atomic claim so active or ambiguous attempts cannot create duplicate
  processor payments.
- Updated dependencies [e68a705]
  - @voyant-travel/payments@0.6.0
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/storefront@0.194.0
  - @voyant-travel/operator-settings@0.14.11
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/flights@0.192.0
  - @voyant-travel/commerce@0.40.2
  - @voyant-travel/inventory@0.15.2

## 0.183.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/commerce@0.40.1
  - @voyant-travel/flights@0.191.0
  - @voyant-travel/inventory@0.15.1
  - @voyant-travel/operator-settings@0.14.10
  - @voyant-travel/storefront@0.193.0
  - @voyant-travel/bookings@0.191.0

## 0.182.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/inventory@0.15.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/storefront@0.192.0
  - @voyant-travel/flights@0.190.0
  - @voyant-travel/operator-settings@0.14.9
  - @voyant-travel/types@0.109.9
  - @voyant-travel/payments@0.5.2

## 0.181.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/commerce@0.39.25
  - @voyant-travel/flights@0.189.0
  - @voyant-travel/inventory@0.14.28
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0
  - @voyant-travel/storefront@0.191.0
  - @voyant-travel/operator-settings@0.14.8

## 0.180.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/flights@0.188.0
  - @voyant-travel/inventory@0.14.27
  - @voyant-travel/operator-settings@0.14.7
  - @voyant-travel/storefront@0.190.0

## 0.179.1

### Patch Changes

- c2a9f4f: Separate the operator payment callback origin from the customer-facing checkout URL.

## 0.179.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/flights@0.187.0
- @voyant-travel/storefront@0.189.0
- @voyant-travel/commerce@0.39.23
- @voyant-travel/inventory@0.14.24
- @voyant-travel/operator-settings@0.14.6

## 0.178.1

### Patch Changes

- 5c912fb: Keep the Trips runtime contributor's Storefront payment-link registration inline
  (`[storefrontPaymentLinkRuntimePort.id]: createStandardPaymentLinkRouteOptions(...)`)
  so it satisfies the `storefront-subscriber-authority` architecture check, while
  still threading the selected payment adapter into the payment-link route options.
  `createStandardPaymentLinkRouteOptions` now accepts an already-resolved adapter
  or a promise and resolves it lazily inside the card-payment starter.

## 0.178.0

### Minor Changes

- b27847f: Charge payment links by card through the deployment's connected processor.

  The Storefront payment-link `start-card` path was a stub that always reported
  "not configured" (503), so only the full booking checkout could take card
  payments. The trips runtime contributor now threads the selected payment adapter
  into the payment-link route options, wiring `startCardPayment` to the same
  neutral finance card starter the checkout path uses — so a card payment link
  redirects the customer to the connected processor's hosted checkout.

  Also corrects the processor notify (IPN) URL to the operator API mount:
  `${publicCheckoutBaseUrl}/api/v1/public/payment-link/callback` (was missing the
  `/api` prefix), so the processor's server-side confirmation reaches the
  deployment webhook.

## 0.177.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/flights@0.186.0
- @voyant-travel/storefront@0.188.0
- @voyant-travel/commerce@0.39.22
- @voyant-travel/inventory@0.14.22
- @voyant-travel/operator-settings@0.14.5

## 0.176.0

### Minor Changes

- e7e90bf: Pass the deployment's public payment webhook to the card processor as
  `metadata.notifyUrl` when starting a hosted payment. The generic payment
  adapter forwards it to the connected processor worker so redirect processors
  (e.g. Netopia) POST their server-side confirmation (IPN) back to
  `/v1/public/payment-link/callback`, closing the charge-confirmation loop.
  Finance's card-payment starter gains an optional `resolveNotifyUrl(c)`; the
  Storefront-selected trips runtime derives it from the public checkout base URL.

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/commerce@0.39.21
  - @voyant-travel/flights@0.185.0
  - @voyant-travel/inventory@0.14.21
  - @voyant-travel/operator-settings@0.14.4
  - @voyant-travel/storefront@0.187.0
  - @voyant-travel/bookings@0.185.0

## 0.175.0

### Patch Changes

- Updated dependencies [a33c590]
  - @voyant-travel/inventory@0.14.20
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/catalog@0.182.0
  - @voyant-travel/finance@0.184.0
  - @voyant-travel/flights@0.184.0
  - @voyant-travel/storefront@0.186.0
  - @voyant-travel/commerce@0.39.20
  - @voyant-travel/operator-settings@0.14.3

## 0.174.0

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/payments@0.5.0
  - @voyant-travel/storefront@0.185.0
  - @voyant-travel/finance@0.183.0
  - @voyant-travel/operator-settings@0.14.2
  - @voyant-travel/bookings@0.183.0
  - @voyant-travel/catalog@0.181.0
  - @voyant-travel/flights@0.183.0
  - @voyant-travel/commerce@0.39.19
  - @voyant-travel/inventory@0.14.19

## 0.173.3

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/catalog@0.180.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/flights@0.182.2
- @voyant-travel/storefront@0.184.2

## 0.173.2

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/flights@0.182.1
  - @voyant-travel/inventory@0.14.18
  - @voyant-travel/operator-settings@0.14.1
  - @voyant-travel/storefront@0.184.1

## 0.173.1

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/payments@0.4.0
  - @voyant-travel/operator-settings@0.14.0
  - @voyant-travel/finance@0.182.2
  - @voyant-travel/inventory@0.14.17

## 0.173.0

### Patch Changes

- @voyant-travel/storefront@0.184.0
- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/flights@0.182.0
- @voyant-travel/commerce@0.39.17
- @voyant-travel/inventory@0.14.15
- @voyant-travel/operator-settings@0.13.1

## 0.172.1

### Patch Changes

- Updated dependencies [0fa5feb]
  - @voyant-travel/operator-settings@0.13.0
  - @voyant-travel/inventory@0.14.14

## 0.172.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/operator-settings@0.12.0
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/inventory@0.14.13
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/commerce@0.39.16
  - @voyant-travel/flights@0.181.0
  - @voyant-travel/storefront@0.183.0

## 0.171.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/payments@0.3.0
  - @voyant-travel/operator-settings@0.11.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/inventory@0.14.12
  - @voyant-travel/db@0.117.1
  - @voyant-travel/bookings@0.180.1
  - @voyant-travel/catalog@0.178.1
  - @voyant-travel/flights@0.180.1
  - @voyant-travel/storefront@0.182.1

## 0.171.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront@0.182.0
  - @voyant-travel/bookings@0.180.0
  - @voyant-travel/catalog@0.178.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/flights@0.180.0
  - @voyant-travel/commerce@0.39.15
  - @voyant-travel/inventory@0.14.11
  - @voyant-travel/operator-settings@0.10.11

## 0.170.0

### Patch Changes

- @voyant-travel/storefront@0.181.0
- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/flights@0.179.0
- @voyant-travel/commerce@0.39.14
- @voyant-travel/inventory@0.14.10
- @voyant-travel/operator-settings@0.10.10

## 0.169.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/flights@0.178.0
- @voyant-travel/storefront@0.180.0
- @voyant-travel/commerce@0.39.13
- @voyant-travel/inventory@0.14.9
- @voyant-travel/operator-settings@0.10.9

## 0.168.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/flights@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/inventory@0.14.8
  - @voyant-travel/operator-settings@0.10.8
  - @voyant-travel/storefront@0.179.0
  - @voyant-travel/types@0.109.8

## 0.167.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/storefront@0.178.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/flights@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/inventory@0.14.7
  - @voyant-travel/operator-settings@0.10.7
  - @voyant-travel/types@0.109.7

## 0.166.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/storefront@0.177.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/inventory@0.14.6
  - @voyant-travel/flights@0.175.0
  - @voyant-travel/operator-settings@0.10.6
  - @voyant-travel/payments@0.2.6
  - @voyant-travel/types@0.109.6

## 0.165.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/flights@0.174.0
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/inventory@0.14.5
  - @voyant-travel/operator-settings@0.10.5
  - @voyant-travel/payments@0.2.5
  - @voyant-travel/storefront@0.176.0

## 0.164.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/flights@0.173.0
- @voyant-travel/storefront@0.175.0
- @voyant-travel/commerce@0.39.8
- @voyant-travel/inventory@0.14.4
- @voyant-travel/operator-settings@0.10.4

## 0.163.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/storefront@0.174.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/inventory@0.14.3
  - @voyant-travel/db@0.114.14
  - @voyant-travel/flights@0.172.0
  - @voyant-travel/operator-settings@0.10.3
  - @voyant-travel/payments@0.2.4

## 0.162.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/flights@0.171.1
  - @voyant-travel/inventory@0.14.2
  - @voyant-travel/operator-settings@0.10.2
  - @voyant-travel/storefront@0.173.1

## 0.162.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/commerce@0.39.5
  - @voyant-travel/flights@0.171.0
  - @voyant-travel/inventory@0.14.1
  - @voyant-travel/operator-settings@0.10.1
  - @voyant-travel/storefront@0.173.0
  - @voyant-travel/bookings@0.171.0

## 0.161.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/inventory@0.14.0
  - @voyant-travel/operator-settings@0.10.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/flights@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/payments@0.2.3
  - @voyant-travel/storefront@0.172.0

## 0.160.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/flights@0.169.1
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/inventory@0.13.7
  - @voyant-travel/operator-settings@0.9.2
  - @voyant-travel/payments@0.2.2
  - @voyant-travel/storefront@0.171.1

## 0.160.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2
  - @voyant-travel/inventory@0.13.6
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/flights@0.169.0
  - @voyant-travel/storefront@0.171.0
  - @voyant-travel/operator-settings@0.9.1

## 0.159.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/operator-settings@0.9.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/commerce@0.39.1
  - @voyant-travel/flights@0.168.0
  - @voyant-travel/inventory@0.13.5
  - @voyant-travel/storefront@0.170.0
  - @voyant-travel/bookings@0.168.0

## 0.158.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/operator-settings@0.8.0
  - @voyant-travel/inventory@0.13.4
  - @voyant-travel/storefront@0.169.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/flights@0.167.0
  - @voyant-travel/bookings@0.167.0

## 0.157.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/operator-settings@0.7.0
  - @voyant-travel/payments@0.2.0
  - @voyant-travel/flights@0.166.0
  - @voyant-travel/inventory@0.13.3
  - @voyant-travel/storefront@0.168.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0

## 0.156.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/operator-settings@0.6.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/commerce@0.37.3
  - @voyant-travel/flights@0.165.0
  - @voyant-travel/inventory@0.13.2
  - @voyant-travel/storefront@0.167.0
  - @voyant-travel/bookings@0.165.0

## 0.155.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/commerce@0.37.2
  - @voyant-travel/flights@0.164.0
  - @voyant-travel/inventory@0.13.1
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0
  - @voyant-travel/storefront@0.166.0
  - @voyant-travel/operator-settings@0.5.2

## 0.154.0

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
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/inventory@0.13.0
  - @voyant-travel/storefront@0.165.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/flights@0.163.0
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operator-settings@0.5.1

## 0.153.0

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
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/flights@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/inventory@0.12.0
  - @voyant-travel/operator-settings@0.5.0
  - @voyant-travel/storefront@0.164.0
  - @voyant-travel/db@0.114.8

## 0.152.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/flights@0.161.0
  - @voyant-travel/storefront@0.163.0
  - @voyant-travel/commerce@0.36.1
  - @voyant-travel/inventory@0.11.1
  - @voyant-travel/operator-settings@0.4.1

## 0.151.0

### Patch Changes

- 497dff2: Add governed product authoring, lifecycle, and composed-content read Tools plus provider-neutral trip requirement, candidate sourcing, selection, and re-shop Tools.
- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [0079873]
- Updated dependencies [b8cef4c]
- Updated dependencies [7e4ab07]
- Updated dependencies [497dff2]
- Updated dependencies [db5adce]
- Updated dependencies [54be000]
- Updated dependencies [c9b6144]
- Updated dependencies [eae32f8]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/inventory@0.11.0
  - @voyant-travel/flights@0.160.0
  - @voyant-travel/operator-settings@0.4.0
  - @voyant-travel/storefront@0.162.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.150.0

### Patch Changes

- b459761: Keep the externally maintained Netopia provider out of the default public dependency tree so
  framework consumers can install the standard package graph with npm.
- Updated dependencies [7e9f77a]
- Updated dependencies [b459761]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/flights@0.159.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/inventory@0.10.4
  - @voyant-travel/storefront@0.161.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6
  - @voyant-travel/operator-settings@0.3.14

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
  - @voyant-travel/bookings@0.158.0
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/flights@0.158.0
  - @voyant-travel/inventory@0.10.3
  - @voyant-travel/operator-settings@0.3.13
  - @voyant-travel/storefront@0.160.0
  - @voyant-travel/types@0.109.2

## 0.148.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/flights@0.157.0
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/storefront@0.159.0
  - @voyant-travel/commerce@0.35.7
  - @voyant-travel/inventory@0.10.2
  - @voyant-travel/operator-settings@0.3.12

## 0.147.1

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
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/flights@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/inventory@0.10.1
  - @voyant-travel/operator-settings@0.3.11
  - @voyant-travel/storefront@0.158.1
  - @voyant-travel/tools@0.2.1

## 0.147.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/inventory@0.10.0
  - @voyant-travel/storefront@0.158.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/flights@0.156.0
  - @voyant-travel/operator-settings@0.3.10
  - @voyant-travel/db@0.114.3

## 0.146.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/inventory@0.9.3
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/commerce@0.35.3
  - @voyant-travel/flights@0.155.1
  - @voyant-travel/operator-settings@0.3.9
  - @voyant-travel/storefront@0.157.1

## 0.146.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/storefront@0.157.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/flights@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/inventory@0.9.2
  - @voyant-travel/operator-settings@0.3.8

## 0.145.0

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
  - @voyant-travel/commerce@0.35.1
  - @voyant-travel/flights@0.154.0
  - @voyant-travel/inventory@0.9.1
  - @voyant-travel/operator-settings@0.3.7
  - @voyant-travel/storefront@0.156.0

## 0.144.0

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Derive travel runtime port bindings from deployment host capabilities.
- 490d132: Expose the selected graph and runtime-port providers to package runtime factories, then make MCP compose its graph and tool context without Operator-specific wiring.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Move the Finance, Legal, and Trips admin and public API surfaces onto package-owned selected-graph OpenAPI authority.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Compose package runtimes from generic Node primitives and typed graph ports instead of Operator capability wiring.
- 490d132: Compose Storefront runtime behavior through static package-owned graph ports and remove the Operator runtime loader.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
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
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/commerce@0.35.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/storefront@0.155.0
  - @voyant-travel/flights@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/inventory@0.9.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/operator-settings@0.3.6
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.143.0

### Patch Changes

- 0a7eab6: Move Trips payment completion to its package-owned graph subscriber runtime and publish the descriptor subpath.
- d771be3: Move Trips route and database runtime composition behind package-owned typed ports and a selected-graph runtime factory.
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [d771be3]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/flights@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.142.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/flights@0.151.4
  - @voyant-travel/hono@0.124.1

## 0.142.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/flights@0.151.3
  - @voyant-travel/types@0.107.3

## 0.142.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/flights@0.151.2
  - @voyant-travel/hono@0.123.2

## 0.142.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/flights@0.151.1

## 0.142.0

### Minor Changes

- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- a370024: Publish import-cheap package-owned Voyant deployment manifests for infrastructure and trips graph units.
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
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
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/flights@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.141.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/flights@0.150.0

## 0.140.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/flights@0.149.1
  - @voyant-travel/hono@0.122.2

## 0.140.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/flights@0.149.0

## 0.139.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/flights@0.148.0

## 0.138.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/flights@0.147.0

## 0.137.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/flights@0.146.0

## 0.136.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/catalog-contracts@0.109.0
  - @voyant-travel/flights@0.145.0
  - @voyant-travel/bookings@0.145.0
  - @voyant-travel/finance@0.145.0

## 0.135.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/catalog@0.142.0
  - @voyant-travel/flights@0.144.0

## 0.134.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/flights@0.143.0
  - @voyant-travel/types@0.107.1

## 0.133.0

### Patch Changes

- Updated dependencies [5028f42]
  - @voyant-travel/flights@0.142.0
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/finance@0.142.0

## 0.132.1

### Patch Changes

- 1ab266f: Allow trips route options to be provided lazily so deployment-specific booking and payment runtime wiring is not imported into the eager API composition closure.

## 0.132.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/flights@0.141.0
  - @voyant-travel/bookings@0.141.0
  - @voyant-travel/finance@0.141.0

## 0.131.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/flights@0.140.0
  - @voyant-travel/bookings@0.140.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/finance@0.140.0

## 0.130.0

### Minor Changes

- ca14f6f: Migrate the trips agent surface onto the framework tool contract
  (`@voyant-travel/tools`). The `create_trip` / `revise_trip` / `price_trip` /
  `reserve_trip` tools are now headless `defineTool`s returning typed pure data
  (`@voyant-travel/trips/tools`), each with `requiredScopes`, a risk tier, and a
  declarative risk policy.

  **Breaking:** the bespoke MCP surface is removed — the `./mcp` and `./mcp-tools`
  subpath exports (and `createTripMcpRoutes`, `createMcpToolRegistry`,
  `McpTool*` types, `tripsMcpTools`, `TripsMcpServices`) no longer exist. Deployments
  mount the trips tools through the in-deployment MCP server
  (`@voyant-travel/mcp` `createMcpHonoApp`) instead; use `tripsTools` +
  `TripsToolServices` from `@voyant-travel/trips/tools`.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
- Updated dependencies [22f0457]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/db@0.109.5
  - @voyant-travel/flights@0.139.0

## 0.129.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/flights@0.138.2

## 0.129.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/flights@0.138.1

## 0.129.0

### Patch Changes

- @voyant-travel/bookings@0.138.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/flights@0.138.0

## 0.128.5

### Patch Changes

- b1f90b0: Block trip component mutations after checkout has started and surface the locked state in the admin composer.
- 37e9543: Require accommodation trip components to carry a valid check-in/check-out date range before add, price, or reserve.
- c1d8f71: Return failed trip reservations as conflict responses, hide internal SQL details from reservation failures, and persist the admin draft-booking toggle before reserve.
- Updated dependencies [49ffcd9]
  - @voyant-travel/flights@0.137.3

## 0.128.4

### Patch Changes

- 776bafd: Cancel connected flight supplier orders when trip flight components are cancelled, and keep components in staff remediation when supplier cancellation cannot be completed.

## 0.128.3

### Patch Changes

- c6acfa5: Exclude cancelled and removed trip components from active trip aggregate totals, refresh those totals after component cancellation, and label active versus cancelled component value in the admin trip detail.

## 0.128.2

### Patch Changes

- 54041a9: Block traveler, billing, and supplier-backed component detail edits once a trip
  has committed supplier-backed components, requiring a structured amendment path
  instead of accepting local-only changes that leave downstream orders stale.

## 0.128.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/flights@0.137.1

## 0.128.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/flights@0.137.0

## 0.127.1

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/catalog@0.134.1
- @voyant-travel/finance@0.136.1
- @voyant-travel/flights@0.136.1

## 0.127.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/flights@0.136.0

## 0.126.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/bookings@0.135.0
- @voyant-travel/catalog@0.133.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/flights@0.135.0

## 0.125.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/flights@0.134.1

## 0.125.0

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/flights@0.134.0

## 0.124.0

### Minor Changes

- b68d6a7: Add the dynamic-packaging requirement/candidate model to Trips (voyant#2082 / voyant#1600) — keystone gap 2.

  - **`@voyant-travel/trips`** — new `trip_requirements` (unresolved customer need on an envelope: vertical + criteria + criteriaVersion mirroring the catalog `AvailabilitySearchRequest`) and `trip_candidates` (a normalized `AvailabilityCandidate` attached to a requirement: rank, status, origin, decimal price, TTL, internal `providerData`) tables, with enums, relations, and migration `0001`. Service operations: `addRequirement`, `sourceRequirementCandidates` (runs a deployment-injected availability fan-out, persists the ranked set), `selectCandidate` (enforces selected-uniqueness, pins a draft catalog component the existing price/reserve pipeline re-validates), `reshopRequirement` / `reshopTrip`, and `expireStaleTripCandidates` (TTL reaper). `reserveTrip` now gates on all required requirements being resolved. The fan-out is injected (`SourceRequirementCandidatesDeps`), never a named provider.
  - **`@voyant-travel/schema-kit`** — register TypeID prefixes `trrq` (trip_requirements) and `trcd` (trip_candidates).

  Additive; no behavioral change to existing trip flows (an envelope with no requirements reserves exactly as before).

- bba70ee: Add admin HTTP routes + zod schemas for the dynamic-packaging requirement/candidate operations (voyant#2082): `POST`/`GET /:envelopeId/requirements`, `POST /requirements/:id/candidates` (source ranked candidates), `POST /requirements/:id/select`, `POST /requirements/:id/reshop`, and `POST /:envelopeId/reshop`. The availability fan-out is injected via `TripsRoutesOptions.sourceCandidatesDeps` (the deployment wires its adapters/owned handlers) — routes return 501 until configured and 403 on the public surface.

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/flights@0.133.0

## 0.123.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/flights@0.132.0
  - @voyant-travel/bookings@0.132.0
  - @voyant-travel/finance@0.132.0

## 0.122.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/flights@0.131.1
  - @voyant-travel/db@0.108.5

## 0.122.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/flights@0.131.0

## 0.121.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/flights@0.130.0

## 0.120.1

### Patch Changes

- c5416cb: Make public proposal acceptance reservation-safe for sourced catalog components.

  - `reserveTrip` now atomically claims the envelope (`priced` → `reserve_in_progress`) before any provider dispatch, so concurrent reserves are serialized and only one caller can create upstream supplier holds. A lost claim returns a `reservation_in_progress` conflict without dispatching, and the claim is released back to `priced` if preflight rejects or throws.
  - Public proposal accept is split into prepare (under the quote-accept lock) → reserve (outside any transaction) → finalize (under the lock). Sourced catalog components are no longer rejected, and a reservation is released via `cancelComponents` if final CRM acceptance loses a race (guarding idempotent replays).

## 0.120.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/flights@0.129.0
  - @voyant-travel/bookings@0.129.0
  - @voyant-travel/finance@0.129.0

## 0.119.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/catalog@0.126.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/flights@0.128.0

## 0.118.0

### Patch Changes

- Updated dependencies [435a5d1]
- Updated dependencies [c143531]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/flights@0.127.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/catalog@0.125.0

## 0.117.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/finance@0.126.1

## 0.117.0

### Patch Changes

- @voyant-travel/bookings@0.126.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/finance@0.126.0
- @voyant-travel/flights@0.126.0

## 0.116.1

### Patch Changes

- e89640b: D.2 slice 1 — these packages now own and ship their migration history. Each gains a `drizzle.migrations.config.ts`, a `db:generate` script, and a generated `migrations/` folder (baseline) included in the published tarball (`files`). A D.2 deployment collects each package's folder as its migration source; existing D.1 databases import-baseline the bundle-covered baseline. No runtime behavior change. See `docs/architecture/migration-collector-d2.md`.

## 0.116.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/bookings@0.125.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/finance@0.125.0
- @voyant-travel/flights@0.125.0
- @voyant-travel/hono@0.112.2

## 0.115.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/flights@0.124.0

## 0.114.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [e9d9dbb]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/flights@0.123.0

## 0.113.0

### Minor Changes

- bf2e822: `@voyant-travel/trips` now owns the trip component-orchestration logic: new `createCatalogComponentAdapter(options)` (from `@voyant-travel/trips` and `./catalog-component`) and `createFlightComponentAdapter(options)` (`./flight-component`). These own offer validation, reserve-with-origin tracking, hold release, cancellation mapping, flight price-change/expiry detection, and passenger-roster building. Deployment-specific pieces (promotion evaluator, operator tax recompute, source/owned registries, flight adapter, checkout hand-off) are injected. The operator's `trips-catalog-runtime` (515→211) and `trips-flight-runtime` (231→63) collapse to thin wiring. Adds `@voyant-travel/bookings` + `@voyant-travel/flights` to trips deps.

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [14f4234]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/flights@0.122.0
  - @voyant-travel/bookings@0.122.0
  - @voyant-travel/catalog@0.120.0

## 0.112.0

### Minor Changes

- 13fe70b: The trips module now owns the MCP tool routes and the trip-checkout service: new `@voyant-travel/trips/mcp` (`createTripMcpRoutes(options)`) and `@voyant-travel/trips/checkout` (`startTripCheckout` + billing helpers) surfaces. The payment-provider start, FX quoting, and checkout base URL are injected as options; adds `@voyant-travel/finance` as a dependency.

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/hono@0.111.0

## 0.111.1

### Patch Changes

- @voyant-travel/catalog@0.118.1

## 0.111.0

### Minor Changes

- f374a58: Rename the Travel Composer runtime and React packages to Trips, including package names, route prefixes, admin extension ids, operator manifests, and template imports.

### Patch Changes

- c9ec9f8: Fold catalog semantic-search primitives into `@voyant-travel/catalog` and retire the first-party catalog MCP package.

  `@voyant-travel/catalog` now exports embedding providers, model compatibility helpers, semantic/BYO-vector search, and cross-audience federation from catalog-owned subpaths. `@voyant-travel/trips` now owns the small local tool registry needed by its trips agent commands instead of depending on catalog MCP tooling.

- e80e3d3: Add Trips reservation plans and route active plan submission through Bookings.
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/hono@0.110.0

## 0.110.2

## 0.110.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/catalog@0.117.1
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/catalog-mcp@0.117.1

## 0.110.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/catalog@0.117.0
  - @voyant-travel/catalog-mcp@0.117.0

## 0.109.0

### Patch Changes

- @voyant-travel/catalog@0.116.0
- @voyant-travel/catalog-mcp@0.116.0

## 0.108.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/catalog@0.115.1
  - @voyant-travel/catalog-mcp@0.115.1

## 0.108.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/catalog-mcp@0.115.0

## 0.107.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/catalog@0.114.0
  - @voyant-travel/catalog-mcp@0.114.0

## 0.106.0

### Patch Changes

- @voyant-travel/catalog@0.113.0
- @voyant-travel/catalog-mcp@0.113.0

## 0.105.8

### Patch Changes

- @voyant-travel/catalog@0.112.0
- @voyant-travel/catalog-mcp@0.112.0

## 0.105.7

### Patch Changes

- @voyant-travel/catalog@0.111.0
- @voyant-travel/catalog-mcp@0.111.0

## 0.105.6

### Patch Changes

- @voyant-travel/catalog@0.110.0
- @voyant-travel/catalog-mcp@0.110.0

## 0.105.5

### Patch Changes

- @voyant-travel/catalog@0.109.0
- @voyant-travel/catalog-mcp@0.109.0

## 0.105.4

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/catalog@0.108.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/catalog-mcp@0.108.0

## 0.105.3

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/catalog@0.107.0
  - @voyant-travel/catalog-mcp@0.107.0
  - @voyant-travel/hono@0.105.2

## 0.105.2

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0
  - @voyant-travel/catalog-mcp@0.106.0

## 0.105.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/catalog@0.105.1
  - @voyant-travel/catalog-mcp@0.105.1

## 0.105.0

### Minor Changes

- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

### Patch Changes

- c2aef18: Manifest-driven migration schema resolution (#1608).

  - `@voyant-travel/core` `VoyantConfig` gains `additionalSchemas`, `extensions`, and `schemas` fields (with validation) so a template's migrated schema set is derived from `voyant.config.ts`.
  - `catalog`, `flights`, `travel-composer`, and `workflow-runs` declare `package.json#voyant` schema metadata so they resolve into the generated schema manifest (flights pins its non-standard `./reference/local-postgres` subpath).

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/catalog@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/catalog-mcp@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/catalog@0.104.1
- @voyant-travel/catalog-mcp@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/catalog@0.104.0
- @voyant-travel/catalog-mcp@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/catalog@0.103.0
- @voyant-travel/catalog-mcp@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/catalog@0.102.0
- @voyant-travel/catalog-mcp@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/hono@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/catalog@0.101.2
- @voyant-travel/catalog-mcp@0.101.2
- @voyant-travel/core@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/catalog@0.101.1
- @voyant-travel/catalog-mcp@0.101.1
- @voyant-travel/core@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/hono@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/catalog@0.101.0
- @voyant-travel/catalog-mcp@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/hono@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/catalog@0.100.0
- @voyant-travel/catalog-mcp@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/catalog@0.99.0
  - @voyant-travel/catalog-mcp@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/catalog@0.98.0
- @voyant-travel/catalog-mcp@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/hono@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/catalog-mcp@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [2d8d59b]
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/catalog-mcp@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/hono@0.96.0

## 0.95.0

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/catalog-mcp@0.95.0
  - @voyant-travel/core@0.95.0
  - @voyant-travel/db@0.95.0
  - @voyant-travel/hono@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/catalog@0.94.0
- @voyant-travel/catalog-mcp@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/catalog@0.93.0
- @voyant-travel/catalog-mcp@0.93.0
- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/hono@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/catalog-mcp@0.92.0
  - @voyant-travel/core@0.92.0
  - @voyant-travel/db@0.92.0
  - @voyant-travel/hono@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/catalog@0.91.0
  - @voyant-travel/catalog-mcp@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/catalog@0.90.0
- @voyant-travel/catalog-mcp@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/catalog@0.89.0
- @voyant-travel/catalog-mcp@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0

## 0.88.0

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/catalog-mcp@0.88.0
  - @voyant-travel/core@0.88.0
  - @voyant-travel/db@0.88.0
  - @voyant-travel/hono@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/catalog@0.87.1
- @voyant-travel/catalog-mcp@0.87.1
- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/catalog-mcp@0.87.0
  - @voyant-travel/core@0.87.0
  - @voyant-travel/db@0.87.0
  - @voyant-travel/hono@0.87.0

## 0.86.0

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/catalog-mcp@0.86.0
  - @voyant-travel/core@0.86.0
  - @voyant-travel/db@0.86.0
  - @voyant-travel/hono@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/catalog@0.85.4
- @voyant-travel/catalog-mcp@0.85.4
- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/catalog@0.85.3
- @voyant-travel/catalog-mcp@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/catalog@0.85.2
- @voyant-travel/catalog-mcp@0.85.2
- @voyant-travel/core@0.85.2
- @voyant-travel/db@0.85.2
- @voyant-travel/hono@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/catalog@0.85.1
- @voyant-travel/catalog-mcp@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/catalog@0.85.0
- @voyant-travel/catalog-mcp@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/catalog@0.84.4
- @voyant-travel/catalog-mcp@0.84.4
- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/catalog@0.84.3
- @voyant-travel/catalog-mcp@0.84.3
- @voyant-travel/core@0.84.3
- @voyant-travel/db@0.84.3
- @voyant-travel/hono@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/catalog@0.84.2
- @voyant-travel/catalog-mcp@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/catalog@0.84.1
  - @voyant-travel/catalog-mcp@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1

## 0.84.0

### Patch Changes

- 5462f07: Rename the remaining active trips stay filters from hospitality to accommodations and add a Cloudflare startup profile summary lane.
- Updated dependencies [4ea42b3]
  - @voyant-travel/catalog@0.84.0
  - @voyant-travel/catalog-mcp@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/catalog@0.83.1
- @voyant-travel/catalog-mcp@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/catalog@0.83.0
- @voyant-travel/catalog-mcp@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/catalog@0.82.1
- @voyant-travel/catalog-mcp@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/catalog@0.82.0
- @voyant-travel/catalog-mcp@0.82.0
- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/hono@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/catalog@0.81.21
- @voyant-travel/catalog-mcp@0.81.21
- @voyant-travel/core@0.81.21
- @voyant-travel/db@0.81.21
- @voyant-travel/hono@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/catalog@0.81.20
- @voyant-travel/catalog-mcp@0.81.20
- @voyant-travel/core@0.81.20
- @voyant-travel/db@0.81.20
- @voyant-travel/hono@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/catalog@0.81.19
- @voyant-travel/catalog-mcp@0.81.19
- @voyant-travel/core@0.81.19
- @voyant-travel/db@0.81.19
- @voyant-travel/hono@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/catalog@0.81.18
- @voyant-travel/catalog-mcp@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/catalog@0.81.17
- @voyant-travel/catalog-mcp@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/catalog-mcp@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/catalog@0.81.15
- @voyant-travel/catalog-mcp@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/catalog@0.81.14
- @voyant-travel/catalog-mcp@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/catalog@0.81.13
- @voyant-travel/catalog-mcp@0.81.13
- @voyant-travel/core@0.81.13
- @voyant-travel/db@0.81.13
- @voyant-travel/hono@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/catalog@0.81.12
- @voyant-travel/catalog-mcp@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/catalog@0.81.11
- @voyant-travel/catalog-mcp@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/catalog@0.81.10
- @voyant-travel/catalog-mcp@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/catalog@0.81.9
- @voyant-travel/catalog-mcp@0.81.9
- @voyant-travel/core@0.81.9
- @voyant-travel/db@0.81.9
- @voyant-travel/hono@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/catalog@0.81.8
- @voyant-travel/catalog-mcp@0.81.8
- @voyant-travel/core@0.81.8
- @voyant-travel/db@0.81.8
- @voyant-travel/hono@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/catalog@0.81.7
- @voyant-travel/catalog-mcp@0.81.7
- @voyant-travel/core@0.81.7
- @voyant-travel/db@0.81.7
- @voyant-travel/hono@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/catalog@0.81.6
- @voyant-travel/catalog-mcp@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/catalog@0.81.5
- @voyant-travel/catalog-mcp@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/catalog@0.81.4
- @voyant-travel/catalog-mcp@0.81.4
- @voyant-travel/core@0.81.4
- @voyant-travel/db@0.81.4
- @voyant-travel/hono@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/catalog@0.81.3
- @voyant-travel/catalog-mcp@0.81.3
- @voyant-travel/core@0.81.3
- @voyant-travel/db@0.81.3
- @voyant-travel/hono@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/catalog@0.81.2
- @voyant-travel/catalog-mcp@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/catalog@0.81.1
- @voyant-travel/catalog-mcp@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/catalog@0.81.0
- @voyant-travel/catalog-mcp@0.81.0
- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/hono@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/catalog@0.80.18
- @voyant-travel/catalog-mcp@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/catalog@0.80.17
- @voyant-travel/catalog-mcp@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/catalog@0.80.16
- @voyant-travel/catalog-mcp@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/catalog@0.80.15
- @voyant-travel/catalog-mcp@0.80.15
- @voyant-travel/core@0.80.15
- @voyant-travel/db@0.80.15
- @voyant-travel/hono@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/catalog@0.80.14
- @voyant-travel/catalog-mcp@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/catalog@0.80.13
- @voyant-travel/catalog-mcp@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/catalog@0.80.12
- @voyant-travel/catalog-mcp@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/catalog@0.80.11
- @voyant-travel/catalog-mcp@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/catalog@0.80.10
- @voyant-travel/catalog-mcp@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/catalog@0.80.9
- @voyant-travel/catalog-mcp@0.80.9
- @voyant-travel/core@0.80.9
- @voyant-travel/db@0.80.9
- @voyant-travel/hono@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/catalog@0.80.8
- @voyant-travel/catalog-mcp@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/catalog@0.80.7
- @voyant-travel/catalog-mcp@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/catalog@0.80.6
- @voyant-travel/catalog-mcp@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/catalog@0.80.5
- @voyant-travel/catalog-mcp@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/catalog@0.80.4
- @voyant-travel/catalog-mcp@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/catalog@0.80.3
  - @voyant-travel/catalog-mcp@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/catalog@0.80.2
- @voyant-travel/catalog-mcp@0.80.2
- @voyant-travel/core@0.80.2
- @voyant-travel/db@0.80.2
- @voyant-travel/hono@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/catalog@0.80.1
- @voyant-travel/catalog-mcp@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/catalog@0.80.0
- @voyant-travel/catalog-mcp@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/catalog@0.79.0
- @voyant-travel/catalog-mcp@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/catalog@0.78.0
- @voyant-travel/catalog-mcp@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/catalog@0.77.13
- @voyant-travel/catalog-mcp@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/catalog@0.77.12
- @voyant-travel/catalog-mcp@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/catalog@0.77.11
- @voyant-travel/catalog-mcp@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/catalog@0.77.10
- @voyant-travel/catalog-mcp@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/catalog@0.77.9
- @voyant-travel/catalog-mcp@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/catalog@0.77.8
- @voyant-travel/catalog-mcp@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/catalog@0.77.7
- @voyant-travel/catalog-mcp@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/catalog@0.77.6
- @voyant-travel/catalog-mcp@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/catalog@0.77.5
- @voyant-travel/catalog-mcp@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/catalog@0.77.4
- @voyant-travel/catalog-mcp@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/catalog@0.77.3
- @voyant-travel/catalog-mcp@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/catalog@0.77.2
- @voyant-travel/catalog-mcp@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/catalog@0.77.1
- @voyant-travel/catalog-mcp@0.77.1
- @voyant-travel/core@0.77.1
- @voyant-travel/db@0.77.1
- @voyant-travel/hono@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/catalog@0.77.0
  - @voyant-travel/catalog-mcp@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/catalog@0.76.0
- @voyant-travel/catalog-mcp@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/catalog@0.75.7
- @voyant-travel/catalog-mcp@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/catalog@0.75.6
- @voyant-travel/catalog-mcp@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/catalog@0.75.5
- @voyant-travel/catalog-mcp@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/catalog@0.75.4
- @voyant-travel/catalog-mcp@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/catalog@0.75.3
- @voyant-travel/catalog-mcp@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/catalog@0.75.2
- @voyant-travel/catalog-mcp@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/catalog@0.75.1
- @voyant-travel/catalog-mcp@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/catalog@0.75.0
- @voyant-travel/catalog-mcp@0.75.0
- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/hono@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/catalog@0.74.2
- @voyant-travel/catalog-mcp@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/catalog@0.74.1
- @voyant-travel/catalog-mcp@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/catalog@0.74.0
- @voyant-travel/catalog-mcp@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/catalog@0.73.1
- @voyant-travel/catalog-mcp@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/catalog@0.73.0
- @voyant-travel/catalog-mcp@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/catalog@0.72.0
- @voyant-travel/catalog-mcp@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/catalog@0.71.0
- @voyant-travel/catalog-mcp@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/catalog@0.70.0
- @voyant-travel/catalog-mcp@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/catalog@0.69.1
- @voyant-travel/catalog-mcp@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/catalog@0.69.0
- @voyant-travel/catalog-mcp@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/catalog@0.68.0
- @voyant-travel/catalog-mcp@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/catalog@0.67.0
- @voyant-travel/catalog-mcp@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/catalog@0.66.6
- @voyant-travel/catalog-mcp@0.66.6
- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/catalog@0.66.5
- @voyant-travel/catalog-mcp@0.66.5
- @voyant-travel/core@0.66.5
- @voyant-travel/db@0.66.5
- @voyant-travel/hono@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/catalog@0.66.4
- @voyant-travel/catalog-mcp@0.66.4
- @voyant-travel/core@0.66.4
- @voyant-travel/db@0.66.4
- @voyant-travel/hono@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/catalog@0.66.3
- @voyant-travel/catalog-mcp@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/catalog@0.66.2
- @voyant-travel/catalog-mcp@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/catalog@0.66.1
- @voyant-travel/catalog-mcp@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/catalog@0.66.0
- @voyant-travel/catalog-mcp@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/catalog@0.65.0
- @voyant-travel/catalog-mcp@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/catalog@0.64.1
- @voyant-travel/catalog-mcp@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/catalog@0.64.0
  - @voyant-travel/catalog-mcp@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/catalog@0.63.1
- @voyant-travel/catalog-mcp@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/catalog@0.63.0
- @voyant-travel/catalog-mcp@0.63.0
- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/hono@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/catalog@0.62.3
- @voyant-travel/catalog-mcp@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/catalog@0.62.2
- @voyant-travel/catalog-mcp@0.62.2
- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/catalog@0.62.1
- @voyant-travel/catalog-mcp@0.62.1
- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/catalog@0.62.0
  - @voyant-travel/catalog-mcp@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/catalog@0.61.0
- @voyant-travel/catalog-mcp@0.61.0
- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/catalog@0.60.0
- @voyant-travel/catalog-mcp@0.60.0
- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/hono@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/catalog-mcp@0.59.0
  - @voyant-travel/core@0.59.0
  - @voyant-travel/db@0.59.0
  - @voyant-travel/hono@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/catalog-mcp@0.58.0
  - @voyant-travel/core@0.58.0
  - @voyant-travel/db@0.58.0
  - @voyant-travel/hono@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/catalog@0.57.0
- @voyant-travel/catalog-mcp@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/catalog@0.56.0
- @voyant-travel/catalog-mcp@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0

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
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/catalog-mcp@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
