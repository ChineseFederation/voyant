import { describe, expect, it } from "vitest"

import { BookingItemsUnresolvedError } from "../../src/booking-create-command-domain.js"

describe("BookingItemsUnresolvedError", () => {
  it("tells the operator what to do when several units are available", () => {
    const error = new BookingItemsUnresolvedError("prod_1", "opt_1", 4)

    expect(error.message).toBe(
      "Several units are available and none is required, so the booking would reserve nothing. Choose which units to book.",
    )
    expect(error).toMatchObject({ productId: "prod_1", optionId: "opt_1", candidateUnitCount: 4 })
  })

  it("explains an option that has nothing bookable on it", () => {
    const error = new BookingItemsUnresolvedError("prod_1", null, 0)

    expect(error.message).toBe(
      "This product has no bookable units on the selected option, so the booking would reserve nothing.",
    )
  })

  it("carries no identifiers in the message shown to operators", () => {
    const error = new BookingItemsUnresolvedError("prod_01abc", "opt_01xyz", 3)

    expect(error.message).not.toContain("prod_01abc")
    expect(error.message).not.toContain("opt_01xyz")
  })
})
