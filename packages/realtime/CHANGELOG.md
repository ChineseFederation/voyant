# @voyant-travel/realtime

## 0.9.4

### Patch Changes

- Updated dependencies [33cba53]
- Updated dependencies [73a3ca3]
  - @voyant-travel/hono@0.145.0

## 0.9.3

### Patch Changes

- 46d00dc: Retire the storefront entity: the key becomes the unit, customer accounts move to the deployment.

  A deployment IS the tenant boundary (ADR-0001), so it serves one set of surfaces, and
  the only scenario that justified N storefront rows — several brands inside one tenant —
  is explicitly not happening. What the row carried splits between the two things that
  genuinely vary: the **key** (allowed origins, channel, cookie scope) and the
  **deployment** (customer-auth methods, buyer-account policy, OAuth credentials).

  **Breaking:**

  - `storefronts`, `storefront_api_keys` and `storefront_customer_auth_credentials` are
    dropped, replaced by `public_api_keys`, `customer_account_settings` (a singleton) and
    `customer_account_credentials`. Key ids are copied verbatim — a key's identity is what
    an operator has already recorded elsewhere, so nothing is rotated by a rename.
  - `storefrontRuntimePort` → `publicApiRuntimePort`, with the DTOs and the local adapter
    reshaped onto the key. The storefront→channel link table and its provider are gone:
    a key names a channel or defaults to Direct.
  - `/v1/admin/storefronts` splits into `/v1/admin/public-api-keys` (keys) and
    `/v1/admin/customer-accounts` (sign-in methods, buyer policy, provider credentials),
    with separate access resources so the two are separately grantable. Revoking a key now
    requires `public-api-keys:delete` rather than `:write`.
  - The `storefront` packages are renamed: `@voyant-travel/storefront` →
    `@voyant-travel/public-api`, `-react` → `@voyant-travel/public-api-react`, `-sdk` →
    `@voyant-travel/public-api-client`. All three are `private: true` with in-repo
    consumers only, so there is no npm surface to deprecate. Its admin API moves from
    `/v1/admin/storefront` to `/v1/admin/public-api`, its `openapi/storefront/*` documents
    to `openapi/public-api/*`, and its capability `storefront.data-owner` to
    `public-api.data-owner`.
  - **Scope rename:** `storefront:read|write` → `public-api:read|write` on the composed
    public surface (offers and customer intake). The key-management resource introduced
    above is `public-api-keys:*`, kept distinct because the two govern different things
    and would otherwise collide on one name.
  - The BFF origin header is renamed `x-voyant-storefront-origin` → `x-voyant-public-origin`.
    Both spellings are NOT accepted: a second accepted spelling on a security-relevant
    header is a second thing to get wrong.
  - Trips and Bookings scope rebinds from `(storefrontId, channelId)` to `channelId` alone.
    Live capabilities and opaque shopping references keep working — the digests are
    unchanged and the surviving half of each check still matches.
  - Error codes `active_storefront_channel_required` → `active_channel_required` and
    `booking_storefront_origin_mismatch` → `booking_channel_mismatch`; the
    `bookingInquiryCreated` event payload drops its required `storefrontId`.
  - `@voyant-travel/distribution/setup/storefront-channel-bindings` is removed. It raised
    on a missing `storefronts` table, so it could only fail after this change.

  Two frontends declaring the same origin is now the ordinary case (a site's publishable
  key and its BFF's secret key), so the cross-storefront origin-overlap ban is gone.
  Keyless CORS preflight instead requires that the matching keys agree on a channel, and
  denies rather than throwing when they do not.

  **Tables renamed:** `trip_storefront_access` → `trip_public_access`,
  `trip_storefront_booking_operations` → `trip_public_booking_operations`, and
  `storefront_verification_challenges` → `customer_verification_challenges` (verification is
  the deployment's, so it sits beside `customer_account_settings`). Pure `ALTER TABLE
RENAME` — rows, keys and indexes survive, and live capabilities keep resolving.

  Note that Postgres does NOT rename constraint-backed indexes with their table, and Drizzle
  derives those names FROM the table. The primary keys and the `capability_digest` unique
  constraint are therefore renamed explicitly in the same migration; splitting them would
  leave an upgraded database disagreeing with a fresh replay, which is exactly what
  `verify:migration-replay-parity` compares.

  **Identifiers:** 351 distinct `Storefront*`/`storefront*` identifiers (3292 occurrences
  across 195 files) become `PublicApi*`/`publicApi*`. The rename is anchored on a following
  uppercase letter, so it can only match camelCase/PascalCase identifiers and cannot touch
  snake_case wire codes (`storefront_shopping_unavailable`), graph port ids, or bare
  literals. Graph port ids move separately and deliberately: `storefront.*` →
  `public-api.*`, and `trips.storefront-offer-resolver.runtime` →
  `trips.public-offer-resolver.runtime`.

  **Published OpenAPI:** every `/v1/public/*` operation was stamped
  `x-voyant-surface: "storefront"`; it is now `"public-api"`, across 17 documents.
  `ApiSurface` and `OperatorOpenApiDocuments` change with it — the latter's
  `storefront` key becomes `"public-api"`.

  The verification routes move with their mount: `/v1/public/storefront-verification/*` →
  `/v1/public/customer-verification/*`.

  **Filenames and constants:** 39 source files carrying `storefront` in their
  basename are renamed with their contents — `auth/src/storefront-credentials.ts`
  → `public-api-credentials.ts`, `trips/src/storefront-access.ts` →
  `public-api-access.ts`, and so on. Six subpath exports move with them
  (`@voyant-travel/auth/storefront-credentials`,
  `@voyant-travel/flights/storefront-booking-lifecycle`,
  `@voyant-travel/relationships-contracts/storefront-intake`,
  `@voyant-travel/trips/storefront-trip-offer-resolver-port`,
  `.../storefront-trip-selections-runtime`, and
  `@voyant-travel/types/storefront-key-scopes`). All six packages are `private`,
  so there is no npm surface to deprecate.

  A further 12 `STOREFRONT_*` constants become `PUBLIC_API_*`. The earlier
  identifier sweep anchored on a following uppercase LETTER, so SCREAMING_SNAKE
  names — where the next character is an underscore — were never matched. Their
  VALUES are untouched; none of them contained the retired name.

  Three exceptions, each because the name is data rather than a name:

  - `env.STOREFRONT_BANK_BENEFICIARY|_IBAN|_NAME` stay. They are already legacy
    fallbacks behind `BANK_TRANSFER_*`, so renaming them would drop the setting
    of exactly the deployments they exist to serve.
  - `"storefront-trip-booking-v1"` stays. It is a version token hashed into the
    operation digest recorded in `trip_public_booking_operations`; renaming it
    changes every digest, so an in-flight idempotent retry would stop matching
    its own recorded operation and book twice.
  - Migration filenames stay. A migration's name is its ledger identity.

  `PUBLIC_API_KEY_HEADER` had been written independently in `@voyant-travel/core`
  and `@voyant-travel/auth`, both as `"x-api-key"`. Auth now re-exports core's
  rather than declaring a second copy.

  **Environment:** `VOYANT_STOREFRONT_CHANNEL_ID` → `VOYANT_PUBLIC_API_CHANNEL_ID`. This one
  IS still read under its old name, which is a deliberate exception to the no-dual-spelling
  rule used for the request headers: an unset channel now resolves to the deployment's Direct
  channel, so a deployment that had pinned another channel would quietly re-route its sales
  rather than fail loudly. `VOYANT_STOREFRONT_ORIGIN` is documentation-only and simply becomes
  `VOYANT_PUBLIC_ORIGIN`.

  ADRs under `docs/adr/` are deliberately NOT rewritten — they record what was decided at
  the time, and this retirement is itself now part of that record.

- Updated dependencies [46d00dc]
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/core@0.144.0

## 0.9.2

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/core@0.143.0
  - @voyant-travel/hono@0.143.2

## 0.9.1

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/hono@0.143.1

## 0.9.0

### Minor Changes

- 36f3085: Enforce the PK/SK capability line on the public API, and give secret keys scopes.

  `vpk_`/`vsk_` existed at issuance, in storage and on an admin label, and nothing
  branched on them for authorization: no route required a secret key and none was
  denied to a publishable one, so a leaked `vpk_` could commit bookings and open
  payment sessions — bounded only by an `Origin` header, which any non-browser
  client sets freely.

  - Every `/v1/public/*` API bundle now declares `publishable` (and
    `guardedIntake`, for routes that capture person data with nothing challenging
    the submitter). One middleware enforces it, and **an undeclared route is
    secret-key-only** — silence is a denial, not an omission.
  - Every published operation carries `x-voyant-key-kind: publishable | secret`,
    derived from the same declaration the middleware reads.
  - Origin handling is split by kind: a publishable key still requires an origin
    (it is the only thing narrowing where a browser-resident credential may be
    used); a secret key no longer does, so a genuine server-to-server caller can
    use the API without a BFF forwarding a synthetic header. An origin that IS
    presented is still checked, whichever kind sent it. Dynamic CORS applies to
    the publishable path only.
  - A secret key now authenticates `/v1/admin/*` and carries a scope grant in the
    deployment's own access-catalog vocabulary, defaulting to a commerce-shaped
    set at mint. `{"*": ["*"]}` is an explicit opt-in and is called out in the
    admin surface.
  - The `voy_` deployment API key on `/v1/admin/*` is deprecated. It still works
    and now logs on use; close the window with
    `VOYANT_DEPLOYMENT_API_KEY_MODE=disabled`, which stops minting as well as
    authenticating. Admin sessions are unaffected, as are `voy_` keys with a
    customer, partner or supplier audience.

  **Breaking for custom public routes.** A deployment-authored `ApiModule` that
  mounts `/v1/public/*` routes must declare `publishable` for browser clients to
  reach them; without it the routes are secret-key-only. First-party modules are
  already declared. See `docs/architecture/storefront-key-capability-line.md`.

### Patch Changes

- Updated dependencies [c805276]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
  - @voyant-travel/core@0.141.0
  - @voyant-travel/hono@0.143.0

## 0.8.6

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/hono@0.142.1

## 0.8.5

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0

## 0.8.4

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0

## 0.8.3

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/hono@0.140.1

## 0.8.2

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/core@0.137.2

## 0.8.1

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/hono@0.139.0

## 0.8.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

## 0.7.6

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/hono@0.138.1

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
