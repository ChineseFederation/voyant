# @voyant-travel/identity

## 0.236.3

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/db@0.120.2
  - @voyant-travel/hono@0.140.1

## 0.236.2

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/core@0.137.2

## 0.236.1

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/types@0.109.12

## 0.236.0

## 0.235.0

## 0.234.0

### Patch Changes

- Updated dependencies [c986bd5]
  - @voyant-travel/core@0.137.1
  - @voyant-travel/db@0.119.4
  - @voyant-travel/identity-contracts@0.104.16

## 0.233.0

### Patch Changes

- @voyant-travel/db@0.119.3
- @voyant-travel/identity-contracts@0.104.15

## 0.232.0

## 0.231.0

## 0.230.0

## 0.229.0

## 0.228.0

## 0.227.0

### Patch Changes

- @voyant-travel/db@0.119.2
- @voyant-travel/identity-contracts@0.104.14

## 0.226.0

## 0.225.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.224.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8

## 0.223.0

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/action-ledger@0.115.7

## 0.222.0

## 0.221.1

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6

## 0.221.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.220.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.219.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2

## 0.218.0

## 0.217.0

## 0.216.0

## 0.215.0

## 0.214.0

## 0.213.0

## 0.212.0

## 0.211.0

## 0.210.0

## 0.209.0

## 0.208.0

## 0.207.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on the six grandfathered contact-point,
  address, and named-contact actions and remove them from the legacy
  execute+tools allowlist:

  - `action.create-contact-point`, `action.create-address`, and
    `action.create-named-contact` already claim their command idempotently via
    `admitHandlerActionPolicy` with a `handler-command-claim-v1` `createdTarget`
    contract, backed by plain local Postgres inserts against the owning
    entity; this adds `availability` and `effectBoundary: "local"`.
  - `action.update-contact-point`, `action.update-address`, and
    `action.update-named-contact` are single local Postgres updates against an
    existing row (already declared via `commandTargetField: "id"`), so they
    declare `availability`, `effectBoundary: "local"`, and
    `targetLifecycle: "existing"`.

  No runtime changes.

## 0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6

## 0.205.0

## 0.204.0

## 0.203.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/tools@0.7.0

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
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/identity-contracts@0.104.13

## 0.199.0

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4

## 0.198.1

## 0.198.0

## 0.197.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.196.0

### Minor Changes

- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.

### Patch Changes

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

## 0.195.0

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/core@0.132.1

## 0.193.0

## 0.192.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1

## 0.192.0

## 0.191.0

## 0.190.0

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9

## 0.189.0

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0

## 0.187.0

## 0.186.0

## 0.185.0

## 0.184.0

## 0.183.0

## 0.182.2

## 0.182.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.182.0

## 0.181.0

## 0.180.1

### Patch Changes

- @voyant-travel/db@0.117.1
- @voyant-travel/identity-contracts@0.104.12

## 0.180.0

## 0.179.0

## 0.178.0

## 0.177.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7

## 0.175.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/types@0.109.6

## 0.174.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.173.0

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/db@0.114.14

## 0.171.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6

## 0.169.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4

## 0.169.0

## 0.168.0

## 0.167.0

## 0.166.0

## 0.165.0

## 0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/identity-contracts@0.104.11

## 0.162.1

## 0.162.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/db@0.114.8

## 0.161.0

### Patch Changes

- Updated dependencies [a1842a7]
  - @voyant-travel/hono@0.127.2

## 0.160.0

### Minor Changes

- d9e8984: Add guarded MCP Tools for reusable contact points, addresses, and named contacts.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.159.0

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/db@0.114.6

## 0.158.0

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
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/types@0.109.2

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
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/identity-contracts@0.104.10

## 0.156.0

### Patch Changes

- @voyant-travel/db@0.114.3
- @voyant-travel/identity-contracts@0.104.9

## 0.155.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2

## 0.155.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0

## 0.153.0

### Patch Changes

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
- Updated dependencies [047c3f9]
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1

## 0.152.0

### Minor Changes

- bd7a830: Emit selected-graph OpenAPI documents from route-owned metadata, beginning with
  the identity admin API authority.

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.151.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.151.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/types@0.107.3

## 0.151.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2

## 0.151.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1

## 0.151.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for identity, relationships, finance,
  and operations graph surfaces.
- e3dc5a9: Move existing customer and commerce package surfaces into package-owned Voyant manifests, including Node application events, tools, access resources, action metadata, setup migrations, outbound webhooks, and retain-data lifecycle declarations.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2

## 0.150.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3

## 0.149.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.149.0

## 0.148.0

## 0.147.0

## 0.146.0

## 0.145.0

## 0.144.0

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/types@0.107.1

## 0.142.0

## 0.141.0

## 0.140.0

## 0.139.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/db@0.109.5

## 0.138.3

## 0.138.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0

## 0.138.1

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0

## 0.138.0

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0

## 0.137.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0

## 0.136.2

### Patch Changes

- Updated dependencies [12a1eb2]
  - @voyant-travel/hono@0.116.2

## 0.136.1

## 0.136.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/identity-contracts@0.104.6

## 0.135.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/identity-contracts@0.104.5

## 0.134.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0

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

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/identity-contracts@0.104.4

## 0.132.0

## 0.131.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/db@0.108.5

## 0.131.0

## 0.130.0

## 0.129.0

## 0.128.0

## 0.127.0

## 0.126.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4

## 0.126.0

## 0.125.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/identity-contracts@0.104.3
- @voyant-travel/hono@0.112.2

## 0.124.0

### Patch Changes

