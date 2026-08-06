/**
 * The money leg of a refund, end to end (voyant#4303).
 *
 * One test per acceptance criterion on the issue: a refund is recordable with a
 * method that is not a card; a refund can be owed and settled later without the
 * booking claiming it is already paid back; repeated partial refunds against one
 * payment are representable; an adapter-backed refund records its outcome,
 * including a failure after acceptance.
 *
 * The adapter tests drive `executeAdapterRefundSettlement` against a stub
 * adapter rather than setting the settlement's status by hand — the outcome
 * mapping is the thing under test, and asserting against a value the test wrote
 * itself would prove nothing about the path production takes.
 */

import type { PaymentAdapter, PaymentOperationResult } from "@voyant-travel/payments"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { executeAdapterRefundSettlement } from "../../src/refund-settlement-execution.js"
import { creditNotes, invoices, payments, refundSettlements } from "../../src/schema.js"
import { financeService } from "../../src/service.js"
import { financeRefundSettlementService } from "../../src/service-refund-settlements.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let seq = 0
function next(prefix: string) {
  seq += 1
  return `${prefix}-${String(seq).padStart(5, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("refund settlements", () => {
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

  it("records a bank-transfer refund against a credit note and its payment", async () => {
    const seed = await seedPaidInvoice(db, 20000)
    const creditNote = await seedCreditNote(db, seed.invoice.id, 20000)

    const settlement = await financeRefundSettlementService.recordRefundSettlement(db, {
      creditNoteId: creditNote.id,
      paymentId: seed.payment.id,
      method: "bank_transfer",
      status: "pending",
      amountCents: 20000,
      externalReference: "SEPA-2026-08-06-771",
    })

    expect(settlement).toMatchObject({
      method: "bank_transfer",
      status: "pending",
      amountCents: 20000,
      currency: "EUR",
      externalReference: "SEPA-2026-08-06-771",
      settledAt: null,
      failedAt: null,
    })
    // Denormalized from what it reverses so a booking can be asked directly.
    expect(settlement?.bookingId).toBe(seed.bookingId)
  })

  it("records a refund by cash, voucher and counterparty offset, with no processor anywhere", async () => {
    const cash = await seedPaidInvoice(db, 5000)
    const voucher = await seedPaidInvoice(db, 8000)
    const offset = await seedPaidInvoice(db, 12000)

    const cashRefund = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: cash.payment.id,
      method: "cash",
      status: "settled",
      amountCents: 5000,
      notes: "Handed over at the counter",
    })
    expect(cashRefund).toMatchObject({ method: "cash", status: "settled" })
    expect(cashRefund?.settledAt).toBeInstanceOf(Date)

    // A voucher worth more than the cash it replaces — 110% in credit rather
    // than 100% in money. The credit note still says 8000 and the instrument
    // says 8800; both numbers are on the record and neither is inferred.
    const voucherRefund = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: voucher.payment.id,
      method: "voucher",
      status: "settled",
      amountCents: 8000,
      instrumentAmountCents: 8800,
      instrumentCurrency: "EUR",
    })
    expect(voucherRefund).toMatchObject({
      method: "voucher",
      amountCents: 8000,
      instrumentAmountCents: 8800,
      instrumentCurrency: "EUR",
    })

    // A trade account is credited, not paid. The balance belongs to the
    // counterparty, not to any one booking.
    const offsetRefund = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: offset.payment.id,
      method: "counterparty_offset",
      status: "settled",
      amountCents: 12000,
      counterpartyOrganizationId: "org_reseller_1",
    })
    expect(offsetRefund).toMatchObject({
      method: "counterparty_offset",
      counterpartyOrganizationId: "org_reseller_1",
    })
  })

  it("lets a refund be owed, then settled later, without claiming it is already paid", async () => {
    const seed = await seedPaidInvoice(db, 15000)

    const owed = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "bank_transfer",
      status: "pending",
      amountCents: 15000,
    })
    if (!owed) throw new Error("Settlement seed failed.")

    await expect(
      financeRefundSettlementService.getBookingRefundSettlements(db, seed.bookingId),
    ).resolves.toMatchObject({
      hasOwedRefund: true,
      owedAmountsByCurrency: { EUR: 15000 },
      settledAmountsByCurrency: {},
    })

    const settled = await financeRefundSettlementService.updateRefundSettlement(db, owed.id, {
      status: "settled",
      externalReference: "SEPA-LANDED",
    })
    expect(settled?.status).toBe("settled")
    expect(settled?.settledAt).toBeInstanceOf(Date)

    await expect(
      financeRefundSettlementService.getBookingRefundSettlements(db, seed.bookingId),
    ).resolves.toMatchObject({
      hasOwedRefund: false,
      owedAmountsByCurrency: {},
      settledAmountsByCurrency: { EUR: 15000 },
    })
  })

  it("represents repeated partial refunds against one payment", async () => {
    const seed = await seedPaidInvoice(db, 10000)

    const first = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "cash",
      status: "settled",
      amountCents: 3000,
    })
    const second = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "bank_transfer",
      status: "settled",
      amountCents: 2500,
    })

    expect(first?.id).not.toBe(second?.id)
    await expect(
      financeRefundSettlementService.getPaymentRefundableRemainder(db, seed.payment.id),
    ).resolves.toMatchObject({
      paidAmountCents: 10000,
      settledCents: 5500,
      pendingCents: 0,
      refundableRemainderCents: 4500,
    })
  })

  it("refuses to refund more than the payment is worth", async () => {
    const seed = await seedPaidInvoice(db, 10000)
    await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "cash",
      status: "settled",
      amountCents: 6000,
    })

    await expect(
      financeRefundSettlementService.recordRefundSettlement(db, {
        paymentId: seed.payment.id,
        method: "cash",
        status: "settled",
        amountCents: 5000,
      }),
    ).rejects.toMatchObject({ code: "refund_settlement_exceeds_refundable" })
  })

  it("keeps a pending refund's amount held rather than freeing it for a retry", async () => {
    const seed = await seedPaidInvoice(db, 10000)
    await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "processor_reversal",
      paymentSessionId: (await seedSession(db, seed, 10000)).id,
      status: "pending",
      amountCents: 10000,
    })

    // This is the invariant the record exists for: the first refund may already
    // have gone through, so its amount is not available to refund again.
    await expect(
      financeRefundSettlementService.getPaymentRefundableRemainder(db, seed.payment.id),
    ).resolves.toMatchObject({ pendingCents: 10000, refundableRemainderCents: 0 })

    await expect(
      financeRefundSettlementService.recordRefundSettlement(db, {
        paymentId: seed.payment.id,
        method: "bank_transfer",
        status: "pending",
        amountCents: 10000,
      }),
    ).rejects.toMatchObject({ code: "refund_settlement_exceeds_refundable" })
  })

  it("gives the amount back only once the refund is positively known to have failed", async () => {
    const seed = await seedPaidInvoice(db, 10000)
    const attempt = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "bank_transfer",
      status: "pending",
      amountCents: 10000,
    })
    if (!attempt) throw new Error("Settlement seed failed.")

    await financeRefundSettlementService.updateRefundSettlement(db, attempt.id, {
      status: "failed",
      failureReason: "Beneficiary IBAN rejected",
    })

    await expect(
      financeRefundSettlementService.getPaymentRefundableRemainder(db, seed.payment.id),
    ).resolves.toMatchObject({
      settledCents: 0,
      pendingCents: 0,
      failedCents: 10000,
      refundableRemainderCents: 10000,
    })

    // A failed refund is retried by recording a new settlement, never by
    // reviving the one that failed.
    await expect(
      financeRefundSettlementService.updateRefundSettlement(db, attempt.id, { status: "settled" }),
    ).rejects.toMatchObject({ code: "refund_settlement_invalid_transition" })
  })

  it("settles once when the same idempotency key is replayed", async () => {
    const seed = await seedPaidInvoice(db, 9000)
    const input = {
      paymentId: seed.payment.id,
      method: "cash" as const,
      status: "settled" as const,
      amountCents: 9000,
      idempotencyKey: "refund-once",
    }

    const first = await financeRefundSettlementService.recordRefundSettlement(db, input)
    const replay = await financeRefundSettlementService.recordRefundSettlement(db, input)

    expect(replay?.id).toBe(first?.id)
    const rows = await db
      .select()
      .from(refundSettlements)
      .where(eq(refundSettlements.paymentId, seed.payment.id))
    expect(rows).toHaveLength(1)
  })

  it("settles an adapter-backed refund the processor accepted", async () => {
    const { settlement } = await seedProcessorRefund(db, 7000)

    const result = await executeAdapterRefundSettlement(
      stubAdapter({ status: "accepted", processorReference: "re_ok" }),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    expect(result.outcome).toBe("settled")
    expect(result.settlement).toMatchObject({
      status: "settled",
      processorReference: "re_ok",
    })
    expect(result.settlement?.settledAt).toBeInstanceOf(Date)
  })

  it("records an adapter refund that failed after the processor accepted the call", async () => {
    const { settlement, payment } = await seedProcessorRefund(db, 7000)

    const result = await executeAdapterRefundSettlement(
      stubAdapter({ status: "declined", processorReference: "re_declined" }),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    expect(result.outcome).toBe("failed")
    expect(result.settlement).toMatchObject({
      status: "failed",
      processorReference: "re_declined",
    })
    expect(result.settlement?.failureReason).toContain("declined")
    // A failure is the one outcome that frees the amount again.
    await expect(
      financeRefundSettlementService.getPaymentRefundableRemainder(db, payment.id),
    ).resolves.toMatchObject({ refundableRemainderCents: 7000 })
  })

  it("leaves an indeterminate adapter refund live and its amount held", async () => {
    const { settlement, payment } = await seedProcessorRefund(db, 7000)

    const result = await executeAdapterRefundSettlement(
      throwingAdapter(new Error("socket hang up")),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    // The processor may well have accepted it. Retiring the row would free the
    // amount and invite a retry that refunds the customer twice.
    expect(result.outcome).toBe("indeterminate")
    expect(result.settlement?.status).toBe("pending")
    expect(result.settlement?.failureReason).toContain("socket hang up")
    await expect(
      financeRefundSettlementService.getPaymentRefundableRemainder(db, payment.id),
    ).resolves.toMatchObject({ pendingCents: 7000, refundableRemainderCents: 0 })
  })

  it("leaves a refund the processor is still deciding as owed", async () => {
    const { settlement } = await seedProcessorRefund(db, 7000)

    const result = await executeAdapterRefundSettlement(
      stubAdapter({ status: "pending", processorReference: "re_pending" }),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    expect(result.outcome).toBe("pending")
    expect(result.settlement).toMatchObject({ status: "pending", processorReference: "re_pending" })
  })

  it("does not re-drive a settlement that already reached a terminal status", async () => {
    const { settlement } = await seedProcessorRefund(db, 7000)
    await financeRefundSettlementService.updateRefundSettlement(db, settlement.id, {
      status: "settled",
    })

    const result = await executeAdapterRefundSettlement(
      stubAdapter({ status: "accepted" }),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    expect(result.outcome).toBe("not_applicable")
    expect(result.reason).toBe("settlement_not_pending")
  })

  it("does not reach for an adapter when the method is not a processor reversal", async () => {
    const seed = await seedPaidInvoice(db, 4000)
    const settlement = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "cash",
      status: "pending",
      amountCents: 4000,
    })
    if (!settlement) throw new Error("Settlement seed failed.")

    const result = await executeAdapterRefundSettlement(
      throwingAdapter(new Error("the adapter must not be called")),
      db,
      settlement.id,
      { context: { env: {} } },
    )

    expect(result.outcome).toBe("not_applicable")
    expect(result.reason).toBe("method_not_adapter_backed")
  })

  it("filters the list by whether the refund is still owed", async () => {
    const seed = await seedPaidInvoice(db, 10000)
    const owed = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "bank_transfer",
      status: "pending",
      amountCents: 3000,
    })
    await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      method: "cash",
      status: "settled",
      amountCents: 4000,
    })

    const owedOnly = await financeRefundSettlementService.listRefundSettlements(db, {
      owed: true,
      limit: 50,
      offset: 0,
    })
    expect(owedOnly.data).toHaveLength(1)
    expect(owedOnly.data[0]?.id).toBe(owed?.id)

    const doneOnly = await financeRefundSettlementService.listRefundSettlements(db, {
      owed: false,
      limit: 50,
      offset: 0,
    })
    expect(doneOnly.data).toHaveLength(1)
    expect(doneOnly.data[0]?.method).toBe("cash")
  })

  it("returns null when what the refund claims to reverse does not exist", async () => {
    await expect(
      financeRefundSettlementService.recordRefundSettlement(db, {
        paymentId: "pay_missing",
        method: "cash",
        status: "settled",
        amountCents: 100,
      }),
    ).resolves.toBeNull()
  })

  function stubAdapter(result: PaymentOperationResult): PaymentAdapter {
    return {
      id: "stub",
      label: "Stub",
      contractVersion: "payments.adapter/v1",
      mode: "self-hosted",
      capabilities: {
        hostedCheckout: false,
        redirectCheckout: true,
        authorize: false,
        capture: false,
        void: false,
        refund: true,
        status: false,
        callbackSignatureVerification: true,
        idempotencyKeys: true,
        retrySafeInitiation: true,
      },
      initiate: async () => {
        throw new Error("not used")
      },
      verifyCallback: async () => ({ verified: false, reason: "malformed" }),
      health: async () => ({ healthy: true }),
      refund: async () => result,
    } as unknown as PaymentAdapter
  }

  function throwingAdapter(error: Error): PaymentAdapter {
    const adapter = stubAdapter({ status: "accepted" })
    return {
      ...adapter,
      refund: async () => {
        throw error
      },
    } as unknown as PaymentAdapter
  }

  async function seedProcessorRefund(db: PostgresJsDatabase, amountCents: number) {
    const seed = await seedPaidInvoice(db, amountCents)
    const session = await seedSession(db, seed, amountCents)
    const settlement = await financeRefundSettlementService.recordRefundSettlement(db, {
      paymentId: seed.payment.id,
      paymentSessionId: session.id,
      method: "processor_reversal",
      status: "pending",
      amountCents,
    })
    if (!settlement) throw new Error("Settlement seed failed.")
    return { ...seed, session, settlement }
  }

  async function seedSession(
    db: PostgresJsDatabase,
    seed: Awaited<ReturnType<typeof seedPaidInvoice>>,
    amountCents: number,
  ) {
    const session = await financeService.createPaymentSession(db, {
      invoiceId: seed.invoice.id,
      bookingId: seed.bookingId,
      amountCents,
      currency: "EUR",
      status: "paid",
      paymentMethod: "credit_card",
      targetType: "invoice",
      targetId: seed.invoice.id,
      provider: "stub",
      providerConnectionId: "conn_1",
      providerPaymentId: "pi_1",
    })
    if (!session) throw new Error("Payment session seed failed.")
    return session
  }

  async function seedCreditNote(db: PostgresJsDatabase, invoiceId: string, amountCents: number) {
    const [row] = await db
      .insert(creditNotes)
      .values({
        creditNoteNumber: next("CN"),
        invoiceId,
        status: "issued",
        amountCents,
        currency: "EUR",
        reason: "Cancellation",
      })
      .returning()
    if (!row) throw new Error("Credit note seed failed.")
    return row
  }

  async function seedPaidInvoice(db: PostgresJsDatabase, amountCents: number) {
    const bookingId = next("book")
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: next("INV"),
        bookingId,
        invoiceType: "invoice",
        status: "paid",
        currency: "EUR",
        issueDate: "2026-08-01",
        dueDate: "2026-08-08",
        subtotalCents: amountCents,
        taxCents: 0,
        totalCents: amountCents,
        paidCents: amountCents,
        balanceDueCents: 0,
      })
      .returning()
    if (!invoice) throw new Error("Invoice seed failed.")

    const [payment] = await db
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        amountCents,
        currency: "EUR",
        paymentMethod: "credit_card",
        status: "completed",
        paymentDate: "2026-08-01",
      })
      .returning()
    if (!payment) throw new Error("Payment seed failed.")

    return { invoice, payment, bookingId }
  }
})
