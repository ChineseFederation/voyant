import { sql } from "drizzle-orm"

import type { AnyDrizzleDb } from "../index.js"

export interface RateLimitResult {
  allowed: boolean
  remaining?: number
  retryAfterSeconds?: number
}

export interface FixedWindowRateLimitStore {
  limit(key: string, opts: { max: number; windowSeconds: number }): Promise<RateLimitResult>
}

export interface PostgresRateLimitStoreOptions {
  now?: () => number
  sweepIntervalMs?: number
}

type ExecuteDb = Pick<AnyDrizzleDb, "execute">
type CounterRow = { count: number | string; expiresAt: Date | string }

const DEFAULT_SWEEP_INTERVAL_MS = 30_000

function rows<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : []
}

function readCount(value: number | string | undefined): number {
  return typeof value === "number" ? value : Number(value ?? 0)
}

export function createPostgresFixedWindowRateLimitStore(
  db: ExecuteDb,
  options: PostgresRateLimitStoreOptions = {},
): FixedWindowRateLimitStore {
  const now = options.now ?? Date.now
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  let lastSweepMs = 0

  async function sweepExpired(): Promise<void> {
    const current = now()
    if (current - lastSweepMs < sweepIntervalMs) return
    lastSweepMs = current
    await db.execute(sql`DELETE FROM fixed_window_rate_limits WHERE expires_at <= now()`)
  }

  return {
    async limit(key, { max, windowSeconds }) {
      await sweepExpired()
      const nowSeconds = Math.floor(now() / 1000)
      const window = Math.floor(nowSeconds / windowSeconds)
      const expiresAt = new Date((window + 1) * windowSeconds * 1000)
      // Bound as ISO text: postgres.js cannot serialize a `Date` through a raw
      // `sql` template, so binding the object threw on every call.
      const expiresAtIso = expiresAt.toISOString()
      // `window` is a reserved word: Postgres rejects it unquoted in a column
      // list or a conflict target, so every statement here must quote it. The
      // drizzle schema quotes identifiers for us; this raw SQL does not.
      const result = await db.execute<CounterRow>(sql`
        INSERT INTO fixed_window_rate_limits (key, "window", count, expires_at, updated_at)
        VALUES (${key}, ${window}, 1, ${expiresAtIso}, now())
        ON CONFLICT (key, "window") DO UPDATE SET
          count = fixed_window_rate_limits.count + 1,
          expires_at = GREATEST(fixed_window_rate_limits.expires_at, excluded.expires_at),
          updated_at = now()
        RETURNING count, expires_at AS "expiresAt"
      `)
      const row = rows<CounterRow>(result)[0]
      const count = readCount(row?.count)
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now()) / 1000)),
      }
    },
  }
}
