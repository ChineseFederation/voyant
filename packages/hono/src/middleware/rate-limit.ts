import { createLazyRedisClient, type LazyRedisClient } from "@voyant-travel/utils/redis-client"
import type { MiddlewareHandler } from "hono"

/**
 * Distributed-capable rate limiting (security finding C2).
 *
 * The limiter is split into two halves:
 *
 * - a {@link RateLimitStore} — the counting backend. Composition injects the
 *   selected provider; an in-memory Map remains the zero-configuration
 *   fallback for Node/dev/tests.
 * - the enforcement surface — the {@link rateLimit} Hono middleware and the
 *   imperative {@link enforceRateLimit} helper that route packages
 *   (storefront, bookings, …) call directly inside handlers.
 *
 * Keys always carry a client dimension: `lim:<bucket>:<clientKey>` where
 * `clientKey` is derived by {@link clientIpKey} (`cf-connecting-ip`, then
 * the first hop of `x-forwarded-for`, else `"anon"`). Window-keying is the
 * store's responsibility — the KV backend appends `:<windowKey>` so its
 * stored keys read `lim:<bucket>:<clientKey>:<windowKey>`; the CF binding
 * tracks its own configured period per key; the memory store keeps a
 * `resetAt` per key.
 *
 * `createApp` mounts default policies (tight on `/auth/*` POSTs, moderate
 * on unauthenticated public writes) — see `config.rateLimit` in types.ts.
 */

/** Result of a single limit check against a {@link RateLimitStore}. */
export interface RateLimitResult {
  allowed: boolean
  /** Requests left in the current window, when the backend can tell. */
  remaining?: number
  /** Seconds until the caller should retry, when the backend can tell. */
  retryAfterSeconds?: number
}

/**
 * A counting backend for the limiter. `limit()` records one hit for `key`
 * and reports whether the caller is still within `max` per `windowSeconds`.
 */
export interface RateLimitStore {
  limit(key: string, opts: { max: number; windowSeconds: number }): Promise<RateLimitResult>
}

/** A named limit applied to one logical traffic class. */
export interface RateLimitPolicy {
  /**
   * Namespace for the counter — requests in different buckets never share
   * a window (e.g. `"auth"`, `"public-write"`, `"booking-lookup"`).
   */
  bucket: string
  /** Maximum requests per window per client. */
  max: number
  /** Window length in seconds. */
  windowSeconds: number
  /**
   * Explicit backend. When omitted, {@link enforceRateLimit} resolves one
   * from the environment via {@link resolveRateLimitStore}.
   */
  store?: RateLimitStore
  /** Override the client dimension (defaults to {@link clientIpKey}). */
  clientKey?: (c: RateLimitRequestContext) => string
}

/**
 * `createApp({ rateLimit })` configuration. Defaults (when the key is
 * omitted entirely) are: `auth` = 10 POSTs/min/IP on `/auth/*`,
 * `publicWrite` = 60 writes/min/IP on `/v1/public/*` + `publicPaths`.
 * Set the whole config to `false` to disable, or set an individual
 * policy to `false` to disable just that policy.
 */
export interface RateLimitConfig {
  /**
   * Explicit store, or a function-of-bindings for stores built from env
   * bindings. When omitted — or when the function returns `undefined` —
   * resolution falls through to the injected `RATE_LIMIT_STORE`, then
   * in-memory.
   */
  store?: RateLimitStore | ((env: unknown) => RateLimitStore | undefined)
  /** POSTs to `/auth/*`. Default `{ max: 10, windowSeconds: 60 }`. */
  auth?: false | RateLimitRule
  /**
   * Writes (POST/PUT/PATCH/DELETE) to `/v1/public/*` and to
   * `config.publicPaths`. Default `{ max: 60, windowSeconds: 60 }`.
   */
  publicWrite?: false | RateLimitRule
}

/** A bare max-per-window pair for the built-in `createApp` policies. */
export interface RateLimitRule {
  max: number
  windowSeconds: number
}

