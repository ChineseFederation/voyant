import { allocationResources, availabilitySlots } from "@voyant-travel/availability/schema"
import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { products } from "../../../../inventory/src/schema.js"
import { assignTravelerAllocation } from "../../../src/availability/service-allocation.js"
import { deleteAllocationResource } from "../../../src/availability/service-allocation-resource-crud.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

function connect(): ClosableTestDb {
  return createDbClient(process.env.TEST_DATABASE_URL as string, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { statementMs: false, queryMs: false, connectMs: false },
  }) as ClosableTestDb
}

// A BEFORE INSERT trigger that always raises, so every attempt to write
// `allocation_audit_log` fails from inside whatever transaction is running.
// The trigger and its function are created outside any transaction, so a
// mutation that rolls back does not remove them; each test drops them itself.
async function installFailingAuditTrigger(db: PostgresJsDatabase) {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION voyant_test_fail_allocation_audit() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced allocation audit failure';
    END;
    $$ LANGUAGE plpgsql
  `)
  await db.execute(sql`
    CREATE TRIGGER voyant_test_fail_allocation_audit_trigger
    BEFORE INSERT ON allocation_audit_log
    FOR EACH ROW EXECUTE FUNCTION voyant_test_fail_allocation_audit()
  `)
}

async function removeFailingAuditTrigger(db: PostgresJsDatabase) {
  await db.execute(
    sql`DROP TRIGGER IF EXISTS voyant_test_fail_allocation_audit_trigger ON allocation_audit_log`,
  )
  await db.execute(sql`DROP FUNCTION IF EXISTS voyant_test_fail_allocation_audit()`)
}

describe.skipIf(!DB_AVAILABLE)("allocation audit atomicity (integration)", () => {
  let db: ClosableTestDb
  let productId: string
  let slotId: string

  beforeAll(() => {
    db = connect()
  })

  afterAll(async () => {
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

  // The trigger lives outside the schema TRUNCATE, so drop it after every
  // test rather than relying on cleanup to remove it.
  afterEach(async () => {
    await removeFailingAuditTrigger(db)
  })

  async function seedRoom(label: string, capacity: number) {
    const id = newId("allocation_resources")
    await db.insert(allocationResources).values({
      id,
      slotId,
      kind: "room",
      label,
      capacity,
      sortOrder: 1,
      flags: {},
    })
    return id
  }

  async function seedTraveler(allocations?: Record<string, string>) {
    const bookingId = newId("bookings")
    const bookingItemId = newId("booking_items")
    const travelerId = newId("booking_travelers")
    await db.execute(sql`
      INSERT INTO bookings (id, booking_number, status, sell_currency, pax)
      VALUES (${bookingId}, ${`AUDIT-${bookingId.slice(-6)}`}, 'confirmed', 'EUR', 1)
    `)
    await db.execute(sql`
      INSERT INTO booking_items (id, booking_id, title, status, quantity, sell_currency, product_id, availability_slot_id)
      VALUES (${bookingItemId}, ${bookingId}, 'Coach seat', 'confirmed', 1, 'EUR', ${productId}, ${slotId})
    `)
    await db.execute(sql`
      INSERT INTO booking_allocations (id, booking_id, booking_item_id, product_id, availability_slot_id, quantity, allocation_type, status)
      VALUES (${newId("booking_allocations")}, ${bookingId}, ${bookingItemId}, ${productId}, ${slotId}, 1, 'unit', 'confirmed')
    `)
    await db.execute(sql`
      INSERT INTO booking_travelers (id, booking_id, participant_type, first_name, last_name)
      VALUES (${travelerId}, ${bookingId}, 'traveler', 'Test', 'Traveler')
    `)
    if (allocations) {
      await db.execute(sql`
        INSERT INTO booking_traveler_travel_details (traveler_id, allocations)
        VALUES (${travelerId}, ${JSON.stringify(allocations)}::jsonb)
      `)
    }
    return travelerId
  }

  async function travelerRoom(travelerId: string): Promise<string | null> {
    const [row] = await db.execute<{ room: string | null }>(sql`
      SELECT allocations ->> 'room' AS room
      FROM booking_traveler_travel_details
      WHERE traveler_id = ${travelerId}
    `)
    return row?.room ?? null
  }

  async function auditCount(): Promise<number> {
    const [row] = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM allocation_audit_log WHERE slot_id = ${slotId}`,
    )
    return row?.count ?? 0
  }

  async function resourceExists(resourceId: string): Promise<boolean> {
    const [row] = await db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM allocation_resources WHERE id = ${resourceId}`,
    )
    return (row?.count ?? 0) > 0
  }

  it("rolls the traveler assignment back when its audit insert fails", async () => {
    const roomId = await seedRoom("DBL 1", 2)
    const travelerId = await seedTraveler()

    await installFailingAuditTrigger(db)
    await expect(
      assignTravelerAllocation(db, slotId, travelerId, { kind: "room", resourceId: roomId }),
    ).rejects.toThrow(/allocation_audit_log/)

    // The audit failed inside the transaction, so the assignment must not
    // have persisted and no audit row can exist.
    expect(await travelerRoom(travelerId)).toBeNull()
    expect(await auditCount()).toBe(0)

    // With the audit path healthy again, the same mutation commits together
    // with exactly one audit row.
    await removeFailingAuditTrigger(db)
    await assignTravelerAllocation(db, slotId, travelerId, { kind: "room", resourceId: roomId })
    expect(await travelerRoom(travelerId)).toBe(roomId)
    expect(await auditCount()).toBe(1)
  })

  it("rolls the resource deletion and its cleanup back when the audit insert fails", async () => {
    const roomId = await seedRoom("DBL 1", 2)
    const travelerId = await seedTraveler({ room: roomId })

    await installFailingAuditTrigger(db)
    await expect(deleteAllocationResource(db, slotId, roomId)).rejects.toThrow(
      /allocation_audit_log/,
    )

    // Deletion, the dangling-reference cleanup, and the audit share one
    // transaction: the row must survive and still be referenced.
    expect(await resourceExists(roomId)).toBe(true)
    expect(await travelerRoom(travelerId)).toBe(roomId)
    expect(await auditCount()).toBe(0)

    // Healthy path: the resource is gone, the traveler no longer references
    // it, and a single audit row records the delete.
    await removeFailingAuditTrigger(db)
    const deleted = await deleteAllocationResource(db, slotId, roomId)
    expect(deleted?.id).toBe(roomId)
    expect(await resourceExists(roomId)).toBe(false)
    expect(await travelerRoom(travelerId)).toBeNull()
    expect(await auditCount()).toBe(1)
  })
})
