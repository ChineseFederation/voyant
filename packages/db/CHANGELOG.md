# @voyant-travel/db

## 0.122.4

### Patch Changes

- Updated dependencies [f6c85ee]
  - @voyant-travel/core@0.143.0

## 0.122.3

### Patch Changes

- 1a903c5: Stop settlement refusing a captured payment over a Hold token, and make the refusal it
  does give loud and legible.

  A card checkout was captured and never became a Booking: settlement refused
  `hold_failure` against a Hold that was `active`, unexpired, correctly sized and bound to
  the Session's current Quote, then spent all eight outbox attempts restating it. Two
  independent faults produced that.

  `commitPaidSession` read the Quote and the Hold as a pair off the payment's metadata, and
  took the Hold _only_ when a Quote was recorded with it. `prepare` writes that metadata
  from the Commit it was called on and reuses an existing payment row for the same
  idempotency key without rewriting it, so a checkout that reached `prepare` before taking
  its Hold records the Quote alone — permanently. Settlement then passed no `holdId` and was
  refused `hold_failure: missing` while the Hold sat there. The Hold is now resolved
  independently, from the Session's live Holds bound to the settled Quote.

  Separately, a Hold that is genuinely gone no longer refuses the Commit. Settlement runs
  server-side against a Session whose money has already moved, and no client can keep a
  15-minute reservation alive across a processor — the tab sleeps, 3-D Secure adds minutes,
  a re-quote supersedes the Hold six seconds after taking it. It now asks inventory for the
  capacity again, idempotently across the retry chain, and only a `no` from inventory
  refuses: `hold_failure` gains a `capacity_unavailable` reason so "the token lapsed" and
  "the seat is gone" stop arriving as the same verdict.

  A refusal that no retry can change is now declared permanent, so it dead-letters on the
  spot — the stranded-payment staff alert fires with that verdict instead of the eighth
  attempt's, three quarters of an hour later — and the Session's Holds are released at that
  point rather than left `active` with a null `released_at`. Retryable outcomes are
  unchanged, and still keep their Hold.

  `event_outbox` gains `attempt_errors`, one entry per failed delivery, so a chain that
  fails several times retains what each attempt decided rather than only the last. The
  dead-letter announcement carries it.

## 0.122.2

### Patch Changes

- Updated dependencies [020de35]
  - @voyant-travel/core@0.142.0

## 0.122.1

### Patch Changes

- 47cfea9: Say when a booking contract could not be generated instead of dropping it in
  silence. Retire the unsubscribed `booking.contract_document.requested` event,
  record a failed action-ledger entry on the booking whenever confirmation cannot
  produce the customer contract, and stop offering "Generate invoice and contract"
  on deployments with no customer contract template to render. The outbox drain
  now also names which event types it delivered to zero subscribers, alongside the
  count it already reports, so the drain job's own log identifies the silence
  rather than only sizing it.

## 0.122.0

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

- c805276: Stop the event bus failing subscribers it was never going to be able to deliver.

  Three faults, all of which showed up as `failed` outbox rows nobody read:

  - **A subscriber's budget is now its own.** The bus timeout is sized for a
    handler that writes a row, and reindexing a product is legitimately longer, so
    it blew the same 15s on every attempt: the bus recorded a failure, the outbox
    retried into the identical wall, and eight attempts later the event was dead
    even though the work was very likely completing. Catalog reindexing now
    declares the budget it needs.
  - **A timeout is reported separately from a throw.** They mean opposite things
    about a retry — a handler that threw is finished and did nothing, one that
    timed out is still running, so redelivering it duplicates the work rather than
    retrying it.
  - **A deterministic failure stops retrying.** `PermanentSubscriberError` marks a
    failure no retry can fix; the drain dead-letters it on the spot. A
    misconfigured indexer no longer spends eight attempts, each overwriting
    `last_error`, until the configuration fault is reported as a timeout.

  Delivery to zero subscribers is also counted and logged rather than recorded as
  a clean delivery, so an event type nobody consumes can no longer look identical
  to one every subscriber handled.

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

- Updated dependencies [c805276]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/core@0.141.0
  - @voyant-travel/schema-kit@0.118.9

## 0.121.1

### Patch Changes

- c1f23ab: Bound the aggregate Node database socket capacity across retained tenant pools.

## 0.121.0

### Minor Changes

- afb6866: Add a bounded tenant-scoped Node application-cell host and disposable per-tenant database pools.

### Patch Changes

- 5d1b298: Bound transactional outbox delivery, maintenance, and operational statistics while allowing wakeups to drain multiple batches within a work and time budget.
  - @voyant-travel/core@0.140.2

## 0.120.7

### Patch Changes

- 3cbf7fb: Bound resident Node database pools to four connections by default, allow an
  explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
  headers after an aggregate response succeeds so transient server errors are not
  cached by browsers.

## 0.120.6

### Patch Changes

- Updated dependencies [7b8ef95]
  - @voyant-travel/core@0.140.0

## 0.120.5

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

## 0.120.4

### Patch Changes

- 9d18306: Backfill unassigned member permission sets with the full access they already
  resolve to.

  `user_profiles.permissions` is nullable, and null means "no admin has assigned a
  scope set yet"; the staff-access resolver reads that as `["*"]`. The migration
  writes that same value down explicitly, so nothing changes behaviour today. It
  is groundwork: a fail-closed resolver cannot ship until the existing nulls are
  gone, and the backfill has to be deployed and verified first.

  It is not sufficient on its own — the signup path still inserts a profile
  without permissions, so a fresh deployment's first owner is created null again.

## 0.120.3

### Patch Changes

- Updated dependencies [3f5ea82]
- Updated dependencies [3f5ea82]
  - @voyant-travel/core@0.139.0

## 0.120.2

### Patch Changes

- Updated dependencies [3552f14]
  - @voyant-travel/core@0.138.0

## 0.120.1

### Patch Changes

- 7e35584: Give the quotes → proposals rename a migration path for existing deployments.

  The rename was applied by editing shipped baselines in place, so every
  deployment provisioned before it was blocked from upgrading:
  `MigrationImmutabilityError` on the edited files, and
  `proposals/0000_proposals_baseline` either failing the baseline parity gate or
  colliding with the live `quote_*` tables.

  The collector gains **supersession**: a migration may declare the exact retired
  `(source, tag)` ledger rows it replaces, and is recorded rather than executed
  when all of them are present. Each source that owns renamed objects now ships a
  guarded adoption migration that RENAMES its legacy objects in place — tables,
  columns, constraints, indexes, enum types and enum labels — preserving rows,
  foreign keys and column defaults. Values stored as text rather than enums are
  migrated too: `custom_field_definitions.entity_type`, `booking_origins`'
  `accepted_quote_version`, and the `quotes` resource key in
  `user_profiles.permissions` and `apikey.permissions`. Hash equivalence for the
  eight edited files is declared only because those adoption migrations exist.

  Every step is a no-op on a database provisioned after the rename and on a
  re-run. `verify:migration-replay-parity` gains a lane that replays the
  pre-rename package history and fails unless it converges on a fresh replay
  exactly.

## 0.120.0

### Minor Changes

- 2bc1570: Add an optional conditional-write `putIfAbsent` to the shared KV contract.

  Coalescing concurrent misses onto one origin computation needs a way to elect a
  single revalidator across processes: exactly one caller gets `true` and performs
  the origin work, every other caller gets `false` and serves what it already has.
  `KVStore` gains `putIfAbsent(key, value, options?)` for that, and it never
  blocks — a loser is told it lost rather than made to wait.

  The member is optional because it is only worth having when the backend decides
  it atomically. Each store that implements it does so in one round trip:

  - `createMemoryKvNamespace` reads and writes without awaiting in between, which
    a single-threaded isolate cannot interleave.
  - `createRedisKvStore` issues `SET key value NX [EX ttl]` and reports the write
    only on the `OK` reply, never on a nil one.
  - `createPostgresKvStore` issues one `INSERT … ON CONFLICT (key) DO UPDATE …
WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= now()
RETURNING`, so the conflicting caller re-reads the committed expiry under the
    row lock and `RETURNING` yields a row only to the caller that wrote.

  All three treat an entry that exists but has expired as absent, matching how
  `get` already treats it, so a lapsed slot can be won again rather than
  deadlocking behind a holder that is gone.

  `createTieredKvStore` exposes `putIfAbsent` only when its L2 does, and delegates
  the decision there. L1 is per-process and would hand every process its own
  winner, so it cannot arbitrate; it only mirrors the winner's value, still capped
  by `l2PromotionTtlSeconds`. A tier over an L2 that cannot elect omits the member
  entirely, degrading callers to no coalescing rather than to a false election.

  The node-redis TCP adapter in `@voyant-travel/framework` now forwards `nx` as
  the SET `NX` condition. It previously dropped unrecognised options, which would
  have turned a conditional write into an unconditional one that always reported
  success — every caller a winner, which is the failure this contract exists to
  prevent.

  See ADR 0021 §5.

