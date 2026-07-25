# @voyant-travel/notifications

## 0.138.0

### Minor Changes

- 5e03ae7: Replace every notification mutation path with required-idempotency durable
  admission, outbox publication, leased worker delivery, and canonical provider
  replay. This major release explicitly supersedes the `0.136.0`
  compatibility surface: request-scoped provider sends, `NotificationProvider.send`,
  `NotificationService` exports, generic direct-send routes, bundled local/Cloud
  provider shims, and optional notification idempotency are no longer supported.
  Provider packages now implement the public durable provider port and its
  non-delivering restart/replay/drift conformance probe. The send action becomes
  available only for the exact selected graph provider that passes that behavioral
  contract.

  Framework graph resolution now treats an absent external provider package as a
  valid disabled state for a conditional action. The action remains unavailable;
  selection, typed-port conformance, and ambiguity checks still apply when a
  provider is present.

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/quotes@0.133.0
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/legal@0.201.0
  - @voyant-travel/storefront@0.203.0
  - @voyant-travel/bookings@0.201.0

## 0.137.0

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
  - @voyant-travel/legal@0.200.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storefront@0.202.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/quotes@0.132.4

## 0.136.2

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/legal@0.199.0
  - @voyant-travel/quotes@0.132.3
  - @voyant-travel/storefront@0.201.0

## 0.136.1

### Patch Changes

- @voyant-travel/bookings@0.198.1
- @voyant-travel/finance@0.198.1
- @voyant-travel/legal@0.198.1
- @voyant-travel/storefront@0.200.1

## 0.136.0

### Minor Changes

- a4cf038: Add the package-owned durable operation required to restore the approved
  `send_notification` action: exact command replay, transactional
  requested/completed events, leased retries, dead-letter visibility, and
  provider-side idempotency plus reconciliation. Notification providers can now
  declare the optional `notification-provider-idempotency-v1` capability;
  providers without it fail closed for agent sends while retaining their existing
  request-scoped behavior. The action remains quarantined until a production
  provider can satisfy the new contract.

  The agent Tool now targets the existing active notification template for
  approval/audit instead of writing the email address or phone number into the
  action ledger, and returns an immutable accepted/pending delivery snapshot.
  Delivery happens asynchronously; poll `get_notification_delivery` with the
  returned id for the mutable sent/failed state.

## 0.135.2

### Patch Changes

- @voyant-travel/legal@0.198.0
- @voyant-travel/quotes@0.132.2
- @voyant-travel/storefront@0.200.0
- @voyant-travel/bookings@0.198.0
- @voyant-travel/finance@0.198.0

## 0.135.1

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [26b4c9a]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/legal@0.197.0
  - @voyant-travel/quotes@0.132.1
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/storefront@0.199.0

## 0.135.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [71c08aa]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/legal@0.196.0
  - @voyant-travel/quotes@0.132.0
  - @voyant-travel/storefront@0.198.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.134.2

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/legal@0.195.0
  - @voyant-travel/storefront@0.197.0
  - @voyant-travel/quotes@0.131.40

## 0.134.1

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/legal@0.194.0
  - @voyant-travel/storefront@0.196.0
  - @voyant-travel/quotes@0.131.39

## 0.134.0

### Patch Changes

- @voyant-travel/legal@0.193.0
- @voyant-travel/storefront@0.195.0
- @voyant-travel/bookings@0.193.0
- @voyant-travel/finance@0.193.0
- @voyant-travel/quotes@0.131.38

## 0.133.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/legal@0.192.1
  - @voyant-travel/quotes@0.131.37
  - @voyant-travel/storefront@0.194.1

## 0.133.2

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/storefront@0.194.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/legal@0.192.0
  - @voyant-travel/quotes@0.131.36

## 0.133.1

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/legal@0.191.0
  - @voyant-travel/storefront@0.193.0
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/quotes@0.131.35

## 0.133.0

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
  - @voyant-travel/legal@0.190.0
  - @voyant-travel/storefront@0.192.0
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/quotes@0.131.34
  - @voyant-travel/types@0.109.9

## 0.132.14

### Patch Changes

- @voyant-travel/bookings@0.189.0
- @voyant-travel/finance@0.189.0
- @voyant-travel/legal@0.189.0
- @voyant-travel/storefront@0.191.0
- @voyant-travel/quotes@0.131.33

## 0.132.13

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/legal@0.188.0
  - @voyant-travel/quotes@0.131.32
  - @voyant-travel/storefront@0.190.0
  - @voyant-travel/workflows@0.122.18

## 0.132.12

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/legal@0.187.0
- @voyant-travel/storefront@0.189.0
- @voyant-travel/quotes@0.131.31

## 0.132.11

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/legal@0.186.0
- @voyant-travel/storefront@0.188.0
- @voyant-travel/quotes@0.131.29

## 0.132.10

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/legal@0.185.0
  - @voyant-travel/storefront@0.187.0
  - @voyant-travel/quotes@0.131.28
  - @voyant-travel/bookings@0.185.0

## 0.132.9

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/legal@0.184.0
- @voyant-travel/storefront@0.186.0
- @voyant-travel/quotes@0.131.27

## 0.132.8

### Patch Changes

- Updated dependencies [8d370ef]
  - @voyant-travel/storefront@0.185.0
  - @voyant-travel/finance@0.183.0
  - @voyant-travel/bookings@0.183.0
  - @voyant-travel/legal@0.183.0
  - @voyant-travel/quotes@0.131.26

## 0.132.7

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/legal@0.182.4
- @voyant-travel/storefront@0.184.2
- @voyant-travel/workflows@0.122.16

## 0.132.6

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/legal@0.182.3
  - @voyant-travel/quotes@0.131.25
  - @voyant-travel/storefront@0.184.1
  - @voyant-travel/workflows@0.122.15

## 0.132.5

### Patch Changes

- @voyant-travel/storefront@0.184.0
- @voyant-travel/bookings@0.182.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/legal@0.182.0
- @voyant-travel/quotes@0.131.23

## 0.132.4

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/legal@0.181.0
  - @voyant-travel/quotes@0.131.21
  - @voyant-travel/storefront@0.183.0

## 0.132.3

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/legal@0.180.1
- @voyant-travel/quotes@0.131.20
- @voyant-travel/db@0.117.1
- @voyant-travel/bookings@0.180.1
- @voyant-travel/storefront@0.182.1
- @voyant-travel/workflows@0.122.14

## 0.132.2

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/storefront@0.182.0
  - @voyant-travel/legal@0.180.0
  - @voyant-travel/bookings@0.180.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/workflows@0.122.13
  - @voyant-travel/quotes@0.131.19

## 0.132.1

### Patch Changes

- @voyant-travel/storefront@0.181.0
- @voyant-travel/bookings@0.179.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/legal@0.179.0
- @voyant-travel/quotes@0.131.18

## 0.132.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/legal@0.178.0
- @voyant-travel/storefront@0.180.0
- @voyant-travel/workflows@0.122.12
- @voyant-travel/quotes@0.131.17

## 0.131.10

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/legal@0.177.0
  - @voyant-travel/quotes@0.131.16
  - @voyant-travel/storefront@0.179.0
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.131.9

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/storefront@0.178.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/legal@0.176.0
  - @voyant-travel/quotes@0.131.15
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.131.8

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/storefront@0.177.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/legal@0.175.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/quotes@0.131.14
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.131.7

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/legal@0.174.0
  - @voyant-travel/quotes@0.131.13
  - @voyant-travel/storefront@0.176.0
  - @voyant-travel/workflows@0.122.8

## 0.131.6

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/legal@0.173.0
- @voyant-travel/storefront@0.175.0
- @voyant-travel/quotes@0.131.12

## 0.131.5

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/storefront@0.174.0
  - @voyant-travel/legal@0.172.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/quotes@0.131.11
  - @voyant-travel/workflows@0.122.7

## 0.131.4

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/legal@0.171.1
  - @voyant-travel/quotes@0.131.10
  - @voyant-travel/storefront@0.173.1
  - @voyant-travel/workflows@0.122.6

## 0.131.3

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/legal@0.171.0
  - @voyant-travel/storefront@0.173.0
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/quotes@0.131.9

## 0.131.2

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/legal@0.170.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/quotes@0.131.8
  - @voyant-travel/storefront@0.172.0
  - @voyant-travel/workflows@0.122.5

## 0.131.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/legal@0.169.1
  - @voyant-travel/quotes@0.131.7
  - @voyant-travel/storefront@0.171.1
  - @voyant-travel/workflows@0.122.4

## 0.131.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/legal@0.169.0
  - @voyant-travel/storefront@0.171.0
  - @voyant-travel/quotes@0.131.6

## 0.130.8

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/legal@0.168.0
  - @voyant-travel/storefront@0.170.0
  - @voyant-travel/quotes@0.131.5
  - @voyant-travel/bookings@0.168.0

## 0.130.7

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/legal@0.167.0
  - @voyant-travel/storefront@0.169.0
  - @voyant-travel/quotes@0.131.4
  - @voyant-travel/bookings@0.167.0

