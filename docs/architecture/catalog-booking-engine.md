# Catalog Booking Engine

Status: draft / proposal - sits on top of the Phase 1 foundation. Commitment
points are governed by
[ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md).
Audience: anyone designing or implementing the cross-vertical booking lifecycle for the catalog plane.

This document describes the **booking engine** that runs on top of the Phase 1 catalog foundation defined in [`catalog-architecture.md`](./catalog-architecture.md). The booking engine is the "live" layer that turns a row in the indexer (or in an adapter's upstream system) into a confirmed reservation with a frozen snapshot, mirroring the pattern already established for the flights vertical in [`catalog-flights-architecture.md`](./catalog-flights-architecture.md).

The booking engine is **vertical-agnostic**. The same Quote / Hold / Commit /
Cancel lifecycle works for products, extras, cruises, charters, and
accommodations, dispatching to the right adapter based on the catalog row's
provenance. Owned inventory (`source.kind: "owned"`) flows through each module's
own service layer; sourced inventory (`source.kind: "voyant-connect"`,
`"direct:*"`, `"bedbank:*"`, `"gds:*"`, `"demo"`) flows through a registered
`SourceAdapter` instance. Legacy `bookEntity` surfaces map to Commit semantics:
they must not create a Booking before ADR-0019 authorizes the commitment point.

## 1. Phase relationship

**Prerequisites** (must be live before this layer lands):

- Phase 1 catalog foundation: `SourceAdapter` contract (§5.6), provenance shape (§5.1), snapshot graph (§5.3), webhooks (§5.8).
- The five existing verticals have adopted Phase 1's contract (`products`, `cruises`, `accommodations`, `charters`, `extras`).
- The `supplierId` and `source.kind` indexed fields ship on each vertical so the indexer hits already carry enough to dispatch a quote/book.

**This layer preserves:**

- The flights booking engine (`packages/flights`) — that pattern is preserved verbatim. The cross-vertical booking engine here is a sibling, not a replacement. Flights' `searchFlights` / `bookFlight` shape stays specialized because flights' search request shape (slices, passengers, cabin) doesn't generalize cleanly across the rest of the catalog.
- The `SourceAdapter` boundary as the only upstream-facing seam. Booking writes use `reserve` / `cancel`; authoritative reads use the optional `getReservation` / `listReservations` retrieval methods when an adapter declares `supportsReservationRetrieval`.

**What this layer adds:**

- `packages/catalog/src/booking-engine/` — the orchestration: `SourceAdapterRegistry`, `quoteEntity`, `bookEntity`, `cancelEntity`, `getOrder`, `listOrders`. Vertical-agnostic.
- `packages/catalog-demo-adapter` — a reference `SourceAdapter` implementation that serves as the integration test fixture and the operator's demo source. Backs its inventory and its orders in its own Postgres tables.
- HTTP routes mounted by templates that opt in: `POST /v1/admin/catalog/quote`, `POST /v1/admin/catalog/book`, `POST /v1/admin/catalog/orders/:id/cancel`, `GET /v1/admin/catalog/orders`, `GET /v1/admin/catalog/orders/:id`.

## 2. Why a layer on top of `SourceAdapter`

The Phase 1 foundation already declares the seam: any external feed becomes a `SourceAdapter` instance, the catalog plane projects its inventory into the indexer, and `reserve` / `cancel` calls flow back to the upstream source. What's missing is the **application-level lifecycle** that makes that seam clickable from the operator UI:

- **Owned-vs-sourced dispatch.** Today every catalog row carries `source.kind`, but no service code path branches on it. The booking engine is the first cross-cutting consumer of that field.
- **Quote step.** `liveResolve` returns volatile-live values; the engine wraps it as a "is this row still bookable, and at what price?" call with a TTL that the UI can rely on.
- **Snapshot capture at book.** The catalog plane has `captureSnapshot` / `captureSnapshotGraph`, but no production caller for sourced inventory yet — flights snapshot their own way through `packages/flights/src/snapshot.ts`. The booking engine wires the generic snapshot pipeline so every sourced book lands a snapshot row deterministically.
- **First-class orders surface.** Today, owned bookings live in `packages/bookings`; sourced flight bookings live in `packages/flights`'s `FlightOrder` model; sourced everything-else has nowhere to live. The booking engine reuses `packages/bookings` as the shared parent (so an itinerary can mix owned and sourced rows) and stamps the source pointer on each line item.

The engine is intentionally a thin coordinator. It contains no transport logic, no inventory specifics, and no per-vertical assumptions — those live in the adapter and the vertical's service-catalog-plane.

## 3. The lifecycle

### 3.1. `quoteEntity`

```ts
quoteEntity(ctx, { entityModule, entityId, parameters }) → {
  quoteId,
  quotedAt,
  expiresAt,
  pricing: PricingBasis,
  available: boolean,
  invalidReason?: string,
  upstreamPayload?: unknown,
}
```

Owned rows: pull the resolved view via the vertical's `getResolvedXxxById` and compute `pricing` from configured defaults (`sellAmountCents` + `sellCurrency`). Always available unless the row is archived/inactive.

Sourced rows: dispatch by `source.kind` to the registered adapter and call `liveResolve({ ids: [entityId], scope, parameters })`. The adapter's response populates `pricing` and `available`. Stash the upstream payload so the subsequent `bookEntity` call can re-use it without a round trip if the adapter accepts a quote token.

Quotes are short-lived (default TTL: 10 minutes) and persisted in `catalog_quotes` so the booking engine can validate the same quote at book time and reject expired quotes.

### 3.2. Commit (`bookEntity` compatibility surface)

```ts
bookEntity(ctx, {
  bookingId,             // existing or newly-created bookings row
  entityModule,
  entityId,
  quoteId?,              // when present, must be unexpired and match the entity
  party,                 // customer / passenger identity
  paymentIntent,         // hold | card | ticket_on_credit (mirrors flights)
}) → {
  orderRef,              // adapter's upstream id for sourced; bookingId for owned
  status: "held" | "confirmed" | "ticketed" | "failed",
  snapshotId,            // booking_catalog_snapshot row written
  pricing: PricingBasis, // final pricing at commit
}
```

Owned rows: re-validate the exact Booking Session revision, validate the
immutable Quote bound to that revision, validate a live Hold when required,
establish any required payment guarantee, call into the vertical's existing
booking-creation path (`packages/bookings` services), convert the Hold to an
Allocation, consume the Session and Quote, and capture the snapshot via
`captureSnapshot` in one transaction. `orderRef` equals `bookingId`; status is
`confirmed`.

Sourced rows: validate the Quote, persist the Commit/Supplier Operation intent
before dispatch, then call
`adapter.reserve({ entity_module, entity_id, parameters, party, payment_intent })`.
Default supplier-first policy creates no Booking while the supplier operation is
pending or in doubt. Once the supplier is secured, capture `captureSnapshot` with
`frozenPayload = { resolvedView, upstreamPayload, pricing }` and
`sourceRef = result.upstream_ref`, then create the Booking with the upstream ref
as provenance. An explicit operator-backed policy may create the Booking earlier
only when the operator deliberately assumes fulfillment risk.

Both branches use the same typed outcome vocabulary from
`@voyant-travel/catalog-contracts/booking-engine/lifecycle-conformance`. The
caller does not infer commitment from draft Booking statuses, payment state, or
supplier status strings.

### 3.2.1. Owned Product v1 tracer implementation

The first Booking Platform v1 runtime slice is the owned Product tracer:

```text
Product -> Booking Session -> exact-revision Quote -> real-capacity Hold -> Commit -> Booking + Allocation
```

It lives in `@voyant-travel/catalog/booking-engine` as a transport-neutral
Booking Session module. The module owns Session, Quote, Hold, and Commit
orchestration and calls a deployment-supplied owned-commit port for the single
transaction that creates exactly one confirmed Booking and one or more
Allocations. Anonymous public and authenticated staff route adapters mount the
same module under `/v1/{public,admin}/catalog/booking-sessions`; the route layer
only validates input, resolves the module, and serializes the typed outcome.
Deployments use `createDrizzleBookingSessionRepository` for the Session/Quote/
Hold/Commit tables and provide vertical-specific pricing, real-capacity Hold,
and Booking+Allocation commit ports.

The canonical persistence shape is:

- `booking_sessions` with `bses` TypeID identity, semantic Product/Catalog Item
  target, absolute expiry, lifecycle state, and optimistic revision.
- `booking_session_quotes` with `bsqu` identity, immutable price and terms for
  exactly one Session revision, expiry, fingerprint, and supersession state.
- `booking_session_holds` with `bshd` identity, Session-owned inventory target,
  quantity, absolute expiry, and conversion state.
- `booking_session_commits` with `bscm` identity and a unique
  `(session_id, idempotency_key)` replay record.

Creating or abandoning a Booking Session does not create a Booking, booking
number, Booking Item, Allocation, or reporting row. A Commit that requires
payment may create a Finance Payment Session targeted at the Booking Session;
that pre-Booking payment attempt is not a Booking or a draft Booking. Updating
price-relevant state increments the Session revision and supersedes active
Quotes. Commit rejects stale revisions, expired/superseded Quotes, expired or
mismatched Holds, and different server-recomputed prices. Stable idempotency
keys replay the original Commit result; a different key after consumption is
rejected rather than creating another Booking.
Anonymous Sessions return a capability once at creation. Public update, Quote,
Hold, Commit, and Commit replay calls must present that capability; staff
adapters use the same module without a public capability token.

The dependency-light Storefront contract is exported from
`@voyant-travel/catalog-contracts/booking-engine/session-contracts`. The
reference SDK and React hook are exported from `@voyant-travel/storefront-sdk`
and `@voyant-travel/storefront-react`; they hide the route sequence while
preserving returned revision, capability, Quote, Hold, and stable idempotency
semantics.

#### Payment-required Commit continuation

The owned Product tracer resolves the effective customer payment policy from
server-owned listing, category, supplier, and operator settings. When money is
due at Commit, Finance creates or reuses an idempotent Payment Session targeted
at the Booking Session and Catalog returns `payment_required`. The Session,
Quote, and Hold remain live only until their existing expiries; initiating a
payment does not silently extend spend authority.

Provider redirects, delayed callbacks, duplicate callbacks, failures, and
customer retries update the Finance Payment Session through the selected
payment adapter. Storefront and authenticated callers resume by invoking the
same typed Commit operation again. While payment remains pending, Commit
creates no Booking. Once the Payment Session is `authorized` or `paid`, Commit
creates the Booking exactly once and retargets the Payment Session—and its
authorization—to that Booking inside the root PostgreSQL transaction. If the
transaction rolls back, both the Booking graph and payment transfer roll back.

Session expiry or abandonment releases the Hold and expires pending payment
attempts. An already captured payment is retained against the terminal Booking
Session for explicit reconciliation; it is never rewritten as unpaid or used
to fabricate a Booking after spend authority expires. Booking lifecycle status
continues to describe the travel commitment, never the payment state.

### 3.3. `cancelEntity`

```ts
cancelEntity(ctx, { bookingId, entityModule, entityId, reason? }) → {
  status: "cancelled" | "refused" | "failed",
  refundAmount?: number,
  refundCurrency?: string,
}
```

Looks up the snapshot row, dispatches by `source_kind`. Owned: marks the booking entry cancelled in `packages/bookings`. Sourced: calls `adapter.cancel({ upstream_ref, reason })`. Either way, the snapshot stays — it's the audit record — and a `catalog.booking.cancelled` webhook fires.

### 3.4. `getReservation` / `listReservations`

`reserve` creates the local booking row and stamps the upstream reference from
`ReserveResult.upstream_ref`. After that, the local booking and snapshot remain
the durable audit surface. Drift events push asynchronous upstream status
changes back into downstream projections and operator state.

When the local view is disputed, incomplete, or being attached for the first
time, the adapter can expose authoritative pull reads:

```ts
adapter.getReservation(ctx, { upstream_ref, scope? }) → {
  upstream_ref,
  status,
  source_updated_at?,
  upstream_payload?,
} | null

adapter.listReservations(ctx, {
  cursor?,
  limit?,
  status?,
  updated_after?,
  scope?,
}) → { reservations, next_cursor }
```

`getReservation` is the point lookup for audit, support, and dispute
resolution. It returns `null` when the supplier cannot find the upstream
reference; transport and authentication errors reject normally.

`listReservations` is the bulk and incremental sync entry point for first-time
supplier attach and reconciliation jobs. `cursor` is for pagination;
`updated_after` is the explicit checkpoint for "show me reservations modified
since this instant." The framework does not mirror the supplier's full booking
record into local tables. `upstream_payload` is opaque round-trip data; verticals
or templates project only the fields they need into local state.

Reservation retrieval is optional and capability-gated by
`AdapterCapabilities.supportsReservationRetrieval`. Existing adapters that only
support write forwarding compile unchanged.

### 3.5. `getOrder` / `listOrders`

Reads the `booking_catalog_snapshot` rows joined to `bookings` and the per-vertical line items. The engine doesn't introduce a new "orders" table — `bookings` is already that table. The engine just exposes the cross-vertical view.

## 4. The `SourceAdapterRegistry`

A process-local registry keyed by `source.kind` (and optionally `source_provider`). Templates register the adapters they want at startup:

```ts
const registry = createSourceAdapterRegistry()
registry.register(demoAdapter())                    // source.kind: "demo"
registry.register(voyantConnectAdapter({ ... }))    // source.kind: "voyant-connect"
registry.register(hotelbedsAdapter({ ... }))        // source.kind: "bedbank:hotelbeds"
```

The booking engine's `quoteEntity` / `bookEntity` / `cancelEntity` look up `registry.resolveFor(sourceKind)` and call into the adapter. If no adapter is registered for the row's source kind, the call fails with `NO_ADAPTER_REGISTERED` (a stable error code analogous to `CAPABILITY_NOT_SUPPORTED`).

The registry is intentionally not a dependency-injection container — it's a `Map<string, SourceAdapter>` with a fluent API. Adapters that need credentials, HTTP clients, or DB handles get them through their constructor; the registry just stores the wired instances.

## 5. Standalone contract fixture

The demo API is a standalone upstream simulator for contract and integration tests. It is not a package, plugin, standard product dependency, or Operator runtime option. Operator starters ship **zero demo state and zero demo wiring**.

### 5.1. `apps/catalog-demo-api` — standalone upstream simulator

Hono Node service with its own Postgres. Owns:

- Two tables: `catalog_demo_inventory` (rows the upstream "publishes") and `catalog_demo_orders` (reservations the upstream tracks).
- REST endpoints mirroring `SourceAdapter` 1:1 — `POST /discover`, `POST /live-resolve`, `POST /reserve`, `POST /cancel`, plus admin surfaces (`GET /inventory`, `POST /inventory/seed`, `GET /orders/:id`, `GET /health`).
- Auto-seed on first boot when `AUTO_SEED=true` so the booking lifecycle is clickable immediately.
- Bundled `docker-compose.yml` for a self-contained Postgres on host port `5437`. Database is fully isolated from the operator's `DATABASE_URL`.

The service is launched separately (`pnpm -F catalog-demo-api dev`) and listens on `:3330` by default. A real upstream (TUI's API, Voyant Connect's edge) plays the same role — it just happens to live in a different repo and run on different infrastructure. The contract is the same.

### 5.2. Why the fixture stays separate

Three reasons the demo is structured this way rather than embedded in the operator starter:

1. **Adapter authors get a target.** The service models a network-owned upstream without sharing Operator database state.
2. **Starters stay clean.** Demo schemas, configuration, dependencies, and runtime ports never enter production composition.
3. **The contract gets exercised over the wire.** Integration tests can verify timeouts, partial responses, and JSON parsing against real HTTP.

Tests that need the upstream simulator may start the app and construct a test-local client. Production packages must not depend on it.

## 6. Owned-vs-sourced: why this isn't a special case

A reasonable instinct is to treat owned inventory as the primary code path and sourced inventory as the "external" branch. The booking engine deliberately doesn't:

- Owned inventory is just a row whose `source.kind = "owned"` and whose `liveResolve` / `reserve` / `cancel` are implemented by an internal "owned adapter" (or directly by the engine bypassing the adapter call). The lifecycle is identical from the caller's perspective.
- Today's "owned" path runs through `packages/bookings` plus the vertical's own service layer. Tomorrow's "owned" path may add a Voyant-Connect-published copy of the same inventory at another operator. The booking engine should not have to grow a new code path when that happens; it just sees a different `source.kind`.
- The snapshot row, the webhook payload, and the audit shape are identical for owned vs. sourced. The only difference is which arm of the dispatch ran — and that's traceable through `source.kind` on the snapshot.

This mirrors flights, where there is no "owned flight" code path — every flight goes through an adapter. The cross-vertical booking engine takes the same shape, except the dispatch can fall through to an internal "owned" arm when no external adapter is involved.

## 7. Package layout

```
packages/catalog/src/booking-engine/
  registry.ts                    SourceAdapterRegistry
  quote.ts                       quoteEntity (owned/sourced dispatch)
  book.ts                        bookEntity (owned/sourced dispatch + snapshot capture)
  cancel.ts                      cancelEntity (owned/sourced dispatch)
  orders.ts                      getOrder / listOrders (read-side)
  schema.ts                      catalog_quotes table
  errors.ts                      NO_ADAPTER_REGISTERED, QUOTE_EXPIRED, etc.
  index.ts                       exports

apps/catalog-demo-api/           standalone upstream simulator
  src/schema.ts                  catalog_demo_inventory + catalog_demo_orders
  src/store.ts                   DB ops
  src/seed.ts                    default 3-row inventory + seedInventory()
  src/routes.ts                  REST mirroring SourceAdapter
  src/app.ts                     Hono app
  src/index.ts                   bootstrap (auto-seed + HTTP server)
  scripts/migrate.ts             apply drizzle migrations
  drizzle.config.ts              points at its own DB
  docker-compose.yml             self-contained Postgres on :5437
  .env.example
  README.md
```

Selected connector packages provide booking-engine adapters through the graph. If no selected connector provides an adapter for a sourced row, the booking engine reports `NO_ADAPTER_REGISTERED`.

## 8. Open questions

1. **Owned-arm packaging.** Should the engine expose a built-in "owned adapter" for each vertical, or should it dispatch directly to the vertical's service layer when `source.kind === "owned"`? Lean toward direct dispatch for now (avoids a layer of indirection); revisit if templates start needing to swap out the owned path.
2. **Quote persistence vs. signed tokens.** Persisting quotes in `catalog_quotes` is simple but adds a write per quote; signed JWT-style quote tokens skip the write but complicate cross-pod expiration. Lean toward persisted quotes for MVP — write volume is low (one per book attempt, not one per page view) and the audit trail is useful.
3. **Multi-line bookings.** A package booking with a flight + hotel + extras hits multiple verticals (some sourced, some owned). The engine's `bookEntity` is single-entity; the multi-line orchestrator (analogous to flights' multi-passenger order) is deferred until the tracer is end-to-end on a single line.
4. **Idempotency keys.** Commit accepts an idempotency key. A replay returns the
   original typed result and must not create a second Booking, Allocation, or
   Supplier Operation.

