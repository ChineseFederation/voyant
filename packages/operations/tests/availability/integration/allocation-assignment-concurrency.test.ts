/**
 * Batch assignment under concurrency.
 *
 * The per-traveler leg was already serialized by a `FOR UPDATE` on the target
 * resource, but a *batch* has to hold the whole kind: two batches that each fit
 * on their own can oversell a room between them, and a batch that races an
 * auto-allocate can do the same. Both take the same
 * `SELECT ... WHERE kind = ... FOR UPDATE` statement, so the decision — not
 * just the write — is serialized.
 */

import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { allocationResources, availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { products } from "../../../../inventory/src/schema.js"
import { assignTravelerAllocationsBatch } from "../../../src/availability/service-allocation-assignment-batch.js"
import { autoAllocateSlotResources } from "../../../src/availability/service-allocation-automation.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

function connect(maxConnections: number): ClosableTestDb {
  return createDbClient(process.env.TEST_DATABASE_URL as string, {
    adapter: "node",
    nodeMaxConnections: maxConnections,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as ClosableTestDb
}

describe.skipIf(!DB_AVAILABLE)("batch assignment concurrency (integration)", () => {
  let db: ClosableTestDb
  let productId: string
  let slotId: string

  beforeAll(async () => {
    db = connect(6)
    await cleanupTestDb(db)
    productId = newId("products")
    await db.insert(products).values({
      id: productId,
      name: "Transylvania Coach Tour",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
  }, 120000)

  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  beforeEach(async () => {
    slotId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-06-01",
      startsAt: new Date("2026-06-01T08:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 20,
      remainingPax: 20,
    })
  })

  async function seedRoom(label: string, capacity: number, sortOrder: number) {
    const id = newId("allocation_resources")
    await db.insert(allocationResources).values({
      id,
      slotId,
      kind: "room",
      label,
      capacity,
      sortOrder,
      flags: {},
    })
    return id
  }

  async function seedBooking(bookingNumber: string, travelerIds: string[]) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax)
      VALUES (${bookingId}, ${bookingNumber}, 'confirmed', 'EUR', ${travelerIds.length})
    `)
    await db.execute(sql`
      INSERT INTO booking_items
        (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Coach seat', 'confirmed', ${travelerIds.length},
              'EUR', ${productId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations
        (id, booking_id, booking_item_id, product_id, availability_slot_id, quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId},
              ${slotId}, ${travelerIds.length}, 'unit', 'confirmed')
    `)
    for (const travelerId of travelerIds) {
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (${travelerId}, ${bookingId}, 'traveler', 'Test', ${travelerId.slice(-4)})
      `)
    }
    return bookingId
  }

  async function roomOccupancy(roomId: string) {
    const rows = await db.execute<{ assigned: number }>(sql`
      SELECT COUNT(DISTINCT btd.traveler_id)::int AS assigned
      FROM booking_traveler_travel_details btd
      JOIN booking_travelers bt ON bt.id = btd.traveler_id
      JOIN booking_allocations ba ON ba.booking_id = bt.booking_id
      WHERE btd.allocations ->> 'room' = ${roomId}
        AND ba.availability_slot_id = ${slotId}
    `)
    return [...rows][0]?.assigned ?? 0
  }

  it("lets only one of two competing batches fill the last bed", async () => {
    const room = await seedRoom("DBL 1", 2, 1)
    const pairA = [newId("booking_travelers"), newId("booking_travelers")]
    const pairB = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("BATCH-CONC-A", pairA)
    await seedBooking("BATCH-CONC-B", pairB)

    const batch = (travelerIds: string[]) =>
      assignTravelerAllocationsBatch(db, slotId, {
        kind: "room",
        assignments: travelerIds.map((travelerId) => ({ travelerId, resourceId: room })),
      })

    const outcomes = await Promise.allSettled([batch(pairA), batch(pairB)])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)
    expect(await roomOccupancy(room)).toBe(2)
  })

  it("never oversells when a batch races an auto-allocate", async () => {
    const roomA = await seedRoom("DBL 1", 2, 1)
    const roomB = await seedRoom("DBL 2", 2, 2)
    const pairA = [newId("booking_travelers"), newId("booking_travelers")]
    const pairB = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("BATCH-RACE-A", pairA)
    await seedBooking("BATCH-RACE-B", pairB)

    await Promise.allSettled([
      assignTravelerAllocationsBatch(db, slotId, {
        kind: "room",
        assignments: pairA.map((travelerId) => ({ travelerId, resourceId: roomA })),
      }),
      autoAllocateSlotResources(db, slotId, { kind: "room" }),
    ])

    for (const room of [roomA, roomB]) {
      expect.soft(await roomOccupancy(room)).toBeLessThanOrEqual(2)
    }
  })

  it("rolls the whole batch back when one traveler does not fit", async () => {
    const single = await seedRoom("SGL", 1, 1)
    const pair = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking("BATCH-ATOMIC", pair)

    await expect(
      assignTravelerAllocationsBatch(db, slotId, {
        kind: "room",
        assignments: pair.map((travelerId) => ({ travelerId, resourceId: single })),
      }),
    ).rejects.toMatchObject({ status: 409 })

    expect(await roomOccupancy(single)).toBe(0)
  })

  it("frees and refills a bed in the same batch", async () => {
    const room = await seedRoom("DBL 1", 2, 1)
    const seated = [newId("booking_travelers"), newId("booking_travelers")]
    const waiting = [newId("booking_travelers")]
    await seedBooking("BATCH-SWAP-A", seated)
    await seedBooking("BATCH-SWAP-B", waiting)

    await assignTravelerAllocationsBatch(db, slotId, {
      kind: "room",
      assignments: seated.map((travelerId) => ({ travelerId, resourceId: room })),
    })
    expect(await roomOccupancy(room)).toBe(2)

    // Full room; the swap only fits because the capacity check runs after both
    // writes land inside the one transaction.
    const result = await assignTravelerAllocationsBatch(db, slotId, {
      kind: "room",
      assignments: [
        { travelerId: seated[0] as string, resourceId: null },
        { travelerId: waiting[0] as string, resourceId: room },
      ],
    })
    expect(result.assigned).toBe(1)
    expect(result.unassigned).toBe(1)
    expect(await roomOccupancy(room)).toBe(2)
  })
})
