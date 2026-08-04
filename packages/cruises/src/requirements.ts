/**
 * Project a `CruiseContent` payload into a `BookingRequirements` so the
 * journey wizard can render the correct sub-steps for a sourced
 * cruise.
 *
 * Cruise products are the prototype for the journey's most-elaborate
 * shape (per §F.1 in the journey doc):
 *   - Configure: departure (sailing date) → cabin-category → cabin-
 *     number → occupancy. Each sub-step is rendered only when its
 *     options array is non-empty.
 *   - Accommodation: pre/post extension hotels (when present).
 *     Cruise lines surface these via supplier-specific catalogs;
 *     the v1 builder leaves this empty and templates can override.
 *   - Add-ons: per-port excursions (`groupBy: "port"` when the
 *     itinerary stops surface them) plus optional insurance offer.
 *   - Pax bands: cruise-line-specific age cutoffs (infant ≤ 2,
 *     child 3-11, adult 12+) — caller-supplied via options because
 *     the cutoffs vary per supplier and aren't on the content
 *     payload.
 *
 * See `docs/architecture/booking-journey-architecture.md` §F.1.
 */

import {
  type BookingRequirements,
  type CabinCategoryOption,
  type ConfigureSubStep,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  type PaxBandSpec,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog/booking-engine"

import type { CruiseContent } from "./content-shape.js"

/**
 * Default cruise pax bands — adult-only since age cutoffs vary per
 * cruise line. Templates pass in supplier-specific bands when
 * available; this default is conservative (12+ implied — adult only,
 * 1-8 cabin cap).
 */
export const DEFAULT_CRUISE_PAX_BANDS: ReadonlyArray<PaxBandSpec> = [
  { code: "adult", label: "Adult", minCount: 1, maxCount: 8 },
]

export interface BuildCruiseRequirementsOptions {
  locale?: string
  /**
   * Cruise-line-specific pax bands. Templates derive these from the
   * supplier's catalog metadata (e.g. `infant ≤ 2`, `child 3-11`,
   * `adult 12+` for major lines). Defaults to adult-only.
   */
  paxBands?: ReadonlyArray<PaxBandSpec>
  paxBandsAllowedTotal?: { min: number; max: number }
  /**
   * When true, render the cabin-number sub-step even if the
   * `cabin_categories[]` items don't surface a cabin map. The
   * journey then emits an empty per-category record and the wizard
   * lets ops select "any cabin" within the category.
   */
  forceCabinNumberSubStep?: boolean
  /**
   * Whether to include an insurance addon group. Templates pass
   * `true` when the deployment ships an insurance offer; default
   * `false` so we don't fabricate offers.
   */
  includeInsurance?: boolean
}

export function buildCruiseRequirements(
  content: CruiseContent,
  options: BuildCruiseRequirementsOptions = {},
): BookingRequirements {
  const paxBands = options.paxBands ?? DEFAULT_CRUISE_PAX_BANDS
  const total = options.paxBandsAllowedTotal ?? paxBandsAllowedTotalFrom(paxBands)

  // Configure sub-steps — built only when the content carries the
  // relevant data. Order matters: departure → category → cabin-number
  // → occupancy mirrors the doc's §F.1 flow.
  const configureSubSteps: ConfigureSubStep[] = []
  if (content.sailings.length > 0) {
    configureSubSteps.push({ kind: "departure", required: true })
  }
  if (content.cabin_categories.length > 0) {
    configureSubSteps.push({
      kind: "cabin-category",
      categories: content.cabin_categories.map(toCabinCategoryOption),
    })
    if (options.forceCabinNumberSubStep) {
      configureSubSteps.push({
        kind: "cabin-number",
        // Empty record: the wizard treats an empty array as "any
        // cabin within the category" — templates wire real cabin
        // pools when supplier surfaces them.
        perCategory: {},
      })
    }
  }
  configureSubSteps.push({ kind: "occupancy", bands: paxBands })

  // Air-arrangement choice — cruises always render this; the
  // wizard's three tiles cover cruise-line-arranged, independent,
  // and no-flights flows. Per booking-journey-architecture §7.
  configureSubSteps.push({ kind: "air-arrangement", required: false })

  return {
    ...defaultRequirementsFlags(),
    paxBands,
    paxBandsAllowedTotal: total,
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    configureSubSteps,
    paymentIntents: ["hold", "card"],
    // Excursions: empty by default — they live on supplier-specific
    // per-port catalogs that aren't on `CruiseContent` today.
    // Templates / future content-shape extensions wire this.
    addons: options.includeInsurance
      ? {
          groups: [
            {
              kind: "insurance",
              label: "Travel insurance",
              perGuestSelection: false,
              items: [],
            },
          ],
        }
      : undefined,
  }
}

function toCabinCategoryOption(
  cat: CruiseContent["cabin_categories"][number],
): CabinCategoryOption {
  return {
    id: cat.id,
    code: cat.code ?? undefined,
    name: cat.name,
    type: cat.type ?? undefined,
    capacityMin: cat.capacity_min ?? undefined,
    capacityMax: cat.capacity_max ?? undefined,
    description: cat.description ?? undefined,
  }
}
