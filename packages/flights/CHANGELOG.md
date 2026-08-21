# @voyant-travel/flights

## 0.240.6

### Patch Changes

- Updated dependencies [33cba53]
- Updated dependencies [73a3ca3]
  - @voyant-travel/catalog@0.263.0
  - @voyant-travel/hono@0.145.0
  - @voyant-travel/action-ledger@0.115.22
  - @voyant-travel/finance@0.262.5

## 0.240.5

### Patch Changes

- Updated dependencies [cdad152]
  - @voyant-travel/finance@0.262.0
  - @voyant-travel/catalog@0.262.1

## 0.240.4

### Patch Changes

- Updated dependencies [2f5f676]
  - @voyant-travel/catalog@0.262.0
  - @voyant-travel/finance@0.261.2

## 0.240.3

### Patch Changes

- Updated dependencies [d631aa1]
  - @voyant-travel/catalog-contracts@0.138.0
  - @voyant-travel/catalog@0.261.0
  - @voyant-travel/finance@0.261.0
  - @voyant-travel/flights-contracts@0.106.2

## 0.240.2

### Patch Changes

- Updated dependencies [72c2616]
  - @voyant-travel/finance@0.260.0
  - @voyant-travel/catalog@0.260.1

## 0.240.1

### Patch Changes

- Updated dependencies [c5b12ba]
  - @voyant-travel/catalog-contracts@0.137.0
  - @voyant-travel/catalog@0.260.0
  - @voyant-travel/flights-contracts@0.106.1
  - @voyant-travel/finance@0.259.2

## 0.240.0

### Minor Changes

- 380c46e: Move the parts of the public API layer that have a real domain home (#4627,
  part 1). `createGuestBookingGuard` goes to `@voyant-travel/bookings`, which
  already owns the capability cookie and header it reads. Transport eligibility
  goes to `@voyant-travel/flights`, and its exported symbols drop the `publicApi`
  prefix, which named the layer they sat in rather than what they do.

### Patch Changes

- @voyant-travel/catalog@0.259.3
- @voyant-travel/finance@0.259.1

## 0.239.0

### Minor Changes

- 2ddcb4b: Show flight availability where the traveller chooses it.

  Adds two capability-gated connector methods and the UI that consumes them:

  - `flight/fare-calendar` (`searchFareCalendar`) quotes a window of departure
    dates, so the date picker shows the cheapest indicative price per day, bands
    it cheap / mid / expensive against the visible window, and strikes out days
    the provider doesn't fly. Served as `POST /v1/admin/flights/fare-calendar`,
    capped at a 92-day window.
  - `flight/served-markets` (`listServedMarkets`) declares the airports a
    connection sells, so the airport picker leads with the operator's own
    network. It ranks, it never filters — every airport stays reachable.

  The airport picker also groups by routes this operator has actually searched,
  remembered per browser, and the airport reference list is now deterministically
  ordered instead of returning an arbitrary slice.

  Flight offer rows now name the airline and its flight numbers instead of
  relying on the carrier logo alone.

  `Calendar` and `DatePicker` gain a `dayAnnotation` prop for rendering a
  secondary line under a day's number.

  Connectors that declare neither capability answer 501 and every surface
  degrades to its previous behaviour.

### Patch Changes

- Updated dependencies [2ddcb4b]
  - @voyant-travel/flights-contracts@0.106.0

## 0.238.0

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
  - @voyant-travel/db@0.123.0
  - @voyant-travel/catalog@0.259.0
  - @voyant-travel/finance@0.259.0
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/core@0.144.0
  - @voyant-travel/action-ledger@0.115.21

## 0.237.19

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/catalog-contracts@0.136.0
  - @voyant-travel/catalog@0.258.0
  - @voyant-travel/core@0.143.0
  - @voyant-travel/flights-contracts@0.105.3
  - @voyant-travel/action-ledger@0.115.20
  - @voyant-travel/db@0.122.4
  - @voyant-travel/finance@0.258.1
  - @voyant-travel/hono@0.143.2

## 0.237.18

### Patch Changes

- Updated dependencies [1a903c5]
  - @voyant-travel/catalog-contracts@0.135.0
  - @voyant-travel/catalog@0.257.4
  - @voyant-travel/db@0.122.3
  - @voyant-travel/flights-contracts@0.105.2

## 0.237.17

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/finance@0.258.0
  - @voyant-travel/core@0.142.1
  - @voyant-travel/catalog@0.257.3

## 0.237.16

### Patch Changes

- Updated dependencies [b11c10e]
  - @voyant-travel/finance@0.257.0
  - @voyant-travel/catalog@0.257.2

## 0.237.15

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/finance@0.256.0
  - @voyant-travel/catalog@0.257.1

## 0.237.14

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/catalog@0.257.0

## 0.237.13

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0
  - @voyant-travel/catalog@0.256.7

## 0.237.12

### Patch Changes

- Updated dependencies [798b05b]
- Updated dependencies [05c2202]
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/catalog-contracts@0.134.1
  - @voyant-travel/catalog@0.256.6

## 0.237.11

### Patch Changes

- Updated dependencies [020de35]
- Updated dependencies [c2aedcb]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/catalog@0.256.5
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1

## 0.237.10

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/catalog@0.256.3

## 0.237.9

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/catalog@0.256.2

## 0.237.8

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/catalog@0.256.1

## 0.237.7

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog-contracts@0.134.0
  - @voyant-travel/catalog@0.256.0
  - @voyant-travel/flights-contracts@0.105.1

## 0.237.6

### Patch Changes

