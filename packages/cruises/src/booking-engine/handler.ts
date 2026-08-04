/**
 * Owned-arm booking handler for the `cruises` vertical (Phase F
 * skeleton).
 *
 * Per `docs/architecture/booking-journey-architecture.md` §6 +
 * §7 (cruise example) + §10 Phase F.
 *
 * computeQuote scope:
 *   - Reads cruise content via the caller-supplied loader
 *     (`getCruiseContent`).
 *   - Projects to a `BookingRequirementsV1` with cabin-category +
 *     occupancy sub-steps via `buildCruiseRequirements`.
 *   - When a sailing + cabin category + occupancy are picked,
 *     looks up the per-occupancy `cruise_prices` row and returns
 *     pricing as `pricePerPerson × paxCount`.
 *
 */

import type {
  BookingRequirementsV1,
  ComputeQuoteRequest,
  ComputeQuoteResult,
  ComputeRequirementsResult,
  OwnedBookingHandler,
  OwnedHandlerContext,
} from "@voyant-travel/catalog/booking-engine"

import type { CruiseContent } from "../content-shape.js"
import { buildCruiseRequirements } from "../requirements.js"

interface DraftLike {
  configure?: {
    pax?: Partial<Record<string, number>>
    departureSlotId?: string
    cabinCategoryId?: string
    cabinNumberId?: string
    variantId?: string
    /** Air-arrangement intent picked in the Configure step's
     *  cruise-specific sub-step. */
    airArrangement?: "cruise_line" | "independent" | "none"
  }
  billing?: {
    contact?: {
      firstName?: string
      lastName?: string
      email?: string
      phone?: string
    }
    company?: { name?: string }
  }
  travelers?: Array<{
    firstName: string
    lastName: string
    dateOfBirth?: string
    band?: string
  }>
  internalNotes?: string
}

export interface ResolvedCruisePrice {
  /** Per-pax price in major units as a numeric string (matches
   *  cruise_prices.pricePerPerson). */
  pricePerPerson: string
  currency: string
  fareCode?: string | null
}

/**
 * Caller-supplied loaders. Templates wire these to
 * `getCruiseContent` and `pricingService.lowestAvailablePrice` /
 * a custom per-(category, occupancy) lookup.
 */
export interface CruiseHandlerLoaders {
  loadContent: (ctx: OwnedHandlerContext, entityId: string) => Promise<CruiseContent | null>
  /**
   * Resolve a price for the chosen sailing + category + occupancy.
   * Returns null when no available row matches (e.g. cabin
   * category is sold out at that occupancy).
   */
  loadPrice: (
    ctx: OwnedHandlerContext,
    args: {
      entityId: string
      sailingId: string
      cabinCategoryId: string
      occupancy: number
    },
  ) => Promise<ResolvedCruisePrice | null>
}

export interface CreateCruiseBookingHandlerOptions extends CruiseHandlerLoaders {
  /** Force the wizard to render a cabin-number sub-step even when
   *  the supplier doesn't surface a cabin map. Defaults to false. */
  forceCabinNumberSubStep?: boolean
  /** Pass `true` when the deployment ships an insurance offer. */
  includeInsurance?: boolean
}

