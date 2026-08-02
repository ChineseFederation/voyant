import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { STANDARD_PRODUCT_FAMILIES } from "../../src/classification.js"

const familyMigration = readFileSync(
  new URL("../../migrations/20260801140300_product_families_and_duration.sql", import.meta.url),
  "utf8",
)
const positiveDurationMigration = readFileSync(
  new URL("../../migrations/0008_product_duration_positive.sql", import.meta.url),
  "utf8",
)

describe("product family and duration migration", () => {
  it("adds nullable classification fields and tightens duration forward-only", () => {
    expect(familyMigration).toContain(`ADD COLUMN "product_subtype_code" text`)
    expect(familyMigration).toContain(`ADD COLUMN "duration_minutes" integer`)
    expect(familyMigration).toContain(`CHECK ("products"."duration_minutes" >= 0)`)
    expect(positiveDurationMigration).toContain(
      `DROP CONSTRAINT "chk_products_duration_minutes_nonneg"`,
    )
    expect(positiveDurationMigration).toContain(
      `SET "duration_minutes" = NULL WHERE "duration_minutes" = 0`,
    )
    expect(positiveDurationMigration).toContain(`CHECK ("products"."duration_minutes" > 0)`)
  })

  it("seeds every standard family idempotently by stable code", () => {
    for (const family of STANDARD_PRODUCT_FAMILIES) {
      expect(familyMigration).toContain(`'${family.id}', '${family.code}', '${family.name}'`)
    }
    expect(familyMigration).toContain(`ON CONFLICT ("code") DO NOTHING`)
  })
})