- 36f3085: Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
  documents.

  These packages own admin-surface documents only, so every operation reads
  `secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
  per operation is the point — "which credential does this accept" should not be
  something a reader has to infer from a path prefix.

- Updated dependencies [1a3ba50]
- Updated dependencies [c805276]
- Updated dependencies [599ffed]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/catalog@0.255.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/catalog-contracts@0.133.1
  - @voyant-travel/hono@0.143.0

## 0.237.5

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/catalog@0.254.1

## 0.237.4

### Patch Changes

- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/catalog-contracts@0.133.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/flights-contracts@0.105.0
  - @voyant-travel/tools@0.10.3

## 0.237.3

### Patch Changes

- 900c452: Keep production runtime-port startup preflight side-effect free while retaining exhaustive behavioral provider verification for CI and release gates.

## 0.237.2

### Patch Changes

- Updated dependencies [c164b40]
  - @voyant-travel/catalog-contracts@0.132.0
  - @voyant-travel/catalog@0.253.3
  - @voyant-travel/flights-contracts@0.104.32

## 0.237.1

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/catalog@0.253.1

## 0.237.0

### Minor Changes

- 231acfa: Add a closed provider-first flight requote, hold, and idempotent commit lifecycle over exact Storefront offer/connection bindings.
- e363b1b: Expose graph-admitted multi-connection flight shopping to the managed Storefront
  without accepting or returning provider and connection selectors.

### Patch Changes

- 4c2b4ce: Add bound opaque continuations for managed multi-source flight, stay, and package shopping.
- Updated dependencies [b95e995]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog-contracts@0.131.0
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/finance@0.245.7
  - @voyant-travel/flights-contracts@0.104.31

## 0.236.28

### Patch Changes

- Updated dependencies [b3cd1a5]
- Updated dependencies [8ab3f96]
- Updated dependencies [4c218bc]
- Updated dependencies [6b672c0]
- Updated dependencies [03a91d0]
- Updated dependencies [aea1a83]
- Updated dependencies [5cda348]
- Updated dependencies [e04b812]
- Updated dependencies [8688ef1]
- Updated dependencies [3a91bc8]
  - @voyant-travel/action-ledger@0.115.17
  - @voyant-travel/catalog@0.252.3
  - @voyant-travel/tools@0.10.1
  - @voyant-travel/catalog-contracts@0.130.0
  - @voyant-travel/finance@0.245.6
  - @voyant-travel/flights-contracts@0.104.30

## 0.236.27

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog-contracts@0.129.0
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3
  - @voyant-travel/flights-contracts@0.104.29

## 0.236.26

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/catalog@0.251.3

## 0.236.25

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/core@0.140.2

## 0.236.24

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog-contracts@0.128.0
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/finance@0.244.1
  - @voyant-travel/flights-contracts@0.104.28

## 0.236.23

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog-contracts@0.127.0
  - @voyant-travel/catalog@0.250.0
  - @voyant-travel/flights-contracts@0.104.27

## 0.236.22

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/catalog@0.249.1

## 0.236.21

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/db@0.120.6
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1

## 0.236.20

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/catalog@0.248.1

## 0.236.19

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog-contracts@0.126.0
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/flights-contracts@0.104.26

## 0.236.18

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/catalog@0.247.0

## 0.236.17

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/action-ledger@0.115.14

## 0.236.16

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3

## 0.236.15

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog-contracts@0.125.0
  - @voyant-travel/catalog@0.245.0
  - @voyant-travel/flights-contracts@0.104.25

## 0.236.14

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog-contracts@0.124.0
  - @voyant-travel/catalog@0.244.0
  - @voyant-travel/flights-contracts@0.104.24

## 0.236.13

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog-contracts@0.123.0
  - @voyant-travel/catalog@0.243.0
  - @voyant-travel/flights-contracts@0.104.23

## 0.236.12

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog-contracts@0.122.0
  - @voyant-travel/catalog@0.242.0
  - @voyant-travel/flights-contracts@0.104.22

## 0.236.11

### Patch Changes

- Updated dependencies [0976af1]
  - @voyant-travel/catalog-contracts@0.121.0
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/flights-contracts@0.104.21

## 0.236.10

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog-contracts@0.120.0
  - @voyant-travel/catalog@0.240.0
  - @voyant-travel/flights-contracts@0.104.20

## 0.236.9

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog-contracts@0.119.0
  - @voyant-travel/catalog@0.239.0
  - @voyant-travel/flights-contracts@0.104.19

## 0.236.8

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog-contracts@0.118.0
  - @voyant-travel/catalog@0.238.0
  - @voyant-travel/flights-contracts@0.104.18

## 0.236.7

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/catalog@0.237.2

## 0.236.6

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1

## 0.236.5

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/catalog-contracts@0.117.0
  - @voyant-travel/catalog@0.237.0
  - @voyant-travel/flights-contracts@0.104.17

## 0.236.4

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/core@0.137.2

## 0.236.3

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0
  - @voyant-travel/catalog-contracts@0.116.0
  - @voyant-travel/flights-contracts@0.104.16

## 0.236.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/catalog@0.234.2

## 0.236.1

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/finance@0.237.0

## 0.236.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/catalog-contracts@0.115.1
  - @voyant-travel/finance@0.236.0

## 0.235.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/catalog@0.233.0

## 0.234.0

### Patch Changes

- Updated dependencies [051e6e3]
- Updated dependencies [536ebfc]
- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/catalog@0.232.0
  - @voyant-travel/core@0.137.1
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/db@0.119.4

## 0.233.0

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/db@0.119.3

## 0.232.0

### Patch Changes

- Updated dependencies [e93c0a7]
  - @voyant-travel/catalog-contracts@0.115.0
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/flights-contracts@0.104.14
  - @voyant-travel/finance@0.232.0

## 0.231.0

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/finance@0.231.0

## 0.230.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/catalog-contracts@0.114.0
  - @voyant-travel/flights-contracts@0.104.13

## 0.229.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [f25ad34]
- Updated dependencies [2601445]
  - @voyant-travel/catalog@0.227.0
  - @voyant-travel/catalog-contracts@0.113.0
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/flights-contracts@0.104.12

## 0.228.0

### Patch Changes

- @voyant-travel/catalog@0.226.0
- @voyant-travel/finance@0.228.0

## 0.227.0

### Patch Changes

- @voyant-travel/catalog@0.225.0
- @voyant-travel/finance@0.227.0
- @voyant-travel/db@0.119.2

## 0.226.0

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/finance@0.226.0

## 0.225.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.224.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/finance@0.224.0

## 0.223.0

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/finance@0.223.0

## 0.222.0

### Patch Changes

- @voyant-travel/catalog@0.220.0
- @voyant-travel/finance@0.222.0

## 0.221.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/catalog@0.219.1

## 0.221.0

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
  - @voyant-travel/action-ledger@0.115.5
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.220.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/action-ledger@0.115.4
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/catalog@0.218.0

## 0.219.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/finance@0.219.0

## 0.218.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0

## 0.217.0

### Patch Changes

- @voyant-travel/catalog@0.215.0
- @voyant-travel/finance@0.217.0

## 0.216.0

### Patch Changes

- @voyant-travel/catalog@0.214.0
- @voyant-travel/finance@0.216.0

## 0.215.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/catalog@0.213.0

## 0.214.0

### Patch Changes

- @voyant-travel/catalog@0.212.0
- @voyant-travel/finance@0.214.0

## 0.213.0

### Patch Changes

- @voyant-travel/catalog@0.211.0
- @voyant-travel/finance@0.213.0

## 0.212.0

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/finance@0.212.0

## 0.211.0

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/finance@0.211.0

## 0.210.0

### Patch Changes

- @voyant-travel/catalog@0.208.0
- @voyant-travel/finance@0.210.0

## 0.209.0

### Patch Changes

- @voyant-travel/catalog@0.207.0
- @voyant-travel/finance@0.209.0

## 0.208.0

### Patch Changes

- @voyant-travel/catalog@0.206.0
- @voyant-travel/finance@0.208.0

## 0.207.1

### Patch Changes

- edbf937: Declare graph `policy` names on ticket/cancel flight Actions so handler-owned approval mint matches the Tool contract.

## 0.207.0

### Patch Changes

- @voyant-travel/catalog@0.205.0
- @voyant-travel/finance@0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/catalog@0.204.0

## 0.205.0

### Patch Changes

- 113edfc: Activate flight ticketing and cancellation Tools only for a selected, behaviorally conformant durable provider, and route admitted commands through crash-safe provider reconciliation.
- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/catalog@0.203.0

## 0.204.0

### Patch Changes

- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0

## 0.203.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/tools@0.7.0

## 0.202.0

### Patch Changes

- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0

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
  - @voyant-travel/catalog@0.199.1
  - @voyant-travel/finance@0.201.1

## 0.201.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0

## 0.200.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5

## 0.199.0

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4

## 0.198.1

### Patch Changes

- @voyant-travel/catalog@0.196.1
- @voyant-travel/finance@0.198.1

## 0.198.0

### Patch Changes

- @voyant-travel/catalog@0.196.0
- @voyant-travel/finance@0.198.0

## 0.197.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.196.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.195.0

### Patch Changes

- @voyant-travel/catalog@0.193.0
- @voyant-travel/finance@0.195.0

## 0.194.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/finance@0.194.0

## 0.193.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/catalog-contracts@0.112.1
  - @voyant-travel/finance@0.193.0

## 0.192.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1

## 0.192.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/catalog@0.190.0

## 0.191.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0

## 0.190.0

### Patch Changes

- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0

## 0.189.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/catalog-contracts@0.112.0
  - @voyant-travel/flights-contracts@0.104.11
  - @voyant-travel/finance@0.189.0

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/finance@0.188.0

## 0.187.0

### Patch Changes

- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0

## 0.186.0

### Patch Changes

- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0

## 0.185.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0

## 0.184.0

### Patch Changes

- @voyant-travel/catalog@0.182.0
- @voyant-travel/finance@0.184.0

## 0.183.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/catalog@0.181.0

## 0.182.2

### Patch Changes

- @voyant-travel/catalog@0.180.2
- @voyant-travel/finance@0.182.4

## 0.182.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/finance@0.182.3

## 0.182.0

### Patch Changes

- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/catalog@0.179.0

## 0.180.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/db@0.117.1
- @voyant-travel/catalog@0.178.1

## 0.180.0

### Patch Changes

- @voyant-travel/catalog@0.178.0
- @voyant-travel/finance@0.180.0

## 0.179.0

### Patch Changes

- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0

## 0.178.0

### Patch Changes

- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0

## 0.177.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2

## 0.176.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1

## 0.175.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/finance@0.175.0

## 0.174.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.173.0

### Patch Changes

- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/db@0.114.14

## 0.171.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/finance@0.171.1

## 0.171.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6

## 0.169.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4

## 0.169.0

### Patch Changes

- Updated dependencies [590d256]
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/catalog@0.167.0

## 0.168.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/catalog@0.166.0

## 0.167.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/catalog@0.165.0

## 0.166.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/catalog@0.164.0

## 0.165.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/catalog@0.163.0

## 0.164.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/finance@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1

## 0.162.1

### Patch Changes

- @voyant-travel/catalog@0.160.1
- @voyant-travel/finance@0.162.2

## 0.162.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/db@0.114.8

## 0.161.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/catalog@0.159.0

## 0.160.0

### Minor Changes

- 0079873: Add guarded MCP Tools for flight search, pricing, order reads, ticketing, and cancellation.

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
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
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1

## 0.159.0

### Patch Changes

- b459761: Keep the externally maintained Netopia provider out of the default public dependency tree so
  framework consumers can install the standard package graph with npm.
- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/catalog-contracts@0.111.1
  - @voyant-travel/finance@0.159.0
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
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0

## 0.157.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog-contracts@0.111.0
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/flights-contracts@0.104.10
  - @voyant-travel/finance@0.157.0

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/catalog-contracts@0.110.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/flights-contracts@0.104.9
  - @voyant-travel/hono@0.126.3

## 0.156.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/catalog-contracts@0.110.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/flights-contracts@0.104.8
  - @voyant-travel/db@0.114.3

## 0.155.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/catalog@0.153.1

## 0.155.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/catalog@0.152.0

## 0.153.0

### Minor Changes

- 490d132: Move standard Node runtime construction for Flights, Notifications, and Quotes proposal wiring into their domain packages.
- c65b05c: Own the curated airline, airport, and aircraft reference fixture behind the supported `@voyant-travel/flights/reference/fixtures` API.
- 490d132: Publish package-owned OpenAPI registries and selected-graph documents for accommodation content, Flights, and public quote proposal APIs.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Derive travel runtime port bindings from deployment host capabilities.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- Updated dependencies [047c3f9]
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
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/hono@0.125.1

## 0.152.0

### Minor Changes

- d771be3: Move Flights graph runtime assembly behind package-owned typed ports so Node hosts provide connector and card-payment implementations without package-id bindings.

### Patch Changes

- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/db@0.112.2

## 0.151.4

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1

## 0.151.3

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/catalog@0.149.3

## 0.151.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2

## 0.151.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/db@0.111.1

## 0.151.0

### Minor Changes

- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- a370024: Publish package-owned deployment manifests for the travel modules.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- a370024: Correct package-owned API mounts and runtime references for distribution, MICE,
  workflow runs, and flights deployment manifests.
- Updated dependencies [a370024]
- Updated dependencies [a370024]
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
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/hono@0.122.4

## 0.150.0

### Patch Changes

- @voyant-travel/catalog@0.148.0
- @voyant-travel/db@0.110.2
- @voyant-travel/hono@0.122.3

## 0.149.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/hono@0.122.2

## 0.149.0

### Patch Changes

- @voyant-travel/catalog@0.147.0

## 0.148.0

### Patch Changes

- @voyant-travel/catalog@0.146.0

## 0.147.0

### Patch Changes

- @voyant-travel/catalog@0.145.0

## 0.146.0

### Patch Changes

- @voyant-travel/catalog@0.144.0

## 0.145.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/catalog-contracts@0.109.0
  - @voyant-travel/flights-contracts@0.104.7

## 0.144.0

### Patch Changes

- @voyant-travel/catalog@0.142.0

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/catalog@0.141.0

## 0.142.0

### Patch Changes

- 5028f42: Support package-owned flights admin routes in source-free managed runtime wiring.
  - @voyant-travel/catalog@0.140.0

## 0.141.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0

## 0.140.0

### Minor Changes

- 62e87ee: Surface flight orders (bookings/tickets). Adds a Flights → Orders list page (`FlightOrdersPage`) and an order detail route on the packaged flights admin, so a held order — carrying a ticketing deadline — no longer disappears after the confirmation screen. Operators can review orders, filter by status/search, and from the detail view issue tickets (before the deadline) or cancel. Adds a `useFlightOrderTicket` hook and a capability-gated `POST /orders/:orderId/ticket` route to the flights module. The operator admin sidebar now expands Flights into **Search** and **Orders** sub-items (`admin` nav + `i18n` `flightsSearch` label; `flightOrders` label already existed).

### Patch Changes

- @voyant-travel/catalog@0.138.0

## 0.139.0

### Patch Changes

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/db@0.109.5

## 0.138.2

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/catalog@0.136.3

## 0.138.1

### Patch Changes

- Updated dependencies [86fbb05]
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2

## 0.138.0

### Patch Changes

- @voyant-travel/catalog@0.136.0

## 0.137.6

### Patch Changes

- Updated dependencies [fd17317]
  - @voyant-travel/hono@0.118.3

## 0.137.5

## 0.137.4

## 0.137.3

### Patch Changes

- 49ffcd9: Return setup-specific 503 responses when the configured flight demo service is unavailable, and show that message in Trips flight search.

## 0.137.2

### Patch Changes

- 5c53561: Return 404 instead of 500 when flight order read or cancel adapters report `order_not_found`.
- 2427218: Create flight order payment sessions for bank-transfer booking intents.
- 7850b66: Keep flight order reads side-effect free for payment sessions so card-ticketed orders do not create hosted-checkout sessions after booking.
- bddb539: Keep flight order read endpoints side-effect-free by attaching existing payment session summaries without creating sessions or starting card payment.
- Updated dependencies [2427218]
  - @voyant-travel/flights-contracts@0.104.6

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/catalog@0.135.1

## 0.137.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/catalog@0.135.0

## 0.136.1

### Patch Changes

- @voyant-travel/catalog@0.134.1

## 0.136.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/catalog@0.134.0

## 0.135.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/catalog@0.133.0

## 0.134.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/catalog@0.132.1

## 0.134.0

### Patch Changes

- Updated dependencies [04b257c]
- Updated dependencies [78c15fa]
  - @voyant-travel/hono@0.115.0
  - @voyant-travel/catalog@0.132.0

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0

## 0.132.0

### Minor Changes

- 6a0edd2: Add the live availability-search primitive (dynamic-packaging RFC, voyant#2081 / voyant#1600) — keystone gap 1.

  - **`@voyant-travel/catalog-contracts`** — new `supportsAvailabilitySearch` capability flag, the `AvailabilitySearchRequest` / `AvailabilityCandidate` / `AvailabilitySearchResult` shapes, and a capability-gated `searchAvailability` method on the `SourceAdapter` contract. `searchAvailability` searches an inventory space (destination + dates + pax → ranked candidates), as opposed to `liveResolve` which resolves volatile fields for an already-selected entity. Internal economics (net/margin/supplier ref) live under `AvailabilityCandidate.providerData` and must never appear in public DTOs.
  - **`@voyant-travel/catalog`** — `fanOutAvailabilitySearch`, the vertical-agnostic counterpart of the flights fan-out: parallelizes `searchAvailability` across sourced connections and owned search handlers with a per-source timeout, partial-success status map, and a price-ranked merge. Adds an owned-availability-search-handler registry (`createOwnedAvailabilitySearchHandlerRegistry`) so owned inventory is a first-class search source alongside sourced adapters, mirroring the owned-booking-handler vs source-adapter split.
  - **`@voyant-travel/flights`** — `mergedFlightOfferToCandidate` / `mergedFlightOffersToCandidates` bridge mapping the flights-native `MergedFlightOffer` onto the normalized `AvailabilityCandidate`. A mapping, not a re-implementation — flights keep their own connector contract and fan-out.

  Additive only; no behavioral change to existing adapters (the new method and capability are optional). Follow-ups on voyant#2081: a concrete accommodations owned-search handler and the Voyant Connect `searchAvailability` implementation.

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog-contracts@0.108.0
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/flights-contracts@0.104.5

## 0.131.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/db@0.108.5

## 0.131.0

### Patch Changes

- @voyant-travel/catalog@0.129.0

## 0.130.0

### Patch Changes

- @voyant-travel/catalog@0.128.0

## 0.129.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0

## 0.128.0

### Patch Changes

- @voyant-travel/catalog@0.126.0

## 0.127.0

### Patch Changes

- c143531: D.2: onboard package-owned migrations for `flights` and `catalog-authoring`.

  Both packages own tables that the retired framework bundle materialised but had
  no per-package migration source — `flights` owns the `reference_airlines` /
  `reference_airports` / `reference_aircraft` reference tables, and
  `catalog-authoring` owns `product_authoring_requests` (via its re-export of the
  inventory authoring schema). Without their own migration folders a fresh D.2
  database would silently miss these tables.

  Each now ships a generated `migrations/` folder (baseline) and a `db:generate`
  script, and is published in the package tarball. The D.2 union verifier gained a
  **reverse-coverage** gate so an un-onboarded owner can never slip through again:
  every bundle table must be claimed by some package source.

  - @voyant-travel/catalog@0.125.0

## 0.126.0

### Patch Changes

- @voyant-travel/catalog@0.124.0

## 0.125.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/catalog@0.123.0
- @voyant-travel/hono@0.112.2

## 0.124.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/catalog@0.122.0

## 0.123.0

### Patch Changes

- Updated dependencies [a3bd51c]
- Updated dependencies [d222e9f]
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2

## 0.122.0

### Minor Changes

- 14f4234: New `createFlightOrderPaymentIntegration(deps)` (from `@voyant-travel/flights` and `./payment-integration`) — maps a flight order to payment-session params + card billing and returns a `FlightPaymentIntegration`. The generic session service and the card provider are injected structurally (no finance/provider dependency in flights), so the deployment supplies only its provider choices.

### Patch Changes

- @voyant-travel/catalog@0.120.0

## 0.121.0

### Minor Changes

- d44c0ae: The flights module now owns its admin HTTP routes. New exports from
  `@voyant-travel/flights` (and `@voyant-travel/flights/hono`):
  `createFlightsHonoModule(options)` / `createFlightAdminRoutes(options)`, plus
  `FlightsHonoModuleOptions`, `FlightPaymentIntegration`, and
  `FlightOrderPaymentSummary`. The deployment supplies the connector adapter
  (`resolveAdapter`) and an optional payment integration; the route
  implementations (search, ancillaries, seatmap, price, book, orders, reference)
  no longer live in the deployment.

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/hono@0.111.0

## 0.120.1

### Patch Changes

- @voyant-travel/catalog@0.118.1

## 0.120.0

### Patch Changes

- Updated dependencies [c9ec9f8]
  - @voyant-travel/catalog@0.118.0

## 0.119.2

### Patch Changes

- Updated dependencies [bd74fb0]
  - @voyant-travel/catalog@0.117.2

## 0.119.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/catalog@0.117.1

## 0.119.0

### Patch Changes

- @voyant-travel/catalog@0.117.0

## 0.118.0

### Patch Changes

- @voyant-travel/catalog@0.116.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/db@0.107.0
  - @voyant-travel/catalog@0.115.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/db@0.106.0

## 0.116.0

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/db@0.105.0
  - @voyant-travel/catalog@0.114.0

## 0.115.0

### Patch Changes

- @voyant-travel/catalog@0.113.0

## 0.114.0

### Patch Changes

- @voyant-travel/catalog@0.112.0

## 0.113.0

### Patch Changes

- @voyant-travel/catalog@0.111.0

## 0.112.0

### Patch Changes

- @voyant-travel/catalog@0.110.0

## 0.111.0

### Patch Changes

- @voyant-travel/catalog@0.109.0

## 0.110.0

### Patch Changes

- @voyant-travel/catalog@0.108.0
- @voyant-travel/db@0.104.4

## 0.109.0

### Patch Changes

- @voyant-travel/catalog@0.107.0

## 0.108.0

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0
  - @voyant-travel/flights-contracts@0.104.3

## 0.107.0

### Patch Changes

- c2aef18: Manifest-driven migration schema resolution (#1608).

  - `@voyant-travel/core` `VoyantConfig` gains `additionalSchemas`, `extensions`, and `schemas` fields (with validation) so a template's migrated schema set is derived from `voyant.config.ts`.
  - `catalog`, `flights`, `travel-composer`, and `workflow-runs` declare `package.json#voyant` schema metadata so they resolve into the generated schema manifest (flights pins its non-standard `./reference/local-postgres` subpath).

