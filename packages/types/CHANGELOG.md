# @voyant-travel/types

## 0.109.10

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0

## 0.109.9

### Patch Changes

- Updated dependencies [f945310]
  - @voyant-travel/db@0.118.0

## 0.109.8

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0

## 0.109.7

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0

## 0.109.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/db@0.115.0

## 0.109.5

### Patch Changes

- 0f9bd93: Share host-owned human-readable permission labels between Marketplace discovery and managed consent.

## 0.109.4

### Patch Changes

- 3a90c27: Publish the first versioned remote App API surface with app-token routing,
  service-boundary installation and scope checks, custom-field owner isolation,
  finance action approval enforcement, webhook/audit self-read endpoints, and
  runtime app-token resolution.

## 0.109.3

### Patch Changes

- 2c863ab: Grant managed-cloud admin sessions explicit access-catalog scopes for admin-only resources such as Team management.

## 0.109.2

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
  - @voyant-travel/db@0.114.5

## 0.109.1

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
  - @voyant-travel/db@0.114.4

## 0.109.0

### Minor Changes

- 4d0eeed: Remove deprecated beta compatibility surfaces in favor of their canonical APIs.

  - Import Hono transport bundles from `@voyant-travel/hono/bundle` and use
    `HonoBundle`, `defineHonoBundle`, and `expandHonoBundles`.
  - Import public document delivery APIs from
    `@voyant-travel/public-document-delivery`.
  - Use permission-named API key helpers instead of the removed scope aliases.
  - Use `createRedisKvStore` for Redis-backed caching instead of the removed
    no-op Redis compatibility functions.
  - Use `entityTagColumns` instead of `tagsCoreColumns`.

### Patch Changes

- Updated dependencies [4d0eeed]
  - @voyant-travel/db@0.114.0

## 0.108.1

### Patch Changes

- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/db@0.113.0

## 0.108.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.

### Patch Changes

- @voyant-travel/db@0.112.2

## 0.107.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0

## 0.107.2

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/db@0.111.0

## 0.107.1

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0

## 0.107.0

### Minor Changes

- c9a356f: Extend the api-key permission grammar for fine-grained agent operations and carry
  an audience on the key grant.

  - `@voyant-travel/types`: add `cancel`/`refund`/`void`/`publish`/`send` actions and
    `dashboard`/`content`/`media`/`bookings-pii` resources (with descriptor groups);
    PII resources are never satisfied by the `*` wildcard; add `assertKnownPermissions`
    and `API_KEY_GRANT_PRESETS` (a scope subset bundled with an audience).
  - `@voyant-travel/core`: add `audience` to `VoyantAuthContext`.
  - `@voyant-travel/hono`: derive an API key's audience from its grant metadata and let
    the request actor follow it (replacing the hardcoded staff default).
  - `@voyant-travel/auth`: validate permission strings and audience at key-mint time and
    resolve grant presets.

### Patch Changes

- @voyant-travel/db@0.109.5

## 0.106.1

### Patch Changes

- ebf59f1: Add quotes and trips to the grantable API key permission catalog.

## 0.106.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

## 0.105.0

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
  - @voyant-travel/db@0.109.0

## 0.104.5

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0

## 0.104.4

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/db@0.107.0

## 0.104.3

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/db@0.106.0

## 0.104.2

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/db@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/db@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/db@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/db@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/db@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/db@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/db@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/db@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/db@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/db@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/db@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/db@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/db@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/db@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/db@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/db@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/db@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/db@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/db@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/db@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/db@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/db@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/db@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/db@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/db@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/db@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/db@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/db@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/db@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/db@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/db@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/db@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/db@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/db@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/db@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/db@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/db@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/db@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/db@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/db@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/db@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/db@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/db@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/db@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/db@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/db@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/db@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/db@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/db@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/db@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/db@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/db@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/db@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/db@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/db@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/db@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/db@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/db@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/db@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/db@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/db@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/db@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/db@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/db@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/db@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/db@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/db@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/db@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/db@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/db@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/db@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/db@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/db@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/db@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/db@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/db@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/db@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/db@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/db@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/db@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/db@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/db@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/db@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/db@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/db@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/db@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/db@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/db@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/db@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/db@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/db@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/db@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/db@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/db@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/db@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/db@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/db@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/db@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/db@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/db@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/db@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/db@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/db@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/db@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/db@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/db@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/db@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/db@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/db@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/db@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/db@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/db@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/db@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/db@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/db@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/db@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/db@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/db@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/db@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/db@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/db@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/db@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/db@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/db@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/db@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/db@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/db@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/db@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/db@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/db@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/db@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/db@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/db@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/db@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/db@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/db@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/db@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/db@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/db@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/db@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/db@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/db@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/db@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/db@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/db@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/db@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/db@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/db@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/db@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/db@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/db@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/db@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/db@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/db@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/db@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/db@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/db@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/db@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/db@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/db@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/db@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/db@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/db@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/db@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/db@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/db@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/db@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/db@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/db@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/db@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/db@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/db@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/db@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/db@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/db@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/db@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/db@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/db@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/db@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/db@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/db@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/db@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/db@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/db@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/db@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/db@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/db@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/db@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/db@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/db@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/db@0.31.3

## 0.31.2

### Patch Changes

- 54ddc93: Add API token management powered by Better Auth API keys, including reusable React hooks, a shared auth UI package, canonical permission presets, and API-key route permission guards.
  - @voyant-travel/db@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/db@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/db@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/db@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/db@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/db@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/db@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/db@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/db@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/db@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/db@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/db@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/db@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/db@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/db@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/db@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/db@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/db@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/db@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/db@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/db@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/db@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/db@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/db@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/db@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/db@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/db@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/db@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/db@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/db@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/db@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/db@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/db@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/db@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/db@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/db@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/db@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/db@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/db@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/db@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/db@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/db@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/db@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/db@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/db@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/db@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
  - @voyant-travel/db@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/db@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/db@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/db@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/db@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
  - @voyant-travel/db@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/db@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/db@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/db@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/db@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/db@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/db@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/db@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/db@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/db@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/db@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/db@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/db@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/db@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/db@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
  - @voyant-travel/db@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/db@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/db@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/db@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/db@0.1.1

## 1.1.11

### Patch Changes

- @voyant-travel/db@1.1.11

## 1.1.1

### Patch Changes

- @voyant-travel/db@1.1.1

## 1.1.0

### Minor Changes

- [#292](https://github.com/voyant-travel/voyant/pull/292)
  [`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)
  Thanks [@mihaipxm](https://github.com/mihaipxm)! - Initial SDK release

### Patch Changes

- Updated dependencies
  [[`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)]:
  - @voyant-travel/db@1.1.0
