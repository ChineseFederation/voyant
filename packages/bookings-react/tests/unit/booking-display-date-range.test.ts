import { describe, expect, it } from "vitest"

import { resolveBookingDisplayDateRange } from "../../src/components/booking-display-date-range.js"

describe("resolveBookingDisplayDateRange", () => {
  it("shows the operator-edited booking period instead of stale item timestamps", () => {
    expect(
      resolveBookingDisplayDateRange({
        startDate: "2026-10-28",
        endDate: "2026-11-01",
        startsAt: "2026-10-21T08:00:00.000Z",
        endsAt: "2026-10-25T18:00:00.000Z",
      }),
    ).toEqual({ start: "2026-10-28", end: "2026-11-01" })
  })

  it("falls back to item timestamps for legacy bookings without booking dates", () => {
    expect(
      resolveBookingDisplayDateRange({
        startDate: null,
        endDate: null,
        startsAt: "2026-10-21T08:00:00.000Z",
        endsAt: "2026-10-25T18:00:00.000Z",
      }),
    ).toEqual({
      start: "2026-10-21T08:00:00.000Z",
      end: "2026-10-25T18:00:00.000Z",
    })
  })
})