## 0.130.6

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/legal@0.166.0
  - @voyant-travel/storefront@0.168.0
  - @voyant-travel/quotes@0.131.3
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflows@0.122.3

## 0.130.5

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/legal@0.165.0
  - @voyant-travel/storefront@0.167.0
  - @voyant-travel/quotes@0.131.2
  - @voyant-travel/bookings@0.165.0

## 0.130.4

### Patch Changes

- @voyant-travel/bookings@0.164.0
- @voyant-travel/finance@0.164.0
- @voyant-travel/legal@0.164.0
- @voyant-travel/storefront@0.166.0
- @voyant-travel/quotes@0.131.1

## 0.130.3

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/quotes@0.131.0
  - @voyant-travel/legal@0.163.0
  - @voyant-travel/storefront@0.165.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/workflows@0.122.2

## 0.130.2

### Patch Changes

- @voyant-travel/bookings@0.162.2
- @voyant-travel/finance@0.162.2
- @voyant-travel/legal@0.162.2
- @voyant-travel/workflows@0.122.1

## 0.130.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1
  - @voyant-travel/finance@0.162.1
  - @voyant-travel/legal@0.162.1
  - @voyant-travel/quotes@0.130.1

## 0.130.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/legal@0.162.0
  - @voyant-travel/quotes@0.130.0
  - @voyant-travel/storefront@0.164.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.129.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/legal@0.161.0
  - @voyant-travel/storefront@0.163.0
  - @voyant-travel/quotes@0.129.1

## 0.128.1

### Patch Changes

- f819273: Add the package-owned, exact-idempotent quote snapshot and vetted-template notification workflow, its guarded Tool/action, and the narrow Quotes-to-Notifications runtime port.
- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [33cc782]
- Updated dependencies [db5adce]
- Updated dependencies [f819273]
- Updated dependencies [c9b6144]
- Updated dependencies [eae32f8]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/quotes@0.129.0
  - @voyant-travel/legal@0.160.0
  - @voyant-travel/storefront@0.162.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/workflows@0.121.0

## 0.128.0

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/storefront@0.161.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/db@0.114.6
  - @voyant-travel/legal@0.159.0
  - @voyant-travel/workflows@0.120.4

## 0.127.0

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
  - @voyant-travel/legal@0.158.0
  - @voyant-travel/storefront@0.160.0
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.126.5

### Patch Changes

- @voyant-travel/bookings@0.157.0
- @voyant-travel/finance@0.157.0
- @voyant-travel/legal@0.157.0
- @voyant-travel/storefront@0.159.0

## 0.126.4

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/legal@0.156.1
  - @voyant-travel/storefront@0.158.1
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2

## 0.126.3

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/storefront@0.158.0
  - @voyant-travel/legal@0.156.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1

## 0.126.2

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
  - @voyant-travel/legal@0.155.1
  - @voyant-travel/storefront@0.157.1

## 0.126.1

### Patch Changes

- Updated dependencies [bb6e890]
- Updated dependencies [3f6694b]
  - @voyant-travel/legal@0.155.0
  - @voyant-travel/core@0.121.0
  - @voyant-travel/storefront@0.157.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/workflows@0.119.0

## 0.126.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/legal@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/storefront@0.156.0
  - @voyant-travel/workflows@0.118.0

## 0.125.0

### Minor Changes

- 490d132: Move standard Node runtime construction for Flights, Notifications, and Quotes proposal wiring into their domain packages.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Expose the selected graph and runtime-port providers to package runtime factories, then make MCP compose its graph and tool context without Operator-specific wiring.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Derive host-service runtime port bindings from deployment capabilities.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Compose Storefront runtime behavior through static package-owned graph ports and remove the Operator runtime loader.
- 490d132: Emit the Notifications OpenAPI document from its selected package graph declaration.
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/legal@0.153.0
  - @voyant-travel/storefront@0.155.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.124.0

### Minor Changes

- d771be3: Activate Notifications reminder and booking-confirmation subscribers through the selected Operator graph and a typed Node host runtime port.
- 02b4103: Publish package-owned subscriber runtime descriptors for reminder rules and booking-confirmation auto-dispatch behind one Notifications runtime service contract.

### Patch Changes

- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [a799a34]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/legal@0.152.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/workflows@0.116.0

## 0.123.5

### Patch Changes

- e5aa097: Activate package-owned workflow declarations through the generated deployment graph and deployment-supplied Node runtime services.
- 1081483: Declare the payment-session and notification-delivery capabilities required by Netopia's package-owned Voyant manifest.
- 6e3ec4e: Publish the reminder workflow deployment runtime service contract for graph activation.
- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [1081483]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/legal@0.151.4
  - @voyant-travel/workflows@0.115.2

## 0.123.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/finance@0.151.3
  - @voyant-travel/legal@0.151.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.123.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/finance@0.151.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/legal@0.151.2

## 0.123.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/bookings@0.151.2
  - @voyant-travel/hono@0.123.1

## 0.123.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/legal@0.151.1

## 0.123.0

### Minor Changes

- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- a370024: Publish package-owned deployment manifests for action ledger, notifications,
  operator settings, and realtime.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

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
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/legal@0.151.0
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.122.2

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/finance@0.150.0
  - @voyant-travel/legal@0.150.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.122.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/legal@0.149.1
  - @voyant-travel/hono@0.122.2

## 0.122.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/finance@0.149.0
- @voyant-travel/legal@0.149.0

## 0.121.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/finance@0.148.0
- @voyant-travel/legal@0.148.0

## 0.120.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/legal@0.147.0

## 0.119.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/finance@0.146.0
- @voyant-travel/legal@0.146.0

## 0.118.6

### Patch Changes

- @voyant-travel/bookings@0.145.0
- @voyant-travel/finance@0.145.0
- @voyant-travel/legal@0.145.0

## 0.118.5

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/finance@0.144.0
  - @voyant-travel/legal@0.144.0

## 0.118.4

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/finance@0.143.0
  - @voyant-travel/legal@0.143.0
  - @voyant-travel/types@0.107.1

## 0.118.3

### Patch Changes

- @voyant-travel/bookings@0.142.0
- @voyant-travel/finance@0.142.0
- @voyant-travel/legal@0.142.0

## 0.118.2

### Patch Changes

- 0811565: Narrow document-related table imports to schema-only legal and finance package surfaces so notification root imports no longer pull document renderer code into cold-start bundles.

## 0.118.1

### Patch Changes

- @voyant-travel/bookings@0.141.0
- @voyant-travel/finance@0.141.0
- @voyant-travel/legal@0.141.0

## 0.118.0

### Patch Changes

- @voyant-travel/bookings@0.140.0
- @voyant-travel/finance@0.140.0
- @voyant-travel/legal@0.140.0

## 0.117.0

### Minor Changes

- fc71db1: Add write/action + notification agent tools:

  - `@voyant-travel/quotes`: `accept_quote_version` (write, `quotes:write`,
    confirmation-required).
  - `@voyant-travel/finance`: `void_invoice` (destructive, `finance:void`,
    confirmation-required) — the void is a self-contained status transition.
  - `@voyant-travel/notifications`: `list_notification_deliveries` +
    `get_notification_delivery` (read, `notifications:read`).

  The operator registers them on the in-deployment MCP server. A `send_notification`
  tool is deliberately withheld (customer-facing dispatch is an abuse vector and needs
  the provider runtime + rate limiting); booking `cancel` / finance `refund` similarly
  need route-level runtime wiring and will follow as a separate increment.

- 05961f1: Add a **constrained** `send_notification` agent tool. To avoid the arbitrary
  email/SMS abuse vector, the tool accepts **only a vetted template** (`templateSlug`
  required; raw `subject`/`html`/`text` are rejected at the tool boundary), is gated on
  `notifications:send` (never granted by a wildcard), and is marked `destructive` +
  `confirmationRequired`. The operator dispatches it through the deployment's real
  notification-provider runtime (`createNotificationService(resolveNotificationProviders)`)
  — the same path the app uses.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/legal@0.139.0
  - @voyant-travel/db@0.109.5

## 0.116.13

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/legal@0.138.2

## 0.116.12

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/legal@0.138.1

## 0.116.11

### Patch Changes

- @voyant-travel/legal@0.138.0
- @voyant-travel/bookings@0.138.0
- @voyant-travel/finance@0.138.0

## 0.116.10

### Patch Changes

- 4c18cc6: Pass structured booking, traveler, payment, and payment schedule context to booking payment reminder templates.
- 1e5251d: Fix reminder stage channel template selection so active templates can be picked by slug and submitted as `templateSlug`.
- Updated dependencies [fd17317]
- Updated dependencies [53f949c]
  - @voyant-travel/hono@0.118.3
  - @voyant-travel/legal@0.137.5
  - @voyant-travel/bookings@0.137.5

## 0.116.9

### Patch Changes

- 89cc2c4: Resolve and persist email sender addresses before dispatch, and reject email sends when no sender can be resolved so deliveries cannot report `sent` with `fromAddress: null`.
- Updated dependencies [4eda12a]
  - @voyant-travel/finance@0.137.2

