import { describe, expect, it } from "vitest"

import { publicApiCustomerBookableProductVerticals } from "../routing.js"
import { shopSearchSchema } from "./browse-page.js"

/**
 * Storefront search must only surface verticals that have a working customer
 * detail + booking page. Charters (and flights) have no storefront `/content`
 * endpoint or booking flow, so they must not be selectable or reachable via a
 * crafted `?vertical=` URL (voyant#2640).
 */
describe("shopSearchSchema vertical", () => {
  it("accepts supported bookable verticals", () => {
    for (const vertical of publicApiCustomerBookableProductVerticals) {
      expect(shopSearchSchema.parse({ vertical }).vertical).toBe(vertical)
    }
  })

  it("does not surface charters", () => {
    expect(publicApiCustomerBookableProductVerticals).not.toContain("charters")
    // A stale/crafted ?vertical=charters URL degrades to the default vertical
    // instead of surfacing unbookable charter results or erroring.
    expect(shopSearchSchema.parse({ vertical: "charters" }).vertical).toBeUndefined()
  })

  it("surfaces cruises", () => {
    expect(publicApiCustomerBookableProductVerticals).toContain("cruises")
    expect(shopSearchSchema.parse({ vertical: "cruises" }).vertical).toBe("cruises")
  })

  it("drops any other unsupported vertical to the default", () => {
    expect(shopSearchSchema.parse({ vertical: "flights" }).vertical).toBeUndefined()
    expect(shopSearchSchema.parse({}).vertical).toBeUndefined()
  })
})
