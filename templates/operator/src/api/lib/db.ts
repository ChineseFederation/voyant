import { createDbClient, createServerlessDbClient, type DbAdapter } from "@voyantjs/db"
import type { NeonDatabase } from "drizzle-orm/neon-serverless"
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres"
import { Pool as NodePgPool } from "pg"

function applyTuyuSchema(connectionString: string): string {
  if (process.env.TUYU_BOOKING_RUNTIME !== "1") return connectionString
  const parsed = new URL(connectionString)
  if (parsed.pathname !== "/tuyubooking") {
    throw new Error("TuyuBooking Voyant must use the tuyubooking database")
  }
  parsed.searchParams.set("options", "-csearch_path=module_voyant,pg_catalog")
  return parsed.toString()
}

/**
 * Local Postgres doesn't speak Neon's WebSocket protocol. When the
 * connection string points at localhost, swap the WS driver for
 * `pg.Pool` + `drizzle-orm/node-postgres`. Drizzle's runtime API
 * (queries, transactions) is identical across the two flavors, so we
 * cast through `unknown` to keep the `NeonDatabase` annotation that
 * downstream call sites depend on.
 */
function isLocalConnection(connectionString: string): boolean {
  try {
    const { hostname } = new URL(connectionString)
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  } catch {
    return false
  }
}

function openDb(connectionString: string): {
  db: NeonDatabase
  dispose: () => Promise<void>
} {
  connectionString = applyTuyuSchema(connectionString)
  if (isLocalConnection(connectionString)) {
    const pool = new NodePgPool({ connectionString })
    return {
      db: drizzleNodePg(pool) as unknown as NeonDatabase,
      dispose: () => pool.end().catch(() => {}),
    }
  }
  return createServerlessDbClient(connectionString)
}

/**
 * Database client helpers with NO schema passing.
 * Queries import table definitions directly for optimal tree-shaking.
 * All data is in a single EU database - no multi-region routing needed.
 */

export function getDb(adapter?: DbAdapter) {
  const url = applyTuyuSchema(process.env.DATABASE_URL ?? "")
  const effectiveAdapter = adapter || (process.env.DB_ADAPTER as DbAdapter) || "edge"
  return createDbClient(url, { adapter: effectiveAdapter })
}

/**
 * Per-request Neon Postgres client over WebSocket. Supports real
 * Postgres transactions (drizzle's `db.transaction(...)`).
 *
 * Cleanup is the caller's responsibility — either route through
 * `createApp({ db: dbFromEnvForApp })` below (which threads a
 * `dispose()` through the Hono db middleware so the Pool closes after
 * the response), or use `withDbFromEnv` for code paths outside Hono.
 * Without explicit cleanup, the Pool sits open until the Workers
 * runtime reclaims the isolate.
 */
export function getDbFromEnv(env: CloudflareBindings): NeonDatabase {
  return openDb(env.DATABASE_URL).db
}

/**
 * Lifecycle-aware factory for `createApp({ db })`. Returns the drizzle
 * client plus a `dispose()` the Hono db middleware schedules via
 * `executionCtx.waitUntil` after the response is sent — so each
 * request gets its own Pool and closes it before the isolate sleeps,
 * instead of leaking WebSocket connections to Neon at request rate.
 */
export function dbFromEnvForApp(env: CloudflareBindings): {
  db: NeonDatabase
  dispose: () => Promise<void>
} {
  return openDb(env.DATABASE_URL)
}

/**
 * Higher-order helper for code paths without a Hono request context
 * (event-bus subscribers, scheduled handlers, retry workers). Owns
 * the Pool lifecycle: opens, hands the drizzle client to `fn`, closes
 * on settle.
 */
export async function withDbFromEnv<T>(
  env: CloudflareBindings,
  fn: (db: NeonDatabase) => Promise<T>,
): Promise<T> {
  const { db, dispose } = openDb(env.DATABASE_URL)
  try {
    return await fn(db)
  } finally {
    await dispose()
  }
}
