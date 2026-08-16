# @voyant-travel/plugin-voyant-connect

## 0.35.1

### Patch Changes

- Updated dependencies [380c46e]
  - @voyant-travel/public-api@0.262.0

## 0.35.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/catalog@0.259.0
  - @voyant-travel/public-api@0.261.0
  - @voyant-travel/core@0.144.0

## 0.34.0

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/catalog-contracts@0.136.0
  - @voyant-travel/catalog@0.258.0
  - @voyant-travel/core@0.143.0
  - @voyant-travel/storefront@0.260.3

## 0.33.0

### Patch Changes

- Updated dependencies [1a903c5]
  - @voyant-travel/catalog-contracts@0.135.0
  - @voyant-travel/storefront@0.260.2

## 0.32.2

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/graph-contracts@0.7.0
  - @voyant-travel/core@0.142.1
  - @voyant-travel/storefront@0.260.1

## 0.32.1

### Patch Changes

- @voyant-travel/storefront@0.260.0

## 0.32.0

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/catalog@0.257.0
  - @voyant-travel/storefront@0.259.1

## 0.31.4

### Patch Changes

- @voyant-travel/storefront@0.259.0

## 0.31.3

### Patch Changes

- @voyant-travel/storefront@0.258.0

## 0.31.2

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/storefront@0.257.6

## 0.31.1

### Patch Changes

- f35c83e: Adopt `@voyant-travel/connect-adapter` 0.6.1, which resolves cruises keyed by an encoded SourceRef.

  The catalog keys sourced cruises as `crus_sr_<base64url(JSON)>`, but the Connect
  adapter only understood the legacy `cruise:<externalId>:<locale>` form, so no
  candidate ever reduced to the upstream external id. The per-id lookup 404'd, the
  fallback list scan matched nothing, and `getContent` threw
  `Connect cruise content not found` — a 500 on every sourced cruise content read,
  admin and storefront alike.

## 0.31.0

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog-contracts@0.134.0
  - @voyant-travel/catalog@0.256.0
  - @voyant-travel/storefront@0.257.1

## 0.30.0

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [c805276]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/storefront@0.257.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/catalog@0.255.0
  - @voyant-travel/cruises@0.239.0
  - @voyant-travel/graph-contracts@0.6.0

## 0.29.0

### Patch Changes

- Updated dependencies [3d7ed59]
- Updated dependencies [ab7133f]
- Updated dependencies [c911139]
  - @voyant-travel/catalog-contracts@0.133.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/public-api@0.256.0

## 0.28.0

### Patch Changes

- 5850e1d: Accept the Storefront shopping contract's free-text package destination and map it to Connect's city search while continuing to reject unsupported coordinate filters.
- Updated dependencies [c164b40]
  - @voyant-travel/catalog-contracts@0.132.0
  - @voyant-travel/public-api@0.255.7

## 0.27.1

### Patch Changes

- 1a98c8a: Carry server-resolved sourced-stay identities and exact date, room, rate, and occupancy pins through opaque Trip selections, then revalidate price, lock, and confirm through the managed Connect lifecycle without exposing supplier authority to storefront clients.
- Updated dependencies [1a98c8a]
  - @voyant-travel/public-api@0.255.4

## 0.27.0

### Minor Changes

- de6e62a: Wire admitted Voyant Connect dynamic-package search into the managed Storefront
  shopping provider without exposing connection or credential selectors.

### Patch Changes

- d359373: Redeem bound Storefront package capabilities into stable sourced Catalog booking selections.
- 4c2b4ce: Add bound opaque continuations for managed multi-source flight, stay, and package shopping.
- Updated dependencies [b95e995]
- Updated dependencies [5602eff]
- Updated dependencies [231acfa]
- Updated dependencies [e363b1b]
- Updated dependencies [6945d07]
- Updated dependencies [e06888c]
- Updated dependencies [b760ac6]
- Updated dependencies [d359373]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog-contracts@0.131.0
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/public-api@0.255.0

## 0.26.0

### Patch Changes

- 6b672c0: Commit sourced dynamic packages through a freshly validated Voyant Connect
  hold while preserving Catalog Booking Session quote and supplier-operation
  idempotency semantics.
- Updated dependencies [6b672c0]
- Updated dependencies [03a91d0]
  - @voyant-travel/catalog-contracts@0.130.0

## 0.25.0

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0
  - @voyant-travel/catalog@0.252.0

## 0.24.1

### Patch Changes

- Updated dependencies [1e0506f]
  - @voyant-travel/graph-contracts@0.5.0

## 0.24.0

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0
  - @voyant-travel/catalog@0.251.0

## 0.23.0

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0
  - @voyant-travel/catalog@0.250.0

## 0.22.1

### Patch Changes

- Updated dependencies [4f9a097]
  - @voyant-travel/graph-contracts@0.4.0

## 0.22.0

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/catalog@0.249.0

## 0.21.0

### Patch Changes

- Updated dependencies [6c77f7d]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/catalog@0.248.0

## 0.20.0

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/catalog@0.247.0

## 0.19.0

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/catalog@0.246.0

## 0.18.0

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0
  - @voyant-travel/catalog@0.245.0

## 0.17.0

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog@0.244.0

## 0.16.0

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/catalog@0.243.0

## 0.15.0

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog@0.242.0

## 0.14.0

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog@0.241.0

## 0.13.0

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/cruises@0.238.0

## 0.12.0

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/cruises@0.237.0

## 0.11.0

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/cruises@0.236.0

## 0.10.1

### Patch Changes

