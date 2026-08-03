import { availabilitySlots } from "@voyant-travel/availability/schema"
import type { IndexerSlice } from "@voyant-travel/catalog"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import { createProductDeparturesProjectionExtension } from "../../../src/availability/service-catalog-plane-departures.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const enSlice: IndexerSlice = {
  vertical: "products",
  locale: "en-GB",
  audience: "customer",
  market: "default",
}

// Pin "now" so test fixtures don't drift with wall-clock.
const NOW = new Date("2026-05-08T12:00:00Z")

describe.skipIf(!DB_AVAILABLE)("createProductDeparturesProjectionExtension (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: availability; existing suppression is intentional pending typed cleanup.
  let db: any
  let productId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: "Bali Wellness Retreat",
      sellCurrency: "USD",
      bookingMode: "date",
    })
  })

  it("returns empty fields when there are no slots", async () => {
    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("hasUpcomingDeparture")).toBe(false)
    expect(out.get("upcomingDepartureCount")).toBe(0)
    expect(out.get("departureDates[]")).toEqual([])
    expect(out.get("departureMonths[]")).toEqual([])
    expect(out.get("availableUnitsTotal")).toBe(0)
    expect(out.get("nextDepartureAt")).toBeNull()
    expect(out.get("nextDepartureDate")).toBeNull()
    expect(out.get("nextDepartureEndsAt")).toBeNull()
    expect(out.get("nextDepartureEndDate")).toBeNull()
    expect(out.get("departureTimezone")).toBeNull()
  })

  it("projects both frames plus the zone that reconciles them", async () => {
    // The exact shape from #4116: a Bucharest departure whose UTC instant
    // falls on the previous calendar day.
    await db.insert(availabilitySlots).values({
      id: newId("availability_slots"),
      productId,
      dateLocal: "2026-09-26",
      startsAt: new Date("2026-09-25T21:00:00Z"),
      endsAt: new Date("2026-09-26T21:00:00Z"),
      timezone: "Europe/Bucharest",
      status: "open",
      unlimited: false,
      remainingPax: 10,
    })

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("nextDepartureAt")).toBe("2026-09-25T21:00:00.000Z")
    expect(out.get("nextDepartureDate")).toBe("2026-09-26")
    expect(out.get("nextDepartureEndsAt")).toBe("2026-09-26T21:00:00.000Z")
    expect(out.get("nextDepartureEndDate")).toBe("2026-09-27")
    expect(out.get("departureTimezone")).toBe("Europe/Bucharest")
    expect(out.get("departureDates[]")).toEqual(["2026-09-26"])
  })

  it("leaves the departure end null when the slot declares no ends_at", async () => {
    await db.insert(availabilitySlots).values({
      id: newId("availability_slots"),
      productId,
      dateLocal: "2026-05-10",
      startsAt: new Date("2026-05-10T08:00:00Z"),
      timezone: "Europe/Bucharest",
      status: "open",
      unlimited: false,
      remainingPax: 4,
    })

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("nextDepartureEndsAt")).toBeNull()
    expect(out.get("nextDepartureEndDate")).toBeNull()
    expect(out.get("departureTimezone")).toBe("Europe/Bucharest")
  })

  it("aggregates open future slots, picks earliest as next", async () => {
    await db.insert(availabilitySlots).values([
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-10",
        startsAt: new Date("2026-05-10T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 4,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-06-01",
        startsAt: new Date("2026-06-01T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 8,
      },
    ])

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("hasUpcomingDeparture")).toBe(true)
    expect(out.get("upcomingDepartureCount")).toBe(2)
    expect(out.get("nextDepartureDate")).toBe("2026-05-10")
    expect(out.get("departureDates[]")).toEqual(["2026-05-10", "2026-06-01"])
    expect(out.get("departureMonths[]")).toEqual(["2026-05", "2026-06"])
    expect(out.get("availableUnitsTotal")).toBe(12)
  })

  it("excludes sold_out / cancelled / closed slots from every field", async () => {
    await db.insert(availabilitySlots).values([
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-10",
        startsAt: new Date("2026-05-10T08:00:00Z"),
        timezone: "UTC",
        status: "sold_out",
        unlimited: false,
        remainingPax: 0,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-11",
        startsAt: new Date("2026-05-11T08:00:00Z"),
        timezone: "UTC",
        status: "cancelled",
        unlimited: false,
        remainingPax: 0,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-12",
        startsAt: new Date("2026-05-12T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 5,
      },
    ])

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    // Only the open slot survives the filter.
    expect(out.get("upcomingDepartureCount")).toBe(1)
    expect(out.get("departureDates[]")).toEqual(["2026-05-12"])
    expect(out.get("availableUnitsTotal")).toBe(5)
  })

  it("excludes past slots", async () => {
    await db.insert(availabilitySlots).values([
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-04-01", // before NOW
        startsAt: new Date("2026-04-01T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 5,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-06-01",
        startsAt: new Date("2026-06-01T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 5,
      },
    ])

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("upcomingDepartureCount")).toBe(1)
    expect(out.get("departureDates[]")).toEqual(["2026-06-01"])
  })

  it("emits availableUnitsTotal=null when any slot is unlimited", async () => {
    await db.insert(availabilitySlots).values([
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-10",
        startsAt: new Date("2026-05-10T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 4,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-11",
        startsAt: new Date("2026-05-11T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: true,
        remainingPax: null,
      },
    ])

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("availableUnitsTotal")).toBeNull()
    expect(out.get("upcomingDepartureCount")).toBe(2)
  })

  it("short-circuits empty for products with bookingMode='open'", async () => {
    // Re-create the product with bookingMode='open'.
    await db.delete(products)
    await db.insert(products).values({
      id: productId,
      name: "Anytime City Tour",
      sellCurrency: "USD",
      bookingMode: "open",
    })
    // Create a slot anyway — projection should ignore it.
    await db.insert(availabilitySlots).values({
      id: newId("availability_slots"),
      productId,
      dateLocal: "2026-05-10",
      startsAt: new Date("2026-05-10T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      remainingPax: 5,
    })

    const ext = createProductDeparturesProjectionExtension({ now: () => NOW })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("hasUpcomingDeparture")).toBe(false)
    expect(out.get("upcomingDepartureCount")).toBe(0)
    expect(out.get("departureDates[]")).toEqual([])
  })

  it("clips departure dates to the configured window", async () => {
    // Three slots: within 30d, just past 30d, far future.
    await db.insert(availabilitySlots).values([
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-05-15",
        startsAt: new Date("2026-05-15T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 1,
      },
      {
        id: newId("availability_slots"),
        productId,
        dateLocal: "2026-08-15",
        startsAt: new Date("2026-08-15T08:00:00Z"),
        timezone: "UTC",
        status: "open",
        unlimited: false,
        remainingPax: 1,
      },
    ])

    const ext = createProductDeparturesProjectionExtension({
      now: () => NOW,
      datesWindowDays: 30,
      monthsWindowCount: 24,
    })
    const out = await ext.project(db, productId, enSlice)
    expect(out.get("departureDates[]")).toEqual(["2026-05-15"])
    // Months window keeps both.
    expect(out.get("departureMonths[]")).toEqual(["2026-05", "2026-08"])
  })
})
