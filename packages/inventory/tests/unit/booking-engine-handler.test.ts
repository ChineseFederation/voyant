import { describe, expect, it } from "vitest"

import { buildOwnedProductRequirements } from "../../src/booking-engine/handler.js"

describe("buildOwnedProductRequirements", () => {
  it("returns the canonical defaults when no options are passed", () => {
    const shape = buildOwnedProductRequirements()
    expect(shape.showsConfigure).toBe(true)
    expect(shape.showsTravelers).toBe(true)
    expect(shape.showsPayment).toBe(true)
    expect(shape.showsReview).toBe(true)
    expect(shape.showsAddons).toBe(false)
    expect(shape.travelerFields.length).toBeGreaterThan(0)
    // Full engine allow list — deployment/surface capabilities narrow it
    // at render time. The storefront (card + bank transfer + inquiry) must
    // not collapse to card-only for owned products (voyant#2741).
    expect(shape.paymentIntents).toEqual(
      expect.arrayContaining(["hold", "card", "bank_transfer", "inquiry"]),
    )
  })

  it("widens travelerFields with caller-supplied requirements", () => {
    const shape = buildOwnedProductRequirements({
      travelerFields: [
        { key: "firstName", label: "First name", type: "text", required: true },
        { key: "passportNumber", label: "Passport", type: "text", required: true },
      ],
    })
    expect(shape.travelerFields.map((f) => f.key)).toEqual(["firstName", "passportNumber"])
  })

  it("flips showsAddons on when the catalog is non-empty", () => {
    const shape = buildOwnedProductRequirements({
      addonCatalog: [
        { id: "x_1", name: "Lunch", kind: "extras" },
        { id: "x_2", name: "Insurance", kind: "insurance" },
      ],
    })
    expect(shape.showsAddons).toBe(true)
    expect(shape.addons?.catalog).toHaveLength(2)
  })

  it("exposes product options as configure variants", () => {
    const shape = buildOwnedProductRequirements({
      productOptions: [
        { id: "opt_std", name: "Standard double", code: "STD", isDefault: true },
        { id: "opt_suite", name: "Junior suite upgrade", code: "STE" },
      ],
    })
    expect(shape.configureSubSteps?.[0]).toEqual({
      kind: "product-option",
      options: [
        { id: "opt_std", name: "Standard double", code: "STD", isDefault: true },
        { id: "opt_suite", name: "Junior suite upgrade", code: "STE" },
      ],
    })
  })

  it("omits addons when the catalog is empty", () => {
    const shape = buildOwnedProductRequirements({ addonCatalog: [] })
    expect(shape.showsAddons).toBe(false)
    expect(shape.addons).toBeUndefined()
  })
})
