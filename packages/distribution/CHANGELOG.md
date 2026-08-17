# @voyant-travel/distribution

## 0.229.6

### Patch Changes

- Updated dependencies [2f5f676]
  - @voyant-travel/bookings@0.250.0
  - @voyant-travel/catalog@0.262.0
  - @voyant-travel/finance@0.261.2

## 0.229.5

### Patch Changes

- Updated dependencies [98058d1]
- Updated dependencies [d6c0645]
  - @voyant-travel/catalog@0.261.1
  - @voyant-travel/finance@0.261.1
  - @voyant-travel/identity@0.237.0

## 0.229.4

### Patch Changes

- Updated dependencies [d631aa1]
  - @voyant-travel/catalog@0.261.0
  - @voyant-travel/finance@0.261.0

## 0.229.3

### Patch Changes

- Updated dependencies [72c2616]
  - @voyant-travel/finance@0.260.0
  - @voyant-travel/catalog@0.260.1

## 0.229.2

### Patch Changes

- Updated dependencies [c5b12ba]
  - @voyant-travel/catalog@0.260.0
  - @voyant-travel/bookings@0.249.0
  - @voyant-travel/schema-kit@0.119.1
  - @voyant-travel/finance@0.259.2

## 0.229.1

### Patch Changes

- Updated dependencies [380c46e]
  - @voyant-travel/bookings@0.248.0
  - @voyant-travel/catalog@0.259.3
  - @voyant-travel/finance@0.259.1

## 0.229.0

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
  - @voyant-travel/schema-kit@0.119.0
  - @voyant-travel/bookings@0.247.0
  - @voyant-travel/catalog@0.259.0
  - @voyant-travel/finance@0.259.0
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/core@0.144.0
  - @voyant-travel/action-ledger@0.115.21
  - @voyant-travel/identity@0.236.11
  - @voyant-travel/types@0.110.1
  - @voyant-travel/webhook-delivery@0.6.5
  - @voyant-travel/suppliers-contracts@0.104.20

## 0.228.13

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/catalog@0.258.0
  - @voyant-travel/core@0.143.0
  - @voyant-travel/action-ledger@0.115.20
  - @voyant-travel/bookings@0.246.3
  - @voyant-travel/db@0.122.4
  - @voyant-travel/finance@0.258.1
  - @voyant-travel/hono@0.143.2
  - @voyant-travel/identity@0.236.10
  - @voyant-travel/webhook-delivery@0.6.4

## 0.228.12

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/finance@0.258.0
  - @voyant-travel/bookings@0.246.2
  - @voyant-travel/core@0.142.1
  - @voyant-travel/catalog@0.257.3

## 0.228.11

### Patch Changes

- Updated dependencies [b11c10e]
  - @voyant-travel/finance@0.257.0
  - @voyant-travel/bookings@0.246.1
  - @voyant-travel/catalog@0.257.2

## 0.228.10

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/bookings@0.246.0
  - @voyant-travel/finance@0.256.0
  - @voyant-travel/catalog@0.257.1

## 0.228.9

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/catalog@0.257.0

## 0.228.8

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0
  - @voyant-travel/catalog@0.256.7

## 0.228.7

### Patch Changes

- Updated dependencies [798b05b]
- Updated dependencies [05c2202]
  - @voyant-travel/bookings@0.245.0
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/catalog@0.256.6

## 0.228.6

### Patch Changes

- Updated dependencies [020de35]
- Updated dependencies [c2aedcb]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/bookings@0.244.1
  - @voyant-travel/catalog@0.256.5
  - @voyant-travel/db@0.122.2
  - @voyant-travel/hono@0.143.1
  - @voyant-travel/identity@0.236.9
  - @voyant-travel/webhook-delivery@0.6.3

## 0.228.5

### Patch Changes

- Updated dependencies [8e2133e]
  - @voyant-travel/bookings@0.244.0
  - @voyant-travel/catalog@0.256.4
  - @voyant-travel/finance@0.252.1

## 0.228.4

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/bookings@0.243.1
  - @voyant-travel/catalog@0.256.3

## 0.228.3

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/bookings@0.243.0
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/catalog@0.256.2

## 0.228.2

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/catalog@0.256.1

## 0.228.1

### Patch Changes

- Updated dependencies [a41a73a]
  - @voyant-travel/catalog@0.256.0

## 0.228.0

### Minor Changes

- 1f4e14c: Offer the known networks as a catalog when adding a channel.

  Creating a channel for GetYourGuide meant typing the name, guessing which `kind` it is out of a seven-value enum, and finding the website. Nothing about that was the operator's decision to make — the answers are the same on every deployment.

  `GET /v1/admin/distribution/channels/presets` now serves the catalog: GetYourGuide, Viator, Tripadvisor, Klook, Civitatis, Musement, Airbnb Experiences and Voyant Connect as named networks, plus affiliate / reseller / API partner as shapes to start from. The add-channel sheet offers them and prefills name, kind and website, leaving everything editable.

  They are a catalog and not seeded rows. A `channels` row is a commercial relationship carrying contracts, commission rules and settlement terms, so pre-creating one per network would fill the counterparty list with companies nobody has contracted with, each showing fields that mean nothing until someone signs something. Nothing exists until the operator picks it.

  A row created from a named network records `channels.preset_key`. That is a stable identity a future connector can bind to — "the GetYourGuide channel" — rather than matching on a display name the operator is free to rename, which is what makes per-channel publication addressable by something other than a typeid. The key is unique, so a second channel for the same network is refused with a 409 naming the one that already exists, and it is set once: `updateChannelSchema` drops it, because re-pointing it would silently move whatever had bound to it.

  The partner types deliberately write no key. An operator has many affiliates and none of them is _the_ affiliate, so those presets fill in `kind` and claim no identity.

  Direct is absent from the catalog: it is provisioned by migration and is not a counterparty.

- df9f45b: Provision the Direct channel, and let the public surface resolve to it without being configured.

  Publication is default-deny per channel and every public catalog read resolves a channel before it answers, so serving your own website meant hand-creating a row in `channels` — a table of commercial counterparties, sitting next to `suppliers`, carrying contracts, rate limits and contact projections — that represents yourself, then binding a storefront to it. Nothing provisioned that row on an ongoing basis: a one-shot setup cutover backfilled the storefronts that existed when it ran, and every storefront created afterwards got a 403 on `/settings`, `/departures/*`, `/products/*`, `/offers/*`, `/leads`, `/newsletter/*`, on the anonymous booking-session routes, and on checkout start.

  `channels` now carries a `system_key`, and a migration provisions exactly one row marked `direct`. It adopts before it inserts — the cutover's own `chan_storefront_direct` row first, then the oldest active `direct` channel — because publication rules and storefront bindings are keyed by channel id, and a fresh row beside an existing one would silently unpublish everything already published.

  A storefront with no explicit binding now resolves to that channel instead of to nothing, and so does one whose explicitly bound channel has gone inactive. `StorefrontChannelBindingDto` gains `implicit`, so an admin surface can show the default as a default; clearing a binding means "back to Direct" rather than "off the air". A binding that names another channel still wins, so `affiliate` / `reseller` / `api_partner` keep working.

  The system channel cannot be deleted or moved off `active` through the API (409, not a 404 that reads like the row is gone), and its `kind` is fixed; its name and contact details stay the operator's to edit. `GET /v1/admin/distribution/channels` takes `system=include|exclude|only`, defaulting to `include` — publication and product-mapping pickers read that endpoint and must still be able to target Direct. Only the Distribution counterparty list passes `exclude`.

  Batch update and batch delete now isolate failures per id rather than rejecting the whole batch when one id is refused.

  The storefront admin's channel section stops warning about something that is no longer true. It said "Default-deny is enforced: customer requests are rejected until this storefront is bound to an active channel", in an amber alert, and offered "Clear binding" with a confirmation warning that customer API access would be denied. It now states the default plainly, shows "Publishing to Direct (default)" for an implicit binding, and the clear action reads "Use Direct" and is disabled when Direct is already what you have.

### Patch Changes

- 36f3085: Stamp `x-voyant-key-kind` on every published operation in this package's OpenAPI
  documents.

  These packages own admin-surface documents only, so every operation reads
  `secret`: a publishable storefront key never reaches `/v1/admin/*`. Stating it
  per operation is the point — "which credential does this accept" should not be
  something a reader has to infer from a path prefix.

- 38531e2: Advertise email fields with a regex a strict-schema LLM client can parse.

  Zod's default `z.email()` pattern opens with `^(?!\.)(?!.*\.\.)`, and providers
  that validate tool schemas with an RE2-style engine reject regex lookaround
  outright. A client sends every authorized tool schema in one model call, so the
  18 affected fields took down every turn of a conversation, including questions
  that never touched the Tools carrying them.

  `@voyant-travel/schema-kit/email` now exports `emailAddress()`, which says
  exactly what zod's default says but structurally: the local part is
  dot-separated runs of non-dot characters, which is what "no leading dot, no
  consecutive dots, no trailing dot" means. A differential fuzz against
  `z.regexes.email` over 700k inputs found zero classification differences, so no
  field's verdict changes. At 84 characters it is also shorter than the 96-char
  default it replaces, which matters because these patterns ship inside every
  advertised Tool schema.

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
  - @voyant-travel/identity@0.236.8
  - @voyant-travel/webhook-delivery@0.6.2
  - @voyant-travel/bookings@0.242.0
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0
  - @voyant-travel/suppliers-contracts@0.104.19
  - @voyant-travel/schema-kit@0.118.9

## 0.227.29

### Patch Changes

- Updated dependencies [8413c21]
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/catalog@0.254.1

## 0.227.28

### Patch Changes

- Updated dependencies [f60a572]
- Updated dependencies [3d7ed59]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/bookings@0.241.0
  - @voyant-travel/catalog@0.254.0
  - @voyant-travel/finance@0.247.0
  - @voyant-travel/tools@0.10.3

## 0.227.27

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/catalog@0.253.1

## 0.227.26

### Patch Changes

- Updated dependencies [b95e995]
- Updated dependencies [8f2f1fc]
- Updated dependencies [b760ac6]
- Updated dependencies [4c2b4ce]
- Updated dependencies [de6e62a]
- Updated dependencies [27140ec]
  - @voyant-travel/catalog@0.253.0
  - @voyant-travel/finance@0.245.7

## 0.227.25

### Patch Changes

- Updated dependencies [21a28ef]
  - @voyant-travel/catalog@0.252.0
  - @voyant-travel/core@0.140.3

## 0.227.24

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/catalog@0.251.3

## 0.227.23

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [1e0506f]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/webhook-delivery@0.6.0
  - @voyant-travel/action-ledger@0.115.16
  - @voyant-travel/bookings@0.240.3
  - @voyant-travel/catalog@0.251.2
  - @voyant-travel/finance@0.244.3
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/identity@0.236.7
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.227.22

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.
- Updated dependencies [3cbf7fb]
  - @voyant-travel/bookings@0.240.2
  - @voyant-travel/db@0.120.7
  - @voyant-travel/finance@0.244.2

## 0.227.21

### Patch Changes

- Updated dependencies [688f164]
  - @voyant-travel/catalog@0.251.0
  - @voyant-travel/finance@0.244.1

## 0.227.20

### Patch Changes

- Updated dependencies [56e2050]
  - @voyant-travel/catalog@0.250.0

## 0.227.19

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/catalog@0.249.1

## 0.227.18

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/catalog@0.249.0
  - @voyant-travel/action-ledger@0.115.15
  - @voyant-travel/bookings@0.240.1
  - @voyant-travel/db@0.120.6
  - @voyant-travel/finance@0.243.1
  - @voyant-travel/hono@0.142.1
  - @voyant-travel/identity@0.236.6
  - @voyant-travel/webhook-delivery@0.5.17

## 0.227.17

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/catalog@0.248.1

## 0.227.16

### Patch Changes

- Updated dependencies [6c77f7d]
- Updated dependencies [d98648a]
  - @voyant-travel/catalog@0.248.0
  - @voyant-travel/bookings@0.240.0
  - @voyant-travel/finance@0.242.0

## 0.227.15

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/catalog@0.247.0

## 0.227.14

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/bookings@0.239.0
  - @voyant-travel/catalog@0.246.0
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/action-ledger@0.115.14
  - @voyant-travel/identity@0.236.5
  - @voyant-travel/webhook-delivery@0.5.16

## 0.227.13

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/bookings@0.238.4
  - @voyant-travel/finance@0.239.1
  - @voyant-travel/action-ledger@0.115.13
  - @voyant-travel/catalog@0.245.1
  - @voyant-travel/db@0.120.3
  - @voyant-travel/identity@0.236.4
  - @voyant-travel/webhook-delivery@0.5.15

## 0.227.12

### Patch Changes

- Updated dependencies [076c246]
  - @voyant-travel/catalog@0.245.0

## 0.227.11

### Patch Changes

- Updated dependencies [9ef6a65]
- Updated dependencies [9ef6a65]
  - @voyant-travel/catalog@0.244.0

## 0.227.10

### Patch Changes

- Updated dependencies [ef8871d]
  - @voyant-travel/catalog@0.243.0

## 0.227.9

### Patch Changes

- Updated dependencies [b52433d]
  - @voyant-travel/catalog@0.242.0

## 0.227.8

### Patch Changes

- Updated dependencies [0976af1]
- Updated dependencies [558e652]
  - @voyant-travel/catalog@0.241.0
  - @voyant-travel/bookings@0.238.3

## 0.227.7

### Patch Changes

- Updated dependencies [9b9e8ac]
  - @voyant-travel/catalog@0.240.0

## 0.227.6

### Patch Changes

- Updated dependencies [da20433]
  - @voyant-travel/catalog@0.239.0

## 0.227.5

### Patch Changes

- Updated dependencies [d2a571f]
  - @voyant-travel/catalog@0.238.0

## 0.227.4

### Patch Changes

- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/catalog@0.237.2

## 0.227.3

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/action-ledger@0.115.12
  - @voyant-travel/bookings@0.238.2
  - @voyant-travel/catalog@0.237.1
  - @voyant-travel/db@0.120.2
  - @voyant-travel/finance@0.238.1
  - @voyant-travel/hono@0.140.1
  - @voyant-travel/identity@0.236.3
  - @voyant-travel/webhook-delivery@0.5.14

## 0.227.2

### Patch Changes

- Updated dependencies [06a79a0]
- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/bookings@0.238.0
  - @voyant-travel/catalog@0.237.0

## 0.227.1

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/catalog@0.236.0
  - @voyant-travel/action-ledger@0.115.11
  - @voyant-travel/bookings@0.237.2
  - @voyant-travel/finance@0.237.2
  - @voyant-travel/identity@0.236.2
  - @voyant-travel/webhook-delivery@0.5.13
  - @voyant-travel/core@0.137.2

## 0.227.0

### Minor Changes

- 4c694f6: Gate sourced catalog entries on channel publication, and let operators choose
  which supply sources each channel sells.

  Sourced entries never passed a listability gate: `syncSources` emitted every
  discovered projection into every slice the deployment materialized, so
  attaching a supply connection published that supplier's whole catalogue to the
  operator's live storefront with no publish step. Channel publication could not
  reach them either — its subjects are a product id and a canonical Supplier, and
  a sourced entry has neither.

  `channel_source_publications` adds the missing subject: an include/exclude
  decision on a `(source_kind, source_connection_id)` pair, resolved
  default-deny with connection beating source kind, mirroring the existing
  product-beats-supplier ordering. The discovery sync and the catalog document
  builder both consult it, so revoking publication removes the inventory on the
  next index pass; staff slices stay ungated so operators can still browse a
  connected supplier to decide what to sell. Admin gets a Supply sources tab
  alongside Products and Suppliers, with the same preview-and-confirm step that
  supplier rules use.

  Index documents now carry `isSourced`, `sourceKind`, and `sourceConnectionId`
  in every vertical, so storefronts can scope on ownership directly instead of
  inferring it from `supplyModel` or an id prefix.

  Deployments with inventory already indexed are backfilled with an explicit
  `include` rule per connection per active channel, so nothing disappears from a
  live storefront on upgrade — the status quo becomes something the operator can
  see and revoke rather than something implied by having connected at all.
  Connections attached after this ships are unpublished until chosen.

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/catalog@0.235.0

## 0.226.2

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/bookings@0.237.1
  - @voyant-travel/finance@0.237.1
  - @voyant-travel/action-ledger@0.115.10
  - @voyant-travel/catalog@0.234.2
  - @voyant-travel/identity@0.236.1
  - @voyant-travel/types@0.109.12
  - @voyant-travel/webhook-delivery@0.5.12

## 0.226.1

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/bookings@0.237.0
  - @voyant-travel/catalog@0.234.1
  - @voyant-travel/finance@0.237.0

## 0.226.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/catalog@0.234.0
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/bookings@0.236.0
  - @voyant-travel/identity@0.236.0

## 0.225.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/bookings@0.235.0
- @voyant-travel/catalog@0.233.0
- @voyant-travel/identity@0.235.0

## 0.224.0

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
  - @voyant-travel/db@0.119.4
  - @voyant-travel/suppliers-contracts@0.104.18
  - @voyant-travel/identity@0.234.0

## 0.223.0

### Patch Changes

- Updated dependencies [5ed518e]
- Updated dependencies [15c1c64]
  - @voyant-travel/catalog@0.231.0
  - @voyant-travel/bookings@0.233.0
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/db@0.119.3
  - @voyant-travel/suppliers-contracts@0.104.17
  - @voyant-travel/identity@0.233.0

## 0.222.0

### Patch Changes

- Updated dependencies [e93c0a7]
- Updated dependencies [ed8610c]
  - @voyant-travel/catalog@0.230.0
  - @voyant-travel/webhook-delivery@0.5.11
  - @voyant-travel/bookings@0.232.0
  - @voyant-travel/finance@0.232.0
  - @voyant-travel/identity@0.232.0

## 0.221.0

### Patch Changes

- f7adc5b: Make Product status the lifecycle authority and active Channel assignments the distribution authority, while retaining legacy visibility fields as deprecated API compatibility data.
- Updated dependencies [f7adc5b]
  - @voyant-travel/catalog@0.229.0
  - @voyant-travel/bookings@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/identity@0.231.0

## 0.220.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/catalog@0.228.0
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/bookings@0.230.0
  - @voyant-travel/identity@0.230.0

## 0.219.1

### Patch Changes

- bdc0443: Add Distribution-owned channel publication contracts, persistence, TypeID prefixes, exact cutover snapshots, effective publication resolver primitives, and provider-neutral runtime wiring for Storefront and Commerce.
- Updated dependencies [bdc0443]
  - @voyant-travel/catalog@0.227.1

## 0.219.0

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
  - @voyant-travel/bookings@0.229.0
  - @voyant-travel/identity@0.229.0

## 0.218.0

### Patch Changes

- @voyant-travel/bookings@0.228.0
- @voyant-travel/catalog@0.226.0
- @voyant-travel/finance@0.228.0
- @voyant-travel/identity@0.228.0

## 0.217.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/bookings@0.227.0
  - @voyant-travel/catalog@0.225.0
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/db@0.119.2
  - @voyant-travel/suppliers-contracts@0.104.16
  - @voyant-travel/identity@0.227.0

## 0.216.0

### Patch Changes

- Updated dependencies [6036dc4]
- Updated dependencies [6beffa2]
  - @voyant-travel/catalog@0.224.0
  - @voyant-travel/bookings@0.226.0
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/identity@0.226.0

## 0.215.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/catalog@0.223.0
  - @voyant-travel/action-ledger@0.115.9
  - @voyant-travel/bookings@0.225.0
  - @voyant-travel/identity@0.225.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1
  - @voyant-travel/webhook-delivery@0.5.10

## 0.214.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0
  - @voyant-travel/action-ledger@0.115.8
  - @voyant-travel/bookings@0.224.0
  - @voyant-travel/catalog@0.222.0
  - @voyant-travel/finance@0.224.0
  - @voyant-travel/identity@0.224.0
  - @voyant-travel/webhook-delivery@0.5.9

## 0.213.0

### Patch Changes

- Updated dependencies [fae0f36]
- Updated dependencies [d02a4e8]
  - @voyant-travel/tools@0.9.0
  - @voyant-travel/bookings@0.223.0
  - @voyant-travel/action-ledger@0.115.7
  - @voyant-travel/catalog@0.221.0
  - @voyant-travel/finance@0.223.0
  - @voyant-travel/identity@0.223.0

## 0.212.0

### Patch Changes

- @voyant-travel/bookings@0.222.0
- @voyant-travel/catalog@0.220.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/identity@0.222.0

## 0.211.1

### Patch Changes

- Updated dependencies [c30b6b0]
- Updated dependencies [d92a98a]
  - @voyant-travel/finance@0.221.1
  - @voyant-travel/hono@0.137.0
  - @voyant-travel/action-ledger@0.115.6
  - @voyant-travel/bookings@0.221.1
  - @voyant-travel/catalog@0.219.1
  - @voyant-travel/identity@0.221.1
  - @voyant-travel/webhook-delivery@0.5.8

