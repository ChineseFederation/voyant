# @voyant-travel/payments

## 0.13.3

### Patch Changes

- Updated dependencies [d3288fb]
  - @voyant-travel/graph-contracts@0.8.0

## 0.13.2

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/graph-contracts@0.7.0

## 0.13.1

### Patch Changes

- Updated dependencies [36f3085]
  - @voyant-travel/graph-contracts@0.6.0

## 0.13.0

### Minor Changes

- c911139: Let the payment port express a stored instrument.

  `PaymentAdapterCapabilities` gains `storeInstrument`, `PaymentInitiationInput`
  gains a `storeInstrument` intent, and `PaymentInitiationResult`,
  `PaymentStatusResult` and `PaymentCallbackEvent` gain a `PaymentStoredInstrument`
  summary. All optional, so an adapter or caller written against an earlier
  revision keeps its exact behavior.

  Storage separates the two permissions card network rules treat differently.
  `merchant_initiated` reuse rests on the merchant's terms, which the caller
  already knows the shopper accepted and states as a fact. `shopper_reselect`
  rests on explicit consent for that purpose, which can only be collected where
  the payment details are entered, so the caller grants permission to ask and
  learns the answer from the reported instrument. `PaymentInstrumentStatus` covers
  the case where a reissued card outlives the agreement that authorized it.

  Conformance gains two cases. Every adapter must now store nothing when the
  caller asked for no storage, whether or not it declares the capability; a
  storage-capable adapter must additionally never report a reuse the caller did
  not grant.

## 0.12.2

### Patch Changes

- Updated dependencies [1e0506f]
  - @voyant-travel/graph-contracts@0.5.0

## 0.12.1

### Patch Changes

- Updated dependencies [4f9a097]
  - @voyant-travel/graph-contracts@0.4.0

## 0.12.0

### Minor Changes

- 1be6b76: A card dispute has somewhere to land: `payment_disputes` in finance, bound to
  the payment session it contests and reachable from the booking.

  There was no card-dispute model. The `disputed` value that existed is a
  **supplier-invoice** status — an accounts-payable state for a bill the operator
  is contesting — and is unrelated to a customer charging back a payment. So when a
  traveller disputed a card payment the runtime had nowhere to record it: the
  booking kept reading as paid, the money was gone or frozen, and the only trace
  lived in whatever processor console the operator happened to check.

  A chargeback is a generic commerce event, not a property of any one processor.
  Every card processor produces them with the same shape, so the record belongs in
  the framework and nothing in it names a processor — `provider`,
  `processor_reference` and `reason_code` are opaque strings stored and handed back
  verbatim.

  **The model.** `payment_disputes` carries the contested amount and currency
  (which may be partial), the lifecycle status, `opened_at` and the processor's
  `respond_by` deadline where it supplies one, an opaque processor reference,
  `resolved_at`, and `evidence_submitted_at`. `PaymentDisputeStatus` is the
  framework's vocabulary — `opened`, `under_review`, `won`, `lost`, `withdrawn` —
  and an adapter maps its own stage names onto it. The last three are terminal and
  each names the resolution; there is no separate outcome column, because one
  could only ever disagree with the status.

  **Terminal is absorbing.** A processor that contests a payment again issues a new
  dispute rather than reviving a resolved one, so a replayed or out-of-order
  callback can never walk a resolution backwards. The ingest path tolerates such a
  report rather than failing — a webhook that 500s is retried forever — while the
  deliberate `PATCH` rejects an illegal transition with `409`.

  **A second dispute does not overwrite the first.** The record is idempotent on
  `(payment_session_id, processor_reference)`: a repeat report advances the dispute
  it already made, a different reference opens a second row. A hand-entered dispute
  with no reference always opens a new record, which is the safe default — two rows
  are recoverable, a silently overwritten dispute is not. The unresolved contested
  total is capped at the payment it contests.

  **The booking can tell the truth.** `GET /v1/admin/finance/bookings/{bookingId}/disputes`
  answers what payments and sessions cannot: a contested payment still reads
  `paid`, so `hasOpenDispute`, the per-currency contested total, and the soonest
  `respondBy` are how a caller distinguishes a cleanly paid booking from one whose
  money is being taken back. Plus `GET`/`POST /v1/admin/finance/payment-disputes`
  and `GET`/`PATCH .../{id}`.

  **The callback contract can deliver one.** `PaymentCallbackEvent` gains an
  optional `dispute` alongside `nextState` rather than inside it: a chargeback does
  not move the payment's own lifecycle — the session stays `paid`, which is exactly
  the problem — so the event reports the session's current state and puts what
  changed in `dispute`. The conformance kit validates the signal's shape and folds
  it into the duplicate-callback identity, so an adapter cannot vary a dispute
  across a replay.

  **An agent can record one too.** `record_payment_dispute` fronts the dispute
  endpoints for an agent reconciling a processor console. It declares its
  `adminWrites` rather than leaning on the name match, because `/finance/payments`
  and `/finance/invoices/{id}/payments` share the trailing noun `payment` and the
  inference would have reported _recording a payment_ as covered by a Tool that
  only records a dispute against one.

  **The banner degrades, it does not crash.** `BookingDisputeBanner` renders on the
  booking detail page whether or not the host asked for it, so it reads the finance
  context through the new `useOptionalVoyantReactContext`: a host that has not
  mounted `VoyantFinanceProvider` gets no banner rather than a crashed page. Every
  other finance hook stays strict — they are the point of the screen they are on.

  **Deliberately not in scope.** Payouts acquire no model here — money moving from
  a processor to the operator's bank is not the booking ledger's concern. Evidence
  assembly and submission stay behind the adapter port, where they belong; the
  framework records only that evidence was submitted and when, without knowing what
  was in it.

