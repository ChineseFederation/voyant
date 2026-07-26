# @voyant-travel/cruises

## 0.206.2

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.
- Updated dependencies [2cfce32]
  - @voyant-travel/catalog@0.205.2
  - @voyant-travel/action-ledger@0.115.2

## 0.206.1

### Patch Changes

- 560f7c3: Declare safety-contract metadata on the five remaining grandfathered cruise
  actions and remove them from the legacy execute+tools allowlist:

  - `action.update-cruise`, `action.update-cruise-sailing`, and
    `action.update-cruise-ship` are plain local Postgres updates against an
    existing `id`, so they declare `commandTargetField: "id"`,
    `targetLifecycle: "existing"`, and `availability`/`effectBoundary: "local"`.
  - `action.upsert-cruise-sailing` dedupes on the `(cruiseId, departureDate,
shipId)` unique index and fully overwrites on a matching retry. It has no
    client-supplied row id, but is anchored to the existing cruise it belongs
    to, so it declares `commandTargetField: "cruiseId"`, `targetLifecycle:
"existing"`, and `availability`/`effectBoundary: "local"`.
  - `action.create-cruise-ship` already claims its command idempotently via
    the existing `handler-command-claim-v1` `createdTarget` contract; this
    adds `availability` and `effectBoundary: "local"`.

  No runtime changes.

- Updated dependencies [560f7c3]
  - @voyant-travel/catalog@0.205.1

## 0.206.0

### Patch Changes

- @voyant-travel/catalog@0.205.0
- @voyant-travel/finance@0.207.0

## 0.205.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/catalog@0.204.0

## 0.204.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/catalog@0.203.0

## 0.203.0

### Patch Changes

- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0

## 0.202.0

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
  - @voyant-travel/tools@0.7.0

## 0.201.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0

## 0.200.1

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
  - @voyant-travel/finance@0.201.1

## 0.200.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/bookings@0.201.0

## 0.199.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5

## 0.198.0

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4

## 0.197.1

### Patch Changes

- @voyant-travel/bookings@0.198.1
- @voyant-travel/catalog@0.196.1
- @voyant-travel/finance@0.198.1

## 0.197.0

### Patch Changes

- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/finance@0.198.0

## 0.196.0

### Minor Changes

