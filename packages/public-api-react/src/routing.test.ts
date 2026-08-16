import { describe, expect, it } from "vitest"

import {
  getPublicApiCustomerProductDetailRoute,
  isPublicApiCustomerBookableProductVertical,
  publicApiCustomerBookableProductVerticals,
} from "./routing.js"

describe("storefront customer product routing", () => {
  it("keeps the customer detail route limited to implemented booking verticals", () => {
    expect(publicApiCustomerBookableProductVerticals).toEqual([
      "products",
      "accommodations",
      "cruises",
    ])
  })

  it("treats charters as searchable but not customer-bookable through product detail", () => {
    expect(isPublicApiCustomerBookableProductVertical("charters")).toBe(false)
    expect(getPublicApiCustomerProductDetailRoute("charters", "chrt_123")).toBeNull()
  })

  it("routes cruises to customer-bookable product detail", () => {
    expect(isPublicApiCustomerBookableProductVertical("cruises")).toBe(true)
    expect(getPublicApiCustomerProductDetailRoute("cruises", "cru_123")).toEqual({
      to: "/shop/products/$entityModule/$entityId",
      params: { entityModule: "cruises", entityId: "cru_123" },
    })
  })

  it("does not route sourced cruise projections to customer booking detail yet", () => {
    expect(getPublicApiCustomerProductDetailRoute("cruises", "crus_sr_123")).toBeNull()
    expect(getPublicApiCustomerProductDetailRoute("cruises", "crus_external")).toBeNull()
  })

  it("builds route params for implemented storefront booking detail pages", () => {
    expect(getPublicApiCustomerProductDetailRoute("products", "prod_123")).toEqual({
      to: "/shop/products/$entityModule/$entityId",
      params: { entityModule: "products", entityId: "prod_123" },
    })
  })
})
