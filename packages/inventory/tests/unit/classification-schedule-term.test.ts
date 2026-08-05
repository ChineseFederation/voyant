import { describe, expect, it } from "vitest"

import {
  resolveProductClassification,
  resolveScheduleTerm,
  SCHEDULE_TERMS,
} from "../../src/classification.js"

describe("resolveScheduleTerm", () => {
  it("names a timed sub-day explicit duration a Session (the 60-minute Boat Tour)", () => {
    expect(
      resolveScheduleTerm({
        durationMinutes: 60,
        durationDays: 1,
        durationProvenance: "explicit",
      }),
    ).toBe("session")
  })

  it("names a timed Activity (120 minutes) a Session", () => {
    expect(
      resolveScheduleTerm({
        durationMinutes: 120,
        durationDays: 1,
        durationProvenance: "explicit",
      }),
    ).toBe("session")
  })

  it("names an explicit full-day-or-longer duration a Departure", () => {
    expect(
      resolveScheduleTerm({
        durationMinutes: 1440,
        durationDays: 1,
        durationProvenance: "explicit",
      }),
    ).toBe("departure")
    expect(
      resolveScheduleTerm({
        durationMinutes: 2880,
        durationDays: 2,
        durationProvenance: "explicit",
      }),
    ).toBe("departure")
  })

  it("names an itinerary-derived day span a Departure (Day Tour, Multi-day Tour)", () => {
    expect(
      resolveScheduleTerm({
        durationMinutes: null,
        durationDays: 1,
        durationProvenance: "itinerary-derived",
      }),
    ).toBe("departure")
    expect(
      resolveScheduleTerm({
        durationMinutes: null,
        durationDays: 3,
        durationProvenance: "itinerary-derived",
      }),
    ).toBe("departure")
  })

  it("names an unresolved duration an Occurrence (Event date, opening-hours Admission)", () => {
    expect(
      resolveScheduleTerm({
        durationMinutes: null,
        durationDays: null,
        durationProvenance: "unresolved",
      }),
    ).toBe("occurrence")
  })

  it("only ever returns one of the three known tokens", () => {
    for (const provenance of ["explicit", "itinerary-derived", "unresolved"] as const) {
      const term = resolveScheduleTerm({
        durationMinutes: provenance === "explicit" ? 90 : null,
        durationDays: provenance === "itinerary-derived" ? 2 : null,
        durationProvenance: provenance,
      })
      expect(SCHEDULE_TERMS).toContain(term)
    }
  })
})

describe("resolveProductClassification attaches the schedule term", () => {
  it("resolves a Boat Tour family=tour + 60-minute duration to a Session", () => {
    const classification = resolveProductClassification({
      family: { code: "tour", name: "Tour" },
      subtypeCode: "boat-tour",
      durationMinutes: 60,
      itineraryDurationDays: null,
    })
    expect(classification.familyCode).toBe("tour")
    expect(classification.scheduleTerm).toBe("session")
    expect(classification.reviewRequired).toBe(false)
  })

  it("resolves a Multi-day Tour to a Departure", () => {
    const classification = resolveProductClassification({
      family: { code: "tour", name: "Tour" },
      subtypeCode: "multi-day-tour",
      durationMinutes: null,
      itineraryDurationDays: 3,
    })
    expect(classification.scheduleTerm).toBe("departure")
  })

  it("resolves an unclassified, undurated legacy row to an Occurrence and flags review", () => {
    const classification = resolveProductClassification({
      family: null,
      subtypeCode: null,
      durationMinutes: null,
      itineraryDurationDays: null,
    })
    expect(classification.scheduleTerm).toBe("occurrence")
    expect(classification.reviewRequired).toBe(true)
    expect(classification.reviewReasons).toEqual(["missing_family", "unresolved_duration"])
  })
})
