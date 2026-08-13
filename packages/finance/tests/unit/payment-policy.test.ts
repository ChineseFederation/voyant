import { describe, expect, it } from "vitest"

import {
  computePaymentSchedule,
  isPaymentPolicyEmpty,
  noDepositPolicy,
  normalizePaymentPolicy,
  type PaymentPolicy,
  policyShouldRequireFullPayment,
  resolveEffectivePaymentPolicy,
} from "../../src/payment-policy.js"

const fixedToday = new Date("2026-01-01T12:00:00Z")

const fiftyFifty: PaymentPolicy = {
  deposit: { kind: "percent", percent: 50 },
  minDaysBeforeDepartureForDeposit: 30,
  balanceDueDaysBeforeDeparture: 30,
  balanceDueMinDaysFromNow: 7,
}

const legacyDepositPolicy = {
  type: "deposit",
  depositPercent: 30,
  balanceDueDays: 30,
}

describe("normalizePaymentPolicy", () => {
  it("maps the legacy operator default shape to the current payment policy shape", () => {
    expect(normalizePaymentPolicy(legacyDepositPolicy)).toEqual({
      deposit: { kind: "percent", percent: 30 },
      minDaysBeforeDepartureForDeposit: 0,
      balanceDueDaysBeforeDeparture: 30,
      balanceDueMinDaysFromNow: 0,
    })
  })

  it("preserves current payment policy objects", () => {
    expect(normalizePaymentPolicy(fiftyFifty)).toBe(fiftyFifty)
  })

  it("returns null for malformed values", () => {
    expect(normalizePaymentPolicy({ type: "deposit", depositPercent: 120 })).toBeNull()
    expect(normalizePaymentPolicy({})).toBeNull()
  })
})

