/**
 * Project a `CharterContent` payload into a `BookingRequirementsV1`.
 *
 * Charter products fall into two booking modes that require
 * different sub-steps:
 *   - **Whole-yacht** (`charter_type: "whole_yacht"`): party books the
 *     entire yacht. Configure step picks a voyage (departure date)
 *     and total guest count; per-suite selection is implicit (all
 *     suites belong to the booking).
 *   - **Per-suite** (`charter_type: "per_suite"`): individual suites
 *     are bookable. Configure step adds a suite-selection sub-step
 *     and pax bands track per-suite occupancy.
 *
 * The builder reads `content.charter.charter_type` to pick the mode.
 * Pricing always flows through liveResolve.
 */

import {
  type BookingRequirementsV1,
  type CabinCategoryOptionV1,
  type ConfigureSubStepV1,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
  type PaxBandSpecV1,
  paxBandsAllowedTotalFrom,
} from "@voyant-travel/catalog/booking-engine"

import type { CharterContent } from "./content-shape.js"

export const DEFAULT_CHARTER_PAX_BANDS: PaxBandSpecV1[] = [
  { code: "adult", label: "Adult", minCount: 1, maxCount: 12 },
]

export interface BuildCharterRequirementsOptions {
  locale?: string
  paxBands?: PaxBandSpecV1[]
  paxBandsAllowedTotal?: { min: number; max: number }
}

export function buildCharterRequirements(
  content: CharterContent,
  options: BuildCharterRequirementsOptions = {},
): BookingRequirementsV1 {
  const paxBands =
    options.paxBands ??
    (content.yacht?.capacity_guests
      ? [{ code: "adult", label: "Adult", minCount: 1, maxCount: content.yacht.capacity_guests }]
      : DEFAULT_CHARTER_PAX_BANDS)
  const total = options.paxBandsAllowedTotal ?? paxBandsAllowedTotalFrom(paxBands)

  const isPerSuite = content.charter.charter_type === "per_suite"

  const configureSubSteps: ConfigureSubStepV1[] = []
  if (content.voyages.length > 0) {
    configureSubSteps.push({ kind: "departure", required: true })
  }
  if (isPerSuite && content.suites.length > 0) {
    // Per-suite charters reuse the cabin-category sub-step shape —
    // suites map cleanly to "category" for descriptor purposes; the
    // wizard component is the same. (When per-suite booking gets its
    // own shape kind in a future revision, swap here.)
    configureSubSteps.push({
      kind: "cabin-category",
      categories: content.suites.map(toSuiteOption),
    })
  }
  configureSubSteps.push({ kind: "occupancy", bands: paxBands })

  return {
    ...defaultRequirementsFlags(),
    paxBands,
    paxBandsAllowedTotal: total,
    travelerFields: defaultTravelerFields(),
    bookingFields: defaultBookingFields(),
    configureSubSteps,
    paymentIntents: ["hold", "card"],
  }
}

function toSuiteOption(s: CharterContent["suites"][number]): CabinCategoryOptionV1 {
  return {
    id: s.id,
    code: s.code ?? undefined,
    name: s.name,
    type: s.category ?? undefined,
    capacityMin: s.capacity ?? undefined,
    capacityMax: s.capacity ?? undefined,
    description: s.description ?? undefined,
  }
}
