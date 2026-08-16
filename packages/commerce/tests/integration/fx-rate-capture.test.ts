/**
 * The FX capture path, end to end across the package boundary (voyant#4703).
 *
 * Markets owns `fx_rate_sets`/`exchange_rates`; finance stamps documents from
 * them through the `finance.fx-rate-capture.runtime` seam. Asserting either
 * half against a hand-built fixture proves nothing about the other, so this
 * drives the real provider against the real consumer over real Postgres.
 */

import { newId } from "@voyant-travel/db/lib/typeid"
import {
  financeService,
  resolveDocumentFxRate,
  resolveReportingStamp,
  stampInvoiceFx,
} from "@voyant-travel/finance"
import { invoices, payments } from "@voyant-travel/finance/schema"
import { and, eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { commerceFxRateCaptureRuntime } from "../../src/markets/fx-capture-runtime.js"
import { exchangeRates } from "../../src/markets/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

// `cleanupTestDb` truncates the whole operator schema, which outruns the 10s
// default hook timeout on a cold database.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

/**
 * The operator in voyant#4703: reports in lei, and adds a 2% currency-risk
 * commission to the national bank's rate before it reaches a document.
 */
const SETTINGS = { baseCurrency: "RON", fxCommissionBps: 200 }

/** BNR's EUR/RON quotes on two consecutive days. */
const RATE_AUG_15 = 5.2472
const RATE_AUG_16 = 5.2325

describe.skipIf(!DB_AVAILABLE)("FX rate capture", () => {
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

  const captureFxRates = commerceFxRateCaptureRuntime.captureFxRates

  // Rates are keyed by (base, quote), so giving each test its own foreign
  // currency isolates them without truncating the whole schema between every
  // one. Truncation is what made this suite slow and flaky under load, and
  // eight of them bought nothing the currencies do not.

  /** A source that only answers for the days it was told about. */
  function referenceSource(rates: Readonly<Record<string, number>>) {
    return vi.fn(async ({ date }: { date?: string }) => {
      const rate = date ? rates[date] : undefined
      return rate === undefined ? null : { rate, source: "bnr" }
    })
  }

  it("records the published rate and the rate documents convert at, side by side", async () => {
    await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "EUR", rate: RATE_AUG_15 }],
    })

    const [row] = await db
      .select()
      .from(exchangeRates)
      .where(and(eq(exchangeRates.baseCurrency, "EUR"), eq(exchangeRates.quoteCurrency, "RON")))

    // Both halves of the arithmetic an inspector asks for: 5.2472 × 1.02 =
    // 5.35214400, which is the rate that reaches the invoice.
    expect(row?.rateDecimal).toBe("5.24720000")
    expect(row?.effectiveRateDecimal).toBe("5.35214400")
    expect(row?.commissionBps).toBe(200)
  })

  it("never rewrites a rate a document may already point at", async () => {
    const first = await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "USD", rate: RATE_AUG_15 }],
    })

    const second = await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 500,
      quotes: [{ currency: "USD", rate: 9.9999 }],
    })

    expect(second?.fxRateSetId).toBe(first?.fxRateSetId)
    expect(second?.rates[0]).toMatchObject({ rate: RATE_AUG_15, commissionBps: 200 })

    const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.baseCurrency, "USD"))
    expect(rows).toHaveLength(1)
  })

  it("captures the rate of the document's own day rather than reusing an older one", async () => {
    const resolveInvoiceExchangeRate = referenceSource({
      "2026-08-15": RATE_AUG_15,
      "2026-08-16": RATE_AUG_16,
    })
    const options = {
      invoiceFxSettings: SETTINGS,
      resolveInvoiceExchangeRate,
      captureFxRates,
    }

    const first = await resolveDocumentFxRate(
      db,
      { currency: "GBP", baseCurrency: "RON", date: "2026-08-15" },
      options,
    )
    const second = await resolveDocumentFxRate(
      db,
      { currency: "GBP", baseCurrency: "RON", date: "2026-08-16" },
      options,
    )

    expect(first?.origin).toBe("captured")
    expect(first?.sourceRate).toBe(RATE_AUG_15)
    // The second day gets its OWN rate. Falling through to the newest rate on
    // hand is what made a monthly total drift by ~1.8%.
    expect(second?.origin).toBe("captured")
    expect(second?.sourceRate).toBe(RATE_AUG_16)
    expect(second?.fxRateSetId).not.toBe(first?.fxRateSetId)
    expect(resolveInvoiceExchangeRate).toHaveBeenCalledTimes(2)
  })

  it("reuses the day's captured rate instead of asking the source again", async () => {
    const resolveInvoiceExchangeRate = referenceSource({ "2026-08-15": RATE_AUG_15 })
    const options = {
      invoiceFxSettings: SETTINGS,
      resolveInvoiceExchangeRate,
      captureFxRates,
    }

    const captured = await resolveDocumentFxRate(
      db,
      { currency: "CHF", baseCurrency: "RON", date: "2026-08-15" },
      options,
    )
    const reread = await resolveDocumentFxRate(
      db,
      { currency: "CHF", baseCurrency: "RON", date: "2026-08-15" },
      options,
    )

    expect(reread?.origin).toBe("persisted")
    expect(reread?.fxRateSetId).toBe(captured?.fxRateSetId)
    expect(resolveInvoiceExchangeRate).toHaveBeenCalledTimes(1)
  })

  it("holds a stamped document's rate when the operator changes the margin", async () => {
    await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "SEK", rate: RATE_AUG_15 }],
    })

    // The margin doubles after the rate was captured. The captured row records
    // the margin in force at the time, so re-reading it must not restate the
    // document at today's setting — nor apply 2% twice.
    const resolved = await resolveDocumentFxRate(
      db,
      { currency: "SEK", baseCurrency: "RON", date: "2026-08-15" },
      { invoiceFxSettings: { baseCurrency: "RON", fxCommissionBps: 400 } },
    )

    expect(resolved?.effectiveRate).toBeCloseTo(5.352144, 6)
    expect(resolved?.commissionBps).toBe(200)
  })

  it("stamps a payment in lei at the rate of the day it landed", async () => {
    await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "NOK", rate: RATE_AUG_15 }],
    })
    await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-16",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "NOK", rate: RATE_AUG_16 }],
    })

    const stamp = await resolveReportingStamp(
      db,
      { amountCents: 42_000, currency: "NOK", date: "2026-08-16" },
      { invoiceFxSettings: SETTINGS },
    )

    expect(stamp).toEqual({
      reportingCurrency: "RON",
      // 420.00 EUR × (5.2325 × 1.02) = 2241.68 RON
      reportingAmountCents: Math.round(42_000 * 5.2325 * 1.02),
      reportingFxRateSetId: expect.any(String),
    })
  })

  it("records the reporting figure when a payment is recorded", async () => {
    await captureFxRates(db, {
      reportingCurrency: "RON",
      date: "2026-08-15",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "DKK", rate: RATE_AUG_15 }],
    })

    const invoiceId = newId("invoices")
    await db.insert(invoices).values({
      id: invoiceId,
      invoiceNumber: "INV-FX-4703",
      bookingId: newId("bookings"),
      status: "issued",
      currency: "DKK",
      subtotalCents: 42_000,
      totalCents: 42_000,
      balanceDueCents: 42_000,
      issueDate: "2026-08-15",
      dueDate: "2026-08-22",
    })

    const payment = await financeService.createPayment(
      db,
      invoiceId,
      {
        amountCents: 42_000,
        currency: "DKK",
        paymentMethod: "bank_transfer",
        paymentDate: "2026-08-15",
        status: "completed",
      },
      { invoiceFxSettings: SETTINGS },
    )

    expect(payment?.reportingCurrency).toBe("RON")
    expect(payment?.reportingAmountCents).toBe(Math.round(42_000 * RATE_AUG_15 * 1.02))
    expect(payment?.reportingFxRateSetId).toEqual(expect.any(String))

    const [stored] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, payment?.id ?? ""))
    expect(stored?.reportingAmountCents).toBe(Math.round(42_000 * RATE_AUG_15 * 1.02))

    // Re-dating the payment to a day nothing can answer for — earlier than any
    // rate the operator holds — must CLEAR the stamp, not leave the old day's
    // figure describing the new one. A row reporting 2246 lei for a payment it
    // no longer describes is worse than one reporting nothing, because only
    // the second is visibly missing.
    const moved = await financeService.updatePayment(
      db,
      payment?.id ?? "",
      { paymentDate: "2026-07-01" },
      { invoiceFxSettings: SETTINGS },
    )

    expect(moved?.paymentDate).toBe("2026-07-01")
    expect(moved?.reportingCurrency).toBeNull()
    expect(moved?.reportingAmountCents).toBeNull()
    expect(moved?.reportingFxRateSetId).toBeNull()
  })

  it("captures inside a caller's open transaction", async () => {
    // The booking-create saga records already-paid schedules by calling
    // `createPayment` with its own transaction handle. Capture opens a
    // transaction of its own, which has to compose as a savepoint rather than
    // fight the outer one — otherwise stamping a payment would take the whole
    // booking down with it.
    const resolveInvoiceExchangeRate = referenceSource({ "2026-08-15": RATE_AUG_15 })

    const invoiceId = newId("invoices")
    const payment = await db.transaction(async (tx) => {
      await tx.insert(invoices).values({
        id: invoiceId,
        invoiceNumber: "INV-FX-4703-TX",
        bookingId: newId("bookings"),
        status: "issued",
        currency: "HUF",
        subtotalCents: 42_000,
        totalCents: 42_000,
        balanceDueCents: 42_000,
        issueDate: "2026-08-15",
        dueDate: "2026-08-22",
      })

      return financeService.createPayment(
        tx as never,
        invoiceId,
        {
          amountCents: 42_000,
          currency: "HUF",
          paymentMethod: "bank_transfer",
          paymentDate: "2026-08-15",
          status: "completed",
        },
        { invoiceFxSettings: SETTINGS, resolveInvoiceExchangeRate, captureFxRates },
      )
    })

    expect(payment?.reportingAmountCents).toBe(Math.round(42_000 * RATE_AUG_15 * 1.02))
    expect(payment?.reportingFxRateSetId).toEqual(expect.any(String))

    // The rate outlives the caller's transaction, which is the whole point of
    // capturing it rather than resolving it again later.
    const [captured] = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.baseCurrency, "HUF"))
    expect(captured?.effectiveRateDecimal).toBe("5.35214400")
  })

  it("repairs a historical invoice from the rate printed on it", async () => {
    const invoiceId = newId("invoices")
    await db.insert(invoices).values({
      id: invoiceId,
      invoiceNumber: "INV-FX-4703-OLD",
      bookingId: newId("bookings"),
      status: "issued",
      currency: "CZK",
      subtotalCents: 42_000,
      totalCents: 42_000,
      balanceDueCents: 42_000,
      issueDate: "2026-08-15",
      dueDate: "2026-08-22",
    })

    // Nothing was captured for that day, and the operator has the rate off the
    // paperwork rather than a live source.
    const stamped = await stampInvoiceFx(
      db,
      invoiceId,
      { rate: RATE_AUG_15, source: "bnr" },
      { invoiceFxSettings: SETTINGS, captureFxRates },
    )

    expect(stamped).toMatchObject({
      reportingCurrency: "RON",
      rate: RATE_AUG_15,
      commissionBps: 200,
      reportingAmountCents: Math.round(42_000 * RATE_AUG_15 * 1.02),
    })
    expect(stamped?.fxRateSetId).toEqual(expect.any(String))

    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceId))
    expect(row?.baseCurrency).toBe("RON")
    expect(row?.baseTotalCents).toBe(Math.round(42_000 * RATE_AUG_15 * 1.02))
    expect(row?.fxRateSetId).toBe(stamped?.fxRateSetId)
    // Repairing one document captures the day, so an invoice issued later that
    // same day lands on the same number rather than a second opinion.
    const sameDay = await resolveDocumentFxRate(
      db,
      { currency: "CZK", baseCurrency: "RON", date: "2026-08-15" },
      { invoiceFxSettings: SETTINGS },
    )
    expect(sameDay?.fxRateSetId).toBe(stamped?.fxRateSetId)

    // A stamp is meant to hold: replacing one restates a figure someone may
    // already have reported.
    await expect(
      stampInvoiceFx(db, invoiceId, { rate: 9.9 }, { invoiceFxSettings: SETTINGS, captureFxRates }),
    ).rejects.toMatchObject({ code: "invoice_already_fx_stamped" })
  })
})
