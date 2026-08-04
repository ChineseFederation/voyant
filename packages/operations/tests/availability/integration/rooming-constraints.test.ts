/**
 * The rooming tracer end to end, against a real Postgres.
 *
 * Covers the five things #4036 added that only the database can prove:
 * default materialisation carrying the occupancy band, sharing groups,
 * preferences, constraint enforcement plus its override, and the conflicts
 * projection reading the committed plan back.
 *
 * `cleanupTestDb` TRUNCATEs the whole schema, so this file truncates ONCE in
 * `beforeAll` and every test gets its own departure id — see the same note in
 * `allocation-departure-resources.test.ts`.
 */

import { allocationResources, availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { productOptions, products } from "../../../../inventory/src/schema.js"
import {
  AllocationServiceError,
  assignTravelerAllocation,
  pairSharingGroup,
} from "../../../src/availability/service-allocation.js"
import { assignTravelerAllocationsBatch } from "../../../src/availability/service-allocation-assignment-batch.js"
import { autoAllocateSlotResources } from "../../../src/availability/service-allocation-auto-allocate.js"
import { getSlotAllocationConflicts } from "../../../src/availability/service-allocation-conflicts.js"
import { updateTravelerRoomingPreferences } from "../../../src/availability/service-allocation-traveler-preferences.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("rooming constraints (integration)", () => {
  let db: PostgresJsDatabase
  let productId: string
  let optionId: string
  let slotId: string

  beforeAll(async () => {
    db = createTestDb() as PostgresJsDatabase
    await cleanupTestDb(db)
    productId = newId("products")
    optionId = newId("product_options")
    await db.insert(products).values({
      id: productId,
      name: "Danube Delta Circuit",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(productOptions).values({
      id: optionId,
      productId,
      name: "Standard",
      status: "active",
      sortOrder: 0,
    })
  }, 180000)

  beforeEach(async () => {
    slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      optionId,
      dateLocal: "2026-09-01",
      startsAt: new Date("2026-09-01T06:00:00Z"),
      endsAt: new Date("2026-09-04T18:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 20,
      remainingPax: 20,
      nights: 3,
    })
  })

  async function addBooking(options: {
    number: string
    travelers: Array<{ firstName: string; category: string }>
  }) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax)
      VALUES (${bookingId}, ${options.number}, 'confirmed', 'EUR', ${options.travelers.length})
    `)
    await db.execute(sql`
      INSERT INTO booking_items
        (id, booking_id, title, status, quantity, sell_currency, product_id, option_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Room', 'confirmed', ${options.travelers.length},
              'EUR', ${productId}, ${optionId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations
        (id, booking_id, booking_item_id, product_id, option_id, availability_slot_id,
         quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId},
              ${optionId}, ${slotId}, ${options.travelers.length}, 'unit', 'confirmed')
    `)
    const travelerIds: string[] = []
    for (const [index, entry] of options.travelers.entries()) {
      const travelerId = newId("booking_travelers")
      travelerIds.push(travelerId)
      await db.execute(sql`
        INSERT INTO booking_travelers
          (id, booking_id, participant_type, traveler_category, first_name, last_name, is_primary)
        VALUES (${travelerId}, ${bookingId}, 'traveler', ${entry.category},
                ${entry.firstName}, ${options.number}, ${index === 0})
      `)
    }
    return { bookingId, travelerIds }
  }

  async function addRoom(overrides: Partial<typeof allocationResources.$inferInsert> = {}) {
    const [row] = await db
      .insert(allocationResources)
      .values({
        slotId,
        kind: "room",
        label: "Room",
        capacity: 2,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error("room insert failed")
    return row
  }

  it("materializes a room position that carries its whole occupancy band", async () => {
    const room = await addRoom({
      capacity: 3,
      occupancyMin: 2,
      roomTypeId: "hrmt_triple",
      bedConfiguration: "1 double + 1 single",
      accessible: true,
      minAge: 0,
      maxAge: 99,
    })

    const [stored] = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.id, room.id))

    expect(stored?.occupancyMin).toBe(2)
    expect(stored?.roomTypeId).toBe("hrmt_triple")
    expect(stored?.bedConfiguration).toBe("1 double + 1 single")
    expect(stored?.accessible).toBe(true)
  })

  it("rejects a position whose minimum occupancy exceeds its capacity", async () => {
    // The database is the backstop, not the zod schema: a nonsense occupancy
    // band must fail even for a writer that bypasses the route.
    // Drizzle wraps the driver error, so the constraint name is on the cause.
    let caught: unknown
    try {
      await addRoom({ capacity: 2, occupancyMin: 3 })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    const cause = (caught as { cause?: { constraint_name?: string } }).cause
    expect(cause?.constraint_name).toBe("ck_allocation_resources_occupancy_band")
  })

  it("blocks a room-type mismatch and records the override that waives it", async () => {
    const room = await addRoom({ roomTypeId: "hrmt_double" })
    const { travelerIds } = await addBooking({
      number: `B-${slotId.slice(-6)}-1`,
      travelers: [{ firstName: "Ana", category: "adult" }],
    })
    const travelerId = travelerIds[0] as string

    await updateTravelerRoomingPreferences(db, slotId, travelerId, { roomTypeId: "hrmt_twin" })

    await expect(
      assignTravelerAllocation(db, slotId, travelerId, { kind: "room", resourceId: room.id }),
    ).rejects.toMatchObject({ status: 409 })

    const result = await assignTravelerAllocation(
      db,
      slotId,
      travelerId,
      {
        kind: "room",
        resourceId: room.id,
        override: { reason: "Hotel moved the party at check-in" },
      },
      { actorId: "usr_ops" },
    )
    expect(result.violations.map((entry) => entry.code)).toContain("room_type_mismatch")

    const audit = await db.execute<{ action: string; after: Record<string, unknown> }>(sql`
      SELECT action, after FROM allocation_audit_log
      WHERE slot_id = ${slotId} AND action = 'traveler.assign'
      ORDER BY created_at DESC LIMIT 1
    `)
    const entry = [...audit][0]
    expect(entry?.after?.override).toMatchObject({
      reason: "Hotel moved the party at check-in",
      overrode: ["room_type_mismatch"],
    })
  })

  it("blocks an unaccompanied minor and the assignment does not land", async () => {
    const room = await addRoom()
    const { travelerIds } = await addBooking({
      number: `B-${slotId.slice(-6)}-2`,
      travelers: [{ firstName: "Radu", category: "child" }],
    })
    const childId = travelerIds[0] as string

    await expect(
      assignTravelerAllocation(db, slotId, childId, { kind: "room", resourceId: room.id }),
    ).rejects.toBeInstanceOf(AllocationServiceError)

    const rows = await db.execute<{ resource_id: string | null }>(sql`
      SELECT allocations ->> 'room' AS resource_id
      FROM booking_traveler_travel_details WHERE traveler_id = ${childId}
    `)
    expect([...rows][0]?.resource_id ?? null).toBeNull()
  })

  it("lets a child share with an adult from the same sharing group", async () => {
    const room = await addRoom({ capacity: 3 })
    const parent = await addBooking({
      number: `B-${slotId.slice(-6)}-3a`,
      travelers: [{ firstName: "Ioana", category: "adult" }],
    })
    const child = await addBooking({
      number: `B-${slotId.slice(-6)}-3b`,
      travelers: [{ firstName: "Matei", category: "child" }],
    })
    await pairSharingGroup(db, slotId, {
      travelerIds: [parent.travelerIds[0] as string, child.travelerIds[0] as string],
    })

    await assignTravelerAllocation(db, slotId, parent.travelerIds[0] as string, {
      kind: "room",
      resourceId: room.id,
    })
    await expect(
      assignTravelerAllocation(db, slotId, child.travelerIds[0] as string, {
        kind: "room",
        resourceId: room.id,
      }),
    ).resolves.toMatchObject({ resourceId: room.id })
  })

  it("reports an under-occupied room and an unmet bed preference in the conflicts projection", async () => {
    const room = await addRoom({ capacity: 2, occupancyMin: 2, bedConfiguration: "1 king" })
    const { travelerIds } = await addBooking({
      number: `B-${slotId.slice(-6)}-4`,
      travelers: [{ firstName: "Dana", category: "adult" }],
    })
    const travelerId = travelerIds[0] as string
    await updateTravelerRoomingPreferences(db, slotId, travelerId, { bedPreference: "twin" })
    await assignTravelerAllocation(db, slotId, travelerId, { kind: "room", resourceId: room.id })

    const conflicts = await getSlotAllocationConflicts(db, slotId, { kind: "room" })
    const codes = (conflicts ?? []).map((conflict) => conflict.code)
    expect(codes).toContain("under_occupied_resource")
    expect(codes).toContain("bed_preference_unmet")
  })

  it("lets a batch place a parent and a child together that a per-traveler move could not", async () => {
    // The single-traveler leg would see the child arrive alone and raise
    // `unaccompanied_minor`. The batch evaluates the *resulting* room, which is
    // the whole reason the atomic leg exists.
    const room = await addRoom({ capacity: 2 })
    const family = await addBooking({
      number: `B-${slotId.slice(-6)}-6`,
      travelers: [
        { firstName: "Ioana", category: "adult" },
        { firstName: "Matei", category: "child" },
      ],
    })

    const result = await assignTravelerAllocationsBatch(db, slotId, {
      kind: "room",
      assignments: family.travelerIds.map((travelerId) => ({
        travelerId,
        resourceId: room.id,
      })),
    })

    expect(result.assigned).toBe(2)
    expect(result.violations.filter((entry) => entry.severity === "blocking")).toEqual([])
  })

  it("does not let a batch route around the room rules", async () => {
    const room = await addRoom({ capacity: 2 })
    const child = await addBooking({
      number: `B-${slotId.slice(-6)}-7`,
      travelers: [{ firstName: "Radu", category: "child" }],
    })

    await expect(
      assignTravelerAllocationsBatch(db, slotId, {
        kind: "room",
        assignments: [{ travelerId: child.travelerIds[0] as string, resourceId: room.id }],
      }),
    ).rejects.toMatchObject({ status: 409 })

    // The override lets it through, and the reason lands on the record.
    const result = await assignTravelerAllocationsBatch(
      db,
      slotId,
      {
        kind: "room",
        assignments: [{ travelerId: child.travelerIds[0] as string, resourceId: room.id }],
        override: { reason: "Travelling with the guide, parent in the next room" },
      },
      { actorId: "usr_ops" },
    )
    expect(result.violations.map((entry) => entry.code)).toContain("unaccompanied_minor")

    const audit = await db.execute<{ after: Record<string, unknown> }>(sql`
      SELECT after FROM allocation_audit_log
      WHERE slot_id = ${slotId} AND action = 'traveler.assign.batch'
      ORDER BY created_at DESC LIMIT 1
    `)
    expect([...audit][0]?.after?.override).toMatchObject({
      reason: "Travelling with the guide, parent in the next room",
      overrode: ["unaccompanied_minor"],
    })
  })

  it("names the group behind a skipped count instead of returning a bare integer", async () => {
    await addRoom({ capacity: 2 })
    const party = await addBooking({
      number: `B-${slotId.slice(-6)}-5`,
      travelers: [
        { firstName: "A", category: "adult" },
        { firstName: "B", category: "adult" },
        { firstName: "C", category: "adult" },
      ],
    })

    const result = await autoAllocateSlotResources(db, slotId, { kind: "room" })

    expect(result.skipped).toBe(3)
    expect(result.unplaced?.[0]).toMatchObject({
      reason: "no_capacity",
      travelerIds: party.travelerIds,
      largestFreeCapacity: 2,
    })
  })
})
