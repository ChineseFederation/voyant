import { describe, expect, it } from "vitest"
import type { CancellationRule } from "../../src/policies/service.js"
import {
  evaluateCancellationPolicy,
  evaluateCancellationSnapshot,
} from "../../src/policies/service.js"

/**
 * Unit tests for `evaluateCancellationPolicy`. Rules are sorted by
 * `daysBeforeDeparture` descending; first rule whose threshold is satisfied
 * by the caller's `daysBeforeDeparture` applies.
 * `refundPercent` is basis points (10000 = 100%).
 */

function rule(overrides: Partial<CancellationRule> = {}): CancellationRule {
  return {
    id: overrides.id,
    daysBeforeDeparture: overrides.daysBeforeDeparture ?? null,
    refundPercent: overrides.refundPercent ?? null,
    refundType: overrides.refundType ?? null,
    flatAmountCents: overrides.flatAmountCents ?? null,
    label: overrides.label ?? null,
  }
}

describe("evaluateCancellationPolicy", () => {
  it("returns zero refund when no rules are provided", () => {
    const result = evaluateCancellationPolicy([], {
      daysBeforeDeparture: 30,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result).toEqual({
      refundPercent: 0,
      refundCents: 0,
      refundType: "none",
      appliedRule: null,
    })
  })

  it("applies the rule whose threshold is satisfied (far out)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 30, refundPercent: 9000, refundType: "cash", label: "30+" }),
      rule({ daysBeforeDeparture: 15, refundPercent: 7000, refundType: "cash", label: "15-29" }),
      rule({ daysBeforeDeparture: 7, refundPercent: 5000, refundType: "cash", label: "7-14" }),
      rule({ daysBeforeDeparture: 0, refundPercent: 0, refundType: "none", label: "<7" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 45,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(9000)
    expect(result.refundCents).toBe(90000)
    expect(result.refundType).toBe("cash")
    expect(result.appliedRule?.label).toBe("30+")
  })

  it("applies the middle window (15-29 days)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 30, refundPercent: 9000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 15, refundPercent: 7000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 7, refundPercent: 5000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 0, refundPercent: 0, refundType: "none" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 20,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(7000)
    expect(result.refundCents).toBe(70000)
  })

  it("applies the tight window (7-14 days)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 30, refundPercent: 9000 }),
      rule({ daysBeforeDeparture: 15, refundPercent: 7000 }),
      rule({ daysBeforeDeparture: 7, refundPercent: 5000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 0, refundPercent: 0, refundType: "none" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 10,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(5000)
    expect(result.refundCents).toBe(50000)
    expect(result.refundType).toBe("cash")
  })

  it("applies the innermost window when inside it (<7 days)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 30, refundPercent: 9000 }),
      rule({ daysBeforeDeparture: 7, refundPercent: 5000 }),
      rule({ daysBeforeDeparture: 0, refundPercent: 0, refundType: "none" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 3,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(0)
    expect(result.refundCents).toBe(0)
    expect(result.refundType).toBe("none")
  })

  it("uses the lowest-threshold rule when caller is past it (boundary case: 0 days)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 7, refundPercent: 5000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 0, refundPercent: 1000, refundType: "credit" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 0,
      totalCents: 50000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(1000)
    expect(result.refundCents).toBe(5000)
    expect(result.refundType).toBe("credit")
  })

  it("handles exact boundary match (days === threshold)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 30, refundPercent: 9000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 15, refundPercent: 7000, refundType: "cash" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 30,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(9000)
  })

  it("sorts unordered input rules before evaluating", () => {
    const rules = [
      rule({ daysBeforeDeparture: 0, refundPercent: 0, refundType: "none" }),
      rule({ daysBeforeDeparture: 30, refundPercent: 9000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 7, refundPercent: 5000, refundType: "cash" }),
      rule({ daysBeforeDeparture: 15, refundPercent: 7000, refundType: "cash" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 45,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(9000)
  })

  it("uses flatAmountCents when provided, bypassing percentage calculation", () => {
    const rules = [
      rule({
        daysBeforeDeparture: 30,
        refundPercent: 9000,
        flatAmountCents: 12345,
        refundType: "cash",
      }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 40,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundCents).toBe(12345)
    expect(result.refundPercent).toBe(9000)
  })

  it("floors fractional percentage results", () => {
    const rules = [rule({ daysBeforeDeparture: 0, refundPercent: 3333, refundType: "cash" })]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 100,
      totalCents: 10000,
      currency: "USD",
    })
    // 10000 * 3333 / 10000 = 3333
    expect(result.refundCents).toBe(3333)
  })

  it("floors rounding when percentage causes non-integer cents", () => {
    const rules = [rule({ daysBeforeDeparture: 0, refundPercent: 3333, refundType: "cash" })]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 100,
      totalCents: 10001,
      currency: "USD",
    })
    // 10001 * 3333 / 10000 = 3333.6333 → 3333
    expect(result.refundCents).toBe(3333)
  })

  it("treats null refundPercent as zero", () => {
    const rules = [rule({ daysBeforeDeparture: 0, refundPercent: null, refundType: "cash" })]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 100,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundPercent).toBe(0)
    expect(result.refundCents).toBe(0)
  })

  it("defaults refundType to none when rule has null refundType", () => {
    const rules = [rule({ daysBeforeDeparture: 0, refundPercent: 5000, refundType: null })]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 100,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundType).toBe("none")
  })

  it("preserves refundType passthrough (cash_or_credit)", () => {
    const rules = [
      rule({ daysBeforeDeparture: 0, refundPercent: 5000, refundType: "cash_or_credit" }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 100,
      totalCents: 100000,
      currency: "USD",
    })
    expect(result.refundType).toBe("cash_or_credit")
  })

  it("handles single-rule policies", () => {
    const rules = [rule({ daysBeforeDeparture: 14, refundPercent: 5000, refundType: "cash" })]

    const inside = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 20,
      totalCents: 10000,
      currency: "USD",
    })
    expect(inside.refundPercent).toBe(5000)
    expect(inside.refundCents).toBe(5000)

    // Below threshold: the single rule is the only option, falls back to it
    const below = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 5,
      totalCents: 10000,
      currency: "USD",
    })
    expect(below.refundPercent).toBe(5000)
  })

  it("includes the applied rule in the result", () => {
    const rules = [
      rule({
        id: "plrl_abc",
        daysBeforeDeparture: 14,
        refundPercent: 5000,
        refundType: "cash",
        label: "2-week window",
      }),
    ]
    const result = evaluateCancellationPolicy(rules, {
      daysBeforeDeparture: 20,
      totalCents: 10000,
      currency: "USD",
    })
    expect(result.appliedRule).not.toBeNull()
    expect(result.appliedRule?.id).toBe("plrl_abc")
    expect(result.appliedRule?.label).toBe("2-week window")
  })
})

