import { describe, expect, it } from "vitest"
import type { productExtrasRef } from "../../src/extras/product-extra-ref.js"
import { summarizeSlotExtras } from "../../src/extras/service-manifest.js"

type ProductExtraRow = typeof productExtrasRef.$inferSelect

function extra(overrides: Partial<ProductExtraRow> = {}): ProductExtraRow {
  return {
    id: "pex_lunch",
    productId: "prod_day_tour",
    supplierId: null,
    code: "LUNCH",
    name: "Optional lunch",
    description: null,
    selectionType: "optional",
    pricingMode: "per_person",
    pricedPerPerson: true,
    collectionMode: "cash_on_trip",
    showOnSlotManifest: true,
    minQuantity: null,
    maxQuantity: null,
    defaultQuantity: null,
    active: true,
    sortOrder: 0,
    metadata: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  }
}

function selection(overrides: Partial<Parameters<typeof summarizeSlotExtras>[2][number]> = {}) {
  return {
    productExtraId: "pex_lunch",
    status: "selected",
    selected: true,
    quantity: 1,
    collectionStatus: "pending",
    collectionCurrency: "EUR",
    collectionAmountCents: 1500,
    ...overrides,
  }
}

describe("summarizeSlotExtras", () => {
  it("rolls the traveler matrix up into what the guide has to carry and collect", () => {
    const [summary] = summarizeSlotExtras([extra()], 4, [
      selection({ quantity: 2, collectionAmountCents: 3000 }),
      selection({ status: "fulfilled", collectionStatus: "collected" }),
      selection({ status: "cancelled", selected: false, quantity: 0 }),
      selection({ status: "no_show", selected: false, quantity: 0 }),
    ])

    expect(summary).toMatchObject({
      productExtraId: "pex_lunch",
      selectionType: "optional",
      collectionMode: "cash_on_trip",
      eligibleTravelerCount: 4,
      selectedTravelerCount: 2,
      totalQuantity: 3,
      fulfilledTravelerCount: 1,
      cancelledTravelerCount: 1,
      noShowTravelerCount: 1,
      outstandingCollectionCount: 1,
      collectionCurrency: "EUR",
      collectionAmountCents: 4500,
      fulfillmentComplete: false,
    })
    expect(summary?.collection).toEqual({
      notRequired: 0,
      pending: 1,
      collected: 1,
      waived: 0,
      refunded: 0,
    })
  })

  it("reports fulfillment complete only when every selected traveler is fulfilled", () => {
    const [summary] = summarizeSlotExtras([extra()], 2, [
      selection({ status: "fulfilled", collectionStatus: "collected" }),
      selection({ status: "fulfilled", collectionStatus: "waived" }),
    ])

    expect(summary?.fulfillmentComplete).toBe(true)
    expect(summary?.outstandingCollectionCount).toBe(0)
  })

  it("refuses to sum a mixed-currency collection rather than inventing a total", () => {
    const [summary] = summarizeSlotExtras([extra()], 2, [
      selection({ collectionCurrency: "EUR", collectionAmountCents: 1500 }),
      selection({ collectionCurrency: "RON", collectionAmountCents: 7500 }),
    ])

    expect(summary?.collectionCurrency).toBeNull()
    expect(summary?.collectionAmountCents).toBeNull()
  })

  it("is empty rather than 'complete' when nobody has taken the extra", () => {
    const [summary] = summarizeSlotExtras([extra()], 3, [])

    expect(summary?.selectedTravelerCount).toBe(0)
    expect(summary?.totalQuantity).toBe(0)
    expect(summary?.fulfillmentComplete).toBe(false)
  })
})