## 0.116.8

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/legal@0.137.1
  - @voyant-travel/bookings@0.137.1

## 0.116.7

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/finance@0.137.0
  - @voyant-travel/legal@0.137.0

## 0.116.6

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/finance@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/legal@0.136.2

## 0.116.5

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/finance@0.136.1
- @voyant-travel/legal@0.136.1

## 0.116.4

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/finance@0.136.0
  - @voyant-travel/legal@0.136.0

## 0.116.3

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/bookings@0.135.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/legal@0.135.0

## 0.116.2

### Patch Changes

- fac9297: Bump `@voyant-travel/cloud-sdk` to `^0.11.0` (from `^0.9.0`). The `0.x` caret previously capped the SDK below `0.10`, so this picks up the standardized JSON error envelope (`{ error, code?, requestId? }`) and the re-exported `VoyantApiError` / `CloudErrorCode`. Backward compatible — the email/SMS providers' usage is unchanged.

## 0.116.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/finance@0.134.1
  - @voyant-travel/legal@0.134.1

## 0.116.0

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
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/legal@0.134.0

## 0.115.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/legal@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/finance@0.133.0

## 0.114.9

### Patch Changes

- @voyant-travel/bookings@0.132.0
- @voyant-travel/finance@0.132.0
- @voyant-travel/legal@0.132.0

## 0.114.8

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/finance@0.131.2
  - @voyant-travel/legal@0.131.1
  - @voyant-travel/db@0.108.5

## 0.114.7

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/finance@0.131.0
- @voyant-travel/legal@0.131.0

## 0.114.6

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/finance@0.130.0
- @voyant-travel/legal@0.130.0

## 0.114.5

### Patch Changes

- @voyant-travel/bookings@0.129.0
- @voyant-travel/finance@0.129.0
- @voyant-travel/legal@0.129.0

## 0.114.4

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/legal@0.128.0

## 0.114.3

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/legal@0.127.0

## 0.114.2

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/finance@0.126.1
  - @voyant-travel/legal@0.126.1

## 0.114.1

### Patch Changes

- Updated dependencies [84b9d4b]
  - @voyant-travel/legal@0.126.0
  - @voyant-travel/bookings@0.126.0
  - @voyant-travel/finance@0.126.0

## 0.114.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/bookings@0.125.0
- @voyant-travel/finance@0.125.0
- @voyant-travel/legal@0.125.0
- @voyant-travel/hono@0.112.2

## 0.113.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/finance@0.124.0
- @voyant-travel/legal@0.124.0

## 0.112.0

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
  - @voyant-travel/legal@0.123.0
  - @voyant-travel/db@0.108.2

## 0.111.12

### Patch Changes

- d406a85: Default reminder stages without `maxSendsInStage` to one send so a final stage cannot repeat indefinitely unless a finite repeat cap is configured.

  Update the reminder stage editor copy and defaults so blank max-send caps are presented as the one-send default instead of unlimited repeats.

## 0.111.11

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [85caeef]
- Updated dependencies [85a13d3]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/legal@0.122.0
  - @voyant-travel/bookings@0.122.0

## 0.111.10

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [503a634]
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/legal@0.121.0
  - @voyant-travel/bookings@0.121.0

## 0.111.9

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/finance@0.120.1
- @voyant-travel/legal@0.120.1

## 0.111.8

### Patch Changes

- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [3e160d3]
- Updated dependencies [c3f4fa0]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [6196b3b]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/legal@0.120.0

## 0.111.7

### Patch Changes

- 1595c69: Split oversized notification reminder services and promotions/notification React modules into focused internal files while preserving existing public exports and behavior.

## 0.111.6

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/finance@0.119.1
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/legal@0.119.1

## 0.111.5

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/finance@0.119.0
  - @voyant-travel/legal@0.119.0

## 0.111.4

### Patch Changes

- @voyant-travel/bookings@0.118.0
- @voyant-travel/finance@0.118.0
- @voyant-travel/legal@0.118.0

## 0.111.3

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/finance@0.117.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/legal@0.117.1

## 0.111.2

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/finance@0.117.0
  - @voyant-travel/legal@0.117.0

## 0.111.1

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/finance@0.116.0
  - @voyant-travel/legal@0.116.0

## 0.111.0

### Patch Changes

- @voyant-travel/bookings@0.115.0
- @voyant-travel/finance@0.115.0
- @voyant-travel/legal@0.115.0

## 0.110.1

### Patch Changes

- @voyant-travel/bookings@0.114.0
- @voyant-travel/finance@0.114.0
- @voyant-travel/legal@0.114.0

## 0.110.0

### Patch Changes

- @voyant-travel/bookings@0.113.0
- @voyant-travel/finance@0.113.0
- @voyant-travel/legal@0.113.0

## 0.109.0

### Patch Changes

- @voyant-travel/bookings@0.112.0
- @voyant-travel/finance@0.112.0
- @voyant-travel/legal@0.112.0

## 0.108.0

### Patch Changes

- @voyant-travel/bookings@0.111.0
- @voyant-travel/finance@0.111.0
- @voyant-travel/legal@0.111.0

## 0.107.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/finance@0.110.0
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/legal@0.110.0

## 0.106.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/finance@0.109.0
  - @voyant-travel/legal@0.109.0
  - @voyant-travel/hono@0.105.2

## 0.105.2

### Patch Changes

- @voyant-travel/bookings@0.108.0
- @voyant-travel/finance@0.108.0
- @voyant-travel/legal@0.108.0

## 0.105.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/finance@0.107.1
  - @voyant-travel/legal@0.107.1

## 0.105.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/legal@0.107.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/finance@0.107.0
  - @voyant-travel/hono@0.104.2

## 0.104.5

### Patch Changes

- a0e117b: Stop payment-schedule reminders from sending for terminal bookings by closing open schedules during cancelled/expired booking transitions and by skipping payment reminders when the parent booking is not payable.
- Updated dependencies [a0e117b]
  - @voyant-travel/bookings@0.106.1

## 0.104.4

### Patch Changes

- @voyant-travel/legal@0.106.0
- @voyant-travel/bookings@0.106.0
- @voyant-travel/finance@0.106.0

## 0.104.3

### Patch Changes

- 28c5eb3: Add composite reminder-rule authoring with recoverable validation issues, idempotent replay, and hard-delete routes for notification templates and reminder rules.

## 0.104.2

### Patch Changes

- @voyant-travel/bookings@0.105.0
- @voyant-travel/finance@0.105.0
- @voyant-travel/legal@0.105.0

## 0.104.1

### Patch Changes

- ba5daa6: Stop stage-based notification reminder sweeps from automatically retrying failed
  one-shot reminder runs, and treat queued/skipped/failed reminder runs as attempts
  for stage cadence and caps.
  - @voyant-travel/bookings@0.104.1
  - @voyant-travel/core@0.104.1
  - @voyant-travel/db@0.104.1
  - @voyant-travel/finance@0.104.1
  - @voyant-travel/hono@0.104.1
  - @voyant-travel/legal@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/bookings@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/finance@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/legal@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/bookings@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/finance@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/legal@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/bookings@0.102.0
- @voyant-travel/core@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/finance@0.102.0
- @voyant-travel/hono@0.102.0
- @voyant-travel/legal@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
  - @voyant-travel/bookings@0.101.2
  - @voyant-travel/core@0.101.2
  - @voyant-travel/db@0.101.2
  - @voyant-travel/finance@0.101.2
  - @voyant-travel/hono@0.101.2
  - @voyant-travel/legal@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/finance@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/legal@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/bookings@0.101.0
- @voyant-travel/core@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/finance@0.101.0
- @voyant-travel/hono@0.101.0
- @voyant-travel/legal@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/bookings@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/finance@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/legal@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/finance@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/legal@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/bookings@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/finance@0.98.0
- @voyant-travel/hono@0.98.0
- @voyant-travel/legal@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/bookings@0.97.0
- @voyant-travel/core@0.97.0
- @voyant-travel/db@0.97.0
- @voyant-travel/finance@0.97.0
- @voyant-travel/hono@0.97.0
- @voyant-travel/legal@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/bookings@0.96.0
- @voyant-travel/core@0.96.0
- @voyant-travel/db@0.96.0
- @voyant-travel/finance@0.96.0
- @voyant-travel/hono@0.96.0
- @voyant-travel/legal@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/bookings@0.95.0
- @voyant-travel/core@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/finance@0.95.0
- @voyant-travel/hono@0.95.0
- @voyant-travel/legal@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/bookings@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/finance@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/legal@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/bookings@0.93.0
- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/finance@0.93.0
- @voyant-travel/hono@0.93.0
- @voyant-travel/legal@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/bookings@0.92.0
- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/finance@0.92.0
- @voyant-travel/hono@0.92.0
- @voyant-travel/legal@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/finance@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/legal@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/bookings@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/finance@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/legal@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/bookings@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/finance@0.89.0
- @voyant-travel/hono@0.89.0
- @voyant-travel/legal@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/bookings@0.88.0
- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/finance@0.88.0
- @voyant-travel/hono@0.88.0
- @voyant-travel/legal@0.88.0

