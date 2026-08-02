import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../../migrations/20260802180500_booking_amendment_adjustments.sql", import.meta.url),
  "utf8",
)

describe("Booking Amendment adjustment migration", () => {
  it("creates one idempotent financial adjustment per Amendment", () => {
    expect(migration).toContain('CREATE TABLE "finance_amendment_adjustments"')
    expect(migration).toContain('CREATE UNIQUE INDEX "uq_finance_amendment_adjustments_amendment"')
    expect(migration).toContain('CONSTRAINT "ck_finance_amendment_adjustments_money"')
    expect(migration).toContain(
      '"total_delta_cents" = "subtotal_delta_cents" + "fee_delta_cents" + "tax_delta_cents"',
    )
  })
})
