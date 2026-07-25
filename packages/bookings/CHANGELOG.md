# @voyant-travel/bookings

## 0.204.0

## 0.203.0

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
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/bookings-contracts@0.110.0

## 0.202.0

## 0.201.1

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

## 0.201.0

## 0.200.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/reporting-contracts@0.3.6
  - @voyant-travel/bookings-contracts@0.109.2

## 0.199.0

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/reporting-contracts@0.3.5

## 0.198.1

## 0.198.0

## 0.197.0

### Patch Changes

- b07a0a3: Add an explicit handler-owned durable result protocol for existing-target Tool
  commands, including atomic package-owned operation intent preparation, exact
  admission, stable replay context, organization-bound approval continuity, and
  framework/runtime contract validation. Existing-target command payloads are
  restricted to immutable, acyclic JSON values so their runtime identity cannot
  diverge from canonical fingerprinting; that sanitized frozen value is the
  authoritative target, fingerprint, claim, and handler snapshot.
- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/reporting-contracts@0.3.4

## 0.196.0

### Minor Changes

- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.

### Patch Changes

- a6460e2: Add explicit created-target action metadata and fail closed unless handler-owned
  Tools declare a durable command claim, replay, and canonical result-reference
  contract. Adopt the shared transaction-owning created-command executor for
  Bookings reservations, stop asking MCP callers to invent generated target IDs,
  and fail approval-bearing created commands closed until handler control
  propagation exists.
- Propagate isolated handler-owned action controls through Tool context and support
  transactionally validated approval-required created-target commands.
- Updated dependencies [c1f9cdf]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/reporting-contracts@0.3.3

## 0.195.0

### Minor Changes

- e3a1e17: Add the bookings-owned `reserve_booking` Tool with handler-owned idempotency, canonical action-ledger metadata, and an immutable booking result reference.

## 0.194.1

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1

## 0.193.0

## 0.192.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/reporting-contracts@0.3.2

## 0.192.0

## 0.191.0

## 0.190.0

### Minor Changes

- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.

### Patch Changes

- 228b57d: Migrate package-owned scheduled product operations from workflow registrations to payload-free jobs selected through the deployment graph. The jobs retain durable authority in their owning domains and resolve execution dependencies through package runtime ports.
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/types@0.109.9
  - @voyant-travel/reporting-contracts@0.3.1

## 0.189.0

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/workflows@0.122.18

## 0.187.0

## 0.186.1

## 0.186.0

## 0.185.0

## 0.184.0

## 0.183.0

## 0.182.2

### Patch Changes

- @voyant-travel/workflows@0.122.16

## 0.182.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/workflows@0.122.15

## 0.182.0

## 0.181.0

### Patch Changes

- 464815c: Report export, base-currency reporting, and a redesigned builder.

  - Add report export in CSV, XLSX, and visual PDF (charts stay charts; only table
    widgets render as tables) via a new `GET /reports/:id/export` route and a
    client-side visual PDF composer.
  - Remove report versioning (versions/runs routes, tables, and retention): the
    editable draft is the single source of truth. Reporting datasets now expose a
    `defaultDateField` so the page date window applies without a per-report knob.
  - Add a `reportCurrency=base` execution mode: Finance receivables consolidate
    every amount into the operator base currency using the recording-time FX
    snapshot (`base_*_cents`), so a report can show one cross-currency total. The
    query language gains `between` and `in (...)` operators and a typed
    `ReportDatasetQueryError`.
  - Redesign the reporting-react builder to match the admin aesthetic: page date
    window, base-currency toggle, export menu, widget-preview and configuration
    Sheets, a CodeMirror query editor for custom widgets, and a silent autosave
    with an unsaved-changes guard.
  - Fix the Bookings/Finance reporting time-grain grouping (literal `date_trunc`
    grain) that previously errored under `group by`.

- Updated dependencies [464815c]
  - @voyant-travel/reporting-contracts@0.3.0

## 0.180.1

### Patch Changes

- @voyant-travel/bookings-contracts@0.109.1
- @voyant-travel/db@0.117.1
- @voyant-travel/workflows@0.122.14

## 0.180.0

### Patch Changes

- @voyant-travel/workflows@0.122.13

## 0.179.0

## 0.178.0

### Patch Changes

- @voyant-travel/workflows@0.122.12

## 0.177.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.175.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/reporting-contracts@0.2.1
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.174.0

### Minor Changes

- b8b25b7: Add the composable reporting platform: module-owned semantic datasets and widget presets,
  cross-module full-page templates, persisted editable report drafts, immutable published versions,
  bounded query parsing and execution, source-scope authorization, and standard Operator selection.
  Bookings and Finance now contribute initial operational reporting content.

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/reporting-contracts@0.2.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/workflows@0.122.8

## 0.173.0

## 0.172.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/workflows@0.122.7

## 0.171.2

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.
- Updated dependencies [1881293]
  - @voyant-travel/hono@0.129.1

## 0.171.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/workflows@0.122.6

## 0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/workflows@0.122.5

## 0.169.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/workflows@0.122.4

## 0.169.0

## 0.168.0

## 0.167.0

## 0.166.0

### Patch Changes

- @voyant-travel/workflows@0.122.3

## 0.165.0

## 0.164.0

## 0.163.0

### Minor Changes

- 52352c4: Store custom-field values exclusively as `custom_fields[namespace][key]`.
  Owner-scoped value operations derive namespaces from trusted definition
  context, ordinary entity routes preserve non-operator namespaces, and
  definition rename/delete cleanup is delegated to the package that owns each
  entity table.
- 52352c4: Remove project-local TypeScript custom-field declarations, discovery globs,
  executable validation callbacks, and code/database merge helpers. The generic
  custom-fields package now owns canonical value routes and dispatches operations
  to selected entity-owning packages through typed runtime contributions, with no
  Relationships compatibility adapter.

### Patch Changes

- 52352c4: Resolve custom-field definitions exclusively from persisted Settings records.
  Bookings and Relationships now share the package-owned database resolver.
  Project-local TypeScript authoring is removed by the completed custom-fields
  cutline.
- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

- 52352c4: Persist custom-field namespace, owner, lifecycle, and provenance metadata.
  Operator definitions use the reserved `custom` namespace, app operations are
  owner-constrained, platform definitions derive ownership from the selected
  target, and Settings renders non-operator definitions as read-only.
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/bookings-contracts@0.109.0
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/workflows@0.122.2

## 0.162.2

### Patch Changes

- @voyant-travel/workflows@0.122.1

## 0.162.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0

## 0.162.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/action-ledger@0.110.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.161.0

### Patch Changes

- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1

## 0.160.0

### Minor Changes

- 701ccc4: Add approval-gated agent Tools for booking cancellation and invoice refunds issued as credit notes, with exact command fingerprint validation and linked action-ledger execution records.
- 5f15e2e: Add typed, provider-neutral Tools for booking extras, departure extra manifests
  and selections, booking requirements and questions, triggers, and traveler
  answers. Scope staff and customer discovery explicitly, keep booking PII behind
  its dedicated grant, bind sensitive reads and writes to selected graph actions,
  and omit destructive operations until a deployment selects a delete policy.

### Patch Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- db5adce: Fail closed before selected graph Tool dispatch by binding each capability to its action-ledger
  policy. Advertise invocation controls in discovery, enforce confirmation, target, idempotency,
  fingerprint, approval, and principal semantics, and record required-ledger execution outcomes.

  Keep the existing package-owned booking cancellation and invoice refund approval workflows as
  explicit handler-enforced policies so their domain-state fingerprints and atomic ledgers are not
  double-gated.

- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/workflows@0.121.0

## 0.159.0

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- 552acbf: Publish an external-consumer-safe Zod peer range and refresh Bookings so its public dependency
  range no longer selects the historical `@voyant-travel/tools@0.0.0` manifest.
- 9c85101: Compile one canonical event catalog from selected package manifests and expose it through
  generated deployment artifacts, graph runtimes, a package-owned admin API, and an admin event
  reference page. Reject duplicate event type authorities while preserving legitimate emitters,
  and ratchet persistence mutation coverage in the phase-5 authority checker.
- Updated dependencies [7e9f77a]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/db@0.114.6
  - @voyant-travel/workflows@0.120.4

## 0.158.0

### Minor Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

### Patch Changes

- Updated dependencies [73ab096]
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.157.0

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/bookings-contracts@0.108.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2

## 0.156.0

### Minor Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/bookings-contracts@0.108.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1

## 0.155.2

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.

## 0.155.1

### Patch Changes

- cc85042: Make deployment provider selection authoritative for Node storage, cache, shared
  state, and rate limiting. Replace vendor-specific object-store bindings and R2
  shims with logical media/document stores, a memory provider, an AWS SDK v3
  S3-compatible provider, and package-selected custom adapters. Add a portable
  storage provider conformance runner, resolve adapters from the `storage.object`
  graph provider, and make provider config/secret/resource usage explicit. Keep
  distributed shared state and rate-limit KV authoritative by bypassing the
  cache-only process-local L1, and move guest booking lookups onto the selected
  atomic rate-limit store. Remove the former R2/SigV4 exports.
- Updated dependencies [818ea84]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/workflows@0.120.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/action-ledger@0.108.3

## 0.155.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/workflows@0.119.0

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/workflows@0.118.0

## 0.153.0

### Patch Changes

- 047c3f9: Move booking and payment runtime configuration behind package-owned graph factories and typed deployment ports.
- 490d132: Allow disjoint selected API bundles to contribute to one package-owned OpenAPI document and move the Bookings admin and public surfaces onto that authority.
- 490d132: Add package-owned runtime contributor APIs for deployment-supplied Bookings, Finance, and Quotes adapters.
- 490d132: Declare the remaining package-owned OpenAPI documents backed by committed operations and preserve exact graph API ownership at shared route mounts.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
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
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.152.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/workflows@0.116.0

## 0.151.5

### Patch Changes

- e5aa097: Activate package-owned workflow declarations through the generated deployment graph and deployment-supplied Node runtime services.
- 01d5034: Publish the stale-hold workflow deployment runtime service contract for graph activation.
- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/workflows@0.115.2

## 0.151.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.151.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2

## 0.151.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/hono@0.123.1

## 0.151.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1

## 0.151.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for booking requirements and the
  bookings, distribution, MICE, and quotes extension surfaces.
- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- e3dc5a9: Declare the existing customer and commerce admin routes, navigation, slots, copy, and widget contributions in their package-owned Voyant manifests.
- a370024: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.
- e3dc5a9: Derive the bookings graph action manifest and canonical action-ledger registry
  from one package-owned declaration source, preserving persisted capability
  identity, established graph action names, and policy metadata with an end-to-end
  parity test.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
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
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.150.0

### Minor Changes

- 496f2ef: Add the dependency-light package-owned deployment manifest authoring interface,
  publish the bookings manifest through `./voyant`, and let framework graph
  resolution consume the same contract.

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.149.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.149.0

## 0.148.0

## 0.147.0

## 0.146.0

## 0.145.0

## 0.144.0

### Minor Changes

