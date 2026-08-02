/** Source adapter interface and adapter error types. */

import type { CatalogDriftEvent } from "../drift/events.js"
import type { AvailabilitySearchRequest, AvailabilitySearchResult } from "./availability-search.js"
import type {
  CancelRequest,
  CancelResult,
  ModifyReservationRequest,
  ModifyReservationResult,
  ReserveRequest,
  ReserveResult,
} from "./booking-forwarding.js"
import type {
  PushAvailabilityRequest,
  PushAvailabilityResult,
  PushBookingRequest,
  PushBookingResult,
  PushContentRequest,
  PushContentResult,
} from "./channel-push-contracts.js"
import type {
  AdapterCapabilities,
  ConnectionState,
  DiscoveryCursor,
  DiscoveryPage,
  GetContentRequest,
  GetContentResult,
  GetReservationRequest,
  GetReservationResult,
  ListReservationsPage,
  ListReservationsQuery,
  LiveResolveRequest,
  LiveResolveResult,
  SourceAdapterContext,
} from "./contract-shared.js"

// ─────────────────────────────────────────────────────────────────────────────
// The adapter contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Public source-adapter contract. All implementations satisfy this same
 * surface — no implementer is privileged. Adapters can be inbound-only,
 * outbound-only (channel push to a syndication target), or bidirectional
 * (per channel-push-architecture §3). Every method except `kind` and
 * `capabilities` is optional: presence is the gate for inbound methods,
 * the new outbound methods are gated by their `supports*Push` capability
 * flags so the channel-push pipeline can reject calls before dispatching.
 */
export interface SourceAdapter {
  /** Adapter identifier (e.g. "voyant-connect", "direct:tui", "bedbank:hotelbeds"). */
  readonly kind: string

  /** Capability declaration. Static; returned at adapter construction. */
  readonly capabilities: AdapterCapabilities

  // ── Connection lifecycle ──────────────────────────────────────────────
  // All optional — outbound-only adapters (channels we syndicate to but
  // never source from) leave these undefined.

  /** Establish the connection. Idempotent. */
  connect?(ctx: SourceAdapterContext): Promise<void>

  /** Pause polling / events without destroying cached data (soft disconnect). */
  pause?(ctx: SourceAdapterContext): Promise<void>

  /**
   * Hard disconnect — explicit admin action. Adapter releases credentials,
   * stops polling, declares itself disconnected. Catalog plane runs the
   * data-cleanup pipeline separately (see §5.10.3).
   */
  disconnect?(ctx: SourceAdapterContext): Promise<void>

  /** Returns the adapter's current connection state. */
  getState?(ctx: SourceAdapterContext): Promise<ConnectionState>

  // ── Discovery ─────────────────────────────────────────────────────────

  /**
   * Emit normalized projections of catalog entries the source provides.
   * Paginated; the adapter checkpoints progress via the opaque cursor.
   * Optional — outbound-only adapters leave this undefined.
   */
  discover?(ctx: SourceAdapterContext, cursor?: DiscoveryCursor): Promise<DiscoveryPage>

  /**
   * Lightweight HEAD-equivalent for HTTP-cache revalidation. Returns the
   * source's current freshness marker without the full payload. Optional;
   * adapters that don't support it return `undefined`.
   */
  freshnessCheck?(
    ctx: SourceAdapterContext,
    entity_id: string,
  ): Promise<{ etag: string; updated_at: Date } | undefined>

  // ── Live resolution ───────────────────────────────────────────────────

  /**
   * Fetch volatile-live fields on demand (price quote, availability check,
   * inventory count). Capability-gated by `supportsLiveResolution`.
   */
  liveResolve?(ctx: SourceAdapterContext, request: LiveResolveRequest): Promise<LiveResolveResult>

  // ── Availability search ───────────────────────────────────────────────

  /**
   * Search live availability across an inventory space (destination + dates
   * + pax → ranked candidates), as opposed to resolving volatile fields for
   * an already-selected entity (`liveResolve`). Capability-gated by
   * `supportsAvailabilitySearch`.
   *
   * The vertical-agnostic fan-out (`fanOutAvailabilitySearch`) parallelizes
   * this across connections, merges, and ranks. See
   * `docs/architecture/dynamic-packaging-rfc.md` §2 (Gap 1).
   */
  searchAvailability?(
    ctx: SourceAdapterContext,
    request: AvailabilitySearchRequest,
  ): Promise<AvailabilitySearchResult>

  // ── Rich content ──────────────────────────────────────────────────────

  /**
   * Fetch rich entity content for one entity, in one locale. Returns the
   * durable detail-page content (itinerary, media, options, terms) — NOT
   * volatile-live values (`liveResolve` covers those).
   *
   * Capability-gated by `supportsContentFetch`. Adapters that don't
   * implement this leave it undefined; the catalog plane synthesizes thin
   * content from the indexed projection + editorial overlay instead.
   *
   * See `docs/architecture/catalog-sourced-content.md` §3.1.
   */
  getContent?(ctx: SourceAdapterContext, request: GetContentRequest): Promise<GetContentResult>

