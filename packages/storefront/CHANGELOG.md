# @voyant-travel/storefront

## 0.222.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/db@0.119.0
  - @voyant-travel/auth@0.146.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/commerce@0.44.20
  - @voyant-travel/legal@0.220.0
  - @voyant-travel/relationships@0.132.16
  - @voyant-travel/identity@0.220.0

## 0.221.1

### Patch Changes

- 268f341: Keep anonymous departure browsing in the configured cache store for 15 minutes and invalidate every cached query variant when `availability.slot.changed` is delivered. Managed runtimes use Redis through the provider-neutral cache interface, with process-local tiered-cache entries capped at 60 seconds to bound cross-replica invalidation lag. Checkout continues to verify availability against the transactional database, and deployments without a cache provider continue to use the live query path.
- Updated dependencies [268f341]
  - @voyant-travel/utils@0.110.1

## 0.221.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/legal@0.219.0
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/identity@0.219.0
  - @voyant-travel/commerce@0.44.19
  - @voyant-travel/relationships@0.132.15

## 0.220.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/commerce@0.44.17
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/legal@0.218.0
  - @voyant-travel/relationships@0.132.14
  - @voyant-travel/identity@0.218.0

## 0.219.0

### Patch Changes

- @voyant-travel/legal@0.217.0
- @voyant-travel/bookings@0.217.0
- @voyant-travel/finance@0.217.0
- @voyant-travel/identity@0.217.0
- @voyant-travel/commerce@0.44.16
- @voyant-travel/relationships@0.132.13

## 0.218.1

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/commerce@0.44.15
  - @voyant-travel/db@0.118.6
  - @voyant-travel/legal@0.216.1

## 0.218.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/commerce@0.44.14
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/legal@0.216.0
  - @voyant-travel/relationships@0.132.12
  - @voyant-travel/identity@0.216.0

## 0.217.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/payments@0.8.0
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/bookings@0.215.0
  - @voyant-travel/identity@0.215.0
  - @voyant-travel/legal@0.215.0
  - @voyant-travel/commerce@0.44.13
  - @voyant-travel/relationships@0.132.11

## 0.216.0

### Patch Changes

- @voyant-travel/auth@0.145.0
- @voyant-travel/bookings@0.214.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/identity@0.214.0
- @voyant-travel/legal@0.214.0
- @voyant-travel/commerce@0.44.12
- @voyant-travel/relationships@0.132.10

## 0.215.0

### Patch Changes

- @voyant-travel/legal@0.213.0
- @voyant-travel/bookings@0.213.0
- @voyant-travel/finance@0.213.0
- @voyant-travel/identity@0.213.0
- @voyant-travel/commerce@0.44.11
- @voyant-travel/relationships@0.132.9

## 0.214.0

### Patch Changes

- @voyant-travel/commerce@0.44.10
- @voyant-travel/bookings@0.212.0
- @voyant-travel/finance@0.212.0
- @voyant-travel/identity@0.212.0
- @voyant-travel/legal@0.212.0
- @voyant-travel/relationships@0.132.8

## 0.213.0

### Patch Changes

- @voyant-travel/commerce@0.44.9
- @voyant-travel/bookings@0.211.0
- @voyant-travel/finance@0.211.0
- @voyant-travel/identity@0.211.0
- @voyant-travel/legal@0.211.0
- @voyant-travel/relationships@0.132.7

## 0.212.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/identity@0.210.0
- @voyant-travel/legal@0.210.0
- @voyant-travel/commerce@0.44.8
- @voyant-travel/relationships@0.132.6

## 0.211.0

### Patch Changes

- @voyant-travel/bookings@0.209.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/identity@0.209.0
- @voyant-travel/legal@0.209.0
- @voyant-travel/commerce@0.44.7
- @voyant-travel/relationships@0.132.5

## 0.210.0

### Patch Changes

- @voyant-travel/auth@0.144.0
- @voyant-travel/bookings@0.208.0
- @voyant-travel/finance@0.208.0
- @voyant-travel/identity@0.208.0
- @voyant-travel/legal@0.208.0
- @voyant-travel/commerce@0.44.6
- @voyant-travel/relationships@0.132.4

## 0.209.2

### Patch Changes

- 560f7c3: Quarantine `action.bootstrap-my-customer-portal` and remove it from the
  legacy execute+tools allowlist: it can create the customer's `crm.people`
  row on a branch that later fails, and a retry with no claim registry can
  orphan that row rather than converging on the same profile. Declares
  `availability: { status: "unavailable", reasonCode:
"unsafe-unclaimed-create-target" }`. No runtime changes.
- Updated dependencies [560f7c3]
  - @voyant-travel/bookings@0.207.1

## 0.209.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on five of the six grandfathered customer
  self-service actions and remove them from the legacy execute+tools
  allowlist:

  - `action.update-my-customer-portal-profile` is a single local Postgres
    update of the authenticated customer's own profile (target resolved from
    the session, not a client-supplied id), so it declares `availability`,
    `effectBoundary: "local"`, and `targetLifecycle: "existing"`.
  - `action.confirm-my-verification` binds two tools that both mutate an
    already-issued verification challenge (matched by destination + purpose +
    code, not a create/update split): a retry with the same code after the
    challenge is already `"verified"` fails closed with a domain conflict
    rather than silently re-verifying. It declares `availability`,
    `effectBoundary: "local"`, and `targetLifecycle: "existing"`.
  - `action.create-invoice-payment-link` already declares
    `commandTargetField: "invoiceId"` and `targetLifecycle: "existing"`; its
    `paymentUrl` is a locally built storefront checkout link (no outbound
    provider call at creation time), so this adds `availability` and
    `effectBoundary: "local"`.
  - `action.manage-my-customer-portal-companions` and
    `action.manage-my-customer-portal-documents` are quarantined from agent
    Tool exposure instead of migrated (`availability: unavailable`,
    `reasonCode: "unsafe-unclaimed-create-target"`): each binds a create tool
    with no idempotency key alongside update/import tools, so neither
    `targetLifecycle` value would honestly describe the bundle, and the create
    side has no dedup to safely retry. Customer portal UI is unaffected; only
    agent Tool exposure is disabled pending a split into separate create/update
    actions with a real created-target claim.

  `action.bootstrap-my-customer-portal` is intentionally left on the
  allowlist: its claim-conflict handling is idempotent on the already-linked
  path, but the create-new-person branch can leave an orphaned `crm.people`
  row if two bootstrap calls race before either commits, so declaring
  `handler-command-claim-v1` would overclaim replay safety. Follow-up work,
  not part of this batch.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/commerce@0.44.5
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/identity@0.207.1
  - @voyant-travel/legal@0.207.1
  - @voyant-travel/relationships@0.132.3

## 0.209.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/commerce@0.44.4
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/legal@0.207.0
  - @voyant-travel/relationships@0.132.2
  - @voyant-travel/identity@0.207.0

## 0.208.0

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

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/payments@0.7.0
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/identity@0.206.0
  - @voyant-travel/legal@0.206.0
  - @voyant-travel/commerce@0.44.3
  - @voyant-travel/relationships@0.132.1

## 0.207.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/legal@0.205.0
  - @voyant-travel/relationships@0.132.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/commerce@0.44.2
  - @voyant-travel/bookings@0.205.0
  - @voyant-travel/identity@0.205.0

## 0.206.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/identity@0.204.0
- @voyant-travel/legal@0.204.0
- @voyant-travel/commerce@0.44.1
- @voyant-travel/relationships@0.131.7

## 0.205.0

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
  - @voyant-travel/commerce@0.44.0
  - @voyant-travel/legal@0.203.0
  - @voyant-travel/identity@0.203.0
  - @voyant-travel/relationships@0.131.6
  - @voyant-travel/auth@0.143.6

## 0.204.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/identity@0.202.0
- @voyant-travel/legal@0.202.0
- @voyant-travel/commerce@0.43.3
- @voyant-travel/relationships@0.131.5

## 0.203.1

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
  - @voyant-travel/auth@0.143.5
  - @voyant-travel/bookings@0.201.1
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/identity@0.201.1
  - @voyant-travel/legal@0.201.1
  - @voyant-travel/relationships@0.131.4

## 0.203.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/commerce@0.43.1
  - @voyant-travel/legal@0.201.0
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/identity@0.201.0
  - @voyant-travel/relationships@0.131.3

## 0.202.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/legal@0.200.0
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/auth@0.143.4
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/identity@0.200.0
  - @voyant-travel/payments@0.6.5
  - @voyant-travel/relationships@0.131.2
  - @voyant-travel/relationships-contracts@0.109.2

## 0.201.0

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/auth@0.143.3
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/identity@0.199.0
  - @voyant-travel/legal@0.199.0
  - @voyant-travel/payments@0.6.4
  - @voyant-travel/relationships@0.131.1

## 0.200.1

### Patch Changes

- @voyant-travel/auth@0.143.2
- @voyant-travel/bookings@0.198.1
- @voyant-travel/finance@0.198.1
- @voyant-travel/identity@0.198.1
- @voyant-travel/legal@0.198.1

## 0.200.0

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/legal@0.198.0
  - @voyant-travel/bookings@0.198.0
  - @voyant-travel/finance@0.198.0
  - @voyant-travel/identity@0.198.0
  - @voyant-travel/commerce@0.42.1

## 0.199.0

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [e44781c]
- Updated dependencies [26b4c9a]
- Updated dependencies [fa1cc2c]
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/commerce@0.42.0
  - @voyant-travel/legal@0.197.0
  - @voyant-travel/relationships@0.130.0
  - @voyant-travel/identity@0.197.0
  - @voyant-travel/auth@0.143.1
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/payments@0.6.3

## 0.198.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- bba4fec: Anchor generated-child actions to stable existing parents so action policy checks
  do not require IDs that only exist after dispatch. Split relationship child
  creation Tools by person and organization so each selected action has one
  unambiguous parent target type. Bind each generic action's policy target to its
  domain parent-id input before ledger, approval, or handler execution.
- Updated dependencies [71c08aa]
- Updated dependencies [78423d3]
- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/legal@0.196.0
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/auth@0.143.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/identity@0.196.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/payments@0.6.2

## 0.197.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/commerce@0.40.6
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/legal@0.195.0
  - @voyant-travel/relationships@0.128.36
  - @voyant-travel/identity@0.195.0

## 0.196.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/identity@0.194.0
  - @voyant-travel/legal@0.194.0
  - @voyant-travel/relationships@0.128.35

## 0.195.0

### Patch Changes

- @voyant-travel/legal@0.193.0
- @voyant-travel/auth@0.142.0
- @voyant-travel/bookings@0.193.0
- @voyant-travel/finance@0.193.0
- @voyant-travel/identity@0.193.0
- @voyant-travel/commerce@0.40.4
- @voyant-travel/relationships@0.128.34

## 0.194.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/auth@0.141.5
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/identity@0.192.1
  - @voyant-travel/legal@0.192.1
  - @voyant-travel/payments@0.6.1
  - @voyant-travel/relationships@0.128.33

## 0.194.0

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
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/identity@0.192.0
  - @voyant-travel/legal@0.192.0
  - @voyant-travel/commerce@0.40.2
  - @voyant-travel/relationships@0.128.32

## 0.193.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/commerce@0.40.1
  - @voyant-travel/legal@0.191.0
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/identity@0.191.0
  - @voyant-travel/relationships@0.128.31

## 0.192.1

### Patch Changes

- bacae5e: Allow guest storefronts to read public settings and preview departure prices without authentication.

## 0.192.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/legal@0.190.0
  - @voyant-travel/relationships@0.128.30
  - @voyant-travel/auth@0.141.4
  - @voyant-travel/identity@0.190.0
  - @voyant-travel/payments@0.5.2

## 0.191.0

### Patch Changes

- @voyant-travel/commerce@0.39.25
- @voyant-travel/bookings@0.189.0
- @voyant-travel/finance@0.189.0
- @voyant-travel/identity@0.189.0
- @voyant-travel/legal@0.189.0
- @voyant-travel/relationships@0.128.29

## 0.190.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/auth@0.141.3
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/identity@0.188.0
  - @voyant-travel/legal@0.188.0
  - @voyant-travel/relationships@0.128.28

## 0.189.1

### Patch Changes

- 406cebb: Forward the request event bus when verified payment-adapter callbacks update payment sessions, allowing `payment.completed` checkout finalization to run on managed callbacks.

## 0.189.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/identity@0.187.0
- @voyant-travel/legal@0.187.0
- @voyant-travel/commerce@0.39.23
- @voyant-travel/relationships@0.128.27

## 0.188.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/identity@0.186.0
- @voyant-travel/legal@0.186.0
- @voyant-travel/commerce@0.39.22
- @voyant-travel/relationships@0.128.26

## 0.187.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/commerce@0.39.21
  - @voyant-travel/legal@0.185.0
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/identity@0.185.0
  - @voyant-travel/relationships@0.128.25

## 0.186.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/identity@0.184.0
- @voyant-travel/legal@0.184.0
- @voyant-travel/commerce@0.39.20
- @voyant-travel/relationships@0.128.24

## 0.185.0

### Minor Changes

- 8d370ef: Managed card checkout (Phase 2B): the concrete control-plane remote payment transport that the generic `createRemotePaymentAdapter` delegates to (brokers initiate/status/verifyCallback to the platform payments control plane), plus the inbound processor IPN webhook (`POST /v1/public/payment-link/callback`) that verifies the callback through the payment adapter and applies the event. Together these let a connected processor actually charge cards without the deployment bundling any per-processor SDK.

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/payments@0.5.0
  - @voyant-travel/finance@0.183.0
  - @voyant-travel/bookings@0.183.0
  - @voyant-travel/identity@0.183.0
  - @voyant-travel/legal@0.183.0
  - @voyant-travel/commerce@0.39.19
  - @voyant-travel/relationships@0.128.23

## 0.184.2

### Patch Changes

- @voyant-travel/auth@0.141.2
- @voyant-travel/bookings@0.182.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/identity@0.182.2
- @voyant-travel/legal@0.182.4

## 0.184.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/auth@0.141.1
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/identity@0.182.1
  - @voyant-travel/legal@0.182.3
  - @voyant-travel/relationships@0.128.22

## 0.184.0

### Patch Changes

- Updated dependencies [f0a0e09]
  - @voyant-travel/auth@0.141.0
  - @voyant-travel/bookings@0.182.0
  - @voyant-travel/finance@0.182.0
  - @voyant-travel/identity@0.182.0
  - @voyant-travel/legal@0.182.0
  - @voyant-travel/commerce@0.39.17
  - @voyant-travel/relationships@0.128.21

## 0.183.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/legal@0.181.0
  - @voyant-travel/commerce@0.39.16
  - @voyant-travel/identity@0.181.0
  - @voyant-travel/relationships@0.128.20

## 0.182.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/legal@0.180.1
- @voyant-travel/db@0.117.1
- @voyant-travel/relationships-contracts@0.109.1
- @voyant-travel/auth@0.140.2
- @voyant-travel/bookings@0.180.1
- @voyant-travel/identity@0.180.1

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
  - @voyant-travel/legal@0.180.0
  - @voyant-travel/auth@0.140.1
  - @voyant-travel/bookings@0.180.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/identity@0.180.0
  - @voyant-travel/commerce@0.39.15
  - @voyant-travel/relationships@0.128.19

## 0.181.0

### Patch Changes

- Updated dependencies [4f34425]
  - @voyant-travel/auth@0.140.0
  - @voyant-travel/bookings@0.179.0
  - @voyant-travel/finance@0.179.0
  - @voyant-travel/identity@0.179.0
  - @voyant-travel/legal@0.179.0
  - @voyant-travel/commerce@0.39.14
  - @voyant-travel/relationships@0.128.18

## 0.180.0

### Patch Changes

- @voyant-travel/auth@0.139.0
- @voyant-travel/bookings@0.178.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/identity@0.178.0
- @voyant-travel/legal@0.178.0
- @voyant-travel/commerce@0.39.13
- @voyant-travel/relationships@0.128.17

## 0.179.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/auth@0.138.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/identity@0.177.0
  - @voyant-travel/legal@0.177.0
  - @voyant-travel/relationships@0.128.16

## 0.178.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/auth@0.137.0
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/identity@0.176.0
  - @voyant-travel/legal@0.176.0
  - @voyant-travel/relationships@0.128.15

## 0.177.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/legal@0.175.0
  - @voyant-travel/relationships@0.128.14
  - @voyant-travel/identity@0.175.0

## 0.176.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/identity@0.174.0
  - @voyant-travel/legal@0.174.0
  - @voyant-travel/relationships@0.128.13

