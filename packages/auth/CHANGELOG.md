# @voyant-travel/auth

## 0.153.4

### Patch Changes

- 3809eaa: Accept the OAuth `azp` claim on signed MCP access tokens so hosted connectors resolve their approved client and receive their permitted tool catalog.
- 76d8e2f: Restore ChatGPT and Claude remote MCP connector interoperability. Scope-less
  dynamic registrations now match authorization-server discovery, resource
  metadata advertises only resource-enforced scopes, and admin-shell OAuth calls
  are scoped into the admin realm exactly once.
- Updated dependencies [0724ef7]
  - @voyant-travel/core@0.144.2

## 0.153.3

### Patch Changes

- 93c28b1: Let ChatGPT Web and Claude Web actually complete the MCP connector handshake.

  Two contracts disagreed with themselves. Discovery advertised `mcp:read`,
  `mcp:write`, and `offline_access`, but a dynamic registration that omits `scope`
  — which is what a hosted client sends — was stored with `mcp:read` alone, so
  `authorize` answered the server's own advertised scopes with `invalid_scope`.
  The registration default now matches what discovery publishes; an explicit
  `scope` on the registration is still binding, and the operator consent screen
  plus the staff-derived permission filter remain the authorization boundaries.

  The consent screen and the MCP settings page then spelled the admin realm into
  URLs that the shell's realm-scoping fetcher scopes on their behalf, producing
  `/api/auth/admin/admin/oauth2/...` and a 404 on every consent decision, consent
  lookup, and connector listing. Those requests are written on the shared `/auth`
  prefix now, and a failed consent reports its status and the server's own error
  detail instead of one indistinguishable sentence.

## 0.153.2

### Patch Changes

- 8004dda: Cut the admin cold-load and per-navigation request budget.

  The workspace guard now resolves the authenticated shell bootstrap through the
  router's QueryClient. TanStack re-runs `beforeLoad` for every matched route on
  every navigation, so the guard's single round trip was being paid again on each
  client-side navigation; it is now paid once per session and revalidated in the
  background. Shell slices are re-seeded only from a freshly fetched response, so
  a navigation no longer overwrites what the shell has since done with them.

  `/auth/shell-bootstrap` now claims a capability for any slice the host answered
  for, including one it answered with nothing. Resolving "no navigation
  preferences stored" used to drop the capability and send the shell asking
  `/v1/admin/navigation-preferences` for the same nothing on every page load.

  Admin locale narrowing (`en-GB` → `en`) happens on the first render instead of
  the one after, so the authenticated tree no longer re-renders — and re-keys
  everything derived from the locale — a tick after it mounts.

  `/v1/admin/*` GETs returning JSON now carry `ETag` and
  `Cache-Control: private, no-cache`, and answer a matching `If-None-Match` with a
  bodyless 304, so a repeat navigation revalidates instead of re-downloading. A
  route that sets its own `Cache-Control` is left alone.

- Updated dependencies [8004dda]
  - @voyant-travel/hono@0.144.1

## 0.153.1

### Patch Changes

- 180c741: Say "team members" instead of "roster" in team settings

  Settings > Team called its member list a "Roster", a word from a domain Voyant
  does not have — an agency has a team and team members, and the Romanian copy
  already said so. The card is now "Team members", its description drops
  "provider-supplied activity" for what the columns actually show, and the invite
  card no longer mentions the identity provider a travel agent never configured.

  The `viewRoster` team-management capability is renamed `viewMembers` across the
  runtime port, both adapters, and the guarded provider, so the vocabulary the UI
  reads matches the one it renders.

## 0.153.0

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
  - @voyant-travel/distribution@0.229.0
  - @voyant-travel/hono@0.144.0
  - @voyant-travel/core@0.144.0
  - @voyant-travel/action-ledger@0.115.21
  - @voyant-travel/types@0.110.1

## 0.152.2

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/core@0.143.0
  - @voyant-travel/distribution@0.228.13
  - @voyant-travel/action-ledger@0.115.20
  - @voyant-travel/db@0.122.4
  - @voyant-travel/hono@0.143.2

## 0.152.1

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0
  - @voyant-travel/action-ledger@0.115.19
  - @voyant-travel/db@0.122.2
  - @voyant-travel/distribution@0.228.6
  - @voyant-travel/hono@0.143.1

## 0.152.0

### Minor Changes

- df9f45b: Provision the Direct channel, and let the public surface resolve to it without being configured.

  Publication is default-deny per channel and every public catalog read resolves a channel before it answers, so serving your own website meant hand-creating a row in `channels` — a table of commercial counterparties, sitting next to `suppliers`, carrying contracts, rate limits and contact projections — that represents yourself, then binding a storefront to it. Nothing provisioned that row on an ongoing basis: a one-shot setup cutover backfilled the storefronts that existed when it ran, and every storefront created afterwards got a 403 on `/settings`, `/departures/*`, `/products/*`, `/offers/*`, `/leads`, `/newsletter/*`, on the anonymous booking-session routes, and on checkout start.

  `channels` now carries a `system_key`, and a migration provisions exactly one row marked `direct`. It adopts before it inserts — the cutover's own `chan_storefront_direct` row first, then the oldest active `direct` channel — because publication rules and storefront bindings are keyed by channel id, and a fresh row beside an existing one would silently unpublish everything already published.

  A storefront with no explicit binding now resolves to that channel instead of to nothing, and so does one whose explicitly bound channel has gone inactive. `StorefrontChannelBindingDto` gains `implicit`, so an admin surface can show the default as a default; clearing a binding means "back to Direct" rather than "off the air". A binding that names another channel still wins, so `affiliate` / `reseller` / `api_partner` keep working.

  The system channel cannot be deleted or moved off `active` through the API (409, not a 404 that reads like the row is gone), and its `kind` is fixed; its name and contact details stay the operator's to edit. `GET /v1/admin/distribution/channels` takes `system=include|exclude|only`, defaulting to `include` — publication and product-mapping pickers read that endpoint and must still be able to target Direct. Only the Distribution counterparty list passes `exclude`.

  Batch update and batch delete now isolate failures per id rather than rejecting the whole batch when one id is refused.

  The storefront admin's channel section stops warning about something that is no longer true. It said "Default-deny is enforced: customer requests are rejected until this storefront is bound to an active channel", in an amber alert, and offered "Clear binding" with a confirmation warning that customer API access would be denied. It now states the default plainly, shows "Publishing to Direct (default)" for an implicit binding, and the clear action reads "Use Direct" and is disabled when Direct is already what you have.

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

