import type { VoyantPermission } from "@voyant-travel/core"
import type { MiddlewareHandler } from "hono"

import {
  type DbSource,
  selectDbFactory,
  type VoyantAuthIntegration,
  type VoyantBindings,
  type VoyantVariables,
} from "../types.js"
import { ForbiddenApiError } from "../validation.js"
import { acquireRequestDb } from "./request-db.js"
import { evaluateRequestPermission } from "./request-permission.js"

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

    // Reuses the per-request client created by the auth/db middleware
    // upstream (same factory) instead of opening another Pool.
    const lease = acquireRequestDb(c, selectDbFactory(dbSource, c.req.path))

    try {
      const decision = await evaluateRequestPermission(c, lease.db, permission, opts?.auth)
      if (decision === "unavailable") {
        return c.json({ error: "No auth permission checker configured" }, 500)
      }
      if (decision === "denied") throw new ForbiddenApiError()

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
