import { describe, expect, it } from "vitest"
import { bookingContractPrerequisites } from "../../src/booking-contract-review.js"

describe("booking contract prerequisites", () => {
  it("keeps listing and draft-write prerequisites complete and deduplicated", () => {
    expect(
      bookingContractPrerequisites({
        templateApplicable: false,
        customerEmail: null,
        totalAmountCents: null,
        itemCount: 0,
        missingRequiredVariables: ["customer.email", "booking.startDate"],
      }),
    ).toEqual([
      "template.applicableCurrentVersion",
      "customer.email",
      "commercial.totalAmountCents",
      "booking.items",
      "booking.startDate",
    ])
  })
})
