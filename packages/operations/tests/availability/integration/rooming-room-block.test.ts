/**
 * Binding a contracted accommodation block to a departure's room inventory.
 *
 * The point of this file is the *ledger*: it is easy to create twenty rooms on
 * a departure, and the whole risk is doing that without taking them off the
 * supplier's nightly hold. Every assertion below is about the two tables
 * staying in step.
 *
 * `cleanupTestDb` TRUNCATEs the whole schema, so this file truncates ONCE and
 * each test uses its own departure and block ids. It is deliberately a separate
 * file from `rooming-constraints.test.ts` and must be run in its own vitest
 * invocation.
 */

import { allocationResources, availabilitySlots } from "@voyant-travel/availability/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb, createTestDb } from "@voyant-travel/db/test-utils"
import { and, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { products } from "../../../../inventory/src/schema.js"
import {
  materializeDepartureRoomsFromBlock,
  releaseDepartureRoomBlock,
} from "../../../src/availability/service-allocation-room-block.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("departure room-block materialisation (integration)", () => {
  let db: PostgresJsDatabase
  let productId: string
  let propertyId: string
  let slotId: string
  let roomTypeId: string
  let blockId: string

  /** Free rooms on the tightest night of the block's window. */
  async function remaining(id: string): Promise<number> {
    const rows = await db.execute<{ free: number }>(sql`
      SELECT MIN(rooms_held - rooms_picked_up - rooms_released)::int AS free
      FROM room_block_nights WHERE block_id = ${id}
    `)
    return [...rows][0]?.free ?? 0
  }

  beforeAll(async () => {
    db = createTestDb() as PostgresJsDatabase
    await cleanupTestDb(db)
    productId = newId("products")
    propertyId = newId("properties")
    await db.insert(products).values({
      id: productId,
      name: "Maramures Circuit",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
  }, 180000)

  beforeEach(async () => {
    slotId = newId("availability_slots")
    roomTypeId = newId("room_types")
    blockId = newId("room_blocks")

    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-07-10",
      startsAt: new Date("2026-07-10T07:00:00Z"),
      endsAt: new Date("2026-07-12T16:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      initialPax: 40,
      remainingPax: 40,
      nights: 2,
    })

    await db.execute(sql`
      INSERT INTO room_types (id, property_id, name, standard_occupancy, max_occupancy, min_occupancy)
      VALUES (${roomTypeId}, ${propertyId}, 'Superior Double', 2, 3, 2)
    `)
    await db.execute(sql`
      INSERT INTO room_type_bed_configs (id, room_type_id, bed_type, quantity, is_primary)
      VALUES (${newId("room_type_bed_configs")}, ${roomTypeId}, 'double', 1, true)
    `)
    await db.execute(sql`
      INSERT INTO room_blocks (id, property_id, room_type_id, name, status, currency)
      VALUES (${blockId}, ${propertyId}, ${roomTypeId}, 'Circuit July block', 'confirmed', 'EUR')
    `)
    for (const [date, held] of [
      ["2026-07-10", 10],
      ["2026-07-11", 8],
    ] as const) {
      await db.execute(sql`
        INSERT INTO room_block_nights (id, block_id, date, rooms_held)
        VALUES (${newId("room_block_nights")}, ${blockId}, ${date}::date, ${held})
      `)
    }
  })

  it("creates room positions and takes the matching nightly pickup in one step", async () => {
    const result = await materializeDepartureRoomsFromBlock(
      db,
      slotId,
      { blockId, rooms: 5, namePattern: "Room {sequence}", kind: "room" },
      { actorId: "usr_ops" },
    )

    expect(result.created).toBe(5)
    expect(result.roomsPickedUp).toBe(5)
    expect(result.remainingAfter).toBe(3)

    const rooms = await db
      .select()
      .from(allocationResources)
      .where(and(eq(allocationResources.slotId, slotId), eq(allocationResources.kind, "room")))
    expect(rooms).toHaveLength(5)
    // The position carries the room type's whole occupancy band, so it is
    // checkable rather than merely sortable.
    expect(rooms[0]?.capacity).toBe(3)
    expect(rooms[0]?.occupancyMin).toBe(2)
    expect(rooms[0]?.roomTypeId).toBe(roomTypeId)
    expect(rooms[0]?.bedConfiguration).toBe("1 double")
    expect(rooms[0]?.refType).toBe("room_block")
    expect(rooms[0]?.refId).toBe(blockId)
    expect(rooms[0]?.flags.roomBlockPickupId).toBe(result.pickupId)

    // Both nights were decremented, not just the first.
    const nights = await db.execute<{ date: string; rooms_picked_up: number }>(sql`
      SELECT date::text AS date, rooms_picked_up FROM room_block_nights
      WHERE block_id = ${blockId} ORDER BY date
    `)
    expect([...nights].map((row) => row.rooms_picked_up)).toEqual([5, 5])
  })

  it("is limited by the tightest night, not by the largest", async () => {
    await expect(
      materializeDepartureRoomsFromBlock(db, slotId, {
        blockId,
        rooms: 10,
        namePattern: "Room {sequence}",
        kind: "room",
      }),
    ).rejects.toMatchObject({ status: 409 })

    expect(await remaining(blockId)).toBe(8)
  })

  it("takes the whole remaining hold when no room count is given", async () => {
    const result = await materializeDepartureRoomsFromBlock(db, slotId, {
      blockId,
      namePattern: "Room {sequence}",
      kind: "room",
    })

    expect(result.created).toBe(8)
    expect(await remaining(blockId)).toBe(0)
  })

  it("is idempotent: a repeat creates nothing and takes no second pickup", async () => {
    await materializeDepartureRoomsFromBlock(db, slotId, {
      blockId,
      rooms: 4,
      namePattern: "Room {sequence}",
      kind: "room",
    })
    const repeat = await materializeDepartureRoomsFromBlock(db, slotId, {
      blockId,
      rooms: 4,
      namePattern: "Room {sequence}",
      kind: "room",
    })

    expect(repeat.created).toBe(0)
    expect(repeat.skippedExisting).toBe(4)
    expect(repeat.roomsPickedUp).toBe(0)
    expect(await remaining(blockId)).toBe(4)
  })

  it("cannot draw against a block that is not contracted", async () => {
    await db.execute(sql`UPDATE room_blocks SET status = 'cancelled' WHERE id = ${blockId}`)

    await expect(
      materializeDepartureRoomsFromBlock(db, slotId, {
        blockId,
        rooms: 1,
        namePattern: "Room {sequence}",
        kind: "room",
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it("refuses a block that does not cover every night of the departure", async () => {
    await db.execute(
      sql`DELETE FROM room_block_nights WHERE block_id = ${blockId} AND date = '2026-07-11'::date`,
    )

    await expect(
      materializeDepartureRoomsFromBlock(db, slotId, {
        blockId,
        rooms: 1,
        namePattern: "Room {sequence}",
        kind: "room",
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it("releases the positions and hands the rooms back to the nightly counters", async () => {
    await materializeDepartureRoomsFromBlock(db, slotId, {
      blockId,
      rooms: 6,
      namePattern: "Room {sequence}",
      kind: "room",
    })
    expect(await remaining(blockId)).toBe(2)

    const release = await releaseDepartureRoomBlock(db, slotId, blockId, { kind: "room" })

    expect(release.removed).toBe(6)
    expect(release.roomsReleased).toBe(6)
    expect(await remaining(blockId)).toBe(8)

    const rooms = await db
      .select()
      .from(allocationResources)
      .where(eq(allocationResources.slotId, slotId))
    expect(rooms).toHaveLength(0)

    // The ledger compensates rather than deletes.
    const pickups = await db.execute<{ status: string }>(sql`
      SELECT status::text AS status FROM room_block_pickups WHERE block_id = ${blockId}
    `)
    expect([...pickups].map((row) => row.status)).toEqual(["reversed"])
  })

  it("refuses to draw a block against a departure with no overnight stay", async () => {
    const dayTripId = newId("availability_slots")
    await db.insert(availabilitySlots).values({
      id: dayTripId,
      productId,
      dateLocal: "2026-07-10",
      startsAt: new Date("2026-07-10T07:00:00Z"),
      endsAt: new Date("2026-07-10T18:00:00Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
    })

    await expect(
      materializeDepartureRoomsFromBlock(db, dayTripId, {
        blockId,
        rooms: 1,
        namePattern: "Room {sequence}",
        kind: "room",
      }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
