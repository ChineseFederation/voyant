import { describe, expect, it } from "vitest"
import {
  bookingContractCustomerVariables,
  bookingContractPrerequisites,
  bookingContractTemplateMatchesChannel,
  resolveBookingContractLanguage,
} from "../../src/booking-contract-review.js"

describe("booking contract prerequisites", () => {
  it("keeps listing and draft-write prerequisites complete and deduplicated", () => {
    expect(
      bookingContractPrerequisites({
        templateApplicable: false,
        totalAmountCents: null,
        itemCount: 0,
        missingRequiredVariables: ["customer.email", "booking.startDate"],
      }),
    ).toEqual([
      "template.applicableCurrentVersion",
      "commercial.totalAmountCents",
      "booking.items",
      "customer.email",
      "booking.startDate",
    ])
  })

  it("allows phone-only bookings unless the selected template requires email", () => {
    expect(
      bookingContractPrerequisites({
        templateApplicable: true,
        totalAmountCents: 100_00,
        itemCount: 1,
      }),
    ).toEqual([])
    expect(
      bookingContractPrerequisites({
        templateApplicable: true,
        totalAmountCents: 100_00,
        itemCount: 1,
        missingRequiredVariables: ["customer.email"],
      }),
    ).toEqual(["customer.email"])
  })

  it("uses booking language fallbacks and exact-or-global channel matching", () => {
    expect(
      resolveBookingContractLanguage({
        communicationLanguage: "ro",
        contactPreferredLanguage: "fr",
      }),
    ).toBe("ro")
    expect(
      resolveBookingContractLanguage({
        communicationLanguage: null,
        contactPreferredLanguage: "fr",
      }),
    ).toBe("fr")
    expect(bookingContractTemplateMatchesChannel(null, undefined)).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_a", undefined)).toBe(false)
    expect(bookingContractTemplateMatchesChannel(null, "channel_a")).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_a", "channel_a")).toBe(true)
    expect(bookingContractTemplateMatchesChannel("channel_b", "channel_a")).toBe(false)
  })

  it("exposes phone contacts to template prerequisite evaluation", () => {
    expect(
      bookingContractCustomerVariables({
        contactFirstName: "Ana",
        contactLastName: "Pop",
        contactEmail: null,
        contactPhone: "+40700000000",
      }),
    ).toEqual({ name: "Ana Pop", email: null, phone: "+40700000000" })
  })
})
