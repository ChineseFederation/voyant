import { describe, expect, it } from "vitest"

import { shipListQuerySchema } from "../../src/validation-cabins.js"

/**
 * The ships browse page asks for one page of the fleet. The cruises route
 * carries its own bound, narrower than the shared `paginationSchema`, and
 * exceeding it is not clamped — validation rejects the request, so the whole
 * surface renders its error state rather than a shorter list.
 */
describe("ship list query bounds", () => {
  it("accepts the page size the browse surface asks for", () => {
    expect(shipListQuerySchema.safeParse({ limit: 100 }).success).toBe(true)
  })

  it("rejects a larger page rather than clamping it", () => {
    expect(shipListQuerySchema.safeParse({ limit: 101 }).success).toBe(false)
    expect(shipListQuerySchema.safeParse({ limit: 200 }).success).toBe(false)
  })

  it("carries the search term the box sends", () => {
    const parsed = shipListQuerySchema.parse({ search: "9714710" })
    expect(parsed.search).toBe("9714710")
  })
})