## 0.211.0

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
  - @voyant-travel/bookings@0.221.0
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0
  - @voyant-travel/identity@0.221.0
  - @voyant-travel/webhook-delivery@0.5.7

## 0.210.0

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
  - @voyant-travel/identity@0.220.0
  - @voyant-travel/types@0.109.10
  - @voyant-travel/webhook-delivery@0.5.6

## 0.209.0

### Patch Changes

- Updated dependencies [6df3ab4]
  - @voyant-travel/tools@0.7.2
  - @voyant-travel/bookings@0.219.0
  - @voyant-travel/catalog@0.217.0
  - @voyant-travel/finance@0.219.0
  - @voyant-travel/identity@0.219.0

## 0.208.1

### Patch Changes

- fdb2b37: Encode channel-push reconciliation timestamps before they reach database drivers.

## 0.208.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/bookings@0.218.0
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/catalog@0.216.0
  - @voyant-travel/identity@0.218.0

## 0.207.0

### Patch Changes

- @voyant-travel/bookings@0.217.0
- @voyant-travel/catalog@0.215.0
- @voyant-travel/finance@0.217.0
- @voyant-travel/identity@0.217.0

## 0.206.1

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.
- Updated dependencies [a653664]
  - @voyant-travel/bookings@0.216.2
  - @voyant-travel/catalog@0.214.1
  - @voyant-travel/db@0.118.6

## 0.206.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/bookings@0.216.0
  - @voyant-travel/catalog@0.214.0
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/identity@0.216.0

## 0.205.0

### Patch Changes

- @voyant-travel/finance@0.215.0
- @voyant-travel/bookings@0.215.0
- @voyant-travel/catalog@0.213.0
- @voyant-travel/identity@0.215.0

## 0.204.0

### Patch Changes

- @voyant-travel/bookings@0.214.0
- @voyant-travel/catalog@0.212.0
- @voyant-travel/finance@0.214.0
- @voyant-travel/identity@0.214.0

## 0.203.0

### Patch Changes

- @voyant-travel/bookings@0.213.0
- @voyant-travel/catalog@0.211.0
- @voyant-travel/finance@0.213.0
- @voyant-travel/identity@0.213.0

## 0.202.0

### Patch Changes

- Updated dependencies [e7ab7a6]
  - @voyant-travel/catalog@0.210.0
  - @voyant-travel/bookings@0.212.0
  - @voyant-travel/finance@0.212.0
  - @voyant-travel/identity@0.212.0

## 0.201.0

### Patch Changes

- Updated dependencies [5026d3f]
  - @voyant-travel/catalog@0.209.0
  - @voyant-travel/bookings@0.211.0
  - @voyant-travel/finance@0.211.0
  - @voyant-travel/identity@0.211.0

## 0.200.0

### Patch Changes

- @voyant-travel/bookings@0.210.0
- @voyant-travel/catalog@0.208.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/identity@0.210.0

## 0.199.0

### Patch Changes

- @voyant-travel/bookings@0.209.0
- @voyant-travel/catalog@0.207.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/identity@0.209.0

## 0.198.0

### Patch Changes

- @voyant-travel/bookings@0.208.0
- @voyant-travel/catalog@0.206.0
- @voyant-travel/finance@0.208.0
- @voyant-travel/identity@0.208.0

## 0.197.2

### Patch Changes

- 2cfce32: Fix Max/MCP tool failures: ISO aggregate date params, journal catalog overlay nodes, cruise ORDER BY NULLS LAST syntax, trips approval policy names, room-block missing room-type NOT_FOUND, and APPROVAL_REQUIRED fingerprint echo.
- Updated dependencies [2cfce32]
  - @voyant-travel/catalog@0.205.2
  - @voyant-travel/action-ledger@0.115.2

## 0.197.1

### Patch Changes

- accb1cf: Declare safety-contract metadata on the six remaining grandfathered
  supplier/channel/external-reference actions and remove them from the legacy
  execute+tools allowlist:

  - `action.create-supplier`, `action.create-channel`, and
    `action.create-external-reference` already claim their command
    idempotently via `admitHandlerActionPolicy` with a
    `handler-command-claim-v1` `createdTarget` contract, backed by plain local
    Postgres inserts (directory profile plus identity-record sync, no external
    network calls); this adds `availability` and `effectBoundary: "local"`.
  - `action.update-supplier`, `action.update-channel`, and
    `action.update-external-reference` are single local Postgres updates
    against an existing row (already declared via `commandTargetField: "id"`),
    so they declare `availability`, `effectBoundary: "local"`, and
    `targetLifecycle: "existing"`.

  No runtime changes.

- Updated dependencies [accb1cf]
- Updated dependencies [accb1cf]
  - @voyant-travel/finance@0.207.1
  - @voyant-travel/identity@0.207.1

## 0.197.0

### Patch Changes

- Updated dependencies [4979d3b]
  - @voyant-travel/bookings@0.207.0
  - @voyant-travel/catalog@0.205.0
  - @voyant-travel/finance@0.207.0
  - @voyant-travel/identity@0.207.0

## 0.196.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/hono@0.134.6
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/bookings@0.206.0
  - @voyant-travel/catalog@0.204.0
  - @voyant-travel/identity@0.206.0

## 0.195.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/catalog@0.203.0
  - @voyant-travel/bookings@0.205.0
  - @voyant-travel/identity@0.205.0

## 0.194.0

### Patch Changes

- @voyant-travel/bookings@0.204.0
- @voyant-travel/catalog@0.202.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/identity@0.204.0

## 0.193.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/catalog@0.201.0
  - @voyant-travel/action-ledger@0.115.0
  - @voyant-travel/bookings@0.203.0
  - @voyant-travel/tools@0.7.0
  - @voyant-travel/identity@0.203.0

## 0.192.0

### Patch Changes

- @voyant-travel/bookings@0.202.0
- @voyant-travel/catalog@0.200.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/identity@0.202.0

## 0.191.1

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
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/identity@0.201.1

## 0.191.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/catalog@0.199.0
  - @voyant-travel/bookings@0.201.0
  - @voyant-travel/identity@0.201.0

## 0.190.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/catalog@0.198.0
  - @voyant-travel/core@0.136.0
  - @voyant-travel/action-ledger@0.113.2
  - @voyant-travel/bookings@0.200.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/finance@0.200.0
  - @voyant-travel/hono@0.134.5
  - @voyant-travel/identity@0.200.0
  - @voyant-travel/webhook-delivery@0.5.5
  - @voyant-travel/suppliers-contracts@0.104.15

## 0.189.0

### Patch Changes

- Updated dependencies [3651ff7]
- Updated dependencies [c03ff60]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/catalog@0.197.0
  - @voyant-travel/action-ledger@0.113.1
  - @voyant-travel/bookings@0.199.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/finance@0.199.0
  - @voyant-travel/hono@0.134.4
  - @voyant-travel/identity@0.199.0
  - @voyant-travel/webhook-delivery@0.5.4

## 0.188.1

### Patch Changes

- @voyant-travel/bookings@0.198.1
- @voyant-travel/catalog@0.196.1
- @voyant-travel/finance@0.198.1
- @voyant-travel/identity@0.198.1

## 0.188.0

### Patch Changes

- @voyant-travel/bookings@0.198.0
- @voyant-travel/catalog@0.196.0
- @voyant-travel/finance@0.198.0
- @voyant-travel/identity@0.198.0

## 0.187.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/action-ledger@0.113.0
  - @voyant-travel/bookings@0.197.0
  - @voyant-travel/core@0.134.0
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/identity@0.197.0
  - @voyant-travel/catalog@0.195.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3
  - @voyant-travel/webhook-delivery@0.5.3

## 0.186.0

### Minor Changes

- 71c08aa: Require `idempotencyKey` for the supplier, distribution-channel, and legal
  contract-draft create Tools. Successful calls now return an immutable created
  target reference (`status`, the target `id`, and `replayed`) instead of a mutable
  full-row snapshot. Equal keys replay the original target; reusing a key with
  different command input fails with an idempotency conflict.
- bf548af: Make generated-child Tool creation retry-safe by binding each command to an
  explicit stable parent anchor, admitting the selected graph action in the
  handler, and atomically persisting the command claim, child row, and canonical
  child reference.

### Patch Changes

- Updated dependencies [c1f9cdf]
- Updated dependencies [58020ec]
- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/action-ledger@0.112.0
  - @voyant-travel/catalog@0.194.0
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/bookings@0.196.0
  - @voyant-travel/core@0.133.0
  - @voyant-travel/identity@0.196.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2
  - @voyant-travel/webhook-delivery@0.5.2

## 0.185.1

### Patch Changes

- Updated dependencies [6b1e647]
  - @voyant-travel/webhook-delivery@0.5.0

## 0.185.0

### Patch Changes

- Updated dependencies [e3a1e17]
  - @voyant-travel/bookings@0.195.0
  - @voyant-travel/catalog@0.193.0
  - @voyant-travel/finance@0.195.0
  - @voyant-travel/identity@0.195.0

## 0.184.0

### Patch Changes

- Updated dependencies [dd370ca]
  - @voyant-travel/catalog@0.192.0
  - @voyant-travel/core@0.132.1
  - @voyant-travel/bookings@0.194.0
  - @voyant-travel/finance@0.194.0
  - @voyant-travel/identity@0.194.0

## 0.183.0

### Patch Changes

- Updated dependencies [a43267a]
- Updated dependencies [90d44c0]
- Updated dependencies [2c79bef]
  - @voyant-travel/catalog@0.191.0
  - @voyant-travel/bookings@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/identity@0.193.0

## 0.182.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/bookings@0.192.1
  - @voyant-travel/catalog@0.190.1
  - @voyant-travel/db@0.118.1
  - @voyant-travel/finance@0.192.1
  - @voyant-travel/hono@0.134.1
  - @voyant-travel/identity@0.192.1
  - @voyant-travel/webhook-delivery@0.4.9

## 0.182.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/bookings@0.192.0
  - @voyant-travel/catalog@0.190.0
  - @voyant-travel/identity@0.192.0

## 0.181.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/catalog@0.189.0
  - @voyant-travel/bookings@0.191.0
  - @voyant-travel/identity@0.191.0

## 0.180.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.

### Patch Changes

- fafc12e: Add the generated Cloudflare Worker product-job bridge, including fixed trusted
  inventory/invocation routes, Worker lifetime handling, terminal health callbacks,
  and an explicit Cloudflare-versus-managed schedule projection. Align distribution
  recovery with the minimum one-minute hosted scheduler cadence.
- Updated dependencies [228b57d]
- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/bookings@0.190.0
  - @voyant-travel/catalog@0.188.0
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/finance@0.190.0
  - @voyant-travel/identity@0.190.0
  - @voyant-travel/types@0.109.9
  - @voyant-travel/webhook-delivery@0.4.8

## 0.179.0

### Patch Changes

- Updated dependencies [d9ff078]
  - @voyant-travel/catalog@0.187.0
  - @voyant-travel/bookings@0.189.0
  - @voyant-travel/finance@0.189.0
  - @voyant-travel/identity@0.189.0

## 0.178.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/bookings@0.188.0
  - @voyant-travel/catalog@0.186.0
  - @voyant-travel/finance@0.188.0
  - @voyant-travel/identity@0.188.0
  - @voyant-travel/workflows@0.122.18

## 0.177.0

### Patch Changes

- @voyant-travel/bookings@0.187.0
- @voyant-travel/catalog@0.185.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/identity@0.187.0

## 0.176.0

### Patch Changes

- @voyant-travel/bookings@0.186.0
- @voyant-travel/catalog@0.184.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/identity@0.186.0

## 0.175.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/catalog@0.183.0
  - @voyant-travel/bookings@0.185.0
  - @voyant-travel/identity@0.185.0

## 0.174.0

### Patch Changes

- @voyant-travel/bookings@0.184.0
- @voyant-travel/catalog@0.182.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/identity@0.184.0

## 0.173.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/bookings@0.183.0
- @voyant-travel/catalog@0.181.0
- @voyant-travel/identity@0.183.0

## 0.172.2

### Patch Changes

- @voyant-travel/bookings@0.182.2
- @voyant-travel/catalog@0.180.2
- @voyant-travel/finance@0.182.4
- @voyant-travel/identity@0.182.2
- @voyant-travel/workflows@0.122.16

## 0.172.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0
  - @voyant-travel/bookings@0.182.1
  - @voyant-travel/catalog@0.180.1
  - @voyant-travel/finance@0.182.3
  - @voyant-travel/identity@0.182.1
  - @voyant-travel/workflows@0.122.15

## 0.172.0

### Patch Changes

- @voyant-travel/bookings@0.182.0
- @voyant-travel/catalog@0.180.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/identity@0.182.0

## 0.171.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/bookings@0.181.0
  - @voyant-travel/catalog@0.179.0
  - @voyant-travel/identity@0.181.0

## 0.170.1

### Patch Changes

- @voyant-travel/finance@0.180.1
- @voyant-travel/db@0.117.1
- @voyant-travel/suppliers-contracts@0.104.14
- @voyant-travel/bookings@0.180.1
- @voyant-travel/catalog@0.178.1
- @voyant-travel/identity@0.180.1
- @voyant-travel/workflows@0.122.14

## 0.170.0

### Patch Changes

- @voyant-travel/bookings@0.180.0
- @voyant-travel/catalog@0.178.0
- @voyant-travel/finance@0.180.0
- @voyant-travel/identity@0.180.0
- @voyant-travel/workflows@0.122.13

## 0.169.0

### Patch Changes

- @voyant-travel/bookings@0.179.0
- @voyant-travel/catalog@0.177.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/identity@0.179.0

## 0.168.0

### Patch Changes

- @voyant-travel/bookings@0.178.0
- @voyant-travel/catalog@0.176.0
- @voyant-travel/finance@0.178.0
- @voyant-travel/identity@0.178.0
- @voyant-travel/workflows@0.122.12

## 0.167.0

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/bookings@0.177.0
  - @voyant-travel/catalog@0.175.0
  - @voyant-travel/finance@0.177.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/identity@0.177.0
  - @voyant-travel/types@0.109.8
  - @voyant-travel/webhook-delivery@0.4.7
  - @voyant-travel/workflows@0.122.11

## 0.166.0

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/bookings@0.176.0
  - @voyant-travel/catalog@0.174.0
  - @voyant-travel/finance@0.176.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/identity@0.176.0
  - @voyant-travel/types@0.109.7
  - @voyant-travel/webhook-delivery@0.4.6
  - @voyant-travel/workflows@0.122.10

## 0.165.0

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/bookings@0.175.0
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/catalog@0.173.0
  - @voyant-travel/finance@0.175.0
  - @voyant-travel/identity@0.175.0
  - @voyant-travel/webhook-delivery@0.4.5
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.164.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/bookings@0.174.0
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/catalog@0.172.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1
  - @voyant-travel/identity@0.174.0
  - @voyant-travel/webhook-delivery@0.4.4
  - @voyant-travel/workflows@0.122.8

## 0.163.0

### Patch Changes

- @voyant-travel/bookings@0.173.0
- @voyant-travel/catalog@0.171.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/identity@0.173.0

## 0.162.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/bookings@0.172.0
  - @voyant-travel/core@0.128.0
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/catalog@0.170.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/identity@0.172.0
  - @voyant-travel/webhook-delivery@0.4.3
  - @voyant-travel/workflows@0.122.7

## 0.161.1

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0
  - @voyant-travel/bookings@0.171.1
  - @voyant-travel/catalog@0.169.1
  - @voyant-travel/finance@0.171.1
  - @voyant-travel/identity@0.171.1
  - @voyant-travel/workflows@0.122.6

## 0.161.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/catalog@0.169.0
  - @voyant-travel/bookings@0.171.0
  - @voyant-travel/identity@0.171.0

## 0.160.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/bookings@0.170.0
  - @voyant-travel/catalog@0.168.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/hono@0.128.6
  - @voyant-travel/identity@0.170.0
  - @voyant-travel/webhook-delivery@0.4.2
  - @voyant-travel/workflows@0.122.5

## 0.159.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/bookings@0.169.1
  - @voyant-travel/catalog@0.167.1
  - @voyant-travel/db@0.114.11
  - @voyant-travel/finance@0.169.2
  - @voyant-travel/hono@0.128.4
  - @voyant-travel/identity@0.169.1
  - @voyant-travel/webhook-delivery@0.4.1
  - @voyant-travel/workflows@0.122.4

## 0.159.0

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
  - @voyant-travel/bookings@0.169.0
  - @voyant-travel/catalog@0.167.0
  - @voyant-travel/identity@0.169.0

## 0.158.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/catalog@0.166.0
  - @voyant-travel/bookings@0.168.0
  - @voyant-travel/identity@0.168.0

## 0.157.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/catalog@0.165.0
  - @voyant-travel/bookings@0.167.0
  - @voyant-travel/identity@0.167.0

## 0.156.0

### Patch Changes

- Updated dependencies [04b031d]
- Updated dependencies [c3bdcbc]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/webhook-delivery@0.4.0
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/catalog@0.164.0
  - @voyant-travel/bookings@0.166.0
  - @voyant-travel/identity@0.166.0
  - @voyant-travel/workflows@0.122.3

## 0.155.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/catalog@0.163.0
  - @voyant-travel/bookings@0.165.0
  - @voyant-travel/identity@0.165.0

## 0.154.0

### Patch Changes

- Updated dependencies [fc3224a]
  - @voyant-travel/catalog@0.162.0
  - @voyant-travel/bookings@0.164.0
  - @voyant-travel/finance@0.164.0
  - @voyant-travel/identity@0.164.0

## 0.153.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/bookings@0.163.0
  - @voyant-travel/core@0.125.0
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/catalog@0.161.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1
  - @voyant-travel/identity@0.163.0
  - @voyant-travel/webhook-delivery@0.3.4
  - @voyant-travel/suppliers-contracts@0.104.13
  - @voyant-travel/workflows@0.122.2

## 0.152.1

### Patch Changes

- @voyant-travel/bookings@0.162.2
- @voyant-travel/catalog@0.160.1
- @voyant-travel/finance@0.162.2
- @voyant-travel/identity@0.162.1
- @voyant-travel/workflows@0.122.1

## 0.152.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/bookings@0.162.0
  - @voyant-travel/catalog@0.160.0
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/identity@0.162.0
  - @voyant-travel/workflows@0.122.0
  - @voyant-travel/db@0.114.8

## 0.151.0

### Patch Changes

- Updated dependencies [85bfe2c]
- Updated dependencies [a1842a7]
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/hono@0.127.2
  - @voyant-travel/bookings@0.161.0
  - @voyant-travel/catalog@0.159.0
  - @voyant-travel/identity@0.161.0

## 0.150.0

### Minor Changes

- 6c8d46a: Add guarded MCP Tool surfaces for supplier profiles, distribution channels, and external references.

### Patch Changes

- 372f4f4: Add a separately selectable Operations-owned dashboard Tool that composes the real aggregate
  services from Bookings, Finance, Inventory, Distribution, and Operations without crossing domain
  persistence boundaries. Require every underlying read scope and return structural source
  projections, KPIs, and bounded alerts.

  Complete the Quotes proposal lifecycle Tool surface with snapshot, send, accept, and decline
  capabilities, structural JSON-safe outputs, compatibility aliases, staff-only grants,
  confirmation, and graph-ledger/approval policy.

- Updated dependencies [cabf662]
- Updated dependencies [701ccc4]
- Updated dependencies [5f15e2e]
- Updated dependencies [7ac40a0]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [b8cef4c]
- Updated dependencies [d9e8984]
- Updated dependencies [db5adce]
- Updated dependencies [c9b6144]
- Updated dependencies [6604f9e]
- Updated dependencies [ff87f68]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/tools@0.3.0
  - @voyant-travel/bookings@0.160.0
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/catalog@0.158.0
  - @voyant-travel/identity@0.160.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/hono@0.127.1
  - @voyant-travel/webhook-delivery@0.3.3
  - @voyant-travel/workflows@0.121.0

## 0.149.0

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [49f55d0]
- Updated dependencies [552acbf]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/bookings@0.159.0
  - @voyant-travel/catalog@0.157.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/db@0.114.6
  - @voyant-travel/identity@0.159.0
  - @voyant-travel/webhook-delivery@0.3.2
  - @voyant-travel/workflows@0.120.4

## 0.148.0

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
  - @voyant-travel/catalog@0.156.0
  - @voyant-travel/core@0.122.2
  - @voyant-travel/db@0.114.5
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/identity@0.158.0
  - @voyant-travel/types@0.109.2
  - @voyant-travel/workflows@0.120.3

## 0.147.0

### Patch Changes

- Updated dependencies [0808b21]
  - @voyant-travel/catalog@0.155.0
  - @voyant-travel/bookings@0.157.0
  - @voyant-travel/finance@0.157.0
  - @voyant-travel/identity@0.157.0

## 0.146.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [7916020]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/webhook-delivery@0.3.1
  - @voyant-travel/catalog@0.154.1
  - @voyant-travel/bookings@0.156.1
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/hono@0.126.3
  - @voyant-travel/identity@0.156.1
  - @voyant-travel/suppliers-contracts@0.104.12
  - @voyant-travel/workflows@0.120.2

