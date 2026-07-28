import { describe, expect, it } from "vitest"

import {
  applyTravelerPricingCategory,
  createBlankTraveler,
  insertPersonTraveler,
  matchPricingCategoryForTraveler,
} from "../../src/components/travelers-section.js"

describe("traveler person insertion", () => {
  it("fills the initial blank lead row instead of appending a second traveler", () => {
    const blankLead = createBlankTraveler("lead")
    const personTraveler = {
      ...createBlankTraveler("adult"),
      personId: "person_1",
      firstName: "Ana",
      lastName: "Popescu",
    }

    const result = insertPersonTraveler([blankLead], personTraveler)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      clientTravelerKey: blankLead.clientTravelerKey,
      personId: "person_1",
      firstName: "Ana",
      lastName: "Popescu",
      role: "lead",
    })
  })

  it("keeps a category selected before choosing the traveler", () => {
    const blankLead = {
      ...createBlankTraveler("lead"),
      pricingCategoryId: "pcat_senior",
      pricingCategorySource: "manual" as const,
      pricingUnitId: "optu_tour",
      pricingUnitSource: "manual" as const,
    }
    const personTraveler = {
      ...createBlankTraveler("adult"),
      personId: "person_1",
      firstName: "Ana",
      lastName: "Popescu",
    }

    expect(insertPersonTraveler([blankLead], personTraveler)[0]).toMatchObject({
      personId: "person_1",
      role: "lead",
      pricingCategoryId: "pcat_senior",
      pricingCategorySource: "manual",
      pricingUnitId: "optu_tour",
      pricingUnitSource: "manual",
    })
  })
})

describe("traveler pricing category matching", () => {
  it("does not let unbounded adult categories capture child DOB matches", () => {
    const result = matchPricingCategoryForTraveler(
      [
        {
          categoryId: "pcat_adult",
          name: "Adult",
          code: "ADULT",
          categoryType: "adult",
          minAge: null,
          maxAge: null,
          unitIds: ["optu_double"],
        },
        {
          categoryId: "pcat_child",
          name: "Child under 12",
          code: "CHILD",
          categoryType: "child",
          minAge: 0,
          maxAge: 12,
          unitIds: ["optu_double"],
        },
      ],
      "2020-01-01",
      "child",
      "optu_double",
    )

    expect(result).toBe("pcat_child")
  })

  it("keeps an explicit senior category on its compatible pricing unit", () => {
    const traveler = createBlankTraveler("lead")
    const result = applyTravelerPricingCategory(traveler, {
      categoryId: "pcat_senior",
      name: "Senior 65+",
      code: "SENIOR",
      categoryType: "senior",
      minAge: 65,
      maxAge: null,
      unitIds: ["optu_tour"],
    })

    expect(result).toMatchObject({
      pricingCategoryId: "pcat_senior",
      pricingCategorySource: "manual",
      pricingUnitId: "optu_tour",
      pricingUnitSource: "manual",
      role: "lead",
    })
  })
})
