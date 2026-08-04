import { describe, expect, it } from "vitest"

import { bookingSelectionV1, travelerEntryV1 } from "./selection-contracts.js"

const ENTITY = {
  module: "products",
  id: "prod_1",
  sourceKind: "owned",
}

describe("booking selection contracts", () => {
  it("rejects malformed billing contact emails", () => {
    const parsed = bookingSelectionV1.safeParse({
      entity: ENTITY,
      billing: {
        contact: {
          firstName: "Test",
          lastName: "Traveler",
          email: "not-an-email",
        },
      },
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts empty or syntactically valid selection contact emails", () => {
    expect(
      bookingSelectionV1.safeParse({
        entity: ENTITY,
        billing: {
          contact: {
            firstName: "Test",
            lastName: "Traveler",
            email: "",
          },
        },
      }).success,
    ).toBe(true)

    expect(
      bookingSelectionV1.safeParse({
        entity: ENTITY,
        billing: {
          contact: {
            firstName: "Test",
            lastName: "Traveler",
            email: "test@example.com",
          },
        },
      }).success,
    ).toBe(true)
  })

  it("accepts empty traveler emails but rejects malformed values", () => {
    expect(
      travelerEntryV1.safeParse({
        firstName: "Test",
        lastName: "Traveler",
        email: "",
      }).success,
    ).toBe(true)

    expect(
      travelerEntryV1.safeParse({
        firstName: "Test",
        lastName: "Traveler",
        email: "not-an-email",
      }).success,
    ).toBe(false)
  })

  it("accepts a Travel Credit redemption using the canonical wire fields", () => {
    const parsed = bookingSelectionV1.parse({
      entity: ENTITY,
      travelCreditRedemption: {
        travelCreditId: "trc_123",
        amountCents: 2_500,
      },
    })

    expect(parsed.travelCreditRedemption).toEqual({
      travelCreditId: "trc_123",
      amountCents: 2_500,
    })
  })
})