- @voyant-travel/hono@0.112.1

## 0.123.0

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/db@0.108.2

## 0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [9ea7220]
  - @voyant-travel/hono@0.111.0

## 0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [6bff46f]
  - @voyant-travel/hono@0.110.0

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/hono@0.109.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0

## 0.118.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0

## 0.115.0

## 0.114.0

## 0.113.0

## 0.112.0

## 0.111.0

## 0.110.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3

## 0.109.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/hono@0.105.2

## 0.108.0

## 0.107.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0

## 0.107.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/identity-contracts@0.104.2
  - @voyant-travel/hono@0.104.2

## 0.106.0

## 0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/identity-contracts@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/hono@0.104.0
- @voyant-travel/identity-contracts@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/identity-contracts@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/core@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/hono@0.102.0
- @voyant-travel/identity-contracts@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/core@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/hono@0.101.2
- @voyant-travel/identity-contracts@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/core@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/hono@0.101.1
- @voyant-travel/identity-contracts@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/core@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/hono@0.101.0
- @voyant-travel/identity-contracts@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/identity-contracts@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/identity-contracts@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/core@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/hono@0.98.0
- @voyant-travel/identity-contracts@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/identity-contracts@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/core@0.96.0
- @voyant-travel/db@0.96.0
- @voyant-travel/hono@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/core@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/hono@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/hono@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/hono@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/hono@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/hono@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/hono@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/core@0.85.2
- @voyant-travel/db@0.85.2
- @voyant-travel/hono@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/core@0.84.3
- @voyant-travel/db@0.84.3
- @voyant-travel/hono@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/hono@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/hono@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/core@0.81.21
- @voyant-travel/db@0.81.21
- @voyant-travel/hono@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/core@0.81.20
- @voyant-travel/db@0.81.20
- @voyant-travel/hono@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/core@0.81.19
- @voyant-travel/db@0.81.19
- @voyant-travel/hono@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/core@0.81.16
- @voyant-travel/db@0.81.16
- @voyant-travel/hono@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/core@0.81.13
- @voyant-travel/db@0.81.13
- @voyant-travel/hono@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/core@0.81.9
- @voyant-travel/db@0.81.9
- @voyant-travel/hono@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/core@0.81.8
- @voyant-travel/db@0.81.8
- @voyant-travel/hono@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/core@0.81.7
- @voyant-travel/db@0.81.7
- @voyant-travel/hono@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/core@0.81.4
- @voyant-travel/db@0.81.4
- @voyant-travel/hono@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/core@0.81.3
- @voyant-travel/db@0.81.3
- @voyant-travel/hono@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/hono@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/hono@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/core@0.80.15
- @voyant-travel/db@0.80.15
- @voyant-travel/hono@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/hono@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/core@0.80.9
- @voyant-travel/db@0.80.9
- @voyant-travel/hono@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/core@0.80.2
- @voyant-travel/db@0.80.2
- @voyant-travel/hono@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/core@0.77.1
- @voyant-travel/db@0.77.1
- @voyant-travel/hono@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/hono@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/hono@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/hono@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/hono@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/hono@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/core@0.66.5
- @voyant-travel/db@0.66.5
- @voyant-travel/hono@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/core@0.66.4
- @voyant-travel/db@0.66.4
- @voyant-travel/hono@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/hono@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/hono@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/hono@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/hono@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/hono@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/hono@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/core@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/hono@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/hono@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/hono@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/core@0.53.0
- @voyant-travel/db@0.53.0
- @voyant-travel/hono@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4
- @voyant-travel/db@0.52.4
- @voyant-travel/hono@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/core@0.52.2
- @voyant-travel/db@0.52.2
- @voyant-travel/hono@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1
- @voyant-travel/db@0.52.1
- @voyant-travel/hono@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8
- @voyant-travel/db@0.50.8
- @voyant-travel/hono@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6
- @voyant-travel/db@0.50.6
- @voyant-travel/hono@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3
- @voyant-travel/db@0.41.3
- @voyant-travel/hono@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0
- @voyant-travel/db@0.39.0
- @voyant-travel/hono@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0
- @voyant-travel/db@0.38.0
- @voyant-travel/hono@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0
- @voyant-travel/db@0.37.0
- @voyant-travel/hono@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0
- @voyant-travel/db@0.36.0
- @voyant-travel/hono@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/core@0.34.0
- @voyant-travel/db@0.34.0
- @voyant-travel/hono@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1
- @voyant-travel/db@0.33.1
- @voyant-travel/hono@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/hono@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/hono@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/hono@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6
- @voyant-travel/db@0.26.6
- @voyant-travel/hono@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/core@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/hono@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/core@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/hono@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/core@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/hono@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/core@0.13.0
- @voyant-travel/db@0.13.0
- @voyant-travel/hono@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/core@0.11.0
- @voyant-travel/db@0.11.0
- @voyant-travel/hono@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/core@0.8.0
- @voyant-travel/db@0.8.0
- @voyant-travel/hono@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/hono@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9
- @voyant-travel/db@0.6.9
- @voyant-travel/hono@0.6.9

## 0.6.8

### Patch Changes

- b218885: Align identity entity-scoped contact, address, and named-contact indexes with the active parent-and-sort query shapes used for primary-first list and entity-kind/entity-role filtering.
- Updated dependencies [b218885]
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/hono@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5
- @voyant-travel/db@0.6.5
- @voyant-travel/hono@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/hono@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2
- @voyant-travel/db@0.4.2
- @voyant-travel/hono@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1
- @voyant-travel/db@0.4.1
- @voyant-travel/hono@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