/**
 * Minimal structural view of a Hono context — enough for key derivation,
 * store resolution, and response headers — so route packages can call
 * {@link enforceRateLimit} without generics gymnastics.
 */
export interface RateLimitRequestContext {
  req: { method: string; url: string; header(name: string): string | undefined }
  env: unknown
  header(name: string, value: string): void
}

/**
 * Derive the client dimension for rate-limit keys: `cf-connecting-ip`
 * (set by Cloudflare, not spoofable through the edge), `x-real-ip`, then the
 * first hop of `x-forwarded-for`, else `"anon"`. Exported so route packages
 * key their own limiters and idempotency scopes consistently.
 */
export function clientIpKey(c: { req: { header(name: string): string | undefined } }): string {
  const cfIp = c.req.header("cf-connecting-ip")?.trim()
  if (cfIp) return cfIp
  const realIp = c.req.header("x-real-ip")?.trim()
  if (realIp) return realIp
  const firstHop = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  if (firstHop) return firstHop
  return "anon"
}

// ---- Stores ----

/**
 * In-memory fixed-window store for Node, dev, and tests. Per-isolate —
 * on Workers every isolate counts independently, so treat it as a last
 * resort (still vastly better than nothing: an abusive client hammering
 * one isolate is throttled by that isolate). Expired windows are pruned
 * periodically on access; a hard `maxEntries` cap bounds memory.
 */
export function createMemoryRateLimitStore(options?: { maxEntries?: number }): RateLimitStore {
  const windows = new Map<string, { count: number; resetAtMs: number }>()
  const maxEntries = options?.maxEntries ?? 10_000
  let lastPruneMs = 0

  function prune(nowMs: number) {
    if (nowMs - lastPruneMs < 30_000 && windows.size <= maxEntries) return
    lastPruneMs = nowMs
    for (const [key, win] of windows) {
      if (win.resetAtMs <= nowMs) windows.delete(key)
    }
    if (windows.size > maxEntries) {
      // Still over after dropping expired windows — evict in insertion
      // order (oldest windows first) to stay bounded.
      const overflow = windows.size - maxEntries
      let dropped = 0
      for (const key of windows.keys()) {
        windows.delete(key)
        if (++dropped >= overflow) break
      }
    }
  }

  return {
    async limit(key, { max, windowSeconds }) {
      const nowMs = Date.now()
      prune(nowMs)
      const existing = windows.get(key)
      const win =
        existing && existing.resetAtMs > nowMs
          ? existing
          : { count: 0, resetAtMs: nowMs + windowSeconds * 1000 }
      win.count += 1
      windows.set(key, win)
      return {
        allowed: win.count <= max,
        remaining: Math.max(0, max - win.count),
        retryAfterSeconds: Math.max(1, Math.ceil((win.resetAtMs - nowMs) / 1000)),
      }
    },
  }
}

export interface RedisRateLimitStoreOptions {
  client?: LazyRedisClient
  keyPrefix?: string
}

function normalizeRedisRateLimitKeyPrefix(keyPrefix: string | undefined): string {
  if (keyPrefix === undefined || keyPrefix.length === 0) return ""
  if (hasControlCharacter(keyPrefix)) {
    throw new Error("Redis rate-limit keyPrefix must not contain control characters.")
  }
  return keyPrefix
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function createRedisRateLimitStore(
  redisUrl: string,
  options: RedisRateLimitStoreOptions = {},
): RateLimitStore {
  const lazyClient = options.client ?? createLazyRedisClient(redisUrl)
  const keyPrefix = normalizeRedisRateLimitKeyPrefix(options.keyPrefix)

  return {
    async limit(key, { max, windowSeconds }) {
      const client = await lazyClient.get()
      const nowSeconds = Math.floor(Date.now() / 1000)
      const windowKey = Math.floor(nowSeconds / windowSeconds)
      const storageKey = `${keyPrefix}${key}:${windowKey}`
      const count = await client.incr(storageKey)
      if (count === 1) {
        await client.expire(storageKey, Math.max(1, windowSeconds * 2))
      }
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        retryAfterSeconds: Math.max(1, windowSeconds - (nowSeconds % windowSeconds)),
      }
    },
  }
}