### Patch Changes

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

## 0.119.4

### Patch Changes

- Updated dependencies [c986bd5]
- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/core@0.137.1
  - @voyant-travel/schema-kit@0.118.0

## 0.119.3

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/schema-kit@0.117.0

## 0.119.2

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/schema-kit@0.116.0

## 0.119.1

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0

## 0.119.0

### Minor Changes

- 7496159: Add an OAuth 2.1 authorization server so chat assistants can connect to the deployment's MCP endpoint by URL alone.

  Claude and ChatGPT add remote MCP servers by pasting a URL — there is nowhere to supply an API token — so they follow the MCP authorization spec instead: dynamic client registration (RFC 7591), authorization code + PKCE, and a browser consent step. This adds that server on the admin realm via `@better-auth/oauth-provider`, with `oauth_client` / `oauth_access_token` / `oauth_refresh_token` / `oauth_consent` / `jwks` tables.

  The grant is coarse (`mcp:read`, optionally `mcp:write`) because a consent screen cannot ask a travel agent about fifty resource scopes. Effective permissions are re-derived per request from the approving staff member's current role, intersected with the actions their owning packages mark remote-safe and non-sensitive — so a connector never exceeds the person who approved it, and narrowing someone's role immediately narrows every connector they approved.

  Access tokens are signed JWTs verified against the published JWKS. Because a JWT cannot be withdrawn once signed, the resource server also re-checks the connector's consent row on every request, so disconnecting a connector takes effect on its next call rather than whenever its token happens to expire.

  Discovery documents are served at the origin root, with authorization-server endpoints rewritten onto the public API base — the Hono app strips that prefix before the auth handler sees a request, so the URLs Better Auth advertises would otherwise point at the admin SPA instead of the authorization server.

### Patch Changes

- 8adeb23: Make agent-driven booking create, confirmation, cancellation, passenger capacity, persisted option/unit/extra pricing, invoice reconciliation, approval admission, paid-settlement previews, immediate reads, idempotent lifecycle replay, notification suppression, and required-schema deployment admission coherent.
- fa75fe3: Allow resident Node database clients enough time to reconnect after a suspended
  database wakes, deliver durable outbox events through the composed internal
  subscriber bus, and reconcile obsolete Lakebase vector storage when a
  deployment uses pgvector.

## 0.118.7

### Patch Changes

- 3389f33: Close idle postgres-js connections after 30 seconds by default so resident application processes do not prevent serverless Postgres computes from suspending. Applications that deliberately need permanent idle sockets can disable or override the timeout through `nodeIdleTimeoutSeconds`.

## 0.118.6

### Patch Changes

- a653664: Add a provider-neutral `scale-to-zero` recovery profile for package-owned jobs,
  including channel-push subscribers, and expose safe durable-send,
  payment-reconciliation, promotion-reindex, and channel-push jobs to payload-free
  wakeups.

## 0.118.5

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/schema-kit@0.115.0

## 0.118.4

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0

## 0.118.3

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0

## 0.118.2

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0

## 0.118.1

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0

## 0.118.0

### Minor Changes

- f945310: Migrate the event outbox, channel push, promotion reindex, and product PDF
  surfaces away from general workflows. Package-owned jobs are payload-free and
  recover from durable domain records; product PDF generation remains an
  authenticated, idempotent brochure command. The Node job host now exposes an
  origin-trusted immutable inventory and best-effort terminal health reporting.

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0

## 0.117.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/schema-kit@0.114.0
  - @voyant-travel/workflows@0.122.14

## 0.117.0

### Minor Changes

- 43e7754: Add the self-host storefront access model: a storefront runtime port + local adapter, schema (storefronts, storefront API keys, storefront customer-auth credentials) with migration, publishable/secret key helpers, an operator-declared allowed-origins normalizer, and a local customer-auth resolver.

### Patch Changes

- @voyant-travel/workflows@0.122.11

## 0.116.0

### Minor Changes

- abc32b6: Add customer business-account onboarding contracts, durable request workflows,
  deployment-composed runtime wiring, staff-guarded administration, Better Auth
  organization invitation acceptance, the framework-neutral storefront client,
  React provider operations, and the capability-gated operator page.

### Patch Changes

- @voyant-travel/workflows@0.122.10

## 0.115.0

### Minor Changes

- a160a81: Add isolated customer identities, personal and business buyer accounts, live
  buyer selection, immutable booking ownership, and framework-neutral storefront
  auth clients for B2C, B2B, and hybrid deployments.

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0
  - @voyant-travel/workflows@0.122.9

## 0.114.15

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0
  - @voyant-travel/workflows@0.122.8

## 0.114.14

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/workflows@0.122.7

## 0.114.13

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0
  - @voyant-travel/workflows@0.122.5

## 0.114.12

### Patch Changes

- 07334a7: Split operator and storefront authentication into isolated Better Auth realms,
  add provider-neutral identity adapters, and support managed WorkOS-backed admin
  sessions alongside merchant-configurable customer email and social login.
- Updated dependencies [07334a7]
  - @voyant-travel/core@0.126.1

## 0.114.11

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0
  - @voyant-travel/workflows@0.122.4

## 0.114.10

### Patch Changes

- 9bf0b26: Make `db/0001_db_baseline`'s `user_profiles.permissions` column replay-safe (`ADD COLUMN IF NOT EXISTS`) and register the rewritten content hash as equivalent: the frozen framework bundle also materialises the column, so adopted managed databases replay the migration against an existing column and fail with 42701.

## 0.114.9

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0
  - @voyant-travel/schema-kit@0.113.0
  - @voyant-travel/workflows@0.122.2

## 0.114.8

### Patch Changes

- @voyant-travel/workflows@0.122.0

## 0.114.7

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0
  - @voyant-travel/workflows@0.121.0

## 0.114.6

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0
  - @voyant-travel/workflows@0.120.4

## 0.114.5

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
  - @voyant-travel/workflows@0.120.3

## 0.114.4

### Patch Changes

- 8d62a7c: Embed TypeScript sources in published JavaScript source maps so consumer dev servers can resolve
  them without the omitted `src` tree. Stop emitting declaration maps that cannot embed their sources,
  and reject publish tarballs whose maps reference sources that are neither packed nor embedded.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/schema-kit@0.112.1
  - @voyant-travel/workflows@0.120.2

## 0.114.3

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/schema-kit@0.112.0
  - @voyant-travel/workflows@0.120.1

## 0.114.2

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

## 0.114.1

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0
  - @voyant-travel/workflows@0.119.0

## 0.114.0

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

- Updated dependencies [bef5b7c]
  - @voyant-travel/core@0.120.0
  - @voyant-travel/workflows@0.118.0

## 0.113.0

### Minor Changes

- 490d132: Move charter/cruise route activation and travel/infrastructure scheduled work
  to graph-selected package manifests. Distribution, Cruises, and DB now publish
  their scheduled workflow implementations, while Workflow Runs owns generic
  schedule dispatch and the Operator supplies only Node runtime dependencies.

### Patch Changes

