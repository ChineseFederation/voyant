/**
 * `FlightConnectorAdapter` contract — the seam through which any flight
 * provider integrates with Voyant.
 *
 * Five core methods every adapter must implement; capability-gated
 * methods exist as optional members on the interface and stub with
 * `CAPABILITY_NOT_SUPPORTED` if the adapter doesn't declare them.
 *
 * Implementations come from anywhere — Voyant Connect, a wholesaler's own
 * engineering team, a cruise line direct API, an operator-built GDS
 * connector, a third-party integrator. No implementer is privileged.
 *
 * See `docs/architecture/catalog-flights-architecture.md` §3.
 */

import type {
  AncillaryRequest,
  AncillaryResponse,
  CheckInRequest,
  CheckInResponse,
  FareCalendarRequest,
  FareCalendarResponse,
  FlightBookRequest,
  FlightCapability,
  FlightModifyRequest,
  FlightModifyResponse,
  FlightOffer,
  FlightOrder,
  FlightOrderStatus,
  FlightRefundRequest,
  FlightRefundResponse,
  FlightSearchPaginationMeta,
  FlightSearchRequest,
  FlightVoidResponse,
  SeatMapRequest,
  SeatMapResponse,
  SeatSelectionRequest,
  SeatSelectionResponse,
  ServedMarketsResponse,
  SsrRequest,
  SsrResponse,
} from "./types.js"

export interface AdapterLogger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export type FlightAdapterEnvironment = "sandbox" | "production"

/**
 * Context passed to every adapter call. Identifies the connection and
 * carries credentials, optional point-of-sale, tracing identifiers,
 * cancellation, idempotency, logging, and environment selection signals.
 *
 * `deps` is an escape hatch for adapter-specific runtime dependencies that
 * shouldn't bleed into the contract — e.g. a Postgres handle for a demo
 * adapter that self-persists, or a feature-flag client. Real connectors
 * (Sabre, Amadeus, Duffel) ignore it.
 */
export interface FlightAdapterContext {
  connectionId: string
  credentials?: Record<string, string>
  /** Operator's IATA office id / pseudo-city / point-of-sale, when applicable. */
  pointOfSale?: string
  /** Upstream trace id, usually propagated from the caller. */
  correlationId?: string
  /** Per-call request id for adapter-local tracing. */
  requestId?: string
  /** Idempotency key for replay-safe writes: book, modify, refund, void. */
  idempotencyKey?: string
  /** Adapter-scoped logger with provider/connection/request metadata bound in. */
  logger?: AdapterLogger
  /** Cancellation signal propagated from the orchestration layer. */
  signal?: AbortSignal
  /** Selects the supplier environment when the adapter supports both. */
  environment?: FlightAdapterEnvironment
  deps?: Record<string, unknown>
}

export interface FlightSearchResponse {
  offers: FlightOffer[]
  /**
   * Pagination metadata, present when the adapter honors
   * `request.pagination`. Omitted by adapters that always return the
   * full result set in one call.
   */
  pagination?: FlightSearchPaginationMeta
  /** Provider-specific data, opaque to the consumer. */
  providerData?: Record<string, unknown>
}

export interface FlightPriceRequest {
  offerId: string
  /** Some providers require the offer payload echoed back to re-price. */
  offer?: FlightOffer
}

export interface FlightPriceResponse {
  offer: FlightOffer
  /** Whether the offer's price/availability is still valid for booking. */
  valid: boolean
  /** When `valid: false`, why the offer was invalidated. */
  invalidReason?: string
}

export interface FlightBookResponse {
  order: FlightOrder
}

export interface FlightGetOrderResponse {
  order: FlightOrder
}

export interface FlightCancelResponse {
  order: FlightOrder
  refundedAmount?: { amount: string; currency: string }
}

export type FlightCancelReason = "customer_request" | "schedule_change" | "operational" | "fraud"

