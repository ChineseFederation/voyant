import type { Actor } from "@voyant-travel/core"
import {
  type AccessCatalog,
  hasApiKeyPermission,
  permissionStringsToPermissions,
} from "@voyant-travel/types/api-keys"
import type { MiddlewareHandler } from "hono"
import type { AbsoluteClientAuthenticatedRoute } from "../client-authenticated-routes.js"
import { matchesClientAuthenticatedRoute } from "../client-authenticated-routes.js"
import { normalizePathname } from "../lib/public-paths.js"
import type { VoyantBindings, VoyantVariables } from "../types.js"

/**
 * Route surfaces exempt from the coarse method+path permission guard because
 * they enforce authorization at a finer grain internally: `_meta` (capability
 * discovery) and `mcp` (the agent tool server, which gates every tool by its own
 * `requiredScopes`). Neither is a real module name.
 */
const COARSE_GUARD_EXEMPT_RESOURCES = new Set(["_meta", "mcp"])

function isCoarseGuardExempt(resource: string | null): boolean {
  return resource !== null && COARSE_GUARD_EXEMPT_RESOURCES.has(resource)
}

function apiKeyResourceFromPath(pathname: string): string | null {
  const surfaceMatch = pathname.match(/^\/v1\/(?:admin|public)\/([^/]+)/)
  if (surfaceMatch?.[1]) return surfaceMatch[1]
  const legacyMatch = pathname.match(/^\/v1\/([^/]+)/)
  if (legacyMatch?.[1] && legacyMatch[1] !== "admin" && legacyMatch[1] !== "public") {
    return legacyMatch[1]
  }
  return null
}

function baseApiKeyPermissionActionsForMethod(method: string): string[] {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
      return ["read", "search"]
    case "POST":
      return ["write", "trigger", "relay"]
    case "PUT":
    case "PATCH":
      return ["write"]
    case "DELETE":
      return ["delete"]
    default:
      return []
  }
}

/**
 * Search endpoints accept complex request bodies, so they're exposed as `POST`
 * even though they're read-family operations. Without this, `POST
 * /v1/<surface>/catalog/search` would only accept `write`/`trigger`/`relay`,
 * and a `catalog:search`/`catalog:read`-scoped token would be rejected
 * (voyant#2649). Matching a `search` / `*-search` path segment (e.g.
 * `/catalog/search`, `/catalog/package-search`) keeps every other POST route
 * (product writes, bookings, pricing, …) gated on its normal write actions.
 */
function isSearchPath(pathname: string): boolean {
  // A segment that is `search` or ends in `-search` (e.g. `package-search`),
  // bounded so `/searchable` or `/researcher` don't count.
  return /(?:\/|-)search(?:\/|$)/.test(pathname)
}

/**
 * Inquiry association removals, which are WRITES on the Inquiry.
 *
 * Detaching a Product target or an attachment removes a link; the Product and
 * the Media asset both survive. The Inquiry action declarations classify both
 * under `crm:write` (inquiry-management-rfc §11.4), but the coarse guard maps
 * DELETE to `delete` alone, so a `crm:write` principal was refused before the
 * handler ran and the packaged UI's Detach / Remove controls 403'd for every
 * scoped staff session and API key (Codex review on voyant#4838).
 *
 * Deliberately NOT generalised to every `/attachments/{id}` DELETE: finance and
 * legal own routes of the same shape whose `delete` requirement is correct, and
 * loosening those is their owners' call, not this guard's.
 */
function isInquiryLinkRemovalPath(pathname: string): boolean {
  return /\/relationships\/inquiries\/[^/]+\/(?:targets|attachments)\/[^/]+$/.test(pathname)
}

function apiKeyPermissionActionsForMethod(method: string, pathname: string): string[] {
  const actions = baseApiKeyPermissionActionsForMethod(method)
  if (isSearchPath(pathname)) {
    return Array.from(new Set([...actions, "search", "read"]))
  }
  if (method.toUpperCase() === "DELETE" && isInquiryLinkRemovalPath(pathname)) {
    return Array.from(new Set([...actions, "write"]))
  }
  return actions
}

function hasAnyApiKeyPermission(
  scopes: string[] | null | undefined,
  resource: string,
  actions: string[],
  catalog?: AccessCatalog,
) {
  if (!scopes || scopes.length === 0) return false
  const permissions = permissionStringsToPermissions(scopes)
  return actions.some((action) => hasApiKeyPermission(permissions, resource, action, catalog))
}

/**
 * Staff-session RBAC enforcement (member-rbac-rfc, voyant#2085). Enforced **by
 * default**: every member's assigned scope set is checked across admin routes.
 * Full-access members hold `*` and bypass, so they're unaffected. The
 * `VOYANT_RBAC_ENFORCE` env var is a kill switch — set it to `0`/`false`/`off`
 * to disable enforcement (e.g. an emergency rollback) without a code change.
 * API-key scope enforcement is always on (unchanged).
 */
export function isStaffRbacEnforced(env: unknown): boolean {
  const value = (env as { VOYANT_RBAC_ENFORCE?: string } | undefined)?.VOYANT_RBAC_ENFORCE
  const normalized = value?.trim().toLowerCase()
  return !(normalized === "0" || normalized === "false" || normalized === "off")
}

export interface RequireActorOptions {
  /**
   * Deployment prefix stripped before deriving API-key/staff RBAC resources.
   * Keep this aligned with the app-level auth/public-path basePath.
   */
  basePath?: string
  /** Selected graph mount prefixes whose authorization resource differs from the URL segment. */
  resources?: readonly {
    path: string
    resource: string
    authorization?: "coarse" | "route"
  }[]
  accessCatalog?: AccessCatalog
  /** Exact admin protocol routes that authenticate their client in-band. */
  clientAuthenticatedRoutes?: readonly AbsoluteClientAuthenticatedRoute[]
}

