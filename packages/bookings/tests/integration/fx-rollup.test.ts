/**
 * Closes #320.
 *
 * Verifies `bookingsService.recomputeBookingTotal` re-derives
 * `baseSellAmountCents` / `baseCostAmountCents` from per-item totals
 * via the booking's `fxRateSetId`. Single-currency, multi-currency,
 * and missing-rate cases.
 */

import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { exchangeRates, fxRateSets } from "../../../commerce/src/markets/schema.js"
import { bookings } from "../../src/schema.js"
import { bookingsService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

let counter = 0
function nextNumber() {
  counter += 1
  return `BK-FX-${String(counter).padStart(6, "0")}`
}

describe.skipIf(!DB_AVAILABLE)("bookings FX rollup", () => {
  // biome-ignore lint/suspicious/noExplicitAny: test db -- owner: bookings; existing suppression is intentional pending typed cleanup.
  let db: any

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

  async function seedRateSet(baseCurrency: string, rates: Array<[string, string, number]>) {
    const [set] = await db
      .insert(fxRateSets)
      .values({
        baseCurrency,
        effectiveAt: new Date("2026-04-25T00:00:00Z"),
      })
      .returning()
    if (!set) throw new Error("seedRateSet: insert returned no rows")

    if (rates.length > 0) {
      await db.insert(exchangeRates).values(
        rates.map(([from, to, rate]) => ({
          fxRateSetId: set.id,
          baseCurrency: from,
          quoteCurrency: to,
          rateDecimal: String(rate),
        })),
      )
    }
    return set.id as string
  }

  async function seedBooking(opts: {
    sellCurrency: string
    baseCurrency?: string | null
    fxRateSetId?: string | null
  }) {
    const [row] = await db
      .insert(bookings)
      .values({
        bookingNumber: nextNumber(),
        sellCurrency: opts.sellCurrency,
        baseCurrency: opts.baseCurrency ?? null,
        fxRateSetId: opts.fxRateSetId ?? null,
      })
      .returning()
    if (!row) throw new Error("seedBooking: insert returned no rows")
    return row
  }

  async function getBooking(bookingId: string) {
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId))
    return row
  }

  it("single-currency booking: base totals NOT touched (FX skipped) — fxStatus 'skipped'", async () => {
    const booking = await seedBooking({ sellCurrency: "EUR" })
    await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
    })

    const result = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(result?.fxStatus).toBe("skipped")
    expect(result?.sellAmountCents).toBe(10000)

    const refreshed = await getBooking(booking.id)
    expect(refreshed?.sellAmountCents).toBe(10000)
    expect(refreshed?.baseSellAmountCents).toBeNull()
  })

  it("multi-currency booking with FX rate: base totals correctly converted", async () => {
    const fxRateSetId = await seedRateSet("USD", [
      ["EUR", "USD", 1.1],
      ["GBP", "USD", 1.27],
    ])
    const booking = await seedBooking({
      sellCurrency: "EUR",
      baseCurrency: "USD",
      fxRateSetId,
    })

    await bookingsService.createItem(db, booking.id, {
      title: "EUR tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
      costCurrency: "EUR",
      unitCostAmountCents: 6000,
      totalCostAmountCents: 6000,
    })
    await bookingsService.createItem(db, booking.id, {
      title: "GBP supplement",
      itemType: "extra",
      quantity: 1,
      sellCurrency: "GBP",
      unitSellAmountCents: 5000,
      totalSellAmountCents: 5000,
    })

    const result = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(result?.fxStatus).toBe("ok")
    // 10000 EUR × 1.1 + 5000 GBP × 1.27 = 11000 + 6350 = 17350
    expect(result?.baseSellAmountCents).toBe(17350)
    // 6000 EUR × 1.1 = 6600
    expect(result?.baseCostAmountCents).toBe(6600)

    const refreshed = await getBooking(booking.id)
    expect(refreshed?.baseSellAmountCents).toBe(17350)
    expect(refreshed?.baseCostAmountCents).toBe(6600)
  })

  it("base = sell (1:1 same currency item in multi-currency booking)", async () => {
    const fxRateSetId = await seedRateSet("EUR", [["USD", "EUR", 0.91]])
    const booking = await seedBooking({
      sellCurrency: "EUR",
      baseCurrency: "EUR",
      fxRateSetId,
    })
    await bookingsService.createItem(db, booking.id, {
      title: "Domestic",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      unitSellAmountCents: 10000,
      totalSellAmountCents: 10000,
    })

    const result = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(result?.fxStatus).toBe("ok")
    // Same currency → 1:1 conversion
    expect(result?.baseSellAmountCents).toBe(10000)
  })

  it("missing FX rate: fxStatus 'missing_rate', base totals untouched", async () => {
    const fxRateSetId = await seedRateSet("USD", [["EUR", "USD", 1.1]]) // no GBP rate
    const booking = await seedBooking({
      sellCurrency: "EUR",
      baseCurrency: "USD",
      fxRateSetId,
    })

    // First add an item that DOES have a rate, and write base totals successfully
    await bookingsService.createItem(db, booking.id, {
      title: "EUR",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 10000,
    })
    const initial = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(initial?.baseSellAmountCents).toBe(11000)

    // Now add a GBP item with no rate in the rate set — base totals should NOT update
    await bookingsService.createItem(db, booking.id, {
      title: "GBP",
      itemType: "extra",
      quantity: 1,
      sellCurrency: "GBP",
      totalSellAmountCents: 5000,
    })

    // After createItem the recompute fired. It should have left base*Cents
    // at the previous good value because the GBP rate is missing.
    const refreshed = await getBooking(booking.id)
    expect(refreshed?.sellAmountCents).toBe(15000) // sum still rolls
    expect(refreshed?.baseSellAmountCents).toBe(11000) // unchanged from before

    const direct = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(direct?.fxStatus).toBe("missing_rate")
    expect(direct).toMatchObject({ missingCurrency: "GBP" })
  })

  it("inverse rate path: rate stored as USD->EUR, query EUR->USD via inverse_rate_decimal", async () => {
    const [set] = await db
      .insert(fxRateSets)
      .values({
        baseCurrency: "USD",
        effectiveAt: new Date("2026-04-25T00:00:00Z"),
      })
      .returning()
    await db.insert(exchangeRates).values({
      fxRateSetId: set.id,
      baseCurrency: "USD",
      quoteCurrency: "EUR",
      rateDecimal: "0.91",
      inverseRateDecimal: "1.1", // EUR → USD
    })
    const booking = await seedBooking({
      sellCurrency: "EUR",
      baseCurrency: "USD",
      fxRateSetId: set.id,
    })
    await bookingsService.createItem(db, booking.id, {
      title: "EUR via inverse",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 10000,
    })
    const result = await bookingsService.recomputeBookingTotal(db, booking.id)
    expect(result?.fxStatus).toBe("ok")
    expect(result?.baseSellAmountCents).toBe(11000)
  })

  it("recomputeBookingTotal returns null for a missing booking", async () => {
    const result = await bookingsService.recomputeBookingTotal(db, "book_does_not_exist")
    expect(result).toBeNull()
  })

  it("automatic re-rollup on item update preserves FX correctness", async () => {
    const fxRateSetId = await seedRateSet("USD", [["EUR", "USD", 1.1]])
    const booking = await seedBooking({
      sellCurrency: "EUR",
      baseCurrency: "USD",
      fxRateSetId,
    })
    const item = await bookingsService.createItem(db, booking.id, {
      title: "Tour",
      itemType: "unit",
      quantity: 1,
      sellCurrency: "EUR",
      totalSellAmountCents: 10000,
    })
    if (!item) throw new Error()

    let refreshed = await getBooking(booking.id)
    expect(refreshed?.baseSellAmountCents).toBe(11000)

    // Update item: 10000 → 20000 EUR
    await bookingsService.updateItem(db, item.id, { totalSellAmountCents: 20000 })

    refreshed = await getBooking(booking.id)
    expect(refreshed?.sellAmountCents).toBe(20000)
    expect(refreshed?.baseSellAmountCents).toBe(22000)
  })
})
