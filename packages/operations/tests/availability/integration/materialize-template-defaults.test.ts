import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import {
  allocationResources,
  availabilityRules,
  availabilitySlots,
  productOptionResourceTemplates,
} from "@voyant-travel/operations/schema"
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
  let db: ReturnType<typeof createTestDb>
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
    const rows = await db.execute<{ label: string; capacity: number; kind: string }>(sql`
      SELECT label, capacity, kind FROM allocation_resources WHERE slot_id = ${slotId} ORDER BY sort_order
    `)
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

    // Idempotency parity (#4034): the pax-derived path used to 409 on the
    // second call while the template-default path silently skipped. Both now
    // skip, so a retried request is a visible no-op instead of an error the
    // operator has to interpret.
    const outcomes = await Promise.all([
      autoMaterializeAllocationResources(db, slotId, { kind: "vehicle_seat" }),
      autoMaterializeAllocationResources(db, slotId, { kind: "vehicle_seat" }),
    ])
    expect(outcomes.filter((outcome) => (outcome.created ?? 0) > 0)).toHaveLength(1)
    expect(outcomes.filter((outcome) => (outcome.skippedExisting ?? 0) > 0)).toHaveLength(1)

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

  // #4034: a coach could not be laid out before the first sale. The only path
  // that created seats derived its vehicle count from booked pax, so an empty
  // departure produced nothing and the operator had to hand-create every seat.
  it("lays a coach out from its template default before any booking exists", async () => {
    await db.insert(productOptionResourceTemplates).values({
      productOptionId: optionId,
      kind: "vehicle_seat",
      capacity: 6,
      namePattern: "Coach {sequence}",
      layout: "2-1",
      defaultCount: 2,
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
      initialPax: 12,
      remainingPax: 12,
    })

    const result = await materializeSlotResourcesFromTemplateDefaults(db, slotId)
    // default_count counts vehicles; the seat count comes from the layout.
    expect(result.created).toBe(2 + 12)

    const rows = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.slotId, slotId))
    const vehicles = rows.filter((row) => row.kind === "vehicle")
    const seats = rows.filter((row) => row.kind === "vehicle_seat")
    expect(vehicles).toHaveLength(2)
    expect(seats).toHaveLength(12)
    expect(seats.every((seat) => seat.capacity === 1)).toBe(true)
    expect(new Set(seats.map((seat) => seat.parentId))).toEqual(
      new Set(vehicles.map((vehicle) => vehicle.id)),
    )

    // ...and re-running is a no-op, not a duplicate coach.
    const again = await materializeSlotResourcesFromTemplateDefaults(db, slotId)
    expect(again.created).toBe(0)
    expect(again.skippedExisting).toBe(1)
  })

  it("draws a seat map from a template layoutSpec", async () => {
    await db.insert(productOptionResourceTemplates).values({
      productOptionId: optionId,
      kind: "vehicle_seat",
      capacity: 3,
      namePattern: "Minibus {sequence}",
      defaultCount: 1,
      flags: {
        layoutSpec: {
          rows: [{ cells: ["seat", "aisle", "seat"] }, { cells: ["void", "aisle", "seat"] }],
        },
      },
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
      initialPax: 3,
      remainingPax: 3,
    })

    const result = await materializeSlotResourcesFromTemplateDefaults(db, slotId)
    expect(result.created).toBe(1 + 3)

    const rows = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.slotId, slotId))
    const vehicle = rows.find((row) => row.kind === "vehicle")
    expect(vehicle?.capacity).toBe(3)
    expect(rows.filter((row) => row.kind === "vehicle_seat")).toHaveLength(3)
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
