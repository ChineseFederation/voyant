/**
 * Project an `ExtraContent` payload into a `BookingRequirementsV1`.
 *
 * Extras are booking add-ons (excursions, transfers, insurance) —
 * they're never standalone bookable on their own; they always layer
 * onto a parent product. So the descriptor here is **degenerate**:
 *
 *   - `showsConfigure: false` (no configure step — extras are picked
 *     during the parent product's add-on step).
 *   - `showsTravelers: false` (extras don't have their own pax flow).
 *   - `showsPayment: false` (extras roll up into the parent's pricing).
 *   - `addons.catalog`: the extra itself + its sub-options projected
 *     as a small catalog. Useful for journey contexts that want to
 *     render an add-on detail view (e.g. ops admin reviewing a
 *     supplier's extras).
 *
 * In practice templates rarely call this directly — the parent
 * product's `BookingRequirementsV1` aggregates extras via the journey's
 * cross-product composer. This function is the building block.
 */

import {
  type AddonOfferV1,
  type BookingRequirementsV1,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  type PaxBandSpecV1,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog/booking-engine"

import type { ExtraContent } from "./content-shape.js"

const DEGENERATE_PAX_BANDS: PaxBandSpecV1[] = [
  { code: "adult", label: "Adult", minCount: 0, maxCount: 8 },
]

export interface BuildExtraRequirementsOptions {
  locale?: string
  /**
   * When true, returns the full descriptor surface (configure +
   * travelers + payment all visible). Useful for tests or admin
   * surfaces that render extras standalone. Defaults to false (the
   * normal "extras-as-addon" mode).
   */
  standalone?: boolean
}

export function buildExtraRequirements(
  content: ExtraContent,
  options: BuildExtraRequirementsOptions = {},
): BookingRequirementsV1 {
  const flags = defaultRequirementsFlags()
  const standalone = options.standalone ?? false

  // Project the extra + its options as add-on offers. The extra
  // itself becomes the lead item; sub-options follow.
  const items: AddonOfferV1[] = [
    {
      id: content.extra.id,
      name: content.extra.name,
      description: content.extra.description ?? null,
      kind: kindForExtraCategory(content.extra.category ?? null),
      pricingMode: content.extra.pricing_mode ?? null,
    },
    ...content.options.map(
      (opt): AddonOfferV1 => ({
        id: opt.id,
        name: opt.name,
        description: opt.description ?? null,
        kind: "extras",
        pricingMode: null,
      }),
    ),
  ]

  return {
    ...flags,
    showsConfigure: standalone,
    showsTravelers: standalone,
    showsPayment: standalone,
    showsAddons: true,
    paxBands: DEGENERATE_PAX_BANDS,
    paxBandsAllowedTotal: paxBandsAllowedTotalFrom(DEGENERATE_PAX_BANDS),
    travelerFields: standalone ? defaultTravelerFields() : [],
    bookingFields: standalone ? defaultBookingFields() : [],
    addons: { catalog: items },
    paymentIntents: standalone ? ["hold", "card"] : [],
  }
}

function kindForExtraCategory(category: string | null): AddonOfferV1["kind"] {
  if (!category) return "extras"
  const lower = category.toLowerCase()
  if (lower.includes("excursion") || lower.includes("tour")) return "excursions"
  if (lower.includes("insurance")) return "insurance"
  return "extras"
}
