import { describe, expect, it } from "vitest"

import { humanizeFacetValue } from "./catalog-filter-rail.js"

/**
 * Facet buckets arrive as the stored code. The rail used to render them through
 * CSS `capitalize`, which does not treat `_` or `-` as a word break — so
 * `free_sale` reached the operator as "Free_sale".
 */
describe("facet value labels", () => {
  it("reads a snake_case code as a sentence", () => {
    expect(humanizeFacetValue("free_sale")).toBe("Free sale")
    expect(humanizeFacetValue("date_time")).toBe("Date time")
    expect(humanizeFacetValue("voyant_connect")).toBe("Voyant connect")
  })

  it("reads a kebab-case code the same way", () => {
    expect(humanizeFacetValue("boat-tour")).toBe("Boat tour")
  })

  it("sentence-cases rather than title-cases, so it is a label and not a heading", () => {
    expect(humanizeFacetValue("free_sale")).not.toBe("Free Sale")
  })

  it("capitalizes a bare lowercase code", () => {
    expect(humanizeFacetValue("owned")).toBe("Owned")
    expect(humanizeFacetValue("active")).toBe("Active")
  })

  it("leaves a value that already carries its own casing alone", () => {
    // Acronyms and proper names are already correct; lowercasing or
    // re-capitalizing them would be a regression, not a tidy-up.
    expect(humanizeFacetValue("TUI")).toBe("TUI")
    expect(humanizeFacetValue("Voyant Connect")).toBe("Voyant Connect")
  })

  it("passes a numeric bucket through as its own label", () => {
    expect(humanizeFacetValue(5)).toBe("5")
  })
})
