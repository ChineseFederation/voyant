/**
 * Project a `ProductContent` payload into a `BookingRequirements` so
 * the journey wizard can render the correct sub-steps for a sourced
 * product.
 *
 * Tour-style products typically need:
 *   - Configure: occupancy band selection (adult / child / infant)
 *     and optionally a date / departure picker if `days[]` carries
 *     scheduled departures.
 *   - Travelers: per-pax fields (first / last / email; passport when
 *     the supplier requires it — surfaced via overlay when known).
 *   - Product options: the product's own `options[]` projected as a
 *     configure sub-step, setting `draft.configure.variantId`.
 *
 * No accommodation sub-step today (multi-day tours w/ rooms route
 * through accommodations, not products). Pricing flows through
 * liveResolve at quote time, not the descriptor.
 *
 * See `docs/architecture/booking-journey-architecture.md` §3 + §F.
 */

import {
  type BookingRequirements,
  DEFAULT_PAX_BANDS,
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  type PaxBandSpec,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog/booking-engine"

import type { ProductContent } from "./content-shape.js"

export interface BuildProductRequirementsOptions {
  /** Locale — used for option-label fallback. Defaults to `"en-GB"`. */
  locale?: string
  /**
   * Override the default pax bands. Use when the supplier mandates
   * specific age cutoffs (rare for tour products; common for cruises
   * and family-oriented packages).
   */
  paxBands?: ReadonlyArray<PaxBandSpec>
  /**
   * Override the maximum total pax. Defaults to `paxBands` sum.
   * Useful when supplier capacity is < combined band max (e.g. a
   * 6-pax max party on a private tour).
   */
  paxBandsAllowedTotal?: { min: number; max: number }
}

export function buildProductRequirements(
  content: ProductContent,
  options: BuildProductRequirementsOptions = {},
): BookingRequirements {
  const paxBands = options.paxBands ?? DEFAULT_PAX_BANDS
  const total = options.paxBandsAllowedTotal ?? paxBandsAllowedTotalFrom(paxBands)

  const productOptions = content.options.map((opt) => ({
    id: opt.id,
    name: opt.name,
    description: opt.description ?? null,
  }))

  return {
    ...defaultRequirementsFlags(),
    paxBands,
    paxBandsAllowedTotal: total,
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    // Full engine allow list; capabilities narrow it at render time so the
    // storefront offers card + bank transfer + inquiry, matching sourced
    // products (voyant#2741).
    paymentIntents: DEFAULT_PAYMENT_INTENTS,
    configureSubSteps: [
      ...(productOptions.length > 0
        ? [{ kind: "product-option" as const, options: productOptions }]
        : []),
      // Owned products are scheduled — the operator picks a real departure.
      // The journey renders an injected slot picker for this kind, falling
      // back to a free date when the product has no scheduled departures.
      { kind: "departure" as const, required: true },
      { kind: "occupancy", bands: paxBands },
    ],
  }
}