function isRequireActorOptions(value: unknown): value is RequireActorOptions {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function authorizationForRequest(
  pathname: string,
  options: RequireActorOptions,
): { resource: string | null; authorization: "coarse" | "route" } {
  const override = [...(options.resources ?? [])]
    .sort((left, right) => right.path.length - left.path.length)
    .find(({ path }) => pathname === path || pathname.startsWith(`${path}/`))
  return {
    resource: override?.resource ?? apiKeyResourceFromPath(pathname),
    authorization: override?.authorization ?? "coarse",
  }
}

/**
 * Guards a route surface by actor type.
 *
 * Voyant exposes two API surfaces:
 * - `/v1/admin/*` — operator staff (`"staff"`)
 * - `/v1/public/*` — customers, partners, suppliers
 *
 * Requests carry an `actor` on `c.var`, typically set by `requireAuth` or a
 * custom `auth.resolve` integration.
 *
 * When the caller has no resolved actor, this middleware returns `401
 * Unauthorized`. Earlier versions defaulted unset callers to `"staff"` for
 * backwards compatibility, but that meant a misordered or missing auth
 * middleware silently granted operator privileges to anonymous traffic.
 * The default is now fail-closed.
 *
 * @example
 * app.use("/v1/admin/*", requireActor("staff"))
 * app.use("/v1/public/*", requireActor("customer", "partner", "supplier"))
 */
export function requireActor<TBindings extends VoyantBindings = VoyantBindings>(
  ...allowed: Actor[]
): MiddlewareHandler<{
  Bindings: TBindings
  Variables: VoyantVariables
}>
export function requireActor<TBindings extends VoyantBindings = VoyantBindings>(
  options: RequireActorOptions,
  ...allowed: Actor[]
): MiddlewareHandler<{
  Bindings: TBindings
  Variables: VoyantVariables
}>
export function requireActor<TBindings extends VoyantBindings = VoyantBindings>(
  ...args: [RequireActorOptions, ...Actor[]] | Actor[]
): MiddlewareHandler<{
  Bindings: TBindings
  Variables: VoyantVariables
}> {
  const options = isRequireActorOptions(args[0]) ? args[0] : {}
  const allowed = (isRequireActorOptions(args[0]) ? args.slice(1) : args) as Actor[]
  if (allowed.length === 0) {
    throw new Error("requireActor: must specify at least one allowed actor")
  }
  const allowSet = new Set<Actor>(allowed)

  return async (c, next) => {
    if (c.req.method === "OPTIONS") return next()
    if (c.get("isAnonymousRequest") && allowSet.has("customer") && !allowSet.has("staff")) {
      return next()
    }

    const pathname = normalizePathname(new URL(c.req.url).pathname, {
      basePath: options.basePath,
    })
    if (
      matchesClientAuthenticatedRoute(
        c.req.method,
        pathname,
        options.clientAuthenticatedRoutes ?? [],
      )
    ) {
      return next()
    }

    if (
      c.get("callerType") === "api_key" ||
      c.get("callerType") === "app" ||
      c.get("callerType") === "internal"
    ) {
      const { resource, authorization } = authorizationForRequest(pathname, options)

      // Coarse-guard-exempt surfaces. `_meta` (capability discovery) and `mcp`
      // (the agent tool server) are dispatch surfaces where authorization is
      // enforced at a finer grain than method+path: the MCP server filters and
      // gates each tool by its own `requiredScopes` (voyant#2792, D2). So any
      // authenticated key reaches them; a key with no relevant scopes simply
      // sees an empty tool list. Neither is a real module name.
      if (authorization === "route" || isCoarseGuardExempt(resource)) return next()

      const actions = apiKeyPermissionActionsForMethod(c.req.method, pathname)

      if (
        resource &&
        hasAnyApiKeyPermission(c.get("scopes"), resource, actions, options.accessCatalog)
      ) {
        return next()
      }

      return c.json({ error: "Forbidden: token missing required permission" }, 403)
    }

    const actor = c.get("actor") as Actor | undefined
    if (!actor) {
      return c.json(
        {
          error:
            "Unauthorized: actor not resolved. The auth pipeline did not assign an `actor` to this request. " +
            "If you set `auth.resolve` on `createApp({...})`, the returned object must include `actor` " +
            '(usually `"staff"` for admin sessions). Public routes should be listed in `publicPaths`.',
        },
        401,
      )
    }
    if (!allowSet.has(actor)) {
      return c.json({ error: "Forbidden: actor not permitted on this surface" }, 403)
    }

    // Granular RBAC for staff sessions (member-rbac-rfc, voyant#2085). A member
    // with an explicit, non-wildcard scope set is gated exactly like an API key:
    // resource from the path, action from the method. Full-access members hold
    // `*` (the default for unassigned members), so `hasAnyApiKeyPermission`
    // passes them — existing deployments are unaffected. Paths with no mapped
    // resource (e.g. `_meta`) stay open until a module is explicitly covered.
    if (actor === "staff" && c.get("callerType") === "session" && isStaffRbacEnforced(c.env)) {
      const scopes = c.get("scopes")
      const { resource, authorization } = authorizationForRequest(pathname, options)
      if (resource && authorization !== "route" && !isCoarseGuardExempt(resource)) {
        const actions = apiKeyPermissionActionsForMethod(c.req.method, pathname)
        if (!hasAnyApiKeyPermission(scopes, resource, actions, options.accessCatalog)) {
          return c.json({ error: "Forbidden: missing required permission" }, 403)
        }
      }
    }

    return next()
  }
}
