import { describe, expect, it } from "vitest"

import { bookingSelectionV1, travelerEntryV1 } from "./selection-contracts.js"

const ENTITY = {
  module: "products",
  id: "prod_1",
  sourceKind: "owned",
}

/** `billing.contact` is required, so an address-only case still has to carry one. */
const CONTACT = { firstName: "Test", lastName: "Traveler", email: "test@example.com" }

describe("booking selection contracts", () => {
  it("preserves sourced cruise merchandise choices without provider authority", () => {
    const parsed = bookingSelectionV1.parse({
      entity: {
        module: "cruises",
        id: "cruise_1",
        sourceKind: "cruise:provider",
        sourceConnectionId: "server_connection",
        sourceRef: "cruise_ref",
      },
      configure: {
        pax: { adult: 2 },
        sailingId: "encoded_sailing_ref",
        cabinCategoryId: "encoded_cabin_ref",
        occupancy: 2,
        passengerComposition: { adults: 2 },
        fareCode: "FLEX",
        fareVariant: "cruise_only",
        bookingTerms: { refundable: true },
      },
    })

    expect(parsed.configure).toMatchObject({
      sailingId: "encoded_sailing_ref",
      cabinCategoryId: "encoded_cabin_ref",
      occupancy: 2,
      passengerComposition: { adults: 2 },
      fareCode: "FLEX",
      fareVariant: "cruise_only",
      bookingTerms: { refundable: true },
    })
  })

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

  it("carries an administrative subdivision on the billing address", () => {
    // Romania is the case that forced this (voyant#4290): the invoice needs
    // the judet, and Bucharest has no ordinary city/county pair — its six
    // Sectors ARE the county-level subdivision. Sector in `city`, county in
    // `region`, neither overloaded into an address line.
    const parsed = bookingSelectionV1.safeParse({
      entity: ENTITY,
      billing: { contact: CONTACT, address: { city: "Sector 3", region: "RO-B", country: "RO" } },
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.billing.address.region).toBe("RO-B")
  })

  it("leaves the region free-form so a county name is as valid as an ISO code", () => {
    // The Booking column this lands in is free text and already holds both
    // "Cluj" and "Ile-de-France". Enforcing ISO 3166-2 here would reject data
    // the destination accepts; the code is the recommendation, not the gate.
    for (const region of ["RO-CJ", "Cluj", "Ile-de-France"]) {
      const parsed = bookingSelectionV1.safeParse({
        entity: ENTITY,
        billing: { contact: CONTACT, address: { region } },
      })
      expect(parsed.success, region).toBe(true)
    }
  })

  it("rejects address values wider than the columns they settle into", () => {
    // Admitting these would move the failure to commit time, where the caller
    // can no longer tell which field was at fault.
    const parsed = bookingSelectionV1.safeParse({
      entity: ENTITY,
      billing: { contact: CONTACT, address: { region: "x".repeat(101) } },
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
