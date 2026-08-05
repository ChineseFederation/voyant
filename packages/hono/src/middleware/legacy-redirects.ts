/**
 * Compatibility-redirect middleware for the four superseded first-party deep
 * link families (voyant#4038).
 *
 * The table, the successors and the usage counter all live in
 * `@voyant-travel/core`'s `legacy-compat` module; this is the HTTP edge that
 * makes them do something. One request in, one `308` out, one hit recorded —
 * so the "measured zero" the deletion gate waits for is measured against real
 * traffic rather than assumed.
 *
 * ## Where this is mounted, and where it deliberately is not
 *
 * Mounted by `serveAdminHost` (`@voyant-travel/admin-host`), which is the only
 * seam that sees these paths: the four legacy families are UI deep links at the
 * origin root (`/extras/:id`, `/catalog/scheduled/:id`, `/product/:id`,
 * `/availability/slots/:id`), and the operator host routes only `/api/*` into
 * the composed Hono API app. A bookmark to `/product/prod_9` never reaches
 * `mountApp`; it reaches the SSR handler, which renders a not-found page.
 *
 * It is deliberately NOT registered in `mountApp` alongside `cors` /
 * `securityHeaders`. A storefront deployment mounts the framework app at the
 * origin root and serves `/catalog/*slug` as real CMS content — auto-redirecting
 * `/catalog/scheduled/...` there would break a live public URL to fix an
 * operator bookmark. The compatibility table is scoped to first-party operator
 * surfaces, so its mounting is too.
 *
 * ## Ordering
 *
 * Mount before static-asset serving and before auth. A superseded bookmark must
 * answer identically to a logged-out browser and a logged-in one; making the
 * redirect conditional on a session would under-count exactly the traffic the
 * gate is trying to see.
 */

import {
  getLegacyPathUsageStore,
  type LegacyPathUsageStore,
  resolveAndCountLegacyRedirect,
} from "@voyant-travel/core"
import type { MiddlewareHandler } from "hono"

export interface LegacyRedirectsOptions {
  /**
   * Where hits are counted. Defaults to the process-wide binding from
   * `@voyant-travel/core`, which is the same store the acceptance dashboard
   * reads — pass one explicitly only in a test, or when a host owns a durable
   * store it has not bound globally.
   */
  store?: LegacyPathUsageStore
  /** Clock seam. Defaults to `Date`. */
  now?: () => Date
}

/**
 * Resolve a superseded deep link to its canonical successor, count the hit, and
 * answer with the redirect. Requests that are not superseded fall straight
 * through, so this is safe to mount on `*`.
 *
 * The query string is carried over verbatim and the fragment never reaches the
 * server, which is why `resolveLegacyRedirect` takes a pathname only. The
 * status comes from the table (`308`, method-preserving) rather than from here.
 */
export function legacyRedirects(options: LegacyRedirectsOptions = {}): MiddlewareHandler {
  const clock = options.now ?? (() => new Date())
  return async (c, next) => {
    const url = new URL(c.req.url)
    const redirect = await resolveAndCountLegacyRedirect(
      options.store ?? getLegacyPathUsageStore(),
      url.pathname,
      clock(),
    )
    if (!redirect) return next()
    return c.redirect(`${redirect.to}${url.search}`, redirect.status)
  }
}