- c65b05c: Move the process-owned Node database lifecycle API into the generic database runtime so deployment hosts do not need local facades.
- 490d132: Select package-owned Node workflow services through additive graph runtime contributors instead of composing Catalog, Cruises, and DB services in the Operator starter. Notifications keeps its existing package graph bootstrap.
- 490d132: Provide validated subscription mutations, durable projected webhook enqueue, restart-safe payload storage, and one claim-driven signed, retrying, audited delivery worker.
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
  - @voyant-travel/core@0.119.0
  - @voyant-travel/workflows@0.117.0

## 0.112.2

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0

## 0.112.1

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0

## 0.112.0

### Minor Changes

- ca90eb5: Activate link definitions as request-scoped link services backed by each request's database.

## 0.111.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0

## 0.111.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0

## 0.111.0

### Minor Changes

- e3dc5a9: Add explicit deployment provider selection and lazy, redacted graph provider resolution, with the Node Postgres database provider as the first end-to-end declaration and factory.
- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- a370024: Publish import-cheap package-owned Voyant deployment manifests for infrastructure and trips graph units.
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0

## 0.110.2

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0

## 0.110.1

### Patch Changes

- 5e1d221: Publish `voyant.package.v1` compatibility metadata from first-party
  schema-owning packages so deployment graph package admission can validate their
  framework, target, and deployment-mode compatibility before runtime imports.

## 0.110.0

### Minor Changes

- 425f92e: Add Node-native cache and shared-state providers behind the existing KVStore
  surface, including in-process LRU, tiered Redis/Postgres providers, Postgres
  fixed-window rate limiting, Redis rate limiting, and managed-runtime provider
  selection without KV-shaped binding requirements.

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/core@0.112.3

## 0.109.5

### Patch Changes

- Updated dependencies [c9a356f]
  - @voyant-travel/core@0.112.0

## 0.109.4

### Patch Changes

- Updated dependencies [722455d]
  - @voyant-travel/schema-kit@0.111.0

## 0.109.3

### Patch Changes

- Updated dependencies [06cfcf5]
  - @voyant-travel/schema-kit@0.110.0

## 0.109.2

### Patch Changes

- Updated dependencies [787c852]
  - @voyant-travel/schema-kit@0.109.0

## 0.109.1

### Patch Changes

- Updated dependencies [924d201]
- Updated dependencies [f311826]
  - @voyant-travel/schema-kit@0.108.0

## 0.109.0

### Minor Changes

