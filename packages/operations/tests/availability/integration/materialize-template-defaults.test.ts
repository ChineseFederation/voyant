import {
  allocationResources,
  availabilityRules,
  availabilitySlots,
  productOptionResourceTemplates,
} from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { eq, sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { bookingAllocations, bookingItems, bookings } from "../../../../bookings/src/schema.js"
import { productOptions, products } from "../../../../inventory/src/schema.js"
import { generateAvailabilitySlots } from "../../../src/availability/generate-slots.js"
import {
  autoMaterializeAllocationResources,
  materializeSlotResourcesFromTemplateDefaults,
} from "../../../src/availability/service-allocation-automation.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("materialize template defaults (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: owner: availability; createTestDb returns a driver-specific drizzle test client
  let db: any
  let productId: string
  let optionId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    optionId = newId("product_options")
    await db.insert(products).values({
      id: productId,
      name: "Romanian Circuit",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(productOptions).values({
      id: optionId,
      productId,
      name: "Standard Circuit",
      status: "active",
      sortOrder: 0,
    })
  })

  it("seeds resources per template default_count on slot create", async () => {
    // Unique index on (product_option_id, kind) — model rooming as two
    // distinct kinds ("room_sgl", "room_dbl") so we can express both
    // buckets at the catalog level.
    await db.insert(productOptionResourceTemplates).values([
      {
        productOptionId: optionId,
        kind: "room_sgl",
        capacity: 1,
        namePattern: "SGL {sequence}",
        defaultCount: 5,
        flags: { roomType: "SGL" },
      },
      {
        productOptionId: optionId,
        kind: "room_dbl",
        capacity: 2,
        namePattern: "DBL {sequence}",
        defaultCount: 20,
        flags: { roomType: "DBL" },
      },
    ])

    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      optionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 49,
      remainingPax: 49,
    })

    const result = await materializeSlotResourcesFromTemplateDefaults(db, slotId)
    expect(result.created).toBe(25)
    const rooms = await db.execute(sql`
      SELECT label, capacity, kind FROM allocation_resources WHERE slot_id = ${slotId} ORDER BY sort_order
    `)
    const rows = rooms as Array<{ label: string; capacity: number; kind: string }>
    expect(rows.filter((r) => r.kind === "room_sgl")).toHaveLength(5)
    expect(rows.filter((r) => r.kind === "room_dbl")).toHaveLength(20)
  })

  it("skips templates with null default_count (manual seeding only)", async () => {
    await db.insert(productOptionResourceTemplates).values({
      productOptionId: optionId,
      kind: "room",
      capacity: 1,
      namePattern: "SGL {sequence}",
      defaultCount: null,
    })

    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      optionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 5,
      remainingPax: 5,
    })

    const result = await materializeSlotResourcesFromTemplateDefaults(db, slotId)
    expect(result.created).toBe(0)
  })

  it("atomically and idempotently materializes a vehicle with its seats", async () => {
    await db.insert(productOptionResourceTemplates).values({
      productOptionId: optionId,
      kind: "vehicle_seat",
      capacity: 2,
      namePattern: "Coach {sequence}",
      layout: "1-1",
    })

    const slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      optionId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 2,
      remainingPax: 0,
    })

    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: "MAT-VEHICLE-001",
      status: "confirmed",
      sellCurrency: "EUR",
      pax: 2,
    })
    await db.insert(bookingItems).values({
      id: bookingItemId,
      bookingId,
      title: "Coach seats",
      status: "confirmed",
      quantity: 2,
      sellCurrency: "EUR",
      productId,
      optionId,
      availabilitySlotId: slotId,
    })
    await db.insert(bookingAllocations).values({
      bookingId,
      bookingItemId,
      productId,
      optionId,
      availabilitySlotId: slotId,
      quantity: 2,
      status: "confirmed",
    })

    const outcomes = await Promise.allSettled([
      autoMaterializeAllocationResources(db, slotId, { kind: "vehicle_seat" }),
      autoMaterializeAllocationResources(db, slotId, { kind: "vehicle_seat" }),
    ])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)

    const rows = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.slotId, slotId))
    const vehicles = rows.filter((row) => row.kind === "vehicle")
    const seats = rows.filter((row) => row.kind === "vehicle_seat")
    expect(vehicles).toHaveLength(1)
    expect(seats).toHaveLength(2)
    expect(seats.every((seat) => seat.capacity === 1 && seat.parentId === vehicles[0]?.id)).toBe(
      true,
    )
  })

  it("auto-materializes during generateAvailabilitySlots", async () => {
    await db.insert(productOptionResourceTemplates).values({
      productOptionId: optionId,
      kind: "room",
      capacity: 2,
      namePattern: "DBL {sequence}",
      defaultCount: 3,
    })
    await db.insert(availabilityRules).values({
      id: newId("availability_rules"),
      productId,
      optionId,
      timezone: "UTC",
      recurrenceRule: "FREQ=DAILY;COUNT=1",
      maxCapacity: 6,
      active: true,
    })

    const result = await generateAvailabilitySlots(db, {
      horizonDays: 2,
      now: new Date("2026-06-01T00:00:00Z"),
    })
    expect(result.slotsCreated).toBeGreaterThan(0)
    expect(result.resourcesMaterialized).toBeGreaterThanOrEqual(3)
  })

  it("generates startsAt as a true UTC instant in the rule timezone", async () => {
    const ruleId = newId("availability_rules")
    await db.insert(availabilityRules).values({
      id: ruleId,
      productId,
      optionId,
      timezone: "Europe/Bucharest",
      recurrenceRule: "FREQ=DAILY;COUNT=1",
      maxCapacity: 6,
      active: true,
    })

    await generateAvailabilitySlots(db, {
      horizonDays: 2,
      defaultStartTime: "09:00",
      now: new Date("2026-09-26T00:00:00Z"),
      materializeResources: false,
    })

    const [slot] = await db
      .select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.availabilityRuleId, ruleId))
      .limit(1)

    expect(slot?.dateLocal).toBe("2026-09-26")
    expect(slot?.startsAt.toISOString()).toBe("2026-09-26T06:00:00.000Z")
  })
})
