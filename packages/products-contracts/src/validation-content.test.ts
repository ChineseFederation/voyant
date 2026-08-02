import { describe, expect, it } from "vitest"

import { insertProductTypeSchema, updateProductTypeSchema } from "./validation-content.js"

describe("product family contracts", () => {
  it("accepts stable kebab-case codes on creation", () => {
    expect(
      insertProductTypeSchema.parse({ name: "Boat operator product", code: "boat-product" }),
    ).toMatchObject({ code: "boat-product" })
    expect(insertProductTypeSchema.safeParse({ name: "Bad", code: "Boat Tour" }).success).toBe(
      false,
    )
  })

  it("does not permit changing a family code after creation", () => {
    const result = updateProductTypeSchema.safeParse({ name: "Renamed Tour", code: "new-tour" })
    expect(result.success).toBe(false)
  })
})
