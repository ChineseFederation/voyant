import { describe, expect, it } from "vitest"

import {
  evaluateProductReadiness,
  type ProductReadinessCode,
  type ProductReadinessInput,
} from "../../src/readiness.js"

/**
 * A product that satisfies every check. Individual tests degrade one axis at a
 * time so a failure names exactly the rule that broke.
 */
function readyProduct(overrides: Partial<ProductReadinessInput> = {}): ProductReadinessInput {
  return {
    persisted: true,
    status: "active",
    bookingMode: "date",
    capacityMode: "limited",
    durationMinutes: 60,
    itineraryDurationDays: null,
    hasFamily: true,
    description: "A sixty-minute whale-watching boat tour.",
    defaultLanguageTag: "en",
    contractTemplateId: "ctpl_01",
    sellAmountCents: 5000,
    pax: 40,
    defaultOption: { id: "popt_01", status: "active" },
    defaultOptionUnitCount: 1,
    pricingTierCount: 1,
    defaultItinerary: null,
    itineraryDayNumbers: [],
    dayServiceCostAmountsCents: [],
    futureOpenSlotCount: 3,
    hasSlotCapacity: true,
    hasMeetingPoint: true,
    hasAllocationTemplate: true,
    activeChannelCount: 1,
    ...overrides,
  }
}

function codes(issues: { code: ProductReadinessCode }[]) {
  return issues.map((issue) => issue.code)
}

