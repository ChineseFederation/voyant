import type { KVStore } from "@voyant-travel/utils/cache"
import type { MiddlewareHandler } from "hono"

import { tryGetExecutionCtx } from "../lib/execution-ctx.js"
import type { VoyantBindings } from "../types.js"

/**
 * Options for {@link publicResponseCache}.
 */
export interface PublicCacheOptions {
  /**
   * Path prefixes eligible for caching. Defaults to the public API
   * surface only — admin and legacy surfaces are never cached.
   */
  pathPrefixes?: string[]
  /**
   * Responses larger than this (in bytes, after text decoding) are not
   * stored in the KV fallback. Protects isolate memory and KV value
   * limits. Default 2 MiB. The Cache API path streams and is not
   * subject to this guard.
   */
  maxKvBodyBytes?: number
  /**
   * Request headers whose presented value selects the response variant.
   *
   * A shared entry may only be served to a request that would have produced
   * it, and the public surface is not scoped by URL alone: the storefront key
   * (`x-api-key`) resolves the storefront, and through it the sales channel
   * that scopes catalog publication. Two storefronts bound to different
   * channels can be served from one origin, so the URL is not a complete key.
   *
   * The presented values are hashed into the key rather than resolved, which
   * keeps the property that makes a hit worth having: no database connection,
   * no session lookup, no module-graph instantiation on the hit path.
   *
   * Defaults to `["x-api-key"]` (ADR 0021 §3).
   */
  keyHeaders?: string[]
}

const DEFAULT_PREFIXES = ["/v1/public/"]
const DEFAULT_MAX_KV_BODY_BYTES = 2 * 1024 * 1024
/**
 * `v2` keys carry a variant digest. The bump also strands every `v1` entry,
 * which was keyed on the URL alone and could therefore be shared across
 * storefront channels.
 */
const KV_KEY_PREFIX = "respcache:v2:"
/** Cloudflare KV rejects expirationTtl below 60 seconds. */
const KV_MIN_TTL_SECONDS = 60
const DEFAULT_KEY_HEADERS = ["x-api-key"]

/**
 * Headers never persisted into the shared cache: per-request identifiers
 * and CORS grants are recomputed for every requester (the cors middleware
 * runs upstream and decorates cache hits like any other response).
 */
function isUncacheableHeader(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === "set-cookie" || lower === "x-request-id" || lower.startsWith("access-control-")
}

interface CacheControlDirectives {
  isPublic: boolean
  sMaxage: number | null
}

function parseCacheControl(value: string | null): CacheControlDirectives {
  if (!value) return { isPublic: false, sMaxage: null }
  let isPublic = false
  let sMaxage: number | null = null
  for (const part of value.split(",")) {
    const directive = part.trim().toLowerCase()
    if (directive === "public") isPublic = true
    else if (directive === "private" || directive === "no-store") {
      return { isPublic: false, sMaxage: null }
    } else if (directive.startsWith("s-maxage=")) {
      const parsed = Number.parseInt(directive.slice("s-maxage=".length), 10)
      if (Number.isFinite(parsed) && parsed > 0) sMaxage = parsed
    }
  }
  return { isPublic, sMaxage }
}

/**
 * A `Vary` the cache key does not model makes the stored entry unservable:
 * the next requester matches the key but not the variant. Store only when
 * every listed field is already a key contributor (`Vary: *` never is).
 */
function isVaryModelledByKey(value: string | null, keyHeaders: string[]): boolean {
  if (!value) return true
  const modelled = new Set(keyHeaders.map((name) => name.toLowerCase()))
  const fields = value
    .split(",")
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean)
  if (fields.length === 0) return true
  return fields.every((field) => modelled.has(field))
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * Digest of the presented variant-selecting headers. Hashed rather than
 * embedded so a storefront key never lands in a KV key or a `kv_store` row.
 */
async function variantDigest(values: Array<string | undefined>): Promise<string> {
  const canonical = values.map((value) => value ?? "").join("\u0000")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))
  return hex(digest).slice(0, 32)
}

/** Test hook — resets the memoized Cache API probe state. */
export function resetPublicCacheStateForTests(): void {
  // Retained for test/import compatibility after removing the global Cache API path.
}

// ---- KV backend (Voyant Cloud namespaced workers) ----

interface KvCachedResponse {
  status: number
  headers: Array<[string, string]>
  body: string
}

function kvKeyFor(url: string, variant: string): string {
  return `${KV_KEY_PREFIX}${variant}:${url}`
}

