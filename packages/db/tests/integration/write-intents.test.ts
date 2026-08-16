import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { insertOutboxEvents } from "../../src/outbox.js"
import { runEventOutboxDrainJob } from "../../src/outbox-job.js"
import { createTestDb } from "../../src/test-utils.js"
import {
  enqueueWriteIntent,
  expireStaleWriteIntents,
  getWriteIntent,
  settleWriteIntent,
} from "../../src/write-intents.js"

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

describe.skipIf(!DB_AVAILABLE)("write intents", () => {
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
      CREATE UNIQUE INDEX IF NOT EXISTS "event_outbox_event_id_uniq"
        ON "event_outbox" ("event_id");
      CREATE TABLE IF NOT EXISTS "write_intents" (
        "id" text PRIMARY KEY,
        "kind" text NOT NULL,
        "payload" jsonb NOT NULL,
        "idempotency_key" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "result" jsonb,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "completed_at" timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "write_intents_idempotency_key_uniq"
        ON "write_intents" ("idempotency_key");
      CREATE INDEX IF NOT EXISTS "write_intents_pending_idx"
        ON "write_intents" ("created_at", "id") WHERE "status" = 'pending';
    `)
  })

  afterEach(async () => {
    await db.execute(/* sql */ `DELETE FROM "write_intents"`)
    await db.execute(/* sql */ `DELETE FROM "event_outbox"`)
  })

  afterAll(async () => {
    await db.execute(/* sql */ `DROP TABLE IF EXISTS "write_intents"`)
    await db.execute(/* sql */ `DROP TABLE IF EXISTS "event_outbox"`)
  })

  it("enqueues with a generated idempotency key and reads back", async () => {
    const { intent, created } = await enqueueWriteIntent(db, {
      kind: "public-api.booking.bootstrap",
      payload: { input: { a: 1 } },
    })

    expect(created).toBe(true)
    expect(intent.id).toMatch(/^wint_/)
    expect(intent.status).toBe("pending")

    const fetched = await getWriteIntent(db, intent.id)
    expect(fetched?.payload).toEqual({ input: { a: 1 } })
  })

  it("dedups on idempotency key — the retry gets the SAME intent", async () => {
    const first = await enqueueWriteIntent(db, {
      kind: "k",
      payload: { n: 1 },
      idempotencyKey: "idem-1",
    })
    const second = await enqueueWriteIntent(db, {
      kind: "k",
      payload: { n: 2 },
      idempotencyKey: "idem-1",
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.intent.id).toBe(first.intent.id)
    // Original payload wins — the retry's body is ignored.
    expect(second.intent.payload).toEqual({ n: 1 })
  })

  it("settles only pending intents (at-least-once redelivery is a no-op)", async () => {
    const { intent } = await enqueueWriteIntent(db, { kind: "k", payload: {} })

    const first = await settleWriteIntent(db, intent.id, {
      status: "succeeded",
      result: { sessionId: "bs_1" },
    })
    const replay = await settleWriteIntent(db, intent.id, {
      status: "failed",
      error: "should not overwrite",
    })

    expect(first).toBe(true)
    expect(replay).toBe(false)
    const row = await getWriteIntent(db, intent.id)
    expect(row?.status).toBe("succeeded")
    expect(row?.result).toEqual({ sessionId: "bs_1" })
  })

  it("expireStaleWriteIntents fails only old pending rows", async () => {
    const { intent: fresh } = await enqueueWriteIntent(db, { kind: "k", payload: {} })
    const { intent: old } = await enqueueWriteIntent(db, {
      kind: "k",
      payload: {},
      idempotencyKey: "old",
    })
    await db.execute(
      /* sql */ `UPDATE "write_intents" SET "created_at" = now() - interval '2 hours' WHERE "id" = '${old.id}'`,
    )

    const expired = await expireStaleWriteIntents(db, { olderThanMinutes: 30 })

    expect(expired).toBe(1)
    expect((await getWriteIntent(db, old.id))?.status).toBe("failed")
    expect((await getWriteIntent(db, fresh.id))?.status).toBe("pending")
  })

  it("never expires an old intent whose outbox event is still PENDING (spike backlog)", async () => {
    const { intent } = await enqueueWriteIntent(db, {
      kind: "k",
      payload: {},
      idempotencyKey: "backlogged",
    })
    await db.execute(
      /* sql */ `UPDATE "write_intents" SET "created_at" = now() - interval '2 hours' WHERE "id" = '${intent.id}'`,
    )
    // A queued (pending) outbox event still references the intent — the
    // drain just hasn't reached it yet.
    await db.execute(
      /* sql */ `INSERT INTO "event_outbox" ("id", "event_id", "name", "payload", "status")
        VALUES ('evob_backlog', 'evt_backlog', 'k.requested', '{"intentId": "${intent.id}"}'::jsonb, 'pending')`,
    )

    const expired = await expireStaleWriteIntents(db, { olderThanMinutes: 30 })

    expect(expired).toBe(0)
    expect((await getWriteIntent(db, intent.id))?.status).toBe("pending")
  })

  it("expires an old intent whose outbox event dead-lettered", async () => {
    const { intent } = await enqueueWriteIntent(db, {
      kind: "k",
      payload: {},
      idempotencyKey: "deadlettered",
    })
    await db.execute(
      /* sql */ `UPDATE "write_intents" SET "created_at" = now() - interval '2 hours' WHERE "id" = '${intent.id}'`,
    )
    await db.execute(
      /* sql */ `INSERT INTO "event_outbox" ("id", "event_id", "name", "payload", "status")
        VALUES ('evob_dead', 'evt_dead', 'k.requested', '{"intentId": "${intent.id}"}'::jsonb, 'failed')`,
    )

    const expired = await expireStaleWriteIntents(db, { olderThanMinutes: 30 })

    expect(expired).toBe(1)
    expect((await getWriteIntent(db, intent.id))?.status).toBe("failed")
  })

  it("expires stale intents in bounded oldest-first batches", async () => {
    const intents = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        enqueueWriteIntent(db, {
          kind: "k",
          payload: {},
          idempotencyKey: `bounded-${index}`,
        }),
      ),
    )
    await db.execute(/* sql */ `
      UPDATE "write_intents" SET "created_at" = now() - interval '2 hours'
    `)

    expect(await expireStaleWriteIntents(db, { olderThanMinutes: 30, limit: 2 })).toBe(2)
    const states = await Promise.all(intents.map(({ intent }) => getWriteIntent(db, intent.id)))
    expect(states.filter((intent) => intent?.status === "failed")).toHaveLength(2)
    expect(states.filter((intent) => intent?.status === "pending")).toHaveLength(2)
  })

  it("logs the bounded drain outcome and remaining backlog on every job wake", async () => {
    await insertOutboxEvents(db, [
      { name: "job.event", data: {}, metadata: { eventId: "evt_job_metrics" } },
    ])
    const log = vi.fn()
    const warn = vi.fn()

    await runEventOutboxDrainJob({
      getPort: async () => ({
        withDb: async (operation: (database: typeof db) => Promise<unknown>) => operation(db),
        deliver: async () => ({ attempted: 1, failed: 0, errors: [] }),
        log,
        warn,
      }),
    } as never)

    expect(log).toHaveBeenCalledOnce()
    const message = String(log.mock.calls[0]?.[0])
    expect(message).toMatch(/^\[outbox-drain\] /)
    expect(JSON.parse(message.replace(/^\[outbox-drain\] /, ""))).toMatchObject({
      claimed: 1,
      delivered: 1,
      retried: 0,
      deadLettered: 0,
      remainingBacklog: 0,
      oldestPendingAgeMs: null,
      pruned: 0,
      expiredIntents: 0,
    })
  })

  it("keeps the partial index required by bounded oldest-first expiration", async () => {
    const result = (await db.execute(/* sql */ `
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'write_intents'
        AND indexname = 'write_intents_pending_idx'
    `)) as unknown
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: Array<{ indexdef: string }> }).rows ?? [])

    expect(rows[0]?.indexdef).toContain("(created_at, id)")
    expect(rows[0]?.indexdef).toContain("status = 'pending'")
  })
})
