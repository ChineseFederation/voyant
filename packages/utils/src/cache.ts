/**
 * Unified Cache Utility
 *
 * Simple cache-aside pattern for all caching needs.
 * Supports Cloudflare KV (primary) with graceful fallback to no-op.
 *
 * Usage:
 *   const value = await cached('my-key', 300, () => fetchExpensiveData(), kv)
 *
 * Or with the class for more control:
 *   const cache = new Cache(kv)
 *   const value = await cache.get('key') ?? await cache.set('key', data, 300)
 *
 * Redis-backed caching is available through `createRedisKvStore`.
 */

/**
 * KV-compatible interface (works with Cloudflare KV)
 */
export interface KVStore {
  get<T = string>(key: string, options?: { type?: "json" | "text" }): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }>
  /**
   * Store `value` only if `key` is absent (or expired). Returns true when this
   * caller performed the write, false when another holder already had it.
   *
   * Optional: a store that cannot do this atomically must omit it entirely
   * rather than emulating it with get-then-put, which does not exclude.
   */
  putIfAbsent?(key: string, value: string, options?: { expirationTtl?: number }): Promise<boolean>
}

/**
 * Common TTL values (in seconds)
 */
export const TTL = {
  /** 1 minute */
  SHORT: 60,
  /** 5 minutes */
  MEDIUM: 300,
  /** 15 minutes */
  DEFAULT: 900,
  /** 1 hour */
  LONG: 3600,
  /** 24 hours */
  DAY: 86400,
  /** 7 days */
  WEEK: 604800,
  /** 30 days */
  MONTH: 2592000,
} as const

/**
 * Cache-aside helper function
 *
 * Tries to get value from cache, if miss, computes and caches the result.
 * Gracefully falls back to compute on any cache failure.
 *
 * @param key - Cache key (will be used as-is, add your own prefix)
 * @param ttlSeconds - Time to live in seconds
 * @param compute - Function to compute the value on cache miss
 * @param kv - Cloudflare KV namespace
 *
 * @example
 * const user = await cached(
 *   `user:${userId}`,
 *   TTL.MEDIUM,
 *   () => db.query.users.findFirst({ where: eq(users.id, userId) }),
 *   env.CACHE
 * )
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  kv?: KVStore | null,
): Promise<T> {
  // Try cache first
  if (kv) {
    try {
      const cached = await kv.get<T>(key, { type: "json" })
      if (cached !== null && cached !== undefined) {
        return cached
      }
    } catch (error) {
      console.warn(`[cache] Read error for ${key}:`, error)
      // Fall through to compute
    }
  }

  // Cache miss or error - compute fresh value
  const value = await compute()

  // Store in cache (fire-and-forget, don't block)
  if (kv && value !== null && value !== undefined) {
    kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch((error) => {
      console.warn(`[cache] Write error for ${key}:`, error)
    })
  }

  return value
}

/**
 * Cache class for more control over caching operations
 */
export class Cache {
  constructor(private kv: KVStore | null) {}

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null

    try {
      const value = await this.kv.get<T>(key, { type: "json" })
      return value ?? null
    } catch (error) {
      console.warn(`[cache] Get error for ${key}:`, error)
      return null
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.kv) return

    try {
      await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds })
    } catch (error) {
      console.warn(`[cache] Set error for ${key}:`, error)
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    if (!this.kv) return

    try {
      await this.kv.delete(key)
    } catch (error) {
      console.warn(`[cache] Del error for ${key}:`, error)
    }
  }

  /**
   * Delete multiple keys by pattern
   * Note: KV doesn't support pattern deletion natively, so we list and delete
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.kv?.list) return

    try {
      // Extract prefix from pattern (remove wildcards)
      const prefix = pattern.replace(/\*/g, "")
      const { keys } = await this.kv.list({ prefix })
      for (const key of keys) {
        await this.kv.delete(key.name)
      }
    } catch (error) {
      console.warn(`[cache] DelPattern error for ${pattern}:`, error)
    }
  }

  /**
   * Cache-aside helper
   */
  async cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    return cached(key, ttlSeconds, compute, this.kv)
  }
}

/**
 * Create a Cache instance from KV namespace
 */
export function createCache(kv?: KVStore | null): Cache {
  return new Cache(kv ?? null)
}

/**
 * Create a Cache instance from Cloudflare Workers env
 */
export function createCacheFromEnv(env: { CACHE?: KVStore }): Cache {
  return new Cache(env.CACHE ?? null)
}
