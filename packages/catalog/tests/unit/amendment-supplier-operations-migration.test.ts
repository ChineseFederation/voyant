import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../../migrations/20260802170000_amendment_supplier_operations.sql", import.meta.url),
  "utf8",
)

describe("Amendment Supplier Operation migration", () => {
  it("backfills the generic subject before enforcing it", () => {
    const backfill = migration.indexOf(
      `SET "subject_type" = 'booking_session', "subject_id" = "session_id"`,
    )
    const required = migration.indexOf('ALTER COLUMN "subject_type" SET NOT NULL')

    expect(backfill).toBeGreaterThanOrEqual(0)
    expect(required).toBeGreaterThan(backfill)
  })

  it("keeps Session and Amendment operation shapes mutually exclusive", () => {
    expect(migration).toContain("\"subject_type\" = 'booking_session'")
    expect(migration).toContain('"session_id" IS NOT NULL')
    expect(migration).toContain('"quote_id" IS NOT NULL')
    expect(migration).toContain("\"subject_type\" = 'booking_amendment'")
    expect(migration).toContain('"session_id" IS NULL')
    expect(migration).toContain('"booking_item_id" IS NOT NULL')
    expect(migration).toContain('"amendment_id" IS NOT NULL')
  })

  it("moves idempotency and active-operation guards to the generic subject", () => {
    expect(migration).toContain('"uidx_supplier_operations_subject_command"')
    expect(migration).toContain('("subject_type","subject_id","scope_key","idempotency_key")')
    expect(migration).toContain('"uidx_supplier_operations_subject_active_guard"')
    expect(migration).toContain("('reserve','modify','cancel')")
  })
})
