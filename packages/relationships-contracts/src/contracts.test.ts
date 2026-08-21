import { describe, expect, it } from "vitest"

import {
  activityTypeSchema,
  customerSignalKindSchema,
  entityTypeSchema,
  insertCustomerSignalSchema,
  insertPersonRelationshipSchema,
  personRelationshipKindSchema,
  updatePersonRelationshipSchema,
} from "./index.js"

describe("@voyant-travel/relationships-contracts validation", () => {
  it("accepts valid enum vocabulary values", () => {
    expect(entityTypeSchema.parse("person")).toBe("person")
    expect(entityTypeSchema.parse("inquiry")).toBe("inquiry")
    expect(personRelationshipKindSchema.parse("travel_companion")).toBe("travel_companion")
    expect(activityTypeSchema.parse("follow_up")).toBe("follow_up")
  })

  it("rejects values outside the enum vocabulary", () => {
    expect(entityTypeSchema.safeParse("vendor").success).toBe(false)
    expect(personRelationshipKindSchema.safeParse("delegate").success).toBe(false)
    expect(activityTypeSchema.safeParse("voicemail").success).toBe(false)
  })

  it("rejects reversed person relationship date ranges", () => {
    expect(
      insertPersonRelationshipSchema.safeParse({
        toPersonId: "person_b",
        kind: "travel_companion",
        startDate: "2026-07-10",
        endDate: "2026-07-01",
      }).success,
    ).toBe(false)
    expect(
      updatePersonRelationshipSchema.safeParse({
        startDate: "2026-07-10",
        endDate: "2026-07-01",
      }).success,
    ).toBe(false)
  })

  it("keeps legacy Inquiry signal kinds readable while rejecting new writes", () => {
    expect(customerSignalKindSchema.safeParse("inquiry").success).toBe(true)
    expect(customerSignalKindSchema.safeParse("request_offer").success).toBe(true)

    const input = {
      personId: "person_1",
      kind: "inquiry",
      source: "form",
    }
    expect(insertCustomerSignalSchema.safeParse(input).success).toBe(false)
    expect(insertCustomerSignalSchema.safeParse({ ...input, kind: "notify" }).success).toBe(true)
  })
})
