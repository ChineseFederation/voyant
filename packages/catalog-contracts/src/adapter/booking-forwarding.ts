export interface SourceAdapterRequestScope {
  locale: string
  audience: string
  market: string
  currency?: string
}

export interface ReserveRequest {
  entity_module: string
  entity_id: string
  /** Durable upstream identity resolved from Catalog provenance by the server. */
  source_ref?: string
  /**
   * Vertical-specific selection. Free-form, but adapters recognize well-known
   * keys such as departure/date/pax fields and, for sourced stays/packages,
   * `roomTypeId` / `ratePlanId` / `board` to re-resolve the exact room + rate
   * the operator picked. The per-search offer id is not replay-safe.
   */
  parameters: Record<string, unknown>
  /** Customer / passenger identity, vertical-shaped. */
  party?: Record<string, unknown>
  /** Payment intent for verticals that distinguish hold vs ticket. */
  payment_intent?: Record<string, unknown>
  /** Per-request scope. Mirrors `LiveResolveRequest.scope`. */
  scope?: SourceAdapterRequestScope
  /** Replay-safe write key. Same key on retries means same upstream effect. */
  idempotency_key?: string
}

export interface ReserveResult {
  /** Upstream order / booking identifier — used as `source_ref` in snapshots. */
  upstream_ref: string
  /** Status returned by the upstream system. */
  status: "pending" | "held" | "confirmed" | "ticketed" | "failed"
  /** Opaque per-vertical payload echoed back to the snapshot graph. */
  upstream_payload?: Record<string, unknown>
}

/**
 * Adapter-declared dispatch certainty. Generic transport errors are always
 * treated as possibly sent; adapters may use this error only when they can
 * prove no upstream request left the process.
 */
export class ReservationDispatchError extends Error {
  constructor(
    message: string,
    readonly certainty: "not_sent" | "possibly_sent",
    readonly errorClass: string,
  ) {
    super(message)
    this.name = "ReservationDispatchError"
  }
}

export interface CancelRequest {
  upstream_ref: string
  reason?: string
  /** Per-request scope. Mirrors `LiveResolveRequest.scope`. */
  scope?: SourceAdapterRequestScope
  /** Replay-safe write key. Same key on retries means same upstream effect. */
  idempotency_key?: string
}

export interface CancelResult {
  status: "cancelled" | "pending" | "refused" | "failed"
  refund_amount?: number
  refund_currency?: string
  /**
   * Free-text channel through which an async cancellation was submitted
   * when `status` is "pending" (email, partner portal, batch, etc.).
   */
  pending_channel?: string
}

/**
 * Replace the mutable commercial party/selection of an existing reservation.
 * The desired state is complete rather than patch-shaped so replay and
 * reconciliation do not depend on an upstream partial-update vocabulary.
 */
export interface ModifyReservationRequest {
  upstream_ref: string
  desired_state: {
    parameters?: Record<string, unknown>
    party?: Record<string, unknown>
  }
  scope?: SourceAdapterRequestScope
  /** Replay-safe write key. Same key means the same desired state. */
  idempotency_key: string
}

export interface ModifyReservationResult {
  upstream_ref: string
  status: "pending" | "confirmed" | "ticketed" | "refused" | "failed"
  source_updated_at?: Date
  upstream_payload?: Record<string, unknown>
}