- Updated dependencies [c2aef18]
  - @voyant-travel/catalog@0.105.0
  - @voyant-travel/db@0.104.3

## 0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/catalog@0.104.4
- @voyant-travel/flights-contracts@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/catalog@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/flights-contracts@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/catalog@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/flights-contracts@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/catalog@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/flights-contracts@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/catalog@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/flights-contracts@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/catalog@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/flights-contracts@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/catalog@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/flights-contracts@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/catalog@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/flights-contracts@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/catalog@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/flights-contracts@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [c893886]
  - @voyant-travel/catalog@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/flights-contracts@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/catalog@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/flights-contracts@0.98.0

## 0.97.0

### Minor Changes

- 2555264: Extract two more contract surfaces into lightweight packages, closing the
  remaining gaps in the `*-contracts` pattern (ADR-0002 / ADR-0003).

  `@voyant-travel/flights-contracts` (new, zod-only) now owns the pure flight
  `SourceAdapter` contract, request/response schemas, post-book types, and the
  reference-data shapes (`contract/{types,adapter,schemas,post-book-types}`,
  `reference/{contract,static-bundle}`), so flight-provider adapter authors and
  external consumers can integrate without the flights runtime (Drizzle/DB).

  `@voyant-travel/catalog-contracts` gains the pure booking-engine contracts —
  `booking-engine/contracts` (the `BookingDraft` + V1 engine schemas) and
  `booking-engine/promotions-contract` — which were previously trapped in the
  catalog runtime.

  The runtime `@voyant-travel/flights` and `@voyant-travel/catalog` packages re-export from
  the contract packages, so existing `@voyant-travel/flights/contract/*`,
  `@voyant-travel/flights/reference/*`, and `@voyant-travel/catalog/booking-engine/*` import
  paths are unchanged.

  Note: `@voyant-travel/flights`' `snapshot.ts` stays in the runtime for now — it
  depends on catalog's `CaptureSnapshotInput` / `PricingBasis`, which still live in
  catalog runtime files (`services/snapshot-service.ts`, `snapshot/schema.ts`).
  Carving those pure shapes into `catalog-contracts` (which would let the flight
  snapshot move too) is a tracked follow-up.

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/flights-contracts@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [2d8d59b]
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/db@0.96.0

