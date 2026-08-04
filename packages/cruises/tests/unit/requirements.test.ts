import { describe, expect, it } from "vitest"

import type { CruiseContent } from "../../src/content-shape.js"
import { cruiseContentSchema } from "../../src/content-shape.js"
import { buildCruiseRequirements, DEFAULT_CRUISE_PAX_BANDS } from "../../src/requirements.js"

const minimalContent: CruiseContent = cruiseContentSchema.parse({
  cruise: { id: "crus_abc", name: "Greek Isles" },
})

const richContent: CruiseContent = cruiseContentSchema.parse({
  cruise: { id: "crus_abc", name: "Greek Isles" },
  ship: { name: "MS Sample", capacity: 1200 },
  sailings: [{ id: "sail_1", start_date: "2026-06-01", end_date: "2026-06-08" }],
  cabin_categories: [
    { id: "cab_in", code: "IN", name: "Inside", type: "inside" },
    { id: "cab_bal", code: "BAL", name: "Balcony", type: "balcony" },
  ],
})

describe("buildCruiseRequirements", () => {
  it("emits occupancy + air-arrangement when content has no sailings + no cabins", () => {
    const shape = buildCruiseRequirements(minimalContent)
    expect(shape.configureSubSteps).toEqual([
      { kind: "occupancy", bands: DEFAULT_CRUISE_PAX_BANDS },
      { kind: "air-arrangement", required: false },
    ])
  })

  it("emits departure → cabin-category → occupancy → air-arrangement when content carries sailings + categories", () => {
    const shape = buildCruiseRequirements(richContent)
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).toEqual(["departure", "cabin-category", "occupancy", "air-arrangement"])
  })

  it("projects cabin_categories into cabin-category sub-step options", () => {
    const shape = buildCruiseRequirements(richContent)
    const cabinStep = shape.configureSubSteps?.find((s) => s.kind === "cabin-category")
    expect(cabinStep && cabinStep.kind === "cabin-category").toBe(true)
    if (cabinStep && cabinStep.kind === "cabin-category") {
      expect(cabinStep.categories).toHaveLength(2)
      expect(cabinStep.categories[0]?.code).toBe("IN")
      expect(cabinStep.categories[1]?.type).toBe("balcony")
    }
  })

  it("includes a cabin-number sub-step when forceCabinNumberSubStep is true", () => {
    const shape = buildCruiseRequirements(richContent, { forceCabinNumberSubStep: true })
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).toEqual([
      "departure",
      "cabin-category",
      "cabin-number",
      "occupancy",
      "air-arrangement",
    ])
  })

  it("includes an insurance addon group when includeInsurance is true", () => {
    const shape = buildCruiseRequirements(minimalContent, { includeInsurance: true })
    expect(shape.addons?.groups).toHaveLength(1)
    expect(shape.addons?.groups?.[0]?.kind).toBe("insurance")
    expect(shape.addons?.groups?.[0]?.perGuestSelection).toBe(false)
  })

  it("omits addons when includeInsurance is not set (default)", () => {
    const shape = buildCruiseRequirements(minimalContent)
    expect(shape.addons).toBeUndefined()
  })

  it("uses caller-supplied paxBands (cruise-line-specific cutoffs)", () => {
    const shape = buildCruiseRequirements(minimalContent, {
      paxBands: [
        { code: "adult", label: "Adult", minAge: 12, minCount: 1, maxCount: 4 },
        { code: "child", label: "Child", minAge: 3, maxAge: 11, minCount: 0, maxCount: 2 },
        { code: "infant", label: "Infant", minAge: 0, maxAge: 2, minCount: 0, maxCount: 2 },
      ],
    })
    expect(shape.paxBands).toHaveLength(3)
    expect(shape.paxBandsAllowedTotal).toEqual({ min: 1, max: 8 })
  })
})
