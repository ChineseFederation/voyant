import { describe, expect, it } from "vitest"

import { resolveBreakEven } from "../../src/service-profitability.js"
import {
  evaluateProfitabilityIssues,
  type ProfitabilityIssueInput,
} from "../../src/service-profitability-issues.js"

function facts(overrides: Partial<ProfitabilityIssueInput> = {}): ProfitabilityIssueInput {
  return {
    departureId: "avsl_1",
    hasRevenue: false,
    actualCostCents: 0,
    plannedCostCents: 0,
    committedCostCents: 0,
    versionResolved: false,
    linesMissingCostBlock: 0,
    hasUnconvertibleAmount: false,
    ...overrides,
  }
}

describe("evaluateProfitabilityIssues", () => {
  it("flags revenue with no cost of any kind as a suspicious full margin", () => {
    const issues = evaluateProfitabilityIssues(facts({ hasRevenue: true }))
    expect(issues.map((i) => i.code)).toContain("suspicious_full_margin")
    // Same fact also means we cannot trust variance → missing planned cost.
    expect(issues.map((i) => i.code)).toContain("missing_planned_cost")
    for (const issue of issues) expect(issue.subjectId).toBe("avsl_1")
  })

  it("flags planned/committed cost with no attribution, but not as a full margin", () => {
    const issues = evaluateProfitabilityIssues(
      facts({ hasRevenue: true, committedCostCents: 5000 }),
    )
    const codes = issues.map((i) => i.code)
    expect(codes).toContain("incomplete_supplier_attribution")
    // A known commitment rules out the "no cost anywhere" full-margin signal.
    expect(codes).not.toContain("suspicious_full_margin")
  })

  it("flags a version-bound departure whose frozen service declared no cost block", () => {
    const issues = evaluateProfitabilityIssues(
      facts({
        versionResolved: true,
        plannedCostCents: 4000,
        actualCostCents: 4000,
        linesMissingCostBlock: 2,
      }),
    )
    expect(issues.map((i) => i.code)).toContain("missing_planned_cost")
  })

  it("raises rollup_disagreement (critical) for an unconvertible currency, sorted first", () => {
    const issues = evaluateProfitabilityIssues(
      facts({ hasRevenue: true, hasUnconvertibleAmount: true }),
    )
    expect(issues[0]?.code).toBe("rollup_disagreement")
    expect(issues[0]?.severity).toBe("critical")
  })

  it("returns nothing for a clean, fully-attributed departure", () => {
    const issues = evaluateProfitabilityIssues(
      facts({
        hasRevenue: true,
        versionResolved: true,
        plannedCostCents: 4000,
        actualCostCents: 4200,
      }),
    )
    expect(issues).toEqual([])
  })
})

describe("resolveBreakEven", () => {
  const base = {
    versionResolved: true,
    revenueCents: 100000,
    bookedPax: 10,
    fixedCents: 30000,
    perPaxRateCents: 2000,
  }

  it("computes break-even from the fixed/variable split and realized price per pax", () => {
    // price/pax = 100000/10 = 10000; contribution = 10000 − 2000 = 8000;
    // break-even pax = 30000/8000 = 3.75; break-even revenue = 3.75 × 10000 = 37500.
    expect(resolveBreakEven(base)).toBe(37500)
  })

  it("returns null when the cost basis is a fallback lump (not version-bound)", () => {
    expect(resolveBreakEven({ ...base, versionResolved: false })).toBeNull()
  })

  it("returns null when contribution margin is not positive", () => {
    expect(resolveBreakEven({ ...base, perPaxRateCents: 12000 })).toBeNull()
  })

  it("returns null without a price basis (no pax or no revenue)", () => {
    expect(resolveBreakEven({ ...base, bookedPax: 0 })).toBeNull()
    expect(resolveBreakEven({ ...base, revenueCents: 0 })).toBeNull()
  })
})
