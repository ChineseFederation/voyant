import { describe, expect, it } from "vitest"

import {
  insertOptionUnitSchema,
  insertProductOptionSchema,
  insertProductSchema,
  updateOptionUnitSchema,
  updateProductOptionSchema,
  updateProductSchema,
  validateMergedOptionUnit,
} from "./validation-core.js"

describe("core update validation", () => {
  const updateCases = [
    ["product", updateProductSchema, { name: "Everest Base Camp" }],
    ["product option", updateProductOptionSchema, { name: "Private room" }],
    ["option unit", updateOptionUnitSchema, { maxQuantity: 4 }],
  ] as const

  for (const [label, schema, patch] of updateCases) {
    it(`does not apply core defaults when parsing a partial ${label} patch`, () => {
      expect(schema.parse(patch)).toEqual(patch)
    })
  }

  it("keeps defaults on product option inserts", () => {
    expect(insertProductOptionSchema.parse({ name: "Standard" })).toMatchObject({
      status: "draft",
      isDefault: false,
      sortOrder: 0,
    })
  })

  it("keeps defaults on option unit inserts", () => {
    expect(insertOptionUnitSchema.parse({ name: "Adult" })).toMatchObject({
      unitType: "person",
      isRequired: false,
      isHidden: false,
      sortOrder: 0,
    })
  })

  it("requires an authored Product duration to be positive", () => {
    const base = { name: "Whale Watching", sellCurrency: "EUR" }

    expect(insertProductSchema.safeParse({ ...base, durationMinutes: 0 }).success).toBe(false)
    expect(updateProductSchema.safeParse({ durationMinutes: 0 }).success).toBe(false)
    expect(insertProductSchema.parse({ ...base, durationMinutes: 60 }).durationMinutes).toBe(60)
  })

  it("rejects option unit age ranges where minAge is greater than maxAge", () => {
    const result = insertOptionUnitSchema.safeParse({ name: "Senior", minAge: 70, maxAge: 12 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["maxAge"], message: "maxAge must be ≥ minAge" }),
        ]),
      )
    }
  })

  it("accepts option unit age ranges where minAge equals maxAge", () => {
    expect(insertOptionUnitSchema.parse({ name: "Infant", minAge: 2, maxAge: 2 })).toMatchObject({
      minAge: 2,
      maxAge: 2,
    })
  })

  it("validates merged option unit age ranges for partial updates", () => {
    expect(validateMergedOptionUnit({ minAge: 70, maxAge: 12 })).toEqual({
      ok: false,
      issues: [{ path: ["maxAge"], message: "maxAge must be ≥ minAge" }],
    })
  })
})

describe("core range validation", () => {
  it("rejects product inserts where startDate is after endDate", () => {
    const result = insertProductSchema.safeParse({
      name: "Backward dates",
      sellCurrency: "EUR",
      startDate: "2026-09-10",
      endDate: "2026-09-01",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["endDate"],
            message: "endDate must be on or after startDate",
          }),
        ]),
      )
    }
  })

  it("rejects product updates where both date bounds are inverted", () => {
    const result = updateProductSchema.safeParse({
      startDate: "2026-09-10",
      endDate: "2026-09-01",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      })
    }
  })

  it("accepts product date ranges with non-zero-padded date parts", () => {
    const result = insertProductSchema.safeParse({
      name: "Autumn departures",
      sellCurrency: "EUR",
      startDate: "2026-9-10",
      endDate: "2026-10-01",
    })

    expect(result.success).toBe(true)
  })

  it("rejects inverted product date ranges with non-zero-padded date parts", () => {
    const result = insertProductSchema.safeParse({
      name: "Backward dates",
      sellCurrency: "EUR",
      startDate: "2026-1-31",
      endDate: "2026-01-03",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["endDate"],
        message: "endDate must be on or after startDate",
      })
    }
  })

  it("rejects product option inserts where availableFrom is after availableTo", () => {
    const result = insertProductOptionSchema.safeParse({
      name: "Shoulder season",
      availableFrom: "2026-10-01",
      availableTo: "2026-05-01",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["availableTo"],
        message: "availableTo must be on or after availableFrom",
      })
    }
  })

  it("accepts product option availability with non-zero-padded date parts", () => {
    const result = insertProductOptionSchema.safeParse({
      name: "Shoulder season",
      availableFrom: "2026-9-10",
      availableTo: "2026-10-01",
    })

    expect(result.success).toBe(true)
  })

  it("rejects product option updates where both availability bounds are inverted", () => {
    const result = updateProductOptionSchema.safeParse({
      availableFrom: "2026-10-01",
      availableTo: "2026-05-01",
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["availableTo"],
        message: "availableTo must be on or after availableFrom",
      })
    }
  })

  it("rejects option unit quantity ranges where minQuantity is greater than maxQuantity", () => {
    const result = insertOptionUnitSchema.safeParse({
      name: "Family",
      minQuantity: 5,
      maxQuantity: 2,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["maxQuantity"],
        message: "maxQuantity must be ≥ minQuantity",
      })
    }
  })

  it("validates merged option unit quantity ranges for partial updates", () => {
    expect(validateMergedOptionUnit({ minQuantity: 5, maxQuantity: 2 })).toEqual({
      ok: false,
      issues: [{ path: ["maxQuantity"], message: "maxQuantity must be ≥ minQuantity" }],
    })
  })
})
