import { createDbClient } from "../index.js"
import { dbClientDispose } from "../transaction-capability.js"

export interface NodeDatabaseEnv {
  DATABASE_URL: string
  DATABASE_URL_DIRECT?: string
  DATABASE_URL_REPLICAS?: string
  /** Maximum postgres-js sockets owned by this resident process. Default: 4. */
  DATABASE_MAX_CONNECTIONS?: string
  /** Maximum tenant-specific pools retained by one process. Default: 32. */
  DATABASE_MAX_TENANT_POOLS?: string
  /** Idle milliseconds before an unused tenant pool is evicted. Default: 300000. */
  DATABASE_TENANT_POOL_IDLE_MS?: string
}

export type NodeDatabase = ReturnType<typeof createDbClient>

interface PooledDatabase {
  cacheKey: string
  database: NodeDatabase
  active: number
  lastUsedAt: number
}

const pooledDatabases = new Map<string, PooledDatabase>()

/** Resolve the process-cached Postgres client for a resident Node deployment. */
export function resolveNodeDatabase(env: NodeDatabaseEnv): NodeDatabase {
  const url = env.DATABASE_URL_DIRECT?.trim() || env.DATABASE_URL?.trim()
  if (!url) throw new Error("Voyant Node runtime requires DATABASE_URL.")

  const replicas = parseReplicaUrls(env.DATABASE_URL_REPLICAS, url)
  const maxConnections = parseMaxConnections(env.DATABASE_MAX_CONNECTIONS)
  const cacheKey = `${url}\n${replicas.join("\n")}\nmax=${maxConnections}`
  let pooledDatabase = pooledDatabases.get(cacheKey)
  if (!pooledDatabase) {
    evictIdleDatabases(env)
    enforcePoolCapacity(env)
    pooledDatabase = {
      cacheKey,
      database: createDbClient(url, {
        adapter: "node",
        nodeMaxConnections: maxConnections,
        ...(replicas.length > 0 ? { replicas } : {}),
      }),
      active: 0,
      lastUsedAt: Date.now(),
    }
    pooledDatabases.set(cacheKey, pooledDatabase)
  }
  pooledDatabase.lastUsedAt = Date.now()
  return pooledDatabase.database
}

/** Hold a tenant pool for active work so idle eviction cannot close it mid-request/job. */
export function acquireNodeDatabase(env: NodeDatabaseEnv): {
  db: NodeDatabase
  release: () => void
} {
  const db = resolveNodeDatabase(env)
  const entry = [...pooledDatabases.values()].find((candidate) => candidate.database === db)
  if (!entry) throw new Error("Voyant Node database pool was not retained.")
  entry.active += 1
  let released = false
  return {
    db,
    release: () => {
      if (released) return
      released = true
      entry.active -= 1
      entry.lastUsedAt = Date.now()
    },
  }
}

function evictIdleDatabases(env: NodeDatabaseEnv): void {
  const idleMs = parsePositiveInteger(
    env.DATABASE_TENANT_POOL_IDLE_MS,
    300_000,
    "DATABASE_TENANT_POOL_IDLE_MS",
  )
  const cutoff = Date.now() - idleMs
  for (const [key, entry] of pooledDatabases) {
    if (entry.active === 0 && entry.lastUsedAt <= cutoff) evictDatabase(key, entry)
  }
}

function enforcePoolCapacity(env: NodeDatabaseEnv): void {
  const maximum = parsePositiveInteger(
    env.DATABASE_MAX_TENANT_POOLS,
    32,
    "DATABASE_MAX_TENANT_POOLS",
  )
  if (pooledDatabases.size < maximum) return
  const candidate = [...pooledDatabases.entries()]
    .filter(([, entry]) => entry.active === 0)
    .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0]
  if (!candidate) throw new Error("Voyant Node tenant database pool capacity is exhausted.")
  evictDatabase(candidate[0], candidate[1])
}

function evictDatabase(key: string, entry: PooledDatabase): void {
  pooledDatabases.delete(key)
  void dbClientDispose(entry.database)?.().catch((error) => {
    console.error("[node-database] tenant pool disposal failed", error)
  })
}

/**
 * Keep resident serverless processes inside a predictable connection budget.
 * postgres-js otherwise defaults to ten sockets per process, which multiplies
 * quickly as Cloud Run adds instances. Four leaves headroom for migrations and
 * control-plane access while still allowing useful query parallelism.
 */
function parseMaxConnections(raw: string | undefined): number {
  return parsePositiveInteger(raw, 4, "DATABASE_MAX_CONNECTIONS")
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer.`)
  return parsed
}

/**
 * Adapt the resident Node database to APIs that accept a lifecycle-aware
 * database resource. The process owns the pool, so request disposal is a no-op.
 */
export function openNodeDatabase(env: NodeDatabaseEnv): {
  db: NodeDatabase
  dispose: () => Promise<void>
} {
  return { db: resolveNodeDatabase(env), dispose: async () => {} }
}

/** Run an operation against the process-cached Node database. */
export async function withNodeDatabase<T>(
  env: NodeDatabaseEnv,
  operation: (database: NodeDatabase) => Promise<T>,
): Promise<T> {
  return operation(resolveNodeDatabase(env))
}

function parseReplicaUrls(raw: string | undefined, primaryUrl: string): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== primaryUrl)
}
