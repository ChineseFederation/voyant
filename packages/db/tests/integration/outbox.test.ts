import { createEventBus } from "@voyant-travel/core"
import { sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import {
  claimDueOutboxEvents,
  completeOutboxEvent,
  createOutboxEventStore,
  drainOutbox,
  failOutboxEvent,
  getBoundedOutboxStats,
  getOutboxStats,
  insertOutboxEvents,
  pruneDeliveredOutboxEvents,
} from "../../src/outbox.js"
import { eventOutboxTable } from "../../src/schema/infra/event_outbox.js"
import { createTestDb } from "../../src/test-utils.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
let DB_AVAILABLE = false

if (TEST_DATABASE_URL) {
  try {
    const probe = createTestDb()
    await probe.execute(/* sql */ `SELECT 1`)
    DB_AVAILABLE = true
  } catch {
    DB_AVAILABLE = false
  }
}

describe.skipIf(!DB_AVAILABLE)("event outbox", () => {
  const db = createTestDb()

  beforeAll(async () => {
    await db.execute(/* sql */ `
      CREATE TABLE IF NOT EXISTS "event_outbox" (
        "id" text PRIMARY KEY,
        "event_id" text NOT NULL,
        "name" text NOT NULL,
        "payload" jsonb,
        "metadata" jsonb,
        "status" text NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 8,
        "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "delivered_at" timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "event_outbox_event_id_uniq" ON "event_outbox" ("event_id");
      CREATE INDEX IF NOT EXISTS "event_outbox_due_idx"
        ON "event_outbox" ("next_attempt_at", "id") WHERE "status" = 'pending';
      CREATE INDEX IF NOT EXISTS "event_outbox_pending_created_idx"
        ON "event_outbox" ("created_at") WHERE "status" = 'pending';
      CREATE INDEX IF NOT EXISTS "event_outbox_failed_created_idx"
        ON "event_outbox" ("created_at") WHERE "status" = 'failed';
      CREATE INDEX IF NOT EXISTS "event_outbox_delivered_idx"
        ON "event_outbox" ("delivered_at", "id") WHERE "status" = 'delivered';
      CREATE INDEX IF NOT EXISTS "event_outbox_pending_intent_idx"
        ON "event_outbox" (("payload" ->> 'intentId')) WHERE "status" = 'pending';
    `)
  })

  afterEach(async () => {
    await db.execute(/* sql */ `DELETE FROM "event_outbox"`)
  })

  afterAll(async () => {
    await db.execute(/* sql */ `DROP TABLE IF EXISTS "event_outbox"`)
  })

  describe("insertOutboxEvents", () => {
    it("persists envelopes and stamps eventIds when missing", async () => {
      const rows = await insertOutboxEvents(db, [
        { name: "booking.created", data: { id: "bk_1" } },
        { name: "booking.created", data: { id: "bk_2" }, metadata: { eventId: "evt_fixed" } },
      ])
      expect(rows).toHaveLength(2)
      expect(rows[0]?.eventId).toMatch(/^evt_/)
      expect(rows[1]?.eventId).toBe("evt_fixed")
      expect(rows[0]?.status).toBe("pending")
    })

    it("dedups on eventId (idempotent capture)", async () => {
      const first = await insertOutboxEvents(db, [
        { name: "x", data: { n: 1 }, metadata: { eventId: "evt_same" } },
      ])
      const second = await insertOutboxEvents(db, [
        { name: "x", data: { n: 2 }, metadata: { eventId: "evt_same" } },
      ])
      expect(first).toHaveLength(1)
      expect(second).toHaveLength(0)
    })
  })

  describe("claimDueOutboxEvents", () => {
    it("claims due rows, bumps attempts, and hides them for the visibility window", async () => {
      await insertOutboxEvents(db, [{ name: "x", data: {} }])

      const claimed = await claimDueOutboxEvents(db, { limit: 10 })
      expect(claimed).toHaveLength(1)
      expect(claimed[0]?.attempts).toBe(1)

      // Within the visibility window the row is not due → second claim empty.
      const reclaimed = await claimDueOutboxEvents(db, { limit: 10 })
      expect(reclaimed).toHaveLength(0)
    })

    it("never claims delivered or future rows", async () => {
      const [row] = await insertOutboxEvents(db, [{ name: "done", data: {} }])
      if (!row) throw new Error("insert failed")
      await completeOutboxEvent(db, row.id)
      await insertOutboxEvents(db, [
        { name: "future", data: {}, metadata: { eventId: "evt_future" } },
      ])
      await db.execute(
        // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`UPDATE ${eventOutboxTable} SET "next_attempt_at" = now() + interval '1 hour' WHERE "event_id" = 'evt_future'`,
      )

      const claimed = await claimDueOutboxEvents(db, { limit: 10 })
      expect(claimed).toHaveLength(0)
    })

    it("does not return the same row to concurrent claimers", async () => {
      await insertOutboxEvents(
        db,
        Array.from({ length: 12 }, (_, index) => ({
          name: "x",
          data: { index },
          metadata: { eventId: `evt_claim_${index}` },
        })),
      )

      const [left, right] = await Promise.all([
        claimDueOutboxEvents(db, { limit: 6 }),
        claimDueOutboxEvents(db, { limit: 6 }),
      ])

      expect(left).toHaveLength(6)
      expect(right).toHaveLength(6)
      expect(new Set([...left, ...right].map((row) => row.eventId)).size).toBe(12)
    })
  })

  describe("failOutboxEvent", () => {
    it("reschedules with backoff while attempts remain", async () => {
      const [row] = await insertOutboxEvents(db, [{ name: "x", data: {} }])
      if (!row) throw new Error("insert failed")
      const [claimed] = await claimDueOutboxEvents(db, { limit: 1 })
      if (!claimed) throw new Error("claim failed")

      const status = await failOutboxEvent(db, claimed.id, "boom")
      expect(status).toBe("pending")

      const stats = await getOutboxStats(db)
      expect(stats.pending).toBe(1)
      expect(stats.dueNow).toBe(0) // backoff pushed it into the future
    })

    it("dead-letters once attempts exhaust max_attempts", async () => {
      const [row] = await insertOutboxEvents(db, [{ name: "x", data: {} }])
      if (!row) throw new Error("insert failed")
      await db.execute(
        // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
        sql`UPDATE ${eventOutboxTable} SET "attempts" = "max_attempts" WHERE ${eventOutboxTable.id} = ${row.id}`,
      )

      const status = await failOutboxEvent(db, row.id, "final straw")
      expect(status).toBe("failed")
      const stats = await getOutboxStats(db)
      expect(stats.failed).toBe(1)
    })
  })

  describe("drainOutbox", () => {
    it("delivers claimed rows through the bus and completes them", async () => {
      const bus = createEventBus()
      const handler = vi.fn()
      bus.subscribe("booking.created", handler)
      await insertOutboxEvents(db, [
        { name: "booking.created", data: { id: "bk_9" }, metadata: { eventId: "evt_d1" } },
      ])

      const result = await drainOutbox(db, bus)

      expect(result).toMatchObject({
        claimed: 1,
        delivered: 1,
        retried: 0,
        deadLettered: 0,
        batches: 1,
        budgetExhausted: false,
      })
      expect(handler).toHaveBeenCalledOnce()
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "booking.created",
          data: { id: "bk_9" },
          metadata: expect.objectContaining({ eventId: "evt_d1" }),
        }),
      )
      const stats = await getOutboxStats(db)
      expect(stats.delivered).toBe(1)
    })

    it("reschedules rows whose subscribers fail", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const bus = createEventBus()
      bus.subscribe("x", () => {
        throw new Error("subscriber down")
      })
      await insertOutboxEvents(db, [{ name: "x", data: {} }])

      const result = await drainOutbox(db, bus)

      expect(result).toMatchObject({
        claimed: 1,
        delivered: 0,
        retried: 1,
        deadLettered: 0,
      })
      const stats = await getOutboxStats(db)
      expect(stats.pending).toBe(1)
      errorSpy.mockRestore()
    })

    it("returns an empty result when nothing is due", async () => {
      const result = await drainOutbox(db, createEventBus())
      expect(result).toMatchObject({
        claimed: 0,
        delivered: 0,
        retried: 0,
        deadLettered: 0,
        batches: 0,
        budgetExhausted: false,
      })
    })

    it("drains multiple batches while bounding delivery concurrency", async () => {
      await insertOutboxEvents(
        db,
        Array.from({ length: 7 }, (_, index) => ({
          name: "bounded",
          data: { index },
          metadata: { eventId: `evt_bounded_${index}` },
        })),
      )
      let active = 0
      let maxActive = 0
      const result = await drainOutbox(
        db,
        {
          async deliver() {
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((resolve) => setTimeout(resolve, 5))
            active -= 1
            return { attempted: 1, failed: 0, errors: [] }
          },
        },
        { limit: 3, concurrency: 2, maxEvents: 20, maxBatches: 10 },
      )

      expect(result).toMatchObject({ claimed: 7, delivered: 7, batches: 3 })
      expect(maxActive).toBe(2)
    })

    it("stops at the configured work budget and leaves backlog for another wake", async () => {
      await insertOutboxEvents(
        db,
        Array.from({ length: 8 }, (_, index) => ({
          name: "budgeted",
          data: { index },
          metadata: { eventId: `evt_budgeted_${index}` },
        })),
      )

      const result = await drainOutbox(db, createEventBus(), {
        limit: 2,
        concurrency: 1,
        maxEvents: 3,
        maxBatches: 10,
      })

      expect(result).toMatchObject({
        claimed: 3,
        delivered: 3,
        batches: 2,
        budgetExhausted: true,
      })
      expect((await getOutboxStats(db)).pending).toBe(5)
    })
  })

  describe("bounded maintenance and statistics", () => {
    it("prunes only the configured number of oldest delivered rows", async () => {
      const rows = await insertOutboxEvents(
        db,
        Array.from({ length: 5 }, (_, index) => ({
          name: "receipt",
          data: { index },
          metadata: { eventId: `evt_receipt_${index}` },
        })),
      )
      for (const row of rows) await completeOutboxEvent(db, row.id)
      await db.execute(
        sql`UPDATE ${eventOutboxTable} SET "delivered_at" = now() - interval '30 days'`,
      )

      expect(await pruneDeliveredOutboxEvents(db, { olderThanDays: 14, limit: 2 })).toBe(2)
      expect((await getOutboxStats(db)).delivered).toBe(3)
    })

    it("caps backlog scans and still reports the true oldest pending row", async () => {
      await insertOutboxEvents(
        db,
        Array.from({ length: 4 }, (_, index) => ({
          name: "stats",
          data: { index },
          metadata: { eventId: `evt_stats_${index}` },
        })),
      )
      await db.execute(
        sql`UPDATE ${eventOutboxTable} SET "created_at" = now() - interval '2 hours' WHERE "event_id" = 'evt_stats_0'`,
      )

      const stats = await getBoundedOutboxStats(db, { scanLimit: 2 })

      expect(stats).toMatchObject({
        pending: 2,
        pendingCapped: true,
        dueNow: 2,
        dueNowCapped: true,
      })
      expect(stats.oldestPendingAt?.getTime()).toBeLessThan(Date.now() - 60 * 60 * 1000)
    })

    it("keeps the partial indexes required by claim, retry stats, and pruning", async () => {
      const result = (await db.execute(/* sql */ `
        SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'event_outbox'
      `)) as unknown
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: Array<{ indexname: string }> }).rows ?? [])
      const names = new Set(rows.map((row) => row.indexname))

      for (const name of [
        "event_outbox_due_idx",
        "event_outbox_pending_created_idx",
        "event_outbox_failed_created_idx",
        "event_outbox_delivered_idx",
        "event_outbox_pending_intent_idx",
      ]) {
        expect(names).toContain(name)
      }
    })
  })

  describe("createOutboxEventStore (durable emit end-to-end)", () => {
    it("emit persists, delivers, and completes; duplicate emits capture once", async () => {
      const bus = createEventBus()
      const handler = vi.fn()
      bus.subscribe("invoice.issued", handler)
      const store = createOutboxEventStore(() => db)

      await bus.emit("invoice.issued", { id: "inv_1" }, { eventId: "evt_e2e" }, { store })
      await bus.emit("invoice.issued", { id: "inv_1" }, { eventId: "evt_e2e" }, { store })

      expect(handler).toHaveBeenCalledOnce()
      const stats = await getOutboxStats(db)
      expect(stats.delivered).toBe(1)
      expect(stats.pending).toBe(0)
    })

    it("a failed delivery leaves a pending row that a later drain redelivers", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const bus = createEventBus()
      let attempts = 0
      bus.subscribe("flaky.event", () => {
        attempts += 1
        if (attempts === 1) throw new Error("first attempt fails")
      })
      const store = createOutboxEventStore(() => db)

      await bus.emit("flaky.event", {}, undefined, { store })
      expect((await getOutboxStats(db)).pending).toBe(1)

      // Make the backoff-delayed row due now, then drain.
      // agent-quality: raw-sql reviewed -- owner: db; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      await db.execute(sql`UPDATE ${eventOutboxTable} SET "next_attempt_at" = now()`)
      const result = await drainOutbox(db, bus)

      expect(result.delivered).toBe(1)
      expect(attempts).toBe(2)
      expect((await getOutboxStats(db)).delivered).toBe(1)
      errorSpy.mockRestore()
    })
  })
})
