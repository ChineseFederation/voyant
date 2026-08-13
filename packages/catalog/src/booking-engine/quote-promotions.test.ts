import { describe, expect, it } from "vitest"

import type { PricingBreakdownV1 } from "./contracts.js"
import type { AppliedOffer, PromotionEvaluationOutput } from "./promotions-contract.js"
import { applyPromotionsToBreakdown, promotionEvaluationInputFor } from "./quote-promotions.js"

/** €230.00 with 19% tax included — the shape the products handler emits. */
function inclusiveBreakdown(): PricingBreakdownV1 {
  return {
    currency: "EUR",
    lines: [
      {
        kind: "base",
        label: "Evening tasting walk",
        quantity: 1,
        unitAmount: 23_000,
        totalAmount: 23_000,
        taxIncluded: true,
      },
    ],
    taxes: [
      {
        code: "VAT",
        label: "VAT",
        rate: 0.19,
        amount: 3671,
        base: 19_329,
        includedInPrice: true,
        scope: "included",
      },
    ],
    subtotal: 19_329,
    taxTotal: 3671,
    total: 23_000,
  }
}

function offer(overrides: Partial<AppliedOffer> = {}): AppliedOffer {
  return {
    offerId: "prof_greek",
    offerName: "Greek islands late summer",
    discountAppliedCents: 3450,
    discountedPriceCents: 19_550,
    currency: "EUR",
    discountKind: "percentage",
    discountPercent: 15,
    discountAmountCents: null,
    appliedCode: "GREEK15",
    stackable: false,
    ...overrides,
  }
}

function evaluation(overrides: Partial<PromotionEvaluationOutput> = {}): PromotionEvaluationOutput {
  return {
    applied: [offer()],
    total: { discountAppliedCents: 3450, discountedPriceCents: 19_550 },
    codeStatus: { kind: "code_valid" },
    ...overrides,
  }
}