export function createCruiseBookingHandler(
  options: CreateCruiseBookingHandlerOptions,
): OwnedBookingHandler {
  /**
   * The single derivation of a cruise's Booking Requirements. Both
   * `computeRequirements` and `computeQuote` come through here, so the
   * descriptor a host renders is the descriptor a Commit later validates
   * against — one code path, not two (voyant#4113).
   */
  async function deriveRequirements(ctx: OwnedHandlerContext, request: ComputeQuoteRequest) {
    const content = await options.loadContent(ctx, request.entityId)
    if (!content) return { status: "unavailable" as const, reason: "cruise_not_found" }
    const requirements: BookingRequirementsV1 = buildCruiseRequirements(content, {
      forceCabinNumberSubStep: options.forceCabinNumberSubStep,
      includeInsurance: options.includeInsurance,
    })
    return { status: "available" as const, content, requirements }
  }

  return {
    entityModule: "cruises",
    // Cruise lines commonly hold cabin capacity for 24h after a
    // journey times out (the "I'll be right back" pattern). Per
    // booking-journey-architecture §12.9. Templates can override
    // by replacing the handler at boot.
    holdReleaseGraceMs: 24 * 60 * 60 * 1000,

    async computeRequirements(
      ctx: OwnedHandlerContext,
      request: ComputeQuoteRequest,
    ): Promise<ComputeRequirementsResult> {
      const derived = await deriveRequirements(ctx, request)
      return derived.status === "available"
        ? { requirements: derived.requirements }
        : { unavailable: true, reason: derived.reason }
    },

    async computeQuote(
      ctx: OwnedHandlerContext,
      request: ComputeQuoteRequest,
    ): Promise<ComputeQuoteResult> {
      const derived = await deriveRequirements(ctx, request)
      if (derived.status === "unavailable") {
        return { available: false, invalidReason: derived.reason }
      }
      const { content } = derived
      const shape = derived.requirements

      const draft = (request.draft ?? {}) as DraftLike
      const sailingId = draft.configure?.departureSlotId
      const cabinCategoryId = draft.configure?.cabinCategoryId
      const paxCount = sumPax(draft.configure?.pax)

      // Pricing requires (sailing, category, occupancy). Until the
      // user picks all three, return shape only — the wizard
      // renders the steps and waits.
      if (!sailingId || !cabinCategoryId || paxCount <= 0) {
        return { available: true, requirements: shape }
      }

      const price = await options.loadPrice(ctx, {
        entityId: request.entityId,
        sailingId,
        cabinCategoryId,
        occupancy: paxCount,
      })

      if (!price) {
        return {
          available: false,
          invalidReason: "no_price_for_occupancy",
          requirements: shape,
        }
      }

      const perPaxCents = priceStringToCents(price.pricePerPerson)
      const totalCents = perPaxCents * paxCount

      return {
        available: true,
        requirements: shape,
        pricing: {
          base_amount: totalCents,
          taxes: 0,
          fees: 0,
          surcharges: 0,
          currency: price.currency,
          breakdown: {
            lines: [
              {
                kind: "base",
                label: cabinCategoryLabel(content, cabinCategoryId, price.fareCode ?? null),
                quantity: paxCount,
                unitAmount: perPaxCents,
                totalAmount: totalCents,
              },
            ],
            subtotal: totalCents,
            taxTotal: 0,
            total: totalCents,
            paxCount,
            occupancy: paxCount,
            sailingId,
            cabinCategoryId,
            fareCode: price.fareCode ?? null,
          } as Record<string, unknown>,
        },
      }
    },

    async placeHold(_ctx, request) {
      const token = request.draftId ?? `cruise_${Date.now().toString(36)}`
      return {
        holdToken: token,
        expiresAt: new Date(Date.now() + request.ttlMs),
      }
    },

    async releaseHold(_ctx, _holdToken) {
      // No-op until supplier-side hold APIs are wired.
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function sumPax(pax: Partial<Record<string, number>> | undefined): number {
  if (!pax) return 0
  let total = 0
  for (const v of Object.values(pax)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) total += v
  }
  return total
}

function priceStringToCents(price: string): number {
  // cruise_prices.pricePerPerson is numeric(precision, scale). The
  // major-unit string parses straight; round to integer cents.
  const major = Number.parseFloat(price)
  if (!Number.isFinite(major)) return 0
  return Math.round(major * 100)
}

function cabinCategoryLabel(
  content: CruiseContent,
  categoryId: string,
  fareCode: string | null,
): string {
  const category = content.cabin_categories.find((c) => c.id === categoryId)
  const base = category?.name ?? "Cabin"
  return fareCode ? `${base} (${fareCode})` : base
}