- a310395: Restore `create_cruise` as a handler-owned created-target command whose cruise,
  required search projection, canonical-cruise-scoped lifecycle outbox event,
  ledger, and immutable replay result commit atomically.

  This changes the Tool response from the mutable cruise row to
  `{ status, cruise: { id }, replayed }`. See
  [`docs/migrations/created-target-commerce-charters-cruises.md`](https://github.com/voyant-travel/voyant/blob/main/docs/migrations/created-target-commerce-charters-cruises.md)
  for caller migration guidance.

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.195.0

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

- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.194.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/finance@0.195.0

## 0.193.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0

## 0.192.0

### Patch Changes

- 2c79bef: Add referenced presentation-subject overlay support for cruise ships and accommodation properties.
- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0

## 0.191.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1

## 0.191.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0

## 0.190.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/bookings@0.191.0

## 0.189.0

### Patch Changes

- 228b57d: Migrate package-owned scheduled product operations from workflow registrations to payload-free jobs selected through the deployment graph. The jobs retain durable authority in their owning domains and resolve execution dependencies through package runtime ports.
- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/types@0.109.9

## 0.188.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/cruises-contracts@0.105.9
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0

## 0.187.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/workflows@0.122.18

## 0.186.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0

## 0.185.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0

## 0.184.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/bookings@0.185.0

## 0.183.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/catalog@0.182.0
- @voyant-travel/finance@0.184.0

## 0.182.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0

## 0.181.2

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/catalog@0.180.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/workflows@0.122.16

## 0.181.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/workflows@0.122.15

## 0.181.0

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0

## 0.180.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0

## 0.179.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/db@0.117.1
- @voyant-travel/bookings@0.180.1
- @voyant-travel/catalog@0.178.1
- @voyant-travel/workflows@0.122.14

## 0.179.0

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/workflows@0.122.13

## 0.178.0

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0

## 0.177.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/workflows@0.122.12

## 0.176.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.175.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.174.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.173.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/workflows@0.122.8

## 0.172.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0

## 0.171.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/workflows@0.122.7

## 0.170.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/workflows@0.122.6

## 0.170.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/bookings@0.171.0

## 0.169.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/workflows@0.122.5

## 0.168.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/workflows@0.122.4

## 0.168.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0

## 0.167.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/bookings@0.168.0

## 0.166.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/bookings@0.167.0

## 0.165.0

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflows@0.122.3

## 0.164.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/bookings@0.165.0

## 0.163.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0

## 0.162.0

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
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/workflows@0.122.2

## 0.161.1

### Patch Changes

- @voyant-travel/bookings@0.162.2
- @voyant-travel/catalog@0.160.1
- @voyant-travel/finance@0.162.2
- @voyant-travel/workflows@0.122.1

## 0.161.0

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
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.160.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0

## 0.159.0

### Minor Changes

- 0297ef5: Add module-owned, provider-neutral charter and cruise Tools for discovery,
  detail, quoting, local lifecycle management, and explicitly guarded supplier
  booking commits.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
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
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/workflows@0.121.0

## 0.158.0

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
  - @voyant-travel/workflows@0.120.4

## 0.157.0

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
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.156.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/cruises-contracts@0.105.8
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0

## 0.155.1

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
  - @voyant-travel/cruises-contracts@0.105.7
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/workflows@0.120.2

## 0.155.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/cruises-contracts@0.105.6
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1

## 0.154.2

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

## 0.154.1

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
  - @voyant-travel/catalog@0.153.1

## 0.154.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/workflows@0.119.0

## 0.153.0

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
  - @voyant-travel/workflows@0.118.0

## 0.152.0

### Minor Changes

- 047c3f9: Add package-owned graph runtime factories and typed deployment ports for Catalog search, booking, and offers; Inventory core, content, and brochures; Accommodations and Cruises content; and Action Ledger health.
- 490d132: Move owned product, accommodation, and cruise booking runtime behavior out of the Operator starter and into package-owned runtime surfaces.
- 490d132: Move charter/cruise route activation and travel/infrastructure scheduled work
  to graph-selected package manifests. Distribution, Cruises, and DB now publish
  their scheduled workflow implementations, while Workflow Runs owns generic
  schedule dispatch and the Operator supplies only Node runtime dependencies.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Derive travel runtime port bindings from deployment host capabilities.
- 490d132: Select package-owned Node workflow services through additive graph runtime contributors instead of composing Catalog, Cruises, and DB services in the Operator starter. Notifications keeps its existing package graph bootstrap.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Make selected package API facets the exclusive OpenAPI document authority and reject unclaimed or duplicate operations.
- 490d132: Move travel-product OpenAPI ownership into selected graph manifests and package route registries.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
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
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.151.0

### Patch Changes

- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.150.4

### Patch Changes

- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.150.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/types@0.107.3

## 0.150.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2

## 0.150.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1

## 0.150.0

### Minor Changes

- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- a370024: Publish package-owned deployment manifests for the travel modules.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

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
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.149.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.148.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.148.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0

## 0.147.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0

## 0.146.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0

## 0.145.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0

## 0.144.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/cruises-contracts@0.105.5
  - @voyant-travel/bookings@0.145.0

## 0.143.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/catalog@0.142.0

## 0.142.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/types@0.107.1

## 0.141.0

### Patch Changes

- @voyant-travel/bookings@0.142.0
- @voyant-travel/catalog@0.140.0

## 0.140.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/bookings@0.141.0

## 0.139.0

### Patch Changes

- @voyant-travel/bookings@0.140.0
- @voyant-travel/catalog@0.138.0

## 0.138.2

### Patch Changes

- 98503c9: Gate customer storefront documents and owned detail content to bookable accommodation rooms and cruises so seed/demo rows that are inactive, draft, closed, unpriced, or out of inventory do not appear as bookable cards.

## 0.138.1

### Patch Changes

- 1a3bd68: Serve owned cruise rows through the public cruise content service and re-enable
  cruises in storefront customer product routing.
- Updated dependencies [ecff8cf]
  - @voyant-travel/bookings@0.139.2

## 0.138.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/db@0.109.5

## 0.137.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3

## 0.137.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2

## 0.137.0

### Patch Changes

- @voyant-travel/bookings@0.138.0
- @voyant-travel/catalog@0.136.0

## 0.136.2

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.
- Updated dependencies [61410dd]
  - @voyant-travel/catalog@0.135.3
  - @voyant-travel/bookings@0.137.4

## 0.136.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1

## 0.136.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0

## 0.135.1

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/catalog@0.134.1

## 0.135.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0

## 0.134.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/bookings@0.135.0
- @voyant-travel/catalog@0.133.0

## 0.133.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/catalog@0.132.1

## 0.133.0

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
  - @voyant-travel/catalog@0.132.0

## 0.132.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0

## 0.131.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/cruises-contracts@0.105.4
  - @voyant-travel/bookings@0.132.0

## 0.130.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/db@0.108.5

## 0.130.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0

## 0.129.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0

## 0.128.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/bookings@0.129.0

## 0.127.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/catalog@0.126.0

## 0.126.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/catalog@0.125.0

## 0.125.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/catalog@0.124.1

## 0.125.0

### Patch Changes

- @voyant-travel/bookings@0.126.0
- @voyant-travel/catalog@0.124.0

## 0.124.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/bookings@0.125.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/hono@0.112.2

## 0.123.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0

## 0.122.0

### Patch Changes

- d9e5f8e: Fix `cruises/src/schema.ts` to re-export `cruiseAirArrangementEnum` from the booking-extension. The barrel re-exported `bookingCruiseDetails` (which has an `air_arrangement` column) and `cruiseBookingModeEnum`, but omitted `cruiseAirArrangementEnum` — so schema discovery (drizzle) saw a table referencing an enum it never created (surfaced by the D.1 replay-parity oracle). A schema barrel must re-export every enum its re-exported tables use.
- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2

## 0.121.0

### Patch Changes

- @voyant-travel/bookings@0.122.0
- @voyant-travel/catalog@0.120.0

## 0.120.0

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/bookings@0.121.0

## 0.119.2

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.
- Updated dependencies [756213e]
  - @voyant-travel/bookings@0.120.2
  - @voyant-travel/hono@0.110.3

## 0.119.1

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/catalog@0.118.1

## 0.119.0

### Patch Changes

- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/hono@0.110.0

## 0.118.2

### Patch Changes

- d4e3d54: Split oversized cruise route, service, booking, search, and catalog policy modules into smaller vertical slices while preserving the existing public exports and behavior.

  Split oversized flights UI, charter booking, and accommodation content modules into smaller internal slices while preserving the existing public exports and behavior.

- Updated dependencies [bd74fb0]
  - @voyant-travel/catalog@0.117.2
  - @voyant-travel/bookings@0.119.2

## 0.118.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/catalog@0.117.1
  - @voyant-travel/hono@0.109.1

## 0.118.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/catalog@0.117.0

## 0.117.0

### Patch Changes

- @voyant-travel/bookings@0.118.0
- @voyant-travel/catalog@0.116.0

## 0.116.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/catalog@0.115.1

## 0.116.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0

## 0.115.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/catalog@0.114.0

## 0.114.0

### Patch Changes

- @voyant-travel/bookings@0.115.0
- @voyant-travel/catalog@0.113.0

## 0.113.0

### Patch Changes

- @voyant-travel/bookings@0.114.0
- @voyant-travel/catalog@0.112.0

## 0.112.0

### Patch Changes

- @voyant-travel/bookings@0.113.0
- @voyant-travel/catalog@0.111.0

## 0.111.0

### Patch Changes

- @voyant-travel/bookings@0.112.0
- @voyant-travel/catalog@0.110.0

## 0.110.0

### Patch Changes

- @voyant-travel/bookings@0.111.0
- @voyant-travel/catalog@0.109.0

## 0.109.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/catalog@0.108.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3

## 0.108.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/catalog@0.107.0
  - @voyant-travel/hono@0.105.2

## 0.107.0

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0
  - @voyant-travel/cruises-contracts@0.105.1
  - @voyant-travel/bookings@0.108.0

## 0.106.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/catalog@0.105.1

## 0.106.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/catalog@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/hono@0.104.2

## 0.105.3

### Patch Changes

- @voyant-travel/bookings@0.106.0

## 0.105.2

### Patch Changes

- 72d4c0d: Normalize cruise search/catalog from-prices to integer cents, add explicit catalog price-unit metadata for legacy-safe rendering, add departure counts to cruise search rows, and expose `GET /sailings/:key/pricing` for reading sailing pricing directly.
  - @voyant-travel/catalog@0.104.5

## 0.105.1

### Patch Changes

- 60e3bb1: Map sourced cruise embark and disembark port facility ids into catalog projections.

## 0.105.0

### Minor Changes

- 921f4fc: Add a canonical board-basis contract enum and reuse it across accommodation meal plans, product options, and cruise sailings.

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/cruises-contracts@0.105.0
  - @voyant-travel/catalog@0.104.4
  - @voyant-travel/bookings@0.105.0

## 0.104.2

### Patch Changes

- 23a3dad: Thread rich cruise cabin and ship media through the sourced content contract and catalog detail UI.
- Updated dependencies [23a3dad]
  - @voyant-travel/cruises-contracts@0.104.2
  - @voyant-travel/catalog@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/bookings@0.104.1
- @voyant-travel/catalog@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/cruises-contracts@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings@0.104.0
- @voyant-travel/catalog@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/cruises-contracts@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings@0.103.0
- @voyant-travel/catalog@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/cruises-contracts@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings@0.102.0
- @voyant-travel/catalog@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/cruises-contracts@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/hono@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/bookings@0.101.2
- @voyant-travel/catalog@0.101.2
- @voyant-travel/core@0.101.2
- @voyant-travel/cruises-contracts@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2

## 0.101.1

### Patch Changes

- 26c6908: Fix sourced cruises rendering blank in the catalog (#1466).

  - `@voyant-travel/cruises`: the catalog source-adapter shim (`toCatalogProjection`) now emits the field-policy keys the indexer and catalog UI expect (`cruiseType`, `nights`, `status`, `heroImageUrl`/`thumbnailUrl`, `lowestPriceCached`, `lineSupplierId`/`defaultShipId`, `source.kind`/`source.ref`) instead of unrecognized snake*case keys that were silently dropped — so sourced cruises carry Type/Nights/Status/Supplier/Ship/Price/Source into the index. `CruiseSearchProjectionEntry` gains `lineExternalId`/`shipExternalId` (surfaced by `@voyant-travel/connect-cruises` ≥0.3.1). The content route (`GET /:key/content`) and `parseUnifiedKey` now accept the catalog sourced entity-id form (`crus_sr*<base64>`) via the new `isEncodedSourceEntityId`helper, and dispatch sourced ids without the owned-key opt-in — previously they returned`400 invalid_key`, leaving the detail sheet empty. Adds `getCruiseSailingPricing`+ a`GET /:key/sailings/:sailingExternalId/pricing`content route serving live per-cabin pricing for sourced sailings (volatile-live, fetched fresh — never cached). The source-adapter shim now drops a sailing's`lowest_price_cents`/`currency` unless both are present (the content schema requires both-or-neither) so an adapter that surfaces a price without its currency can't fail content validation.
  - `@voyant-travel/catalog-ui`: `createCatalogEnrichmentFetchers` routes the detail-content fetch per vertical via `contentBasePathByVertical`, and `CatalogPage` wires `onLoadDetail` on every vertical tab (not just products) so non-product detail sheets (cruises, etc.) actually fetch their enrichment from the correct content route. Adds `loadDeparturePricing` (lazy per-cabin pricing fetched on departure-row expand, matched to cabins by code → per-cabin price + availability). The detail sheet labels the cruise options tab "Cabins", renders the entity id as a compact copyable chip, falls back the Itinerary tab to the first sailing's stops, and sanitizes cabin names + descriptions (strips HTML tags and decodes entities like `&nbsp;`). Cabin cards are redesigned as a photo gallery (new `MediaGallery` — a carousel thumbnail that opens a full-screen lightbox carousel on click) alongside size (sqft), capacity, description, and de-duplicated amenity chips. The Overview drops the canonical-geography id columns (`country_iso`/`region_ids`/`port_ids`/`waterway_ids`) and empty array rows, and adds a media gallery (cruise cover + cabin photos) when imagery is available.
  - `@voyant-travel/catalog-ui`: the cruise detail sheet gains a **Ship** tab showing the vessel the cruise sails on — gallery (carousel + lightbox), name/type, key specs (capacity, decks, year built) and description.
  - `@voyant-travel/catalog-ui`: for the cruises vertical the detail sheet's **Departures** tab is relabeled **Sailings** (industry term), along with its empty-state and filtered no-results copy — other verticals keep "Departures".
  - `@voyant-travel/cruises-contracts`: the cabin-category content shape gains `images` + `square_feet` so cabin photos and size flow end-to-end (the cruise shim maps them from the adapter's `images`/`floorplanImages`/`squareFeet`; the data was previously dropped). The ship content shape gains `ship_type` + `gallery` so the vessel's class and photos reach the Ship tab.

- Updated dependencies [f736ba5]
- Updated dependencies [26c6908]
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/catalog@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/cruises-contracts@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/hono@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/bookings@0.101.0
- @voyant-travel/catalog@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/cruises-contracts@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/hono@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/bookings@0.100.0
- @voyant-travel/catalog@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/cruises-contracts@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/catalog@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/cruises-contracts@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/bookings@0.98.0
- @voyant-travel/catalog@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/cruises-contracts@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/hono@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/bookings@0.97.0
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/cruises-contracts@0.97.0
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
  - @voyant-travel/bookings@0.96.0
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/cruises-contracts@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/hono@0.96.0

## 0.95.0

### Minor Changes

- a8d3a3f: Carry canonical cruise geography through cruise models and catalog indexing so sourced and owned cruise documents can facet on regions, waterways, ports, and countries.

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/bookings@0.95.0
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/core@0.95.0
  - @voyant-travel/db@0.95.0
  - @voyant-travel/hono@0.95.0

## 0.94.0

### Minor Changes

- 43c409b: Promote cruise cabin and deck facets into the catalog plane and add structured cabin feature fields for bed configuration, accessibility, and view filtering.

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/catalog@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0

## 0.93.0

### Minor Changes

- 5df6824: Add canonical place references for product destinations and cruise itinerary geography.

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/catalog@0.93.0
- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/hono@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/bookings@0.92.0
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/core@0.92.0
  - @voyant-travel/db@0.92.0
  - @voyant-travel/hono@0.92.0

## 0.91.0

### Minor Changes

- dc8554b: Add cruise voyage group schema, validation, service helpers, and admin routes for combined voyages, grand voyages, world cruises, cruise-tours, and pre/post extensions.

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/catalog@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0

## 0.90.0

### Minor Changes

- 0cdd0ea: Add cruise pricing fields for compare-at prices, fare variants, explicit single pricing, and early-booking metadata.

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/catalog@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/bookings@0.89.0
- @voyant-travel/catalog@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0

## 0.88.0

### Minor Changes

- 27afa4b: Add provider-agnostic external cruise catalog refresh and reindex helpers.

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/bookings@0.88.0
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/core@0.88.0
  - @voyant-travel/db@0.88.0
  - @voyant-travel/hono@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/bookings@0.87.1
- @voyant-travel/catalog@0.87.1
- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/bookings@0.87.0
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/core@0.87.0
  - @voyant-travel/db@0.87.0
  - @voyant-travel/hono@0.87.0

## 0.86.0

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/bookings@0.86.0
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/core@0.86.0
  - @voyant-travel/db@0.86.0
  - @voyant-travel/hono@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/bookings@0.85.4
- @voyant-travel/catalog@0.85.4
- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4

## 0.85.3

### Patch Changes

- 7f0970e: Expose cruise sourced-content sailing price summaries as `lowest_price_cents` integer minor units plus `currency`, and map cruise sailings directly into catalog UI departure prices.
  - @voyant-travel/bookings@0.85.3
  - @voyant-travel/catalog@0.85.3
  - @voyant-travel/core@0.85.3
  - @voyant-travel/db@0.85.3
  - @voyant-travel/hono@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/catalog@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/hono@0.85.2

## 0.85.1

### Patch Changes

- 8605177: Document the external cruise adapter contract and export a provider-neutral compatibility fixture for adapter packages.
  - @voyant-travel/bookings@0.85.1
  - @voyant-travel/catalog@0.85.1
  - @voyant-travel/core@0.85.1
  - @voyant-travel/db@0.85.1
  - @voyant-travel/hono@0.85.1

## 0.85.0

### Minor Changes

- d8ec16f: Align the external cruise adapter contract for Connect-backed inventory by preserving full SourceRef route keys, passenger composition, external pricing terms, and booking snapshots.

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/catalog@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/bookings@0.84.4
- @voyant-travel/catalog@0.84.4
- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/catalog@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/hono@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/catalog@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/catalog@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/catalog@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/catalog@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/catalog@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/catalog@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/bookings@0.82.0
- @voyant-travel/catalog@0.82.0
- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/hono@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/catalog@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/hono@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/catalog@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/hono@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/catalog@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/hono@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/bookings@0.81.18
- @voyant-travel/catalog@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/catalog@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/bookings@0.81.15
- @voyant-travel/catalog@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/bookings@0.81.14
- @voyant-travel/catalog@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/catalog@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/hono@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/catalog@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/bookings@0.81.11
- @voyant-travel/catalog@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/bookings@0.81.10
- @voyant-travel/catalog@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/catalog@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/hono@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/catalog@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/catalog@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/hono@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/bookings@0.81.6
- @voyant-travel/catalog@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/bookings@0.81.5
- @voyant-travel/catalog@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/catalog@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/hono@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/catalog@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/hono@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/catalog@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/bookings@0.81.1
- @voyant-travel/catalog@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/catalog@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/hono@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/catalog@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/catalog@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/bookings@0.80.16
- @voyant-travel/catalog@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/catalog@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/hono@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/catalog@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/bookings@0.80.13
- @voyant-travel/catalog@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/catalog@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/catalog@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/bookings@0.80.10
- @voyant-travel/catalog@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/catalog@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/hono@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/bookings@0.80.8
- @voyant-travel/catalog@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/bookings@0.80.7
- @voyant-travel/catalog@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/bookings@0.80.6
- @voyant-travel/catalog@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/bookings@0.80.5
- @voyant-travel/catalog@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/bookings@0.80.4
- @voyant-travel/catalog@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/catalog@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/catalog@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/hono@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/bookings@0.80.1
- @voyant-travel/catalog@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/bookings@0.80.0
- @voyant-travel/catalog@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/catalog@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/catalog@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/bookings@0.77.13
- @voyant-travel/catalog@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/bookings@0.77.12
- @voyant-travel/catalog@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/bookings@0.77.11
- @voyant-travel/catalog@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/bookings@0.77.10
- @voyant-travel/catalog@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/bookings@0.77.9
- @voyant-travel/catalog@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/catalog@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/catalog@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/catalog@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/bookings@0.77.5
- @voyant-travel/catalog@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/catalog@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/catalog@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/catalog@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/catalog@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/hono@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/catalog@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/bookings@0.76.0
- @voyant-travel/catalog@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/bookings@0.75.7
- @voyant-travel/catalog@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/bookings@0.75.6
- @voyant-travel/catalog@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/bookings@0.75.5
- @voyant-travel/catalog@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/catalog@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/bookings@0.75.3
- @voyant-travel/catalog@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/catalog@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/catalog@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/catalog@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/hono@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/bookings@0.74.2
- @voyant-travel/catalog@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/bookings@0.74.1
- @voyant-travel/catalog@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/catalog@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/catalog@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/bookings@0.73.0
- @voyant-travel/catalog@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/catalog@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/catalog@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/catalog@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/catalog@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/catalog@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/catalog@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/catalog@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/bookings@0.66.6
- @voyant-travel/catalog@0.66.6
- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/catalog@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/hono@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/catalog@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/hono@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/catalog@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/catalog@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/bookings@0.66.1
- @voyant-travel/catalog@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/catalog@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/catalog@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/bookings@0.64.1
- @voyant-travel/catalog@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/catalog@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/catalog@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/catalog@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/hono@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/catalog@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/catalog@0.62.2
- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/catalog@0.62.1
- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/catalog@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/catalog@0.61.0
- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/bookings@0.60.0
- @voyant-travel/catalog@0.60.0
- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/hono@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/bookings@0.59.0
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/core@0.59.0
  - @voyant-travel/db@0.59.0
  - @voyant-travel/hono@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/bookings@0.58.0
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/core@0.58.0
  - @voyant-travel/db@0.58.0
  - @voyant-travel/hono@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/catalog@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/catalog@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/catalog@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/bookings@0.54.0
- @voyant-travel/catalog@0.54.0
- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/bookings@0.53.2
- @voyant-travel/catalog@0.53.2
- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/bookings@0.53.1
- @voyant-travel/catalog@0.53.1
- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/catalog@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/db@0.53.0
  - @voyant-travel/hono@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/catalog@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/hono@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/catalog@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3

## 0.52.2

### Patch Changes

- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/catalog@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/catalog@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/hono@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/catalog@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/catalog@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/catalog@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/catalog@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/hono@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/catalog@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/catalog@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/hono@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/catalog@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/catalog@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/catalog@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/bookings@0.50.2
- @voyant-travel/catalog@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/bookings@0.50.1
- @voyant-travel/catalog@0.50.1
- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/bookings@0.50.0
- @voyant-travel/catalog@0.50.0
- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/catalog@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/bookings@0.48.0
- @voyant-travel/catalog@0.48.0
- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/bookings@0.47.0
- @voyant-travel/catalog@0.47.0
- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/bookings@0.46.0
- @voyant-travel/catalog@0.46.0
- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/bookings@0.45.0
- @voyant-travel/catalog@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/catalog@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/catalog@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/bookings@0.42.0
- @voyant-travel/catalog@0.42.0
- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/catalog@0.41.3
- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/catalog@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2

## 0.41.1

### Patch Changes

- 533785f: Fix admin cruise route ordering so static subresource endpoints like `/sailings`, `/ships`, and `/prices` are handled before generic cruise-key routes.
  - @voyant-travel/bookings@0.41.1
  - @voyant-travel/catalog@0.41.1
  - @voyant-travel/core@0.41.1
  - @voyant-travel/db@0.41.1
  - @voyant-travel/hono@0.41.1

## 0.41.0

### Patch Changes

- 20fd32e: Add cruise lifecycle events for local create, update, and delete/archive mutations so catalog and search subscribers can reindex cruise documents.
  - @voyant-travel/bookings@0.41.0
  - @voyant-travel/catalog@0.41.0
  - @voyant-travel/core@0.41.0
  - @voyant-travel/db@0.41.0
  - @voyant-travel/hono@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/catalog@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/catalog@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/catalog@0.39.0
  - @voyant-travel/core@0.39.0
  - @voyant-travel/db@0.39.0
  - @voyant-travel/hono@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/catalog@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/catalog@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/catalog@0.38.0
- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/catalog@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/catalog@0.37.0
  - @voyant-travel/core@0.37.0
  - @voyant-travel/db@0.37.0
  - @voyant-travel/hono@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/catalog@0.36.0
  - @voyant-travel/core@0.36.0
  - @voyant-travel/db@0.36.0
  - @voyant-travel/hono@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/catalog@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0

## 0.34.0

### Patch Changes

- f8312f5: Project a normalized `thumbnailUrl` field into catalog search documents so
  operator catalog cards can render real cover images across verticals.
  - @voyant-travel/bookings@0.34.0
  - @voyant-travel/catalog@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/catalog@0.33.1
  - @voyant-travel/core@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/hono@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/catalog@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/catalog@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/catalog@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/catalog@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/catalog@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/bookings@0.31.4
- @voyant-travel/catalog@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/bookings@0.31.3
  - @voyant-travel/catalog@0.31.3
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/bookings@0.31.2
  - @voyant-travel/catalog@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/bookings@0.31.1
- @voyant-travel/catalog@0.31.1
- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.31.0
- @voyant-travel/catalog@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/bookings@0.30.7
- @voyant-travel/catalog@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/bookings@0.30.6
  - @voyant-travel/catalog@0.30.6
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/bookings@0.30.5
  - @voyant-travel/catalog@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/bookings@0.30.4
- @voyant-travel/catalog@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/bookings@0.30.3
  - @voyant-travel/catalog@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/bookings@0.30.2
- @voyant-travel/catalog@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/bookings@0.30.1
- @voyant-travel/catalog@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.30.0
- @voyant-travel/catalog@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0

## 0.29.0

### Patch Changes

- 2baf762: Fix #492: expose all workspace sub-paths in `publishConfig.exports` for vertical packages.

  `publishConfig.exports` (used at publish time) had drifted from the workspace `exports` map: catalog plane and content plane sub-paths shipped in `dist/` but were unreachable from the published package. Consumers installing from npm hit `ERR_PACKAGE_PATH_NOT_EXPORTED` / `TS2307` when importing them.

  Newly exposed sub-paths:

  - `@voyant-travel/products`: `./catalog-policy`, `./service-catalog-plane`, `./content-shape`, `./service-content`, `./service-content-synthesizer`, `./routes-content`, `./draft-shape`
  - `@voyant-travel/extras`: `./catalog-policy`, `./service-catalog-plane`, `./content-shape`, `./service-content`, `./service-content-synthesizer`, `./draft-shape`
  - `@voyant-travel/cruises`: `./catalog-policy`, `./service-catalog-plane`, `./content-shape`, `./service-content-synthesizer`, `./routes-content`, `./draft-shape`
  - `@voyant-travel/charters`: `./catalog-policy`, `./service-catalog-plane`, `./content-shape`, `./service-content`, `./service-content-synthesizer`, `./draft-shape`
  - `@voyant-travel/hospitality`: `./catalog-policy`, `./service-catalog-plane`, `./content-shape`, `./service-content-synthesizer`, `./draft-shape`

- Updated dependencies [3420711]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/catalog@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/bookings@0.28.3
- @voyant-travel/catalog@0.28.3
- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/bookings@0.28.2
- @voyant-travel/catalog@0.28.2
- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/bookings@0.28.1
- @voyant-travel/catalog@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.28.0
- @voyant-travel/catalog@0.28.0
- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/bookings@0.27.0
- @voyant-travel/catalog@0.27.0
- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/bookings@0.26.9
- @voyant-travel/catalog@0.26.9
- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/bookings@0.26.8
- @voyant-travel/catalog@0.26.8
- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/bookings@0.26.7
- @voyant-travel/catalog@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7

## 0.26.6

### Patch Changes

- Updated dependencies [571e340]
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/catalog@0.26.6
  - @voyant-travel/core@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/hono@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/bookings@0.26.5
  - @voyant-travel/catalog@0.26.5
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/bookings@0.26.4
  - @voyant-travel/catalog@0.26.4
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/bookings@0.26.3
  - @voyant-travel/catalog@0.26.3
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/bookings@0.26.2
  - @voyant-travel/catalog@0.26.2
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/catalog@0.26.1
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/bookings@0.26.0
- @voyant-travel/catalog@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings@0.25.0
- @voyant-travel/catalog@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/bookings@0.24.3
- @voyant-travel/catalog@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [bec0471]
  - @voyant-travel/bookings@0.24.2
  - @voyant-travel/catalog@0.24.2
  - @voyant-travel/core@0.24.2
  - @voyant-travel/db@0.24.2
  - @voyant-travel/hono@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [2d6297d]
  - @voyant-travel/bookings@0.24.1
  - @voyant-travel/catalog@0.24.1
  - @voyant-travel/core@0.24.1
  - @voyant-travel/db@0.24.1
  - @voyant-travel/hono@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/bookings@0.24.0
- @voyant-travel/catalog@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings@0.23.0
- @voyant-travel/catalog@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/bookings@0.22.0
- @voyant-travel/catalog@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/bookings@0.21.1
- @voyant-travel/catalog@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/catalog@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/bookings@0.20.0
- @voyant-travel/catalog@0.20.0
- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/bookings@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0

## 0.18.0

### Minor Changes

- 8932f60: Make schema discovery declarative and unblock downstream `drizzle-kit generate` against published packages.

  **Exports — `default` condition added everywhere (fixes #380)**

  Every `@voyant-travel/*` package's `publishConfig.exports` previously declared only `types` and `import`. drizzle-kit (and any CJS-based resolver) walked the `require` branch, hit nothing, and threw `ERR_PACKAGE_PATH_NOT_EXPORTED` on subpaths like `@voyant-travel/db/schema`. Each subpath now also declares a `default` condition pointing at the same `.js` file, so downstream consumers can resolve subpaths and run their own `drizzle-kit generate` against the canonical runtime schema.

  **Operator template baseline regenerated (fixes #378, #379)**

  `templates/operator/migrations/0000_striped_jubilee.sql` was missing `bookings.fx_rate_set_id` (causing `GET /v1/admin/bookings` to 500), and `@voyant-travel/cruises`'s 14 tables had never made it into any baseline. Added `@voyant-travel/cruises` to `templates/operator/drizzle.config.ts` and emitted `0004_steady_molten_man.sql` covering all drift (cruise tables/enums, the missing `fx_rate_set_id`, idempotency keys, vouchers, voucher redemptions, the `accessibility_needs` → encrypted-jsonb move, several check constraints, new enum values). Pruned 7 stale orphan migrations that were on disk but not in `_journal.json`. Schema baseline + runtime now match — `drizzle-kit generate` against a freshly migrated DB returns "No schema changes".

  **One `./schema` per module — sub-paths removed (BREAKING)**

  Each module now exposes exactly one schema entrypoint, `./schema`, that re-exports everything DB-related the module owns. Granular sub-paths are deleted from `exports` and `publishConfig.exports`:

  - `@voyant-travel/bookings/schema/travel-details` → fold into `@voyant-travel/bookings/schema`
  - `@voyant-travel/legal/contracts/schema` and `@voyant-travel/legal/policies/schema` → fold into the new `@voyant-travel/legal/schema`
  - `@voyant-travel/{products,crm,cruises,distribution,transactions,charters}/schema` now also re-export the pgTables declared inside `./booking-extension`. The runtime `./booking-extension` HonoExtension export is unchanged.

  Consumers importing from any of the removed sub-paths must switch to the consolidated `./schema` import.

  **Declarative dependency graph in `package.json`**

  Every module package gained a `voyant: { schema, requiresSchemas: [...] }` block declaring its schema entrypoint and the other modules' schemas it needs at the SQL level (e.g. `hospitality` requires `facilities` and `bookings`; `ground` requires `facilities` and `identity`; `suppliers` requires `facilities`; everyone implicitly requires `db`). The CLI reads this block to compute the dependency closure for a project.

  **`@voyant-travel/cli` — `resolveSchemas` helper + `voyant db schemas` command**

  New `@voyant-travel/cli/drizzle` entrypoint exporting `resolveSchemas(config, options?)` — walks `voyant.requiresSchemas` transitively from the modules listed in `voyant.config.ts`, dedupes, returns specifier strings (default) or absolute file paths (`style: "file"`). Throws on circular dependencies. New `voyant db schemas` debug command prints the resolved closure.

  ```ts
  // drizzle.config.ts
  import { defineConfig } from "drizzle-kit";
  import { resolveSchemas } from "@voyant-travel/cli/drizzle";
  import voyantConfig from "./voyant.config";

  export default defineConfig({
    schema: resolveSchemas(voyantConfig),
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: { url: process.env.DATABASE_URL! },
  });
  ```

  Adding a new module to `voyant.config.ts` now picks up its schema (and transitive schema deps) automatically — no more manual schema lists, no forgotten modules.

  **Migration impact for existing operator deployments**

  Apply `0004_steady_molten_man.sql` (column + new tables, non-destructive aside from the deliberate `accessibility_needs` text → encrypted-jsonb move) and `0005_condemned_nomad.sql` (cruise booking-extension tables — only relevant when the cruises module is mounted).

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/bookings@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/bookings@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/bookings@0.16.0
- @voyant-travel/core@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/hono@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/bookings@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/bookings@0.14.0
- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [7dfbc05]
- Updated dependencies [15dda79]
  - @voyant-travel/bookings@0.13.0
  - @voyant-travel/core@0.13.0
  - @voyant-travel/db@0.13.0
  - @voyant-travel/hono@0.13.0

## 0.12.0

### Minor Changes

- cc561ce: Adds the cruises module — a new opt-in vertical for cruise-selling travel agencies, designed natively against Voyant's existing module/extension/link conventions and reverse-engineered from the cross-line cruise-industry data shape (sailings, ships, decks, cabin categories, fare codes, occupancy grids, dated promo overlays, expedition enrichment programs).

  **`@voyant-travel/cruises`** — full server module:

  - 13 tables: cruises, sailings, ships, decks, cabin categories, cabins, prices, price components, days, sailing-day overrides, media, inclusions, search index, enrichment programs.
  - Pricing: a (sailing × cabin category × occupancy × fare code) grid with per-row price components (gratuities, OBC, port charges, taxes, NCF, airfare). Soft-FKs to `@voyant-travel/pricing` `priceCatalogs`/`priceSchedules` for promo overlays — no cruise-local promotions table.
  - Itinerary at two levels: `cruise_days` template + `cruise_sailing_days` per-sailing overrides (skipped ports, alternate times, ship swaps). `getEffectiveItinerary()` merges them.
  - River direction enum (`upstream | downstream | round_trip | one_way`) on sailings.
  - Expedition enrichment programs (naturalist / historian / photographer / lecturer / expert).
  - Money math (`composeQuote`) is a pure function performed in BigInt cents — supports occupancy variants, single-supplement %, second-guest pricing, and the addition/credit/inclusion price-component directions. 20 unit tests cover the math.
  - Booking integration: `booking_cruise_details` + `booking_group_cruise_details` extension tables, `cruisesBookingService.createCruiseBooking` (single cabin) and `createCruisePartyBooking` (multi-cabin via `bookingGroups` of new kind `cruise_party`). External-sailing bookings go through `createExternalCruiseBooking` which commits upstream first, then snapshots the connector booking ref.
  - **Provenance — local + external in one experience.** Cruises can be self-managed (operator owns the rows) or external (sourced through a registered `CruiseAdapter`). Admin routes use a unified-key parser that accepts both `cru_*` TypeIDs and `<provider>:<ref>` external keys; list endpoints interleave both sources via parallel `Promise.allSettled` adapter fan-out. External writes return 409. `POST /:key/refresh` re-fetches; `POST /:key/detach` does a one-way snapshot to local.
  - Adapter contract (`@voyant-travel/cruises/adapters`): `CruiseAdapter` interface with `listEntries` / `searchProjection` / `fetchCruise` / `fetchSailing` / `fetchSailingPricing` / `fetchSailingItinerary` / `fetchShip` / `listSailingsForCruise` / `createBooking`. Process-local registry (`registerCruiseAdapter`/`resolveCruiseAdapter`/`listCruiseAdapters`), TTL+LRU memoize decorator, and `MockCruiseAdapter` for tests. The Voyant Connect adapter is intentionally not built in this release — the contract is ready for it.
  - Search index (`cruise_search_index`): opt-in storefront projection. Local cruises are projected automatically by mutation hooks in `cruisesService`; adapters call `PUT /v1/admin/cruises/search-index/bulk` to push externals. Storefront `GET /v1/public/cruises` reads exclusively from this index for paginated/filterable browse with provenance-aware detail dispatch.
  - ~88 unit tests covering pricing math, key parsing, route validation, adapter registry, mock adapter, memoize decorator, and direction/enrichment validation.

  **`@voyant-travel/cruises-react`** — React Query hooks + Zod fetch client:

  - ~25 hooks: `useCruises` / `useCruise` / `useCruiseMutation`, `useSailings` / `useSailing` / `useSailingMutation`, `useShips` + ship-detail family, `usePrices` / `useQuote`, `useCruiseBookingMutation` (single + party), `useEnrichmentPrograms` / `useEnrichmentMutation`, `useExternalCruiseActions` (refresh / detach), `useSearchIndexMutation`, `useStorefrontCruises` / `useStorefrontCruise` / `useStorefrontSailing`.
  - Mirrors `@voyant-travel/crm-react` and `@voyant-travel/products-react` exactly: hierarchical query keys rooted at `["voyant", "cruises"]`, `queryOptions()` factories for SSR/router prefetch, envelope helpers, `VoyantCruisesProvider`, mutations that invalidate the parent resource and `setQueryData` on the detail.

  **`@voyant-travel/bookings`**: extends `bookingGroupKindEnum` with `cruise_party` so multi-cabin party bookings have a first-class group kind alongside `shared_room` and `other`. Pure additive; existing groups unaffected.

  **`@voyant-travel/db`**: registers TypeID prefixes for the cruise namespace (`cru`, `crsl`, `crsh`, `crdk`, `crcc`, `crcb`, `crpx`, `crpc`, `crdy`, `crsd`, `crme`, `crin`, `crsi`, `crep`).

  **`@voyant-travel/ui`** (registry only — versionless): adds the `voyant-cruises-*` shadcn registry components — `external-badge`, `cruise-card`, `cruise-list`, `pricing-grid` (the load-bearing cabin × occupancy matrix), `quote-display`, `enrichment-program-list`. Install via `shadcn add voyant-cruises-cruise-card` etc.

  **Example app** (`examples/nextjs-booking-portal`): adds `/cruises` listing + `/cruises/[slug]` detail pages backed by `/v1/public/cruises`, with mock data showing the local-vs-external dual-source UI.

  **Design doc**: full rationale, schema, and architecture in `docs/architecture/cruises-module.md` (745 lines).

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/bookings@0.12.0
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
