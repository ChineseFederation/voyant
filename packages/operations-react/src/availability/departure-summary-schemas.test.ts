import { describe, expect, it } from "vitest"

import { departureAllocatesPositions } from "./departure-summary-schemas.js"

/**
 * The one rule behind every seat-shaped affordance in the departure workspace.
 * Its third case is the one that is easy to get wrong: a server that has not
 * shipped `planned` yet is not the same as a server that answered `false`.
 */
describe("departureAllocatesPositions", () => {
  it("takes the server's answer when it has one", () => {
    expect(departureAllocatesPositions({ total: 0, planned: true })).toBe(true)
    expect(departureAllocatesPositions({ total: 3, planned: false })).toBe(false)
  })

  it("falls back to whether resources exist against a server that does not answer", () => {
    expect(departureAllocatesPositions({ total: 3 })).toBe(true)
    expect(departureAllocatesPositions({ total: 0 })).toBe(false)
  })

  it("treats a departure with no summary as allocating nothing", () => {
    expect(departureAllocatesPositions(null)).toBe(false)
    expect(departureAllocatesPositions(undefined)).toBe(false)
  })
})
