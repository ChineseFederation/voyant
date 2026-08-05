import { createDbClient } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import { availabilitySlots } from "@voyant-travel/operations/schema"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { products } from "../../../../inventory/src/schema.js"
import { getSlotById, updateSlot } from "../../../src/availability/service-core.js"
import { instantToSlotLocal } from "../../../src/availability/slot-timezone.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("availability slot concurrent updates", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("serializes partial timing patches so an invalid combined state cannot commit", async () => {
    const productId = newId("products")
    const slotId = newId("availability_slots")
    await db.insert(products).values({
      id: productId,
      name: "Concurrent Slot Product",
      sellCurrency: "EUR",
      bookingMode: "date",
    })
    await db.insert(availabilitySlots).values({
      id: slotId,
      productId,
      dateLocal: "2026-10-12",
      startsAt: new Date("2026-10-12T12:00:00.000Z"),
      timezone: "UTC",
      status: "open",
      unlimited: false,
      remainingPax: 5,
    })

    let releaseFirst!: () => void
    let firstHasSnapshot!: () => void
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const snapshotRead = new Promise<void>((resolve) => {
      firstHasSnapshot = resolve
    })
    const first = updateSlot(
      db,
      slotId,
      { startsAt: "2026-10-12T01:00:00.000Z" },
      {
        testHooks: {
          async afterSlotSnapshot() {
            firstHasSnapshot()
            await release
          },
        },
      },
    )
    await snapshotRead
    let reportSecondPid!: (pid: number) => void
    const secondPid = new Promise<number>((resolve) => {
      reportSecondPid = resolve
    })
    const second = updateSlot(
      db,
      slotId,
      { timezone: "America/New_York" },
      {
        testHooks: {
          async beforeSlotSnapshot(transaction) {
            const [row] = await transaction.execute<{ pid: number }>(
              sql`SELECT pg_backend_pid()::int AS pid`,
            )
            if (!row) throw new Error("failed to resolve concurrent writer backend")
            reportSecondPid(row.pid)
          },
        },
      },
    )
    try {
      await waitForLockWait(db, await secondPid)
    } finally {
      releaseFirst()
    }

    const [firstResult, secondResult] = await Promise.allSettled([first, second])
    expect(firstResult.status).toBe("fulfilled")
    expect(secondResult.status).toBe("rejected")

    const stored = await getSlotById(db, slotId)
    if (!stored) throw new Error("concurrent test slot disappeared")
    expect(instantToSlotLocal(stored.startsAt, stored.timezone).date).toBe(stored.dateLocal)
  })
})

async function waitForLockWait(db: PostgresJsDatabase, pid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [row] = await db.execute<{ waiting: boolean }>(sql`
      SELECT (wait_event_type = 'Lock') AS waiting
      FROM pg_stat_activity
      WHERE pid = ${pid}
    `)
    if (row?.waiting) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("concurrent slot writer did not wait on the row lock")
}
