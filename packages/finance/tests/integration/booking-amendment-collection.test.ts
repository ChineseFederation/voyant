/**
 * Applying an Amendment that owes money has to leave something an operator
 * can act on. The adjustment ledger row on its own is inert — nothing reads
 * it — so `recordBookingAmendment` also raises the payment schedule that
 * `CollectPaymentDialog` offers as a pre-fill.
 *
 * These run against the real table rather than a fake `db`, because the
 * thing being protected is the row that gets written and the partial unique
 * index that stops a replay writing it twice.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createBookingAmendmentFinanceRuntime } from "../../src/booking-amendment-runtime.js"
import { bookingPaymentSchedules, financeAmendmentAdjustments } from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("Booking Amendment collection", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>
  let sequence = 0

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  const runtime = createBookingAmendmentFinanceRuntime()
  const now = new Date("2026-08-15T09:00:00.000Z")

  function price(amountCents: number) {
    return {
      currency: "EUR",
      subtotalDeltaCents: amountCents,
      feeDeltaCents: 0,
      taxDeltaCents: 0,
      amountCents,
      collectionAmountCents: Math.max(amountCents, 0),
      refundAmountCents: Math.max(-amountCents, 0),
      taxLines: [],
    }
  }

  const consequences = {
    collection: "required",
    refund: "not_required",
    invoice: "reissue_required",
    creditNote: "not_required",
    paymentSchedule: "recalculate_required",
  } as const

  function record(amountCents: number, overrides: { amendmentId?: string; key?: string } = {}) {
    sequence += 1
    const amendmentId = overrides.amendmentId ?? `bkam_test_${sequence}`
    return runtime.recordBookingAmendment(db, {
      amendmentId,
      // Derived from the amendment, not the call counter: a replay is the
      // same apply of the same amendment, so both sides must agree on the
      // booking or the runtime reads it as a different request entirely.
      bookingId: `bkng_for_${amendmentId}`,
      idempotencyKey: overrides.key ?? `apply-${sequence}`,
      price: price(amountCents),
      consequences:
        amountCents > 0
          ? consequences
          : { ...consequences, collection: "not_required", invoice: "not_required" },
      reason: "Added a traveller",
      now,
    })
  }

  async function schedulesFor(amendmentId: string) {
    return db
      .select()
      .from(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.amendmentId, amendmentId))
  }

  it("raises a due obligation for the amount to collect", async () => {
    const result = await record(12_800, { amendmentId: "bkam_collect" })
    expect(result.status).toBe("recorded")

    const schedules = await schedulesFor("bkam_collect")
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toMatchObject({
      amountCents: 12_800,
      currency: "EUR",
      status: "due",
      scheduleType: "other",
      // Dated from the clock the Amendment was applied on, not the
      // runtime's own `new Date()`.
      dueDate: "2026-08-15",
      notes: "Added a traveller",
    })
  })

  it("still writes the adjustment ledger row", async () => {
    await record(5_000, { amendmentId: "bkam_ledger" })
    const [adjustment] = await db
      .select()
      .from(financeAmendmentAdjustments)
      .where(eq(financeAmendmentAdjustments.amendmentId, "bkam_ledger"))
    expect(adjustment).toMatchObject({
      status: "collection_required",
      collectionAmountCents: 5_000,
    })
  })

  it("raises nothing when the change costs nothing", async () => {
    await record(0, { amendmentId: "bkam_free" })
    expect(await schedulesFor("bkam_free")).toHaveLength(0)
  })

  it("raises nothing when the change is a refund", async () => {
    await record(-4_000, { amendmentId: "bkam_refund" })
    expect(await schedulesFor("bkam_refund")).toHaveLength(0)
  })

  it("does not bill the customer twice when the apply replays", async () => {
    const first = await record(9_900, { amendmentId: "bkam_replay", key: "same-apply" })
    const second = await record(9_900, { amendmentId: "bkam_replay", key: "same-apply" })

    expect(first.status).toBe("recorded")
    expect(second.status).toBe("replay")
    expect(await schedulesFor("bkam_replay")).toHaveLength(1)
  })
})
