import {
  type AnyDrizzleDb,
  createDbClient,
  createServerlessDbClient,
  type DbAdapter,
} from "@voyantjs/db"

type TuyuLocalBindings = CloudflareBindings & { DB_ADAPTER?: DbAdapter }

// The merchant-hosted TuyuBooking profile keeps one direct PostgreSQL client
// for the lifetime of the local workerd process. Cloud deployments retain the
// upstream per-request Neon WebSocket behavior unchanged.
let tuyuLocalDb: AnyDrizzleDb | undefined

function usesTuyuLocalPostgres(env: CloudflareBindings): boolean {
  return (env as TuyuLocalBindings).DB_ADAPTER === "node"
}

function getTuyuLocalDb(env: CloudflareBindings): AnyDrizzleDb {
  tuyuLocalDb ??= createDbClient(env.DATABASE_URL, {
    adapter: "node",
    nodeMaxConnections: 10,
  })
  return tuyuLocalDb
}

/**
 * Database client helpers with NO schema passing.
 * Queries import table definitions directly for optimal tree-shaking.
 * All data is in a single EU database - no multi-region routing needed.
 */

export function getDb(adapter?: DbAdapter) {
  const url = process.env.DATABASE_URL ?? ""
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
export function getDbFromEnv(env: CloudflareBindings): AnyDrizzleDb {
  return usesTuyuLocalPostgres(env)
    ? getTuyuLocalDb(env)
    : createServerlessDbClient(env.DATABASE_URL).db
}

/**
 * Lifecycle-aware factory for `createApp({ db })`. Returns the drizzle
 * client plus a `dispose()` the Hono db middleware schedules via
 * `executionCtx.waitUntil` after the response is sent — so each
 * request gets its own Pool and closes it before the isolate sleeps,
 * instead of leaking WebSocket connections to Neon at request rate.
 */
export function dbFromEnvForApp(env: CloudflareBindings): {
  db: AnyDrizzleDb
  dispose: () => Promise<void>
} {
  if (usesTuyuLocalPostgres(env)) {
    return { db: getTuyuLocalDb(env), dispose: async () => {} }
  }
  return createServerlessDbClient(env.DATABASE_URL)
}

/**
 * Higher-order helper for code paths without a Hono request context
 * (event-bus subscribers, scheduled handlers, retry workers). Owns
 * the Pool lifecycle: opens, hands the drizzle client to `fn`, closes
 * on settle.
 */
export async function withDbFromEnv<T>(
  env: CloudflareBindings,
  fn: (db: AnyDrizzleDb) => Promise<T>,
): Promise<T> {
  const { db, dispose } = createServerlessDbClient(env.DATABASE_URL)
  try {
    return await fn(db)
  } finally {
    await dispose()
  }
}