## 0.11.0

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

## 0.10.0

### Minor Changes

- 79da374: `PaymentInitiationResult.checkout` is a discriminated union with a `redirect` arm
  and an `embedded` arm, so the port can express an in-page payment.

  `PaymentHostedCheckout` was a `url` with a label: `kind` was
  `"hosted_checkout" | "redirect"`, `url` was required, and both values mean "send
  the shopper somewhere else". A provider that supports in-page payment (Stripe
  Elements, Adyen Drop-in, Braintree Hosted Fields) hands back a per-session client
  secret plus a publishable key and the page mounts the form itself — there was no
  arm of the union that could carry that, so no adapter could offer it and the
  shopper was redirected off the storefront at the last step of the funnel.

  The union is now:

  - `PaymentRedirectCheckout` — `kind: "hosted_checkout" | "redirect"`, `url`
    required. Today's behaviour, unchanged.
  - `PaymentEmbeddedCheckout` — `kind: "embedded"`, carrying the opaque
    `clientSecret`, the `publishableKey`, and an optional `providerAccountId` for
    platform-scoped providers. No `url`. The runtime forwards these and never
    learns what the front end does with them.

  Both arms keep `expiresAt`.

  The two sides negotiate, so gaining an arm never takes one away. An adapter
  advertises `capabilities.embeddedCheckout`; a caller declares
  `PaymentInitiationInput.acceptedCheckoutHandoffs`, the arms it can render in
  preference order. **Omitting it means `["redirect"]`** — a caller that has not
  opted in is never handed a form it cannot mount. `embeddedCheckout` is optional
  and absent means `false`, so an existing redirect adapter needs no change.

  New helpers: `isRedirectPaymentCheckout`, `isEmbeddedPaymentCheckout`,
  `paymentCheckoutHandoff`, `paymentCheckoutRedirectUrl`,
  `supportedPaymentCheckoutHandoffs`, `acceptedPaymentCheckoutHandoffs`, and
  `negotiatePaymentCheckoutHandoff`.

  The conformance kit covers both arms and the downgrade. An adapter declaring
  `embeddedCheckout` must return a well-formed `embedded` arm to a caller that
  accepts one, supplied through the new `embeddedInitiation` fixture, and _every_
  adapter is now probed with a redirect-only caller — a storefront that only knows
  how to redirect must not break when an adapter gains in-page support.

  Finance is a redirect-only caller: `startPaymentAdapterCardPayment` and
  `applyPaymentAdapterInitiationResult` read the URL through
  `paymentCheckoutRedirectUrl(...)` rather than `checkout?.url`, and never request
  the embedded arm. Persisting an embedded handoff so a storefront can mount a form
  is follow-on work, not part of the port.

