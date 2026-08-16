import { describe, expect, it } from "vitest"

import { clearAllExcept } from "./catalog-search-tab-panel.js"

/**
 * A family surface pins its facet by merging it into the selections the panel
 * receives — it has to travel with the search request. That makes the pinned
 * value indistinguishable from something the reader picked unless the panel is
 * told which fields are the surface's own.
 */
describe("clearing filters on a surface that pins one", () => {
  const hidden = new Set(["familyCode"])

  it("keeps the pinned facet so the grid never flashes the unscoped set", () => {
    const cleared = clearAllExcept(
      { facets: { familyCode: ["tour"], status: ["active"] }, ranges: {} },
      hidden,
    )
    expect(cleared.facets).toEqual({ familyCode: ["tour"] })
  })

  it("clears everything the reader actually chose", () => {
    const cleared = clearAllExcept(
      {
        facets: { familyCode: ["tour"], status: ["active"], subtypeCode: ["boat-tour"] },
        ranges: { sellAmountCents: { gte: 100 } },
      },
      hidden,
    )
    expect(cleared.facets.status).toBeUndefined()
    expect(cleared.facets.subtypeCode).toBeUndefined()
    expect(cleared.ranges).toEqual({})
  })

  it("clears everything on a surface that pins nothing", () => {
    const cleared = clearAllExcept(
      { facets: { familyCode: ["tour"] }, ranges: {} },
      new Set<string>(),
    )
    expect(cleared).toEqual({ facets: {}, ranges: {} })
  })

  it("does not resurrect a pinned field that carries no values", () => {
    const cleared = clearAllExcept({ facets: { familyCode: [] }, ranges: {} }, hidden)
    expect(cleared.facets).toEqual({})
  })
})