## 0.146.0

### Patch Changes

- bbe6396: Replace the overloaded Finance voucher domain with Travel Credits across the
  database schema, APIs, package exports, booking inputs, storefront settings,
  and operator UI. Redemption commands are replay-safe, codes are normalized and
  case-insensitively unique, and legacy records migrate in place without silently
  skipping invalid balances. Keep Promotion Codes in Commerce and move Bookings
  fulfillment to the explicit Service Voucher vocabulary.
- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/bookings@0.156.0
  - @voyant-travel/catalog@0.154.0
  - @voyant-travel/db@0.114.3
  - @voyant-travel/suppliers-contracts@0.104.11
  - @voyant-travel/identity@0.156.0
  - @voyant-travel/workflows@0.120.1

## 0.145.1

### Patch Changes

- Updated dependencies [818ea84]
- Updated dependencies [2cc954a]
- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/workflows@0.120.0
  - @voyant-travel/webhook-delivery@0.3.0
  - @voyant-travel/core@0.122.0
  - @voyant-travel/bookings@0.155.1
  - @voyant-travel/db@0.114.2
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/hono@0.126.2
  - @voyant-travel/catalog@0.153.1
  - @voyant-travel/identity@0.155.1

## 0.145.0

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/bookings@0.155.0
  - @voyant-travel/catalog@0.153.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/finance@0.155.0
  - @voyant-travel/hono@0.126.1
  - @voyant-travel/identity@0.155.0
  - @voyant-travel/webhook-delivery@0.2.2
  - @voyant-travel/workflows@0.119.0

## 0.144.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/bookings@0.154.0
  - @voyant-travel/catalog@0.152.0
  - @voyant-travel/identity@0.154.0
  - @voyant-travel/webhook-delivery@0.2.1
  - @voyant-travel/workflows@0.118.0

## 0.143.0

### Minor Changes

- 490d132: Move charter/cruise route activation and travel/infrastructure scheduled work
  to graph-selected package manifests. Distribution, Cruises, and DB now publish
  their scheduled workflow implementations, while Workflow Runs owns generic
  schedule dispatch and the Operator supplies only Node runtime dependencies.
- 490d132: Compose Action Ledger health from typed Bookings, Finance, and Inventory graph ports, consolidate Distribution channel-push composition into its domain package, and make Workflow Runs own runner registration authority.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- c65b05c: Move the complete graph-native Node application host into runtime,
  including generated graph admission, local and managed auth, API/admin serving,
  workflow services and schedules, outbound delivery, links, and runtime ports.
  Move the generic Postgres webhook enqueue boundary out of Distribution and into
  the neutral webhook-delivery package.
- 490d132: Move Trips lifecycle composition, checkout FX handling, payment-policy readers, and workflow effects from the Operator starter into package-owned runtime surfaces.
- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Replace temporary nested owner exports with intentional validation, linkable, scheduling, and workflow public surfaces.
- 490d132: Declare Action Ledger, Distribution, MICE, and Relationships OpenAPI documents in their package-owned deployment manifests and ship their committed admin contracts from the owning packages.
- 490d132: Derive the final package runtime bindings from generic deployment capabilities and primitives, with no product-specific generated runtime host resources.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- 490d132: Move runtime construction into BOM-selected domain contributors and replace the Finance target package with typed graph ports while keeping package dependencies acyclic.
- 490d132: Move platform and operations OpenAPI authority into the owning package manifests and publish their committed documents from package-local exports.
- 490d132: Provide validated subscription mutations, durable projected webhook enqueue, restart-safe payload storage, and one claim-driven signed, retrying, audited delivery worker.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
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
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
- Updated dependencies [282892e]
- Updated dependencies [490d132]
  - @voyant-travel/bookings@0.153.0
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/catalog@0.151.0
  - @voyant-travel/webhook-delivery@0.2.0
  - @voyant-travel/hono@0.125.1
  - @voyant-travel/types@0.108.1
  - @voyant-travel/identity@0.153.0
  - @voyant-travel/workflows@0.117.0

## 0.142.0

### Patch Changes

- d771be3: Move channel-push graph runtime composition behind a package-owned typed runtime port while preserving its routes, subscribers, workflows, and lazy database lifecycle.
- 8f537b0: Lower package-owned ordinary subscriber runtime descriptors from the selected deployment graph and move distribution channel-push subscribers out of the Operator hand list.
- Updated dependencies [e68bdc1]
- Updated dependencies [d771be3]
- Updated dependencies [8e67fe8]
- Updated dependencies [26fe0e5]
- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/catalog@0.150.0
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/bookings@0.152.0
  - @voyant-travel/hono@0.125.0
  - @voyant-travel/identity@0.152.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/workflows@0.116.0

## 0.141.5

### Patch Changes

- e5aa097: Activate package-owned workflow declarations through the generated deployment graph and deployment-supplied Node runtime services.
- 62b68aa: Publish the channel-push workflow runtime service contract for graph activation.
- Updated dependencies [e5aa097]
- Updated dependencies [01d5034]
- Updated dependencies [c66f9a5]
  - @voyant-travel/bookings@0.151.5
  - @voyant-travel/core@0.117.0
  - @voyant-travel/catalog@0.149.4
  - @voyant-travel/db@0.112.1
  - @voyant-travel/hono@0.124.1
  - @voyant-travel/identity@0.151.4
  - @voyant-travel/workflows@0.115.2

## 0.141.4

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/hono@0.124.0
  - @voyant-travel/bookings@0.151.4
  - @voyant-travel/catalog@0.149.3
  - @voyant-travel/identity@0.151.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.141.3

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/bookings@0.151.3
  - @voyant-travel/catalog@0.149.2
  - @voyant-travel/db@0.111.2
  - @voyant-travel/hono@0.123.2
  - @voyant-travel/identity@0.151.2

## 0.141.2

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0
  - @voyant-travel/bookings@0.151.2
  - @voyant-travel/hono@0.123.1

## 0.141.1

### Patch Changes

- e4e6621: Model package-owned Hono extensions as first-class deployment graph units while keeping externally distributed integrations in the plugin lane.
- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/bookings@0.151.1
  - @voyant-travel/catalog@0.149.1
  - @voyant-travel/hono@0.123.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/identity@0.151.1

## 0.141.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for booking requirements and the
  bookings, distribution, MICE, and quotes extension surfaces.
- e3dc5a9: Register graph-selected outbound webhook events in Node runtimes and enqueue enabled subscriptions as redacted, idempotent pending delivery records without claiming HTTP delivery or retry support.
- e3dc5a9: Declare package-owned admin route and copy facets for vertical modules with existing public admin extensions.
- e3dc5a9: Declare package-owned Node deployment facets for product events, subscribers, workflows, access resources, tools, actions, and retain-data lifecycle behavior.

### Patch Changes

- a370024: Correct package-owned API mounts and runtime references for distribution, MICE,
  workflow runs, and flights deployment manifests.
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
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0
  - @voyant-travel/catalog@0.149.0
  - @voyant-travel/bookings@0.151.0
  - @voyant-travel/db@0.111.0
  - @voyant-travel/identity@0.151.0
  - @voyant-travel/hono@0.122.4
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.140.0

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/bookings@0.150.0
  - @voyant-travel/core@0.113.0
  - @voyant-travel/catalog@0.148.0
  - @voyant-travel/db@0.110.2
  - @voyant-travel/hono@0.122.3
  - @voyant-travel/identity@0.150.0

## 0.139.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.
- Updated dependencies [5e1d221]
- Updated dependencies [682d7d0]
  - @voyant-travel/bookings@0.149.1
  - @voyant-travel/catalog@0.147.1
  - @voyant-travel/db@0.110.1
  - @voyant-travel/identity@0.149.1
  - @voyant-travel/hono@0.122.2
  - @voyant-travel/workflows@0.111.19

## 0.139.0

### Patch Changes

- @voyant-travel/bookings@0.149.0
- @voyant-travel/catalog@0.147.0
- @voyant-travel/identity@0.149.0

## 0.138.0

### Patch Changes

- @voyant-travel/bookings@0.148.0
- @voyant-travel/catalog@0.146.0
- @voyant-travel/identity@0.148.0

## 0.137.0

### Patch Changes

- @voyant-travel/bookings@0.147.0
- @voyant-travel/catalog@0.145.0
- @voyant-travel/identity@0.147.0

## 0.136.0

### Patch Changes

- @voyant-travel/bookings@0.146.0
- @voyant-travel/catalog@0.144.0
- @voyant-travel/identity@0.146.0

## 0.135.0

### Patch Changes

- Updated dependencies [4829ef3]
  - @voyant-travel/catalog@0.143.0
  - @voyant-travel/bookings@0.145.0
  - @voyant-travel/identity@0.145.0

## 0.134.0

### Patch Changes

- Updated dependencies [ba6c30a]
  - @voyant-travel/bookings@0.144.0
  - @voyant-travel/catalog@0.142.0
  - @voyant-travel/identity@0.144.0

## 0.133.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/db@0.110.0
  - @voyant-travel/hono@0.122.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/bookings@0.143.0
  - @voyant-travel/catalog@0.141.0
  - @voyant-travel/identity@0.143.0
  - @voyant-travel/types@0.107.1
  - @voyant-travel/workflows@0.111.18

## 0.132.0

### Patch Changes

- ee09a7f: Promote the package-owned channel-push extension factory into the managed runtime.
  - @voyant-travel/bookings@0.142.0
  - @voyant-travel/catalog@0.140.0
  - @voyant-travel/identity@0.142.0

## 0.131.0

### Patch Changes

- Updated dependencies [6711f4c]
  - @voyant-travel/catalog@0.139.0
  - @voyant-travel/bookings@0.141.0
  - @voyant-travel/identity@0.141.0

## 0.130.0

### Patch Changes

- @voyant-travel/bookings@0.140.0
- @voyant-travel/catalog@0.138.0
- @voyant-travel/identity@0.140.0
- @voyant-travel/workflows@0.111.16

## 0.129.0

### Patch Changes

- 92e170a: Validate supplier availability date strings before persistence and upsert supplier
  availability by supplier/date instead of appending duplicate rows.
- f3b8bef: Reject supplier default currency values unless they are exactly three uppercase letters.
- 13f21a1: Enforce supplier parent IDs for nested supplier service, rate, and contract mutations.
- 9f29b74: Fix supplier PATCH validation so insert defaults are not applied during partial
  updates, and allow explicit nulls to clear nullable supplier contact fields.
- fcad28b: Reject reversed supplier rate and contract ranges. Rate date and pax bounds must be ordered, contract end dates must not precede start dates, and renewal dates must stay within bounded contract terms.

  Supplier UI forms now block those invalid ranges and persisted invalid rate rows are flagged in the rate table.

- Updated dependencies [c9a356f]
- Updated dependencies [689a289]
- Updated dependencies [fc71db1]
- Updated dependencies [6474f42]
- Updated dependencies [5786f63]
- Updated dependencies [22f0457]
- Updated dependencies [92e170a]
- Updated dependencies [f3b8bef]
- Updated dependencies [9f29b74]
- Updated dependencies [fcad28b]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/hono@0.121.0
  - @voyant-travel/catalog@0.137.0
  - @voyant-travel/bookings@0.139.0
  - @voyant-travel/suppliers-contracts@0.104.10
  - @voyant-travel/identity@0.139.0
  - @voyant-travel/db@0.109.5
  - @voyant-travel/workflows@0.111.15

## 0.128.4

### Patch Changes

- Updated dependencies [1cb9cba]
- Updated dependencies [131ff9b]
  - @voyant-travel/hono@0.120.0
  - @voyant-travel/bookings@0.138.6
  - @voyant-travel/catalog@0.136.3
  - @voyant-travel/identity@0.138.2
  - @voyant-travel/workflows@0.111.14

## 0.128.3

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
- Updated dependencies [86fbb05]
  - @voyant-travel/bookings@0.138.5
  - @voyant-travel/hono@0.119.0
  - @voyant-travel/catalog@0.136.2
  - @voyant-travel/identity@0.138.1
  - @voyant-travel/workflows@0.111.13

## 0.128.2

### Patch Changes

- 3cacf39: Validate distribution admin booking links and webhook events before insert so dangling references return stable 4xx API errors, while keeping product mappings compatible with unmanaged product references.
- 3757b75: Preserve channel-push source routing fields on product mappings and report no-work booking retries with `ok: false`.
- Updated dependencies [a5dfd8f]
- Updated dependencies [88edbe6]
  - @voyant-travel/bookings@0.138.1
  - @voyant-travel/core@0.111.1
  - @voyant-travel/hono@0.118.4

## 0.128.1

### Patch Changes

- bd59b12: Surface actionable channel sync retry and reconcile outcomes in the operator UI.

## 0.128.0

### Minor Changes

- 2325c93: Emit `product.publication.changed` on every product↔channel mapping mutation.

  The distribution service now emits a durable `product.publication.changed`
  domain event from the service layer whenever a channel product mapping is
  created, updated, deleted, activated, or deactivated — including the
  batch-update / batch-delete paths, which fan out over the same single-item
  service methods. The payload carries `productId`, `channelId`, `mappingId`,
  the previous and new mapping active state, the operation source
  (`created | updated | deleted | activated | deactivated`), and the channel
  `kind` / `status` at emit time.

  This lets catalog / storefront integrations reindex a product's
  customer-facing slices the moment its publication changes (adding an active
  mapping to an active channel makes it listable; deactivating or removing one
  should tombstone the slice), instead of waiting for an unrelated product
  mutation or a manual reindex. Emission is fire-and-forget and never throws,
  per the EventBus contract.

### Patch Changes

- @voyant-travel/bookings@0.138.0
- @voyant-travel/catalog@0.136.0
- @voyant-travel/identity@0.138.0

## 0.127.3

## 0.127.2

## 0.127.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/hono@0.118.0
  - @voyant-travel/bookings@0.137.1
  - @voyant-travel/catalog@0.135.1
  - @voyant-travel/identity@0.137.1
  - @voyant-travel/workflows@0.111.10

## 0.127.0

### Patch Changes

- Updated dependencies [7c5ee80]
  - @voyant-travel/hono@0.117.0
  - @voyant-travel/bookings@0.137.0
  - @voyant-travel/catalog@0.135.0
  - @voyant-travel/identity@0.137.0
  - @voyant-travel/workflows@0.111.9

## 0.126.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.
- Updated dependencies [12a1eb2]
  - @voyant-travel/bookings@0.136.2
  - @voyant-travel/hono@0.116.2
  - @voyant-travel/identity@0.136.2

## 0.126.1

### Patch Changes

- @voyant-travel/bookings@0.136.1
- @voyant-travel/catalog@0.134.1
- @voyant-travel/identity@0.136.1
- @voyant-travel/workflows@0.111.8

## 0.126.0

### Patch Changes

- Updated dependencies [293e5e4]
  - @voyant-travel/hono@0.116.1
  - @voyant-travel/db@0.109.2
  - @voyant-travel/suppliers-contracts@0.104.7
  - @voyant-travel/bookings@0.136.0
  - @voyant-travel/catalog@0.134.0
  - @voyant-travel/identity@0.136.0

## 0.125.0

### Patch Changes

- @voyant-travel/db@0.109.1
- @voyant-travel/suppliers-contracts@0.104.6
- @voyant-travel/bookings@0.135.0
- @voyant-travel/catalog@0.133.0
- @voyant-travel/identity@0.135.0

## 0.124.1

### Patch Changes

- Updated dependencies [684b321]
- Updated dependencies [2542715]
  - @voyant-travel/hono@0.116.0
  - @voyant-travel/bookings@0.134.1
  - @voyant-travel/catalog@0.132.1
  - @voyant-travel/identity@0.134.1
  - @voyant-travel/workflows@0.111.6

## 0.124.0

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
  - @voyant-travel/identity@0.134.0
  - @voyant-travel/catalog@0.132.0
  - @voyant-travel/workflows@0.111.5

## 0.123.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/hono@0.114.0
  - @voyant-travel/bookings@0.133.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/catalog@0.131.0
  - @voyant-travel/identity@0.133.0
  - @voyant-travel/suppliers-contracts@0.104.5
  - @voyant-travel/workflows@0.111.4

## 0.122.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/catalog@0.130.0
  - @voyant-travel/bookings@0.132.0
  - @voyant-travel/identity@0.132.0

## 0.121.1

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/hono@0.113.0
  - @voyant-travel/core@0.111.0
  - @voyant-travel/bookings@0.131.1
  - @voyant-travel/catalog@0.129.1
  - @voyant-travel/identity@0.131.1
  - @voyant-travel/db@0.108.5
  - @voyant-travel/workflows@0.111.3

## 0.121.0

### Patch Changes

- @voyant-travel/bookings@0.131.0
- @voyant-travel/catalog@0.129.0
- @voyant-travel/identity@0.131.0

## 0.120.0

### Patch Changes

- @voyant-travel/bookings@0.130.0
- @voyant-travel/catalog@0.128.0
- @voyant-travel/identity@0.130.0

## 0.119.1

### Patch Changes

- e014a02: Handle scheduled channel availability and content push runs that provide no input payload.

  The channel push processors now treat `null` workflow input the same as absent input, preserving the default drain limit and all-channel scope. Scheduled availability/content push workflow concurrency keys also fall back to `all` when no payload is supplied.

## 0.119.0

### Patch Changes

- Updated dependencies [7779772]
  - @voyant-travel/catalog@0.127.0
  - @voyant-travel/bookings@0.129.0
  - @voyant-travel/identity@0.129.0

## 0.118.0

### Patch Changes

- @voyant-travel/bookings@0.128.0
- @voyant-travel/catalog@0.126.0
- @voyant-travel/identity@0.128.0

## 0.117.0

### Patch Changes

- Updated dependencies [435a5d1]
  - @voyant-travel/bookings@0.127.0
  - @voyant-travel/catalog@0.125.0
  - @voyant-travel/identity@0.127.0

## 0.116.1

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

- Updated dependencies [1841ce2]
  - @voyant-travel/db@0.108.4
  - @voyant-travel/identity@0.126.1
  - @voyant-travel/catalog@0.124.1
  - @voyant-travel/workflows@0.111.2

## 0.116.0

### Patch Changes

- @voyant-travel/bookings@0.126.0
- @voyant-travel/catalog@0.124.0
- @voyant-travel/identity@0.126.0

## 0.115.0

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/suppliers-contracts@0.104.4
- @voyant-travel/bookings@0.125.0
- @voyant-travel/catalog@0.123.0
- @voyant-travel/identity@0.125.0
- @voyant-travel/workflows@0.111.0
- @voyant-travel/hono@0.112.2

## 0.114.0

### Patch Changes

- @voyant-travel/hono@0.112.1
- @voyant-travel/bookings@0.124.0
- @voyant-travel/catalog@0.122.0
- @voyant-travel/identity@0.124.0
- @voyant-travel/workflows@0.110.0

## 0.113.0

### Patch Changes

- Updated dependencies [04681f3]
- Updated dependencies [98f4a40]
- Updated dependencies [a3bd51c]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
- Updated dependencies [d222e9f]
  - @voyant-travel/bookings@0.123.0
  - @voyant-travel/core@0.110.0
  - @voyant-travel/hono@0.112.0
  - @voyant-travel/catalog@0.121.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/identity@0.123.0
  - @voyant-travel/workflows@0.109.4

## 0.112.2

### Patch Changes

- 027347f: Make channel-push workflow registration and schedules opt-in so package root
  imports for suppliers, external refs, or route wiring do not publish scheduled
  channel-push work.

## 0.112.1

### Patch Changes

- 62b712a: Add a workflow-entry-safe channel-push export for detached bundles so operator
  workflow entries do not evaluate the broad distribution package surface at
  import time.

## 0.112.0

### Patch Changes

- @voyant-travel/bookings@0.122.0
- @voyant-travel/catalog@0.120.0
- @voyant-travel/identity@0.122.0

## 0.111.0

### Patch Changes

- Updated dependencies [11095db]
- Updated dependencies [13fe70b]
- Updated dependencies [9ea7220]
  - @voyant-travel/catalog@0.119.0
  - @voyant-travel/hono@0.111.0
  - @voyant-travel/bookings@0.121.0
  - @voyant-travel/identity@0.121.0
  - @voyant-travel/workflows@0.109.2

## 0.110.5

### Patch Changes

- @voyant-travel/bookings@0.120.3

## 0.110.4

### Patch Changes

- @voyant-travel/bookings@0.120.1
- @voyant-travel/catalog@0.118.1
- @voyant-travel/identity@0.120.1
- @voyant-travel/workflows@0.109.1

## 0.110.3

### Patch Changes

- 28898ad: Fix migration-facing publish artifacts by exporting all Distribution-owned supplier and external-reference schemas, republishing contract packages with complete dist files, guarding packed artifacts against legacy package-scope specifiers, and updating Voyant Cloud defaults to `https://api.voyant.travel`.
- Updated dependencies [28898ad]
  - @voyant-travel/suppliers-contracts@0.104.3

## 0.110.2

### Patch Changes

- @voyant-travel/hono@0.110.2
- @voyant-travel/workflows@0.109.0

