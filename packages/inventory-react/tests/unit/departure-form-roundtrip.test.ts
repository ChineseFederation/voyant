import { instantToSlotLocal, localToInstant } from "@voyant-travel/operations/scheduling"
import { describe, expect, it } from "vitest"

/**
 * The departure form's write path used to commit the operator's entered
 * wall-clock straight through as UTC:
 *
 *   new Date(`${date}T${time}:00Z`).toISOString()
 *
 * so "14:00, Europe/Bucharest" was stored as 14:00Z — a departure that actually
 * ran at 16:00 local. These pin the contract the form now relies on: the pair
 * of helpers must round-trip a wall clock through the slot's zone exactly.
 */
describe("departure form local <-> instant round trip", () => {
  const cases = [
    {
      date: "2026-11-20",
      time: "14:00",
      timezone: "Europe/Bucharest",
      instant: "2026-11-20T12:00:00.000Z",
    },
    {
      date: "2026-10-15",
      time: "09:00",
      timezone: "Europe/Bucharest",
      instant: "2026-10-15T06:00:00.000Z",
    },
    { date: "2026-11-20", time: "09:00", timezone: "UTC", instant: "2026-11-20T09:00:00.000Z" },
    {
      date: "2026-11-20",
      time: "07:00",
      timezone: "America/New_York",
      instant: "2026-11-20T12:00:00.000Z",
    },
  ]

  for (const c of cases) {
    it(`stores ${c.time} ${c.timezone} as ${c.instant}`, () => {
      expect(localToInstant({ date: c.date, time: c.time, timezone: c.timezone })).toBe(c.instant)
    })

    it(`reads ${c.instant} back as ${c.time} ${c.timezone}`, () => {
      expect(instantToSlotLocal(c.instant, c.timezone)).toEqual({ date: c.date, time: c.time })
    })
  }

  // The old helper's failure mode, stated as an explicit expectation so a
  // regression to naive `T${time}Z` concatenation is caught rather than
  // silently reintroduced.
  it("does not treat the entered wall clock as UTC", () => {
    const naive = new Date("2026-11-20T14:00:00Z").toISOString()
    const correct = localToInstant({
      date: "2026-11-20",
      time: "14:00",
      timezone: "Europe/Bucharest",
    })
    expect(correct).not.toBe(naive)
  })

  // A departure entered inside the spring-forward gap has no real instant.
  // The form catches this and shows a field error instead of writing a time
  // silently shifted by an hour.
  it("rejects a local time that does not exist in the zone", () => {
    expect(() =>
      localToInstant({ date: "2027-03-28", time: "03:30", timezone: "Europe/Bucharest" }),
    ).toThrow(RangeError)
  })

  // Autumn fall-back repeats a wall clock; resolution must still be total.
  it("resolves an ambiguous fall-back local time to a real instant", () => {
    const iso = localToInstant({
      date: "2026-10-25",
      time: "03:30",
      timezone: "Europe/Bucharest",
    })
    expect(instantToSlotLocal(iso, "Europe/Bucharest")).toEqual({
      date: "2026-10-25",
      time: "03:30",
    })
  })
})