- c805276: Settle a paid Booking Session against the Quote its payment was collected for.

  A shopper left on the "payment is confirming" screen goes on quoting, and every
  refresh superseded the Quote behind them and released its Hold. Settlement then
  looked for "the Session's one active Quote", found one nobody had paid for, and
  was refused — on all eight retries — leaving a captured card payment with no
  booking and no seat.

  Re-quoting is now refused outright while a processor holds the shopper's money,
  settlement replays the Quote and Hold recorded on the payment rather than
  re-deriving today's, and a refused settlement no longer releases the Hold it was
  collected against. When a delivery does exhaust its attempts, `event.dead_lettered`
  now announces it and raises a stranded-payment staff alert instead of leaving a
  `failed` outbox row nobody reads.

  Also stops every anonymous storefront checkout resolving to the same payment
  processor Customer: the `anonymous-storefront` placeholder is no longer passed as
  a customer reference, and `verify:symbol-policy` now pins the sentinel to its one
  definition.

- Updated dependencies [1f4e14c]
- Updated dependencies [c805276]
- Updated dependencies [df9f45b]
- Updated dependencies [36f3085]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/distribution@0.228.0
  - @voyant-travel/core@0.141.0
  - @voyant-travel/db@0.122.0
  - @voyant-travel/action-ledger@0.115.18
  - @voyant-travel/hono@0.143.0
  - @voyant-travel/types@0.110.0
  - @voyant-travel/utils@0.111.1

## 0.151.0

### Minor Changes

- bd8f49a: Add the versioned authenticated admin shell bootstrap contract, managed-host
  resolver seam, and TanStack Query hydration path for shell-critical state.
- 1e0506f: Add a declarative lazy loading boundary for route-only admin extensions and move
  business-account, custom-field, and webhook settings implementations out of the
  initial operator entry graph.

### Patch Changes

- Updated dependencies [afb6866]
- Updated dependencies [5d1b298]
  - @voyant-travel/db@0.121.0
  - @voyant-travel/distribution@0.227.23
  - @voyant-travel/hono@0.142.2
  - @voyant-travel/types@0.109.13
  - @voyant-travel/core@0.140.2

## 0.150.21

### Patch Changes

- c5df070: Storefront admin responses accept fields the runtime provider owns

  The storefront runtime is a port, and Voyant Cloud's control plane serves managed
  storefronts with an `organizationId` this package does not model. The admin
  response contracts were `.strict()`, so that one field rejected the object, the
  object rejected the array, and the storefronts page rendered its error state on a
  healthy 200 — indistinguishable from an outage, and no retry could clear it.

  Request bodies stay closed; response objects now strip what they do not know.
  Refresh on the packaged storefronts page also retries every query its failure
  banner speaks for, instead of only the list.

## 0.150.20

### Patch Changes

- 47eec8a: Serve storefront channel bindings from the request database when the deployment
  wires no `LinkService`.

  `createLinkServiceStorefrontChannelBindingProvider` required `context.link`, a
  service that reaches the request only when the composition wired the generated
  project link registry. `loadVoyantProject` does that; the managed operator
  runtime composes the graph straight from a profile snapshot and never reads
  those artifacts, so `context.link` was absent on every managed request and the
  provider threw on all of them — `GET /v1/admin/storefronts/storefronts` answered
  500 and the admin rendered "Storefronts unavailable" on every managed
  deployment.

  The type already called the service optional. It now is: the provider builds a
  request-scoped service over its own `storefrontChannelLink` when the deployment
  supplied none, reading and writing the same
  `auth_storefront_distribution_channel` pivot table that ships as a
  `@voyant-travel/db` migration. A deployment-supplied `LinkService` is still
  preferred where one exists, so the self-hosted path is unchanged.

  Degrading to "no binding" was the other option on the table and is worse: the
  public catalog guard refuses on a missing channel rather than on an error, so a
  provider that returned nothing would trade a 500 in the admin for a silent 403
  on every storefront read.

## 0.150.19

### Patch Changes

- 2d1005f: Resolve the storefront sales channel on both auth profiles, not just self-host.

  A managed deployment supplies its own `resolveCustomerAuthContext`, which brokers
  storefront credentials through a control plane that has no channel concept. The
  returned context therefore never carried `storefrontChannel`, so every
  `/v1/public/*` catalog read answered `403 Public storefront channel context is
required.` on a guard that profile could never satisfy — while the
  Storefront -> Channel link rows sat unread in the deployment database.

  The runtime now decorates a host-supplied resolver with
  `withResolvedStorefrontChannel`, which reads that binding through the existing
  link-service provider and fills in the channel the host could not know. A
  context that already carries a channel is returned untouched, and a lookup that
  cannot resolve one leaves the host's context alone rather than failing the
  request — the downstream guards still apply.

  Each state in which a public request ends up without a channel (storefront not
  resolved here, no binding, binding inactive) is now logged as a distinguishable
  warning, so the identical 403 they all produce can be told apart from outside.

## 0.150.18

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0
  - @voyant-travel/db@0.120.6
  - @voyant-travel/distribution@0.227.18
  - @voyant-travel/hono@0.142.1

## 0.150.17

### Patch Changes

- ef200c9: Make the Storefronts admin surface reachable again.

  Storefronts were scoped to a Better Auth operator organization, but the operator
  auth realm never creates one — the `organization` plugin is wired for the
  customer realm only. So `organization` is empty on every deployment: reads
  filtered to nothing, writes failed the `organization_id` foreign key, and the
  route rejected the session outright with "No active operator organization." A
  tenant could neither create a storefront nor read its keys.

  A self-host deployment is the tenant boundary (`docs/adr/0001-tenant-scoping.md`),
  so a storefront now belongs to the deployment: `organization_id` is dropped from
  `storefronts`, `storefront_api_keys`, and `storefront_customer_auth_credentials`,
  the slug is unique per deployment, and `StorefrontDto.organizationId` is gone
  from the admin contract. Authorization is unchanged — the `/v1/admin/*` staff
  guard and the `storefronts:*` scopes.

  Also stops rejecting a trusted origin that carries a path. The env allowlist is
  built from `APP_URL`, which is documented and shipped as the API base
  (`http://host:3300/api`); an origin check only ever compares origins, so the path
  is narrowed away instead of throwing. Rejecting it made every public catalog read
  answer 500 with "customer auth trusted origin must be an absolute HTTP(S) origin".

- Updated dependencies [ef200c9]
  - @voyant-travel/db@0.120.5

## 0.150.16

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/hono@0.142.0
  - @voyant-travel/distribution@0.227.14

