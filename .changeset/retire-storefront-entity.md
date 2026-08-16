---
"@voyant-travel/auth": major
"@voyant-travel/auth-react": major
"@voyant-travel/db": major
"@voyant-travel/schema-kit": major
"@voyant-travel/bookings": major
"@voyant-travel/catalog": major
"@voyant-travel/commerce": major
"@voyant-travel/finance": major
"@voyant-travel/trips": major
"@voyant-travel/flights": major
"@voyant-travel/public-api": major
"@voyant-travel/public-api-react": major
"@voyant-travel/public-api-client": major
"@voyant-travel/voyant-connect-adapter": major
"@voyant-travel/distribution": minor
"@voyant-travel/hono": major
"@voyant-travel/charters": patch
"@voyant-travel/inventory": patch
"@voyant-travel/legal": patch
"@voyant-travel/operator-settings": patch
"@voyant-travel/proposals": patch
"@voyant-travel/public-document-delivery": patch
"@voyant-travel/realtime": patch
"@voyant-travel/core": minor
"@voyant-travel/runtime": major
---

Retire the storefront entity: the key becomes the unit, customer accounts move to the deployment.

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