## 9. Tracer rollout

The first real implementation is scoped to:

- **Products vertical only.** Cruises / charters / accommodations / extras are the next steps once the tracer ships.
- **Demo adapter only.** Voyant Connect, GDS, bedbank adapters come from external implementers later.
- **Single-line bookings.** Composite packages are deferred.
- **`paymentIntent: { type: "hold" }` only.** Card / ticket-on-credit come once a payment provider is wired (separate concern, see [`payments-architecture.md`](./payments-architecture.md)).

Once that tracer is clickable end-to-end (an operator can open the Catalog page, find a `source = Demo` product, click "Quote", click "Book", see the order in the bookings list, click "Cancel"), the same code path is duplicated for the other verticals and the same orchestration is reused for non-demo adapters.

## 10. Glossary

- **Booking engine** — the cross-vertical lifecycle layer (`quoteEntity`, `bookEntity`, `cancelEntity`) that sits on top of the `SourceAdapter` contract.
- **Owned inventory** — a catalog row with `source.kind: "owned"`. Lives in the operator's own DB; the engine dispatches the lifecycle to the vertical's local service layer.
- **Sourced inventory** — a catalog row with any non-`owned` `source.kind`. The engine dispatches the lifecycle to the registered `SourceAdapter` for that kind.
- **Demo adapter** — `@voyant-travel/catalog-demo-adapter`, the reference `SourceAdapter` implementation. Backs its data in its own Postgres tables. Operator starter registers it for the demo flow.
- **`SourceAdapterRegistry`** — process-local map keyed by `source.kind` that the engine consults to find the right adapter for a given row.
- **Commit** — the policy-governed operation that may create a Booking. Owned
  inventory defaults to atomic Hold-to-Allocation conversion. Sourced inventory
  defaults to supplier-first and creates no Booking until supplier security,
  unless an explicit operator-backed policy accepts fulfillment risk.
- **`NO_ADAPTER_REGISTERED`** — stable error code returned when the engine encounters a `source.kind` with no registered adapter. Analogous to `CAPABILITY_NOT_SUPPORTED`.

## 11. Related documents

- [`catalog-architecture.md`](./catalog-architecture.md) — the Phase 1 foundation. The engine depends on its `SourceAdapter` contract, snapshot graph, provenance shape, and webhook taxonomy.
- [`catalog-flights-architecture.md`](./catalog-flights-architecture.md) — the flight-vertical-specific booking engine. The cross-vertical engine in this document is its sibling, not its replacement.
- [`payments-architecture.md`](./payments-architecture.md) — payment flow. The booking engine's `paymentIntent` parameter is the seam.