## 0.150.15

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0
  - @voyant-travel/hono@0.141.0
  - @voyant-travel/db@0.120.3
  - @voyant-travel/distribution@0.227.13

## 0.150.14

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2
  - @voyant-travel/distribution@0.227.3
  - @voyant-travel/hono@0.140.1

## 0.150.13

### Patch Changes

- 934c1dd: Resolve a storefront by origin against the jsonb column it actually has.

  `resolveStorefrontByOrigin` filtered `storefronts.allowed_origins` as if it were
  a Postgres `text[]`: exact matches used `@> ARRAY[$1]::text[]` and the wildcard
  candidate scan used `unnest(...)`. The column is declared `jsonb`
  (`packages/db/src/schema/iam/storefronts.ts`), and neither `jsonb @> text[]` nor
  `unnest(jsonb)` exists, so both statements failed to plan.

  Because it is a type error rather than a data condition, it fired on every call
  regardless of what was stored — an empty `storefronts` table reproduces it. Any
  public storefront request carrying an `Origin` header returned 500, which covers
  keyless preflight authorization and origin-resolved storefront reads.

  The filters now speak jsonb: `@> $1::jsonb` for exact containment and
  `jsonb_array_elements_text(...)` for the wildcard candidate scan. Both were
  executed against Postgres rather than reviewed by eye.

  `packages/auth/tests/integration/local-storefront.test.ts` already covered this
  and already asserted the right thing — it fails with the query error the moment
  a database is present. It never ran: the suite is `describe.skipIf(!TEST_DATABASE_URL)`
  and the `db-integration` CI lane enumerates its files by hand, with no
  `@voyant-travel/auth` entry. That file is now in the lane, so the fix is guarded.

## 0.150.12

### Patch Changes

- Updated dependencies [c35841b]
  - @voyant-travel/hono@0.140.0
  - @voyant-travel/distribution@0.227.1
  - @voyant-travel/core@0.137.2

## 0.150.11

### Patch Changes

- Updated dependencies [4c694f6]
  - @voyant-travel/distribution@0.227.0

## 0.150.10

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
- Updated dependencies [14033fb]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/hono@0.139.0
  - @voyant-travel/distribution@0.226.2
  - @voyant-travel/types@0.109.12

## 0.150.9

### Patch Changes

- @voyant-travel/distribution@0.226.0

## 0.150.8

### Patch Changes

- @voyant-travel/distribution@0.225.0

## 0.150.7

### Patch Changes

- Updated dependencies [c986bd5]
  - @voyant-travel/core@0.137.1
  - @voyant-travel/distribution@0.224.0
  - @voyant-travel/db@0.119.4

## 0.150.6

### Patch Changes

- @voyant-travel/distribution@0.223.0
- @voyant-travel/db@0.119.3

## 0.150.5

### Patch Changes

- @voyant-travel/distribution@0.222.0

## 0.150.4

### Patch Changes

- b6df6c2: Stop rejecting storefronts whose hosting kind belongs to the runtime provider.
  The storefront admin response contract enumerated `cloud_site` and `external`,
  so a deployment backed by a control plane that mints its own hosting kinds
  failed the whole list response and rendered the storefronts page error state on
  a healthy 200. Response hosting kinds are now open; the create input keeps the
  operator enum, exported as `operatorStorefrontHostingKindSchema`.

## 0.150.3

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/distribution@0.221.0

## 0.150.2

### Patch Changes

- @voyant-travel/distribution@0.220.0

## 0.150.1

### Patch Changes

- Updated dependencies [bdc0443]
  - @voyant-travel/distribution@0.219.1

## 0.150.0

## 0.149.0

### Minor Changes

