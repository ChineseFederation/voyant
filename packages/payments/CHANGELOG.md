# @voyant-travel/payments

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
