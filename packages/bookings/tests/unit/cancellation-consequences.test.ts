import { describe, expect, it, vi } from "vitest"

import {
  type BookingCancellationConsequenceItemInput,
  resolveBookingCancellationConsequences,
} from "../../src/cancellation-consequences.js"

const AS_OF = new Date("2026-08-01T00:00:00.000Z")

function item(
  overrides: Partial<BookingCancellationConsequenceItemInput> = {},
): BookingCancellationConsequenceItemInput {
  return {
    id: "item_1",
    title: "Hotel",
    serviceDate: "2026-08-21",
    startsAt: null,
    sellCurrency: "EUR",
    totalSellAmountCents: 20_000,
    cancellationTermsSnapshot: {
      schemaVersion: 1,
      source: "booking_quote",
      sourceId: "quote_1",
      capturedAt: "2026-07-01T00:00:00.000Z",
      policy: { schemaVersion: 1, policyVersionId: "polv_sale" },
      sellCurrency: "EUR",
      totalSellAmountCents: 20_000,
      serviceDate: "2026-08-21",
    },
    ...overrides,
  }
}

describe("resolveBookingCancellationConsequences", () => {
  it("derives timing and amounts from each sold item and aggregates frozen evaluations", async () => {
    const evaluate = vi.fn(async (snapshot: unknown, input: { totalCents: number }) => ({
      status: "evaluated" as const,
      policyId: "pol_cancel",
      policyVersionId: (snapshot as { policyVersionId: string }).policyVersionId,
      version: 1,
      result: {
        refundPercent: input.totalCents === 20_000 ? 8000 : 0,
        refundCents: input.totalCents === 20_000 ? 16_000 : 0,
        refundType: input.totalCents === 20_000 ? ("cash" as const) : ("none" as const),
        appliedRule: { id: "rule_sale" },
      },
    }))

    const result = await resolveBookingCancellationConsequences(
      [item(), item({ id: "item_2", title: "Transfer", totalSellAmountCents: 5_000 })],
      AS_OF,
      evaluate,
    )

    expect(evaluate).toHaveBeenNthCalledWith(
      1,
      { schemaVersion: 1, policyVersionId: "polv_sale" },
      { daysBeforeDeparture: 20, totalCents: 20_000, currency: "EUR" },
    )
    expect(result).toMatchObject({
      status: "evaluated",
      currency: "EUR",
      totalCents: 25_000,
      refundCents: 16_000,
      knownRefundCents: 16_000,
      refundPercent: 6400,
      refundType: "cash",
      reasons: [],
    })
  })

  it("marks legacy items for manual review without inventing a zero refund", async () => {
    const evaluate = vi.fn()
    const result = await resolveBookingCancellationConsequences(
      [item({ cancellationTermsSnapshot: null })],
      AS_OF,
      evaluate,
    )

    expect(evaluate).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      status: "manual_review",
      refundCents: null,
      refundPercent: null,
      refundType: "unknown",
      reasons: ["policy_snapshot_missing"],
      items: [{ status: "manual_review", reason: "policy_snapshot_missing", result: null }],
    })
  })

  it("fails closed when frozen policy evaluation rejects the snapshot", async () => {
    const result = await resolveBookingCancellationConsequences([item()], AS_OF, async () => ({
      status: "unknown",
      reason: "invalid_snapshot",
    }))

    expect(result).toMatchObject({
      status: "manual_review",
      refundCents: null,
      knownRefundCents: 0,
      reasons: ["policy_snapshot_invalid"],
    })
  })

  it("does not aggregate different currencies into one entitlement", async () => {
    const result = await resolveBookingCancellationConsequences(
      [item(), item({ id: "item_2", sellCurrency: "USD" })],
      AS_OF,
      async (_snapshot, input) => ({
        status: "evaluated",
        policyId: "pol_cancel",
        policyVersionId: "polv_sale",
        version: 1,
        result: {
          refundPercent: 5000,
          refundCents: input.totalCents / 2,
          refundType: "cash",
          appliedRule: null,
        },
      }),
    )

    expect(result).toMatchObject({
      status: "manual_review",
      currency: null,
      refundCents: null,
      reasons: ["mixed_currency"],
    })
  })
})
