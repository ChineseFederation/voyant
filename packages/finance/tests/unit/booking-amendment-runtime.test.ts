import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import { createBookingAmendmentFinanceRuntime } from "../../src/booking-amendment-runtime.js"

function taxDb(priceMode: "inclusive" | "exclusive") {
  const resultQueue = [
    [{ id: "profile_1", code: "ro-b2c", active: true }],
    [{ condition: { always: true }, taxRegimeId: "regime_1" }],
    [{ code: "standard", name: "TVA Standard", ratePercent: 21 }],
  ]
  const takeResult = async () => resultQueue.shift() ?? []
  const select = () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      orderBy: takeResult,
      limit: takeResult,
    }
    return chain
  }
  return {
    db: { select, execute: vi.fn(async () => []) } as PostgresJsDatabase,
    resolveBookingTaxSettings: vi.fn(async () => ({
      taxPriceMode: priceMode,
      taxPolicyProfileId: "profile_1",
    })),
  }
}

describe("Booking Amendment finance runtime", () => {
  it("quotes exclusive tax and collection consequences server-side", async () => {
    const { db, resolveBookingTaxSettings } = taxDb("exclusive")
    const runtime = createBookingAmendmentFinanceRuntime({ resolveBookingTaxSettings })

    await expect(
      runtime.quoteBookingAmendment(db, {
        bookingId: "bk_1",
        currency: "RON",
        lines: [{ bookingItemId: "bitm_1", productId: "prod_1", subtotalDeltaCents: 10_000 }],
      }),
    ).resolves.toMatchObject({
      price: {
        subtotalDeltaCents: 10_000,
        taxDeltaCents: 2_100,
        amountCents: 12_100,
        collectionAmountCents: 12_100,
        refundAmountCents: 0,
      },
      consequences: {
        collection: "required",
        refund: "not_required",
        invoice: "reissue_required",
        creditNote: "not_required",
        paymentSchedule: "recalculate_required",
      },
    })
  })

  it("preserves an inclusive gross price and produces refund consequences for a drop", async () => {
    const { db, resolveBookingTaxSettings } = taxDb("inclusive")
    const runtime = createBookingAmendmentFinanceRuntime({ resolveBookingTaxSettings })

    await expect(
      runtime.quoteBookingAmendment(db, {
        bookingId: "bk_1",
        currency: "RON",
        lines: [{ bookingItemId: "bitm_1", productId: "prod_1", subtotalDeltaCents: -12_100 }],
      }),
    ).resolves.toMatchObject({
      price: {
        subtotalDeltaCents: -10_000,
        taxDeltaCents: -2_100,
        amountCents: -12_100,
        collectionAmountCents: 0,
        refundAmountCents: 12_100,
      },
      consequences: {
        collection: "not_required",
        refund: "required",
        invoice: "not_required",
        creditNote: "issue_required",
        paymentSchedule: "recalculate_required",
      },
    })
  })

  it("records one idempotent adjustment and rejects a mismatched replay", async () => {
    const input = {
      amendmentId: "bamd_1",
      bookingId: "bk_1",
      idempotencyKey: "apply-1",
      price: {
        currency: "EUR",
        subtotalDeltaCents: 10_000,
        feeDeltaCents: 0,
        taxDeltaCents: 0,
        amountCents: 10_000,
        collectionAmountCents: 10_000,
        refundAmountCents: 0,
        taxLines: [],
      },
      consequences: {
        collection: "required" as const,
        refund: "not_required" as const,
        invoice: "reissue_required" as const,
        creditNote: "not_required" as const,
        paymentSchedule: "recalculate_required" as const,
      },
      reason: "Add a traveler",
    }
    let existing = {
      id: "faad_1",
      amendmentId: input.amendmentId,
      bookingId: input.bookingId,
      idempotencyKey: input.idempotencyKey,
      totalDeltaCents: input.price.amountCents,
      currency: input.price.currency,
    }
    const returning = vi.fn(async () => [])
    const insertChain = {
      values: () => insertChain,
      onConflictDoNothing: () => insertChain,
      returning,
    }
    const selectChain = {
      from: () => selectChain,
      where: () => selectChain,
      limit: async () => [existing],
    }
    const db = {
      insert: vi.fn(() => insertChain),
      select: vi.fn(() => selectChain),
    } as PostgresJsDatabase
    const runtime = createBookingAmendmentFinanceRuntime()

    await expect(runtime.recordBookingAmendment(db, input)).resolves.toEqual({
      adjustmentId: "faad_1",
      status: "replay",
    })
    existing = { ...existing, totalDeltaCents: 9_999 }
    await expect(runtime.recordBookingAmendment(db, input)).rejects.toThrow(
      "Booking Amendment finance idempotency conflict",
    )
  })
})
