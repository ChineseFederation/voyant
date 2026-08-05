import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { availabilityRules, availabilitySlots } from "@voyant-travel/operations/schema"
import { and, asc, eq } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  productDayServices,
  productDays,
  productItineraries,
  productOptions,
  products,
  productVersions,
} from "../../../../inventory/src/schema.js"
import { itineraryHistoryProductsService } from "../../../../inventory/src/service-itinerary-history.js"
import { generateAvailabilitySlots } from "../../../src/availability/generate-slots.js"
import { materializeDepartureServiceOperations } from "../../../src/availability/materialize-departure-operations.js"
import { departureServiceOperations } from "../../../src/availability/schema-departure-operations.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/**
 * Seed a two-day product whose day services carry operational fields, freeze it
 * as version 1, and return the ids. Each caller passes its own id set so tests
 * never depend on a per-test TRUNCATE.
 */
async function seedFrozenProduct(
  // biome-ignore lint/suspicious/noExplicitAny: owner: operations; test drizzle client is driver-specific
  db: any,
  ids: {
    productId: string
    optionId: string
    itineraryId: string
    day1: string
    day2: string
    service1: string
    service2: string
    versionId: string
  },
) {
  await db.insert(products).values({
    id: ids.productId,
    name: "Transylvania Explorer",
    sellCurrency: "EUR",
    bookingMode: "date",
  })
  await db.insert(productOptions).values({
    id: ids.optionId,
    productId: ids.productId,
    name: "Standard",
    status: "active",
    sortOrder: 0,
    isDefault: true,
  })
  await db.insert(productItineraries).values({
    id: ids.itineraryId,
    productId: ids.productId,
    name: "Default",
    isDefault: true,
    sortOrder: 0,
  })
  await db.insert(productDays).values([
    { id: ids.day1, itineraryId: ids.itineraryId, dayNumber: 1, title: "Arrival" },
    { id: ids.day2, itineraryId: ids.itineraryId, dayNumber: 2, title: "City tour" },
  ])
  await db.insert(productDayServices).values([
    {
      id: ids.service1,
      dayId: ids.day1,
      serviceType: "accommodation",
      name: "Hotel check-in",
      supplierId: "supp_hotel",
      facilityId: "fac_hotel",
      startTimeLocal: "09:00",
      durationMinutes: 60,
      inclusionRole: "included",
      travelerScope: "all",
      costCurrency: "EUR",
      costAmountCents: 10000,
      quantity: 1,
      sortOrder: 0,
    },
    {
      id: ids.service2,
      dayId: ids.day2,
      serviceType: "experience",
      name: "Bran Castle tour",
      supplierId: "supp_guide",
      facilityId: "fac_castle",
      startTimeLocal: "14:30",
      endTimeLocal: "17:00",
      inclusionRole: "optional",
      travelerScope: "adults",
      costCurrency: "EUR",
      costAmountCents: 5000,
      quantity: 1,
      sortOrder: 0,
    },
  ])

  const snapshot = await itineraryHistoryProductsService.buildSnapshot(db, ids.productId)
  await db.insert(productVersions).values({
    id: ids.versionId,
    productId: ids.productId,
    versionNumber: 1,
    snapshot,
    authorId: "tester",
  })
}

