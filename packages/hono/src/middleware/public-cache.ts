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
  staleWhileRevalidate: number
}

function directiveSeconds(directive: string, name: string): number | null {
  const parsed = Number.parseInt(directive.slice(name.length + 1), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseCacheControl(value: string | null): CacheControlDirectives {
  const none: CacheControlDirectives = { isPublic: false, sMaxage: null, staleWhileRevalidate: 0 }
  if (!value) return none
  let isPublic = false
  let sMaxage: number | null = null
  let staleWhileRevalidate = 0
  for (const part of value.split(",")) {
    const directive = part.trim().toLowerCase()
    if (directive === "public") isPublic = true
    else if (directive === "private" || directive === "no-store") return none
    else if (directive.startsWith("s-maxage="))
      sMaxage = directiveSeconds(directive, "s-maxage") ?? sMaxage
    else if (directive.startsWith("stale-while-revalidate="))
      staleWhileRevalidate = directiveSeconds(directive, "stale-while-revalidate") ?? 0
  }
  return { isPublic, sMaxage, staleWhileRevalidate }
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
  /**
   * Epoch ms the entry stops being fresh, and the epoch ms past which it may
   * not be served at all.
   *
   * Freshness lives in the entry rather than in the backend's expiry, which is
   * what makes the declared `s-maxage` authoritative: Cloudflare KV refuses a
   * TTL under 60s and the in-process L1 caps its own promotion at 60s, and
   * neither of those storage constraints can now shorten or lengthen the
   * policy a route declared (ADR 0021 §4).
   *
   * Absent on entries written before SWR support; those are treated as fresh
   * for the remainder of their backend expiry, which is the old behaviour.
   */
  freshUntil?: number
  staleUntil?: number
}

type CacheEntryState = "fresh" | "stale"

interface KvHit {
  response: Response
  state: CacheEntryState
}

function kvKeyFor(url: string, variant: string): string {
  return `${KV_KEY_PREFIX}${variant}:${url}`
}

async function kvMatch(kv: KVStore, key: string, now: number): Promise<KvHit | undefined> {
  try {
    const entry = await kv.get<KvCachedResponse>(key, { type: "json" })
    if (!entry || typeof entry.body !== "string") return undefined
    const state: CacheEntryState =
      entry.freshUntil === undefined || now < entry.freshUntil ? "fresh" : "stale"
    // Past the stale-while-revalidate window the entry is not servable at all;
    // the backend just has not reclaimed it yet.
    if (state === "stale" && entry.staleUntil !== undefined && now >= entry.staleUntil) {
      return undefined
    }
    const headers = new Headers(entry.headers)
    headers.set("x-voyant-cache", state === "fresh" ? "hit" : "stale")
    return { response: new Response(entry.body, { status: entry.status, headers }), state }
  } catch {
    return undefined
  }
}

async function kvStore(
  kv: KVStore,
  key: string,
  res: Response,
  freshness: { sMaxage: number; staleWhileRevalidate: number },
  maxBodyBytes: number,
  now: number,
): Promise<void> {
  try {
    const body = await res.text()
    if (body.length > maxBodyBytes) return
    const headers: Array<[string, string]> = []
    res.headers.forEach((value, name) => {
      if (!isUncacheableHeader(name)) headers.push([name, value])
    })
    const entry: KvCachedResponse = {
      status: res.status,
      headers,
      body,
      freshUntil: now + freshness.sMaxage * 1000,
      staleUntil: now + (freshness.sMaxage + freshness.staleWhileRevalidate) * 1000,
    }
    await kv.put(key, JSON.stringify(entry), {
      // Storage lifetime, not policy: the row only has to outlive the window
      // in which the entry is servable. The KV floor can lengthen it and never
      // changes what the entry says about itself.
      expirationTtl: Math.max(
        KV_MIN_TTL_SECONDS,
        freshness.sMaxage + freshness.staleWhileRevalidate,
      ),
    })
  } catch {
    // cache writes are best-effort — never surface to the request
  }
}

/**
 * Per-process coalescing of concurrent misses on one key.
 *
 * Module-scoped on purpose: every request in this isolate shares it, so a
 * burst of arrivals after an entry lapses produces one origin computation
 * instead of one per arrival.
 */
const inFlight = new Map<string, Promise<void>>()

/**
 * Cross-process revalidator election. The winner refreshes the entry; every
 * loser just serves the stale copy it already has, so nobody waits and no
 * lock has to be released. The lease expires on its own, which bounds a lost
 * revalidation to one extra stale window rather than wedging the key.
 *
 * A backend without `putIfAbsent` cannot exclude, so every process
 * revalidates — degraded, not incorrect.
 */
async function electRevalidator(kv: KVStore, key: string, leaseSeconds: number): Promise<boolean> {
  if (!kv.putIfAbsent) return true
  try {
    return await kv.putIfAbsent(`${key}:revalidating`, "1", {
      expirationTtl: Math.max(KV_MIN_TTL_SECONDS, leaseSeconds),
    })
  } catch {
    return false
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
 * Expiry is a behaviour, not an event (ADR 0021 §5). Freshness is recorded on
 * the entry, so the declared `s-maxage` is authoritative regardless of what
 * the backend's own expiry can express. Inside the declared
 * `stale-while-revalidate` window a single elected arrival refreshes the entry
 * while every other arrival is served the stored copy immediately, and
 * concurrent cold misses on one key collapse onto one origin computation.
 * Without that, each lapse hands the full uncached latency to every arrival at
 * once, which is how a slow query becomes an outage.
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

    const executionCtx = tryGetExecutionCtx(c)
    /**
     * A write nobody waits on. Where the runtime has an ExecutionContext it
     * keeps the isolate alive for it; elsewhere the response has already been
     * returned and the promise settles on its own. Failures are contained
     * inside {@link kvStore}.
     */
    const background = (work: Promise<void>): void => {
      if (executionCtx) executionCtx.waitUntil(work)
      else void work.catch(() => {})
    }

    /**
     * Runs the route. Resolves as soon as the route has answered; the cache
     * write it schedules is exposed separately so the requester never waits
     * on it, while a coalesced waiter can.
     */
    let written: Promise<void> = Promise.resolve()
    const runRoute = async (): Promise<void> => {
      await next()

      const res = c.res
      if (res?.status !== 200) return
      if (res.headers.has("set-cookie")) return
      if (!isVaryModelledByKey(res.headers.get("vary"), keyHeaders)) return
      const { isPublic, sMaxage, staleWhileRevalidate } = parseCacheControl(
        res.headers.get("cache-control"),
      )
      if (!isPublic || !sMaxage) return

      const backendKv = c.env.CACHE
      if (!backendKv) return

      written = kvStore(
        backendKv,
        key,
        res.clone(),
        { sMaxage, staleWhileRevalidate },
        maxKvBodyBytes,
        Date.now(),
      )
      background(written)
    }

    if (!bypass && kv) {
      const hit = await kvMatch(kv, key, Date.now())
      if (hit?.state === "fresh") return hit.response
      if (hit?.state === "stale") {
        // One arrival refreshes the entry; every other arrival in the stale
        // window is served instantly from the copy already stored. That is
        // what removes the outage mode: a lapse costs one requester the origin
        // latency instead of all of them, and if that one abandons the request
        // the lease simply expires and the next arrival retries — the entry is
        // never left unrepopulated while everyone waits on it.
        //
        // The refresh is not moved behind the response, because it cannot be:
        // `next()` writes the route's response onto the context, and Hono
        // discards a handler response once the context is finalized (see
        // `compose`), so a refresh scheduled after this middleware returns
        // would re-store the stale body under a new freshness stamp — an entry
        // that looks refreshed and never changes.
        if (inFlight.has(key)) return hit.response

        // Claimed synchronously so siblings in this isolate serve stale
        // rather than racing to the same election.
        let release: (() => void) | undefined
        const claim = new Promise<void>((resolve) => {
          release = resolve
        })
        inFlight.set(key, claim)
        try {
          const { sMaxage, staleWhileRevalidate } = parseCacheControl(
            hit.response.headers.get("cache-control"),
          )
          if (!(await electRevalidator(kv, key, (sMaxage ?? 0) + staleWhileRevalidate))) {
            return hit.response
          }
          await runRoute()
          return
        } catch {
          // A failed refresh leaves the stale entry in place for the next
          // arrival to retry rather than failing this request.
          return hit.response
        } finally {
          release?.()
          if (inFlight.get(key) === claim) inFlight.delete(key)
        }
      }
    }

    // Cold miss. If this isolate is already computing this key, wait for that
    // computation and read its result instead of running the route again.
    const pending = bypass ? undefined : inFlight.get(key)
    if (pending) {
      await pending.catch(() => {})
      if (kv) {
        const filled = await kvMatch(kv, key, Date.now())
        if (filled?.state === "fresh") return filled.response
      }
    }

    const routeDone = runRoute()
    if (!bypass) {
      const settled = routeDone.then(() => written)
      inFlight.set(key, settled)
      void settled
        .catch(() => {})
        .finally(() => {
          if (inFlight.get(key) === settled) inFlight.delete(key)
        })
    }
    await routeDone
  }
}
