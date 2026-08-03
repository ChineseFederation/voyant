/**
 * Verifies that mutations going through `bookingsService.{createItem,
 * updateItem, deleteItem}` keep `bookings.sellAmountCents` /
 * `bookings.costAmountCents` consistent with `Σ(booking_items.total*)`.
 *
 * Closes #313.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { bookings } from "../../src/schema.js"
import { bookingsService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let counter = 0
function nextNumber() {
  counter += 1
  return `BK-ROLL-${String(counter).padStart(6, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("bookings auto-rollup", () => {
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

  async function seedBooking(overrides: Partial<typeof bookings.$inferInsert> = {}) {
    const [row] = await db
      .insert(bookings)
      .values({
        bookingNumber: nextNumber(),
        sellCurrency: "EUR",
        ...overrides,
      })
      .returning()
    if (!row) throw new Error("seedBooking: insert returned no rows")
    return row
  }

  async function getTotals(bookingId: string) {
    const [row] = await db
      .select({
        sellAmountCents: bookings.sellAmountCents,
        costAmountCents: bookings.costAmountCents,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
    return row
  }

  async function getMoneyFields(bookingId: string) {
    const [row] = await db
      .select({
        sellAmountCents: bookings.sellAmountCents,
        costAmountCents: bookings.costAmountCents,
        baseCurrency: bookings.baseCurrency,
        baseSellAmountCents: bookings.baseSellAmountCents,
        baseCostAmountCents: bookings.baseCostAmountCents,
      })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
    return row
  }

  it("createItem rolls up sellAmountCents and costAmountCents on the parent", async () => {
    const booking = await seedBooking()

    expect((await getTotals(booking.id))?.sellAmountCents).toBeNull()

    await bookingsService.createItem(db, booking.id, {
      title: "Half-day tour",
      itemType: "unit",
      quantity: 2,
      sellCurrency: "EUR",
      unitSellAmountCents: 5000,
      totalSellAmountCents: 10000,
      costCurrency: "EUR",
      unitCostAmountCents: 3000,
      totalCostAmountCents: 6000,
    })

    expect(await getTotals(booking.id)).toEqual({
      sellAmountCents: 10000,
      costAmountCents: 6000,
    })

    await bookingsService.createItem(db, booking.id, {
      title: "Pickup",
      itemType: "extra",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 1500,
      totalSellAmountCents: 1500,
    })

    expect(await getTotals(booking.id)).toEqual({
      sellAmountCents: 11500,
      costAmountCents: 6000,
    })
  })

  it("updateItem re-rolls when totalSellAmountCents changes", async () => {
    const booking = await seedBooking()
    const created = await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
    })
    expect(created).not.toBeNull()
    if (!created) throw new Error("createItem returned null")

    await bookingsService.updateItem(db, created.id, {
      totalSellAmountCents: 17500,
    })

    expect((await getTotals(booking.id))?.sellAmountCents).toBe(17500)
  })

  it("updateBooking does not let direct parent totals diverge from existing items", async () => {
    const booking = await seedBooking()
    await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 16500,
      totalSellAmountCents: 16500,
    })

    const updated = await bookingsService.updateBooking(db, booking.id, {
      sellAmountCents: 1_650_017_000,
      costAmountCents: 1_650_017_000,
      internalNotes: "metadata-only update",
    })

    expect(updated?.internalNotes).toBe("metadata-only update")
    expect(updated?.sellAmountCents).toBe(16500)
    expect(updated?.costAmountCents).toBe(0)
    expect(await getTotals(booking.id)).toEqual({
      sellAmountCents: 16500,
      costAmountCents: 0,
    })
  })

  it("updateBooking preserves explicit base total clears on itemized bookings", async () => {
    const booking = await seedBooking({
      baseCurrency: "USD",
      baseSellAmountCents: 11000,
      baseCostAmountCents: 7000,
    })
    await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
      costCurrency: "EUR",
      unitCostAmountCents: 6000,
      totalCostAmountCents: 6000,
    })
    await db
      .update(bookings)
      .set({
        baseCurrency: "USD",
        baseSellAmountCents: 11000,
        baseCostAmountCents: 7000,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))

    const updated = await bookingsService.updateBooking(db, booking.id, {
      baseCurrency: null,
      baseSellAmountCents: null,
      baseCostAmountCents: null,
      internalNotes: "fx cleared",
    })

    expect(updated).toMatchObject({
      baseCurrency: null,
      baseSellAmountCents: null,
      baseCostAmountCents: null,
      internalNotes: "fx cleared",
      sellAmountCents: 10000,
      costAmountCents: 6000,
    })
    expect(await getMoneyFields(booking.id)).toEqual({
      sellAmountCents: 10000,
      costAmountCents: 6000,
      baseCurrency: null,
      baseSellAmountCents: null,
      baseCostAmountCents: null,
    })
  })

  it("deleteItem re-rolls without the removed item", async () => {
    const booking = await seedBooking()
    const a = await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
    })
    await bookingsService.createItem(db, booking.id, {
      title: "Pickup",
      itemType: "extra",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 2000,
      totalSellAmountCents: 2000,
    })
    expect((await getTotals(booking.id))?.sellAmountCents).toBe(12000)

    if (!a) throw new Error("createItem returned null")
    await bookingsService.deleteItem(db, a.id)

    expect((await getTotals(booking.id))?.sellAmountCents).toBe(2000)
  })

  it("recomputeBookingTotal is idempotent and exposed for ad-hoc invocation", async () => {
    const booking = await seedBooking()
    await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 5000,
      totalSellAmountCents: 5000,
    })

    // Manually set the parent total to a stale value to simulate a prior
    // bug — recompute should restore truth.
    await db
      .update(bookings)
      .set({ sellAmountCents: 999, updatedAt: new Date() })
      .where(eq(bookings.id, booking.id))

    const result = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(result).toMatchObject({ sellAmountCents: 5000, costAmountCents: 0 })
    expect((await getTotals(booking.id))?.sellAmountCents).toBe(5000)

    // Idempotent — calling again is a no-op.
    const second = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(second).toMatchObject({ sellAmountCents: 5000, costAmountCents: 0 })
  })

  it("treats null totalSellAmountCents as 0 — never NaN, never error", async () => {
    const booking = await seedBooking()
    await bookingsService.createItem(db, booking.id, {
      title: "Pricing TBD",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      // unit/total left null intentionally
    })

    expect(await getTotals(booking.id)).toEqual({
      sellAmountCents: 0,
      costAmountCents: 0,
    })
  })

  it("recomputeBookingTotal returns null for a missing booking", async () => {
    const result = await bookingsService.recomputeBookingTotal(db, "book_does_not_exist")
    expect(result).toBeNull()
  })
})