describe("computePaymentSchedule", () => {
  it("emits a single full-payment row for a no-deposit policy", () => {
    const rows = computePaymentSchedule(
      { totalCents: 250_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      noDepositPolicy,
    )
    expect(rows).toEqual([
      { scheduleType: "full", amountCents: 250_000, currency: "EUR", dueDate: "2026-01-01" },
    ])
  })

  it("emits 50/50 deposit + balance when departure is comfortably out", () => {
    const rows = computePaymentSchedule(
      { totalCents: 250_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      fiftyFifty,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      scheduleType: "deposit",
      amountCents: 125_000,
      currency: "EUR",
      dueDate: "2026-01-01",
    })
    expect(rows[1]).toEqual({
      scheduleType: "balance",
      amountCents: 125_000,
      currency: "EUR",
      // 30 days before 2026-06-15
      dueDate: "2026-05-16",
    })
  })

  it("forces full payment when departure is within the deposit gate", () => {
    const rows = computePaymentSchedule(
      // 10 days out, gate is 30
      { totalCents: 100_000, currency: "EUR", departureDate: "2026-01-11", today: fixedToday },
      fiftyFifty,
    )
    expect(rows).toEqual([
      { scheduleType: "full", amountCents: 100_000, currency: "EUR", dueDate: "2026-01-01" },
    ])
  })

  it("clamps the balance due date to balanceDueMinDaysFromNow", () => {
    // Departure is 35 days out (passes the 30-day gate), but
    // 30-days-before-departure resolves to 5 days from now — under
    // the 7-day grace floor. The clamp should kick in.
    const rows = computePaymentSchedule(
      { totalCents: 100_000, currency: "EUR", departureDate: "2026-02-05", today: fixedToday },
      fiftyFifty,
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]?.dueDate).toBe("2026-01-08")
  })

  it("supports a fixed-cents deposit", () => {
    const rows = computePaymentSchedule(
      { totalCents: 250_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      {
        ...fiftyFifty,
        deposit: { kind: "fixed_cents", amountCents: 50_000 },
      },
    )
    expect(rows[0]?.amountCents).toBe(50_000)
    expect(rows[1]?.amountCents).toBe(200_000)
  })

  it("caps a fixed deposit at total when it exceeds the total", () => {
    const rows = computePaymentSchedule(
      { totalCents: 30_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      {
        ...fiftyFifty,
        deposit: { kind: "fixed_cents", amountCents: 50_000 },
      },
    )
    // Deposit clamped to total → balance is 0 → collapses to a
    // single full-payment row.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scheduleType).toBe("full")
    expect(rows[0]?.amountCents).toBe(30_000)
  })

  it("falls back to full upfront when departure date is missing", () => {
    const rows = computePaymentSchedule(
      { totalCents: 100_000, currency: "EUR", departureDate: null, today: fixedToday },
      fiftyFifty,
    )
    expect(rows).toEqual([
      { scheduleType: "full", amountCents: 100_000, currency: "EUR", dueDate: "2026-01-01" },
    ])
  })

  it("rounds percent deposits to whole cents", () => {
    const rows = computePaymentSchedule(
      // 33% of 100 is 33.0 cents → 33 cents.
      { totalCents: 100, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      {
        ...fiftyFifty,
        deposit: { kind: "percent", percent: 33 },
      },
    )
    expect(rows[0]?.amountCents).toBe(33)
    expect(rows[1]?.amountCents).toBe(67)
  })

  it("collapses to a single row when deposit percent resolves to 0", () => {
    const rows = computePaymentSchedule(
      { totalCents: 100_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      {
        ...fiftyFifty,
        deposit: { kind: "percent", percent: 0 },
      },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.scheduleType).toBe("full")
  })

  it("collapses to a single row for a zero-cents booking", () => {
    const rows = computePaymentSchedule(
      { totalCents: 0, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      fiftyFifty,
    )
    expect(rows).toEqual([
      { scheduleType: "full", amountCents: 0, currency: "EUR", dueDate: "2026-01-01" },
    ])
  })

  it("falls back to no-deposit instead of throwing for malformed policy JSON", () => {
    const rows = computePaymentSchedule(
      { totalCents: 100_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      {} as PaymentPolicy,
    )
    expect(rows).toEqual([
      { scheduleType: "full", amountCents: 100_000, currency: "EUR", dueDate: "2026-01-01" },
    ])
  })

  it("computes schedules from the legacy operator default shape", () => {
    const rows = computePaymentSchedule(
      { totalCents: 100_000, currency: "EUR", departureDate: "2026-06-15", today: fixedToday },
      legacyDepositPolicy as PaymentPolicy,
    )

    expect(rows[0]).toMatchObject({
      scheduleType: "deposit",
      amountCents: 30_000,
    })
    expect(rows[1]).toMatchObject({
      scheduleType: "balance",
      amountCents: 70_000,
      dueDate: "2026-05-16",
    })
  })
})

describe("resolveEffectivePaymentPolicy", () => {
  it("returns the operator default when no overrides are set", () => {
    const result = resolveEffectivePaymentPolicy({
      operatorDefault: fiftyFifty,
    })
    expect(result.source).toBe("operator_default")
    expect(result.policy).toBe(fiftyFifty)
  })

  it("supplier override wins over operator default", () => {
    const result = resolveEffectivePaymentPolicy({
      supplierPolicy: noDepositPolicy,
      operatorDefault: fiftyFifty,
    })
    expect(result.source).toBe("supplier")
    expect(result.policy).toBe(noDepositPolicy)
  })

  it("category override wins over supplier", () => {
    const result = resolveEffectivePaymentPolicy({
      categoryPolicy: fiftyFifty,
      supplierPolicy: noDepositPolicy,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("category")
  })

  it("listing override wins over category", () => {
    const result = resolveEffectivePaymentPolicy({
      listingPolicy: fiftyFifty,
      categoryPolicy: noDepositPolicy,
      supplierPolicy: noDepositPolicy,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("listing")
  })

  it("accepted-proposal terms beat every catalog layer", () => {
    // What the customer agreed to when they accepted the offer outranks a
    // listing's or supplier's default — a quoted trip is negotiated per client.
    const result = resolveEffectivePaymentPolicy({
      proposalPolicy: fiftyFifty,
      listingPolicy: noDepositPolicy,
      categoryPolicy: noDepositPolicy,
      supplierPolicy: noDepositPolicy,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("proposal")
    expect(result.policy).toBe(fiftyFifty)
  })

  it("booking override beats every other layer", () => {
    const result = resolveEffectivePaymentPolicy({
      bookingPolicy: fiftyFifty,
      proposalPolicy: noDepositPolicy,
      listingPolicy: noDepositPolicy,
      categoryPolicy: noDepositPolicy,
      supplierPolicy: noDepositPolicy,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("booking")
  })

  it("falls past a proposal that stated no terms", () => {
    const result = resolveEffectivePaymentPolicy({
      proposalPolicy: null,
      listingPolicy: fiftyFifty,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("listing")
  })

  it("skips malformed policy layers and falls back to the next valid layer", () => {
    const result = resolveEffectivePaymentPolicy({
      bookingPolicy: {} as PaymentPolicy,
      listingPolicy: { deposit: {} } as PaymentPolicy,
      categoryPolicy: fiftyFifty,
      operatorDefault: noDepositPolicy,
    })
    expect(result.source).toBe("category")
    expect(result.policy).toBe(fiftyFifty)
  })

  it("falls back to no-deposit when the operator default is malformed", () => {
    const result = resolveEffectivePaymentPolicy({
      operatorDefault: {} as PaymentPolicy,
    })
    expect(result.source).toBe("operator_default")
    expect(result.policy).toEqual(noDepositPolicy)
  })

  it("normalizes a legacy operator default policy", () => {
    const result = resolveEffectivePaymentPolicy({
      operatorDefault: legacyDepositPolicy as PaymentPolicy,
    })

    expect(result.source).toBe("operator_default")
    expect(result.policy).toEqual({
      deposit: { kind: "percent", percent: 30 },
      minDaysBeforeDepartureForDeposit: 0,
      balanceDueDaysBeforeDeparture: 30,
      balanceDueMinDaysFromNow: 0,
    })
  })
})

describe("policyShouldRequireFullPayment", () => {
  it("returns true for a no-deposit policy regardless of date", () => {
    expect(policyShouldRequireFullPayment(noDepositPolicy, "2026-06-15", fixedToday)).toBe(true)
  })

  it("returns true when departure is too close", () => {
    expect(policyShouldRequireFullPayment(fiftyFifty, "2026-01-15", fixedToday)).toBe(true)
  })

  it("returns false when the deposit gate is satisfied", () => {
    expect(policyShouldRequireFullPayment(fiftyFifty, "2026-06-15", fixedToday)).toBe(false)
  })

  it("returns true when departure date is missing", () => {
    expect(policyShouldRequireFullPayment(fiftyFifty, null, fixedToday)).toBe(true)
  })
})

describe("isPaymentPolicyEmpty", () => {
  it("returns true for null/undefined", () => {
    expect(isPaymentPolicyEmpty(null)).toBe(true)
    expect(isPaymentPolicyEmpty(undefined)).toBe(true)
  })

  it("returns true for the no-deposit default", () => {
    expect(isPaymentPolicyEmpty(noDepositPolicy)).toBe(true)
  })

  it("returns true when deposit percent resolves to 0", () => {
    expect(
      isPaymentPolicyEmpty({
        ...fiftyFifty,
        deposit: { kind: "percent", percent: 0 },
      }),
    ).toBe(true)
  })

  it("returns false for a meaningful policy", () => {
    expect(isPaymentPolicyEmpty(fiftyFifty)).toBe(false)
  })
})