## 0.110.1

### Patch Changes

- Updated dependencies [0c003f3]
  - @voyant-travel/workflows@0.108.0
  - @voyant-travel/db@0.108.1
  - @voyant-travel/hono@0.110.1

## 0.110.0

### Minor Changes

- 3e160d3: Move supplier and external-reference runtime and React implementation under
  Distribution owner paths. The old supplier and external-ref package names are
  removed from v1 while operator runtime and legal schema imports use
  Distribution-owned surfaces.

### Patch Changes

- 081e310: Remove Distribution runtime dependencies on Product and Availability schemas.
  Channel push now reads Product content and Availability slots through reviewed
  SQL boundary queries, while Product and Availability remain dev/test-only
  dependencies for integration coverage.
- eb17d3d: Add owner-path schema manifest metadata for Commerce and Operations, expose the
  Distribution counterparty interface, and refresh operator schema/link generated
  artifacts for the v1 package restructure.
- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [2f1228a]
- Updated dependencies [efc803c]
- Updated dependencies [d92d1a8]
- Updated dependencies [c9ec9f8]
- Updated dependencies [6bff46f]
- Updated dependencies [3cc83b6]
- Updated dependencies [44c3875]
- Updated dependencies [47fef18]
- Updated dependencies [2c9c4a4]
- Updated dependencies [e80e3d3]
  - @voyant-travel/bookings@0.120.0
  - @voyant-travel/catalog@0.118.0
  - @voyant-travel/hono@0.110.0
  - @voyant-travel/identity@0.120.0
  - @voyant-travel/workflows@0.107.11

## 0.109.8

### Patch Changes

- 9162394: Split oversized distribution service, route, booking-push, integration test, and channel sync UI modules into smaller focused files while preserving existing behavior and exports.
- Updated dependencies [e639610]
  - @voyant-travel/availability@0.116.2
  - @voyant-travel/workflows@0.107.6

## 0.109.7

### Patch Changes

- a224ef6: Use explicit parser and payload mapping seams in channel push delivery helpers.

## 0.109.6

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/availability@0.116.1
  - @voyant-travel/bookings@0.119.1
  - @voyant-travel/catalog@0.117.1
  - @voyant-travel/hono@0.109.1
  - @voyant-travel/identity@0.119.1
  - @voyant-travel/products@0.119.1
  - @voyant-travel/suppliers@0.111.6
  - @voyant-travel/workflows@0.107.5

## 0.109.5

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/hono@0.109.0
  - @voyant-travel/availability@0.116.0
  - @voyant-travel/bookings@0.119.0
  - @voyant-travel/catalog@0.117.0
  - @voyant-travel/identity@0.119.0
  - @voyant-travel/products@0.119.0
  - @voyant-travel/suppliers@0.111.5
  - @voyant-travel/workflows@0.107.4

## 0.109.4

### Patch Changes

- Updated dependencies [004fc38]
  - @voyant-travel/products@0.118.0
  - @voyant-travel/availability@0.115.0
  - @voyant-travel/bookings@0.118.0
  - @voyant-travel/catalog@0.116.0
  - @voyant-travel/identity@0.118.0
  - @voyant-travel/suppliers@0.111.4

## 0.109.3

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/bookings@0.117.1
  - @voyant-travel/products@0.117.1
  - @voyant-travel/suppliers@0.111.3
  - @voyant-travel/availability@0.114.1
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/hono@0.108.0
  - @voyant-travel/catalog@0.115.1
  - @voyant-travel/identity@0.117.1
  - @voyant-travel/workflows@0.107.3

## 0.109.2

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/bookings@0.117.0
  - @voyant-travel/catalog@0.115.0
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/hono@0.107.0
  - @voyant-travel/availability@0.114.0
  - @voyant-travel/products@0.117.0
  - @voyant-travel/identity@0.117.0
  - @voyant-travel/suppliers@0.111.2
  - @voyant-travel/workflows@0.107.2

## 0.109.1

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/hono@0.106.0
  - @voyant-travel/products@0.116.0
  - @voyant-travel/availability@0.113.0
  - @voyant-travel/bookings@0.116.0
  - @voyant-travel/catalog@0.114.0
  - @voyant-travel/identity@0.116.0
  - @voyant-travel/suppliers@0.111.1
  - @voyant-travel/workflows@0.107.1

## 0.109.0

### Patch Changes

- @voyant-travel/availability@0.112.0
- @voyant-travel/bookings@0.115.0
- @voyant-travel/catalog@0.113.0
- @voyant-travel/identity@0.115.0
- @voyant-travel/products@0.115.0
- @voyant-travel/suppliers@0.111.0

## 0.108.0

### Patch Changes

- @voyant-travel/availability@0.111.0
- @voyant-travel/bookings@0.114.0
- @voyant-travel/catalog@0.112.0
- @voyant-travel/identity@0.114.0
- @voyant-travel/products@0.114.0
- @voyant-travel/suppliers@0.110.1

## 0.107.3

### Patch Changes

- @voyant-travel/availability@0.110.0
- @voyant-travel/bookings@0.113.0
- @voyant-travel/catalog@0.111.0
- @voyant-travel/identity@0.113.0
- @voyant-travel/products@0.113.0
- @voyant-travel/suppliers@0.110.0

## 0.107.2

### Patch Changes

- @voyant-travel/availability@0.109.0
- @voyant-travel/bookings@0.112.0
- @voyant-travel/catalog@0.110.0
- @voyant-travel/identity@0.112.0
- @voyant-travel/products@0.112.0
- @voyant-travel/suppliers@0.109.0

## 0.107.1

### Patch Changes

- @voyant-travel/availability@0.108.0
- @voyant-travel/bookings@0.111.0
- @voyant-travel/catalog@0.109.0
- @voyant-travel/identity@0.111.0
- @voyant-travel/products@0.111.0
- @voyant-travel/suppliers@0.108.0

## 0.107.0

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/availability@0.107.0
  - @voyant-travel/bookings@0.110.0
  - @voyant-travel/catalog@0.108.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/hono@0.105.3
  - @voyant-travel/identity@0.110.0
  - @voyant-travel/products@0.110.0
  - @voyant-travel/suppliers@0.107.0
  - @voyant-travel/workflows@0.107.0

## 0.106.0

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/availability@0.106.0
  - @voyant-travel/bookings@0.109.0
  - @voyant-travel/catalog@0.107.0
  - @voyant-travel/identity@0.109.0
  - @voyant-travel/products@0.109.0
  - @voyant-travel/suppliers@0.106.0
  - @voyant-travel/workflows@0.106.0
  - @voyant-travel/hono@0.105.2

## 0.105.2

### Patch Changes

- Updated dependencies [7122c2a]
  - @voyant-travel/catalog@0.106.0
  - @voyant-travel/products@0.108.0
  - @voyant-travel/availability@0.105.2
  - @voyant-travel/bookings@0.108.0
  - @voyant-travel/identity@0.108.0
  - @voyant-travel/suppliers@0.105.2
  - @voyant-travel/workflows@0.105.2

## 0.105.1

### Patch Changes

- Updated dependencies [656b25d]
  - @voyant-travel/hono@0.105.0
  - @voyant-travel/availability@0.105.1
  - @voyant-travel/bookings@0.107.1
  - @voyant-travel/catalog@0.105.1
  - @voyant-travel/identity@0.107.1
  - @voyant-travel/products@0.107.1
  - @voyant-travel/suppliers@0.105.1
  - @voyant-travel/workflows@0.105.1

## 0.105.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/catalog@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/availability@0.105.0
  - @voyant-travel/bookings@0.107.0
  - @voyant-travel/hono@0.104.2
  - @voyant-travel/identity@0.107.0
  - @voyant-travel/products@0.107.0
  - @voyant-travel/suppliers@0.105.0
  - @voyant-travel/workflows@0.105.0

## 0.104.3

### Patch Changes

- @voyant-travel/bookings@0.106.0
- @voyant-travel/identity@0.106.0
- @voyant-travel/products@0.106.0
- @voyant-travel/suppliers@0.104.3
- @voyant-travel/availability@0.104.1

## 0.104.2

### Patch Changes

- Updated dependencies [921f4fc]
  - @voyant-travel/products@0.105.0
  - @voyant-travel/catalog@0.104.4
  - @voyant-travel/availability@0.104.1
  - @voyant-travel/bookings@0.105.0
  - @voyant-travel/identity@0.105.0
  - @voyant-travel/suppliers@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/availability@0.104.1
- @voyant-travel/bookings@0.104.1
- @voyant-travel/catalog@0.104.1
- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/hono@0.104.1
- @voyant-travel/identity@0.104.1
- @voyant-travel/products@0.104.1
- @voyant-travel/suppliers@0.104.1
- @voyant-travel/workflows@0.104.1

## 0.104.0

### Patch Changes

- Updated dependencies [e2ae9ff]
  - @voyant-travel/availability@0.104.0
  - @voyant-travel/bookings@0.104.0
  - @voyant-travel/catalog@0.104.0
  - @voyant-travel/core@0.104.0
  - @voyant-travel/db@0.104.0
  - @voyant-travel/hono@0.104.0
  - @voyant-travel/identity@0.104.0
  - @voyant-travel/products@0.104.0
  - @voyant-travel/suppliers@0.104.0
  - @voyant-travel/workflows@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/availability@0.103.0
- @voyant-travel/bookings@0.103.0
- @voyant-travel/catalog@0.103.0
- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/hono@0.103.0
- @voyant-travel/identity@0.103.0
- @voyant-travel/products@0.103.0
- @voyant-travel/suppliers@0.103.0
- @voyant-travel/workflows@0.103.0

## 0.102.0

### Patch Changes

- Updated dependencies [b6d0673]
  - @voyant-travel/availability@0.102.0
  - @voyant-travel/bookings@0.102.0
  - @voyant-travel/catalog@0.102.0
  - @voyant-travel/core@0.102.0
  - @voyant-travel/db@0.102.0
  - @voyant-travel/hono@0.102.0
  - @voyant-travel/identity@0.102.0
  - @voyant-travel/products@0.102.0
  - @voyant-travel/suppliers@0.102.0
  - @voyant-travel/workflows@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
  - @voyant-travel/availability@0.101.2
  - @voyant-travel/bookings@0.101.2
  - @voyant-travel/catalog@0.101.2
  - @voyant-travel/core@0.101.2
  - @voyant-travel/db@0.101.2
  - @voyant-travel/hono@0.101.2
  - @voyant-travel/identity@0.101.2
  - @voyant-travel/products@0.101.2
  - @voyant-travel/suppliers@0.101.2
  - @voyant-travel/workflows@0.101.2

## 0.101.1

### Patch Changes

- Updated dependencies [f736ba5]
  - @voyant-travel/availability@0.101.1
  - @voyant-travel/bookings@0.101.1
  - @voyant-travel/catalog@0.101.1
  - @voyant-travel/core@0.101.1
  - @voyant-travel/db@0.101.1
  - @voyant-travel/hono@0.101.1
  - @voyant-travel/identity@0.101.1
  - @voyant-travel/products@0.101.1
  - @voyant-travel/suppliers@0.101.1
  - @voyant-travel/workflows@0.101.1

## 0.101.0

### Patch Changes

- Updated dependencies [8e7b56a]
  - @voyant-travel/availability@0.101.0
  - @voyant-travel/bookings@0.101.0
  - @voyant-travel/catalog@0.101.0
  - @voyant-travel/core@0.101.0
  - @voyant-travel/db@0.101.0
  - @voyant-travel/hono@0.101.0
  - @voyant-travel/identity@0.101.0
  - @voyant-travel/products@0.101.0
  - @voyant-travel/suppliers@0.101.0
  - @voyant-travel/workflows@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/availability@0.100.0
- @voyant-travel/bookings@0.100.0
- @voyant-travel/catalog@0.100.0
- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/hono@0.100.0
- @voyant-travel/identity@0.100.0
- @voyant-travel/products@0.100.0
- @voyant-travel/suppliers@0.100.0
- @voyant-travel/workflows@0.100.0

## 0.99.0

### Patch Changes

- Updated dependencies [b7dde79]
  - @voyant-travel/availability@0.99.0
  - @voyant-travel/bookings@0.99.0
  - @voyant-travel/catalog@0.99.0
  - @voyant-travel/core@0.99.0
  - @voyant-travel/db@0.99.0
  - @voyant-travel/hono@0.99.0
  - @voyant-travel/identity@0.99.0
  - @voyant-travel/products@0.99.0
  - @voyant-travel/suppliers@0.99.0
  - @voyant-travel/workflows@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/availability@0.98.0
- @voyant-travel/bookings@0.98.0
- @voyant-travel/catalog@0.98.0
- @voyant-travel/core@0.98.0
- @voyant-travel/db@0.98.0
- @voyant-travel/hono@0.98.0
- @voyant-travel/identity@0.98.0
- @voyant-travel/products@0.98.0
- @voyant-travel/suppliers@0.98.0
- @voyant-travel/workflows@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/availability@0.97.0
  - @voyant-travel/bookings@0.97.0
  - @voyant-travel/catalog@0.97.0
  - @voyant-travel/core@0.97.0
  - @voyant-travel/db@0.97.0
  - @voyant-travel/hono@0.97.0
  - @voyant-travel/identity@0.97.0
  - @voyant-travel/products@0.97.0
  - @voyant-travel/suppliers@0.97.0
  - @voyant-travel/workflows@0.97.0

## 0.96.0

### Patch Changes

- Updated dependencies [2d8d59b]
- Updated dependencies [465fb31]
  - @voyant-travel/availability@0.96.0
  - @voyant-travel/bookings@0.96.0
  - @voyant-travel/catalog@0.96.0
  - @voyant-travel/core@0.96.0
  - @voyant-travel/db@0.96.0
  - @voyant-travel/hono@0.96.0
  - @voyant-travel/identity@0.96.0
  - @voyant-travel/products@0.96.0
  - @voyant-travel/suppliers@0.96.0
  - @voyant-travel/workflows@0.96.0

## 0.95.0

### Patch Changes

- Updated dependencies [a8d3a3f]
  - @voyant-travel/availability@0.95.0
  - @voyant-travel/bookings@0.95.0
  - @voyant-travel/catalog@0.95.0
  - @voyant-travel/core@0.95.0
  - @voyant-travel/db@0.95.0
  - @voyant-travel/hono@0.95.0
  - @voyant-travel/identity@0.95.0
  - @voyant-travel/products@0.95.0
  - @voyant-travel/suppliers@0.95.0
  - @voyant-travel/workflows@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/availability@0.94.0
- @voyant-travel/bookings@0.94.0
- @voyant-travel/catalog@0.94.0
- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/hono@0.94.0
- @voyant-travel/identity@0.94.0
- @voyant-travel/products@0.94.0
- @voyant-travel/suppliers@0.94.0
- @voyant-travel/workflows@0.94.0

## 0.93.0

### Patch Changes

- Updated dependencies [5df6824]
  - @voyant-travel/availability@0.93.0
  - @voyant-travel/bookings@0.93.0
  - @voyant-travel/catalog@0.93.0
  - @voyant-travel/core@0.93.0
  - @voyant-travel/db@0.93.0
  - @voyant-travel/hono@0.93.0
  - @voyant-travel/identity@0.93.0
  - @voyant-travel/products@0.93.0
  - @voyant-travel/suppliers@0.93.0
  - @voyant-travel/workflows@0.93.0

## 0.92.0

### Patch Changes

- Updated dependencies [5de3d72]
  - @voyant-travel/availability@0.92.0
  - @voyant-travel/bookings@0.92.0
  - @voyant-travel/catalog@0.92.0
  - @voyant-travel/core@0.92.0
  - @voyant-travel/db@0.92.0
  - @voyant-travel/hono@0.92.0
  - @voyant-travel/identity@0.92.0
  - @voyant-travel/products@0.92.0
  - @voyant-travel/suppliers@0.92.0
  - @voyant-travel/workflows@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/availability@0.91.0
  - @voyant-travel/bookings@0.91.0
  - @voyant-travel/catalog@0.91.0
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/hono@0.91.0
  - @voyant-travel/identity@0.91.0
  - @voyant-travel/products@0.91.0
  - @voyant-travel/suppliers@0.91.0
  - @voyant-travel/workflows@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/availability@0.90.0
- @voyant-travel/bookings@0.90.0
- @voyant-travel/catalog@0.90.0
- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/hono@0.90.0
- @voyant-travel/identity@0.90.0
- @voyant-travel/products@0.90.0
- @voyant-travel/suppliers@0.90.0
- @voyant-travel/workflows@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/availability@0.89.0
- @voyant-travel/bookings@0.89.0
- @voyant-travel/catalog@0.89.0
- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/hono@0.89.0
- @voyant-travel/identity@0.89.0
- @voyant-travel/products@0.89.0
- @voyant-travel/suppliers@0.89.0
- @voyant-travel/workflows@0.89.0

## 0.88.0

### Patch Changes

- Updated dependencies [27afa4b]
  - @voyant-travel/availability@0.88.0
  - @voyant-travel/bookings@0.88.0
  - @voyant-travel/catalog@0.88.0
  - @voyant-travel/core@0.88.0
  - @voyant-travel/db@0.88.0
  - @voyant-travel/hono@0.88.0
  - @voyant-travel/identity@0.88.0
  - @voyant-travel/products@0.88.0
  - @voyant-travel/suppliers@0.88.0
  - @voyant-travel/workflows@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/availability@0.87.1
- @voyant-travel/bookings@0.87.1
- @voyant-travel/catalog@0.87.1
- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/hono@0.87.1
- @voyant-travel/identity@0.87.1
- @voyant-travel/products@0.87.1
- @voyant-travel/suppliers@0.87.1
- @voyant-travel/workflows@0.87.1

## 0.87.0

### Patch Changes

- Updated dependencies [85505e6]
  - @voyant-travel/availability@0.87.0
  - @voyant-travel/bookings@0.87.0
  - @voyant-travel/catalog@0.87.0
  - @voyant-travel/core@0.87.0
  - @voyant-travel/db@0.87.0
  - @voyant-travel/hono@0.87.0
  - @voyant-travel/identity@0.87.0
  - @voyant-travel/products@0.87.0
  - @voyant-travel/suppliers@0.87.0
  - @voyant-travel/workflows@0.87.0

## 0.86.0

### Patch Changes

- Updated dependencies [ddf4a19]
  - @voyant-travel/availability@0.86.0
  - @voyant-travel/bookings@0.86.0
  - @voyant-travel/catalog@0.86.0
  - @voyant-travel/core@0.86.0
  - @voyant-travel/db@0.86.0
  - @voyant-travel/hono@0.86.0
  - @voyant-travel/identity@0.86.0
  - @voyant-travel/products@0.86.0
  - @voyant-travel/suppliers@0.86.0
  - @voyant-travel/workflows@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/availability@0.85.4
- @voyant-travel/bookings@0.85.4
- @voyant-travel/catalog@0.85.4
- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/hono@0.85.4
- @voyant-travel/identity@0.85.4
- @voyant-travel/products@0.85.4
- @voyant-travel/suppliers@0.85.4
- @voyant-travel/workflows@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/availability@0.85.3
- @voyant-travel/bookings@0.85.3
- @voyant-travel/catalog@0.85.3
- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/hono@0.85.3
- @voyant-travel/identity@0.85.3
- @voyant-travel/products@0.85.3
- @voyant-travel/suppliers@0.85.3
- @voyant-travel/workflows@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/availability@0.85.2
  - @voyant-travel/bookings@0.85.2
  - @voyant-travel/catalog@0.85.2
  - @voyant-travel/core@0.85.2
  - @voyant-travel/db@0.85.2
  - @voyant-travel/hono@0.85.2
  - @voyant-travel/identity@0.85.2
  - @voyant-travel/products@0.85.2
  - @voyant-travel/suppliers@0.85.2
  - @voyant-travel/workflows@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/availability@0.85.1
- @voyant-travel/bookings@0.85.1
- @voyant-travel/catalog@0.85.1
- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/hono@0.85.1
- @voyant-travel/identity@0.85.1
- @voyant-travel/products@0.85.1
- @voyant-travel/suppliers@0.85.1
- @voyant-travel/workflows@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/availability@0.85.0
- @voyant-travel/bookings@0.85.0
- @voyant-travel/catalog@0.85.0
- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/hono@0.85.0
- @voyant-travel/identity@0.85.0
- @voyant-travel/products@0.85.0
- @voyant-travel/suppliers@0.85.0
- @voyant-travel/workflows@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/availability@0.84.4
- @voyant-travel/bookings@0.84.4
- @voyant-travel/catalog@0.84.4
- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/hono@0.84.4
- @voyant-travel/identity@0.84.4
- @voyant-travel/products@0.84.4
- @voyant-travel/suppliers@0.84.4
- @voyant-travel/workflows@0.84.4

## 0.84.3

### Patch Changes

