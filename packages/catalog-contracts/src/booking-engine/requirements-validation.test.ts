import { describe, expect, it } from "vitest"

import type { BookingRequirementsV1 } from "./requirements-contracts.js"
import {
  DEFAULT_PAYMENT_INTENTS,
  defaultBookingFields,
  defaultRequirementsFlags,
  defaultTravelerFields,
} from "./requirements-defaults.js"
import {
  requiredRequirementKeysV1,
  unsatisfiableRequiredRequirementsV1,
  validateSelectionAgainstRequirements,
} from "./requirements-validation.js"

const BANDS = [
  { code: "adult", label: "Adult", minCount: 1, maxCount: 4 },
  { code: "child", label: "Child", minCount: 0, maxCount: 3 },
]

function requirements(overrides: Partial<BookingRequirementsV1> = {}): BookingRequirementsV1 {
  return {
    ...defaultRequirementsFlags(),
    paxBands: BANDS,
    paxBandsAllowedTotal: { min: 1, max: 6 },
    travelerFields: [],
    bookingFields: [],
    paymentIntents: [...DEFAULT_PAYMENT_INTENTS],
    ...overrides,
  }
}

describe("validateSelectionAgainstRequirements", () => {
  it("finds nothing when the descriptor declares nothing", () => {
    const empty = requirements({
      paxBands: [],
      paxBandsAllowedTotal: { min: 0, max: 10 },
    })

    expect(validateSelectionAgainstRequirements(empty, {})).toEqual([])
  })

  it("reads a selection it cannot parse as an absent one rather than throwing", () => {
    expect(validateSelectionAgainstRequirements(requirements(), undefined)).toEqual([
      { requirementKey: "paxBands.adult", reason: "pax_band_below_min" },
      { requirementKey: "paxBandsAllowedTotal", reason: "pax_total_below_min" },
    ])
  })

  it("enforces per-band and aggregate pax windows", () => {
    const findings = validateSelectionAgainstRequirements(requirements(), {
      configure: { pax: { adult: 5, child: 3 } },
    })

    expect(findings).toEqual([
      { requirementKey: "paxBands.adult", reason: "pax_band_above_max" },
      { requirementKey: "paxBandsAllowedTotal", reason: "pax_total_above_max" },
    ])
  })

  it.each([
    ["requires", { adult: 0, child: 1 }, "pax_band_master_required"],
    ["excludes", { adult: 1, child: 1 }, "pax_band_excluded"],
    ["limits_per_master", { adult: 1, child: 3 }, "pax_band_per_master_exceeded"],
    ["limits_sum", { adult: 2, child: 3 }, "pax_band_sum_exceeded"],
  ] as const)("flags a broken %s dependency", (type, pax, reason) => {
    const shape = requirements({
      paxBandsAllowedTotal: { min: 0, max: 10 },
      paxBands: BANDS.map((band) => ({ ...band, minCount: 0, maxCount: 9 })),
      paxBandDependencies: [
        {
          dependentCode: "child",
          masterCode: "adult",
          type,
          maxPerMaster: 2,
          maxDependentSum: 2,
        },
      ],
    })

    expect(validateSelectionAgainstRequirements(shape, { configure: { pax } })).toEqual([
      { requirementKey: `paxBandDependencies.${type}.child.adult`, reason },
    ])
  })

  it("does not fire a dependency when no dependent was picked", () => {
    const shape = requirements({
      paxBandDependencies: [{ dependentCode: "child", masterCode: "adult", type: "requires" }],
    })

    expect(
      validateSelectionAgainstRequirements(shape, { configure: { pax: { adult: 1 } } }),
    ).toEqual([])
  })

  it("requires a departure only when the sub-step says it is required", () => {
    const required = requirements({ configureSubSteps: [{ kind: "departure", required: true }] })
    const selection = { configure: { pax: { adult: 1 } } }

    expect(validateSelectionAgainstRequirements(required, selection)).toEqual([
      { requirementKey: "configureSubSteps.departure", reason: "departure_required" },
    ])
    expect(
      validateSelectionAgainstRequirements(required, {
        configure: { pax: { adult: 1 }, departureDate: "2026-09-01" },
      }),
    ).toEqual([])
  })

  it("requires a unit pick when the descriptor publishes an option-units sub-step", () => {
    const shape = requirements({ configureSubSteps: [{ kind: "option-units" }] })

    expect(
      validateSelectionAgainstRequirements(shape, { configure: { pax: { adult: 1 } } }),
    ).toEqual([
      { requirementKey: "configureSubSteps.option-units", reason: "option_units_required" },
    ])
    expect(
      validateSelectionAgainstRequirements(shape, {
        configure: {
          pax: { adult: 1 },
          optionSelections: [{ optionId: "opt_1", optionUnitId: "unit_1", quantity: 1 }],
        },
      }),
    ).toEqual([])
  })

  it("checks a date range against its night window", () => {
    const shape = requirements({
      configureSubSteps: [{ kind: "date-range", minNights: 2, maxNights: 5 }],
    })
    const withRange = (checkIn: string, checkOut: string) => ({
      configure: { pax: { adult: 1 }, dateRange: { checkIn, checkOut } },
    })

    expect(
      validateSelectionAgainstRequirements(shape, { configure: { pax: { adult: 1 } } }),
    ).toEqual([{ requirementKey: "configureSubSteps.date-range", reason: "date_range_required" }])
    expect(
      validateSelectionAgainstRequirements(shape, withRange("2026-09-01", "2026-09-02")),
    ).toEqual([{ requirementKey: "configureSubSteps.date-range", reason: "date_range_too_short" }])
    expect(
      validateSelectionAgainstRequirements(shape, withRange("2026-09-01", "2026-09-10")),
    ).toEqual([{ requirementKey: "configureSubSteps.date-range", reason: "date_range_too_long" }])
    expect(
      validateSelectionAgainstRequirements(shape, withRange("2026-09-01", "2026-09-04")),
    ).toEqual([])
  })

  it("requires cabin picks the descriptor asks for", () => {
    const shape = requirements({
      configureSubSteps: [
        { kind: "cabin-category", categories: [{ id: "cat_1", name: "Balcony" }] },
        { kind: "cabin-number", perCategory: { cat_1: [{ id: "cab_1", label: "8001" }] } },
      ],
    })

    expect(
      validateSelectionAgainstRequirements(shape, { configure: { pax: { adult: 1 } } }),
    ).toEqual([
      { requirementKey: "configureSubSteps.cabin-category", reason: "cabin_category_required" },
      { requirementKey: "configureSubSteps.cabin-number", reason: "cabin_number_required" },
    ])
  })

  it("checks a required traveler field on every traveler its bands cover", () => {
    const shape = requirements({
      paxBandsAllowedTotal: { min: 0, max: 6 },
      paxBands: BANDS.map((band) => ({ ...band, minCount: 0 })),
      travelerFields: [
        {
          key: "passport",
          label: "Passport",
          type: "text",
          required: true,
          appliesToBands: ["adult"],
        },
      ],
    })

    const findings = validateSelectionAgainstRequirements(shape, {
      travelers: [
        { firstName: "Ada", band: "adult", documents: { passport: "X1" } },
        { firstName: "Grace", band: "adult" },
        // A tier-qualified child code still resolves to the `child` category,
        // which this field does not cover.
        { firstName: "Kid", band: "child:pricing_categories_01" },
      ],
    })

    expect(findings).toEqual([
      { requirementKey: "travelerFields.passport.travelers.1", reason: "traveler_field_required" },
    ])
  })

  it("checks a required booking field inside its declared group", () => {
    const shape = requirements({
      paxBandsAllowedTotal: { min: 0, max: 6 },
      paxBands: [],
      bookingFields: [
        { key: "buyerType", label: "Buyer type", type: "select", required: true, group: "billing" },
        {
          key: "address.country",
          label: "Country",
          type: "country",
          required: true,
          group: "billing",
        },
        { key: "vatId", label: "VAT", type: "text", required: true, group: "company" },
      ],
    })

    expect(
      validateSelectionAgainstRequirements(shape, {
        billing: { buyerType: "B2B", address: { country: "" } },
      }),
    ).toEqual([
      { requirementKey: "bookingFields.address.country", reason: "booking_field_required" },
      { requirementKey: "bookingFields.vatId", reason: "booking_field_required" },
    ])
  })

  /**
   * voyant#4113 in miniature: a per-person product that also sells optional
   * units. The descriptor publishes the option but no `option-units` sub-step,
   * because a booking of it is complete without a unit pick. Demanding one
   * anyway is what made 13 of 39 product options unbookable.
   */
  it("does not invent a requirement the descriptor never published", () => {
    const shape = requirements({
      configureSubSteps: [
        {
          kind: "product-option",
          options: [
            {
              id: "opt_guided",
              name: "Guided",
              units: [{ id: "unit_adult", name: "Adult seat", unitType: "person" }],
            },
          ],
        },
        { kind: "departure", required: true },
        { kind: "occupancy", bands: BANDS },
      ],
    })

    expect(
      validateSelectionAgainstRequirements(shape, {
        configure: { pax: { adult: 2 }, departureSlotId: "slot_1" },
      }),
    ).toEqual([])
  })
})

