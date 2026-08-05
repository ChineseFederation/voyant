/**
 * Card disputes end to end (voyant#4289).
 *
 * One test per acceptance criterion on the issue: a dispute is recordable
 * including a partial one; a disputed booking is distinguishable from a cleanly
 * paid one; a verified adapter callback advances the lifecycle; a second
 * dispute against the same payment does not overwrite the first.
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { applyPaymentAdapterCallbackEvent } from "../../src/payment-adapter-events.js"
import { invoices, paymentDisputes, paymentSessions } from "../../src/schema.js"
import { financeService } from "../../src/service.js"
import { financePaymentDisputeService } from "../../src/service-payment-disputes.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let seq = 0
function next(prefix: string) {
  seq += 1
  return `${prefix}-${String(seq).padStart(5, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("payment disputes", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

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

  it("records a partial dispute against a paid payment", async () => {
    const { session } = await seedPaidSession(db, 20000)

    const dispute = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_partial",
      status: "opened",
      amountCents: 7500,
      openedAt: "2026-08-01T09:00:00.000Z",
      respondBy: "2026-08-14T23:59:59.000Z",
      reasonCode: "product_not_received",
    })

    expect(dispute).toMatchObject({
      paymentSessionId: session.id,
      status: "opened",
      amountCents: 7500,
      currency: "EUR",
      processorReference: "dp_partial",
      reasonCode: "product_not_received",
      resolvedAt: null,
    })
    // The payment itself is untouched — the money was taken, the session
    // still says so, and that is exactly why the dispute has to exist.
    await expect(refreshedSession(session.id)).resolves.toMatchObject({ status: "paid" })
  })

  it("refuses to contest more than the payment is worth", async () => {
    const { session } = await seedPaidSession(db, 10000)

    await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_first_half",
      status: "opened",
      amountCents: 6000,
    })

    await expect(
      financePaymentDisputeService.recordPaymentDispute(db, {
        paymentSessionId: session.id,
        processorReference: "dp_too_much",
        status: "opened",
        amountCents: 5000,
      }),
    ).rejects.toMatchObject({ code: "payment_dispute_amount_exceeds_payment" })
  })

  it("returns null when the contested payment does not exist", async () => {
    await expect(
      financePaymentDisputeService.recordPaymentDispute(db, {
        paymentSessionId: "pmss_missing",
        status: "opened",
        amountCents: 100,
      }),
    ).resolves.toBeNull()
  })

  it("distinguishes a disputed booking from a cleanly paid one", async () => {
    const disputed = await seedPaidSession(db, 15000)
    const clean = await seedPaidSession(db, 15000)

    await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: disputed.session.id,
      processorReference: "dp_booking",
      status: "opened",
      amountCents: 15000,
      respondBy: "2026-08-20T00:00:00.000Z",
    })

    await expect(
      financePaymentDisputeService.getBookingPaymentDisputes(db, disputed.bookingId),
    ).resolves.toMatchObject({
      hasOpenDispute: true,
      openContestedAmountsByCurrency: { EUR: 15000 },
      nextRespondBy: "2026-08-20T00:00:00.000Z",
    })

    await expect(
      financePaymentDisputeService.getBookingPaymentDisputes(db, clean.bookingId),
    ).resolves.toMatchObject({
      hasOpenDispute: false,
      openContestedAmountsByCurrency: {},
      nextRespondBy: null,
      disputes: [],
    })
  })

  it("stops counting a resolved dispute as contested", async () => {
    const { session, bookingId } = await seedPaidSession(db, 9000)
    const opened = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_resolves",
      status: "opened",
      amountCents: 9000,
    })
    if (!opened) throw new Error("Dispute seed failed.")

    const won = await financePaymentDisputeService.updatePaymentDispute(db, opened.id, {
      status: "won",
      resolutionNote: "Evidence accepted",
    })

    expect(won?.status).toBe("won")
    expect(won?.resolvedAt).toBeInstanceOf(Date)
    await expect(
      financePaymentDisputeService.getBookingPaymentDisputes(db, bookingId),
    ).resolves.toMatchObject({ hasOpenDispute: false, openContestedAmountsByCurrency: {} })
  })

  it("refuses to move a resolved dispute", async () => {
    const { session } = await seedPaidSession(db, 5000)
    const opened = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_terminal",
      status: "lost",
      amountCents: 5000,
    })
    if (!opened) throw new Error("Dispute seed failed.")

    await expect(
      financePaymentDisputeService.updatePaymentDispute(db, opened.id, { status: "won" }),
    ).rejects.toMatchObject({ code: "payment_dispute_invalid_transition" })
  })

  it("advances the lifecycle from a verified adapter callback", async () => {
    const { session } = await seedPaidSession(db, 12000)

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_dispute_opened",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-02T10:00:00.000Z",
      idempotencyKey: "cb-dispute-1",
      dispute: {
        processorDisputeId: "dp_callback",
        status: "opened",
        money: { amountMinor: 12000, currency: "EUR" },
        openedAt: "2026-08-02T10:00:00.000Z",
        respondBy: "2026-08-16T10:00:00.000Z",
        reasonCode: "fraudulent",
      },
    })

    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_dispute_lost",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-09T10:00:00.000Z",
      idempotencyKey: "cb-dispute-2",
      dispute: {
        processorDisputeId: "dp_callback",
        status: "lost",
        money: { amountMinor: 12000, currency: "EUR" },
        openedAt: "2026-08-02T10:00:00.000Z",
        resolvedAt: "2026-08-09T10:00:00.000Z",
        evidenceSubmittedAt: "2026-08-05T08:00:00.000Z",
      },
    })

    const rows = await db
      .select()
      .from(paymentDisputes)
      .where(eq(paymentDisputes.paymentSessionId, session.id))

    // Advanced in place, not opened twice.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      status: "lost",
      amountCents: 12000,
      processorReference: "dp_callback",
      reasonCode: "fraudulent",
    })
    expect(rows[0]?.resolvedAt?.toISOString()).toBe("2026-08-09T10:00:00.000Z")
    expect(rows[0]?.evidenceSubmittedAt?.toISOString()).toBe("2026-08-05T08:00:00.000Z")
  })

  it("ignores a callback that would walk a resolved dispute backwards", async () => {
    const { session } = await seedPaidSession(db, 4000)
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_won",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-03T10:00:00.000Z",
      idempotencyKey: "cb-won",
      dispute: {
        processorDisputeId: "dp_replay",
        status: "won",
        money: { amountMinor: 4000, currency: "EUR" },
        openedAt: "2026-08-01T10:00:00.000Z",
      },
    })

    // The processor re-delivers the earlier "opened" event. It must not undo
    // the resolution, and it must not throw — a webhook that 500s is retried.
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_opened_replay",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-01T10:00:00.000Z",
      idempotencyKey: "cb-opened-replay",
      dispute: {
        processorDisputeId: "dp_replay",
        status: "opened",
        money: { amountMinor: 4000, currency: "EUR" },
        openedAt: "2026-08-01T10:00:00.000Z",
      },
    })

    const rows = await db
      .select()
      .from(paymentDisputes)
      .where(eq(paymentDisputes.paymentSessionId, session.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe("won")
  })

  it("does not let a second dispute overwrite the first", async () => {
    const { session, bookingId } = await seedPaidSession(db, 10000)

    const first = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_one",
      status: "opened",
      amountCents: 4000,
    })
    const second = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_two",
      status: "opened",
      amountCents: 6000,
    })

    expect(first?.id).not.toBe(second?.id)

    const summary = await financePaymentDisputeService.getBookingPaymentDisputes(db, bookingId)
    expect(summary.disputes).toHaveLength(2)
    expect(summary.openContestedAmountsByCurrency).toEqual({ EUR: 10000 })
  })

  it("opens a separate record for a hand-entered dispute with no processor reference", async () => {
    const { session } = await seedPaidSession(db, 8000)

    await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      status: "opened",
      amountCents: 2000,
      notes: "Seen in the processor console",
    })
    await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      status: "opened",
      amountCents: 3000,
      notes: "A second one, also by hand",
    })

    const rows = await db
      .select()
      .from(paymentDisputes)
      .where(eq(paymentDisputes.paymentSessionId, session.id))
    expect(rows).toHaveLength(2)
  })

  it("filters the list by whether the dispute is still open", async () => {
    const { session } = await seedPaidSession(db, 10000)
    const open = await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_open",
      status: "opened",
      amountCents: 3000,
    })
    await financePaymentDisputeService.recordPaymentDispute(db, {
      paymentSessionId: session.id,
      processorReference: "dp_closed",
      status: "withdrawn",
      amountCents: 7000,
    })

    const openOnly = await financePaymentDisputeService.listPaymentDisputes(db, {
      open: true,
      limit: 50,
      offset: 0,
    })
    expect(openOnly.data).toHaveLength(1)
    expect(openOnly.data[0]?.id).toBe(open?.id)

    const resolvedOnly = await financePaymentDisputeService.listPaymentDisputes(db, {
      open: false,
      limit: 50,
      offset: 0,
    })
    expect(resolvedOnly.data).toHaveLength(1)
    expect(resolvedOnly.data[0]?.processorReference).toBe("dp_closed")
  })

  async function seedPaidSession(db: PostgresJsDatabase, amountCents: number) {
    const bookingId = next("book")
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: next("INV"),
        bookingId,
        invoiceType: "invoice",
        status: "paid",
        currency: "EUR",
        issueDate: "2026-07-17",
        dueDate: "2026-07-24",
        subtotalCents: amountCents,
        taxCents: 0,
        totalCents: amountCents,
        paidCents: amountCents,
        balanceDueCents: 0,
      })
      .returning()
    if (!invoice) throw new Error("Invoice seed failed.")

    const session = await financeService.createPaymentSession(db, {
      invoiceId: invoice.id,
      bookingId,
      amountCents,
      currency: "EUR",
      status: "paid",
      paymentMethod: "credit_card",
      targetType: "invoice",
      targetId: invoice.id,
    })
    if (!session) throw new Error("Payment session seed failed.")
    return { invoice, session, bookingId }
  }

  async function refreshedSession(id: string) {
    const [row] = await db.select().from(paymentSessions).where(eq(paymentSessions.id, id)).limit(1)
    return row
  }
})