- Updated dependencies [9eadf50]
  - @voyant-travel/availability@0.84.3
  - @voyant-travel/bookings@0.84.3
  - @voyant-travel/catalog@0.84.3
  - @voyant-travel/core@0.84.3
  - @voyant-travel/db@0.84.3
  - @voyant-travel/hono@0.84.3
  - @voyant-travel/identity@0.84.3
  - @voyant-travel/products@0.84.3
  - @voyant-travel/suppliers@0.84.3
  - @voyant-travel/workflows@0.84.3

## 0.84.2

### Patch Changes

- Updated dependencies [29c6e83]
  - @voyant-travel/availability@0.84.2
  - @voyant-travel/bookings@0.84.2
  - @voyant-travel/catalog@0.84.2
  - @voyant-travel/core@0.84.2
  - @voyant-travel/db@0.84.2
  - @voyant-travel/hono@0.84.2
  - @voyant-travel/identity@0.84.2
  - @voyant-travel/products@0.84.2
  - @voyant-travel/suppliers@0.84.2
  - @voyant-travel/workflows@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/availability@0.84.1
  - @voyant-travel/bookings@0.84.1
  - @voyant-travel/catalog@0.84.1
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/hono@0.84.1
  - @voyant-travel/identity@0.84.1
  - @voyant-travel/products@0.84.1
  - @voyant-travel/suppliers@0.84.1
  - @voyant-travel/workflows@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/availability@0.84.0
  - @voyant-travel/bookings@0.84.0
  - @voyant-travel/catalog@0.84.0
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/hono@0.84.0
  - @voyant-travel/identity@0.84.0
  - @voyant-travel/products@0.84.0
  - @voyant-travel/suppliers@0.84.0
  - @voyant-travel/workflows@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/availability@0.83.1
- @voyant-travel/bookings@0.83.1
- @voyant-travel/catalog@0.83.1
- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/hono@0.83.1
- @voyant-travel/identity@0.83.1
- @voyant-travel/products@0.83.1
- @voyant-travel/suppliers@0.83.1
- @voyant-travel/workflows@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/availability@0.83.0
- @voyant-travel/bookings@0.83.0
- @voyant-travel/catalog@0.83.0
- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/hono@0.83.0
- @voyant-travel/identity@0.83.0
- @voyant-travel/products@0.83.0
- @voyant-travel/suppliers@0.83.0
- @voyant-travel/workflows@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/availability@0.82.1
- @voyant-travel/bookings@0.82.1
- @voyant-travel/catalog@0.82.1
- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/hono@0.82.1
- @voyant-travel/identity@0.82.1
- @voyant-travel/products@0.82.1
- @voyant-travel/suppliers@0.82.1
- @voyant-travel/workflows@0.82.1

## 0.82.0

### Patch Changes

- Updated dependencies [79ce168]
  - @voyant-travel/availability@0.82.0
  - @voyant-travel/bookings@0.82.0
  - @voyant-travel/catalog@0.82.0
  - @voyant-travel/core@0.82.0
  - @voyant-travel/db@0.82.0
  - @voyant-travel/hono@0.82.0
  - @voyant-travel/identity@0.82.0
  - @voyant-travel/products@0.82.0
  - @voyant-travel/suppliers@0.82.0
  - @voyant-travel/workflows@0.82.0

## 0.81.21

### Patch Changes

- Updated dependencies [b9fb5b0]
  - @voyant-travel/availability@0.81.21
  - @voyant-travel/bookings@0.81.21
  - @voyant-travel/catalog@0.81.21
  - @voyant-travel/core@0.81.21
  - @voyant-travel/db@0.81.21
  - @voyant-travel/hono@0.81.21
  - @voyant-travel/identity@0.81.21
  - @voyant-travel/products@0.81.21
  - @voyant-travel/suppliers@0.81.21
  - @voyant-travel/workflows@0.81.21

## 0.81.20

### Patch Changes

- Updated dependencies [e60a50d]
  - @voyant-travel/availability@0.81.20
  - @voyant-travel/bookings@0.81.20
  - @voyant-travel/catalog@0.81.20
  - @voyant-travel/core@0.81.20
  - @voyant-travel/db@0.81.20
  - @voyant-travel/hono@0.81.20
  - @voyant-travel/identity@0.81.20
  - @voyant-travel/products@0.81.20
  - @voyant-travel/suppliers@0.81.20
  - @voyant-travel/workflows@0.81.20

## 0.81.19

### Patch Changes

- Updated dependencies [62e4be5]
  - @voyant-travel/availability@0.81.19
  - @voyant-travel/bookings@0.81.19
  - @voyant-travel/catalog@0.81.19
  - @voyant-travel/core@0.81.19
  - @voyant-travel/db@0.81.19
  - @voyant-travel/hono@0.81.19
  - @voyant-travel/identity@0.81.19
  - @voyant-travel/products@0.81.19
  - @voyant-travel/suppliers@0.81.19
  - @voyant-travel/workflows@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/availability@0.81.18
- @voyant-travel/bookings@0.81.18
- @voyant-travel/catalog@0.81.18
- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/hono@0.81.18
- @voyant-travel/identity@0.81.18
- @voyant-travel/products@0.81.18
- @voyant-travel/suppliers@0.81.18
- @voyant-travel/workflows@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/availability@0.81.17
- @voyant-travel/bookings@0.81.17
- @voyant-travel/catalog@0.81.17
- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/hono@0.81.17
- @voyant-travel/identity@0.81.17
- @voyant-travel/products@0.81.17
- @voyant-travel/suppliers@0.81.17
- @voyant-travel/workflows@0.81.17

## 0.81.16

### Patch Changes

- Updated dependencies [0a617cc]
  - @voyant-travel/availability@0.81.16
  - @voyant-travel/bookings@0.81.16
  - @voyant-travel/catalog@0.81.16
  - @voyant-travel/core@0.81.16
  - @voyant-travel/db@0.81.16
  - @voyant-travel/hono@0.81.16
  - @voyant-travel/identity@0.81.16
  - @voyant-travel/products@0.81.16
  - @voyant-travel/suppliers@0.81.16
  - @voyant-travel/workflows@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/availability@0.81.15
- @voyant-travel/bookings@0.81.15
- @voyant-travel/catalog@0.81.15
- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/hono@0.81.15
- @voyant-travel/identity@0.81.15
- @voyant-travel/products@0.81.15
- @voyant-travel/suppliers@0.81.15
- @voyant-travel/workflows@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/availability@0.81.14
- @voyant-travel/bookings@0.81.14
- @voyant-travel/catalog@0.81.14
- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/hono@0.81.14
- @voyant-travel/identity@0.81.14
- @voyant-travel/products@0.81.14
- @voyant-travel/suppliers@0.81.14
- @voyant-travel/workflows@0.81.14

## 0.81.13

### Patch Changes

- Updated dependencies [28dca55]
  - @voyant-travel/availability@0.81.13
  - @voyant-travel/bookings@0.81.13
  - @voyant-travel/catalog@0.81.13
  - @voyant-travel/core@0.81.13
  - @voyant-travel/db@0.81.13
  - @voyant-travel/hono@0.81.13
  - @voyant-travel/identity@0.81.13
  - @voyant-travel/products@0.81.13
  - @voyant-travel/suppliers@0.81.13
  - @voyant-travel/workflows@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/availability@0.81.12
- @voyant-travel/bookings@0.81.12
- @voyant-travel/catalog@0.81.12
- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/hono@0.81.12
- @voyant-travel/identity@0.81.12
- @voyant-travel/products@0.81.12
- @voyant-travel/suppliers@0.81.12
- @voyant-travel/workflows@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/availability@0.81.11
- @voyant-travel/bookings@0.81.11
- @voyant-travel/catalog@0.81.11
- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/hono@0.81.11
- @voyant-travel/identity@0.81.11
- @voyant-travel/products@0.81.11
- @voyant-travel/suppliers@0.81.11
- @voyant-travel/workflows@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/availability@0.81.10
- @voyant-travel/bookings@0.81.10
- @voyant-travel/catalog@0.81.10
- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/hono@0.81.10
- @voyant-travel/identity@0.81.10
- @voyant-travel/products@0.81.10
- @voyant-travel/suppliers@0.81.10
- @voyant-travel/workflows@0.81.10

## 0.81.9

### Patch Changes

- Updated dependencies [1a58939]
  - @voyant-travel/availability@0.81.9
  - @voyant-travel/bookings@0.81.9
  - @voyant-travel/catalog@0.81.9
  - @voyant-travel/core@0.81.9
  - @voyant-travel/db@0.81.9
  - @voyant-travel/hono@0.81.9
  - @voyant-travel/identity@0.81.9
  - @voyant-travel/products@0.81.9
  - @voyant-travel/suppliers@0.81.9
  - @voyant-travel/workflows@0.81.9

## 0.81.8

### Patch Changes

- Updated dependencies [688ac4f]
  - @voyant-travel/availability@0.81.8
  - @voyant-travel/bookings@0.81.8
  - @voyant-travel/catalog@0.81.8
  - @voyant-travel/core@0.81.8
  - @voyant-travel/db@0.81.8
  - @voyant-travel/hono@0.81.8
  - @voyant-travel/identity@0.81.8
  - @voyant-travel/products@0.81.8
  - @voyant-travel/suppliers@0.81.8
  - @voyant-travel/workflows@0.81.8

## 0.81.7

### Patch Changes

- Updated dependencies [410cd17]
  - @voyant-travel/availability@0.81.7
  - @voyant-travel/bookings@0.81.7
  - @voyant-travel/catalog@0.81.7
  - @voyant-travel/core@0.81.7
  - @voyant-travel/db@0.81.7
  - @voyant-travel/hono@0.81.7
  - @voyant-travel/identity@0.81.7
  - @voyant-travel/products@0.81.7
  - @voyant-travel/suppliers@0.81.7
  - @voyant-travel/workflows@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/availability@0.81.6
- @voyant-travel/bookings@0.81.6
- @voyant-travel/catalog@0.81.6
- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/hono@0.81.6
- @voyant-travel/identity@0.81.6
- @voyant-travel/products@0.81.6
- @voyant-travel/suppliers@0.81.6
- @voyant-travel/workflows@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/availability@0.81.5
- @voyant-travel/bookings@0.81.5
- @voyant-travel/catalog@0.81.5
- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/hono@0.81.5
- @voyant-travel/identity@0.81.5
- @voyant-travel/products@0.81.5
- @voyant-travel/suppliers@0.81.5
- @voyant-travel/workflows@0.81.5

## 0.81.4

### Patch Changes

- Updated dependencies [6daefc4]
  - @voyant-travel/availability@0.81.4
  - @voyant-travel/bookings@0.81.4
  - @voyant-travel/catalog@0.81.4
  - @voyant-travel/core@0.81.4
  - @voyant-travel/db@0.81.4
  - @voyant-travel/hono@0.81.4
  - @voyant-travel/identity@0.81.4
  - @voyant-travel/products@0.81.4
  - @voyant-travel/suppliers@0.81.4
  - @voyant-travel/workflows@0.81.4

## 0.81.3

### Patch Changes

- Updated dependencies [f157bcd]
  - @voyant-travel/availability@0.81.3
  - @voyant-travel/bookings@0.81.3
  - @voyant-travel/catalog@0.81.3
  - @voyant-travel/core@0.81.3
  - @voyant-travel/db@0.81.3
  - @voyant-travel/hono@0.81.3
  - @voyant-travel/identity@0.81.3
  - @voyant-travel/products@0.81.3
  - @voyant-travel/suppliers@0.81.3
  - @voyant-travel/workflows@0.81.3

## 0.81.2

### Patch Changes

- Updated dependencies [6ca8aa8]
  - @voyant-travel/availability@0.81.2
  - @voyant-travel/bookings@0.81.2
  - @voyant-travel/catalog@0.81.2
  - @voyant-travel/core@0.81.2
  - @voyant-travel/db@0.81.2
  - @voyant-travel/hono@0.81.2
  - @voyant-travel/identity@0.81.2
  - @voyant-travel/products@0.81.2
  - @voyant-travel/suppliers@0.81.2
  - @voyant-travel/workflows@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/availability@0.81.1
- @voyant-travel/bookings@0.81.1
- @voyant-travel/catalog@0.81.1
- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/hono@0.81.1
- @voyant-travel/identity@0.81.1
- @voyant-travel/products@0.81.1
- @voyant-travel/suppliers@0.81.1
- @voyant-travel/workflows@0.81.1

## 0.81.0

### Patch Changes

- Updated dependencies [f35e63c]
  - @voyant-travel/availability@0.81.0
  - @voyant-travel/bookings@0.81.0
  - @voyant-travel/catalog@0.81.0
  - @voyant-travel/core@0.81.0
  - @voyant-travel/db@0.81.0
  - @voyant-travel/hono@0.81.0
  - @voyant-travel/identity@0.81.0
  - @voyant-travel/products@0.81.0
  - @voyant-travel/suppliers@0.81.0
  - @voyant-travel/workflows@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/availability@0.80.18
- @voyant-travel/bookings@0.80.18
- @voyant-travel/catalog@0.80.18
- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/hono@0.80.18
- @voyant-travel/identity@0.80.18
- @voyant-travel/products@0.80.18
- @voyant-travel/suppliers@0.80.18
- @voyant-travel/workflows@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/availability@0.80.17
- @voyant-travel/bookings@0.80.17
- @voyant-travel/catalog@0.80.17
- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/hono@0.80.17
- @voyant-travel/identity@0.80.17
- @voyant-travel/products@0.80.17
- @voyant-travel/suppliers@0.80.17
- @voyant-travel/workflows@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/availability@0.80.16
- @voyant-travel/bookings@0.80.16
- @voyant-travel/catalog@0.80.16
- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/hono@0.80.16
- @voyant-travel/identity@0.80.16
- @voyant-travel/products@0.80.16
- @voyant-travel/suppliers@0.80.16
- @voyant-travel/workflows@0.80.16

## 0.80.15

### Patch Changes

- Updated dependencies [0d8d14e]
  - @voyant-travel/availability@0.80.15
  - @voyant-travel/bookings@0.80.15
  - @voyant-travel/catalog@0.80.15
  - @voyant-travel/core@0.80.15
  - @voyant-travel/db@0.80.15
  - @voyant-travel/hono@0.80.15
  - @voyant-travel/identity@0.80.15
  - @voyant-travel/products@0.80.15
  - @voyant-travel/suppliers@0.80.15
  - @voyant-travel/workflows@0.80.15

## 0.80.14

### Patch Changes

- Updated dependencies [2dd6d0f]
  - @voyant-travel/availability@0.80.14
  - @voyant-travel/bookings@0.80.14
  - @voyant-travel/catalog@0.80.14
  - @voyant-travel/core@0.80.14
  - @voyant-travel/db@0.80.14
  - @voyant-travel/hono@0.80.14
  - @voyant-travel/identity@0.80.14
  - @voyant-travel/products@0.80.14
  - @voyant-travel/suppliers@0.80.14
  - @voyant-travel/workflows@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/availability@0.80.13
- @voyant-travel/bookings@0.80.13
- @voyant-travel/catalog@0.80.13
- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/hono@0.80.13
- @voyant-travel/identity@0.80.13
- @voyant-travel/products@0.80.13
- @voyant-travel/suppliers@0.80.13
- @voyant-travel/workflows@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/availability@0.80.12
- @voyant-travel/bookings@0.80.12
- @voyant-travel/catalog@0.80.12
- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/hono@0.80.12
- @voyant-travel/identity@0.80.12
- @voyant-travel/products@0.80.12
- @voyant-travel/suppliers@0.80.12
- @voyant-travel/workflows@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/availability@0.80.11
- @voyant-travel/bookings@0.80.11
- @voyant-travel/catalog@0.80.11
- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/hono@0.80.11
- @voyant-travel/identity@0.80.11
- @voyant-travel/products@0.80.11
- @voyant-travel/suppliers@0.80.11
- @voyant-travel/workflows@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/availability@0.80.10
- @voyant-travel/bookings@0.80.10
- @voyant-travel/catalog@0.80.10
- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/hono@0.80.10
- @voyant-travel/identity@0.80.10
- @voyant-travel/products@0.80.10
- @voyant-travel/suppliers@0.80.10
- @voyant-travel/workflows@0.80.10

## 0.80.9

### Patch Changes

- Updated dependencies [37aa8b6]
  - @voyant-travel/availability@0.80.9
  - @voyant-travel/bookings@0.80.9
  - @voyant-travel/catalog@0.80.9
  - @voyant-travel/core@0.80.9
  - @voyant-travel/db@0.80.9
  - @voyant-travel/hono@0.80.9
  - @voyant-travel/identity@0.80.9
  - @voyant-travel/products@0.80.9
  - @voyant-travel/suppliers@0.80.9
  - @voyant-travel/workflows@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/availability@0.80.8
- @voyant-travel/bookings@0.80.8
- @voyant-travel/catalog@0.80.8
- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/hono@0.80.8
- @voyant-travel/identity@0.80.8
- @voyant-travel/products@0.80.8
- @voyant-travel/suppliers@0.80.8
- @voyant-travel/workflows@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/availability@0.80.7
- @voyant-travel/bookings@0.80.7
- @voyant-travel/catalog@0.80.7
- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/hono@0.80.7
- @voyant-travel/identity@0.80.7
- @voyant-travel/products@0.80.7
- @voyant-travel/suppliers@0.80.7
- @voyant-travel/workflows@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/availability@0.80.6
- @voyant-travel/bookings@0.80.6
- @voyant-travel/catalog@0.80.6
- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/hono@0.80.6
- @voyant-travel/identity@0.80.6
- @voyant-travel/products@0.80.6
- @voyant-travel/suppliers@0.80.6
- @voyant-travel/workflows@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/availability@0.80.5
- @voyant-travel/bookings@0.80.5
- @voyant-travel/catalog@0.80.5
- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/hono@0.80.5
- @voyant-travel/identity@0.80.5
- @voyant-travel/products@0.80.5
- @voyant-travel/suppliers@0.80.5
- @voyant-travel/workflows@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/availability@0.80.4
- @voyant-travel/bookings@0.80.4
- @voyant-travel/catalog@0.80.4
- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/hono@0.80.4
- @voyant-travel/identity@0.80.4
- @voyant-travel/products@0.80.4
- @voyant-travel/suppliers@0.80.4
- @voyant-travel/workflows@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/availability@0.80.3
  - @voyant-travel/bookings@0.80.3
  - @voyant-travel/catalog@0.80.3
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/hono@0.80.3
  - @voyant-travel/identity@0.80.3
  - @voyant-travel/products@0.80.3
  - @voyant-travel/suppliers@0.80.3
  - @voyant-travel/workflows@0.80.3

## 0.80.2

### Patch Changes

- Updated dependencies [7a94871]
- Updated dependencies [9d6be13]
  - @voyant-travel/availability@0.80.2
  - @voyant-travel/bookings@0.80.2
  - @voyant-travel/catalog@0.80.2
  - @voyant-travel/core@0.80.2
  - @voyant-travel/db@0.80.2
  - @voyant-travel/hono@0.80.2
  - @voyant-travel/identity@0.80.2
  - @voyant-travel/products@0.80.2
  - @voyant-travel/suppliers@0.80.2
  - @voyant-travel/workflows@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/availability@0.80.1