describe.skipIf(!DB_AVAILABLE)("departure service operations (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: owner: operations; createTestDb returns a driver-specific drizzle test client
  let db: any

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
  })

  it("materializes departure lines from the frozen snapshot and maps day N to date + (N-1)", async () => {
    const ids = {
      productId: newId("products"),
      optionId: newId("product_options"),
      itineraryId: newId("product_itineraries"),
      day1: newId("product_days"),
      day2: newId("product_days"),
      service1: newId("product_day_services"),
      service2: newId("product_day_services"),
      versionId: newId("product_versions"),
    }
    await seedFrozenProduct(db, ids)

    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId: ids.productId,
      productVersionId: ids.versionId,
      optionId: ids.optionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T06:00:00Z"),
      timezone: "Europe/Bucharest",
      status: "open",
      unlimited: false,
      initialPax: 10,
      remainingPax: 10,
      days: 2,
    })

    const result = await materializeDepartureServiceOperations(db, slotId)
    expect(result.created).toBe(2)
    expect(result.skippedExisting).toBe(0)
    expect(result.daysMaterialized).toBe(2)

    const lines = await db
      .select()
      .from(departureServiceOperations)
      .where(eq(departureServiceOperations.slotId, slotId))
      .orderBy(asc(departureServiceOperations.dayNumber))

    expect(lines).toHaveLength(2)

    const [day1Line, day2Line] = lines
    // Day 1 → slot date; day 2 → slot date + 1, both in the slot timezone.
    expect(day1Line.dayNumber).toBe(1)
    expect(day1Line.dateLocal).toBe("2026-06-01")
    expect(day1Line.name).toBe("Hotel check-in")
    expect(day1Line.supplierId).toBe("supp_hotel")
    expect(day1Line.facilityId).toBe("fac_hotel")
    expect(day1Line.inclusionRole).toBe("included")
    expect(day1Line.travelerScope).toBe("all")
    expect(day1Line.status).toBe("planned")
    // 09:00 Bucharest (UTC+3 in June) → 06:00Z, +60 min → 07:00Z.
    expect(day1Line.startsAt?.toISOString()).toBe("2026-06-01T06:00:00.000Z")
    expect(day1Line.endsAt?.toISOString()).toBe("2026-06-01T07:00:00.000Z")

    expect(day2Line.dayNumber).toBe(2)
    expect(day2Line.dateLocal).toBe("2026-06-02")
    expect(day2Line.name).toBe("Bran Castle tour")
    expect(day2Line.inclusionRole).toBe("optional")
    expect(day2Line.travelerScope).toBe("adults")
    // 14:30 → 11:30Z, explicit end 17:00 → 14:00Z.
    expect(day2Line.startsAt?.toISOString()).toBe("2026-06-02T11:30:00.000Z")
    expect(day2Line.endsAt?.toISOString()).toBe("2026-06-02T14:00:00.000Z")
  })

  it("does NOT mutate an already-materialized departure when the Product is later edited", async () => {
    const ids = {
      productId: newId("products"),
      optionId: newId("product_options"),
      itineraryId: newId("product_itineraries"),
      day1: newId("product_days"),
      day2: newId("product_days"),
      service1: newId("product_day_services"),
      service2: newId("product_day_services"),
      versionId: newId("product_versions"),
    }
    await seedFrozenProduct(db, ids)

    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId: ids.productId,
      productVersionId: ids.versionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T06:00:00Z"),
      timezone: "Europe/Bucharest",
      status: "open",
      unlimited: false,
      initialPax: 10,
      remainingPax: 10,
      days: 2,
    })

    // Materialize once against version 1.
    const first = await materializeDepartureServiceOperations(db, slotId)
    expect(first.created).toBe(2)

    const before = await db
      .select()
      .from(departureServiceOperations)
      .where(
        and(
          eq(departureServiceOperations.slotId, slotId),
          eq(departureServiceOperations.sourceDayServiceId, ids.service1),
        ),
      )
    expect(before[0]?.name).toBe("Hotel check-in")
    expect(before[0]?.startsAt?.toISOString()).toBe("2026-06-01T06:00:00.000Z")

    // The operator now edits the live Product — a new name, time, and facility.
    // Under publish this would mint version 2; the departure stays bound to v1.
    await db
      .update(productDayServices)
      .set({
        name: "MUTATED — different hotel",
        startTimeLocal: "23:00",
        facilityId: "fac_completely_different",
        inclusionRole: "optional",
      })
      .where(eq(productDayServices.id, ids.service1))

    // Re-materializing is an idempotent no-op — it reads the FROZEN snapshot,
    // not the live rows, so nothing is created and nothing is rewritten.
    const second = await materializeDepartureServiceOperations(db, slotId)
    expect(second.created).toBe(0)
    expect(second.skippedExisting).toBe(2)

    const after = await db
      .select()
      .from(departureServiceOperations)
      .where(
        and(
          eq(departureServiceOperations.slotId, slotId),
          eq(departureServiceOperations.sourceDayServiceId, ids.service1),
        ),
      )
    // The whole point of the RFC: the materialized line is unchanged.
    expect(after[0]?.name).toBe("Hotel check-in")
    expect(after[0]?.facilityId).toBe("fac_hotel")
    expect(after[0]?.inclusionRole).toBe("included")
    expect(after[0]?.startsAt?.toISOString()).toBe("2026-06-01T06:00:00.000Z")
    expect(after[0]?.id).toBe(before[0]?.id)
  })

  it("materializes departure operations during generateAvailabilitySlots", async () => {
    const ids = {
      productId: newId("products"),
      optionId: newId("product_options"),
      itineraryId: newId("product_itineraries"),
      day1: newId("product_days"),
      day2: newId("product_days"),
      service1: newId("product_day_services"),
      service2: newId("product_day_services"),
      versionId: newId("product_versions"),
    }
    await seedFrozenProduct(db, ids)

    await db.insert(availabilityRules).values({
      id: newId("availability_rules"),
      productId: ids.productId,
      optionId: ids.optionId,
      timezone: "Europe/Bucharest",
      recurrenceRule: "FREQ=DAILY;COUNT=1",
      maxCapacity: 10,
      active: true,
    })

    const result = await generateAvailabilitySlots(db, {
      horizonDays: 2,
      now: new Date("2026-06-01T00:00:00Z"),
      materializeResources: false,
      // Bind the generated departure to version 1 explicitly.
      resolveCurrentProductVersionId: async () => ids.versionId,
    })

    expect(result.slotsCreated).toBeGreaterThan(0)
    // Each generated departure materializes both day services from version 1.
    expect(result.departureOperationsMaterialized).toBe(result.slotsCreated * 2)
  })
})
