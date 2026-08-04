import { describe, expect, it } from "vitest"

import { computeMarginPercent, sumCostByCurrency } from "../../src/service-product-cost.js"

/**
 * Unit tests for the two pure halves of the product cost roll-up: totalling
 * service costs per source currency, and deriving the margin once the cost is
 * known in the sell currency. These used to re-implement both formulas locally,
 * which let the real ones drift (voyant#4162) — they now drive the exported
 * helpers.
 */

describe("Product cost recalculation", () => {
  describe("sumCostByCurrency", () => {
    it("returns no subtotals for empty services", () => {
      expect(sumCostByCurrency([])).toEqual([])
    })

    it("sums a single service cost", () => {
      expect(sumCostByCurrency([{ currency: "EUR", amountCents: 5000 }])).toEqual([
        { currency: "EUR", amountCents: 5000 },
      ])
    })

    it("sums multiple services in the same currency", () => {
      expect(
        sumCostByCurrency([
          { currency: "EUR", amountCents: 5000 },
          { currency: "EUR", amountCents: 6000 },
          { currency: "EUR", amountCents: 1000 },
        ]),
      ).toEqual([{ currency: "EUR", amountCents: 12000 }])
    })

    it("keeps different currencies apart instead of adding their minor units", () => {
      expect(
        sumCostByCurrency([
          { currency: "EUR", amountCents: 5000 },
          { currency: "TRY", amountCents: 500_000 },
        ]),
      ).toEqual([
        { currency: "EUR", amountCents: 5000 },
        { currency: "TRY", amountCents: 500_000 },
      ])
    })

    it("normalizes currency codes so one currency is not counted as two", () => {
      expect(
        sumCostByCurrency([
          { currency: "eur", amountCents: 5000 },
          { currency: " EUR ", amountCents: 3000 },
        ]),
      ).toEqual([{ currency: "EUR", amountCents: 8000 }])
    })
  })

  describe("computeMarginPercent", () => {
    it("has no margin when the sell amount is 0", () => {
      expect(computeMarginPercent(0, 5000)).toBeNull()
    })

    it("has no margin when the sell amount is negative", () => {
      expect(computeMarginPercent(-1000, 5000)).toBeNull()
    })

    it("has no margin when the product carries no sell amount", () => {
      expect(computeMarginPercent(null, 5000)).toBeNull()
    })

    it("has no margin when the cost could not be resolved", () => {
      expect(computeMarginPercent(10000, null)).toBeNull()
    })

    it("computes 100% margin when cost is 0", () => {
      expect(computeMarginPercent(10000, 0)).toBe(100)
    })

    it("computes correct margin for typical case", () => {
      // sell: 100.00, cost: 70.00 → margin = (100 - 70) / 100 * 100 = 30%
      expect(computeMarginPercent(10000, 7000)).toBe(30)
    })

    it("computes 50% margin", () => {
      // sell: 200.00, cost: 100.00 → margin = 50%
      expect(computeMarginPercent(20000, 10000)).toBe(50)
    })

    it("handles negative margin (cost > sell)", () => {
      // sell: 100.00, cost: 120.00 → margin = (100 - 120) / 100 * 100 = -20%
      expect(computeMarginPercent(10000, 12000)).toBe(-20)
    })

    it("rounds to nearest integer", () => {
      // sell: 300.00, cost: 200.00 → margin = 33.33... → rounds to 33
      expect(computeMarginPercent(30000, 20000)).toBe(33)
    })

    it("computes margin for small amounts", () => {
      // sell: 1.00, cost: 0.50 → margin = 50%
      expect(computeMarginPercent(100, 50)).toBe(50)
    })
  })
})
