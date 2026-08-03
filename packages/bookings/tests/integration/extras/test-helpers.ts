import { Hono } from "hono"
import { beforeAll, beforeEach, expect } from "vitest"

import { bookingsExtrasRoutes } from "../../../src/extras.js"

export const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

export const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

let seq = 0

function nextSeq() {
  seq++
  return String(seq).padStart(4, "0")
}

export function createExtrasTestContext() {
  let app!: Hono
  let db!: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      c.set("userId" as never, "test-user-id")
      await next()
    })
    // The Product-owned half of the surface lives in inventory: an Extra is
    // authored there and only *selected* here, so the harness has to mount both
    // to seed a Product Extra and then exercise the Booking/manifest side.
    const { inventoryExtrasRoutes } = await import("../../../../inventory/src/extras.js")
    app.route("/", inventoryExtrasRoutes as never)
    app.route("/", bookingsExtrasRoutes)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  async function seedProduct() {
    const { products } = await import("../../../../inventory/src/schema.js")
    const [row] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(products)
      .values({ name: `Product ${nextSeq()}`, sellCurrency: "USD" })
      .returning()
    return row!
  }

  async function seedProductOption(productId: string) {
    const { productOptions } = await import("../../../../inventory/src/schema.js")
    const [row] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(productOptions)
      .values({ productId, name: `Option ${nextSeq()}` })
      .returning()
    return row!
  }

  async function seedBooking() {
    const { bookings } = await import("@voyant-travel/bookings/schema")
    const [row] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(bookings)
      .values({ bookingNumber: `BK-${nextSeq()}`, sellCurrency: "USD" })
      .returning()
    return row!
  }

  async function seedAvailabilitySlot(productId: string, overrides: Record<string, unknown> = {}) {
    const { availabilitySlots } = await import("../../../../operations/src/index.js")
    const [row] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(availabilitySlots)
      .values({
        productId,
        dateLocal: "2026-06-01",
        startsAt: new Date("2026-06-01T08:00:00.000Z"),
        timezone: "Europe/Bucharest",
        status: "open",
        unlimited: false,
        initialPax: 40,
        remainingPax: 38,
        ...overrides,
      })
      .returning()
    return row!
  }

  async function seedBookingTravelerOnSlot(
    slotId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const { bookingAllocations, bookingItems, bookingTravelers, bookings } = await import(
      "@voyant-travel/bookings/schema"
    )
    const bookingNumber = (overrides.bookingNumber as string | undefined) ?? `BK-${nextSeq()}`
    const [booking] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(bookings)
      .values({
        bookingNumber,
        status: "confirmed",
        sellCurrency: "EUR",
        ...((overrides.booking ?? {}) as Record<string, unknown>),
      })
      .returning()
    const [traveler] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(bookingTravelers)
      .values({
        bookingId: booking!.id,
        firstName: "Ana",
        lastName: `Traveler ${nextSeq()}`,
        isPrimary: true,
        ...((overrides.traveler ?? {}) as Record<string, unknown>),
      })
      .returning()
    const [item] = await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(bookingItems)
      .values({
        bookingId: booking!.id,
        title: "Trip",
        itemType: "unit",
        status: "confirmed",
        quantity: 1,
        sellCurrency: "EUR",
        availabilitySlotId: slotId,
        ...((overrides.item ?? {}) as Record<string, unknown>),
      })
      .returning()
    await (db as never as import("drizzle-orm/postgres-js").PostgresJsDatabase)
      .insert(bookingAllocations)
      .values({
        bookingId: booking!.id,
        bookingItemId: item!.id,
        availabilitySlotId: slotId,
        status: "confirmed",
        quantity: 1,
      })
    return { booking: booking!, traveler: traveler!, item: item! }
  }

  async function seedProductExtra(overrides: Record<string, unknown> = {}) {
    let productId = overrides.productId as string | undefined
    if (!productId) {
      const product = await seedProduct()
      productId = product.id
    }

    const res = await app.request("/product-extras", {
      method: "POST",
      ...json({
        productId,
        name: `Extra ${nextSeq()}`,
        ...overrides,
      }),
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; productId: string; [key: string]: unknown }
  }

  async function seedOptionExtraConfig(
    optionId: string,
    productExtraId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await app.request("/option-extra-configs", {
      method: "POST",
      ...json({ optionId, productExtraId, ...overrides }),
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; [key: string]: unknown }
  }

  async function seedBookingExtra(overrides: Record<string, unknown> = {}) {
    let bookingId = overrides.bookingId as string | undefined
    if (!bookingId) {
      const booking = await seedBooking()
      bookingId = booking.id
    }

    const res = await app.request("/booking-extras", {
      method: "POST",
      ...json({
        bookingId,
        name: `Booking Extra ${nextSeq()}`,
        sellCurrency: "USD",
        ...overrides,
      }),
    })
    expect(res.status).toBe(201)
    const { data } = await res.json()
    return data as { id: string; bookingId: string; [key: string]: unknown }
  }

  return {
    request: (path: string, init?: RequestInit) => app.request(path, init),
    seedBooking,
    seedAvailabilitySlot,
    seedBookingTravelerOnSlot,
    seedBookingExtra,
    seedOptionExtraConfig,
    seedProduct,
    seedProductExtra,
    seedProductOption,
  }
}