## 0.175.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/identity@0.173.0
- @voyant-travel/legal@0.173.0
- @voyant-travel/commerce@0.39.8
- @voyant-travel/relationships@0.128.12

## 0.174.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/legal@0.172.0
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/db@0.114.14
  - @voyant-travel/identity@0.172.0

## 0.173.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/identity@0.171.1
  - @voyant-travel/legal@0.171.1
  - @voyant-travel/relationships@0.128.10

## 0.173.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/commerce@0.39.5
  - @voyant-travel/legal@0.171.0
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/identity@0.171.0
  - @voyant-travel/relationships@0.128.9

## 0.172.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/legal@0.170.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/identity@0.170.0
  - @voyant-travel/relationships@0.128.8

## 0.171.2

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/core@0.126.1
  - @voyant-travel/db@0.114.12
  - @voyant-travel/hono@0.128.5

## 0.171.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/identity@0.169.1
  - @voyant-travel/legal@0.169.1
  - @voyant-travel/relationships@0.128.7

## 0.171.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/identity@0.169.0
  - @voyant-travel/legal@0.169.0
  - @voyant-travel/relationships@0.128.6

## 0.170.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/commerce@0.39.1
  - @voyant-travel/legal@0.168.0
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/identity@0.168.0
  - @voyant-travel/relationships@0.128.5

## 0.169.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/legal@0.167.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/identity@0.167.0
  - @voyant-travel/relationships@0.128.4

## 0.168.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/legal@0.166.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/identity@0.166.0
  - @voyant-travel/relationships@0.128.3

## 0.167.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/commerce@0.37.3
  - @voyant-travel/legal@0.165.0
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/identity@0.165.0
  - @voyant-travel/relationships@0.128.2

## 0.166.0

### Patch Changes

- @voyant-travel/commerce@0.37.2
- @voyant-travel/bookings@0.164.0
- @voyant-travel/finance@0.164.0
- @voyant-travel/identity@0.164.0
- @voyant-travel/legal@0.164.0
- @voyant-travel/relationships@0.128.1

## 0.165.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/relationships@0.128.0
  - @voyant-travel/relationships-contracts@0.109.0
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/legal@0.163.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/identity@0.163.0

## 0.164.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/identity@0.162.0
  - @voyant-travel/legal@0.162.0
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/db@0.114.8

## 0.163.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/identity@0.161.0
  - @voyant-travel/legal@0.161.0
  - @voyant-travel/commerce@0.36.1
  - @voyant-travel/relationships@0.126.1

## 0.162.0

### Minor Changes

- eae32f8: Add provider-neutral MCP Tools for authenticated customer-portal self service, invoice-backed
  payment links, and customer email/SMS verification. Enforce self identity and destination from
  the authenticated grant, preserve existing ownership and rate-limit guards, derive payment
  amounts from authoritative invoices, and declare action-ledger and approval policy for every
  sensitive read and write.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [d9e8984]
- Updated dependencies [33cc782]
- Updated dependencies [db5adce]
- Updated dependencies [bf19d5a]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/identity@0.160.0
  - @voyant-travel/legal@0.160.0
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.161.0

### Minor Changes

- 82ffd12: Add persisted organization-level first-run setup guidance composed from the
  selected admin graph. Standard Operator deployments now collect package-owned
  business profile, storefront, market, fiscal, navigation, team, and first-product
  steps while keeping domain mutations in their existing package surfaces.

### Patch Changes

- 9c85101: Compile one canonical event catalog from selected package manifests and expose it through
  generated deployment artifacts, graph runtimes, a package-owned admin API, and an admin event
  reference page. Reject duplicate event type authorities while preserving legitimate emitters,
  and ratchet persistence mutation coverage in the phase-5 authority checker.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6
  - @voyant-travel/identity@0.159.0
  - @voyant-travel/legal@0.159.0
  - @voyant-travel/relationships@0.125.4

## 0.160.0

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
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/identity@0.158.0
  - @voyant-travel/legal@0.158.0
  - @voyant-travel/relationships@0.125.3

## 0.159.0

### Patch Changes

- @voyant-travel/bookings@0.157.0
- @voyant-travel/finance@0.157.0
- @voyant-travel/identity@0.157.0
- @voyant-travel/legal@0.157.0
- @voyant-travel/commerce@0.35.7
- @voyant-travel/relationships@0.125.2

## 0.158.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/identity@0.156.1
  - @voyant-travel/legal@0.156.1
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/relationships-contracts@0.108.13

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
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/legal@0.156.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/relationships-contracts@0.108.12
  - @voyant-travel/identity@0.156.0

## 0.157.2

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.
- Updated dependencies [d83d237]
  - @voyant-travel/bookings@0.155.2
  - @voyant-travel/finance@0.155.2

## 0.157.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/legal@0.155.1
  - @voyant-travel/commerce@0.35.3
  - @voyant-travel/identity@0.155.1
  - @voyant-travel/relationships@0.124.4

## 0.157.0

### Minor Changes

- 3f6694b: Select the customer Storefront presentation through the deployment graph. Project resolution now emits a selected presentation factory artifact, and the standard Operator emits Storefront routes only when that presentation is selected.

### Patch Changes

- Updated dependencies [bb6e890]
- Updated dependencies [3f6694b]
  - @voyant-travel/legal@0.155.0
  - @voyant-travel/core@0.121.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/identity@0.155.0
  - @voyant-travel/relationships@0.124.3

## 0.156.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/legal@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/commerce@0.35.1
  - @voyant-travel/identity@0.154.0
  - @voyant-travel/relationships@0.124.2

## 0.155.0

### Minor Changes

- 490d132: Move Storefront intake persistence, customer presentation routes, route policy,
  and locale provider composition into package-owned selected graph contributions.

### Patch Changes

- 047c3f9: Move booking and payment runtime configuration behind package-owned graph factories and typed deployment ports.
- 490d132: Expose package-owned runtime contributor maps for Storefront, Legal, and Inventory deployment adapters.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Derive host-service runtime port bindings from deployment capabilities.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Compose Storefront runtime behavior through static package-owned graph ports and remove the Operator runtime loader.
- 490d132: Move Storefront OpenAPI authority into the package and require exact operation ownership for root-mounted graph bundles.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/commerce@0.35.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/legal@0.153.0
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/identity@0.153.0

## 0.154.0

### Minor Changes

- 263fb4d: Activate Storefront booking-bootstrap write intents through the package-owned selected-graph subscriber runtime and generic Node database lifecycle capability.

### Patch Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- Updated dependencies [d771be3]
- Updated dependencies [18d8aa0]
- Updated dependencies [9b15ebe]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [a799a34]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/commerce@0.34.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/legal@0.152.0
  - @voyant-travel/relationships@0.124.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/identity@0.152.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/utils@0.106.1

## 0.153.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/commerce@0.33.5
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/identity@0.151.4
  - @voyant-travel/legal@0.151.4
  - @voyant-travel/relationships@0.123.4

## 0.153.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/commerce@0.33.4
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/identity@0.151.3
  - @voyant-travel/legal@0.151.3
  - @voyant-travel/relationships@0.123.3

## 0.153.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/commerce@0.33.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/identity@0.151.2
  - @voyant-travel/legal@0.151.2
  - @voyant-travel/relationships@0.123.2

## 0.153.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/commerce@0.33.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/identity@0.151.1
  - @voyant-travel/legal@0.151.1
  - @voyant-travel/relationships@0.123.1

## 0.153.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for legal, storefront, and first-party edge plugins.
- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- a370024: Rehome finance, quote, legal, and storefront bridge graph declarations into their owning packages with executable runtime descriptors.
- Updated dependencies [a370024]
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
  - @voyant-travel/core@0.114.0
  - @voyant-travel/commerce@0.33.0
  - @voyant-travel/legal@0.151.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/relationships@0.123.0
  - @voyant-travel/identity@0.151.0
  - @voyant-travel/hono@0.122.4

## 0.152.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/commerce@0.32.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/legal@0.150.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/identity@0.150.0
  - @voyant-travel/relationships@0.122.12

## 0.151.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/commerce@0.31.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/identity@0.149.1
  - @voyant-travel/legal@0.149.1
  - @voyant-travel/relationships@0.122.11
  - @voyant-travel/hono@0.122.2

## 0.151.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/identity@0.149.0
- @voyant-travel/legal@0.149.0
- @voyant-travel/commerce@0.31.0
- @voyant-travel/relationships@0.122.10

## 0.150.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/identity@0.148.0
- @voyant-travel/legal@0.148.0
- @voyant-travel/commerce@0.30.0
- @voyant-travel/relationships@0.122.9

## 0.149.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/identity@0.147.0
- @voyant-travel/legal@0.147.0
- @voyant-travel/commerce@0.29.0
- @voyant-travel/relationships@0.122.8

## 0.148.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/identity@0.146.0
- @voyant-travel/legal@0.146.0
- @voyant-travel/commerce@0.28.0
- @voyant-travel/relationships@0.122.7

## 0.147.0

### Patch Changes

- @voyant-travel/commerce@0.27.0
- @voyant-travel/bookings@0.145.0
- @voyant-travel/finance@0.145.0
- @voyant-travel/identity@0.145.0
- @voyant-travel/legal@0.145.0
- @voyant-travel/relationships@0.122.6

## 0.146.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/commerce@0.26.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/legal@0.144.0
  - @voyant-travel/identity@0.144.0
  - @voyant-travel/relationships@0.122.5

## 0.145.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/legal@0.143.0
  - @voyant-travel/relationships@0.122.4
  - @voyant-travel/commerce@0.25.0
  - @voyant-travel/identity@0.143.0

## 0.144.0

### Patch Changes

- Updated dependencies [05c10f2]
  - @voyant-travel/commerce@0.24.0
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/finance@0.142.0
  - @voyant-travel/identity@0.142.0
  - @voyant-travel/legal@0.142.0
  - @voyant-travel/relationships@0.122.3

## 0.143.0

### Patch Changes

- @voyant-travel/commerce@0.23.0
- @voyant-travel/bookings@0.141.0
- @voyant-travel/finance@0.141.0
- @voyant-travel/identity@0.141.0
- @voyant-travel/legal@0.141.0
- @voyant-travel/relationships@0.122.2

## 0.142.0

### Patch Changes

- @voyant-travel/commerce@0.22.0
- @voyant-travel/bookings@0.140.0
- @voyant-travel/finance@0.140.0
- @voyant-travel/identity@0.140.0
- @voyant-travel/legal@0.140.0
- @voyant-travel/relationships@0.122.1

## 0.141.2

### Patch Changes

- ec207bd: Resolve localized public departure itinerary reads by accepting `languageTag`/`lang`
  query parameters, applying day and segment translations with base-content fallback,
  and exposing the query through first-party storefront clients.

## 0.141.1

### Patch Changes

