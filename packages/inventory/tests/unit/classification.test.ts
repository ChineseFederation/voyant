import { describe, expect, it } from "vitest"

import {
  resolveProductClassification,
  resolveProductDuration,
  STANDARD_PRODUCT_FAMILIES,
  STANDARD_PRODUCT_FAMILY_CODES,
} from "../../src/classification.js"

describe("resolveProductDuration", () => {
  it("prefers an explicit duration in minutes", () => {
    const resolved = resolveProductDuration({ durationMinutes: 60, itineraryDurationDays: 4 })
    expect(resolved).toEqual({ minutes: 60, days: 1, provenance: "explicit" })
  })

  it("calculates compat days from explicit minutes (rounded up, min 1)", () => {
    expect(resolveProductDuration({ durationMinutes: 60, itineraryDurationDays: null }).days).toBe(
      1,
    )
    expect(
      resolveProductDuration({ durationMinutes: 2880, itineraryDurationDays: null }).days,
    ).toBe(2)
    expect(
      resolveProductDuration({ durationMinutes: 1441, itineraryDurationDays: null }).days,
    ).toBe(2)
  })

  it("falls back to the itinerary-derived day count", () => {
    const resolved = resolveProductDuration({ durationMinutes: null, itineraryDurationDays: 5 })
    expect(resolved).toEqual({ minutes: null, days: 5, provenance: "itinerary-derived" })
  })

  it("reports unresolved when there is neither explicit nor itinerary duration", () => {
    const resolved = resolveProductDuration({ durationMinutes: null, itineraryDurationDays: null })
    expect(resolved).toEqual({ minutes: null, days: null, provenance: "unresolved" })
  })

  it("treats a non-positive explicit duration as absent and falls through", () => {
    const resolved = resolveProductDuration({ durationMinutes: -5, itineraryDurationDays: 3 })
    expect(resolved.provenance).toBe("itinerary-derived")
    expect(resolved.days).toBe(3)
    expect(
      resolveProductDuration({ durationMinutes: 0, itineraryDurationDays: null }).provenance,
    ).toBe("unresolved")
  })
})

describe("resolveProductClassification", () => {
  const tour = { code: "tour", name: "Tour" }

  it("keeps a 60-minute Boat Tour classified as a Tour, never an Activity", () => {
    const resolved = resolveProductClassification({
      family: tour,
      subtypeCode: "boat-tour",
      durationMinutes: 60,
      itineraryDurationDays: null,
    })
    expect(resolved.familyCode).toBe("tour")
    expect(resolved.subtypeCode).toBe("boat-tour")
    expect(resolved.durationMinutes).toBe(60)
    expect(resolved.durationProvenance).toBe("explicit")
    // A short duration does NOT flip the family to activity, and nothing is
    // under review — it is fully classified.
    expect(resolved.familyCode).not.toBe("activity")
    expect(resolved.reviewRequired).toBe(false)
    expect(resolved.reviewReasons).toEqual([])
  })

  it("requires review when the family is missing", () => {
    const resolved = resolveProductClassification({
      family: null,
      subtypeCode: null,
      durationMinutes: 60,
      itineraryDurationDays: null,
    })
    expect(resolved.familyCode).toBeNull()
    expect(resolved.reviewRequired).toBe(true)
    expect(resolved.reviewReasons).toContain("missing_family")
  })

  it("requires review when the duration is unresolved", () => {
    const resolved = resolveProductClassification({
      family: tour,
      subtypeCode: null,
      durationMinutes: null,
      itineraryDurationDays: null,
    })
    expect(resolved.durationProvenance).toBe("unresolved")
    expect(resolved.reviewRequired).toBe(true)
    expect(resolved.reviewReasons).toContain("unresolved_duration")
  })

  it("flags both reasons for a fully unclassified legacy row", () => {
    const resolved = resolveProductClassification({
      family: null,
      subtypeCode: null,
      durationMinutes: null,
      itineraryDurationDays: null,
    })
    expect(resolved.reviewReasons.sort()).toEqual(["missing_family", "unresolved_duration"])
  })

  it("derives duration from the itinerary when no explicit duration is set", () => {
    const resolved = resolveProductClassification({
      family: tour,
      subtypeCode: null,
      durationMinutes: null,
      itineraryDurationDays: 7,
    })
    expect(resolved.durationDays).toBe(7)
    expect(resolved.durationProvenance).toBe("itinerary-derived")
    expect(resolved.reviewRequired).toBe(false)
  })
})

describe("STANDARD_PRODUCT_FAMILIES", () => {
  it("declares the five standard families with stable codes", () => {
    expect(STANDARD_PRODUCT_FAMILY_CODES).toEqual([
      "tour",
      "activity",
      "attraction",
      "event",
      "transportation",
    ])
  })

  it("uses deterministic, unique typeids for the seed", () => {
    const ids = STANDARD_PRODUCT_FAMILIES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^ptyp_[0-9a-z]{26}$/)
  })
})
