import { describe, expect, it } from "vitest"

import {
  DEFAULT_PAX_BANDS,
  DEFAULT_PAX_TOTAL,
  defaultBookingFields,
  defaultDraftShapeFlags,
  defaultTravelerFields,
  paxBandBaseCode,
  paxBandsAllowedTotalFrom,
  paxBandTierCode,
} from "./draft-shape.js"

describe("pax band tier codes", () => {
  it("leaves a canonical code untouched", () => {
    // What a product with one tier per category emits, and what every draft
    // written before tiers existed carries.
    expect(paxBandBaseCode("adult")).toBe("adult")
    expect(paxBandBaseCode("child")).toBe("child")
  })

  it("reads the category back off a tier-qualified code", () => {
    const code = paxBandTierCode("child", "pricing_categories_01j")
    expect(code).toBe("child:pricing_categories_01j")
    expect(paxBandBaseCode(code)).toBe("child")
  })

  it("stops at the first separator so an id containing one still resolves", () => {
    expect(paxBandBaseCode("child:a:b")).toBe("child")
  })
})

describe("defaultDraftShapeFlags", () => {
  it("returns the canonical flag set: configure + billing + travelers + payment + review on, accommodation + addons off", () => {
    const flags = defaultDraftShapeFlags()
    expect(flags.showsConfigure).toBe(true)
    expect(flags.showsBilling).toBe(true)
    expect(flags.showsTravelers).toBe(true)
    expect(flags.showsAccommodation).toBe(false)
    expect(flags.showsAddons).toBe(false)
    expect(flags.showsPayment).toBe(true)
    expect(flags.showsReview).toBe(true)
  })

  it("returns a fresh object on each call (no shared mutation)", () => {
    const a = defaultDraftShapeFlags()
    const b = defaultDraftShapeFlags()
    expect(a).not.toBe(b)
  })
})

describe("paxBandsAllowedTotalFrom", () => {
  it("sums minCount and maxCount across bands", () => {
    expect(
      paxBandsAllowedTotalFrom([
        { code: "adult", label: "Adult", minCount: 1, maxCount: 8 },
        { code: "child", label: "Child", minCount: 0, maxCount: 4 },
      ]),
    ).toEqual({ min: 1, max: 12 })
  })

  it("returns 0/0 for an empty list", () => {
    expect(paxBandsAllowedTotalFrom([])).toEqual({ min: 0, max: 0 })
  })

  it("handles the default multi-band list", () => {
    expect(paxBandsAllowedTotalFrom(DEFAULT_PAX_BANDS)).toEqual({ min: 1, max: 18 })
  })
})

describe("DEFAULT_PAX_BANDS / DEFAULT_PAX_TOTAL constants", () => {
  it("DEFAULT_PAX_BANDS covers adults, children, and infants", () => {
    expect(DEFAULT_PAX_BANDS).toEqual([
      { code: "adult", label: "Adult", minAge: 12, minCount: 1, maxCount: 8 },
      { code: "child", label: "Child", minAge: 2, maxAge: 11, minCount: 0, maxCount: 6 },
      { code: "infant", label: "Infant", maxAge: 1, minCount: 0, maxCount: 4 },
    ])
  })

  it("DEFAULT_PAX_TOTAL is 1-8", () => {
    expect(DEFAULT_PAX_TOTAL).toEqual({ min: 1, max: 8 })
  })
})

describe("default field requirement sets", () => {
  it("defaultTravelerFields includes identity, contact, and document fields", () => {
    const fields = defaultTravelerFields()
    expect(fields.map((f) => f.key)).toEqual([
      "firstName",
      "lastName",
      "email",
      "phone",
      "dateOfBirth",
      "documentType",
      "documentNumber",
      "documentExpiry",
    ])
    expect(fields.find((f) => f.key === "firstName")?.required).toBe(true)
    expect(fields.find((f) => f.key === "email")?.required).toBe(false)
  })

  it("defaultBookingFields covers buyerType + address basics", () => {
    const fields = defaultBookingFields()
    const keys = fields.map((f) => f.key)
    expect(keys).toContain("buyerType")
    expect(keys).toContain("address.line1")
    expect(keys).toContain("address.city")
    expect(keys).toContain("address.country")
  })

  it("defaultBookingFields buckets fields into the billing group", () => {
    const fields = defaultBookingFields()
    expect(fields.every((f) => f.group === "billing")).toBe(true)
  })
})
