import { describe, expect, it } from "vitest"

import { entityTypeSchema, proposalStatusSchema, proposalVersionStatusSchema } from "./index.js"

describe("@voyant-travel/proposals-contracts validation", () => {
  it("accepts valid enum vocabulary values", () => {
    expect(entityTypeSchema.parse("proposal")).toBe("proposal")
    expect(proposalStatusSchema.parse("won")).toBe("won")
    expect(proposalVersionStatusSchema.parse("accepted")).toBe("accepted")
  })

  it("rejects values outside the enum vocabulary", () => {
    expect(entityTypeSchema.safeParse("vendor").success).toBe(false)
    expect(proposalStatusSchema.safeParse("pending").success).toBe(false)
    expect(proposalVersionStatusSchema.safeParse("viewed").success).toBe(false)
  })
})
