import { describe, expect, it } from "vitest"
import { mergeProductPickerRecords } from "./product-picker-section.js"

describe("mergeProductPickerRecords", () => {
  it("keeps direct Inventory products available without catalog hits", () => {
    expect(
      mergeProductPickerRecords(
        [],
        [
          {
            id: "prod_owned",
            name: "Danube Day Tour",
            sourceKind: "owned",
            sellCurrency: "EUR",
            sellAmountCents: 12_000,
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        id: "prod_owned",
        name: "Danube Day Tour",
        sourceKind: "owned",
      }),
    ])
  })

  it("prefers the authoritative direct Inventory record for duplicate owned products", () => {
    const [product] = mergeProductPickerRecords(
      [{ id: "prod_1", name: "Stale indexed name", sourceKind: "owned" }],
      [{ id: "prod_1", name: "Current inventory name", sourceKind: "owned" }],
    )

    expect(product?.name).toBe("Current inventory name")
  })
})
