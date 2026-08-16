import { describe, expect, it } from "vitest"
import {
  AncillaryPremiumDriftError,
  materializeAncillaryPassThroughItem,
  reconcileAncillaryPremium,
} from "./ancillary-materialization.js"
import type { AncillaryPreparedSelection } from "./ancillary-ports.js"

function preparedSelection(
  overrides: Partial<AncillaryPreparedSelection> = {},
): AncillaryPreparedSelection {
  return {
    sourceId: "src_a",
    providerId: "prov_a",
    applicationRef: "app_1",
    priceMinor: 4500,
    currency: "EUR",
    title: "Travel insurance — Ana Popescu party",
    expiresAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  }
}

function stubDb(inserted: Array<Record<string, unknown>>) {
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v)
        const result = Promise.resolve(undefined)
        return Object.assign(result, {
          returning: async () => [{ id: "bkit_1" }],
        })
      },
    }),
  }
  return db as never
}

describe("materializeAncillaryPassThroughItem", () => {
  it("writes the premium as a pass-through line with no margin to mark up", async () => {
    const inserted: Array<Record<string, unknown>> = []

    const result = await materializeAncillaryPassThroughItem(stubDb(inserted), {
      bookingId: "bkng_1",
      selection: preparedSelection(),
      taxTreatmentCode: "insurance/exempt",
    })

    expect(result).toEqual({ bookingItemId: "bkit_1" })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      bookingId: "bkng_1",
      pricingTreatment: "pass_through",
      taxTreatmentCode: "insurance/exempt",
      sellCurrency: "EUR",
      unitSellAmountCents: 4500,
      totalSellAmountCents: 4500,
      // Cost equals sell: the operator's net rate IS the premium, so there is
      // no margin for a markup rule to find.
      costCurrency: "EUR",
      unitCostAmountCents: 4500,
      totalCostAmountCents: 4500,
    })
  })
})

describe("reconcileAncillaryPremium", () => {
  it("accepts a settlement that matches to the minor unit", async () => {
    const inserted: Array<Record<string, unknown>> = []

    const outcome = await reconcileAncillaryPremium(stubDb(inserted), {
      bookingId: "bkng_1",
      bookingItemId: "bkit_1",
      chargedPriceMinor: 4500,
      currency: "EUR",
      result: {
        status: "fulfilled",
        reference: "POL-123",
        settledPriceMinor: 4500,
        currency: "EUR",
        documentIds: ["bkdoc_1"],
      },
    })

    expect(outcome).toMatchObject({ status: "matched", settledPriceMinor: 4500 })
    expect(inserted).toHaveLength(0)
  })

  it("fails loudly on a one-minor-unit drift, and adjusts neither side", async () => {
    const inserted: Array<Record<string, unknown>> = []

    await expect(
      reconcileAncillaryPremium(stubDb(inserted), {
        bookingId: "bkng_1",
        bookingItemId: "bkit_1",
        chargedPriceMinor: 4500,
        currency: "EUR",
        result: {
          status: "fulfilled",
          reference: "POL-123",
          settledPriceMinor: 4501,
          currency: "EUR",
          documentIds: [],
        },
      }),
    ).rejects.toBeInstanceOf(AncillaryPremiumDriftError)

    // Recorded where an operator will see it — and nothing else was written.
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({
      bookingId: "bkng_1",
      activityType: "system_action",
    })
    expect(inserted[0]?.metadata).toMatchObject({
      event: "ancillary.premium.drift",
      chargedPriceMinor: 4500,
      settledPriceMinor: 4501,
      differenceMinor: 1,
    })
  })

  it("treats a currency change as drift too", async () => {
    const inserted: Array<Record<string, unknown>> = []

    await expect(
      reconcileAncillaryPremium(stubDb(inserted), {
        bookingId: "bkng_1",
        bookingItemId: "bkit_1",
        chargedPriceMinor: 4500,
        currency: "EUR",
        result: {
          status: "fulfilled",
          reference: "POL-123",
          settledPriceMinor: 4500,
          currency: "RON",
          documentIds: [],
        },
      }),
    ).rejects.toBeInstanceOf(AncillaryPremiumDriftError)
    expect(inserted).toHaveLength(1)
  })

  it("records a post-payment fulfilment failure without throwing", async () => {
    const inserted: Array<Record<string, unknown>> = []

    const outcome = await reconcileAncillaryPremium(stubDb(inserted), {
      bookingId: "bkng_1",
      bookingItemId: "bkit_1",
      chargedPriceMinor: 4500,
      currency: "EUR",
      result: {
        status: "failed",
        code: "insurer_declined",
        message: "Insurer declined at issue",
        retryable: false,
      },
    })

    expect(outcome).toMatchObject({ status: "not_fulfilled", code: "insurer_declined" })
    expect(inserted[0]?.metadata).toMatchObject({ event: "ancillary.fulfillment.failed" })
  })
})
