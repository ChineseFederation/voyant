import { bookings } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createFinanceAdminSettlementRoutes } from "../../src/routes-settlement.js"
import { invoiceExternalRefs, invoices, payments } from "../../src/schema.js"
import { financeService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Finance settlement routes", () => {
  let app: Hono
  let db: PostgresJsDatabase
  let settlementEvents: Array<Record<string, unknown>>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    const eventBus = createEventBus()
    settlementEvents = []
    eventBus.subscribe("invoice.settled", (event) => {
      settlementEvents.push(event as Record<string, unknown>)
    })
    app.route(
      "/",
      createFinanceAdminSettlementRoutes({
        eventBus,
        invoiceSettlementPollers: {
          smartbill: async ({ externalRef }) => ({
            externalNumber: externalRef.externalNumber ?? "1001",
            status: "paid",
            paidAmountCents: 60000,
            unpaidAmountCents: 40000,
            settledAt: "2026-05-06T10:00:00.000Z",
          }),
        },
      }),
    )
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    settlementEvents = []
  })

  it("reconciles newly observed paid amounts into completed payments", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        status: "confirmed",
        bookingNumber: "BKG-2001",
        sellCurrency: "EUR",
        sellAmountCents: 100000,
        startDate: "2026-06-01",
      })
      .returning()

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-2001",
        bookingId: booking.id,
        invoiceType: "proforma",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-05-01",
        dueDate: "2026-05-05",
        subtotalCents: 100000,
        taxCents: 0,
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
      })
      .returning()

    await financeService.createPayment(db, invoice.id, {
      amountCents: 30000,
      currency: "EUR",
      paymentMethod: "bank_transfer",
      status: "completed",
      paymentDate: "2026-05-03",
      referenceNumber: "manual-bank-transfer",
    })

    const [externalRef] = await db
      .insert(invoiceExternalRefs)
      .values({
        invoiceId: invoice.id,
        provider: "smartbill",
        externalNumber: "1001",
        metadata: {
          companyVatCode: "RO12345678",
          seriesName: "SB",
        },
      })
      .returning()

    const res = await app.request(`/invoices/${invoice.id}/poll-settlement`, {
      method: "POST",
      ...json({ paymentMethod: "bank_transfer" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.paidCents).toBe(60000)
    expect(body.data.balanceDueCents).toBe(40000)
    expect(body.data.invoiceStatus).toBe("partially_paid")
    expect(body.data.results).toHaveLength(1)
    expect(body.data.results[0]).toMatchObject({
      provider: "smartbill",
      externalRefId: externalRef.id,
      externalNumber: "1001",
      status: "paid",
      paidAmountCents: 60000,
      unpaidAmountCents: 40000,
      newlyAppliedAmountCents: 30000,
      syncError: null,
    })
    expect(body.data.results[0].createdPaymentId).toBeTruthy()

    const refreshedInvoice = await financeService.getInvoiceById(db, invoice.id)
    expect(refreshedInvoice?.paidCents).toBe(60000)
    expect(refreshedInvoice?.balanceDueCents).toBe(40000)
    expect(refreshedInvoice?.status).toBe("partially_paid")

    const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id))
    expect(paymentRows.filter((row) => row.status === "completed")).toHaveLength(2)
    expect(paymentRows.map((row) => row.amountCents).sort((a, b) => a - b)).toEqual([30000, 30000])

    const [syncedRef] = await db
      .select()
      .from(invoiceExternalRefs)
      .where(eq(invoiceExternalRefs.id, externalRef.id))
      .limit(1)
    expect(syncedRef?.status).toBe("paid")
    expect(syncedRef?.syncError).toBeNull()
    expect(settlementEvents).toEqual([
      expect.objectContaining({
        name: "invoice.settled",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "domain",
          source: "service",
        }),
        data: expect.objectContaining({
          invoiceId: invoice.id,
          provider: "smartbill",
          newlyAppliedAmountCents: 30000,
          paidCents: 60000,
          balanceDueCents: 40000,
        }),
      }),
    ])
  })
})
