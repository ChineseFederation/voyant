# Performance Assessment & Optimization Plan for Enterprise-Scale Workloads

> Companion to RFC [#1687](https://github.com/voyant-travel/voyant/issues/1687). Assessed against
> `main` @ `bfae40eff` (2026-06-12). Symptom issues: #1631 (bundle/cold start), #1636 (API-graph
> first-call hang), #1686 (uncached catalog reads → isolate collapse), #1629 (dashboard
> aggregates), #1641 (template-port friction).
>
> **Platform-side work items** (Neon endpoint tiers, explicit pooler, dispatcher cache,
> publisher bindings, Node DB lane, per-dispatch limits, namespace observability) are tracked
> in [voyant-travel/platform#458](https://github.com/voyant-travel/platform/issues/458).

## 1. Deployment constraints (what we must design around)

Voyant Cloud runs tenant workers on **Cloudflare Workers for Platforms** (dynamic dispatch).
That fixes the physics:

| Constraint | Consequence |
|---|---|
| **No Hyperdrive** in namespaced user workers | No platform-managed connection pooling. DB access is Neon serverless drivers only: HTTP (per-query fetch, no interactive tx) or WebSocket (interactive tx, full handshake per connection). |
| **No cross-request I/O reuse** in Workers | A WebSocket/TCP connection opened in request A cannot be used by request B ("Cannot perform I/O on behalf of a different request"). Module-scope Pool caching is not an option — only Durable Objects can hold connections across events. |
| **~128 MB / isolate** | The module-graph baseline plus per-request payload allocation is the budget. #1686 demonstrated isolates collapsing under uncached catalog reads. |
| **CPU-time + startup-CPU + ~1000 subrequest budgets** | Every neon-http query is one subrequest. N+1 patterns burn both latency *and* the subrequest budget. The startup-CPU ceiling already forced lazy-loading the API graph (#1636). |
| **Single-region Neon database** (region chosen per deployment; e.g. the operator starter assumes one EU DB — `starters/operator/src/api/lib/db.ts:37-41`) | Workers run in the colo nearest the *visitor*; the DB lives in one region. A visitor far from the tenant's DB region pays that RTT *per query* — 8 sequential queries × ~100ms = ~800ms floor before any compute. The penalty is per-tenant geometry, but the mitigation (edge read models, placement near DB) is the same for all. |
| **`caches.default` is disabled for namespaced scripts** ([WfP limits](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/limits/)) | Tenant workers cannot edge-cache their own HTTP responses via the Cache API. HTTP response caching belongs at the **dynamic dispatch worker**, which Cloudflare explicitly positions as the middleware layer (auth, transforms, caching, per-tenant limits). Tenant workers emit `Cache-Control`; the platform honors it. In-worker fallback: KV-backed response cache. Self-hosted (non-namespaced) workers keep full Cache API. |
| Available primitives | KV (eventually consistent, ~60s propagation, 1 write/s/key), R2, Durable Objects (+ SQLite, unlimited namespaces on WfP), D1 (incl. read replication via Sessions API), **Analytics Engine (explicitly supported on user workers)**, Queues (not listed among WfP user-worker bindings — producers to be confirmed; **consumers cannot attach to namespaced scripts** — consume at platform level and dispatch in), Cron (not documented for namespaced scripts — Voyant Cloud schedules at platform level today). |
| **Dispatcher = per-tenant control point** | The dispatch worker can enforce **custom CPU-time and subrequest limits per dispatch** (e.g. per plan tier) and run caching/auth/transform middleware. Logpush/tail-worker observability configured once on the dispatcher covers every user worker in the namespace. These are the platform-native primitives for bulkheads, rate limits, and fleet observability. |
| **Neon read replicas** | Available regardless of plan shape, but they are **same-region** as the primary — they scale read *throughput*, not geography. The `edge` (neon-http) adapter already supports them via `withReplicas` (`packages/db/src/index.ts:114-126`); only the WS `serverless` adapter throws. |

### What Voyant Cloud provisions today (verified against the control-plane source)

Audited at `voyant-cloud` (apps/dispatcher, apps/build-publisher, apps/api/src/platform):

| Fact | Evidence | Consequence |
|---|---|---|
| **Tenant `DATABASE_URL` uses the pooler in production (verified live), but only implicitly.** The control plane takes `connection_uris[0]` from the project-create response and never passes `pooled: true` anywhere, even though the client supports it (`neon.ts:274,284`) — the pooled outcome depends on Neon's response default, and any code path resolving a URI via `getNeonConnectionUri` without `pooled` gets the direct endpoint (~419 connections at 1 CU vs 10,000 on the pooler). | `apps/api/src/platform/neon.ts:109`, `store/databases-access.ts:344-355`; production env verified against the live Neon project | Make `pooled: true` explicit so the safety isn't an accident of Neon's defaults. Keep the direct URI as a *separate, deliberate* secret for the Node runtime (see Phase 2.6). |
| **Tenant Neon computes are pinned at 1 CU fixed with scale-to-zero left on** (verified live: tenant projects have `autoscaling_limit_min_cu: 1, max_cu: 1, suspend_timeout_seconds: 0` = Neon's 5-min default; internal platform projects get 0.25–8 CU autoscaling). The endpoint-update API exists (`neon.ts:331-362`) but isn't called at provisioning. | Live Neon org data (tenant projects `pro-travel-admin-database-*`, `anbtours-*`, `smallshiptravel-*`); `databases-access.ts:344-355` | Under a spike the tenant DB **cannot scale up at all** — 1 CU is the hard compute ceiling (and bounds the pooler's server-side pool at ~377). Phase 0.0: per-tier endpoint policy — autoscaling range for everyone; scale-to-zero stays on for low-usage tenants (it's a cost feature, and the resume is only a few hundred ms on first query), disabled only for high-traffic/enterprise tiers. |
| **The dispatcher is a thin router with no caching for worker traffic.** KV hostname lookup → `env.DISPATCHER.get(workerName).fetch()`. Static assets get `Cache-Control: public, max-age=3600`; dispatched worker responses get nothing. | `apps/dispatcher/src/index.ts:86-89,191,205-206` | The platform-level cache layer proposed in Phase 0.1 does not exist yet — and the dispatcher is ours to change. |
| **No per-dispatch limits** — `namespace.get(workerName)` is called without the limits argument; no rate limiting in the dispatcher. | `apps/dispatcher/src/index.ts:205` | WfP custom CPU/subrequest limits per tenant (Phase 3.2 bulkhead) are available but unused. |
| **Build publisher emits only `cf_kv`, `cf_r2`, `cf_worker` bindings** (+ assets). No Durable Objects, no D1, no Analytics Engine, no Queues, no placement/limits/tail metadata, no cron triggers. | `apps/build-publisher/src/index.ts:236-253` | The operator starter's `WORKFLOW_RUN_DO` binding **cannot be provisioned on Voyant Cloud today** (WfP supports DOs; the publisher just doesn't emit `durable_objects`+`migrations`). Analytics Engine (Phase 3.4) and any DO-based pattern (outbox drain, per-slot serialization, DO connection pool) need publisher support first. |
| **Cron runs platform-side**: the platform parses tenant workflow manifests and dispatches schedules into tenant workers via fetch. Queues are used platform-internally (webhook delivery + DLQ, connect sync). | `apps/api/.../workflow-schedules.ts`, `apps/api/wrangler.jsonc:10-26` | The "platform-level consumer dispatching into the namespace" pattern (Phase 3.2) is already how Voyant Cloud works — extend it rather than invent it. |
| Read-replica provisioning code already exists (`POST /endpoints` with `type: "read_only"` + per-replica connection URIs). | `neon.ts:380-401`, `databases-access.ts:851-862` | Phase 2.3 needs no new control-plane machinery. |

Neon platform facts that bound the design (from Neon docs): the pooler is PgBouncer in
**transaction mode** (10,000 max client connections; `default_pool_size` ≈ 0.9 × server
`max_connections`, e.g. ~377 at 1 CU). Transaction mode forbids session state (`SET`,
`LISTEN/NOTIFY`, session advisory locks, SQL-level `PREPARE`) but supports protocol-level
prepared statements — which is what the Neon drivers and drizzle use, so the framework is
compatible. Interactive transactions work (a transaction pins one server connection for its
duration). Read replicas are **same-region only**, eventually consistent, near-instant to
create (shared storage, no data copy). Scale-to-zero suspends after 5 minutes by default,
resumes in a few hundred ms, and can be disabled on paid plans (computes > 16 CU never
suspend).

Still unverified: whether **Smart Placement** can be set on dispatch-namespace user workers
(not covered by WfP docs, not attempted by the publisher) — affects 1.6 only.

## 2. Bottleneck inventory (evidence-based, severity-ordered)

### T1 — CRITICAL: per-request WebSocket Pool to Neon, ×2 on authenticated requests

Every request constructs a fresh `new Pool(...)` (TCP + TLS + WebSocket upgrade + Postgres
auth — several RTTs before the first query) and disposes it after the response:

- `starters/operator/src/api/lib/db.ts:34` → `createServerlessDbClient` → `packages/db/src/index.ts:140` (`new Pool(...)`)
- Disposed via `executionCtx.waitUntil` in `packages/hono/src/middleware/db.ts:101`

Worse, **authenticated requests open two pools**: the auth middleware constructs its own client
(`packages/hono/src/middleware/auth.ts:82` for API keys, `:171` for session resolve) and the db
middleware constructs a second one. `requirePermission` adds a third
(`packages/hono/src/middleware/require-permission.ts:64`).

At enterprise RPS this (a) adds 100–500ms latency per request depending on colo↔Neon distance,
(b) churns connections at request rate (the pooler absorbs the client-connection count — 10k —
but every handshake still costs the full TLS+auth round trips, and the server-side pool behind
it is bounded by the tenant's compute size: ~377 at the current fixed 1 CU). There is no
`statement_timeout`, no pooled-endpoint (`-pooler`) validation, and no `neonConfig` tuning
anywhere in the repo.

The reason everything rides the WebSocket adapter is transactions: `bookings` declares
`requiresTransactionalDb`, and there are ~144 `db.transaction(...)` call sites — so the
*entire* request surface pays the WS handshake even though the overwhelming majority of
requests (all reads, most writes) never open a transaction. The safer
`withOptionalTransaction` helper exists (`packages/db/src/transaction.ts:38`) but is unused by
the hot paths.

### T2 — CRITICAL: public/storefront read path is live-computed, uncached, oversized (#1686)

- `GET /v1/public/products` returns full richtext (`inclusionsHtml`, `termsHtml`, long
  descriptions) per card; no `Cache-Control`; no edge/KV caching; no enforced pagination caps.
- `listResolvedProducts` resolves overlays **serially per product**
  (`packages/products/src/service-catalog-plane.ts:189-211`, batching is an acknowledged TODO).
- Storefront card projection runs ~6 queries/product, 2 of them sequential
  (`service-catalog-plane.ts:398-456`).
- Public pricing detail is an 8-query chain (`packages/pricing/src/service-public.ts:183-283`).
- `queryGraph` fires one link lookup **per base record** (`packages/core/src/query.ts:204-210`)
  because `LinkService.list` accepts a single `leftId`/`rightId`
  (`packages/db/src/links.ts:174-200`) — 50 products = 50 link queries (then one batched
  hydration, which is correct).

Combined with T1 this is the incident signature from #1686: heavy allocation per request,
recomputed per request, against the 128 MB ceiling. **This is also the path that must serve
"1M users on payday" — it cannot be a live-DB path at all at that scale.**

### T3 — CRITICAL: synchronous in-process event bus; no durability; subscribers block responses

- `emit` awaits every handler **sequentially, in-request**
  (`packages/core/src/events.ts:118-125`). "Fire-and-forget" only means errors don't propagate.
- Plugin subscribers make awaited outbound HTTP calls inside that loop — SmartBill
  (`@voyant-travel/plugin-smartbill`), Payload/Sanity CMS sync, channel-push.
  A booking confirmation response waits on every third-party API serially.
- **No transactional outbox**: events exist only in memory. Worker death after DB commit but
  mid-emit silently loses invoice sync, channel push, workflow triggers. Workflow ingest is
  forwarded synchronously from the same loop (`packages/hono/src/app.ts:416-438`).
- In-process saga steps run sequentially in-request (`packages/core/src/workflows.ts:219-249`);
  refund flow = 7 steps each with DB/external I/O.

### T4 — HIGH: auth costs a DB roundtrip on every request; zero session/key caching

- API-key requests: SHA-256 + `SELECT` from `apikey` per request (`middleware/auth.ts:84-90`).
- Session requests: Better Auth session lookup per request via `auth.resolve` — **no
  `cookieCache`**, no KV cache, nothing in-memory.
- CORS allowlist re-parsed and wildcard regexes re-compiled per request
  (`packages/hono/src/middleware/cors.ts:27,40`).

### T5 — HIGH: one worker, whole module graph = memory baseline, cold start, single failure domain

- The operator API app composes **27 modules + 7 extensions + 7 plugin bundles**
  (`starters/operator/src/api/composition.ts:132-170`); first `/api/*` call per isolate paid
  ~2.4s instantiating it (#1636). The lean-auth split + background warm-up
  (`packages/runtime-core/src/api-dispatch.ts:86-99`) mitigates but does not change the model:
  storefront reads, checkout writes, admin, SSR, and workflows still share one isolate's memory
  and one failure domain (#1686: catalog load took down auth + admin).
- Bundle work landed (#1631 → #1637, #1679: client entry 3.57→1.75 MB) — keep going, but
  tree-shaking can't fix "everything in one isolate".

### T6 — MEDIUM-HIGH: query-level inefficiencies and index gaps

- `listAndCount` = 2 roundtrips per list (`packages/db/src/crud.ts:136-145`); offset
  pagination throughout; `keysetPaginate` exists (`packages/db/src/queries/index.ts:15`) but has
  zero adopters.
- Soft-delete filter (`deletedAt IS NULL`) is AND-ed into every query (`crud.ts:99-109`) but
  **no main table has partial indexes** — only link tables do (`packages/core/src/links.ts:133`).
- `ILIKE '%x%'` searches on products/tags/categories/destination translations with no trigram
  indexes (`packages/products/src/service.ts`, `service-public.ts:86-102`).
- Aggregates are parallelized post-#1629 (good — e.g. `bookings/src/service.ts:2444-2513`) but
  still **live, uncached, recomputed per dashboard load**, and finance's outstanding/overdue
  scans lack covering indexes.

### T7 — RESOLVED: raw booking reservation write retired

The former raw reservation path and its serial per-item critical section were
removed. Booking creation now has one admitted Finance command and a
lease-gated Bookings settlement; holds are separate pre-booking operations.

### T8 — MEDIUM: no observability, no limits, no load proof

No per-request metrics (duration/db-time/query-count/memory), no tracing, no Analytics Engine
binding, no `statement_timeout`, no per-tenant rate limits (an unused rate-limit middleware
exists), no load tests. #1686 was diagnosed from the outside ("HTTP 000, redeploy fixes it").

## 3. Verdict on RFC #1687

The RFC's diagnosis and sequencing are **correct**. Adjustments for our actual platform:

1. **§5 "Hyperdrive"** → not available. Replacement strategy: neon-http as the default data
   plane (no handshake, Neon's proxy holds server-side pools) + Neon **pooled endpoint** for the
   remaining WebSocket flows + optional DO-held connection pool later if interactive-tx volume
   demands it.
2. **§3 Queues** → producers fine from tenant workers; consumers must live in a platform-level
   worker that dispatches back into the namespace, or a runtime-specific alarm/lease mechanism.
3. **§1 edge read models** → KV is the right default (matches `caching-architecture.md`), with
   versioned keys + Cache API in front; respect KV's 1 write/s/key by coalescing invalidations.
   D1 read replication is a candidate for query-shaped reads later, not the starting point.
4. Add one item the RFC undersells: **the latency geometry**. Each deployment's database lives
   in one region while Workers run everywhere, so any visitor far from that region pays
   RTT × query-count on live-DB paths. Edge read models fix the public path; **Smart
   Placement** (if available on WfP) or colo-pinning fixes the admin path almost for free.

## 4. The plan

Phases are ordered by leverage-per-risk. Each item is independently shippable and most are
package-delivered (per #1641: fixes must arrive via version bumps, not template ports).

> **Execution status (2026-06-12):** Phase 0 shipped in PR #1690. Phase 1 implemented on
> `perf/phase-1`: 1.1 (split data plane — neon-http default + per-surface transactional
> routing with `dbTransactional`/`dbTransactionalPaths` + `DB_FORCE_TRANSACTIONAL` escape
> hatch; transaction-reachability audit applied: catalog-authoring extension + bookings/crm/
> finance/availability/legal/notifications/transactions surfaces, storefront covered via the
> bookings public prefix, catalog booking-engine + trips via template paths),
> 1.2 (Better Auth cookieCache default-on + API-key KV cache), 1.3 (index migration 0061:
> trigram GIN for ILIKE columns, finance partial indexes, rollup btrees; bookings/products
> partial indexes N/A — no `deleted_at` on those tables; CRM `archived_at` is never queried —
> follow-up: wire archiving or drop the column), 1.4 (batched link lookups + queryGraph,
> batched product overlay resolution, grouped capacity counts), 1.5 partially (windowed
> single-roundtrip `listAndCount`; keyset ADOPTION deferred — cursor contracts need a
> coordinated client change). 1.6 (Smart Placement) still blocked on the platform question.
> **Phase 2 on `perf/phase-2`:** 2.1 transactional outbox SHIPPED (durable emit + event_outbox +
> visibility-timeout drain + dead-letter + operator */2min cron; migration 0062); 2.3 read
> replicas (DATABASE_URL_REPLICAS on the http client); 2.4 read-through TTL aggregate snapshots
> (warm dashboard ~29 queries → 5 PK reads); 2.5 booking hardening (snapshots resolved pre-tx,
> batched inserts in the locked section, checkout idempotency + Netopia callback dedup).
> 2.2 SHIPPED (perf/phase-2-read-models): KV document plane — product detail read-through (24h TTL,
> per-locale, exact invalidation via an admin-surface middleware, shared id-keyed doc behind a
> short-TTL slug mapping) + departures read-through (120s, TTL-bounded by design — checkout
> verifies live); Typesense remains the query plane (browse/search already serves cards from
> index documents, no Postgres). Repeat storefront reads now cost one KV get, zero DB queries.
> **Platform#458 SHIPPED** (voyant-cloud #460/#461/#462): dispatcher response cache honoring
> tenant `Cache-Control` (X-Cache exposed), per-plan dispatch CPU/subrequest limits
> (free 100ms/50 → scale unlimited), DISPATCH_METRICS AE dataset, publisher DO+migrations/AE/D1
> pass-through (un-breaking WORKFLOW_RUN_DO on cloud; AE datasets namespaced {org}_{env}_{name}),
> per-plan Neon endpoint tiers + explicit pooled URIs + DATABASE_URL_DIRECT (reserved, never
> reaches worker secrets). Remaining platform ops: backfill --apply, Node-runner DB env wiring,
> namespace logpush, Smart Placement test.
> **Phase 3 foundations (perf/phase-3-foundations):** 3.3 resilience primitives
> (@voyant-travel/utils/resilience: resilientFetch — 10s timeout, jittered idempotent-safe retries,
> per-isolate circuit breaker; adopted in plugin HTTP clients), 3.4 in-worker metrics middleware
> (env.METRICS AE dataset: method/route/surface/cache-status blobs, duration/status/db-query-count
> doubles — complements DISPATCH_METRICS), 3.5 read-only k6 suite
> (storefront-firehose, mixed + workflow_dispatch runner). The former
> booking-bootstrap write scenario was retired with the raw booking-create
> surface.
> **3.1 is DEFERRED to last resort** (see its row above). Remaining: namespace logpush + SLO
> alerts on the AE datasets, k6 staging baselines, CI load-test cadence — ops-side. Note: drizzle
> snapshot-chain poisoning by timestamp-named migration files was diagnosed and fixed (stale
> 20260609 snapshot removed, chain re-parented) — future `drizzle-kit generate` runs are clean.

### Phase 0 — Stop the bleeding (days; no architecture changes)

| # | Work item | Where | Effect |
|---|---|---|---|
| 0.0 | **Per-tier Neon endpoint policy at provisioning + make the pooler explicit.** Tenant computes are currently pinned at 1 CU fixed (verified live) — replace with a tier matrix: standard tenants get an autoscaling range (e.g. min 0.25–1 / max 2–4 CU) **keeping scale-to-zero on** (it's a deliberate cost feature for low-usage tenants; the few-hundred-ms first-query resume is acceptable, and once 0.1/2.2 land their storefront traffic doesn't wake the DB anyway); enterprise/high-traffic tenants get a higher range (min 1 / max 8 CU) with suspend disabled so spikes never start cold. Pass `pooled: true` explicitly when resolving tenant connection URIs instead of relying on Neon's response default. | voyant-cloud (`databases-access.ts`, `neon.ts:331-362`) | DB compute can actually scale under a spike (today 1 CU is a hard ceiling, bounding the server-side pool at ~377); small tenants keep their cost profile; pooled endpoint guaranteed by construction. |
| 0.1 | `Cache-Control: public, s-maxage=60–300, stale-while-revalidate` on all `/v1/public/*` GETs (opt-out per route), plus a cache middleware that uses the Cache API **where available** (self-hosted/non-namespaced workers) and falls back to a KV response cache on Voyant Cloud (`caches.default` is disabled in namespaced scripts). In parallel: Voyant Cloud's **dispatch worker** (verified: currently a thin router with zero caching for worker traffic, `apps/dispatcher/src/index.ts:205`) gains a cache step that honors tenant `Cache-Control` — the WfP-native design. | `@voyant-travel/hono` middleware + voyant-cloud dispatcher | Absorbs the #1686 read firehose at the edge |
| 0.2 | Trim list payloads: list = card fields only, richtext only on detail; enforce pagination caps (max `limit`, default 20) | products/catalog public routes | Memory per request ↓, bandwidth ↓ |
| 0.3 | **Single shared per-request DB client**: lazy `getDb()` on context; auth, requirePermission, and db middleware reuse it; one dispose | `@voyant-travel/hono` middleware | Halves Neon handshakes immediately |
| 0.4 | `statement_timeout` (e.g. 10s) + verify/enforce `-pooler` endpoint in connection-string validation | `@voyant-travel/db` | Slow query can't pin an isolate; protects Neon slots |
| 0.5 | Memoize CORS allowlist parse/regex per env value | `middleware/cors.ts` | Removes per-request CPU waste |
| 0.6 | Run event subscribers via `waitUntil` after response (opt-in flag per subscriber for the few that must complete in-request), parallelize independent handlers, add per-handler timeout | `@voyant-travel/hono` app + core events | Booking confirm stops waiting on SmartBill/CMS HTTP |

### Phase 1 — Request-path efficiency (1–2 weeks)

| # | Work item | Detail |
|---|---|---|
| 1.1 | **neon-http as the default data plane; transactions become explicit.** `createApp` db middleware provides an http-backed client (zero handshake, replica-capable). New `withTransactionalDb(env, fn)` opens a tightly-scoped WS client (pooled endpoint) only for flows that genuinely need interactive transactions, replacing the global adapter switch. Migrate the ~144 tx call sites mechanically; `requiresTransactionalDb` modules keep their guarantee. | Removes the WS handshake from ~95% of requests; unlocks read replicas (the serverless adapter throws on them today, `packages/db/src/index.ts:100`) |
| 1.2 | **Session/key caching.** Better Auth `cookieCache` (signed, ~5 min) for sessions; KV cache for API-key hash → metadata with short TTL + `waitUntil` revalidation; counters updated async (already are). | Eliminates the per-request auth DB roundtrip |
| 1.3 | **Index pass.** Partial indexes (`WHERE deleted_at IS NULL`) on the hot filter columns of bookings/products/crm/availability/invoices; trigram GIN for ILIKE search fields; covering indexes for finance aggregates (#1629 leftovers). Validate with `pg_stat_statements` / Neon slow-query data before/after. | Cuts scan cost as data volume grows |
| 1.4 | **Batch the known N+1s.** `LinkService.list` accepts `leftIds[]/rightIds[]` (one `IN` query) and `queryGraph` uses it; batch overlay resolution in `listResolvedProducts`; parallelize the 2 sequential queries in card projection; collapse per-resource COUNTs into one grouped query. | Latency ↓ and subrequest budget protected |
| 1.5 | Keyset pagination on public + high-volume admin lists (helper exists, adopt it); single-roundtrip `listAndCount` via `count(*) OVER()` where worth it. | Deep-page cost ↓, one roundtrip per list |
| 1.6 | Evaluate **Smart Placement** for the admin/API worker (many sequential subrequests to a single DB origin = its exact use case), pending WfP support. | Admin latency for operators far from their DB region ↓ multiplicatively |

### Phase 2 — Read/write separation foundations (2–6 weeks)

| # | Work item | Detail |
|---|---|---|
| 2.1 | **Transactional outbox.** `event_outbox` table written in the same transaction as the domain write; `emit` becomes "insert outbox row(s) + best-effort immediate drain via `waitUntil`"; a drain loop delivers to subscribers/workflow ingest with retries, per-event idempotency (stable event IDs already exist in the orchestrator driver), and dead-lettering. Drain trigger, best-first: the Node runtime with `LISTEN/NOTIFY` on the direct connection (2.6 — push-based, near-real-time); runtime-specific alarms where available; platform scheduler-dispatch loop (already running for workflow schedules) as the lowest-dependency fallback. | Events become durable; subscribers become genuinely async; crash ≠ silent loss. This is the keystone for everything async. |
| 2.2 | **Materialized storefront read models — Typesense = query plane, KV = document plane.** On catalog/pricing/availability change events (via 2.1), one projection pipeline feeds both: reindex the Typesense document (browse/filter/facet/sort already serves cards straight from hit documents, no DB) and write render-ready, per-locale KV documents — detail docs, departure lists, cached lowest prices (versioned keys; coalesce writes per key). Public read endpoints serve Typesense/KV-first with the dispatcher cache in front; **zero Postgres on the storefront hot path**. Live-freshness data (checkout-time availability) stays on the transactional path — the read model carries hints only. | The "1M-user payday read path". DB load becomes writes + admin only. |
| 2.3 | **Read replicas.** Neon read replica(s) + `withReplicas` routing for GET surfaces and aggregates (enabled by 1.1's http default — the edge adapter already supports replicas today; only the WS adapter throws). Note: Neon replicas are same-region — they add read throughput/isolation (reporting can't starve the primary), not geo-latency relief; geography is solved by 2.2. | Headroom for admin/reporting reads |
| 2.4 | **Aggregates precomputed.** Dashboard aggregates materialized on write events (or 60s scheduled refresh) into a small table/KV; endpoints serve the snapshot with `Cache-Control`. | Dashboard becomes O(1) reads (#1629 finishing move) |
| 2.5 | **Booking write hardening.** Shorten the locked critical section (resolve snapshots before the tx, batch inserts); uniform idempotency keys on checkout + payment webhooks (find-or-attach); per-slot contention test. | Spike-safe writes without architecture change |
| 2.6 | **Dual connection strings + a Node execution lane for heavy transactional work.** Voyant Cloud already runs a Node runtime per deployment for hosted workflow execution. Provision two secrets per tenant: `DATABASE_URL` (pooled — CF workers, http driver) and `DATABASE_URL_DIRECT` (direct — Node only). The Node side keeps a warm long-lived `pg.Pool` (the `node` adapter in `createDbClient` already supports this incl. replicas), runs interactive transactions with zero per-request handshake, and gets the session-level features the pooler forbids — notably **`LISTEN/NOTIFY`** (near-real-time outbox drain instead of polling), advisory locks, and migration sessions. Co-locate the Cloud Run region with the tenant's Neon region so multi-statement transactions run at sub-ms RTT. Division of labor: CF keeps short interactive request-path transactions (WS + pooler, per 1.1); Node hosts the outbox drain, long sagas (refunds), bulk reindex/imports, and — when 3.2 lands — the queued booking processor. **Anti-goal: do not put Node as a synchronous RPC hop on the interactive request path**; that adds a failure-domain coupling and latency for flows CF handles fine. Cap Node pool size × max instances against the direct endpoint's `max_connections`. | Heavy transactional work runs next to the data on warm connections; outbox delivery becomes push-based; CF workers stay thin |

### Phase 3 — Decomposition, resilience, proof (strategic, 1–2 quarters)

| # | Work item | Detail |
|---|---|---|
| 3.1 | **Bounded-context workers — DEFERRED, last-resort by decision (2026-06-12).** Phases 0–2 removed the pressures this was designed for: public reads no longer enter the isolate (dispatcher cache + KV read models), payloads/timeouts bound memory, per-plan dispatch limits give budget isolation, and the lean-auth split already covers cold-start's worst case. Decomposition's underweighted cost: event subscribers live per-worker, so the outbox drain needs the full subscriber graph — the "small" workers either pull the graph back in or stop being independent failure domains for the write path. **Revisit only when metrics say so**: sustained isolate memory pressure or cold-start p95 visibly limiting a real tenant in DISPATCH_METRICS / the in-worker AE dataset / k6 baselines — and then start with the smallest cut (a public-read script) justified by that data. | Avoided: multi-script publisher+dispatcher routing complexity, deploy version skew, subscriber-graph duplication |
| 3.2 | **Queued write pipeline for spikes.** Booking/payment intents enqueued via outbox table or platform queue → platform-level consumer dispatching back into the namespace (Voyant Cloud already runs this exact pattern for webhook delivery and workflow schedules — extend it, don't invent it); controlled concurrency; idempotent processing; backpressure returns 202 + status polling instead of thundering herd. The per-slot DO serialization pattern is the escalation path for ultra-hot inventory (requires publisher DO-binding support). Pair with **per-dispatch CPU/subrequest limits** — available in WfP, currently unused (`dispatcher/src/index.ts:205` calls `namespace.get()` without limits) — as the platform-level bulkhead. | Payday spike survives by design |
| 3.3 | **Resilience primitives in the platform client.** `@voyant-travel` fetch/client defaults: timeouts, retry+jitter, circuit breaker, bulkhead config; per-subscriber timeouts (from 0.6) hardened into contract. | Slow dependency degrades, never cascades |
| 3.4 | **Observability as a primitive.** Per-request structured metrics (duration, db time, query count, payload size) → Analytics Engine (supported on WfP user workers, but the build publisher must learn to emit the binding); platform fleet view via logpush/tail worker configured once on the dispatcher — covers every user worker in the namespace (none configured today); request-id tracing across worker hops; SLOs + alerts; Neon `pg_stat_statements` review cadence. | We can see the next #1686 before users do |
| 3.5 | **Load testing in CI.** k6 scenario suite: storefront firehose (read), payday spike (write), mixed; run against a staging tenant per release; assert SLO budgets. *Delivered:* `scripts/load/` (see its README) + `.github/workflows/load-test.yml` (`workflow_dispatch`, threshold breach fails the job). | The "enterprise-ready" claim becomes a regression test |

## 5. Target end-state (one paragraph)

Storefront reads are served from edge KV/Cache projections materialized by the outbox-driven
event pipeline — no Postgres, no big module graph, effectively unlimited read scale. Writes go
to a small transactional worker with explicit, tightly-scoped WS transactions against Neon's
pooled endpoint, idempotent and queue-buffered under spikes. The admin worker keeps the rich
module graph (placed near the DB) with cached auth and replica-routed reads. Events are durable
rows, drained asynchronously with retries; third-party sync can never block or lose data. Every
worker emits metrics, every dependency call has a timeout and breaker, and a CI load suite
proves the payday scenario each release.

## 6. Acceptance metrics

| Metric | Today (observed/derived) | Target |
|---|---|---|
| Public catalog read p95 (edge) | live DB path, collapses under load (#1686) | < 50ms, 0 DB queries, survives 10k RPS |
| Authenticated admin API p95 | ~860ms warm (#1636 data) | < 250ms warm |
| First API call per isolate | ~3.2s (#1636) | < 800ms |
| Booking confirm p95 | 1s+ (tx + serial subscribers) | < 400ms, subscribers async |
| Neon connections per request | 2–3 WS pools | 0 (http) on reads; ≤1 short-lived WS on tx writes |
| Tenant DB compute under spike | 1 CU fixed for all tenants | per-tier autoscaling range; always-on only for enterprise tier (Phase 0.0) |
| Event durability | in-memory, lossy | outbox, at-least-once + idempotent |
| Isolate OOM incidents | recurring under storefront load | zero; memory metric alerting in place |

## 7. Open verification items

Most platform questions were resolved by auditing the WfP docs and the voyant-cloud source
(see §1). Still open:

1. **Smart Placement on dispatch-namespace user workers** — not covered by WfP docs, not
   attempted by the publisher. Affects 1.6 only; test empirically via script metadata.
2. ~~Confirm production `DATABASE_URL`s use the pooled endpoint~~ — **resolved: they do**
   (verified against the live tenant project), but only via Neon's response default — Phase 0.0
   makes it explicit. Remaining: capture Neon connection-count + slow-query baselines per
   tenant before/after 0.0 (Neon MCP/dashboard).
3. Measure the operator server bundle + instantiation cost on `main` (post-#1679) to baseline
   Phase 3.1 wins.
4. ~~Decide KV vs D1-with-read-replication for read models~~ — **resolved: KV; D1 rejected.**
   The storefront has only two access shapes, and both are covered without D1: query-shaped
   access (browse/filter/facet/sort) is Typesense's job and already works DB-free — the search
   route projects cards straight from hit documents
   (`packages/catalog/src/search/routes.ts:243`); key-shaped access (detail by slug+locale,
   departures by productId) is KV's sweet spot. D1 would add a third synchronized data copy
   (Postgres → Typesense → D1) with a strictly weaker query engine and no new capability.
   Resulting split: **Typesense = query plane, KV = document plane**, one outbox-driven
   projection pipeline feeding both. Consequence: Typesense becomes load-bearing on the
   storefront hot path — it needs Phase 3.3 resilience (timeouts, breaker), HA sizing, and
   short dispatcher-level caching of popular search responses. Revisit D1 only if a genuinely
   relational edge query appears that fits neither plane (none known).
5. **Build-publisher binding gap** (`apps/build-publisher/src/index.ts:236-253`): add
   `durable_objects` + migrations, Analytics Engine, and D1 emission. Prerequisite for the
   operator workflow DO on cloud, and for Phases 2.1 (DO-alarm drain), 3.2 (per-slot DO), 3.4
   (AE metrics). Worth confirming whether any cloud tenant currently exercises
   `WORKFLOW_RUN_DO` — if so, how it works without the binding; if not, it's silently broken.
