import { optionPriceRules, optionUnitPriceRules, priceCatalogs } from "@voyant-travel/commerce"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { optionUnits, productOptions, products } from "@voyant-travel/inventory/schema"
import { availabilitySlots } from "@voyant-travel/operations"
import { Hono } from "hono"
import { beforeEach, describe, expect, it } from "vitest"

import { createStorefrontPublicRoutes } from "../../src/routes-public.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DB_AVAILABLE = !!TEST_DATABASE_URL

const db = DB_AVAILABLE ? createTestDb() : (null as never)

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("db" as never, db)
    c.set(
      "storefrontChannel" as never,
      {
        storefrontId: "sf_bound",
        channelId: "chan_bound",
        channelStatus: "active",
      } as never,
    )
    await next()
  })
  .route(
    "/",
    createStorefrontPublicRoutes({
      publication: { isProductPublished: async () => true },
    }),
  )

/**
 * Seed a published product with one priced option and a single open departure
 * whose `remaining_pax` is unset while `remaining_resources` still carries a
 * stale seeded number.
 */
async function seedStaleResourceDeparture(suffix: string) {
  const [product] = await db
    .insert(products)
    .values({
      name: `Danube Delta ${suffix}`,
      status: "active",
      activated: true,
      visibility: "public",
      sellCurrency: "EUR",
    })
    .returning()
  const [option] = await db
    .insert(productOptions)
    .values({ productId: product.id, name: "Standard", status: "active", isDefault: true })
    .returning()
  const [unit] = await db
    .insert(optionUnits)
    .values({
      optionId: option.id,
      name: "Adult",
      unitType: "person",
      isHidden: false,
    })
    .returning()
  const [catalog] = await db
    .insert(priceCatalogs)
    .values({
      code: `PUBLIC-EUR-${suffix}`,
      name: "Public EUR",
      currencyCode: "EUR",
      catalogType: "public",
      isDefault: true,
      active: true,
    })
    .returning()
  const [rule] = await db
    .insert(optionPriceRules)
    .values({
      productId: product.id,
      optionId: option.id,
      priceCatalogId: catalog.id,
      name: "Public rate",
      pricingMode: "per_person",
      isDefault: true,
      active: true,
    })
    .returning()
  await db.insert(optionUnitPriceRules).values({
    optionPriceRuleId: rule.id,
    optionId: option.id,
    unitId: unit.id,
    pricingMode: "per_person",
    sellAmountCents: 50000,
    active: true,
  })
  const [slot] = await db
    .insert(availabilitySlots)
    .values({
      productId: product.id,
      optionId: option.id,
      dateLocal: "2026-09-10",
      startsAt: new Date("2026-09-10T06:00:00.000Z"),
      endsAt: new Date("2026-09-10T10:00:00.000Z"),
      timezone: "Europe/Bucharest",
      status: "open",
      initialPax: 20,
      // The maintained projection is unset...
      remainingPax: null,
      // ...while this seeded-once column still holds a number nothing ever
      // decrements.
      remainingResources: 6,
    })
    .returning()

  return { product, option, slot }
}

// Regression for #4161. `availability_slots.remaining_resources` is settable at
// slot creation and then explicitly stripped on every update, with no writer
// anywhere that decrements it as bookings land. The storefront used to fall
// back to it whenever `remaining_pax` was unset, publishing a number that can
// only ever overstate availability — an overselling path. Unset remaining
// capacity must now surface as unknown (`null`).
describe.skipIf(!DB_AVAILABLE)("public departures ignore stale remaining_resources", () => {
  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("does not advertise remaining_resources on the departure list", async () => {
    const { product, slot } = await seedStaleResourceDeparture("list")

    const res = await app.request(`/products/${product.id}/departures`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      data: Array<{ id: string; capacity: number | null; remaining: number | null }>
    }
    const departure = body.data.find((row) => row.id === slot.id)
    expect(departure).toBeDefined()
    expect(departure?.remaining).toBeNull()
    expect(departure?.capacity).toBe(20)
  }, 30000)

  it("renders unknown remaining as available rather than sold out", async () => {
    const { product, slot } = await seedStaleResourceDeparture("summary")

    const res = await app.request(`/products/${product.id}/availability`)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      data: {
        availabilityState: string
        counts: { soldOut: number; available: number }
        departures: Array<{ id: string; availabilityState: string; remaining: number | null }>
      }
    }
    const departure = body.data.departures.find((row) => row.id === slot.id)
    expect(departure).toBeDefined()
    expect(departure?.remaining).toBeNull()
    // Unknown must degrade to "not known to be sold out", never to sold_out.
    expect(departure?.availabilityState).toBe("available")
    expect(body.data.availabilityState).toBe("available")
    expect(body.data.counts.soldOut).toBe(0)
    expect(body.data.counts.available).toBe(1)
  }, 30000)

  it("does not advertise remaining_resources on the price preview allocation", async () => {
    const { slot } = await seedStaleResourceDeparture("preview")

    const res = await app.request(`/departures/${slot.id}/price`, {
      method: "POST",
      body: JSON.stringify({ pax: { adults: 1, children: 0, infants: 0 } }),
      headers: { "content-type": "application/json" },
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      data: {
        allocation: {
          slot: { capacity: number | null; remaining: number | null; availabilityState: string }
        }
      }
    }
    expect(body.data.allocation.slot.remaining).toBeNull()
    expect(body.data.allocation.slot.capacity).toBe(20)
    expect(body.data.allocation.slot.availabilityState).toBe("available")
  }, 30000)
})
