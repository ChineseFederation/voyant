import { describe, expect, it } from "vitest"

import type { CharterContent } from "../../src/content-shape.js"
import { charterContentSchema } from "../../src/content-shape.js"
import { buildCharterRequirements, DEFAULT_CHARTER_PAX_BANDS } from "../../src/requirements.js"

const minimalContent: CharterContent = charterContentSchema.parse({
  charter: { id: "chrt_abc", name: "Mediterranean Charter" },
})

const wholeYachtContent: CharterContent = charterContentSchema.parse({
  charter: {
    id: "chrt_abc",
    name: "Whole-yacht Charter",
    charter_type: "whole_yacht",
  },
  yacht: { name: "Sample Yacht", capacity_guests: 12 },
  voyages: [{ id: "voy_1", departure_date: "2026-06-01" }],
})

const perSuiteContent: CharterContent = charterContentSchema.parse({
  charter: {
    id: "chrt_abc",
    name: "Per-suite Charter",
    charter_type: "per_suite",
  },
  yacht: { name: "Sample Yacht", capacity_guests: 12 },
  voyages: [{ id: "voy_1", departure_date: "2026-06-01" }],
  suites: [
    { id: "stm_owner", name: "Owner's Suite", category: "owner", capacity: 2 },
    { id: "stm_guest1", name: "Guest Suite 1", category: "guest", capacity: 2 },
  ],
})

describe("buildCharterRequirements", () => {
  it("uses default pax bands when yacht has no capacity", () => {
    const shape = buildCharterRequirements(minimalContent)
    expect(shape.paxBands).toEqual(DEFAULT_CHARTER_PAX_BANDS)
  })

  it("derives pax band maxCount from yacht.capacity_guests when present", () => {
    const shape = buildCharterRequirements(wholeYachtContent)
    expect(shape.paxBands[0]?.maxCount).toBe(12)
    expect(shape.paxBandsAllowedTotal).toEqual({ min: 1, max: 12 })
  })

  it("emits departure + occupancy for whole-yacht charters with voyages", () => {
    const shape = buildCharterRequirements(wholeYachtContent)
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).toEqual(["departure", "occupancy"])
  })

  it("emits departure + cabin-category + occupancy for per-suite charters with suites", () => {
    const shape = buildCharterRequirements(perSuiteContent)
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).toEqual(["departure", "cabin-category", "occupancy"])
  })

  it("projects suites into cabin-category options for per-suite charters", () => {
    const shape = buildCharterRequirements(perSuiteContent)
    const cabinStep = shape.configureSubSteps?.find((s) => s.kind === "cabin-category")
    expect(cabinStep && cabinStep.kind === "cabin-category").toBe(true)
    if (cabinStep && cabinStep.kind === "cabin-category") {
      expect(cabinStep.categories).toHaveLength(2)
      expect(cabinStep.categories[0]?.type).toBe("owner")
      expect(cabinStep.categories[0]?.capacityMin).toBe(2)
      expect(cabinStep.categories[0]?.capacityMax).toBe(2)
    }
  })

  it("does not emit cabin-category for whole-yacht charters even with suites populated", () => {
    const shape = buildCharterRequirements({
      ...wholeYachtContent,
      suites: perSuiteContent.suites, // suites present but charter_type = whole_yacht
    })
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).not.toContain("cabin-category")
  })

  it("respects custom paxBands", () => {
    const shape = buildCharterRequirements(minimalContent, {
      paxBands: [{ code: "adult", label: "Adult", minCount: 2, maxCount: 6 }],
    })
    expect(shape.paxBands[0]?.minCount).toBe(2)
    expect(shape.paxBands[0]?.maxCount).toBe(6)
  })
})
