/**
 * The PK/SK capability line (voyant#4625).
 *
 * `vpk_`/`vsk_` existed at issuance, in storage and on an admin label, and
 * nothing anywhere branched on them for authorization: no route required a
 * secret key and none was denied to a publishable one. A leaked `vpk_` could
 * commit a booking and open a payment session, bounded only by an `Origin`
 * header — which is a browser control, not a boundary. Any non-browser client
 * sets `Origin` freely, and the origins themselves are operator-declared with
 * no proof of ownership.
 *
 * This middleware is that line, and it is the only place the decision is made.
 *
 * It runs AFTER `requireAuth`, which is what makes it precise rather than
 * approximate. Two facts decide a request, and only one of them is legible
 * before authentication:
 *
 *  - the storefront key kind, read from the token prefix (pre-auth, a ceiling —
 *    a garbage token starting with `vsk_` gains nothing by being classified);
 *  - the credential class that actually admitted the request, which only
 *    `requireAuth` knows.
 *
 * A deployment's own server credentials (`INTERNAL_API_KEY`, a `voy_`
 * deployment key) are not browser credentials and are not what this line is
 * about, so a request admitted by one passes through. Everything else on
 * `/v1/public/*` — a publishable key, a customer session, an anonymous guest —
 * is held to the declared allow-list.
 *
 * Holding the KEYLESS request to the same list is the load-bearing part. The
 * storefront behind a public request is resolved by key *or* by origin
 * (`resolveStorefrontByOrigin`), so a caller who simply omits the `vpk_` still
 * gets a storefront channel. If only `vpk_`-bearing requests were checked, the
 * whole line would be bypassed by deleting a header.
 *
 * Anonymity is a separate axis and is never consulted here. `anonymous` says a
 * route needs no customer session; `publishable` says a credential that ships
 * in a browser bundle may call it. A route can be both, either, or neither.
 */
import { classifyStorefrontKeyToken, STOREFRONT_KEY_HEADER } from "@voyant-travel/core"
import type { MiddlewareHandler } from "hono"

import { extractBearerToken } from "../auth/session-jwt.js"
import { matchesPublicPath, normalizePathname } from "../lib/public-paths.js"
import type { VoyantBindings, VoyantVariables } from "../types.js"

export interface KeyCapabilityOptions {
  /**
   * Absolute `/v1/public/*` paths a publishable key may call, assembled from
   * `publishable` declarations. An empty list denies the whole public surface
   * to publishable keys — that is the intended reading, not a misconfiguration.
   */
  publishablePaths?: readonly string[]
  /**
   * Absolute `/v1/public/*` paths that capture person data with nothing
   * challenging the submitter. Reachable with a publishable key only when
   * {@link publicIntakeGuarded} is true.
   */
  guardedIntakePaths?: readonly string[]
  /**
   * Whether this deployment has wired an intake guard (a CAPTCHA, a
   * proof-of-work, whatever it chose). Defaults to `false`, which is the
   * fail-closed reading: with nothing challenging the submitter, a credential
   * that ships in a browser bundle is not enough to capture a person's details.
   */
  publicIntakeGuarded?: boolean
  /** Deployment prefix stripped before matching, mirroring `requireAuth`. */
  basePath?: string
}

/**
 * Read the storefront key a request presents.
 *
 * Canonically `x-api-key`, which is what every storefront client and the
 * customer-auth resolver already use. `Authorization: Bearer vsk_…` is also
 * read, because a server-to-server caller naturally reaches for the standard
 * bearer header. The header wins: a request carrying both is classified on the
 * storefront-specific one, so a bearer token cannot be used to talk the line
 * out of looking at the `x-api-key` that is actually doing the work.
 */
function presentedStorefrontKey(
  headerValue: string | undefined,
  authorization: string | undefined,
): string | undefined {
  const direct = headerValue?.trim()
  if (direct) return direct
  return extractBearerToken(authorization) ?? undefined
}

export function requireKeyCapability<TBindings extends VoyantBindings>(
  opts: KeyCapabilityOptions = {},
): MiddlewareHandler<{ Bindings: TBindings; Variables: VoyantVariables }> {
  const publishablePaths = opts.publishablePaths ?? []
  const guardedIntakePaths = opts.guardedIntakePaths ?? []

  return async (c, next) => {
    // Preflight carries neither credentials nor cookies; CORS authorization is
    // decided elsewhere and a 403 here would break the real request's preflight.
    if (c.req.method === "OPTIONS") return next()

    const kind = classifyStorefrontKeyToken(
      presentedStorefrontKey(
        c.req.header(STOREFRONT_KEY_HEADER),
        c.req.header("authorization") ?? c.req.header("Authorization"),
      ),
    )
    if (kind) c.set("storefrontKeyKind", kind)

    const pathname = normalizePathname(new URL(c.req.url).pathname, { basePath: opts.basePath })
    const isPublicSurface = pathname === "/v1/public" || pathname.startsWith("/v1/public/")
    if (!isPublicSurface) return next()

    // A secret key carries the storefront's full, scoped trust and is
    // server-only, so it reaches the whole public surface.
    if (kind === "secret") return next()

    // The deployment's own server credentials are a different credential class
    // and predate this line; they are not what a browser holds.
    const callerType = c.get("callerType")
    if (callerType === "internal" || callerType === "api_key") return next()

    if (matchesPublicPath(pathname, guardedIntakePaths)) {
      if (opts.publicIntakeGuarded) return next()
      return c.json(
        {
          error:
            "This endpoint captures personal details and needs an intake guard before a publishable key may call it. Use a secret key, or configure an intake guard on this deployment.",
          code: "intake_guard_required",
        },
        403,
      )
    }

    if (matchesPublicPath(pathname, publishablePaths)) return next()

    return c.json(
      {
        error:
          "This endpoint requires a secret storefront key. Publishable keys reach only endpoints declared publishable.",
        code: "secret_key_required",
      },
      403,
    )
  }
}