- @voyant-travel/bookings@0.80.1
- @voyant-travel/catalog@0.80.1
- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/hono@0.80.1
- @voyant-travel/identity@0.80.1
- @voyant-travel/products@0.80.1
- @voyant-travel/suppliers@0.80.1
- @voyant-travel/workflows@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/availability@0.80.0
- @voyant-travel/bookings@0.80.0
- @voyant-travel/catalog@0.80.0
- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/hono@0.80.0
- @voyant-travel/identity@0.80.0
- @voyant-travel/products@0.80.0
- @voyant-travel/suppliers@0.80.0
- @voyant-travel/workflows@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/availability@0.79.0
- @voyant-travel/bookings@0.79.0
- @voyant-travel/catalog@0.79.0
- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/hono@0.79.0
- @voyant-travel/identity@0.79.0
- @voyant-travel/products@0.79.0
- @voyant-travel/suppliers@0.79.0
- @voyant-travel/workflows@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/availability@0.78.0
- @voyant-travel/bookings@0.78.0
- @voyant-travel/catalog@0.78.0
- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/hono@0.78.0
- @voyant-travel/identity@0.78.0
- @voyant-travel/products@0.78.0
- @voyant-travel/suppliers@0.78.0
- @voyant-travel/workflows@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/availability@0.77.13
- @voyant-travel/bookings@0.77.13
- @voyant-travel/catalog@0.77.13
- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/hono@0.77.13
- @voyant-travel/identity@0.77.13
- @voyant-travel/products@0.77.13
- @voyant-travel/suppliers@0.77.13
- @voyant-travel/workflows@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/availability@0.77.12
- @voyant-travel/bookings@0.77.12
- @voyant-travel/catalog@0.77.12
- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/hono@0.77.12
- @voyant-travel/identity@0.77.12
- @voyant-travel/products@0.77.12
- @voyant-travel/suppliers@0.77.12
- @voyant-travel/workflows@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/availability@0.77.11
- @voyant-travel/bookings@0.77.11
- @voyant-travel/catalog@0.77.11
- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/hono@0.77.11
- @voyant-travel/identity@0.77.11
- @voyant-travel/products@0.77.11
- @voyant-travel/suppliers@0.77.11
- @voyant-travel/workflows@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/availability@0.77.10
- @voyant-travel/bookings@0.77.10
- @voyant-travel/catalog@0.77.10
- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/hono@0.77.10
- @voyant-travel/identity@0.77.10
- @voyant-travel/products@0.77.10
- @voyant-travel/suppliers@0.77.10
- @voyant-travel/workflows@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/availability@0.77.9
- @voyant-travel/bookings@0.77.9
- @voyant-travel/catalog@0.77.9
- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/hono@0.77.9
- @voyant-travel/identity@0.77.9
- @voyant-travel/products@0.77.9
- @voyant-travel/suppliers@0.77.9
- @voyant-travel/workflows@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/availability@0.77.8
- @voyant-travel/bookings@0.77.8
- @voyant-travel/catalog@0.77.8
- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/hono@0.77.8
- @voyant-travel/identity@0.77.8
- @voyant-travel/products@0.77.8
- @voyant-travel/suppliers@0.77.8
- @voyant-travel/workflows@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/availability@0.77.7
- @voyant-travel/bookings@0.77.7
- @voyant-travel/catalog@0.77.7
- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/hono@0.77.7
- @voyant-travel/identity@0.77.7
- @voyant-travel/products@0.77.7
- @voyant-travel/suppliers@0.77.7
- @voyant-travel/workflows@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/availability@0.77.6
- @voyant-travel/bookings@0.77.6
- @voyant-travel/catalog@0.77.6
- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/hono@0.77.6
- @voyant-travel/identity@0.77.6
- @voyant-travel/products@0.77.6
- @voyant-travel/suppliers@0.77.6
- @voyant-travel/workflows@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/availability@0.77.5
- @voyant-travel/bookings@0.77.5
- @voyant-travel/catalog@0.77.5
- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/hono@0.77.5
- @voyant-travel/identity@0.77.5
- @voyant-travel/products@0.77.5
- @voyant-travel/suppliers@0.77.5
- @voyant-travel/workflows@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/availability@0.77.4
- @voyant-travel/bookings@0.77.4
- @voyant-travel/catalog@0.77.4
- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/hono@0.77.4
- @voyant-travel/identity@0.77.4
- @voyant-travel/products@0.77.4
- @voyant-travel/suppliers@0.77.4
- @voyant-travel/workflows@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/availability@0.77.3
- @voyant-travel/bookings@0.77.3
- @voyant-travel/catalog@0.77.3
- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/hono@0.77.3
- @voyant-travel/identity@0.77.3
- @voyant-travel/products@0.77.3
- @voyant-travel/suppliers@0.77.3
- @voyant-travel/workflows@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/availability@0.77.2
- @voyant-travel/bookings@0.77.2
- @voyant-travel/catalog@0.77.2
- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/hono@0.77.2
- @voyant-travel/identity@0.77.2
- @voyant-travel/products@0.77.2
- @voyant-travel/suppliers@0.77.2
- @voyant-travel/workflows@0.77.2

## 0.77.1

### Patch Changes

- Updated dependencies [574684d]
  - @voyant-travel/availability@0.77.1
  - @voyant-travel/bookings@0.77.1
  - @voyant-travel/catalog@0.77.1
  - @voyant-travel/core@0.77.1
  - @voyant-travel/db@0.77.1
  - @voyant-travel/hono@0.77.1
  - @voyant-travel/identity@0.77.1
  - @voyant-travel/products@0.77.1
  - @voyant-travel/suppliers@0.77.1
  - @voyant-travel/workflows@0.77.1

## 0.77.0

### Patch Changes

- Updated dependencies [1da934d]
  - @voyant-travel/availability@0.77.0
  - @voyant-travel/bookings@0.77.0
  - @voyant-travel/catalog@0.77.0
  - @voyant-travel/core@0.77.0
  - @voyant-travel/db@0.77.0
  - @voyant-travel/hono@0.77.0
  - @voyant-travel/identity@0.77.0
  - @voyant-travel/products@0.77.0
  - @voyant-travel/suppliers@0.77.0
  - @voyant-travel/workflows@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/availability@0.76.0
- @voyant-travel/bookings@0.76.0
- @voyant-travel/catalog@0.76.0
- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/hono@0.76.0
- @voyant-travel/identity@0.76.0
- @voyant-travel/products@0.76.0
- @voyant-travel/suppliers@0.76.0
- @voyant-travel/workflows@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/availability@0.75.7
- @voyant-travel/bookings@0.75.7
- @voyant-travel/catalog@0.75.7
- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/hono@0.75.7
- @voyant-travel/identity@0.75.7
- @voyant-travel/products@0.75.7
- @voyant-travel/suppliers@0.75.7
- @voyant-travel/workflows@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/availability@0.75.6
- @voyant-travel/bookings@0.75.6
- @voyant-travel/catalog@0.75.6
- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/hono@0.75.6
- @voyant-travel/identity@0.75.6
- @voyant-travel/products@0.75.6
- @voyant-travel/suppliers@0.75.6
- @voyant-travel/workflows@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/availability@0.75.5
- @voyant-travel/bookings@0.75.5
- @voyant-travel/catalog@0.75.5
- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/hono@0.75.5
- @voyant-travel/identity@0.75.5
- @voyant-travel/products@0.75.5
- @voyant-travel/suppliers@0.75.5
- @voyant-travel/workflows@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/availability@0.75.4
- @voyant-travel/bookings@0.75.4
- @voyant-travel/catalog@0.75.4
- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/hono@0.75.4
- @voyant-travel/identity@0.75.4
- @voyant-travel/products@0.75.4
- @voyant-travel/suppliers@0.75.4
- @voyant-travel/workflows@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/availability@0.75.3
- @voyant-travel/bookings@0.75.3
- @voyant-travel/catalog@0.75.3
- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/hono@0.75.3
- @voyant-travel/identity@0.75.3
- @voyant-travel/products@0.75.3
- @voyant-travel/suppliers@0.75.3
- @voyant-travel/workflows@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/availability@0.75.2
- @voyant-travel/bookings@0.75.2
- @voyant-travel/catalog@0.75.2
- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/hono@0.75.2
- @voyant-travel/identity@0.75.2
- @voyant-travel/products@0.75.2
- @voyant-travel/suppliers@0.75.2
- @voyant-travel/workflows@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/availability@0.75.1
- @voyant-travel/bookings@0.75.1
- @voyant-travel/catalog@0.75.1
- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/hono@0.75.1
- @voyant-travel/identity@0.75.1
- @voyant-travel/products@0.75.1
- @voyant-travel/suppliers@0.75.1
- @voyant-travel/workflows@0.75.1

## 0.75.0

### Patch Changes

- Updated dependencies [1eab599]
  - @voyant-travel/availability@0.75.0
  - @voyant-travel/bookings@0.75.0
  - @voyant-travel/catalog@0.75.0
  - @voyant-travel/core@0.75.0
  - @voyant-travel/db@0.75.0
  - @voyant-travel/hono@0.75.0
  - @voyant-travel/identity@0.75.0
  - @voyant-travel/products@0.75.0
  - @voyant-travel/suppliers@0.75.0
  - @voyant-travel/workflows@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/availability@0.74.2
- @voyant-travel/bookings@0.74.2
- @voyant-travel/catalog@0.74.2
- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/hono@0.74.2
- @voyant-travel/identity@0.74.2
- @voyant-travel/products@0.74.2
- @voyant-travel/suppliers@0.74.2
- @voyant-travel/workflows@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/availability@0.74.1
- @voyant-travel/bookings@0.74.1
- @voyant-travel/catalog@0.74.1
- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/hono@0.74.1
- @voyant-travel/identity@0.74.1
- @voyant-travel/products@0.74.1
- @voyant-travel/suppliers@0.74.1
- @voyant-travel/workflows@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/availability@0.74.0
- @voyant-travel/bookings@0.74.0
- @voyant-travel/catalog@0.74.0
- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/hono@0.74.0
- @voyant-travel/identity@0.74.0
- @voyant-travel/products@0.74.0
- @voyant-travel/suppliers@0.74.0
- @voyant-travel/workflows@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/availability@0.73.1
- @voyant-travel/bookings@0.73.1
- @voyant-travel/catalog@0.73.1
- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/hono@0.73.1
- @voyant-travel/identity@0.73.1
- @voyant-travel/products@0.73.1
- @voyant-travel/suppliers@0.73.1
- @voyant-travel/workflows@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/availability@0.73.0
- @voyant-travel/bookings@0.73.0
- @voyant-travel/catalog@0.73.0
- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/hono@0.73.0
- @voyant-travel/identity@0.73.0
- @voyant-travel/products@0.73.0
- @voyant-travel/suppliers@0.73.0
- @voyant-travel/workflows@0.73.0

## 0.72.0

### Patch Changes

- Updated dependencies [6a66b2b]
  - @voyant-travel/availability@0.72.0
  - @voyant-travel/bookings@0.72.0
  - @voyant-travel/catalog@0.72.0
  - @voyant-travel/core@0.72.0
  - @voyant-travel/db@0.72.0
  - @voyant-travel/hono@0.72.0
  - @voyant-travel/identity@0.72.0
  - @voyant-travel/products@0.72.0
  - @voyant-travel/suppliers@0.72.0
  - @voyant-travel/workflows@0.72.0

## 0.71.0

### Patch Changes

- Updated dependencies [9bdc9a6]
  - @voyant-travel/availability@0.71.0
  - @voyant-travel/bookings@0.71.0
  - @voyant-travel/catalog@0.71.0
  - @voyant-travel/core@0.71.0
  - @voyant-travel/db@0.71.0
  - @voyant-travel/hono@0.71.0
  - @voyant-travel/identity@0.71.0
  - @voyant-travel/products@0.71.0
  - @voyant-travel/suppliers@0.71.0
  - @voyant-travel/workflows@0.71.0

## 0.70.0

### Patch Changes

- Updated dependencies [09d5f82]
  - @voyant-travel/availability@0.70.0
  - @voyant-travel/bookings@0.70.0
  - @voyant-travel/catalog@0.70.0
  - @voyant-travel/core@0.70.0
  - @voyant-travel/db@0.70.0
  - @voyant-travel/hono@0.70.0
  - @voyant-travel/identity@0.70.0
  - @voyant-travel/products@0.70.0
  - @voyant-travel/suppliers@0.70.0
  - @voyant-travel/workflows@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/availability@0.69.1
- @voyant-travel/bookings@0.69.1
- @voyant-travel/catalog@0.69.1
- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/hono@0.69.1
- @voyant-travel/identity@0.69.1
- @voyant-travel/products@0.69.1
- @voyant-travel/suppliers@0.69.1
- @voyant-travel/workflows@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/availability@0.69.0
- @voyant-travel/bookings@0.69.0
- @voyant-travel/catalog@0.69.0
- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/hono@0.69.0
- @voyant-travel/identity@0.69.0
- @voyant-travel/products@0.69.0
- @voyant-travel/suppliers@0.69.0
- @voyant-travel/workflows@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/availability@0.68.0
- @voyant-travel/bookings@0.68.0
- @voyant-travel/catalog@0.68.0
- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/hono@0.68.0
- @voyant-travel/identity@0.68.0
- @voyant-travel/products@0.68.0
- @voyant-travel/suppliers@0.68.0
- @voyant-travel/workflows@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/availability@0.67.0
- @voyant-travel/bookings@0.67.0
- @voyant-travel/catalog@0.67.0
- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/hono@0.67.0
- @voyant-travel/identity@0.67.0
- @voyant-travel/products@0.67.0
- @voyant-travel/suppliers@0.67.0
- @voyant-travel/workflows@0.67.0

## 0.66.6

### Patch Changes

- Updated dependencies [f6634ff]
  - @voyant-travel/availability@0.66.6
  - @voyant-travel/bookings@0.66.6
  - @voyant-travel/catalog@0.66.6
  - @voyant-travel/core@0.66.6
  - @voyant-travel/db@0.66.6
  - @voyant-travel/hono@0.66.6
  - @voyant-travel/identity@0.66.6
  - @voyant-travel/products@0.66.6
  - @voyant-travel/suppliers@0.66.6
  - @voyant-travel/workflows@0.66.6

## 0.66.5

### Patch Changes

- Updated dependencies [ee36ef5]
  - @voyant-travel/availability@0.66.5
  - @voyant-travel/bookings@0.66.5
  - @voyant-travel/catalog@0.66.5
  - @voyant-travel/core@0.66.5
  - @voyant-travel/db@0.66.5
  - @voyant-travel/hono@0.66.5
  - @voyant-travel/identity@0.66.5
  - @voyant-travel/products@0.66.5
  - @voyant-travel/suppliers@0.66.5
  - @voyant-travel/workflows@0.66.5

## 0.66.4

### Patch Changes

- Updated dependencies [83ff2de]
  - @voyant-travel/availability@0.66.4
  - @voyant-travel/bookings@0.66.4
  - @voyant-travel/catalog@0.66.4
  - @voyant-travel/core@0.66.4
  - @voyant-travel/db@0.66.4
  - @voyant-travel/hono@0.66.4
  - @voyant-travel/identity@0.66.4
  - @voyant-travel/products@0.66.4
  - @voyant-travel/suppliers@0.66.4
  - @voyant-travel/workflows@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/availability@0.66.3
- @voyant-travel/bookings@0.66.3
- @voyant-travel/catalog@0.66.3
- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/hono@0.66.3
- @voyant-travel/identity@0.66.3
- @voyant-travel/products@0.66.3
- @voyant-travel/suppliers@0.66.3
- @voyant-travel/workflows@0.66.3

## 0.66.2

### Patch Changes

- Updated dependencies [3608633]
  - @voyant-travel/availability@0.66.2
  - @voyant-travel/bookings@0.66.2
  - @voyant-travel/catalog@0.66.2
  - @voyant-travel/core@0.66.2
  - @voyant-travel/db@0.66.2
  - @voyant-travel/hono@0.66.2
  - @voyant-travel/identity@0.66.2
  - @voyant-travel/products@0.66.2
  - @voyant-travel/suppliers@0.66.2
  - @voyant-travel/workflows@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/availability@0.66.1
- @voyant-travel/bookings@0.66.1
- @voyant-travel/catalog@0.66.1
- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/hono@0.66.1
- @voyant-travel/identity@0.66.1
- @voyant-travel/products@0.66.1
- @voyant-travel/suppliers@0.66.1
- @voyant-travel/workflows@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/availability@0.66.0
- @voyant-travel/bookings@0.66.0
- @voyant-travel/catalog@0.66.0
- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/hono@0.66.0
- @voyant-travel/identity@0.66.0
- @voyant-travel/products@0.66.0
- @voyant-travel/suppliers@0.66.0
- @voyant-travel/workflows@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/availability@0.65.0
- @voyant-travel/bookings@0.65.0
- @voyant-travel/catalog@0.65.0
- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/hono@0.65.0
- @voyant-travel/identity@0.65.0
- @voyant-travel/products@0.65.0
- @voyant-travel/suppliers@0.65.0
- @voyant-travel/workflows@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/availability@0.64.1
- @voyant-travel/bookings@0.64.1
- @voyant-travel/catalog@0.64.1
- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/hono@0.64.1
- @voyant-travel/identity@0.64.1
- @voyant-travel/products@0.64.1
- @voyant-travel/suppliers@0.64.1
- @voyant-travel/workflows@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/availability@0.64.0
  - @voyant-travel/bookings@0.64.0
  - @voyant-travel/catalog@0.64.0
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/hono@0.64.0
  - @voyant-travel/identity@0.64.0
  - @voyant-travel/products@0.64.0
  - @voyant-travel/suppliers@0.64.0
  - @voyant-travel/workflows@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/availability@0.63.1
- @voyant-travel/bookings@0.63.1
- @voyant-travel/catalog@0.63.1
- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/hono@0.63.1
- @voyant-travel/identity@0.63.1
- @voyant-travel/products@0.63.1
- @voyant-travel/suppliers@0.63.1
- @voyant-travel/workflows@0.63.1

## 0.63.0

### Patch Changes

- Updated dependencies [5bff9c3]
- Updated dependencies [5bff9c3]
  - @voyant-travel/availability@0.63.0
  - @voyant-travel/bookings@0.63.0
  - @voyant-travel/catalog@0.63.0
  - @voyant-travel/core@0.63.0
  - @voyant-travel/db@0.63.0
  - @voyant-travel/hono@0.63.0
  - @voyant-travel/identity@0.63.0
  - @voyant-travel/products@0.63.0
  - @voyant-travel/suppliers@0.63.0
  - @voyant-travel/workflows@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/availability@0.62.3
- @voyant-travel/bookings@0.62.3
- @voyant-travel/catalog@0.62.3
- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/hono@0.62.3
- @voyant-travel/identity@0.62.3
- @voyant-travel/products@0.62.3
- @voyant-travel/suppliers@0.62.3
- @voyant-travel/workflows@0.62.3

## 0.62.2

### Patch Changes

- Updated dependencies [4a87635]
  - @voyant-travel/availability@0.62.2
  - @voyant-travel/bookings@0.62.2
  - @voyant-travel/catalog@0.62.2
  - @voyant-travel/core@0.62.2
  - @voyant-travel/db@0.62.2
  - @voyant-travel/hono@0.62.2
  - @voyant-travel/identity@0.62.2
  - @voyant-travel/products@0.62.2
  - @voyant-travel/suppliers@0.62.2
  - @voyant-travel/workflows@0.62.2

## 0.62.1

### Patch Changes

- Updated dependencies [ebbeab8]
  - @voyant-travel/availability@0.62.1
  - @voyant-travel/bookings@0.62.1
  - @voyant-travel/catalog@0.62.1
  - @voyant-travel/core@0.62.1
  - @voyant-travel/db@0.62.1
  - @voyant-travel/hono@0.62.1
  - @voyant-travel/identity@0.62.1
  - @voyant-travel/products@0.62.1
  - @voyant-travel/suppliers@0.62.1
  - @voyant-travel/workflows@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/availability@0.62.0
  - @voyant-travel/bookings@0.62.0
  - @voyant-travel/catalog@0.62.0
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/hono@0.62.0
  - @voyant-travel/identity@0.62.0
  - @voyant-travel/products@0.62.0
  - @voyant-travel/suppliers@0.62.0
  - @voyant-travel/workflows@0.62.0

## 0.61.0

### Patch Changes

- Updated dependencies [89f033e]
  - @voyant-travel/availability@0.61.0
  - @voyant-travel/bookings@0.61.0
  - @voyant-travel/catalog@0.61.0
  - @voyant-travel/core@0.61.0
  - @voyant-travel/db@0.61.0
  - @voyant-travel/hono@0.61.0
  - @voyant-travel/identity@0.61.0
  - @voyant-travel/products@0.61.0
  - @voyant-travel/suppliers@0.61.0
  - @voyant-travel/workflows@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/availability@0.60.0
- @voyant-travel/bookings@0.60.0
- @voyant-travel/catalog@0.60.0
- @voyant-travel/core@0.60.0
- @voyant-travel/db@0.60.0
- @voyant-travel/hono@0.60.0
- @voyant-travel/identity@0.60.0
- @voyant-travel/products@0.60.0
- @voyant-travel/suppliers@0.60.0
- @voyant-travel/workflows@0.60.0

## 0.59.0

### Patch Changes

- Updated dependencies [48927be]
  - @voyant-travel/availability@0.59.0
  - @voyant-travel/bookings@0.59.0
  - @voyant-travel/catalog@0.59.0
  - @voyant-travel/core@0.59.0
  - @voyant-travel/db@0.59.0
  - @voyant-travel/hono@0.59.0
  - @voyant-travel/identity@0.59.0
  - @voyant-travel/products@0.59.0
  - @voyant-travel/suppliers@0.59.0
  - @voyant-travel/workflows@0.59.0

## 0.58.0

### Patch Changes

- Updated dependencies [5b21488]
  - @voyant-travel/availability@0.58.0
  - @voyant-travel/bookings@0.58.0
  - @voyant-travel/catalog@0.58.0
  - @voyant-travel/core@0.58.0
  - @voyant-travel/db@0.58.0
  - @voyant-travel/hono@0.58.0
  - @voyant-travel/identity@0.58.0
  - @voyant-travel/products@0.58.0
  - @voyant-travel/suppliers@0.58.0
  - @voyant-travel/workflows@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/availability@0.57.0
- @voyant-travel/bookings@0.57.0
- @voyant-travel/catalog@0.57.0
- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/hono@0.57.0
- @voyant-travel/identity@0.57.0
- @voyant-travel/products@0.57.0
- @voyant-travel/suppliers@0.57.0
- @voyant-travel/workflows@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/availability@0.56.0
- @voyant-travel/bookings@0.56.0
- @voyant-travel/catalog@0.56.0
- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/hono@0.56.0
- @voyant-travel/identity@0.56.0
- @voyant-travel/products@0.56.0
- @voyant-travel/suppliers@0.56.0
- @voyant-travel/workflows@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/availability@0.55.1
  - @voyant-travel/bookings@0.55.1
  - @voyant-travel/catalog@0.55.1
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/hono@0.55.1
  - @voyant-travel/identity@0.55.1
  - @voyant-travel/products@0.55.1
  - @voyant-travel/suppliers@0.55.1
  - @voyant-travel/workflows@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/availability@0.55.0
