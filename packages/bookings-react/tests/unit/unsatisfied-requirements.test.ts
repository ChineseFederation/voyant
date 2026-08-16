import type {
  UnsatisfiedRequirementReasonV1,
  UnsatisfiedRequirementV1,
} from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import { unsatisfiedRequirementReasonV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-validation"
import { describe, expect, it } from "vitest"
import { bookingsUiEn } from "../../src/i18n/en.js"
import type { BookingsUiMessages } from "../../src/i18n/messages.js"
import { bookingsUiRo } from "../../src/i18n/ro.js"
import {
  anchorForRequirementKey,
  bookingFieldMessages,
  describeUnsatisfiedRequirement,
  describeUnsatisfiedRequirements,
  groupUnsatisfiedRequirements,
  paxBandMessages,
  stepForUnsatisfiedAnchor,
  stepLevelUnsatisfiedMessages,
  travelerFieldMessages,
} from "../../src/journey/lib/unsatisfied-requirements.js"

const LOCALES: ReadonlyArray<[string, BookingsUiMessages]> = [
  ["en", bookingsUiEn],
  ["ro", bookingsUiRo],
]

/** A requirement key of the right shape for each reason the server can emit. */
const KEY_FOR_REASON: Record<UnsatisfiedRequirementReasonV1, string> = {
  pax_band_below_min: "paxBands.adult",
  pax_band_above_max: "paxBands.adult",
  pax_total_below_min: "paxBandsAllowedTotal",
  pax_total_above_max: "paxBandsAllowedTotal",
  pax_band_master_required: "paxBandDependencies.requires.child.adult",
  pax_band_excluded: "paxBandDependencies.excludes.infant.child",
  pax_band_per_master_exceeded: "paxBandDependencies.limits_per_master.child.adult",
  pax_band_sum_exceeded: "paxBandDependencies.limits_sum.child.adult",
  departure_required: "configureSubSteps.departure",
  option_units_required: "configureSubSteps.option-units",
  cabin_category_required: "configureSubSteps.cabin-category",
  cabin_number_required: "configureSubSteps.cabin-number",
  date_range_required: "configureSubSteps.date-range",
  date_range_too_short: "configureSubSteps.date-range",
  date_range_too_long: "configureSubSteps.date-range",
  occupancy_required: "configureSubSteps.occupancy",
  air_arrangement_required: "configureSubSteps.air-arrangement",
  traveler_field_required: "travelerFields.passport.travelers.1",
  booking_field_required: "bookingFields.buyerType",
}

describe("unsatisfied requirement copy", () => {
  // Iterating the enum rather than a hand-written list: a reason added to the
  // contract fails here instead of rendering nothing in the wizard.
  for (const reason of unsatisfiedRequirementReasonV1.options) {
    for (const [locale, messages] of LOCALES) {
      it(`renders ${reason} in ${locale}`, () => {
        const message = describeUnsatisfiedRequirement(
          { requirementKey: KEY_FOR_REASON[reason], reason },
          messages,
        )
        expect(message.trim().length).toBeGreaterThan(0)
        expect(message).not.toContain(reason)
        expect(message).not.toMatch(/[{}]/)
      })
    }
  }

  it("maps every reason in both locales", () => {
    for (const [, messages] of LOCALES) {
      expect(Object.keys(messages.bookingJourney.unsatisfied.reasons).sort()).toEqual(
        [...unsatisfiedRequirementReasonV1.options].sort(),
      )
    }
  })

  it("falls back to honest prose for a reason it has no copy for", () => {
    const message = describeUnsatisfiedRequirement(
      {
        requirementKey: "somethingElse.key",
        reason: "a_reason_from_a_newer_server" as UnsatisfiedRequirementReasonV1,
      },
      bookingsUiEn,
    )
    expect(message).toBe(bookingsUiEn.bookingJourney.unsatisfied.fallback)
  })

  it("names the requirement key when no descriptor supplies a label", () => {
    const message = describeUnsatisfiedRequirement(
      {
        requirementKey: "travelerFields.loyaltyNumber.travelers.0",
        reason: "traveler_field_required",
      },
      bookingsUiEn,
    )
    expect(message).toContain("loyaltyNumber")
    expect(message).toContain("1")
  })

  it("prefers the descriptor's label over the raw code", () => {
    const message = describeUnsatisfiedRequirement(
      { requirementKey: "paxBands.adult", reason: "pax_band_below_min" },
      bookingsUiEn,
      {
        showsConfigure: true,
        showsBilling: true,
        showsTravelers: true,
        showsAccommodation: false,
        showsAddons: false,
        showsAncillaries: false,
        showsPayment: true,
        showsReview: true,
        paxBands: [{ code: "adult", label: "Grown-up", minCount: 1, maxCount: 4 }],
        paxBandsAllowedTotal: { min: 1, max: 4 },
        travelerFields: [],
        bookingFields: [],
        paymentIntents: ["card"],
      },
    )
    expect(message).toContain("Grown-up")
  })
})

describe("requirement key anchoring", () => {
  it("addresses a pax band", () => {
    expect(anchorForRequirementKey("paxBands.child:pricing_01j")).toEqual({
      kind: "paxBand",
      bandCode: "child:pricing_01j",
    })
  })

  it("addresses the aggregate party window", () => {
    expect(anchorForRequirementKey("paxBandsAllowedTotal")).toEqual({ kind: "paxTotal" })
  })

  it("addresses a cross-band dependency", () => {
    expect(anchorForRequirementKey("paxBandDependencies.requires.child.adult")).toEqual({
      kind: "paxDependency",
      dependentCode: "child",
      masterCode: "adult",
    })
  })

  it("addresses a configure sub-step", () => {
    expect(anchorForRequirementKey("configureSubSteps.departure")).toEqual({
      kind: "configureSubStep",
      subStepKind: "departure",
    })
  })

  it("addresses a traveler field on a row", () => {
    expect(anchorForRequirementKey("travelerFields.passport.travelers.2")).toEqual({
      kind: "travelerField",
      fieldKey: "passport",
      travelerIndex: 2,
    })
  })

  it("addresses a descriptor-level traveler field with no row", () => {
    expect(anchorForRequirementKey("travelerFields.passport")).toEqual({
      kind: "travelerField",
      fieldKey: "passport",
      travelerIndex: -1,
    })
  })

  it("addresses a dotted booking field key", () => {
    expect(anchorForRequirementKey("bookingFields.address.country")).toEqual({
      kind: "bookingField",
      fieldKey: "address.country",
    })
  })

  it("treats an unknown key shape as unaddressed rather than guessing", () => {
    expect(anchorForRequirementKey("somethingNew.key")).toEqual({ kind: "unaddressed" })
    expect(stepForUnsatisfiedAnchor({ kind: "unaddressed" })).toBeNull()
  })

  it("routes each anchor to the step that draws its control", () => {
    const stepOf = (requirementKey: string) =>
      stepForUnsatisfiedAnchor(anchorForRequirementKey(requirementKey))
    expect(stepOf("paxBands.adult")).toBe("travelers")
    expect(stepOf("paxBandsAllowedTotal")).toBe("travelers")
    expect(stepOf("paxBandDependencies.requires.child.adult")).toBe("travelers")
    expect(stepOf("travelerFields.passport.travelers.0")).toBe("travelers")
    expect(stepOf("configureSubSteps.occupancy")).toBe("travelers")
    expect(stepOf("configureSubSteps.departure")).toBe("departure")
    expect(stepOf("configureSubSteps.date-range")).toBe("options")
    expect(stepOf("configureSubSteps.option-units")).toBe("options")
    expect(stepOf("bookingFields.buyerType")).toBe("billing")
  })
})

describe("grouping for a host", () => {
  const findings: UnsatisfiedRequirementV1[] = [
    { requirementKey: "paxBands.adult", reason: "pax_band_below_min" },
    { requirementKey: "configureSubSteps.departure", reason: "departure_required" },
    { requirementKey: "travelerFields.passport.travelers.1", reason: "traveler_field_required" },
    { requirementKey: "bookingFields.address.country", reason: "booking_field_required" },
    { requirementKey: "somethingNew.key", reason: "booking_field_required" },
  ]

  it("keeps every finding reachable — by step or as unaddressed", () => {
    const described = describeUnsatisfiedRequirements(findings, bookingsUiEn)
    const { byStep, unaddressed } = groupUnsatisfiedRequirements(described)
    const grouped = [...byStep.values()].reduce((sum, bucket) => sum + bucket.length, 0)
    expect(grouped + unaddressed.length).toBe(findings.length)
    expect(byStep.get("travelers")).toHaveLength(2)
    expect(byStep.get("departure")).toHaveLength(1)
    expect(byStep.get("billing")).toHaveLength(1)
    expect(unaddressed).toHaveLength(1)
  })

  it("keys traveler-field messages by row and field", () => {
    const described = describeUnsatisfiedRequirements(findings, bookingsUiEn)
    expect(travelerFieldMessages(described, 1).get("passport")).toContain("passport")
    expect(travelerFieldMessages(described, 0).size).toBe(0)
  })

  it("keys booking-field and pax-band messages by their control", () => {
    const described = describeUnsatisfiedRequirements(findings, bookingsUiEn)
    expect(bookingFieldMessages(described).has("address.country")).toBe(true)
    expect(paxBandMessages(described).get("adult")).toHaveLength(1)
  })

  it("leaves out of the step list only what the step anchored itself", () => {
    const described = describeUnsatisfiedRequirements(findings, bookingsUiEn)
    const anchored = stepLevelUnsatisfiedMessages(
      described,
      "travelers",
      (entry) => entry.anchor.kind === "travelerField",
    )
    expect(anchored).toHaveLength(1)
    expect(stepLevelUnsatisfiedMessages(described, "travelers")).toHaveLength(2)
  })
})
