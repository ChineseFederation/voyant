/**
 * Stable error codes returned from the booking engine.
 *
 * Mirrors the catalog plane's `CAPABILITY_NOT_SUPPORTED` convention:
 * codes are stable strings, callers branch on them, and each carries a
 * dedicated `Error` subclass for stack-trace clarity.
 */

/** No SourceAdapter was registered for the row's `source.kind`. */
export const NO_ADAPTER_REGISTERED = "NO_ADAPTER_REGISTERED" as const

/**
 * No OwnedBookingHandler was registered for the row's `entity_module`.
 * Sibling to `NO_ADAPTER_REGISTERED` — sourced rows dispatch through
 * adapters keyed by connection, owned rows dispatch through handlers
 * keyed by entity module. Per booking-journey-architecture §6.
 */
export const NO_HANDLER_REGISTERED = "NO_HANDLER_REGISTERED" as const

/** The supplied `quoteId` is unknown or already consumed. */
export const QUOTE_NOT_FOUND = "QUOTE_NOT_FOUND" as const

/** The quote's `expires_at` has passed; caller must re-quote. */
export const QUOTE_EXPIRED = "QUOTE_EXPIRED" as const

/** No snapshot row exists for the given (booking_id, entity_*). */
export const ORDER_NOT_FOUND = "ORDER_NOT_FOUND" as const

/** The order has already been cancelled. */
export const ORDER_ALREADY_CANCELLED = "ORDER_ALREADY_CANCELLED" as const

export type BookingEngineErrorCode =
  | typeof NO_ADAPTER_REGISTERED
  | typeof NO_HANDLER_REGISTERED
  | typeof QUOTE_NOT_FOUND
  | typeof QUOTE_EXPIRED
  | typeof ORDER_NOT_FOUND
  | typeof ORDER_ALREADY_CANCELLED

export class BookingEngineError extends Error {
  constructor(
    public readonly code: BookingEngineErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "BookingEngineError"
  }
}

export class NoAdapterRegisteredError extends BookingEngineError {
  /**
   * Thrown when the registry has no adapter for the given identifier.
   * The identifier is a connection id when dispatched per-connection
   * (channel push, sourced bookings with a known connection) or a source
   * kind when the caller has no connection id (legacy dispatch).
   */
  constructor(identifier: string) {
    super(NO_ADAPTER_REGISTERED, `no SourceAdapter registered for "${identifier}"`, {
      identifier,
    })
    this.name = "NoAdapterRegisteredError"
  }
}

export class NoOwnedHandlerRegisteredError extends BookingEngineError {
  /** Thrown when the owned-handler registry has no entry for the
   *  given `entity_module`. */
  constructor(entityModule: string) {
    super(NO_HANDLER_REGISTERED, `no OwnedBookingHandler registered for "${entityModule}"`, {
      entityModule,
    })
    this.name = "NoOwnedHandlerRegisteredError"
  }
}

export class QuoteExpiredError extends BookingEngineError {
  constructor(quoteId: string, expiredAt: Date) {
    super(QUOTE_EXPIRED, `quote ${quoteId} expired at ${expiredAt.toISOString()}`, {
      quoteId,
      expiredAt: expiredAt.toISOString(),
    })
    this.name = "QuoteExpiredError"
  }
}