// ---- Store resolution ----

const explicitStoreCache = new WeakMap<object, RateLimitStore>()
const sharedMemoryStore = createMemoryRateLimitStore()
let warnedNoDistributedStore = false

function isDevLikeEnv(): boolean {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const nodeEnv = proc?.env?.NODE_ENV
  return nodeEnv === "test" || nodeEnv === "development"
}

/** Test-only: re-arm the once-per-isolate missing-store warning. */
export function resetRateLimitWarningsForTests(): void {
  warnedNoDistributedStore = false
}

/**
 * Resolve the best available store from the environment:
 * Injected `c.env.RATE_LIMIT_STORE` → in-memory fallback. **Fails open into
 * the memory store** —
 * rate limiting must never break Node/headless deployments that bind
 * neither — but warns once per isolate outside dev/test so a
 * production deploy without a distributed backend is visible in logs.
 */
export function resolveRateLimitStore(
  c: { env: unknown },
  memoryFallback: RateLimitStore = sharedMemoryStore,
): RateLimitStore {
  const env = (c.env ?? {}) as {
    RATE_LIMIT_STORE?: RateLimitStore
  }

  const explicit = env.RATE_LIMIT_STORE
  if (explicit && typeof explicit.limit === "function") {
    let store = explicitStoreCache.get(explicit)
    if (!store) {
      store = explicit
      explicitStoreCache.set(explicit, store)
    }
    return store
  }

  if (!warnedNoDistributedStore && !isDevLikeEnv()) {
    warnedNoDistributedStore = true
    console.warn(
      "[voyant] rate-limit: no distributed store available (inject RATE_LIMIT_STORE " +
        "). " +
        "Falling back to a per-isolate in-memory limiter — limits apply " +
        "per instance, not fleet-wide.",
    )
  }
  return memoryFallback
}

// ---- Enforcement ----

/**
 * Imperative limit check for route handlers. Records one hit for the
 * calling client against `policy` and returns `null` when allowed or a
 * ready-to-return `429` Response (with `Retry-After` and the
 * `X-RateLimit-*` headers the backend can populate) when over the limit.
 *
 * Fails open when the store itself errors — a broken KV namespace must
 * not take the API down.
 *
 * @example
 * const limited = await enforceRateLimit(c, {
 *   bucket: "booking-lookup",
 *   max: 20,
 *   windowSeconds: 60,
 * })
 * if (limited) return limited
 */
export async function enforceRateLimit(
  c: RateLimitRequestContext,
  policy: RateLimitPolicy,
): Promise<Response | null> {
  const store = policy.store ?? resolveRateLimitStore(c)
  const clientKey = (policy.clientKey ?? clientIpKey)(c)
  const key = `lim:${policy.bucket}:${clientKey}`

  let result: RateLimitResult
  try {
    result = await store.limit(key, { max: policy.max, windowSeconds: policy.windowSeconds })
  } catch {
    // Fail open: the limiter is a brake, not a load-bearing dependency.
    return null
  }

  c.header("X-RateLimit-Limit", String(policy.max))
  if (result.remaining !== undefined) {
    c.header("X-RateLimit-Remaining", String(result.remaining))
  }

  if (result.allowed) return null

  const retryAfterSeconds = result.retryAfterSeconds ?? policy.windowSeconds
  return new Response(JSON.stringify({ error: "Too Many Requests", code: "rate_limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      "retry-after": String(retryAfterSeconds),
      "x-ratelimit-limit": String(policy.max),
      "x-ratelimit-remaining": "0",
    },
  })
}

/**
 * Hono middleware form of {@link enforceRateLimit}. Mount on a route or
 * group:
 *
 *     app.post("/v1/public/leads", rateLimit({ bucket: "leads", max: 30, windowSeconds: 60 }), handler)
 */
export function rateLimit(policy: RateLimitPolicy): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next()
    const limited = await enforceRateLimit(c, policy)
    if (limited) return limited
    return next()
  }
}
