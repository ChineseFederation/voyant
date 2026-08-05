import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { allocationResources, availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import { assignTravelerAllocation } from "../../../src/availability/service-allocation.js"
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

describe.skipIf(!DB_AVAILABLE)("auto-allocate concurrency (integration)", () => {
  let db: ClosableTestDb
  // Auto-allocate runs on its own single-connection client so the test can
  // resolve its backend pid up front and wait for *that* backend to block
  // on the resource lock, rather than guessing from global lock activity.
  let autoDb: ClosableTestDb
  let autoPid: number
  let productId: string
  let slotId: string

  beforeAll(async () => {
    db = connect(4)
    autoDb = connect(1)
    const [row] = await autoDb.execute<{ pid: number }>(sql`SELECT pg_backend_pid()::int AS pid`)
    if (!row) throw new Error("failed to resolve the auto-allocate backend pid")
    autoPid = row.pid
  })

  afterAll(async () => {
    await autoDb.$client.end({ timeout: 0 })
    await db.$client.end({ timeout: 0 })
  })

  beforeEach(async () => {
    await cleanupTestDb(db)
    productId = newId("products")
    slotId = newId("availability_slots")
    await db.insert(products).values({
      id: productId,
      name: "Transylvania Coach Tour",
      sellCurrency: "EUR",
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

  async function seedBooking(input: {
    bookingNumber: string
    travelerIds: string[]
    allocations?: Record<string, Record<string, string>>
  }) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax)
      VALUES (${bookingId}, ${input.bookingNumber}, 'confirmed', 'EUR', ${input.travelerIds.length})
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Coach seat', 'confirmed', ${input.travelerIds.length}, 'EUR', ${productId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations (id, booking_id, booking_item_id, product_id, availability_slot_id, quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId}, ${slotId}, ${input.travelerIds.length}, 'unit', 'confirmed')
    `)
    for (const travelerId of input.travelerIds) {
      await db.execute(sql`
        INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
        VALUES (${travelerId}, ${bookingId}, 'traveler', 'Test', ${input.bookingNumber})
      `)
      const allocations = input.allocations?.[travelerId]
      if (allocations) {
        await db.execute(sql`
          INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
          VALUES (${travelerId}, ${JSON.stringify(allocations)}::jsonb)
        `)
      }
    }
    return bookingId
  }

  async function roomOccupancy() {
    return db.execute<{ id: string; label: string | null; capacity: number; assigned: number }>(sql`
      SELECT ar.id, ar.label, ar.capacity, COUNT(btd.traveler_id)::int AS assigned
      FROM allocation_resources ar
      LEFT JOIN booking_traveler_travel_details btd
        ON btd.allocations ->> 'room' = ar.id
      WHERE ar.slot_id = ${slotId} AND ar.kind = 'room'
      GROUP BY ar.id, ar.label, ar.capacity
      ORDER BY ar.sort_order
    `)
  }

  // Regression for #4126. Auto-allocate used to compute its whole plan from
  // a manifest read *outside* the write transaction, so an assignment that
  // landed while it waited for the resource lock was invisible to the plan
  // it then applied verbatim — pushing a room past its capacity with no
  // conflict raised. The gate transaction below reproduces exactly that
  // interleaving: it holds the lock auto-allocate needs, waits until the
  // auto-allocate backend is blocked on it, and only then moves a traveler
  // into the room auto-allocate is about to fill.
  it("re-plans against state that landed while it waited for the resource lock", async () => {
    const roomA = await seedRoom("DBL 1", 2, 1)
    const roomB = await seedRoom("DBL 2", 2, 2)

    const movedTravelerId = newId("booking_travelers")
    await seedBooking({
      bookingNumber: "ALLOC-CONC-SOLO",
      travelerIds: [movedTravelerId],
      allocations: { [movedTravelerId]: { room: roomB } },
    })
    const pairTravelerIds = [newId("booking_travelers"), newId("booking_travelers")]
    await seedBooking({ bookingNumber: "ALLOC-CONC-PAIR", travelerIds: pairTravelerIds })

    // With only roomA free for a pair, a plan computed before the move
    // targets roomA for both travellers of the pair booking.
    let lockHeld!: () => void
    const lockIsHeld = new Promise<void>((resolve) => {
      lockHeld = resolve
    })
    let allowMove!: () => void
    const moveAllowed = new Promise<void>((resolve) => {
      allowMove = resolve
    })

    const gate = db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id FROM allocation_resources
        WHERE slot_id = ${slotId} AND kind = 'room'
        FOR UPDATE
      `)
      lockHeld()
      await moveAllowed
      await assignTravelerAllocation(tx as PostgresJsDatabase, slotId, movedTravelerId, {
        kind: "room",
        resourceId: roomA,
      })
    })

    await lockIsHeld
    const autoAllocate = autoAllocateSlotResources(autoDb, slotId, { kind: "room" })
    try {
      await waitForLockWait(db, autoPid)
    } finally {
      allowMove()
    }
    await gate
    const result = await autoAllocate

    const rooms = await roomOccupancy()
    for (const room of rooms) {
      expect
        .soft(room.assigned, `${room.label} holds ${room.assigned} of ${room.capacity}`)
        .toBeLessThanOrEqual(room.capacity)
    }
    // The pair still fits — in roomB, which the manual move vacated.
    expect(result.assigned).toBe(2)
    expect(rooms.find((room) => room.id === roomA)?.assigned).toBe(1)
    expect(rooms.find((room) => room.id === roomB)?.assigned).toBe(2)
  })
})

async function waitForLockWait(db: PostgresJsDatabase, pid: number) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const [row] = await db.execute<{ waiting: boolean }>(sql`
      SELECT (wait_event_type = 'Lock') AS waiting
      FROM pg_stat_activity
      WHERE pid = ${pid}
    `)
    if (row?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("auto-allocate did not wait on the allocation resource lock")
}
