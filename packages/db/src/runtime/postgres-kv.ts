import { sql } from "drizzle-orm"

import type { AnyDrizzleDb } from "../index.js"

export interface PostgresKvStore {
  get<T = string>(key: string, options?: "json" | { type?: "json" | "text" }): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>
  /**
   * Store `value` only if `key` is absent (or expired). Returns true when this
   * caller performed the write, false when another holder already had it.
   */
  putIfAbsent(key: string, value: string, options?: { expirationTtl?: number }): Promise<boolean>
}

export interface PostgresKvStoreOptions {
  now?: () => number
  sweepIntervalMs?: number
}

type ExecuteDb = Pick<AnyDrizzleDb, "execute">
type KvRow = { value: string }
type KeyRow = { name: string }

const DEFAULT_SWEEP_INTERVAL_MS = 30_000

function rows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : []
}

/**
 * ISO text, not a `Date`. The postgres.js adapter cannot serialize a `Date`
 * bound through a raw `sql` template — it throws `ERR_INVALID_ARG_TYPE` — so
 * every TTL'd write here failed, and the middleware's best-effort catch
 * swallowed it. A timestamptz column parses the ISO form directly.
 */
function expiresAt(ttlSeconds: number | undefined, now: () => number): string | null {
  return ttlSeconds === undefined ? null : new Date(now() + ttlSeconds * 1000).toISOString()
}

function likePrefix(prefix: string): string {
  return `${prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
}

export function createPostgresKvStore(
  db: ExecuteDb,
  options: PostgresKvStoreOptions = {},
): PostgresKvStore {
  const now = options.now ?? Date.now
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  let lastSweepMs = 0

  async function sweepExpired(): Promise<void> {
    const current = now()
    if (current - lastSweepMs < sweepIntervalMs) return
    lastSweepMs = current
    await db.execute(sql`DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= now()`)
  }

  return {
    async get<T = string>(
      key: string,
      getOptions?: "json" | { type?: "json" | "text" },
    ): Promise<T | null> {
      await sweepExpired()
      const result = await db.execute<KvRow>(sql`
        SELECT value
        FROM kv_store
        WHERE key = ${key}
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `)
      const value = rows<KvRow>(result)[0]?.value
      if (value === undefined) return null
      const type = typeof getOptions === "string" ? getOptions : (getOptions?.type ?? "text")
      return (type === "json" ? JSON.parse(value) : value) as T
    },
    async put(key: string, value: string, putOptions?: { expirationTtl?: number }): Promise<void> {
      await sweepExpired()
      await db.execute(sql`
        INSERT INTO kv_store (key, value, expires_at, updated_at)
        VALUES (${key}, ${value}, ${expiresAt(putOptions?.expirationTtl, now)}, now())
        ON CONFLICT (key) DO UPDATE SET
          value = excluded.value,
          expires_at = excluded.expires_at,
          updated_at = now()
      `)
    },
    async putIfAbsent(
      key: string,
      value: string,
      putOptions?: { expirationTtl?: number },
    ): Promise<boolean> {
      await sweepExpired()
      // One statement decides presence and takes the slot. The insert either
      // wins outright or conflicts, and the conflicting path holds the row lock
      // while its WHERE re-reads the committed `expires_at`, so exactly one
      // concurrent caller can satisfy it. RETURNING yields a row only on the
      // branch that wrote, so a live holder produces zero rows and a false.
      const result = await db.execute<KeyRow>(sql`
        INSERT INTO kv_store (key, value, expires_at, updated_at)
        VALUES (${key}, ${value}, ${expiresAt(putOptions?.expirationTtl, now)}, now())
        ON CONFLICT (key) DO UPDATE SET
          value = excluded.value,
          expires_at = excluded.expires_at,
          updated_at = now()
        WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= now()
        RETURNING key AS name
      `)
      return rows<KeyRow>(result).length > 0
    },
    async delete(key: string): Promise<void> {
      await db.execute(sql`DELETE FROM kv_store WHERE key = ${key}`)
    },
    async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
      await sweepExpired()
      const prefix = options?.prefix ?? ""
      const result = await db.execute<KeyRow>(sql`
        SELECT key AS name
        FROM kv_store
        WHERE key LIKE ${likePrefix(prefix)} ESCAPE ${"\\"}
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY key
      `)
      return { keys: rows<KeyRow>(result).map((row) => ({ name: row.name })) }
    },
  }
}