## 0.87.1

### Patch Changes

- Updated dependencies [5be088f]
  - @voyant-travel/bookings@0.87.1
  - @voyant-travel/core@0.87.1
  - @voyant-travel/db@0.87.1
  - @voyant-travel/finance@0.87.1
  - @voyant-travel/hono@0.87.1
  - @voyant-travel/legal@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/bookings@0.87.0
- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/finance@0.87.0
- @voyant-travel/hono@0.87.0
- @voyant-travel/legal@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/bookings@0.86.0
- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/finance@0.86.0
- @voyant-travel/hono@0.86.0
- @voyant-travel/legal@0.86.0

## 0.85.4

### Patch Changes

- Updated dependencies [bed4a3f]
  - @voyant-travel/bookings@0.85.4
  - @voyant-travel/core@0.85.4
  - @voyant-travel/db@0.85.4
  - @voyant-travel/finance@0.85.4
  - @voyant-travel/hono@0.85.4
  - @voyant-travel/legal@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/bookings@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/finance@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/legal@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/finance@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/legal@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/bookings@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/finance@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/legal@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/bookings@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/finance@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/legal@0.85.0

## 0.84.4

### Patch Changes

- Updated dependencies [f3f8de1]
  - @voyant-travel/bookings@0.84.4
  - @voyant-travel/core@0.84.4
  - @voyant-travel/db@0.84.4
  - @voyant-travel/finance@0.84.4
  - @voyant-travel/hono@0.84.4
  - @voyant-travel/legal@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/finance@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/legal@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/bookings@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/finance@0.84.2
- @voyant-travel/hono@0.84.2
- @voyant-travel/legal@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/finance@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/legal@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/finance@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/legal@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/bookings@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/finance@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/legal@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/bookings@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/finance@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/legal@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/bookings@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/finance@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/legal@0.82.1

## 0.82.0

### Patch Changes

- Updated dependencies [577f909]
- Updated dependencies [79ce168]
  - @voyant-travel/bookings@0.82.0
  - @voyant-travel/core@0.82.0
  - @voyant-travel/db@0.82.0
  - @voyant-travel/finance@0.82.0
  - @voyant-travel/hono@0.82.0
  - @voyant-travel/legal@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/finance@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/legal@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/finance@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/legal@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/finance@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/legal@0.81.19

## 0.81.18

### Patch Changes

- Updated dependencies [93874e4]
  - @voyant-travel/bookings@0.81.18
  - @voyant-travel/core@0.81.18
  - @voyant-travel/db@0.81.18
  - @voyant-travel/finance@0.81.18
  - @voyant-travel/hono@0.81.18
  - @voyant-travel/legal@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/bookings@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/finance@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/legal@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/finance@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/legal@0.81.16

## 0.81.15

### Patch Changes

- Updated dependencies [b6bc138]
  - @voyant-travel/bookings@0.81.15
  - @voyant-travel/core@0.81.15
  - @voyant-travel/db@0.81.15
  - @voyant-travel/finance@0.81.15
  - @voyant-travel/hono@0.81.15
  - @voyant-travel/legal@0.81.15

## 0.81.14

### Patch Changes

- Updated dependencies [0a77ff9]
  - @voyant-travel/bookings@0.81.14
  - @voyant-travel/core@0.81.14
  - @voyant-travel/db@0.81.14
  - @voyant-travel/finance@0.81.14
  - @voyant-travel/hono@0.81.14
  - @voyant-travel/legal@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [36421aa]
- Updated dependencies [28dca55]
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/finance@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/legal@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/bookings@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/finance@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/legal@0.81.12

## 0.81.11

### Patch Changes

- Updated dependencies [ef079f4]
  - @voyant-travel/bookings@0.81.11
  - @voyant-travel/core@0.81.11
  - @voyant-travel/db@0.81.11
  - @voyant-travel/finance@0.81.11
  - @voyant-travel/hono@0.81.11
  - @voyant-travel/legal@0.81.11

## 0.81.10

### Patch Changes

- Updated dependencies [6c6a008]
  - @voyant-travel/bookings@0.81.10
  - @voyant-travel/core@0.81.10
  - @voyant-travel/db@0.81.10
  - @voyant-travel/finance@0.81.10
  - @voyant-travel/hono@0.81.10
  - @voyant-travel/legal@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/finance@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/legal@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/finance@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/legal@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/finance@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/legal@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/bookings@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/finance@0.81.6
- @voyant-travel/hono@0.81.6
- @voyant-travel/legal@0.81.6

## 0.81.5

### Patch Changes

- Updated dependencies [7d8a977]
  - @voyant-travel/bookings@0.81.5
  - @voyant-travel/core@0.81.5
  - @voyant-travel/db@0.81.5
  - @voyant-travel/finance@0.81.5
  - @voyant-travel/hono@0.81.5
  - @voyant-travel/legal@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/finance@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/legal@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/finance@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/legal@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/bookings@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/finance@0.81.2
- @voyant-travel/hono@0.81.2
- @voyant-travel/legal@0.81.2

## 0.81.1

### Patch Changes

- Updated dependencies [2ce08ff]
  - @voyant-travel/bookings@0.81.1
  - @voyant-travel/core@0.81.1
  - @voyant-travel/db@0.81.1
  - @voyant-travel/finance@0.81.1
  - @voyant-travel/hono@0.81.1
  - @voyant-travel/legal@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/finance@0.81.0
  - @voyant-travel/hono@0.81.0
  - @voyant-travel/legal@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/bookings@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/finance@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/legal@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/bookings@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/finance@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/legal@0.80.17

## 0.80.16

### Patch Changes

- Updated dependencies [dbcc0da]
  - @voyant-travel/bookings@0.80.16
  - @voyant-travel/core@0.80.16
  - @voyant-travel/db@0.80.16
  - @voyant-travel/finance@0.80.16
  - @voyant-travel/hono@0.80.16
  - @voyant-travel/legal@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/finance@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/legal@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/bookings@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/finance@0.80.14
- @voyant-travel/hono@0.80.14
- @voyant-travel/legal@0.80.14

## 0.80.13

### Patch Changes

- Updated dependencies [55d99af]
  - @voyant-travel/bookings@0.80.13
  - @voyant-travel/core@0.80.13
  - @voyant-travel/db@0.80.13
  - @voyant-travel/finance@0.80.13
  - @voyant-travel/hono@0.80.13
  - @voyant-travel/legal@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/bookings@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/finance@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/legal@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/bookings@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/finance@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/legal@0.80.11

## 0.80.10

### Patch Changes

- Updated dependencies [97cae5e]
  - @voyant-travel/bookings@0.80.10
  - @voyant-travel/core@0.80.10
  - @voyant-travel/db@0.80.10
  - @voyant-travel/finance@0.80.10
  - @voyant-travel/hono@0.80.10
  - @voyant-travel/legal@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/finance@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/legal@0.80.9

## 0.80.8

### Patch Changes

- Updated dependencies [6ba4515]
  - @voyant-travel/bookings@0.80.8
  - @voyant-travel/core@0.80.8
  - @voyant-travel/db@0.80.8
  - @voyant-travel/finance@0.80.8
  - @voyant-travel/hono@0.80.8
  - @voyant-travel/legal@0.80.8

## 0.80.7

### Patch Changes

- Updated dependencies [e16eb2f]
  - @voyant-travel/bookings@0.80.7
  - @voyant-travel/core@0.80.7
  - @voyant-travel/db@0.80.7
  - @voyant-travel/finance@0.80.7
  - @voyant-travel/hono@0.80.7
  - @voyant-travel/legal@0.80.7

## 0.80.6

### Patch Changes

- Updated dependencies [f7df51b]
  - @voyant-travel/bookings@0.80.6
  - @voyant-travel/core@0.80.6
  - @voyant-travel/db@0.80.6
  - @voyant-travel/finance@0.80.6
  - @voyant-travel/hono@0.80.6
  - @voyant-travel/legal@0.80.6

## 0.80.5

### Patch Changes

- Updated dependencies [f27b01f]
- Updated dependencies [d1ae342]
  - @voyant-travel/bookings@0.80.5
  - @voyant-travel/core@0.80.5
  - @voyant-travel/db@0.80.5
  - @voyant-travel/finance@0.80.5
  - @voyant-travel/hono@0.80.5
  - @voyant-travel/legal@0.80.5

## 0.80.4

### Patch Changes

- Updated dependencies [a411b1c]
  - @voyant-travel/bookings@0.80.4
  - @voyant-travel/core@0.80.4
  - @voyant-travel/db@0.80.4
  - @voyant-travel/finance@0.80.4
  - @voyant-travel/hono@0.80.4
  - @voyant-travel/legal@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/finance@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/legal@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/finance@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/legal@0.80.2

## 0.80.1

### Patch Changes

