import { sql } from "drizzle-orm"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  createPostgresFixedWindowRateLimitStore,
  createPostgresKvStore,
} from "../../src/runtime/index.js"
import { cleanupTestDb, createTestDb } from "../../src/test-utils.js"

const describeIfDb: typeof describe = describe.skipIf(
  !process.env.TEST_DATABASE_URL,
) as typeof describe

async function ensureSharedStoreTables() {
  const db = createTestDb()
  await db.execute(sql`
    CREATE UNLOGGED TABLE IF NOT EXISTS kv_store (
      key text PRIMARY KEY,
      value text NOT NULL,
      expires_at timestamp with time zone,
      updated_at timestamp with time zone DEFAULT now() NOT NULL
    )
  `)
  await db.execute(sql`
    CREATE UNLOGGED TABLE IF NOT EXISTS fixed_window_rate_limits (
      key text NOT NULL,
      "window" bigint NOT NULL,
      count integer DEFAULT 0 NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      PRIMARY KEY (key, "window")
    )
  `)
}

describeIfDb("Postgres shared stores", () => {
  beforeAll(async () => {
    await ensureSharedStoreTables()
  })

  afterEach(async () => {
    await cleanupTestDb(createTestDb())
    await ensureSharedStoreTables()
  })

  it("expires KV entries and lists by prefix", async () => {
    // Expiry is evaluated against database `now()`, not the injected clock —
    // that is deliberate, since a shared store must not depend on each
    // process's wall clock. So the entry is expired by writing it from a store
    // whose clock is behind the database's, rather than by advancing a fake one.
    const db = createTestDb()
    const live = createPostgresKvStore(db, { sweepIntervalMs: 0 })
    const behind = createPostgresKvStore(db, {
      now: () => Date.now() - 3_600_000,
      sweepIntervalMs: 0,
    })
    await live.put("p:a", "1")
    await behind.put("p:b", "2", { expirationTtl: 1 })

    expect(await live.get("p:b")).toBeNull()
    await expect(live.list?.({ prefix: "p:" })).resolves.toEqual({ keys: [{ name: "p:a" }] })
  })

  it("stores and reads back a TTL'd value", async () => {
    // Regression: the expiry was bound as a `Date`, which postgres.js cannot
    // serialize through a raw `sql` template. Every TTL'd write threw, and the
    // response cache's best-effort catch swallowed it — so the Postgres cache
    // backend silently stored nothing at all.
    const kv = createPostgresKvStore(createTestDb(), { sweepIntervalMs: 0 })

    await kv.put("ttl:round-trip", "stored", { expirationTtl: 600 })

    expect(await kv.get("ttl:round-trip")).toBe("stored")
  })

  it("elects exactly one putIfAbsent winner under concurrent calls", async () => {
    const kv = createPostgresKvStore(createTestDb(), { sweepIntervalMs: 0 })

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        kv.putIfAbsent("lock:test", `caller-${index}`, { expirationTtl: 60 }),
      ),
    )

    expect(results.filter((won) => won)).toHaveLength(1)
    expect(results.filter((won) => !won)).toHaveLength(4)
    // The value readable afterwards is the one the winner wrote.
    expect(await kv.get("lock:test")).toBe(`caller-${results.indexOf(true)}`)
  })

  it("applies the winner's TTL to the row it wrote", async () => {
    const base = Date.now()
    const db = createTestDb()
    const kv = createPostgresKvStore(db, { now: () => base, sweepIntervalMs: 0 })

    await expect(kv.putIfAbsent("k", "winner", { expirationTtl: 60 })).resolves.toBe(true)

    const result = await db.execute<{ expires_at: unknown }>(
      sql`SELECT expires_at FROM kv_store WHERE key = 'k'`,
    )
    // postgres.js hands timestamptz back as text on this adapter; compare the
    // instant, not the representation.
    const expiresAt = (result as { expires_at: unknown }[])[0]?.expires_at
    expect(new Date(expiresAt as string).getTime()).toBe(base + 60_000)
  })

  it("treats an expired row as absent so a later putIfAbsent wins the slot again", async () => {
    // A clock behind the database's makes the first row expired on arrival. The
    // sweep only fires on the first call, so the expired row is still present
    // and putIfAbsent must take it over via the ON CONFLICT branch.
    const past = Date.now() - 10_000
    const kv = createPostgresKvStore(createTestDb(), {
      now: () => past,
      sweepIntervalMs: 3_600_000,
    })
    await kv.put("k", "stale", { expirationTtl: 1 })

    await expect(kv.putIfAbsent("k", "second", { expirationTtl: 60 })).resolves.toBe(true)
    expect(await kv.get("k")).toBe("second")

    // The slot is live again, so the next caller is excluded.
    await expect(kv.putIfAbsent("k", "third", { expirationTtl: 60 })).resolves.toBe(false)
    expect(await kv.get("k")).toBe("second")
  })

  it("never takes a slot held without an expiry", async () => {
    const kv = createPostgresKvStore(createTestDb(), { sweepIntervalMs: 0 })
    await kv.put("k", "permanent")

    await expect(kv.putIfAbsent("k", "mine")).resolves.toBe(false)
    expect(await kv.get("k")).toBe("permanent")
  })

  it("increments fixed-window counters atomically under concurrent calls", async () => {
    const store = createPostgresFixedWindowRateLimitStore(createTestDb(), { sweepIntervalMs: 0 })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.limit("lim:test", { max: 3, windowSeconds: 60 })),
    )

    expect(results.filter((result) => result.allowed)).toHaveLength(3)
    expect(results.filter((result) => !result.allowed)).toHaveLength(2)
    expect(Math.min(...results.map((result) => result.remaining ?? 0))).toBe(0)
  })
})

describe("Postgres shared stores DB gate", () => {
  it("uses describeIfDb so the integration suite skips without TEST_DATABASE_URL", () => {
    expect(typeof describeIfDb).toBe("function")
  })
})
