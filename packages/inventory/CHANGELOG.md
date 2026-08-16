# @voyant-travel/inventory

## 0.42.18

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
  - @voyant-travel/db@0.123.0
  - @voyant-travel/bookings@0.247.0
  - @voyant-travel/catalog@0.259.0
  - @voyant-travel/commerce@0.54.0
  - @voyant-travel/finance@0.259.0
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/operator-settings@0.18.11
  - @voyant-travel/core@0.144.0
  - @voyant-travel/action-ledger@0.115.21
  - @voyant-travel/operations@0.23.5
  - @voyant-travel/types@0.110.1
  - @voyant-travel/products-contracts@0.111.8
  - @voyant-travel/storage@0.115.9

## 0.42.17

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/catalog@0.258.0
  - @voyant-travel/commerce@0.53.0
  - @voyant-travel/core@0.143.0
  - @voyant-travel/products-contracts@0.111.7
  - @voyant-travel/operations@0.23.4
  - @voyant-travel/operator-settings@0.18.10
  - @voyant-travel/action-ledger@0.115.20
  - @voyant-travel/bookings@0.246.3
  - @voyant-travel/db@0.122.4
  - @voyant-travel/finance@0.258.1
  - @voyant-travel/hono@0.143.2
  - @voyant-travel/storage@0.115.8

## 0.42.16

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/finance@0.258.0
  - @voyant-travel/bookings@0.246.2
  - @voyant-travel/core@0.142.1
  - @voyant-travel/catalog@0.257.3
  - @voyant-travel/commerce@0.52.1
  - @voyant-travel/operator-settings@0.18.9

## 0.42.15

### Patch Changes

- 50e518b: Restore the content catalog detail pages were dropping.

  Resolve a sourced cruise's adapter by its own `source_kind` scoped to the
  connection before falling back to the bare connection id. A channel registers
  several adapters per connection and keys them apart by suffixing the registry
  key (`<connectionId>:cruises`), so resolving by connection alone returned the
  connection's _generic_ adapter. That adapter carries no `cruiseAdapter`, so
  `getCruiseSailingPricing` reached through it for nothing and every
  connection-scoped cruise reported no cabin pricing at all.

  Read the projection's own camelCase keys in the cruise content synthesizer. It
  read the snake_case names of the content shape it produces, which overlapped the
  shim's projection on `id`/`name`/`status` and nothing else, so the fallback
  rendered blank even when discovery had captured the data.

  Stamp the provider key rather than the connection id as a sourced cruise's
  `source_provider`, and project the cruise line, ship and port display names
  alongside their faceted ids. The shim read `sourceRef.provider` while Voyant
  Connect writes `providerKey`, so the fallback fired every time and a raw
  `conn_…` string surfaced as the cruise line on the detail page.

  Read the indexed document by id on the URL-addressable vertical detail pages.
  Entered by id there is no result row to carry the index projection, so price,
  offers, status, categories, destinations and the whole Attributes tab were
  dropped — the same record showed far more when opened as a sheet from the list.
  The supplier formatter is now held by ref so the supplier directory settling no
  longer rebuilds the fetchers and re-requests the record (one page load issued the
  content route three times).

  Fall back to an itinerary-day image for an owned product's hero when it has no
  product-level image, instead of reporting no hero while the same image sits in
  `content.media`.

  Degrade to the synthesizer when a cruise adapter's `getContent` fails, rather
  than letting the throw escape and 500 the detail route. We hold a durable
  sourced-entry projection and §3.6 defines the synthesizer as exactly that
  degraded read, so an upstream miss should not blank the page. On sandbox,
  `resolveCruiseRow` in `@voyant-travel/connect-adapter` throws
  `Connect cruise content not found` for cruises discovery has already indexed,
  which turned every concurrent cruise detail open into a 500. The failure is
  reported through the new `onContentFetchError` option (defaulting to
  `console.warn`) so an upstream outage stays visible instead of silently
  degrading every cruise to a stub.

## 0.42.14

### Patch Changes

- Updated dependencies [b11c10e]
  - @voyant-travel/commerce@0.52.0
  - @voyant-travel/finance@0.257.0
  - @voyant-travel/bookings@0.246.1
  - @voyant-travel/operator-settings@0.18.8
  - @voyant-travel/catalog@0.257.2

## 0.42.13

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/bookings@0.246.0
  - @voyant-travel/finance@0.256.0
  - @voyant-travel/catalog@0.257.1
  - @voyant-travel/commerce@0.51.11
  - @voyant-travel/operations@0.23.3
  - @voyant-travel/operator-settings@0.18.7

## 0.42.12

### Patch Changes

- c7bccba: Record a Booking Document that carries the issuer's identity.

  Every `POST /v1/admin/bookings/{id}/documents` request carrying the `issued*`
  group answered 500, so `contract` and `invoice` — the types whose validation
  _requires_ that group — could not be created at all: without the fields the
  request was refused 400, with them it crashed.

  The insert was never the problem. The replay lookup that runs before it
  interpolated the issue date straight into a `sql` fragment, and an interpolated
  value goes to the driver unencoded — unlike `eq(column, value)`, which encodes
  it through the column first. postgres-js cannot bind a `Date`, so the query
  threw before it was ever sent, which is why writing the same values to the same
  columns by hand always worked. The lookup now binds through the column, so it
  and the insert agree by construction.

  The same interpolation sat in `buildCreatedAtCondition` in all three
  action-ledger drift checkers, where it crashed
  `check_booking_action_ledger_drift`, `check_finance_action_ledger_drift` and
  `check_product_action_ledger_drift` for any caller that narrowed by
  `createdAtFrom`. Each is bound as an encoded timestamp now, and each package's
  unit test pins the parameter's type rather than just the SQL it builds.

- Updated dependencies [c7bccba]
  - @voyant-travel/bookings@0.245.1
  - @voyant-travel/finance@0.255.1

## 0.42.11

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/catalog@0.257.0
  - @voyant-travel/commerce@0.51.10
  - @voyant-travel/operations@0.23.2

## 0.42.10

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0
  - @voyant-travel/catalog@0.256.7
  - @voyant-travel/commerce@0.51.9
  - @voyant-travel/operator-settings@0.18.6

## 0.42.9

### Patch Changes

- Updated dependencies [798b05b]
- Updated dependencies [05c2202]
  - @voyant-travel/bookings@0.245.0
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/catalog@0.256.6
  - @voyant-travel/operations@0.23.1
  - @voyant-travel/commerce@0.51.8
  - @voyant-travel/operator-settings@0.18.5

## 0.42.8

### Patch Changes

- Updated dependencies [e99380d]
  - @voyant-travel/operations@0.23.0

## 0.42.7

### Patch Changes

- Updated dependencies [020de35]
- Updated dependencies [c2aedcb]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/bookings@0.244.1
  - @voyant-travel/catalog@0.256.5
  - @voyant-travel/commerce@0.51.7
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1
  - @voyant-travel/operations@0.22.22
  - @voyant-travel/operator-settings@0.18.4
  - @voyant-travel/storage@0.115.7

## 0.42.6

### Patch Changes

- e7ea666: Keep occupancy supplements out of the projected "price from" amount. A room price only contributes to the MIN when its rule prices the room all-in; under a `supplement` basis — explicit, or unset while the rule still prices a traveler — the amount is a surcharge on top of the fare, so the traveler fare becomes the "from" value instead. Storefronts were advertising a 100 EUR single supplement as the headline price of a 165 EUR tour.
- Updated dependencies [e7ea666]
  - @voyant-travel/commerce@0.51.6

## 0.42.5

### Patch Changes

- Updated dependencies [8e2133e]
  - @voyant-travel/bookings@0.244.0
  - @voyant-travel/catalog@0.256.4
  - @voyant-travel/finance@0.252.1
  - @voyant-travel/operations@0.22.21
  - @voyant-travel/commerce@0.51.5

## 0.42.4

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/bookings@0.243.1
  - @voyant-travel/catalog@0.256.3
  - @voyant-travel/operations@0.22.20
  - @voyant-travel/commerce@0.51.4
  - @voyant-travel/operator-settings@0.18.3

## 0.42.3

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/bookings@0.243.0
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/catalog@0.256.2
  - @voyant-travel/commerce@0.51.3
  - @voyant-travel/operations@0.22.19
  - @voyant-travel/operator-settings@0.18.2

## 0.42.2

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/catalog@0.256.1
  - @voyant-travel/commerce@0.51.2
  - @voyant-travel/operator-settings@0.18.1

## 0.42.1

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog@0.256.0
  - @voyant-travel/products-contracts@0.111.5
  - @voyant-travel/commerce@0.51.1
  - @voyant-travel/operations@0.22.18

## 0.42.0

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

- 9e364c2: Quote per-person room prices that reference active shared pricing categories.
- Updated dependencies [1a3ba50]
- Updated dependencies [c805276]
- Updated dependencies [599ffed]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/operator-settings@0.18.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/catalog@0.255.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/operations@0.22.17
  - @voyant-travel/storage@0.115.6
  - @voyant-travel/bookings@0.242.0
  - @voyant-travel/commerce@0.51.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0
  - @voyant-travel/utils@0.111.1

## 0.41.1

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/catalog@0.254.1
  - @voyant-travel/commerce@0.50.1
  - @voyant-travel/operator-settings@0.17.33

## 0.41.0

### Patch Changes

- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/relationships@0.134.0
  - @voyant-travel/bookings@0.241.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/commerce@0.50.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/tools@0.10.3
  - @voyant-travel/operations@0.22.16
  - @voyant-travel/products-contracts@0.111.4
  - @voyant-travel/operator-settings@0.17.32

## 0.40.14

### Patch Changes

- 2544ff4: Hide server-owned idempotency keys from six MCP Tool inputs and enforce an exact inventory of retained caller-owned protocol fields.
- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/operations@0.22.15
  - @voyant-travel/catalog@0.253.1
  - @voyant-travel/commerce@0.49.3
  - @voyant-travel/operator-settings@0.17.30

## 0.40.13

### Patch Changes

- dae11ff: Keep product lifecycle idempotency identity server-owned in MCP action metadata.

## 0.40.12

### Patch Changes

- 99823d5: Add a compact product-summary list endpoint and use it for the managed Products page and product selectors, avoiding editor-only HTML and policy fields until a product is opened.
- Updated dependencies [6e2c539]
- Updated dependencies [de549da]
- Updated dependencies [aecc8ce]
  - @voyant-travel/bookings@0.240.10
  - @voyant-travel/operations@0.22.14
  - @voyant-travel/finance@0.245.8

## 0.40.11

### Patch Changes

- Updated dependencies [b95e995]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
- Updated dependencies [2feabd0]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
- Updated dependencies [ed455e6]
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/finance@0.245.7
  - @voyant-travel/operator-settings@0.17.29
  - @voyant-travel/operations@0.22.13
  - @voyant-travel/products-contracts@0.111.2
  - @voyant-travel/commerce@0.49.2

## 0.40.10

### Patch Changes

- 5c9aa4d: Run approved product lifecycle tools through the handler-owned durable existing-target command protocol so an interrupted publication can be retried without losing its approval or applying the lifecycle mutation twice.
- d03f316: Declare the approval policy used by durable product lifecycle commands so their server-issued approvals can be validated on the approved retry.
- Updated dependencies [b3cd1a5]
- Updated dependencies [8ab3f96]
- Updated dependencies [4c218bc]
- Updated dependencies [6b672c0]
- Updated dependencies [aea1a83]
- Updated dependencies [5cda348]
- Updated dependencies [e04b812]
- Updated dependencies [8688ef1]
- Updated dependencies [3a91bc8]
  - @voyant-travel/action-ledger@0.115.17
  - @voyant-travel/catalog@0.252.3
  - @voyant-travel/tools@0.10.1
  - @voyant-travel/finance@0.245.6
  - @voyant-travel/products-contracts@0.111.1

## 0.40.9

### Patch Changes

- 72bf42c: Capture the applicable published Legal cancellation-policy version in owned-product quote evidence so booking commitment preserves the terms effective at sale.
- Updated dependencies [6afd487]
- Updated dependencies [72bf42c]
  - @voyant-travel/bookings@0.240.9
  - @voyant-travel/finance@0.245.5
  - @voyant-travel/catalog@0.252.2

## 0.40.8

### Patch Changes

- Updated dependencies [8fc2d25]
  - @voyant-travel/products-contracts@0.111.0
  - @voyant-travel/commerce@0.49.0
  - @voyant-travel/finance@0.245.2
  - @voyant-travel/bookings@0.240.5
  - @voyant-travel/operations@0.22.12
  - @voyant-travel/operator-settings@0.17.28

## 0.40.7

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3
  - @voyant-travel/products-contracts@0.110.4
  - @voyant-travel/commerce@0.48.13
  - @voyant-travel/operations@0.22.11

## 0.40.6

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/catalog@0.251.3
  - @voyant-travel/commerce@0.48.12
  - @voyant-travel/operator-settings@0.17.27

## 0.40.5

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/commerce@0.48.11
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/operations@0.22.10
  - @voyant-travel/operator-settings@0.17.26
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.40.4

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.
- Updated dependencies [3cbf7fb]
  - @voyant-travel/bookings@0.240.2
  - @voyant-travel/db@0.120.7
  - @voyant-travel/finance@0.244.2
  - @voyant-travel/operations@0.22.9

## 0.40.3

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/finance@0.244.1
  - @voyant-travel/products-contracts@0.110.3
  - @voyant-travel/commerce@0.48.9
  - @voyant-travel/operations@0.22.8

## 0.40.2

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog@0.250.0
  - @voyant-travel/products-contracts@0.110.2
  - @voyant-travel/commerce@0.48.8
  - @voyant-travel/operations@0.22.7

