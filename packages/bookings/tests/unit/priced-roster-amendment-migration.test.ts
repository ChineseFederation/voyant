import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../../migrations/20260802180000_priced_roster_amendments.sql", import.meta.url),
  "utf8",
)

describe("priced roster Amendment migration", () => {
  it("preserves correction data and installs the v1 lifecycle invariants", () => {
    expect(migration).toContain('RENAME COLUMN "requested_patch" TO "requested_change"')
    expect(migration).toContain("'type', 'traveler_correction'")
    expect(migration).toContain("'traveler_add', 'traveler_drop'")
    expect(migration).toContain("'applying', 'in_doubt', 'manual_review'")
    expect(migration).toContain('CONSTRAINT "ck_booking_amendments_money"')
    expect(migration).toContain(
      '"price_delta_cents" = "subtotal_delta_cents" + "fee_delta_cents" + "tax_delta_cents"',
    )
  })
})