- @voyant-travel/bookings@0.55.0
- @voyant-travel/catalog@0.55.0
- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/hono@0.55.0
- @voyant-travel/identity@0.55.0
- @voyant-travel/products@0.55.0
- @voyant-travel/suppliers@0.55.0
- @voyant-travel/workflows@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/availability@0.54.0
- @voyant-travel/bookings@0.54.0
- @voyant-travel/catalog@0.54.0
- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/hono@0.54.0
- @voyant-travel/identity@0.54.0
- @voyant-travel/products@0.54.0
- @voyant-travel/suppliers@0.54.0
- @voyant-travel/workflows@0.54.0

## 0.53.2

### Patch Changes

- Updated dependencies [fc3bc6f]
  - @voyant-travel/availability@0.53.2
  - @voyant-travel/bookings@0.53.2
  - @voyant-travel/catalog@0.53.2
  - @voyant-travel/core@0.53.2
  - @voyant-travel/db@0.53.2
  - @voyant-travel/hono@0.53.2
  - @voyant-travel/identity@0.53.2
  - @voyant-travel/products@0.53.2
  - @voyant-travel/suppliers@0.53.2
  - @voyant-travel/workflows@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/availability@0.53.1
- @voyant-travel/bookings@0.53.1
- @voyant-travel/catalog@0.53.1
- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/hono@0.53.1
- @voyant-travel/identity@0.53.1
- @voyant-travel/products@0.53.1
- @voyant-travel/suppliers@0.53.1
- @voyant-travel/workflows@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/availability@0.53.0
  - @voyant-travel/bookings@0.53.0
  - @voyant-travel/catalog@0.53.0
  - @voyant-travel/core@0.53.0
  - @voyant-travel/db@0.53.0
  - @voyant-travel/hono@0.53.0
  - @voyant-travel/identity@0.53.0
  - @voyant-travel/products@0.53.0
  - @voyant-travel/suppliers@0.53.0
  - @voyant-travel/workflows@0.53.0

## 0.52.4

### Patch Changes

- Updated dependencies [5d3c119]
  - @voyant-travel/availability@0.52.4
  - @voyant-travel/bookings@0.52.4
  - @voyant-travel/catalog@0.52.4
  - @voyant-travel/core@0.52.4
  - @voyant-travel/db@0.52.4
  - @voyant-travel/hono@0.52.4
  - @voyant-travel/identity@0.52.4
  - @voyant-travel/products@0.52.4
  - @voyant-travel/suppliers@0.52.4
  - @voyant-travel/workflows@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/availability@0.52.3
  - @voyant-travel/bookings@0.52.3
  - @voyant-travel/catalog@0.52.3
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/hono@0.52.3
  - @voyant-travel/identity@0.52.3
  - @voyant-travel/products@0.52.3
  - @voyant-travel/suppliers@0.52.3
  - @voyant-travel/workflows@0.52.3

## 0.52.2

### Patch Changes

- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
- Updated dependencies [3e09123]
  - @voyant-travel/availability@0.52.2
  - @voyant-travel/bookings@0.52.2
  - @voyant-travel/catalog@0.52.2
  - @voyant-travel/core@0.52.2
  - @voyant-travel/db@0.52.2
  - @voyant-travel/hono@0.52.2
  - @voyant-travel/identity@0.52.2
  - @voyant-travel/products@0.52.2
  - @voyant-travel/suppliers@0.52.2
  - @voyant-travel/workflows@0.52.2

## 0.52.1

### Patch Changes

- Updated dependencies [335d277]
  - @voyant-travel/availability@0.52.1
  - @voyant-travel/bookings@0.52.1
  - @voyant-travel/catalog@0.52.1
  - @voyant-travel/core@0.52.1
  - @voyant-travel/db@0.52.1
  - @voyant-travel/hono@0.52.1
  - @voyant-travel/identity@0.52.1
  - @voyant-travel/products@0.52.1
  - @voyant-travel/suppliers@0.52.1
  - @voyant-travel/workflows@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/availability@0.52.0
- @voyant-travel/bookings@0.52.0
- @voyant-travel/catalog@0.52.0
- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/hono@0.52.0
- @voyant-travel/identity@0.52.0
- @voyant-travel/products@0.52.0
- @voyant-travel/suppliers@0.52.0
- @voyant-travel/workflows@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/availability@0.51.1
- @voyant-travel/bookings@0.51.1
- @voyant-travel/catalog@0.51.1
- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/hono@0.51.1
- @voyant-travel/identity@0.51.1
- @voyant-travel/products@0.51.1
- @voyant-travel/suppliers@0.51.1
- @voyant-travel/workflows@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/availability@0.51.0
- @voyant-travel/bookings@0.51.0
- @voyant-travel/catalog@0.51.0
- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/hono@0.51.0
- @voyant-travel/identity@0.51.0
- @voyant-travel/products@0.51.0
- @voyant-travel/suppliers@0.51.0
- @voyant-travel/workflows@0.51.0

## 0.50.8

### Patch Changes

- Updated dependencies [f35014f]
  - @voyant-travel/availability@0.50.8
  - @voyant-travel/bookings@0.50.8
  - @voyant-travel/catalog@0.50.8
  - @voyant-travel/core@0.50.8
  - @voyant-travel/db@0.50.8
  - @voyant-travel/hono@0.50.8
  - @voyant-travel/identity@0.50.8
  - @voyant-travel/products@0.50.8
  - @voyant-travel/suppliers@0.50.8
  - @voyant-travel/workflows@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/availability@0.50.7
- @voyant-travel/bookings@0.50.7
- @voyant-travel/catalog@0.50.7
- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/hono@0.50.7
- @voyant-travel/identity@0.50.7
- @voyant-travel/products@0.50.7
- @voyant-travel/suppliers@0.50.7
- @voyant-travel/workflows@0.50.7

## 0.50.6

### Patch Changes

- Updated dependencies [c14f0a8]
  - @voyant-travel/availability@0.50.6
  - @voyant-travel/bookings@0.50.6
  - @voyant-travel/catalog@0.50.6
  - @voyant-travel/core@0.50.6
  - @voyant-travel/db@0.50.6
  - @voyant-travel/hono@0.50.6
  - @voyant-travel/identity@0.50.6
  - @voyant-travel/products@0.50.6
  - @voyant-travel/suppliers@0.50.6
  - @voyant-travel/workflows@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/availability@0.50.5
- @voyant-travel/bookings@0.50.5
- @voyant-travel/catalog@0.50.5
- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/hono@0.50.5
- @voyant-travel/identity@0.50.5
- @voyant-travel/products@0.50.5
- @voyant-travel/suppliers@0.50.5
- @voyant-travel/workflows@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/availability@0.50.4
- @voyant-travel/bookings@0.50.4
- @voyant-travel/catalog@0.50.4
- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/hono@0.50.4
- @voyant-travel/identity@0.50.4
- @voyant-travel/products@0.50.4
- @voyant-travel/suppliers@0.50.4
- @voyant-travel/workflows@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/availability@0.50.3
- @voyant-travel/bookings@0.50.3
- @voyant-travel/catalog@0.50.3
- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/hono@0.50.3
- @voyant-travel/identity@0.50.3
- @voyant-travel/products@0.50.3
- @voyant-travel/suppliers@0.50.3
- @voyant-travel/workflows@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/availability@0.50.2
- @voyant-travel/bookings@0.50.2
- @voyant-travel/catalog@0.50.2
- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/hono@0.50.2
- @voyant-travel/identity@0.50.2
- @voyant-travel/products@0.50.2
- @voyant-travel/suppliers@0.50.2
- @voyant-travel/workflows@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/availability@0.50.1
- @voyant-travel/bookings@0.50.1
- @voyant-travel/catalog@0.50.1
- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/hono@0.50.1
- @voyant-travel/identity@0.50.1
- @voyant-travel/products@0.50.1
- @voyant-travel/suppliers@0.50.1
- @voyant-travel/workflows@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/availability@0.50.0
- @voyant-travel/bookings@0.50.0
- @voyant-travel/catalog@0.50.0
- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/hono@0.50.0
- @voyant-travel/identity@0.50.0
- @voyant-travel/products@0.50.0
- @voyant-travel/suppliers@0.50.0
- @voyant-travel/workflows@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/availability@0.49.0
- @voyant-travel/bookings@0.49.0
- @voyant-travel/catalog@0.49.0
- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/hono@0.49.0
- @voyant-travel/identity@0.49.0
- @voyant-travel/products@0.49.0
- @voyant-travel/suppliers@0.49.0
- @voyant-travel/workflows@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/availability@0.48.0
- @voyant-travel/bookings@0.48.0
- @voyant-travel/catalog@0.48.0
- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/hono@0.48.0
- @voyant-travel/identity@0.48.0
- @voyant-travel/products@0.48.0
- @voyant-travel/suppliers@0.48.0
- @voyant-travel/workflows@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/availability@0.47.0
- @voyant-travel/bookings@0.47.0
- @voyant-travel/catalog@0.47.0
- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/hono@0.47.0
- @voyant-travel/identity@0.47.0
- @voyant-travel/products@0.47.0
- @voyant-travel/suppliers@0.47.0
- @voyant-travel/workflows@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/availability@0.46.0
- @voyant-travel/bookings@0.46.0
- @voyant-travel/catalog@0.46.0
- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/hono@0.46.0
- @voyant-travel/identity@0.46.0
- @voyant-travel/products@0.46.0
- @voyant-travel/suppliers@0.46.0
- @voyant-travel/workflows@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/availability@0.45.0
- @voyant-travel/bookings@0.45.0
- @voyant-travel/catalog@0.45.0
- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/hono@0.45.0
- @voyant-travel/identity@0.45.0
- @voyant-travel/products@0.45.0
- @voyant-travel/suppliers@0.45.0
- @voyant-travel/workflows@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/availability@0.44.0
- @voyant-travel/bookings@0.44.0
- @voyant-travel/catalog@0.44.0
- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/hono@0.44.0
- @voyant-travel/identity@0.44.0
- @voyant-travel/products@0.44.0
- @voyant-travel/suppliers@0.44.0
- @voyant-travel/workflows@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/availability@0.43.0
  - @voyant-travel/bookings@0.43.0
  - @voyant-travel/catalog@0.43.0
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/hono@0.43.0
  - @voyant-travel/identity@0.43.0
  - @voyant-travel/products@0.43.0
  - @voyant-travel/suppliers@0.43.0
  - @voyant-travel/workflows@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/availability@0.42.0
- @voyant-travel/bookings@0.42.0
- @voyant-travel/catalog@0.42.0
- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/hono@0.42.0
- @voyant-travel/identity@0.42.0
- @voyant-travel/products@0.42.0
- @voyant-travel/suppliers@0.42.0
- @voyant-travel/workflows@0.42.0

## 0.41.3

### Patch Changes

- Updated dependencies [2c3bd2e]
  - @voyant-travel/availability@0.41.3
  - @voyant-travel/bookings@0.41.3
  - @voyant-travel/catalog@0.41.3
  - @voyant-travel/core@0.41.3
  - @voyant-travel/db@0.41.3
  - @voyant-travel/hono@0.41.3
  - @voyant-travel/identity@0.41.3
  - @voyant-travel/products@0.41.3
  - @voyant-travel/suppliers@0.41.3
  - @voyant-travel/workflows@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/availability@0.41.2
- @voyant-travel/bookings@0.41.2
- @voyant-travel/catalog@0.41.2
- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/hono@0.41.2
- @voyant-travel/identity@0.41.2
- @voyant-travel/products@0.41.2
- @voyant-travel/suppliers@0.41.2
- @voyant-travel/workflows@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/availability@0.41.1
- @voyant-travel/bookings@0.41.1
- @voyant-travel/catalog@0.41.1
- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/hono@0.41.1
- @voyant-travel/identity@0.41.1
- @voyant-travel/products@0.41.1
- @voyant-travel/suppliers@0.41.1
- @voyant-travel/workflows@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/availability@0.41.0
- @voyant-travel/bookings@0.41.0
- @voyant-travel/catalog@0.41.0
- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/hono@0.41.0
- @voyant-travel/identity@0.41.0
- @voyant-travel/products@0.41.0
- @voyant-travel/suppliers@0.41.0
- @voyant-travel/workflows@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/availability@0.40.1
- @voyant-travel/bookings@0.40.1
- @voyant-travel/catalog@0.40.1
- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/hono@0.40.1
- @voyant-travel/identity@0.40.1
- @voyant-travel/products@0.40.1
- @voyant-travel/suppliers@0.40.1
- @voyant-travel/workflows@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/availability@0.40.0
- @voyant-travel/bookings@0.40.0
- @voyant-travel/catalog@0.40.0
- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/hono@0.40.0
- @voyant-travel/identity@0.40.0
- @voyant-travel/products@0.40.0
- @voyant-travel/suppliers@0.40.0
- @voyant-travel/workflows@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [f4235ea]
  - @voyant-travel/availability@0.39.0
  - @voyant-travel/bookings@0.39.0
  - @voyant-travel/catalog@0.39.0
  - @voyant-travel/core@0.39.0
  - @voyant-travel/db@0.39.0
  - @voyant-travel/hono@0.39.0
  - @voyant-travel/identity@0.39.0
  - @voyant-travel/products@0.39.0
  - @voyant-travel/suppliers@0.39.0
  - @voyant-travel/workflows@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/availability@0.38.2
- @voyant-travel/bookings@0.38.2
- @voyant-travel/catalog@0.38.2
- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/hono@0.38.2
- @voyant-travel/identity@0.38.2
- @voyant-travel/products@0.38.2
- @voyant-travel/suppliers@0.38.2
- @voyant-travel/workflows@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/availability@0.38.1
- @voyant-travel/bookings@0.38.1
- @voyant-travel/catalog@0.38.1
- @voyant-travel/core@0.38.1
- @voyant-travel/db@0.38.1
- @voyant-travel/hono@0.38.1
- @voyant-travel/identity@0.38.1
- @voyant-travel/products@0.38.1
- @voyant-travel/suppliers@0.38.1
- @voyant-travel/workflows@0.38.1

## 0.38.0

### Patch Changes

- Updated dependencies [885afc8]
  - @voyant-travel/availability@0.38.0
  - @voyant-travel/bookings@0.38.0
  - @voyant-travel/catalog@0.38.0
  - @voyant-travel/core@0.38.0
  - @voyant-travel/db@0.38.0
  - @voyant-travel/hono@0.38.0
  - @voyant-travel/identity@0.38.0
  - @voyant-travel/products@0.38.0
  - @voyant-travel/suppliers@0.38.0
  - @voyant-travel/workflows@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/availability@0.37.1
- @voyant-travel/bookings@0.37.1
- @voyant-travel/catalog@0.37.1
- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/hono@0.37.1
- @voyant-travel/identity@0.37.1
- @voyant-travel/products@0.37.1
- @voyant-travel/suppliers@0.37.1
- @voyant-travel/workflows@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [4c93561]
- Updated dependencies [dc29b79]
  - @voyant-travel/availability@0.37.0
  - @voyant-travel/bookings@0.37.0
  - @voyant-travel/catalog@0.37.0
  - @voyant-travel/core@0.37.0
  - @voyant-travel/db@0.37.0
  - @voyant-travel/hono@0.37.0
  - @voyant-travel/identity@0.37.0
  - @voyant-travel/products@0.37.0
  - @voyant-travel/suppliers@0.37.0
  - @voyant-travel/workflows@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies [15e6953]
  - @voyant-travel/availability@0.36.0
  - @voyant-travel/bookings@0.36.0
  - @voyant-travel/catalog@0.36.0
  - @voyant-travel/core@0.36.0
  - @voyant-travel/db@0.36.0
  - @voyant-travel/hono@0.36.0
  - @voyant-travel/identity@0.36.0
  - @voyant-travel/products@0.36.0
  - @voyant-travel/suppliers@0.36.0
  - @voyant-travel/workflows@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/availability@0.35.0
- @voyant-travel/bookings@0.35.0
- @voyant-travel/catalog@0.35.0
- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/hono@0.35.0
- @voyant-travel/identity@0.35.0
- @voyant-travel/products@0.35.0
- @voyant-travel/suppliers@0.35.0
- @voyant-travel/workflows@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [f8312f5]
  - @voyant-travel/availability@0.34.0
  - @voyant-travel/bookings@0.34.0
  - @voyant-travel/catalog@0.34.0
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/hono@0.34.0
  - @voyant-travel/identity@0.34.0
  - @voyant-travel/products@0.34.0
  - @voyant-travel/suppliers@0.34.0
  - @voyant-travel/workflows@0.34.0

## 0.33.1

### Patch Changes

- Updated dependencies [9bee9aa]
  - @voyant-travel/availability@0.33.1
  - @voyant-travel/bookings@0.33.1
  - @voyant-travel/catalog@0.33.1
  - @voyant-travel/core@0.33.1
  - @voyant-travel/db@0.33.1
  - @voyant-travel/hono@0.33.1
  - @voyant-travel/identity@0.33.1
  - @voyant-travel/products@0.33.1
  - @voyant-travel/suppliers@0.33.1
  - @voyant-travel/workflows@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/availability@0.33.0
- @voyant-travel/bookings@0.33.0
- @voyant-travel/catalog@0.33.0
- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/hono@0.33.0
- @voyant-travel/identity@0.33.0
- @voyant-travel/products@0.33.0
- @voyant-travel/suppliers@0.33.0
- @voyant-travel/workflows@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/availability@0.32.3
- @voyant-travel/bookings@0.32.3
- @voyant-travel/catalog@0.32.3
- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/hono@0.32.3
- @voyant-travel/identity@0.32.3
- @voyant-travel/products@0.32.3
- @voyant-travel/suppliers@0.32.3
- @voyant-travel/workflows@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/availability@0.32.2
- @voyant-travel/bookings@0.32.2
- @voyant-travel/catalog@0.32.2
- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/hono@0.32.2
- @voyant-travel/identity@0.32.2
- @voyant-travel/products@0.32.2
- @voyant-travel/suppliers@0.32.2
- @voyant-travel/workflows@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/availability@0.32.1
- @voyant-travel/bookings@0.32.1
- @voyant-travel/catalog@0.32.1
- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/hono@0.32.1
- @voyant-travel/identity@0.32.1
- @voyant-travel/products@0.32.1
- @voyant-travel/suppliers@0.32.1
- @voyant-travel/workflows@0.32.1

## 0.32.0

### Patch Changes

- Updated dependencies [6ea6ded]
  - @voyant-travel/availability@0.32.0
  - @voyant-travel/bookings@0.32.0
  - @voyant-travel/catalog@0.32.0
  - @voyant-travel/core@0.32.0
  - @voyant-travel/db@0.32.0
  - @voyant-travel/hono@0.32.0
  - @voyant-travel/identity@0.32.0
  - @voyant-travel/products@0.32.0
  - @voyant-travel/suppliers@0.32.0
  - @voyant-travel/workflows@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/availability@0.31.4
- @voyant-travel/bookings@0.31.4
- @voyant-travel/catalog@0.31.4
- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/hono@0.31.4
- @voyant-travel/identity@0.31.4
- @voyant-travel/products@0.31.4
- @voyant-travel/suppliers@0.31.4
- @voyant-travel/workflows@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/availability@0.31.3
  - @voyant-travel/bookings@0.31.3
  - @voyant-travel/catalog@0.31.3
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/hono@0.31.3
  - @voyant-travel/identity@0.31.3
  - @voyant-travel/products@0.31.3
  - @voyant-travel/suppliers@0.31.3
  - @voyant-travel/workflows@0.31.3

## 0.31.2

### Patch Changes

- Updated dependencies [54ddc93]
  - @voyant-travel/availability@0.31.2
  - @voyant-travel/bookings@0.31.2
  - @voyant-travel/catalog@0.31.2
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/hono@0.31.2
  - @voyant-travel/identity@0.31.2
  - @voyant-travel/products@0.31.2
  - @voyant-travel/suppliers@0.31.2
  - @voyant-travel/workflows@0.31.2

## 0.31.1

### Patch Changes

- Updated dependencies [00f7c4f]
  - @voyant-travel/availability@0.31.1
  - @voyant-travel/bookings@0.31.1
  - @voyant-travel/catalog@0.31.1
  - @voyant-travel/core@0.31.1
  - @voyant-travel/db@0.31.1
  - @voyant-travel/hono@0.31.1
  - @voyant-travel/identity@0.31.1
  - @voyant-travel/products@0.31.1
  - @voyant-travel/suppliers@0.31.1
  - @voyant-travel/workflows@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/availability@0.31.0