  // ── Booking forwarding (inbound — sourced bookings) ───────────────────

  /** Forward a reserve / book request to the upstream source. */
  reserve?(ctx: SourceAdapterContext, request: ReserveRequest): Promise<ReserveResult>

  /** Forward a cancel request. */
  cancel?(ctx: SourceAdapterContext, request: CancelRequest): Promise<CancelResult>

  /** Replace the desired mutable state of an existing reservation. */
  modifyReservation?(
    ctx: SourceAdapterContext,
    request: ModifyReservationRequest,
  ): Promise<ModifyReservationResult>

  /**
   * Fetch one reservation by upstream reference. Capability-gated by
   * `supportsReservationRetrieval`. Returns `null` when the upstream cannot
   * find the reservation; transport / auth errors should reject.
   */
  getReservation?(
    ctx: SourceAdapterContext,
    request: GetReservationRequest,
  ): Promise<GetReservationResult | null>

  /**
   * Paginated list of reservations attributed to this connection. Capability-
   * gated by `supportsReservationRetrieval`; supports pagination, status
   * filtering, and incremental sync by `updated_after`.
   */
  listReservations?(
    ctx: SourceAdapterContext,
    query: ListReservationsQuery,
  ): Promise<ListReservationsPage>

  // ── Channel push (outbound — owned product syndication) ──────────────
  // Per channel-push-architecture §3. Each method is independently
  // capability-gated; the channel-push pipeline checks the corresponding
  // `supports*Push` flag before dispatching.

  /**
   * Push a booking commit to the upstream channel. Called by the
   * channel-push booking workflow when a booking commits against an
   * owned product syndicated to this channel. Idempotent on
   * `request.idempotencyKey`.
   *
   * Capability-gated by `supportsBookingPush`.
   */
  pushBooking?(ctx: SourceAdapterContext, request: PushBookingRequest): Promise<PushBookingResult>

  /**
   * Push an availability change for one slot. Idempotent on
   * `(slotId, remainingPax)` — pushing the same value twice is a no-op
   * upstream.
   *
   * Capability-gated by `supportsAvailabilityPush`.
   */
  pushAvailability?(
    ctx: SourceAdapterContext,
    request: PushAvailabilityRequest,
  ): Promise<PushAvailabilityResult>

  /**
   * Push a content update. Idempotent on `(productId, contentHash)`.
   * Content shape mirrors `GetContentResult` (same vertical-specific
   * payload, just outbound).
   *
   * Capability-gated by `supportsContentPush`.
   */
  pushContent?(ctx: SourceAdapterContext, request: PushContentRequest): Promise<PushContentResult>

  // ── Drift signals ─────────────────────────────────────────────────────

  /**
   * Optional handle for the catalog plane to subscribe to drift events
   * detected by the adapter (push-based). Adapters that don't push drift
   * leave this undefined; the catalog plane falls back to scheduled
   * comparison passes.
   */
  onDrift?(handler: (event: CatalogDriftEvent) => void | Promise<void>): {
    unsubscribe(): void
  }
}

/**
 * Stable error code adapters return when a capability-gated method is
 * called but the capability is not declared. The catalog plane translates
 * this into structured error responses for callers.
 */
export const CAPABILITY_NOT_SUPPORTED = "CAPABILITY_NOT_SUPPORTED" as const

export class CapabilityNotSupportedError extends Error {
  readonly code = CAPABILITY_NOT_SUPPORTED
  constructor(
    public readonly adapter_kind: string,
    public readonly operation: string,
  ) {
    super(
      `adapter "${adapter_kind}" does not support operation "${operation}" (capability not declared)`,
    )
    this.name = "CapabilityNotSupportedError"
  }
}

/**
 * Stable code an adapter throws when an upstream returns 429
 * (Too Many Requests). The channel-push pipeline catches this,
 * drains the local rate-limit bucket per `Retry-After`, and stamps the
 * delivery row with `error_class = "rate_limited"` so the bucket
 * self-corrects when our outbound estimate drifts from reality.
 *
 * Per docs/architecture/channel-push-architecture.md §14.4.
 */
export const ADAPTER_RATE_LIMITED = "ADAPTER_RATE_LIMITED" as const

export class AdapterRateLimitedError extends Error {
  readonly code = ADAPTER_RATE_LIMITED
  constructor(
    public readonly adapter_kind: string,
    /**
     * Milliseconds to wait before the next attempt, derived from the
     * upstream's `Retry-After` response header (seconds → ms) or the
     * adapter's own backoff hint. The processor uses this to drain the
     * shared rate-limit bucket so concurrent dispatchers also back off.
     */
    public readonly retryAfterMs: number,
    /** Optional context — e.g. which endpoint hit the limit. */
    public readonly operation?: string,
    /** Optional upstream payload echoed for diagnostics. */
    public readonly upstreamPayload?: unknown,
  ) {
    super(
      `adapter "${adapter_kind}" rate-limited${operation ? ` on "${operation}"` : ""} (retry after ${retryAfterMs}ms)`,
    )
    this.name = "AdapterRateLimitedError"
  }
}