## 0.9.3

### Patch Changes

- Updated dependencies [d432646]
  - @voyant-travel/graph-contracts@0.3.0

## 0.9.2

### Patch Changes

- Updated dependencies [e4833a1]
  - @voyant-travel/graph-contracts@0.2.0

## 0.9.1

### Patch Changes

- dcda88d: Describe every package on the public surface.

  The npm assembly path is now private — the deployment ships as an image — so the
  published surface is the fourteen packages an external adapter, connector, or
  extension author builds against. Each now says what it is for.

## 0.9.0

### Minor Changes

- aebc8c6: Depend on `@voyant-travel/graph-contracts` instead of `@voyant-travel/core` for
  `definePort`.

  `@voyant-travel/payments` is the canonical payment adapter contract — 25 type
  exports against 5 values, every file importing only its siblings. Its single
  external import was `definePort`, which pulled in the whole runtime kernel and
  forced every adapter author to install it.

  With that repointed the package has no workspace dependencies and joins the
  public surface as a leaf, so implementing a payment adapter no longer requires
  the DI container, registry, event bus, saga, or locking.

## 0.8.1

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0

## 0.8.0

### Minor Changes

- 6c76de3: Rename the first-party processor to Voyant Pay while accepting legacy provider identifiers, and add readiness-aware active processor selection to managed payment settings.

## 0.7.0

### Minor Changes

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

## 0.6.5

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0

## 0.6.4

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0

## 0.6.3

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0

## 0.6.2

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0

## 0.6.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0

## 0.6.0

### Minor Changes

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

## 0.5.2

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0

## 0.5.1

### Patch Changes

- cb04ea8: Simplify the Netopia connect form. Drop the confusing "Merchant ID" field —
  Netopia API v2 has no separate merchant number; the POS signature (Semnătura) is
  the point-of-sale identifier, and the adapter already ignores `merchantId` when a
  POS signature is present. Clarify the "API key" help text to point operators at
  the account API key (Security → API key) used as the Authorization header.

## 0.5.0

### Minor Changes

- 8d370ef: Managed card checkout (Phase 2B): the concrete control-plane remote payment transport that the generic `createRemotePaymentAdapter` delegates to (brokers initiate/status/verifyCallback to the platform payments control plane), plus the inbound processor IPN webhook (`POST /v1/public/payment-link/callback`) that verifies the callback through the payment adapter and applies the event. Together these let a connected processor actually charge cards without the deployment bundling any per-processor SDK.

## 0.4.0

### Minor Changes

- 225000a: Make the managed payment registry injectable via a runtime port (the framework-idiomatic seam). `@voyant-travel/payments` defines `paymentProviderRegistryRuntimePort`; `@voyant-travel/operator-settings` gains a graph-runtime-factory (`createOperatorSettingsVoyantRuntime`) that resolves the optional port and, when a deployment provides it, registers the resolver into the module container at bootstrap. The Settings → Payments routes resolve the registry from the container per request, else the default self-host registry. This supersedes the earlier request-context injection seam (which could not fire in the opaque managed runtime).

## 0.3.0

### Minor Changes

- c2ca4a3: Add a Settings → Payments surface where operators browse first-party payment
  processors and connect one (single active provider per org). Introduces the
  payment provider catalog + credential-field schema + registry port and a remote
  adapter transport in `@voyant-travel/payments`, a `payment_provider_config`
  table, service, and `/v1/admin/settings/payments/*` routes in
  `@voyant-travel/operator-settings`, the Payments settings page in
  `@voyant-travel/operator-settings-react`, the `managed` payments provider value
  in the framework deployment graph, and en/ro catalog strings. Self-host
  deployments configure their processor via environment variables (read-only in
  the UI); managed connect brokering lands in a follow-up.

## 0.2.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0

## 0.2.5

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0

## 0.2.4

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0

## 0.2.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0

## 0.2.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0

## 0.2.1

### Patch Changes

- 0916962: Republish with resolved dependency ranges. The 0.2.0 tarball on npm carries a
  raw `workspace:^` specifier for `@voyant-travel/core` and cannot be installed
  by consumers.

## 0.2.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.