describe("evaluateProductReadiness", () => {
  it("reports a fully configured product as ready with no issues", () => {
    const result = evaluateProductReadiness(readyProduct())
    expect(result.ready).toBe(true)
    expect(result.issues).toEqual([])
  })

  it("puts blocking issues before warnings in the combined list", () => {
    const result = evaluateProductReadiness(
      readyProduct({ futureOpenSlotCount: 0, hasFamily: false }),
    )
    expect(codes(result.issues)).toEqual(["no_future_open_departure", "missing_family"])
    expect(result.blocking).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
  })

  describe("supply", () => {
    it("blocks a scheduled product with no future open departure", () => {
      const result = evaluateProductReadiness(readyProduct({ futureOpenSlotCount: 0 }))
      expect(result.ready).toBe(false)
      expect(codes(result.blocking)).toContain("no_future_open_departure")
    })

    it("does not ask a dynamically supplied product for a departure", () => {
      for (const bookingMode of ["open", "stay"]) {
        const result = evaluateProductReadiness(
          readyProduct({ bookingMode, futureOpenSlotCount: 0, hasMeetingPoint: false }),
        )
        expect(codes(result.issues)).not.toContain("no_future_open_departure")
      }
    })
  })

  describe("options, units and pricing", () => {
    it("blocks a product with no default option", () => {
      const result = evaluateProductReadiness(readyProduct({ defaultOption: null }))
      expect(codes(result.blocking)).toContain("missing_default_option")
    })

    it("blocks a default option that is not active", () => {
      const result = evaluateProductReadiness(
        readyProduct({ defaultOption: { id: "popt_01", status: "draft" } }),
      )
      expect(codes(result.blocking)).toContain("default_option_not_active")
    })

    it("blocks a default option with no units", () => {
      const result = evaluateProductReadiness(readyProduct({ defaultOptionUnitCount: 0 }))
      expect(codes(result.blocking)).toContain("no_option_units")
    })

    it("blocks a product with neither a sell price nor a pricing tier", () => {
      const result = evaluateProductReadiness(
        readyProduct({ sellAmountCents: null, pricingTierCount: 0 }),
      )
      expect(codes(result.blocking)).toContain("no_price")
    })

    it("accepts a pricing tier as the price source", () => {
      const result = evaluateProductReadiness(
        readyProduct({ sellAmountCents: null, pricingTierCount: 2 }),
      )
      expect(codes(result.issues)).not.toContain("no_price")
    })
  })

  describe("composition", () => {
    const multiDay = {
      durationMinutes: null,
      itineraryDurationDays: 7,
      defaultItinerary: { id: "pitin_01" },
      itineraryDayNumbers: [1, 2, 3, 4, 5, 6, 7],
    } satisfies Partial<ProductReadinessInput>

    it("does not ask a same-day product for an itinerary", () => {
      const result = evaluateProductReadiness(readyProduct())
      expect(codes(result.issues)).not.toContain("missing_itinerary")
    })

    it("blocks a multi-day product with no itinerary", () => {
      const result = evaluateProductReadiness(
        readyProduct({ ...multiDay, defaultItinerary: null, itineraryDayNumbers: [] }),
      )
      expect(codes(result.blocking)).toContain("missing_itinerary")
    })

    it("blocks a multi-day product whose itinerary has no days", () => {
      const result = evaluateProductReadiness(
        readyProduct({ ...multiDay, itineraryDayNumbers: [] }),
      )
      expect(codes(result.blocking)).toContain("empty_itinerary")
    })

    it("blocks non-consecutive itinerary days", () => {
      const result = evaluateProductReadiness(
        readyProduct({ ...multiDay, itineraryDayNumbers: [1, 2, 4] }),
      )
      expect(codes(result.blocking)).toContain("non_consecutive_itinerary_days")
    })

    it("accepts consecutive days supplied out of order", () => {
      const result = evaluateProductReadiness(
        readyProduct({ ...multiDay, itineraryDayNumbers: [3, 1, 2, 5, 4, 7, 6] }),
      )
      expect(codes(result.issues)).not.toContain("non_consecutive_itinerary_days")
    })

    it("asks an itinerary booking mode for a plan even when it lasts one day", () => {
      const result = evaluateProductReadiness(
        readyProduct({
          bookingMode: "itinerary",
          durationMinutes: 480,
          defaultItinerary: null,
          itineraryDayNumbers: [],
        }),
      )
      expect(codes(result.blocking)).toContain("missing_itinerary")
    })
  })

  describe("warnings never block", () => {
    it("warns but still publishes an unresolved duration", () => {
      const result = evaluateProductReadiness(
        readyProduct({ durationMinutes: null, itineraryDurationDays: null }),
      )
      expect(result.ready).toBe(true)
      expect(codes(result.warnings)).toContain("unresolved_duration")
    })

    it("warns but still publishes a product with no family", () => {
      const result = evaluateProductReadiness(readyProduct({ hasFamily: false }))
      expect(result.ready).toBe(true)
      expect(codes(result.warnings)).toContain("missing_family")
    })

    it("warns when a limited-capacity product defines no capacity anywhere", () => {
      const result = evaluateProductReadiness(readyProduct({ pax: null, hasSlotCapacity: false }))
      expect(result.ready).toBe(true)
      expect(codes(result.warnings)).toContain("missing_capacity_source")
    })

    it("does not ask an unlimited-capacity product for a capacity source", () => {
      const result = evaluateProductReadiness(
        readyProduct({ capacityMode: "unlimited", pax: null, hasSlotCapacity: false }),
      )
      expect(codes(result.issues)).not.toContain("missing_capacity_source")
    })

    it("warns when a scheduled product has no meeting point", () => {
      const result = evaluateProductReadiness(readyProduct({ hasMeetingPoint: false }))
      expect(codes(result.warnings)).toContain("missing_meeting_point")
    })

    it("warns when a planned service carries no cost", () => {
      const result = evaluateProductReadiness(
        readyProduct({ dayServiceCostAmountsCents: [12000, 0] }),
      )
      expect(codes(result.warnings)).toContain("incomplete_cost_basis")
    })

    it("does not warn when every planned service is costed", () => {
      const result = evaluateProductReadiness(
        readyProduct({ dayServiceCostAmountsCents: [12000, 3400] }),
      )
      expect(codes(result.issues)).not.toContain("incomplete_cost_basis")
    })

    it("warns on missing content and policy authoring", () => {
      const result = evaluateProductReadiness(
        readyProduct({ description: "  ", defaultLanguageTag: null, contractTemplateId: null }),
      )
      expect(result.ready).toBe(true)
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining([
          "missing_description",
          "missing_default_language",
          "missing_contract_template",
        ]),
      )
    })
  })

  describe("facts owned by another module", () => {
    it("warns when the product reaches no active channel", () => {
      const result = evaluateProductReadiness(readyProduct({ activeChannelCount: 0 }))
      expect(codes(result.warnings)).toContain("no_active_channel")
    })

    it("skips the channel check when distribution could not be resolved", () => {
      const result = evaluateProductReadiness(readyProduct({ activeChannelCount: null }))
      expect(codes(result.issues)).not.toContain("no_active_channel")
    })

    it("skips the meeting-point check when availability could not be resolved", () => {
      const result = evaluateProductReadiness(readyProduct({ hasMeetingPoint: null }))
      expect(codes(result.issues)).not.toContain("missing_meeting_point")
    })

    it("skips the allocation-template check when availability could not be resolved", () => {
      const result = evaluateProductReadiness(
        readyProduct({
          durationMinutes: null,
          itineraryDurationDays: 7,
          defaultItinerary: { id: "pitin_01" },
          itineraryDayNumbers: [1, 2, 3, 4, 5, 6, 7],
          hasAllocationTemplate: null,
        }),
      )
      expect(codes(result.issues)).not.toContain("missing_allocation_template")
    })

    it("never blocks publication on an unresolved external fact", () => {
      const result = evaluateProductReadiness(
        readyProduct({
          activeChannelCount: null,
          hasMeetingPoint: null,
          hasAllocationTemplate: null,
        }),
      )
      expect(result.ready).toBe(true)
    })
  })

  describe("a product that is not persisted yet", () => {
    /**
     * On create the product owns no options, units, prices or itinerary — those
     * rows are written after the insert. Refusing creation for them would make
     * an active product impossible to author.
     */
    const creating = {
      persisted: false,
      defaultOption: null,
      defaultOptionUnitCount: 0,
      pricingTierCount: 0,
      sellAmountCents: null,
      defaultItinerary: null,
      itineraryDayNumbers: [],
      futureOpenSlotCount: 0,
      hasSlotCapacity: false,
      hasMeetingPoint: false,
      hasAllocationTemplate: false,
      activeChannelCount: null,
    } satisfies Partial<ProductReadinessInput>

    it("is not blocked by child collections it cannot have authored yet", () => {
      const result = evaluateProductReadiness(readyProduct(creating))
      expect(codes(result.issues)).not.toContain("missing_default_option")
      expect(codes(result.issues)).not.toContain("no_option_units")
      expect(codes(result.issues)).not.toContain("no_price")
    })

    it("still refuses an active scheduled product with no departure", () => {
      const result = evaluateProductReadiness(readyProduct(creating))
      expect(result.ready).toBe(false)
      expect(codes(result.blocking)).toEqual(["no_future_open_departure"])
    })

    it("lets an active dynamically supplied product through", () => {
      const result = evaluateProductReadiness(readyProduct({ ...creating, bookingMode: "open" }))
      expect(result.ready).toBe(true)
    })

    it("still reports field-level warnings that are knowable from the product alone", () => {
      const result = evaluateProductReadiness(
        readyProduct({ ...creating, hasFamily: false, description: null }),
      )
      expect(codes(result.warnings)).toEqual(
        expect.arrayContaining(["missing_family", "missing_description"]),
      )
    })
  })

  it("marks every issue with a severity", () => {
    const result = evaluateProductReadiness(
      readyProduct({
        futureOpenSlotCount: 0,
        defaultOption: null,
        sellAmountCents: null,
        pricingTierCount: 0,
        hasFamily: false,
        description: null,
      }),
    )
    for (const issue of result.issues) {
      expect(["blocking", "warning"]).toContain(issue.severity)
      expect(issue.field).toBeTruthy()
      expect(issue.message).toBeTruthy()
      expect(issue.fix).toBeTruthy()
    }
  })
})