## 0.95.0

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/db@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/catalog@0.94.0
- @voyant-travel/db@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/catalog@0.93.0
- @voyant-travel/db@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/db@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/catalog@0.91.0
  - @voyant-travel/db@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/catalog@0.90.0
- @voyant-travel/db@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/catalog@0.89.0
- @voyant-travel/db@0.89.0

## 0.88.0

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/db@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/catalog@0.87.1
- @voyant-travel/db@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/db@0.87.0

## 0.86.0

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/db@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/catalog@0.85.4
- @voyant-travel/db@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/catalog@0.85.3
- @voyant-travel/db@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/catalog@0.85.2
- @voyant-travel/db@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/catalog@0.85.1
- @voyant-travel/db@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/catalog@0.85.0
- @voyant-travel/db@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/catalog@0.84.4
- @voyant-travel/db@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/catalog@0.84.3
- @voyant-travel/db@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/catalog@0.84.2
- @voyant-travel/db@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/catalog@0.84.1
  - @voyant-travel/db@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/catalog@0.84.0
  - @voyant-travel/db@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/catalog@0.83.1
- @voyant-travel/db@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/catalog@0.83.0
- @voyant-travel/db@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/catalog@0.82.1
- @voyant-travel/db@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/catalog@0.82.0
- @voyant-travel/db@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/catalog@0.81.21
- @voyant-travel/db@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/catalog@0.81.20
- @voyant-travel/db@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/catalog@0.81.19
- @voyant-travel/db@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/catalog@0.81.18
- @voyant-travel/db@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/catalog@0.81.17
- @voyant-travel/db@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/db@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/catalog@0.81.15
- @voyant-travel/db@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/catalog@0.81.14
- @voyant-travel/db@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/catalog@0.81.13
- @voyant-travel/db@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/catalog@0.81.12
- @voyant-travel/db@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/catalog@0.81.11
- @voyant-travel/db@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/catalog@0.81.10
- @voyant-travel/db@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/catalog@0.81.9
- @voyant-travel/db@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/catalog@0.81.8
- @voyant-travel/db@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/catalog@0.81.7
- @voyant-travel/db@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/catalog@0.81.6
- @voyant-travel/db@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/catalog@0.81.5
- @voyant-travel/db@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/catalog@0.81.4
- @voyant-travel/db@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/catalog@0.81.3
- @voyant-travel/db@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/catalog@0.81.2
- @voyant-travel/db@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/catalog@0.81.1
- @voyant-travel/db@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/catalog@0.81.0
- @voyant-travel/db@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/catalog@0.80.18
- @voyant-travel/db@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/catalog@0.80.17
- @voyant-travel/db@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/catalog@0.80.16
- @voyant-travel/db@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/catalog@0.80.15
- @voyant-travel/db@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/catalog@0.80.14
- @voyant-travel/db@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/catalog@0.80.13
- @voyant-travel/db@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/catalog@0.80.12
- @voyant-travel/db@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/catalog@0.80.11
- @voyant-travel/db@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/catalog@0.80.10
- @voyant-travel/db@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/catalog@0.80.9
- @voyant-travel/db@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/catalog@0.80.8
- @voyant-travel/db@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/catalog@0.80.7
- @voyant-travel/db@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/catalog@0.80.6
- @voyant-travel/db@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/catalog@0.80.5
- @voyant-travel/db@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/catalog@0.80.4
- @voyant-travel/db@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/catalog@0.80.3
- @voyant-travel/db@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/catalog@0.80.2
- @voyant-travel/db@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/catalog@0.80.1
- @voyant-travel/db@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/catalog@0.80.0
- @voyant-travel/db@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/catalog@0.79.0
- @voyant-travel/db@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/catalog@0.78.0
- @voyant-travel/db@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/catalog@0.77.13
- @voyant-travel/db@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/catalog@0.77.12
- @voyant-travel/db@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/catalog@0.77.11
- @voyant-travel/db@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/catalog@0.77.10
- @voyant-travel/db@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/catalog@0.77.9
- @voyant-travel/db@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/catalog@0.77.8
- @voyant-travel/db@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/catalog@0.77.7
- @voyant-travel/db@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/catalog@0.77.6
- @voyant-travel/db@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/catalog@0.77.5
- @voyant-travel/db@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/catalog@0.77.4
- @voyant-travel/db@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/catalog@0.77.3
- @voyant-travel/db@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/catalog@0.77.2
- @voyant-travel/db@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/catalog@0.77.1
- @voyant-travel/db@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/catalog@0.77.0
- @voyant-travel/db@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/catalog@0.76.0
- @voyant-travel/db@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/catalog@0.75.7
- @voyant-travel/db@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/catalog@0.75.6
- @voyant-travel/db@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/catalog@0.75.5
- @voyant-travel/db@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/catalog@0.75.4
- @voyant-travel/db@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/catalog@0.75.3
- @voyant-travel/db@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/catalog@0.75.2
- @voyant-travel/db@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/catalog@0.75.1
- @voyant-travel/db@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/catalog@0.75.0
- @voyant-travel/db@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/catalog@0.74.2
- @voyant-travel/db@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/catalog@0.74.1
- @voyant-travel/db@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/catalog@0.74.0
- @voyant-travel/db@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/catalog@0.73.1
- @voyant-travel/db@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/catalog@0.73.0
- @voyant-travel/db@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/catalog@0.72.0
- @voyant-travel/db@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/catalog@0.71.0
- @voyant-travel/db@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/catalog@0.70.0
- @voyant-travel/db@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/catalog@0.69.1
- @voyant-travel/db@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/catalog@0.69.0
- @voyant-travel/db@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/catalog@0.68.0
- @voyant-travel/db@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/catalog@0.67.0
- @voyant-travel/db@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/catalog@0.66.6
- @voyant-travel/db@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/catalog@0.66.5
- @voyant-travel/db@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/catalog@0.66.4
- @voyant-travel/db@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/catalog@0.66.3
- @voyant-travel/db@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/catalog@0.66.2
- @voyant-travel/db@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/catalog@0.66.1
- @voyant-travel/db@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/catalog@0.66.0
- @voyant-travel/db@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/catalog@0.65.0
- @voyant-travel/db@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/catalog@0.64.1
- @voyant-travel/db@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/catalog@0.64.0
  - @voyant-travel/db@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/catalog@0.63.1
