import { neon, Pool, type PoolConfig } from "@neondatabase/serverless"
import type { NeonHttpDatabase } from "drizzle-orm/neon-http"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import type { NeonDatabase as NeonWsDatabase } from "drizzle-orm/neon-serverless"
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless"
import { withReplicas } from "drizzle-orm/pg-core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import {
  type DbTimeoutOptions,
  resolveNodePostgresOptions,
  resolveServerlessPoolConfig,
  warnIfDirectNeonEndpoint,
} from "./connection-config.js"
import { VOYANT_DB_DISPOSE, VOYANT_DB_SUPPORTS_TRANSACTIONS } from "./transaction-capability.js"

export type DbAdapter = "edge" | "node" | "serverless"

export interface DisposableDbClient<TDb = AnyDrizzleDb> {
  db: TDb
  dispose: () => Promise<void>
}

export interface DbClientOptions<TSchema extends Record<string, unknown> = Record<string, never>> {
  schema?: TSchema
  adapter?: DbAdapter
  replicas?: string[]
  nodeMaxConnections?: number
  /** Seconds before an idle Node/postgres-js socket closes. Default: 30. */
  nodeIdleTimeoutSeconds?: number | false
  serverlessPool?: Omit<PoolConfig, "connectionString">
  /**
   * Query/connection timeouts (ms) applied per adapter. Defaults:
   * `statementMs: 10_000`, `queryMs: 15_000`, `connectMs: 10_000` — queries
   * now fail fast instead of pinning a Worker isolate for its full lifetime.
   * Pass `false` per field to disable. The `edge` (neon-http) adapter does
   * not support client-side timeouts and ignores this option entirely —
   * http queries rely on the server-side default `statement_timeout` and
   * the Workers runtime's own limits. See {@link DbTimeoutOptions}.
   */
  timeouts?: DbTimeoutOptions
}

function tagTransactionCapability<TDb extends object>(
  db: TDb,
  supportsTransactions: boolean,
  dispose?: () => Promise<void>,
): TDb {
  Object.defineProperty(db, VOYANT_DB_SUPPORTS_TRANSACTIONS, {
    value: supportsTransactions,
    enumerable: false,
    configurable: false,
  })
  if (dispose) {
    Object.defineProperty(db, VOYANT_DB_DISPOSE, {
      value: dispose,
      enumerable: false,
      configurable: false,
    })
  }
  return db
}

/**
 * Union of the drizzle driver flavors a Voyant deployment can wire up:
 * `PostgresJsDatabase` (node adapter / direct TCP), `NeonHttpDatabase`
 * (edge adapter / Neon HTTP), and `NeonWsDatabase` (edge adapter / Neon
 * serverless WebSocket — the only Workers-compatible flavor that
 * supports real Postgres transactions). Use this as the parameter type
 * for `resolveDb`-style callbacks in module factories so consumers
 * don't need `as unknown as ...` casts when wiring different drivers.
 */
export type AnyDrizzleDb<TSchema extends Record<string, unknown> = Record<string, never>> =
  | PostgresJsDatabase<TSchema>
  | NeonHttpDatabase<TSchema>
  | NeonWsDatabase<TSchema>

type RuntimeEnv = Record<string, string | undefined>

