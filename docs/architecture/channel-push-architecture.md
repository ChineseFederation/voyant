# Channel push — architecture

Status: draft / proposal — pre-implementation
Audience: anyone designing the outbound supplier integration that pushes booking commits, availability changes, and content updates from Voyant to upstream channels (TUI, Voyant Connect peers, GDS, OTAs).

## Job-host migration note

The execution terminology and wiring in this document are superseded by
`workflow-product-removal-rfc.md`: channel push now uses package-owned,
payload-free jobs over `channel_booking_links` and the availability/content
intent tables. Subscribers only persist those records. Fixed drain and
reconciler jobs use renewable, owner-guarded database leases for cross-instance
exclusion and scheduled recovery; adapter idempotency keys and
`webhook_deliveries` remain the per-attempt durability/diagnostic boundary.
There is no customer-authored workflow or invocation payload in this path.

This document specifies the **outbound** direction of supplier integration. Inbound — adapters fetching catalog projections, prices, and content from upstream — is covered in [`catalog-architecture.md`](./catalog-architecture.md) and [`catalog-sourced-content.md`](./catalog-sourced-content.md). Channel push is the inverse: when something happens on Voyant (booking commits, inventory changes, content edits), push that change to one or more upstream channels.

This is **v1 scope**, not future. Real deployments need to integrate with TUI, Voyant Connect peers, and similar systems where Voyant must keep upstream in sync — otherwise inventory double-books and customer support implodes.

## 1. Three flows worth distinguishing

Channel push is not one operation. Three distinct flows share the term:

1. **Booking push** — a customer commits a booking on Voyant; we push the booking to one or more upstream channels so they know that inventory is allocated.
2. **Availability push** — an owned product's slot remaining-pax changes (booking, cancellation, manual operator update); we push the new availability to channels that resell our inventory.
3. **Content push** — operator edits an owned product's content (description, photos, itinerary); we push the new content to channels for them to display.

Each has different semantics:
- Booking push is **per-booking**, transactional, must succeed (or the operator manually intervenes).
- Availability push is **per-slot-change**, frequent, idempotent on (slot, remainingPax), eventually-consistent.
- Content push is **per-product-edit**, infrequent, idempotent on the product version.

The three should share an adapter contract but should NOT share a code path — different retry/error semantics.

## 2. Existing primitives we compose

Per the booking-journey doc's "reuse before add" rule:

- **`SourceAdapter`** — already used for inbound. Extending it for outbound is the obvious move; the same connection holds credentials for both directions.
- **EventBus** — `packages/core/src/events.ts`. **In-process, sequential, fire-and-forget, non-durable** by explicit policy ([`event-delivery-and-durable-execution-policy.md`](./event-delivery-and-durable-execution-policy.md): "Do not describe the current event bus as a queue, a durable stream, or a reliable delivery mechanism"). `EventBus.emit` awaits each handler in turn, so handlers that do real work (HTTP, retries) BLOCK the emitter. Channel push subscribers MUST NOT do HTTP work directly — they write durable intent rows and return immediately (§4.5). `booking.confirmed` exists today (`packages/bookings/src/service.ts:2364`) but its payload is minimal: `{ bookingId, bookingNumber, actorId }`. Channel push subscribers re-fetch booking state from the row — they don't trust event payloads to carry it.
- **Package job runtime** — channel-push jobs claim domain-owned durable intent rows. Retries and recovery derive from those rows rather than generic run state.
- **`webhook_subscriptions`** (already exists, `packages/db/src/schema/infra/webhook_subscriptions.ts`) — control-plane configuration for outbound webhook subscriptions: URL, events, secret, max retries, failure count. **`webhook_deliveries`** does NOT exist yet (the typeid prefix `whde` is reserved but no table backs it). Channel push is the first concrete consumer that needs an outbound delivery log, so we build it now as part of this work — see §11. It's designed to be a generic primitive (any module making outbound HTTP calls writes to it for observability + retry-chain history), not channel-specific. Distinct from `channel_webhook_events` (which logs events received **from** channels — inbound, opposite direction).
- **`packages/distribution`** — **the home for channel push.** Already ships:
  - `channels` (kind, status, metadata) and `channel_contracts` (per-channel commercial terms)
  - `channel_product_mappings` (id, channelId, productId, externalProductId, externalRateId, externalCategoryId, active)
  - `channel_booking_links` (id, channelId, bookingId, externalBookingId, externalReference, externalStatus, lastSyncedAt)
  - `channel_webhook_events` (inbound side: events received from channels)
  - `channel_commission_rules`, `channel_inventory_allotments`, `channel_reconciliation_items`
  - `distributionBookingExtension` ApiExtension — the canonical "extend bookings without bookings depending on us" pattern (matches `bookingProductExtension`, `bookingCrmExtension`, etc.)

  This means channel push is **net-new code over an existing module**, not a new module. Bookings and products stay clean of channel concepts; distribution depends on them via the established extension pattern.
- **Products' `external_refs`** — `packages/external-refs/` already models per-entity upstream identifiers. A complement to `channel_product_mappings` for cases where we identify a product across systems but don't actively syndicate it.

## 3. Adapter contract extension

`SourceAdapter` gains three optional outbound methods, mirroring the three flows:

```ts
export interface SourceAdapter {
  // ... existing inbound methods ...

  /**
   * Push a booking commit to the upstream channel. Called by the
   * booking-engine post-commit subscriber when a booking commits
   * against a product that's syndicated to this channel.
   *
   * Idempotent on `idempotency_key` — the engine generates a stable
   * key from (booking_id, channel_id) so retries don't double-push.
   *
   * Returns the upstream channel's reference id, which the engine
   * stores in `channel_booking_links` (in distribution) for subsequent
   * ops (modify, cancel) against the same upstream booking.
   */
  pushBooking?(
    ctx: SourceAdapterContext,
    request: PushBookingRequest,
  ): Promise<PushBookingResult>

  /**
   * Push an availability change for one or more slots. Idempotent on
   * (slot_id, remaining_pax) — pushing the same value twice is a no-op
   * upstream. Called by an availability-changed event subscriber.
   */
  pushAvailability?(
    ctx: SourceAdapterContext,
    request: PushAvailabilityRequest,
  ): Promise<PushAvailabilityResult>

  /**
   * Push a content update. Idempotent on (entity_id, content_version).
   * Called by a product-updated event subscriber. Content shape mirrors
   * GetContentResult from catalog-sourced-content.md (same vertical-
   * specific payload, just outbound).
   */
  pushContent?(
    ctx: SourceAdapterContext,
    request: PushContentRequest,
  ): Promise<PushContentResult>
}

export interface AdapterCapabilities {
  // ... existing ...
  /** Whether the adapter accepts booking pushes from us. */
  supportsBookingPush?: boolean
  /** Whether the adapter accepts availability pushes from us. */
  supportsAvailabilityPush?: boolean
  /** Whether the adapter accepts content pushes from us. */
  supportsContentPush?: boolean
}
```

