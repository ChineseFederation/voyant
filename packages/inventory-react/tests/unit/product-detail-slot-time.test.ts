import { describe, expect, it } from "vitest"

import {
  type DepartureSlot,
  formatDuration,
  formatSlotDate,
  formatSlotTime,
} from "../../src/components/product-detail/product-detail-shared.js"

/**
 * A slot's `startsAt`/`endsAt` are true UTC instants; `timezone` is the zone the
 * departure actually runs in. The admin has to resolve one through the other —
 * printing the UTC clock reads to an operator as the departure time.
 *
 * Europe/Bucharest is deliberate: EET (UTC+2) in winter, EEST (UTC+3) in
 * summer, so it catches a fix that hardcodes a single offset.
 */
function slot(overrides: Partial<DepartureSlot> = {}): DepartureSlot {
  return {
    id: "avsl_1",
    productId: "prod_1",
    optionId: null,
    itineraryId: null,
    dateLocal: "2026-11-20",
    startsAt: "2026-11-20T12:00:00.000Z",
    endsAt: null,
    timezone: "Europe/Bucharest",
    status: "open",
    unlimited: false,
    initialPax: 12,
    remainingPax: 12,
    nights: null,
    days: null,
    notes: null,
    ...overrides,
  }
}

describe("formatSlotTime", () => {
  it("resolves the instant in the slot timezone (winter, UTC+2)", () => {
    expect(formatSlotTime("2026-11-20T12:00:00.000Z", "Europe/Bucharest")).toBe("14:00")
  })

  it("resolves the instant in the slot timezone (summer DST, UTC+3)", () => {
    expect(formatSlotTime("2026-10-15T06:00:00.000Z", "Europe/Bucharest")).toBe("09:00")
  })

  it("leaves a UTC slot unchanged", () => {
    expect(formatSlotTime("2026-11-20T12:00:00.000Z", "UTC")).toBe("12:00")
  })

  it("handles a zone behind UTC", () => {
    expect(formatSlotTime("2026-11-20T12:00:00.000Z", "America/New_York")).toBe("07:00")
  })

  it("falls back to UTC rather than throwing on a malformed zone", () => {
    expect(formatSlotTime("2026-11-20T12:00:00.000Z", "Not/AZone")).toBe("12:00")
  })
})

describe("formatSlotDate", () => {
  it("returns the local calendar day, not the UTC one", () => {
    // 23:30 UTC is already the next day in Bucharest.
    expect(formatSlotDate("2026-11-20T23:30:00.000Z", "Europe/Bucharest")).toBe("2026-11-21")
  })

  it("rolls backwards for a zone behind UTC", () => {
    expect(formatSlotDate("2026-11-20T02:00:00.000Z", "America/New_York")).toBe("2026-11-19")
  })
})

describe("formatDuration", () => {
  it("prefers explicit nights/days overrides", () => {
    expect(formatDuration(slot({ nights: 3, days: 4 }))).toBe("4 days / 3 nights")
  })

  it("returns a placeholder when there is no end", () => {
    expect(formatDuration(slot())).toBe("-")
  })

  it("reports sub-day spans in hours", () => {
    expect(
      formatDuration(
        slot({
          startsAt: "2026-11-20T12:00:00.000Z",
          endsAt: "2026-11-20T18:00:00.000Z",
        }),
      ),
    ).toBe("6h")
  })

  // The regression: counting nights across UTC days miscounts any itinerary
  // whose start sits on the far side of midnight locally. Here the UTC span is
  // 19→22 (three days) but the local span is 20→22 — two nights.
  it("counts nights across local calendar days, not UTC ones", () => {
    expect(
      formatDuration(
        slot({
          startsAt: "2026-11-19T22:30:00.000Z", // 20 Nov 00:30 local
          endsAt: "2026-11-22T21:00:00.000Z", // 22 Nov 23:00 local
        }),
      ),
    ).toBe("2 nights")
  })
})