async function kvMatch(kv: KVStore, key: string): Promise<Response | undefined> {
  try {
    const entry = await kv.get<KvCachedResponse>(key, { type: "json" })
    if (!entry || typeof entry.body !== "string") return undefined
    const headers = new Headers(entry.headers)
    headers.set("x-voyant-cache", "hit")
    return new Response(entry.body, { status: entry.status, headers })
  } catch {
    return undefined
  }
}

async function kvStore(
  kv: KVStore,
  key: string,
  res: Response,
  ttlSeconds: number,
  maxBodyBytes: number,
): Promise<void> {
  try {
    const body = await res.text()
    if (body.length > maxBodyBytes) return
    const headers: Array<[string, string]> = []
    res.headers.forEach((value, name) => {
      if (!isUncacheableHeader(name)) headers.push([name, value])
    })
    const entry: KvCachedResponse = { status: res.status, headers, body }
    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: Math.max(KV_MIN_TTL_SECONDS, ttlSeconds),
    })
  } catch {
    // cache writes are best-effort — never surface to the request
  }
}

/**
 * Shared response cache for the public API surface.
 *
 * Fail-closed by design: a response is only ever cached when the route
 * explicitly marked it shareable — `Cache-Control` containing `public`
 * AND a positive `s-maxage` — and it carries no `Set-Cookie`. Routes
 * emit `private`/`no-store` (or nothing) to opt out, so personalized
 * endpoints under `/v1/public/*` (customer portal, verification) are
 * never cached by accident.
 *
 * Cache hits are served before auth, the DB middleware, and the runtime
 * bootstrap — a hit costs no Postgres connection, no session lookup,
 * and no module-graph instantiation, which is the entire point under
 * storefront load (#1686).
 *
 * Scope of an entry: the request URL plus a digest of the variant-selecting
 * headers named by {@link PublicCacheOptions.keyHeaders} — by default the
 * storefront key, which resolves the sales channel that scopes catalog
 * publication. An `Authorization` request never reads or writes the shared
 * cache, and a response declaring a `Vary` the key does not model is not
 * stored (ADR 0021 §3).
 *
 * Backend selection: the injected `env.CACHE` {@link KVStore}. Node
 * composition decides whether that is memory, Postgres, Redis, or a tiered
 * store; this middleware never probes a global runtime cache.
 */
export function publicResponseCache<TBindings extends VoyantBindings>(
  options: PublicCacheOptions = {},
): MiddlewareHandler<{ Bindings: TBindings }> {
  const prefixes = options.pathPrefixes ?? DEFAULT_PREFIXES
  const maxKvBodyBytes = options.maxKvBodyBytes ?? DEFAULT_MAX_KV_BODY_BYTES
  const keyHeaders = options.keyHeaders ?? DEFAULT_KEY_HEADERS

  return async (c, next) => {
    if (c.req.method !== "GET") return next()
    const path = c.req.path
    if (!prefixes.some((prefix) => path.startsWith(prefix))) return next()
    // A credentialed request is outside the shared representation contract:
    // it is neither served from nor stored into an entry other requesters
    // can read. `Set-Cookie` on the response opts out on the way back.
    if (c.req.header("authorization")) return next()
    // Standard escape hatch: a requester (or a debugging operator) can
    // force revalidation with `Cache-Control: no-cache`.
    const requestDirective = c.req.header("cache-control")?.toLowerCase() ?? ""
    const bypass = requestDirective.includes("no-cache") || requestDirective.includes("no-store")

    const key = kvKeyFor(
      c.req.url,
      await variantDigest(keyHeaders.map((name) => c.req.header(name))),
    )
    const kv = c.env.CACHE

    if (!bypass && kv) {
      const hit = await kvMatch(kv, key)
      if (hit) return hit
    }

    await next()

    const res = c.res
    if (res?.status !== 200) return
    if (res.headers.has("set-cookie")) return
    if (!isVaryModelledByKey(res.headers.get("vary"), keyHeaders)) return
    const { isPublic, sMaxage } = parseCacheControl(res.headers.get("cache-control"))
    if (!isPublic || !sMaxage) return

    const backendKv = c.env.CACHE
    if (!backendKv) return

    const copy = res.clone()
    const store = (async () => {
      await kvStore(backendKv, key, copy, sMaxage, maxKvBodyBytes)
    })()

    const executionCtx = tryGetExecutionCtx(c)
    if (executionCtx) {
      executionCtx.waitUntil(store)
    } else {
      await store
    }
  }
}