Sourced-only adapters (TUI direct API where we sell their inventory) declare all three as `false`. Channel adapters (a Voyant Connect peer where we sell our inventory through them, or TUI's reseller API) declare the relevant ones as `true`.

**Important contract distinction:** an adapter can be inbound-only, outbound-only, or both. To support outbound-only, the existing `SourceAdapter` contract — which today requires inbound lifecycle methods like `connect`/`discover` (`packages/catalog/src/adapter/contract.ts:174`) — needs ALL methods (inbound + outbound) made optional, gated by capability flags rather than method presence. Outbound-only adapters declare `supportsContentFetch: false`, leave `discover` undefined, and are still valid registry entries.

- **Inbound-only**: bedbank that sells us hotel inventory. We display + book; they don't care about our bookings.
- **Outbound-only**: a channel where we syndicate our owned products. They sell our stuff; we never source from them.
- **Bidirectional**: a Voyant Connect peer who both sells us things AND resells our things.

The same adapter package may declare both directions, sharing one `connection_id` and credentials (per Q5 in §16).

### 3.1. Registry shape

The current adapter registry (`packages/catalog/src/booking-engine/registry.ts`) is keyed only by `sourceKind`, so two connections of the same kind (e.g. TUI dev + TUI prod) cannot both be registered. Channel push routinely needs per-connection routing — different credentials, different rate buckets, different `channel_id` mappings. The registry MUST be reshaped before channel push can work:

```ts
export interface SourceAdapterRegistry {
  /** Register an adapter instance for a specific connection. The
   *  registry is keyed by `connection_id` (the typeid of the row in
   *  whichever table holds connections — `channels` for outbound,
   *  the catalog plane's connection store for inbound), with
   *  `source_kind` as a secondary index for "list all adapters of
   *  kind X" queries. */
  register(connectionId: string, adapter: SourceAdapter): void

  /** Resolve by connection. Hot path. */
  resolveByConnection(connectionId: string): SourceAdapter | undefined
  resolveByConnectionOrThrow(connectionId: string): SourceAdapter

  /** Secondary lookup by kind — returns all adapters registered for
   *  this kind, useful for "rotate to next available connection"
   *  policies. */
  byKind(sourceKind: string): ReadonlyArray<{ connection_id: string; adapter: SourceAdapter }>
}
```

Migration: the inbound code paths that today call `registry.resolveOrThrow(sourceKind)` need to thread a `connection_id` through. Sourced rows already carry `source_connection_id` in their provenance (`packages/catalog/src/provenance.ts`), so the change is mechanical, not a re-architecture.

## 4. Booking push flow

Triggered by `booking.confirmed`. Because the EventBus is in-process / sequential / non-durable (§2), the subscriber MUST NOT do HTTP work directly — its only job is to write durable intent rows and return. A package-owned wakeable job processes the intents.

### 4.1. Subscriber: write intent, return immediately

```ts
// In packages/distribution — registers via distributionModule, not bookings.
eventBus.subscribe<BookingConfirmedEvent>("booking.confirmed", async ({ data }) => {
  // Re-fetch state — booking.confirmed payload is intentionally minimal.
  const booking = await readBookingWithItems(db, data.bookingId)
  const channels = await resolveChannelsForBooking(db, booking)
  if (channels.length === 0) return  // owned product not syndicated

  // For each (booking_item × channel) pair, write a pending row.
  // This is the durable handoff. EventBus contract is satisfied here
  // — no HTTP, no waits, just inserts.
  for (const { itemId, channel } of channels) {
    if (!channel.mapping.pushBookings) continue
    if (!channel.adapter.capabilities.supportsBookingPush) continue
    await upsertChannelBookingLink(db, {
      bookingId: booking.id,
      bookingItemId: itemId,
      channelId: channel.id,
      sourceConnectionId: channel.connectionId,
      pushStatus: "pending",
      idempotencyKey: stableKey(booking.id, itemId, channel.id),
    })
  }

  // Trigger the durable workflow. workflows.trigger() is itself durable
  // (writes to the workflow runtime's table) — safe to call here.
  await workflows.trigger("channel.booking.push", { bookingId: booking.id })
})
```

The subscriber returns after the row writes (a few ms). The emitter — `bookingService.confirm()` — is unblocked.

### 4.2. Durable workflow: fan out, compensate on partial failure

```ts
// packages/distribution/src/workflows/booking-push.ts
export const channelBookingPushWorkflow = workflow({
  id: "channel.booking.push",
  retry: { strategy: "exponential", maxAttempts: 5 },
  timeout: "1h",
  concurrency: { perKey: ({ bookingId }) => bookingId, max: 1 },
  async run({ bookingId }, ctx) {
    const links = await ctx.db.select().from(channelBookingLinks)
      .where(and(eq(.bookingId, bookingId), eq(.pushStatus, "pending")))

    const succeeded: Array<{ link: ChannelBookingLink, upstreamRef: string }> = []
    for (const link of links) {
      try {
        const adapter = registry.resolveByConnectionOrThrow(link.sourceConnectionId)
        await rateLimits.acquire("channel:" + link.channelId + ":" + link.sourceConnectionId, "booking")
        const result = await adapter.pushBooking!(adapterCtx, buildRequest(link))
        await markLinkOk(db, link.id, result.upstreamRef, sha256(result.payload))
        succeeded.push({ link, upstreamRef: result.upstreamRef })
      } catch (err) {
        await markLinkFailed(db, link.id, err)
        // Compensation policy decides whether to cancel succeeded ones
        // or leave them and surface the partial-sync state to ops.
      }
    }

    return { succeeded: succeeded.length, failed: links.length - succeeded.length }
  },
})
```

The workflow is durable: if the worker crashes mid-fanout, it resumes from the last completed step. Each adapter call still goes through `acquireToken` (§14) and writes a `webhook_deliveries` row per attempt (§11). For booking commits where some channels succeeded and one failed, the compensation step decides per `channel_contracts.policy` whether to cancel the succeeded ones (strict atomicity) or leave them and alert ops (eventually-consistent partial sync — usually correct for travel inventory).

For multi-line bookings (composer-driven, per `booking-journey-architecture.md` §0.5), the per-line × per-channel fanout happens naturally because the subscriber wrote one row per `(booking_item_id, channel_id)`.

### 4.3. Why subscribers are write-only

The subscriber boundary is non-negotiable for ALL three flows: subscribers MUST NOT do HTTP, MUST NOT retry, MUST NOT block on rate-limit acquisition. They write durable rows + trigger workflows. Reasons:

- **EventBus is sequential.** Any HTTP latency in a subscriber blocks the emitter and its downstream subscribers. A booking-confirmed handler doing 5 channel HTTP calls × 200ms each adds 1s to every booking commit.
- **EventBus is non-durable.** A subscriber that does HTTP and crashes mid-call has lost the work. Durable intent rows survive restarts.
- **EventBus is fire-and-forget.** A subscriber that throws is logged-and-skipped, not retried. Durable intent rows let a scheduled worker retry on its own cadence.

Every flow in this doc obeys this rule: subscriber writes intent + triggers durable work; durable workflow does HTTP.

## 5. Availability push flow

Same durable-intent pattern, simpler workflow because availability is idempotent and eventually-consistent.

### 5.1. Source events (must be added in groundwork)

`availability.slot.changed` does NOT exist in the codebase today (verified — no emissions found in `packages/availability` or `packages/bookings`). It must be added as part of channel-push groundwork (§10 Phase B), emitted from:

- `bookings/src/service.ts` — `confirm()`, `cancel()`, modify-pax operations (after the durable state change).
- `availability/src/service.ts` — manual operator edits, scheduled refresh recomputations.
- Any other path that mutates effective slot remaining-pax.

Payload: `{ slotId, productId, optionId?, startsAt, remainingPax, source: "booking" | "cancel" | "manual" | "refresh" }`. Subscribers re-read current state for correctness — the payload is the trigger, not the source of truth.

### 5.2. Subscriber writes intent

```ts
eventBus.subscribe("availability.slot.changed", async ({ data }) => {
  // Resolve via channel_inventory_allotments (NOT channel_product_mappings)
  // — allotments carry per-slot/per-option targeting; mappings are
  // product-level and used at booking time. See §7.4.
  const targets = await resolveAllotmentTargetsForSlot(db, data.slotId)
  for (const target of targets) {
    if (!target.mapping.pushAvailability) continue
    await upsertAvailabilityIntent(db, {
      slotId: data.slotId,
      channelId: target.channelId,
      sourceConnectionId: target.connectionId,
      requestedAt: new Date(),
    })
  }
})
```

The intent table is keyed on `(channelId, slotId)` — concurrent supersession events for the same slot collapse to one row, and the worker reads the *current* slot state when it processes (so stale events naturally don't propagate).

### 5.3. Scheduled worker drains the intent table

```ts
export const channelAvailabilityPushWorkflow = workflow({
  id: "channel.availability.push",
  schedule: { every: "30s" },        // tunable per channel via policy
  concurrency: { perKey: ({ channelId }) => channelId, max: 1 },
  async run({ channelId }, ctx) {
    const intents = await selectPendingIntents(db, channelId, { limit: 100 })
    for (const intent of intents) {
      const slot = await readSlot(db, intent.slotId)   // current state
      try {
        await rateLimits.acquire("channel:" + channelId + ":" + intent.sourceConnectionId, "availability")
        await adapter.pushAvailability!(adapterCtx, buildRequest(slot))
        await deleteIntent(db, intent.id)              // success drains the intent
      } catch (err) {
        await stampError(db, intent.id, err)           // intent stays for next pass
      }
    }
  },
})
```

The worker batches per channel for adapter efficiency. Idempotency comes from the upstream's `(slot_id, remaining_pax)` key — pushing twice is a no-op. Stale-event protection comes from reading current slot state at processing time, not at intent-creation time.

## 6. Content push flow

Same pattern. Bigger gap to fix in source events: `product.updated` only fires today on the top-level product PATCH route (`packages/products/src/routes.ts:1253`), not on the many child content/itinerary/media/option/day edits. Channel push needs a `product.content.changed` event emitted from every content-affecting service path. See §10 Phase B groundwork.

### 6.1. Content revision: hash, not version counter

The doc previously assumed monotonic `content_version`. Reality: `product_versions` are explicit operator-triggered snapshots (`packages/products/src/schema-itinerary.ts:98`), not auto-bumped per edit. Trying to wire a version counter into every edit path is invasive.

Use a **content-revision hash** computed at push time: `sha256(canonicalJson(content))`. Idempotency is then "skip the push if the upstream's last-known hash equals the current hash." The hash lives on `channel_content_intents` rows when the worker processes them and is mirrored on the eventually-pushed `channel_product_mappings` row in a new `last_pushed_content_hash` column. No new version semantics required; we hash what we have.

### 6.2. Subscriber and worker

Same shape as availability — subscriber writes an intent row; scheduled worker drains. Unique per `(productId, channelId)` so concurrent edits collapse to one push.

## 7. Schema changes

Channel push adds no new **channel-specific** tables — it extends two existing tables in `packages/distribution` (`channel_booking_links` and `channel_product_mappings`) with operational push fields, and adds two **intent tables** that hold the durable-handoff rows between subscriber and worker. It also relies on two generic infra tables built in Phase B (`webhook_deliveries` §11, `rate_limit_buckets` §14) that future modules will share.

### 7.1. `channel_booking_links` — additive columns

```sql
-- packages/distribution/src/schema-core.ts (extend existing table)
ALTER TABLE channel_booking_links
  ADD COLUMN booking_item_id      text,                          -- nullable; null = booking-level link
  ADD COLUMN source_kind          text,                          -- mirrors adapter kind for routing
  ADD COLUMN source_connection_id text,
  ADD COLUMN push_status          text NOT NULL DEFAULT 'pending', -- "pending" | "ok" | "failed" | "compensated"
  ADD COLUMN push_attempts        integer NOT NULL DEFAULT 0,
  ADD COLUMN last_push_at         timestamptz,
  ADD COLUMN last_error           text,
  ADD COLUMN pushed_payload_hash  text;                          -- detect drift in subsequent pushes

CREATE INDEX idx_channel_booking_links_push_status
  ON channel_booking_links (push_status, last_push_at);
CREATE INDEX idx_channel_booking_links_booking_item
  ON channel_booking_links (booking_item_id) WHERE booking_item_id IS NOT NULL;
```

`booking_item_id` is nullable: existing rows (booking-level) keep working; new fan-out-per-item rows fill it in. A booking that syndicates one line to channel A and another line to channel B has two rows, each scoped by `booking_item_id`. A booking that fully syndicates to one channel has either one row with `booking_item_id = NULL` or one row per item — operator policy.

A `UNIQUE (channel_id, booking_id, COALESCE(booking_item_id, ''))` constraint enforces idempotency — the subscriber's `INSERT ... ON CONFLICT DO NOTHING` is a true durable handoff with no doubled-push risk.

### 7.2. `channel_product_mappings` — additive columns

```sql
-- packages/distribution/src/schema-core.ts (extend existing table)
ALTER TABLE channel_product_mappings
  ADD COLUMN source_kind          text,                          -- "voyant-connect", "direct:tui", etc.
  ADD COLUMN source_connection_id text,
  ADD COLUMN push_availability    boolean NOT NULL DEFAULT true,
  ADD COLUMN push_content         boolean NOT NULL DEFAULT true,
  ADD COLUMN push_bookings        boolean NOT NULL DEFAULT true,
  ADD COLUMN policy               jsonb;                         -- per-mapping policy (rate caps, field include/exclude)
```

The existing columns (`externalProductId`, `externalRateId`, `externalCategoryId`, `active`) already cover the upstream-identifier shape; the new columns add per-mapping push toggles and policy.

### 7.3. Intent tables for durable handoff

Two new lightweight tables hold the durable rows that subscribers write and workers drain (§4-§6). They're per-flow because the keys differ.

```sql
-- packages/distribution/src/schema-push-intents.ts (new)
channel_availability_push_intents (
  id                       text primary key,    -- typeid: cavi
  channel_id               text not null,
  source_connection_id     text not null,
  slot_id                  text not null,
  product_id               text not null,
  option_id                text,                -- nullable per allotment shape
  starts_at                timestamptz not null,
  requested_at             timestamptz not null default now(),
  attempts                 integer not null default 0,
  last_error               text,
  unique (channel_id, slot_id)                  -- supersession collapses
)

channel_content_push_intents (
  id                       text primary key,    -- typeid: ccpi
  channel_id               text not null,
  source_connection_id     text not null,
  product_id               text not null,
  requested_at             timestamptz not null default now(),
  attempts                 integer not null default 0,
  last_error               text,
  unique (channel_id, product_id)               -- collapses concurrent edits
)
```

Booking push doesn't need its own intent table — `channel_booking_links` already serves both roles (the row exists with `push_status = 'pending'` for in-flight, becomes `'ok'` on success). Availability/content needed dedicated intent tables because their natural rows (`channel_inventory_allotments`, `channel_product_mappings`) are configuration, not operational queue state, and shouldn't carry per-event lifecycle.

### 7.4. Mappings vs. allotments — when to use which

`packages/distribution` carries two tables with overlapping semantics; channel push uses them at different points:

- **`channel_product_mappings`** is **product-level identity**: "this Voyant product corresponds to upstream product/rate/category X on channel Y." Used at **booking push time** to translate Voyant booking-item → upstream product reference. One row per `(channel, product)`.
- **`channel_inventory_allotments`** is **per-slot/per-option/per-start-time inventory targeting**: "this channel sells N units of option O for product P starting at T." Used at **availability push time** to know which slots that channel cares about. Many rows per `(channel, product)` — one per slot/option/window.

Picking the wrong one is the most likely correctness bug:

- Booking push that resolves channels via `channel_inventory_allotments` may miss channels mapped to the product but with no per-slot allotment yet (sold "on request" without a fixed inventory split). Use `channel_product_mappings` for booking push.
- Availability push that resolves channels via `channel_product_mappings` will push every slot to every channel mapped to that product, even ones that have no allotment for that specific slot — wasted calls, possible upstream rejection. Use `channel_inventory_allotments` for availability push.

Content push uses `channel_product_mappings` (product-level — content is product-shaped, not slot-shaped).

### 7.5. Why no new package, no new module

Distribution is purpose-built for "we sell our products through external channels." Its existing schemas already model channels, contracts, mappings, booking links, webhook events, commissions, allotments, and reconciliation. Channel push is the operational arm that's missing — adding it inside distribution keeps the surface coherent. Putting these columns or the push workflow anywhere else would split a single concept across modules.

The catalog plane stays neutral: it owns the inbound `SourceAdapter` contract and the outbound contract extension (§3), but the channel-push operational state (status, retries, mappings) lives in distribution where it belongs operationally.

## 8. The owned-arm + channel push interaction

The admitted Finance booking-create command settles atomically through the
lease-gated Bookings domain path. **Channel push runs after settlement,
asynchronously, via the event subscriber.** The booking is durable locally even
if channel push fails; ops gets a notification and can retry or compensate
manually.

This is the right separation:
- **Synchronous (settlement):** local booking row and its required children. All-or-nothing within the authorized transaction.
- **Asynchronous (post-commit):** channel push, notifications, webhook delivery, document generation. Eventually-consistent, retryable, independently failing.

For sourced bookings (where the upstream IS the source of truth), the engine's existing `adapter.reserve` path does the equivalent — the upstream commit is part of the synchronous flow, and there's no separate channel push because the source IS the channel. Owned bookings need channel push as a separate post-commit concern; sourced bookings don't.

## 9. Failure modes

The hard cases:

1. **Booking commits locally; push fails on all channels.** The operator has a booking in their system that the upstream doesn't know about. Surface: alert in operator dashboard's "channel sync failures" view + retry button + drilldown into the `webhook_deliveries` retry chain to see the actual responses. Policy: don't auto-cancel the booking; operator decides.
2. **Booking commits locally; push fails on some channels.** Partial sync. The successful channels know about the booking; the failed ones don't, and may double-book. Same surface; ops decides whether to roll back the booking or continue retrying. The reconciler (§13) catches this on its next pass even if no one intervenes.
3. **Push succeeds; the upstream later modifies/cancels the booking.** Inbound webhook from the channel. Voyant updates the local booking; user sees the change. This is the inverse direction (channel → us) covered by `webhook_subscriptions` (config) + `channel_webhook_events` (inbound log).
4. **Availability push falls behind.** Per §12, the next event for the same slot supersedes whatever was in flight, so transient failures don't cascade. After a long outage, the availability reconciler (§13) compares hashes and reissues.
5. **Content push includes a field the channel doesn't accept.** Adapter returns a structured rejection; we record it on `channel_product_mappings.policy.warnings` and surface a "channel rejected: X" badge in admin. The full request/response is in `webhook_deliveries` for diagnostics.
6. **Channel rate-limits us harder than our config expected.** Our outbound estimate (§14) is too generous. Symptom: `webhook_deliveries.error_class = "rate_limited"` rows accumulating for that channel. The 429 handler drains the bucket per `Retry-After` so we self-correct in the short term; the dashboard surfaces a recommendation to lower the configured RPS for permanent fix.

## 10. Migration / rollout

**Phase A — Adapter contract + registry reshape** (1-2 days):
- Add the three optional outbound methods + capability flags to `SourceAdapter`.
- Make all inbound methods (`connect`, `discover`, `liveResolve`, `reserve`, `cancel`) optional too, so outbound-only adapters are valid.
- Reshape the registry to key by `connection_id` (with `source_kind` as a secondary index per §3.1). Thread `connection_id` through inbound dispatch sites — `provenance.source_connection_id` is already present, so this is mechanical.

**Phase B — Source-event groundwork** (2-3 days):
The doc assumes events that don't exist at the needed fidelity. Fix that first:
- **`availability.slot.changed`** — does not exist today. Emit from `bookings/src/service.ts` (confirm, cancel, modify-pax) and `availability/src/service.ts` (manual edits, refresh recomputes), AFTER the durable state change per the event-delivery policy. Payload: `{ slotId, productId, optionId?, startsAt, remainingPax, source }`.
- **`product.content.changed`** — `product.updated` only fires on top-level PATCH (`packages/products/src/routes.ts:1253`). Emit a sibling event from every content-affecting service path (itinerary, media, options, days, descriptions). Or extend `product.updated` to fire from those paths — pick one and document.
- **`booking.confirmed`** payload — leave as-is (`{ bookingId, bookingNumber, actorId }`); subscribers re-fetch state. Document this expectation prominently.

**Phase C — Infra primitives + distribution schema extension** (2-3 days):
- Build `webhook_deliveries` (§11) with `prepareOutboundEnvelope` redaction helper as the only allowed write path.
- Build `rate_limit_buckets` + `acquireToken(scope, config, priority)` (§14).
- Additive ALTER TABLE migrations on `channels`, `channel_contracts`, `channel_booking_links`, `channel_product_mappings` per §7 + §14.1, including the `UNIQUE (channel_id, booking_id, COALESCE(booking_item_id, ''))` idempotency constraint.
- Add `channel_availability_push_intents` and `channel_content_push_intents` tables (§7.3).
- Update `@voyant-travel/distribution` types and exports.
- No behavior change yet.

**Phase D — Booking push for one channel kind** (3-4 days):
- Implement `channel.booking.push` as a package-owned wakeable job per §4.2 + §12.1.
- Wire `booking.confirmed` subscriber inside distribution: re-fetch booking, write pending `channel_booking_links` rows, trigger workflow. Subscriber returns in ms.
- Each adapter call goes through `acquireToken` and `prepareOutboundEnvelope` → `webhook_deliveries`.
- Operator dashboard: "channel sync" view backed by `channel_booking_links.push_status` + retry endpoint + delivery-log drilldown + per-channel throttling indicator (§14.5).
- The standalone `apps/catalog-demo-api` fixture may gain an optional `POST /bookings` endpoint for integration tests; it is not selected into production composition.

**Phase E — Availability push** (2-3 days):
- `availability.slot.changed` subscriber writes/upserts `channel_availability_push_intents` rows. Resolves channels via `channel_inventory_allotments` (§7.4), NOT `channel_product_mappings`.
- Scheduled `channel.availability.push` workflow (§12.2) drains intents per channel.
- Demo adapter availability sink.

**Phase F — Content push** (2-3 days):
- `product.content.changed` subscriber writes/upserts `channel_content_push_intents` rows. Resolves channels via `channel_product_mappings`.
- Scheduled `channel.content.push` workflow (§12.3); compares current content hash vs. `last_pushed_content_hash` for idempotency.
- Demo adapter content sink.

**Phase G — Reconciler** (3-4 days):
- Scheduled job per (channel, connection) that re-reads current state from owned tables and recreates intent rows for divergent ones.
- Handles long-outage drift; works through the same intent + worker pipeline rather than a parallel push path (§12.5).
- v1 cadences: 15min booking, hourly availability, nightly content. Tunable per channel.

**Phase H — First real channel adapter** (per integration; 5-10 days each):
- Implement the contract for a real upstream — TUI, a Voyant Connect peer, etc.
- Each integration's auth, rate limits, and content-shape translation are upstream-specific work that lands per channel.

Phases A-G give us the **channel-push framework** entirely inside `packages/distribution` (plus the cross-cutting `webhook_deliveries` + `rate_limit_buckets` infra and the source-event groundwork in `packages/bookings`/`packages/availability`/`packages/products`); Phase H onward is per-channel integration work that scales with the number of channels we support.

## 11. The webhook delivery log

`webhook_deliveries` is a **generic outbound HTTP delivery log** — every outbound HTTP call from any module writes a row per attempt for observability, retry-chain history, and (eventually) durable scheduling. Channel push is the first consumer; future consumers include operator-configured webhooks (delivering Voyant events to operator-supplied URLs), third-party integrations (CRM sync, accounting exports), and any other real-time outbound system that needs the same observability surface.

This is distinct from `channel_webhook_events` (in distribution), which logs events received **from** channels — opposite direction.

### 11.1. Schema

```sql
-- packages/db/src/schema/infra/webhook_deliveries.ts (new)
webhook_deliveries (
  id                       text pk           -- typeid: whde (prefix already reserved)

  -- Provenance: who issued this call and why
  source_module            text not null     -- "distribution", "iam", "operator-webhooks", ...
  source_event             text not null     -- "channel.booking.push", "channel.availability.push", ...
  source_entity_module     text              -- e.g. "bookings", "products" — for entity-scoped queries
  source_entity_id         text              -- e.g. "book_xxx" — for entity-scoped queries
  subscription_id          text              -- nullable; references webhook_subscriptions.id when applicable

  -- Target: where we called
  target_url               text not null
  target_kind              text              -- "channel:tui", "subscription", "internal", ...
  target_ref               text              -- e.g. channel_id when target_kind starts with "channel:"

  -- Request (sensitive headers redacted before write)
  request_method           text not null
  request_headers          jsonb             -- auth headers redacted
  request_body_hash        text              -- SHA256 of payload for idempotency / drift detection
  request_body_excerpt     text              -- first N chars for debugging

  -- Response
  response_status          integer
  response_headers         jsonb
  response_body_excerpt    text

  -- Retry chain
  attempt_number           integer not null default 1
  parent_delivery_id       text              -- previous attempt in this retry chain
  idempotency_key          text              -- caller-supplied; stable across retries

  -- Lifecycle
  status                   text not null     -- "pending" | "in_flight" | "succeeded" | "failed" | "abandoned"
  scheduled_for            timestamptz       -- nullable; when null, dispatched immediately
  started_at               timestamptz
  finished_at              timestamptz
  duration_ms              integer

  -- Error detail
  error_class              text              -- "network" | "timeout" | "4xx" | "5xx" | "adapter_error" | "rate_limited"
  error_message            text

  created_at               timestamptz not null default now()
  updated_at               timestamptz not null default now()
)
-- index on (status, scheduled_for) WHERE status IN ('pending','failed') — for future scheduler
-- index on (source_module, created_at desc)                            — for module-scoped logs
-- index on (source_entity_module, source_entity_id, created_at desc)   — for entity-scoped logs
-- index on (idempotency_key, attempt_number)                           — for retry-chain queries
-- index on (subscription_id, created_at desc)                          — for subscription logs
-- index on (target_kind, target_ref, created_at desc)                  — for channel-scoped logs
```

### 11.2. Two access patterns

**Write-path** (every outbound call): caller writes a row before the call (`status = 'in_flight'`, `started_at = now()`), then updates it after the response (`status`, `response_*`, `finished_at`, `duration_ms`). On retry, write a NEW row with `parent_delivery_id` pointing at the previous attempt and `attempt_number + 1`.

**Read-path** (operator dashboard / developer tools):
- "Show me all deliveries for this booking" — `WHERE source_entity_module = 'bookings' AND source_entity_id = 'book_xxx'`
- "Show me what we sent to channel X today" — `WHERE target_kind = 'channel:tui' AND target_ref = ch_xxx AND created_at > today`
- "Show me the retry chain for this idempotency key" — `WHERE idempotency_key = 'xxx' ORDER BY attempt_number`
- "Show me failures we haven't given up on yet" — `WHERE status = 'failed' AND attempt_number < max_retries`

### 11.3. v1 boundaries

- **No worker / scheduler in v1.** `scheduled_for` is part of the schema so a future worker can `SELECT WHERE status='pending' AND scheduled_for <= now()` without a migration, but v1 dispatches synchronously inside the caller (workflow or subscriber). The table is an **observability primitive**, not a queue.
- **Retention.** Successful rows older than 90 days roll off; failed/abandoned rows retain longer (180 days) for diagnostics. Tunable per deployment.
- **Body size.** `request_body_excerpt` and `response_body_excerpt` are bounded (4 KB each) — full bodies live in object storage if a channel agreement requires it; the table holds an excerpt + hash.
- **PII redaction is a library guarantee, not caller discipline.** A shared `prepareOutboundEnvelope(request, response, scope)` helper wraps every write to `webhook_deliveries`. It (a) drops auth headers and cookies, (b) runs request and response bodies through a per-flow redactor that strips known PII shapes (email patterns, phone patterns, document numbers, names from booking-traveler payloads — same redaction surface used by structured logging), (c) bounds excerpts to 4 KB. Direct INSERTs into `webhook_deliveries` from anywhere except this helper are a lint violation. Booking push specifically would otherwise be a likely PII leak vector, so the redaction must be enforced by the library, not promised by callers.

### 11.4. Future consumers

The reason to build this generically rather than channel-specific:

- **Operator webhooks** — operators configure `webhook_subscriptions` to receive Voyant events at their own URLs (`booking.confirmed`, `payment.received`, etc.). Today the delivery is a TODO; once `webhook_deliveries` exists, the worker that delivers to operator URLs writes here.
- **Third-party integrations** — CRM sync (push contact updates to HubSpot), accounting exports (push invoices to QuickBooks), notifications (push order events to Slack via webhook). All of these benefit from the same observability surface.
- **Real-time replacements for cron jobs** — many "every 5 minutes, sync X to Y" patterns are better expressed as event-driven outbound calls. `webhook_deliveries` is the logging substrate for those.

Building it once means we don't have to rebuild "track outbound HTTP calls" each time a new outbound use case appears.

## 12. Push strategy: durable intent for all three flows

Earlier drafts proposed bounded inline retry in subscribers. That is wrong given the EventBus contract: subscribers cannot do HTTP without blocking the emitter, and in-process retries lose work on crash. The corrected strategy is uniform: **all three flows use durable intent rows plus package jobs**. The flows differ in intent shape and worker cadence, not mechanism.

### 12.1. Booking push: per-booking saga workflow with compensation

Subscriber writes pending `channel_booking_links` rows (§4.1). A durable workflow `channel.booking.push` runs **per booking** with `concurrency.perKey = bookingId, max = 1`. The workflow:

- Reads pending links.
- Calls `acquireToken(...)` per link (rate limit per channel).
- Calls `adapter.pushBooking(...)`; writes a `webhook_deliveries` row per attempt via `prepareOutboundEnvelope`.
- On per-link failure, applies the compensation policy from `channel_contracts.policy`: strict-atomic (cancel succeeded ones) or eventually-consistent (mark partial-sync, alert ops).
- On retry, the workflow runtime resumes from the last completed step; partial fanout doesn't redo successes.

Per-channel compensation is the unique thing booking push needs. Workflow is the right tool.

### 12.2. Availability push: scheduled-batch workflow drains the intent table

Subscriber writes/upserts `channel_availability_push_intents` rows (§5.2). A durable workflow `channel.availability.push` runs **on a schedule** (`schedule: { every: "30s" }`, tunable per channel) with `concurrency.perKey = channelId, max = 1`. The workflow:

- Selects up to N pending intents for one channel (batched per channel for adapter efficiency).
- For each intent: read **current** slot state (idempotency comes from current state, not stored event payload).
- Acquire token, call `adapter.pushAvailability(...)`, write delivery log.
- On success, delete the intent row (drains the queue).
- On failure, increment `attempts` + stamp `last_error`; intent stays for next pass.

Stale-event protection is automatic — concurrent supersession events for the same `(channel_id, slot_id)` collapse to one intent row (UNIQUE constraint), and the worker reads current slot state when it processes. We never push a stale value.

### 12.3. Content push: same scheduled-batch shape, longer cadence

Subscriber writes/upserts `channel_content_push_intents` rows (§6.2). Workflow `channel.content.push` runs `schedule: { every: "5m" }` (content drift is rarely time-critical). Idempotency via `last_pushed_content_hash` comparison — skip if upstream's last-known hash equals current hash.

### 12.4. Why uniform durable-intent and not subscriber-side retries

The earlier draft argued "the event stream is the queue" — that's wrong for the codebase's EventBus, which is in-process / sequential / non-durable / fire-and-forget by explicit policy ([`event-delivery-and-durable-execution-policy.md`](./event-delivery-and-durable-execution-policy.md)). Subscribers that retry HTTP inline:

- **Block the emitter.** A `booking.confirmed` handler doing 5 channel HTTP calls × 200ms each adds 1s to every booking commit. Other subscribers (analytics, notifications) wait too.
- **Lose work on crash.** A subscriber retrying when the worker restarts has nothing durable.
- **Don't dedupe across workers.** Two workers receiving the same event (or two emissions of the same event) double-push.

Durable intent rows fix all three: subscriber returns in ms; workers retry on their cadence; uniqueness constraints in the intent tables prevent doubled work. Cost is ~50 lines of intent-table boilerplate per flow — much less than an unsound design that breaks under load.

### 12.5. The reconciler is still useful

Even with durable intents, long outages can produce divergence (intent rows abandoned after N retries, channel went away for hours). The reconciler (§13) re-reads current state from owned tables and re-creates intent rows for divergent ones — a self-healing layer on top of the intent + worker pattern.

## 13. The reconciler: catch-up after outage

Eventually-consistent push works while the channel is reachable most of the time. After a long outage (or when an integration is first turned on for a channel that already has some local state), the channel's view of our inventory diverges from ours. The reconciler closes that gap.

### 13.1. What it does

A scheduled job per `(channel, source_connection_id)` that:

1. **Walks recent channel-relevant rows in our DB.** For booking push: `channel_booking_links` where `push_status != 'ok'` and `last_push_at < now() - threshold`. For availability: products mapped to this channel where `pushed_payload_hash` doesn't match the current availability hash. For content: product versions where `content_version` is ahead of the channel's last-known version.
2. **Reissues pushes for divergent rows.** Same code path as the regular subscriber — same workflow for booking, same bounded inline retry for availability/content. Each attempt writes to `webhook_deliveries`.
3. **Surfaces unresolvable divergences.** Some rows fail repeatedly (channel rejects payload, mapping is broken, contract expired). After N reconciler passes, mark the row `push_status = 'abandoned'` and surface in the operator dashboard.

### 13.2. Cadence

- **Booking-link reconciler**: every 15 min. Catches missed/failed booking pushes from short outages.
- **Availability reconciler**: hourly. Catches drift from missed availability events.
- **Content reconciler**: nightly. Content drift is rarely time-critical.

These are tunable per channel via `policy` on `channel_product_mappings` / `channel_contracts`.

### 13.3. Why a reconciler instead of durable retry forever

A naive durable-retry queue says "keep trying every failed push until it succeeds." That's:
- **Stale.** A booking push that's been retrying for 6 hours is dispatching state that may have been cancelled in the meantime.
- **Noisy.** A persistently-broken channel produces an avalanche of retries that's not actionable.
- **Hard to bound.** When does the queue ever drain? Operator intervention or a fix.

The reconciler explicitly **reads current state and reissues from scratch**, rather than re-delivering stale events. That gives correct convergence even after multi-hour outages, without the staleness problems of a durable retry queue.

## 14. Per-channel rate limiting

Real channel APIs throttle: TUI-style endpoints often allow ~10 RPS sustained, GDS endpoints can be as tight as 1-5 RPS, bedbanks vary. Without rate limiting in v1, the first integration will trip an upstream limit, get 429s in cascade, and either back off into incoherence or get the connection blocked. We design it in from day one.

### 14.1. Config: per-channel, per-contract overrides

Rate-limit settings live on the channel (defaults) with optional per-contract overrides — same pattern as commission rules. Additive ALTER TABLE on `channels` and `channel_contracts`:

```sql
ALTER TABLE channels
  ADD COLUMN rate_limit_rps              integer,           -- requests per second sustained
  ADD COLUMN rate_limit_burst            integer,           -- max tokens in bucket
  ADD COLUMN rate_limit_priority_gates   jsonb;             -- per-priority reserve thresholds

-- channel_contracts overrides the channel defaults for a specific
-- supplier relationship (e.g. our enterprise contract with TUI gives
-- us a higher burst than the public default).
ALTER TABLE channel_contracts
  ADD COLUMN rate_limit_rps              integer,
  ADD COLUMN rate_limit_burst            integer,
  ADD COLUMN rate_limit_priority_gates   jsonb;
```

`rate_limit_priority_gates` example: `{ "booking": 0, "availability": 0.3, "content": 0.7 }`. Read as: bookings dispatch as long as any tokens are available; availability dispatches when bucket is at least 30% full; content dispatches when bucket is at least 70% full. This way **bookings always pre-empt availability/content**, and the three flows share one upstream budget instead of competing for separately-sized slices that might sum to more than the channel actually allows.

### 14.2. Enforcement: token bucket in shared infra

A generic primitive in `packages/db/src/schema/infra/rate_limit_buckets.ts`:

```sql
rate_limit_buckets (
  scope                    text primary key,    -- e.g. "channel:ch_xxx:conn_yyy"
  tokens_available         numeric not null,
  capacity                 numeric not null,
  refill_rate_per_sec      numeric not null,
  last_refill_at           timestamptz not null,
  updated_at               timestamptz not null default now()
)
```

Generic on purpose: any module that needs token-bucket rate limiting (operator webhooks, third-party integrations, future use cases) can use the same primitive with its own scope key. Channel push wraps it with channel-specific scope construction.

The `acquireToken(scope, config, priority)` function:

1. Atomic UPDATE that refills tokens based on `(now - last_refill_at) × refill_rate`, capped at `capacity`.
2. If `tokens_available >= priority_gate(priority) × capacity` AND `tokens_available >= 1`, decrement and return `{ acquired: true }`.
3. Otherwise return `{ acquired: false, retryAfterMs }` computed from how long until enough tokens refill for the priority gate.

The whole thing is one round-trip — small overhead next to the HTTP call we're gating.

### 14.3. Where it runs

**Booking push (workflow):** the per-channel step calls `acquireToken("channel:" + channelId + ":" + connectionId, config, "booking")` before each adapter call. On denial, the workflow's sleep primitive waits `retryAfterMs` and retries. If wait exceeds a max threshold, the step fails with `error_class = "rate_limited"`; the saga moves on, the reconciler picks it up next pass.

**Availability + content push (workflow):** the subscriber only writes or
upserts intent rows. The scheduled workflow calls
`acquireToken(..., "availability")` or `..., "content"` before each adapter
call. On denial, **don't sleep** — leave the intent pending for the next
scheduled pass. The next event for the same key supersedes anyway (per §12).
Log the denial to `webhook_deliveries` with `error_class = "rate_limited"` for
observability.

### 14.4. 429 handling

The bucket is our **outbound-side estimate**. The channel itself is authoritative. When the upstream returns 429:

1. Log to `webhook_deliveries` with `error_class = "rate_limited"` and the response's `Retry-After` header.
2. **Drain the bucket** to zero and set `last_refill_at = now() + retry_after_seconds`. This prevents us from immediately retrying through the same bucket and ensures other concurrent dispatchers also see "no tokens" for the cooldown.
3. The caller (workflow or subscriber) treats 429 the same as "acquire denied": workflow sleeps + retries; subscriber gives up and waits for the next event.

This way our bucket self-corrects when our config drifts from reality. Operations sees recurring `rate_limited` rows in `webhook_deliveries` for a channel, lowers the configured RPS, and the bucket converges.

### 14.5. Operator surface

Operators don't think in tokens-per-second — they think in "this channel keeps rejecting our pushes." The dashboard surfaces:

- **Per-channel throttling indicator** when `webhook_deliveries.error_class = "rate_limited"` is non-trivial in the last hour.
- **A simple "throughput" knob** in the channel settings page (slow / medium / fast presets that map to sensible RPS/burst defaults; advanced users can edit raw values).
- **Recommendation** when the channel returns 429s with `Retry-After` consistently lower than our bucket implies — "your bucket is sized higher than this channel actually allows."

Internal mechanics stay invisible.

### 14.6. v1 scope vs later

In: per-channel/contract config, token-bucket enforcement, priority gates, 429 handling.

Not in: per-region rate limits (some channels rate-limit per geography), per-endpoint rate limits (some channels have stricter limits on specific endpoints like `POST /bookings`), adaptive limiters that learn the channel's actual capacity. All can layer on top of the same primitive when a real integration needs them.

## 15. Non-goals (v1)

- **Bidirectional content reconciliation.** If a channel edits content downstream and pushes back, we don't merge today. The operator's Voyant edit is the source of truth for owned products; channels are read-only consumers. Resolving conflicts when channels can also edit is a follow-up.
- **Per-traveler PII push.** v1 push payloads include the booking shape but redact encrypted travel details. The channel pulls those via a separate authenticated read on demand if it needs them. Lets us avoid pushing PII through the saga and keeps the audit shape simpler.
- **Real-time bidirectional inventory sync.** Eventually-consistent is the contract for v1. Sub-second sync is a v2 conversation about message brokers and durable queues.
- **Channel-push for sourced bookings.** Sourced bookings already commit upstream via `adapter.reserve`; there's no separate channel push because the source IS the channel.

## 16. Open questions

1. ~~**Where does `booking_channel_links` actually live?**~~ **Resolved (§2, §7):** channel push lives in `packages/distribution`, which already houses `channels`, `channel_contracts`, `channel_product_mappings`, `channel_booking_links`, `channel_webhook_events`, `channel_commission_rules`, `channel_inventory_allotments`, `channel_reconciliation_items`, plus the `distributionBookingExtension` ApiExtension. Channel push is net-new code (workflows, event subscribers, push-status fields) over the existing module — not new tables in bookings/products. Bookings stays clean of channel concepts; distribution depends on bookings via the established extension pattern, never the inverse.
2. ~~**Webhook-delivery infrastructure reuse.**~~ **Resolved (§11, §12, §13):** `webhook_deliveries` does not exist yet (typeid prefix `whde` is reserved with no table behind it); built as part of this work in Phase C. It is a generic outbound-HTTP delivery log with a mandatory `prepareOutboundEnvelope` redactor as the only allowed write path. Channel push uses durable intent tables plus package jobs for all three flows. A reconciler (§13) closes the catch-up gap after long outages by re-reading current state and recreating intent rows—the same intent and worker pipeline, not a parallel path.
3. ~~**Per-channel rate-limit awareness.**~~ **Resolved (§14):** rate limiting is in v1, not deferred. Token-bucket primitive lives at `infra.rate_limit_buckets` (generic — usable by other modules); per-channel/per-contract config holds capacity + refill rate + per-priority gates so bookings always pre-empt availability/content while sharing one upstream budget. Bookings sleep-and-retry on denial inside the workflow; availability/content give up immediately and rely on the next supersession event. 429 responses drain the bucket to align our outbound estimate with the channel's authoritative state.
4. ~~**What's `channel_id`?**~~ **Resolved (§2):** `channel_id` is the typeid of a row in the existing `distribution.channels` table — not a synthetic from `(source_kind, source_connection_id)`. A channel is a first-class entity with its own contracts, contacts, commission rules, and reconciliation surface; reducing it to a synthetic would lose that structure.
5. ~~**Bidirectional adapter packaging.**~~ **Resolved (§3, §14):** one `SourceAdapter` instance per connection carries all methods (inbound + outbound). Real channels share auth and the upstream RPS budget across directions — two instances would force two credential lookups and either two rate-limit buckets (wrong: we'd over-throttle ourselves) or a shared-bucket lookup that's more complex than just keying both directions on `connection_id`. Capability flags (`supportsContentFetch`, `supportsBookingPush`, `supportsAvailabilityPush`, `supportsContentPush`) already separate directions cleanly; TypeScript's optional methods let pure-inbound or pure-outbound adapters skip the irrelevant ones without stubbing. Each upstream ships as one npm package with one factory (`createTuiAdapter(config) → SourceAdapter`). When an adapter genuinely needs distinct read/write credentials (rare), it composes separate inbound/outbound HTTP clients **internally** under one public `SourceAdapter` — that's an implementation organization choice, not a public-contract change.

## 17. Related documents

- [`catalog-architecture.md`](./catalog-architecture.md) — Phase 1 inbound contract. Channel push extends the same `SourceAdapter` contract for outbound.
- [`catalog-sourced-content.md`](./catalog-sourced-content.md) — inbound content fetch. Sibling to this doc; same adapter contract, opposite direction.
- [`catalog-booking-engine.md`](./catalog-booking-engine.md) — the engine's commit triggers the booking push subscriber.
- [`booking-journey-architecture.md`](./booking-journey-architecture.md) — channel push runs post-commit; the journey itself doesn't see it.