- Updated dependencies [d432646]
  - @voyant-travel/graph-contracts@0.3.0

## 0.10.0

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog@0.237.0

## 0.9.0

### Patch Changes

- Updated dependencies [c35841b]
- Updated dependencies [e4833a1]
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/graph-contracts@0.2.0

## 0.8.0

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/catalog-contracts@0.116.0

## 0.7.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/cruises@0.235.0

## 0.6.0

### Patch Changes

- @voyant-travel/catalog@0.233.0
- @voyant-travel/cruises@0.234.0

## 0.5.0

### Minor Changes

- 051e6e3: Resolve the catalog's inventory channel through a runtime port instead of
  importing Voyant Connect.

  `CatalogSourcesRuntimeExtension` is the channel contract — `registerFallback`
  for the synchronous cold window, `warm` for per-connection enumeration, and
  `resolveDestinationNames`. It is optional: a deployment may bind no channel.

  Voyant Connect now provides that port rather than being imported by the catalog
  spine, so it is one channel implementation and a self-hosted integration can
  provide its own. This also removes the
  `catalog -> plugin-voyant-connect -> cruises -> catalog` dependency cycle, which
  had been hiding as a build-ordering race.

- 536ebfc: Remove the last vendor references from the catalog spine.

  `offers-runtime` resolved its offers client by importing
  `@voyant-travel/connect-sdk` directly, contradicting the design already stated
  in `offers/operator-routes.ts` — _"the package never imports
  `@voyant-travel/connect-sdk`"_. The channel now supplies that client through
  `CatalogSourcesRuntimeExtension.createOffersClient`, and catalog no longer
  depends on the SDK.

  `BookingEngineEnv` named seven `VOYANT_*`/`VOYANT_CONNECT_*` variables that
  nothing in catalog read; they were passed straight to the channel. It is now an
  opaque environment record.

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/graph-contracts@0.1.0
  - @voyant-travel/cruises@0.233.0

## 0.4.0

### Patch Changes

- 5ed518e: Move the Voyant Connect sources plugin into the monorepo at
  `packages/plugins/voyant-connect` and consume it as a workspace package.

  `packages/catalog` previously depended on the published plugin, whose peer
  ranges resolved back to `@voyant-travel/catalog` and `@voyant-travel/cruises`.
  That cycle meant the monorepo could not resolve its own lockfile until its own
  publish had landed, and it dragged a stale `@voyant-travel/bookings-contracts`
  into catalog's resolution — breaking two catalog suites on import. Both are
  fixed by the move.

  The plugin keeps its registry dependencies on `@voyant-travel/connect-adapter`,
  `connect-cruises`, `connect-sdk`, and `data-sdk`: those are Connect's own public
  surface and remain in the connect repository.

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/cruises@0.232.0

## 0.3.3

### Patch Changes

- Updated dependencies [50f382f]
- Updated dependencies [c256cfc]
  - @voyant-travel/connect-adapter@0.5.0
  - @voyant-travel/connect-sdk@0.10.0
  - @voyant-travel/connect-cruises@0.6.2

## 0.3.2

### Patch Changes

- Updated dependencies [909e371]
  - @voyant-travel/connect-adapter@0.4.0

## 0.3.1

### Patch Changes

- 1205cf7: `listVoyantConnectSourceConnections` no longer issues a redundant per-connection
  `get()` to enrich each row. `connections.list` already returns the full
  `ConnectionSummary` (`id`/`status`/`providerKey`/`supplierName`) — the same shape
  `get` returns — so enumeration is now a single round-trip instead of `1 + N`,
  shedding N requests against the Connect control plane per warm. No behavior or
  API change.

## 0.3.0

### Minor Changes

- dd463c1: `prepareVoyantConnectSources` can now build enumerate-path sources without a
  network connection enumeration, and threads cruise read memoization through both
  planes (#94):

  - `connections` — pass a pre-fetched connection list to skip the `list()` call.
  - `connectionCache` — a read-through `{ get, set }` hook (e.g. backed by Workers
    KV) so a cold isolate can reuse the serializable connection list.
  - `cruise` — forwarded to both the default and per-connection sources, so
    `cruise.memoize` wraps cruise reads consistently across both.

  All additive; existing callers are unaffected.

## 0.2.3

### Patch Changes

- 0130564: Relicense the public Connect packages from `FSL-1.1-Apache-2.0` to `Apache-2.0`.
  The root `LICENSE` is replaced with the standard Apache License 2.0 text.
- Updated dependencies [0130564]
  - @voyant-travel/connect-sdk@0.9.1
  - @voyant-travel/connect-adapter@0.3.2
  - @voyant-travel/connect-cruises@0.6.1

## 0.2.2

### Patch Changes

- 8ebf113: Move `@voyant-travel/plugin-voyant-connect` into the Connect repo alongside the
  other public Connect packages. It now consumes `@voyant-travel/connect-sdk`,
  `@voyant-travel/connect-adapter`, and `@voyant-travel/connect-cruises` from the
  workspace, and declares `@voyant-travel/catalog`, `@voyant-travel/cruises`, and
  `@voyant-travel/data-sdk` as peer dependencies provided by the host deployment.

  Because `connect-cruises` now returns vertical-conformant ship shapes, the
  internal `conformConnectCruiseAdapter` bridge and the `as CruiseAdapter` cast in
  the cruise source are removed — `createConnectCruiseAdapter` is used directly.

- Updated dependencies [dbfe4c2]
  - @voyant-travel/connect-cruises@0.6.0
