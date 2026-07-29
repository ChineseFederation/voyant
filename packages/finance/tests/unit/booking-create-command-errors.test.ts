import { describe, expect, it } from "vitest"

import { bookingCreateCommandError } from "../../src/booking-create-command.js"

describe("booking create command errors", () => {
  it("explains room capacity failures as a corrective action", () => {
    const error = bookingCreateCommandError({
      status: "room_occupancy_insufficient",
      pax: 3,
      occupancyMax: 2,
      shortfall: 1,
    })

    expect(error.message).toMatch(/fit 2 traveler/)
    expect(error.message).toMatch(/Add room capacity for 1 more traveler/)
    expect(error.message).toMatch(/assign every traveler to a room/)
  })

  it("explains traveler and room payload mismatches", () => {
    const error = bookingCreateCommandError({
      status: "payload_resolver_mismatch",
      mismatches: [],
    })

    expect(error.message).toMatch(/traveler-to-room assignments/)
    expect(error.message).toMatch(/assign each traveler key/)
  })

  it("includes the invalid payment field and reason", () => {
    const error = bookingCreateCommandError({
      status: "invalid_payment_schedules",
      issues: [{ path: ["paymentSchedules", 0, "amountCents"], message: "Total is too high" }],
    })

    expect(error.message).toContain("paymentSchedules.0.amountCents: Total is too high")
  })
})