- 0c30250: Make `createStandardOperatorRouteFiles` a pure function of resolved
  deployment-graph data (voyant#3976 item 10.1).

  The standard operator route generator previously hardcoded the presentation
  IDs and route tables for auth, storefront, finance, quotes, and MCP consent, so
  a package could not get admin routes emitted without editing
  `@voyant-travel/operator-standard`. Each presentation now declares its own
  route contribution on its `presentations` graph entry via `contribution` and
  `routes`, and the generator emits from those declarations.

  `VoyantGraphPresentationDeclaration` gains optional `contribution` and `routes`
  fields (`VoyantGraphPresentationRouteDeclaration`), validated in the deployment
  graph: when `routes` is non-empty, `contribution` must be a non-empty string,
  each `route` must start with `/`, and each `member` must be a non-empty string.
  The product BOM now carries the full presentation declarations rather than just
  their IDs. This is a behaviour-preserving refactor — the emitted route-file set
  is byte-identical to before.

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
  - @voyant-travel/tools@0.10.0
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1
  - @voyant-travel/hono@0.138.1

## 0.148.0

### Patch Changes

- Updated dependencies [e87d4de]
  - @voyant-travel/hono@0.138.0

## 0.147.1

### Patch Changes

- Updated dependencies [fae0f36]
  - @voyant-travel/tools@0.9.0

## 0.147.0

## 0.146.2

### Patch Changes

- Updated dependencies [d92a98a]
  - @voyant-travel/hono@0.137.0

## 0.146.1

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/hono@0.136.0
  - @voyant-travel/tools@0.8.0

## 0.146.0

### Minor Changes

- 7496159: Add an OAuth 2.1 authorization server so chat assistants can connect to the deployment's MCP endpoint by URL alone.

  Claude and ChatGPT add remote MCP servers by pasting a URL — there is nowhere to supply an API token — so they follow the MCP authorization spec instead: dynamic client registration (RFC 7591), authorization code + PKCE, and a browser consent step. This adds that server on the admin realm via `@better-auth/oauth-provider`, with `oauth_client` / `oauth_access_token` / `oauth_refresh_token` / `oauth_consent` / `jwks` tables.

  The grant is coarse (`mcp:read`, optionally `mcp:write`) because a consent screen cannot ask a travel agent about fifty resource scopes. Effective permissions are re-derived per request from the approving staff member's current role, intersected with the actions their owning packages mark remote-safe and non-sensitive — so a connector never exceeds the person who approved it, and narrowing someone's role immediately narrows every connector they approved.

  Access tokens are signed JWTs verified against the published JWKS. Because a JWT cannot be withdrawn once signed, the resource server also re-checks the connector's consent row on every request, so disconnecting a connector takes effect on its next call rather than whenever its token happens to expire.

  Discovery documents are served at the origin root, with authorization-server endpoints rewritten onto the public API base — the Hono app strips that prefix before the auth handler sees a request, so the URLs Better Auth advertises would otherwise point at the admin SPA instead of the authorization server.

### Patch Changes

- 6d0b4b4: Emit the RFC 9728 `WWW-Authenticate` challenge on the MCP surface, and admit the OAuth endpoints in Voyant Cloud auth mode.

  An anonymous request to `/v1/admin/mcp` previously fell through to a bare 401 with no challenge header. That header is the entry point of the connector handshake — an assistant dials the pasted URL with no credential and follows `resource_metadata` from there to discovery — so without it nothing downstream was reachable.

  Managed deployments additionally returned 404 for every `/oauth2/*` path, because the cloud-mode allowlist predates them: discovery advertised an authorization server that rejected every request to it.

- Updated dependencies [8adeb23]
- Updated dependencies [6d0b4b4]
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/hono@0.135.0
  - @voyant-travel/types@0.109.10

## 0.145.0

## 0.144.0

## 0.143.9

### Patch Changes

- 5541809: Retarget cloud-auth staff links to the active runtime deployment after a successful platform revalidation so managed deploy cutover does not strand signed-in admin sessions on `/v1/admin/*`.

## 0.143.8

### Patch Changes

- 36db91f: Keep org API-key MCP catalog composition available when team-management has no acting user, and project Date-bearing Tool input schemas to JSON Schema datetime strings so `tools/list` no longer fail-closes for Max discovery.

## 0.143.7

### Patch Changes

- cb7221d: Quarantine `team.action.revoke-invitation`, `team.action.update-member-role`,
  `team.action.activate-member`, and `team.action.deactivate-member` from
  agent Tool exposure (`availability: "unavailable"`,
  `effectBoundary: "multistage"`), matching the existing
  `team.action.invite-member` posture. All four share the
  `auth.team-management-runtime` port, whose cloud adapter calls an external
  identity provider with no proven crash-safe replay contract, so declaring
  `effectBoundary: "local"` would misrepresent the actual effect boundary.
  Admin UI management of team members is unaffected — those routes call the
  runtime provider directly rather than through the Tool registry.

## 0.143.6

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/tools@0.7.0

## 0.143.5

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

## 0.143.4

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/db@0.118.5
  - @voyant-travel/hono@0.134.5

## 0.143.3

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4
  - @voyant-travel/hono@0.134.4

## 0.143.2

## 0.143.1

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/tools@0.5.0
  - @voyant-travel/db@0.118.3
  - @voyant-travel/hono@0.134.3

## 0.143.0

### Minor Changes

- 58020ec: Keep first-party Tools with unproven non-transactional external or multi-stage effects out of
  runtime discovery. The affected graph actions remain available as diagnostic metadata with an
  explicit unsafe-effect reason until each package gains tested transactional, outbox, or saga
  durability. This also covers supplier-side flight cancellation and contract execution whose
  post-commit lifecycle event is not yet durably published.

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
- Updated dependencies
  - @voyant-travel/core@0.133.0
  - @voyant-travel/tools@0.4.0
  - @voyant-travel/db@0.118.2
  - @voyant-travel/hono@0.134.2

## 0.142.1

### Patch Changes

- 84dd9cb: Resolve managed staff sessions with the active Voyant Cloud link's platform organization so organization-scoped admin routes authorize correctly.

## 0.142.0

## 0.141.5

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1
  - @voyant-travel/hono@0.134.1

## 0.141.4

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/hono@0.134.0
  - @voyant-travel/types@0.109.9

## 0.141.3

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/hono@0.133.0
  - @voyant-travel/utils@0.109.0

## 0.141.2

## 0.141.1

### Patch Changes

- Updated dependencies [b320e4f]
  - @voyant-travel/hono@0.132.0

## 0.141.0

### Minor Changes

- f0a0e09: Make the storefront public API consumable by direct (cross-origin SPA and
  native/mobile) clients with the same operator-configured storefront keys and
  per-storefront allowed origins already used by the same-origin BFF.

  - The local storefront customer-auth resolver now derives the storefront origin
    from the standard `Origin` header when the BFF `x-voyant-storefront-origin`
    header is absent (the BFF header still wins), so direct clients authorize
    against a storefront's declared origins without a BFF hop. The server/BFF
    contract is unchanged.
  - The resolved storefront's declared origins are folded into Better Auth
    `trustedOrigins` (unioned with the static env allowlist) at request time, and
    surfaced as `allowedOrigins` on the customer auth context for dynamic CORS.
  - Direct clients use bearer customer sessions: the customer Better Auth realm now
    enables the `bearer` plugin, so a sign-in returns a session token the client
    sends as `Authorization: Bearer <token>` on later `/v1/public/*` calls. Cookies
    stay host-only and BFF/same-origin only (no `SameSite=None`).
  - A request-time dynamic-CORS origin authorizer (`resolveCustomerCorsOrigin`)
    echoes only a storefront-authorized origin (never `*`) for the customer realm
    (`/v1/public/*` + `/auth/customer/*`); keyless preflight is authorized against
    any storefront that declares the origin via the new
    `StorefrontRuntimeProvider.resolveStorefrontByOrigin`. Admin/dash surfaces keep
    the static `CORS_ALLOWLIST` behavior. The shared Hono `cors()` middleware and
    the `VoyantAuthIntegration.resolveCorsOrigin` seam carry this into the app.

## 0.140.3

### Patch Changes

- 7cbfa51: Return a clean 401/403 instead of a 500 when a storefront customer-auth request
  presents a missing/invalid storefront access key or a missing/disallowed origin.
  `StorefrontCustomerAuthResolutionError` now carries an HTTP status and a stable,
  non-leaky code, and the auth handler's error boundary translates it to 401
  (missing/invalid key or missing origin header) or 403 (a known key presented
  from a disallowed origin). Genuine server faults still surface as 500.

## 0.140.2

### Patch Changes

- @voyant-travel/db@0.117.1

## 0.140.1

## 0.140.0

### Minor Changes

- 4f34425: Add the operator Storefronts admin surface on top of the storefront runtime port.

  The Auth package gains an operator-scoped storefront admin API (CRUD, allowed
  origins, reveal-once key issue/rotate/revoke, account policy + auth methods, and
  provider credential management), wired into the selected admin graph. Auth React
  gains the "Storefronts" admin surface (list, per-storefront detail, keys with
  show-once reveal, customer account settings, and provider credentials), with the
  former top-level "Sites" surface reparented as a sub-view. Business buyer-account
  controls are gated on the runtime capability derived from whether customer
  business-account onboarding is wired.

## 0.139.0

## 0.138.0

### Minor Changes

- 43e7754: Add the self-host storefront access model: a storefront runtime port + local adapter, schema (storefronts, storefront API keys, storefront customer-auth credentials) with migration, publishable/secret key helpers, an operator-declared allowed-origins normalizer, and a local customer-auth resolver.

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/hono@0.131.2
  - @voyant-travel/types@0.109.8

## 0.137.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/hono@0.131.1
  - @voyant-travel/types@0.109.7

## 0.136.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/hono@0.131.0
  - @voyant-travel/types@0.109.6

## 0.135.1

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/hono@0.130.1

## 0.135.0

### Minor Changes

- 16e2c2c: Mount the isolated customer Better Auth realm in managed Node runtimes while keeping Voyant Cloud as the admin broker. Resolve managed storefront auth configuration asynchronously, use its public API base for OAuth callbacks and password-reset links, and export the standard Voyant Cloud auth email sender for host composition.

## 0.134.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/hono@0.130.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/db@0.114.14

## 0.133.5

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.
- Updated dependencies [1881293]
  - @voyant-travel/hono@0.129.1

## 0.133.4

### Patch Changes

- Updated dependencies [96c91b9]
  - @voyant-travel/hono@0.129.0

## 0.133.3

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/hono@0.128.6

## 0.133.2

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/core@0.126.1
  - @voyant-travel/db@0.114.12
  - @voyant-travel/hono@0.128.5

## 0.133.1

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11
  - @voyant-travel/hono@0.128.4

## 0.133.0

## 0.132.5

## 0.132.4

### Patch Changes

- 2c863ab: Grant managed-cloud admin sessions explicit access-catalog scopes for admin-only resources such as Team management.
- Updated dependencies [2c863ab]
  - @voyant-travel/types@0.109.3

## 0.132.3

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/hono@0.128.1

## 0.132.2

## 0.132.1

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/hono@0.128.0
  - @voyant-travel/db@0.114.8

## 0.132.0

### Patch Changes

- Updated dependencies [a1842a7]
  - @voyant-travel/hono@0.127.2

## 0.131.0

### Minor Changes

- 848b581: Add provider-neutral, staff-only team-management Tools for roster, roles,
  invitations, and access lifecycle operations. Sensitive writes require explicit
  confirmation and are declared as approval- and ledger-gated graph actions.
  The Tools fail closed unless deployment authentication supplies an explicit
  acting user; organization-only MCP API keys are not treated as user identity and
  remain non-invocable until a delegated-user or service-principal model exists.

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

## 0.130.0

### Minor Changes

- 6147b93: Add a package-owned `/settings/team` surface backed by a graph-selected,
  provider-neutral team-management runtime port. Better Auth and Voyant Cloud now
  adapt roster, invitation, role, deactivation, capability, and nullable activity
  data behind the same server-enforced contract. Move the team route, page, copy,
  and icon from the admin shell into Auth and Auth React.

### Patch Changes

- a98ec27: Enforce local member deactivation across every Better Auth sign-in path and serialize owner mutations so concurrent requests cannot remove the final active owner.
- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/hono@0.127.0
  - @voyant-travel/db@0.114.6

## 0.129.0

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
  - @voyant-travel/db@0.114.5
  - @voyant-travel/types@0.109.2

## 0.128.3

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/hono@0.126.3

## 0.128.2

### Patch Changes

- @voyant-travel/db@0.114.3

## 0.128.1

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0
  - @voyant-travel/db@0.114.2
  - @voyant-travel/hono@0.126.2

## 0.128.0

### Minor Changes

- 4bc540f: Remove the top-level `useSecureCookies` compatibility option from
  `createBetterAuth`. Configure this Better Auth setting through
  `advanced.useSecureCookies` instead. See [Migrating Auth to
  0.128](../../docs/migrations/migrating-to-0.128.md) for the caller rewrite.

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/hono@0.126.1

## 0.127.0

### Minor Changes

- d4fa159: Rename the Node runtime subpath from `@voyant-travel/auth/operator-node-runtime` to `@voyant-travel/auth/node-runtime`.

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/hono@0.126.0
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0

## 0.126.0

### Minor Changes

- 490d132: Move credential invitations and cloud team management into auth-owned graph
  units, with deployment configuration and email delivery supplied through a
  typed runtime port.

### Patch Changes

- 490d132: Move the final Operator runtime-port registrations into package-owned contributor surfaces.
- 490d132: Move capability-derived Node runtime binding assembly into package-owned contributors.
- 490d132: Own the reusable Node Better Auth and Voyant Cloud broker runtime behind a typed deployment adapter.
- 490d132: Declare package-owned runtime contributors in `voyant.package.v1` metadata and statically lower selected contributors into generated Node graph source. Node hosts now compose one generated contributor set from opaque host resources without enumerating first-party factories or package IDs.
- c65b05c: Own the standard Node database lifecycle and cross-subdomain cookie policy in the auth runtime.
- 490d132: Compose package runtimes from generic Node primitives and typed graph ports instead of Operator capability wiring.
- 490d132: Make package and project declarations the sole selected access authority, removing legacy catalog overlays and runtime synthesis.
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

## 0.125.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.

### Patch Changes

- Updated dependencies [d771be3]
  - @voyant-travel/types@0.108.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/utils@0.106.1

## 0.124.2

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/types@0.107.3

## 0.124.1

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/db@0.111.0
  - @voyant-travel/types@0.107.2

## 0.124.0

## 0.123.0

## 0.122.0

## 0.121.0

## 0.120.2

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/types@0.107.1

## 0.120.1

### Patch Changes

- c2a0daf: Expose Better Auth advanced options so deployments can configure cross-subdomain session cookies.

## 0.120.0

## 0.119.1

### Patch Changes

- 56dfb00: Allow customer-scoped email/password self-signups to bypass the admin bootstrap signup block and skip workspace profile provisioning when the signup is explicitly marked as a customer surface.

## 0.119.0

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

- Updated dependencies [c9a356f]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/db@0.109.5

## 0.118.2

### Patch Changes

- 5ffd426: Add a stable `/auth/organization/list-members` facade backed by Better Auth
  member tables so operator quote owner lookups no longer fall through to a 404.

## 0.118.1

## 0.118.0

### Patch Changes

- @voyant-travel/utils@0.105.4

## 0.117.0

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
  - @voyant-travel/utils@0.105.3

## 0.116.1

### Patch Changes

- b6fa89d: Add `customerSignupSurfaces` to `createBetterAuth` so supported OTP customer
  self-signups can be stamped with a non-admin surface before the single-tenant
  signup guard evaluates the new user.

## 0.116.0

### Patch Changes

- @voyant-travel/db@0.108.3

## 0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/db@0.108.2

## 0.113.5

## 0.113.4

### Patch Changes

- 28898ad: Fix migration-facing publish artifacts by exporting all Distribution-owned supplier and external-reference schemas, republishing contract packages with complete dist files, guarding packed artifacts against legacy package-scope specifiers, and updating Voyant Cloud defaults to `https://api.voyant.travel`.
- Updated dependencies [28898ad]
  - @voyant-travel/utils@0.105.2

## 0.113.3

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0

## 0.113.2

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0

## 0.113.1

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/db@0.107.0

## 0.113.0

### Minor Changes

- 7255353: `createBetterAuth` enables Better Auth's session `cookieCache` by default (signed cookie, 5-minute TTL): `getSession` answers from the cookie with zero Postgres roundtrips on most requests. Trade-off: a revoked session can stay usable for up to `maxAge` seconds. Disable with `sessionCookieCache: false` or tune via `sessionCookieCache: { maxAge }` for revocation-sensitive deployments.

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/db@0.106.0

## 0.112.1

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/db@0.105.0

## 0.112.0

## 0.111.0

## 0.110.0

## 0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/db@0.104.4

## 0.107.0

## 0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/db@0.104.3

## 0.104.1

### Patch Changes

- @voyant-travel/db@0.104.1
- @voyant-travel/utils@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/db@0.104.0
- @voyant-travel/utils@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/db@0.103.0
- @voyant-travel/utils@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/db@0.102.0
- @voyant-travel/utils@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/db@0.101.2
- @voyant-travel/utils@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/db@0.101.1
- @voyant-travel/utils@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/db@0.101.0
- @voyant-travel/utils@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/db@0.100.0
- @voyant-travel/utils@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/db@0.99.0
- @voyant-travel/utils@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/db@0.98.0
  - @voyant-travel/utils@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/db@0.97.0
- @voyant-travel/utils@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/db@0.96.0
- @voyant-travel/utils@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/db@0.95.0
- @voyant-travel/utils@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/db@0.94.0
- @voyant-travel/utils@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/db@0.93.0
- @voyant-travel/utils@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/db@0.92.0
- @voyant-travel/utils@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/db@0.91.0
  - @voyant-travel/utils@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/db@0.90.0
- @voyant-travel/utils@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/db@0.89.0
- @voyant-travel/utils@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/db@0.88.0
- @voyant-travel/utils@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/db@0.87.1
- @voyant-travel/utils@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/db@0.87.0
- @voyant-travel/utils@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/db@0.86.0
- @voyant-travel/utils@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/db@0.85.4
- @voyant-travel/utils@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/db@0.85.3
- @voyant-travel/utils@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/db@0.85.2
- @voyant-travel/utils@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/db@0.85.1
- @voyant-travel/utils@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/db@0.85.0
- @voyant-travel/utils@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/db@0.84.4
- @voyant-travel/utils@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/db@0.84.3
- @voyant-travel/utils@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/db@0.84.2
- @voyant-travel/utils@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/db@0.84.1
  - @voyant-travel/utils@0.84.1

## 0.84.0

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/db@0.84.0
  - @voyant-travel/utils@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/db@0.83.1
- @voyant-travel/utils@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/db@0.83.0
- @voyant-travel/utils@0.83.0

## 0.82.1

### Patch Changes

- 728bc12: Pin Better Auth core and API key plugin dependencies to the same compatible 1.6.11 release to avoid mixed plugin/core installs.
  - @voyant-travel/db@0.82.1
  - @voyant-travel/utils@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/db@0.82.0
- @voyant-travel/utils@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/db@0.81.21
- @voyant-travel/utils@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/db@0.81.20
- @voyant-travel/utils@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/db@0.81.19
- @voyant-travel/utils@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/db@0.81.18
- @voyant-travel/utils@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/db@0.81.17
- @voyant-travel/utils@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/db@0.81.16
- @voyant-travel/utils@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/db@0.81.15
- @voyant-travel/utils@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/db@0.81.14
- @voyant-travel/utils@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/db@0.81.13
- @voyant-travel/utils@0.81.13

## 0.81.12

### Patch Changes

- 308bad0: Scope the default Better Auth signup guard to admin-surface users so customer-facing auth plugins can create storefront users.
  - @voyant-travel/db@0.81.12
  - @voyant-travel/utils@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/db@0.81.11
- @voyant-travel/utils@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/db@0.81.10
- @voyant-travel/utils@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/db@0.81.9
- @voyant-travel/utils@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/db@0.81.8
- @voyant-travel/utils@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/db@0.81.7
- @voyant-travel/utils@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/db@0.81.6
- @voyant-travel/utils@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/db@0.81.5
- @voyant-travel/utils@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/db@0.81.4
- @voyant-travel/utils@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/db@0.81.3
- @voyant-travel/utils@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/db@0.81.2
- @voyant-travel/utils@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/db@0.81.1
- @voyant-travel/utils@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/db@0.81.0
- @voyant-travel/utils@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/db@0.80.18
- @voyant-travel/utils@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/db@0.80.17
- @voyant-travel/utils@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/db@0.80.16
- @voyant-travel/utils@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/db@0.80.15
- @voyant-travel/utils@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/db@0.80.14
- @voyant-travel/utils@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/db@0.80.13
- @voyant-travel/utils@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/db@0.80.12
- @voyant-travel/utils@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/db@0.80.11
- @voyant-travel/utils@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/db@0.80.10
- @voyant-travel/utils@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/db@0.80.9
- @voyant-travel/utils@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/db@0.80.8
- @voyant-travel/utils@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/db@0.80.7
- @voyant-travel/utils@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/db@0.80.6
- @voyant-travel/utils@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/db@0.80.5
- @voyant-travel/utils@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/db@0.80.4
- @voyant-travel/utils@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/db@0.80.3
- @voyant-travel/utils@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/db@0.80.2
- @voyant-travel/utils@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/db@0.80.1
- @voyant-travel/utils@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/db@0.80.0
- @voyant-travel/utils@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/db@0.79.0
- @voyant-travel/utils@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/db@0.78.0
- @voyant-travel/utils@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/db@0.77.13
- @voyant-travel/utils@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/db@0.77.12
- @voyant-travel/utils@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/db@0.77.11
- @voyant-travel/utils@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/db@0.77.10
- @voyant-travel/utils@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/db@0.77.9
- @voyant-travel/utils@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/db@0.77.8
- @voyant-travel/utils@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/db@0.77.7
- @voyant-travel/utils@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/db@0.77.6
- @voyant-travel/utils@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/db@0.77.5
- @voyant-travel/utils@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/db@0.77.4
- @voyant-travel/utils@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/db@0.77.3
- @voyant-travel/utils@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/db@0.77.2
- @voyant-travel/utils@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/db@0.77.1
- @voyant-travel/utils@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/db@0.77.0
- @voyant-travel/utils@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/db@0.76.0
- @voyant-travel/utils@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/db@0.75.7
- @voyant-travel/utils@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/db@0.75.6
- @voyant-travel/utils@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/db@0.75.5
- @voyant-travel/utils@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/db@0.75.4
- @voyant-travel/utils@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/db@0.75.3
- @voyant-travel/utils@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/db@0.75.2
- @voyant-travel/utils@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/db@0.75.1
- @voyant-travel/utils@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/db@0.75.0
- @voyant-travel/utils@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/db@0.74.2
- @voyant-travel/utils@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/db@0.74.1
- @voyant-travel/utils@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/db@0.74.0
- @voyant-travel/utils@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/db@0.73.1
- @voyant-travel/utils@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/db@0.73.0
- @voyant-travel/utils@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/db@0.72.0
- @voyant-travel/utils@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/db@0.71.0
- @voyant-travel/utils@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/db@0.70.0
- @voyant-travel/utils@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/db@0.69.1
- @voyant-travel/utils@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/db@0.69.0
- @voyant-travel/utils@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/db@0.68.0
- @voyant-travel/utils@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/db@0.67.0
- @voyant-travel/utils@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/db@0.66.6
- @voyant-travel/utils@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/db@0.66.5
- @voyant-travel/utils@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/db@0.66.4
- @voyant-travel/utils@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/db@0.66.3
- @voyant-travel/utils@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/db@0.66.2
- @voyant-travel/utils@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/db@0.66.1
- @voyant-travel/utils@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/db@0.66.0
- @voyant-travel/utils@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/db@0.65.0
- @voyant-travel/utils@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/db@0.64.1
- @voyant-travel/utils@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/db@0.64.0
  - @voyant-travel/utils@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/db@0.63.1
- @voyant-travel/utils@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/db@0.63.0
- @voyant-travel/utils@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/db@0.62.3
- @voyant-travel/utils@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/db@0.62.2
- @voyant-travel/utils@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/db@0.62.1
- @voyant-travel/utils@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/db@0.62.0
  - @voyant-travel/utils@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/db@0.61.0
- @voyant-travel/utils@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/db@0.60.0
  - @voyant-travel/utils@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/db@0.59.0
- @voyant-travel/utils@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/db@0.58.0
- @voyant-travel/utils@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/db@0.57.0
- @voyant-travel/utils@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/db@0.56.0
- @voyant-travel/utils@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/db@0.55.1
  - @voyant-travel/utils@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/db@0.55.0
- @voyant-travel/utils@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/db@0.54.0
- @voyant-travel/utils@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/db@0.53.2
- @voyant-travel/utils@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/db@0.53.1
- @voyant-travel/utils@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/db@0.53.0
- @voyant-travel/utils@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/db@0.52.4
- @voyant-travel/utils@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/db@0.52.3
  - @voyant-travel/utils@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/db@0.52.2
- @voyant-travel/utils@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/db@0.52.1
- @voyant-travel/utils@0.52.1

## 0.52.0

### Minor Changes

- 1468e12: Add an `onUserProvisioning` hook to the Voyant Cloud admin session plugin for Cloud-mode mirror side effects.
- 1468e12: Add the Voyant Cloud admin session plugin subpath for Better Auth-backed Cloud broker callbacks.

### Patch Changes

- @voyant-travel/db@0.52.0
- @voyant-travel/utils@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/db@0.51.1
- @voyant-travel/utils@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/db@0.51.0
- @voyant-travel/utils@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/db@0.50.8
- @voyant-travel/utils@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/db@0.50.7
- @voyant-travel/utils@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/db@0.50.6
- @voyant-travel/utils@0.50.6

## 0.50.5

### Patch Changes

- c2b36ce: Allow Better Auth plugin Drizzle tables to be passed through createBetterAuth.
  - @voyant-travel/db@0.50.5
  - @voyant-travel/utils@0.50.5

## 0.50.4

### Patch Changes

- d1f7559: Forward Better Auth `user` options from `createBetterAuth`, including `user.additionalFields`, while preserving Voyant's default change-email support.
  - @voyant-travel/db@0.50.4
  - @voyant-travel/utils@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/db@0.50.3
- @voyant-travel/utils@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/db@0.50.2
- @voyant-travel/utils@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/db@0.50.1
- @voyant-travel/utils@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/db@0.50.0
- @voyant-travel/utils@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/db@0.49.0
- @voyant-travel/utils@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/db@0.48.0
- @voyant-travel/utils@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/db@0.47.0
- @voyant-travel/utils@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/db@0.46.0
- @voyant-travel/utils@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/db@0.45.0
- @voyant-travel/utils@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/db@0.44.0
- @voyant-travel/utils@0.44.0

## 0.43.0

### Minor Changes

- d07215e: Add first-class API token rotation and audit-facing token context. The auth facade now supports `POST /auth/api-tokens/:keyId/rotate`, the React hooks and UI expose rotation, and Hono request context includes `apiTokenId` for downstream audit log writers.

### Patch Changes

- @voyant-travel/db@0.43.0
- @voyant-travel/utils@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/db@0.42.0
- @voyant-travel/utils@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/db@0.41.3
- @voyant-travel/utils@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/db@0.41.2
- @voyant-travel/utils@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/db@0.41.1
- @voyant-travel/utils@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/db@0.41.0
- @voyant-travel/utils@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/db@0.40.1
- @voyant-travel/utils@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/db@0.40.0
- @voyant-travel/utils@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/db@0.39.0
- @voyant-travel/utils@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/db@0.38.2
- @voyant-travel/utils@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/db@0.38.1
- @voyant-travel/utils@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/db@0.38.0
- @voyant-travel/utils@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/db@0.37.1
- @voyant-travel/utils@0.37.1

## 0.37.0

### Minor Changes

- 5c0cd16: Add shared account self-service profile helpers, account mutation hooks, and reusable account page/forms.
- 5686880: Add the shared account profile update contract, React mutation helper, and card-less onboarding profile completion page.

### Patch Changes

- @voyant-travel/db@0.37.0
- @voyant-travel/utils@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/db@0.36.0
- @voyant-travel/utils@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/db@0.35.0
- @voyant-travel/utils@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [a37d4af]
  - @voyant-travel/db@0.34.0
  - @voyant-travel/utils@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/db@0.33.1
- @voyant-travel/utils@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/db@0.33.0
- @voyant-travel/utils@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/db@0.32.3
- @voyant-travel/utils@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/db@0.32.2
- @voyant-travel/utils@0.32.2

## 0.32.1

### Patch Changes

- 085c01b: Expose a shared `/auth/api-tokens` management facade for permissioned Better Auth API keys and document the React hooks' expected route contract.
  - @voyant-travel/db@0.32.1
  - @voyant-travel/utils@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/db@0.32.0
- @voyant-travel/utils@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/db@0.31.4
- @voyant-travel/utils@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/db@0.31.3
  - @voyant-travel/utils@0.31.3

## 0.31.2

### Patch Changes

- 54ddc93: Add API token management powered by Better Auth API keys, including reusable React hooks, a shared auth UI package, canonical permission presets, and API-key route permission guards.
  - @voyant-travel/db@0.31.2
  - @voyant-travel/utils@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/db@0.31.1
- @voyant-travel/utils@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/db@0.31.0
- @voyant-travel/utils@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/db@0.30.7
- @voyant-travel/utils@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/db@0.30.6
  - @voyant-travel/utils@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/db@0.30.5
- @voyant-travel/utils@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/db@0.30.4
- @voyant-travel/utils@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/db@0.30.3
- @voyant-travel/utils@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/db@0.30.2
- @voyant-travel/utils@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/db@0.30.1
- @voyant-travel/utils@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/db@0.30.0
- @voyant-travel/utils@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/db@0.29.0
  - @voyant-travel/utils@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/db@0.28.3
- @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/db@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/db@0.28.1
- @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/db@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/db@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/db@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/db@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/db@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/db@0.26.6
- @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/db@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/db@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/db@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- ffdb485: Make `auth.user.email` nullable and add `phone_number` columns so phone-only signups (Better Auth phone-OTP plugin) no longer need a synthetic `<phone>@phone.protravel.ro` placeholder (closes #441).

  Schema: drops the email-only `UNIQUE` on `auth.user.email`, alters the column to nullable, adds `phone_number` (text, nullable) + `phone_number_verified` (boolean, default false), creates partial unique indexes (`user_email_unique WHERE email IS NOT NULL`, `user_phone_unique WHERE phone_number IS NOT NULL`), and a check constraint `user_email_or_phone CHECK (email IS NOT NULL OR phone_number IS NOT NULL)` so a row must carry at least one identifier. Migration ships `templates/operator/migrations/0025_user_email_nullable_phone.sql`.

  Consumer cleanup:

  - `@voyant-travel/auth`'s `CurrentUser` type and `getCurrentUser` / `ensureCurrentUserProfile` now treat email as nullable; phone-only signups fall through provisioning instead of being rejected.
  - `@voyant-travel/auth-react`'s `currentUserSchema` and `organizationMemberUserSchema` accept null email; `currentUserSchema` also exposes the new `phoneNumber` field.
  - `@voyant-travel/customer-portal`'s profile read/write paths handle null `authUser.email`: `getAccessibleBookingIds` and `hasBookingAccess` skip the email-match branch for phone-only users (linked-person matching still works), and `bootstrap` skips email-keyed candidate lookup. Existing email-based flows are unchanged.

  Out of scope for this PR (deferred):

  - Wiring the Better Auth phone-OTP plugin in `@voyant-travel/auth/src/server.ts` (needs SMS provider + signup route work). The schema is now ready for it; the plugin wiring lands in a follow-up.

- Updated dependencies [ffdb485]
  - @voyant-travel/db@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/db@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/db@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/db@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/db@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/db@0.24.2
- @voyant-travel/utils@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/db@0.24.1
- @voyant-travel/utils@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/db@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/db@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/db@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/db@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/db@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/db@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/db@0.19.0
- @voyant-travel/utils@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/db@0.18.0
  - @voyant-travel/utils@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/db@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/db@0.16.0
- @voyant-travel/utils@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/db@0.15.0
- @voyant-travel/utils@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/db@0.14.0
- @voyant-travel/utils@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/db@0.13.0
- @voyant-travel/utils@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/db@0.12.0
  - @voyant-travel/utils@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/db@0.11.0
- @voyant-travel/utils@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [29a581a]
  - @voyant-travel/db@0.10.0
  - @voyant-travel/utils@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/db@0.9.0
- @voyant-travel/utils@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/db@0.8.0
  - @voyant-travel/utils@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/db@0.7.0
- @voyant-travel/utils@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/db@0.6.9
- @voyant-travel/utils@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
  - @voyant-travel/db@0.6.8
  - @voyant-travel/utils@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/db@0.6.7
- @voyant-travel/utils@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/db@0.6.6
- @voyant-travel/utils@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/db@0.6.5
- @voyant-travel/utils@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/db@0.6.4
- @voyant-travel/utils@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/db@0.6.3
  - @voyant-travel/utils@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/db@0.6.2
- @voyant-travel/utils@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/db@0.6.1
- @voyant-travel/utils@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/db@0.6.0
- @voyant-travel/utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/db@0.5.0
  - @voyant-travel/utils@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/db@0.4.5
  - @voyant-travel/utils@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/db@0.4.4
- @voyant-travel/utils@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/db@0.4.3
- @voyant-travel/utils@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/db@0.4.2
- @voyant-travel/utils@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/db@0.4.1
- @voyant-travel/utils@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/db@0.4.0
  - @voyant-travel/utils@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/db@0.3.1
  - @voyant-travel/utils@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/db@0.3.0
- @voyant-travel/utils@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/db@0.2.0
- @voyant-travel/utils@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/db@0.1.1
- @voyant-travel/utils@0.1.1

## 1.1.11

### Patch Changes

- @voyant-travel/db@1.1.11
- @voyant-travel/utils@1.1.11

## 1.1.1

### Patch Changes

- a744775: Fix package exports and build errors: add missing departure-details-service export, add
  default condition to gallery service exports, convert require() to dynamic import() in
  provider-strategy, add getToken to useAuth hook, fix CSS import paths
  - @voyant-travel/db@1.1.1
  - @voyant-travel/utils@1.1.1

## 1.1.0

### Minor Changes

- [#292](https://github.com/voyant-travel/voyant/pull/292)
  [`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)
  Thanks [@mihaipxm](https://github.com/mihaipxm)! - Initial SDK release

### Patch Changes

- Updated dependencies
  [[`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)]:
  - @voyant-travel/db@1.1.0
  - @voyant-travel/utils@1.1.0
