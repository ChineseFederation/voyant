import type { AppliedOffer } from "./booking-engine/promotions-contract.js"

/**
 * Structured pricing breakdown stored alongside the JSONB snapshot blob so
 * finance, invoicing, and refund engines can query it without parsing.
 *
 * Pure contract shape — the runtime `bookingCatalogSnapshotTable` and the
 * `captureSnapshot` service in `@voyant-travel/catalog` consume it, and so do
 * vertical snapshot builders (e.g. flights) via `@voyant-travel/catalog-contracts`.
 */
export interface PricingBasis {
  base_amount: number
  taxes: number
  fees: number
  surcharges: number
  currency: string
  /** Free-form line-item breakdown for engines that need full detail. */
  breakdown?: Record<string, unknown>
  /**
   * Promotional offers applied to the quote (and frozen onto the
   * snapshot at booking commit). The post-commit redemption recorder
   * reads this back via `consumed_booking_id` to populate
   * `promotional_offer_redemptions`. Per
   * `docs/architecture/promotions-architecture.md` §7.1.3.
   */
  appliedOffers?: AppliedOffer[]
}

/**
 * Input to the catalog `captureSnapshot` service — the frozen view of a
 * sourced catalog entry at booking time. Pure payload contract so vertical
 * snapshot builders can construct it without the catalog runtime.
 */
export interface CaptureSnapshotInput {
  bookingId: string
  entityModule: string
  entityId: string
  sourceKind: string
  sourceProvider?: string
  sourceConnectionId?: string
  sourceRef?: string
  /** The resolved CatalogEntry view at booking time. */
  frozenPayload: unknown
  /**
   * The overlay values that were live at capture time (audit needs this to
   * reconstruct exactly what the customer saw).
   */
  overlayStateAtCapture?: unknown
  /** Structured pricing breakdown alongside the JSONB blob. */
  pricingBasis?: PricingBasis
  /** Idempotency key retained from the originating admitted command. */
  idempotencyKey?: string
}
