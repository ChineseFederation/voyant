import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { allocationResources, availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { optionUnits, productOptions, products } from "../../../../inventory/src/schema.js"
import {
  getSlotAllocationManifest,
  getSlotResourceAvailability,
  validateSlotAllocationCapacity,
} from "../../../src/availability/service-allocation.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

describe.skipIf(!DB_AVAILABLE)("slot resource availability (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle test client -- owner: availability; existing suppression is intentional pending typed cleanup.
  let db: any
  let productId: string
  let slotId: string

  beforeAll(() => {
    db = createTestDb()
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    slotId = newId("availability_slots")
    await db.insert(products).values({
      id: productId,
      name: "Bali Wellness Retreat",
      sellCurrency: "USD",
      bookingMode: "date",
    })
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 49,
      remainingPax: 49,
    })
  })

  async function seedResource(input: {
    kind: string
    capacity: number
    label: string
    sortOrder?: number
  }) {
    const id = newId("allocation_resources")
    await db.insert(allocationResources).values({
      id,
      slotId,
      kind: input.kind,
      label: input.label,
      capacity: input.capacity,
      sortOrder: input.sortOrder ?? 0,
      flags: {},
    })
    return id
  }

  async function seedBookingWithTraveler(input: {
    travelerId: string
    status?: "confirmed" | "in_progress" | "completed" | "cancelled"
    allocations?: Record<string, string>
  }) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency)
      VALUES (${bookingId}, ${`B${bookingId.slice(-6)}`}, ${input.status ?? "confirmed"}, 'USD')
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Slot seat', 'confirmed', 1, 'USD', ${productId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations (id, booking_id, booking_item_id, product_id, availability_slot_id, quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId}, ${slotId}, 1, 'unit', 'confirmed')
    `)
    await db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
      VALUES (${input.travelerId}, ${bookingId}, 'traveler', 'Test', 'Traveler')
    `)
    if (input.allocations) {
      await db.execute(sql`
        INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
        VALUES (${input.travelerId}, ${JSON.stringify(input.allocations)}::jsonb)
      `)
    }
    return bookingId
  }

  it("reports capacity / assigned / available per resource", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 2, label: "DBL 1", sortOrder: 1 })
    const sglId = await seedResource({ kind: "room", capacity: 1, label: "SGL 1", sortOrder: 2 })

    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })

    const manifest = await getSlotResourceAvailability(db, slotId)
    expect(manifest).toHaveLength(2)
    const dbl = manifest.find((r) => r.id === dblId)
    const sgl = manifest.find((r) => r.id === sglId)
    expect(dbl?.assigned).toBe(1)
    expect(dbl?.available).toBe(1)
    expect(sgl?.assigned).toBe(0)
    expect(sgl?.available).toBe(1)
  })

  // The v1 commitment lifecycle (#4100) contracted `booking_status` to
  // confirmed/in_progress/completed/cancelled — pre-commitment holds are
  // booking sessions now, so `in_progress` is the mid-trip live booking.
  it("treats in_progress bookings as active slot demand", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 1, label: "DBL 1", sortOrder: 1 })
    const travelerId = newId("booking_travelers")
    await seedBookingWithTraveler({
      travelerId,
      status: "in_progress",
      allocations: { room: dblId },
    })

    const resources = await getSlotResourceAvailability(db, slotId)
    expect(resources.find((row) => row.id === dblId)?.assigned).toBe(1)

    const manifest = await getSlotAllocationManifest(db, slotId)
    expect(manifest?.summary.bookingsByStatus.in_progress).toBe(1)
    expect(manifest?.summary.travelerCount).toBe(1)
    expect(manifest?.bookings[0]?.travelers[0]?.id).toBe(travelerId)

    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId: newId("booking_travelers"), kind: "room", resourceId: dblId },
    ])
    expect(violations[0]?.existingAssigned).toBe(1)
  })

  it("excludes cancelled bookings from slot allocation demand", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 1, label: "DBL 1", sortOrder: 1 })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      status: "cancelled",
      allocations: { room: dblId },
    })

    const resources = await getSlotResourceAvailability(db, slotId)
    expect(resources.find((row) => row.id === dblId)?.assigned).toBe(0)

    const manifest = await getSlotAllocationManifest(db, slotId)
    expect(manifest?.summary.bookingsByStatus.cancelled).toBeUndefined()
    expect(manifest?.summary.travelerCount).toBe(0)
    expect(manifest?.bookings).toHaveLength(0)

    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId: newId("booking_travelers"), kind: "room", resourceId: dblId },
    ])
    expect(violations).toEqual([])
  })

  it("returns a violation when planned travelers exceed resource capacity", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 2, label: "DBL 1" })
    // Two existing travelers in DBL — at capacity.
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })

    const plannedTravelerId = newId("booking_travelers")
    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId: plannedTravelerId, kind: "room", resourceId: dblId },
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.resourceId).toBe(dblId)
    expect(violations[0]?.capacity).toBe(2)
    expect(violations[0]?.existingAssigned).toBe(2)
  })

  it("treats re-saving the same traveler as idempotent", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 2, label: "DBL 1" })
    const travelerId = newId("booking_travelers")
    await seedBookingWithTraveler({
      travelerId,
      allocations: { room: dblId },
    })

    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId, kind: "room", resourceId: dblId },
    ])
    expect(violations).toEqual([])
  })

  it("flags a resource-kind mismatch as a violation", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 2, label: "DBL 1" })
    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId: newId("booking_travelers"), kind: "vehicle_seat", resourceId: dblId },
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]?.kind).toBe("vehicle_seat")
  })

  // Regression for #952 — when a slot had 2+ bookings, the manifest
  // query crashed with `cannot cast type record to text[]` because
  // drizzle's `sql` template spreads JS arrays into a tuple, not a
  // text[] literal. The `sqlTextArray` helper emits `ARRAY[$1, $2,
  // …]::text[]` instead. Single-booking slots happened to work
  // because `(($1)::text[])` evaluates as the lone value.
  it("loads the manifest for a slot with multiple bookings without a record-cast crash", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 4, label: "DBL 1" })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
    })

    const manifest = await getSlotAllocationManifest(db, slotId)
    expect(manifest).not.toBeNull()
    expect(manifest?.bookings).toHaveLength(3)
    expect(manifest?.summary.travelerCount).toBe(3)
  })

  it("uses the newest active booking allocation row for unit preferences", async () => {
    const optionId = newId("product_options")
    const dblUnitId = newId("option_units")
    const twnUnitId = newId("option_units")
    await db.insert(productOptions).values({
      id: optionId,
      productId,
      name: "Standard",
    })
    await db.insert(optionUnits).values([
      {
        id: dblUnitId,
        optionId,
        name: "DBL room",
        code: "dbl_room",
        unitType: "person",
        sortOrder: 0,
      },
      {
        id: twnUnitId,
        optionId,
        name: "TWN room",
        code: "twn_room",
        unitType: "person",
        sortOrder: 1,
      },
    ])

    const bookingId = newId("bookings")
    const travelerId = newId("booking_travelers")
    const oldItemId = newId("booking_items")
    const newItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency)
      VALUES (${bookingId}, 'BK-UNIT-EDIT', 'confirmed', 'USD')
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, sell_currency, quantity, option_id, option_unit_id)
      VALUES
        (${oldItemId}, ${bookingId}, 'Old DBL', 'confirmed', 'USD', 2, ${optionId}, ${dblUnitId}),
        (${newItemId}, ${bookingId}, 'New TWN', 'confirmed', 'USD', 2, ${optionId}, ${twnUnitId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations
        (id, booking_id, booking_item_id, product_id, option_id, option_unit_id, availability_slot_id, quantity, allocation_type, status, created_at, updated_at)
      VALUES
        (${newId("booking_allocations")}, ${bookingId}, ${oldItemId}, ${productId}, ${optionId}, ${dblUnitId}, ${slotId}, 2, 'unit', 'confirmed', ${"2026-01-01T00:00:00Z"}::timestamptz, ${"2026-01-01T00:00:00Z"}::timestamptz),
        (${newId("booking_allocations")}, ${bookingId}, ${newItemId}, ${productId}, ${optionId}, ${twnUnitId}, ${slotId}, 2, 'unit', 'confirmed', ${"2026-01-02T00:00:00Z"}::timestamptz, ${"2026-01-02T00:00:00Z"}::timestamptz)
    `)
    await db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
      VALUES (${travelerId}, ${bookingId}, 'traveler', 'Edited', 'Traveler')
    `)

    const manifest = await getSlotAllocationManifest(db, slotId)
    const traveler = manifest?.bookings[0]?.travelers[0]
    expect(traveler?.optionUnitId).toBe(twnUnitId)
    expect(traveler?.optionUnitCode).toBe("twn_room")
  })

  it("validates allocations across multiple resources without a record-cast crash", async () => {
    const dblId = await seedResource({ kind: "room", capacity: 2, label: "DBL 1" })
    const twnId = await seedResource({ kind: "room", capacity: 2, label: "TWN 1" })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: dblId },
    })
    await seedBookingWithTraveler({
      travelerId: newId("booking_travelers"),
      allocations: { room: twnId },
    })

    const violations = await validateSlotAllocationCapacity(db, slotId, [
      { travelerId: newId("booking_travelers"), kind: "room", resourceId: dblId },
      { travelerId: newId("booking_travelers"), kind: "room", resourceId: twnId },
    ])
    expect(violations).toEqual([])
  })
})