export interface FlightOrdersListQuery {
  /** Pagination cursor — opaque, returned by the previous response. */
  cursor?: string
  limit?: number
  /** Restrict to orders in any of these statuses. */
  status?: FlightOrderStatus[]
  /** Free-text match against PNR, passenger name, or contact email. */
  search?: string
}

export interface FlightOrdersListResponse {
  orders: FlightOrder[]
  pagination: {
    total: number
    hasMore: boolean
    cursor?: string
  }
}

/**
 * Capability declaration returned by the adapter at registration time.
 * The orchestration layer reads `capabilities` to route requests and to
 * fail fast on unsupported operations.
 */
export interface FlightAdapterCapabilities {
  /** Provider identifier — e.g. `"hisky"`, `"amadeus"`, `"duffel"`, `"sabre"`, `"travelport-ndc"`. */
  provider: string
  /** Capabilities declared by this connection. */
  declared: FlightCapability[]
  /**
   * Maximum slices per search request supported. Many providers cap at
   * 1 (single-carrier point-to-point), 2 (round-trip), or 4-6 (multi-city).
   */
  maxSlicesPerSearch?: number
  /**
   * Default per-source timeout hint for the orchestration layer.
   */
  defaultTimeoutMs?: number
}

/**
 * The flight connector contract. Five core methods + optional capability-
 * gated methods. Adapters that don't support a capability either omit the
 * method or have it throw `CAPABILITY_NOT_SUPPORTED`.
 */
export interface FlightConnectorAdapter {
  readonly capabilities: FlightAdapterCapabilities

  // ── Core (5 methods every adapter implements) ────────────────────────

  /** Search flights matching the request's slices + passengers + cabin. */
  searchFlights(
    ctx: FlightAdapterContext,
    request: FlightSearchRequest,
  ): Promise<FlightSearchResponse>

  /**
   * Re-price an offer immediately before booking.
   *
   * This is also the canonical re-quote path for offers approaching
   * `FlightOffer.expiresAt` or `lastTicketingDate`. Callers should invoke it
   * before booking whenever the offer is older than the provider's freshness
   * window or the UI is resuming a saved/held offer.
   */
  priceOffer(ctx: FlightAdapterContext, request: FlightPriceRequest): Promise<FlightPriceResponse>

  /**
   * Book the flight. Behavior depends on `paymentIntent`:
   *   - `hold` → returns order with status `confirmed`; caller must call
   *     `ticketOrder` later (capability-gated).
   *   - `card` / `ticket_on_credit` → returns order with status `ticketed`.
   */
  bookFlight(ctx: FlightAdapterContext, request: FlightBookRequest): Promise<FlightBookResponse>

  /** Get an order by id (for status checks, post-book operations). */
  getOrder(ctx: FlightAdapterContext, orderId: string): Promise<FlightGetOrderResponse>

  /** Cancel an order. */
  cancelOrder(
    ctx: FlightAdapterContext,
    orderId: string,
    reason?: FlightCancelReason,
  ): Promise<FlightCancelResponse>

  // ── Capability-gated (optional) ──────────────────────────────────────
  // Implementations that declare the capability provide these methods;
  // others can either omit them entirely or throw the standard
  // `CAPABILITY_NOT_SUPPORTED` error.

  /**
   * `flight/list-orders` — return a paginated list of orders the adapter
   * has visibility on. Real GDS connectors typically only support listing
   * by PNR/locator (not the full agency book of business), but persistent
   * adapters and self-hosted demos can list everything they've stored.
   */
  listOrders?(
    ctx: FlightAdapterContext,
    query: FlightOrdersListQuery,
  ): Promise<FlightOrdersListResponse>

  /**
   * `flight/fare-calendar` — quote a window of departure dates so a picker can
   * show where availability is before a day is chosen. Indicative pricing from
   * the provider's cached lowest-fare data; callers re-quote with
   * `searchFlights` before booking.
   */
  searchFareCalendar?(
    ctx: FlightAdapterContext,
    request: FareCalendarRequest,
  ): Promise<FareCalendarResponse>

