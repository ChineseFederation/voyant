import { createDbClient } from "../index.js"

export interface NodeDatabaseEnv {
  DATABASE_URL: string
  DATABASE_URL_DIRECT?: string
  DATABASE_URL_REPLICAS?: string
  /** Maximum postgres-js sockets owned by this resident process. Default: 4. */
  DATABASE_MAX_CONNECTIONS?: string
}

export type NodeDatabase = ReturnType<typeof createDbClient>

let pooledDatabase: { cacheKey: string; database: NodeDatabase } | undefined

/** Resolve the process-cached Postgres client for a resident Node deployment. */
export function resolveNodeDatabase(env: NodeDatabaseEnv): NodeDatabase {
  const url = env.DATABASE_URL_DIRECT?.trim() || env.DATABASE_URL?.trim()
  if (!url) throw new Error("Voyant Node runtime requires DATABASE_URL.")

  const replicas = parseReplicaUrls(env.DATABASE_URL_REPLICAS, url)
  const maxConnections = parseMaxConnections(env.DATABASE_MAX_CONNECTIONS)
  const cacheKey = `${url}\n${replicas.join("\n")}\nmax=${maxConnections}`
  if (pooledDatabase?.cacheKey !== cacheKey) {
    pooledDatabase = {
      cacheKey,
      database: createDbClient(url, {
        adapter: "node",
        nodeMaxConnections: maxConnections,
        ...(replicas.length > 0 ? { replicas } : {}),
      }),
    }
  }
  return pooledDatabase.database
}

/**
 * Keep resident serverless processes inside a predictable connection budget.
 * postgres-js otherwise defaults to ten sockets per process, which multiplies
 * quickly as Cloud Run adds instances. Four leaves headroom for migrations and
 * control-plane access while still allowing useful query parallelism.
 */
function parseMaxConnections(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 4
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("DATABASE_MAX_CONNECTIONS must be a positive integer.")
  }
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
