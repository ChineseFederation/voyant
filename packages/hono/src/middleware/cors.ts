import type { MiddlewareHandler } from "hono"

import type { VoyantBindings } from "../types.js"

interface CompiledAllowlist {
  entries: string[]
  /** Pre-compiled matcher per entry — equality check or wildcard RegExp. */
  matchers: Array<(origin: string) => boolean>
}

/**
 * Parsed allowlists keyed by the raw `CORS_ALLOWLIST` value. The env value
 * is constant per deployment (at most a handful of distinct values per
 * isolate across preview/production bindings), so the cache stays tiny —
 * but it saves a split + trim + wildcard RegExp compilation on every
 * request.
 */
const compiledAllowlists = new Map<string, CompiledAllowlist>()

function compileMatcher(pattern: string): (origin: string) => boolean {
  // Credentialed CORS must never turn a bare "*" into reflected allow-all.
  if (pattern === "*") return () => false
  if (!pattern.includes("*")) {
    return (origin) => origin === pattern
  }
  if (!pattern.startsWith("https://*.") || pattern.slice("https://*.".length).includes("*")) {
    return () => false
  }
  // Keep local development origins exact. A wildcard such as
  // `http://localhost:*` is too broad for credentialed requests.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  const regex = new RegExp(`^${escaped}$`)
  return (origin) => regex.test(origin)
}

function compileAllowlist(raw: string | undefined): CompiledAllowlist {
  const key = raw ?? ""
  const cached = compiledAllowlists.get(key)
  if (cached) return cached

  const entries = key
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const compiled: CompiledAllowlist = {
    entries,
    matchers: entries.map(compileMatcher),
  }
  compiledAllowlists.set(key, compiled)
  return compiled
}

function isAllowedOrigin(origin: string, allowlist: CompiledAllowlist): boolean {
  if (allowlist.entries.length === 0) return false
  return allowlist.matchers.some((matches) => matches(origin))
}

const DEFAULT_ALLOWED_REQUEST_HEADERS = new Set([
  "authorization",
  "content-type",
  "idempotency-key",
  "x-api-key",
  "x-request-id",
  "x-voyant-checkout-capability",
  "x-voyant-guest-booking-access",
  "x-voyant-public-origin",
])

function allowedRequestHeaders(requested: string | undefined): string {
  if (!requested) return "content-type, authorization"
  const allowed = requested
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter((header) => DEFAULT_ALLOWED_REQUEST_HEADERS.has(header))
  return allowed.length > 0 ? allowed.join(", ") : "content-type, authorization"
}

/**
 * Resolve the exact origin to echo for a customer-realm request, or `null` to
 * fall back to the static allowlist. Runs before the db middleware, so it owns
 * any db access. Provided by the auth integration (`resolveCorsOrigin`).
 */
export type DynamicCorsOriginResolver = (
  c: Parameters<MiddlewareHandler<{ Bindings: VoyantBindings }>>[0],
) => Promise<string | null> | string | null

export interface CorsOptions {
  /**
   * Per-storefront dynamic origin authorizer for the customer realm. When it
   * returns an origin, that specific origin is echoed with credentials — never
   * `*`. When it returns `null`, the request falls back to the static
   * `CORS_ALLOWLIST`. Only consulted for {@link CorsOptions.isDynamicPath}
   * matches, so admin/dash surfaces stay on the static allowlist.
   */
  resolveDynamicOrigin?: DynamicCorsOriginResolver
  /** Whether a pathname is eligible for dynamic per-storefront CORS. */
  isDynamicPath?: (pathname: string) => boolean
}

export function cors(options: CorsOptions = {}): MiddlewareHandler<{ Bindings: VoyantBindings }> {
  const { resolveDynamicOrigin, isDynamicPath } = options

  return async (c, next) => {
    const origin = c.req.header("origin") || ""
    const allowlist = compileAllowlist(c.env.CORS_ALLOWLIST)

    // Per-storefront dynamic CORS for the customer realm: an operator-configured
    // storefront authorizes its own declared origins via the resolver, so a
    // direct cross-origin SPA works without the origin sitting in the static env
    // allowlist. The resolver echoes only the specific request origin (never
    // `*`), and preflight is authorized without a key/cookie. A `null` result
    // means "no storefront allows this origin" — fall back to the static list.
    const dynamicEligible = Boolean(
      origin && resolveDynamicOrigin && (isDynamicPath?.(c.req.path) ?? true),
    )
    const dynamicOrigin = dynamicEligible ? await resolveDynamicOrigin!(c) : null
    const allowed = dynamicOrigin !== null || isAllowedOrigin(origin, allowlist)
    const echoOrigin = dynamicOrigin ?? origin

    if (origin && !allowed) {
      console.warn("[CORS] Origin not in allowlist - CORS headers will NOT be set", {
        origin,
        allowlist: allowlist.entries,
        path: c.req.path,
        method: c.req.method,
      })
    }

    if (c.req.method === "OPTIONS") {
      if (allowed) {
        c.header("Access-Control-Allow-Origin", echoOrigin)
        c.header("Vary", "Origin")
        c.header("Access-Control-Allow-Credentials", "true")
        c.header(
          "Access-Control-Allow-Headers",
          allowedRequestHeaders(c.req.header("access-control-request-headers")),
        )
        c.header(
          "Access-Control-Allow-Methods",
          c.req.header("access-control-request-method") || "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        )
      }
      return c.body(null, 204)
    }

    await next()

    if (allowed) {
      c.header("Access-Control-Allow-Origin", echoOrigin)
      c.header("Vary", "Origin")
      c.header("Access-Control-Allow-Credentials", "true")
    }
  }
}
