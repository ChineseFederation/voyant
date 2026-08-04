# @voyant-travel/hono

## 0.140.1

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0
  - @voyant-travel/db@0.120.2

## 0.140.0

### Minor Changes

- c35841b: Cache body-keyed public POST reads in the framework, and let catalog search
  declare its own policy.

  `publicResponseCache` was GET-only, so `POST /v1/public/catalog/search` — the
  slowest public read there is — could not declare a cache policy at all. The gap
  was filled downstream by a bespoke cache in the Voyant Cloud dispatcher that
  hardcoded the route path, invented its own TTL, and omitted
  `stale-while-revalidate`. Self-hosted deployments got nothing, and any second
  body-keyed read would have needed the same bespoke treatment.

  A module now declares participation with `bodyKeyedCache`, listing public
  sub-paths whose POST reads are keyed on the canonicalized request body as well
  as the URL and the variant headers. The declaration lives at mount time rather
  than in a response header because the middleware has to canonicalize the body
  _before_ the route runs; the policy itself still lives on the response, which is
  what lets an edge tier honour the same contract instead of matching a path.

  Keying is fail-closed. A request goes to the origin uncached when it carries a
  query string (an unknown parameter must not alias a body-only key), a non-JSON
  or oversized body (64 KiB), `Authorization`, or a caller-specific body field
  anywhere in the payload — embeddings, personalization, session, customer, user,
  preview, or debug. Bodies differing only in property order share an entry.

  `POST /v1/public/catalog/search` declares
  `public, s-maxage=60, stale-while-revalidate=300` for an empty-query browse and
  `s-maxage=30` for a keyword search, on the public surface only. The TTLs stay
  short on purpose: the key carries no catalog projection generation, so the clock
  is still the only invalidation there is (voyant-travel/platform#1726).

  See ADR 0021 §2.

### Patch Changes

- @voyant-travel/core@0.137.2

## 0.139.0

### Minor Changes

- 2bc1570: Honour `stale-while-revalidate`, make the declared TTL authoritative, and stop
  letting one lapse hand the origin latency to every arrival at once.

  `publicResponseCache` parsed only `public` and `s-maxage`. Every route that
  declared a `stale-while-revalidate` — inventory, commerce, storefront, legal,
  cruises, charters — was declaring it to nothing: the entry hard-expired and the
  next arrival paid the full uncached cost. With a slow query behind it, that is
  an outage rather than a slow request, which is what happened in production.

  **Freshness now lives on the entry.** `freshUntil`/`staleUntil` are stored with
  the response, and the backend's own expiry is only a storage lifetime. So the
  declared `s-maxage` is what is in force regardless of Cloudflare KV's 60-second
  floor or the in-process L1's 60-second promotion cap — neither can shorten or
  lengthen a route's policy any more.

  **An entry inside its stale window is served immediately.** One arrival is
  elected to refresh it and every other arrival is served the stored copy without
  waiting. If the elected one abandons its request, the lease expires and the next
  arrival retries, so the entry is never left unrepopulated while everyone waits
  on it. Election goes through `KVStore.putIfAbsent` where the backend supports
  it, and falls back to per-isolate exclusion where it does not.

  The refresh runs in the requesting handler rather than behind the response,
  because Hono discards a route response once the context is finalized — a refresh
  scheduled after the middleware returns would re-store the stale body under a new
  freshness stamp and produce an entry that looks refreshed and never changes.

  **Concurrent cold misses on one key collapse onto one origin computation**
  within the isolate.

  Also fixes two defects in `@voyant-travel/db`'s Postgres runtime stores, both
  found by running their integration tests for the first time:

  - `expires_at` was bound as a `Date`, which the postgres.js adapter cannot
    serialize through a raw `sql` template. Every TTL'd write threw, and the
    response cache's best-effort catch swallowed it — so a deployment selecting
    `cache: "postgres"` had a shared response cache that silently stored nothing.
  - `createPostgresFixedWindowRateLimitStore` used the reserved word `window`
    unquoted in an INSERT column list and conflict target, which Postgres rejects
    outright. Its integration test never ran because the test fixture's DDL had
    the same defect.

  See ADR 0021 §4-5.

- 14033fb: Scope shared public cache entries to the storefront that produced them.

  `publicResponseCache` keyed entries on the request URL alone, while public
  storefront responses are scoped to a sales channel resolved from the `x-api-key`
  storefront key. Two storefronts bound to different channels and served from one
  origin could be served each other's cached responses — `/products/*`,
  `/departures/*`, and `/offers/*` are all channel-gated and shared-cached, and
  their publication gate reads `channelId`.

  The key now carries a digest of the variant-selecting request headers, named by
  the new `keyHeaders` option and defaulting to `["x-api-key"]`. Values are hashed
  rather than embedded, so a storefront key never lands in a KV key or a
  `kv_store` row, and the variant is never resolved through the database — a hit
  still costs no connection, no session lookup, and no module-graph instantiation.

  Two related gaps close with it: a response declaring a `Vary` the key does not
  model is no longer stored, and a request carrying `Authorization` is neither
  served from nor stored into the shared cache.

  The key prefix moves to `respcache:v2:`, which strands existing URL-keyed
  entries rather than reusing them under the new scoping rules.

  See ADR 0021 §3.

### Patch Changes

- Updated dependencies [2bc1570]
- Updated dependencies [2bc1570]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/db@0.120.0
  - @voyant-travel/types@0.109.12

## 0.138.1

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0
  - @voyant-travel/db@0.119.1

## 0.138.0

### Minor Changes

- e87d4de: Expose the deployment's observability sink on the request context as
  `c.var.reporter` (and `c.var.appName`). `createVoyantApp` already resolved a
  `Reporter` for the error boundary, but composed route modules had no way to reach
  it, so a module that emitted its own telemetry had to be handed a reporter
  through every composition seam — and in practice was handed none, so it emitted
  nothing. Falls back to `noopReporter`, so a module may emit unconditionally.

## 0.137.0

### Minor Changes

- d92a98a: Remove the ADR-0007 module-subsetting validator from
  `@voyant-travel/hono/composition`: `findCapabilityGaps`, `CapabilityDeclaration`,
  `CapabilityGraph`, and `CapabilityGap`.

  ADR-0007 is superseded and its runtime-manifest implementation was already
  deleted; `createVoyantApp` has no `exclude` option, so nothing could reach these
  and the only consumer was their own unit test. Modules are components of one
  resident deployable, not deployment units — see ADR-0016.

## 0.136.1

### Patch Changes

- c2963ed: Build the MCP RFC 9728 challenge from the configured public address instead of the request origin. Behind an edge that terminates TLS and rewrites `Host` to the upstream service, the request carries the internal origin, so the `WWW-Authenticate` header advertised a `resource_metadata` URL the client could not reach and the connector handshake died at its first hop. The challenge now reads `API_BASE_URL`, then `APP_URL`, `DASH_BASE_URL`, and the first `CORS_ALLOWLIST` entry — the same configuration the issuer and the protected-resource document derive from — and falls back to the request origin only when none is configured.

## 0.136.0

### Minor Changes

- 52c794d: Scope booking drafts to a capability, and close three more review findings.

  **Draft access control (breaking).** A booking draft holds traveller names and
  contact details, and its id is supplied by the caller on `PUT /drafts/{id}` —
  so anyone who learned or guessed one could read it, overwrite it, delete it, or
  book it. Creating a draft now issues a draft-scoped capability, returned in the
  response and set as an HttpOnly cookie, and reading, writing, deleting, or
  booking that draft requires it. Uses the same capability primitive as checkout.

  **Bearer token no longer cached.** The create response carries a checkout
  capability, and the idempotency middleware persisted response bodies for 24
  hours — putting an HMAC bearer credential at rest in a general-purpose infra
  table, and returning it on replay _without_ its `Set-Cookie`, silently dropping
  the caller's session. The endpoint now opts out of body replay: the durable
  command claim still prevents duplicate bookings, and a retry is issued a fresh
  capability and cookie.

  **A hold is required where the vertical manages inventory.** A draft with no
  `hold_expires_at` skipped every hold check, and hold conversion only runs for
  slot-backed products — so a slotless one could oversell. Creation now requires
  a live hold whenever the vertical implements holds.

  **OpenAPI coverage checks parameters.** `diffOpenApiCoverage` compared only
  request-body field names, so the bookings document could declare a required
  `Idempotency-Key` header the runtime route never did — and the check stayed
  green. It now compares parameters by name, location and requiredness, and its
  documentation states plainly what it does not verify (responses, security, and
  anything behind a `$ref`).

- 52c794d: Check committed OpenAPI documents against the routes actually served.

  The published artifacts are the contract, but nothing tied them to the runtime,
  so a new route, a removed route, or a renamed request field could all land
  without the document noticing — adding `subjectRef` to the public verification
  schemas did exactly that.

  `diffOpenApiCoverage` (from `@voyant-travel/hono/openapi`) compares a document
  generated from the live router against the committed one and reports
  undocumented routes, stale operations, and request-field drift. Request bodies
  are compared by property and required-field names rather than by full schema,
  because generated and hand-authored schemas describe the same contract in
  different but equivalent shapes.

  Finance and storefront-verification now assert zero drift. Applying the check
  surfaced pre-existing drift: three public payment-session operations accept
  `providerConnectionId`, which the published document omitted. It is now
  documented.

### Patch Changes

- 52c794d: Serve public booking creation from `POST /v1/public/bookings`.

  The route was briefly mounted under Finance, which put a `bookings` resource in
  the `finance` namespace while `/v1/public/bookings` already existed and was
  owned by Bookings — two booking namespaces on one public surface. The cause was
  a package dependency, not domain ownership: Finance depends on Bookings and not
  the reverse, so a route in Bookings could not reach the durable create command.

  Bookings now owns the route and Finance supplies the command through the new
  `bookings.self-service-create.runtime` port, inverting that edge exactly as
  `bookings.finance.runtime` already does. The dependency direction is unchanged,
  the public surface has one booking namespace, and the operation is documented in
  the bookings contract where a consumer would look for it.

  **Breaking:** `createPublicBookingCreateRoutes` and
  `PublicBookingCreateRouteOptions` are gone from `@voyant-travel/finance`,
  replaced by `createSelfServiceCreateRuntime`.

  `diffOpenApiCoverage` now scopes stale-operation reporting to the caller's own
  mount, since one committed document can aggregate several API bundles, and
  normalises a root-mounted route's trailing slash.

## 0.135.0

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
- Updated dependencies [7496159]
- Updated dependencies [fa75fe3]
  - @voyant-travel/db@0.119.0
  - @voyant-travel/types@0.109.10

## 0.134.9

### Patch Changes

- 7b60cf5: Attribute trusted managed Max writes to the approving staff user while retaining
  Max provenance in the request context and keeping internal credential scopes as
  a hard authorization cap. Resolve the asserted cloud identity to its
  deployment-local mirror user before exposing it to handlers.
- Updated dependencies [7b60cf5]
  - @voyant-travel/core@0.136.1

## 0.134.8

### Patch Changes

- 9a5fb10: Recognise unbranded `ApiHttpError` instances thrown by a pre-brand copy of this
  package, so validation failures return `400 invalid_request` in a partly
  upgraded dependency graph instead of waiting for every module package to be
  re-released. Matched by class name plus a numeric status — never by status
  alone, which would reflect internal messages.

## 0.134.7

### Patch Changes

- 0173b70: Identify `ApiHttpError` by a registry symbol instead of `instanceof`, so
  validation failures keep returning `400 invalid_request` when the throwing
  module and the error boundary loaded different copies of `@voyant-travel/hono`.
  `ZodError` and `HTTPException` are matched structurally for the same reason.

## 0.134.6

### Patch Changes

- 5daf427: Add the managed Voyant Payments transport and honest capability contract, hosted
  Stripe Connect onboarding for operators, and scheduled storefront reconciliation.

  Expose typed fail-closed adapter errors and onboarding state, render embedded
  onboarding with the required narrowly scoped security headers, and keep payment
  authorization distinct from completed settlement.

  Expand the public payment-adapter conformance kit across authorize, capture,
  void, refund, and status, with capability and fixture honesty, strict positive
  minor-unit money, typed fail-closed errors, full idempotency conflict checks,
  callback signature and replay semantics, stable processor identity and
  references, manual capture, partial-operation bounds, and typed health
  diagnostics. Add deterministic conforming and deliberately broken fake adapters
  that exercise every contract case.

## 0.134.5

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/db@0.118.5

## 0.134.4

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0
  - @voyant-travel/db@0.118.4

## 0.134.3

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0
  - @voyant-travel/db@0.118.3

## 0.134.2

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0
  - @voyant-travel/db@0.118.2

## 0.134.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0
  - @voyant-travel/db@0.118.1

## 0.134.0

### Minor Changes

- f2c9404: Retire the Voyant workflow product and its workflow-runs administration
  surface. Product-owned background behavior is now represented by jobs and
  subscribers, while in-process compensating domain coordination is exposed as a
  saga. Remove workflow deployment providers, graph facets, source conventions,
  runtime composition, and starter scripts.

### Patch Changes

- Updated dependencies [f945310]
- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/db@0.118.0
  - @voyant-travel/core@0.131.0
  - @voyant-travel/types@0.109.9

## 0.133.0

### Minor Changes

- 9db4363: Add framework-owned Redis namespacing for managed regional cache and rate-limit
  state, plus a Node-only persistent TCP Redis adapter in the Framework boundary.
  Redis KV and rate-limit adapters still preserve the Upstash-compatible HTTP(S)
  REST path for edge and self-hosted consumers. Resident Node now accepts
  `redis://` and `rediss://` TCP Redis URLs in addition to HTTP(S) REST, reuses
  one lazy Redis client across cache, shared-state, and rate-limit roles, and
  wires `REDIS_NAMESPACE` to `voyant:v1:<namespace>:cache:`,
  `voyant:v1:<namespace>:state:`, and `voyant:v1:<namespace>:rate:` prefixes.
  Managed Cloud requires `REDIS_NAMESPACE` for every Redis role, requires
  `rediss://` for TCP while retaining HTTPS REST compatibility, rejects plaintext
  `redis://`, and keeps managed shared state on Postgres by default.

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/workflows@0.122.18

## 0.132.0

### Minor Changes

- b320e4f: Release the request-time dynamic CORS support in the shared `cors()` middleware
  (`resolveDynamicOrigin` + `isDynamicPath`, consumed via
  `VoyantAuthIntegration.resolveCorsOrigin`). This code merged with the storefront
  direct-client work but was omitted from that release's changeset, so the hono
  consumer never published — leaving the per-storefront dynamic CORS chain inert
  even though `@voyant-travel/auth` and `@voyant-travel/runtime` shipped their
  halves. Publishing hono completes the browser/mobile direct-client storefront
  API path.

### Patch Changes

- @voyant-travel/workflows@0.122.15

## 0.131.2

### Patch Changes

- Updated dependencies [43e7754]
  - @voyant-travel/db@0.117.0
  - @voyant-travel/types@0.109.8
  - @voyant-travel/workflows@0.122.11

## 0.131.1

### Patch Changes

- Updated dependencies [abc32b6]
  - @voyant-travel/db@0.116.0
  - @voyant-travel/types@0.109.7
  - @voyant-travel/workflows@0.122.10

## 0.131.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/db@0.115.0
  - @voyant-travel/types@0.109.6
  - @voyant-travel/workflows@0.122.9

## 0.130.1

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/db@0.114.15
  - @voyant-travel/workflows@0.122.8

## 0.130.0

### Minor Changes

- f6f22e7: Require independent admin and customer auth secrets, bind provider and bearer identities to their explicit route realm, keep guest checkout capabilities independently configured, and preserve secure cloud-auth state cookies behind TLS termination.

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/db@0.114.14
  - @voyant-travel/workflows@0.122.7

## 0.129.2

### Patch Changes

- 9c06938: Bind managed remote-app OAuth and extension sessions to stable workload environments and per-app contract generations, and allow manifests to disclose publisher-custodied encrypted secrets.
- Updated dependencies [9c06938]
  - @voyant-travel/core@0.127.1

## 0.129.1

### Patch Changes

- 1881293: Require realm-specific Better Auth secrets, remove the legacy shared-secret path, and reject existing customer sessions when customer authentication is disabled.

## 0.129.0

### Minor Changes

- 96c91b9: Compose provider-neutral remote-app OAuth and session exchange from host-owned
  runtime inputs, add exact client-authenticated route posture, and augment app
  access-token resolution without replacing staff authentication.

### Patch Changes

- @voyant-travel/workflows@0.122.6

## 0.128.6

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/db@0.114.13
  - @voyant-travel/workflows@0.122.5

## 0.128.5

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/core@0.126.1
  - @voyant-travel/db@0.114.12

## 0.128.4

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/db@0.114.11
  - @voyant-travel/workflows@0.122.4

## 0.128.3

### Patch Changes

- 3a90c27: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.
- Updated dependencies [3a90c27]
- Updated dependencies [3a90c27]
  - @voyant-travel/core@0.125.2
  - @voyant-travel/types@0.109.4

## 0.128.2

### Patch Changes

- 9fc7801: Add remote app OAuth authorization, token, rotation, revocation, and app-token auth context support.
- Updated dependencies [9fc7801]
  - @voyant-travel/core@0.125.1

## 0.128.1

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/db@0.114.9
  - @voyant-travel/workflows@0.122.2

## 0.128.0

### Minor Changes

- 8f0fa26: Make Hono the explicit sole server API runtime while moving package and
  deployment interfaces to role-based API vocabulary. Replace Hono-prefixed module,
  extension, bundle, lazy-route, and factory names with `Api*` names; move
  router-named domain runtime entry points to `./api-runtime`; and remove the old
  names without compatibility aliases.

### Patch Changes

- @voyant-travel/workflows@0.122.0
- @voyant-travel/db@0.114.8

## 0.127.2

### Patch Changes

- a1842a7: Default an omitted authenticated grant audience to its actor so internal API keys and custom auth resolvers reach audience-gated selected routes with a complete authorization context.

## 0.127.1

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/db@0.114.7
  - @voyant-travel/workflows@0.121.0

## 0.127.0

### Minor Changes

- 7e9f77a: Add organization defaults and member overrides for stable admin navigation IDs. Apply visibility
  after selected navigation composition without exposing ineligible routes, inherit hidden parent
  state through navigation subtrees, and retain structural parents only when a child is explicitly
  re-enabled. Ship the persistence, admin API, provisioning seam, and settings UI in standard Operator
  deployments, with duplicate settings contributions normalized at the host and core boundaries.

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/db@0.114.6
  - @voyant-travel/workflows@0.120.4

## 0.126.3

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/db@0.114.4
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/workflows@0.120.2

## 0.126.2

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
  - @voyant-travel/db@0.114.2

## 0.126.1

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/db@0.114.1
  - @voyant-travel/workflows@0.119.0

## 0.126.0

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
- Updated dependencies [bef5b7c]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/db@0.114.0
  - @voyant-travel/core@0.120.0
  - @voyant-travel/workflows@0.118.0

## 0.125.1

### Patch Changes

- 490d132: Move the Catalog, Commerce, and Inventory OpenAPI surfaces to exact selected-graph API ownership, including overlapping package extensions.
- 490d132: Delete the framework-owned compatibility composition catalog. Standard modules and extensions now compose exclusively from admitted package manifests and the generated graph runtime, including local `src/extensions/*/index.ts` conventions. Keep `createVoyantApp` as generic explicit Hono composition machinery, remove the Operator bindings registry, and generate framework OpenAPI from graph-owned factories. This cutover preserves the SmartBill `^0.140.0` package runtime and typed host-port integration from the governance rollup.
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
- Updated dependencies [047c3f9]
  - @voyant-travel/db@0.113.0
  - @voyant-travel/core@0.119.0
  - @voyant-travel/public-document-delivery@0.3.0
  - @voyant-travel/types@0.108.1
  - @voyant-travel/workflows@0.117.0

## 0.125.0

### Minor Changes

- d771be3: Compile selected graph access catalogs, make Bookings the first package-owned access authority, and
  wire exact-pair catalog validation through runtime authorization and permission editors.

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/db@0.112.2
  - @voyant-travel/public-document-delivery@0.2.5
  - @voyant-travel/utils@0.106.1
  - @voyant-travel/workflows@0.116.0

## 0.124.1

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0
  - @voyant-travel/db@0.112.1
  - @voyant-travel/public-document-delivery@0.2.4
  - @voyant-travel/workflows@0.115.2

## 0.124.0

### Minor Changes

- ca90eb5: Activate link definitions as request-scoped link services backed by each request's database.

### Patch Changes

- Updated dependencies [ca90eb5]
  - @voyant-travel/db@0.112.0
  - @voyant-travel/public-document-delivery@0.2.3
  - @voyant-travel/types@0.107.3
  - @voyant-travel/workflows@0.115.1

## 0.123.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0
  - @voyant-travel/workflows@0.115.0
  - @voyant-travel/db@0.111.2
  - @voyant-travel/public-document-delivery@0.2.2

## 0.123.1

### Patch Changes

- Updated dependencies [d41872a]
  - @voyant-travel/workflows@0.114.0

## 0.123.0

### Minor Changes

- 953e418: Add the application-local API route authoring contract, method-aware graph metadata, and build-time convention compiler.

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
- Updated dependencies [ec75753]
  - @voyant-travel/core@0.115.0
  - @voyant-travel/workflows@0.113.0
  - @voyant-travel/db@0.111.1
  - @voyant-travel/public-document-delivery@0.2.1

## 0.122.4

### Patch Changes

- a370024: Publish package-owned deployment manifests for storage media routes and public document delivery.

  Move public document delivery into its own package while retaining the Hono compatibility export,
  and expose storage upload, serve, and video-ticket routes independently from inventory brochures.

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
  - @voyant-travel/public-document-delivery@0.2.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/workflows@0.112.0

## 0.122.3

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0
  - @voyant-travel/db@0.110.2

## 0.122.2

### Patch Changes

- 682d7d0: Publish `voyant.package.v1` compatibility metadata from graph substrate packages
  and allow package metadata records to distinguish framework and library packages
  from selectable modules and plugins.
- Updated dependencies [5e1d221]
  - @voyant-travel/db@0.110.1
  - @voyant-travel/workflows@0.111.19

## 0.122.1

### Patch Changes

- 772439e: Wire the managed profile runtime to the Voyant Cloud admin auth flow. Managed
  Cloud apps now install the Cloud Better Auth plugin, resolve Better Auth cookie
  sessions with Cloud revalidation, revalidate Cloud-backed API-key users, and
  redirect unauthenticated admin UI requests into the Cloud sign-in flow while
  leaving API callers on JSON 401 responses.

  Add an optional `onUnauthorized` hook to the Hono auth integration contract so
  deployments can customize the final unauthenticated response after all shared
  credential strategies fail.

## 0.122.0

### Minor Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/db@0.110.0
  - @voyant-travel/core@0.112.3
  - @voyant-travel/types@0.107.1
  - @voyant-travel/workflows@0.111.18

## 0.121.3

### Patch Changes

- bbefc34: Add lazy provider and lazy Hono bundle helpers so deployments can keep heavy
  provider/plugin service graphs out of the eager app closure while preserving
  request-time route, bootstrap, subscriber, and anonymous webhook behavior.
  Lazy bundles can also declare eager transactional module/path metadata so the
  first request selects the transaction-capable DB before the bundle is imported.

  Narrow the framework relationships provider surface to the async methods the
  framework consumes, so lazy provider call sites do not proxy query-builder or
  plain-property service members.

## 0.121.2

### Patch Changes

- 621f989: Allow modules to register workflow and event-filter manifest metadata without importing run-bearing workflow definitions into request-serving apps.
- Updated dependencies [621f989]
  - @voyant-travel/core@0.112.2
  - @voyant-travel/workflows@0.111.17

## 0.121.1

### Patch Changes

- 32d0e1c: Split the framework standard runtime composition into lightweight per-module
  lazy route loaders, and allow overlapping lazy route mounts to fall through on
  wrapper route misses so lazy modules/extensions preserve eager route composition
  semantics without swallowing handler-authored 404 responses.

## 0.121.0

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

- 6474f42: Exempt the `/v1/admin/mcp` surface from the coarse `require-actor` method+path
  permission guard (alongside `_meta`). The in-deployment MCP server authorizes at a
  finer grain — each tool is gated by its own `requiredScopes` — so any authenticated
  API key or staff session reaches the endpoint and simply sees a scope-filtered tool
  list. This lets external MCP clients authenticate with a Bearer scoped key
  (voyant#2801) without needing a wildcard grant.
- 5786f63: Mount eager module and extension routes before lazy wildcard route stubs so concrete booking extensions, including MICE booking details, are reachable under shared admin surfaces.
- Updated dependencies [c9a356f]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/core@0.112.0
  - @voyant-travel/utils@0.105.6
  - @voyant-travel/db@0.109.5
  - @voyant-travel/workflows@0.111.15

## 0.120.1

### Patch Changes

- ffe7787: Fix a latent duplicate-operationId hole in `stampModuleMetadata`.

  Declared operationIds were only added to the uniqueness set as the path loop
  reached them, so a route hand-authoring an operationId that matched a string an
  _earlier_ path had already derived would leave two operations sharing that id
  (breaking client generators). All route-declared ids are now pre-seeded before
  any id is derived, so derived ids always yield to declared ones. No generated
  spec changes today (no route declares an operationId yet) — this hardens the
  non-destructive override path.

- 13148ad: Add `servers`, `operationId`, and `summary` to generated OpenAPI specs (#2729).

  Completes the metadata Redocly/Swagger tooling expects:

  - **`servers`** — a relative `[{ url: "/" }]` entry so "try it out" targets the
    origin the deployment serves the contract from (overridable per deployment).
  - **`operationId`** — a stable camelCase id derived from method + path
    (`GET /v1/admin/bookings/{id}` → `getAdminBookingsById`), unique per document,
    so generated clients get readable, deterministic method names.
  - **`summary`** — the method + path signature on every operation, so viewers
    and linters have a title for each.

  All three are stamped by `stampModuleMetadata` and are non-destructive — a value
  a route already declares (e.g. a hand-authored `summary`) is never overwritten.

## 0.120.0

### Minor Changes

- 1cb9cba: Stamp `x-voyant-module` and `x-voyant-surface` on every OpenAPI operation.

  Follow-up to the per-module spec split (voyant#2733) and a step toward
  voyant#2729. Each operation in the generated specs (aggregate + per-module) now
  carries `x-voyant-module` and `x-voyant-surface` extensions, so the specs are
  self-describing — a module-grouped docs UI or a client generator can read the
  owning module and surface off each operation instead of re-deriving them from
  path prefixes. The module is the authoritative owner from the mount manifest, so
  `publicPath` routes are labelled with their real owning module (e.g.
  `/v1/public/payment-policy/resolve` → `x-voyant-module: bookings`) rather than
  their mount prefix.

  `@voyant-travel/hono/openapi` exposes the underlying pieces:
  `buildModulePathOwnership` (path → module map), `partitionByModule`
  (synchronous split from a precomputed map), and `stampModuleMetadata`.
  `splitDocumentByModule` is retained as a convenience wrapper.

### Patch Changes

- 131ff9b: Tag every OpenAPI operation with its module for Swagger/Scalar grouping.

  `stampModuleMetadata` now also sets `tags: [module]` on each operation (unless
  the route already declares tags). Swagger UI, Scalar, and Redoc key their
  sidebar grouping off `tags` and ignore `x-*` extensions, so without this a
  whole-surface document (`framework-admin.json`) collapses under a single
  "default" group — the browsability pain in voyant#2733. With it, any deployment
  can point a viewer straight at a generated spec and get a module-grouped
  explorer with no extra work.

  - @voyant-travel/workflows@0.111.14

## 0.119.0

### Minor Changes

- 86fbb05: Generate OpenAPI specs per module instead of committing one giant aggregate.

  `@voyant-travel/hono/openapi` gains `generateModuleOpenApiDocuments` (one
  self-contained document per module, built directly from the routes that module
  registered) and `splitDocumentByModule` (partitions a composed document so every
  admin/storefront path lands in exactly one module document — the module manifest
  is the authoritative owner, with the path's own segment as the fallback for
  routes no module claims, e.g. `additionalRoutes` mounts). The composed app now
  records an `app.moduleMounts` manifest (mirroring `app.lazyMounts`) so the
  generator knows each module's real mount prefix, including `publicPath` overrides
  whose prefix isn't the module name (e.g. `/v1/public/booking-engine`).

  `@voyant-travel/openapi` now ships compact, browsable per-module specs under
  `spec/{admin,storefront}/<module>.json`, exposed via new `./admin/*` and
  `./storefront/*` subpath exports (e.g.
  `import bookings from "@voyant-travel/openapi/admin/bookings"`). The
  multi-megabyte aggregate specs (`framework-openapi.json` / `-admin` /
  `-storefront`) are no longer committed to git — GitHub can't render a 7 MB file
  and any route change rewrote the whole thing — but they're still published in
  the npm tarball (generated at `prepack`) and produced locally by `build`, so the
  `.` / `./admin` / `./storefront` exports keep resolving.

### Patch Changes

- @voyant-travel/workflows@0.111.13

## 0.118.4

### Patch Changes

- 88edbe6: Keep durable event outbox rows tied to subscriber delivery when request schedulers fail after capture.
- Updated dependencies [88edbe6]
  - @voyant-travel/core@0.111.1

## 0.118.3

### Patch Changes

- fd17317: Honor the `search` action for API-key/staff scopes on `POST /v1/<surface>/*/search` routes. Search endpoints are exposed as POST (complex bodies) but are read-family operations, so a token scoped `catalog:search`/`catalog:read` was previously rejected with 403 on `POST /v1/admin/catalog/search`. Non-search POST routes (product writes, bookings, pricing, …) stay gated on their normal write actions.

## 0.118.2

### Patch Changes

- 24413e3: Use a live operation-scoped database client for request outbox settlement so deferred subscriber completion or failure bookkeeping does not reuse a disposed request pool.

## 0.118.1

### Patch Changes

- 154a6c2: Add an authenticated R2 document download resolver helper for private Worker-route downloads.

## 0.118.0

### Minor Changes

- 9a1197b: Move the operator media upload and serve routes off the bare `/v1/*` surface and onto `/v1/admin/*`.

  Uploads now post to `/v1/admin/uploads` and video tickets to `/v1/admin/uploads/video`; stored media is served from `/v1/admin/media/*`. The Hono app no longer mounts the bare `/v1/*` catch-all actor guard, and worker-runtime hosts can use `rewriteAppPath` to preserve compatibility for persisted legacy media URLs.

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/storage@0.106.0
  - @voyant-travel/workflows@0.111.10

## 0.117.2

### Patch Changes

- d61803e: Require `Content-Type: application/json` for `.openapi()` JSON bodies (voyant#2114).

  Hono's `json` validator supplies `{}` to the schema (instead of parsing) when a
  request sends a body but omits — or mis-declares — the `application/json`
  content-type. For schemas with required fields `{}` fails validation and yields
  a clean 400, but for `.partial()` PATCH update schemas `{}` _validates_: the
  handler then runs with an empty patch and silently no-ops (200), dropping the
  caller's changes. This affected every migrated PATCH route with a partial body
  schema.

  `openApiValidationHook` now enforces the content-type the route's contract
  declares for the `json` validation target, so a missing or non-json header is a
  clean `invalid_request` 400 rather than a silent no-op. The regex accepts
  `application/json`, `application/json; charset=utf-8`, and `application/vnd.x+json`;
  only the `json` target is gated, so `query`/`param`/`header`/`form` (including
  multipart uploads) are untouched. The fix is one place in the shared hook and
  completes §16's content-type policy for all already-merged routes; no route or
  spec changes required.

- adf0f72: Make the app-wide `requestBodyLimit` cap content-type-aware (voyant#2114).

  A prior fix raised the global ceiling to `MAX_GLOBAL_REQUEST_BODY_BYTES` (26 MiB)
  so chunked media uploads (25 MiB file + multipart envelope) aren't rejected. That
  also loosened migrated `.openapi()` JSON routes from the old `parseJsonBody` 10 MiB
  cap up to 26 MiB.

  `requestBodyLimit` now accepts an optional `jsonMaxBytes` and applies it (via a
  case-sensitive `application/json` content-type match mirroring Hono's `jsonRegex`)
  to JSON bodies, while non-JSON bodies (uploads) keep the outer `maxBytes` ceiling.
  `createApp` wires `jsonMaxBytes` to `DEFAULT_REQUEST_BODY_LIMIT_BYTES` (10 MiB) and
  `maxBytes` to `MAX_GLOBAL_REQUEST_BODY_BYTES` (26 MiB), restoring the 10 MiB JSON
  cap for every migrated route while keeping uploads at 26 MiB. The 413 response
  shape and GET/HEAD/OPTIONS skip are unchanged; both exports are unchanged.

- 99233e6: Enforce the request body-size cap on the actual stream, not just `Content-Length` (voyant#2114).

  The framework-level `requestBodyLimit` middleware previously only checked the
  `Content-Length` header. The old `parseJsonBody` path additionally read the body
  through a bounded reader, so it rejected oversized bodies even when no
  `Content-Length` was present (chunked / HTTP/2). Routes migrated to `.openapi()`
  read via Hono's `json` validator (`c.req.json()`), which bypasses `parseJsonBody`,
  so a chunked / no-`Content-Length` oversized body was parsed unbounded — affecting
  every migrated JSON-body route (public + admin).

  `requestBodyLimit` now wraps Hono's built-in `bodyLimit`, which checks
  `Content-Length` AND wraps the body stream to abort once the read exceeds the cap.
  The existing 413 response shape is preserved via `bodyLimit`'s `onError`
  (`{ error, code: "request_body_too_large", maxBytes }`), GET/HEAD/OPTIONS are still
  skipped, and `DEFAULT_REQUEST_BODY_LIMIT_BYTES` / `RequestBodyLimitOptions` are
  unchanged. One-place fix that restores the bound for all migrated routes.

## 0.117.1

### Patch Changes

- cda876b: Map Hono's `HTTPException` onto the framework error contract (voyant#2114).

  `.openapi()` routes with a JSON body install Hono's request validator, which
  throws `HTTPException(400, "Malformed JSON in request body")` for malformed
  client JSON _before_ `openApiValidationHook` runs. The shared
  `normalizeValidationError` previously only recognized `ApiHttpError` and
  `ZodError`, so `handleApiError` fell through to a bare 500 for bad client input
  on every migrated `.openapi()` JSON-body route.

  `normalizeValidationError` now recognizes `HTTPException` and maps it onto the
  framework contract — a 400 becomes a structured `{ code: "invalid_request" }`
  4xx, restoring the clean 400 that `parseJsonBody` produced pre-migration. The
  fix is one place in the error boundary and benefits all already-migrated routes;
  no route or spec changes required.

## 0.117.0

### Minor Changes

- 7c5ee80: Modules can own their OpenAPI contract (voyant#2114).

  The composed app root is now an `OpenAPIHono`, so routes authored with
  `@hono/zod-openapi`'s `createRoute(...).openapi(...)` contribute to a generated
  OpenAPI document at their real composed path. A new
  `@voyant-travel/hono/openapi` entrypoint exposes `generateOpenApiDocument` +
  `selectSurface` for build-time generation (kept off the package barrel so the
  doc generator stays out of the Worker runtime bundle). Existing plain routes are
  unaffected.

  The `commerce` markets list route is the first to declare its contract this way,
  using `listResponseSchema(...)` from `@voyant-travel/types` for its response
  envelope.

### Patch Changes

- @voyant-travel/workflows@0.111.9

## 0.116.2

### Patch Changes

- 12a1eb2: Expose client-safe subpaths for validation schemas, linkable metadata, template authoring metadata, finance payment-policy primitives, and Hono reporter utilities. Move browser-facing React/operator imports off mixed runtime barrels so client bundles do not pull Hono request context or other server-only runtime code.

## 0.116.1

### Patch Changes

- 293e5e4: Make Hono public path matching base-path aware for path-prefixed deployments.
  - @voyant-travel/db@0.109.2

## 0.116.0

### Minor Changes

- 684b321: Bundle-level anonymous-access declarations (ADR-0008). `HonoBundle` gains an `anonymous?: string[]` field for **absolute** API paths a plugin exposes that are reachable without a session — for routes that mount outside the `/v1/public/{name}` convention, like a payment-processor webhook. `expandHonoBundles` collects these into `ExpandedHonoBundles.anonymousPaths`, and `createApp` folds them into the assembled anonymous allow-list alongside module/extension `anonymous` declarations and explicit `publicPaths`.

  `netopiaHonoBundle` now declares its callback (`/v1/finance/providers/netopia/callback`) anonymous, so deployments no longer carry it in `publicPaths` — the "reachable-without-auth" decision lives with the plugin that owns the route.

  Additive and non-breaking: a bundle that declares no `anonymous` contributes nothing to the allow-list.

- 2542715: Transactional-path declarations (ADR-0008 Phase 2). `HonoModule`/`HonoExtension` gain `transactionalPaths?: string[]` — absolute API path prefixes that must be served by the transaction-capable db client, for routes mounted outside the name-based surface where only a _subset_ transacts (e.g. a lazy family at `/v1/admin/catalog/quote`). `mountApp` folds these into the transactional-prefix map alongside the existing name-based `requiresTransactionalDb`, so a deployment no longer hand-maintains `dbTransactionalPaths`.

  The standard families now declare their own transactional surface: `@voyant-travel/trips` is name-based `requiresTransactionalDb` (every trips route reserves), and the catalog booking engine (`operator/catalog-booking`) declares its `quote`/`book`/`holds`/`orders` prefixes via `transactionalPaths` (search/draft/snapshot reads stay on the cheap default client). The operator starter's `dbTransactionalPaths` list is removed entirely.

  Additive and non-breaking: `dbTransactionalPaths` is still honored as an escape hatch; a module that declares neither flag is unaffected.

### Patch Changes

- @voyant-travel/workflows@0.111.6

## 0.115.0

### Minor Changes

- 04b257c: Anonymous-access declarations (ADR-0008 Phase 1). A module/extension can now declare which of its PUBLIC routes are reachable without a session via an `anonymous?: boolean | string[]` field on `HonoModule`/`HonoExtension` — `true` opens the whole public mount, a string array opens specific sub-paths relative to it. `createApp` assembles the global anonymous allow-list from these declarations (unioned with any explicit `publicPaths`, now an escape hatch) and feeds it to both the auth middleware and the public-write rate-limit matcher, so the "reachable-without-auth" decision lives next to the route instead of in a hand-maintained list. New pure helper `assembleAnonymousPaths(modules, extensions, explicit)` is exported for tooling/audit.

  The standard framework families that own anonymous routes now declare it (catalog, bookings, finance payment/collections/accountant sub-paths, legal, public-document-delivery, storefront verification + intake, customer-portal contact-exists, proposals); the framework's `anonymous-surface` test asserts the full assembled standard surface as an auditable snapshot.

  Additive and non-breaking: a deployment that declares no `anonymous` and passes `publicPaths` explicitly gets identical behavior.

- 78c15fa: Module subsetting, Phase 1 (ADR-0007). The standard set is default-on; `createVoyantApp` now accepts `exclude` — a list of standard module/extension specifiers to REMOVE from the framework set, for a deployment that doesn't run them (e.g. `@voyant-travel/flights`).

  Excludes are validated against the new `FRAMEWORK_CAPABILITY_GRAPH` (declaring `provides`/`requires`/`isRequired`): excluding a module another mounted module depends on, an `isRequired` foundational module, or a specifier not in the standard set throws a named boot error listing what's wrong — never a runtime 500. Adds the pure validators `findCapabilityGaps` (`@voyant-travel/hono/composition`) and `subsetStandardManifest` (`@voyant-travel/framework`).

  Additive and non-breaking: omitting `exclude` mounts the full standard set exactly as before.

  Capability _replacement_ (swap Voyant CRM for HubSpot via override-by-capability + injected ports) is the documented v2 design and intentionally not wired yet — the `PeopleDirectory` port doesn't exist, so a replace knob would silently mis-resolve. Removal works today; replacement, schema-side subsetting, and the port extraction are tracked follow-ups.

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/utils@0.105.4
  - @voyant-travel/workflows@0.111.5

## 0.114.0

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
  - @voyant-travel/types@0.105.0
  - @voyant-travel/db@0.109.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/workflows@0.111.4

## 0.113.0

### Minor Changes

- 021ec00: Add vendor-neutral observability primitives (RFC voyant#1553).

  - **Request-id async context** — the `requestId` middleware now stores the correlation id on the `requestId` context variable and runs the request inside an `AsyncLocalStorage`, so any downstream code (services, subscribers, reporters) can read it via the new `getRequestId()` export — no header threading or `Context` access required. Error responses now also carry the `X-Request-Id` header. New exports: `getRequestId`, `runWithRequestId` (from the package root and `@voyant-travel/hono/observability`).
  - **Pluggable error `Reporter`** — `VoyantAppConfig` gains `reporter` and `appName`. Unhandled 5xx exceptions at the `fetch` catch point emit a normalized `{ requestId, app, error, context }` event to the configured `Reporter`, where `requestId` is the same id surfaced to the user. The default is a no-op (zero vendor coupling); a built-in `consoleReporter` is provided, and Sentry/OpenTelemetry backends can be wired as opt-in adapters implementing the exported `Reporter` interface. Capture is best-effort — it never throws and async reporters are flushed via `waitUntil`. New exports: `Reporter`, `ErrorEvent`, `noopReporter`, `consoleReporter`, `safeCaptureException`.
  - **Standard catch points beyond HTTP** — the reporter is now also wired into the non-request runtime catch points the RFC named, so background/async faults aren't an observability blind spot: app **bootstrap** (module/plugin/extension `bootstrap` failures), the **workflow forwarder** (EventBus→driver ingest), and **EventBus subscriber dispatch** errors. `@voyant-travel/core`'s `createEventBus` gains an optional `onSubscriberError(event, error)` hook (the bus stays vendor-neutral; the framework routes it to the reporter). Intentional fail-open paths (cache, metrics, rate-limit, workflow compensation) stay silent by design.

  The framework owns the id, the catch points, and the event shape; the backend stays a deployment choice. Deployments that don't set `reporter` keep the no-op default — the only behavioral change is the new runtime prerequisite below.

  **Runtime requirement (Cloudflare Workers):** the request-id async context uses `AsyncLocalStorage` (`node:async_hooks`), which requires the `nodejs_compat` (or `nodejs_als`) compatibility flag — now on the always-used request path, not just when a `reporter` is configured. This is already standard for Voyant Worker deployments (the operator starter and templates set `nodejs_compat`); Node deployments need nothing. Add `"compatibility_flags": ["nodejs_compat"]` to `wrangler.jsonc` if your Worker doesn't already have it.

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/core@0.111.0
  - @voyant-travel/db@0.108.5
  - @voyant-travel/workflows@0.111.3

## 0.112.2

### Patch Changes

- @voyant-travel/db@0.108.3
- @voyant-travel/workflows@0.111.0

## 0.112.1

### Patch Changes

- @voyant-travel/workflows@0.110.0

## 0.112.0

### Minor Changes

- a3bd51c: `createApp` is now the **config-driven front door**: it takes `{ manifest, registry, capabilities, ... }`, runs `composeFromManifest` internally, and mounts — so a deployment makes one call instead of `composeFromManifest(...)` + the old `createApp({ modules, extensions })`.

  **Breaking:** the previous low-level `createApp({ modules, extensions, ... })` is renamed to **`mountApp`** (same signature). Callers that pass already-resolved `modules`/`extensions` (tests, advanced hosts) should import `mountApp`; callers that compose from a manifest should use the new `createApp`.

### Patch Changes

- d222e9f: **Convergence (Workstream B step 3):** `@voyant-travel/framework` now exports `createVoyantApp({ providers, modules?, extensions?, …config })` — the config-driven front door. It assembles the framework-owned standard set (`FRAMEWORK_RUNTIME_MANIFEST` + `frameworkComposition`) with the deployment's injected providers and any deployment-local module/extension additions, then delegates to `@voyant-travel/hono`'s lower-level `createApp`.

  A standard deployment's `app.ts` collapses to a single `createVoyantApp({ providers: buildOperatorProviders(), modules: deploymentLocalModules, …db/workflows/outbox/publicPaths })` call — no hand-maintained manifest or registry. The operator starter is converged: `buildOperatorCapabilities → buildOperatorProviders`, the two deployment-local module factories are extracted to `deploymentLocalModules`, and `OPERATOR_RUNTIME_MANIFEST` / `operatorComposition` remain only as derived exports for `voyant db doctor` parity + the composition tests.

  (hono: docstring on `createApp` updated to point standard deployments at `createVoyantApp`.)

- Updated dependencies [98f4a40]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
  - @voyant-travel/core@0.110.0
  - @voyant-travel/db@0.108.2
  - @voyant-travel/workflows@0.109.4

## 0.111.0

### Minor Changes

- 9ea7220: Add first-class, context-preserving lazy route contributions. `HonoModule` and
  `HonoExtension` now accept `lazyAdminRoutes` / `lazyPublicRoutes` loaders
  (`() => Promise<Hono>`); `createApp` mounts them at the surface prefix,
  dynamically imports the bundle on first matching request, and caches it per
  isolate. Unlike a raw `subApp.fetch(...)` forward, the dispatcher bridges the
  request context (`c.var` — db, container, actor, …) into the loaded sub-app, so
  lazy routes behave identically to eager ones.

  Also adds `lazyRoutes?: { paths, load }` for deployment-local families that span
  multiple absolute path prefixes (the context-preserving replacement for ad-hoc
  `mountLazyRouteApp` forwards). New exports: `mountLazyRoutesAt`,
  `mountLazyRoutePaths`, `createLazyRouteHandler`, `LazyRoutesLoader`,
  `LazyHonoRoutes`.

### Patch Changes

- Updated dependencies [13fe70b]
  - @voyant-travel/storage@0.105.0
  - @voyant-travel/workflows@0.109.2

## 0.110.3

### Patch Changes

- 756213e: Add public cache policy headers for cacheable public read routes and expose public response cache configuration typing.

## 0.110.2

### Patch Changes

- @voyant-travel/workflows@0.109.0

## 0.110.1

### Patch Changes

- 0c003f3: Make workflows node-only and remove the stale Cloudflare edge/Node step split.

  Workflow runtime annotations now accept only `runtime: "node"`, legacy
  `runtime: "edge"` is rejected, and the old split-runner wiring has been removed.
  The legacy Cloudflare workflow adapter packages, Worker reference apps, and
  standalone external step-server artifact have been removed. Managed Cloud apps
  should forward workflow calls to the hosted Node runtime, and self-hosted
  deployments should use the Node/Postgres runtime package.

- Updated dependencies [0c003f3]
  - @voyant-travel/workflows@0.108.0
  - @voyant-travel/db@0.108.1

## 0.110.0

### Minor Changes

- 6bff46f: Add Commerce runtime wiring for the pricing, markets, sellability, and
  promotions cluster. Templates can now declare one Commerce runtime entry while
  preserving the existing package route prefixes during the v1 migration.

  Allow manifest module factories in `@voyant-travel/hono/composition` to expand to
  multiple Hono modules. Remove the Promotions package's direct Storefront
  dependency by keeping the storefront offer resolver structurally typed.

### Patch Changes

- @voyant-travel/workflows@0.107.11

## 0.109.1

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/db@0.108.0
  - @voyant-travel/types@0.104.5
  - @voyant-travel/workflows@0.107.5

## 0.109.0

### Minor Changes

- b0f1e21: Per-request metrics middleware (RFC #1687 Phase 3.4, the in-worker half). `createApp` mounts it by default; it is inert without an `env.METRICS` Analytics Engine binding (`metrics: false` disables). One data point per request: blobs `[method, routePattern, surface, cacheStatus]`, doubles `[durationMs, status, dbQueryCount]`, index `routePattern` — complementing the platform dispatcher's per-dispatch dataset with what only the worker can see (matched route, db query count via a counting view the db middleware exposes, in-worker cache hits). The operator template declares the binding (`voyant_operator_metrics`; namespaced per tenant by the Voyant Cloud publisher).

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/workflows@0.107.4

## 0.108.0

### Minor Changes

- b7056f1: `createApp({ outbox: true })` makes request emits durable: envelopes persist to the `event_outbox` table (via the per-request db client) before any subscriber runs; failed deliveries are retried by `drainOutbox` (run it from a cron — see the operator template's `*/2min` drain). If the durable capture itself fails (DB unreachable), the emit falls back to direct delivery with an error log rather than failing the request. The augmented app now exposes `app.eventBus` so scheduled handlers can drain through the same subscriber set.

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/db@0.107.0
  - @voyant-travel/types@0.104.4
  - @voyant-travel/workflows@0.107.3

## 0.107.0

### Minor Changes

- 7255353: Split data plane + auth caching (Phase 1 of the enterprise-scale plan, RFC #1687):

  - **Per-surface db routing.** `createApp` accepts `dbTransactional` (and `dbTransactionalPaths`): when provided, requests are routed by path — surfaces of modules/extensions declaring `requiresTransactionalDb` get the transactional (WebSocket) factory, everything else gets the cheap default (typically neon-http: one fetch per query, zero connection handshake). The auth/permission/db middlewares accept the new `DbSource` (factory or selector) and keep sharing one client per request. The transaction-capability assertion becomes per-surface: the default client is allowed to be transaction-incapable. `createPathDbSelector` is exported for custom wiring. Without `dbTransactional`, behavior is unchanged.
  - **API-key KV cache.** `voy_` API-key validation caches the key row in the `env.CACHE` KV binding (60s TTL) for quota-less keys, eliminating the per-request Postgres SELECT for steady-state server-to-server traffic. Quota-limited keys always read fresh. Trade-off: revoking/disabling a cached key takes up to 60s. Usage counters now update via SQL increments (no stale arithmetic under concurrency).

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0
  - @voyant-travel/db@0.106.0
  - @voyant-travel/types@0.104.3
  - @voyant-travel/workflows@0.107.2

## 0.106.0

### Minor Changes

- 418fa82: Request-path performance pass (Phase 0 of the enterprise-scale plan, RFC #1687):

  - **Single shared per-request db client.** `requireAuth`, `requirePermission`, and the `db` middleware now resolve one client per request via an internal lease (`acquireRequestDb`) instead of each constructing its own — an authenticated request previously opened 2–3 Neon WebSocket Pools (each a full TLS+auth handshake); it now opens exactly one. The creating middleware owns the single dispose, scheduled via `waitUntil` after the response.
  - **`publicResponseCache` middleware** (mounted by `createApp` by default; disable/tune via the new `publicCache` config). Caches `GET /v1/public/*` responses that a route explicitly marks `Cache-Control: public, s-maxage=…` (and that carry no `Set-Cookie`). Cache hits are served before auth, the db client, and the runtime bootstrap — a hit costs no Postgres connection and no module-graph instantiation. Uses the Cache API where available and falls back to the `env.CACHE` KV binding (Workers-for-Platforms namespaced scripts have no `caches.default`); transparent no-op when neither exists.
  - **Event emits no longer block responses.** Inside a request, `createApp` exposes a request-scoped EventBus whose emits defer non-`inline` subscribers past the response via `executionCtx.waitUntil` — booking confirmations stop waiting on third-party subscriber HTTP calls (CMS sync, e-invoicing). Subscribers that need read-your-writes visibility within the request opt in with `inline: true` on the plugin subscriber.
  - **CORS allowlist memoized** per `CORS_ALLOWLIST` value (was re-split + wildcard-RegExp-recompiled on every request).
  - **Guarded `executionCtx` access** in auth/permission middlewares — Hono throws on `executionCtx` outside Workers; auth integrations now receive `ctx: undefined` on such runtimes instead of the request 500ing.

### Patch Changes

- Updated dependencies [418fa82]
- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0
  - @voyant-travel/db@0.105.0
  - @voyant-travel/types@0.104.2
  - @voyant-travel/workflows@0.107.1

## 0.105.3

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0
  - @voyant-travel/db@0.104.4
  - @voyant-travel/workflows@0.107.0

## 0.105.2

### Patch Changes

- Updated dependencies [344e7b6]
  - @voyant-travel/core@0.105.1
  - @voyant-travel/workflows@0.106.0

## 0.105.1

### Patch Changes

- 0de4cba: Preserve CORS headers on preflight responses returned by the shared Hono middleware.

## 0.105.0

### Minor Changes

- 656b25d: Add `@voyant-travel/hono/composition` — manifest-driven runtime composition. `composeFromManifest(manifest, registry, capabilities)` derives a template's `createApp({ modules, extensions })` arrays from a registry keyed by manifest specifier, with factories receiving a typed capability container (the deployment's storage/FX/providers/document-download resolvers gathered in one place). `diffManifestRegistry` reports manifest↔registry drift for tooling. Lets a template stop hand-listing modules/extensions; the operator template now composes from its manifest. See voyant#1608 / #1620.

### Patch Changes

- @voyant-travel/workflows@0.105.1

## 0.104.2

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0
  - @voyant-travel/db@0.104.3
  - @voyant-travel/workflows@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/core@0.104.1
- @voyant-travel/db@0.104.1
- @voyant-travel/storage@0.104.1
- @voyant-travel/types@0.104.1
- @voyant-travel/utils@0.104.1
- @voyant-travel/workflows@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/core@0.104.0
- @voyant-travel/db@0.104.0
- @voyant-travel/storage@0.104.0
- @voyant-travel/types@0.104.0
- @voyant-travel/utils@0.104.0
- @voyant-travel/workflows@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/core@0.103.0
- @voyant-travel/db@0.103.0
- @voyant-travel/storage@0.103.0
- @voyant-travel/types@0.103.0
- @voyant-travel/utils@0.103.0
- @voyant-travel/workflows@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/core@0.102.0
- @voyant-travel/db@0.102.0
- @voyant-travel/storage@0.102.0
- @voyant-travel/types@0.102.0
- @voyant-travel/utils@0.102.0
- @voyant-travel/workflows@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/core@0.101.2
- @voyant-travel/db@0.101.2
- @voyant-travel/storage@0.101.2
- @voyant-travel/types@0.101.2
- @voyant-travel/utils@0.101.2
- @voyant-travel/workflows@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/core@0.101.1
- @voyant-travel/db@0.101.1
- @voyant-travel/storage@0.101.1
- @voyant-travel/types@0.101.1
- @voyant-travel/utils@0.101.1
- @voyant-travel/workflows@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/core@0.101.0
- @voyant-travel/db@0.101.0
- @voyant-travel/storage@0.101.0
- @voyant-travel/types@0.101.0
- @voyant-travel/utils@0.101.0
- @voyant-travel/workflows@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/core@0.100.0
- @voyant-travel/db@0.100.0
- @voyant-travel/storage@0.100.0
- @voyant-travel/types@0.100.0
- @voyant-travel/utils@0.100.0
- @voyant-travel/workflows@0.100.0

## 0.99.0

### Minor Changes

- b7dde79: Add the admin capability-discovery route — `GET /v1/admin/_meta/capabilities`.

  `createApp` now serves a built-in capabilities route (under the `/v1/admin/*`
  staff guard) when the deployment supplies the operation catalogue via the new
  `adminMeta` config: `{ contractVersion, deploymentVersion?, operations }`. It
  returns the enabled modules, the operation catalogue, the contract/deployment
  version, and the caller's resolved actor + scopes — so the admin SDK's
  `client.capabilities()` returns live data.

  `adminMeta` is typed structurally, so `@voyant-travel/hono` stays decoupled from
  `@voyant-travel/admin-contracts`; deployments inject the catalogue from
  `admin-contracts`' `ADMIN_CONTRACT_VERSION` + `operationCapabilities()`. When
  `adminMeta` is omitted, the route is not mounted. Wired in `templates/dmc` as the
  reference. (#1411 roadmap item 1.)

### Patch Changes

- @voyant-travel/core@0.99.0
- @voyant-travel/db@0.99.0
- @voyant-travel/storage@0.99.0
- @voyant-travel/types@0.99.0
- @voyant-travel/utils@0.99.0
- @voyant-travel/workflows@0.99.0

## 0.98.0

### Patch Changes

- Updated dependencies [485da95]
  - @voyant-travel/core@0.98.0
  - @voyant-travel/db@0.98.0
  - @voyant-travel/storage@0.98.0
  - @voyant-travel/types@0.98.0
  - @voyant-travel/utils@0.98.0
  - @voyant-travel/workflows@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/core@0.97.0
- @voyant-travel/db@0.97.0
- @voyant-travel/storage@0.97.0
- @voyant-travel/types@0.97.0
- @voyant-travel/utils@0.97.0
- @voyant-travel/workflows@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/core@0.96.0
- @voyant-travel/db@0.96.0
- @voyant-travel/storage@0.96.0
- @voyant-travel/types@0.96.0
- @voyant-travel/utils@0.96.0
- @voyant-travel/workflows@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/core@0.95.0
- @voyant-travel/db@0.95.0
- @voyant-travel/storage@0.95.0
- @voyant-travel/types@0.95.0
- @voyant-travel/utils@0.95.0
- @voyant-travel/workflows@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/core@0.94.0
- @voyant-travel/db@0.94.0
- @voyant-travel/storage@0.94.0
- @voyant-travel/types@0.94.0
- @voyant-travel/utils@0.94.0
- @voyant-travel/workflows@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/core@0.93.0
- @voyant-travel/db@0.93.0
- @voyant-travel/storage@0.93.0
- @voyant-travel/types@0.93.0
- @voyant-travel/utils@0.93.0
- @voyant-travel/workflows@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/core@0.92.0
- @voyant-travel/db@0.92.0
- @voyant-travel/storage@0.92.0
- @voyant-travel/types@0.92.0
- @voyant-travel/utils@0.92.0
- @voyant-travel/workflows@0.92.0

## 0.91.0

### Patch Changes

- Updated dependencies [dc8554b]
  - @voyant-travel/core@0.91.0
  - @voyant-travel/db@0.91.0
  - @voyant-travel/storage@0.91.0
  - @voyant-travel/types@0.91.0
  - @voyant-travel/utils@0.91.0
  - @voyant-travel/workflows@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/core@0.90.0
- @voyant-travel/db@0.90.0
- @voyant-travel/storage@0.90.0
- @voyant-travel/types@0.90.0
- @voyant-travel/utils@0.90.0
- @voyant-travel/workflows@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/core@0.89.0
- @voyant-travel/db@0.89.0
- @voyant-travel/storage@0.89.0
- @voyant-travel/types@0.89.0
- @voyant-travel/utils@0.89.0
- @voyant-travel/workflows@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/core@0.88.0
- @voyant-travel/db@0.88.0
- @voyant-travel/storage@0.88.0
- @voyant-travel/types@0.88.0
- @voyant-travel/utils@0.88.0
- @voyant-travel/workflows@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/core@0.87.1
- @voyant-travel/db@0.87.1
- @voyant-travel/storage@0.87.1
- @voyant-travel/types@0.87.1
- @voyant-travel/utils@0.87.1
- @voyant-travel/workflows@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/core@0.87.0
- @voyant-travel/db@0.87.0
- @voyant-travel/storage@0.87.0
- @voyant-travel/types@0.87.0
- @voyant-travel/utils@0.87.0
- @voyant-travel/workflows@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/core@0.86.0
- @voyant-travel/db@0.86.0
- @voyant-travel/storage@0.86.0
- @voyant-travel/types@0.86.0
- @voyant-travel/utils@0.86.0
- @voyant-travel/workflows@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/core@0.85.4
- @voyant-travel/db@0.85.4
- @voyant-travel/storage@0.85.4
- @voyant-travel/types@0.85.4
- @voyant-travel/utils@0.85.4
- @voyant-travel/workflows@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/core@0.85.3
- @voyant-travel/db@0.85.3
- @voyant-travel/storage@0.85.3
- @voyant-travel/types@0.85.3
- @voyant-travel/utils@0.85.3
- @voyant-travel/workflows@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/core@0.85.2
- @voyant-travel/db@0.85.2
- @voyant-travel/storage@0.85.2
- @voyant-travel/types@0.85.2
- @voyant-travel/utils@0.85.2
- @voyant-travel/workflows@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/core@0.85.1
- @voyant-travel/db@0.85.1
- @voyant-travel/storage@0.85.1
- @voyant-travel/types@0.85.1
- @voyant-travel/utils@0.85.1
- @voyant-travel/workflows@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/core@0.85.0
- @voyant-travel/db@0.85.0
- @voyant-travel/storage@0.85.0
- @voyant-travel/types@0.85.0
- @voyant-travel/utils@0.85.0
- @voyant-travel/workflows@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/core@0.84.4
- @voyant-travel/db@0.84.4
- @voyant-travel/storage@0.84.4
- @voyant-travel/types@0.84.4
- @voyant-travel/utils@0.84.4
- @voyant-travel/workflows@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/core@0.84.3
- @voyant-travel/db@0.84.3
- @voyant-travel/storage@0.84.3
- @voyant-travel/types@0.84.3
- @voyant-travel/utils@0.84.3
- @voyant-travel/workflows@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/core@0.84.2
- @voyant-travel/db@0.84.2
- @voyant-travel/storage@0.84.2
- @voyant-travel/types@0.84.2
- @voyant-travel/utils@0.84.2
- @voyant-travel/workflows@0.84.2

## 0.84.1

### Patch Changes

- Updated dependencies [b9ef614]
  - @voyant-travel/core@0.84.1
  - @voyant-travel/db@0.84.1
  - @voyant-travel/storage@0.84.1
  - @voyant-travel/types@0.84.1
  - @voyant-travel/utils@0.84.1
  - @voyant-travel/workflows@0.84.1

## 0.84.0

### Minor Changes

- 4ea42b3: Add tokenized public document delivery grants, a public document download route, and opt-in public download envelopes for generated finance and legal documents.

### Patch Changes

- Updated dependencies [4ea42b3]
  - @voyant-travel/core@0.84.0
  - @voyant-travel/db@0.84.0
  - @voyant-travel/storage@0.84.0
  - @voyant-travel/types@0.84.0
  - @voyant-travel/utils@0.84.0
  - @voyant-travel/workflows@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/core@0.83.1
- @voyant-travel/db@0.83.1
- @voyant-travel/types@0.83.1
- @voyant-travel/utils@0.83.1
- @voyant-travel/workflows@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/core@0.83.0
- @voyant-travel/db@0.83.0
- @voyant-travel/types@0.83.0
- @voyant-travel/utils@0.83.0
- @voyant-travel/workflows@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/core@0.82.1
- @voyant-travel/db@0.82.1
- @voyant-travel/types@0.82.1
- @voyant-travel/utils@0.82.1
- @voyant-travel/workflows@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/core@0.82.0
- @voyant-travel/db@0.82.0
- @voyant-travel/types@0.82.0
- @voyant-travel/utils@0.82.0
- @voyant-travel/workflows@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/core@0.81.21
- @voyant-travel/db@0.81.21
- @voyant-travel/types@0.81.21
- @voyant-travel/utils@0.81.21
- @voyant-travel/workflows@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/core@0.81.20
- @voyant-travel/db@0.81.20
- @voyant-travel/types@0.81.20
- @voyant-travel/utils@0.81.20
- @voyant-travel/workflows@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/core@0.81.19
- @voyant-travel/db@0.81.19
- @voyant-travel/types@0.81.19
- @voyant-travel/utils@0.81.19
- @voyant-travel/workflows@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/core@0.81.18
- @voyant-travel/db@0.81.18
- @voyant-travel/types@0.81.18
- @voyant-travel/utils@0.81.18
- @voyant-travel/workflows@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/core@0.81.17
- @voyant-travel/db@0.81.17
- @voyant-travel/types@0.81.17
- @voyant-travel/utils@0.81.17
- @voyant-travel/workflows@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/core@0.81.16
- @voyant-travel/db@0.81.16
- @voyant-travel/types@0.81.16
- @voyant-travel/utils@0.81.16
- @voyant-travel/workflows@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/core@0.81.15
- @voyant-travel/db@0.81.15
- @voyant-travel/types@0.81.15
- @voyant-travel/utils@0.81.15
- @voyant-travel/workflows@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/core@0.81.14
- @voyant-travel/db@0.81.14
- @voyant-travel/types@0.81.14
- @voyant-travel/utils@0.81.14
- @voyant-travel/workflows@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/core@0.81.13
- @voyant-travel/db@0.81.13
- @voyant-travel/types@0.81.13
- @voyant-travel/utils@0.81.13
- @voyant-travel/workflows@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/core@0.81.12
- @voyant-travel/db@0.81.12
- @voyant-travel/types@0.81.12
- @voyant-travel/utils@0.81.12
- @voyant-travel/workflows@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/core@0.81.11
- @voyant-travel/db@0.81.11
- @voyant-travel/types@0.81.11
- @voyant-travel/utils@0.81.11
- @voyant-travel/workflows@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/core@0.81.10
- @voyant-travel/db@0.81.10
- @voyant-travel/types@0.81.10
- @voyant-travel/utils@0.81.10
- @voyant-travel/workflows@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/core@0.81.9
- @voyant-travel/db@0.81.9
- @voyant-travel/types@0.81.9
- @voyant-travel/utils@0.81.9
- @voyant-travel/workflows@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/core@0.81.8
- @voyant-travel/db@0.81.8
- @voyant-travel/types@0.81.8
- @voyant-travel/utils@0.81.8
- @voyant-travel/workflows@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/core@0.81.7
- @voyant-travel/db@0.81.7
- @voyant-travel/types@0.81.7
- @voyant-travel/utils@0.81.7
- @voyant-travel/workflows@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/core@0.81.6
- @voyant-travel/db@0.81.6
- @voyant-travel/types@0.81.6
- @voyant-travel/utils@0.81.6
- @voyant-travel/workflows@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/core@0.81.5
- @voyant-travel/db@0.81.5
- @voyant-travel/types@0.81.5
- @voyant-travel/utils@0.81.5
- @voyant-travel/workflows@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/core@0.81.4
- @voyant-travel/db@0.81.4
- @voyant-travel/types@0.81.4
- @voyant-travel/utils@0.81.4
- @voyant-travel/workflows@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/core@0.81.3
- @voyant-travel/db@0.81.3
- @voyant-travel/types@0.81.3
- @voyant-travel/utils@0.81.3
- @voyant-travel/workflows@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/core@0.81.2
- @voyant-travel/db@0.81.2
- @voyant-travel/types@0.81.2
- @voyant-travel/utils@0.81.2
- @voyant-travel/workflows@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/core@0.81.1
- @voyant-travel/db@0.81.1
- @voyant-travel/types@0.81.1
- @voyant-travel/utils@0.81.1
- @voyant-travel/workflows@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/core@0.81.0
- @voyant-travel/db@0.81.0
- @voyant-travel/types@0.81.0
- @voyant-travel/utils@0.81.0
- @voyant-travel/workflows@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/core@0.80.18
- @voyant-travel/db@0.80.18
- @voyant-travel/types@0.80.18
- @voyant-travel/utils@0.80.18
- @voyant-travel/workflows@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/core@0.80.17
- @voyant-travel/db@0.80.17
- @voyant-travel/types@0.80.17
- @voyant-travel/utils@0.80.17
- @voyant-travel/workflows@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/core@0.80.16
- @voyant-travel/db@0.80.16
- @voyant-travel/types@0.80.16
- @voyant-travel/utils@0.80.16
- @voyant-travel/workflows@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/core@0.80.15
- @voyant-travel/db@0.80.15
- @voyant-travel/types@0.80.15
- @voyant-travel/utils@0.80.15
- @voyant-travel/workflows@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/core@0.80.14
- @voyant-travel/db@0.80.14
- @voyant-travel/types@0.80.14
- @voyant-travel/utils@0.80.14
- @voyant-travel/workflows@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/core@0.80.13
- @voyant-travel/db@0.80.13
- @voyant-travel/types@0.80.13
- @voyant-travel/utils@0.80.13
- @voyant-travel/workflows@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/core@0.80.12
- @voyant-travel/db@0.80.12
- @voyant-travel/types@0.80.12
- @voyant-travel/utils@0.80.12
- @voyant-travel/workflows@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/core@0.80.11
- @voyant-travel/db@0.80.11
- @voyant-travel/types@0.80.11
- @voyant-travel/utils@0.80.11
- @voyant-travel/workflows@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/core@0.80.10
- @voyant-travel/db@0.80.10
- @voyant-travel/types@0.80.10
- @voyant-travel/utils@0.80.10
- @voyant-travel/workflows@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/core@0.80.9
- @voyant-travel/db@0.80.9
- @voyant-travel/types@0.80.9
- @voyant-travel/utils@0.80.9
- @voyant-travel/workflows@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/core@0.80.8
- @voyant-travel/db@0.80.8
- @voyant-travel/types@0.80.8
- @voyant-travel/utils@0.80.8
- @voyant-travel/workflows@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/core@0.80.7
- @voyant-travel/db@0.80.7
- @voyant-travel/types@0.80.7
- @voyant-travel/utils@0.80.7
- @voyant-travel/workflows@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/core@0.80.6
- @voyant-travel/db@0.80.6
- @voyant-travel/types@0.80.6
- @voyant-travel/utils@0.80.6
- @voyant-travel/workflows@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/core@0.80.5
- @voyant-travel/db@0.80.5
- @voyant-travel/types@0.80.5
- @voyant-travel/utils@0.80.5
- @voyant-travel/workflows@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/core@0.80.4
- @voyant-travel/db@0.80.4
- @voyant-travel/types@0.80.4
- @voyant-travel/utils@0.80.4
- @voyant-travel/workflows@0.80.4

## 0.80.3

### Patch Changes

- 6d816bb: Add `Idempotency-Key` replay support to admin create routes for CRM people and organizations, finance invoices, and legal contracts.
  - @voyant-travel/core@0.80.3
  - @voyant-travel/db@0.80.3
  - @voyant-travel/types@0.80.3
  - @voyant-travel/utils@0.80.3
  - @voyant-travel/workflows@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/core@0.80.2
- @voyant-travel/db@0.80.2
- @voyant-travel/types@0.80.2
- @voyant-travel/utils@0.80.2
- @voyant-travel/workflows@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/core@0.80.1
- @voyant-travel/db@0.80.1
- @voyant-travel/types@0.80.1
- @voyant-travel/utils@0.80.1
- @voyant-travel/workflows@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/core@0.80.0
- @voyant-travel/db@0.80.0
- @voyant-travel/types@0.80.0
- @voyant-travel/utils@0.80.0
- @voyant-travel/workflows@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/core@0.79.0
- @voyant-travel/db@0.79.0
- @voyant-travel/types@0.79.0
- @voyant-travel/utils@0.79.0
- @voyant-travel/workflows@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/core@0.78.0
- @voyant-travel/db@0.78.0
- @voyant-travel/types@0.78.0
- @voyant-travel/utils@0.78.0
- @voyant-travel/workflows@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/core@0.77.13
- @voyant-travel/db@0.77.13
- @voyant-travel/types@0.77.13
- @voyant-travel/utils@0.77.13
- @voyant-travel/workflows@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/core@0.77.12
- @voyant-travel/db@0.77.12
- @voyant-travel/types@0.77.12
- @voyant-travel/utils@0.77.12
- @voyant-travel/workflows@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/core@0.77.11
- @voyant-travel/db@0.77.11
- @voyant-travel/types@0.77.11
- @voyant-travel/utils@0.77.11
- @voyant-travel/workflows@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/core@0.77.10
- @voyant-travel/db@0.77.10
- @voyant-travel/types@0.77.10
- @voyant-travel/utils@0.77.10
- @voyant-travel/workflows@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/core@0.77.9
- @voyant-travel/db@0.77.9
- @voyant-travel/types@0.77.9
- @voyant-travel/utils@0.77.9
- @voyant-travel/workflows@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/core@0.77.8
- @voyant-travel/db@0.77.8
- @voyant-travel/types@0.77.8
- @voyant-travel/utils@0.77.8
- @voyant-travel/workflows@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/core@0.77.7
- @voyant-travel/db@0.77.7
- @voyant-travel/types@0.77.7
- @voyant-travel/utils@0.77.7
- @voyant-travel/workflows@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/core@0.77.6
- @voyant-travel/db@0.77.6
- @voyant-travel/types@0.77.6
- @voyant-travel/utils@0.77.6
- @voyant-travel/workflows@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/core@0.77.5
- @voyant-travel/db@0.77.5
- @voyant-travel/types@0.77.5
- @voyant-travel/utils@0.77.5
- @voyant-travel/workflows@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/core@0.77.4
- @voyant-travel/db@0.77.4
- @voyant-travel/types@0.77.4
- @voyant-travel/utils@0.77.4
- @voyant-travel/workflows@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/core@0.77.3
- @voyant-travel/db@0.77.3
- @voyant-travel/types@0.77.3
- @voyant-travel/utils@0.77.3
- @voyant-travel/workflows@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/core@0.77.2
- @voyant-travel/db@0.77.2
- @voyant-travel/types@0.77.2
- @voyant-travel/utils@0.77.2
- @voyant-travel/workflows@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/core@0.77.1
- @voyant-travel/db@0.77.1
- @voyant-travel/types@0.77.1
- @voyant-travel/utils@0.77.1
- @voyant-travel/workflows@0.77.1

## 0.77.0

### Minor Changes

- 1da934d: Share stored-document download envelope resolution and include signed download envelopes with filenames in finance and legal document-generation responses.

### Patch Changes

- @voyant-travel/core@0.77.0
- @voyant-travel/db@0.77.0
- @voyant-travel/types@0.77.0
- @voyant-travel/utils@0.77.0
- @voyant-travel/workflows@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/core@0.76.0
- @voyant-travel/db@0.76.0
- @voyant-travel/types@0.76.0
- @voyant-travel/utils@0.76.0
- @voyant-travel/workflows@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/core@0.75.7
- @voyant-travel/db@0.75.7
- @voyant-travel/types@0.75.7
- @voyant-travel/utils@0.75.7
- @voyant-travel/workflows@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/core@0.75.6
- @voyant-travel/db@0.75.6
- @voyant-travel/types@0.75.6
- @voyant-travel/utils@0.75.6
- @voyant-travel/workflows@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/core@0.75.5
- @voyant-travel/db@0.75.5
- @voyant-travel/types@0.75.5
- @voyant-travel/utils@0.75.5
- @voyant-travel/workflows@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/core@0.75.4
- @voyant-travel/db@0.75.4
- @voyant-travel/types@0.75.4
- @voyant-travel/utils@0.75.4
- @voyant-travel/workflows@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/core@0.75.3
- @voyant-travel/db@0.75.3
- @voyant-travel/types@0.75.3
- @voyant-travel/utils@0.75.3
- @voyant-travel/workflows@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/core@0.75.2
- @voyant-travel/db@0.75.2
- @voyant-travel/types@0.75.2
- @voyant-travel/utils@0.75.2
- @voyant-travel/workflows@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/core@0.75.1
- @voyant-travel/db@0.75.1
- @voyant-travel/types@0.75.1
- @voyant-travel/utils@0.75.1
- @voyant-travel/workflows@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/core@0.75.0
- @voyant-travel/db@0.75.0
- @voyant-travel/types@0.75.0
- @voyant-travel/utils@0.75.0
- @voyant-travel/workflows@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/core@0.74.2
- @voyant-travel/db@0.74.2
- @voyant-travel/types@0.74.2
- @voyant-travel/utils@0.74.2
- @voyant-travel/workflows@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/core@0.74.1
- @voyant-travel/db@0.74.1
- @voyant-travel/types@0.74.1
- @voyant-travel/utils@0.74.1
- @voyant-travel/workflows@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/core@0.74.0
- @voyant-travel/db@0.74.0
- @voyant-travel/types@0.74.0
- @voyant-travel/utils@0.74.0
- @voyant-travel/workflows@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/core@0.73.1
- @voyant-travel/db@0.73.1
- @voyant-travel/types@0.73.1
- @voyant-travel/utils@0.73.1
- @voyant-travel/workflows@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/core@0.73.0
- @voyant-travel/db@0.73.0
- @voyant-travel/types@0.73.0
- @voyant-travel/utils@0.73.0
- @voyant-travel/workflows@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/core@0.72.0
- @voyant-travel/db@0.72.0
- @voyant-travel/types@0.72.0
- @voyant-travel/utils@0.72.0
- @voyant-travel/workflows@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/core@0.71.0
- @voyant-travel/db@0.71.0
- @voyant-travel/types@0.71.0
- @voyant-travel/utils@0.71.0
- @voyant-travel/workflows@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/core@0.70.0
- @voyant-travel/db@0.70.0
- @voyant-travel/types@0.70.0
- @voyant-travel/utils@0.70.0
- @voyant-travel/workflows@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/core@0.69.1
- @voyant-travel/db@0.69.1
- @voyant-travel/types@0.69.1
- @voyant-travel/utils@0.69.1
- @voyant-travel/workflows@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/core@0.69.0
- @voyant-travel/db@0.69.0
- @voyant-travel/types@0.69.0
- @voyant-travel/utils@0.69.0
- @voyant-travel/workflows@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/core@0.68.0
- @voyant-travel/db@0.68.0
- @voyant-travel/types@0.68.0
- @voyant-travel/utils@0.68.0
- @voyant-travel/workflows@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/core@0.67.0
- @voyant-travel/db@0.67.0
- @voyant-travel/types@0.67.0
- @voyant-travel/utils@0.67.0
- @voyant-travel/workflows@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/core@0.66.6
- @voyant-travel/db@0.66.6
- @voyant-travel/types@0.66.6
- @voyant-travel/utils@0.66.6
- @voyant-travel/workflows@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/core@0.66.5
- @voyant-travel/db@0.66.5
- @voyant-travel/types@0.66.5
- @voyant-travel/utils@0.66.5
- @voyant-travel/workflows@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/core@0.66.4
- @voyant-travel/db@0.66.4
- @voyant-travel/types@0.66.4
- @voyant-travel/utils@0.66.4
- @voyant-travel/workflows@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/core@0.66.3
- @voyant-travel/db@0.66.3
- @voyant-travel/types@0.66.3
- @voyant-travel/utils@0.66.3
- @voyant-travel/workflows@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/core@0.66.2
- @voyant-travel/db@0.66.2
- @voyant-travel/types@0.66.2
- @voyant-travel/utils@0.66.2
- @voyant-travel/workflows@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/core@0.66.1
- @voyant-travel/db@0.66.1
- @voyant-travel/types@0.66.1
- @voyant-travel/utils@0.66.1
- @voyant-travel/workflows@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/core@0.66.0
- @voyant-travel/db@0.66.0
- @voyant-travel/types@0.66.0
- @voyant-travel/utils@0.66.0
- @voyant-travel/workflows@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/core@0.65.0
- @voyant-travel/db@0.65.0
- @voyant-travel/types@0.65.0
- @voyant-travel/utils@0.65.0
- @voyant-travel/workflows@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/core@0.64.1
- @voyant-travel/db@0.64.1
- @voyant-travel/types@0.64.1
- @voyant-travel/utils@0.64.1
- @voyant-travel/workflows@0.64.1

## 0.64.0

### Minor Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/core@0.64.0
  - @voyant-travel/db@0.64.0
  - @voyant-travel/types@0.64.0
  - @voyant-travel/utils@0.64.0
  - @voyant-travel/workflows@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/core@0.63.1
- @voyant-travel/db@0.63.1
- @voyant-travel/types@0.63.1
- @voyant-travel/utils@0.63.1
- @voyant-travel/workflows@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/core@0.63.0
- @voyant-travel/db@0.63.0
- @voyant-travel/types@0.63.0
- @voyant-travel/utils@0.63.0
- @voyant-travel/workflows@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3
- @voyant-travel/db@0.62.3
- @voyant-travel/types@0.62.3
- @voyant-travel/utils@0.62.3
- @voyant-travel/workflows@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2
- @voyant-travel/db@0.62.2
- @voyant-travel/types@0.62.2
- @voyant-travel/utils@0.62.2
- @voyant-travel/workflows@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1
- @voyant-travel/db@0.62.1
- @voyant-travel/types@0.62.1
- @voyant-travel/utils@0.62.1
- @voyant-travel/workflows@0.62.1

## 0.62.0

### Patch Changes

- 77aad68: Add a transaction-capable Neon serverless database adapter and make action-ledger skip Neon HTTP transactions safely.
- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0
  - @voyant-travel/db@0.62.0
  - @voyant-travel/types@0.62.0
  - @voyant-travel/utils@0.62.0
  - @voyant-travel/workflows@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0
- @voyant-travel/db@0.61.0
- @voyant-travel/types@0.61.0
- @voyant-travel/utils@0.61.0
- @voyant-travel/workflows@0.61.0

## 0.60.0

### Patch Changes

- Updated dependencies [4ff7f15]
  - @voyant-travel/core@0.60.0
  - @voyant-travel/db@0.60.0
  - @voyant-travel/types@0.60.0
  - @voyant-travel/utils@0.60.0
  - @voyant-travel/workflows@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/core@0.59.0
- @voyant-travel/db@0.59.0
- @voyant-travel/types@0.59.0
- @voyant-travel/utils@0.59.0
- @voyant-travel/workflows@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/core@0.58.0
- @voyant-travel/db@0.58.0
- @voyant-travel/types@0.58.0
- @voyant-travel/utils@0.58.0
- @voyant-travel/workflows@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0
- @voyant-travel/db@0.57.0
- @voyant-travel/types@0.57.0
- @voyant-travel/utils@0.57.0
- @voyant-travel/workflows@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0
- @voyant-travel/db@0.56.0
- @voyant-travel/types@0.56.0
- @voyant-travel/utils@0.56.0
- @voyant-travel/workflows@0.56.0

## 0.55.1

### Patch Changes

- Updated dependencies [819c847]
  - @voyant-travel/core@0.55.1
  - @voyant-travel/db@0.55.1
  - @voyant-travel/types@0.55.1
  - @voyant-travel/utils@0.55.1
  - @voyant-travel/workflows@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0
- @voyant-travel/db@0.55.0
- @voyant-travel/types@0.55.0
- @voyant-travel/utils@0.55.0
- @voyant-travel/workflows@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0
- @voyant-travel/db@0.54.0
- @voyant-travel/types@0.54.0
- @voyant-travel/utils@0.54.0
- @voyant-travel/workflows@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2
- @voyant-travel/db@0.53.2
- @voyant-travel/types@0.53.2
- @voyant-travel/utils@0.53.2
- @voyant-travel/workflows@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1
- @voyant-travel/db@0.53.1
- @voyant-travel/types@0.53.1
- @voyant-travel/utils@0.53.1
- @voyant-travel/workflows@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/core@0.53.0
- @voyant-travel/db@0.53.0
- @voyant-travel/types@0.53.0
- @voyant-travel/utils@0.53.0
- @voyant-travel/workflows@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4
- @voyant-travel/db@0.52.4
- @voyant-travel/types@0.52.4
- @voyant-travel/utils@0.52.4
- @voyant-travel/workflows@0.52.4

## 0.52.3

### Patch Changes

- Updated dependencies [9679a57]
  - @voyant-travel/core@0.52.3
  - @voyant-travel/db@0.52.3
  - @voyant-travel/types@0.52.3
  - @voyant-travel/utils@0.52.3
  - @voyant-travel/workflows@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/core@0.52.2
- @voyant-travel/db@0.52.2
- @voyant-travel/types@0.52.2
- @voyant-travel/utils@0.52.2
- @voyant-travel/workflows@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1
- @voyant-travel/db@0.52.1
- @voyant-travel/types@0.52.1
- @voyant-travel/utils@0.52.1
- @voyant-travel/workflows@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0
- @voyant-travel/db@0.52.0
- @voyant-travel/types@0.52.0
- @voyant-travel/utils@0.52.0
- @voyant-travel/workflows@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1
- @voyant-travel/db@0.51.1
- @voyant-travel/types@0.51.1
- @voyant-travel/utils@0.51.1
- @voyant-travel/workflows@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0
- @voyant-travel/db@0.51.0
- @voyant-travel/types@0.51.0
- @voyant-travel/utils@0.51.0
- @voyant-travel/workflows@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8
- @voyant-travel/db@0.50.8
- @voyant-travel/types@0.50.8
- @voyant-travel/utils@0.50.8
- @voyant-travel/workflows@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7
- @voyant-travel/db@0.50.7
- @voyant-travel/types@0.50.7
- @voyant-travel/utils@0.50.7
- @voyant-travel/workflows@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6
- @voyant-travel/db@0.50.6
- @voyant-travel/types@0.50.6
- @voyant-travel/utils@0.50.6
- @voyant-travel/workflows@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5
- @voyant-travel/db@0.50.5
- @voyant-travel/types@0.50.5
- @voyant-travel/utils@0.50.5
- @voyant-travel/workflows@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4
- @voyant-travel/db@0.50.4
- @voyant-travel/types@0.50.4
- @voyant-travel/utils@0.50.4
- @voyant-travel/workflows@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3
- @voyant-travel/db@0.50.3
- @voyant-travel/types@0.50.3
- @voyant-travel/utils@0.50.3
- @voyant-travel/workflows@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2
- @voyant-travel/db@0.50.2
- @voyant-travel/types@0.50.2
- @voyant-travel/utils@0.50.2
- @voyant-travel/workflows@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1
- @voyant-travel/db@0.50.1
- @voyant-travel/types@0.50.1
- @voyant-travel/utils@0.50.1
- @voyant-travel/workflows@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0
- @voyant-travel/db@0.50.0
- @voyant-travel/types@0.50.0
- @voyant-travel/utils@0.50.0
- @voyant-travel/workflows@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0
- @voyant-travel/db@0.49.0
- @voyant-travel/types@0.49.0
- @voyant-travel/utils@0.49.0
- @voyant-travel/workflows@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0
- @voyant-travel/db@0.48.0
- @voyant-travel/types@0.48.0
- @voyant-travel/utils@0.48.0
- @voyant-travel/workflows@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0
- @voyant-travel/db@0.47.0
- @voyant-travel/types@0.47.0
- @voyant-travel/utils@0.47.0
- @voyant-travel/workflows@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0
- @voyant-travel/db@0.46.0
- @voyant-travel/types@0.46.0
- @voyant-travel/utils@0.46.0
- @voyant-travel/workflows@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0
- @voyant-travel/db@0.45.0
- @voyant-travel/types@0.45.0
- @voyant-travel/utils@0.45.0
- @voyant-travel/workflows@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0
- @voyant-travel/db@0.44.0
- @voyant-travel/types@0.44.0
- @voyant-travel/utils@0.44.0
- @voyant-travel/workflows@0.44.0

## 0.43.0

### Minor Changes

- d07215e: Add first-class API token rotation and audit-facing token context. The auth facade now supports `POST /auth/api-tokens/:keyId/rotate`, the React hooks and UI expose rotation, and Hono request context includes `apiTokenId` for downstream audit log writers.

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0
  - @voyant-travel/db@0.43.0
  - @voyant-travel/types@0.43.0
  - @voyant-travel/utils@0.43.0
  - @voyant-travel/workflows@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0
- @voyant-travel/db@0.42.0
- @voyant-travel/types@0.42.0
- @voyant-travel/utils@0.42.0
- @voyant-travel/workflows@0.42.0

## 0.41.3

### Patch Changes

- Updated dependencies [2c3bd2e]
  - @voyant-travel/core@0.41.3
  - @voyant-travel/db@0.41.3
  - @voyant-travel/types@0.41.3
  - @voyant-travel/utils@0.41.3
  - @voyant-travel/workflows@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2
- @voyant-travel/db@0.41.2
- @voyant-travel/types@0.41.2
- @voyant-travel/utils@0.41.2
- @voyant-travel/workflows@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1
- @voyant-travel/db@0.41.1
- @voyant-travel/types@0.41.1
- @voyant-travel/utils@0.41.1
- @voyant-travel/workflows@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0
- @voyant-travel/db@0.41.0
- @voyant-travel/types@0.41.0
- @voyant-travel/utils@0.41.0
- @voyant-travel/workflows@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1
- @voyant-travel/db@0.40.1
- @voyant-travel/types@0.40.1
- @voyant-travel/utils@0.40.1
- @voyant-travel/workflows@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0
- @voyant-travel/db@0.40.0
- @voyant-travel/types@0.40.0
- @voyant-travel/utils@0.40.0
- @voyant-travel/workflows@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0
- @voyant-travel/db@0.39.0
- @voyant-travel/types@0.39.0
- @voyant-travel/utils@0.39.0
- @voyant-travel/workflows@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2
- @voyant-travel/db@0.38.2
- @voyant-travel/types@0.38.2
- @voyant-travel/utils@0.38.2
- @voyant-travel/workflows@0.38.2

## 0.38.0

### Patch Changes

- Updated dependencies [885afc8]
  - @voyant-travel/core@0.38.0
  - @voyant-travel/db@0.38.0
  - @voyant-travel/types@0.38.0
  - @voyant-travel/utils@0.38.0
  - @voyant-travel/workflows@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1
- @voyant-travel/db@0.37.1
- @voyant-travel/types@0.37.1
- @voyant-travel/utils@0.37.1
- @voyant-travel/workflows@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0
- @voyant-travel/db@0.37.0
- @voyant-travel/types@0.37.0
- @voyant-travel/utils@0.37.0
- @voyant-travel/workflows@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0
- @voyant-travel/db@0.36.0
- @voyant-travel/types@0.36.0
- @voyant-travel/utils@0.36.0
- @voyant-travel/workflows@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0
- @voyant-travel/db@0.35.0
- @voyant-travel/types@0.35.0
- @voyant-travel/utils@0.35.0
- @voyant-travel/workflows@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [a37d4af]
  - @voyant-travel/core@0.34.0
  - @voyant-travel/db@0.34.0
  - @voyant-travel/types@0.34.0
  - @voyant-travel/utils@0.34.0
  - @voyant-travel/workflows@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1
- @voyant-travel/db@0.33.1
- @voyant-travel/types@0.33.1
- @voyant-travel/utils@0.33.1
- @voyant-travel/workflows@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0
- @voyant-travel/db@0.33.0
- @voyant-travel/types@0.33.0
- @voyant-travel/utils@0.33.0
- @voyant-travel/workflows@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3
- @voyant-travel/db@0.32.3
- @voyant-travel/types@0.32.3
- @voyant-travel/utils@0.32.3
- @voyant-travel/workflows@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2
- @voyant-travel/db@0.32.2
- @voyant-travel/types@0.32.2
- @voyant-travel/utils@0.32.2
- @voyant-travel/workflows@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1
- @voyant-travel/db@0.32.1
- @voyant-travel/types@0.32.1
- @voyant-travel/utils@0.32.1
- @voyant-travel/workflows@0.32.1

## 0.32.0

### Minor Changes

- 6ea6ded: Harden public checkout sessions with scoped signed capabilities. Public booking-session creation now returns a short-lived checkout capability and sets an HttpOnly SameSite cookie; PII-bearing session reads, session mutations, repricing/finalization, and public finance payment bootstrap/read routes require that booking-scoped capability. Public mutable checkout/payment routes also accept the shared `Idempotency-Key` retry middleware where it was missing.

### Patch Changes

- @voyant-travel/core@0.32.0
- @voyant-travel/db@0.32.0
- @voyant-travel/types@0.32.0
- @voyant-travel/utils@0.32.0
- @voyant-travel/workflows@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4
- @voyant-travel/db@0.31.4
- @voyant-travel/types@0.31.4
- @voyant-travel/utils@0.31.4
- @voyant-travel/workflows@0.31.4

## 0.31.3

### Patch Changes

- Updated dependencies [5f974dd]
  - @voyant-travel/core@0.31.3
  - @voyant-travel/db@0.31.3
  - @voyant-travel/types@0.31.3
  - @voyant-travel/utils@0.31.3
  - @voyant-travel/workflows@0.31.3

## 0.31.2

### Patch Changes

- 54ddc93: Add API token management powered by Better Auth API keys, including reusable React hooks, a shared auth UI package, canonical permission presets, and API-key route permission guards.
- Updated dependencies [54ddc93]
  - @voyant-travel/core@0.31.2
  - @voyant-travel/db@0.31.2
  - @voyant-travel/types@0.31.2
  - @voyant-travel/utils@0.31.2
  - @voyant-travel/workflows@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1
- @voyant-travel/db@0.31.1
- @voyant-travel/types@0.31.1
- @voyant-travel/utils@0.31.1
- @voyant-travel/workflows@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0
- @voyant-travel/db@0.31.0
- @voyant-travel/types@0.31.0
- @voyant-travel/utils@0.31.0
- @voyant-travel/workflows@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7
- @voyant-travel/db@0.30.7
- @voyant-travel/types@0.30.7
- @voyant-travel/utils@0.30.7
- @voyant-travel/workflows@0.30.7

## 0.30.6

### Patch Changes

- Updated dependencies [5a4c592]
  - @voyant-travel/core@0.30.6
  - @voyant-travel/db@0.30.6
  - @voyant-travel/types@0.30.6
  - @voyant-travel/utils@0.30.6
  - @voyant-travel/workflows@0.30.6

## 0.30.5

### Patch Changes

- 3f323e9: Serialize workflow concurrency declarations into runtime manifests and enforce workflow concurrency policies for the in-memory, Node, and Cloudflare orchestrator drivers.
- Updated dependencies [3f323e9]
  - @voyant-travel/core@0.30.5
  - @voyant-travel/db@0.30.5
  - @voyant-travel/types@0.30.5
  - @voyant-travel/utils@0.30.5
  - @voyant-travel/workflows@0.30.5

## 0.30.3

### Patch Changes

- 05a1b19: Serialize workflow schedule declarations into manifests, preserve schedule config when Hono registers runtime manifests, and expose shared schedule fire-time helpers from the orchestrator package.
- Updated dependencies [05a1b19]
  - @voyant-travel/core@0.30.3
  - @voyant-travel/db@0.30.3
  - @voyant-travel/types@0.30.3
  - @voyant-travel/utils@0.30.3
  - @voyant-travel/workflows@0.30.3

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0
- @voyant-travel/db@0.30.0
- @voyant-travel/types@0.30.0
- @voyant-travel/utils@0.30.0
- @voyant-travel/workflows@0.30.0

## 0.29.0

### Minor Changes

- db51715: Closes #500: switch both templates' Workers DB layer from Hyperdrive to the Neon serverless WebSocket driver. Drops the \`HYPERDRIVE\` binding from \`wrangler.jsonc\` + \`env.d.ts\` in both \`templates/dmc\` and \`templates/operator\`; templates now connect directly via \`@neondatabase/serverless\` Pool + \`drizzle-orm/neon-serverless\` using the same \`DATABASE_URL\` secret.

  Two helpers ship in each template's \`src/api/lib/db.ts\`:

  - \`getDbFromEnv(env, executionCtx?)\` — returns a per-request \`NeonDatabase\`. When \`executionCtx\` is passed, schedules \`pool.end()\` via \`waitUntil\` so the WebSocket closes promptly. When omitted, the Pool is left for the Workers runtime to reclaim on isolate teardown.
  - \`withDbFromEnv(env, fn)\` — higher-order helper for non-Hono code paths (event subscribers, scheduled handlers, retry workers). Owns the Pool lifecycle inline (open → \`fn\` → \`finally pool.end()\`).

  Touched packages get a minor bump because the shared types broaden:

  - \`@voyant-travel/db\` — \`AnyDrizzleDb\` union now includes \`NeonDatabase\` from \`drizzle-orm/neon-serverless\` alongside the existing \`PostgresJsDatabase\` and \`NeonHttpDatabase\` flavors.
  - \`@voyant-travel/hono\` — \`VoyantDb\` (the type Hono ctx variables expose under \`c.var.db\`) widens the same way.

  Why WebSocket and not HTTP: the bookings package and other internal services use \`db.transaction(...)\` for read-then-write logic that needs real Postgres transaction semantics. Neon's HTTP transport only batches statements (atomic but no isolation); WebSocket gives full transaction support on Workers.

  Subscribers in \`catalog-bridge\`, \`booking-schedule\`, \`smartbill\`, \`catalog-checkout\` were converted to \`withDbFromEnv\` so the Pool is owned by each subscriber call. \`getBetterAuth\` and other helpers that were hard to thread \`executionCtx\` through still call \`getDbFromEnv(env)\` without it — the Pool lingers until isolate teardown there. Tracked as a follow-up audit in #510.

  No schema migration. No behavior change for existing API contracts. Operators upgrading need to: drop the \`HYPERDRIVE\` binding from their \`wrangler.jsonc\` (if they had one), and ensure their \`DATABASE_URL\` points at a Neon Postgres reachable over WebSocket (the standard Neon connection string).

### Patch Changes

- Updated dependencies [583326e]
- Updated dependencies [583326e]
- Updated dependencies [4a6523e]
- Updated dependencies [db51715]
  - @voyant-travel/core@0.29.0
  - @voyant-travel/db@0.29.0
  - @voyant-travel/types@0.29.0
  - @voyant-travel/utils@0.29.0
  - @voyant-travel/workflows@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3
- @voyant-travel/db@0.28.3
- @voyant-travel/types@0.28.3
- @voyant-travel/utils@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2
- @voyant-travel/db@0.28.2
- @voyant-travel/types@0.28.2
- @voyant-travel/utils@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1
- @voyant-travel/db@0.28.1
- @voyant-travel/types@0.28.1
- @voyant-travel/utils@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0
- @voyant-travel/db@0.28.0
- @voyant-travel/types@0.28.0
- @voyant-travel/utils@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0
- @voyant-travel/db@0.27.0
- @voyant-travel/types@0.27.0
- @voyant-travel/utils@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9
- @voyant-travel/db@0.26.9
- @voyant-travel/types@0.26.9
- @voyant-travel/utils@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8
- @voyant-travel/db@0.26.8
- @voyant-travel/types@0.26.8
- @voyant-travel/utils@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7
- @voyant-travel/db@0.26.7
- @voyant-travel/types@0.26.7
- @voyant-travel/utils@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6
- @voyant-travel/db@0.26.6
- @voyant-travel/types@0.26.6
- @voyant-travel/utils@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/core@0.26.5
  - @voyant-travel/db@0.26.5
  - @voyant-travel/types@0.26.5
  - @voyant-travel/utils@0.26.5

## 0.26.4

### Patch Changes

- Updated dependencies [6493f62]
  - @voyant-travel/core@0.26.4
  - @voyant-travel/db@0.26.4
  - @voyant-travel/types@0.26.4
  - @voyant-travel/utils@0.26.4

## 0.26.3

### Patch Changes

- Updated dependencies [372cad5]
  - @voyant-travel/core@0.26.3
  - @voyant-travel/db@0.26.3
  - @voyant-travel/types@0.26.3
  - @voyant-travel/utils@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies [ffdb485]
  - @voyant-travel/core@0.26.2
  - @voyant-travel/db@0.26.2
  - @voyant-travel/types@0.26.2
  - @voyant-travel/utils@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [c0507a6]
  - @voyant-travel/core@0.26.1
  - @voyant-travel/db@0.26.1
  - @voyant-travel/types@0.26.1
  - @voyant-travel/utils@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0
- @voyant-travel/db@0.26.0
- @voyant-travel/types@0.26.0
- @voyant-travel/utils@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0
- @voyant-travel/db@0.25.0
- @voyant-travel/types@0.25.0
- @voyant-travel/utils@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3
- @voyant-travel/db@0.24.3
- @voyant-travel/types@0.24.3
- @voyant-travel/utils@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/core@0.24.2
- @voyant-travel/db@0.24.2
- @voyant-travel/types@0.24.2
- @voyant-travel/utils@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/core@0.24.1
- @voyant-travel/db@0.24.1
- @voyant-travel/types@0.24.1
- @voyant-travel/utils@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0
- @voyant-travel/db@0.24.0
- @voyant-travel/types@0.24.0
- @voyant-travel/utils@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0
- @voyant-travel/db@0.23.0
- @voyant-travel/types@0.23.0
- @voyant-travel/utils@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0
- @voyant-travel/db@0.22.0
- @voyant-travel/types@0.22.0
- @voyant-travel/utils@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1
- @voyant-travel/db@0.21.1
- @voyant-travel/types@0.21.1
- @voyant-travel/utils@0.21.1

## 0.21.0

### Patch Changes

- Updated dependencies [6427bad]
  - @voyant-travel/core@0.21.0
  - @voyant-travel/db@0.21.0
  - @voyant-travel/types@0.21.0
  - @voyant-travel/utils@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0
- @voyant-travel/db@0.20.0
- @voyant-travel/types@0.20.0
- @voyant-travel/utils@0.20.0

## 0.19.0

### Minor Changes

- 714c544: Make `actor` required on `VoyantRequestAuthContext` and surface a better 401 when it's missing (fixes #381).

  `requireActor` is fail-closed — when `c.var.actor` is unset, every protected request 401s. Previously the type kept `actor` optional, the API-key branch hard-coded `"staff"`, the public-paths branch hard-coded `"customer"`, but the custom `auth.resolve` branch had no enforcement, no default, and a 401 message that read like a session bug. Consumers upgrading with a working session resolver saw every `/v1/admin/*` route 401 after a valid sign-in.

  **Type-level enforcement (BREAKING for custom resolvers):**

  ```ts
  // Before
  export type VoyantRequestAuthContext = VoyantAuthContext & {
    userId: string;
  };

  // After
  export type VoyantRequestAuthContext = Omit<VoyantAuthContext, "actor"> & {
    userId: string;
    actor: Actor;
  };
  ```

  Any `auth.resolve` integration whose return type is `VoyantRequestAuthContext` now fails to compile until it includes `actor`. For single-tenant admin apps, return `actor: "staff"`. Customer/partner/supplier sessions should return the corresponding actor so `/v1/public/*` route guards keep working.

  `requirePermission` now also throws if `actor` is missing on the request context (it should be set by `requireActor` upstream); this surfaces auth-pipeline misordering rather than fabricating a default.

  **Better 401 message:**

  ```
  Unauthorized: actor not resolved. The auth pipeline did not assign an `actor`
  to this request. If you set `auth.resolve` on `createApp({...})`, the returned
  object must include `actor` (usually `"staff"` for admin sessions). Public
  routes should be listed in `publicPaths`.
  ```

  **Migration:** add `actor: "staff"` (or the appropriate actor) to whatever your `auth.resolve` returns. The DMC and operator templates and the dev app have all been updated.

### Patch Changes

- @voyant-travel/core@0.19.0
- @voyant-travel/db@0.19.0
- @voyant-travel/types@0.19.0
- @voyant-travel/utils@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/core@0.18.0
  - @voyant-travel/db@0.18.0
  - @voyant-travel/types@0.18.0
  - @voyant-travel/utils@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0
  - @voyant-travel/db@0.17.0
  - @voyant-travel/types@0.17.0
  - @voyant-travel/utils@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/core@0.16.0
- @voyant-travel/db@0.16.0
- @voyant-travel/types@0.16.0
- @voyant-travel/utils@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0
- @voyant-travel/db@0.15.0
- @voyant-travel/types@0.15.0
- @voyant-travel/utils@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0
- @voyant-travel/db@0.14.0
- @voyant-travel/types@0.14.0
- @voyant-travel/utils@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/core@0.13.0
- @voyant-travel/db@0.13.0
- @voyant-travel/types@0.13.0
- @voyant-travel/utils@0.13.0

## 0.12.0

### Patch Changes

- Updated dependencies [944d244]
- Updated dependencies [cc561ce]
  - @voyant-travel/core@0.12.0
  - @voyant-travel/db@0.12.0
  - @voyant-travel/types@0.12.0
  - @voyant-travel/utils@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/core@0.11.0
- @voyant-travel/db@0.11.0
- @voyant-travel/types@0.11.0
- @voyant-travel/utils@0.11.0

## 0.10.0

### Minor Changes

- 29a581a: Add `Idempotency-Key` header protocol for non-idempotent booking-creation endpoints.

  Same key + same body replays the original response; same key + different body returns `409 Conflict`. Records expire after 24h. Wired (with `required: false` default) into:

  - `POST /v1/admin/bookings/`
  - `POST /v1/admin/bookings/reserve`
  - `POST /v1/admin/bookings/from-product`
  - `POST /v1/admin/bookings/from-offer/:offerId/reserve`
  - `POST /v1/admin/bookings/from-order/:orderId/reserve`
  - `POST /v1/public/bookings/sessions`
  - `POST /v1/public/bookings/sessions/:sessionId/confirm`

  Ships:

  - `idempotency_keys` table in `@voyant-travel/db/schema/infra` keyed by `(scope, key)`, with body-hash, captured response, and TTL.
  - `idempotencyKey({ scope, required? })` middleware in `@voyant-travel/hono` that reads the header, replays/conflicts/expires, and captures `2xx` JSON responses. Echoes `Idempotency-Key` + `Idempotency-Replayed: true` on replay.
  - `purgeExpiredIdempotencyKeys()` helper for daily-cron cleanup.

  Backwards-compatible: clients without the header continue to work. Templates can flip a route to `required: true` per endpoint once their client has rolled out.

- b7f0501: **BREAKING:** `requireActor` middleware now returns `401 Unauthorized` when no actor is set on the request, instead of defaulting to `"staff"`.

  Earlier versions silently granted operator privileges to anonymous traffic if `requireAuth` was missing, misordered, or a route mounted before auth. The fail-open default has been replaced with fail-closed.

  **Migration:**

  - `requireAuth` now sets `actor: "staff"` explicitly on the core-owned API key path (`voy_` prefix), so server-to-server integrations behave the same.
  - Custom `auth.resolve` integrations that previously relied on the implicit `"staff"` fallback must now return an explicit `actor` from `resolve()`.
  - Anonymous requests on `/v1/admin/*` now return `401` instead of `200`. Anonymous requests on `/v1/public/*` continue to receive `actor: "customer"` via the `publicPaths` bypass when applicable, and `401` otherwise.
  - The differentiation between `401` (no actor) and `403` (actor not in the allowed list) is now reliable — earlier the no-actor path returned `403` for some surfaces and `200` for others.

### Patch Changes

- Updated dependencies [29a581a]
  - @voyant-travel/core@0.10.0
  - @voyant-travel/db@0.10.0
  - @voyant-travel/types@0.10.0
  - @voyant-travel/utils@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0
- @voyant-travel/db@0.9.0
- @voyant-travel/types@0.9.0
- @voyant-travel/utils@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [24dc253]
  - @voyant-travel/core@0.8.0
  - @voyant-travel/db@0.8.0
  - @voyant-travel/types@0.8.0
  - @voyant-travel/utils@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0
- @voyant-travel/db@0.7.0
- @voyant-travel/types@0.7.0
- @voyant-travel/utils@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9
- @voyant-travel/db@0.6.9
- @voyant-travel/types@0.6.9
- @voyant-travel/utils@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
  - @voyant-travel/core@0.6.8
  - @voyant-travel/db@0.6.8
  - @voyant-travel/types@0.6.8
  - @voyant-travel/utils@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7
- @voyant-travel/db@0.6.7
- @voyant-travel/types@0.6.7
- @voyant-travel/utils@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6
- @voyant-travel/db@0.6.6
- @voyant-travel/types@0.6.6
- @voyant-travel/utils@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5
- @voyant-travel/db@0.6.5
- @voyant-travel/types@0.6.5
- @voyant-travel/utils@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4
- @voyant-travel/db@0.6.4
- @voyant-travel/types@0.6.4
- @voyant-travel/utils@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3
  - @voyant-travel/db@0.6.3
  - @voyant-travel/types@0.6.3
  - @voyant-travel/utils@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2
- @voyant-travel/db@0.6.2
- @voyant-travel/types@0.6.2
- @voyant-travel/utils@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1
- @voyant-travel/db@0.6.1
- @voyant-travel/types@0.6.1
- @voyant-travel/utils@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0
- @voyant-travel/db@0.6.0
- @voyant-travel/types@0.6.0
- @voyant-travel/utils@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [ce72e29]
  - @voyant-travel/core@0.5.0
  - @voyant-travel/db@0.5.0
  - @voyant-travel/types@0.5.0
  - @voyant-travel/utils@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5
  - @voyant-travel/db@0.4.5
  - @voyant-travel/types@0.4.5
  - @voyant-travel/utils@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4
- @voyant-travel/db@0.4.4
- @voyant-travel/types@0.4.4
- @voyant-travel/utils@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3
- @voyant-travel/db@0.4.3
- @voyant-travel/types@0.4.3
- @voyant-travel/utils@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2
- @voyant-travel/db@0.4.2
- @voyant-travel/types@0.4.2
- @voyant-travel/utils@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1
- @voyant-travel/db@0.4.1
- @voyant-travel/types@0.4.1
- @voyant-travel/utils@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
- Updated dependencies [e84fe0f]
  - @voyant-travel/core@0.4.0
  - @voyant-travel/db@0.4.0
  - @voyant-travel/types@0.4.0
  - @voyant-travel/utils@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [8566f2d]
- Updated dependencies [8566f2d]
  - @voyant-travel/core@0.3.1
  - @voyant-travel/db@0.3.1
  - @voyant-travel/types@0.3.1
  - @voyant-travel/utils@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0
- @voyant-travel/db@0.3.0
- @voyant-travel/types@0.3.0
- @voyant-travel/utils@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0
- @voyant-travel/db@0.2.0
- @voyant-travel/types@0.2.0
- @voyant-travel/utils@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
- @voyant-travel/db@0.1.1
- @voyant-travel/types@0.1.1
- @voyant-travel/utils@0.1.1