describe("requiredRequirementKeysV1", () => {
  it("names every entry the descriptor marks required", () => {
    const shape = requirements({
      configureSubSteps: [
        { kind: "departure", required: true },
        { kind: "product-option", options: [] },
        { kind: "occupancy", bands: BANDS },
      ],
      travelerFields: [
        { key: "firstName", label: "First name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: false },
      ],
      bookingFields: [
        { key: "buyerType", label: "Buyer type", type: "select", required: true, group: "billing" },
      ],
    })

    expect(requiredRequirementKeysV1(shape)).toEqual([
      "paxBands.adult",
      "paxBandsAllowedTotal",
      "configureSubSteps.departure",
      "configureSubSteps.occupancy",
      "travelerFields.firstName",
      "bookingFields.buyerType",
    ])
  })
})

describe("unsatisfiableRequiredRequirementsV1", () => {
  it("passes the descriptor every first-party vertical publishes today", () => {
    expect(
      unsatisfiableRequiredRequirementsV1(
        requirements({
          travelerFields: [...defaultTravelerFields()],
          bookingFields: [...defaultBookingFields()],
        }),
      ),
    ).toEqual([])
  })

  it("rejects a required traveler field the selection projection drops", () => {
    // voyant#4113 arriving through the enforcement built to prevent it: the
    // descriptor asks for a passport, `normalizeTraveler` drops `documents`,
    // and the buyer can never satisfy the quote however much they type.
    expect(
      unsatisfiableRequiredRequirementsV1(
        requirements({
          travelerFields: [{ key: "passport", label: "Passport", type: "text", required: true }],
        }),
      ),
    ).toEqual([{ requirementKey: "travelerFields.passport", reason: "traveler_field_required" }])
  })

  it("does not flag the same field when it is optional", () => {
    expect(
      unsatisfiableRequiredRequirementsV1(
        requirements({
          travelerFields: [{ key: "passport", label: "Passport", type: "text", required: false }],
        }),
      ),
    ).toEqual([])
  })

  it("rejects a required booking field in a group the selection has no bucket for", () => {
    expect(
      unsatisfiableRequiredRequirementsV1(
        requirements({
          bookingFields: [
            {
              key: "seatPreference",
              label: "Seat",
              type: "text",
              required: true,
              group: "preferences",
            },
          ],
        }),
      ),
    ).toEqual([
      { requirementKey: "bookingFields.seatPreference", reason: "booking_field_required" },
    ])
  })
})