- Updated dependencies [9a71c89]
  - @voyant-travel/bookings@0.80.1
  - @voyant-travel/core@0.80.1
  - @voyant-travel/db@0.80.1
  - @voyant-travel/finance@0.80.1
  - @voyant-travel/hono@0.80.1
  - @voyant-travel/legal@0.80.1

## 0.80.0

### Patch Changes

- Updated dependencies [9473eb8]
  - @voyant-travel/bookings@0.80.0
  - @voyant-travel/core@0.80.0
  - @voyant-travel/db@0.80.0
  - @voyant-travel/finance@0.80.0
  - @voyant-travel/hono@0.80.0
  - @voyant-travel/legal@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/bookings@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/finance@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/legal@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/bookings@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/finance@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/legal@0.78.0

## 0.77.13

### Patch Changes

- Updated dependencies [70a32ab]
  - @voyant-travel/bookings@0.77.13
  - @voyant-travel/core@0.77.13
  - @voyant-travel/db@0.77.13
  - @voyant-travel/finance@0.77.13
  - @voyant-travel/hono@0.77.13
  - @voyant-travel/legal@0.77.13

## 0.77.12

### Patch Changes

- bf74cd4: Rename the invoice issuance status from `sent` to `issued`.
- Updated dependencies [bf74cd4]
  - @voyant-travel/bookings@0.77.12
  - @voyant-travel/core@0.77.12
  - @voyant-travel/db@0.77.12
  - @voyant-travel/finance@0.77.12
  - @voyant-travel/hono@0.77.12
  - @voyant-travel/legal@0.77.12

## 0.77.11

### Patch Changes

- Updated dependencies [437fb58]
  - @voyant-travel/bookings@0.77.11
  - @voyant-travel/core@0.77.11
  - @voyant-travel/db@0.77.11
  - @voyant-travel/finance@0.77.11
  - @voyant-travel/hono@0.77.11
  - @voyant-travel/legal@0.77.11

## 0.77.10

### Patch Changes

- Updated dependencies [5751c4e]
  - @voyant-travel/bookings@0.77.10
  - @voyant-travel/core@0.77.10
  - @voyant-travel/db@0.77.10
  - @voyant-travel/finance@0.77.10
  - @voyant-travel/hono@0.77.10
  - @voyant-travel/legal@0.77.10

## 0.77.9

### Patch Changes

- Updated dependencies [10e3ed5]
  - @voyant-travel/bookings@0.77.9
  - @voyant-travel/core@0.77.9
  - @voyant-travel/db@0.77.9
  - @voyant-travel/finance@0.77.9
  - @voyant-travel/hono@0.77.9
  - @voyant-travel/legal@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/bookings@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/finance@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/legal@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/bookings@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/finance@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/legal@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/bookings@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/finance@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/legal@0.77.6

## 0.77.5

### Patch Changes

- Updated dependencies [6e522cb]
  - @voyant-travel/bookings@0.77.5
  - @voyant-travel/core@0.77.5
  - @voyant-travel/db@0.77.5
  - @voyant-travel/finance@0.77.5
  - @voyant-travel/hono@0.77.5
  - @voyant-travel/legal@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/bookings@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/finance@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/legal@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/bookings@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/finance@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/legal@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/bookings@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/finance@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/legal@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/finance@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/legal@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/finance@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/legal@0.77.0

## 0.76.0

### Patch Changes

- Updated dependencies [abf673d]
  - @voyant-travel/bookings@0.76.0
  - @voyant-travel/core@0.76.0
  - @voyant-travel/db@0.76.0
  - @voyant-travel/finance@0.76.0
  - @voyant-travel/hono@0.76.0
  - @voyant-travel/legal@0.76.0

## 0.75.7

### Patch Changes

- Updated dependencies [827c25e]
  - @voyant-travel/bookings@0.75.7
  - @voyant-travel/core@0.75.7
  - @voyant-travel/db@0.75.7
  - @voyant-travel/finance@0.75.7
  - @voyant-travel/hono@0.75.7
  - @voyant-travel/legal@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/bookings@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/finance@0.75.6
- @voyant-travel/hono@0.75.6
- @voyant-travel/legal@0.75.6

## 0.75.5

### Patch Changes

- Updated dependencies [84a32bb]
- Updated dependencies [192c9aa]
  - @voyant-travel/bookings@0.75.5
  - @voyant-travel/core@0.75.5
  - @voyant-travel/db@0.75.5
  - @voyant-travel/finance@0.75.5
  - @voyant-travel/hono@0.75.5
  - @voyant-travel/legal@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/bookings@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/finance@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/legal@0.75.4

## 0.75.3

### Patch Changes

- Updated dependencies [38167cd]
  - @voyant-travel/bookings@0.75.3
  - @voyant-travel/core@0.75.3
  - @voyant-travel/db@0.75.3
  - @voyant-travel/finance@0.75.3
  - @voyant-travel/hono@0.75.3
  - @voyant-travel/legal@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/bookings@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/finance@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/legal@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/bookings@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/finance@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/legal@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/finance@0.75.0
  - @voyant-travel/hono@0.75.0
  - @voyant-travel/legal@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/bookings@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/finance@0.74.2
- @voyant-travel/hono@0.74.2
- @voyant-travel/legal@0.74.2

## 0.74.1

### Patch Changes

- Updated dependencies [225a483]
  - @voyant-travel/bookings@0.74.1
  - @voyant-travel/core@0.74.1
  - @voyant-travel/db@0.74.1
  - @voyant-travel/finance@0.74.1
  - @voyant-travel/hono@0.74.1
  - @voyant-travel/legal@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/bookings@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/finance@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/legal@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/bookings@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/finance@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/legal@0.73.1

## 0.73.0

### Patch Changes

- Updated dependencies [856da86]
  - @voyant-travel/bookings@0.73.0
  - @voyant-travel/core@0.73.0
  - @voyant-travel/db@0.73.0
  - @voyant-travel/finance@0.73.0
  - @voyant-travel/hono@0.73.0
  - @voyant-travel/legal@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/bookings@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/finance@0.72.0
- @voyant-travel/hono@0.72.0
- @voyant-travel/legal@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/bookings@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/finance@0.71.0
- @voyant-travel/hono@0.71.0
- @voyant-travel/legal@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/bookings@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/finance@0.70.0
- @voyant-travel/hono@0.70.0
- @voyant-travel/legal@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/bookings@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/finance@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/legal@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/bookings@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/finance@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/legal@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/bookings@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/finance@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/legal@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/bookings@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/finance@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/legal@0.67.0

## 0.66.6

### Patch Changes

- Updated dependencies [2a40d26]
  - @voyant-travel/bookings@0.66.6
  - @voyant-travel/core@0.66.6
  - @voyant-travel/db@0.66.6
  - @voyant-travel/finance@0.66.6
  - @voyant-travel/hono@0.66.6
  - @voyant-travel/legal@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/finance@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/legal@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/finance@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/legal@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/bookings@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/finance@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/legal@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/bookings@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/finance@0.66.2
- @voyant-travel/hono@0.66.2
- @voyant-travel/legal@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/bookings@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/finance@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/legal@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/bookings@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/finance@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/legal@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/bookings@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/finance@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/legal@0.65.0

## 0.64.1

### Patch Changes

- 572dde4: Add configurable customer-facing payment-link base URLs for generated links and notification template context.
- Updated dependencies [572dde4]
  - @voyant-travel/bookings@0.64.1
  - @voyant-travel/core@0.64.1
  - @voyant-travel/db@0.64.1
  - @voyant-travel/finance@0.64.1
  - @voyant-travel/hono@0.64.1
  - @voyant-travel/legal@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/finance@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/legal@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/bookings@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/finance@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/legal@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/finance@0.63.0
  - @voyant-travel/hono@0.63.0
  - @voyant-travel/legal@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/bookings@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/finance@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/legal@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/bookings@0.62.2
- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/finance@0.62.2
- @voyant-travel/hono@0.62.2
- @voyant-travel/legal@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/bookings@0.62.1
- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/finance@0.62.1
- @voyant-travel/hono@0.62.1
- @voyant-travel/legal@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/finance@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/legal@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/bookings@0.61.0
- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/finance@0.61.0
- @voyant-travel/hono@0.61.0
- @voyant-travel/legal@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/bookings@0.60.0
- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/finance@0.60.0
- @voyant-travel/hono@0.60.0
- @voyant-travel/legal@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/bookings@0.59.0
- @voyant-travel/core@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/finance@0.59.0
- @voyant-travel/hono@0.59.0
- @voyant-travel/legal@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/bookings@0.58.0
- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/finance@0.58.0
- @voyant-travel/hono@0.58.0
- @voyant-travel/legal@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/bookings@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/finance@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/legal@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/bookings@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/finance@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/legal@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/finance@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/legal@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/bookings@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/finance@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/legal@0.55.0

## 0.54.0

### Patch Changes

- Updated dependencies [3117d27]
  - @voyant-travel/bookings@0.54.0
  - @voyant-travel/core@0.54.0
  - @voyant-travel/db@0.54.0
  - @voyant-travel/finance@0.54.0
  - @voyant-travel/hono@0.54.0
  - @voyant-travel/legal@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/bookings@0.53.2
- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/finance@0.53.2
- @voyant-travel/hono@0.53.2
- @voyant-travel/legal@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/bookings@0.53.1
- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/finance@0.53.1
- @voyant-travel/hono@0.53.1
- @voyant-travel/legal@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/db@0.53.0
  - @voyant-travel/finance@0.53.0
  - @voyant-travel/hono@0.53.0
  - @voyant-travel/legal@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/finance@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/legal@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/finance@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/legal@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Quiet/auxiliary updates.

  - `@voyant-travel/notifications`: `booking.confirmed` subscriber honors a new `suppressNotifications` flag on the event payload so operators can confirm a booking without firing the customer-facing email/doc bundle (data corrections, manual hand-offs).
  - `@voyant-travel/customer-portal`: public service + validation tightened around the new booking tax-preview shape; integration tests updated to assert the new response.
  - `@voyant-travel/i18n`: new admin strings for the bookings billing dialog, finance tax-preview labels, CRM operator screens, and products operator surface (EN + RO).

- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/finance@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/legal@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/finance@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/legal@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/bookings@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/finance@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/legal@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/bookings@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/finance@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/legal@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/bookings@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/finance@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/legal@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/finance@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/legal@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/bookings@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/finance@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/legal@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/finance@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/legal@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/bookings@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/finance@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/legal@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/bookings@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/finance@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/legal@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/bookings@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/finance@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/legal@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/bookings@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/finance@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/legal@0.50.2

## 0.50.1

### Patch Changes

- Updated dependencies [7b768c5]
  - @voyant-travel/bookings@0.50.1
  - @voyant-travel/core@0.50.1
  - @voyant-travel/db@0.50.1
  - @voyant-travel/finance@0.50.1
  - @voyant-travel/hono@0.50.1
  - @voyant-travel/legal@0.50.1

## 0.50.0

### Patch Changes

- Updated dependencies [140d0ad]
  - @voyant-travel/bookings@0.50.0
  - @voyant-travel/core@0.50.0
  - @voyant-travel/db@0.50.0
  - @voyant-travel/finance@0.50.0
  - @voyant-travel/hono@0.50.0
  - @voyant-travel/legal@0.50.0

## 0.49.0

### Minor Changes

- 3029f10: Add first-class booking document-bundle lifecycle hooks for confirmation and fully-paid transitions, with default legal/finance bundle composition and host-overridable notification policy.

### Patch Changes

- @voyant-travel/bookings@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/finance@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/legal@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/bookings@0.48.0
- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/finance@0.48.0
- @voyant-travel/hono@0.48.0
- @voyant-travel/legal@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [65408c6]
  - @voyant-travel/bookings@0.47.0
  - @voyant-travel/core@0.47.0
  - @voyant-travel/db@0.47.0
  - @voyant-travel/finance@0.47.0
  - @voyant-travel/hono@0.47.0
  - @voyant-travel/legal@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [72b99b2]
  - @voyant-travel/bookings@0.46.0
  - @voyant-travel/core@0.46.0
  - @voyant-travel/db@0.46.0
  - @voyant-travel/finance@0.46.0
  - @voyant-travel/hono@0.46.0
  - @voyant-travel/legal@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/bookings@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/finance@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/legal@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/bookings@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/finance@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/legal@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/finance@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/legal@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [786945f]
  - @voyant-travel/bookings@0.42.0
  - @voyant-travel/core@0.42.0
  - @voyant-travel/db@0.42.0
  - @voyant-travel/finance@0.42.0
  - @voyant-travel/hono@0.42.0
  - @voyant-travel/legal@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/bookings@0.41.3
- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/finance@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/legal@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/bookings@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/finance@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/legal@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/bookings@0.41.1
- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/finance@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/legal@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/bookings@0.41.0
- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/finance@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/legal@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/bookings@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/finance@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/legal@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/bookings@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/finance@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/legal@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
- Updated dependencies [2297949]
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/core@0.39.0
  - @voyant-travel/db@0.39.0
  - @voyant-travel/finance@0.39.0
  - @voyant-travel/hono@0.39.0
  - @voyant-travel/legal@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/bookings@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/finance@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/legal@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/bookings@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/finance@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/legal@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/bookings@0.38.0
- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/finance@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/legal@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/bookings@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/finance@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/legal@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
- Updated dependencies [f014fd2]
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/core@0.37.0
  - @voyant-travel/db@0.37.0
  - @voyant-travel/finance@0.37.0
  - @voyant-travel/hono@0.37.0
  - @voyant-travel/legal@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/core@0.36.0
  - @voyant-travel/db@0.36.0
  - @voyant-travel/finance@0.36.0
  - @voyant-travel/hono@0.36.0
  - @voyant-travel/legal@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/bookings@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/finance@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/legal@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [9095837]
- Updated dependencies [6e4a90f]
- Updated dependencies [24b6624]
- Updated dependencies [a37d4af]
  - @voyant-travel/bookings@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/finance@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/legal@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/core@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/finance@0.33.1
  - @voyant-travel/hono@0.33.1
  - @voyant-travel/legal@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/bookings@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/finance@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/legal@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/bookings@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/finance@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/legal@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/bookings@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/finance@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/legal@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/bookings@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/finance@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/legal@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/finance@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/legal@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/bookings@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/finance@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/legal@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/bookings@0.31.3
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/finance@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/legal@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/bookings@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/finance@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/legal@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/bookings@0.31.1
- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/finance@0.31.1
- @voyant-travel/hono@0.31.1
- @voyant-travel/legal@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/bookings@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/finance@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/legal@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/bookings@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/finance@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/legal@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/bookings@0.30.6
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/finance@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/legal@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/bookings@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/finance@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/legal@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/bookings@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/finance@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/legal@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/bookings@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/finance@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/legal@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/bookings@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/finance@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/legal@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/bookings@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/finance@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/legal@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/bookings@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/finance@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/legal@0.30.0

## 0.29.0

### Minor Changes

