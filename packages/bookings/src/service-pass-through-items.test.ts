import { describe, expect, it } from "vitest"

import {
  addBookingPassThroughItem,
  recordBookingSystemActivity,
} from "./service-pass-through-items.js"

function stubDb(inserted: Array<Record<string, unknown>>) {
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v)
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [{ id: "bkit_1" }],
        })
      },
    }),
  }
  return db as never
}

describe("addBookingPassThroughItem", () => {
  it("stamps the pass-through treatment and leaves no margin behind", async () => {
    const inserted: Array<Record<string, unknown>> = []

    const result = await addBookingPassThroughItem(stubDb(inserted), {
      bookingId: "bkng_1",
      title: "Travel insurance",
      priceMinor: 4500,
      currency: "EUR",
      taxTreatmentCode: "insurance/exempt",
    })

    expect(result).toEqual({ bookingItemId: "bkit_1" })
    expect(inserted[0]).toMatchObject({
      pricingTreatment: "pass_through",
      taxTreatmentCode: "insurance/exempt",
      unitSellAmountCents: 4500,
      totalSellAmountCents: 4500,
      // Cost equals sell: the operator's net rate IS the collected amount, so
      // there is nothing for a markup or commission rule to compute against.
      unitCostAmountCents: 4500,
      totalCostAmountCents: 4500,
    })
  })

  it("cannot be asked for a standard line", async () => {
    const inserted: Array<Record<string, unknown>> = []
    await addBookingPassThroughItem(stubDb(inserted), {
      bookingId: "bkng_1",
      title: "Travel insurance",
      priceMinor: 4500,
      currency: "EUR",
    })
    // There is no input that produces `standard` here — the treatment is not a
    // parameter, it is the point of the function.
    expect(inserted[0]).toMatchObject({ pricingTreatment: "pass_through" })
    expect(inserted[0]?.taxTreatmentCode).toBeNull()
  })
})

describe("recordBookingSystemActivity", () => {
  it("carries the discriminator in metadata rather than in the enum", async () => {
    const inserted: Array<Record<string, unknown>> = []

    await recordBookingSystemActivity(stubDb(inserted), {
      bookingId: "bkng_1",
      event: "ancillary.premium.drift",
      description: "Ancillary premium drift",
      metadata: { differenceMinor: 1 },
    })

    expect(inserted[0]).toMatchObject({
      bookingId: "bkng_1",
      activityType: "system_action",
      metadata: { event: "ancillary.premium.drift", differenceMinor: 1 },
    })
  })
})