- @voyant-travel/db@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/catalog@0.63.0
- @voyant-travel/db@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/catalog@0.62.3
- @voyant-travel/db@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/catalog@0.62.2
- @voyant-travel/db@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/catalog@0.62.1
- @voyant-travel/db@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/catalog@0.62.0
  - @voyant-travel/db@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/catalog@0.61.0
- @voyant-travel/db@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/catalog@0.60.0
- @voyant-travel/db@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/db@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/db@0.58.0

## 0.57.0

### Minor Changes

- 0829145: Add zod runtime schemas for the public flight connector contract, including requests, responses, enums, value objects, adapter context, and capability declarations.

### Patch Changes

- @voyant-travel/catalog@0.57.0
- @voyant-travel/db@0.57.0

## 0.56.0

### Minor Changes

- fe403fc: Complete the flight connector contract with optional capability-gated methods for post-book seat selection, check-in, exchange, refund, void, and SSR operations. Extend adapter context with optional request, idempotency, logger, abort signal, and environment fields.

### Patch Changes

- @voyant-travel/catalog@0.56.0
- @voyant-travel/db@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/db@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/catalog@0.55.0
- @voyant-travel/db@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/catalog@0.54.0
- @voyant-travel/db@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/catalog@0.53.2
- @voyant-travel/db@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/catalog@0.53.1
- @voyant-travel/db@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/catalog@0.53.0
- @voyant-travel/db@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/catalog@0.52.4
- @voyant-travel/db@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/catalog@0.52.3
  - @voyant-travel/db@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/catalog@0.52.2
