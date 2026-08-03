import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../../migrations/20260802190000_booking_v1_beta_draft_cutover.sql", import.meta.url),
  "utf8",
)

describe("Booking v1 beta draft cutover migration", () => {
  it("fails closed before mutating ambiguous commitments or supplier effects", () => {
    const commitmentGuard = migration.indexOf("whose Booking is missing")
    const convertedInventoryGuard = migration.indexOf(
      "unconsumed beta draft with converted inventory",
    )
    const supplierGuard = migration.indexOf("ambiguous external effect")
    const firstMutation = migration.indexOf(
      'CREATE TEMP TABLE "booking_v1_legacy_holds_to_release"',
    )

    expect(commitmentGuard).toBeGreaterThan(-1)
    expect(convertedInventoryGuard).toBeGreaterThan(commitmentGuard)
    expect(supplierGuard).toBeGreaterThan(convertedInventoryGuard)
    expect(firstMutation).toBeGreaterThan(supplierGuard)
  })

  it("restores owned capacity before releasing holds", () => {
    const restoreCapacity = migration.indexOf('UPDATE "availability_slots" slot')
    const releaseHolds = migration.indexOf('UPDATE "availability_holds" hold')
    const releaseScratchTable = migration.indexOf('DROP TABLE "booking_v1_legacy_holds_to_release"')
    const classifySessions = migration.indexOf('INSERT INTO "booking_sessions"')

    expect(restoreCapacity).toBeGreaterThan(-1)
    expect(releaseHolds).toBeGreaterThan(restoreCapacity)
    expect(releaseScratchTable).toBeGreaterThan(releaseHolds)
    expect(classifySessions).toBeGreaterThan(releaseScratchTable)
    expect(migration).not.toContain("ON COMMIT DROP")
    expect(migration).toContain('hold."converted_at" IS NULL')
  })

  it("preserves only operator-owned active attempts and redacts every tombstone", () => {
    expect(migration).toContain('FROM "member" member WHERE member."user_id" = draft."created_by"')
    expect(migration).toContain('WHEN classification."resumable" THEN draft."draft_payload"')
    expect(migration).toContain('CASE WHEN classification."resumable" THEN NULL ELSE now() END')
    expect(migration).toContain("'requiresFreshQuoteAndHold'")
    expect(migration).toContain("'personalDataPurged'")
  })

  it("writes canonical audit classifications before dropping the beta table", () => {
    const audit = migration.indexOf('INSERT INTO "booking_session_audit_events"')
    const drop = migration.indexOf('DROP TABLE "booking_drafts"')

    expect(audit).toBeGreaterThan(-1)
    expect(drop).toBeGreaterThan(audit)
    for (const classification of [
      "genuine_commitment",
      "resumable_staff_attempt",
      "abandoned_attempt",
      "unresumable_beta_attempt",
    ]) {
      expect(migration).toContain(classification)
    }
  })
})
