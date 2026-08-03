import { describe, expect, it } from "vitest"

import {
  applyBookingSessionStaffSelectionV1,
  normalizeBookingSessionStaffSelectionV1,
} from "../../src/booking-session-staff-selection.js"

describe("Booking Session staff selection", () => {
  it("keeps staff booking details while engine-owned identity, Hold, and lifecycle win", () => {
    const result = applyBookingSessionStaffSelectionV1(
      {
        productId: "prod_1",
        optionId: "opt_1",
        slotId: "slot_1",
        availabilityHoldToken: "bshd_1",
        sellAmountCentsOverride: 10_000,
        personId: "pers_derived",
        travelers: [
          {
            clientTravelerKey: "trav_1",
            firstName: "Derived",
            lastName: "Traveler",
          },
        ],
      },
      {
        personId: "pers_staff",
        organizationId: null,
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        contactEmail: "ada@example.test",
        internalNotes: "Call before arrival",
        bookingNumber: "CLIENT-CONTROLLED",
        travelers: [
          {
            clientTravelerKey: "trav_1",
            firstName: "Ada",
            lastName: "Lovelace",
            isPrimary: true,
          },
        ],
        paymentSchedules: [
          {
            scheduleType: "balance",
            status: "pending",
            dueDate: "2026-09-01",
            currency: "EUR",
            amountCents: 12000,
          },
        ],
        documentGeneration: {
          contractDocument: true,
          invoiceDocument: true,
          invoiceType: "invoice",
        },
      },
    )

    expect(result).toMatchObject({
      productId: "prod_1",
      optionId: "opt_1",
      slotId: "slot_1",
      availabilityHoldToken: "bshd_1",
      sellAmountCentsOverride: 10_000,
      personId: "pers_staff",
      internalNotes: "Call before arrival",
      travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    })
    expect(result).not.toHaveProperty("bookingNumber")
    expect(result).not.toHaveProperty("initialStatus")
  })

  it("strips legacy client-authored totals without an explicit manual override", () => {
    expect(() =>
      normalizeBookingSessionStaffSelectionV1({
        personId: "pers_staff",
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        contactEmail: "ada@example.test",
        travelers: [
          {
            clientTravelerKey: "trav_1",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        ],
        catalogSellAmountCents: 10000,
        confirmedSellAmountCents: 1,
      }),
    ).not.toThrow()
    expect(
      normalizeBookingSessionStaffSelectionV1({
        personId: "pers_staff",
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        contactEmail: "ada@example.test",
        travelers: [
          {
            clientTravelerKey: "trav_1",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        ],
        catalogSellAmountCents: 10000,
        confirmedSellAmountCents: 1,
      }),
    ).not.toHaveProperty("catalogSellAmountCents")
  })
})