- @voyant-travel/db@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/catalog@0.52.1
- @voyant-travel/db@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/catalog@0.52.0
- @voyant-travel/db@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/catalog@0.51.1
- @voyant-travel/db@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/catalog@0.51.0
- @voyant-travel/db@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/catalog@0.50.8
- @voyant-travel/db@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/catalog@0.50.7
- @voyant-travel/db@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/catalog@0.50.6
- @voyant-travel/db@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/catalog@0.50.5
- @voyant-travel/db@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/catalog@0.50.4
- @voyant-travel/db@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/catalog@0.50.3
- @voyant-travel/db@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/catalog@0.50.2
- @voyant-travel/db@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/catalog@0.50.1
- @voyant-travel/db@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/catalog@0.50.0
- @voyant-travel/db@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/catalog@0.49.0
- @voyant-travel/db@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/catalog@0.48.0
- @voyant-travel/db@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/catalog@0.47.0
- @voyant-travel/db@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/catalog@0.46.0
- @voyant-travel/db@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/catalog@0.45.0
- @voyant-travel/db@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/catalog@0.44.0
- @voyant-travel/db@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/catalog@0.43.0
- @voyant-travel/db@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/catalog@0.42.0
- @voyant-travel/db@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/catalog@0.41.3
- @voyant-travel/db@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/catalog@0.41.2
- @voyant-travel/db@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/catalog@0.41.1
- @voyant-travel/db@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/catalog@0.41.0
- @voyant-travel/db@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/catalog@0.40.1
- @voyant-travel/db@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/catalog@0.40.0
- @voyant-travel/db@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/catalog@0.39.0
- @voyant-travel/db@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/catalog@0.38.2
- @voyant-travel/db@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/catalog@0.38.1
- @voyant-travel/db@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/catalog@0.38.0
- @voyant-travel/db@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/catalog@0.37.1
- @voyant-travel/db@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/catalog@0.37.0
- @voyant-travel/db@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/catalog@0.36.0
- @voyant-travel/db@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/catalog@0.35.0
- @voyant-travel/db@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/catalog@0.34.0
- @voyant-travel/db@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/catalog@0.33.1
- @voyant-travel/db@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/catalog@0.33.0
- @voyant-travel/db@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/catalog@0.32.3
- @voyant-travel/db@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/catalog@0.32.2
- @voyant-travel/db@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/catalog@0.32.1
- @voyant-travel/db@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/catalog@0.32.0
- @voyant-travel/db@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/catalog@0.31.4
- @voyant-travel/db@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/catalog@0.31.3
  - @voyant-travel/db@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/catalog@0.31.2