- ba6c30a: Add a vertical enrichment seam to the public guest-booking overview so
  storefront "manage my booking" / confirmation surfaces can render
  accommodation specifics from the public API alone (issue #2969).

  Deployments can register a per-`booking_item_type` enricher via the new
  `overviewItemEnrichers` option on the bookings route runtime. Each enricher
  receives the overview items of its type and returns an opaque `details`
  block that is attached to the matching overview item, keyed by booking item
  id. Enrichment is best-effort — a failing enricher is skipped rather than
  failing the guest-authorized overview.

  `@voyant-travel/accommodations` ships the first enricher
  (`enrichStayBookingOverviewItems`, exported from
  `@voyant-travel/accommodations/booking-overview-enricher`), contributing
  property, room type, rate plan, meal plan and per-night rate details. The
  framework composition wires it to the `accommodation` item type.

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings-contracts@0.107.0

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/types@0.107.1

## 0.142.1

## 0.142.0

## 0.141.3

## 0.141.2

## 0.141.1

## 0.141.0

## 0.140.0

## 0.139.5

## 0.139.4

### Patch Changes

- 9678a59: Import booking PII KMS helpers through the explicit utils KMS subpath so release builds do not depend on the utils root barrel declaration cache.

## 0.139.3

### Patch Changes

- 386595a: Expose a booking cancellation settlement runtime hook and persist cancellation reasons plus settlement metadata on booking activity entries.

## 0.139.2

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

## 0.139.1

## 0.139.0

### Minor Changes

- fc71db1: Add read-only agent tools (`./tools`) for four more domains, following the
  module-owned-tools pattern over each package's existing service:

  - `@voyant-travel/bookings`: `list_bookings` + `get_booking` (non-PII, `bookings:read`).
  - `@voyant-travel/finance`: `list_invoices` + `get_invoice` (`finance:read`).
  - `@voyant-travel/quotes`: `list_quotes` + `get_quote` (`quotes:read`).
  - `@voyant-travel/relationships`: `list_people` / `get_person` / `list_organizations` /
    `get_organization` (`crm:read`).

  The operator registers them on the in-deployment MCP server, so `/v1/admin/mcp` now
  serves trips, products, bookings, finance, quotes, and CRM tools, each gated per-tool
  by scope + audience.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [1655995]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.138.10

## 0.138.9

## 0.138.8

## 0.138.7

## 0.138.6

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/action-ledger@0.105.11

## 0.138.5

### Patch Changes

- b254511: Normalize currency inputs safely and prevent booking header totals from drifting from booking items.
- 141bd2b: Reconcile draft booking items when overriding a booking to confirmed, block item mutations for cancelled bookings, and validate cost currency when cost amounts are entered.
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings-contracts@0.106.7
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10

## 0.138.4

### Patch Changes

- 1544a59: Keep booking detail traveler additions in sync with booking pax, traveler category,
  and existing booking item traveler assignments. The traveler dialog now exposes
  category assignment, and the traveler table reflects revealed travel-document
  details when no uploaded document rows exist.

## 0.138.3

### Patch Changes

- c081c71: Keep booking activity and metadata current for note, document, supplier, invoice, and payment child mutations.

## 0.138.2

### Patch Changes

- d388565: Refresh booking detail caches after booking item mutations and record booking item deletions in the booking activity log.

## 0.138.1

### Patch Changes

- a5dfd8f: Hydrate the bookings-owned child collections in the admin booking detail read.

  `GET /v1/admin/bookings/{id}` now returns the booking together with its `items`,
  `travelers`, and `documents` arrays instead of the flat booking row alone. These
  records previously existed in the database but were only reachable through the
  per-collection sibling endpoints, so clients that consumed the detail response
  on its own saw the nested collections as `null`/absent. Traveler PII continues to
  follow the same reveal/redaction gate as the standalone travelers read.

  Finance-owned records (payments, invoices) are intentionally not inlined here to
  respect the module boundary (bookings must not depend on finance); they remain
  served by the finance booking-scoped admin routes and are composed at the
  deployment boundary.

- Updated dependencies [88edbe6]
  - @voyant-travel/core@0.111.1
  - @voyant-travel/hono@0.118.4

## 0.138.0

## 0.137.7

## 0.137.6

## 0.137.5

### Patch Changes

- Updated dependencies [fd17317]
  - @voyant-travel/hono@0.118.3

## 0.137.4

## 0.137.3

## 0.137.2

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/action-ledger@0.105.9

## 0.137.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/action-ledger@0.105.8

## 0.136.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2

## 0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/bookings-contracts@0.106.4
  - @voyant-travel/db@0.109.2

## 0.135.0

### Patch Changes

- @voyant-travel/bookings-contracts@0.106.3
- @voyant-travel/db@0.109.1

## 0.134.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7

## 0.134.0

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
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/utils@0.105.4

## 0.133.0

### Minor Changes

- 4abf9a2: Deployment team management + granular member RBAC (voyant#2085).

  - `@voyant-travel/types`: `member-roles` (preset bundles reusing the API-key permission catalog) + `settings`/`team` resources.
  - `@voyant-travel/auth`: `cloud-broker` member-management client + assertion `scopes`.
  - `@voyant-travel/hono`: opt-in staff-session scope enforcement in `requireActor` (`VOYANT_RBAC_ENFORCE`) + `isStaffRbacEnforced`.
  - `@voyant-travel/admin`: auth-mode-aware `TeamSettingsPage` with a granular permission editor.
  - `@voyant-travel/bookings`/`legal`: PII reveal gated on `bookings-pii:read` under enforcement.
  - `@voyant-travel/db`: `user_profiles.permissions` + `cloud_auth_user_links.scopes`.

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/bookings-contracts@0.106.2

## 0.132.0

## 0.131.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/db@0.108.5

## 0.131.0

## 0.130.0

## 0.129.1

### Patch Changes

- 4a6d62f: Use current booking status values in resource capacity checks while keeping completed bookings counted.

## 0.129.0

## 0.128.0

## 0.127.0

### Minor Changes

- 435a5d1: Extract the availability domain into a new foundational `@voyant-travel/availability` package, and complete D.2 per-package migration onboarding for the last schema-owning packages.

  - **@voyant-travel/availability (new):** owns the `availability_*` schema (slots, rules, start times, holds, pickups, capacity) — previously buried in operations. Ships its own D.2 migration.
  - **operations:** its availability **services and routes stay**, now importing the schema from `@voyant-travel/availability` (the barrel re-exports it for runtime consumers); operations' migration no longer owns the availability tables. Fixes the module direction — bookings/operations/accommodations consume availability, rather than reaching into operations for an inventory primitive.
  - **bookings:** drops the hard cross-package FK from `booking_allocations.availability_slot_id` to `availability_slots` (it referenced a stale local duplicate); the column is now a plain indexed id per module decoupling. The refund workflow keeps a runtime-only reference to the availability table.
  - **framework-migrations:** bundle migration drops the removed FK constraint.

  All package sources verified column-for-column against the bundle and apply together cleanly on a fresh D.2 database (union).

## 0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/bookings-contracts@0.106.1
- @voyant-travel/db@0.108.3
- @voyant-travel/hono@0.112.2

## 0.124.0

### Patch Changes

- @voyant-travel/hono@0.112.1

## 0.123.0

### Minor Changes

- 04681f3: Adopt custom fields on `booking` — the first entity consumer of the `@voyant-travel/core/custom-fields` registry.

  - A `custom_fields jsonb default '{}'` column on `bookings` (framework bundle migration `0001`).
  - Booking create/update routes validate the `customFields` payload at the boundary against the deployment's injected registry (`validateBookingCustomFields`): unknown keys, missing required, and wrong types are rejected 400; only registry-approved values are persisted. Writes that carry `customFields` when the deployment declares none are rejected.
  - The registry is injected through `BookingRouteRuntimeOptions.customFields` → `createBookingsHonoModule` → a new optional `FrameworkProviders.customFields` provider, which a deployment supplies (the operator wires its discovered `operatorCustomFields`).

  Read paths return `custom_fields` as part of the booking row. Oracle-verified (`bundle + links == live schema`). Per-entity adoption continues with `person`/`product`; export/invoice/search consumption of `customFieldsVisibleIn` is a follow-up. See `docs/architecture/custom-fields.md`.

- 39d48fe: Custom-fields unification (phase 1b — DB-backed definitions + per-request resolver). The custom-field registry is now resolved per request from two sources, so runtime-defined fields participate alongside code-declared ones (ADR: `docs/architecture/custom-fields-unification-adr.md`):

  - `core`: new `CustomFieldRegistryResolver = (db) => CustomFieldRegistry | Promise<…>` type.
  - `relationships`: `loadCustomFieldDefinitions(db)` reads the runtime `custom_field_definitions` table and maps it to registry definitions (`varchar`→`text`, `double`→`number`, `enum`→`select`, `set`→`multiselect`, `address`/`phone`→`json`; `isSearchable`→`visibility.search`).
  - `bookings`: the `customFields` route-runtime option is now a resolver; the write-validation helper resolves the registry from the request `db` (so it sees both code- and DB-defined fields). The operator wires a resolver that merges its code-declared fields with `loadCustomFieldDefinitions(db)` (code wins), cached per isolate.

  No storage change yet — values still go to the entity `custom_fields` jsonb (booking) / the EAV table (person/org). Subsequent phases add the person/org column, repoint the value API, and backfill `custom_field_values` → jsonb.

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings-contracts@0.106.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/db@0.108.2

## 0.122.2

## 0.122.1

### Patch Changes

- 832ac35: Fix storefront resource-availability SQL to use current booking status values and share the active status list from bookings.

## 0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/hono@0.111.0

## 0.120.3

## 0.120.2

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.
- Updated dependencies [756213e]
  - @voyant-travel/hono@0.110.3

## 0.120.1

## 0.120.0

### Minor Changes

- efc803c: Add Booking-owned origin/provenance records for quote, trip, catalog,
  provider/source, and legacy transaction handoffs. Legacy transaction-backed
  reservation flows now persist compatibility ids through booking origins.
- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.
- 2c9c4a4: Retire the runtime Transactions packages before v1. The default Bookings/OCTO
  bridge now reads booking origin/provenance records instead of the legacy
  booking-to-transaction detail table, and the public `@voyant-travel/transactions`
  and `@voyant-travel/transactions-react` workspaces have been removed. The
  legacy `@voyant-travel/transactions-contracts` workspace is removed as well;
  use the owning domain contract/runtime package for replacement validation
  schemas.

### Patch Changes

- 2f1228a: Move booking extras runtime routes and services behind the Bookings extras owner
  path.
- d92d1a8: Stamp Booking-owned origin records for direct storefront booking sessions and
  Trips catalog reservation handoffs. This keeps active reservation
  provenance in Bookings while preserving existing storefront and trips
  route behavior.
- 6bff46f: Add Commerce runtime wiring for the pricing, markets, sellability, and
  promotions cluster. Templates can now declare one Commerce runtime entry while
  preserving the existing package route prefixes during the v1 migration.

  Allow manifest module factories in `@voyant-travel/hono/composition` to expand to
  multiple Hono modules. Remove the Promotions package's direct Storefront
  dependency by keeping the storefront offer resolver structurally typed.

- 44c3875: Move booking requirements backend and React surfaces under the Bookings package
  family. New imports are available from `@voyant-travel/bookings/requirements*` and
  `@voyant-travel/bookings-react/requirements*`; the old standalone package names are
  removed from v1. Existing
  `/v1/booking-requirements/*` and `/v1/public/booking-requirements/*` API paths
  continue to be mounted by the operator starter.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- e80e3d3: Add Trips reservation plans and route active plan submission through Bookings.
- Updated dependencies [6bff46f]
- Updated dependencies [2c9c4a4]
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/bookings-contracts@0.105.0
  - @voyant-travel/action-ledger@0.104.11

## 0.119.3

### Patch Changes

- 658aa37: Refactor bookings backend validation, pricing assignment, route, service, and integration coverage modules into smaller compatibility-preserving entrypoints.
- Updated dependencies [658aa37]
  - @voyant-travel/bookings-contracts@0.104.3

## 0.119.2

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/action-ledger@0.104.9
  - @voyant-travel/hono@0.109.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/action-ledger@0.104.8

## 0.118.0

## 0.117.1

### Patch Changes

- b7056f1: `GET /aggregates` (admin dashboard KPIs) is now served through a read-through TTL snapshot (`readThroughAggregateSnapshot` from `@voyant-travel/db/aggregate-snapshots`, 60s TTL, keyed by endpoint + query params): the first request computes and stores, subsequent requests within the TTL are ONE indexed read instead of the full aggregate fan-out (finance alone was ~11 queries per dashboard load). Response shapes are unchanged. `Cache-Control` on these endpoints tightened from `private, max-age=60` to `private, max-age=30` (availability gains the header for the first time). Requires the `aggregate_snapshots` table from the upcoming @voyant-travel/db migration — until it is applied, endpoints transparently fall back to live computation.
- b7056f1: `reserveBooking` holds its `FOR UPDATE` slot locks for far less time (perf T7). Catalog snapshot resolution (`resolveBookingItemSnapshot` — product/option/unit names + departure label) and hold-policy resolution now run BEFORE the transaction opens instead of inside it while locks were held; the snapshot reads only immutable catalog data the slot lock never protected. Inside the transaction, the per-item insert loop is replaced by ONE batched `bookingItems` insert and ONE batched `bookingAllocations` insert (item ids pre-generated app-side so allocations link without relying on RETURNING order). For a 3-item booking the transaction shrinks from ~29 statements (incl. 4 cross-table snapshot reads per item under lock) to 10. Returned shape, error codes (slot_not_found / slot_unavailable / insufficient_capacity / mismatches), capacity semantics, and all-or-nothing rollback are unchanged.
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/action-ledger@0.104.7

## 0.117.0

### Patch Changes

- 7255353: Resource capacity check no longer runs one `COUNT(DISTINCT ...)` query per allocation entry: all checked (kind, resource) pairs are counted in ONE grouped query via a `VALUES` join (2 queries total — the unchanged `FOR UPDATE` lock plus the grouped count — instead of 1 + N). Semantics are unchanged: same lock, same per-resource violations and error messages, missing/mismatched resources still reported without a count.
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/action-ledger@0.104.6

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/action-ledger@0.104.5

## 0.115.0

## 0.114.0

## 0.113.0

## 0.112.0

## 0.111.0

## 0.110.1

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/action-ledger@0.104.4
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/hono@0.105.2

## 0.108.1

### Patch Changes

- 92af490: Parallelize operator dashboard aggregate queries and emit short-lived private cache headers for aggregate responses. Finance also adds an invoice index for outstanding-balance dashboard queries.

## 0.108.0

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/action-ledger@0.104.3

## 0.107.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/bookings-contracts@0.104.2
  - @voyant-travel/db@0.104.3
  - @voyant-travel/action-ledger@0.104.2
  - @voyant-travel/hono@0.104.2

## 0.106.2

### Patch Changes

- cfa6af8: feat(finance): accounts-payable supplier invoices, profitability & end-to-end FX

  Adds the full accounts-payable vertical for #1506:

  - **Supplier invoices (AP)**: `supplier_invoices` / `supplier_invoice_lines` /
    `supplier_cost_allocations`, the `supplierInvoicesService` (create/update/
    setLines/setAllocations/payments), attachments, and admin API routes.
  - **Cost allocation**: two-step product → departure picker, configurable cost
    categories (managed under Settings), searchable comboboxes.
  - **Profitability**: per-departure / per-product / per-traveller P&L read model
    - dashboards, cost-by-category breakdown, charts, CSV export.
  - **Accountant share portal**: scoped, revocable token links (no login) exposing
    financials + client/supplier invoices with downloadable attachments, ZIP
    download, and an en/ro language switcher.
  - **End-to-end FX**: supplier invoices and cost allocations snapshot their
    accounting-base value at the FX rate effective on the issue date; the
    profitability rollup sums those recorded snapshots (per-transaction-date
    rates) instead of re-valuing aggregates at the latest rate.

  Supporting additive exports: `availability`/`bookings`/`suppliers` schema and
  linkable exports consumed by the finance read model, and new TypeID prefixes in
  `schema-kit`.

## 0.106.1

### Patch Changes

- a0e117b: Stop payment-schedule reminders from sending for terminal bookings by closing open schedules during cancelled/expired booking transitions and by skipping payment reminders when the parent booking is not payable.

## 0.106.0

## 0.105.0

## 0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/action-ledger@0.104.1
- @voyant-travel/bookings-contracts@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/action-ledger@0.104.0
- @voyant-travel/bookings-contracts@0.104.0
- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/action-ledger@0.103.0
- @voyant-travel/bookings-contracts@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/utils@0.103.0

## 0.101.2

### Patch Changes

- @voyant-travel/action-ledger@0.101.2
- @voyant-travel/bookings-contracts@0.101.2
- @voyant-travel/core@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2
- @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- f736ba5: Improve product booking configuration for room-based travel products.

  - `@voyant-travel/products-ui`: rename the product setup UI around booking options, room inventory, traveler prices, and departure room inventory; hide traveler-age controls for room inventory units; add setup guardrails so room-based products cannot mix the legacy one-option-per-room shape with the canonical single-option/multiple-room-units shape.
  - `@voyant-travel/bookings` and `@voyant-travel/bookings-react`: preserve selected room/category refs through booking creation and quote travelers against the selected room plus traveler pricing category instead of falling back to unrelated rates.
  - `@voyant-travel/bookings-ui`: let agents select both the room and the traveler pricing category for each traveler when the selected room exposes category-specific prices, enforce room occupancy in the booking flow, and keep the booking summary aligned with the selected room.
  - `@voyant-travel/availability-react`: expose the additional resource template fields needed by room inventory setup.
  - `@voyant-travel/i18n`: add Romanian product-management labels for the renamed booking option and inventory concepts.
  - `@voyant-travel/catalog-ui`: localize ship-spec labels used by the catalog detail sheet.
  - @voyant-travel/action-ledger@0.101.1
  - @voyant-travel/bookings-contracts@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/utils@0.101.1

## 0.100.0

### Patch Changes

- @voyant-travel/action-ledger@0.100.0
- @voyant-travel/bookings-contracts@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/action-ledger@0.99.0
  - @voyant-travel/bookings-contracts@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/action-ledger@0.98.0
  - @voyant-travel/bookings-contracts@0.98.0
  - @voyant-travel/core@0.98.0
  - @voyant-travel/db@0.98.0
  - @voyant-travel/hono@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/action-ledger@0.97.0
  - @voyant-travel/bookings-contracts@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/utils@0.97.0

## 0.94.0

### Patch Changes

- @voyant-travel/action-ledger@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/utils@0.94.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/action-ledger@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/action-ledger@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/action-ledger@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0
- @voyant-travel/utils@0.89.0

## 0.87.1

### Patch Changes

- @voyant-travel/action-ledger@0.87.1
- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1
- @voyant-travel/utils@0.87.1

## 0.85.4

### Patch Changes

- @voyant-travel/action-ledger@0.85.4
- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4
- @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/action-ledger@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- 2aac1f9: Prevent public booking session state saves from repeatedly resolving position-matched traveler people, and add a CRM option to skip creating people for name-only contact snapshots.
  - @voyant-travel/action-ledger@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/action-ledger@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/action-ledger@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/action-ledger@0.84.4
- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4
- @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- 9eadf50: Release booking billing party snapshots so existing bookings can store individual or company billing details, including VAT/tax ID, and the billing dialog can prefill from CRM people or organizations.
  - @voyant-travel/action-ledger@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/action-ledger@0.84.2
- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/action-ledger@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/utils@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/action-ledger@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/action-ledger@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/action-ledger@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/action-ledger@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/utils@0.82.1

## 0.81.21

### Patch Changes

- b9fb5b0: Reject malformed or conflicting booking billing-party identifiers before create and update persistence.
  - @voyant-travel/action-ledger@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- e60a50d: Ensure booking status override dispatches always include a non-empty audit reason when no operator note is supplied.
  - @voyant-travel/action-ledger@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- 62e4be5: Booking detail / list overhaul, part 2:

  **Activity tab**

  - Notes moved to the top, redesigned as a card grid (no more table). Add/edit via a new `BookingNoteDialog`; delete via `AlertDialog`. New backend endpoint `PATCH /v1/bookings/:id/notes/:noteId` + `bookingsService.updateNote` + `updateBookingNoteSchema` + `update` mutation on `useBookingNoteMutation`.
  - Activity timeline refactored to match the section-header pattern (no `Card` wrapper, `h2` + `Activity` icon + filter chips). Accepts `additionalEvents` + `footer` so action-ledger entries merge into the same chronological feed. New `action` filter chip surfaces only when ledger events are present.
  - Notes + activity entries now expose hydrated `authorName` / `actorName` (+ email fallback) via a server-side `LEFT JOIN auth.user` in `listNotes` / `listActivity`. UI renders name → email → id.
  - Client-side pagination on the timeline using the design-system `Pagination` / `PaginationLink` / `PaginationNext` primitives. Default page size 10, resets to page 1 on filter change.

  **Ledger tab removed** — entries flow into the unified Activity timeline via the new `useBookingActionLedgerEvents` hook (operator template), which keeps the cursor-based "Load more" pager rendered as the timeline's `footer`. `ledgerTab` slot + `tabLedger` i18n key dropped.

  **Metadata tab**

  - Tab renamed from "Meta" → "Metadata" (`tabMetadata`, value `metadata`).
  - Content redesigned as a definition-list of label-left / value-right rows surfacing booking id, booking number, status, communication language, created, updated. Uses the same `h2` + `Info` icon header as the rest.

  **Tab URL state**

  - `BookingDetailPage` accepts `activeTab` + `onTabChange` props (typed via new exported `BookingDetailTabValue`). Operator route wires these to a `tab` enum on its `validateSearch` schema. Refreshing or sharing `/bookings/:id?tab=activity` lands on the right tab.
  - Renamed `overview` tab value → `items` to match the (already-shipped) label.

  **Bookings list filters in URL**

  - New exported `BookingListFiltersState` shape. `BookingList` + `BookingsPage` accept `initialFilters?: Partial<BookingListFiltersState>` + `onFiltersChange?: (filters) => void`. Internal state collapsed into a single state object; every change emits a snapshot.
  - Operator route wires it through `validateSearch` (status, ids, dates, pax, sort, offset). URL stays clean: defaults are stripped before push, `navigate({ replace: true })` avoids history churn.
  - Bug fix: stripping `undefined` from the partial initial filters so an empty `/bookings` URL no longer clobbers the `BOOKING_STATUS_ALL` default and shows a phantom "Filters 2" badge on first land.

  **Bookings list table polish**

  - Columns reordered: `Booking # → Created → Payer → Items → Status → Total → Pax → Dates`.
  - `Sell amount` renamed to `Total`; `Start date/time` → `Dates`; `Lead` → `Payer`; search placeholder advertises what's matched (`"Search by booking #, payer, email, phone, or item…"`).
  - Backend search additionally matches item title + product-name snapshot (`exists (select 1 from booking_items …)`).
  - New compact, locale-aware `formatBookingDateRange` collapses shared month/year — `"Jun 15 – 20, 2026"` in en, `"15 – 20 iun., 2026"` in ro (uses `Intl.DateTimeFormat.formatToParts` to detect day-first order). Avoids the `Intl` `{day,year}` nonsense output by always building from named parts.
  - Primary item label includes a muted `({count} days)` tag computed from `startsAt` / `endsAt` (added to `bookingRecordItemSummarySchema` + server projection).
  - Hand-rolled prev/next pagination replaced with the design-system `Pagination` primitives (`BookingListPagination`), with ellipsis-windowed page numbers via `computePageWindow`.

  **Admin sidebar (`@voyant-travel/admin`)**

  - `DefaultOperatorAdminBrand` adds `group-data-[collapsible=icon]:justify-center` so the brand mark centres correctly when the sidebar is collapsed to icon-only.
  - @voyant-travel/action-ledger@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/action-ledger@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18
- @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/action-ledger@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/utils@0.81.17

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
  - @voyant-travel/action-ledger@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/action-ledger@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15
- @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/action-ledger@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14
- @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- 28dca55: Apply active departure price overrides to storefront departure pricing, price previews, and booking session repricing.
  - @voyant-travel/action-ledger@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/action-ledger@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/action-ledger@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11
- @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/action-ledger@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10
- @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- 1a58939: Preserve billing contact address line 2 on booking snapshots and downstream documents.
  - @voyant-travel/action-ledger@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- 688ac4f: Generalize booking traveler identity snapshots from passport-only fields to typed identity documents.
  - @voyant-travel/action-ledger@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- 410cd17: Expand admin booking search to include contact snapshot fields, normalized phone numbers, addresses, and external booking references.
  - @voyant-travel/action-ledger@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/action-ledger@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6
- @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/action-ledger@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5
- @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- 6daefc4: Add stable booking-create traveler keys for item and extra line traveler linkage, while keeping deprecated position-based traveler indexes as a transition fallback.
  - @voyant-travel/action-ledger@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- f157bcd: Split booking traveler draft unit assignment into separate pricing and inventory unit fields.
  - @voyant-travel/action-ledger@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/action-ledger@0.81.2
- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/action-ledger@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1
- @voyant-travel/utils@0.81.1

## 0.81.0

### Minor Changes

- f35e63c: Separate inventory units (rooms, vehicles) from pricing tiers (Adult / Child / Infant) in the booking-create flow. RFC voyant-travel/voyant#1267.

  ## What changed

  ### `@voyant-travel/bookings` — new `./pricing-assignment` sub-path

  Single source of truth for traveler→option-unit mapping, transport-agnostic. The booking-create dialog (preview + submit) is the only call site today; the server-side submit validation pathway is a follow-up — but the module is now placed where that wiring is straightforward:

  ```ts
  import {
    resolveBookingDraft,
    resolveBookingExtraLines,
  } from "@voyant-travel/bookings/pricing-assignment";
  ```

  `resolveBookingDraft` distinguishes **person-priced options** (excursions — line quantities derive from travelers) from **accommodation options** (rooms — quantities stay as the operator picked them). Returns `{ quantities, travelers, travelerIndexesByUnitId }` so submit can write `booking_item_travelers` linkage.

  `resolveBookingExtraLines` normalizes per-person extras to charged traveler quantity and stamps `travelerIndexes` so each extra line gets linked to the travelers it applies to.

  A new `roomUnitAssignmentSource: "auto" | "manual" | "none"` enum on the in-memory traveler tracks operator intent declaratively (was a one-shot `useRef` ratchet). `none` = explicit "No room" survives resolver re-runs; `auto` is re-derived; `manual` is preserved while the unit is still in the current option set.

  ### Wire format additions on `BookingCreateItemLineInput` / `BookingCreateExtraLineInput`

  - `clientLineKey?: string | null` — stable client-side key the server stamps into `booking_items.metadata.bookingCreateLineKey` for post-insert lookup.
  - `travelerIndexes?: number[] | null` — indexes (into the request's `travelers` array) the item/extra applies to. Server inserts one row in the existing `booking_item_travelers` join table per (item, traveler) pair.

  `roomUnitId` on each traveler is unchanged on the wire — current dialogs keep working without modification.

  ### `@voyant-travel/finance` — orchestrator links items to travelers

  `POST /v1/bookings/create`: after travelers + items are inserted, the orchestrator looks up each item by its stamped `metadata.bookingCreateLineKey` and writes one `booking_item_travelers` row per requested traveler. Idempotent (dedupes by `(item_id, traveler_id)`), skips silently when the converter didn't produce an item for that key.

  ### `@voyant-travel/bookings-ui` — resolver-driven dialog

  - Dropped the locally-defined `pickUnitForAge` / `redistributeByAge` (moved to the assignment module in Phase 2).
  - `displayQuantities` + submit both go through `resolveBookingDraft`. `displayExtraLines` (preview) + submit extras both go through `resolveBookingExtraLines`. No more drift.
  - The submit pipeline sends `clientLineKey` + `travelerIndexes` on every item and per-person extra so the server can link them.
  - `TravelerEntry` gains `roomUnitAssignmentSource`; category/Room/person-picker handlers set it explicitly (`manual` / `none` / `auto`).
  - Dropped the one-shot hydration `useRef` from #1265 — the source enum + resolver re-derivation handle the race + "No room" disambiguation declaratively.

  ### Architecture doc

  `docs/architecture/booking-journey-architecture.md` now codifies the invariant: traveler age/pricing band, sellable option unit, room/accommodation assignment, and explicit "no room" intent are separate draft concepts; preview totals and submit payloads must be derived from the same resolver; item/extra applicability is persisted through `booking_item_travelers`, not inferred from labels or counts. This prevents future regressions of the bug class behind #1234 / #1239 / #1262.

  ## Why this shape (vs. adding columns to `booking_travelers`)

  The `booking_item_travelers` join table already existed for participant↔item linkage. Using it for unit assignment leverages a tool that was already in the codebase — no schema migration needed, and the model naturally handles cases where one traveler is linked to several items (room + per-pax extra + ...). Adding `pricing_unit_id` / `inventory_unit_id` columns directly to `booking_travelers` (the original plan in #1267 / earlier iterations of this PR) would have been a denormalization of what the join table already expresses.

  ## Backwards compatibility

  - Existing wire-format clients that send `roomUnitId` on each traveler keep working — the server still accepts it (round-trips through, no behavioral change).
  - New clients should send `pricingUnitId` semantics through `itemLines[].travelerIndexes` (the join-table model). The current dialog still uses `roomUnitId` internally; that's fine, the resolver bridges.
  - No database migration. Pre-existing `booking_item_travelers` data is unaffected.

### Patch Changes

- @voyant-travel/action-ledger@0.81.0
- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/hono@0.81.0
- @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/action-ledger@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/action-ledger@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/action-ledger@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16
- @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- 0d8d14e: Cascade terminal booking status overrides to booking items and allocations, including slot capacity release for cancelled and expired overrides.
  - @voyant-travel/action-ledger@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/action-ledger@0.80.14
- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/action-ledger@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13
- @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/action-ledger@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/action-ledger@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/action-ledger@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10
- @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- 37aa8b6: Create booking allocation rows when converting slot-backed products into admin bookings.
  - @voyant-travel/action-ledger@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/action-ledger@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8
- @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/action-ledger@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7
- @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/action-ledger@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6
- @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/action-ledger@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5
- @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/action-ledger@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4
- @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/action-ledger@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- 7a94871: Keep booking `confirmedAt` aligned with the confirmed status during create, update, and status transitions.
- 9d6be13: Allow booking status overrides to suppress confirmed lifecycle events while preserving audit events.
  - @voyant-travel/action-ledger@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/action-ledger@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1
- @voyant-travel/utils@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/action-ledger@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0
- @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/action-ledger@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/action-ledger@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/action-ledger@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13
- @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/action-ledger@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12
- @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/action-ledger@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11
- @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/action-ledger@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10
- @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/action-ledger@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9
- @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/action-ledger@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/action-ledger@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/action-ledger@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/action-ledger@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5
- @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/action-ledger@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/action-ledger@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/action-ledger@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- 574684d: Derive booking-create pax from supplied travelers when pax is omitted, while preserving explicit pax values.
  - @voyant-travel/action-ledger@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/utils@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/action-ledger@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/utils@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/action-ledger@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/action-ledger@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7
- @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/action-ledger@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6
- @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/action-ledger@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5
- @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/action-ledger@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/action-ledger@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3
- @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/action-ledger@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/action-ledger@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Minor Changes

- 1eab599: Add guest booking lookup with scoped access capabilities for public booking overview pages.

### Patch Changes

- @voyant-travel/action-ledger@0.75.0
- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/hono@0.75.0
- @voyant-travel/utils@0.75.0

## 0.74.1

### Patch Changes

- @voyant-travel/action-ledger@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1
- @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/action-ledger@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/action-ledger@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/action-ledger@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/action-ledger@0.72.0
- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/action-ledger@0.71.0
- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/action-ledger@0.70.0
- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/action-ledger@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/action-ledger@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/action-ledger@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/action-ledger@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.5

### Patch Changes

- ee36ef5: Populate booking item catalog snapshots when reserving public booking sessions.
  - @voyant-travel/action-ledger@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- 83ff2de: Materialize public booking traveler rows from wizard session state updates.
  - @voyant-travel/action-ledger@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/action-ledger@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/action-ledger@0.66.2
- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/action-ledger@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/action-ledger@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/action-ledger@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/action-ledger@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1
- @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.
- Updated dependencies [6d0c8f3]
  - @voyant-travel/action-ledger@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/action-ledger@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Minor Changes

- 5bff9c3: Booking detail page becomes the canonical layout; booking items keep a catalog snapshot.

  `@voyant-travel/bookings-ui`

  - `BookingDetailPage` now hosts the full operator-grade layout: action menu (edit / change status / cancel / delete), summary card (sell / cost+margin / dates / travelers / person / organization / created / updated), tabs (Overview, Travelers, Payments, optional Invoices, Suppliers, Documents, Activity, optional Ledger). New slot props `header`, `afterSummary`, `overviewStart`, `overviewEnd`, `travelersStart`, `financeStart`, `financeEnd`, `documents`, `activityEnd`, plus `invoicesTab` / `ledgerTab` (`{ label?, content }`) — templates compose template-owned cards via these slots. New callbacks `onPersonOpen`, `onOrganizationOpen`, `onRecordPayment` and a `hideBreadcrumb` flag for hosts that own their own breadcrumb chrome.
  - `BookingBillingContextCard` now hydrates from CRM (`usePerson` / `useOrganization`) when the booking's contact snapshot is empty, and renders its own `Edit` button wired to `BookingBillingDialog`.
  - `BookingItemList` shows `productNameSnapshot` as the row title with `optionNameSnapshot · unitNameSnapshot` as the subtitle, and `departureLabelSnapshot` wins over derived date formatting. The `Assigned travelers` panel was removed from the expanded row (the Travelers tab already covers it).
  - `SupplierStatusList` deduplicates visually identical rows (same `supplierServiceId` / `serviceName` / `status` / cost) and shows `× N` with a summed cost; edit pencil opens the head row.
  - Default tab label change: "Finance" → "Payments". New `tabInvoices` / `tabLedger` keys. Inline breadcrumb suppressible via `hideBreadcrumb`.
  - `BookingWorkspacePage` removed (no consumers; the canonical detail page now covers the same surface).
  - New: `BookingDetailTabSlot` type export.

  `@voyant-travel/bookings`

  - `booking_items` gains catalog snapshot columns (all `text`, nullable, FK-less): `product_name_snapshot`, `option_name_snapshot`, `unit_name_snapshot`, `departure_label_snapshot`, and a decoupled `availability_slot_id` reference. Snapshots are written at create time so operators can always see "what the customer bought" — even on catalog-less deployments (OTA), and even if the catalog row is later deleted or renamed.
  - `convertProductToBooking` populates the snapshot columns and slot-id from `productsRef` / `productOptionsRef` / `optionUnitsRef` / `availabilitySlotsRef`. Caller-supplied `*Snapshot` / timing values win for OTA flows that bring their own data.
  - `createItem` / `updateItem` (template add-item path) resolve snapshots via a new internal helper. `updateItem` only refreshes snapshots when a foreign id changes — existing snapshots are the historical record and aren't overwritten on catalog renames.
  - `listItems` returns the snapshot fields with a plain select (no JOIN). `listBookingItemsForSummaries` (powers the bookings list) now COALESCEs the snapshot over the current catalog name.
  - `BOOKING_ITEM_MUTATION_FIELDS` allowlist extended for the new columns.

  `@voyant-travel/bookings-react`

  - `BookingItemRecord` exposes `availabilitySlotId`, `productNameSnapshot`, `optionNameSnapshot`, `unitNameSnapshot`, `departureLabelSnapshot`.
  - `BookingsListFilters` adds `availabilitySlotId` so the list page can filter to a specific departure.

  Bookings list page (`BookingList` + `BookingListFiltersPopover`)

  - New **Lead** column (booking's `contactFirstName contactLastName`, falls back to `contactEmail`) and **Created** column (`createdAt`, sortable). `createdAt` joins the sortable-fields union (was previously omitted).
  - New **Departure** filter scoped to the selected product. Picker pulls slots via `useSlots({ productId, limit: 50 })` and labels them with `Intl.DateTimeFormat` in the slot's own timezone so the operator sees what the customer sees. Disabled until a product is picked; auto-clears when the product changes. New i18n keys: `columns.lead`, `columns.createdAt`, `filters.departureLabel` / `departure` / `departureEmpty` / `departureNeedsProduct` (EN + RO).
  - `bookingListQuerySchema` accepts an `availabilitySlotId` query param (server); `listBookings` ANDs it into the per-item EXISTS subquery via `booking_items.availability_slot_id` (relies on the snapshot column added by the same release).

  Templates that own a booking_items table must add the new columns: see `templates/operator/migrations/0026_booking_item_snapshots.sql` for the canonical migration shape (plus optional backfill migrations 0027 + 0028 to populate snapshots from the catalog and from `metadata.availabilitySlotId` for existing rows).

### Patch Changes

- @voyant-travel/action-ledger@0.63.0
- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/hono@0.63.0
- @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/action-ledger@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/action-ledger@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/utils@0.62.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/action-ledger@0.60.0
  - @voyant-travel/core@0.60.0
  - @voyant-travel/db@0.60.0
  - @voyant-travel/hono@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.57.0

### Patch Changes

- @voyant-travel/action-ledger@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/action-ledger@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/utils@0.56.0

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
  - @voyant-travel/action-ledger@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/action-ledger@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/action-ledger@0.54.0
- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.1

### Patch Changes

- Updated dependencies [8ebac16]
  - @voyant-travel/action-ledger@0.53.1
  - @voyant-travel/core@0.53.1
  - @voyant-travel/db@0.53.1
  - @voyant-travel/hono@0.53.1
  - @voyant-travel/utils@0.53.1

## 0.53.0

### Minor Changes

- a315df6: Add CRM person resolution to the storefront booking flow (issue #961).

  Before this change, `publicBookingsService.createSession` and `updateSessionState` never created or linked a CRM `people` row. Storefront bookings landed with `bookings.person_id = NULL` and `booking_travelers.person_id = NULL`, so customers who completed a booking ended up outside the CRM even though the same package's lead/newsletter intake (`createStorefrontLeadSignal` / `subscribeStorefrontNewsletter`) did upsert people. Every operator-side repo had to wire its own `booking.confirmed` subscriber to bridge contact → person, racing with the next lead form that created duplicates.

  **`@voyant-travel/crm`** — new resolution primitives, exported from the package root and rolled into `crmService`:

  - `personNameFromContact(contact)` — derives `{ firstName, lastName }` from a partial contact snapshot. Prefers explicit first/last, then a `name` split, then the email local-part. Never inserts the literal `"Unknown"` (acceptance criterion from the issue); falls back to `"Customer" / "Guest"` only when there is nothing else to work with.
  - `findPersonByContactPoint(db, { kind, value })` — looks a person up by normalized email/phone/website via `identity_contact_points`.
  - `upsertPersonFromContact(db, contact, { source, sourceRef })` — finds-or-creates a CRM person. Lookup order: email → phone. Creates with the supplied source/sourceRef so the audit trail mirrors lead/newsletter signals.

  **`@voyant-travel/bookings`** — wires CRM-free resolver hooks through `BookingRouteRuntime` (mirrors the existing `ResolveBookingTravelSnapshot` pattern, so the bookings package stays free of any direct CRM dependency):

  - New runtime fields: `resolveBillingPerson` and `resolveTravelerPerson`. Templates supply them via `createBookingsHonoModule({ resolveBillingPerson, resolveTravelerPerson })` — typically wired to `crmService.upsertPersonFromContact`.
  - `publicBookingsService.createSession` / `updateSession` / `updateSessionState` now accept an optional `PublicBookingsServiceResolvers` arg. Public routes pull the resolvers from the runtime container and pass them through.
  - `createSession` and `updateSession` resolve a CRM person per traveler before inserting `booking_travelers` rows.
  - `updateSessionState` resolves a CRM person from the billing contact when the wizard's billing payload first arrives, and stamps `bookings.person_id`. Existing `bookings.person_id` values are never overwritten.
  - Resolver failures are caught and logged; the booking still lands without a person link rather than aborting the flow.
  - Default behaviour (resolvers omitted) is unchanged — bookings continue to land with `person_id = NULL`, so the feature is opt-in via template wiring.

  **Tests** — five unit tests for `personNameFromContact`, plus DB-gated integration tests for `findPersonByContactPoint` / `upsertPersonFromContact` covering the dedupe-vs-create path and the email-local-part fallback from the issue acceptance criteria.

### Patch Changes

- @voyant-travel/action-ledger@0.53.0
- @voyant-travel/core@0.53.0
- @voyant-travel/db@0.53.0
- @voyant-travel/hono@0.53.0
- @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- 5d3c119: Fix multi-option booking on option-scoped slots (issue #960). UI + server land together — neither half works on its own.

  **UI (`@voyant-travel/bookings-ui`)** — `OptionUnitsStepperSection` used to swap between data sources: when the slot's `option_id` was set, only that option's units showed, hiding every other option the product offered. A tour selling SGL/DBL/TWN/TPL on the same departure with `slot.option_id = popt_SGL` showed only "SGL · 2 left" next to a "Jun 18 · 45 left" departure badge; selling DBL required nulling out the slot's `option_id` in the DB.

  The new behaviour merges the two sources: slot-bound `useSlotUnitAvailability` rows stay authoritative for the slot's own option (real-time `remaining` from active bookings), and product-level `option_units` fill in every other option the product offers. Product-level slots (`option_id = NULL`) and unloaded slot data fall back to product-level rows for everything. Exports `mergeStepperUnits` + `resolveSlotOptionId` as pure helpers.

  **Server (`@voyant-travel/bookings`)** — relaxed two hard guards that previously rejected multi-option booking on option-scoped slots:

  - `getConvertProductData` dropped the "every requested line option must equal `selectedSlot.optionId`" reject. Each line's `optionId` is still validated to live on the product; the explicit caller-passed `data.optionId` mismatch reject stays.
  - `convertProductToBooking` dropped the per-item `slot_option_mismatch` throw. The product mismatch throw stays (an item's `productId` still has to match the slot's product).

  Slot pax capacity is still enforced server-side by `adjustSlotCapacity` — the wider stepper can't oversell the departure. Per-option-unit oversell of the non-slot-tracked options matches the existing behaviour for product-level slots and is called out in the existing capacity comment.

  `reserveBooking` (offer-conversion path) keeps its `slot_option_mismatch` guard untouched — that flow is out of scope for this fix.

  - @voyant-travel/action-ledger@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- 9679a57: Add the initial action ledger package with append-only ledger schemas, TypeID prefixes, canonical idempotency fingerprints, capability registry and guard helpers, query helpers, request-context ledger helpers, shared target timeline serialization, payload/relay append support, booking PII sensitive-read ledgering, booking traveler and travel-detail mutation ledgering, booking item/note/payment-policy mutation ledgering, booking action capability declarations and approval decision routing, booking action-ledger drift checks and dry-run remediation planning, finance invoice issuance/update/delete, invoice line-item ledgering, payment-session creation/update/lifecycle completion/failure/cancellation/expiration, payment instrument and authorization/capture ledgering, booking payment schedule and guarantee/default-plan ledgering, manual payment, supplier payment, and credit-note plus credit-note line-item ledgering, product create/update/delete ledgering with changed-field summaries and product timelines, nested product option, option-unit, translation, itinerary, day, day-service, media, brochure, feature, FAQ, location, taxonomy-link, destination-link, activation-setting, ticket-setting, visibility-setting, capability, and delivery-format mutation ledgering, product action-ledger drift checks, product admin route module splitting, admin list/detail routes with expanded filters and time windows plus payload and relay refs, relay outbox health listing with time windows and lifecycle helpers, runtime schema/route mounting, finance React client hooks for invoice and payment-session action ledger timelines, operator invoice/payment-session timeline mounting, product React client hooks and product detail activity UI, drift/canary health helpers and operator health endpoints, reversal recording support, route schema module split, client-safe React validation subpath imports, and reusable finance UI action ledger cards.
- Updated dependencies [9679a57]
  - @voyant-travel/action-ledger@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Booking create + detail flow overhaul.

  - Rename `RoomsStepperSection` → `OptionUnitsStepperSection` across `@voyant-travel/bookings-ui` and the `@voyant-travel/ui` registry. The old name implied hospitality-only usage; the same stepper now drives any product option (rooms, cabins, vehicles, seats). Re-export kept under the new name only — consumers must update imports.
  - Rebuild `BookingCreateDialog` around the new option-units stepper, person picker, travelers section, and price-breakdown card so room/cabin/seat selection, traveler capture, and price preview share state correctly. Travelers section gains contact-points support and consistent validation messages.
  - New `BookingBillingDialog` for editing the billing person/organization + billing address on an existing booking.
  - New `useBookingTaxPreview` hook + `booking.taxPreview` query option for previewing tax breakdowns on draft bookings before issuing an invoice. Exposes a new `bookingTaxPreviewSchema` from `@voyant-travel/bookings-react/schemas`.
  - `useBookingCreateMutation`, `useBookingMutation`, and `useBookingStatusMutation` invalidate the new tax-preview and finance keys so price/invoice cards stay in sync after status transitions.
  - `@voyant-travel/bookings` service: extend `validation` with the billing-update schema, wire `status-dispatch` to the new finance.issue payload, and add a tax-preview entrypoint consumed by the operator template.
  - i18n: new `bookings-ui` and `i18n/admin/bookings` strings for the billing dialog, tax preview, option-units copy, and status-change confirmations (EN + RO).
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- 335d277: Fix `cannot cast type record to text[]` crash on `getSlotAllocationManifest`, `validateSlotAllocationCapacity`, `autoAllocateSlotResources`, and the bookings per-resource capacity guard whenever the array being interpolated had 2+ elements.

  drizzle-orm's `sql\`…${jsArray}…\`` template spreads JS arrays into a Postgres row constructor (`($1, $2)`) — and `($1, $2)::text[]`is a record cast, which Postgres refuses. Single-element arrays happened to work because`(($1)::text[])` evaluates as the lone scalar. So the bug stayed latent in fresh dev environments with one booking per slot, then hit production immediately on the second booking.

  All raw-SQL sites that previously wrote `${array}::text[]` now go through a tiny local helper that emits `ARRAY[$1, $2, …]::text[]` via `sql.join`. Affects nine call sites across `service-allocation.ts`, `service-allocation-automation.ts`, and `bookings/service.ts`. Added an integration regression test that loads the manifest for a slot with 3 bookings.

  - @voyant-travel/core@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/utils@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- f35014f: Fix admin booking create pricing and room-option selection after the initial create-flow patch. The admin flow now resolves active internal products for pricing preview, keeps selected combobox labels readable, lists product options as independent room/unit rows, and shows accurate pricing-preview fallback copy.
  - @voyant-travel/core@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- c14f0a8: Fix the booking-create flow: scrollable dialog content with reachable actions, normalized product search, future departure lookup, shared-room clearing, explicit item lines, selectable traveler people including the payer, already-paid schedule rows, and booking-create naming throughout the API/registry surface.
  - @voyant-travel/core@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1
- @voyant-travel/utils@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/utils@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0
- @voyant-travel/utils@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/utils@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Minor Changes

- f4235ea: Finish the bookings passenger-to-traveler rename across the React/UI layer and shadcn registry.

  `@voyant-travel/bookings-ui` now exposes `TravelersSection` and traveler-first section value/types. `@voyant-travel/bookings-react` uses traveler hooks/query helpers over the traveler endpoints. The bookings activity enum now emits `traveler_update`; dev/operator/DMC migrations rename existing `passenger_update` activity rows.

  The shadcn registry now publishes `voyant-bookings-travelers-section` and removes the stale passenger dialog/list/section registry artifacts.

### Patch Changes

- @voyant-travel/core@0.39.0
- @voyant-travel/db@0.39.0
- @voyant-travel/hono@0.39.0
- @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Minor Changes

- 4c93561: Add supplier, product category, option, person, and organization filters to the bookings list API and UI.
- dc29b79: Persist operator-confirmed booking totals from the create dialog and audit manual price overrides with a required reason.

### Patch Changes

- @voyant-travel/core@0.37.0
- @voyant-travel/db@0.37.0
- @voyant-travel/hono@0.37.0
- @voyant-travel/utils@0.37.0

## 0.36.0

### Minor Changes

- 15e6953: Expose slot-scoped traveler sharing groups through bookings routes and React hooks, and wire traveler allocation metadata through travel-details validation.

### Patch Changes

- @voyant-travel/core@0.36.0
- @voyant-travel/db@0.36.0
- @voyant-travel/hono@0.36.0
- @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/utils@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [a37d4af]
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- 9bee9aa: Hydrate booking list item summaries with product names and prefer those names in the Bookings list "What booked" column.
  - @voyant-travel/core@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/hono@0.33.1
  - @voyant-travel/utils@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/utils@0.32.1

## 0.32.0

### Minor Changes

- 6ea6ded: Harden public checkout sessions with scoped signed capabilities. Public booking-session creation now returns a short-lived checkout capability and sets an HttpOnly SameSite cookie; PII-bearing session reads, session mutations, repricing/finalization, and public finance payment bootstrap/read routes require that booking-scoped capability. Public mutable checkout/payment routes also accept the shared `Idempotency-Key` retry middleware where it was missing.

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/utils@0.30.0

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

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3
- @voyant-travel/utils@0.28.3

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/utils@0.28.1

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- 571e340: Server-side dashboard aggregates: add `totalPax` and `upcomingDepartures.items` to `getBookingAggregates`, and `outstandingTopN` to `getFinanceAggregates` (closes #437).

  The operator dashboard previously sampled the first 100 bookings / invoices through the list endpoints and derived KPIs in the browser. With more than a handful of rows, "total pax", "upcoming departures", and "outstanding invoices" silently drifted from the truth.

  Bookings:

  - `BookingAggregates.totalPax` sums `pax` across active-status bookings in the requested range (cancelled excluded; null pax = 0).
  - `BookingAggregates.upcomingDepartures` is now `{ count, items }`. `items` is a bounded slice of soonest-departing bookings ordered by `start_date` asc, excluding cancelled and past departures. Bound via the new `upcomingLimit` query parameter (default 8, max 20).

  Finance:

  - `FinanceAggregates.outstandingTopN` returns the top-N outstanding invoices (`sent | partially_paid | overdue` with `balance_due_cents > 0`), ordered by `due_date` (nulls last), then `issue_date`, then `id`. Bound via the new `outstandingTopLimit` query parameter (default 5, max 20).

  The operator dashboard is rewired to consume these aggregates directly — KPI cards, the upcoming-departures list, and the "needs collection" panel are now exact rather than sample-derived. The dashboard also fixes a pre-existing bug where the outstanding panel summed `total_amount_cents` instead of `balance_due_cents`.

  - @voyant-travel/core@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/hono@0.26.6
  - @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- c0507a6: Move toxic PII to `crm.people` and add structured `person_documents` (closes #440 and #443).

  `user_profiles` is no longer the home for encrypted PII. The four free-text slots (accessibility / dietary / loyalty / insurance) move to `crm.people` so operator-managed humans without auth accounts can carry them, and identity documents graduate to a structured `person_documents` table with type / expiry / issuing authority / attachment + a partial unique index pinning a single primary doc per type per person.

  Booking travelers now snapshot dietary, accessibility, and the primary passport from the linked person record at create time (snapshot-on-create, explicit input always wins) via a new `POST /v1/admin/bookings/:id/travelers/with-travel-details` route. Templates wire the snapshot via `createBookingsHonoModule({ resolveTravelSnapshot })` delegating to `crmService.loadPersonTravelSnapshot` — bookings stays free of any direct CRM dependency.

  Customer portal exposes plaintext `accessibility/dietary/loyalty/insurance` on `/me` plus full CRUD over `/me/documents`. CRM admin gains server-side encrypt/decrypt endpoints (`travel-snapshot`, `profile-pii`, `*/from-plaintext`) so the operator booking-traveler dialog can pre-fill from profile and push diverging values back without the browser holding KMS material. The dialog itself now ships a "Travel details" section with passport / dietary / accessibility fields, plus "Pre-fill from profile" and "Save to profile" affordances when a CRM person is linked.

  Breaking changes (intentionally landed pre-1.0):

  - `user_profiles.documentsEncrypted/accessibilityEncrypted/dietaryEncrypted/loyaltyEncrypted/insuranceEncrypted` columns are removed. Migration ships `templates/operator/migrations/0024_people_pii_documents.sql`.
  - `customerPortalProfileSchema.documents` (array) replaced with separate `accessibility/dietary/loyalty/insurance` plaintext string fields. Document CRUD lives at `/v1/public/customer-portal/me/documents`.
  - `bookingsHonoModule` and `crmHonoModule` are still exported but the env-driven default factory `createBookingsHonoModule()` / `createCrmHonoModule()` is the new recommended entry point.

- Updated dependencies [c0507a6]
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/utils@0.19.0

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
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/utils@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: `createBookingsHonoModule(options)` now accepts a `resolveKmsProvider` factory so apps can source the booking-PII KMS key from Vault (or any other secret store) instead of being forced to populate `KMS_*` env vars:

  ```ts
  bookingsHonoModule({
    resolveKmsProvider: async (env) => {
      const cloud = getVoyantCloudClient(env);
      const secret = await cloud.vault.getSecret("booking-pii", "kms-key");
      return new EnvKmsProvider({ key: secret.value });
    },
  });
  ```

  `getKmsProvider()` on the route runtime now returns `Promise<KmsProvider>` (always async) so the resolver can be sync or async. The default `createKmsProviderFromEnv` path is unchanged for callers that don't pass options.

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/utils@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/utils@0.14.0

## 0.13.0

### Minor Changes

- 7dfbc05: Export `dispatchBookingStatusChange` from `@voyant-travel/bookings/status-dispatch` (also re-exported from the package barrel).

  Framework-agnostic helper that maps `(currentStatus, targetStatus)` → the right verb endpoint (`/confirm`, `/expire`, `/start`, `/complete`, `/cancel`, or `/override-status` for non-adjacent jumps) and the body the server expects. Lets non-React consumers — operator tooling using a generic `api.patch`, server-to-server scripts, third-party storefront builds — reuse the dispatch table that previously lived only inside `bookings-react`'s `useBookingStatusMutation`.

  `useBookingStatusMutation` and `useBookingStatusByIdMutation` now delegate to this helper; behaviour is unchanged.

  ```ts
  import { dispatchBookingStatusChange } from "@voyant-travel/bookings/status-dispatch";

  const target = dispatchBookingStatusChange(
    bookingId,
    "on_hold",
    "confirmed",
    "ok by ops"
  );
  await fetch(`${apiBase}${target.path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(target.body),
  });
  ```

- 15dda79: Add `bookingsService.createTravelerWithTravelDetails` and `updateTravelerWithTravelDetails` — convenience verbs that take the same flat payload shape `createTravelerRecord` accepted before 0.10 (with `dateOfBirth` / `nationality` / `passportNumber` / `passportExpiry` / `dietaryRequirements` / `accessibilityNeeds` / `isLeadTraveler` included) and internally fan out to `createTravelerRecord` + `BookingPiiService.upsertTravelerTravelDetails`. The storage split (plaintext columns + encrypted envelope) is preserved at rest — only the call ergonomics collapse.

  Migration boundary helper for consumers coming from the pre-0.10 single-call shape: instead of learning the encrypted PII service contract just to keep parity with the dropped `accessibility_needs` column, you can pass one flat object as before.

  Also adds `accessibilityNeeds` to `upsertTravelerTravelDetailsSchema` (the underlying PII service has always supported it; the public-facing schema was missing it).

  ```ts
  import {
    bookingsService,
    createBookingPiiService,
  } from "@voyant-travel/bookings";

  const pii = createBookingPiiService({ kms });

  const result = await bookingsService.createTravelerWithTravelDetails(
    db,
    bookingId,
    {
      participantType: "traveler",
      firstName: "Ana",
      lastName: "Traveler",
      email: "ana@example.com",
      nationality: "RO",
      passportNumber: "ABC123",
      accessibilityNeeds: "wheelchair access",
      isLeadTraveler: true,
    },
    { pii, userId: actorId, actorId }
  );
  // → { traveler, travelDetails }
  ```

  Operations are sequential, not transactional — a failure in the encrypted-fields write leaves the plaintext row in place (matching the pre-helper two-call protocol).

### Patch Changes

- @voyant-travel/core@0.13.0
- @voyant-travel/db@0.13.0
- @voyant-travel/hono@0.13.0
- @voyant-travel/utils@0.13.0

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

- 944d244: Adds the charters module — a new opt-in vertical for yacht-charter brands carved out of cruises (operators selling Aman, Four Seasons, Ritz-Carlton, SeaDream, A&K, Orient Express style products), designed natively against Voyant's existing module/extension/link conventions and the broker-mediated yacht-charter data shape (whole-yacht vs per-suite, MYBA contracts, APA, multi-currency native pricing).

  **`@voyant-travel/charters`** — full server module:

  - 5 tables: charter_products (one per brand × yacht configuration), charter_voyages (a specific dated trip), charter_yachts (vessel specs + crew), charter_suites (per-voyage suite pricing, all four first-class currencies as explicit columns), charter_schedule_days (flat per-voyage itinerary; no template/override two-tier — charter schedules are negotiable).
  - Two booking modes per voyage: `per_suite` and `whole_yacht`. Voyages opt into either or both; whole-yacht requires a resolvable APA percent and an MYBA contract template ref.
  - Multi-currency native (USD/EUR/GBP/AUD as explicit price columns, not derived). `pricingService.quotePerSuite` and `quoteWholeYacht` use pure BigInt-cent math; no float drift. APA computed as integer basis points.
  - `booking_charter_details` 1:1 extension on bookings: `bookingMode` discriminator, source/sourceProvider/sourceRef provenance, multi-currency snapshot fields, MYBA contract id (soft FK to legal.contracts), and APA reconciliation state (paid / spent / refund / settledAt).
  - `chartersBookingService` with four entry points — local + external × per-suite + whole-yacht. Each commits in a single transaction (atomic booking + travelers + extension snapshot). External flows commit upstream BEFORE local writes so the upstream rejection path is loud.
  - `mybaService.generateContract` is DI-shaped — accepts a `CharterContractsService` so charters takes no hard dep on `@voyant-travel/legal`. Idempotent; respects voyage override → product default → injected service default precedence.
  - APA reconciliation: `recordApaPayment` (collected from charterer pre-charter) and `reconcileApa` (records on-board spend + refund balance + optional settle stamp). Routes mounted as a `bookings` extension at `POST /v1/admin/bookings/:bookingId/charter-details/apa/{payment,reconcile}`.
  - **Provenance — local + external in one experience.** Charters can be self-managed (operator owns the rows) or external (sourced through a registered `CharterAdapter`). Admin + public routes use a unified-key parser that accepts both `chrt_*` / `chrv_*` / `chry_*` TypeIDs and `<provider>:<ref>` external keys; list endpoints fan out to all registered adapters via parallel `Promise.allSettled`. External writes return 409.
  - Adapter contract (`@voyant-travel/charters/adapters`): `CharterAdapter` interface with `listEntries` / `fetchProduct` / `fetchVoyage` / `fetchVoyageSuites` / `fetchVoyageSchedule` / `fetchYacht` / `listVoyagesForProduct` / `createPerSuiteBooking` / `createWholeYachtBooking`. Process-local registry, TTL+LRU memoize decorator, and `MockCharterAdapter` for tests with seeders + `failEveryNthCall` for error-path coverage.
  - Unlike cruises, charters has NO search index — the operator universe is small (six brands in v1) so adapter fan-out per request is plenty.
  - 77 unit tests covering pricing math (USD/EUR/GBP/AUD currency resolution, fractional APA percentages, BigInt cent precision), MYBA service (idempotency, template precedence, variable propagation), booking-extension validation (mode-specific refinements, external provenance rules), routes (invalid keys, write rejections, external dispatch with adapter, MYBA endpoint without contracts service), adapter registry / mock / memoize.

  **`@voyant-travel/charters-react`** — React Query hooks + Zod fetch client:

  - ~15 hooks: `useCharterProducts` / `useCharterProduct` / `useCharterProductMutation`, `useCharterVoyages` / `useCharterVoyage`, `useCharterYachts` / `useCharterYacht`, `usePerSuiteQuote` / `useWholeYachtQuote`, `useCharterBookingMutation` (per-suite + whole-yacht — server dispatches local vs external), `useGenerateMybaContract`, `useCharterDetails` / `useRecordApaPayment` / `useReconcileApa`, plus public-surface variants.
  - Mirrors `@voyant-travel/cruises-react` exactly: hierarchical query keys rooted at `["voyant", "charters"]`, `queryOptions()` factories for SSR/router prefetch, envelope helpers, `VoyantChartersProvider`, mutations that invalidate the parent resource and `setQueryData` on the detail. Detail responses union local + external dispatch shapes so callers handle provenance with a discriminated check.
  - 15 unit tests across query keys, the validating fetcher (URL join, error extraction, schema mismatch handling, Content-Type defaulting), and query-option factories (URL serialisation, unified-key encoding, public-vs-admin surface routing).

  **`@voyant-travel/bookings`**: no schema changes; charters integrates as a 1:1 extension table. Patch bump captures the dependency edge.

  **`@voyant-travel/db`**: registers TypeID prefixes for the charter namespace (`chrt`, `chrv`, `chry`, `chst`, `chrd`).

  **`@voyant-travel/ui`** (registry only — versionless): adds the `voyant-charters-*` shadcn registry components — `external-badge`, `charter-product-card` (works for both local records and external summaries), `voyage-suite-grid` (per-suite pricing matrix with category, availability badge, multi-currency price, quote/book CTA), `whole-yacht-quote-card` (charter fee + APA + total + explanatory copy; ships with a per-suite sibling), `apa-tracker` (pre-/post-charter APA reconciliation panel with collected / spent / refund / settled state). Install via `shadcn add voyant-charters-charter-product-card` etc.

  **Design doc**: full rationale, schema, and architecture in `docs/architecture/charters-module.md`.

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/utils@0.12.0

## 0.11.0

### Minor Changes

- fe905b0: **BREAKING:** privatize the Booking state machine; add Start, Complete, and Override verbs.

  The transition graph (`BOOKING_TRANSITIONS`, `canTransitionBooking`, `transitionBooking`, `BookingStatusPatch`, `BookingTransitionError`) is no longer part of the `@voyant-travel/bookings` public surface. The lifecycle laws live behind the service-verb seam — callers cross it via named verbs in the ubiquitous language. `BookingStatus` stays exported (it's data).

  **HTTP — verb routes replace the generic status PATCH:**

  - `PATCH /:id/status` is **removed**.
  - `POST /:id/start` — confirmed → in_progress (new). Emits `booking.started`.
  - `POST /:id/complete` — in_progress → completed (new). Emits `booking.completed`. Cascades confirmed allocations + items to `fulfilled`.
  - `POST /:id/override-status` — admin override that bypasses the transition graph (new). Updates the Booking row only; does **not** cascade. Requires a non-empty `reason`. Emits `booking.status_overridden` as a privileged audit signal distinct from the normal lifecycle events.

  `POST /:id/confirm`, `/:id/cancel`, `/:id/expire`, `/:id/extend-hold` are unchanged.

  **Service:**

  - `bookingsService.updateBookingStatus(...)` is **removed**.
  - `bookingsService.startBooking(...)`, `.completeBooking(...)`, `.overrideBookingStatus(...)` are added.
  - `updateBookingStatusSchema` is removed; `startBookingSchema`, `completeBookingSchema`, `overrideBookingStatusSchema` are added.
  - Activity-type enum gains `booking_started`, `booking_completed`, `status_overridden`. Run `drizzle-kit push` to sync.

  **React (`@voyant-travel/bookings-react`):**

  `useBookingStatusMutation` / `useBookingStatusByIdMutation` now require `currentStatus` in their input. The hook dispatches client-side to the right verb endpoint; non-adjacent jumps fall through to `/override-status`, using the operator's note as the reason. The `<StatusChangeDialog>` UX is unchanged — pass the booking's current status from props.

  **Domain language:** `Start`, `Complete`, and `Override` are added to UBIQUITOUS_LANGUAGE.md as Booking-scoped lifecycle verbs.

  **Migration:**

  - Remove imports of `BOOKING_TRANSITIONS` / `canTransitionBooking` / `transitionBooking` / `BookingTransitionError` / `BookingStatusPatch` from `@voyant-travel/bookings` — call the service verbs instead. Internal callers (within this monorepo) had none.
  - Replace `PATCH /v1/bookings/:id/status` calls with the matching verb endpoint, or `/override-status` with a `reason`.
  - Update calls to the React status hooks to pass `currentStatus`.

### Patch Changes

- @voyant-travel/core@0.11.0
- @voyant-travel/db@0.11.0
- @voyant-travel/hono@0.11.0
- @voyant-travel/utils@0.11.0

## 0.10.0

### Minor Changes

- 29a581a: Auto-rollup booking total from `booking_items`. `bookingsService.recomputeBookingTotal(db, bookingId)` is now wired into `createItem` / `updateItem` / `deleteItem`, each wrapped in `db.transaction` so partial failures can never leave the parent total stale.

  Also exposed publicly for ad-hoc invocation (saga compensation, fix-up scripts).

  Base-currency totals (`baseSellAmountCents` / `baseCostAmountCents`) are NOT recomputed by this rollup — those are FX-derived and handled by the FX rollup added in the same release.

- 29a581a: **BREAKING:** encrypt `accessibilityNeeds` at rest. Move accessibility info from a plaintext column on `booking_travelers` into the KMS-encrypted `booking_traveler_travel_details` envelope (alongside passport / nationality / DOB / dietary).

  Disability data has tighter regulatory expectations in many jurisdictions (ADA / Equality Act) than freeform notes, so it lives with the passport-class data, not with `specialRequests` or `notes`.

  **Migration:**

  - The `booking_travelers.accessibility_needs` column is dropped.
  - `accessibilityNeeds` is removed from `bookingTravelerRecord`, `BookingTraveler*` insert/update validation schemas, `redactTravelerIdentity`, and the bookings-react / finance / scripts surface.
  - Read accessibility data through `createBookingPiiService.getTravelerTravelDetails`, which decrypts via `decryptOptionalJsonEnvelope` + audits the access. Same authorisation gate as the existing dietary / identity buckets.

  Contact identifiers (email, phone, names, address) and `specialRequests` deliberately stay plaintext — see `docs/architecture/booking-pii.md` for the cost-benefit decision.

- 29a581a: FX rollup for `base_*_amount_cents` on item mutations. `bookingsService.recomputeBookingTotal` now re-derives `baseSellAmountCents` / `baseCostAmountCents` from per-item totals when the booking declares a `baseCurrency` and `fxRateSetId`.

  Schema: `bookings.fx_rate_set_id` (text, nullable) — plain text per the cross-domain FK rule (reference into the markets package).

  FX behaviour:

  - **Single-currency** (`baseCurrency` null OR every item's `sellCurrency === baseCurrency`): conversion is a no-op, `base*Cents` track `sell*Cents` 1:1. `fxStatus: "ok"`.
  - **Multi-currency with valid FX**: each item converted via `exchange_rates` (direct rate or `inverse_rate_decimal` if direct row missing), summed. `fxStatus: "ok"`.
  - **Missing rate**: short-circuits with `fxStatus: "missing_rate"`; `base*Cents` left unchanged on the parent. Caller decides.
  - **No `fxRateSetId` configured**: skipped, `fxStatus: "skipped"`, `base*Cents` stay null.

- 29a581a: Add `Idempotency-Key` header protocol for non-idempotent booking-creation endpoints.

  Same key + same body replays the original response; same key + different body returns `409 Conflict`. Records expire after 24h. Wired (with `required: false` default) into:

  - `POST /v1/admin/bookings/`
  - `POST /v1/admin/bookings/reserve`
  - `POST /v1/admin/bookings/from-product`
  - `POST /v1/admin/bookings/from-offer/:offerId/reserve`
  - `POST /v1/admin/bookings/from-order/:orderId/reserve`
  - `POST /v1/public/bookings/sessions`
  - `POST /v1/public/bookings/sessions/:sessionId/confirm`

  Ships:

  - `idempotency_keys` table in `@voyant-travel/db/schema/infra` keyed by `(scope, key)`, with body-hash, captured response, and TTL.
  - `idempotencyKey({ scope, required? })` middleware in `@voyant-travel/hono` that reads the header, replays/conflicts/expires, and captures `2xx` JSON responses. Echoes `Idempotency-Key` + `Idempotency-Replayed: true` on replay.
  - `purgeExpiredIdempotencyKeys()` helper for daily-cron cleanup.

  Backwards-compatible: clients without the header continue to work. Templates can flip a route to `required: true` per endpoint once their client has rolled out.

- 29a581a: Add route-layer PII redaction + mandatory audit on the bookings admin read surface.

  `GET /v1/admin/bookings`, `GET /v1/admin/bookings/:id`, and `GET /v1/admin/bookings/:id/travelers` now:

  - Check `shouldRevealBookingPii(ctx)` against actor / scopes / caller type
  - Call `logBookingPiiAccess` with reason (`list_redacted` / `detail_reveal` / `insufficient_scope`) and metadata including row count
  - Mask contact PII (name, email, phone, address) in the response unless the caller has the `bookings-pii:read` (or `bookings-pii:*` / `*` superuser) scope, or the request is internal

  Exported helpers: `shouldRevealBookingPii`, `redactBookingContact`, `redactTravelerIdentity`, `redactEmail`, `redactPhone`, `redactString`. Surface area + posture documented in `docs/architecture/booking-pii.md`.

- 29a581a: Add `refundBooking` saga — atomic credit-note + hold-release + supplier-reverse + notify, built on the existing `createWorkflow` primitive.

  Side-effect dependencies are injected (no compile-time pull on finance / transactions / notifications) so the package stays slim; templates wire the deps.

  Step graph with reverse-order compensation:

  1. `validate-state` — refundable only when `confirmed`, `in_progress`, or `on_hold`. Rejects partial amounts outside `[0, sellAmountCents]`.
  2. `create-credit-note` — short-circuits when `refundAmount === 0`. Compensation: void.
  3. `release-inventory` — releases held + confirmed allocations, restores slot capacity. Compensation: re-decrement (loud failure if re-sold, intentional).
  4. `reverse-supplier-offer` — best-effort.
  5. `transition-booking` → `cancelled` via `transitionBooking()` (state-machine guard).
  6. `notify-customer` — fire-and-forget.

  Exports `refundBooking(input, deps)` and `buildRefundBookingWorkflow(deps)` for callers that want to inspect the workflow definition or run it via a JobRunner.

- 29a581a: **BREAKING:** introduce explicit booking state machine with `transitionBooking()` guards.

  Bookings now move through a typed state graph (`draft` → `on_hold` → `confirmed` → `in_progress` → `completed`, with `cancelled` / `expired` as terminal exits). Direct status writes are no longer permitted from service code — use `transitionBooking(bookingId, nextStatus, ctx)`, which enforces `BOOKING_TRANSITIONS` and emits an activity log row per transition.

  **Migration:**

  - Replace any `db.update(bookings).set({ status: ... })` in caller code with `transitionBooking()`.
  - The `redeemed` status is removed (it was a vouchers-domain concept that didn't apply here). Anything that read it should now look at `completed`.
  - The new `in_progress` status models "booking has started but the trip is mid-delivery" — set by the operator or by a scheduled transition once `startDate` is reached.

### Patch Changes

- 29a581a: Add Postgres `CHECK` constraints across finance, bookings, and transactions schemas to enforce: if any `*_amount_cents` column is set, its companion currency column must also be set.

  Two flavours, depending on column shape:

  - **Strict XNOR** (`(currency IS NULL) = (amount IS NULL)`) — one currency to one amount: `booking_guarantees`, `booking_item_commissions`, `payments` (base).
  - **Implication** (`(amounts NULL) OR (currency NOT NULL)`) — one currency covering multiple amount columns: `bookings.base_currency`, `booking_items.cost_currency`, `offer_items.cost_currency`, `order_items.cost_currency`, `invoices.base_currency`.

  The implication form intentionally allows "currency without amount" because the currency may be pre-declared before line items roll up.

- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/utils@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/utils@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/core@0.8.0
  - @voyant-travel/db@0.8.0
  - @voyant-travel/hono@0.8.0
  - @voyant-travel/utils@0.8.0

## 0.7.0

### Minor Changes

- 96612b3: Bookings-create composition surface (#223) and vouchers-as-first-class (#227) — the packages on the release train all move together, so this covers the batch.

  **Atomic booking create (#263, #264, #265, #266)**

  - `POST /v1/admin/bookings/quick-create` — one-shot endpoint that converts a product, inserts travelers + payment schedules, redeems a voucher, and creates/joins a `booking_group` inside a single DB transaction. `quickCreateBooking(db, input, { userId, runtime })` service in `@voyant-travel/finance`; `useBookingQuickCreateMutation` in `@voyant-travel/bookings-react`.
  - `POST /v1/admin/bookings/dual-create` — partaj flow: two bookings + one shared-room group, also atomic. `dualCreateBooking` service, `useBookingDualCreateMutation` hook.
  - `booking.quick-created` and `booking.dual-created` events emitted post-commit when a runtime eventBus is wired.
  - `QuickBookDialog` now mounts all nine picker sections (product, departure, rooms, person, shared-room, passengers, price breakdown, voucher, payment schedule) and submits via quick-create. Post-create "Confirm & notify traveler" toggle uses the new `useBookingStatusByIdMutation` to transition the fresh booking to `confirmed` — which (when `autoConfirmAndDispatch` is on) fires the doc bundle + traveler email through the existing `booking.confirmed` subscriber.
  - Bookings fix: `productDaysRef` / `getConvertProductData` now join through `product_itineraries` to match the real products schema; the existing `POST /v1/bookings/from-product` convert path works again.

  **Vouchers as first-class financial instruments (#262, #267)**

  - One-shot data migration: `migrateVouchersFromPaymentInstruments(db, opts)` in `@voyant-travel/finance` (CLI wrapper `pnpm -F @voyant-travel/finance migrate:vouchers`, `--dry-run` supported). Idempotent; pulls code, currency, amount, expiry from legacy JSONB metadata into the new `vouchers` table.
  - `vouchers.validFrom` (start-of-validity, maps to OpenTravel `Finance.Voucher.effectiveDate`) and `vouchers.seriesCode` (batch/campaign id, maps to `Finance.Voucher.seriesCode`) columns added. Redeem guard returns `voucher_not_started` when now < validFrom; the public `validateVoucher` `not_started` branch is now reachable. `seriesCode` exposed as a list filter. Migration pulls both from legacy metadata (honouring OpenTravel's `effectiveDate` alias).

### Patch Changes

- @voyant-travel/core@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/hono@0.7.0
- @voyant-travel/utils@0.7.0

## 0.6.9

### Patch Changes

- 7619ef0: Continue the traveler-first booking contract cleanup across the published booking surfaces while preserving compatibility aliases.

  - `@voyant-travel/bookings`: add traveler-first public aliases for booking travel details, group traveler routes, public booking-session traveler input, and traveler-facing validation/error wording while keeping legacy participant/passenger compatibility routes and schemas.
  - `@voyant-travel/bookings-react`: make traveler hooks, query options, schemas, and exports the primary surface again; keep passenger/item-participant names as compatibility aliases instead of separate primaries.
  - `@voyant-travel/customer-portal` and `@voyant-travel/customer-portal-react`: move booking import schemas, operations, and exports to traveler-first names while preserving legacy participant aliases and routes.
  - `@voyant-travel/transactions`: expose traveler-first request/response aliases and traveler route aliases for offer/order traveler and item-traveler flows while preserving legacy participant compatibility endpoints.
  - `@voyant-travel/auth-react`: add exported query keys, query options, and schemas for current workspace, organization members, and organization invitations so app surfaces can consume the auth workspace contract directly.
  - `@voyant-travel/products` and `@voyant-travel/products-react`: tighten the itinerary-facing public surface and query/schema exports used by the shared product itinerary UI.
  - `@voyant-travel/legal` and `@voyant-travel/notifications`: keep template authoring and Liquid exports available from the package roots while aligning the notification/template surface with the updated booking traveler contract.
  - Supporting packages and tests also picked up repo-wide import-order, lint, and small compatibility cleanups across auth, booking requirements, checkout, octo, pricing, sellability, storefront, and utilities as part of bringing the whole worktree back to a green release state.
  - Align the touched app/template compatibility wrappers with the new primary traveler and workspace surfaces, and keep repo `typecheck` / `lint` green after the broader cleanup.
  - @voyant-travel/core@0.6.9
  - @voyant-travel/db@0.6.9
  - @voyant-travel/hono@0.6.9
  - @voyant-travel/utils@0.6.9

## 0.6.8

### Patch Changes

- b218885: Align booking root and child-list indexes with the package’s booking-scoped sort-heavy query shapes.
- Updated dependencies [b218885]
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/utils@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/hono@0.6.7
- @voyant-travel/utils@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/utils@0.6.6

## 0.6.5

### Patch Changes

- ae9933b: Align booking group and booking group member indexes with the actual parent-and-created-at list query shapes used by rooming and shared-booking group management.
  - @voyant-travel/core@0.6.5
  - @voyant-travel/db@0.6.5
  - @voyant-travel/hono@0.6.5
  - @voyant-travel/utils@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/hono@0.6.4
- @voyant-travel/utils@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/utils@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/utils@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/utils@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/utils@0.6.0

## 0.5.0

### Minor Changes

- ce72e29: Add a shared-room / split-booking group model

  Multiple separate bookings can now intentionally share one room/accommodation while each booking keeps its own finance + traveler records. Inspired by the ProTravel v3 `sharing_groups` pattern: flat peer bookings, a lightweight `booking_groups` + `booking_group_members` schema, smart cleanup on cancellation.

  `@voyant-travel/bookings`: new `bookingGroups` and `bookingGroupMembers` tables (TypeID prefixes `bkgr` / `bkgm`), service functions for CRUD plus reverse lookup, unified traveler list across members, and automatic group dissolution when a cancellation leaves ≤1 active members. New routes under `/v1/bookings/groups` plus the REST-nested `GET /v1/bookings/:id/group`.

  `@voyant-travel/bookings-react`: hooks for `useBookingGroups`, `useBookingGroup`, `useBookingGroupForBooking`, `useBookingGroupMutation`, and `useBookingGroupMemberMutation` (stateless — accepts `groupId` per-call so create-then-add flows work with a single hook instance).

  `@voyant-travel/db`: register TypeID prefixes `bkgr` (booking_groups) and `bkgm` (booking_group_members).

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/utils@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/utils@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/utils@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/utils@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2
- @voyant-travel/db@0.4.2
- @voyant-travel/hono@0.4.2
- @voyant-travel/utils@0.4.2

## 0.4.1

### Patch Changes

- 4c4ea3c: Avoid deep `@voyant-travel/db/schema/iam/kms` imports in published bundles by using the stable
  `@voyant-travel/db/schema/iam` entrypoint instead. This reduces downstream SSR bundler resolution issues
  under pnpm-based builds.
  - @voyant-travel/core@0.4.1
  - @voyant-travel/db@0.4.1
  - @voyant-travel/hono@0.4.1
  - @voyant-travel/utils@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Add a first-class admin booking overview lookup route and shared service helper
  that can resolve booking overviews by booking id, booking number, or booking
  code without requiring the public customer email lookup contract.
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/utils@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Add first-class public booking-session wizard state and storefront repricing.

  `@voyant-travel/bookings` now persists wizard session state in `booking_session_states`,
  includes that state in public session reads, exposes public state read/write
  routes, and adds `POST /v1/public/bookings/sessions/:sessionId/reprice` for
  previewing or applying room/unit repricing back onto the booking session.

  `@voyant-travel/bookings-react` now exports public session/state query helpers and a
  mutation helper for session state updates and repricing.

- 8566f2d: Republish the public storefront package surfaces so published tarballs match the
  current source tree. This release restores the public finance schemas needed by
  `@voyant-travel/finance-react`, publishes the public booking and product service
  exports already present in source, and ships the day/version/media product React
  exports from the package root.
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1
  - @voyant-travel/utils@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0
- @voyant-travel/utils@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0
- @voyant-travel/utils@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
- @voyant-travel/utils@0.1.1
