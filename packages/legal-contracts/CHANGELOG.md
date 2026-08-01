# @voyant-travel/legal-contracts

## 0.108.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.107.0

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
  - @voyant-travel/schema-kit@0.115.0

## 0.106.12

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0

## 0.106.11

### Patch Changes

- Updated dependencies [52352c4]
  - @voyant-travel/schema-kit@0.113.0

## 0.106.10

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/schema-kit@0.112.1
  - @voyant-travel/templating@0.104.2

## 0.106.9

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0

## 0.106.8

### Patch Changes

- 1d65f48: Preserve omitted contract number series fields during PATCH validation so partial
  updates no longer apply create-time defaults such as `scope: "customer"`.

## 0.106.7

### Patch Changes

- 5928f32: Fix legal policy PATCH schemas so omitted fields do not receive create defaults, and return a 409 conflict when deleting policies with recorded acceptances.

## 0.106.6

### Patch Changes

- 53f949c: Filter legal policy detail acceptances by the current policy so unrelated policy version acceptances are not shown.

## 0.106.5

### Patch Changes

- d2df4c1: Add a `forceRecompute` flag to booking contract document generation so issued contracts can refresh stored variables from corrected booking data and replace stale documents.

## 0.106.4

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.106.3

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.106.2

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.106.1

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.106.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

## 0.105.2

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.105.1

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.105.0

### Minor Changes

- c3f4fa0: Move Legal acceptance, contract, and term records to target refs with explicit legacy transaction compatibility fields.

### Patch Changes

- Updated dependencies [e80e3d3]
  - @voyant-travel/schema-kit@0.105.3

## 0.104.2

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/schema-kit@0.104.1
- @voyant-travel/templating@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/schema-kit@0.104.0
- @voyant-travel/templating@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/schema-kit@0.103.0
- @voyant-travel/templating@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/schema-kit@0.102.0
- @voyant-travel/templating@0.102.0

## 0.101.2

### Patch Changes

- 577eaf5: Republish finance and legal contract packages with the next release so exact internal package dependencies resolve from the public registry.
- Updated dependencies [577eaf5]
  - @voyant-travel/schema-kit@0.101.2
  - @voyant-travel/templating@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/schema-kit@0.101.1
- @voyant-travel/templating@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/schema-kit@0.101.0
- @voyant-travel/templating@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/schema-kit@0.100.0
- @voyant-travel/templating@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/schema-kit@0.99.0
- @voyant-travel/templating@0.99.0

## 0.98.0

### Minor Changes

- 485da95: Extract `@voyant-travel/templating` and purify `@voyant-travel/legal-contracts`.

  `@voyant-travel/templating` is a new lean package (`liquidjs` only) holding the
  Liquid/Mustache template renderer and syntax validator, moved out of
  `@voyant-travel/utils`. `@voyant-travel/utils/template-renderer` re-exports it, so existing
  import paths (finance, products, legal runtime) are unchanged.

  `@voyant-travel/legal-contracts` now depends on `@voyant-travel/templating` instead of
  `@voyant-travel/utils` for its contract-body Liquid-syntax validation — dropping the
  transitive Drizzle / `@voyant-travel/db` / pdf-lib dependency. Its tree is now just
  `zod` + `@voyant-travel/schema-kit` + `@voyant-travel/templating` (no data layer).

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/schema-kit@0.98.0
  - @voyant-travel/templating@0.98.0

## 0.97.0

### Minor Changes

- 7094c8e: Add `@voyant-travel/schema-kit` and extend the `*-contracts` pattern to the
  operational modules.

  `@voyant-travel/schema-kit` (pure: zod + typeid-js) is the new foundational home for
  schema primitives shared by the runtime and the contract packages — the TypeID
  system (prefix registry, id generation, zod validators), `booleanQueryParam`,
  and `kmsEnvelopeSchema`. These moved out of `@voyant-travel/db` (which now re-exports
  them from their original paths, so every call-site is unchanged) so they sit
  below the data layer and the contract packages can depend on them without
  pulling Drizzle.

  New zod-only contract packages own each module's validation surface (schemas +
  enums): `@voyant-travel/bookings-contracts`, `@voyant-travel/finance-contracts`,
  `@voyant-travel/crm-contracts`, `@voyant-travel/transactions-contracts`,
  `@voyant-travel/suppliers-contracts`, `@voyant-travel/identity-contracts`, and
  `@voyant-travel/legal-contracts`. Each runtime module re-exports from its contracts
  package, so existing `@voyant-travel/<module>/validation` import paths are unchanged.
  Shared primitives come from `@voyant-travel/schema-kit`, keeping the contract
  packages free of the data layer.

  (`legal-contracts` still transitively depends on `@voyant-travel/utils` for the
  template-syntax validator used by contract validation — a tracked follow-up
  would purify it.)

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/schema-kit@0.97.0
  - @voyant-travel/utils@0.97.0