- @voyant-travel/db@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/catalog@0.31.1
- @voyant-travel/db@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/catalog@0.31.0
- @voyant-travel/db@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/catalog@0.30.7
- @voyant-travel/db@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/catalog@0.30.6
  - @voyant-travel/db@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/catalog@0.30.5
- @voyant-travel/db@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/catalog@0.30.4
- @voyant-travel/db@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/catalog@0.30.3
- @voyant-travel/db@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/catalog@0.30.2
- @voyant-travel/db@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/catalog@0.30.1
- @voyant-travel/db@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/catalog@0.30.0
- @voyant-travel/db@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/catalog@0.29.0
  - @voyant-travel/db@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/catalog@0.28.3
- @voyant-travel/db@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/catalog@0.28.2
- @voyant-travel/db@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/catalog@0.28.1
- @voyant-travel/db@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/catalog@0.28.0
- @voyant-travel/db@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/catalog@0.27.0
- @voyant-travel/db@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/catalog@0.26.9
- @voyant-travel/db@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/catalog@0.26.8
- @voyant-travel/db@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/catalog@0.26.7
- @voyant-travel/db@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/catalog@0.26.6
- @voyant-travel/db@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/catalog@0.26.5
  - @voyant-travel/db@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/catalog@0.26.4
  - @voyant-travel/db@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/catalog@0.26.3
  - @voyant-travel/db@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/catalog@0.26.2
  - @voyant-travel/db@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/catalog@0.26.1
  - @voyant-travel/db@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/catalog@0.26.0