- ecff8cf: Fix silently-unbookable availability slots and opaque bootstrap errors (#2833)

  - `createSlot` now seeds `remaining_pax = initial_pax` for a bounded slot when
    the caller omits `remainingPax`, so a slot created via
    `{ initialPax, unlimited: false }` no longer lands with `remaining_pax = NULL`
    and read as sold out from birth by the booking engine's capacity reservation.
  - `reserveBooking` tolerates an option-less slot (`option_id = NULL`): such a
    slot is not option-scoped, so an item carrying a derived option id no longer
    fails `slot_option_mismatch`. This unblocks storefront compat bootstrap, which
    derives and stamps an option id onto the booking item.
  - The storefront bootstrap error contract maps `slot_product_mismatch` and
    `slot_option_mismatch` to dedicated codes (`SLOT_PRODUCT_MISMATCH`,
    `SLOT_OPTION_MISMATCH`) instead of collapsing them into the generic
    `BOOTSTRAP_FAILED` fallback.

- Updated dependencies [ecff8cf]
  - @voyant-travel/bookings@0.139.2

## 0.141.0

### Patch Changes

- 52c52fc: Declare storefront public offer detail, apply, and redeem routes as anonymous surfaces so standard hosts admit them without hand-maintained `publicPaths` entries.
- Updated dependencies [c9a356f]
- Updated dependencies [bf2d4a5]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [e1290d9]
- Updated dependencies [0c75844]
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/relationships-contracts@0.108.11
  - @voyant-travel/relationships@0.122.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/commerce@0.21.0
  - @voyant-travel/identity@0.139.0
  - @voyant-travel/legal@0.139.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/db@0.109.5

## 0.140.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/commerce@0.20.5
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/identity@0.138.2
  - @voyant-travel/legal@0.138.2
  - @voyant-travel/relationships@0.121.10

## 0.140.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/commerce@0.20.4
  - @voyant-travel/identity@0.138.1
  - @voyant-travel/legal@0.138.1
  - @voyant-travel/relationships@0.121.9

## 0.140.0

### Patch Changes

- @voyant-travel/commerce@0.20.0
- @voyant-travel/legal@0.138.0
- @voyant-travel/bookings@0.138.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/identity@0.138.0
- @voyant-travel/relationships@0.121.7

## 0.139.5

### Patch Changes

- Updated dependencies [04aa601]
  - @voyant-travel/legal@0.137.9

## 0.139.4

### Patch Changes

- Updated dependencies [f6c8fcf]
- Updated dependencies [1d65f48]
  - @voyant-travel/legal@0.137.8
  - @voyant-travel/bookings@0.137.6

## 0.139.3

## 0.139.2

### Patch Changes

- ce0f92d: Refresh card-provider redirects when restarting active payment-link sessions instead of reusing stale stored URLs.
  - @voyant-travel/finance@0.137.7

## 0.139.1

### Patch Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/legal@0.137.1
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/commerce@0.19.1
  - @voyant-travel/identity@0.137.1
  - @voyant-travel/relationships@0.121.6

## 0.139.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/commerce@0.19.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/identity@0.137.0
  - @voyant-travel/legal@0.137.0
  - @voyant-travel/relationships@0.121.5

## 0.138.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/relationships-contracts@0.108.4
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/identity@0.136.0
  - @voyant-travel/legal@0.136.0
  - @voyant-travel/commerce@0.18.0
  - @voyant-travel/relationships@0.121.3

## 0.137.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/relationships-contracts@0.108.3
- @voyant-travel/bookings@0.135.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/identity@0.135.0
- @voyant-travel/legal@0.135.0
- @voyant-travel/commerce@0.17.0
- @voyant-travel/relationships@0.121.2

## 0.136.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/commerce@0.16.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/identity@0.134.1
  - @voyant-travel/legal@0.134.1
  - @voyant-travel/relationships@0.121.1

## 0.136.0

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
- Updated dependencies [51f7dea]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/bookings@0.134.0
  - @voyant-travel/commerce@0.16.0
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/identity@0.134.0
  - @voyant-travel/legal@0.134.0
  - @voyant-travel/relationships@0.121.0
  - @voyant-travel/utils@0.105.4

## 0.135.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/legal@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/commerce@0.15.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/identity@0.133.0
  - @voyant-travel/relationships@0.120.13
  - @voyant-travel/relationships-contracts@0.108.2

## 0.134.0

### Patch Changes

- @voyant-travel/commerce@0.14.0
- @voyant-travel/bookings@0.132.0
- @voyant-travel/finance@0.132.0
- @voyant-travel/identity@0.132.0
- @voyant-travel/legal@0.132.0
- @voyant-travel/relationships@0.120.12

## 0.133.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/commerce@0.13.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/identity@0.131.1
  - @voyant-travel/legal@0.131.1
  - @voyant-travel/relationships@0.120.11
  - @voyant-travel/db@0.108.5

## 0.133.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/identity@0.131.0
- @voyant-travel/legal@0.131.0
- @voyant-travel/commerce@0.13.0
- @voyant-travel/relationships@0.120.10

## 0.132.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/identity@0.130.0
- @voyant-travel/legal@0.130.0
- @voyant-travel/commerce@0.12.0
- @voyant-travel/relationships@0.120.9

## 0.131.1

### Patch Changes

- 733bf33: Stop a bookable departure from rendering "price on request" when an option has a stray empty default rate plan (#1601).

  - **commerce** — `createOptionPriceRule`/`updateOptionPriceRule` now enforce a single active default rate plan per `(option, price catalog)`. Writing or promoting a default plan demotes any sibling default in the same scope inside a transaction, so a save path can no longer fan out several active `is_default` rows where only the newest carries prices.
  - **storefront** — the public departures pricing reader now prefers a rate plan that actually carries a price (positive base amount or a priced active unit rule) before falling back to the `is_default` flag, so a stray empty default can't mask the real priced plan and force a "price on request".

- Updated dependencies [733bf33]
  - @voyant-travel/commerce@0.11.1

## 0.131.0

### Patch Changes

- @voyant-travel/commerce@0.11.0
- @voyant-travel/bookings@0.129.0
- @voyant-travel/finance@0.129.0
- @voyant-travel/identity@0.129.0
- @voyant-travel/legal@0.129.0
- @voyant-travel/relationships@0.120.7

## 0.130.0

### Minor Changes

- 63e99ca: Add a first-class storefront booking **compatibility bootstrap** for imported catalog departures (issue voyant#1984).

  - **New endpoint** `POST /v1/public/bookings/sessions/compat-bootstrap` accepts the minimal `{ productId, departureId, pax, currency?, locale?, optionId?, optionUnitId?, ... }` contract a host can always build for an imported departure. The server derives the current slot, option, and authoritative price itself, then returns a normal booking session — so this path never fails with `quote stale`.
  - **Machine-readable error contract** across every bootstrap surface (sync, compat, and the async intent poll). A single `STOREFRONT_BOOTSTRAP_ERROR_CODES` table maps each internal status to a stable `code` (`DEPARTURE_NOT_FOUND`, `PRODUCT_MISMATCH`, `SLOT_DEPARTURE_MISMATCH`, `PRICING_UNAVAILABLE`, `QUOTE_STALE`, `SLOT_UNAVAILABLE`, `INSUFFICIENT_CAPACITY`, `BOOTSTRAP_FAILED`), an HTTP status, and a `retryable` hint. `QUOTE_STALE` is the one expected, retryable rejection and now carries those fields alongside its `repricing` snapshot.
  - New exports: `bootstrapStorefrontBookingSessionCompat` machinery via the service, `describeStorefrontBootstrapError`, `STOREFRONT_BOOTSTRAP_ERROR_CODES`, plus the `storefrontBookingSessionCompatBootstrapInputSchema` / `storefrontBookingBootstrapRejectionSchema` schemas and types.

  No breaking changes — the existing `bootstrap` endpoint is unchanged except for the additive `code`/`retryable` fields on its error responses.

## 0.129.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/identity@0.128.0
- @voyant-travel/legal@0.128.0
- @voyant-travel/commerce@0.10.0
- @voyant-travel/relationships@0.120.6

## 0.128.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/commerce@0.9.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/legal@0.127.0
  - @voyant-travel/identity@0.127.0
  - @voyant-travel/relationships@0.120.5

## 0.127.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/relationships@0.120.4
  - @voyant-travel/identity@0.126.1
  - @voyant-travel/commerce@0.8.1
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/legal@0.126.1

## 0.127.0

### Patch Changes

- Updated dependencies [84b9d4b]
  - @voyant-travel/legal@0.126.0
  - @voyant-travel/commerce@0.8.0
  - @voyant-travel/bookings@0.126.0
  - @voyant-travel/finance@0.126.0
  - @voyant-travel/identity@0.126.0
  - @voyant-travel/relationships@0.120.3

## 0.126.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/relationships-contracts@0.108.1
- @voyant-travel/commerce@0.7.0
- @voyant-travel/bookings@0.125.0
- @voyant-travel/finance@0.125.0
- @voyant-travel/identity@0.125.0
- @voyant-travel/legal@0.125.0
- @voyant-travel/relationships@0.120.2
- @voyant-travel/hono@0.112.2

## 0.125.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/identity@0.124.0
- @voyant-travel/legal@0.124.0
- @voyant-travel/commerce@0.6.0
- @voyant-travel/relationships@0.120.1

## 0.124.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [170388e]
- Updated dependencies [e9d9dbb]
- Updated dependencies [9c3fe53]
- Updated dependencies [d29dd47]
- Updated dependencies [ce2a568]
- Updated dependencies [3aa90b4]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [9616f1f]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/relationships@0.120.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/relationships-contracts@0.108.0
  - @voyant-travel/commerce@0.5.0
  - @voyant-travel/legal@0.123.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/identity@0.123.0

## 0.123.1

### Patch Changes

- 832ac35: Fix storefront resource-availability SQL to use current booking status values and share the active status list from bookings.
- Updated dependencies [832ac35]
  - @voyant-travel/bookings@0.122.1

## 0.123.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [85caeef]
- Updated dependencies [85a13d3]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/legal@0.122.0
  - @voyant-travel/commerce@0.4.0
  - @voyant-travel/bookings@0.122.0
  - @voyant-travel/identity@0.122.0
  - @voyant-travel/relationships@0.119.5

## 0.122.0

### Minor Changes

- 13fe70b: The storefront module now owns the public payment-link / checkout-status routes: new `@voyant-travel/storefront/payment-link` export (`createPaymentLinkRoutes(options)`). The trips / inventory / payment-provider / operator-settings reads are injected as options (bookings + finance are read directly).

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [503a634]
  - @voyant-travel/commerce@0.3.0
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/legal@0.121.0
  - @voyant-travel/bookings@0.121.0
  - @voyant-travel/relationships@0.119.4
  - @voyant-travel/identity@0.121.0

## 0.121.2

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.
- Updated dependencies [756213e]
  - @voyant-travel/bookings@0.120.2
  - @voyant-travel/commerce@0.2.3
  - @voyant-travel/hono@0.110.3
  - @voyant-travel/legal@0.120.2

## 0.121.1

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/finance@0.120.1
- @voyant-travel/identity@0.120.1
- @voyant-travel/legal@0.120.1

## 0.121.0

### Minor Changes

- 23fc4bd: Fold storefront verification into the storefront package under
  `@voyant-travel/storefront/verification`, including the public challenge routes,
  service helpers, validation schemas, and Drizzle schema entrypoint.
- 6196b3b: Move customer portal runtime and React surfaces under Storefront owner paths and
  remove the old customer-portal workspace packages. Remove the retired Checkout
  workspace packages now that Finance and Finance React own checkout collection
  services, hooks, and UI.

### Patch Changes

- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
- f916094: Remove Storefront runtime dependencies on Product and Availability packages.
  Public departure, pricing, itinerary, and booking-session reads now use
  Storefront-owned SQL boundary queries, while Product and Availability remain
  dev/test dependencies for integration coverage.
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [e388bc9]
- Updated dependencies [6bff46f]
- Updated dependencies [a4e0909]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [3e160d3]
- Updated dependencies [c3f4fa0]
- Updated dependencies [47fef18]
- Updated dependencies [063f2b5]
- Updated dependencies [2c9c4a4]
- Updated dependencies [c8189fc]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/commerce@0.2.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/legal@0.120.0
  - @voyant-travel/relationships@0.119.3
  - @voyant-travel/relationships-contracts@0.107.0
  - @voyant-travel/identity@0.120.0

## 0.120.1

### Patch Changes

- f71eddf: Refactor oversized public storefront and customer portal modules into focused internal slices while preserving the existing public package entry points.

## 0.120.0

### Minor Changes

- f25e790: Async booking-session bootstrap over the queued write pipeline (RFC #1687 Phase 3.2). `POST /bookings/sessions/bootstrap` with `?async=1` or `Prefer: respond-async` stores a write intent, durably emits its event (transactional outbox: immediate attempt + retries with backoff), and answers **202 + a status URL**; `GET /bookings/intents/:id` reports pending/succeeded/failed, issuing the checkout capability at poll time on success and surfacing conflict detail (incl. `stale_quote` repricing) on failure. Business conclusions (sold out, stale quote) settle the intent without retry; only infra errors redeliver. The handler ships in the package (`createBookingBootstrapIntentHandler`) and self-registers from the module bootstrap when `createStorefrontHonoModule({ bookingIntents: { resolveDb } })` is configured — the operator template wires it. Under a booking spike, callers get instant 202s and reserve transactions drain at the outbox's pace instead of thundering-herding the slot locks.

### Patch Changes

- @voyant-travel/availability@0.116.1
- @voyant-travel/bookings@0.119.1
- @voyant-travel/crm@0.119.1
- @voyant-travel/extras@0.119.1
- @voyant-travel/finance@0.119.1
- @voyant-travel/hono@0.109.1
- @voyant-travel/pricing@0.119.1
- @voyant-travel/products@0.119.1
- @voyant-travel/sellability@0.119.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/availability@0.116.0
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/crm@0.119.0
  - @voyant-travel/extras@0.119.0
  - @voyant-travel/finance@0.119.0
  - @voyant-travel/pricing@0.119.0
  - @voyant-travel/products@0.119.0
  - @voyant-travel/sellability@0.119.0

## 0.118.0

### Patch Changes

- 004fc38: `GET /products/:productId/departures` is read-through against the `env.CACHE` KV binding with a 120s TTL (keyed per product + query params). Departure availability shifts with every booking, so this is deliberately TTL-bounded rather than invalidated — browse-grade freshness within 2 minutes, while checkout always re-verifies capacity on the live transactional path. Degrades to the live query without the binding.
- Updated dependencies [004fc38]
  - @voyant-travel/products@0.118.0
  - @voyant-travel/availability@0.115.0
  - @voyant-travel/bookings@0.118.0
  - @voyant-travel/extras@0.118.0
  - @voyant-travel/finance@0.118.0
  - @voyant-travel/pricing@0.118.0
  - @voyant-travel/sellability@0.118.0
  - @voyant-travel/crm@0.118.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/products@0.117.1
  - @voyant-travel/finance@0.117.1
  - @voyant-travel/availability@0.114.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/crm@0.117.1
  - @voyant-travel/extras@0.117.1
  - @voyant-travel/pricing@0.117.1
  - @voyant-travel/sellability@0.117.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/availability@0.114.0
  - @voyant-travel/finance@0.117.0
  - @voyant-travel/products@0.117.0
  - @voyant-travel/extras@0.117.0
  - @voyant-travel/crm@0.117.0
  - @voyant-travel/pricing@0.117.0
  - @voyant-travel/sellability@0.117.0

## 0.116.0

### Patch Changes

- 418fa82: Public departure reads (`GET /departures/:id`, `GET /products/:id/departures`, `GET /products/:id/departures/:id/itinerary`) now emit `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on success, making them eligible for the framework/platform shared cache (they are non-personalized catalog data; see #1686).
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/products@0.116.0
  - @voyant-travel/availability@0.113.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/crm@0.116.0
  - @voyant-travel/extras@0.116.0
  - @voyant-travel/finance@0.116.0
  - @voyant-travel/pricing@0.116.0
  - @voyant-travel/sellability@0.116.0

## 0.115.0

### Patch Changes

- @voyant-travel/availability@0.112.0
- @voyant-travel/bookings@0.115.0
- @voyant-travel/crm@0.115.0
- @voyant-travel/extras@0.115.0
- @voyant-travel/finance@0.115.0
- @voyant-travel/pricing@0.115.0
- @voyant-travel/products@0.115.0
- @voyant-travel/sellability@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/availability@0.111.0
- @voyant-travel/bookings@0.114.0
- @voyant-travel/crm@0.114.0
- @voyant-travel/extras@0.114.0
- @voyant-travel/finance@0.114.0
- @voyant-travel/pricing@0.114.0
- @voyant-travel/products@0.114.0
- @voyant-travel/sellability@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/availability@0.110.0
- @voyant-travel/bookings@0.113.0
- @voyant-travel/crm@0.113.0
- @voyant-travel/extras@0.113.0
- @voyant-travel/finance@0.113.0
- @voyant-travel/pricing@0.113.0
- @voyant-travel/products@0.113.0
- @voyant-travel/sellability@0.113.0

## 0.112.0

### Patch Changes

- @voyant-travel/availability@0.109.0
- @voyant-travel/bookings@0.112.0
- @voyant-travel/crm@0.112.0
- @voyant-travel/extras@0.112.0
- @voyant-travel/finance@0.112.0
- @voyant-travel/pricing@0.112.0
- @voyant-travel/products@0.112.0
- @voyant-travel/sellability@0.112.0

## 0.111.0

### Patch Changes

- @voyant-travel/availability@0.108.0
- @voyant-travel/bookings@0.111.0
- @voyant-travel/crm@0.111.0
- @voyant-travel/extras@0.111.0
- @voyant-travel/finance@0.111.0
- @voyant-travel/pricing@0.111.0
- @voyant-travel/products@0.111.0
- @voyant-travel/sellability@0.111.0

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/availability@0.107.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/crm@0.110.0
  - @voyant-travel/extras@0.110.0
  - @voyant-travel/finance@0.110.0
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/pricing@0.110.0
  - @voyant-travel/products@0.110.0
  - @voyant-travel/sellability@0.110.0

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/availability@0.106.0
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/crm@0.109.0
  - @voyant-travel/extras@0.109.0
  - @voyant-travel/finance@0.109.0
  - @voyant-travel/pricing@0.109.0
  - @voyant-travel/products@0.109.0
  - @voyant-travel/sellability@0.109.0
  - @voyant-travel/hono@0.105.2

## 0.108.0

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/products@0.108.0
  - @voyant-travel/extras@0.108.0
  - @voyant-travel/availability@0.105.2
  - @voyant-travel/bookings@0.108.0
  - @voyant-travel/finance@0.108.0
  - @voyant-travel/pricing@0.108.0
  - @voyant-travel/sellability@0.108.0
  - @voyant-travel/crm@0.108.0

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/availability@0.105.1
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/crm@0.107.1
  - @voyant-travel/extras@0.107.1
  - @voyant-travel/finance@0.107.1
  - @voyant-travel/pricing@0.107.1
  - @voyant-travel/products@0.107.1
  - @voyant-travel/sellability@0.107.1

## 0.107.0

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [c2aef18]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/crm@0.107.0
  - @voyant-travel/sellability@0.107.0
  - @voyant-travel/core@0.105.0
  - @voyant-travel/availability@0.105.0
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/extras@0.107.0
  - @voyant-travel/finance@0.107.0
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/pricing@0.107.0
  - @voyant-travel/products@0.107.0

## 0.106.0

### Patch Changes

- Updated dependencies [6949669]
  - @voyant-travel/crm@0.106.0
  - @voyant-travel/bookings@0.106.0
  - @voyant-travel/finance@0.106.0
  - @voyant-travel/products@0.106.0
  - @voyant-travel/extras@0.106.0
  - @voyant-travel/availability@0.104.1
  - @voyant-travel/pricing@0.106.0
  - @voyant-travel/sellability@0.106.0

## 0.105.0

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/products@0.105.0
  - @voyant-travel/availability@0.104.1
  - @voyant-travel/bookings@0.105.0
  - @voyant-travel/extras@0.105.0
  - @voyant-travel/finance@0.105.0
  - @voyant-travel/pricing@0.105.0
  - @voyant-travel/sellability@0.105.0
  - @voyant-travel/crm@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/availability@0.104.1
- @voyant-travel/bookings@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/crm@0.104.1
- @voyant-travel/extras@0.104.1
- @voyant-travel/finance@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/pricing@0.104.1
- @voyant-travel/products@0.104.1
- @voyant-travel/sellability@0.104.1

## 0.104.0

### Patch Changes

- Updated dependencies [e2ae9ff]
  - @voyant-travel/availability@0.104.0
  - @voyant-travel/bookings@0.104.0
  - @voyant-travel/core@0.104.0
  - @voyant-travel/crm@0.104.0
  - @voyant-travel/extras@0.104.0
  - @voyant-travel/finance@0.104.0
  - @voyant-travel/hono@0.104.0
  - @voyant-travel/pricing@0.104.0
  - @voyant-travel/products@0.104.0
  - @voyant-travel/sellability@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/availability@0.103.0
- @voyant-travel/bookings@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/crm@0.103.0
- @voyant-travel/extras@0.103.0
- @voyant-travel/finance@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/pricing@0.103.0
- @voyant-travel/products@0.103.0
- @voyant-travel/sellability@0.103.0

## 0.102.0

### Patch Changes

- Updated dependencies [b6d0673]
  - @voyant-travel/availability@0.102.0
  - @voyant-travel/bookings@0.102.0
  - @voyant-travel/core@0.102.0
  - @voyant-travel/crm@0.102.0
  - @voyant-travel/extras@0.102.0
  - @voyant-travel/finance@0.102.0
  - @voyant-travel/hono@0.102.0
  - @voyant-travel/pricing@0.102.0
  - @voyant-travel/products@0.102.0
  - @voyant-travel/sellability@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
- Updated dependencies [577eaf5]
  - @voyant-travel/availability@0.101.2
  - @voyant-travel/bookings@0.101.2
  - @voyant-travel/core@0.101.2
  - @voyant-travel/crm@0.101.2
  - @voyant-travel/extras@0.101.2
  - @voyant-travel/finance@0.101.2
  - @voyant-travel/hono@0.101.2
  - @voyant-travel/pricing@0.101.2
  - @voyant-travel/products@0.101.2
  - @voyant-travel/sellability@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/availability@0.101.1
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/crm@0.101.1
  - @voyant-travel/extras@0.101.1
  - @voyant-travel/finance@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/pricing@0.101.1
  - @voyant-travel/products@0.101.1
  - @voyant-travel/sellability@0.101.1

## 0.101.0

### Patch Changes

- Updated dependencies [8e7b56a]
  - @voyant-travel/availability@0.101.0
  - @voyant-travel/bookings@0.101.0
  - @voyant-travel/core@0.101.0
  - @voyant-travel/crm@0.101.0
  - @voyant-travel/extras@0.101.0
  - @voyant-travel/finance@0.101.0
  - @voyant-travel/hono@0.101.0
  - @voyant-travel/pricing@0.101.0
  - @voyant-travel/products@0.101.0
  - @voyant-travel/sellability@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/availability@0.100.0
- @voyant-travel/bookings@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/crm@0.100.0
- @voyant-travel/extras@0.100.0
- @voyant-travel/finance@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/pricing@0.100.0
- @voyant-travel/products@0.100.0
- @voyant-travel/sellability@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/availability@0.99.0
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/crm@0.99.0
  - @voyant-travel/extras@0.99.0
  - @voyant-travel/finance@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/pricing@0.99.0
  - @voyant-travel/products@0.99.0
  - @voyant-travel/sellability@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/availability@0.98.0
- @voyant-travel/bookings@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/crm@0.98.0
- @voyant-travel/extras@0.98.0
- @voyant-travel/finance@0.98.0
- @voyant-travel/hono@0.98.0
- @voyant-travel/pricing@0.98.0
- @voyant-travel/products@0.98.0
- @voyant-travel/sellability@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/availability@0.97.0
- @voyant-travel/bookings@0.97.0
- @voyant-travel/core@0.97.0
- @voyant-travel/crm@0.97.0
- @voyant-travel/extras@0.97.0
- @voyant-travel/finance@0.97.0
- @voyant-travel/hono@0.97.0
- @voyant-travel/pricing@0.97.0
- @voyant-travel/products@0.97.0
- @voyant-travel/sellability@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [465fb31]
  - @voyant-travel/availability@0.96.0
  - @voyant-travel/bookings@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/crm@0.96.0
  - @voyant-travel/extras@0.96.0
  - @voyant-travel/finance@0.96.0
  - @voyant-travel/hono@0.96.0
  - @voyant-travel/pricing@0.96.0
  - @voyant-travel/products@0.96.0
  - @voyant-travel/sellability@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/availability@0.95.0
- @voyant-travel/bookings@0.95.0
- @voyant-travel/core@0.95.0
- @voyant-travel/crm@0.95.0
- @voyant-travel/extras@0.95.0
- @voyant-travel/finance@0.95.0
- @voyant-travel/hono@0.95.0
- @voyant-travel/pricing@0.95.0
- @voyant-travel/products@0.95.0
- @voyant-travel/sellability@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/availability@0.94.0
- @voyant-travel/bookings@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/crm@0.94.0
- @voyant-travel/extras@0.94.0
- @voyant-travel/finance@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/pricing@0.94.0
- @voyant-travel/products@0.94.0
- @voyant-travel/sellability@0.94.0

## 0.93.0

### Patch Changes

- Updated dependencies [5df6824]
  - @voyant-travel/availability@0.93.0
  - @voyant-travel/bookings@0.93.0
  - @voyant-travel/core@0.93.0
  - @voyant-travel/crm@0.93.0
  - @voyant-travel/extras@0.93.0
  - @voyant-travel/finance@0.93.0
  - @voyant-travel/hono@0.93.0
  - @voyant-travel/pricing@0.93.0
  - @voyant-travel/products@0.93.0
  - @voyant-travel/sellability@0.93.0

## 0.92.0

### Minor Changes

- 5de3d72: Extend promotion scopes with fare-code and cabin-grade targeting, and add structured eligibility flags for past-guest, solo-traveler, child-traveler, and family offers.

### Patch Changes

- @voyant-travel/availability@0.92.0
- @voyant-travel/bookings@0.92.0
- @voyant-travel/core@0.92.0
- @voyant-travel/crm@0.92.0
- @voyant-travel/extras@0.92.0
- @voyant-travel/finance@0.92.0
- @voyant-travel/hono@0.92.0
- @voyant-travel/pricing@0.92.0
- @voyant-travel/products@0.92.0
- @voyant-travel/sellability@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/availability@0.91.0
- @voyant-travel/bookings@0.91.0
- @voyant-travel/core@0.91.0
- @voyant-travel/crm@0.91.0
- @voyant-travel/extras@0.91.0
- @voyant-travel/finance@0.91.0
- @voyant-travel/hono@0.91.0
- @voyant-travel/pricing@0.91.0
- @voyant-travel/products@0.91.0
- @voyant-travel/sellability@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/availability@0.90.0
- @voyant-travel/bookings@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/crm@0.90.0
- @voyant-travel/extras@0.90.0
- @voyant-travel/finance@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/pricing@0.90.0
- @voyant-travel/products@0.90.0
- @voyant-travel/sellability@0.90.0

## 0.89.0

### Patch Changes

- Updated dependencies [ed45995]
  - @voyant-travel/availability@0.89.0
  - @voyant-travel/bookings@0.89.0
  - @voyant-travel/core@0.89.0
  - @voyant-travel/crm@0.89.0
  - @voyant-travel/extras@0.89.0
  - @voyant-travel/finance@0.89.0
  - @voyant-travel/hono@0.89.0
  - @voyant-travel/pricing@0.89.0
  - @voyant-travel/products@0.89.0
  - @voyant-travel/sellability@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/availability@0.88.0
- @voyant-travel/bookings@0.88.0
- @voyant-travel/core@0.88.0
- @voyant-travel/crm@0.88.0
- @voyant-travel/extras@0.88.0
- @voyant-travel/finance@0.88.0
- @voyant-travel/hono@0.88.0
- @voyant-travel/pricing@0.88.0
- @voyant-travel/products@0.88.0
- @voyant-travel/sellability@0.88.0

## 0.87.1

### Patch Changes

- Updated dependencies [5be088f]
  - @voyant-travel/availability@0.87.1
  - @voyant-travel/bookings@0.87.1
  - @voyant-travel/core@0.87.1
  - @voyant-travel/crm@0.87.1
  - @voyant-travel/extras@0.87.1
  - @voyant-travel/finance@0.87.1
  - @voyant-travel/hono@0.87.1
  - @voyant-travel/pricing@0.87.1
  - @voyant-travel/products@0.87.1
  - @voyant-travel/sellability@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/availability@0.87.0
- @voyant-travel/bookings@0.87.0
- @voyant-travel/core@0.87.0
- @voyant-travel/crm@0.87.0
- @voyant-travel/extras@0.87.0
- @voyant-travel/finance@0.87.0
- @voyant-travel/hono@0.87.0
- @voyant-travel/pricing@0.87.0
- @voyant-travel/products@0.87.0
- @voyant-travel/sellability@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/availability@0.86.0
- @voyant-travel/bookings@0.86.0
- @voyant-travel/core@0.86.0
- @voyant-travel/crm@0.86.0
- @voyant-travel/extras@0.86.0
- @voyant-travel/finance@0.86.0
- @voyant-travel/hono@0.86.0
- @voyant-travel/pricing@0.86.0
- @voyant-travel/products@0.86.0
- @voyant-travel/sellability@0.86.0

## 0.85.4

### Patch Changes

- Updated dependencies [bed4a3f]
  - @voyant-travel/availability@0.85.4
  - @voyant-travel/bookings@0.85.4
  - @voyant-travel/core@0.85.4
  - @voyant-travel/crm@0.85.4
  - @voyant-travel/extras@0.85.4
  - @voyant-travel/finance@0.85.4
  - @voyant-travel/hono@0.85.4
  - @voyant-travel/pricing@0.85.4
  - @voyant-travel/products@0.85.4
  - @voyant-travel/sellability@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/availability@0.85.3
- @voyant-travel/bookings@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/crm@0.85.3
- @voyant-travel/extras@0.85.3
- @voyant-travel/finance@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/pricing@0.85.3
- @voyant-travel/products@0.85.3
- @voyant-travel/sellability@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/availability@0.85.2
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/crm@0.85.2
  - @voyant-travel/extras@0.85.2
  - @voyant-travel/finance@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/pricing@0.85.2
  - @voyant-travel/products@0.85.2
  - @voyant-travel/sellability@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/availability@0.85.1
- @voyant-travel/bookings@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/crm@0.85.1
- @voyant-travel/extras@0.85.1
- @voyant-travel/finance@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/pricing@0.85.1
- @voyant-travel/products@0.85.1
- @voyant-travel/sellability@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/availability@0.85.0
- @voyant-travel/bookings@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/crm@0.85.0
- @voyant-travel/extras@0.85.0
- @voyant-travel/finance@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/pricing@0.85.0
- @voyant-travel/products@0.85.0
- @voyant-travel/sellability@0.85.0

## 0.84.4

### Patch Changes

- Updated dependencies [f3f8de1]
  - @voyant-travel/availability@0.84.4
  - @voyant-travel/bookings@0.84.4
  - @voyant-travel/core@0.84.4
  - @voyant-travel/crm@0.84.4
  - @voyant-travel/extras@0.84.4
  - @voyant-travel/finance@0.84.4
  - @voyant-travel/hono@0.84.4
  - @voyant-travel/pricing@0.84.4
  - @voyant-travel/products@0.84.4
  - @voyant-travel/sellability@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/availability@0.84.3
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/crm@0.84.3
  - @voyant-travel/extras@0.84.3
  - @voyant-travel/finance@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/pricing@0.84.3
  - @voyant-travel/products@0.84.3
  - @voyant-travel/sellability@0.84.3

## 0.84.2

### Patch Changes

- Updated dependencies [29c6e83]
  - @voyant-travel/availability@0.84.2
  - @voyant-travel/bookings@0.84.2
  - @voyant-travel/core@0.84.2
  - @voyant-travel/crm@0.84.2
  - @voyant-travel/extras@0.84.2
  - @voyant-travel/finance@0.84.2
  - @voyant-travel/hono@0.84.2
  - @voyant-travel/pricing@0.84.2
  - @voyant-travel/products@0.84.2
  - @voyant-travel/sellability@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/availability@0.84.1
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/crm@0.84.1
  - @voyant-travel/extras@0.84.1
  - @voyant-travel/finance@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/pricing@0.84.1
  - @voyant-travel/products@0.84.1
  - @voyant-travel/sellability@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/availability@0.84.0
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/crm@0.84.0
  - @voyant-travel/extras@0.84.0
  - @voyant-travel/finance@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/pricing@0.84.0
  - @voyant-travel/products@0.84.0
  - @voyant-travel/sellability@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/availability@0.83.1
- @voyant-travel/bookings@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/crm@0.83.1
- @voyant-travel/extras@0.83.1
- @voyant-travel/finance@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/pricing@0.83.1
- @voyant-travel/products@0.83.1
- @voyant-travel/sellability@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/availability@0.83.0
- @voyant-travel/bookings@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/crm@0.83.0
- @voyant-travel/extras@0.83.0
- @voyant-travel/finance@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/pricing@0.83.0
- @voyant-travel/products@0.83.0
- @voyant-travel/sellability@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/availability@0.82.1
- @voyant-travel/bookings@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/crm@0.82.1
- @voyant-travel/extras@0.82.1
- @voyant-travel/finance@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/pricing@0.82.1
- @voyant-travel/products@0.82.1
- @voyant-travel/sellability@0.82.1

## 0.82.0

### Patch Changes

- Updated dependencies [79ce168]
  - @voyant-travel/availability@0.82.0
  - @voyant-travel/bookings@0.82.0
  - @voyant-travel/core@0.82.0
  - @voyant-travel/crm@0.82.0
  - @voyant-travel/extras@0.82.0
  - @voyant-travel/finance@0.82.0
  - @voyant-travel/hono@0.82.0
  - @voyant-travel/pricing@0.82.0
  - @voyant-travel/products@0.82.0
  - @voyant-travel/sellability@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/availability@0.81.21
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/crm@0.81.21
  - @voyant-travel/extras@0.81.21
  - @voyant-travel/finance@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/pricing@0.81.21
  - @voyant-travel/products@0.81.21
  - @voyant-travel/sellability@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/availability@0.81.20
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/crm@0.81.20
  - @voyant-travel/extras@0.81.20
  - @voyant-travel/finance@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/pricing@0.81.20
  - @voyant-travel/products@0.81.20
  - @voyant-travel/sellability@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/availability@0.81.19
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/crm@0.81.19
  - @voyant-travel/extras@0.81.19
  - @voyant-travel/finance@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/pricing@0.81.19
  - @voyant-travel/products@0.81.19
  - @voyant-travel/sellability@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/availability@0.81.18
- @voyant-travel/bookings@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/crm@0.81.18
- @voyant-travel/extras@0.81.18
- @voyant-travel/finance@0.81.18
- @voyant-travel/hono@0.81.18
- @voyant-travel/pricing@0.81.18
- @voyant-travel/products@0.81.18
- @voyant-travel/sellability@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/availability@0.81.17
- @voyant-travel/bookings@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/crm@0.81.17
- @voyant-travel/extras@0.81.17
- @voyant-travel/finance@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/pricing@0.81.17
- @voyant-travel/products@0.81.17
- @voyant-travel/sellability@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/availability@0.81.16
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/crm@0.81.16
  - @voyant-travel/extras@0.81.16
  - @voyant-travel/finance@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/pricing@0.81.16
  - @voyant-travel/products@0.81.16
  - @voyant-travel/sellability@0.81.16

## 0.81.15

### Patch Changes

- Updated dependencies [b6bc138]
  - @voyant-travel/availability@0.81.15
  - @voyant-travel/bookings@0.81.15
  - @voyant-travel/core@0.81.15
  - @voyant-travel/crm@0.81.15
  - @voyant-travel/extras@0.81.15
  - @voyant-travel/finance@0.81.15
  - @voyant-travel/hono@0.81.15
  - @voyant-travel/pricing@0.81.15
  - @voyant-travel/products@0.81.15
  - @voyant-travel/sellability@0.81.15

## 0.81.14

### Patch Changes

- Updated dependencies [0a77ff9]
  - @voyant-travel/availability@0.81.14
  - @voyant-travel/bookings@0.81.14
  - @voyant-travel/core@0.81.14
  - @voyant-travel/crm@0.81.14
  - @voyant-travel/extras@0.81.14
  - @voyant-travel/finance@0.81.14
  - @voyant-travel/hono@0.81.14
  - @voyant-travel/pricing@0.81.14
  - @voyant-travel/products@0.81.14
  - @voyant-travel/sellability@0.81.14

## 0.81.13

### Patch Changes

- 28dca55: Apply active departure price overrides to storefront departure pricing, price previews, and booking session repricing.
- Updated dependencies [28dca55]
- Updated dependencies [ad95d4c]
  - @voyant-travel/availability@0.81.13
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/crm@0.81.13
  - @voyant-travel/extras@0.81.13
  - @voyant-travel/finance@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/pricing@0.81.13
  - @voyant-travel/products@0.81.13
  - @voyant-travel/sellability@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/availability@0.81.12
- @voyant-travel/bookings@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/crm@0.81.12
- @voyant-travel/extras@0.81.12
- @voyant-travel/finance@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/pricing@0.81.12
- @voyant-travel/products@0.81.12
- @voyant-travel/sellability@0.81.12

## 0.81.11

### Patch Changes

- Updated dependencies [ef079f4]
  - @voyant-travel/availability@0.81.11
  - @voyant-travel/bookings@0.81.11
  - @voyant-travel/core@0.81.11
  - @voyant-travel/crm@0.81.11
  - @voyant-travel/extras@0.81.11
  - @voyant-travel/finance@0.81.11
  - @voyant-travel/hono@0.81.11
  - @voyant-travel/pricing@0.81.11
  - @voyant-travel/products@0.81.11
  - @voyant-travel/sellability@0.81.11

## 0.81.10

### Patch Changes

- Updated dependencies [6c6a008]
  - @voyant-travel/availability@0.81.10
  - @voyant-travel/bookings@0.81.10
  - @voyant-travel/core@0.81.10
  - @voyant-travel/crm@0.81.10
  - @voyant-travel/extras@0.81.10
  - @voyant-travel/finance@0.81.10
  - @voyant-travel/hono@0.81.10
  - @voyant-travel/pricing@0.81.10
  - @voyant-travel/products@0.81.10
  - @voyant-travel/sellability@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/availability@0.81.9
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/crm@0.81.9
  - @voyant-travel/extras@0.81.9
  - @voyant-travel/finance@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/pricing@0.81.9
  - @voyant-travel/products@0.81.9
  - @voyant-travel/sellability@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/availability@0.81.8
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/crm@0.81.8
  - @voyant-travel/extras@0.81.8
  - @voyant-travel/finance@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/pricing@0.81.8
  - @voyant-travel/products@0.81.8
  - @voyant-travel/sellability@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/availability@0.81.7
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/crm@0.81.7
  - @voyant-travel/extras@0.81.7
  - @voyant-travel/finance@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/pricing@0.81.7
  - @voyant-travel/products@0.81.7
  - @voyant-travel/sellability@0.81.7

## 0.81.6

### Patch Changes

- Updated dependencies [f92c593]
  - @voyant-travel/availability@0.81.6
  - @voyant-travel/bookings@0.81.6
  - @voyant-travel/core@0.81.6
  - @voyant-travel/crm@0.81.6
  - @voyant-travel/extras@0.81.6
  - @voyant-travel/finance@0.81.6
  - @voyant-travel/hono@0.81.6
  - @voyant-travel/pricing@0.81.6
  - @voyant-travel/products@0.81.6
  - @voyant-travel/sellability@0.81.6

## 0.81.5

### Patch Changes

- Updated dependencies [7d8a977]
  - @voyant-travel/availability@0.81.5
  - @voyant-travel/bookings@0.81.5
  - @voyant-travel/core@0.81.5
  - @voyant-travel/crm@0.81.5
  - @voyant-travel/extras@0.81.5
  - @voyant-travel/finance@0.81.5
  - @voyant-travel/hono@0.81.5
  - @voyant-travel/pricing@0.81.5
  - @voyant-travel/products@0.81.5
  - @voyant-travel/sellability@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/availability@0.81.4
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/crm@0.81.4
  - @voyant-travel/extras@0.81.4
  - @voyant-travel/finance@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/pricing@0.81.4
  - @voyant-travel/products@0.81.4
  - @voyant-travel/sellability@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/availability@0.81.3
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/crm@0.81.3
  - @voyant-travel/extras@0.81.3
  - @voyant-travel/finance@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/pricing@0.81.3
  - @voyant-travel/products@0.81.3
  - @voyant-travel/sellability@0.81.3

## 0.81.2

### Patch Changes

- Updated dependencies [6ca8aa8]
  - @voyant-travel/availability@0.81.2
  - @voyant-travel/bookings@0.81.2
  - @voyant-travel/core@0.81.2
  - @voyant-travel/crm@0.81.2
  - @voyant-travel/extras@0.81.2
  - @voyant-travel/finance@0.81.2
  - @voyant-travel/hono@0.81.2
  - @voyant-travel/pricing@0.81.2
  - @voyant-travel/products@0.81.2
  - @voyant-travel/sellability@0.81.2

## 0.81.1

### Patch Changes

- Updated dependencies [2ce08ff]
  - @voyant-travel/availability@0.81.1
  - @voyant-travel/bookings@0.81.1
  - @voyant-travel/core@0.81.1
  - @voyant-travel/crm@0.81.1
  - @voyant-travel/extras@0.81.1
  - @voyant-travel/finance@0.81.1
  - @voyant-travel/hono@0.81.1
  - @voyant-travel/pricing@0.81.1
  - @voyant-travel/products@0.81.1
  - @voyant-travel/sellability@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/availability@0.81.0
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/crm@0.81.0
  - @voyant-travel/extras@0.81.0
  - @voyant-travel/finance@0.81.0
  - @voyant-travel/hono@0.81.0
  - @voyant-travel/pricing@0.81.0
  - @voyant-travel/products@0.81.0
  - @voyant-travel/sellability@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/availability@0.80.18
- @voyant-travel/bookings@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/crm@0.80.18
- @voyant-travel/extras@0.80.18
- @voyant-travel/finance@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/pricing@0.80.18
- @voyant-travel/products@0.80.18
- @voyant-travel/sellability@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/availability@0.80.17
- @voyant-travel/bookings@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/crm@0.80.17
- @voyant-travel/extras@0.80.17
- @voyant-travel/finance@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/pricing@0.80.17
- @voyant-travel/products@0.80.17
- @voyant-travel/sellability@0.80.17

## 0.80.16

### Patch Changes

- Updated dependencies [dbcc0da]
  - @voyant-travel/availability@0.80.16
  - @voyant-travel/bookings@0.80.16
  - @voyant-travel/core@0.80.16
  - @voyant-travel/crm@0.80.16
  - @voyant-travel/extras@0.80.16
  - @voyant-travel/finance@0.80.16
  - @voyant-travel/hono@0.80.16
  - @voyant-travel/pricing@0.80.16
  - @voyant-travel/products@0.80.16
  - @voyant-travel/sellability@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/availability@0.80.15
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/crm@0.80.15
  - @voyant-travel/extras@0.80.15
  - @voyant-travel/finance@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/pricing@0.80.15
  - @voyant-travel/products@0.80.15
  - @voyant-travel/sellability@0.80.15

## 0.80.14

### Patch Changes

- Updated dependencies [2dd6d0f]
  - @voyant-travel/availability@0.80.14
  - @voyant-travel/bookings@0.80.14
  - @voyant-travel/core@0.80.14
  - @voyant-travel/crm@0.80.14
  - @voyant-travel/extras@0.80.14
  - @voyant-travel/finance@0.80.14
  - @voyant-travel/hono@0.80.14
  - @voyant-travel/pricing@0.80.14
  - @voyant-travel/products@0.80.14
  - @voyant-travel/sellability@0.80.14

## 0.80.13

### Patch Changes

- Updated dependencies [55d99af]
  - @voyant-travel/availability@0.80.13
  - @voyant-travel/bookings@0.80.13
  - @voyant-travel/core@0.80.13
  - @voyant-travel/crm@0.80.13
  - @voyant-travel/extras@0.80.13
  - @voyant-travel/finance@0.80.13
  - @voyant-travel/hono@0.80.13
  - @voyant-travel/pricing@0.80.13
  - @voyant-travel/products@0.80.13
  - @voyant-travel/sellability@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/availability@0.80.12
- @voyant-travel/bookings@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/crm@0.80.12
- @voyant-travel/extras@0.80.12
- @voyant-travel/finance@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/pricing@0.80.12
- @voyant-travel/products@0.80.12
- @voyant-travel/sellability@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/availability@0.80.11
- @voyant-travel/bookings@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/crm@0.80.11
- @voyant-travel/extras@0.80.11
- @voyant-travel/finance@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/pricing@0.80.11
- @voyant-travel/products@0.80.11
- @voyant-travel/sellability@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/availability@0.80.10
- @voyant-travel/bookings@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/crm@0.80.10
- @voyant-travel/extras@0.80.10
- @voyant-travel/finance@0.80.10
- @voyant-travel/hono@0.80.10
- @voyant-travel/pricing@0.80.10
- @voyant-travel/products@0.80.10
- @voyant-travel/sellability@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/availability@0.80.9
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/crm@0.80.9
  - @voyant-travel/extras@0.80.9
  - @voyant-travel/finance@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/pricing@0.80.9
  - @voyant-travel/products@0.80.9
  - @voyant-travel/sellability@0.80.9

## 0.80.8

### Patch Changes

- Updated dependencies [6ba4515]
  - @voyant-travel/availability@0.80.8
  - @voyant-travel/bookings@0.80.8
  - @voyant-travel/core@0.80.8
  - @voyant-travel/crm@0.80.8
  - @voyant-travel/extras@0.80.8
  - @voyant-travel/finance@0.80.8
  - @voyant-travel/hono@0.80.8
  - @voyant-travel/pricing@0.80.8
  - @voyant-travel/products@0.80.8
  - @voyant-travel/sellability@0.80.8

## 0.80.7

### Patch Changes

- Updated dependencies [e16eb2f]
  - @voyant-travel/availability@0.80.7
  - @voyant-travel/bookings@0.80.7
  - @voyant-travel/core@0.80.7
  - @voyant-travel/crm@0.80.7
  - @voyant-travel/extras@0.80.7
  - @voyant-travel/finance@0.80.7
  - @voyant-travel/hono@0.80.7
  - @voyant-travel/pricing@0.80.7
  - @voyant-travel/products@0.80.7
  - @voyant-travel/sellability@0.80.7

## 0.80.6

### Patch Changes

- Updated dependencies [f7df51b]
  - @voyant-travel/availability@0.80.6
  - @voyant-travel/bookings@0.80.6
  - @voyant-travel/core@0.80.6
  - @voyant-travel/crm@0.80.6
  - @voyant-travel/extras@0.80.6
  - @voyant-travel/finance@0.80.6
  - @voyant-travel/hono@0.80.6
  - @voyant-travel/pricing@0.80.6
  - @voyant-travel/products@0.80.6
  - @voyant-travel/sellability@0.80.6

## 0.80.5

### Patch Changes

- Updated dependencies [f27b01f]
- Updated dependencies [d1ae342]
  - @voyant-travel/availability@0.80.5
  - @voyant-travel/bookings@0.80.5
  - @voyant-travel/core@0.80.5
  - @voyant-travel/crm@0.80.5
  - @voyant-travel/extras@0.80.5
  - @voyant-travel/finance@0.80.5
  - @voyant-travel/hono@0.80.5
  - @voyant-travel/pricing@0.80.5
  - @voyant-travel/products@0.80.5
  - @voyant-travel/sellability@0.80.5

## 0.80.4

### Patch Changes

- Updated dependencies [a411b1c]
  - @voyant-travel/availability@0.80.4
  - @voyant-travel/bookings@0.80.4
  - @voyant-travel/core@0.80.4
  - @voyant-travel/crm@0.80.4
  - @voyant-travel/extras@0.80.4
  - @voyant-travel/finance@0.80.4
  - @voyant-travel/hono@0.80.4
  - @voyant-travel/pricing@0.80.4
  - @voyant-travel/products@0.80.4
  - @voyant-travel/sellability@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/availability@0.80.3
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/crm@0.80.3
  - @voyant-travel/extras@0.80.3
  - @voyant-travel/finance@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/pricing@0.80.3
  - @voyant-travel/products@0.80.3
  - @voyant-travel/sellability@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/availability@0.80.2
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/crm@0.80.2
  - @voyant-travel/extras@0.80.2
  - @voyant-travel/finance@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/pricing@0.80.2
  - @voyant-travel/products@0.80.2
  - @voyant-travel/sellability@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/availability@0.80.1
- @voyant-travel/bookings@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/crm@0.80.1
- @voyant-travel/extras@0.80.1
- @voyant-travel/finance@0.80.1
- @voyant-travel/hono@0.80.1
- @voyant-travel/pricing@0.80.1
- @voyant-travel/products@0.80.1
- @voyant-travel/sellability@0.80.1

## 0.80.0

### Patch Changes

- Updated dependencies [9473eb8]
  - @voyant-travel/availability@0.80.0
  - @voyant-travel/bookings@0.80.0
  - @voyant-travel/core@0.80.0
  - @voyant-travel/crm@0.80.0
  - @voyant-travel/extras@0.80.0
  - @voyant-travel/finance@0.80.0
  - @voyant-travel/hono@0.80.0
  - @voyant-travel/pricing@0.80.0
  - @voyant-travel/products@0.80.0
  - @voyant-travel/sellability@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/availability@0.79.0
- @voyant-travel/bookings@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/crm@0.79.0
- @voyant-travel/extras@0.79.0
- @voyant-travel/finance@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/pricing@0.79.0
- @voyant-travel/products@0.79.0
- @voyant-travel/sellability@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/availability@0.78.0
- @voyant-travel/bookings@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/crm@0.78.0
- @voyant-travel/extras@0.78.0
- @voyant-travel/finance@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/pricing@0.78.0
- @voyant-travel/products@0.78.0
- @voyant-travel/sellability@0.78.0

## 0.77.13

### Patch Changes

- Updated dependencies [70a32ab]
  - @voyant-travel/availability@0.77.13
  - @voyant-travel/bookings@0.77.13
  - @voyant-travel/core@0.77.13
  - @voyant-travel/crm@0.77.13
  - @voyant-travel/extras@0.77.13
  - @voyant-travel/finance@0.77.13
  - @voyant-travel/hono@0.77.13
  - @voyant-travel/pricing@0.77.13
  - @voyant-travel/products@0.77.13
  - @voyant-travel/sellability@0.77.13

## 0.77.12

### Patch Changes

- Updated dependencies [bf74cd4]
  - @voyant-travel/availability@0.77.12
  - @voyant-travel/bookings@0.77.12
  - @voyant-travel/core@0.77.12
  - @voyant-travel/crm@0.77.12
  - @voyant-travel/extras@0.77.12
  - @voyant-travel/finance@0.77.12
  - @voyant-travel/hono@0.77.12
  - @voyant-travel/pricing@0.77.12
  - @voyant-travel/products@0.77.12
  - @voyant-travel/sellability@0.77.12

## 0.77.11

### Patch Changes

- Updated dependencies [437fb58]
  - @voyant-travel/availability@0.77.11
  - @voyant-travel/bookings@0.77.11
  - @voyant-travel/core@0.77.11
  - @voyant-travel/crm@0.77.11
  - @voyant-travel/extras@0.77.11
  - @voyant-travel/finance@0.77.11
  - @voyant-travel/hono@0.77.11
  - @voyant-travel/pricing@0.77.11
  - @voyant-travel/products@0.77.11
  - @voyant-travel/sellability@0.77.11

## 0.77.10

### Patch Changes

- Updated dependencies [5751c4e]
  - @voyant-travel/availability@0.77.10
  - @voyant-travel/bookings@0.77.10
  - @voyant-travel/core@0.77.10
  - @voyant-travel/crm@0.77.10
  - @voyant-travel/extras@0.77.10
  - @voyant-travel/finance@0.77.10
  - @voyant-travel/hono@0.77.10
  - @voyant-travel/pricing@0.77.10
  - @voyant-travel/products@0.77.10
  - @voyant-travel/sellability@0.77.10

## 0.77.9

### Patch Changes

- Updated dependencies [10e3ed5]
  - @voyant-travel/availability@0.77.9
  - @voyant-travel/bookings@0.77.9
  - @voyant-travel/core@0.77.9
  - @voyant-travel/crm@0.77.9
  - @voyant-travel/extras@0.77.9
  - @voyant-travel/finance@0.77.9
  - @voyant-travel/hono@0.77.9
  - @voyant-travel/pricing@0.77.9
  - @voyant-travel/products@0.77.9
  - @voyant-travel/sellability@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/availability@0.77.8
- @voyant-travel/bookings@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/crm@0.77.8
- @voyant-travel/extras@0.77.8
- @voyant-travel/finance@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/pricing@0.77.8
- @voyant-travel/products@0.77.8
- @voyant-travel/sellability@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/availability@0.77.7
- @voyant-travel/bookings@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/crm@0.77.7
- @voyant-travel/extras@0.77.7
- @voyant-travel/finance@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/pricing@0.77.7
- @voyant-travel/products@0.77.7
- @voyant-travel/sellability@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/availability@0.77.6
- @voyant-travel/bookings@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/crm@0.77.6
- @voyant-travel/extras@0.77.6
- @voyant-travel/finance@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/pricing@0.77.6
- @voyant-travel/products@0.77.6
- @voyant-travel/sellability@0.77.6

## 0.77.5

### Patch Changes

- Updated dependencies [6e522cb]
  - @voyant-travel/availability@0.77.5
  - @voyant-travel/bookings@0.77.5
  - @voyant-travel/core@0.77.5
  - @voyant-travel/crm@0.77.5
  - @voyant-travel/extras@0.77.5
  - @voyant-travel/finance@0.77.5
  - @voyant-travel/hono@0.77.5
  - @voyant-travel/pricing@0.77.5
  - @voyant-travel/products@0.77.5
  - @voyant-travel/sellability@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/availability@0.77.4
- @voyant-travel/bookings@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/crm@0.77.4
- @voyant-travel/extras@0.77.4
- @voyant-travel/finance@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/pricing@0.77.4
- @voyant-travel/products@0.77.4
- @voyant-travel/sellability@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/availability@0.77.3
- @voyant-travel/bookings@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/crm@0.77.3
- @voyant-travel/extras@0.77.3
- @voyant-travel/finance@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/pricing@0.77.3
- @voyant-travel/products@0.77.3
- @voyant-travel/sellability@0.77.3

## 0.77.2

### Patch Changes

- Updated dependencies [04039ff]
  - @voyant-travel/availability@0.77.2
  - @voyant-travel/bookings@0.77.2
  - @voyant-travel/core@0.77.2
  - @voyant-travel/crm@0.77.2
  - @voyant-travel/extras@0.77.2
  - @voyant-travel/finance@0.77.2
  - @voyant-travel/hono@0.77.2
  - @voyant-travel/pricing@0.77.2
  - @voyant-travel/products@0.77.2
  - @voyant-travel/sellability@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/availability@0.77.1
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/crm@0.77.1
  - @voyant-travel/extras@0.77.1
  - @voyant-travel/finance@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/pricing@0.77.1
  - @voyant-travel/products@0.77.1
  - @voyant-travel/sellability@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/availability@0.77.0
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/crm@0.77.0
  - @voyant-travel/extras@0.77.0
  - @voyant-travel/finance@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/pricing@0.77.0
  - @voyant-travel/products@0.77.0
  - @voyant-travel/sellability@0.77.0

## 0.76.0

### Patch Changes

- Updated dependencies [abf673d]
  - @voyant-travel/availability@0.76.0
  - @voyant-travel/bookings@0.76.0
  - @voyant-travel/core@0.76.0
  - @voyant-travel/crm@0.76.0
  - @voyant-travel/extras@0.76.0
  - @voyant-travel/finance@0.76.0
  - @voyant-travel/hono@0.76.0
  - @voyant-travel/pricing@0.76.0
  - @voyant-travel/products@0.76.0
  - @voyant-travel/sellability@0.76.0

## 0.75.7

### Patch Changes

- Updated dependencies [827c25e]
  - @voyant-travel/availability@0.75.7
  - @voyant-travel/bookings@0.75.7
  - @voyant-travel/core@0.75.7
  - @voyant-travel/crm@0.75.7
  - @voyant-travel/extras@0.75.7
  - @voyant-travel/finance@0.75.7
  - @voyant-travel/hono@0.75.7
  - @voyant-travel/pricing@0.75.7
  - @voyant-travel/products@0.75.7
  - @voyant-travel/sellability@0.75.7

## 0.75.6

### Patch Changes

- Updated dependencies [347fbd2]
  - @voyant-travel/availability@0.75.6
  - @voyant-travel/bookings@0.75.6
  - @voyant-travel/core@0.75.6
  - @voyant-travel/crm@0.75.6
  - @voyant-travel/extras@0.75.6
  - @voyant-travel/finance@0.75.6
  - @voyant-travel/hono@0.75.6
  - @voyant-travel/pricing@0.75.6
  - @voyant-travel/products@0.75.6
  - @voyant-travel/sellability@0.75.6

## 0.75.5

### Patch Changes

- Updated dependencies [84a32bb]
- Updated dependencies [192c9aa]
  - @voyant-travel/availability@0.75.5
  - @voyant-travel/bookings@0.75.5
  - @voyant-travel/core@0.75.5
  - @voyant-travel/crm@0.75.5
  - @voyant-travel/extras@0.75.5
  - @voyant-travel/finance@0.75.5
  - @voyant-travel/hono@0.75.5
  - @voyant-travel/pricing@0.75.5
  - @voyant-travel/products@0.75.5
  - @voyant-travel/sellability@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/availability@0.75.4
- @voyant-travel/bookings@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/crm@0.75.4
- @voyant-travel/extras@0.75.4
- @voyant-travel/finance@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/pricing@0.75.4
- @voyant-travel/products@0.75.4
- @voyant-travel/sellability@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/availability@0.75.3
- @voyant-travel/bookings@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/crm@0.75.3
- @voyant-travel/extras@0.75.3
- @voyant-travel/finance@0.75.3
- @voyant-travel/hono@0.75.3
- @voyant-travel/pricing@0.75.3
- @voyant-travel/products@0.75.3
- @voyant-travel/sellability@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/availability@0.75.2
- @voyant-travel/bookings@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/crm@0.75.2
- @voyant-travel/extras@0.75.2
- @voyant-travel/finance@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/pricing@0.75.2
- @voyant-travel/products@0.75.2
- @voyant-travel/sellability@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/availability@0.75.1
- @voyant-travel/bookings@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/crm@0.75.1
- @voyant-travel/extras@0.75.1
- @voyant-travel/finance@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/pricing@0.75.1
- @voyant-travel/products@0.75.1
- @voyant-travel/sellability@0.75.1

## 0.75.0

### Minor Changes

- 1eab599: Add guest booking lookup with scoped access capabilities for public booking overview pages.

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/availability@0.75.0
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/crm@0.75.0
  - @voyant-travel/extras@0.75.0
  - @voyant-travel/finance@0.75.0
  - @voyant-travel/hono@0.75.0
  - @voyant-travel/pricing@0.75.0
  - @voyant-travel/products@0.75.0
  - @voyant-travel/sellability@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/availability@0.74.2
- @voyant-travel/bookings@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/crm@0.74.2
- @voyant-travel/extras@0.74.2
- @voyant-travel/finance@0.74.2
- @voyant-travel/hono@0.74.2
- @voyant-travel/pricing@0.74.2
- @voyant-travel/products@0.74.2
- @voyant-travel/sellability@0.74.2

## 0.74.1

### Patch Changes

- Updated dependencies [225a483]
  - @voyant-travel/availability@0.74.1
  - @voyant-travel/bookings@0.74.1
  - @voyant-travel/core@0.74.1
  - @voyant-travel/crm@0.74.1
  - @voyant-travel/extras@0.74.1
  - @voyant-travel/finance@0.74.1
  - @voyant-travel/hono@0.74.1
  - @voyant-travel/pricing@0.74.1
  - @voyant-travel/products@0.74.1
  - @voyant-travel/sellability@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/availability@0.74.0
- @voyant-travel/bookings@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/crm@0.74.0
- @voyant-travel/extras@0.74.0
- @voyant-travel/finance@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/pricing@0.74.0
- @voyant-travel/products@0.74.0
- @voyant-travel/sellability@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/availability@0.73.1
- @voyant-travel/bookings@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/crm@0.73.1
- @voyant-travel/extras@0.73.1
- @voyant-travel/finance@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/pricing@0.73.1
- @voyant-travel/products@0.73.1
- @voyant-travel/sellability@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/availability@0.73.0
- @voyant-travel/bookings@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/crm@0.73.0
- @voyant-travel/extras@0.73.0
- @voyant-travel/finance@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/pricing@0.73.0
- @voyant-travel/products@0.73.0
- @voyant-travel/sellability@0.73.0

## 0.72.0

### Patch Changes

- Updated dependencies [6a66b2b]
  - @voyant-travel/availability@0.72.0
  - @voyant-travel/bookings@0.72.0
  - @voyant-travel/core@0.72.0
  - @voyant-travel/crm@0.72.0
  - @voyant-travel/extras@0.72.0
  - @voyant-travel/finance@0.72.0
  - @voyant-travel/hono@0.72.0
  - @voyant-travel/pricing@0.72.0
  - @voyant-travel/products@0.72.0
  - @voyant-travel/sellability@0.72.0

## 0.71.0

### Patch Changes

- Updated dependencies [9bdc9a6]
  - @voyant-travel/availability@0.71.0
  - @voyant-travel/bookings@0.71.0
  - @voyant-travel/core@0.71.0
  - @voyant-travel/crm@0.71.0
  - @voyant-travel/extras@0.71.0
  - @voyant-travel/finance@0.71.0
  - @voyant-travel/hono@0.71.0
  - @voyant-travel/pricing@0.71.0
  - @voyant-travel/products@0.71.0
  - @voyant-travel/sellability@0.71.0

## 0.70.0

### Patch Changes

- Updated dependencies [09d5f82]
  - @voyant-travel/availability@0.70.0
  - @voyant-travel/bookings@0.70.0
  - @voyant-travel/core@0.70.0
  - @voyant-travel/crm@0.70.0
  - @voyant-travel/extras@0.70.0
  - @voyant-travel/finance@0.70.0
  - @voyant-travel/hono@0.70.0
  - @voyant-travel/pricing@0.70.0
  - @voyant-travel/products@0.70.0
  - @voyant-travel/sellability@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/availability@0.69.1
- @voyant-travel/bookings@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/crm@0.69.1
- @voyant-travel/extras@0.69.1
- @voyant-travel/finance@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/pricing@0.69.1
- @voyant-travel/products@0.69.1
- @voyant-travel/sellability@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/availability@0.69.0
- @voyant-travel/bookings@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/crm@0.69.0
- @voyant-travel/extras@0.69.0
- @voyant-travel/finance@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/pricing@0.69.0
- @voyant-travel/products@0.69.0
- @voyant-travel/sellability@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/availability@0.68.0
- @voyant-travel/bookings@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/crm@0.68.0
- @voyant-travel/extras@0.68.0
- @voyant-travel/finance@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/pricing@0.68.0
- @voyant-travel/products@0.68.0
- @voyant-travel/sellability@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/availability@0.67.0
- @voyant-travel/bookings@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/crm@0.67.0
- @voyant-travel/extras@0.67.0
- @voyant-travel/finance@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/pricing@0.67.0
- @voyant-travel/products@0.67.0
- @voyant-travel/sellability@0.67.0

## 0.66.6

### Patch Changes

- Updated dependencies [2a40d26]
- Updated dependencies [f6634ff]
  - @voyant-travel/availability@0.66.6
  - @voyant-travel/bookings@0.66.6
  - @voyant-travel/core@0.66.6
  - @voyant-travel/crm@0.66.6
  - @voyant-travel/extras@0.66.6
  - @voyant-travel/finance@0.66.6
  - @voyant-travel/hono@0.66.6
  - @voyant-travel/pricing@0.66.6
  - @voyant-travel/products@0.66.6
  - @voyant-travel/sellability@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/availability@0.66.5
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/crm@0.66.5
  - @voyant-travel/extras@0.66.5
  - @voyant-travel/finance@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/pricing@0.66.5
  - @voyant-travel/products@0.66.5
  - @voyant-travel/sellability@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/availability@0.66.4
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/crm@0.66.4
  - @voyant-travel/extras@0.66.4
  - @voyant-travel/finance@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/pricing@0.66.4
  - @voyant-travel/products@0.66.4
  - @voyant-travel/sellability@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/availability@0.66.3
- @voyant-travel/bookings@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/crm@0.66.3
- @voyant-travel/extras@0.66.3
- @voyant-travel/finance@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/pricing@0.66.3
- @voyant-travel/products@0.66.3
- @voyant-travel/sellability@0.66.3

## 0.66.2

### Patch Changes

- Updated dependencies [3608633]
  - @voyant-travel/availability@0.66.2
  - @voyant-travel/bookings@0.66.2
  - @voyant-travel/core@0.66.2
  - @voyant-travel/crm@0.66.2
  - @voyant-travel/extras@0.66.2
  - @voyant-travel/finance@0.66.2
  - @voyant-travel/hono@0.66.2
  - @voyant-travel/pricing@0.66.2
  - @voyant-travel/products@0.66.2
  - @voyant-travel/sellability@0.66.2

## 0.66.1

### Patch Changes

- e0b94f3: Fix storefront departure price previews so required adult person units are considered when mapping traveler pax to option units.
  - @voyant-travel/availability@0.66.1
  - @voyant-travel/bookings@0.66.1
  - @voyant-travel/core@0.66.1
  - @voyant-travel/crm@0.66.1
  - @voyant-travel/extras@0.66.1
  - @voyant-travel/finance@0.66.1
  - @voyant-travel/hono@0.66.1
  - @voyant-travel/pricing@0.66.1
  - @voyant-travel/products@0.66.1
  - @voyant-travel/sellability@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/availability@0.66.0
- @voyant-travel/bookings@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/crm@0.66.0
- @voyant-travel/extras@0.66.0
- @voyant-travel/finance@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/pricing@0.66.0
- @voyant-travel/products@0.66.0
- @voyant-travel/sellability@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/availability@0.65.0
- @voyant-travel/bookings@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/crm@0.65.0
- @voyant-travel/extras@0.65.0
- @voyant-travel/finance@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/pricing@0.65.0
- @voyant-travel/products@0.65.0
- @voyant-travel/sellability@0.65.0

## 0.64.1

### Patch Changes

- Updated dependencies [572dde4]
  - @voyant-travel/availability@0.64.1
  - @voyant-travel/bookings@0.64.1
  - @voyant-travel/core@0.64.1
  - @voyant-travel/crm@0.64.1
  - @voyant-travel/extras@0.64.1
  - @voyant-travel/finance@0.64.1
  - @voyant-travel/hono@0.64.1
  - @voyant-travel/pricing@0.64.1
  - @voyant-travel/products@0.64.1
  - @voyant-travel/sellability@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/availability@0.64.0
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/crm@0.64.0
  - @voyant-travel/extras@0.64.0
  - @voyant-travel/finance@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/pricing@0.64.0
  - @voyant-travel/products@0.64.0
  - @voyant-travel/sellability@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/availability@0.63.1
- @voyant-travel/bookings@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/crm@0.63.1
- @voyant-travel/extras@0.63.1
- @voyant-travel/finance@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/pricing@0.63.1
- @voyant-travel/products@0.63.1
- @voyant-travel/sellability@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
  - @voyant-travel/availability@0.63.0
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/crm@0.63.0
  - @voyant-travel/extras@0.63.0
  - @voyant-travel/finance@0.63.0
  - @voyant-travel/hono@0.63.0
  - @voyant-travel/pricing@0.63.0
  - @voyant-travel/products@0.63.0
  - @voyant-travel/sellability@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/availability@0.62.3
- @voyant-travel/bookings@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/crm@0.62.3
- @voyant-travel/extras@0.62.3
- @voyant-travel/finance@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/pricing@0.62.3
- @voyant-travel/products@0.62.3
- @voyant-travel/sellability@0.62.3

## 0.62.2

### Patch Changes

- Updated dependencies [4a87635]
  - @voyant-travel/availability@0.62.2
  - @voyant-travel/bookings@0.62.2
  - @voyant-travel/core@0.62.2
  - @voyant-travel/crm@0.62.2
  - @voyant-travel/extras@0.62.2
  - @voyant-travel/finance@0.62.2
  - @voyant-travel/hono@0.62.2
  - @voyant-travel/pricing@0.62.2
  - @voyant-travel/products@0.62.2
  - @voyant-travel/sellability@0.62.2

## 0.62.1

### Patch Changes

- Updated dependencies [ebbeab8]
  - @voyant-travel/availability@0.62.1
  - @voyant-travel/bookings@0.62.1
  - @voyant-travel/core@0.62.1
  - @voyant-travel/crm@0.62.1
  - @voyant-travel/extras@0.62.1
  - @voyant-travel/finance@0.62.1
  - @voyant-travel/hono@0.62.1
  - @voyant-travel/pricing@0.62.1
  - @voyant-travel/products@0.62.1
  - @voyant-travel/sellability@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/availability@0.62.0
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/crm@0.62.0
  - @voyant-travel/extras@0.62.0
  - @voyant-travel/finance@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/pricing@0.62.0
  - @voyant-travel/products@0.62.0
  - @voyant-travel/sellability@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [89f033e]
  - @voyant-travel/availability@0.61.0
  - @voyant-travel/bookings@0.61.0
  - @voyant-travel/core@0.61.0
  - @voyant-travel/crm@0.61.0
  - @voyant-travel/extras@0.61.0
  - @voyant-travel/finance@0.61.0
  - @voyant-travel/hono@0.61.0
  - @voyant-travel/pricing@0.61.0
  - @voyant-travel/products@0.61.0
  - @voyant-travel/sellability@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/availability@0.60.0
- @voyant-travel/bookings@0.60.0
- @voyant-travel/core@0.60.0
- @voyant-travel/crm@0.60.0
- @voyant-travel/extras@0.60.0
- @voyant-travel/finance@0.60.0
- @voyant-travel/hono@0.60.0
- @voyant-travel/pricing@0.60.0
- @voyant-travel/products@0.60.0
- @voyant-travel/sellability@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/availability@0.59.0
  - @voyant-travel/bookings@0.59.0
  - @voyant-travel/core@0.59.0
  - @voyant-travel/crm@0.59.0
  - @voyant-travel/extras@0.59.0
  - @voyant-travel/finance@0.59.0
  - @voyant-travel/hono@0.59.0
  - @voyant-travel/pricing@0.59.0
  - @voyant-travel/products@0.59.0
  - @voyant-travel/sellability@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/availability@0.58.0
- @voyant-travel/bookings@0.58.0
- @voyant-travel/core@0.58.0
- @voyant-travel/crm@0.58.0
- @voyant-travel/extras@0.58.0
- @voyant-travel/finance@0.58.0
- @voyant-travel/hono@0.58.0
- @voyant-travel/pricing@0.58.0
- @voyant-travel/products@0.58.0
- @voyant-travel/sellability@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/availability@0.57.0
- @voyant-travel/bookings@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/crm@0.57.0
- @voyant-travel/extras@0.57.0
- @voyant-travel/finance@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/pricing@0.57.0
- @voyant-travel/products@0.57.0
- @voyant-travel/sellability@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/availability@0.56.0
- @voyant-travel/bookings@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/crm@0.56.0
- @voyant-travel/extras@0.56.0
- @voyant-travel/finance@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/pricing@0.56.0
- @voyant-travel/products@0.56.0
- @voyant-travel/sellability@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/availability@0.55.1
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/crm@0.55.1
  - @voyant-travel/extras@0.55.1
  - @voyant-travel/finance@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/pricing@0.55.1
  - @voyant-travel/products@0.55.1
  - @voyant-travel/sellability@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/availability@0.55.0
- @voyant-travel/bookings@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/crm@0.55.0
- @voyant-travel/extras@0.55.0
- @voyant-travel/finance@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/pricing@0.55.0
- @voyant-travel/products@0.55.0
- @voyant-travel/sellability@0.55.0

## 0.54.0

### Patch Changes

- Updated dependencies [3117d27]
  - @voyant-travel/availability@0.54.0
  - @voyant-travel/bookings@0.54.0
  - @voyant-travel/core@0.54.0
  - @voyant-travel/crm@0.54.0
  - @voyant-travel/extras@0.54.0
  - @voyant-travel/finance@0.54.0
  - @voyant-travel/hono@0.54.0
  - @voyant-travel/pricing@0.54.0
  - @voyant-travel/products@0.54.0
  - @voyant-travel/sellability@0.54.0

## 0.53.2

### Patch Changes

- Updated dependencies [fc3bc6f]
  - @voyant-travel/availability@0.53.2
  - @voyant-travel/bookings@0.53.2
  - @voyant-travel/core@0.53.2
  - @voyant-travel/crm@0.53.2
  - @voyant-travel/extras@0.53.2
  - @voyant-travel/finance@0.53.2
  - @voyant-travel/hono@0.53.2
  - @voyant-travel/pricing@0.53.2
  - @voyant-travel/products@0.53.2
  - @voyant-travel/sellability@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/availability@0.53.1
- @voyant-travel/bookings@0.53.1
- @voyant-travel/core@0.53.1
- @voyant-travel/crm@0.53.1
- @voyant-travel/extras@0.53.1
- @voyant-travel/finance@0.53.1
- @voyant-travel/hono@0.53.1
- @voyant-travel/pricing@0.53.1
- @voyant-travel/products@0.53.1
- @voyant-travel/sellability@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/availability@0.53.0
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/crm@0.53.0
  - @voyant-travel/extras@0.53.0
  - @voyant-travel/finance@0.53.0
  - @voyant-travel/hono@0.53.0
  - @voyant-travel/pricing@0.53.0
  - @voyant-travel/products@0.53.0
  - @voyant-travel/sellability@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/availability@0.52.4
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/crm@0.52.4
  - @voyant-travel/extras@0.52.4
  - @voyant-travel/finance@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/pricing@0.52.4
  - @voyant-travel/products@0.52.4
  - @voyant-travel/sellability@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/availability@0.52.3
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/crm@0.52.3
  - @voyant-travel/extras@0.52.3
  - @voyant-travel/finance@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/pricing@0.52.3
  - @voyant-travel/products@0.52.3
  - @voyant-travel/sellability@0.52.3

## 0.52.2

### Patch Changes

- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
  - @voyant-travel/availability@0.52.2
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/crm@0.52.2
  - @voyant-travel/extras@0.52.2
  - @voyant-travel/finance@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/pricing@0.52.2
  - @voyant-travel/products@0.52.2
  - @voyant-travel/sellability@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/availability@0.52.1
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/crm@0.52.1
  - @voyant-travel/extras@0.52.1
  - @voyant-travel/finance@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/pricing@0.52.1
  - @voyant-travel/products@0.52.1
  - @voyant-travel/sellability@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/availability@0.52.0
- @voyant-travel/bookings@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/crm@0.52.0
- @voyant-travel/extras@0.52.0
- @voyant-travel/finance@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/pricing@0.52.0
- @voyant-travel/products@0.52.0
- @voyant-travel/sellability@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/availability@0.51.1
- @voyant-travel/bookings@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/crm@0.51.1
- @voyant-travel/extras@0.51.1
- @voyant-travel/finance@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/pricing@0.51.1
- @voyant-travel/products@0.51.1
- @voyant-travel/sellability@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/availability@0.51.0
- @voyant-travel/bookings@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/crm@0.51.0
- @voyant-travel/extras@0.51.0
- @voyant-travel/finance@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/pricing@0.51.0
- @voyant-travel/products@0.51.0
- @voyant-travel/sellability@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/availability@0.50.8
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/crm@0.50.8
  - @voyant-travel/extras@0.50.8
  - @voyant-travel/finance@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/pricing@0.50.8
  - @voyant-travel/products@0.50.8
  - @voyant-travel/sellability@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/availability@0.50.7
- @voyant-travel/bookings@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/crm@0.50.7
- @voyant-travel/extras@0.50.7
- @voyant-travel/finance@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/pricing@0.50.7
- @voyant-travel/products@0.50.7
- @voyant-travel/sellability@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/availability@0.50.6
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/crm@0.50.6
  - @voyant-travel/extras@0.50.6
  - @voyant-travel/finance@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/pricing@0.50.6
  - @voyant-travel/products@0.50.6
  - @voyant-travel/sellability@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/availability@0.50.5
- @voyant-travel/bookings@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/crm@0.50.5
- @voyant-travel/extras@0.50.5
- @voyant-travel/finance@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/pricing@0.50.5
- @voyant-travel/products@0.50.5
- @voyant-travel/sellability@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/availability@0.50.4
- @voyant-travel/bookings@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/crm@0.50.4
- @voyant-travel/extras@0.50.4
- @voyant-travel/finance@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/pricing@0.50.4
- @voyant-travel/products@0.50.4
- @voyant-travel/sellability@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/availability@0.50.3
- @voyant-travel/bookings@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/crm@0.50.3
- @voyant-travel/extras@0.50.3
- @voyant-travel/finance@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/pricing@0.50.3
- @voyant-travel/products@0.50.3
- @voyant-travel/sellability@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/availability@0.50.2
- @voyant-travel/bookings@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/crm@0.50.2
- @voyant-travel/extras@0.50.2
- @voyant-travel/finance@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/pricing@0.50.2
- @voyant-travel/products@0.50.2
- @voyant-travel/sellability@0.50.2

## 0.50.1

### Patch Changes

- 7b768c5: Add storefront intake SDK helpers, expand storefront payment settings with split schedules and bank-transfer account metadata, and extend finance admin aggregates with dashboard counts, totals, and filters.
- Updated dependencies [7b768c5]
  - @voyant-travel/availability@0.50.1
  - @voyant-travel/bookings@0.50.1
  - @voyant-travel/core@0.50.1
  - @voyant-travel/crm@0.50.1
  - @voyant-travel/extras@0.50.1
  - @voyant-travel/finance@0.50.1
  - @voyant-travel/hono@0.50.1
  - @voyant-travel/pricing@0.50.1
  - @voyant-travel/products@0.50.1
  - @voyant-travel/sellability@0.50.1

## 0.50.0

### Minor Changes

- bf5747e: Add a public storefront booking-session bootstrap contract at
  `POST /v1/public/bookings/sessions/bootstrap`. The route validates the selected
  departure/slot and original quote, creates the public booking session, applies a
  finance payment schedule, and returns customer-safe session, repricing,
  availability, allocation, payment plan, due schedule, and checkout capability
  state in one response.
- 875c76e: Extend the public departure price preview response with allocation, unit/room, extras, offer impact, and final totals blocks while preserving the existing simple quote fields.
- 2ca0537: Add first-class admin storefront settings routes, React hooks, and an operator settings page for branding, support, legal, localization, payment defaults, and bank transfer display details.

### Patch Changes

- @voyant-travel/availability@0.50.0
- @voyant-travel/bookings@0.50.0
- @voyant-travel/core@0.50.0
- @voyant-travel/crm@0.50.0
- @voyant-travel/extras@0.50.0
- @voyant-travel/finance@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/pricing@0.50.0
- @voyant-travel/products@0.50.0
- @voyant-travel/sellability@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/availability@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/crm@0.49.0
- @voyant-travel/extras@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/pricing@0.49.0
- @voyant-travel/products@0.49.0
- @voyant-travel/sellability@0.49.0

## 0.48.0

### Minor Changes

- 9132fcf: Add public storefront lead and newsletter intake backed by CRM customer signals, including host-owned spam guard hooks, newsletter double-opt-in callback wiring, and a documented `customer.signal.created` event.

### Patch Changes

- Updated dependencies [9132fcf]
  - @voyant-travel/availability@0.48.0
  - @voyant-travel/core@0.48.0
  - @voyant-travel/crm@0.48.0
  - @voyant-travel/extras@0.48.0
  - @voyant-travel/hono@0.48.0
  - @voyant-travel/pricing@0.48.0
  - @voyant-travel/products@0.48.0
  - @voyant-travel/sellability@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/availability@0.47.0
- @voyant-travel/core@0.47.0
- @voyant-travel/extras@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/pricing@0.47.0
- @voyant-travel/products@0.47.0
- @voyant-travel/sellability@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/availability@0.46.0
- @voyant-travel/core@0.46.0
- @voyant-travel/extras@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/pricing@0.46.0
- @voyant-travel/products@0.46.0
- @voyant-travel/sellability@0.46.0

## 0.45.0

### Minor Changes

- ed25837: Add resolver-backed transport eligibility schemas and public departure eligibility routes for passport and document rules.

### Patch Changes

- @voyant-travel/availability@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/extras@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/pricing@0.45.0
- @voyant-travel/products@0.45.0
- @voyant-travel/sellability@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/availability@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/extras@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/pricing@0.44.0
- @voyant-travel/products@0.44.0
- @voyant-travel/sellability@0.44.0

## 0.43.0

### Minor Changes

- e9241a7: Add public storefront offer apply/redeem contracts, React mutation helpers, and promotions-backed resolver support for customer-facing manual and code-gated offer flows.

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/availability@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/extras@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/pricing@0.43.0
  - @voyant-travel/products@0.43.0
  - @voyant-travel/sellability@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/availability@0.42.0
- @voyant-travel/core@0.42.0
- @voyant-travel/extras@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/pricing@0.42.0
- @voyant-travel/products@0.42.0
- @voyant-travel/sellability@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/availability@0.41.3
- @voyant-travel/core@0.41.3
- @voyant-travel/extras@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/pricing@0.41.3
- @voyant-travel/products@0.41.3
- @voyant-travel/sellability@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/availability@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/extras@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/pricing@0.41.2
- @voyant-travel/products@0.41.2
- @voyant-travel/sellability@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/availability@0.41.1
- @voyant-travel/core@0.41.1
- @voyant-travel/extras@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/pricing@0.41.1
- @voyant-travel/products@0.41.1
- @voyant-travel/sellability@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/availability@0.41.0
- @voyant-travel/core@0.41.0
- @voyant-travel/extras@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/pricing@0.41.0
- @voyant-travel/products@0.41.0
- @voyant-travel/sellability@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/availability@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/extras@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/pricing@0.40.1
- @voyant-travel/products@0.40.1
- @voyant-travel/sellability@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/availability@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/extras@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/pricing@0.40.0
- @voyant-travel/products@0.40.0
- @voyant-travel/sellability@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/availability@0.39.0
- @voyant-travel/core@0.39.0
- @voyant-travel/extras@0.39.0
- @voyant-travel/hono@0.39.0
- @voyant-travel/pricing@0.39.0
- @voyant-travel/products@0.39.0
- @voyant-travel/sellability@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/availability@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/extras@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/pricing@0.38.2
- @voyant-travel/products@0.38.2
- @voyant-travel/sellability@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/availability@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/extras@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/pricing@0.38.1
- @voyant-travel/products@0.38.1
- @voyant-travel/sellability@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/availability@0.38.0
- @voyant-travel/core@0.38.0
- @voyant-travel/extras@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/pricing@0.38.0
- @voyant-travel/products@0.38.0
- @voyant-travel/sellability@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/availability@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/extras@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/pricing@0.37.1
- @voyant-travel/products@0.37.1
- @voyant-travel/sellability@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/availability@0.37.0
- @voyant-travel/core@0.37.0
- @voyant-travel/extras@0.37.0
- @voyant-travel/hono@0.37.0
- @voyant-travel/pricing@0.37.0
- @voyant-travel/products@0.37.0
- @voyant-travel/sellability@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/availability@0.36.0
- @voyant-travel/core@0.36.0
- @voyant-travel/extras@0.36.0
- @voyant-travel/hono@0.36.0
- @voyant-travel/pricing@0.36.0
- @voyant-travel/products@0.36.0
- @voyant-travel/sellability@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/availability@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/extras@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/pricing@0.35.0
- @voyant-travel/products@0.35.0
- @voyant-travel/sellability@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [f8312f5]
  - @voyant-travel/availability@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/extras@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/pricing@0.34.0
  - @voyant-travel/products@0.34.0
  - @voyant-travel/sellability@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/availability@0.33.1
- @voyant-travel/core@0.33.1
- @voyant-travel/extras@0.33.1
- @voyant-travel/hono@0.33.1
- @voyant-travel/pricing@0.33.1
- @voyant-travel/products@0.33.1
- @voyant-travel/sellability@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/availability@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/extras@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/pricing@0.33.0
- @voyant-travel/products@0.33.0
- @voyant-travel/sellability@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/availability@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/extras@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/pricing@0.32.3
- @voyant-travel/products@0.32.3
- @voyant-travel/sellability@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/availability@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/extras@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/pricing@0.32.2
- @voyant-travel/products@0.32.2
- @voyant-travel/sellability@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/availability@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/extras@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/pricing@0.32.1
- @voyant-travel/products@0.32.1
- @voyant-travel/sellability@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/availability@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/extras@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/pricing@0.32.0
  - @voyant-travel/products@0.32.0
  - @voyant-travel/sellability@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/availability@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/extras@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/pricing@0.31.4
- @voyant-travel/products@0.31.4
- @voyant-travel/sellability@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/availability@0.31.3
- @voyant-travel/core@0.31.3
- @voyant-travel/extras@0.31.3
- @voyant-travel/hono@0.31.3
- @voyant-travel/pricing@0.31.3
- @voyant-travel/products@0.31.3
- @voyant-travel/sellability@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/availability@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/extras@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/pricing@0.31.2
  - @voyant-travel/products@0.31.2
  - @voyant-travel/sellability@0.31.2

## 0.31.1

### Patch Changes

- e96991c: Expose the selected `itineraryId` on storefront departure itinerary responses.
- Updated dependencies [00f7c4f]
  - @voyant-travel/availability@0.31.1
  - @voyant-travel/core@0.31.1
  - @voyant-travel/extras@0.31.1
  - @voyant-travel/hono@0.31.1
  - @voyant-travel/pricing@0.31.1
  - @voyant-travel/products@0.31.1
  - @voyant-travel/sellability@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/availability@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/extras@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/pricing@0.31.0
- @voyant-travel/products@0.31.0
- @voyant-travel/sellability@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/availability@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/extras@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/pricing@0.30.7
- @voyant-travel/products@0.30.7
- @voyant-travel/sellability@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/availability@0.30.6
- @voyant-travel/core@0.30.6
- @voyant-travel/extras@0.30.6
- @voyant-travel/hono@0.30.6
- @voyant-travel/pricing@0.30.6
- @voyant-travel/products@0.30.6
- @voyant-travel/sellability@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/availability@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/extras@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/pricing@0.30.5
  - @voyant-travel/products@0.30.5
  - @voyant-travel/sellability@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/availability@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/extras@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/pricing@0.30.4
- @voyant-travel/products@0.30.4
- @voyant-travel/sellability@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/availability@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/extras@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/pricing@0.30.3
  - @voyant-travel/products@0.30.3
  - @voyant-travel/sellability@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/availability@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/extras@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/pricing@0.30.2
- @voyant-travel/products@0.30.2
- @voyant-travel/sellability@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/availability@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/extras@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/pricing@0.30.1
- @voyant-travel/products@0.30.1
- @voyant-travel/sellability@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/availability@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/extras@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/pricing@0.30.0
- @voyant-travel/products@0.30.0
- @voyant-travel/sellability@0.30.0

## 0.29.0

### Patch Changes

- 3420711: Fix #501: cross-package schema init cycle that caused chunk-splitting bundlers (Vite 8 / Rolldown) to crash with `Cannot read properties of undefined (reading 'optional')` at module-evaluation time.

  Root cause: schema files in 4 packages dereferenced a Zod schema imported from another `@voyant-travel/*` package at module top level. When the bundler placed the producer (`kmsEnvelopeSchema` from `@voyant-travel/db`, `availabilitySlotStatusSchema` from `@voyant-travel/availability`, `extraPricingModeSchema` from `@voyant-travel/extras`) into a different chunk than the consumer, ESM live-binding init order didn't guarantee producer-before-consumer evaluation — the consumer hit the producer's TDZ and threw.

  Fix: wrap every cross-package top-level schema reference with `z.lazy(() => Schema)` so the schema is dereferenced at first parse rather than at module evaluation. This is the smallest change per the issue's suggested fixes (Option 1) and protects against the same hazard in any future bundler chunking.

  Sites updated:

  - `@voyant-travel/bookings/schema/travel-details` — 3 `kmsEnvelopeSchema` fields (`identityEncrypted`, `dietaryEncrypted`, `accessibilityEncrypted`)
  - `@voyant-travel/crm/validation` — 5 `kmsEnvelopeSchema` fields (`accessibilityEncrypted`, `dietaryEncrypted`, `loyaltyEncrypted`, `insuranceEncrypted`, `numberEncrypted` on personDocuments)
  - `@voyant-travel/transactions/schema/participant-identity` — 1 `kmsEnvelopeSchema` field (`identityEncrypted`)
  - `@voyant-travel/storefront/validation` — `availabilitySlotStatusSchema` + `extraPricingModeSchema` on the storefront departure / extension schemas

  Behavior unchanged: `z.lazy(fn).optional().nullable()` parses identically to `Schema.optional().nullable()` for valid and invalid payloads. Regression test in `packages/bookings/tests/unit/travel-details-schema.test.ts` asserts both the happy path (valid envelope round-trips) and the error path (empty `enc` violates the producer's `min(1)` validation) continue to work through the lazy wrap.

  No schema migration required, no behavior change for consumers — purely a build-time / module-init shape fix.

- Updated dependencies [828fee4]
- Updated dependencies [61673e1]
- Updated dependencies [11443d3]
- Updated dependencies [828fee4]
- Updated dependencies [06c2cf1]
- Updated dependencies [143f45c]
- Updated dependencies [2baf762]
- Updated dependencies [da3b6fd]
- Updated dependencies [583326e]
- Updated dependencies [db51715]
  - @voyant-travel/availability@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/extras@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/pricing@0.29.0
  - @voyant-travel/products@0.29.0
  - @voyant-travel/sellability@0.29.0

## 0.28.3

### Patch Changes

- Updated dependencies [60ef432]
  - @voyant-travel/availability@0.28.3
  - @voyant-travel/core@0.28.3
  - @voyant-travel/extras@0.28.3
  - @voyant-travel/hono@0.28.3
  - @voyant-travel/pricing@0.28.3
  - @voyant-travel/products@0.28.3
  - @voyant-travel/sellability@0.28.3

## 0.28.2

### Patch Changes

- Updated dependencies [4549ebc]
  - @voyant-travel/availability@0.28.2
  - @voyant-travel/core@0.28.2
  - @voyant-travel/extras@0.28.2
  - @voyant-travel/hono@0.28.2
  - @voyant-travel/pricing@0.28.2
  - @voyant-travel/products@0.28.2
  - @voyant-travel/sellability@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/availability@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/extras@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/pricing@0.28.1
- @voyant-travel/products@0.28.1
- @voyant-travel/sellability@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [b72948d]
  - @voyant-travel/availability@0.28.0
  - @voyant-travel/core@0.28.0
  - @voyant-travel/extras@0.28.0
  - @voyant-travel/hono@0.28.0
  - @voyant-travel/pricing@0.28.0
  - @voyant-travel/products@0.28.0
  - @voyant-travel/sellability@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [dc46e37]
  - @voyant-travel/availability@0.27.0
  - @voyant-travel/core@0.27.0
  - @voyant-travel/extras@0.27.0
  - @voyant-travel/hono@0.27.0
  - @voyant-travel/pricing@0.27.0
  - @voyant-travel/products@0.27.0
  - @voyant-travel/sellability@0.27.0

## 0.26.9

### Patch Changes

- Updated dependencies [24a121e]
  - @voyant-travel/availability@0.26.9
  - @voyant-travel/core@0.26.9
  - @voyant-travel/extras@0.26.9
  - @voyant-travel/hono@0.26.9
  - @voyant-travel/pricing@0.26.9
  - @voyant-travel/products@0.26.9
  - @voyant-travel/sellability@0.26.9

## 0.26.8

### Patch Changes

- Updated dependencies [abc9aa0]
  - @voyant-travel/availability@0.26.8
  - @voyant-travel/core@0.26.8
  - @voyant-travel/extras@0.26.8
  - @voyant-travel/hono@0.26.8
  - @voyant-travel/pricing@0.26.8
  - @voyant-travel/products@0.26.8
  - @voyant-travel/sellability@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/availability@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/extras@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/pricing@0.26.7
- @voyant-travel/products@0.26.7
- @voyant-travel/sellability@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/availability@0.26.6
- @voyant-travel/core@0.26.6
- @voyant-travel/extras@0.26.6
- @voyant-travel/hono@0.26.6
- @voyant-travel/pricing@0.26.6
- @voyant-travel/products@0.26.6
- @voyant-travel/sellability@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/availability@0.26.5
- @voyant-travel/core@0.26.5
- @voyant-travel/extras@0.26.5
- @voyant-travel/hono@0.26.5
- @voyant-travel/pricing@0.26.5
- @voyant-travel/products@0.26.5
- @voyant-travel/sellability@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/availability@0.26.4
- @voyant-travel/core@0.26.4
- @voyant-travel/extras@0.26.4
- @voyant-travel/hono@0.26.4
- @voyant-travel/pricing@0.26.4
- @voyant-travel/products@0.26.4
- @voyant-travel/sellability@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/availability@0.26.3
- @voyant-travel/core@0.26.3
- @voyant-travel/extras@0.26.3
- @voyant-travel/hono@0.26.3
- @voyant-travel/pricing@0.26.3
- @voyant-travel/products@0.26.3
- @voyant-travel/sellability@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/availability@0.26.2
- @voyant-travel/core@0.26.2
- @voyant-travel/extras@0.26.2
- @voyant-travel/hono@0.26.2
- @voyant-travel/pricing@0.26.2
- @voyant-travel/products@0.26.2
- @voyant-travel/sellability@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/availability@0.26.1
- @voyant-travel/core@0.26.1
- @voyant-travel/extras@0.26.1
- @voyant-travel/hono@0.26.1
- @voyant-travel/pricing@0.26.1
- @voyant-travel/products@0.26.1
- @voyant-travel/sellability@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/availability@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/extras@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/pricing@0.26.0
- @voyant-travel/products@0.26.0
- @voyant-travel/sellability@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/availability@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/extras@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/pricing@0.25.0
- @voyant-travel/products@0.25.0
- @voyant-travel/sellability@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/availability@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/extras@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/pricing@0.24.3
- @voyant-travel/products@0.24.3
- @voyant-travel/sellability@0.24.3

## 0.24.2

### Patch Changes

- bec0471: Republish packages whose 0.24.1 tarballs omitted built `dist` artifacts while their runtime exports pointed at `dist`.
  - @voyant-travel/availability@0.24.2
  - @voyant-travel/core@0.24.2
  - @voyant-travel/extras@0.24.2
  - @voyant-travel/hono@0.24.2
  - @voyant-travel/pricing@0.24.2
  - @voyant-travel/products@0.24.2
  - @voyant-travel/sellability@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/availability@0.24.1
- @voyant-travel/core@0.24.1
- @voyant-travel/extras@0.24.1
- @voyant-travel/hono@0.24.1
- @voyant-travel/pricing@0.24.1
- @voyant-travel/products@0.24.1
- @voyant-travel/sellability@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/availability@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/extras@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/pricing@0.24.0
- @voyant-travel/products@0.24.0
- @voyant-travel/sellability@0.24.0

## 0.23.0

### Minor Changes

- d177a55: Add request-aware storefront settings and offer resolution, a public product availability summary endpoint, itinerary day extension components for products UI, and an explicit open slots metric for availability overview surfaces.

### Patch Changes

- @voyant-travel/availability@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/extras@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/pricing@0.23.0
- @voyant-travel/products@0.23.0
- @voyant-travel/sellability@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/availability@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/extras@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/pricing@0.22.0
- @voyant-travel/products@0.22.0
- @voyant-travel/sellability@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/availability@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/extras@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/pricing@0.21.1
- @voyant-travel/products@0.21.1
- @voyant-travel/sellability@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/availability@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/extras@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/pricing@0.21.0
  - @voyant-travel/products@0.21.0
  - @voyant-travel/sellability@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/availability@0.20.0
- @voyant-travel/core@0.20.0
- @voyant-travel/extras@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/pricing@0.20.0
- @voyant-travel/products@0.20.0
- @voyant-travel/sellability@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/availability@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/extras@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/pricing@0.19.0
  - @voyant-travel/products@0.19.0
  - @voyant-travel/sellability@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/availability@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/extras@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/pricing@0.18.0
  - @voyant-travel/products@0.18.0
  - @voyant-travel/sellability@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/availability@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/extras@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/pricing@0.17.0
  - @voyant-travel/products@0.17.0
  - @voyant-travel/sellability@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [a4bc773]
  - @voyant-travel/availability@0.16.0
  - @voyant-travel/core@0.16.0
  - @voyant-travel/extras@0.16.0
  - @voyant-travel/hono@0.16.0
  - @voyant-travel/pricing@0.16.0
  - @voyant-travel/products@0.16.0
  - @voyant-travel/sellability@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/availability@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/extras@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/pricing@0.15.0
- @voyant-travel/products@0.15.0
- @voyant-travel/sellability@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/availability@0.14.0
- @voyant-travel/core@0.14.0
- @voyant-travel/extras@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/pricing@0.14.0
- @voyant-travel/products@0.14.0
- @voyant-travel/sellability@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/availability@0.13.0
- @voyant-travel/core@0.13.0
- @voyant-travel/extras@0.13.0
- @voyant-travel/hono@0.13.0
- @voyant-travel/pricing@0.13.0
- @voyant-travel/products@0.13.0
- @voyant-travel/sellability@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/availability@0.12.0
- @voyant-travel/core@0.12.0
- @voyant-travel/extras@0.12.0
- @voyant-travel/hono@0.12.0
- @voyant-travel/pricing@0.12.0
- @voyant-travel/products@0.12.0
- @voyant-travel/sellability@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/availability@0.11.0
- @voyant-travel/core@0.11.0
- @voyant-travel/extras@0.11.0
- @voyant-travel/hono@0.11.0
- @voyant-travel/pricing@0.11.0
- @voyant-travel/products@0.11.0
- @voyant-travel/sellability@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/availability@0.10.0
  - @voyant-travel/core@0.10.0
  - @voyant-travel/extras@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/pricing@0.10.0
  - @voyant-travel/products@0.10.0
  - @voyant-travel/sellability@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/availability@0.9.0
- @voyant-travel/core@0.9.0
- @voyant-travel/extras@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/pricing@0.9.0
- @voyant-travel/products@0.9.0
- @voyant-travel/sellability@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/availability@0.8.0
- @voyant-travel/core@0.8.0
- @voyant-travel/extras@0.8.0
- @voyant-travel/hono@0.8.0
- @voyant-travel/pricing@0.8.0
- @voyant-travel/products@0.8.0
- @voyant-travel/sellability@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/availability@0.7.0
- @voyant-travel/core@0.7.0
- @voyant-travel/extras@0.7.0
- @voyant-travel/hono@0.7.0
- @voyant-travel/pricing@0.7.0
- @voyant-travel/products@0.7.0
- @voyant-travel/sellability@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/availability@0.6.9
- @voyant-travel/core@0.6.9
- @voyant-travel/extras@0.6.9
- @voyant-travel/hono@0.6.9
- @voyant-travel/pricing@0.6.9
- @voyant-travel/products@0.6.9
- @voyant-travel/sellability@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/availability@0.6.8
  - @voyant-travel/core@0.6.8
  - @voyant-travel/extras@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/pricing@0.6.8
  - @voyant-travel/products@0.6.8
  - @voyant-travel/sellability@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/availability@0.6.7
- @voyant-travel/core@0.6.7
- @voyant-travel/extras@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/pricing@0.6.7
- @voyant-travel/products@0.6.7
- @voyant-travel/sellability@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/availability@0.6.6
- @voyant-travel/core@0.6.6
- @voyant-travel/extras@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/pricing@0.6.6
- @voyant-travel/products@0.6.6
- @voyant-travel/sellability@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/availability@0.6.5
- @voyant-travel/core@0.6.5
- @voyant-travel/extras@0.6.5
- @voyant-travel/hono@0.6.5
- @voyant-travel/pricing@0.6.5
- @voyant-travel/products@0.6.5
- @voyant-travel/sellability@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/availability@0.6.4
- @voyant-travel/core@0.6.4
- @voyant-travel/extras@0.6.4
- @voyant-travel/hono@0.6.4
- @voyant-travel/pricing@0.6.4
- @voyant-travel/products@0.6.4
- @voyant-travel/sellability@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/availability@0.6.3
  - @voyant-travel/core@0.6.3
  - @voyant-travel/extras@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/pricing@0.6.3
  - @voyant-travel/products@0.6.3
  - @voyant-travel/sellability@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/availability@0.6.2
- @voyant-travel/core@0.6.2
- @voyant-travel/extras@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/pricing@0.6.2
- @voyant-travel/products@0.6.2
- @voyant-travel/sellability@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [00587db]
  - @voyant-travel/availability@0.6.1
  - @voyant-travel/core@0.6.1
  - @voyant-travel/extras@0.6.1
  - @voyant-travel/hono@0.6.1
  - @voyant-travel/pricing@0.6.1
  - @voyant-travel/products@0.6.1
  - @voyant-travel/sellability@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/availability@0.6.0
- @voyant-travel/core@0.6.0
- @voyant-travel/extras@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/pricing@0.6.0
- @voyant-travel/products@0.6.0
- @voyant-travel/sellability@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/availability@0.5.0
  - @voyant-travel/core@0.5.0
  - @voyant-travel/extras@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/pricing@0.5.0
  - @voyant-travel/products@0.5.0
  - @voyant-travel/sellability@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/availability@0.4.5
  - @voyant-travel/core@0.4.5
  - @voyant-travel/extras@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/pricing@0.4.5
  - @voyant-travel/products@0.4.5
  - @voyant-travel/sellability@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/availability@0.4.4
- @voyant-travel/core@0.4.4
- @voyant-travel/extras@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/pricing@0.4.4
- @voyant-travel/products@0.4.4
- @voyant-travel/sellability@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/availability@0.4.3
- @voyant-travel/core@0.4.3
- @voyant-travel/extras@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/pricing@0.4.3
- @voyant-travel/products@0.4.3
- @voyant-travel/sellability@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/availability@0.4.2
- @voyant-travel/core@0.4.2
- @voyant-travel/extras@0.4.2
- @voyant-travel/hono@0.4.2
- @voyant-travel/pricing@0.4.2
- @voyant-travel/products@0.4.2
- @voyant-travel/sellability@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/availability@0.4.1
- @voyant-travel/core@0.4.1
- @voyant-travel/extras@0.4.1
- @voyant-travel/hono@0.4.1
- @voyant-travel/pricing@0.4.1
- @voyant-travel/products@0.4.1
- @voyant-travel/sellability@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Add first-class public storefront routes for product departure list/detail, departure price preview, product extensions, and departure itinerary, plus pluggable promotional-offer routes backed by injected resolvers, with typed schemas exported from the package root.
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/availability@0.4.0
  - @voyant-travel/core@0.4.0
  - @voyant-travel/extras@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/pricing@0.4.0
  - @voyant-travel/products@0.4.0
  - @voyant-travel/sellability@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Advance the public storefront surface with phone contact-exists support in the
  customer portal, default-template and preview helpers in legal, localized slug
  and SEO catalog fields in products, and a new config-backed storefront settings
  module for booking/account pages.
  - @voyant-travel/core@0.3.1
  - @voyant-travel/hono@0.3.1