describe("applyPromotionsToBreakdown", () => {
  it("discounts the total and keeps subtotal + tax equal to it", () => {
    const result = applyPromotionsToBreakdown(inclusiveBreakdown(), evaluation())

    // The €230.00 → €195.50 the reporter expected in voyant#4615.
    expect(result.total).toBe(19_550)
    expect(result.subtotal + result.taxTotal).toBe(result.total)
    // Tax follows the discount instead of staying at its old cash amount:
    // 3671 x 19550/23000 = 3120 (a cent under the 3121 a fresh 19%-inclusive
    // computation gives, which is the rounding the ratio costs).
    expect(result.taxTotal).toBe(3120)
    expect(result.taxes[0]?.amount).toBe(3120)
    expect(result.taxes[0]?.base).toBe(result.subtotal)
  })

  it("leaves the base lines untouched and adds one discount line per offer", () => {
    const result = applyPromotionsToBreakdown(inclusiveBreakdown(), evaluation())

    // fillMissingBookingItemSellAmounts reconciles item lines to the accepted
    // sell total using the base lines as weights, so rewriting them here would
    // double-apply the discount at commit.
    expect(result.lines[0]).toEqual(inclusiveBreakdown().lines[0])
    expect(result.lines[1]).toEqual({
      kind: "discount",
      label: "Greek islands late summer",
      quantity: 1,
      unitAmount: -3450,
      totalAmount: -3450,
    })
  })

  it("carries the applied offers so the commit can freeze them", () => {
    const result = applyPromotionsToBreakdown(inclusiveBreakdown(), evaluation())

    expect(result.appliedOffers).toEqual([offer()])
    expect(result.promotionCodeStatus).toEqual({ kind: "code_valid" })
  })

  it("reports a rejected code without touching the price", () => {
    const result = applyPromotionsToBreakdown(
      inclusiveBreakdown(),
      evaluation({
        applied: [],
        total: { discountAppliedCents: 0, discountedPriceCents: 23_000 },
        codeStatus: { kind: "code_expired" },
      }),
    )

    expect(result.total).toBe(23_000)
    expect(result.lines).toHaveLength(1)
    expect(result.appliedOffers).toBeUndefined()
    expect(result.promotionCodeStatus).toEqual({ kind: "code_expired" })
  })

  it("does not call a code valid when it discounted nothing", () => {
    // The evaluator settles validity before the eligibility filter, so an
    // unanswerable flag (past guest, family) parks the offer in its
    // "conditional" bucket while the code still reads `code_valid`. Saying
    // "applied" next to an unchanged total is the conflation #4615 was about.
    const result = applyPromotionsToBreakdown(
      inclusiveBreakdown(),
      evaluation({
        applied: [],
        total: { discountAppliedCents: 0, discountedPriceCents: 23_000 },
        codeStatus: { kind: "code_valid" },
      }),
    )

    expect(result.promotionCodeStatus).toEqual({
      kind: "code_not_applicable",
      reason: "eligibility",
    })
  })

  it("keeps a code valid when a better auto offer won the stacking pick", () => {
    const auto = offer({ offerId: "prof_auto", offerName: "Late summer", appliedCode: null })
    const result = applyPromotionsToBreakdown(inclusiveBreakdown(), evaluation({ applied: [auto] }))

    expect(result.promotionCodeStatus).toEqual({ kind: "code_valid" })
    expect(result.total).toBe(19_550)
  })

  it("never discounts below zero", () => {
    const result = applyPromotionsToBreakdown(
      inclusiveBreakdown(),
      evaluation({
        applied: [offer({ discountAppliedCents: 99_999 })],
        total: { discountAppliedCents: 99_999, discountedPriceCents: -76_999 },
      }),
    )

    expect(result.total).toBe(0)
    expect(result.subtotal).toBe(0)
    expect(result.taxTotal).toBe(0)
  })

  it("allocates the tax rounding residual so the rows still sum to the tax total", () => {
    const breakdown: PricingBreakdownV1 = {
      ...inclusiveBreakdown(),
      taxes: [
        { code: "A", label: "A", rate: 0.1, amount: 1000, base: 10_000 },
        { code: "B", label: "B", rate: 0.09, amount: 2671, base: 10_000 },
      ],
    }
    const result = applyPromotionsToBreakdown(breakdown, evaluation())

    expect(result.taxes.reduce((sum, tax) => sum + tax.amount, 0)).toBe(result.taxTotal)
  })

  it("passes through an untouched breakdown when no code was sent and nothing applied", () => {
    const breakdown = inclusiveBreakdown()
    const result = applyPromotionsToBreakdown(breakdown, {
      applied: [],
      total: { discountAppliedCents: 0, discountedPriceCents: 23_000 },
      codeStatus: null,
    })

    expect(result).toEqual(breakdown)
  })
})

describe("promotionEvaluationInputFor", () => {
  it("prices the discount against the quote total the customer would pay", () => {
    const input = promotionEvaluationInputFor({
      productId: "prod_1",
      breakdown: inclusiveBreakdown(),
      scope: { market: "ro" },
      audience: "staff",
      pax: 2,
      at: new Date("2026-08-13T10:00:00Z"),
      code: "GREEK15",
      hasChildTraveler: false,
    })

    expect(input).toEqual({
      productId: "prod_1",
      slice: { audience: "staff", market: "ro" },
      pax: 2,
      eligibility: { hasChildTraveler: false },
      date: new Date("2026-08-13T10:00:00Z"),
      code: "GREEK15",
      basePriceCents: 23_000,
      baseCurrency: "EUR",
    })
  })

  it("omits the code entirely when none was typed, so auto offers still evaluate", () => {
    const input = promotionEvaluationInputFor({
      productId: "prod_1",
      breakdown: inclusiveBreakdown(),
      scope: { market: "default" },
      audience: "customer",
      pax: 1,
      at: new Date("2026-08-13T10:00:00Z"),
      code: null,
    })

    expect(input.code).toBeUndefined()
    expect("eligibility" in input).toBe(false)
  })
})
