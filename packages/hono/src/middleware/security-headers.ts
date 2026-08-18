import type { MiddlewareHandler } from "hono"

import type { VoyantBindings } from "../types.js"

const DEFAULT_CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; " +
  "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
  "connect-src 'self'"

const STRIPE_CONNECT_CSP_SOURCES = [
  ["frame-src", "https://connect-js.stripe.com", "https://js.stripe.com"],
  ["img-src", "https://*.stripe.com"],
  ["script-src", "https://connect-js.stripe.com", "https://js.stripe.com"],
  ["style-src", "'sha256-0hAheEzaMe6uXIKV4EehS9pu1am1lj/KnnzrOYqckXk='"],
] as const

export interface StripeConnectSecurityHeadersScope {
  /**
   * URL path prefixes that render the managed Stripe Connect admin surface.
   * Prefixes match only the exact path or a slash-delimited descendant.
   */
  pathPrefixes: readonly string[]
  /** Restrict relaxation to HTML document responses, excluding APIs and assets. */
  documentResponsesOnly?: boolean
}

export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string | false
  hsts?: boolean
  /**
   * Extend a CSP already set by the downstream response instead of replacing
   * it. This preserves SSR-generated script hashes/nonces.
   */
  preserveResponseContentSecurityPolicy?: boolean
  /** Opt in only the admin routes that render Stripe Connect components. */
  stripeConnect?: StripeConnectSecurityHeadersScope
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  if (!prefix.startsWith("/")) return false
  const normalizedPrefix = prefix.length > 1 ? prefix.replace(/\/+$/, "") : prefix
  if (normalizedPrefix === "/") return true
  return path === normalizedPrefix || path.startsWith(`${normalizedPrefix}/`)
}

function isStripeConnectRequest(
  path: string,
  responseContentType: string | undefined,
  scope: StripeConnectSecurityHeadersScope | undefined,
): boolean {
  if (!scope?.pathPrefixes.some((prefix) => pathMatchesPrefix(path, prefix))) return false
  return (
    !scope.documentResponsesOnly ||
    responseContentType?.toLowerCase().includes("text/html") === true
  )
}

export function withStripeConnectCsp(contentSecurityPolicy: string): string {
  const directives = contentSecurityPolicy
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)

  for (const [name, ...sources] of STRIPE_CONNECT_CSP_SOURCES) {
    const index = directives.findIndex(
      (directive) => directive === name || directive.startsWith(`${name} `),
    )
    if (index === -1) {
      directives.push(`${name} ${sources.join(" ")}`)
      continue
    }

    const existing = new Set(directives[index]?.split(/\s+/).slice(1))
    const additions = sources.filter((source) => {
      if (existing.has(source)) return false
      // A hash alongside unsafe-inline causes browsers to ignore unsafe-inline.
      // The existing allowance already permits Stripe's empty style element.
      return !(name === "style-src" && existing.has("'unsafe-inline'"))
    })
    if (additions.length > 0) directives[index] += ` ${additions.join(" ")}`
  }

  return directives.join("; ")
}

export function securityHeaders<TBindings extends object = VoyantBindings>(
  options: SecurityHeadersOptions = {},
): MiddlewareHandler<{ Bindings: TBindings }> {
  const csp =
    options.contentSecurityPolicy === undefined ? DEFAULT_CSP : options.contentSecurityPolicy
  const hsts = options.hsts ?? true

  return async (c, next) => {
    await next()

    const stripeConnectRequest = isStripeConnectRequest(
      c.req.path,
      c.res.headers.get("Content-Type") ?? undefined,
      options.stripeConnect,
    )
    c.header("X-Content-Type-Options", "nosniff")
    c.header("Referrer-Policy", "strict-origin-when-cross-origin")
    c.header("X-Frame-Options", "DENY")
    c.header("Cross-Origin-Opener-Policy", stripeConnectRequest ? "unsafe-none" : "same-origin")
    const responseCsp = options.preserveResponseContentSecurityPolicy
      ? c.res.headers.get("Content-Security-Policy")
      : null
    const effectiveCsp = responseCsp ?? csp
    if (effectiveCsp) {
      c.header(
        "Content-Security-Policy",
        stripeConnectRequest ? withStripeConnectCsp(effectiveCsp) : effectiveCsp,
      )
    }
    if (hsts && new URL(c.req.url).protocol === "https:") {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    }
  }
}

/**
 * Whether a state-changing public request came from the same origin.
 *
 * Public browser mutations have no CSRF token — the capability is the public API
 * key, which a cross-site page can also read out of the storefront bundle. This
 * is the check that stops a third-party page driving a mutation with a key it
 * scraped: `Sec-Fetch-Site: cross-site` is refused outright, and the `Origin`
 * header must match the request's own origin.
 *
 * A **missing** `Origin` is refused too. Every browser sends it on a
 * cross-origin state-changing request, so its absence means either a non-browser
 * caller — which should be using a secret key against the same route — or a
 * browser old enough that the guarantee does not hold. Fail closed either way.
 *
 * Lives here rather than beside one route module because two packages need the
 * same answer: `public-api` guards shopping, `trips` guards trip selections.
 * Two copies of a security predicate is how the two drift apart.
 */
export function isSameOriginMutation(c: {
  req: { header(name: string): string | undefined; url: string }
}): boolean {
  if (c.req.header("sec-fetch-site") === "cross-site") return false
  const origin = c.req.header("origin")?.trim()
  if (!origin) return false
  try {
    return new URL(origin).origin === new URL(c.req.url).origin
  } catch {
    return false
  }
}
