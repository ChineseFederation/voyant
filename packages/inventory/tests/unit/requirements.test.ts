import { DEFAULT_PAX_BANDS } from "@voyant-travel/catalog/booking-engine"
import { describe, expect, it } from "vitest"
import type { ProductContent } from "../../src/content-shape.js"
import { productContentSchema } from "../../src/content-shape.js"
import { buildProductRequirements } from "../../src/requirements.js"

const minimalContent: ProductContent = productContentSchema.parse({
  product: { id: "prod_abc", name: "Sample Tour" },
})

const richContent: ProductContent = productContentSchema.parse({
  product: { id: "prod_abc", name: "Sample Tour" },
  options: [
    { id: "opt_a", name: "Premium upgrade" },
    { id: "opt_b", name: "Lunch included" },
  ],
})

describe("buildProductRequirements", () => {
  it("renders configure + travelers + payment + review for a minimal product", () => {
    const shape = buildProductRequirements(minimalContent)
    expect(shape.showsConfigure).toBe(true)
    expect(shape.showsTravelers).toBe(true)
    expect(shape.showsPayment).toBe(true)
    expect(shape.showsReview).toBe(true)
    expect(shape.showsAccommodation).toBe(false)
    // No extras → no add-ons step.
    expect(shape.showsAddons).toBe(false)
    expect(shape.addons).toBeUndefined()
  })

  it("emits a departure + occupancy sub-step under Configure", () => {
    const shape = buildProductRequirements(minimalContent)
    expect(shape.configureSubSteps).toEqual([
      // Owned products are scheduled — operator picks a real departure.
      {
        kind: "departure",
        required: true,
      },
      {
        kind: "occupancy",
        bands: DEFAULT_PAX_BANDS,
      },
    ])
  })

  it("turns product options into a configure sub-step when present", () => {
    const shape = buildProductRequirements(richContent)
    expect(shape.showsAddons).toBe(false)
    expect(shape.addons).toBeUndefined()
    expect(shape.configureSubSteps?.[0]).toEqual({
      kind: "product-option",
      options: [
        { id: "opt_a", name: "Premium upgrade", description: null },
        { id: "opt_b", name: "Lunch included", description: null },
      ],
    })
  })

  it("respects custom paxBands when provided", () => {
    const shape = buildProductRequirements(minimalContent, {
      paxBands: [
        { code: "adult", label: "Adult", minCount: 1, maxCount: 4 },
        { code: "child", label: "Child", minCount: 0, maxCount: 2, minAge: 0, maxAge: 11 },
      ],
    })
    expect(shape.paxBands).toHaveLength(2)
    expect(shape.paxBandsAllowedTotal).toEqual({ min: 1, max: 6 })
  })

  it("respects an explicit paxBandsAllowedTotal override", () => {
    const shape = buildProductRequirements(minimalContent, {
      paxBands: [{ code: "adult", label: "Adult", minCount: 1, maxCount: 8 }],
      paxBandsAllowedTotal: { min: 2, max: 6 }, // narrower than band sum
    })
    expect(shape.paxBandsAllowedTotal).toEqual({ min: 2, max: 6 })
  })

  it("declares the full engine payment-intent allow list", () => {
    // Capabilities narrow this at render time; the shape lists every
    // supported intent so the storefront can offer card + bank transfer +
    // inquiry for owned products, matching sourced ones (voyant#2741).
    const shape = buildProductRequirements(minimalContent)
    expect(shape.paymentIntents).toEqual(
      expect.arrayContaining(["hold", "card", "bank_transfer", "inquiry"]),
    )
  })
})
