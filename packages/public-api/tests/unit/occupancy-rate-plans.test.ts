import { describe, expect, it } from "vitest"

import {
  buildRatePlans,
  type PricingContext,
} from "../../src/service-departures-pricing-context.js"

function occupancyContext(occupancyPriceBasis: "supplement" | "all_in" | null): PricingContext {
  return {
    product: { id: "product-1", sellCurrency: "EUR", sellAmountCents: null, capacityMode: "units" },
    catalog: { id: "catalog-1", currencyCode: "EUR" },
    option: { id: "option-1", name: "Stay", description: null },
    rule: {
      id: "rule-1",
      name: "Standard",
      description: null,
      pricingMode: "per_person",
      occupancyPriceBasis,
      baseSellAmountCents: 16_500,
    },
    units: [
      {
        id: "room-1",
        name: "Single room",
        unitType: "room",
        minAge: null,
        maxAge: null,
        occupancyMin: 1,
        occupancyMax: 1,
        isRequired: true,
      },
    ],
    unitRules: [
      {
        id: "unit-rule-1",
        unitId: "room-1",
        pricingMode: "per_unit",
        sellAmountCents: 26_500,
        minQuantity: null,
        maxQuantity: null,
        sortOrder: 0,
      },
    ],
    tiers: [],
    extraRules: [],
    unitPriceOverrides: new Map(),
  }
}

describe("occupancy rate plans", () => {
  it("retains traveler base fares for occupancy supplements", () => {
    expect(buildRatePlans(occupancyContext("supplement"))[0]?.basePrices).toEqual([
      { amount: 165, currencyCode: "EUR" },
    ])
  })

  it("suppresses traveler base fares for all-in occupancy prices", () => {
    expect(buildRatePlans(occupancyContext("all_in"))[0]?.basePrices).toEqual([])
  })

  it("does not publish an ambiguous historical occupancy price", () => {
    expect(buildRatePlans(occupancyContext(null))).toEqual([])
  })
})
