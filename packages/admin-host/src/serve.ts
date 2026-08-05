import { serveStatic } from "@hono/node-server/serve-static"
import {
  type LegacyRedirectsOptions,
  legacyRedirects,
} from "@voyant-travel/hono/middleware/legacy-redirects"
import { securityHeaders } from "@voyant-travel/hono/middleware/security-headers"
import type { ExecutionContext } from "hono"
import { Hono } from "hono"

const ADMIN_SSR_FALLBACK_CSP =
  "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; " +
  "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline'; connect-src 'self'"

/** Options for {@link serveAdminHost}. */
export interface ServeAdminHostOptions<Env extends object> {
  /**
   * Directory of built client assets (e.g. `dist/client`), served for
   * `/assets/*` and other public files before falling through to the app.
   */
  clientAssetsDir: string
  /**
   * The combined API + SSR app to fall through to for any request that is not a
   * built client asset. Receives the raw request, the request-scoped env
   * bindings, and the execution context.
   */
  app: (request: Request, env: Env, ctx: ExecutionContext) => Response | Promise<Response>
  /**
   * Where compatibility-redirect hits are counted. Defaults to the process-wide
   * binding in `@voyant-travel/core`, which is the store the acceptance
   * dashboard reads back — so the counter is wired by construction and a host
   * cannot accidentally serve redirects nobody is counting. Pass one only in a
   * test, or when the host owns a durable store it has not bound globally.
   */
  legacyPathUsage?: LegacyRedirectsOptions["store"]
}

/**
 * Build the Node serving seam for an admin application: a Hono app that
 * serves built client assets from `clientAssetsDir`, then falls through to the
 * combined API + SSR app for every non-asset route.
 *
 * The SSR handler renders the document shell for any non-asset route, so no
 * explicit SPA index fallback is needed. In dev the assets 404 here and are
 * served by Vite's own middleware instead.
 *
 * This packages the static-host + fall-through that admin hosts (the operator
 * starter and hosted admin deployments, voyant#3044) previously held
 * inline as a `web` Hono app.
 *
 * It also carries the compatibility redirects for the deep links the unified
 * Product/Departure model superseded (voyant#4038) — see the mount below for
 * why they belong here and nowhere else.
 */
export function serveAdminHost<Env extends object = Record<string, unknown>>(
  options: ServeAdminHostOptions<Env>,
): Hono<{ Bindings: Env }> {
  const web = new Hono<{ Bindings: Env }>()
  // Client-side navigation means every HTML document can render Payments.
  // Keep assets and API fall-through responses on the strict defaults.
  web.use(
    "*",
    securityHeaders({
      // TanStack Start currently emits inline hydration bootstrap scripts
      // without response CSP hashes/nonces. A downstream CSP still wins.
      contentSecurityPolicy: ADMIN_SSR_FALLBACK_CSP,
      preserveResponseContentSecurityPolicy: true,
      stripeConnect: { pathPrefixes: ["/"], documentResponsesOnly: true },
    }),
  )
  // Compatibility redirects for the deep-link families the unified
  // Product/Departure model superseded (voyant#4038). This is the only seam
  // that sees them: they are origin-root UI paths, so they never reach the
  // composed API app, and the SSR fall-through below would answer a superseded
  // bookmark with a not-found page. Mounted ahead of static serving and of the
  // API/SSR fall-through, and unconditionally — a redirect layer that a host
  // has to opt into is a redirect layer that eventually nobody opts into, and
  // an uncounted hit is indistinguishable from no hit at all.
  web.use("*", legacyRedirects({ store: options.legacyPathUsage }))
  web.use("*", serveStatic({ root: options.clientAssetsDir }))
  web.all("*", (c) => options.app(c.req.raw, c.env, c.executionCtx))
  return web
}