## 0.40.1

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/catalog@0.249.1
  - @voyant-travel/commerce@0.48.7
  - @voyant-travel/operator-settings@0.17.25
  - @voyant-travel/operations@0.22.6

## 0.40.0

### Minor Changes

- f56d552: Editorial overlays are sourced-only. An owned product no longer has an overlay
  collection at all, and the operator's product page no longer offers one.

  An overlay exists to restate content the operator does not control — provider
  copy from a Connect package, a bedbank, a GDS. An owned product's copy is
  authored in `product_translations`, `product_day_translations`, and the
  option/service equivalents, which the operator edits directly. Layering an
  overlay on top gave one field two authoring surfaces, with the overlay the
  silent winner and no indication in the editor that it had shadowed the row.

  In the operator UI this never worked at all. Every row in `products` is owned by
  construction — sourced products live in `catalog_sourced_entries` and surface at
  `/catalog/products/:id`, not in the products table — so `/products/:id` mounted
  an editor whose subject could not exist. The read model's `sourced` flag was
  supposed to hide it, but the flag only arrives if the fetch succeeds, so what an
  operator actually saw was a red "Failed to load editorial content" card wedged
  between Media and Itinerary.

  What changed:

  - `getProductContent` and `getAccommodationContent` serve the owned branch as
    authored and never read the overlay store. The sourced branches
    (`sourced-cache`, `sourced-fresh`, `synthesized`) merge overlays exactly as
    before.
  - `readProductEditorialOverlayState`, `writeProductEditorialOverlay`,
    `clearProductEditorialOverlay`, and `listProductEditorialOverlayHistory` throw
    the new `OwnedProductNotOverlayableError` for an owned subject. Ownership is
    the absence of a `catalog_sourced_entries` row.
  - `GET`, `PUT`, `DELETE`, and `GET .../history` on
    `/v1/admin/products/{id}/editorial-overlays` answer `404 not_overlayable`
    rather than 500-ing, or writing a row that read-time merge would now ignore.
  - `ProductEditorialOverlaySection` is no longer mounted on the owned product
    detail page. It stays exported as the authoring surface for sourced product
    content; the operator has no host for that today.
  - The read model drops `sourced` from its payload — it is `true` on every
    response the endpoint can now produce. `contentSource` still reports which
    sourced branch served the comparison.

  The ownership check reaches `readSourcedEntry` through
  `@voyant-travel/catalog/services/sourced-entry` rather than the package barrel.
  `service-editorial-overlays.ts` sits in the admin route graph, and the barrel
  pulls the whole catalog plane in behind it — enough to roughly double transform
  and import time for anything that loads those routes.

  No data migration ships with this. The editor returned `null` for owned
  subjects from the day it landed, so no owned overlay was ever authored through
  it; any row that predates that is inert rather than wrong, and `catalog_overlay`
  keeps its history.

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/commerce@0.48.6
  - @voyant-travel/db@0.120.6
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/operations@0.22.4
  - @voyant-travel/operator-settings@0.17.24
  - @voyant-travel/storage@0.115.4

## 0.39.1

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/operator-settings@0.17.23
  - @voyant-travel/catalog@0.248.1
  - @voyant-travel/commerce@0.48.5
  - @voyant-travel/operations@0.22.3

## 0.39.0

### Minor Changes

