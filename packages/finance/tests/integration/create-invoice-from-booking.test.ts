import { bookings } from "@voyant-travel/bookings/schema"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  invoiceExternalRefs,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
} from "../../src/schema.js"
import { financeService, type InvoiceFromBookingData } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let counter = 0
function next(prefix: string) {
  counter += 1
  return `${prefix}-${String(counter).padStart(6, "0")}`
}

const bookingData: InvoiceFromBookingData = {
  booking: {
    id: "book_invoice_from_booking",
    bookingNumber: "BK-IFB",
    personId: null,
    organizationId: null,
    sellCurrency: "RON",
    baseCurrency: null,
    fxRateSetId: null,
    sellAmountCents: 59_500,
    baseSellAmountCents: null,
  },
  items: [],
}

describe.skipIf(!DB_AVAILABLE)("createInvoiceFromBooking", () => {
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

  it("persists caller-supplied line items when external refs are supplied", async () => {
    const invoice = await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: bookingData.booking.id,
        invoiceNumber: next("SB"),
        issueDate: "2026-05-25",
        dueDate: "2026-06-25",
        currency: "RON",
        subtotalCents: 50_000,
        taxCents: 9_500,
        totalCents: 59_500,
        lineItems: [
          {
            description: "SmartBill fiscal line",
            quantity: 1,
            unitAmountCents: 50_000,
            taxRateBps: 1_900,
            taxAmountCents: 9_500,
          },
        ],
        externalRefs: [
          {
            provider: "smartbill",
            externalId: "remote_42",
            externalNumber: "42",
            externalUrl: "https://smartbill.test/invoices/42",
            status: "issued",
            syncedAt: "2026-05-25T10:30:00.000Z",
          },
        ],
      },
      bookingData,
    )

    expect(invoice).toBeTruthy()

    const lines = await db
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice?.id ?? ""))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      invoiceId: invoice?.id,
      bookingItemId: null,
      description: "SmartBill fiscal line",
      quantity: 1,
      unitPriceCents: 50_000,
      totalCents: 50_000,
      taxRate: 19,
      sortOrder: 0,
    })

    const refs = await db
      .select()
      .from(invoiceExternalRefs)
      .where(eq(invoiceExternalRefs.invoiceId, invoice?.id ?? ""))
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({
      invoiceId: invoice?.id,
      provider: "smartbill",
      externalId: "remote_42",
      externalNumber: "42",
      status: "issued",
    })
  })

  it("rolls local number allocation back when the fenced invoice insert fails", async () => {
    await db.insert(bookings).values({
      id: bookingData.booking.id,
      bookingNumber: bookingData.booking.bookingNumber,
      status: "confirmed",
      sellCurrency: bookingData.booking.sellCurrency,
    })
    const [series] = await db
      .insert(invoiceNumberSeries)
      .values({
        code: next("series"),
        name: "Rollback series",
        prefix: "INV",
        separator: "-",
        padLength: 4,
        currentSequence: 7,
        scope: "invoice",
        isDefault: true,
        active: true,
      })
      .returning()
    await db.insert(invoices).values({
      invoiceNumber: "INV-0008",
      invoiceType: "invoice",
      bookingId: bookingData.booking.id,
      currency: "RON",
      issueDate: "2026-05-25",
      dueDate: "2026-06-25",
    })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: bookingData.booking.id,
          issueDate: "2026-05-25",
          dueDate: "2026-06-25",
        },
        bookingData,
      ),
    ).rejects.toMatchObject({ code: "invoice_number_conflict", invoiceNumber: "INV-0008" })

    const [storedSeries] = await db
      .select({ currentSequence: invoiceNumberSeries.currentSequence })
      .from(invoiceNumberSeries)
      .where(eq(invoiceNumberSeries.id, series!.id))
    expect(storedSeries?.currentSequence).toBe(7)
  })
})