- 4a6523e: Drop legacy single-offset reminder path; polish channel editor (#488).

  Stage channel editor:

  - Replaces the two free-text "Template id / Template slug" fields with
    a single async `<TemplatePicker>` (typeahead via `AsyncCombobox`)
    filtered by the channel selected at the top of the dialog. Picking
    a template now resolves to the template id directly — no more
    guessing slugs. Switching channel clears the picked template since
    the next list will be filtered.
  - Provider becomes a `<Select>` with **Automatic** / **Resend
    (email)** / **Twilio (SMS)** options. "Automatic" maps to `null`
    (use the deployment default for that channel).
  - Drops the freeform "Recipient role" field. Recipient resolution is
    driven by the booking's primary contact / first traveler today;
    the role tag wasn't actually consulted by the dispatcher.

  Backend cleanup (we're in beta — no users, no compat needed):

  - Drops the `relative_days_from_due_date` column from
    `notification_reminder_rules` (migration
    `0003_drop_legacy_columns.sql`).
  - Drops the `holiday_calendar` column from `notification_settings`
    (UI was already gone; the underlying public-holidays integration is
    out of scope for this iteration).
  - Removes the legacy single-offset dispatcher path entirely:
    `queueDueReminders` and `runDueReminders` now delegate straight to
    the stage-aware versions, and the four legacy helpers
    (`queueBookingPaymentScheduleReminder`,
    `queueInvoiceReminder`, `sendBookingPaymentScheduleReminder`,
    `sendInvoiceReminder`) plus the `ruleHasStages` skip check are
    deleted. Net ~500 lines removed from `service-reminders.ts`.
  - `relativeDaysFromDueDate` removed from validation, the run-summary
    schema, the notifications-react record schema, the operator
    template detail page, the legacy rule dialog, and the checkout
    service's reminder-runs join projection.
  - Legacy integration tests `reminders.test.ts` and
    `reminder-tasks.test.ts` are deleted; the stage-based
    `reminder-sequences.test.ts` covers the path that survives.

- 4a6523e: Add reminder sequences: stages, channels, and notification settings (#488).

  Reminder rules can now own an ordered list of **stages**, each with its own anchor (`due_date`, `booking_created_at`, `departure_date`, `invoice_issued_at`, or `last_send_at`), eligibility window (`[startDays, endDays]`), and cadence (`once`, `every_n_days`, or `escalating` with `daysUntilDueGT/LT` buckets). Each stage can fan out to multiple channels, each carrying its own template and recipient kind. This subsumes the legacy single-offset rule (one stage, `cadence: once`, anchor `due_date`) and the counter-based escalation pattern from the issue (one stage with `cadence: escalating(...)` plus sibling stages keyed on cumulative `maxSendsInStage`).

  The dispatcher gains a stage-aware path that runs first; rules without stages fall through to the legacy date-offset path (back-compat). The migration creates one stage + one channel per existing rule mirroring the legacy behavior, so existing fires keep working unchanged.

  New tables: `notification_reminder_rule_stages` (typeid `ntrs`), `notification_reminder_stage_channels` (typeid `ntsc`), `notification_settings` (typeid `nset`). New columns on `notification_reminder_rules`: `priority`, `suppression_group`. New API surface: stage CRUD, stage channel CRUD, `/notification-settings`, and a read-only `/reminders/preview` that returns what _would_ fire on a given date with reasoning attached.

  The dispatcher now respects:

  - Quiet hours / blackout dates / weekend skips (per `notification_settings`, opt-out per stage via `respectQuietHours`).
  - Cross-rule dedup via `suppression_group` and a per-recipient daily channel rate limit.
  - Multi-channel stages (one decision → one delivery per channel, dedupe key includes channel).

  Engine PR is the first of three milestones; UI hooks (`@voyant-travel/notifications-react`) and a new `@voyant-travel/notifications-ui` package follow.

### Patch Changes

- 4a6523e: Reminder rule dialog: make the default template optional (#488).

  Stage channels carry their own templates and override the rule-level default,
  so the legacy rule-creation dialog no longer needs to require a template at
  form-submit time. Without this, clicking **Create Rule** with no template
  selected silently failed Zod validation and the dialog appeared frozen.

  Backend `insertNotificationReminderRuleSchema` and
  `updateNotificationReminderRuleSchema` drop the `templateId || templateSlug`
  refinement to match.

  Also narrows the dispatcher's per-target booking lookup from a full-row
  `select()` to the columns actually used by recipient resolution. This avoids
  projecting every column declared in the bookings schema and tolerates
  deployments / test stubs that lag the latest column set.

- 4a6523e: Push a date envelope into the dispatcher's open-target SQL (#488).

  Closes the perf caveat noted on PR #494: previously
  `fetchOpenPaymentScheduleTargets` / `fetchOpenInvoiceTargets` returned
  every open row and the in-app stage walk filtered them by
  anchor + window. With the partial indexes from `0002` that's already
  fast on most deployments, but for tens of thousands of open rows × N
  active rules the per-sweep memory footprint grows.

  `computeAnchorDateEnvelope(stages, today, anchor)` inverts the
  `inWindow` math (`anchor + start ≤ today ≤ anchor + end` →
  `today − end ≤ anchor ≤ today − start`) and unions the ranges across
  all stages that share the requested anchor. The fetchers now accept
  a `DateEnvelopes` map and add a `BETWEEN` clause to the WHERE so
  Postgres only returns targets whose anchor date could plausibly fire
  today.

  Pushdown is enabled per-anchor when at least one of the rule's stages
  anchors on it: `due_date` for both target types, `invoice_issued_at`
  for invoices. Stages anchored on `departure_date`, `booking_created_at`,
  or `last_send_at` fall through to the unfiltered fetch — those are
  expected to be rare and the in-app window check still rejects misses.

  Adds 4 unit tests for `computeAnchorDateEnvelope` (null, single
  stage, union across stages, mixed-anchor isolation). Integration
  suite stays 3/3.

  Also makes `templates/operator/scripts/migrate.ts` log applied
  migrations and prints a clear "restart any long-lived workers" line
  afterwards — drizzle's prepared-statement cache is keyed to the old
  schema and any worker that started before the migration will fail on
  the first query touching a changed column.

- 4a6523e: Honor the stage channel's template at delivery time (#488).

  Bug: when the operator's hourly cron sweep
  (`notifications.send-due-reminders`) queued a stage's per-channel run
  and the `notifications.deliver-reminder` workflow picked it up,
  `deliverReminderRun` was passing `rule.templateId` /
  `rule.templateSlug` / `rule.channel` / `rule.provider` to the
  sender — i.e. the rule-level fallback. The stage channel's own
  template (the one operators picked in the channel editor) was never
  consulted, so reminders went out with the wrong template (or
  silently failed if the rule had no fallback template).

  Fix: introduce `resolveChannelOverride(db, run, rule)` that reads
  `run.metadata.stageChannelId` (which the dispatcher writes when it
  queues the run) and looks up the stage channel. The queued sender
  helpers now use the override's `channel` / `templateId` /
  `templateSlug` / `provider` and only fall back to rule-level values
  when the stage channel can't be resolved.

  Also narrows several `db.select().from(bookings|invoices|...)` calls
  that were projecting every drizzle-declared column. The narrower
  projections only ask for the fields the dispatcher actually reads,
  so deployments / test stubs that lag the latest column set don't
  break delivery.

  Adds an end-to-end integration test
  (`reminder-sequences.test.ts > "queues per-channel and uses the
stage channel's template at delivery time"`) that creates two
  templates, gives the rule the wrong default and the stage channel
  the correct one, queues, delivers, and asserts the recipient got
  the stage channel's subject and body.

- Updated dependencies [3af39d1]
- Updated dependencies [3420711]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/finance@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/legal@0.29.0

## 0.28.3

### Patch Changes

- Updated dependencies [60ef432]
  - @voyant-travel/bookings@0.28.3
  - @voyant-travel/core@0.28.3
  - @voyant-travel/db@0.28.3
  - @voyant-travel/finance@0.28.3
  - @voyant-travel/hono@0.28.3
  - @voyant-travel/legal@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/bookings@0.28.2
- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/finance@0.28.2
- @voyant-travel/hono@0.28.2
- @voyant-travel/legal@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/bookings@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/finance@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/legal@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/bookings@0.28.0
- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/finance@0.28.0
- @voyant-travel/hono@0.28.0
- @voyant-travel/legal@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/bookings@0.27.0
- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/finance@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/legal@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/bookings@0.26.9
- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/finance@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/legal@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/bookings@0.26.8
- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/finance@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/legal@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/bookings@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/finance@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/legal@0.26.7

## 0.26.6

### Patch Changes

- Updated dependencies [571e340]
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/core@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/finance@0.26.6
  - @voyant-travel/hono@0.26.6
  - @voyant-travel/legal@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/bookings@0.26.5
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/finance@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/legal@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/bookings@0.26.4
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/finance@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/legal@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/bookings@0.26.3
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/finance@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/legal@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/bookings@0.26.2
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/finance@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/legal@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/finance@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/legal@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/bookings@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/finance@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/legal@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/bookings@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/finance@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/legal@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/bookings@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/finance@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/legal@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/bookings@0.24.2
- @voyant-travel/core@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/finance@0.24.2
- @voyant-travel/hono@0.24.2
- @voyant-travel/legal@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/bookings@0.24.1
- @voyant-travel/core@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/finance@0.24.1
- @voyant-travel/hono@0.24.1
- @voyant-travel/legal@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/bookings@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/finance@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/legal@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/bookings@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/finance@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/legal@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/bookings@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/finance@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/legal@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/bookings@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/finance@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/legal@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/finance@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/legal@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [cc3eddd]
  - @voyant-travel/bookings@0.20.0
  - @voyant-travel/core@0.20.0
  - @voyant-travel/db@0.20.0
  - @voyant-travel/finance@0.20.0
  - @voyant-travel/hono@0.20.0
  - @voyant-travel/legal@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/bookings@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/finance@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/legal@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/bookings@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/finance@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/legal@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: Retired `@voyant-travel/voyant-cloud`. SDK v0.6.0 ships the env-bindings helpers natively (`getVoyantCloudClient` / `tryGetVoyantCloudClient` / `VoyantCloudConfigError` / `VoyantCloudEnv`) — consumers import directly from `@voyant-travel/cloud-sdk`. `@voyant-travel/notifications` cloud providers now type-import `VoyantCloudClient` from `@voyant-travel/cloud-sdk`.
- 66d722d: `resolveDb` callbacks in `createNotificationsHonoModule` and `createLegalHonoModule` now return `AnyDrizzleDb` (the `PostgresJsDatabase | NeonHttpDatabase` union from `@voyant-travel/db`) instead of strictly `PostgresJsDatabase`. Templates wiring `getDbFromHyperdrive` no longer need the `as unknown as PostgresJsDatabase` apology cast.

  New shared type alias `AnyDrizzleDb` exported from `@voyant-travel/db`. Also normalized three `bindings: unknown` parameter types to `bindings: Record<string, unknown>` in `packages/legal/src/contracts/routes.ts` (`resolveDocumentGenerator`, `resolveDocumentDownloadUrl`, `resolveEventBus`) — was previously inconsistent with the rest of the workspace.

### Patch Changes

- 66d722d: Removed the unused `@voyant-travel/vault` and `@voyant-travel/verify` wrapper packages. They were thin abstractions over `@voyant-travel/cloud-sdk` calls (`vault.getSecret`, `verify.start`/`check`) with zero source-code importers anywhere. Templates that need vault or verify primitives now call the SDK directly via `getVoyantCloudClient(env).vault.getSecret(...)` etc.
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/bookings@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/finance@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/legal@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [a4bc773]
  - @voyant-travel/bookings@0.16.0
  - @voyant-travel/core@0.16.0
  - @voyant-travel/db@0.16.0
  - @voyant-travel/finance@0.16.0
  - @voyant-travel/hono@0.16.0
  - @voyant-travel/legal@0.16.0
  - @voyant-travel/voyant-cloud@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/bookings@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/finance@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/legal@0.15.0
- @voyant-travel/voyant-cloud@0.15.0

## 0.14.0

### Minor Changes

- 93fd1a5: Voyant Cloud is now the default email/SMS/verify/vault provider for templates. Resend/Twilio adapters and auto-provider-resolution have been removed from `@voyant-travel/notifications`; templates wire `@voyant-travel/voyant-cloud` directly.

  **New packages:**

  - `@voyant-travel/voyant-cloud` — `getVoyantCloudClient(env)` (throws when `VOYANT_CLOUD_API_KEY` is missing) and `tryGetVoyantCloudClient(env)` (returns `null`). Wraps `@voyant-travel/cloud-sdk`.
  - `@voyant-travel/verify` — `VerifyProvider` interface (`start` / `check`) plus `createVoyantCloudVerifyProvider({ client })` and `createLocalVerifyProvider()` for dev. `createVerifyService(provider)` is a thin wrapper.
  - `@voyant-travel/vault` — `VaultProvider` interface (`getSecret(slug, key)`) plus `createVoyantCloudVaultProvider({ client })` and `createEnvVaultProvider({ env, resolveEnvKey? })` for self-hosters. `createVaultService(provider)` adds `(slug,key)` caching and `requireSecret`.

  **Breaking changes — `@voyant-travel/notifications`:**

  - Removed `createResendProvider`, `createTwilioProvider`, `createDefaultNotificationProviders`, `createResendProviderFromEnv`, `createTwilioProviderFromEnv`. Removed sub-paths `./providers/resend`, `./providers/twilio`, `./provider-resolution`. The `local` provider stays for dev.
  - Added `createVoyantCloudEmailProvider({ client, from, replyTo? })` and `createVoyantCloudSmsProvider({ client, from? })` (sub-paths `./providers/voyant-cloud-email`, `./providers/voyant-cloud-sms`).
  - `buildNotificationTaskRuntime(env, options)` now throws when neither `providers` nor `resolveProviders` is supplied — there are no built-in defaults.

  **Breaking change — `@voyant-travel/plugin-netopia`:**

  - `buildNetopiaNotificationRuntime` now throws `NetopiaNotificationRuntimeError` when neither `resolveNotificationProviders` nor `notificationProviders` is supplied. Templates must inject providers explicitly.

  **Migration for self-hosters who want raw Resend/Twilio:** implement `NotificationProvider` against your transport of choice and register it in your template's `src/lib/notifications.ts`. The interface is unchanged and remains the public extension point.

### Patch Changes

- Updated dependencies [93fd1a5]
  - @voyant-travel/bookings@0.14.0
  - @voyant-travel/core@0.14.0
  - @voyant-travel/db@0.14.0
  - @voyant-travel/finance@0.14.0
  - @voyant-travel/hono@0.14.0
  - @voyant-travel/legal@0.14.0
  - @voyant-travel/voyant-cloud@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [7dfbc05]
- Updated dependencies [15dda79]
  - @voyant-travel/bookings@0.13.0
  - @voyant-travel/core@0.13.0
  - @voyant-travel/db@0.13.0
  - @voyant-travel/finance@0.13.0
  - @voyant-travel/hono@0.13.0
  - @voyant-travel/legal@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/bookings@0.12.0
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/finance@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/legal@0.12.0

## 0.11.0

### Patch Changes

- Updated dependencies [fe905b0]
  - @voyant-travel/bookings@0.11.0
  - @voyant-travel/core@0.11.0
  - @voyant-travel/db@0.11.0
  - @voyant-travel/finance@0.11.0
  - @voyant-travel/hono@0.11.0
  - @voyant-travel/legal@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
- Updated dependencies [29a581a]
  - @voyant-travel/bookings@0.10.0
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/finance@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/legal@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/bookings@0.9.0
- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/finance@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/legal@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/bookings@0.8.0
  - @voyant-travel/core@0.8.0
  - @voyant-travel/db@0.8.0
  - @voyant-travel/finance@0.8.0
  - @voyant-travel/hono@0.8.0
  - @voyant-travel/legal@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [96612b3]
  - @voyant-travel/bookings@0.7.0
  - @voyant-travel/core@0.7.0
  - @voyant-travel/db@0.7.0
  - @voyant-travel/finance@0.7.0
  - @voyant-travel/hono@0.7.0
  - @voyant-travel/legal@0.7.0

## 0.6.9

### Patch Changes

- Updated dependencies [7619ef0]
  - @voyant-travel/bookings@0.6.9
  - @voyant-travel/core@0.6.9
  - @voyant-travel/db@0.6.9
  - @voyant-travel/finance@0.6.9
  - @voyant-travel/hono@0.6.9
  - @voyant-travel/legal@0.6.9

## 0.6.8

### Patch Changes

- b218885: Add composite list indexes for notification admin queries.
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/bookings@0.6.8
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/finance@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/legal@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/bookings@0.6.7
- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/finance@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/legal@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/bookings@0.6.6
- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/finance@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/legal@0.6.6

## 0.6.5

### Patch Changes

- Updated dependencies [ae9933b]
  - @voyant-travel/bookings@0.6.5
  - @voyant-travel/core@0.6.5
  - @voyant-travel/db@0.6.5
  - @voyant-travel/finance@0.6.5
  - @voyant-travel/hono@0.6.5
  - @voyant-travel/legal@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/bookings@0.6.4
- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/finance@0.6.4
- @voyant-travel/hono@0.6.4
- @voyant-travel/legal@0.6.4

## 0.6.3

### Patch Changes

- 93d3734: Make worker-driven due reminder processing durable by queueing reminder runs before provider delivery and delivering each run in its own retryable background task.
- d3c6937: Add a narrow execution lock surface and use it to serialize worker-driven notification reminder sweeps across processes.
- Updated dependencies [d3c6937]
  - @voyant-travel/bookings@0.6.3
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/finance@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/legal@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/bookings@0.6.2
- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/finance@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/legal@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/bookings@0.6.1
- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/finance@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/legal@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/bookings@0.6.0
- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/finance@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/legal@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/bookings@0.5.0
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/finance@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/legal@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/bookings@0.4.5
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/finance@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/legal@0.4.5

## 0.4.4

### Patch Changes

- 9349604: Enrich notification reminder run reads with linked rule, delivery, and entity
  context, and add direct reminder-run lookup for admin workflows.
  - @voyant-travel/bookings@0.4.4
  - @voyant-travel/core@0.4.4
  - @voyant-travel/db@0.4.4
  - @voyant-travel/finance@0.4.4
  - @voyant-travel/hono@0.4.4
  - @voyant-travel/legal@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/bookings@0.4.3
- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/finance@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/legal@0.4.3

## 0.4.2

### Patch Changes

- 8de4602: Add optional event-bus hooks around document primitives.

  - `@voyant-travel/legal` contract document generation routes/services can now emit
    `contract.document.generated`
  - `@voyant-travel/finance` invoice document generation can emit
    `invoice.document.generated`, and settlement reconciliation can emit
    `invoice.settled`
  - `@voyant-travel/notifications` booking document sends can emit
    `booking.documents.sent`

  These stay at the primitive layer so apps can orchestrate their own document
  policies without Voyant owning the full workflow.

- Updated dependencies [8de4602]
  - @voyant-travel/bookings@0.4.2
  - @voyant-travel/core@0.4.2
  - @voyant-travel/db@0.4.2
  - @voyant-travel/finance@0.4.2
  - @voyant-travel/hono@0.4.2
  - @voyant-travel/legal@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [4c4ea3c]
- Updated dependencies [a49630a]
  - @voyant-travel/bookings@0.4.1
  - @voyant-travel/core@0.4.1
  - @voyant-travel/db@0.4.1
  - @voyant-travel/finance@0.4.1
  - @voyant-travel/hono@0.4.1
  - @voyant-travel/legal@0.4.1

## 0.4.0

### Minor Changes

- e84fe0f: Add first-class booking document bundle and send workflows. Notifications can
  now list booking-scoped contract/invoice/proforma artifacts, send email
  attachments, and deliver those attachments through Resend using artifact
  download URLs or custom attachment resolvers.
- e84fe0f: Add invoice-targeted reminder rules and runs so unpaid invoice/proforma
  documents created for bank-transfer checkout flows can use the same first-class
  reminder engine and checkout reminder visibility as schedule-backed reminders.

### Patch Changes

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/bookings@0.4.0
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/finance@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/legal@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Add a first-class public storefront verification flow with email and SMS
  challenge start/confirm routes, pluggable developer-supplied senders, and
  built-in notification-provider adapters including Resend email and Twilio SMS.
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/bookings@0.3.1
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/finance@0.3.1
  - @voyant-travel/hono@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/bookings@0.3.0
- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/finance@0.3.0
- @voyant-travel/hono@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/bookings@0.2.0
- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/finance@0.2.0
- @voyant-travel/hono@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/bookings@0.1.1
- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/finance@0.1.1
- @voyant-travel/hono@0.1.1