- 6c77f7d: The booking selection's billing address carries a `region`, and the address it
  already declared now survives to the Booking.

  `bookingSelectionPublicV1.billing.address` had `line1`, `line2`, `city`,
  `postal`, `country` and no administrative subdivision, so a checkout could not
  record a state, province, or county. Romania needs it twice over: an invoice
  carries the _judet_, and Bucharest has no ordinary city/county pair — its six
  Sectors _are_ the county-level subdivision. The only encodings available were
  overloading `city` with `"Sector 3"` or hiding the county in an address line,
  both lossy (voyant#4290).

  `region` is free-form with ISO 3166-2 subdivision codes (`RO-B`, `RO-CJ`,
  `US-CA`) as the recommended encoding. It is not _enforced_ as ISO: the
  `bookings.contact_region` column it lands in is free text and already holds both
  `"Cluj"` and `"Ile-de-France"`, so gating the selection on a code would reject
  data the destination accepts. A Bucharest Sector is modelled as the Sector in
  `city` and `RO-B` in `region`.

  **The rest of the address was being dropped.** `normalizeBookingSelection`
  projected the billing address down to `country` alone — a leftover from the
  Session tracer (voyant#4039) — so a caller that filled in the billing step lost
  every line of it at the Session edge, and the Booking's `contact_*` columns came
  back empty even though the columns had been there all along. The projection now
  keeps all six fields, and they are carried the rest of the way:
  `SelfServiceBillingParty` gained the address, the products handler puts it on
  the booking-create command, and `createSourcedBookingCommitment` writes it for
  supplier-sourced bookings.

  The Session's card-payment handoff also fills `CardPaymentBilling`'s `state`,
  `city`, `postalCode`, and `details`, which it previously left empty — a
  processor that computes tax from the billing address needs the subdivision, not
  just the country.

  Address fields are now width-checked against the columns they settle into
  (`line1`/`line2` 500, `city`/`region` 100, `postal` 20, `country` 2). Previously
  unbounded: a payload that overran a column was admitted at the Session and failed
  at commit, where the caller could no longer tell which field was at fault. This
  is a tightening — a caller sending a full country name in `country` rather than
  an ISO 3166-1 alpha-2 code is now rejected at the Session instead of at commit.

  The operator's booking journey billing step draws a "County / region" input, and
  `address.region` is addressable as a booking-field requirement.

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/products-contracts@0.110.1
  - @voyant-travel/commerce@0.48.4
  - @voyant-travel/operations@0.22.2
  - @voyant-travel/operator-settings@0.17.22

## 0.38.0

### Minor Changes

- 380dad7: A hosted checkout is initiated with what the shopper is buying, in their
  language, keyed to a customer rather than an email address.

  `PaymentInitiationInput` is what a hosted-checkout provider renders to the
  shopper, and three of its fields could not carry the meaning that page needs.

  `description` is the only product-shaped field on the contract, so a caller that
  sends an identifier leaves the provider nothing else to show — and the Booking
  Session commit path sent `Booking Session bses_01k…`. It now names the product
  and, where the target has one, its departure, both resolved in the Session's
  locale. The name comes from `loadProductPaymentPolicyContext`, which takes an
  optional `locale` and returns the product's translated `name`, falling back to
  its base name rather than to a language the shopper did not ask for.

  `locale` is new and optional: a BCP 47 tag for the language the shopper has been
  reading the funnel in, so a hosted page is rendered in it instead of guessed
  from the browser. The Booking Session populates it from its own scope.

  `customer.reference` is new and optional: an opaque, stable reference to the
  runtime's own customer record. Without it a provider that wants to reuse a
  stored customer — and therefore offer a stored payment method — has to key that
  binding on the email address, which binds two people who share an inbox, breaks
  when the address is corrected, and forces the provider to retain personal data
  purely as a join key. The Booking Session populates it from the CRM person the
  buyer was identified as, falling back to the owning principal only on a
  customer-actor Session: on a staff-created one the principal is the agent, not
  the shopper.

  All three are additive. An adapter that ignores them behaves exactly as before.

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/catalog@0.247.0
  - @voyant-travel/operator-settings@0.17.21
  - @voyant-travel/commerce@0.48.3
  - @voyant-travel/operations@0.22.1

## 0.37.0

### Minor Changes

- e8bd000: chore: retire compatibility surface nothing reaches

  Fourteen compatibility surfaces in private packages had no caller left anywhere in
  the repository — not in product code, not in tests, and in several cases not
  even a re-export. Each one is now gone rather than carried. Nothing here touches
  a published package, a database column, or an API response an external
  storefront could read; those cases are inventoried for a separate decision.

  - **`@voyant-travel/catalog`** — the `./indexer/contract` subpath and the
    one-line re-export behind it. Every importer in the repository, including
    catalog's own modules, already names
    `@voyant-travel/catalog-contracts/indexer/contract`; the contracts package has
    been the canonical dependency since the engine contracts moved out of the
    runtime. The README and the catalog/promotions architecture docs no longer
    describe the alias.
  - **`@voyant-travel/framework`** — `generateCustomSourcePluginManifests`, an
    alias of `generateCustomSourceExtensionManifests` left over from the "plugin"
    classification retirement, and the `providers` option on
    `VoyantNodeRuntimeOptions` / `createVoyantNodeApp`. The option was merged
    under `resources` on every path; no host, generated artifact or test ever
    passed it.
  - **`@voyant-travel/hono`** — `LIVE_LIMITS`, two constants from the pre-C2
    limiter. Limits are configured per policy through `RateLimitPolicy`; the
    constants were re-exported twice and read nowhere.
  - **`@voyant-travel/legal`** — `contractSeriesService.findSingleActiveByScope`,
    a pass-through to `findDefaultActiveByScope`. Callers and tests already use
    the canonical name.
  - **`@voyant-travel/finance`** — `externalProvider`, `externalNumber` and
    `externalSeriesName` on `InvoiceVoidedEvent`. The single emitter never set
    them and `invoiceVoidedPayloadSchema` is `additionalProperties: false`, so
    they could not travel to a subscriber even if something had.
  - **`@voyant-travel/finance-react`** — the `orderId` filter on
    `FinancePaymentSessionListFilters`. Its only reader was the
    `legacyOrderId ?? orderId` fallback in the query builder, which now reads
    `legacyOrderId` directly.
  - **`@voyant-travel/operations-react`** — `KpiStrip` and
    `aggregateSlotFinancials`. The roll-up summed whatever page of the allocation
    manifest happened to be loaded, using its own paid-amount rule; the departure
    workspace reads whole-departure figures from `GET /slots/{id}/summary`
    instead. `KpiStrip` was not reachable from the package surface at all.

  A second group carried no `@deprecated` tag, only a "back-compat" comment, and
  was equally unreachable:

  - **`@voyant-travel/operations`** — the `UpdateSlotRuntime` alias of
    `SlotMutationRuntime`, left over from when the runtime type covered updates
    only. Zero references, including tests.
  - **`@voyant-travel/inventory`** — the flat `productLinkable` alias of
    `inventoryProductCompatibilityLinkable`, exported from three places. Both real
    callers (inventory's and legal's `standard-links`) import the canonical symbol
    and rename it locally. The compatibility linkable itself stays: it is what
    keeps the `products` module name resolving.
  - **`@voyant-travel/inventory-react`** — `extras-compat.ts`, a forwarder to
    `./extras.js`. Its two importers were both inside the package.
  - **`@voyant-travel/bookings`** — `getLegacyTransactionLinkFromBookingOrigin`
    and `LegacyBookingTransactionLink`, a reader for pre-Voyant transaction ids on
    a booking origin. Nothing called it; its only exercise was a unit test, which
    goes with it. The origin columns and the `legacy_transaction` origin source
    are untouched — this removes a reader, not the data.
  - **`@voyant-travel/bookings-react`, `@voyant-travel/distribution-react`** — slot
    ids re-exported from the detail hosts "for backwards compatibility". Every
    consumer already imports them from the lean `./slots.js` the comment points
    at, which is the whole reason that module exists. The distribution-react one
    was already annotated as an unused export.

  The three deleted files are pinned in `retired-paths.json` so they stay deleted.

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/operations@0.22.0
  - @voyant-travel/commerce@0.48.2
  - @voyant-travel/operator-settings@0.17.19
  - @voyant-travel/action-ledger@0.115.14

## 0.36.0

### Minor Changes

- 3f5ea82: feat(inventory): resolve one operator-facing schedule term (Session/Occurrence/Departure)

  The same Product/Departure model runs sixty-minute recurring Sessions and
  multi-day Departures, so the operator needs to _see_ the right noun without the
  domain forking under it. This adds a single resolver that decides the noun once
  and a localized label the UI reads.

  - **One decision, in one place.** `resolveScheduleTerm` maps a Product's
    already-resolved duration to a `session | occurrence | departure` token: an
    explicit sub-day duration is a **Session** (the 60-minute whale-watch Boat
    Tour, a timed Activity, a scheduled transfer), an explicit full-day-or-longer
    duration or an itinerary-derived day span is a **Departure** (a Day Tour, a
    Multi-day Tour), and an unresolved duration — a single Event date or an
    opening-hours Attraction Admission — is an **Occurrence**. It reads no mutable
    Product truth to decide.
  - **Every surface agrees.** `resolveProductClassification` now carries
    `scheduleTerm`, so the product list/detail read paths, the catalog-plane
    projection, and the legacy Catalog search document all emit it from the same
    resolver. The classification schemas in `products-contracts`,
    `admin-contracts` and the `inventory-react` mirror gain the field.
  - **Presentation only.** A Session, an Occurrence and a Departure are the same
    `availability_slots` row bound to the same Product Version. The operator UI
    maps the token to a localized label (`common.scheduleTermLabels`, en + ro) and
    the product list renders the plural under the family; the domain never forks.

- 3f5ea82: feat(inventory): conservatively backfill legacy families and expose an operator-review queue

  Ambiguous legacy Products must be resolved by a human, not guessed. This adds
  the queue that makes them discoverable and a migration that only classifies what
  is unambiguous.

  - **Discoverable review queue.** The product list read accepts
    `classificationReview=pending | missing_family | unresolved_duration`. The
    predicates are expressed as row-level SQL that mirrors
    `resolveProductClassification` exactly (missing/dangling family; no explicit
    duration and no dated default-itinerary day), so the queue and the rendered
    review badge never disagree.
  - **Conservative backfill migration.** A product with authored itinerary days
    but no family is unambiguously a Tour; the migration assigns the standard
    `tour` family to exactly those rows. It never overwrites an existing family,
    only fires on a strong positive signal, joins to the seeded family (so a
    deployment without it is a no-op), and is idempotent. Duration is not
    materialized — the resolver derives itinerary-derived duration live.
  - **Ambiguous rows are left alone.** A product with neither a family nor a
    resolvable duration is untouched and surfaces in the review queue rather than
    being guessed.
  - Migration-test coverage over a representative beta dataset that includes
    ambiguous rows proves no Product disappears, no capacity claim (availability
    slot) is lost, and only the unambiguous rows are classified.

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/products-contracts@0.110.0
  - @voyant-travel/core@0.139.0
  - @voyant-travel/operations@0.21.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/commerce@0.48.1
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3
  - @voyant-travel/operator-settings@0.17.18
  - @voyant-travel/storage@0.115.3

## 0.35.0

### Minor Changes

- 076c246: Delete the beta booking-engine quote path (voyant#4188).

  Voyant is beta: nothing below is aliased, deprecated, or kept for
  compatibility.

  **Deleted.** `quoteEntity` / `quoteEntitiesBatch` and the whole
  `catalog/src/booking-engine/quote.ts` module, including `QuoteEntityRequest`,
  `QuoteEntityResult`, `QuoteEntityDeps`, `QuoteContentEnricher`,
  `QuoteContentEnrichmentInput`, `QuoteScope` and `DEFAULT_QUOTE_TTL_MS`;
  `serializeQuoteResult`; the shape-enrichment seam
  (`createProductQuoteShapeEnricher`, `CatalogProductQuoteEnricher`,
  `inventory`'s `enrichProductQuoteShape`), superseded by the owned handler's
  `computeRequirements`; the beta tax recompute
  (`applyCatalogTaxToQuoteResult`, `applyOperatorTaxToQuoteResult`, and
  `CatalogRuntimeServices.applyTaxToQuoteResult`, which was its only caller and
  the last writer into `catalog_quotes`).

  From the **published** `@voyant-travel/catalog-contracts`: `quoteResponseV1`,
  `quoteRequestV1`, `quoteScopeV1`, `quoteBatchRequestV1`, `quoteBatchResultV1`,
  `quoteBatchResponseV1`, `quoteBatchCriteriaV1`, `quoteBatchSelectionV1` and
  their inferred types. No subpath changed. `bookRequestV1` / `bookResponseV1`
  are untouched.

  **Added.** `CatalogRuntimeServices.previewOffer(context, input)` — the v1
  stateless Offer Preview, exposed on the runtime surface so a server-side
  composer reaches the same `composeRequirements` / `composeQuote` ports the
  Booking Session lifecycle uses instead of opening a second pricing path. It
  replaces `applyTaxToQuoteResult` in the port's conformance set.

  **Trips moved onto the v1 lifecycle.** `createCatalogComponentAdapter().quote`
  prices a catalog-backed component through Offer Preview and returns
  `OfferPreviewResultV1`; `PriceTripDeps.quoteCatalogComponent` and
  `ReserveTripDeps.quoteCatalogComponentBeforeReserve` are retyped to match. The
  adapter no longer takes `ownedHandlers`, `evaluatePromotions` or
  `transformQuoteResult`. Because a preview is non-binding by construction, a
  priced catalog component no longer records `catalogQuoteId` and its
  `priceExpiresAt` is null — the binding price and its expiry are minted later by
  the accepted-Proposal Booking Session.

  **Kept, deliberately.** The `catalog_quotes` table. Commerce's
  `booking.confirmed` redemption recorder still reads historical
  `pricing_applied_offers` from it by `consumed_booking_id`; that subscriber is
  mounted and sits outside the retired quote path, so dropping the table would
  delete evidence read for already-shipped bookings. It now has no writer.
  Consequently promotion codes are not evaluated at quote time — the v1 Session
  `composeQuote` has no promotion hook yet, and adding one is separate work.
  `createCatalogPromotionEvaluator` and `recordPromotionRedemptionsForBooking`
  remain exported and are documented as unwired.

  The deleted identifiers are pinned to nowhere by a new
  `beta-quote-path-authority` entry in `symbol-policy.json`, and the deleted files
  are pinned in `retired-paths.json`.

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog@0.245.0
  - @voyant-travel/commerce@0.48.0
  - @voyant-travel/products-contracts@0.109.5
  - @voyant-travel/operations@0.20.1
  - @voyant-travel/operator-settings@0.17.17

## 0.34.5

### Patch Changes

- Updated dependencies [9a10fa5]
- Updated dependencies [68d90d9]
  - @voyant-travel/operations@0.20.0
  - @voyant-travel/products-contracts@0.109.4

## 0.34.4

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/operations@0.19.0

## 0.34.3

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/products-contracts@0.109.3
  - @voyant-travel/commerce@0.47.14
  - @voyant-travel/operations@0.18.3

## 0.34.2

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/products-contracts@0.109.2
  - @voyant-travel/commerce@0.47.13
  - @voyant-travel/operations@0.18.2

## 0.34.1

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/products-contracts@0.109.1
  - @voyant-travel/commerce@0.47.12
  - @voyant-travel/operations@0.18.1

## 0.34.0

### Minor Changes

- 3d793c1: feat: materialize Product Day Services into Departure operations (spine)

  The spine of the multi-day tracer (voyant#4035). A Product's day services were a
  costing list with no operational shape, `product_versions.snapshot` had zero
  readers, and a departure had no per-day structure. This wires the first path
  from a frozen Product Version to immutable per-departure service lines.

  - **A typed snapshot reader** (`@voyant-travel/products-contracts`):
    `parseProductVersionSnapshot` validates the frozen `product_versions.snapshot`
    shape and fails loudly on anything it does not recognise rather than returning
    an empty itinerary. Pure zod, reusable by inventory and operations (and
    voyant#4189).
  - **Operational fields on `product_day_services`**: local start/end time and
    duration, a Place/facility reference, an `inclusion_role`
    (`included` | `optional`), traveller applicability, and a supplier reference
    alongside the existing loose `supplier_service_id`. Propagated through
    validation, service, admin routes, and the inventory-react authoring form.
  - **A `departure_service_operations` table** (`@voyant-travel/operations`) with
    its own `departure_service_operation_status` enum
    (`planned` → … → `completed`, plus `cancelled` / `exception`) and a transition
    guard — deliberately not overloading the capacity-shaped
    `availability_slot_status`.
  - **Idempotent materialization** from the frozen snapshot, mapping day N to the
    departure date + (N-1) in the slot timezone, keyed on
    `(slot_id, source_day_service_id)`. Wired into both slot-creation paths. A
    later Product edit does not mutate an already-materialized departure — proven
    by an integration test.

  Spine only: no run-sheet UI and no supplier-operations changes, which are
  follow-ups.

### Patch Changes

- Updated dependencies [3d793c1]
  - @voyant-travel/products-contracts@0.109.0
  - @voyant-travel/operations@0.18.0
  - @voyant-travel/commerce@0.47.11

## 0.33.1

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3
  - @voyant-travel/products-contracts@0.108.10
  - @voyant-travel/commerce@0.47.10
  - @voyant-travel/operations@0.17.4

## 0.33.0

### Minor Changes

- 9b9e8ac: Split the booking-engine contracts by concern and collapse the duplicated
  requirements type families onto the Zod schemas. Breaking renames, no behavior
  change.

  **File / subpath split.** `booking-engine/draft-contracts.ts` is deleted and its
  contents redistributed. `booking-engine/requirements.ts` is deleted and split in
  two, so each file's name matches what it holds:

  - `@voyant-travel/catalog-contracts/booking-engine/requirements-contracts` —
    every schema describing what a booking _requires_ (`paxBandSpecV1`,
    `paxBandDependencyV1`, `cabinCategoryOptionV1`, `cabinNumberOptionV1`,
    `productVariantUnitOptionV1`, `productVariantOptionV1`, `ratePlanOptionV1`,
    `roomOptionV1`, `extensionOptionV1`, `addonOfferV1`, `configureSubStepV1`,
    `accommodationSubStepV1`, `addonGroupV1`, `travelerFieldRequirementV1`,
    `bookingFieldRequirementV1`, `bookingRequirementsV1`) plus their inferred types
  - `@voyant-travel/catalog-contracts/booking-engine/requirements-defaults` — the
    runtime values and helpers only (`DEFAULT_PAX_BANDS`, `DEFAULT_PAX_TOTAL`,
    `DEFAULT_PAYMENT_INTENTS`, `PAX_BAND_TIER_SEPARATOR`, `paxBandBaseCode`,
    `paxBandTierCode`, `paxBandsAllowedTotalFrom`, `defaultRequirementsFlags`,
    `defaultTravelerFields`, `defaultBookingFields`)
  - `@voyant-travel/catalog-contracts/booking-engine/selection-contracts` — what
    the buyer selected (`bookingSelectionV1`, `travelerEntryV1`,
    `travelerBandCodeSchema`, `paxBandCodeSchema`)
  - `@voyant-travel/catalog-contracts/booking-engine/pricing-contracts` —
    `pricingLineV1`, `pricingTaxV1`, `pricingBreakdownV1`,
    `bookingPolicyEvidenceV1`, `bookingPaymentScheduleV1`

  The `booking-engine/requirements` subpath is gone; all of the above remain
  re-exported from `booking-engine/contracts` (except the defaults, which stay on
  their own subpath and the package root).

  **One name per concept.** The hand-written interfaces that duplicated the Zod
  schemas are deleted; each type is now `z.infer` of its schema and keeps the
  `…V1` contract name: `BookingRequirements` → `BookingRequirementsV1`,
  `PaxBandSpec` → `PaxBandSpecV1`, `PaxBandDependency` → `PaxBandDependencyV1`,
  `CabinCategoryOption` → `CabinCategoryOptionV1`, `CabinNumberOption` →
  `CabinNumberOptionV1`, `ProductVariantOption` → `ProductVariantOptionV1`,
  `ProductVariantUnitOption` → `ProductVariantUnitOptionV1`, `RatePlanOption` →
  `RatePlanOptionV1`, `RoomOption` → `RoomOptionV1`, `ExtensionOption` →
  `ExtensionOptionV1`, `AddonOffer` → `AddonOfferV1`, `AddonGroup` →
  `AddonGroupV1`, `ConfigureSubStep` → `ConfigureSubStepV1`,
  `AccommodationSubStep` → `AccommodationSubStepV1`, `TravelerFieldRequirement` →
  `TravelerFieldRequirementV1`, `BookingFieldRequirement` →
  `BookingFieldRequirementV1`. The collection fields loosen from `ReadonlyArray<T>`
  to `T[]`, matching the schema.

  **Beta vocabulary retired.** `bookingDraftV1` / `BookingDraftV1` →
  `bookingSelectionV1` / `BookingSelectionV1`, and `@voyant-travel/trips`'
  `toBookingDraftV1` → `toBookingSelectionV1`.

  With one type family the documented `as unknown as BookingRequirementsV1` cast in
  the catalog session plane is deleted. Wire formats are unchanged — `quoteRequest.draft`,
  `quoteResponse.shape`, `session.statePayload`, and the persisted
  `tripComponent.metadata.bookingDraftV1` key all keep their names.

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/products-contracts@0.108.9
  - @voyant-travel/commerce@0.47.9
  - @voyant-travel/operations@0.17.3

## 0.32.0

### Minor Changes

- da20433: Carry Booking Requirements through the v1 Booking Session lifecycle. The
  descriptor a host renders the wizard from now survives the quote seam instead
  of being discarded on the way through it.

  - `bookingSessionRecordV1` gains an optional `requirements` — present whenever
    the Session is `active` and its target resolves, absent for terminal or
    purged Sessions. A host can render the Configure step before it can quote.
  - `bookingQuoteRecordV1.requirements` is required: a Quote always has a
    resolvable target.
  - The `quote_unavailable` lifecycle rejection gains an optional
    `requirements`, so a priced-out or sold-out target still renders a correct
    wizard.
  - `OwnedBookingHandler` gains a required `computeRequirements(ctx, request)`.
    Each vertical's `computeQuote` now derives its descriptor through that same
    method — one derivation, so what a host renders and what a Commit validates
    against cannot drift.
  - `ComputeQuoteResult.shape` is renamed to `ComputeQuoteResult.requirements`.
    `quoteResponseV1.shape` and `QuoteEntityResult.shape` on the beta quote path
    are unchanged.
  - `BookingSessionModulePorts`, `BookingSessionCompositeLeafRuntime` and
    `BookingSessionCompositeHandler` gain `composeRequirements`, so trip-composite
    targets publish requirements too.
  - `booking_session_quotes` gains a `requirements` jsonb column. Quotes carry a
    10-minute TTL and are not commitments, so the migration expires in-flight
    Quotes rather than backfilling a fabricated descriptor.

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/products-contracts@0.108.8
  - @voyant-travel/commerce@0.47.8
  - @voyant-travel/operations@0.17.2

## 0.31.0

### Minor Changes

- d2a571f: Rename the booking journey descriptor from `BookingDraftShape` to `BookingRequirements`, promoting it from beta to v1 vocabulary. This is a breaking rename with no behavior change:

  - `BookingDraftShape` → `BookingRequirements`, `defaultDraftShapeFlags` → `defaultRequirementsFlags` (`@voyant-travel/catalog-contracts/booking-engine/requirements`, formerly `.../draft-shape`)
  - `bookingDraftShapeV1` / `BookingDraftShapeV1` → `bookingRequirementsV1` / `BookingRequirementsV1`
  - Per-vertical builders: `buildAccommodationDraftShape` → `buildAccommodationRequirements`, `buildCharterDraftShape` → `buildCharterRequirements`, `buildCruiseDraftShape` → `buildCruiseRequirements`, `buildProductDraftShape` → `buildProductRequirements`, `buildExtraDraftShape` → `buildExtraRequirements`, `buildOwnedProductDraftShape` → `buildOwnedProductRequirements`, each moved from `draft-shape` to a `requirements` module/subpath
  - `@voyant-travel/catalog-react`'s `useBookingDraftShape` → `useBookingRequirements`
  - The redundant `@voyant-travel/catalog/booking-engine/draft-shape` re-export shim is removed; import `BookingRequirements` from `@voyant-travel/catalog-contracts/booking-engine/requirements` (re-exported from `@voyant-travel/catalog/booking-engine` as before)

  No other exported names, wire-format fields (e.g. `shape` on a quote response), or behavior changed.

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/products-contracts@0.108.7
  - @voyant-travel/commerce@0.47.7
  - @voyant-travel/operations@0.17.1

## 0.30.1

### Patch Changes

- Updated dependencies [0404299]
  - @voyant-travel/operations@0.17.0

## 0.30.0

### Minor Changes

- 645a219: Stop the product cost roll-up adding minor units across currencies.

  `product_day_services.cost_currency` is a required per-row column, so a single
  itinerary routinely mixes currencies — EUR coach hire next to TRY hotel nights
  on the same Turkish tour. The roll-up behind `products.cost_amount_cents` summed
  those rows with no `GROUP BY` and no FX, producing an integer that belonged to
  no currency, and then derived `products.margin_percent` from it against a sell
  amount quoted in a third.

  The roll-up now totals each source currency separately and restates every
  non-sell currency into the product's sell currency — which is what the column
  already meant to its consumers, since the operator product page formats it with
  `sellCurrency` — through the same FX resolution finance uses for invoices.
  Following the profitability read model, a source currency with no resolvable
  rate is reported rather than guessed at; because a single scalar cannot say
  "everything except the lira", the total and the margin are withheld (`null`)
  instead of under-reporting cost and over-reporting margin.

  `POST /v1/admin/products/{id}/recalculate` now answers with the sell `currency`,
  the per-source-currency subtotals it was built from, and the currencies it could
  not convert. `costAmountCents` and `marginPercent` are nullable in that
  response. `margin_percent` is also null, rather than `0`, for a product with no
  sell amount — a product that is not priced has no margin.

  `resolveFxMoneyBaseAmount` is now exported from `@voyant-travel/finance` so
  modules outside finance can restate an amount without reimplementing rate
  lookup.

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/catalog@0.237.2
  - @voyant-travel/commerce@0.47.6
  - @voyant-travel/operator-settings@0.17.16

## 0.29.2

### Patch Changes

- 3552f14: Wake the expired-hold reaper instead of polling for it.

  An availability hold records the instant it becomes reapable, so nothing has to
  poll to discover that work. `operations.release-expired-availability-holds` is
  now `wakeup: true`: placing or extending a hold reports the new expiry, the
  reaper re-arms itself from the earliest outstanding expiry after every run, and
  the cron drops to a six-hourly backstop for a wake lost to a restart.

  Hosts gain a target-neutral way to carry that request.
  `VoyantRuntimeHostPrimitives.jobs.wakeAt(jobId, at)` asks the deployment to
  invoke a wakeable job at an instant; the Node host arms one in-process timer per
  job, keeps the earliest pending instant, and declines anything past its horizon.
  A requested wake is a prompt and never durable — the declared cadence stays the
  recovery authority, as it already is for a wake arriving over
  `POST /__voyant/jobs/:id`.

  On a managed deployment this is what stops an idle tenant from paying for its
  database. A tenant with no live holds now arms nothing and never wakes its
  compute for this job; one with holds wakes exactly when there is capacity to
  give back, which is sooner than the fifteen-minute sweep it replaces.

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/operations@0.16.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/commerce@0.47.5
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/operator-settings@0.17.15
  - @voyant-travel/storage@0.115.2

## 0.29.1

### Patch Changes

- Updated dependencies [e1c5e39]
  - @voyant-travel/operations@0.15.0

## 0.29.0

### Minor Changes

- a3c04c4: Record which Product Version an operated departure was materialized from.

  A departure had no way to name the Product definition it sells. Editing a
  product silently changed what every existing departure appeared to offer,
  including ones already sold — the gap the product model RFC calls out as the
  reason a departure cannot be reconciled, operated, or costed against a stable
  definition.

  `availability_slots` gains `product_version_id`. It is a soft reference:
  `product_versions` is owned by Inventory and a cross-domain foreign key would
  violate schema discipline, so the column stays plain text exactly like
  `product_id` beside it.

  Recurring generation resolves the version **once per rule**, so a publish
  landing mid-run cannot split one generation batch across two definitions, and a
  later run never rewrites departures an earlier run already bound. The version
  arrives through a resolver supplied by the deployment rather than a direct
  read — Inventory already depends on Operations, so reaching back the other way
  would close a dependency cycle. `resolveCurrentProductVersionId` on the
  Inventory side returns the highest version number, which is deterministic by
  construction.

  Departures created before this column existed are **reported, not backfilled**.
  The only signal available after the fact is what the product looks like today,
  which is precisely what may have changed since the departure was sold;
  assigning that retroactively would manufacture false provenance for exactly the
  records where provenance matters most. `reportUnboundDepartures` and
  `listUnboundDepartures` expose an operator-review queue that excludes departures
  which have already run, since their provenance can no longer affect what is
  sold. `countDeparturesOnVersion` gives the impact set for a product edit.

  Slot creation accepts an explicit `productVersionId`, so a caller can
  materialize a departure against a chosen version.

### Patch Changes

- Updated dependencies [a3c04c4]
  - @voyant-travel/operations@0.14.0

## 0.28.0

### Minor Changes

- 06a79a0: Stop treating Extras as independently sellable catalog inventory.

  An Extra — an optional lunch, an attraction ticket — is lifecycle-dependent on
  the Product Booking that carries it. It is authored on the Product's Plan and
  Options, selected while the Booking is made, and fulfilled on the Departure. It
  was nonetheless still modelled as a first-class catalog vertical: it had a
  browse tab, filters, an entry in `DEFAULT_CATALOG_VERTICALS`, and document
  builders that could write it into the search index.

  `PRODUCT_OWNED_VERTICALS` in `@voyant-travel/catalog-contracts/indexer/contract`
  now names the verticals that exist only so their parent can freeze a booking
  snapshot, with `isProductOwnedVertical` / `owningVerticalFor` to read it.
  Consequently:

  - `extras` leaves `DEFAULT_CATALOG_VERTICALS`, so no extras slice or collection
    is provisioned and nothing can be indexed into one.
  - `POST /v1/{admin,public}/catalog/search` answers a product-owned vertical with
    `400 { reason: "not_independently_sellable", ownedBy }` instead of silently
    returning nothing, so an old deep link can explain itself.
  - The shared Catalog page drops the Extras tab, its columns and its filters, and
    renders a compatibility notice for `?tab=extras` pointing at the owning
    Product rather than falling through to a different result set.
  - `@voyant-travel/inventory/extras` no longer exports `createExtraDocumentBuilder`
    or `createExtraDocumentEmitter`; every extras field policy is now
    `reindex: "none"`. Snapshot and provenance helpers are unchanged — they are how
    the owning Product records what it sold.
  - `CatalogVertical` in the Trip composer no longer admits `extras`.

  `verify:extras-lifecycle` holds the line, and also refuses any migration that
  would promote an existing Extra into a Product or Component Booking — that is a
  commercial decision an operator makes deliberately, not a backfill.

- 038a576: Evaluate product publish readiness once, expose it as a read, and freeze a
  Product Version when publication changes how a departure would operate.

  Publish readiness was a single check — a scheduled product needed one future
  open departure — thrown only when a publish attempt was refused. An operator
  had no way to see what was missing before trying, and the reasons a product
  could not be sold (no default option, no units, no price, a multi-day product
  with no itinerary) were not among them.

  `evaluateProductReadiness` is now the one evaluator, shared by the admin API
  and the publish gate so a readiness panel and a 422 can never disagree. It is a
  pure function over already-loaded facts; `service-readiness.ts` loads them.
  Issues carry a stable `code`, the `field` to fix, and a new `severity`:

  - `blocking` refuses publication — missing/inactive default option, no option
    units, no price, and for multi-day products a missing, empty, or
    non-consecutive itinerary, alongside the existing departure check.
  - `warning` permits it — unresolved duration, missing family, no capacity
    source, no meeting point, no allocation template, uncosted planned services,
    missing description/default language/contract template, and no active
    channel. Per the product model RFC a product with an unresolved duration or
    family stays discoverable and raises an actionable warning instead of
    silently disappearing from a view.

  Checks are gated on behaviour — booking mode, capacity mode, resolved
  duration, composition — never on the merchandising family, so a 60-minute Boat
  Tour and a seven-day coach Tour are asked for different things by the same
  evaluator. Dynamically supplied products (`open`, `stay`) are still never asked
  for a departure, and a product being created is not refused for child rows it
  has had no opportunity to author yet.

  New: `GET /products/{id}/readiness` returns `ready`, `blocking`, `warnings`,
  and the combined `issues`. `severity` was added additively to the existing
  422 `product_not_ready_to_publish` payload, which still carries only blocking
  issues.

  Publishing an active product whose operationally relevant definition changed
  now creates an immutable Product Version automatically. Comparison covers the
  product columns a departure depends on plus the structure it materializes from
  (options, units, itineraries, days, day services); marketing copy, media, and
  record timestamps are excluded, so rewording a description does not invalidate
  a sold departure's provenance. Re-publishing an unchanged product creates
  nothing. `buildSnapshot` is split out of `createVersion` so the candidate is
  compared before anything is written.

  Distribution stays a non-dependency of inventory: the channel check is
  supplied through an optional `resolveActiveChannelCount` and skipped — not
  guessed — when a deployment cannot resolve it.

### Patch Changes

- 2df8a92: Charge and reserve one unit when several option units collapse onto the same
  pax band.

  `deriveTravelerCategory` maps every age tier under 18 onto `child`, so an
  operator selling "Child 6-12" alongside "Child 0-5" has two units competing for
  one band. `paxBandUnitCharges` had no record of which bands were already
  spoken for, so each unit contributed a full line carrying the whole band count.
  For `pax = { adult: 1, child: 1 }` against units priced 16000 / 13600 / 10400,
  the quote totalled 40000 for two travelers, and since voyant#4117 the commit
  also wrote three booking item lines and reserved three seats (voyant#4118).

  The overcharge predates voyant#4117 — `priceQuote` always had the ungated loop —
  but that change propagated it from the price into the reservation, which is the
  part that consumes departure capacity.

  A band is now claimed by exactly one unit, which is the rule the room path has
  always applied: `priceOptionSelections` keys its per-band prices on
  `option + band` and takes the first. The person-priced path was the outlier.

  The operator's `option_units.sort_order` decides the winner, so a contested band
  resolves to something the operator controls rather than to an accident of query
  planning. `sort_order` now travels on `ResolvedUnitPrice` and the charge list is
  sorted by it, with `unitId` breaking ties. This matters for correctness, not
  just predictability: `option_unit_price_rules` is selected with no `ORDER BY`,
  and the quote and the commit resolve prices in two separate calls, so a
  first-row-wins rule over unsorted rows could have picked one tier when quoting
  and another when committing.

  A zero-priced unit still does not claim a band. Free units produced no quote
  line and no reservation before this change, and letting one win a contested band
  would have quietly stopped charging for that band altogether.

  This does not make an operator with several child tiers expressible. The journey
  still collects one `child` count, so which tier the traveler belongs to remains
  unknown and the price for a contested band is still a guess — it is simply the
  operator's guess now, made once, instead of every tier being billed at once.
  Collecting pax per tier is the real fix and is tracked separately.

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/commerce@0.47.4
  - @voyant-travel/operator-settings@0.17.14
  - @voyant-travel/operations@0.13.7
  - @voyant-travel/products-contracts@0.108.6

## 0.27.9

### Patch Changes

- 41a6567: Derive booking item lines from pax bands so person-priced products can be
  booked from the storefront.

  A product whose selected option carried more than one `person` unit and flagged
  none of them `is_required` could be quoted, held and filled in, and then failed
  closed on `POST /v1/public/bookings` with "Several units are available and none
  is required, so the booking would reserve nothing." Adult / Child 6-12 /
  Child 0-5 is an ordinary per-person price structure, so this took out whole
  catalogues rather than an edge case (voyant#4113).

  Two halves of the booking engine disagreed about who names the units.
  `buildOwnedProductDraftShape` adds the journey's `option-units` step only for
  options that sell room or vehicle inventory — a person-only product prices by
  pax band alone — so the draft never carried `configure.optionSelections`.
  `deriveSelfServiceCommand` then derived its item lines from those selections
  alone, and the command reached booking creation with none. The refusal itself
  was right: a booking with no items reserves nothing. The storefront was simply
  incapable of supplying what the commit required for this product shape.

  Derivation now falls back to the pax bands, which is the only thing the shopper
  was actually asked for. The preferred source is the option price rule's
  per-band unit prices, shared with `priceQuote` through one
  `paxBandUnitCharges` function so the quote and the commit cannot drift about
  which units a person-priced product reserves: each item line corresponds 1:1 to
  an accepted quote base line. Amounts stay unset and are filled from the
  accepted quote, so the price the shopper saw still wins over a resolver reading
  taken at commit time.

  When the option's price lives at the option or product level and there are no
  per-band unit prices to derive from, the units are mapped onto the bands by
  their own age window instead. Two units deriving the same band — "Child 6-12"
  and "Child 0-5" both derive `child` — give the count to the first in sort order
  rather than each reserving the party in full.

  Quote band lines now also carry their `optionId` / `optionUnitId`, the same
  provenance the unit-selection path already emitted, so the commit matches item
  lines back to quote lines by unit rather than by position.

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/commerce@0.47.3
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/operations@0.13.6
  - @voyant-travel/operator-settings@0.17.13
  - @voyant-travel/core@0.137.2

## 0.27.8

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/commerce@0.47.2
  - @voyant-travel/operations@0.13.5
  - @voyant-travel/products-contracts@0.108.5

## 0.27.7

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/catalog@0.234.2
  - @voyant-travel/commerce@0.47.1
  - @voyant-travel/operations@0.13.4
  - @voyant-travel/operator-settings@0.17.12
  - @voyant-travel/types@0.109.12

## 0.27.6

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/commerce@0.47.0
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/operations@0.13.3
  - @voyant-travel/operator-settings@0.17.11

## 0.27.5

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/commerce@0.46.10
  - @voyant-travel/operations@0.13.2
  - @voyant-travel/operator-settings@0.17.10
  - @voyant-travel/bookings@0.236.0

## 0.27.4

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/operator-settings@0.17.9
- @voyant-travel/bookings@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/commerce@0.46.9
- @voyant-travel/operations@0.13.1

## 0.27.3

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [46005bf]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/bookings@0.234.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/operations@0.13.0
  - @voyant-travel/commerce@0.46.8
  - @voyant-travel/operator-settings@0.17.8
  - @voyant-travel/db@0.119.4
  - @voyant-travel/products-contracts@0.108.3

## 0.27.2

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/commerce@0.46.7
  - @voyant-travel/operations@0.12.2
  - @voyant-travel/operator-settings@0.17.7
  - @voyant-travel/db@0.119.3
  - @voyant-travel/products-contracts@0.108.2

## 0.27.1

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/products-contracts@0.108.1
  - @voyant-travel/commerce@0.46.6
  - @voyant-travel/operations@0.12.1
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0
  - @voyant-travel/operator-settings@0.17.6

## 0.27.0

### Minor Changes

- f7adc5b: Add configurable Product families, stable subtypes, explicit minute durations, family-first quick starts, and standard family Catalog views.

### Patch Changes

- f7adc5b: Make Product status the lifecycle authority and active Channel assignments the distribution authority, while retaining legacy visibility fields as deprecated API compatibility data.
- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/products-contracts@0.108.0
  - @voyant-travel/operations@0.12.0
  - @voyant-travel/commerce@0.46.5
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/operator-settings@0.17.5

## 0.26.3

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/commerce@0.46.4
  - @voyant-travel/operations@0.11.14
  - @voyant-travel/products-contracts@0.107.13
  - @voyant-travel/operator-settings@0.17.4

## 0.26.2

### Patch Changes

- 2601445: Continue owned Product Booking Session Commit through an idempotent pre-Booking
  Finance payment session, selected payment adapter, and atomic transfer to the
  created Booking. Expose typed payment-required continuation and recovery through
  the shared route contract, Storefront SDK, and React hooks.
- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/commerce@0.46.2
  - @voyant-travel/operations@0.11.13
  - @voyant-travel/products-contracts@0.107.12
  - @voyant-travel/operator-settings@0.17.3
  - @voyant-travel/bookings@0.229.0

## 0.26.1

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/catalog@0.226.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/commerce@0.46.1
- @voyant-travel/operations@0.11.12
- @voyant-travel/operator-settings@0.17.2

## 0.26.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/commerce@0.46.0
  - @voyant-travel/relationships@0.133.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/operator-settings@0.17.1
  - @voyant-travel/db@0.119.2
  - @voyant-travel/products-contracts@0.107.11
  - @voyant-travel/operations@0.11.11

## 0.25.4

### Patch Changes

- Updated dependencies [5694a2b]
  - @voyant-travel/operator-settings@0.17.0

## 0.25.3

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/commerce@0.45.6
  - @voyant-travel/operations@0.11.10
  - @voyant-travel/operator-settings@0.16.12

## 0.25.2

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/commerce@0.45.5
  - @voyant-travel/operator-settings@0.16.11
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/operations@0.11.9
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/storage@0.115.1

## 0.25.1

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/commerce@0.45.4
  - @voyant-travel/finance@0.224.0
  - @voyant-travel/operations@0.11.8
  - @voyant-travel/operator-settings@0.16.10

## 0.25.0

### Minor Changes

- d02a4e8: `get_product` now accepts the product's catalog `slug` as a human-readable
  alternative to the opaque product id, resolving the owning product through the
  existing translation slug. Product read outputs already carried `name` and
  `slug` alongside the typeid. Added `getProductBySlug` to the inventory Tool
  service surface.

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/commerce@0.45.3
  - @voyant-travel/finance@0.223.0
  - @voyant-travel/operations@0.11.7
  - @voyant-travel/operator-settings@0.16.9

## 0.24.2

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/commerce@0.45.2
- @voyant-travel/operations@0.11.6
- @voyant-travel/operator-settings@0.16.8

## 0.24.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/commerce@0.45.1
  - @voyant-travel/operations@0.11.5
  - @voyant-travel/operator-settings@0.16.7

## 0.24.0

### Minor Changes

- 52c794d: Add a per-vertical derivation primitive for public self-service booking.

  `OwnedBookingHandler.deriveSelfServiceCommand()` turns a public draft plus an
  accepted quote into a durable create command. It is pure — Finance still owns
  the mutation inside its claim — which is what distinguishes it from the removed
  `commit()`: the handler now describes the booking, it does not make one.

  Implementations must ignore operator-only draft fields, and the products
  handler does: a public caller can write the draft, so honouring `priceOverride`
  would let them name their own price, `suppressNotifications` would let them
  silence the operator, and `internalNotes` / `documentGeneration` would let them
  write operator-facing state. All four are dropped, with tests asserting each is
  absent from the derived command rather than merely falsy.

  A vertical that does not implement the primitive has no public creation path,
  and the deployment's create action stays unavailable for it. Products is the
  first and only implementation.

  `@voyant-travel/finance` gains a `consumeSources` hook that runs inside the
  booking-create transaction, so the draft, quote, hold, and verification
  challenge commit or roll back with the booking.

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/catalog@0.219.0
  - @voyant-travel/commerce@0.45.0
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/operations@0.11.4
  - @voyant-travel/operator-settings@0.16.6
  - @voyant-travel/relationships@0.132.17

## 0.23.5

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/bookings@0.220.0
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/catalog@0.218.0
  - @voyant-travel/commerce@0.44.20
  - @voyant-travel/relationships@0.132.16
  - @voyant-travel/operator-settings@0.16.5
  - @voyant-travel/operations@0.11.3
  - @voyant-travel/types@0.109.10

## 0.23.4

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/commerce@0.44.19
  - @voyant-travel/relationships@0.132.15
  - @voyant-travel/operations@0.11.2
  - @voyant-travel/operator-settings@0.16.4

## 0.23.3

### Patch Changes

- 87668e8: Make manual booking creation actionable and predictable: submit errors are visible, existing CRM contacts no longer require duplicate data entry, room assignments fill selected capacity, authoritative quotes preserve per-person/per-room pricing, and Finance tool failures explain how to correct invalid room or payment inputs.
- Updated dependencies [87668e8]
  - @voyant-travel/bookings@0.218.1
  - @voyant-travel/finance@0.218.1

## 0.23.2

### Patch Changes

- bc0b223: Cache non-personalized public product catalog responses in shared caches for fifteen minutes, keeping repeated storefront browsing off application and database computes while leaving availability, booking, customer, and payment routes untouched. Publish a new Framework runtime coordinate so managed images can roll this cache policy together with the serverless database idle-connection fix.

## 0.23.1

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/commerce@0.44.17
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/relationships@0.132.14
  - @voyant-travel/operator-settings@0.16.3
  - @voyant-travel/operations@0.11.1

## 0.23.0

### Minor Changes

- d3f16d5: Add exhaustive atomic product unit-configuration previews and confirmed applies, make departure creation durably idempotent with immediate projection signals, serialize partial departure timing updates with optional stale-snapshot conflicts while preserving patch compatibility, keep departure product ownership immutable, and label departure times with their configured timezone.

### Patch Changes

- Updated dependencies [d3f16d5]
  - @voyant-travel/operations@0.11.0
  - @voyant-travel/bookings@0.217.0
  - @voyant-travel/catalog@0.215.0
  - @voyant-travel/finance@0.217.0
  - @voyant-travel/commerce@0.44.16
  - @voyant-travel/relationships@0.132.13
  - @voyant-travel/operator-settings@0.16.2

## 0.22.5

### Patch Changes

- 71b2b0b: Keep edited base itinerary-day content authoritative for a product's default
  language instead of allowing stale or unrelated translation rows to shadow it.
- Updated dependencies [7b60cf5]
  - @voyant-travel/core@0.136.1
  - @voyant-travel/hono@0.134.9

## 0.22.4

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/commerce@0.44.14
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/relationships@0.132.12
  - @voyant-travel/operations@0.10.7
  - @voyant-travel/operator-settings@0.16.1

## 0.22.3

### Patch Changes

- Updated dependencies [9c2bb8c]
  - @voyant-travel/storage@0.115.0
  - @voyant-travel/finance@0.215.1

## 0.22.2

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/operator-settings@0.16.0
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/bookings@0.215.0
  - @voyant-travel/catalog@0.213.0
  - @voyant-travel/commerce@0.44.13
  - @voyant-travel/relationships@0.132.11
  - @voyant-travel/operations@0.10.6

## 0.22.1

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/catalog@0.212.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/commerce@0.44.12
- @voyant-travel/relationships@0.132.10
- @voyant-travel/operations@0.10.5
- @voyant-travel/operator-settings@0.15.9

## 0.22.0

### Minor Changes

- 9d84e82: Add Tools for product options and their bookable units (`list_product_options`,
  `get_product_option`, `create_product_option`, `update_product_option`,
  `list_option_units`, `get_option_unit`, `create_option_unit`,
  `update_option_unit`). The admin API already exposed this CRUD; without the
  Tools an agent could create a product but never make it sellable.

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/catalog@0.211.0
- @voyant-travel/finance@0.213.0
- @voyant-travel/commerce@0.44.11
- @voyant-travel/relationships@0.132.9
- @voyant-travel/operations@0.10.4
- @voyant-travel/operator-settings@0.15.8

## 0.21.12

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/commerce@0.44.10
  - @voyant-travel/operations@0.10.3
  - @voyant-travel/bookings@0.212.0
  - @voyant-travel/finance@0.212.0
  - @voyant-travel/relationships@0.132.8
  - @voyant-travel/operator-settings@0.15.7

## 0.21.11

### Patch Changes

- 0173b70: Identify `ApiHttpError` by a registry symbol instead of `instanceof`, so
  validation failures keep returning `400 invalid_request` when the throwing
  module and the error boundary loaded different copies of `@voyant-travel/hono`.
  `ZodError` and `HTTPException` are matched structurally for the same reason.
- Updated dependencies [0173b70]
  - @voyant-travel/hono@0.134.7

## 0.21.10

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/commerce@0.44.9
  - @voyant-travel/operations@0.10.2
  - @voyant-travel/bookings@0.211.0
  - @voyant-travel/finance@0.211.0
  - @voyant-travel/relationships@0.132.7
  - @voyant-travel/operator-settings@0.15.6

## 0.21.9

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/commerce@0.44.8
- @voyant-travel/relationships@0.132.6
- @voyant-travel/operations@0.10.1
- @voyant-travel/operator-settings@0.15.5

## 0.21.8

### Patch Changes

- Updated dependencies [8abbdd6]
  - @voyant-travel/operations@0.10.0
  - @voyant-travel/bookings@0.209.0
  - @voyant-travel/catalog@0.207.0
  - @voyant-travel/finance@0.209.0
  - @voyant-travel/commerce@0.44.7
  - @voyant-travel/relationships@0.132.5
  - @voyant-travel/operator-settings@0.15.4

## 0.21.7

### Patch Changes

- Updated dependencies [7547f67]
  - @voyant-travel/operations@0.9.5
  - @voyant-travel/bookings@0.208.0
  - @voyant-travel/catalog@0.206.0
  - @voyant-travel/finance@0.208.0
  - @voyant-travel/commerce@0.44.6
  - @voyant-travel/relationships@0.132.4
  - @voyant-travel/operator-settings@0.15.3

## 0.21.6

### Patch Changes

- d6fb26a: Resolve update_product_day action target from dayId via package-resolver when product id is omitted.

## 0.21.5

### Patch Changes

- fe4b14a: Resolve update_product_day from dayId without requiring product id, so Max does not invent id=unknown and trigger a default-itinerary insert.

## 0.21.4

### Patch Changes

- 0738c93: Add list_product_days and update_product_day MCP tools, and return product slug from compose_product / get_product for Max catalog editing.

## 0.21.3

### Patch Changes

- 560f7c3: Declare safety-contract metadata on the ten remaining grandfathered
  inventory actions and remove them from the legacy execute+tools allowlist:

  - `action.create-product` and `authoring.action.compose-product` already
    claim their command idempotently via the existing `handler-command-claim-v1`
    `createdTarget` contract and insert their lifecycle event through the
    durable outbox; this adds `availability`, `effectBoundary: "multistage"`,
    and `durability: { strategy: "outbox" }`.
  - `action.update-product`, `action.publish-product`,
    `action.unpublish-product`, and `action.archive-product` are plain local
    Postgres updates against an existing product; the publish/unpublish/archive
    lifecycle transitions call `updateProduct` under the hood and emit their
    event in-process. This adds `availability` and `effectBoundary: "local"`
    (`targetLifecycle: "existing"` was already declared).
  - `extras.action.create-product-extra` and
    `extras.action.create-option-extra-config` already claim their command
    idempotently via the existing `handler-command-claim-v1` `createdTarget`
    contract; this adds `availability` and `effectBoundary: "local"`.
  - `extras.action.update-product-extra` and
    `extras.action.update-option-extra-config` are plain local Postgres updates
    against an existing `id`; this adds `availability` and `effectBoundary:
"local"` (`targetLifecycle: "existing"` was already declared).

  No runtime changes.

- Updated dependencies [560f7c3]
- Updated dependencies [560f7c3]
  - @voyant-travel/bookings@0.207.1
  - @voyant-travel/catalog@0.205.1

## 0.21.2

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/commerce@0.44.4
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/relationships@0.132.2
  - @voyant-travel/operations@0.9.2
  - @voyant-travel/operator-settings@0.15.1

## 0.21.1

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/operator-settings@0.15.0
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/commerce@0.44.3
  - @voyant-travel/relationships@0.132.1
  - @voyant-travel/operations@0.9.1

## 0.21.0

### Minor Changes

- 58baffe: Remove callable Tool name aliases from the standard Operator graph. MCP and
  other callers must use canonical Tool names only; previous compatibility names
  (for example `crm_*`, `legal_contract_*`, `availability_*`, `dashboard_summary`,
  `read_setup_state`, `products_compose`, `invoices_issue_from_booking`) no longer
  dispatch.

  Stop publicly exporting the deprecated Relationships Tools
  `add_relationship_note`, `add_relationship_contact_method`, and
  `add_relationship_address`. Use the person- or organization-specific add Tools
  selected by the graph instead.

  See the consolidated [caller migration
  page](../docs/migrations/removed-tool-aliases.md) for the complete old →
  canonical name mapping.

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/operations@0.9.0
  - @voyant-travel/relationships@0.132.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/commerce@0.44.2
  - @voyant-travel/operator-settings@0.14.26
  - @voyant-travel/bookings@0.205.0

## 0.20.1

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/commerce@0.44.1
- @voyant-travel/relationships@0.131.7
- @voyant-travel/operations@0.8.47
- @voyant-travel/operator-settings@0.14.25

## 0.20.0

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
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/commerce@0.44.0
  - @voyant-travel/operator-settings@0.14.24
  - @voyant-travel/operations@0.8.46
  - @voyant-travel/relationships@0.131.6

## 0.19.6

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/commerce@0.43.3
- @voyant-travel/relationships@0.131.5
- @voyant-travel/operations@0.8.45
- @voyant-travel/operator-settings@0.14.23

## 0.19.5

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
  - @voyant-travel/commerce@0.43.2
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/relationships@0.131.4
  - @voyant-travel/operations@0.8.44
  - @voyant-travel/operator-settings@0.14.22

## 0.19.4

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/commerce@0.43.1
  - @voyant-travel/operator-settings@0.14.21
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/operations@0.8.43
  - @voyant-travel/relationships@0.131.3

## 0.19.3

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/commerce@0.43.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/storage@0.114.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/operations@0.8.42
  - @voyant-travel/operator-settings@0.14.20
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/relationships@0.131.2
  - @voyant-travel/products-contracts@0.107.10

## 0.19.2

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/commerce@0.42.2
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/operations@0.8.41
  - @voyant-travel/operator-settings@0.14.19
  - @voyant-travel/relationships@0.131.1
  - @voyant-travel/storage@0.113.6

## 0.19.1

### Patch Changes

- e2cb9f5: Expand the products list Filters with Type, Booking mode, Visibility, Tag, and a
  Departure window. Type/Booking mode/Visibility/Tag reuse query params the list
  endpoint already supported; the Departure window is a new `departureFrom`/
  `departureTo` query param that keeps only products with an upcoming open
  departure whose date falls in the chosen range (filtered on availability slots,
  independent of the product's own start date).
- Updated dependencies [e2cb9f5]
  - @voyant-travel/products-contracts@0.107.9
  - @voyant-travel/bookings@0.198.1
  - @voyant-travel/catalog@0.196.1
  - @voyant-travel/finance@0.198.1

## 0.19.0

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/bookings@0.198.0
  - @voyant-travel/catalog@0.196.0
  - @voyant-travel/finance@0.198.0
  - @voyant-travel/commerce@0.42.1
  - @voyant-travel/operations@0.8.40
  - @voyant-travel/operator-settings@0.14.18

## 0.18.0

### Patch Changes

- Updated dependencies [b07a0a3]
- Updated dependencies [e44781c]
- Updated dependencies [fa1cc2c]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/commerce@0.42.0
  - @voyant-travel/relationships@0.130.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/operations@0.8.39
  - @voyant-travel/operator-settings@0.14.17
  - @voyant-travel/storage@0.113.5

## 0.17.0

### Minor Changes

- 0190317: Make product, product-composition, MICE-program, trip, and room-block creation
  Tools use handler-owned atomic created-target command claims with exact replay
  and drift conflicts.
- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.

### Patch Changes

- Updated dependencies [78423d3]
- Updated dependencies [bba4fec]
- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/commerce@0.41.0
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/operator-settings@0.14.16
  - @voyant-travel/operations@0.8.38
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/storage@0.113.4

## 0.16.2

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/commerce@0.40.6
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/relationships@0.128.36
  - @voyant-travel/operations@0.8.37
  - @voyant-travel/operator-settings@0.14.15

## 0.16.1

### Patch Changes

- dd370ca: Add a provider-agnostic, durable catalog product reindex job that walks canonical inventory
  products in bounded pages and rebuilds their projections through the selected indexer runtime.
  Product job hosts now pass concrete deployment bindings to fixed job runtimes.
- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/commerce@0.40.5
  - @voyant-travel/operations@0.8.36
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/relationships@0.128.35
  - @voyant-travel/operator-settings@0.14.14

## 0.16.0

### Minor Changes

- 90d44c0: Add the operator editorial-overlay editor for sourced products: configured-locale switching, side-by-side provider/overlay/effective comparison on wide screens with an accessible tabbed compare on narrow ones, overlay-only translation authoring, media-library-backed image overlays, customer preview, confirmed clear, and optimistic-concurrency conflict reporting.

  The product editorial-overlay admin read model now enumerates every eligible field (not only fields that already carry an overlay) and reports per-field `exact`, `language-fallback`, `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and `orphaned` state plus drift against the provider's last source update, the cached source locales, and whether the entity is provider-sourced.

  `useLocale()` now exposes the deployment's `supportedLocales`, and the catalog overlay service exposes `fetchOverlayRowsForEntity` for admin surfaces that need overlay audit columns.

### Patch Changes

- a43267a: Add node-aware localized editorial overlays for sourced product content, including stable content-node targeting, optimistic overlay versions, audit history, product admin read/write/clear routes, and public provenance redaction.

  Tighten editorial overlay scope isolation for product content reads and writes, require admin overlay mutations to carry an authenticated user id, and make overlay mutations/history atomic with race-safe optimistic version checks.

- 2c79bef: Add referenced presentation-subject overlay support for cruise ships and accommodation properties.
- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/products-contracts@0.107.8
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/commerce@0.40.4
  - @voyant-travel/operations@0.8.35
  - @voyant-travel/relationships@0.128.34
  - @voyant-travel/operator-settings@0.14.13

## 0.15.4

### Patch Changes

- 130f62c: Expose owned-product SEO metadata and Open Graph images through the product admin and storefront surfaces.
- Updated dependencies [130f62c]
  - @voyant-travel/products-contracts@0.107.7

## 0.15.3

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/action-ledger@0.111.14
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/commerce@0.40.3
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/operations@0.8.34
  - @voyant-travel/operator-settings@0.14.12
  - @voyant-travel/relationships@0.128.33
  - @voyant-travel/storage@0.113.3

## 0.15.2

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/operator-settings@0.14.11
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/commerce@0.40.2
  - @voyant-travel/relationships@0.128.32
  - @voyant-travel/operations@0.8.33

## 0.15.1

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/commerce@0.40.1
  - @voyant-travel/operator-settings@0.14.10
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/operations@0.8.32
  - @voyant-travel/relationships@0.128.31

## 0.15.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/commerce@0.40.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/relationships@0.128.30
  - @voyant-travel/operations@0.8.31
  - @voyant-travel/operator-settings@0.14.9
  - @voyant-travel/action-ledger@0.111.13
  - @voyant-travel/types@0.109.9
  - @voyant-travel/storage@0.113.2

## 0.14.28

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/commerce@0.39.25
  - @voyant-travel/operations@0.8.30
  - @voyant-travel/products-contracts@0.107.6
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0
  - @voyant-travel/relationships@0.128.29
  - @voyant-travel/operator-settings@0.14.8

## 0.14.27

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/action-ledger@0.111.11
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/commerce@0.39.24
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/operations@0.8.29
  - @voyant-travel/operator-settings@0.14.7
  - @voyant-travel/relationships@0.128.28
  - @voyant-travel/workflows@0.122.18

## 0.14.26

### Patch Changes

- 406cebb: Persist accepted owned-product quote amounts on booking item lines so invoice generation receives an exact non-zero line total, including add-ons, tax modes, overrides, and cent rounding.

## 0.14.25

### Patch Changes

- Updated dependencies [d8a225c]
  - @voyant-travel/storage@0.113.0
  - @voyant-travel/finance@0.187.1

## 0.14.24

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/commerce@0.39.23
- @voyant-travel/relationships@0.128.27
- @voyant-travel/operations@0.8.28
- @voyant-travel/operator-settings@0.14.6

## 0.14.23

### Patch Changes

- 11f58b0: Price rooms whose unit price is set per traveler category. The product editor's "Rooms & prices" matrix stores a room's price per traveler type (e.g. Double / Adult), and the booking engine previously dropped every unit-price row that carried a `pricingCategoryId` — so such products quoted `no_sell_amount_configured` and could not be priced or booked through the journey. Per-category room prices now resolve to their band and charge per person (`pax[band] × price`); category-less room prices, pax tiers, and the product-base fallback are unchanged.

## 0.14.22

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/commerce@0.39.22
- @voyant-travel/relationships@0.128.26
- @voyant-travel/operations@0.8.27
- @voyant-travel/operator-settings@0.14.5

## 0.14.21

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/commerce@0.39.21
  - @voyant-travel/operator-settings@0.14.4
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/operations@0.8.26
  - @voyant-travel/relationships@0.128.25

## 0.14.20

### Patch Changes

- a33c590: Add a "Choose from Media Library" action to the product media section so
  operators can attach existing library assets to a product or itinerary day
  instead of only uploading new files. Product media now records the source
  asset reference (`assetId`) alongside the derived byte URL, kind, mime type,
  and size.
- Updated dependencies [a33c590]
  - @voyant-travel/products-contracts@0.107.5
  - @voyant-travel/bookings@0.184.0
  - @voyant-travel/catalog@0.182.0
  - @voyant-travel/finance@0.184.0
  - @voyant-travel/commerce@0.39.20
  - @voyant-travel/relationships@0.128.24
  - @voyant-travel/operations@0.8.25
  - @voyant-travel/operator-settings@0.14.3

## 0.14.19

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/operator-settings@0.14.2
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/commerce@0.39.19
- @voyant-travel/relationships@0.128.23
- @voyant-travel/operations@0.8.24

## 0.14.18

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/action-ledger@0.111.10
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/commerce@0.39.18
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/operations@0.8.23
  - @voyant-travel/operator-settings@0.14.1
  - @voyant-travel/relationships@0.128.22
  - @voyant-travel/workflows@0.122.15

## 0.14.17

### Patch Changes

- Updated dependencies [225000a]
  - @voyant-travel/operator-settings@0.14.0
  - @voyant-travel/finance@0.182.2

## 0.14.16

### Patch Changes

- Updated dependencies [bcd7ad0]
  - @voyant-travel/storage@0.112.0
  - @voyant-travel/finance@0.182.1

## 0.14.15

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/commerce@0.39.17
- @voyant-travel/relationships@0.128.21
- @voyant-travel/operations@0.8.22
- @voyant-travel/operator-settings@0.13.1

## 0.14.14

### Patch Changes

- Updated dependencies [0fa5feb]
  - @voyant-travel/operator-settings@0.13.0

## 0.14.13

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/operator-settings@0.12.0
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/commerce@0.39.16
  - @voyant-travel/relationships@0.128.20
  - @voyant-travel/operations@0.8.21

## 0.14.12

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/operator-settings@0.11.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/db@0.117.1
  - @voyant-travel/products-contracts@0.107.4
  - @voyant-travel/bookings@0.180.1
  - @voyant-travel/catalog@0.178.1
  - @voyant-travel/workflows@0.122.14

## 0.14.11

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/workflows@0.122.13
- @voyant-travel/commerce@0.39.15
- @voyant-travel/relationships@0.128.19
- @voyant-travel/operations@0.8.20
- @voyant-travel/operator-settings@0.10.11

## 0.14.10

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/commerce@0.39.14
- @voyant-travel/relationships@0.128.18
- @voyant-travel/operations@0.8.19
- @voyant-travel/operator-settings@0.10.10

## 0.14.9

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/workflows@0.122.12
- @voyant-travel/commerce@0.39.13
- @voyant-travel/relationships@0.128.17
- @voyant-travel/operations@0.8.18
- @voyant-travel/operator-settings@0.10.9

## 0.14.8

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/action-ledger@0.111.9
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/commerce@0.39.12
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/operations@0.8.17
  - @voyant-travel/operator-settings@0.10.8
  - @voyant-travel/relationships@0.128.16
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.14.7

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/action-ledger@0.111.8
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/commerce@0.39.11
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/operations@0.8.16
  - @voyant-travel/operator-settings@0.10.7
  - @voyant-travel/relationships@0.128.15
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.14.6

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/commerce@0.39.10
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/relationships@0.128.14
  - @voyant-travel/action-ledger@0.111.7
  - @voyant-travel/operations@0.8.15
  - @voyant-travel/operator-settings@0.10.6
  - @voyant-travel/storage@0.111.6
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.14.5

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/action-ledger@0.111.6
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/commerce@0.39.9
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/operations@0.8.14
  - @voyant-travel/operator-settings@0.10.5
  - @voyant-travel/relationships@0.128.13
  - @voyant-travel/storage@0.111.5
  - @voyant-travel/workflows@0.122.8

## 0.14.4

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/commerce@0.39.8
- @voyant-travel/relationships@0.128.12
- @voyant-travel/operations@0.8.13
- @voyant-travel/operator-settings@0.10.4

## 0.14.3

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/commerce@0.39.7
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/action-ledger@0.111.5
  - @voyant-travel/db@0.114.14
  - @voyant-travel/operations@0.8.12
  - @voyant-travel/operator-settings@0.10.3
  - @voyant-travel/storage@0.111.4
  - @voyant-travel/workflows@0.122.7

## 0.14.2

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/action-ledger@0.111.4
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/commerce@0.39.6
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/operations@0.8.11
  - @voyant-travel/operator-settings@0.10.2
  - @voyant-travel/relationships@0.128.10
  - @voyant-travel/workflows@0.122.6

## 0.14.1

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/commerce@0.39.5
  - @voyant-travel/operator-settings@0.10.1
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/operations@0.8.10
  - @voyant-travel/relationships@0.128.9

## 0.14.0

### Minor Changes

- 117fa05: Generate managed-deployment contracts from operator-authored default templates and number series without deployment-specific workflows. Add reusable light- and dark-mode horizontal logo and icon assets to Operator Profile, expose them to contract templates, and provide accessible drag-and-drop upload controls. Introduce a shared document-renderer port and zero-code HTTP adapter so managed deployments can use a private platform renderer while self-hosters can swap in their own renderer for contracts and brochures.

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/operator-settings@0.10.0
  - @voyant-travel/action-ledger@0.111.3
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/commerce@0.39.4
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/operations@0.8.9
  - @voyant-travel/relationships@0.128.8
  - @voyant-travel/storage@0.111.3
  - @voyant-travel/workflows@0.122.5

## 0.13.7

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/action-ledger@0.111.2
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/commerce@0.39.3
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/operations@0.8.8
  - @voyant-travel/operator-settings@0.9.2
  - @voyant-travel/relationships@0.128.7
  - @voyant-travel/storage@0.111.2
  - @voyant-travel/workflows@0.122.4

## 0.13.6

### Patch Changes

- 590d256: Republish with dependency ranges resolved. The prior tarballs for these packages
  carry raw `workspace:` specifiers (they were published outside the pnpm-aware
  release flow) and cannot be installed by consumers. Also fixes the `runtime`
  package's `prepack`, which rebuilt the entire workspace dependency closure on
  every publish — the slow build stalled the release train's publish step past its
  timeout and wedged the whole batch. `prepack` now builds only the package itself,
  matching every other package.
- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/commerce@0.39.2
  - @voyant-travel/operations@0.8.7
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/operator-settings@0.9.1
  - @voyant-travel/relationships@0.128.6

## 0.13.5

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/operator-settings@0.9.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/commerce@0.39.1
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/operations@0.8.6
  - @voyant-travel/relationships@0.128.5

## 0.13.4

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/commerce@0.39.0
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/operator-settings@0.8.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/operations@0.8.5
  - @voyant-travel/relationships@0.128.4

## 0.13.3

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/commerce@0.38.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/operator-settings@0.7.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/workflows@0.122.3
  - @voyant-travel/operations@0.8.4
  - @voyant-travel/relationships@0.128.3

## 0.13.2

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/operator-settings@0.6.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/commerce@0.37.3
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/operations@0.8.3
  - @voyant-travel/relationships@0.128.2

## 0.13.1

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/commerce@0.37.2
  - @voyant-travel/operations@0.8.2
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0
  - @voyant-travel/relationships@0.128.1
  - @voyant-travel/operator-settings@0.5.2

## 0.13.0

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
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/commerce@0.37.1
  - @voyant-travel/action-ledger@0.111.1
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/operations@0.8.1
  - @voyant-travel/operator-settings@0.5.1
  - @voyant-travel/storage@0.111.1
  - @voyant-travel/products-contracts@0.107.3
  - @voyant-travel/workflows@0.122.2

## 0.12.1

### Patch Changes

- Updated dependencies [5941d2c]
  - @voyant-travel/action-ledger@0.111.0
  - @voyant-travel/bookings@0.162.1
  - @voyant-travel/finance@0.162.1
  - @voyant-travel/relationships@0.127.1

## 0.12.0

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
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/commerce@0.37.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/operations@0.8.0
  - @voyant-travel/operator-settings@0.5.0
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/storage@0.111.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.11.1

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
- Updated dependencies [85bfe2c]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/action-ledger@0.109.1
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/commerce@0.36.1
  - @voyant-travel/operator-settings@0.4.1
  - @voyant-travel/relationships@0.126.1
  - @voyant-travel/operations@0.7.1

## 0.11.0

### Minor Changes

- a2fd806: Add package-owned MCP Tools for atomic product composition, composed booking creation,
  and approval-gated invoice/proforma issue from bookings. Reuse the existing domain
  orchestrators, structural schemas, mutation ledgers, and post-commit events, and make
  approved invoice execution exactly idempotent.
- 7e4ab07: Add guarded MCP Tools for product extras and option-level extra configuration.

### Patch Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- 497dff2: Add governed product authoring, lifecycle, and composed-content read Tools plus provider-neutral trip requirement, candidate sourcing, selection, and re-shop Tools.
- 6604f9e: Expose structural output schemas for every first-party Tool that previously used an opaque runtime-only schema.
- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [db5adce]
- Updated dependencies [90e8d6d]
- Updated dependencies [54be000]
- Updated dependencies [bf19d5a]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/action-ledger@0.109.0
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/commerce@0.36.0
  - @voyant-travel/operations@0.7.0
  - @voyant-travel/operator-settings@0.4.0
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/storage@0.110.2
  - @voyant-travel/workflows@0.121.0

## 0.10.4

### Patch Changes

- 49f55d0: Keep catalog booking and checkout as a two-phase flow, and atomically convert
  owned-product availability holds into on-hold booking allocations without
  consuming capacity twice. Hold placement and release are now idempotent across
  retries and duplicate tokens, converted holds retain an audit link to their
  booking allocation, and checkout-only intents receive structured validation
  errors from the reservation route.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/operations@0.6.14
  - @voyant-travel/tools@0.2.2
  - @voyant-travel/action-ledger@0.108.6
  - @voyant-travel/commerce@0.35.9
  - @voyant-travel/db@0.114.6
  - @voyant-travel/operator-settings@0.3.14
  - @voyant-travel/relationships@0.125.4
  - @voyant-travel/storage@0.110.1
  - @voyant-travel/workflows@0.120.4

## 0.10.3

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
  - @voyant-travel/storage@0.110.0
  - @voyant-travel/action-ledger@0.108.5
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/commerce@0.35.8
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/operations@0.6.13
  - @voyant-travel/operator-settings@0.3.13
  - @voyant-travel/relationships@0.125.3
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.10.2

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/products-contracts@0.107.2
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/commerce@0.35.7
  - @voyant-travel/operations@0.6.12
  - @voyant-travel/relationships@0.125.2
  - @voyant-travel/operator-settings@0.3.12

## 0.10.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/action-ledger@0.108.4
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/commerce@0.35.6
  - @voyant-travel/extras-contracts@0.104.3
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/operations@0.6.11
  - @voyant-travel/operator-settings@0.3.11
  - @voyant-travel/products-contracts@0.107.1
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/storage@0.109.4
  - @voyant-travel/tools@0.2.1
  - @voyant-travel/workflows@0.120.2

## 0.10.0

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
  - @voyant-travel/products-contracts@0.107.0
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/commerce@0.35.5
  - @voyant-travel/operator-settings@0.3.10
  - @voyant-travel/db@0.114.3
  - @voyant-travel/workflows@0.120.1
  - @voyant-travel/operations@0.6.10

## 0.9.3

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
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/storage@0.109.3
  - @voyant-travel/action-ledger@0.108.3
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/commerce@0.35.3
  - @voyant-travel/operations@0.6.9
  - @voyant-travel/operator-settings@0.3.9
  - @voyant-travel/relationships@0.124.4

## 0.9.2

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/action-ledger@0.108.2
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/commerce@0.35.2
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/operations@0.6.8
  - @voyant-travel/operator-settings@0.3.8
  - @voyant-travel/relationships@0.124.3
  - @voyant-travel/storage@0.109.2
  - @voyant-travel/workflows@0.119.0

## 0.9.1

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/action-ledger@0.108.1
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/commerce@0.35.1
  - @voyant-travel/operations@0.6.7
  - @voyant-travel/operator-settings@0.3.7
  - @voyant-travel/relationships@0.124.2
  - @voyant-travel/storage@0.109.1
  - @voyant-travel/workflows@0.118.0

## 0.9.0

### Minor Changes

- 047c3f9: Add package-owned graph runtime factories and typed deployment ports for Catalog search, booking, and offers; Inventory core, content, and brochures; Accommodations and Cruises content; and Action Ledger health.
- 490d132: Move owned product, accommodation, and cruise booking runtime behavior out of the Operator starter and into package-owned runtime surfaces.
- 490d132: Move standard Node media storage, video upload, document delivery, and brochure printing authority into package-owned runtime contributors.
- 282892e: Make `@voyant-travel/runtime` the single public Node project host, move low-level
  host primitives to `@voyant-travel/runtime-core`, and remove the package-owned
  runtime CLI. Rename remaining first-party operator-specific subpaths to generic
  runtime or runtime-support surfaces.

### Patch Changes

- 490d132: Move standard cross-package links from the operator starter to package-owned
  manifests and explicit standard-product selections, and generate executable
  links from the selected deployment graph.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move Commerce runtime composition from the Operator starter into statically selected package contributors and typed domain ports.
- 490d132: Expose package-owned runtime contributor maps for Storefront, Legal, and Inventory deployment adapters.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Compose MCP tools and their service context from graph-selected package runtime exports instead of an Operator-owned product catalog.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move catalog content configuration, booking financial lifecycle behavior, and catalog/commerce scheduled work behind package-owned graph factories and workflows.
- c65b05c: Move standard cross-package link tables and the person directory view into
  upgrade-safe package migration histories, use stable package ledger identities,
  and remove aggregate Drizzle and migration authority from the Operator starter.
- 490d132: Move Inventory workflow and brochure runtime composition behind package-owned typed ports and remove the Operator runtime capability.
- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- 490d132: Remove the final Operator admin factory compatibility registry by composing cross-domain behavior through package-owned selected graph slots and contributions.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
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
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/commerce@0.35.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/action-ledger@0.108.0
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/storage@0.109.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/operations@0.6.6
  - @voyant-travel/operator-settings@0.3.6
  - @voyant-travel/tools@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.8.6

### Patch Changes

- 8f4c242: Derive anonymous public and transactional path posture from selected deployment graph API bundles, including partial transactional path declarations.
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [d771be3]
- Updated dependencies [18d8aa0]
- Updated dependencies [9b15ebe]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/commerce@0.34.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/action-ledger@0.107.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/operations@0.6.5
  - @voyant-travel/db@0.112.2
  - @voyant-travel/storage@0.108.1
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/workflows@0.116.0

## 0.8.5

### Patch Changes

- e5aa097: Activate package-owned workflow declarations through the generated deployment graph and deployment-supplied Node runtime services.
- 2ec05ae: Publish the product PDF workflow deployment runtime service contract for graph activation.
- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/storage@0.108.0
  - @voyant-travel/action-ledger@0.106.4
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/commerce@0.33.5
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/operations@0.6.4
  - @voyant-travel/workflows@0.115.2

## 0.8.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/action-ledger@0.106.3
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/commerce@0.33.4
  - @voyant-travel/operations@0.6.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.8.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/action-ledger@0.106.2
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/commerce@0.33.3
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/operations@0.6.2
  - @voyant-travel/storage@0.107.2

## 0.8.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/commerce@0.33.2
  - @voyant-travel/hono@0.123.1

## 0.8.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/action-ledger@0.106.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/commerce@0.33.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/operations@0.6.1
  - @voyant-travel/storage@0.107.1

## 0.8.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for catalog, commerce, and inventory
  runtime, persistence, orchestration, and extension surfaces.
- a370024: Publish package-owned deployment declarations and configurable runtime factories for vertical
  content, brochure, booking-extension, base API, and scheduled workflow surfaces.
- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
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
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/commerce@0.33.0
  - @voyant-travel/action-ledger@0.106.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/operations@0.6.0
  - @voyant-travel/storage@0.107.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.7.11

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/commerce@0.32.0
  - @voyant-travel/action-ledger@0.105.15
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/operations@0.5.23

## 0.7.10

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/action-ledger@0.105.14
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/commerce@0.31.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/operations@0.5.22
  - @voyant-travel/hono@0.122.2

## 0.7.9

### Patch Changes

- @voyant-travel/catalog@0.147.0
- @voyant-travel/commerce@0.31.0
- @voyant-travel/operations@0.5.21

## 0.7.8

### Patch Changes

- @voyant-travel/catalog@0.146.0
- @voyant-travel/commerce@0.30.0
- @voyant-travel/operations@0.5.20

## 0.7.7

### Patch Changes

- @voyant-travel/catalog@0.145.0
- @voyant-travel/commerce@0.29.0
- @voyant-travel/operations@0.5.19

## 0.7.6

### Patch Changes

- @voyant-travel/catalog@0.144.0
- @voyant-travel/commerce@0.28.0
- @voyant-travel/operations@0.5.18

## 0.7.5

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/commerce@0.27.0
  - @voyant-travel/operations@0.5.17
  - @voyant-travel/products-contracts@0.106.1

## 0.7.4

### Patch Changes

- @voyant-travel/commerce@0.26.0
- @voyant-travel/catalog@0.142.0
- @voyant-travel/operations@0.5.16

## 0.7.3

### Patch Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.
- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/action-ledger@0.105.13
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/commerce@0.25.0
  - @voyant-travel/operations@0.5.15
  - @voyant-travel/types@0.107.1

## 0.7.2

### Patch Changes

- Updated dependencies [05c10f2]
  - @voyant-travel/commerce@0.24.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/operations@0.5.14

## 0.7.1

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/commerce@0.23.0
  - @voyant-travel/operations@0.5.13

## 0.7.0

### Minor Changes

- 8405bee: Fold the product's default itinerary into the catalog product read-model document.

  `getCatalogProductById` (and the `/v1/public/products/:id` + `/slug/:slug`
  read-through documents) can now include the product's default day-by-day
  itinerary — days and day-services with `product_day_translations` /
  `product_day_service_translations` resolved by the document's locale, plus a
  per-day thumbnail. It is opt-in via `?include=itinerary`, encoded in the
  read-model variant so itinerary and non-itinerary documents cache — and warm on
  mutation — independently. Only the product default itinerary is folded;
  departure-specific overrides stay on the departure itinerary endpoint.

  The itinerary update/delete/duplicate admin routes (keyed on the itinerary id,
  not the product id) now trigger read-model recompute so the folded itinerary
  stays fresh.

### Patch Changes

- Updated dependencies [8405bee]
  - @voyant-travel/products-contracts@0.106.0
  - @voyant-travel/commerce@0.22.0
  - @voyant-travel/catalog@0.138.0
  - @voyant-travel/operations@0.5.12

## 0.6.1

### Patch Changes

- 4504abb: Export product read-model helpers and the public product read service, and add a write-time warm path for product read-model recomputation after inventory mutations.

## 0.6.0

### Minor Changes

- 77f139b: Add read-only agent tools for the products domain at
  `@voyant-travel/inventory/tools`: `list_products` and `get_product`, exposed as
  headless `defineTool`s over the existing products service (`products:read` scope,
  read tier). The operator registers them on the in-deployment MCP server alongside
  the trips tools — establishing the module-owned-tools pattern for the remaining
  domains.

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [0c75844]
- Updated dependencies [1655995]
- Updated dependencies [22f0457]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/commerce@0.21.0
  - @voyant-travel/tools@0.1.0
  - @voyant-travel/operations@0.5.10
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/action-ledger@0.105.12
  - @voyant-travel/db@0.109.5

## 0.5.18

### Patch Changes

- ae115de: Use owned product option-unit pax pricing tiers when booking journey quotes include explicit unit selections.

## 0.5.17

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
- Updated dependencies [fead555]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/operations@0.5.9
  - @voyant-travel/action-ledger@0.105.11
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/commerce@0.20.5

## 0.5.16

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/action-ledger@0.105.10
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/commerce@0.20.4
  - @voyant-travel/operations@0.5.8

## 0.5.15

### Patch Changes

- 2d3b039: Offer bank transfer and inquiry on owned-product storefront checkout.

  The owned-product booking draft shape hardcoded `paymentIntents: ["hold",
"card"]`, so the storefront Payment step collapsed to card-only for owned
  products even though the deployment advertised bank transfer and inquiry
  (sourced products already offered all three). Both product draft shapes now
  declare the full engine allow list via a shared `DEFAULT_PAYMENT_INTENTS`
  constant, and deployment/surface `PaymentProviderCapabilities` narrow it at
  render time — so owned and sourced products offer the same payment paths. The
  `/checkout/start` flow already handled bank transfer and inquiry generically on
  the booking row, so no server change was needed.

- Updated dependencies [dd03968]
- Updated dependencies [2d3b039]
- Updated dependencies [bcd76ae]
  - @voyant-travel/operations@0.5.7
  - @voyant-travel/catalog@0.136.1
  - @voyant-travel/commerce@0.20.3

## 0.5.14

### Patch Changes

- 9ebd8e8: Owned product booking commit now resolves (or creates) a CRM person from the
  billing contact when the commit carries no `personId`/`organizationId` — the
  anonymous storefront checkout case. `createProductsBookingHandler` accepts a new
  optional `resolveBillingPerson` bridge (wired by the template to
  `relationshipsService.upsertPersonFromContact`), mirroring the sourced/session
  arm's `resolveBillingPerson` hook. This fixes anonymous storefront checkout for
  owned public products, which previously failed with a 400 "Select a billing
  person or organization".

## 0.5.13

### Patch Changes

- @voyant-travel/commerce@0.20.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/operations@0.5.6

## 0.5.12

### Patch Changes

- c5cd9cd: Return structured 409 conflicts for duplicate inventory taxonomy and product translation creates.
- Updated dependencies [fd17317]
  - @voyant-travel/hono@0.118.3

## 0.5.11

### Patch Changes

- 5c1294f: Reject inverted inventory product dates, option availability dates, option-unit quantity bounds, and duplicate itinerary day numbers.
- Updated dependencies [5c1294f]
  - @voyant-travel/products-contracts@0.105.17

## 0.5.10

### Patch Changes

- a10b9ba: Return deterministic 503 responses when product brochure generation cannot upload to configured storage or resolve a brochure URL.
- e005c4d: Reject inverted product option-unit age ranges and commerce pricing ranges across schemas and service mutations.
- ad02eae: Reject non-image product media as cover media and surface brochure generation failures in the product detail UI.
- Updated dependencies [ed5463f]
- Updated dependencies [e005c4d]
  - @voyant-travel/operations@0.5.5
  - @voyant-travel/products-contracts@0.105.16
  - @voyant-travel/commerce@0.19.4

## 0.5.9

### Patch Changes

- 61410dd: Preserve catalog sourced-entry provenance when packaged detail pages start the booking journey.
- Updated dependencies [61410dd]
  - @voyant-travel/catalog@0.135.3

## 0.5.8

### Patch Changes

- 98e270c: Add a public-audience listability predicate to the product document builder so deployments can tombstone non-listable customer catalog documents.
- Updated dependencies [d2351e0]
  - @voyant-travel/catalog@0.135.2

## 0.5.7

### Patch Changes

- fcb8b88: Add catalog-authoring validation for transfer pickup/dropoff rules, block static availability for dynamic products, and require scheduled products to have a future open departure before publishing.
- Updated dependencies [fcb8b88]
  - @voyant-travel/operations@0.5.4

## 0.5.6

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storage@0.106.0
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/action-ledger@0.105.9
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/commerce@0.19.1
  - @voyant-travel/operations@0.5.3

## 0.5.5

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/commerce@0.19.0
  - @voyant-travel/action-ledger@0.105.8
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/operations@0.5.2

## 0.5.4

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/commerce@0.18.1
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/operations@0.5.1

## 0.5.3

### Patch Changes

- Updated dependencies [787c852]
- Updated dependencies [293e5e4]
  - @voyant-travel/operations@0.5.0
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/products-contracts@0.105.12
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/commerce@0.18.0

## 0.5.2

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/operations@0.4.0
  - @voyant-travel/db@0.109.1
  - @voyant-travel/products-contracts@0.105.11
  - @voyant-travel/catalog@0.133.0
  - @voyant-travel/commerce@0.17.0

## 0.5.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/action-ledger@0.105.7
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/commerce@0.16.1
  - @voyant-travel/operations@0.3.1

## 0.5.0

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
  - @voyant-travel/commerce@0.16.0
  - @voyant-travel/operations@0.3.0
  - @voyant-travel/action-ledger@0.105.6
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/utils@0.105.4

## 0.4.7

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/action-ledger@0.105.5
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/commerce@0.15.0
  - @voyant-travel/operations@0.2.8
  - @voyant-travel/products-contracts@0.105.10

## 0.4.6

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/products-contracts@0.105.9
  - @voyant-travel/commerce@0.14.0
  - @voyant-travel/operations@0.2.7

## 0.4.5

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/action-ledger@0.105.4
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/commerce@0.13.1
  - @voyant-travel/operations@0.2.6
  - @voyant-travel/db@0.108.5

## 0.4.4

### Patch Changes

- fcd2e0b: Add itinerary and day-service translation authoring surfaces, and localize owned itinerary content projection for translated days and service labels.
- Updated dependencies [fcd2e0b]
  - @voyant-travel/products-contracts@0.105.8

## 0.4.3

### Patch Changes

- @voyant-travel/catalog@0.129.0
- @voyant-travel/commerce@0.13.0
- @voyant-travel/operations@0.2.4

## 0.4.2

### Patch Changes

- @voyant-travel/catalog@0.128.0
- @voyant-travel/commerce@0.12.0
- @voyant-travel/operations@0.2.3

## 0.4.1

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/commerce@0.11.0
  - @voyant-travel/operations@0.2.2

## 0.4.0

### Minor Changes

- 9c47b00: Add a themed product brochure HTML renderer and printer decorator. Brochure
  template context now includes product media and pax pricing tiers so custom
  brochure layouts can render covers, galleries, and pricing tables without
  extra app-local queries, while still replacing the section set for fully custom
  brochure designs. The themed printer requires an HTML-capable browser printer
  and guards against accidental composition with the built-in basic PDF printer.

### Patch Changes

- @voyant-travel/catalog@0.126.0
- @voyant-travel/commerce@0.10.0
- @voyant-travel/operations@0.2.1

## 0.3.9

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/operations@0.2.0
  - @voyant-travel/commerce@0.9.0
  - @voyant-travel/catalog@0.125.0

## 0.3.8

### Patch Changes

- fc678e9: Align public product slug lookups with catalog search locale fallback so exact fallback slugs resolve product details.

## 0.3.7

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
- Updated dependencies [4893352]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/commerce@0.8.1
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/action-ledger@0.105.3
  - @voyant-travel/operations@0.1.7

## 0.3.6

### Patch Changes

- @voyant-travel/commerce@0.8.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/operations@0.1.6

## 0.3.5

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/products-contracts@0.105.6
- @voyant-travel/commerce@0.7.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/operations@0.1.5
- @voyant-travel/hono@0.112.2

## 0.3.4

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/catalog@0.122.0
- @voyant-travel/commerce@0.6.0
- @voyant-travel/operations@0.1.4

## 0.3.3

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/commerce@0.5.0
  - @voyant-travel/action-ledger@0.105.1
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/operations@0.1.3

## 0.3.2

### Patch Changes

- a9dcf89: Fix catalog browse defaults so product projections expose supply models for scheduled/dynamic locks and embedded catalog admins resolve locale from the loaded operator market.
  - @voyant-travel/catalog@0.120.1

## 0.3.1

### Patch Changes

- @voyant-travel/commerce@0.4.0
- @voyant-travel/catalog@0.120.0
- @voyant-travel/operations@0.1.2

## 0.3.0

### Minor Changes

- 13fe70b: The inventory module now owns the product brochure route: new `@voyant-travel/inventory/routes-brochure` export (`createProductBrochureRoutes(options)`) with the object storage provider injected as an option.

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
- Updated dependencies [13fe70b]
  - @voyant-travel/action-ledger@0.105.0
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/commerce@0.3.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/storage@0.105.0
  - @voyant-travel/operations@0.1.1

## 0.2.0

### Minor Changes

- 3cc83b6: Move extras runtime and React source behind Inventory and Bookings owner
  subpaths. The old runtime and React extras package names are removed from v1;
  first-party imports use the Inventory and Bookings owner paths.
- 7ea516a: Move product graph compose/duplicate authoring behind
  `@voyant-travel/inventory/authoring`. `@voyant-travel/catalog-authoring` now delegates to
  the Inventory owner path during the v1 restructure.
- 65b3782: Add optional Inventory package entrypoints for operated product authoring and
  Inventory React authoring UI surfaces.
- a101971: Move the main operated Product route/service/schema/runtime and React
  authoring source under Inventory owner paths. The old Products runtime package
  names are removed from the v1 workspace surface, while the operator keeps
  stable `/products` API URLs backed by Inventory.

### Patch Changes

- 3408b2a: Move availability, allocation UI, resources, ground logistics, and places source
  under Operations owner paths. The old operated-execution package names are
  removed from the v1 workspace surface while first-party runtime, React, and
  operator imports use `@voyant-travel/operations` and `@voyant-travel/operations-react`
  surfaces.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [c9ec9f8]
- Updated dependencies [e388bc9]
- Updated dependencies [6bff46f]
- Updated dependencies [a4e0909]
- Updated dependencies [eb17d3d]
- Updated dependencies [3cc83b6]
- Updated dependencies [3408b2a]
- Updated dependencies [47fef18]
- Updated dependencies [063f2b5]
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/commerce@0.2.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/operations@0.1.0
  - @voyant-travel/extras-contracts@0.104.2
  - @voyant-travel/action-ledger@0.104.11