describe("evaluateCancellationSnapshot", () => {
  const snapshot = {
    schemaVersion: 1 as const,
    policyId: "pol_cancel",
    policyVersionId: "polv_sale",
    version: 1,
    capturedAt: "2026-06-01T10:00:00.000Z",
    rules: [
      {
        id: "rule_sale",
        daysBeforeDeparture: 14,
        refundPercent: 7500,
        refundType: "cash" as const,
        flatAmountCents: null,
        currency: "EUR",
        label: "Sale terms",
      },
    ],
  }

  it("evaluates the frozen version without consulting current policy state", () => {
    expect(
      evaluateCancellationSnapshot(snapshot, {
        daysBeforeDeparture: 20,
        totalCents: 20_000,
        currency: "EUR",
      }),
    ).toEqual({
      status: "evaluated",
      policyId: "pol_cancel",
      policyVersionId: "polv_sale",
      version: 1,
      result: {
        refundPercent: 7500,
        refundCents: 15_000,
        refundType: "cash",
        appliedRule: snapshot.rules[0],
      },
    })
  })

  it("fails closed for malformed evidence", () => {
    expect(
      evaluateCancellationSnapshot(
        { ...snapshot, policyVersionId: "" },
        {
          daysBeforeDeparture: 20,
          totalCents: 20_000,
          currency: "EUR",
        },
      ),
    ).toEqual({ status: "unknown", reason: "invalid_snapshot" })
  })

  it("fails closed when a flat refund currency differs", () => {
    expect(
      evaluateCancellationSnapshot(
        {
          ...snapshot,
          rules: [{ ...snapshot.rules[0], refundPercent: null, flatAmountCents: 5_000 }],
        },
        { daysBeforeDeparture: 20, totalCents: 20_000, currency: "USD" },
      ),
    ).toEqual({ status: "unknown", reason: "currency_mismatch" })
  })
})