- @voyant-travel/db@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/catalog@0.25.0
- @voyant-travel/db@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/catalog@0.24.3
- @voyant-travel/db@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [bec0471]
  - @voyant-travel/catalog@0.24.2
  - @voyant-travel/db@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [2d6297d]
  - @voyant-travel/catalog@0.24.1
  - @voyant-travel/db@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/catalog@0.24.0
- @voyant-travel/db@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/catalog@0.23.0
- @voyant-travel/db@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/catalog@0.22.0
- @voyant-travel/db@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/catalog@0.21.1
- @voyant-travel/db@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/catalog@0.21.0
  - @voyant-travel/db@0.21.0

## 0.20.0

### Minor Changes

- cc3eddd: **Demo flight adapter is now a standalone HTTP service with its own DB; flight orders get a list page, payment status badges, and search/filter/sort.**

  The previous demo adapter lived inside the operator template, used an in-memory `Map` for "persistence" (orders vanished on every restart), and bled fake tables into the template's primary Postgres. None of that scales to "show me my bookings". This release extracts the demo into a proper standalone provider so the operator template no longer pretends a demo is real.

  - **New runnable** `apps/flights-demo-api` (Node + Hono + drizzle + postgres) — own database, own migrations, own `docker-compose.yml`. Mirrors the `FlightConnectorAdapter` 1:1 over REST: `POST /search`, `POST /price`, `POST /book`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /ancillaries`, `POST /seatmap`, `GET /health`. Fails fast at startup if its Postgres is unreachable. Set `FLIGHTS_DEMO_DATABASE_URL` (preferred over the shared `DATABASE_URL` so the demo can never silently inherit the operator's DB).
  - **Booking** is no longer "idempotent" via deterministic order id — `synthesizeOrder` now seeds with the offer hash + `Date.now()` + a random nonce so every `bookFlight` call mints a unique PNR, matching real GDS behaviour. Same offer + same passengers → distinct order rows.
  - **Contract: `FlightConnectorAdapter.listOrders?(ctx, query)`** is a new optional method (`flight/list-orders` capability), with `FlightOrdersListQuery` and `FlightOrdersListResponse` types. Adapters that own a persistent store (the demo, real travel-tech connectors with agency-side APIs) implement it; pass-through GDS connectors simply omit it. `FlightAdapterContext.deps` is a new optional escape hatch for adapter-specific runtime handles (DB, FX clients, etc.) — real connectors ignore it.
  - **`useFlightOrders(filters?)`** hook in `@voyant-travel/flights-react` with `cursor` / `limit` / `search` / `status` / `paymentStatus` filters, plus the `FlightOrdersListResponseDto` schema and the new `FlightOrderPaymentStatus` enum.
  - **Operator template** gets `/flights/orders` route, sidebar "Orders" sub-item under Flights (en + ro i18n), payment status badge on the booking confirmation page, and the orders list now includes Booking + Payment status columns, search debounced 250ms, two filter dropdowns (booking status + payment status — operator-side filter against the bulk-fetched session map, no N+1), and toggle-direction sort headers on Order/Total.
  - **Webhook + redirect plumbing**: the operator template adds the Netopia callback path (`/v1/finance/providers/netopia/callback`) to `publicPaths`, sets `vite.config.ts` `server.allowedHosts: true` (Cloudflare-tunnel friendly for dev webhook delivery), and ships a `/pay` resolver route + `POST /v1/public/payment-link/resolve?ref=` + `POST /v1/public/payment-link/:sessionId/retry` + `POST /v1/public/payment-link/:sessionId/start-card` so any orderID/clientReference echoed back by Netopia resolves to the canonical session id, lazy-starts the card path on demand, and supports retrying after a failed payment by minting a fresh session.

  Migration: drop the `demo_flight_orders` table from the operator DB; migration `0006_common_vance_astro` handles this idempotently for templates following the operator one.

### Patch Changes

- @voyant-travel/catalog@0.20.0
- @voyant-travel/db@0.20.0