  /**
   * `flight/served-markets` — declare the airports this connection sells, so a
   * picker can lead with the operator's own network instead of every airport
   * on earth. Consumers rank by it; they must not filter on it.
   */
  listServedMarkets?(ctx: FlightAdapterContext): Promise<ServedMarketsResponse>

  /** `flight/holds` — promote a held order to ticketed. */
  ticketOrder?(ctx: FlightAdapterContext, orderId: string): Promise<FlightGetOrderResponse>

  /**
   * `flight/ancillaries` — list bag / assistance / extra options for an offer.
   * Catalog is per-offer because availability depends on the booked itinerary;
   * for round-trip flows where each leg is its own offer, callers fetch one
   * catalog per leg and merge the picks at book time via
   * `FlightBookRequest.ancillaries`.
   */
  getAncillaries?(ctx: FlightAdapterContext, request: AncillaryRequest): Promise<AncillaryResponse>

  /**
   * `flight/seatmap` — fetch the seat map for one segment of an offer.
   * Maps are per-segment because layouts differ by aircraft and cabin
   * (a multi-stop itinerary may use different equipment per leg). Picks
   * are submitted at book time via `FlightBookRequest.ancillaries.seats`.
   */
  getSeatMap?(ctx: FlightAdapterContext, request: SeatMapRequest): Promise<SeatMapResponse>

  /** `flight/seat-selection` — change/add seat selections on an existing order. */
  selectSeats?(
    ctx: FlightAdapterContext,
    request: SeatSelectionRequest,
  ): Promise<SeatSelectionResponse>

  /** `flight/checkin` — initiate or complete online check-in for passengers. */
  checkIn?(ctx: FlightAdapterContext, request: CheckInRequest): Promise<CheckInResponse>

  /** `flight/exchange` — change an existing order's itinerary, fare, pax, or extras. */
  modifyOrder?(
    ctx: FlightAdapterContext,
    request: FlightModifyRequest,
  ): Promise<FlightModifyResponse>

  /** `flight/refund` — refund a ticketed order after the ticketing/void window. */
  refundOrder?(
    ctx: FlightAdapterContext,
    request: FlightRefundRequest,
  ): Promise<FlightRefundResponse>

  /** `flight/void` — void a ticketed order inside the supplier void window. */
  voidOrder?(ctx: FlightAdapterContext, orderId: string): Promise<FlightVoidResponse>

  /** `flight/ssr` — add a special service request such as wheelchair, meal, or UMNR. */
  addSpecialServiceRequest?(ctx: FlightAdapterContext, request: SsrRequest): Promise<SsrResponse>
}

/**
 * Standard error code for capability-gated methods that aren't supported
 * by the adapter. Mirrors voyant-cloud's convention so behavior is
 * portable across runtimes.
 */
export const CAPABILITY_NOT_SUPPORTED = "CAPABILITY_NOT_SUPPORTED" as const

export class FlightCapabilityNotSupportedError extends Error {
  readonly code = CAPABILITY_NOT_SUPPORTED
  constructor(
    public readonly provider: string,
    public readonly capability: FlightCapability,
    public readonly operation: string,
  ) {
    super(
      `Flight provider "${provider}" does not declare capability "${capability}" (operation: ${operation}). ` +
        `Either configure the request to skip this operation or register a connector that supports it.`,
    )
    this.name = "FlightCapabilityNotSupportedError"
  }
}

/**
 * Helper for adapters that want to short-circuit at the start of a method
 * when a required capability isn't declared.
 */
export function requireCapability(
  capabilities: FlightAdapterCapabilities,
  capability: FlightCapability,
  operation: string,
): void {
  if (!capabilities.declared.includes(capability)) {
    throw new FlightCapabilityNotSupportedError(capabilities.provider, capability, operation)
  }
}
