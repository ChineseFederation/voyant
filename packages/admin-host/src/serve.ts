import { serveStatic } from "@hono/node-server/serve-static"
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
  web.use("*", serveStatic({ root: options.clientAssetsDir }))
  web.all("*", (c) => options.app(c.req.raw, c.env, c.executionCtx))
  return web
}
