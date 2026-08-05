import { describe, expect, it } from "vitest"

import {
  authoringGroupAnchorId,
  authoringGroupDeepLink,
  authoringGroupFromHash,
  PRODUCT_AUTHORING_GROUP_IDS,
} from "./product-authoring-nav.js"

describe("product authoring navigation", () => {
  it("declares the seven groups in canonical order", () => {
    expect([...PRODUCT_AUTHORING_GROUP_IDS]).toEqual([
      "overview",
      "content",
      "plan",
      "options",
      "availability",
      "distribution",
      "history",
    ])
  })

  it("derives a stable anchor id and a contextual deep link per group", () => {
    expect(authoringGroupAnchorId("plan")).toBe("authoring-plan")
    expect(authoringGroupDeepLink("prod_9", "options")).toBe("/products/prod_9#authoring-options")
  })

  it("round-trips a hash back to its group and ignores unknown hashes", () => {
    for (const id of PRODUCT_AUTHORING_GROUP_IDS) {
      expect(authoringGroupFromHash(`#${authoringGroupAnchorId(id)}`)).toBe(id)
    }
    expect(authoringGroupFromHash("#authoring-nope")).toBeNull()
    expect(authoringGroupFromHash("")).toBeNull()
    expect(authoringGroupFromHash(null)).toBeNull()
  })
})