- 4abf9a2: Deployment team management + granular member RBAC (voyant#2085).

  - `@voyant-travel/types`: `member-roles` (preset bundles reusing the API-key permission catalog) + `settings`/`team` resources.
  - `@voyant-travel/auth`: `cloud-broker` member-management client + assertion `scopes`.
  - `@voyant-travel/hono`: opt-in staff-session scope enforcement in `requireActor` (`VOYANT_RBAC_ENFORCE`) + `isStaffRbacEnforced`.
  - `@voyant-travel/admin`: auth-mode-aware `TeamSettingsPage` with a granular permission editor.
  - `@voyant-travel/bookings`/`legal`: PII reveal gated on `bookings-pii:read` under enforcement.
  - `@voyant-travel/db`: `user_profiles.permissions` + `cloud_auth_user_links.scopes`.

### Patch Changes

- Updated dependencies [b68d6a7]
  - @voyant-travel/schema-kit@0.107.0

## 0.108.5

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/core@0.111.0

## 0.108.4

### Patch Changes

- 1841ce2: D.2 slice 1 (batch 2) — 14 more packages own + ship their migration history (db, relationships, quotes, identity, distribution, inventory, commerce, catalog, finance, notifications, legal, storefront, charters, cruises). Each baseline reproduces the framework bundle's tables column-for-column, and all package sources now apply together (fresh-D.2 union) without collision.

  Shared enums: the codebase inlines copies of some enums to avoid cross-package schema imports (e.g. `service_type` in distribution + inventory, `entity_type` in relationships + quotes). Per-package generation would emit duplicate `CREATE TYPE`, colliding on a fresh D.2 database. All package migrations now wrap `CREATE TYPE … AS ENUM(…)` in an idempotent `DO`-block guard (subset-safe; whichever source applies first creates the type, the rest no-op). The db package additionally owns the shared Postgres extensions (pg_trgm / unaccent) that downstream trigram indexes need on a fresh D.2 database (the retired bundle injected them; per-package sources did not). The batch-1 packages (operator-settings, action-ledger, workflow-runs, trips) get the same guard for uniformity. No runtime change. See `docs/architecture/migration-collector-d2.md`.

## 0.108.3

### Patch Changes

- Updated dependencies [a74471e]
  - @voyant-travel/schema-kit@0.106.0

## 0.108.2

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
  - @voyant-travel/core@0.110.0

## 0.108.1

### Patch Changes

- 0c003f3: Make workflows node-only and remove the stale Cloudflare edge/Node step split.

  Workflow runtime annotations now accept only `runtime: "node"`, legacy
  `runtime: "edge"` is rejected, and the old split-runner wiring has been removed.
  The legacy Cloudflare workflow adapter packages, Worker reference apps, and
  standalone external step-server artifact have been removed. Managed Cloud apps
  should forward workflow calls to the hosted Node runtime, and self-hosted
  deployments should use the Node/Postgres runtime package.

## 0.108.0

### Minor Changes

- f25e790: New `@voyant-travel/db/write-intents` + `write_intents` table (TypeID prefix `wint`) — the queued write pipeline's result mailbox (RFC #1687 Phase 3.2). **Requires the `write_intents` migration.** `enqueueWriteIntent` dedups on `idempotencyKey` (a retried POST returns the SAME intent), `settleWriteIntent` only transitions pending rows (at-least-once redelivery after success is a no-op), and `expireStaleWriteIntents` backstops intents whose event dead-lettered in the outbox.

### Patch Changes

- Updated dependencies [f25e790]
  - @voyant-travel/schema-kit@0.105.2

## 0.107.0

### Minor Changes

- b7056f1: New `@voyant-travel/db/aggregate-snapshots` subpath: `readThroughAggregateSnapshot(db, { key, ttlSeconds, compute })` — a read-through TTL cache over the new `aggregate_snapshots` table (`key` text PK, `payload` jsonb, `computed_at`, `stale_after`). Fresh rows (`stale_after > now`) are served without running `compute`; stale/missing rows recompute and upsert in a single `INSERT ... ON CONFLICT (key) DO UPDATE` (neon-http compatible). The cache is strictly best-effort: read or upsert failures fall back to live computation. Two concurrent cold requests may both compute (last write wins — no locking by design). Also exports `aggregateSnapshotKey(...parts)` which joins parts with `:`, stable-stringifies object params (sorted keys), and replaces long parts with an FNV-1a 64 digest.

  **BREAKING-ish deploy note: the new `aggregate_snapshots` table requires the upcoming combined migration.** This release deliberately ships NO migration file — the table is exported from `@voyant-travel/db/schema` and will be picked up by the next generated migration. Until that migration is applied, `readThroughAggregateSnapshot` degrades gracefully to computing live on every call (the read failure is treated as a cache miss).

- b7056f1: New `@voyant-travel/db/outbox` module + `event_outbox` table (`schema/infra`, TypeID prefix `evob`) — the Postgres half of the transactional outbox (RFC #1687 Phase 2.1). **Requires the `event_outbox` migration.**

  - `createOutboxEventStore(getDb)` — plugs into `createEventBus`'s durable emit.
  - `insertOutboxEvents(dbOrTx, envelopes)` — atomic capture inside a domain transaction ("transactional outbox" proper); dedups on `metadata.eventId`.
  - `claimDueOutboxEvents` — visibility-timeout claiming (single statement, `FOR UPDATE SKIP LOCKED` subquery — safe on neon-http and under concurrent drains; a crashed claimer's rows simply become due again).
  - `drainOutbox(db, bus, opts)` — claim → redeliver via `bus.deliver` → complete / reschedule with exponential backoff (5s·2^attempts, 15min cap, jitter) / dead-letter after `max_attempts`.
  - `pruneDeliveredOutboxEvents`, `getOutboxStats`.

  Delivery is **at-least-once**: subscribers must be idempotent (the workflow forwarder already dedups on eventId; plugin subscribers key on external refs).

  Also: `createTestDb()` disables the Phase-1 default statement/query timeouts for test clients — `cleanupTestDb`'s full-schema TRUNCATE could exceed the 10s production default and kill integration-suite setup.

### Patch Changes

- Updated dependencies [b7056f1]
- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0
  - @voyant-travel/schema-kit@0.105.1

## 0.106.0

### Minor Changes

- 7255353: `createLinkService(...).list` accepts batched ID filters: `leftIds?: string[]` / `rightIds?: string[]` alongside the existing singular `leftId`/`rightId` (which keep working unchanged). A batched filter resolves with ONE `col = ANY($1)` query instead of one query per ID — on Workers + neon-http that's one subrequest and one roundtrip for N IDs. Details: ids are deduped; a one-element array collapses to the historical `col = $1` equality shape; singular + plural for the same side combine by intersection; an empty array (or an out-of-set singular) short-circuits to `[]` without touching the database; soft-delete filtering and `created_at ASC` ordering are unchanged. Read-only links stay correct: their resolvers only understand singular filters, so batched filters fan out one resolver call per ID (with any second batched side applied locally) — existing read-only resolver implementations need no changes.
- 7255353: - `createCrudService(...).listAndCount` now runs **one** query instead of two: the total rides along as a `count(*) OVER ()` window column (stripped from returned rows). Results are identical, including soft-delete filtering and the offset-past-end case (which falls back to a count query). On per-query transports (neon-http) this halves the roundtrips and subrequests of every list endpoint.
  - New `withServerlessDb(connectionString, fn, options?)`: runs `fn` with a scoped transaction-capable Neon WebSocket client and disposes it on settle — for event handlers, workflow steps, scheduled jobs, and scripts that need `db.transaction(...)` outside the request middleware.

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0

## 0.105.0

### Minor Changes

- 418fa82: `createDbClient` now applies default query/connection timeouts (behavior change: slow queries fail after ~10-15s instead of hanging for the Worker's full 30s lifetime). Serverless adapter (Neon WebSocket `Pool`): `statement_timeout: 10_000` ms (server-side), `query_timeout: 15_000` ms (client-side backstop — transaction-mode poolers like PgBouncer may ignore `statement_timeout` as a startup parameter), `connectionTimeoutMillis: 10_000`. Node adapter (postgres-js): `statement_timeout: 10_000` ms via connection params, `connect_timeout: 10` s. Edge (neon-http) is unchanged — the HTTP client has no client-side timeout config. Override via the new `timeouts?: { statementMs?, queryMs?, connectMs? }` option (each accepts `false` to disable) or via explicit `serverlessPool`/`pool` values, which win over defaults. Also new: `createServerlessDbClient` warns once per connection string when pointed at a Neon DIRECT endpoint instead of the `-pooler` host (direct endpoints have a low max_connections ceiling that per-request pools exhaust); helpers `isPooledNeonConnectionString`, `isNeonConnectionString`, `resolveServerlessPoolConfig`, and `resolveNodePostgresOptions` are exported.

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0

## 0.104.4

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0

## 0.104.3

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [c2aef18]
- Updated dependencies [d1ad572]
  - @voyant-travel/schema-kit@0.105.0
  - @voyant-travel/core@0.105.0

## 0.104.2

### Patch Changes

- e096b99: Make CRM people search tokenize whitespace-separated names and compare unaccented person fields so family-first names and diacritic variants match.

## 0.104.1

### Patch Changes

- @voyant-travel/core@0.104.1
- @voyant-travel/schema-kit@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/core@0.104.0
- @voyant-travel/schema-kit@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/core@0.103.0
- @voyant-travel/schema-kit@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/core@0.102.0
- @voyant-travel/schema-kit@0.102.0

## 0.101.2

### Patch Changes

- Updated dependencies [577eaf5]
  - @voyant-travel/core@0.101.2
  - @voyant-travel/schema-kit@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/core@0.101.1
- @voyant-travel/schema-kit@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/core@0.101.0
- @voyant-travel/schema-kit@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/core@0.100.0
- @voyant-travel/schema-kit@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/core@0.99.0
- @voyant-travel/schema-kit@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/core@0.98.0
- @voyant-travel/schema-kit@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [7094c8e]
  - @voyant-travel/core@0.97.0
  - @voyant-travel/schema-kit@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/core@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/core@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/core@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/core@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/core@0.92.0

## 0.91.0

### Patch Changes

- dc8554b: Add cruise voyage group schema, validation, service helpers, and admin routes for combined voyages, grand voyages, world cruises, cruise-tours, and pre/post extensions.
  - @voyant-travel/core@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/core@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/core@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/core@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/core@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/core@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/core@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/core@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/core@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/core@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/core@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/core@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/core@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/core@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/core@0.84.2

## 0.84.1

### Patch Changes

- b9ef614: Add slot-level extras manifests with per-traveler selection and cash collection tracking.
  - @voyant-travel/core@0.84.1

## 0.84.0

### Minor Changes

- 4ea42b3: Add tokenized public document delivery grants, a public document download route, and opt-in public download envelopes for generated finance and legal documents.

### Patch Changes

- @voyant-travel/core@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/core@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/core@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/core@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/core@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/core@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/core@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/core@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/core@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/core@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/core@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/core@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/core@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/core@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/core@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/core@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/core@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/core@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/core@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/core@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/core@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/core@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/core@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/core@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/core@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/core@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/core@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/core@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/core@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/core@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/core@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/core@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/core@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/core@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/core@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/core@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/core@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/core@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/core@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/core@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/core@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/core@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/core@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/core@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/core@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/core@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/core@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/core@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/core@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/core@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/core@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/core@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/core@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/core@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/core@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/core@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/core@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/core@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/core@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/core@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/core@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/core@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/core@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/core@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/core@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/core@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/core@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/core@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/core@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/core@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/core@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/core@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/core@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/core@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/core@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/core@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/core@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/core@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/core@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/core@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/core@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/core@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/core@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/core@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/core@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/core@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/core@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/core@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/core@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/core@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/core@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/core@0.64.1

## 0.64.0

### Minor Changes

- 6d0c8f3: Extract `withOptionalTransaction` into `@voyant-travel/db/transaction` so the soft-fallback helper that action-ledger has used since 0.62.0 can be shared by any package that needs it. Add `Module.requiresTransactionalDb` so modules whose write paths use interactive transactions declare it, and have `createApp()` assert on first request that the resolved db adapter supports `db.transaction(async (tx) => …)`. With the neon-http (edge) adapter that assertion now throws an actionable error pointing at `createServerlessDbClient` (neon-serverless / WebSocket) or `createDbClient(url, { adapter: "node" })` — instead of the cryptic "No transactions support in neon-http driver" exception thrown on first write.

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/core@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/core@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/core@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1

## 0.62.0

### Minor Changes

- 77aad68: Add a transaction-capable Neon serverless database adapter and make action-ledger skip Neon HTTP transactions safely.

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/core@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/core@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/core@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0

## 0.55.1

### Patch Changes

- 819c847: Ship the composed trip admin workflow and booking extras integration.

  Admin surfaces now include trip list/detail/composer routes, catalog-backed
  trip assembly, aggregate checkout handoff, payment-link trip summaries, and
  trip-aware navigation. Booking journeys and regular booking creation can route
  operators into the composer when the customer is building a multi-component
  itinerary.

  Catalog booking draft shapes now expose richer add-on offers, and owned product
  booking handlers can price and commit selected extras. Product detail pages can
  manage extras, booking create can select extras, and finance booking creation
  persists selected extras as booking items so invoices and payment links include
  them.

  Checkout payment pages now render clearer trip summaries, flight booking UI
  supports the refined baggage/one-way behavior used by the composer, shared UI
  exports the date-time field, and i18n includes the new trip admin copy.

  - @voyant-travel/core@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/core@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4

## 0.52.3

### Patch Changes

- 9679a57: Add the initial action ledger package with append-only ledger schemas, TypeID prefixes, canonical idempotency fingerprints, capability registry and guard helpers, query helpers, request-context ledger helpers, shared target timeline serialization, payload/relay append support, booking PII sensitive-read ledgering, booking traveler and travel-detail mutation ledgering, booking item/note/payment-policy mutation ledgering, booking action capability declarations and approval decision routing, booking action-ledger drift checks and dry-run remediation planning, finance invoice issuance/update/delete, invoice line-item ledgering, payment-session creation/update/lifecycle completion/failure/cancellation/expiration, payment instrument and authorization/capture ledgering, booking payment schedule and guarantee/default-plan ledgering, manual payment, supplier payment, and credit-note plus credit-note line-item ledgering, product create/update/delete ledgering with changed-field summaries and product timelines, nested product option, option-unit, translation, itinerary, day, day-service, media, brochure, feature, FAQ, location, taxonomy-link, destination-link, activation-setting, ticket-setting, visibility-setting, capability, and delivery-format mutation ledgering, product action-ledger drift checks, product admin route module splitting, admin list/detail routes with expanded filters and time windows plus payload and relay refs, relay outbox health listing with time windows and lifecycle helpers, runtime schema/route mounting, finance React client hooks for invoice and payment-session action ledger timelines, operator invoice/payment-session timeline mounting, product React client hooks and product detail activity UI, drift/canary health helpers and operator health endpoints, reversal recording support, route schema module split, client-safe React validation subpath imports, and reusable finance UI action ledger cards.
  - @voyant-travel/core@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/core@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/core@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/core@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4

## 0.31.3

### Patch Changes

- 5f974dd: Add first-class invoice attachment persistence, admin routes, React hooks, and invoice detail UI.
  - @voyant-travel/core@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/core@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7

## 0.30.6

### Patch Changes

- 5a4c592: Expose concrete schema file subpaths in the published `@voyant-travel/db` export map so Vite/Rollup can resolve deep imports such as `@voyant-travel/db/schema/iam/kms`.
  - @voyant-travel/core@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/core@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/core@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0

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

- 583326e: PR3 of #497: catalog-plane wiring + boundary scheduler.

  Storefront cards now render badges + strikethrough prices automatically when an active offer applies to a product. Offers fire at `valid_from` / expire at `valid_until` within ~5 minutes of the boundary (every-5-min cron in the operator template).

  This PR adds:

  **`@voyant-travel/products`** — new `productPromotionsCatalogPolicy` (in `./catalog-policy-promotions`) declaring 14 annotation fields the products search document picks up: `hasOffer`, `bestOfferId`, `bestOfferName`, `bestOfferDiscountKind`, `bestOfferDiscountPercent`, `bestOfferDiscountAmountCents`, `originalPriceFromAmountCents`, plus the matching `conditionalOffer*` set for "From N pax: extra X% off" hints. Visibility `[staff, customer, partner]`.

  **`@voyant-travel/promotions`** —

  - `./service-catalog-plane-promotions` — `createProductPromotionsProjectionExtension()`. Annotation-only contract per §3.7: does NOT touch `priceFromAmountCents`. Storefront consumers compute the effective price client-side. `loadOriginalPrice` callback lets templates wire a richer MIN-across-options resolver for option-driven products; default reads `products.sell_amount_cents`.
  - `./service-boundary-scheduler` — `runPromotionBoundaryScheduler({ db, eventBus? })`. Scans `promotional_offers` for `valid_from` / `valid_until` crossings since the persisted watermark, returns the `BoundaryCrossing[]` so cron handlers without an in-process bus can dispatch the reindex inline (Cloudflare scheduled handlers don't share an `EventBus` with the running app's catalog-bridge). New `promotional_offer_scheduler_state` watermark table (single row, sentinel-keyed for defense). New typeid `pofs`.
  - `createDrizzleOfferDataSource` (PR2) widened from `PostgresJsDatabase` to `AnyDrizzleDb` so the projection extension can use it from the products document builder's call site.

  **`@voyant-travel/db`** — new `pofs` typeid prefix for `promotional_offer_scheduler_state`.

  **Operator template** —

  - Schema added to `drizzle.config.ts`; migration `0007_oval_hex.sql` generated.
  - `catalog-runtime.ts` composes `productPromotionsCatalogPolicy` + `createProductPromotionsProjectionExtension()` into the products registry / builder.
  - `catalog-bridge.ts` subscribes to `promotion.changed` — reindexes the affected products on offer mutations + scheduler firings. `affected.kind: "all"` is logged + skipped (bulk-reindex API on `IndexerService` is a future enhancement; in practice global / market / audience scope changes are operator-rare).
  - New `src/api/promotion-scheduled.ts` cron handler (`*/5 * * * *`) — runs the scheduler, then reindexes the unique product set across all crossings via the same indexer code path the live bridge uses.
  - `wrangler.jsonc` adds the cron; `entry.ts` dispatches it.

  10 new unit tests + 9 new integration tests. 76 unit tests pass, 26 integration tests skipped without `TEST_DATABASE_URL`.

  **Known v1 limitations** (per §15 / §14 of the architecture doc):

  - Catalog filter / sort uses `priceFromAmountCents` (list price) rather than effective price — `bestOffer*` annotations don't change which products match a `< $200` filter when a product is on sale. Real fix is the §15.1 ordered-extensions contract change, deferred.
  - `affected.kind: "all"` reindex pathway is a no-op until `IndexerService` grows a bulk-reindex helper.

- 583326e: Initial release of `@voyant-travel/promotions` — PR1 of #497.

  Ships the schema + admin CRUD foundation for promotional offers (auto-applied catalog discounts, code-redeemed discounts at checkout, and audience- / market-scoped blanket discounts). Catalog-plane wiring lands in PR3 with the boundary scheduler; booking-engine integration in PR4. Full design in `docs/architecture/promotions-architecture.md`.

  This PR adds:

  - Three tables — `promotional_offers`, `promotional_offer_products` (denormalized scope materialization for `products` / `categories` / `destinations` scopes), `promotional_offer_redemptions` (per-`(offer, booking)` audit row with idempotent unique constraint).
  - TypeID prefixes `pofr` (`promotional_offers`) and `pofx` (`promotional_offer_redemptions`) in `@voyant-travel/db`.
  - Discriminated-union scope schema with six variants: `global`, `products`, `categories`, `destinations`, `markets`, `audiences`. No `channels` variant in v1 — see §3.2 of the architecture doc.
  - CRUD service (`listOffers`, `getOfferById`, `createOffer`, `updateOffer`, `archiveOffer`, `deleteOffer`) with optional `OfferMutationRuntime.eventBus` to emit `promotion.changed`. Service-layer pre-check on delete returns a clearer error than the raw FK RESTRICT when redemptions exist.
  - Scope materialization (`recomputeOfferLinks`): write-time expansion of `categories` and `destinations` scopes to product IDs via `@voyant-travel/products` link tables; slice-shaped scopes (`global`, `markets`, `audiences`) leave the link table empty.
  - Admin routes mounted at `/v1/admin/promotions/*` (auto-mounted by `createApp` based on `module.name`).
  - 30 unit tests + 17 integration tests.

  Operator template now ships the migration and the route mount.

- 4a6523e: Add reminder sequences: stages, channels, and notification settings (#488).

  Reminder rules can now own an ordered list of **stages**, each with its own anchor (`due_date`, `booking_created_at`, `departure_date`, `invoice_issued_at`, or `last_send_at`), eligibility window (`[startDays, endDays]`), and cadence (`once`, `every_n_days`, or `escalating` with `daysUntilDueGT/LT` buckets). Each stage can fan out to multiple channels, each carrying its own template and recipient kind. This subsumes the legacy single-offset rule (one stage, `cadence: once`, anchor `due_date`) and the counter-based escalation pattern from the issue (one stage with `cadence: escalating(...)` plus sibling stages keyed on cumulative `maxSendsInStage`).

  The dispatcher gains a stage-aware path that runs first; rules without stages fall through to the legacy date-offset path (back-compat). The migration creates one stage + one channel per existing rule mirroring the legacy behavior, so existing fires keep working unchanged.

  New tables: `notification_reminder_rule_stages` (typeid `ntrs`), `notification_reminder_stage_channels` (typeid `ntsc`), `notification_settings` (typeid `nset`). New columns on `notification_reminder_rules`: `priority`, `suppression_group`. New API surface: stage CRUD, stage channel CRUD, `/notification-settings`, and a read-only `/reminders/preview` that returns what _would_ fire on a given date with reasoning attached.

  The dispatcher now respects:

  - Quiet hours / blackout dates / weekend skips (per `notification_settings`, opt-out per stage via `respectQuietHours`).
  - Cross-rule dedup via `suppression_group` and a per-recipient daily channel rate limit.
  - Multi-channel stages (one decision → one delivery per channel, dedupe key includes channel).

  Engine PR is the first of three milestones; UI hooks (`@voyant-travel/notifications-react`) and a new `@voyant-travel/notifications-ui` package follow.

  - @voyant-travel/core@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6

## 0.26.5

### Patch Changes

- 7a92aba: Replace the `person_directory_projections` cache table with a Postgres view (closes #446).

  The projection table existed to avoid `LATERAL` joins on every people list read, but no current consumer pushes the projection to a search index — it was pure overhead with a rebuild step on every contact-point change. The new `person_directory` view computes the same `(email, phone, website)` triple per person on demand via `LATERAL` lookups against `identity_contact_points`, leaning on the existing `idx_identity_contact_points_entity_kind_primary_created` index.

  Net effect:

  - `crm.people` list reads now flow through the view; `hydratePeople` returns the same shape it always did.
  - The rebuild path is gone — `syncPersonIdentity` no longer calls `rebuildPersonDirectoryProjection`, and the `rebuildPersonDirectoryProjection(s)` exports are removed.
  - Stale-cache risk is eliminated: edits to `identity_contact_points` flow through immediately on the next read.

  Migration: `templates/operator/migrations/0028_person_directory_view.sql` drops the projection table and creates the view; registered in `meta/_journal.json`.

  Out of scope (deferred): if a future Typesense / search pipeline needs materialized snapshots, it can build a `MATERIALIZED VIEW` or its own table from `person_directory` rather than reusing the deprecated projection.

  - @voyant-travel/core@0.26.5

## 0.26.4

### Patch Changes

- 6493f62: Add `customer_signals` table for the pre-pipeline interest surface (closes #444).

  Customer signals are the lighter-than-opportunities, heavier-than-segments space — wishlist entries, "notify when this departure opens", inquiry calls captured by an operator, abandoned-cart recovery, request-offer leads. The new `crm.customer_signals` table records:

  - `kind` — `wishlist | notify | inquiry | request_offer | referral`.
  - `source` — `form | phone | admin | abandoned_cart | website | booking`.
  - `status` — `new | contacted | qualified | converted | lost | expired`, default `new`.
  - `priority` (text, validation-layer enum `low | normal | high | urgent`), `notes`, `tags`, `assignedToUserId`, `followUpAt`, `sourceSubmissionId`, `metadata`.
  - `productId`, `optionUnitId`, `resolvedBookingId` as plain `text()` columns — cross-module references stay loose per the project FK rule.

  API:

  - `crmService.listCustomerSignals(db, { personId?, assignedToUserId?, status?, kind?, productId?, search? })` paginated.
  - `crmService.listSignalsForPerson(db, personId)` chronological convenience.
  - CRUD + `crmService.resolveCustomerSignalToBooking(db, signalId, bookingId)` which marks the signal `converted` and pins the bookingId.
  - Admin routes: `GET/POST /v1/admin/crm/customer-signals`, `GET/PATCH/DELETE /v1/admin/crm/customer-signals/:id`, `POST /v1/admin/crm/customer-signals/:id/resolve`, `GET /v1/admin/crm/people/:id/signals`.
  - React hooks: `useCustomerSignals(filters)`, `useCustomerSignalsForPerson(personId)`, `useCustomerSignal(id)`, `useCustomerSignalMutation()` returning `{ create, update, remove, resolve }`.

  Migration: `templates/operator/migrations/0027_customer_signals.sql`, registered in `meta/_journal.json`.

  Out of scope (deferred): full "create booking from signal" orchestration UI; auto-expiry cron that sweeps stale signals to `expired`. The data layer supports both.

  - @voyant-travel/core@0.26.4

## 0.26.3

### Patch Changes

- 372cad5: Add person-to-person relationships table for kinship, emergency contacts, and travel companions (closes #442).

  New `crm.person_relationships` table records directed `fromPerson → toPerson` edges of one of eleven kinds (`spouse`, `partner`, `parent`, `child`, `sibling`, `guardian`, `ward`, `emergency_contact`, `friend`, `travel_companion`, `other`). The optional `inverseKind` lets the service auto-write the symmetric edge in the same transaction (parent↔child, guardian↔ward, etc.) so operator UIs don't have to maintain both sides; the auto-inverse path is idempotent on retry. `(from_person_id, to_person_id, kind)` is uniquely indexed and a CHECK constraint rejects self-edges. Migration: `templates/operator/migrations/0026_person_relationships.sql` (registered in `meta/_journal.json`).

  API surface:

  - `crmService.listPersonRelationships(db, personId, { direction?: "from" | "to" | "both" })` — defaults to `both` so the typical "Jane's family" view returns the union.
  - `crmService.createPersonRelationship(db, fromPersonId, { toPersonId, kind, inverseKind?, autoInverse? })`
  - `crmService.getPersonRelationship` / `updatePersonRelationship` / `deletePersonRelationship`
  - Admin routes: `GET/POST /v1/admin/crm/people/:id/relationships`, `GET/PATCH/DELETE /v1/admin/crm/person-relationships/:id`.
  - React hooks: `usePersonRelationships(personId, { direction, kind })`, `usePersonRelationshipMutation(personId)` returning `{ create, update, remove }`.

  Out of scope (deferred): UI components for the relationship graph; phone-keyed emergency-contact convenience helpers (use `metadata` for now). The data layer is ready for both.

  - @voyant-travel/core@0.26.3

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
  - @voyant-travel/core@0.26.2

## 0.26.1

### Patch Changes

- c0507a6: Move toxic PII to `crm.people` and add structured `person_documents` (closes #440 and #443).

  `user_profiles` is no longer the home for encrypted PII. The four free-text slots (accessibility / dietary / loyalty / insurance) move to `crm.people` so operator-managed humans without auth accounts can carry them, and identity documents graduate to a structured `person_documents` table with type / expiry / issuing authority / attachment + a partial unique index pinning a single primary doc per type per person.

  Booking travelers now snapshot dietary, accessibility, and the primary passport from the linked person record at create time (snapshot-on-create, explicit input always wins) via a new `POST /v1/admin/bookings/:id/travelers/with-travel-details` route. Templates wire the snapshot via `createBookingsHonoModule({ resolveTravelSnapshot })` delegating to `crmService.loadPersonTravelSnapshot` — bookings stays free of any direct CRM dependency.

  Customer portal exposes plaintext `accessibility/dietary/loyalty/insurance` on `/me` plus full CRUD over `/me/documents`. CRM admin gains server-side encrypt/decrypt endpoints (`travel-snapshot`, `profile-pii`, `*/from-plaintext`) so the operator booking-traveler dialog can pre-fill from profile and push diverging values back without the browser holding KMS material. The dialog itself now ships a "Travel details" section with passport / dietary / accessibility fields, plus "Pre-fill from profile" and "Save to profile" affordances when a CRM person is linked.

  Breaking changes (intentionally landed pre-1.0):

  - `user_profiles.documentsEncrypted/accessibilityEncrypted/dietaryEncrypted/loyaltyEncrypted/insuranceEncrypted` columns are removed. Migration ships `templates/operator/migrations/0024_people_pii_documents.sql`.
  - `customerPortalProfileSchema.documents` (array) replaced with separate `accessibility/dietary/loyalty/insurance` plaintext string fields. Document CRUD lives at `/v1/public/customer-portal/me/documents`.
  - `bookingsHonoModule` and `crmHonoModule` are still exported but the env-driven default factory `createBookingsHonoModule()` / `createCrmHonoModule()` is the new recommended entry point.
  - @voyant-travel/core@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/core@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/core@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1

## 0.21.0

### Minor Changes

- 6427bad: Release the booking journey architecture train.

  This adds booking hold policy support, richer traveler and booking journey flows, operator tax policy configuration, finance billing and tax policy APIs, notification reminder target and delivery tooling, and the template/runtime wiring needed for the operator storefront checkout flow.

### Patch Changes

- @voyant-travel/core@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/core@0.19.0

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

- @voyant-travel/core@0.18.0

## 0.17.0

### Minor Changes

- 66d722d: `resolveDb` callbacks in `createNotificationsHonoModule` and `createLegalHonoModule` now return `AnyDrizzleDb` (the `PostgresJsDatabase | NeonHttpDatabase` union from `@voyant-travel/db`) instead of strictly `PostgresJsDatabase`. Templates wiring `getDbFromHyperdrive` no longer need the `as unknown as PostgresJsDatabase` apology cast.

  New shared type alias `AnyDrizzleDb` exported from `@voyant-travel/db`. Also normalized three `bindings: unknown` parameter types to `bindings: Record<string, unknown>` in `packages/legal/src/contracts/routes.ts` (`resolveDocumentGenerator`, `resolveDocumentDownloadUrl`, `resolveEventBus`) — was previously inconsistent with the rest of the workspace.

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/core@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/core@0.13.0

## 0.12.0

### Patch Changes

- 944d244: Adds the charters module — a new opt-in vertical for yacht-charter brands carved out of cruises (operators selling Aman, Four Seasons, Ritz-Carlton, SeaDream, A&K, Orient Express style products), designed natively against Voyant's existing module/extension/link conventions and the broker-mediated yacht-charter data shape (whole-yacht vs per-suite, MYBA contracts, APA, multi-currency native pricing).

  **`@voyant-travel/charters`** — full server module:

  - 5 tables: charter_products (one per brand × yacht configuration), charter_voyages (a specific dated trip), charter_yachts (vessel specs + crew), charter_suites (per-voyage suite pricing, all four first-class currencies as explicit columns), charter_schedule_days (flat per-voyage itinerary; no template/override two-tier — charter schedules are negotiable).
  - Two booking modes per voyage: `per_suite` and `whole_yacht`. Voyages opt into either or both; whole-yacht requires a resolvable APA percent and an MYBA contract template ref.
  - Multi-currency native (USD/EUR/GBP/AUD as explicit price columns, not derived). `pricingService.quotePerSuite` and `quoteWholeYacht` use pure BigInt-cent math; no float drift. APA computed as integer basis points.
  - `booking_charter_details` 1:1 extension on bookings: `bookingMode` discriminator, source/sourceProvider/sourceRef provenance, multi-currency snapshot fields, MYBA contract id (soft FK to legal.contracts), and APA reconciliation state (paid / spent / refund / settledAt).
  - `chartersBookingService` with four entry points — local + external × per-suite + whole-yacht. Each commits in a single transaction (atomic booking + travelers + extension snapshot). External flows commit upstream BEFORE local writes so the upstream rejection path is loud.
  - `mybaService.generateContract` is DI-shaped — accepts a `CharterContractsService` so charters takes no hard dep on `@voyant-travel/legal`. Idempotent; respects voyage override → product default → injected service default precedence.
  - APA reconciliation: `recordApaPayment` (collected from charterer pre-charter) and `reconcileApa` (records on-board spend + refund balance + optional settle stamp). Routes mounted as a `bookings` extension at `POST /v1/admin/bookings/:bookingId/charter-details/apa/{payment,reconcile}`.
  - **Provenance — local + external in one experience.** Charters can be self-managed (operator owns the rows) or external (sourced through a registered `CharterAdapter`). Admin + public routes use a unified-key parser that accepts both `chrt_*` / `chrv_*` / `chry_*` TypeIDs and `<provider>:<ref>` external keys; list endpoints fan out to all registered adapters via parallel `Promise.allSettled`. External writes return 409.
  - Adapter contract (`@voyant-travel/charters/adapters`): `CharterAdapter` interface with `listEntries` / `fetchProduct` / `fetchVoyage` / `fetchVoyageSuites` / `fetchVoyageSchedule` / `fetchYacht` / `listVoyagesForProduct` / `createPerSuiteBooking` / `createWholeYachtBooking`. Process-local registry, TTL+LRU memoize decorator, and `MockCharterAdapter` for tests with seeders + `failEveryNthCall` for error-path coverage.
  - Unlike cruises, charters has NO search index — the operator universe is small (six brands in v1) so adapter fan-out per request is plenty.
  - 77 unit tests covering pricing math (USD/EUR/GBP/AUD currency resolution, fractional APA percentages, BigInt cent precision), MYBA service (idempotency, template precedence, variable propagation), booking-extension validation (mode-specific refinements, external provenance rules), routes (invalid keys, write rejections, external dispatch with adapter, MYBA endpoint without contracts service), adapter registry / mock / memoize.

  **`@voyant-travel/charters-react`** — React Query hooks + Zod fetch client:

  - ~15 hooks: `useCharterProducts` / `useCharterProduct` / `useCharterProductMutation`, `useCharterVoyages` / `useCharterVoyage`, `useCharterYachts` / `useCharterYacht`, `usePerSuiteQuote` / `useWholeYachtQuote`, `useCharterBookingMutation` (per-suite + whole-yacht — server dispatches local vs external), `useGenerateMybaContract`, `useCharterDetails` / `useRecordApaPayment` / `useReconcileApa`, plus public-surface variants.
  - Mirrors `@voyant-travel/cruises-react` exactly: hierarchical query keys rooted at `["voyant", "charters"]`, `queryOptions()` factories for SSR/router prefetch, envelope helpers, `VoyantChartersProvider`, mutations that invalidate the parent resource and `setQueryData` on the detail. Detail responses union local + external dispatch shapes so callers handle provenance with a discriminated check.
  - 15 unit tests across query keys, the validating fetcher (URL join, error extraction, schema mismatch handling, Content-Type defaulting), and query-option factories (URL serialisation, unified-key encoding, public-vs-admin surface routing).

  **`@voyant-travel/bookings`**: no schema changes; charters integrates as a 1:1 extension table. Patch bump captures the dependency edge.

  **`@voyant-travel/db`**: registers TypeID prefixes for the charter namespace (`chrt`, `chrv`, `chry`, `chst`, `chrd`).

  **`@voyant-travel/ui`** (registry only — versionless): adds the `voyant-charters-*` shadcn registry components — `external-badge`, `charter-product-card` (works for both local records and external summaries), `voyage-suite-grid` (per-suite pricing matrix with category, availability badge, multi-currency price, quote/book CTA), `whole-yacht-quote-card` (charter fee + APA + total + explanatory copy; ships with a per-suite sibling), `apa-tracker` (pre-/post-charter APA reconciliation panel with collected / spent / refund / settled state). Install via `shadcn add voyant-charters-charter-product-card` etc.

  **Design doc**: full rationale, schema, and architecture in `docs/architecture/charters-module.md`.

- cc561ce: Adds the cruises module — a new opt-in vertical for cruise-selling travel agencies, designed natively against Voyant's existing module/extension/link conventions and reverse-engineered from the cross-line cruise-industry data shape (sailings, ships, decks, cabin categories, fare codes, occupancy grids, dated promo overlays, expedition enrichment programs).

  **`@voyant-travel/cruises`** — full server module:

  - 13 tables: cruises, sailings, ships, decks, cabin categories, cabins, prices, price components, days, sailing-day overrides, media, inclusions, search index, enrichment programs.
  - Pricing: a (sailing × cabin category × occupancy × fare code) grid with per-row price components (gratuities, OBC, port charges, taxes, NCF, airfare). Soft-FKs to `@voyant-travel/pricing` `priceCatalogs`/`priceSchedules` for promo overlays — no cruise-local promotions table.
  - Itinerary at two levels: `cruise_days` template + `cruise_sailing_days` per-sailing overrides (skipped ports, alternate times, ship swaps). `getEffectiveItinerary()` merges them.
  - River direction enum (`upstream | downstream | round_trip | one_way`) on sailings.
  - Expedition enrichment programs (naturalist / historian / photographer / lecturer / expert).
  - Money math (`composeQuote`) is a pure function performed in BigInt cents — supports occupancy variants, single-supplement %, second-guest pricing, and the addition/credit/inclusion price-component directions. 20 unit tests cover the math.
  - Booking integration: `booking_cruise_details` + `booking_group_cruise_details` extension tables, `cruisesBookingService.createCruiseBooking` (single cabin) and `createCruisePartyBooking` (multi-cabin via `bookingGroups` of new kind `cruise_party`). External-sailing bookings go through `createExternalCruiseBooking` which commits upstream first, then snapshots the connector booking ref.
  - **Provenance — local + external in one experience.** Cruises can be self-managed (operator owns the rows) or external (sourced through a registered `CruiseAdapter`). Admin routes use a unified-key parser that accepts both `cru_*` TypeIDs and `<provider>:<ref>` external keys; list endpoints interleave both sources via parallel `Promise.allSettled` adapter fan-out. External writes return 409. `POST /:key/refresh` re-fetches; `POST /:key/detach` does a one-way snapshot to local.
  - Adapter contract (`@voyant-travel/cruises/adapters`): `CruiseAdapter` interface with `listEntries` / `searchProjection` / `fetchCruise` / `fetchSailing` / `fetchSailingPricing` / `fetchSailingItinerary` / `fetchShip` / `listSailingsForCruise` / `createBooking`. Process-local registry (`registerCruiseAdapter`/`resolveCruiseAdapter`/`listCruiseAdapters`), TTL+LRU memoize decorator, and `MockCruiseAdapter` for tests. The Voyant Connect adapter is intentionally not built in this release — the contract is ready for it.
  - Search index (`cruise_search_index`): opt-in storefront projection. Local cruises are projected automatically by mutation hooks in `cruisesService`; adapters call `PUT /v1/admin/cruises/search-index/bulk` to push externals. Storefront `GET /v1/public/cruises` reads exclusively from this index for paginated/filterable browse with provenance-aware detail dispatch.
  - ~88 unit tests covering pricing math, key parsing, route validation, adapter registry, mock adapter, memoize decorator, and direction/enrichment validation.

  **`@voyant-travel/cruises-react`** — React Query hooks + Zod fetch client:

  - ~25 hooks: `useCruises` / `useCruise` / `useCruiseMutation`, `useSailings` / `useSailing` / `useSailingMutation`, `useShips` + ship-detail family, `usePrices` / `useQuote`, `useCruiseBookingMutation` (single + party), `useEnrichmentPrograms` / `useEnrichmentMutation`, `useExternalCruiseActions` (refresh / detach), `useSearchIndexMutation`, `useStorefrontCruises` / `useStorefrontCruise` / `useStorefrontSailing`.
  - Mirrors `@voyant-travel/crm-react` and `@voyant-travel/products-react` exactly: hierarchical query keys rooted at `["voyant", "cruises"]`, `queryOptions()` factories for SSR/router prefetch, envelope helpers, `VoyantCruisesProvider`, mutations that invalidate the parent resource and `setQueryData` on the detail.

  **`@voyant-travel/bookings`**: extends `bookingGroupKindEnum` with `cruise_party` so multi-cabin party bookings have a first-class group kind alongside `shared_room` and `other`. Pure additive; existing groups unaffected.

  **`@voyant-travel/db`**: registers TypeID prefixes for the cruise namespace (`cru`, `crsl`, `crsh`, `crdk`, `crcc`, `crcb`, `crpx`, `crpc`, `crdy`, `crsd`, `crme`, `crin`, `crsi`, `crep`).

  **`@voyant-travel/ui`** (registry only — versionless): adds the `voyant-cruises-*` shadcn registry components — `external-badge`, `cruise-card`, `cruise-list`, `pricing-grid` (the load-bearing cabin × occupancy matrix), `quote-display`, `enrichment-program-list`. Install via `shadcn add voyant-cruises-cruise-card` etc.

  **Example app** (`examples/nextjs-booking-portal`): adds `/cruises` listing + `/cruises/[slug]` detail pages backed by `/v1/public/cruises`, with mock data showing the local-vs-external dual-source UI.

  **Design doc**: full rationale, schema, and architecture in `docs/architecture/cruises-module.md` (745 lines).

  - @voyant-travel/core@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/core@0.11.0

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

### Patch Changes

- @voyant-travel/core@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/core@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9

## 0.6.8

### Patch Changes

- b218885: Add a composite Better Auth membership index for workspace organization access paths.
  - @voyant-travel/core@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4

## 0.6.3

### Patch Changes

- d3c6937: Add a narrow execution lock surface and use it to serialize worker-driven notification reminder sweeps across processes.
- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0

## 0.5.0

### Patch Changes

- ce72e29: Add a shared-room / split-booking group model

  Multiple separate bookings can now intentionally share one room/accommodation while each booking keeps its own finance + traveler records. Inspired by the ProTravel v3 `sharing_groups` pattern: flat peer bookings, a lightweight `booking_groups` + `booking_group_members` schema, smart cleanup on cancellation.

  `@voyant-travel/bookings`: new `bookingGroups` and `bookingGroupMembers` tables (TypeID prefixes `bkgr` / `bkgm`), service functions for CRUD plus reverse lookup, unified traveler list across members, and automatic group dissolution when a cancellation leaves ≤1 active members. New routes under `/v1/bookings/groups` plus the REST-nested `GET /v1/bookings/:id/group`.

  `@voyant-travel/bookings-react`: hooks for `useBookingGroups`, `useBookingGroup`, `useBookingGroupForBooking`, `useBookingGroupMutation`, and `useBookingGroupMemberMutation` (stateless — accepts `groupId` per-call so create-then-add flows work with a single hook instance).

  `@voyant-travel/db`: register TypeID prefixes `bkgr` (booking_groups) and `bkgm` (booking_group_members).

  - @voyant-travel/core@0.5.0

## 0.4.5

### Patch Changes

- e3f6e72: Standardize TypeID prefixes to a first-N-chars convention for better DX.

  Root entities now use the shortest unambiguous first-N chars of the entity name
  (e.g. `pers` instead of `prsn`, `org` instead of `orgn`). Child entities use a
  2-char module code plus 2-char suffix. 19 prefixes renamed in total.

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1

## 0.4.0

### Patch Changes

- e84fe0f: Enrich the public customer-portal profile with middle name, top-level
  date-of-birth/address fields, consent provenance/source, and encrypted travel
  document reads/writes backed by `user_profiles.documentsEncrypted`.
  - @voyant-travel/core@0.4.0

## 0.3.1

### Patch Changes

- 8566f2d: Add first-class public booking-session wizard state and storefront repricing.

  `@voyant-travel/bookings` now persists wizard session state in `booking_session_states`,
  includes that state in public session reads, exposes public state read/write
  routes, and adds `POST /v1/public/bookings/sessions/:sessionId/reprice` for
  previewing or applying room/unit repricing back onto the booking session.

  `@voyant-travel/bookings-react` now exports public session/state query helpers and a
  mutation helper for session state updates and repricing.

- 8566f2d: Add a first-class public storefront verification flow with email and SMS
  challenge start/confirm routes, pluggable developer-supplied senders, and
  built-in notification-provider adapters including Resend email and Twilio SMS.
  - @voyant-travel/core@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0

## 0.2.0

### Patch Changes

- @voyant-travel/core@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1

## 1.1.11

## 1.1.1

## 1.1.0

### Minor Changes

- [#292](https://github.com/voyant-travel/voyant/pull/292)
  [`d799492`](https://github.com/voyant-travel/voyant/commit/d799492fabc7789315d614af4bb2f3a58804ce10)
  Thanks [@mihaipxm](https://github.com/mihaipxm)! - Initial SDK release
