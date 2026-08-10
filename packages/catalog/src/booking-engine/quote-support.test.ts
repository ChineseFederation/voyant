import { describe, expect, it } from "vitest"

import { engineParametersFromSelection } from "./quote-support.js"

describe("Connect package Booking Session parameters", () => {
  it("forwards exact cruise choices and terms without source authority", () => {
    const parameters = engineParametersFromSelection(undefined, {
      configure: {
        sailingId: "sailing_ref",
        cabinCategoryId: "cabin_ref",
        occupancy: 2,
        passengerComposition: { adults: 2 },
        fareCode: "FLEX",
        fareVariant: "cruise_only",
        bookingTerms: { refundable: true },
      },
    })

    expect(parameters).toMatchObject({
      sailingId: "sailing_ref",
      cabinCategoryId: "cabin_ref",
      occupancy: 2,
      passengerComposition: { adults: 2 },
      fareCode: "FLEX",
      fareVariant: "cruise_only",
      bookingTerms: { refundable: true },
    })
    expect(parameters).not.toHaveProperty("connectionId")
    expect(parameters).not.toHaveProperty("providerId")
  })

  it("projects stable package pins without accepting a provider selector", () => {
    const parameters = engineParametersFromSelection(
      undefined,
      {
        configure: {
          departureDate: "2026-09-10",
          departureAirportCode: "OTP",
          nights: 5,
          pax: { adult: 2 },
          roomTypeId: "room_1",
          ratePlanId: "rate_1:AI",
          board: "AI",
        },
      },
      { entityModule: "products", sourceKind: "voyant-connect" },
    )

    expect(parameters).toMatchObject({
      connectRoute: "packages",
      departureDate: "2026-09-10",
      departureAirportCode: "OTP",
      nights: 5,
      paxCount: 2,
      roomTypeId: "room_1",
      ratePlanId: "rate_1:AI",
      board: "AI",
    })
    expect(parameters).not.toHaveProperty("connectionId")
    expect(parameters).not.toHaveProperty("providerId")
  })

  it("projects sourced stay dates, room pins, and occupancy without source authority", () => {
    const parameters = engineParametersFromSelection(
      undefined,
      {
        configure: {
          pax: { adult: 2, child: 1 },
          dateRange: { checkIn: "2026-09-10", checkOut: "2026-09-15" },
          roomTypeId: "room_1",
          ratePlanId: "rate_1",
        },
        accommodation: {
          rooms: [{ optionUnitId: "room_1", ratePlanId: "rate_1", quantity: 1 }],
        },
      },
      { entityModule: "accommodations", sourceKind: "voyant-connect" },
    )

    expect(parameters).toMatchObject({
      connectRoute: "stays",
      checkIn: "2026-09-10",
      checkOut: "2026-09-15",
      rooms: [
        {
          roomTypeId: "room_1",
          ratePlanId: "rate_1",
          occupancy: { adults: 2, children: 1 },
        },
      ],
    })
    expect(parameters).not.toHaveProperty("connectionId")
  })
})
