import { bookingItems, bookings } from "@voyant-travel/bookings/schema"
import { createTestDb } from "@voyant-travel/db/test-utils"
import { sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { bookingGuarantees, bookingItemCommissions, invoices, payments } from "../../src/schema.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

async function reset(
  // biome-ignore lint/suspicious/noExplicitAny: test db -- owner: finance; existing suppression is intentional pending typed cleanup.
  db: any,
) {
  const tables = [
    "payments",
    "invoice_line_items",
    "invoices",
    "booking_item_commissions",
    "booking_guarantees",
    "booking_payment_schedules",
    "booking_items",
    "bookings",
  ]
  const existing = (await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN (${sql.join(
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      tables.map((t) => sql`${t}`),
      sql`, `,
    )})
  `)) as Array<{ tablename: string }>
  if (existing.length === 0) return
  await db.execute(
    sql.raw(`TRUNCATE ${existing.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`),
  )
}

let counter = 0
function id(prefix: string) {
  counter += 1
  return `${prefix}_chk_${counter}`
}

/**
 * Assert that a database CHECK constraint fires. Drizzle wraps the driver
 * error, so the constraint name is on the cause chain and never in
 * `error.message` — matching the message asserted only that *something* failed,
 * which a not-null violation or a typo in the fixture satisfies just as well.
 */
async function expectCheckViolation(operation: Promise<unknown>, constraint: string) {
  try {
    await operation
  } catch (error) {
    const seen: string[] = []
    let current: unknown = error
    while (current) {
      if (current instanceof Error) seen.push(current.message)
      const named = (current as { constraint_name?: string }).constraint_name
      if (named) seen.push(named)
      current = (current as { cause?: unknown }).cause
    }
    expect(seen.join(" | ")).toContain(constraint)
    return
  }
  throw new Error(`Expected constraint ${constraint} to be violated, but the statement succeeded.`)
}

describe.skipIf(!DB_AVAILABLE)("currency/amount CHECK constraints", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db -- owner: finance; existing suppression is intentional pending typed cleanup.
  let db: any

  beforeAll(() => {
    db = createTestDb()
  })

  afterAll(async () => {
    if (db?.$client?.end) await db.$client.end()
  })

  beforeEach(async () => {
    await reset(db)
  })

  describe("bookings.bookings — base_currency + base_*_amount_cents", () => {
    it("rejects baseSellAmountCents without baseCurrency", async () => {
      await expectCheckViolation(
        db.insert(bookings).values({
          status: "confirmed",
          id: id("book"),
          bookingNumber: `BK-${counter}`,
          sellCurrency: "EUR",
          baseCurrency: null,
          baseSellAmountCents: 10000,
        }),
        "ck_bookings_base_currency_amounts",
      )
    })

    it("rejects baseCostAmountCents without baseCurrency", async () => {
      await expectCheckViolation(
        db.insert(bookings).values({
          status: "confirmed",
          id: id("book"),
          bookingNumber: `BK-${counter}`,
          sellCurrency: "EUR",
          baseCurrency: null,
          baseCostAmountCents: 5000,
        }),
        "ck_bookings_base_currency_amounts",
      )
    })

    it("accepts both base_*_amount_cents null with null baseCurrency", async () => {
      await expect(
        db.insert(bookings).values({
          status: "confirmed",
          id: id("book"),
          bookingNumber: `BK-${counter}`,
          sellCurrency: "EUR",
          baseCurrency: null,
          baseSellAmountCents: null,
          baseCostAmountCents: null,
        }),
      ).resolves.toBeDefined()
    })

    it("accepts base amounts when baseCurrency is set", async () => {
      await expect(
        db.insert(bookings).values({
          status: "confirmed",
          id: id("book"),
          bookingNumber: `BK-${counter}`,
          sellCurrency: "EUR",
          baseCurrency: "USD",
          baseSellAmountCents: 12000,
          baseCostAmountCents: 9000,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("bookings.booking_items — cost_currency + cost amounts", () => {
    async function insertBooking() {
      const bookingId = id("book")
      await db.insert(bookings).values({
        status: "confirmed",
        id: bookingId,
        bookingNumber: `BK-${counter}`,
        sellCurrency: "EUR",
      })
      return bookingId
    }

    it("rejects unitCostAmountCents without costCurrency", async () => {
      const bookingId = await insertBooking()
      await expectCheckViolation(
        db.insert(bookingItems).values({
          status: "confirmed",
          id: id("bkit"),
          bookingId,
          title: "Test",
          sellCurrency: "EUR",
          costCurrency: null,
          unitCostAmountCents: 5000,
        }),
        "ck_booking_items_cost_currency_amounts",
      )
    })

    it("accepts cost amounts with costCurrency set", async () => {
      const bookingId = await insertBooking()
      await expect(
        db.insert(bookingItems).values({
          status: "confirmed",
          id: id("bkit"),
          bookingId,
          title: "Test",
          sellCurrency: "EUR",
          costCurrency: "EUR",
          unitCostAmountCents: 5000,
          totalCostAmountCents: 5000,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("finance.booking_guarantees — currency + amount XNOR", () => {
    it("rejects amount without currency", async () => {
      await expectCheckViolation(
        db.insert(bookingGuarantees).values({
          guaranteeType: "deposit",
          id: id("bkgu"),
          bookingId: id("book"),
          status: "pending",
          currency: null,
          amountCents: 10000,
        }),
        "ck_booking_guarantees_currency_amount",
      )
    })

    it("rejects currency without amount", async () => {
      await expectCheckViolation(
        db.insert(bookingGuarantees).values({
          guaranteeType: "deposit",
          id: id("bkgu"),
          bookingId: id("book"),
          status: "pending",
          currency: "EUR",
          amountCents: null,
        }),
        "ck_booking_guarantees_currency_amount",
      )
    })

    it("accepts both null", async () => {
      await expect(
        db.insert(bookingGuarantees).values({
          guaranteeType: "deposit",
          id: id("bkgu"),
          bookingId: id("book"),
          status: "pending",
          currency: null,
          amountCents: null,
        }),
      ).resolves.toBeDefined()
    })

    it("accepts both set", async () => {
      await expect(
        db.insert(bookingGuarantees).values({
          guaranteeType: "deposit",
          id: id("bkgu"),
          bookingId: id("book"),
          status: "pending",
          currency: "EUR",
          amountCents: 10000,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("finance.booking_item_commissions — currency + amount XNOR", () => {
    it("rejects amount without currency", async () => {
      await expectCheckViolation(
        db.insert(bookingItemCommissions).values({
          id: id("bcom"),
          bookingItemId: id("bkit"),
          recipientType: "channel",
          currency: null,
          amountCents: 1000,
        }),
        "ck_booking_item_commissions_currency_amount",
      )
    })

    it("accepts both null (commission-as-percentage row)", async () => {
      await expect(
        db.insert(bookingItemCommissions).values({
          id: id("bcom"),
          bookingItemId: id("bkit"),
          recipientType: "channel",
          commissionModel: "percentage",
          rateBasisPoints: 1500,
          currency: null,
          amountCents: null,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("finance.invoices — base_currency + base_*_cents", () => {
    async function bookingId() {
      const bid = id("book")
      await db.insert(bookings).values({
        status: "confirmed",
        id: bid,
        bookingNumber: `BK-${counter}`,
        sellCurrency: "EUR",
      })
      return bid
    }

    it("rejects baseSubtotalCents without baseCurrency", async () => {
      const bid = await bookingId()
      await expectCheckViolation(
        db.insert(invoices).values({
          id: id("inv"),
          invoiceNumber: `INV-${counter}`,
          bookingId: bid,
          status: "draft",
          currency: "EUR",
          baseCurrency: null,
          baseSubtotalCents: 5000,
          issueDate: "2026-04-25",
          dueDate: "2026-05-25",
        }),
        "ck_invoices_base_currency_amounts",
      )
    })

    it("accepts every base_*_cents null with baseCurrency null", async () => {
      const bid = await bookingId()
      await expect(
        db.insert(invoices).values({
          id: id("inv"),
          invoiceNumber: `INV-${counter}`,
          bookingId: bid,
          status: "draft",
          currency: "EUR",
          baseCurrency: null,
          issueDate: "2026-04-25",
          dueDate: "2026-05-25",
        }),
      ).resolves.toBeDefined()
    })
  })

  describe("finance.payments — base_currency + base_amount XNOR", () => {
    async function invoiceId() {
      const bid = id("book")
      await db.insert(bookings).values({
        status: "confirmed",
        id: bid,
        bookingNumber: `BK-${counter}`,
        sellCurrency: "EUR",
      })
      const iid = id("inv")
      await db.insert(invoices).values({
        id: iid,
        invoiceNumber: `INV-${counter}`,
        bookingId: bid,
        status: "draft",
        currency: "EUR",
        issueDate: "2026-04-25",
        dueDate: "2026-05-25",
      })
      return iid
    }

    it("rejects baseAmountCents without baseCurrency", async () => {
      const iid = await invoiceId()
      await expectCheckViolation(
        db.insert(payments).values({
          id: id("pay"),
          invoiceId: iid,
          amountCents: 10000,
          currency: "EUR",
          baseCurrency: null,
          baseAmountCents: 12000,
          paymentMethod: "bank_transfer",
          paymentDate: "2026-04-25",
        }),
        "ck_payments_base_currency_amount",
      )
    })

    it("rejects baseCurrency without baseAmountCents", async () => {
      const iid = await invoiceId()
      await expectCheckViolation(
        db.insert(payments).values({
          id: id("pay"),
          invoiceId: iid,
          amountCents: 10000,
          currency: "EUR",
          baseCurrency: "USD",
          baseAmountCents: null,
          paymentMethod: "bank_transfer",
          paymentDate: "2026-04-25",
        }),
        "ck_payments_base_currency_amount",
      )
    })

    it("accepts both null", async () => {
      const iid = await invoiceId()
      await expect(
        db.insert(payments).values({
          id: id("pay"),
          invoiceId: iid,
          amountCents: 10000,
          currency: "EUR",
          baseCurrency: null,
          baseAmountCents: null,
          paymentMethod: "bank_transfer",
          paymentDate: "2026-04-25",
        }),
      ).resolves.toBeDefined()
    })
  })
})
