import type { FareCalendarRequest } from "@voyant-travel/flights/contract/types"
import { describe, expect, it } from "vitest"

import { synthesizeFareCalendar } from "./synthesis-fare-calendar.js"
import { applySearchFilters, synthesizeOffers } from "./synthesis-offers.js"

const PASSENGERS = { adults: 1, children: 0, infants: 0 }

function calendarRequest(overrides: Partial<FareCalendarRequest> = {}): FareCalendarRequest {
  return {
    origin: "BCN",
    destination: "FCO",
    from: "2026-07-06",
    to: "2026-07-12",
    passengers: PASSENGERS,
    cabin: "economy",
    ...overrides,
  }
}

/** Cheapest total a real search returns for one leg, or undefined when none. */
function cheapestFromSearch(origin: string, destination: string, departureDate: string) {
  const request = {
    slices: [{ origin, destination, departureDate }],
    passengers: PASSENGERS,
    cabin: "economy" as const,
  }
  const offers = applySearchFilters(synthesizeOffers(request), request)
  return offers.reduce<string | undefined>(
    (best, offer) =>
      best != null && Number(best) <= Number(offer.totalPrice.amount)
        ? best
        : offer.totalPrice.amount,
    undefined,
  )
}

describe("synthesizeFareCalendar", () => {
  it("quotes every day in the inclusive window, ascending", () => {
    const { days } = synthesizeFareCalendar(calendarRequest())

    expect(days.map((day) => day.date)).toEqual([
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ])
  })

  // The whole point of pricing through the real offer path: a picker that
  // shows one number and a search that returns another is worse than no
  // number at all.
  it("quotes each day at the price a search on that day returns", () => {
    const { days } = synthesizeFareCalendar(calendarRequest())

    for (const day of days) {
      expect(day.cheapestPrice?.amount).toBe(cheapestFromSearch("BCN", "FCO", day.date))
    }
  })

  it("marks a day unavailable exactly when search finds nothing", () => {
    // SFO is a thin long-haul endpoint in the demo network, so its route
    // operates Mon/Wed/Fri/Sat only. 2026-07-07 is a Tuesday.
    const { days } = synthesizeFareCalendar(
      calendarRequest({ origin: "LHR", destination: "SFO", from: "2026-07-06", to: "2026-07-08" }),
    )

    expect(days.map((day) => day.available)).toEqual([true, false, true])
    expect(days[1]?.cheapestPrice).toBeUndefined()
    expect(cheapestFromSearch("LHR", "SFO", "2026-07-07")).toBeUndefined()
  })

  it("prices a round-trip day as the whole trip, not just the outbound", () => {
    const oneWay = synthesizeFareCalendar(calendarRequest())
    const roundTrip = synthesizeFareCalendar(calendarRequest({ returnAfterDays: 7 }))

    const oneWayFirst = Number(oneWay.days[0]?.cheapestPrice?.amount)
    const roundTripFirst = Number(roundTrip.days[0]?.cheapestPrice?.amount)

    expect(roundTripFirst).toBeGreaterThan(oneWayFirst)
  })

  it("returns no days when the window is inverted", () => {
    const { days } = synthesizeFareCalendar(
      calendarRequest({ from: "2026-07-12", to: "2026-07-06" }),
    )

    expect(days).toEqual([])
  })

  it("caps a window wider than the quotable range", () => {
    const { days } = synthesizeFareCalendar(
      calendarRequest({ from: "2026-01-01", to: "2026-12-31" }),
    )

    expect(days).toHaveLength(92)
  })
})
