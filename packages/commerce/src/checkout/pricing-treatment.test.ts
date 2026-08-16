import { describe, expect, it, vi } from "vitest"

import {
  assertChargeableBookingItem,
  type BookingItemChargeRule,
  type BookingItemPricingTreatmentFacts,
  isPassThroughLine,
  PassThroughLineNotChargeableError,
  resolveBookingItemChargeTargets,
  selectChargeableBookingItems,
} from "./pricing-treatment.js"

type Line = BookingItemPricingTreatmentFacts & { id: string; totalSellAmountCents: number }

const standardLine: Line = {
  id: "item_tour",
  totalSellAmountCents: 240000,
  pricingTreatment: "standard",
}

const legacyLine: Line = {
  id: "item_legacy",
  totalSellAmountCents: 12000,
}

const premiumLine: Line = {
  id: "item_premium",
  totalSellAmountCents: 4500,
  pricingTreatment: "pass_through",
  taxTreatmentCode: "insurance/exempt",
}

describe("pricing treatment", () => {
  it("reads a line written before the column existed as standard", () => {
    expect(isPassThroughLine(legacyLine)).toBe(false)
    expect(isPassThroughLine(premiumLine)).toBe(true)
  })

  it("keeps pass-through lines out of the chargeable set", () => {
    expect(
      selectChargeableBookingItems([standardLine, premiumLine, legacyLine]).map((l) => l.id),
    ).toEqual(["item_tour", "item_legacy"])
  })
})

describe("resolveBookingItemChargeTargets", () => {
  /**
   * The rule here is the worst case on purpose: it matches everything, the way
   * an operator's default markup or a blanket commission agreement does. The
   * exclusion has to come from the line, not from the rule being narrow.
   */
  const matchesEverything: BookingItemChargeRule<Line> = {
    id: "rule_default_markup",
    matches: vi.fn(() => true),
  }

  it("does not offer a pass-through line to a rule that would otherwise match", () => {
    const targets = resolveBookingItemChargeTargets(
      [standardLine, premiumLine],
      [matchesEverything],
    )

    expect(targets.map((t) => t.item.id)).toEqual(["item_tour"])
    expect(targets.map((t) => t.ruleId)).toEqual(["rule_default_markup"])
  })

  it("never even asks the rule about a pass-through line", () => {
    const matches = vi.fn(() => true)
    resolveBookingItemChargeTargets([standardLine, premiumLine], [{ id: "rule_x", matches }])

    expect(matches).toHaveBeenCalledTimes(1)
    expect(matches).toHaveBeenCalledWith(standardLine)
  })

  it("yields nothing at all when every matching line is pass-through", () => {
    expect(resolveBookingItemChargeTargets([premiumLine], [matchesEverything])).toEqual([])
  })
})

describe("assertChargeableBookingItem", () => {
  it("refuses a commission written directly against a pass-through line", () => {
    expect(() => assertChargeableBookingItem(premiumLine, "a commission")).toThrow(
      PassThroughLineNotChargeableError,
    )
  })

  it("allows a standard line through", () => {
    expect(() => assertChargeableBookingItem(standardLine, "a commission")).not.toThrow()
  })
})
