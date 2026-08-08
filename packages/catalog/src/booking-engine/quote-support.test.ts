import { describe, expect, it } from "vitest"

import { engineParametersFromSelection } from "./quote-support.js"

describe("Connect package Booking Session parameters", () => {
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
})
