# @voyant-travel/trips

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
