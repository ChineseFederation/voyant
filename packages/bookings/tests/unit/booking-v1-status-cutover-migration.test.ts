import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  new URL("../../migrations/20260802200000_booking_v1_status_cutover.sql", import.meta.url),
  "utf8",
)

describe("Booking v1 status cutover migration", () => {
  it("classifies commitments and fails closed on ambiguous external effects first", () => {
    const classification = migration.indexOf(
      'CREATE TEMP TABLE "booking_v1_legacy_booking_classification"',
    )
    const supplierGuard = migration.indexOf("ambiguous supplier effect")
    const paymentGuard = migration.indexOf("unresolved external payment effect")
    const firstPreservedMutation = migration.indexOf('INSERT INTO "booking_activity_log"')

    expect(classification).toBeGreaterThan(-1)
    expect(supplierGuard).toBeGreaterThan(classification)
    expect(paymentGuard).toBeGreaterThan(supplierGuard)
    expect(firstPreservedMutation).toBeGreaterThan(paymentGuard)
    expect(migration).toContain("genuine_commitment")
    expect(migration).toContain("abandoned_attempt")
  })

  it("restores capacity atomically before deleting abandoned attempts", () => {
    const capture = migration.indexOf(
      'CREATE TEMP TABLE "booking_v1_legacy_allocations_to_release"',
    )
    const overRestoreGuard = migration.indexOf("would over-restore availability slot")
    const restore = migration.indexOf('UPDATE "availability_slots" slot')
    const removeAttempts = migration.indexOf('DELETE FROM "bookings" booking')

    expect(capture).toBeGreaterThan(-1)
    expect(overRestoreGuard).toBeGreaterThan(capture)
    expect(restore).toBeGreaterThan(overRestoreGuard)
    expect(removeAttempts).toBeGreaterThan(restore)
    expect(migration).not.toContain("ON COMMIT DROP")
    expect(migration).toContain(`WHEN slot."status" = 'sold_out' THEN 'open'`)
  })

  it("stops only on payment effects, not on opening a checkout", () => {
    for (const startedButUncharged of [
      'OR payment_session."provider_session_id" IS NOT NULL',
      'OR payment_session."provider_payment_id" IS NOT NULL',
    ]) {
      expect(migration).not.toContain(startedButUncharged)
    }
    for (const effect of [
      'payment_session."payment_authorization_id" IS NOT NULL',
      'OR payment_session."payment_capture_id" IS NOT NULL',
      'OR payment_session."payment_id" IS NOT NULL',
    ]) {
      expect(migration).toContain(effect)
    }
  })

  it("preserves real finance and legal records", () => {
    for (const evidence of [
      "invoice_record",
      "settled_payment_session",
      "active_financial_guarantee",
      "legal_contract_record",
      "legal_acceptance_record",
      "booking_owned_commitment_evidence",
    ]) {
      expect(migration).toContain(evidence)
    }
  })

  it("contracts Booking and Booking Item lifecycle state with no defaults", () => {
    expect(migration).toContain(
      "CREATE TYPE \"booking_status\" AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled')",
    )
    expect(migration).toContain(
      "CREATE TYPE \"booking_item_status\" AS ENUM ('confirmed', 'cancelled', 'fulfilled')",
    )
    expect(migration).toContain('ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT')
    expect(migration).toContain('ALTER TABLE "booking_items" ALTER COLUMN "status" DROP DEFAULT')
    expect(migration).toContain('DROP TABLE IF EXISTS "booking_session_states"')
    for (const column of ["hold_expires_at", "expired_at", "awaiting_payment_at", "paid_at"]) {
      expect(migration).toContain(`DROP COLUMN "${column}"`)
    }
  })
})
