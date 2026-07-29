import { describe, expect, it } from "vitest"

import { resolveBookingExtraLines } from "../../../src/pricing-assignment.js"

describe("resolveBookingExtraLines", () => {
  it("normalizes per-person extras to charged traveler quantity and traveler links", () => {
    const result = resolveBookingExtraLines({
      travelerCount: 3,
      extraLines: [
        {
          productExtraId: "lunch",
          pricingMode: "per_person",
          pricedPerPerson: true,
          quantity: 1,
          unitSellAmountCents: 1000,
        },
        {
          productExtraId: "guide",
          pricingMode: "per_booking",
          quantity: 1,
          unitSellAmountCents: 5000,
        },
      ],
    })

    expect(result).toEqual([
      {
        productExtraId: "lunch",
        pricingMode: "per_person",
        pricedPerPerson: true,
        quantity: 3,
        unitSellAmountCents: 1000,
        totalSellAmountCents: 3000,
        clientLineKey: "extra:lunch",
        travelerIndexes: [0, 1, 2],
      },
      {
        productExtraId: "guide",
        pricingMode: "per_booking",
        quantity: 1,
        unitSellAmountCents: 5000,
        clientLineKey: "extra:guide",
      },
    ])
  })

  it("uses stable traveler keys for per-person extra links when supplied", () => {
    const result = resolveBookingExtraLines({
      travelerCount: 2,
      travelerKeys: ["trav:lead", "trav:child"],
      extraLines: [
        {
          productExtraId: "lunch",
          pricingMode: "per_person",
          pricedPerPerson: true,
          quantity: 1,
          unitSellAmountCents: 1000,
        },
      ],
    })

    expect(result[0]).toMatchObject({
      clientLineKey: "extra:lunch",
      travelerKeys: ["trav:lead", "trav:child"],
    })
    expect(result[0]?.travelerIndexes).toBeUndefined()
  })

  it("multiplies base extra quantity by the applicable traveler count", () => {
    const result = resolveBookingExtraLines({
      travelerCount: 2,
      travelerKeys: ["trav:lead", "trav:child"],
      extraLines: [
        {
          productExtraId: "lunch",
          pricingMode: "per_person",
          quantity: 2,
          unitSellAmountCents: 1000,
        },
      ],
    })

    expect(result[0]).toMatchObject({
      quantity: 4,
      totalSellAmountCents: 4000,
      travelerKeys: ["trav:lead", "trav:child"],
    })
  })
})
