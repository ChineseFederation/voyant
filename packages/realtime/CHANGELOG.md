# @voyant-travel/realtime

## 0.7.5

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.7.4

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.7.3

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0

## 0.7.2

### Patch Changes

- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
  - @voyant-travel/hono@0.135.0

## 0.7.1

### Patch Changes

- d367d9f: Make quote-specific Realtime invalidation subscribers follow the Quotes module's standard-distribution lifecycle.

## 0.7.0

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
  - @voyant-travel/hono@0.134.5

## 0.6.14

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/hono@0.134.4

## 0.6.13

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/hono@0.134.3

## 0.6.12

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/hono@0.134.2

## 0.6.11

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/hono@0.134.1

## 0.6.10

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0

## 0.6.9

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.6.8

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.6.7

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/hono@0.131.0

## 0.6.6

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/hono@0.130.1

## 0.6.5

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0

## 0.6.4

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.6.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/hono@0.128.6

## 0.6.2

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/hono@0.128.4

## 0.6.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/hono@0.128.1

## 0.6.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/hono@0.128.0

## 0.5.2

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/hono@0.127.1

## 0.5.1

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0

## 0.5.0

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
  - @voyant-travel/core@0.122.2

## 0.4.5

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/hono@0.126.3

## 0.4.4

### Patch Changes

- d83d237: Repair packaged consumer development and production startup, keep shared UI
  contexts single-instanced under Vite, make unconfigured realtime quiet, and
  restore narrow client-safe validation and Finance voucher setup exports. Resolve
  legacy frontend imports through product-owned browser facades and allow clean CI
  installs to fetch metadata for external dependencies.

## 0.4.3

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/hono@0.126.2

## 0.4.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/hono@0.126.1

## 0.4.1

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/core@0.120.0

## 0.4.0

### Minor Changes

- 490d132: Own the standard Node provider policy and selected admin invalidation subscribers in the Realtime package.
- 490d132: Publish package-owned OpenAPI registries and graph document declarations for storage, realtime, and public document delivery APIs, with exact operation ownership for overlapping route mounts.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Replace target-labelled standard Node runtime entries with neutral package-owned runtime exports and static contributors.
- 490d132: Derive host-service runtime port bindings from deployment capabilities.
- 490d132: Compose selected-graph and project-local admin extensions through the generic admin host, and declare Realtime's admin integration directly in its package manifest.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
  - @voyant-travel/core@0.119.0
  - @voyant-travel/hono@0.125.1

## 0.3.1

### Patch Changes

- 91f3ffb: Stage the package-owned deferred admin invalidation subscriber runtime contract and narrow publication capability for selected-graph activation.
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/hono@0.125.0

## 0.3.0

### Minor Changes

- c66f9a5: Add package-owned typed runtime factories and deployment port binding, then migrate storage and realtime away from Operator package-id bindings.

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/hono@0.124.1

## 0.2.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/hono@0.124.0

## 0.2.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/hono@0.123.2

## 0.2.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/hono@0.123.0

## 0.2.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for action ledger, notifications,
  operator settings, and realtime.
- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/hono@0.122.4

## 0.1.9

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/hono@0.122.3

## 0.1.8

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3

## 0.1.7

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0

## 0.1.6

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0

## 0.1.5

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0

## 0.1.4

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0

## 0.1.3

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0

## 0.1.2

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0

## 0.1.1

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
  - @voyant-travel/hono@0.115.0