function runtimeEnv(): RuntimeEnv {
  return (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {}
}

export function createDbClient<TSchema extends Record<string, unknown> = Record<string, never>>(
  connectionString: string,
  options?: DbClientOptions<TSchema>,
) {
  const {
    adapter = (runtimeEnv().DB_ADAPTER as DbAdapter) || "edge",
    schema,
    replicas = [],
    nodeMaxConnections,
    nodeIdleTimeoutSeconds,
    timeouts,
  } = options || {}

  if (adapter === "node") {
    const nodeOptions = resolveNodePostgresOptions({
      max: nodeMaxConnections,
      idleSeconds: nodeIdleTimeoutSeconds,
      timeouts,
    })
    const client = postgres(connectionString, nodeOptions)
    const primary = tagTransactionCapability(
      schema ? drizzlePostgres(client, { schema }) : drizzlePostgres(client),
      true,
    )

    if (replicas.length === 0) {
      return primary
    }

    const replicaInstances = replicas.map((replicaUrl) => {
      const replicaClient = postgres(replicaUrl, nodeOptions)
      return schema ? drizzlePostgres(replicaClient, { schema }) : drizzlePostgres(replicaClient)
    })
    const [firstReplica, ...otherReplicas] = replicaInstances
    if (firstReplica) {
      return tagTransactionCapability(withReplicas(primary, [firstReplica, ...otherReplicas]), true)
    }
    return primary
  }

  if (adapter === "serverless") {
    if (replicas.length > 0) {
      throw new Error("DB_ADAPTER=serverless does not support read replicas")
    }
    return createServerlessDbClient(connectionString, {
      schema,
      pool: options?.serverlessPool,
      timeouts,
    }).db
  }

  // edge (neon-http): the Neon HTTP client has no client-side query/statement
  // timeout config — queries rely on the server-side default statement_timeout
  // and the Workers runtime's own request limits. A follow-up handles request
  // deadlines at a different layer; do NOT try to bolt timeouts on here.
  const sql = neon(connectionString)
  const primary = tagTransactionCapability(
    schema ? drizzleNeon(sql, { schema }) : drizzleNeon(sql),
    false,
  )

  if (replicas.length === 0) {
    return primary
  }

  const replicaInstances = replicas.map((replicaUrl) => {
    const replicaSql = neon(replicaUrl)
    return schema ? drizzleNeon(replicaSql, { schema }) : drizzleNeon(replicaSql)
  })

  const [firstReplica, ...otherReplicas] = replicaInstances
  if (firstReplica) {
    return tagTransactionCapability(withReplicas(primary, [firstReplica, ...otherReplicas]), false)
  }

  return primary
}

/**
 * Create a per-request Neon WebSocket pool + drizzle client.
 *
 * Timeout defaults (overridable via `timeouts`, or per-field via `pool`):
 * `statement_timeout: 10_000`, `query_timeout: 15_000`,
 * `connectionTimeoutMillis: 10_000`. Both `statement_timeout` (server-side)
 * and `query_timeout` (client-side) are set because transaction-mode poolers
 * (PgBouncer) may ignore `statement_timeout` as a startup parameter — see
 * {@link resolveServerlessPoolConfig}.
 *
 * Warns (once per connection string) when pointed at a Neon direct endpoint
 * instead of the `-pooler` host.
 */
export function createServerlessDbClient<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  connectionString: string,
  options?: {
    schema?: TSchema
    pool?: Omit<PoolConfig, "connectionString">
    timeouts?: DbTimeoutOptions
  },
): DisposableDbClient<NeonWsDatabase<TSchema>> {
  warnIfDirectNeonEndpoint(connectionString)
  const pool = new Pool(resolveServerlessPoolConfig(connectionString, options))
  const dispose = () => pool.end().catch(() => {})
  const db = tagTransactionCapability(
    options?.schema
      ? drizzleNeonServerless(pool, { schema: options.schema })
      : drizzleNeonServerless(pool),
    true,
    dispose,
  ) as NeonWsDatabase<TSchema>

  return {
    db,
    dispose,
  }
}

/**
 * Run `fn` with a scoped transaction-capable client (Neon WebSocket
 * Pool), disposing it on settle. For code paths that need
 * `db.transaction(...)` but run outside the request middleware that
 * normally provides the transactional client — event handlers, workflow
 * steps, scheduled jobs, scripts.
 *
 *     const result = await withServerlessDb(env.DATABASE_URL, (db) =>
 *       db.transaction(async (tx) => { ... }),
 *     )
 */
export async function withServerlessDb<
  T,
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  connectionString: string,
  fn: (db: NeonWsDatabase<TSchema>) => Promise<T>,
  options?: {
    schema?: TSchema
    pool?: Omit<PoolConfig, "connectionString">
    timeouts?: DbTimeoutOptions
  },
): Promise<T> {
  const { db, dispose } = createServerlessDbClient<TSchema>(connectionString, options)
  try {
    return await fn(db)
  } finally {
    await dispose()
  }
}

/**
 * Get the main database instance for the configured `DATABASE_URL`.
 * (Single-database deployments; region is chosen per deployment.)
 */
export function getDb(adapter?: DbAdapter) {
  const url = runtimeEnv().DATABASE_URL!
  return createDbClient(url, { adapter })
}

// Lazy default database instance
let _defaultDb: ReturnType<typeof createDbClient> | null = null

function getDefaultDbInstance() {
  if (!_defaultDb) {
    const defaultAdapter = (runtimeEnv().DB_ADAPTER as DbAdapter) || "edge"
    if (defaultAdapter === "serverless") {
      throw new Error(
        "The global @voyant-travel/db proxy cannot use DB_ADAPTER=serverless. Use createServerlessDbClient() per request and dispose it after use.",
      )
    }
    _defaultDb = getDb(defaultAdapter)
  }
  return _defaultDb
}

// Export a default, ready-to-use instance with lazy initialization
export const db = new Proxy({} as ReturnType<typeof createDbClient>, {
  get(target, prop) {
    void target
    return getDefaultDbInstance()[prop as keyof ReturnType<typeof createDbClient>]
  },
})

export * from "./booking-finance-fence.js"
// Re-export lib utilities
export * from "./connection-config.js"
export * from "./helpers.js"
export * from "./lib/index.js"
export * from "./lifecycle.js"
// Re-export queries
export * from "./queries/index.js"
export { withOptionalTransaction } from "./transaction.js"
export * from "./transaction-capability.js"
export * from "./types.js"
export * from "./utils.js"
