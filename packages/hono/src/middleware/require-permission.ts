import type { Actor, VoyantPermission } from "@voyant-travel/core"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { MiddlewareHandler } from "hono"

import { requireUserId } from "../auth/require-user.js"
import { tryGetExecutionCtx } from "../lib/execution-ctx.js"
import {
  type DbSource,
  selectDbFactory,
  type VoyantAuthIntegration,
  type VoyantBindings,
  type VoyantVariables,
} from "../types.js"
import { ForbiddenApiError, UnauthorizedApiError } from "../validation.js"
import { acquireRequestDb } from "./request-db.js"

export function requirePermission<TBindings extends VoyantBindings>(
  dbSource: DbSource<TBindings>,
  resource: string,
  action: string,
  opts?: {
    auth?: VoyantAuthIntegration<TBindings>
  },
): MiddlewareHandler<{
  Bindings: TBindings
  Variables: VoyantVariables
}> {
  return async (c, next) => {
    const permission: VoyantPermission = { resource, action }

    const scopes = c.get("scopes")
    if (
      scopes &&
      hasApiKeyPermission(
        permissionStringsToPermissions(scopes),
        permission.resource,
        permission.action,
      )
    ) {
      return next()
    }

    // An internal credential's configured scopes are a hard authorization
    // ceiling. An asserted acting user supplies attribution and delegated
    // identity; it must never turn a denied machine scope into a user-session
    // permission fallback.
    if (c.get("isInternalRequest")) {
      throw new ForbiddenApiError()
    }

    const userId = requireUserId(c)
    const actor = c.get("actor") as Actor | undefined
    if (!actor) {
      // Should be unreachable in well-wired apps: `requireActor` runs before
      // `requirePermission`. Throw rather than fabricate a default so callers
      // see the upstream wiring bug instead of a silent privilege grant.
      throw new UnauthorizedApiError()
    }

    if (!opts?.auth?.hasPermission) {
      return c.json({ error: "No auth permission checker configured" }, 500)
    }

    // Reuses the per-request client created by the auth/db middleware
    // upstream (same factory) instead of opening another Pool.
    const lease = acquireRequestDb(c, selectDbFactory(dbSource, c.req.path))

    try {
      const allowed = await opts.auth.hasPermission({
        request: c.req.raw,
        env: c.env,
        db: lease.db,
        // Guarded: Hono throws on `executionCtx` access outside Workers.
        ctx: tryGetExecutionCtx(c),
        auth: {
          userId,
          actor,
          sessionId: c.get("sessionId"),
          organizationId: c.get("organizationId"),
          callerType: c.get("callerType"),
          scopes,
          isInternalRequest: c.get("isInternalRequest"),
          apiTokenId: c.get("apiTokenId"),
          apiKeyId: c.get("apiKeyId"),
        },
        permission,
      })

      if (!allowed) {
        throw new ForbiddenApiError()
      }

      // `await` is load-bearing: a bare `return next()` would run the
      // `finally` (and release the shared client) as soon as the
      // downstream promise is created, while the route is still
      // querying it.
      return await next()
    } finally {
      await lease.release()
    }
  }
}