- @voyant-travel/bookings@0.31.0
- @voyant-travel/catalog@0.31.0
- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/hono@0.31.0
- @voyant-travel/identity@0.31.0
- @voyant-travel/products@0.31.0
- @voyant-travel/suppliers@0.31.0
- @voyant-travel/workflows@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/availability@0.30.7
- @voyant-travel/bookings@0.30.7
- @voyant-travel/catalog@0.30.7
- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/hono@0.30.7
- @voyant-travel/identity@0.30.7
- @voyant-travel/products@0.30.7
- @voyant-travel/suppliers@0.30.7
- @voyant-travel/workflows@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/availability@0.30.6
  - @voyant-travel/bookings@0.30.6
  - @voyant-travel/catalog@0.30.6
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/hono@0.30.6
  - @voyant-travel/identity@0.30.6
  - @voyant-travel/products@0.30.6
  - @voyant-travel/suppliers@0.30.6
  - @voyant-travel/workflows@0.30.6

## 0.30.5

### Patch Changes

- Updated dependencies [3f323e9]
  - @voyant-travel/availability@0.30.5
  - @voyant-travel/bookings@0.30.5
  - @voyant-travel/catalog@0.30.5
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/hono@0.30.5
  - @voyant-travel/identity@0.30.5
  - @voyant-travel/products@0.30.5
  - @voyant-travel/suppliers@0.30.5
  - @voyant-travel/workflows@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/availability@0.30.4
- @voyant-travel/bookings@0.30.4
- @voyant-travel/catalog@0.30.4
- @voyant-travel/core@0.30.4
- @voyant-travel/db@0.30.4
- @voyant-travel/hono@0.30.4
- @voyant-travel/identity@0.30.4
- @voyant-travel/products@0.30.4
- @voyant-travel/suppliers@0.30.4
- @voyant-travel/workflows@0.30.4

## 0.30.3

### Patch Changes

- Updated dependencies [05a1b19]
  - @voyant-travel/availability@0.30.3
  - @voyant-travel/bookings@0.30.3
  - @voyant-travel/catalog@0.30.3
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/hono@0.30.3
  - @voyant-travel/identity@0.30.3
  - @voyant-travel/products@0.30.3
  - @voyant-travel/suppliers@0.30.3
  - @voyant-travel/workflows@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/availability@0.30.2
- @voyant-travel/bookings@0.30.2
- @voyant-travel/catalog@0.30.2
- @voyant-travel/core@0.30.2
- @voyant-travel/db@0.30.2
- @voyant-travel/hono@0.30.2
- @voyant-travel/identity@0.30.2
- @voyant-travel/products@0.30.2
- @voyant-travel/suppliers@0.30.2
- @voyant-travel/workflows@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/availability@0.30.1
- @voyant-travel/bookings@0.30.1
- @voyant-travel/catalog@0.30.1
- @voyant-travel/core@0.30.1
- @voyant-travel/db@0.30.1
- @voyant-travel/hono@0.30.1
- @voyant-travel/identity@0.30.1
- @voyant-travel/products@0.30.1
- @voyant-travel/suppliers@0.30.1
- @voyant-travel/workflows@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/availability@0.30.0
- @voyant-travel/bookings@0.30.0
- @voyant-travel/catalog@0.30.0
- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/hono@0.30.0
- @voyant-travel/identity@0.30.0
- @voyant-travel/products@0.30.0
- @voyant-travel/suppliers@0.30.0
- @voyant-travel/workflows@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [828fee4]
- Updated dependencies [3420711]
- Updated dependencies [11443d3]
- Updated dependencies [828fee4]
- Updated dependencies [06c2cf1]
- Updated dependencies [143f45c]
- Updated dependencies [2baf762]
- Updated dependencies [da3b6fd]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/availability@0.29.0
  - @voyant-travel/bookings@0.29.0
  - @voyant-travel/catalog@0.29.0
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/hono@0.29.0
  - @voyant-travel/identity@0.29.0
  - @voyant-travel/products@0.29.0
  - @voyant-travel/suppliers@0.29.0
  - @voyant-travel/workflows@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/availability@0.28.3
- @voyant-travel/bookings@0.28.3
- @voyant-travel/catalog@0.28.3
- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/hono@0.28.3
- @voyant-travel/identity@0.28.3
- @voyant-travel/products@0.28.3
- @voyant-travel/suppliers@0.28.3
- @voyant-travel/workflows@0.28.3

## 0.28.2

### Patch Changes

- Updated dependencies [4549ebc]
  - @voyant-travel/availability@0.28.2
  - @voyant-travel/bookings@0.28.2
  - @voyant-travel/catalog@0.28.2
  - @voyant-travel/core@0.28.2
  - @voyant-travel/db@0.28.2
  - @voyant-travel/hono@0.28.2
  - @voyant-travel/identity@0.28.2
  - @voyant-travel/products@0.28.2
  - @voyant-travel/suppliers@0.28.2
  - @voyant-travel/workflows@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/availability@0.28.1
- @voyant-travel/bookings@0.28.1
- @voyant-travel/catalog@0.28.1
- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/hono@0.28.1
- @voyant-travel/identity@0.28.1
- @voyant-travel/products@0.28.1
- @voyant-travel/suppliers@0.28.1
- @voyant-travel/workflows@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [b72948d]
  - @voyant-travel/availability@0.28.0
  - @voyant-travel/bookings@0.28.0
  - @voyant-travel/catalog@0.28.0
  - @voyant-travel/core@0.28.0
  - @voyant-travel/db@0.28.0
  - @voyant-travel/hono@0.28.0
  - @voyant-travel/identity@0.28.0
  - @voyant-travel/products@0.28.0
  - @voyant-travel/suppliers@0.28.0
  - @voyant-travel/workflows@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/availability@0.27.0
- @voyant-travel/bookings@0.27.0
- @voyant-travel/catalog@0.27.0
- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/hono@0.27.0
- @voyant-travel/identity@0.27.0
- @voyant-travel/products@0.27.0
- @voyant-travel/suppliers@0.27.0
- @voyant-travel/workflows@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/availability@0.26.9
- @voyant-travel/bookings@0.26.9
- @voyant-travel/catalog@0.26.9
- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/hono@0.26.9
- @voyant-travel/identity@0.26.9
- @voyant-travel/products@0.26.9
- @voyant-travel/suppliers@0.26.9
- @voyant-travel/workflows@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/availability@0.26.8
- @voyant-travel/bookings@0.26.8
- @voyant-travel/catalog@0.26.8
- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/hono@0.26.8
- @voyant-travel/identity@0.26.8
- @voyant-travel/products@0.26.8
- @voyant-travel/suppliers@0.26.8
- @voyant-travel/workflows@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/availability@0.26.7
- @voyant-travel/bookings@0.26.7
- @voyant-travel/catalog@0.26.7
- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/hono@0.26.7
- @voyant-travel/identity@0.26.7
- @voyant-travel/products@0.26.7
- @voyant-travel/suppliers@0.26.7
- @voyant-travel/workflows@0.26.7

## 0.26.6

### Patch Changes

- Updated dependencies [571e340]
  - @voyant-travel/availability@0.26.6
  - @voyant-travel/bookings@0.26.6
  - @voyant-travel/catalog@0.26.6
  - @voyant-travel/core@0.26.6
  - @voyant-travel/db@0.26.6
  - @voyant-travel/hono@0.26.6
  - @voyant-travel/identity@0.26.6
  - @voyant-travel/products@0.26.6
  - @voyant-travel/suppliers@0.26.6
  - @voyant-travel/workflows@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/availability@0.26.5
  - @voyant-travel/bookings@0.26.5
  - @voyant-travel/catalog@0.26.5
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/hono@0.26.5
  - @voyant-travel/identity@0.26.5
  - @voyant-travel/products@0.26.5
  - @voyant-travel/suppliers@0.26.5
  - @voyant-travel/workflows@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/availability@0.26.4
  - @voyant-travel/bookings@0.26.4
  - @voyant-travel/catalog@0.26.4
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/hono@0.26.4
  - @voyant-travel/identity@0.26.4
  - @voyant-travel/products@0.26.4
  - @voyant-travel/suppliers@0.26.4
  - @voyant-travel/workflows@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/availability@0.26.3
  - @voyant-travel/bookings@0.26.3
  - @voyant-travel/catalog@0.26.3
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/hono@0.26.3
  - @voyant-travel/identity@0.26.3
  - @voyant-travel/products@0.26.3
  - @voyant-travel/suppliers@0.26.3
  - @voyant-travel/workflows@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/availability@0.26.2
  - @voyant-travel/bookings@0.26.2
  - @voyant-travel/catalog@0.26.2
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/hono@0.26.2
  - @voyant-travel/identity@0.26.2
  - @voyant-travel/products@0.26.2
  - @voyant-travel/suppliers@0.26.2
  - @voyant-travel/workflows@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/availability@0.26.1
  - @voyant-travel/bookings@0.26.1
  - @voyant-travel/catalog@0.26.1
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/hono@0.26.1
  - @voyant-travel/identity@0.26.1
  - @voyant-travel/products@0.26.1
  - @voyant-travel/suppliers@0.26.1
  - @voyant-travel/workflows@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/availability@0.26.0
- @voyant-travel/bookings@0.26.0
- @voyant-travel/catalog@0.26.0
- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/hono@0.26.0
- @voyant-travel/identity@0.26.0
- @voyant-travel/products@0.26.0
- @voyant-travel/suppliers@0.26.0
- @voyant-travel/workflows@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/availability@0.25.0
- @voyant-travel/bookings@0.25.0
- @voyant-travel/catalog@0.25.0
- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/hono@0.25.0
- @voyant-travel/identity@0.25.0
- @voyant-travel/products@0.25.0
- @voyant-travel/suppliers@0.25.0
- @voyant-travel/workflows@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/availability@0.24.3
- @voyant-travel/bookings@0.24.3
- @voyant-travel/catalog@0.24.3
- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/hono@0.24.3
- @voyant-travel/identity@0.24.3
- @voyant-travel/products@0.24.3
- @voyant-travel/suppliers@0.24.3
- @voyant-travel/workflows@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [bec0471]
  - @voyant-travel/availability@0.24.2
  - @voyant-travel/bookings@0.24.2
  - @voyant-travel/catalog@0.24.2
  - @voyant-travel/core@0.24.2
  - @voyant-travel/db@0.24.2
  - @voyant-travel/hono@0.24.2
  - @voyant-travel/identity@0.24.2
  - @voyant-travel/products@0.24.2
  - @voyant-travel/suppliers@0.24.2
  - @voyant-travel/workflows@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [2d6297d]
  - @voyant-travel/availability@0.24.1
  - @voyant-travel/bookings@0.24.1
  - @voyant-travel/catalog@0.24.1
  - @voyant-travel/core@0.24.1
  - @voyant-travel/db@0.24.1
  - @voyant-travel/hono@0.24.1
  - @voyant-travel/identity@0.24.1
  - @voyant-travel/products@0.24.1
  - @voyant-travel/suppliers@0.24.1
  - @voyant-travel/workflows@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/availability@0.24.0
- @voyant-travel/bookings@0.24.0
- @voyant-travel/catalog@0.24.0
- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/hono@0.24.0
- @voyant-travel/identity@0.24.0
- @voyant-travel/products@0.24.0
- @voyant-travel/suppliers@0.24.0
- @voyant-travel/workflows@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/availability@0.23.0
- @voyant-travel/bookings@0.23.0
- @voyant-travel/catalog@0.23.0
- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/hono@0.23.0
- @voyant-travel/identity@0.23.0
- @voyant-travel/products@0.23.0
- @voyant-travel/suppliers@0.23.0
- @voyant-travel/workflows@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/availability@0.22.0
- @voyant-travel/bookings@0.22.0
- @voyant-travel/catalog@0.22.0
- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/hono@0.22.0
- @voyant-travel/identity@0.22.0
- @voyant-travel/products@0.22.0
- @voyant-travel/suppliers@0.22.0
- @voyant-travel/workflows@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/availability@0.21.1
- @voyant-travel/bookings@0.21.1
- @voyant-travel/catalog@0.21.1
- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/hono@0.21.1
- @voyant-travel/identity@0.21.1
- @voyant-travel/products@0.21.1
- @voyant-travel/suppliers@0.21.1
- @voyant-travel/workflows@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/availability@0.21.0
  - @voyant-travel/bookings@0.21.0
  - @voyant-travel/catalog@0.21.0
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/hono@0.21.0
  - @voyant-travel/identity@0.21.0
  - @voyant-travel/products@0.21.0
  - @voyant-travel/suppliers@0.21.0
  - @voyant-travel/workflows@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/availability@0.20.0
- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/hono@0.20.0
- @voyant-travel/identity@0.20.0
- @voyant-travel/products@0.20.0
- @voyant-travel/suppliers@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [714c544]
  - @voyant-travel/availability@0.19.0
  - @voyant-travel/core@0.19.0
  - @voyant-travel/db@0.19.0
  - @voyant-travel/hono@0.19.0
  - @voyant-travel/identity@0.19.0
  - @voyant-travel/products@0.19.0
  - @voyant-travel/suppliers@0.19.0

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
  - @voyant-travel/availability@0.18.0
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/hono@0.18.0
  - @voyant-travel/identity@0.18.0
  - @voyant-travel/products@0.18.0
  - @voyant-travel/suppliers@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/availability@0.17.0
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/hono@0.17.0
  - @voyant-travel/identity@0.17.0
  - @voyant-travel/products@0.17.0
  - @voyant-travel/suppliers@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [a4bc773]
  - @voyant-travel/availability@0.16.0
  - @voyant-travel/core@0.16.0
  - @voyant-travel/db@0.16.0
  - @voyant-travel/hono@0.16.0
  - @voyant-travel/identity@0.16.0
  - @voyant-travel/products@0.16.0
  - @voyant-travel/suppliers@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/availability@0.15.0
- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/hono@0.15.0
- @voyant-travel/identity@0.15.0
- @voyant-travel/products@0.15.0
- @voyant-travel/suppliers@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/availability@0.14.0
- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/hono@0.14.0
- @voyant-travel/identity@0.14.0
- @voyant-travel/products@0.14.0
- @voyant-travel/suppliers@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/availability@0.13.0
- @voyant-travel/core@0.13.0
- @voyant-travel/db@0.13.0
- @voyant-travel/hono@0.13.0
- @voyant-travel/identity@0.13.0
- @voyant-travel/products@0.13.0
- @voyant-travel/suppliers@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/availability@0.12.0
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/hono@0.12.0
  - @voyant-travel/identity@0.12.0
  - @voyant-travel/products@0.12.0
  - @voyant-travel/suppliers@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/availability@0.11.0
- @voyant-travel/core@0.11.0
- @voyant-travel/db@0.11.0
- @voyant-travel/hono@0.11.0
- @voyant-travel/identity@0.11.0
- @voyant-travel/products@0.11.0
- @voyant-travel/suppliers@0.11.0

## 0.10.0

### Minor Changes

- 29a581a: Add `connect` value to `channelKindEnum` for partners running Voyant Connect (the inbound API integration surface where operators publish into a third-party network using Voyant infrastructure). Distinguishes from `api_partner`, which remains a generic third-party API integration.

  Synchronised across pgEnum, Zod validation, React schemas / constants / hooks, registry dialogs, en/ro i18n labels, and template copies in `templates/dmc`, `templates/operator`, and `apps/dev`.

### Patch Changes

- Updated dependencies [29a581a]
- Updated dependencies [b7f0501]
  - @voyant-travel/availability@0.10.0
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/hono@0.10.0
  - @voyant-travel/identity@0.10.0
  - @voyant-travel/products@0.10.0
  - @voyant-travel/suppliers@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/availability@0.9.0
- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/hono@0.9.0
- @voyant-travel/identity@0.9.0
- @voyant-travel/products@0.9.0
- @voyant-travel/suppliers@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/availability@0.8.0
- @voyant-travel/core@0.8.0
- @voyant-travel/db@0.8.0
- @voyant-travel/hono@0.8.0
- @voyant-travel/identity@0.8.0
- @voyant-travel/products@0.8.0
- @voyant-travel/suppliers@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/availability@0.7.0
- @voyant-travel/core@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/hono@0.7.0
- @voyant-travel/identity@0.7.0
- @voyant-travel/products@0.7.0
- @voyant-travel/suppliers@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/availability@0.6.9
- @voyant-travel/core@0.6.9
- @voyant-travel/db@0.6.9
- @voyant-travel/hono@0.6.9
- @voyant-travel/identity@0.6.9
- @voyant-travel/products@0.6.9
- @voyant-travel/suppliers@0.6.9

## 0.6.8

### Patch Changes

- b218885: Align distribution automation list indexes with the current filter-and-sort query shapes.
- b218885: Align core distribution admin list indexes with their current filter-and-sort query shapes.
- b218885: Align distribution finance list indexes with the current filter-and-sort query shapes.
- b218885: Align distribution inventory list indexes with the current filter-and-sort query shapes.
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/availability@0.6.8
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/hono@0.6.8
  - @voyant-travel/identity@0.6.8
  - @voyant-travel/products@0.6.8
  - @voyant-travel/suppliers@0.6.8

## 0.6.7

### Patch Changes

- 7f10cfa: Align distribution channel root indexes with the main list query and add a distribution-owned contact projection so channel reads no longer hydrate directly from identity contact tables.
  - @voyant-travel/availability@0.6.7
  - @voyant-travel/core@0.6.7
  - @voyant-travel/db@0.6.7
  - @voyant-travel/hono@0.6.7
  - @voyant-travel/identity@0.6.7
  - @voyant-travel/products@0.6.7
  - @voyant-travel/suppliers@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/availability@0.6.6
- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/hono@0.6.6
- @voyant-travel/identity@0.6.6
- @voyant-travel/products@0.6.6
- @voyant-travel/suppliers@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/availability@0.6.5
- @voyant-travel/core@0.6.5
- @voyant-travel/db@0.6.5
- @voyant-travel/hono@0.6.5
- @voyant-travel/identity@0.6.5
- @voyant-travel/products@0.6.5
- @voyant-travel/suppliers@0.6.5

## 0.6.4

### Patch Changes

- Updated dependencies [d6c4022]
  - @voyant-travel/availability@0.6.4
  - @voyant-travel/core@0.6.4
  - @voyant-travel/db@0.6.4
  - @voyant-travel/hono@0.6.4
  - @voyant-travel/identity@0.6.4
  - @voyant-travel/products@0.6.4
  - @voyant-travel/suppliers@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/availability@0.6.3
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/hono@0.6.3
  - @voyant-travel/identity@0.6.3
  - @voyant-travel/products@0.6.3
  - @voyant-travel/suppliers@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/availability@0.6.2
- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/hono@0.6.2
- @voyant-travel/identity@0.6.2
- @voyant-travel/products@0.6.2
- @voyant-travel/suppliers@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/availability@0.6.1
- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/hono@0.6.1
- @voyant-travel/identity@0.6.1
- @voyant-travel/products@0.6.1
- @voyant-travel/suppliers@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/availability@0.6.0
- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/hono@0.6.0
- @voyant-travel/identity@0.6.0
- @voyant-travel/products@0.6.0
- @voyant-travel/suppliers@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
- Updated dependencies [ce72e29]
  - @voyant-travel/availability@0.5.0
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/hono@0.5.0
  - @voyant-travel/identity@0.5.0
  - @voyant-travel/products@0.5.0
  - @voyant-travel/suppliers@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/availability@0.4.5
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/hono@0.4.5
  - @voyant-travel/identity@0.4.5
  - @voyant-travel/products@0.4.5
  - @voyant-travel/suppliers@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/availability@0.4.4
- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/hono@0.4.4
- @voyant-travel/identity@0.4.4
- @voyant-travel/products@0.4.4
- @voyant-travel/suppliers@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/availability@0.4.3
- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/hono@0.4.3
- @voyant-travel/identity@0.4.3
- @voyant-travel/products@0.4.3
- @voyant-travel/suppliers@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/availability@0.4.2
- @voyant-travel/core@0.4.2
- @voyant-travel/db@0.4.2
- @voyant-travel/hono@0.4.2
- @voyant-travel/identity@0.4.2
- @voyant-travel/products@0.4.2
- @voyant-travel/suppliers@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/availability@0.4.1
- @voyant-travel/core@0.4.1
- @voyant-travel/db@0.4.1
- @voyant-travel/hono@0.4.1
- @voyant-travel/identity@0.4.1
- @voyant-travel/products@0.4.1
- @voyant-travel/suppliers@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/availability@0.4.0
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/hono@0.4.0
  - @voyant-travel/identity@0.4.0
  - @voyant-travel/products@0.4.0
  - @voyant-travel/suppliers@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/availability@0.3.1
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/hono@0.3.1
  - @voyant-travel/identity@0.3.1
  - @voyant-travel/products@0.3.1
  - @voyant-travel/suppliers@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/availability@0.3.0
- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/hono@0.3.0
- @voyant-travel/identity@0.3.0
- @voyant-travel/products@0.3.0
- @voyant-travel/suppliers@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/availability@0.2.0
- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/hono@0.2.0
- @voyant-travel/identity@0.2.0
- @voyant-travel/products@0.2.0
- @voyant-travel/suppliers@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/availability@0.1.1
- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/hono@0.1.1
- @voyant-travel/identity@0.1.1
- @voyant-travel/products@0.1.1
- @voyant-travel/suppliers@0.1.1
