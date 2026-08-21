import type { Actor, VoyantPermission } from "@voyant-travel/core"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { Context, MiddlewareHandler } from "hono"

import { requireUserId } from "../auth/require-user.js"
import { tryGetExecutionCtx } from "../lib/execution-ctx.js"
import type {
  VoyantAuthIntegration,
  VoyantBindings,
  VoyantDb,
  VoyantRequestAuthContext,
  VoyantVariables,
} from "../types.js"
import { ApiHttpError, ForbiddenApiError, UnauthorizedApiError } from "../validation.js"

export type RequestPermissionDecision = "allowed" | "denied" | "unavailable"
export type RequestPermissionAuthorizer = (
  permission: VoyantPermission,
) => Promise<RequestPermissionDecision>

export function installRequestPermissionAuthorizer<TBindings extends VoyantBindings>(
  auth?: VoyantAuthIntegration<TBindings>,
): MiddlewareHandler<{ Bindings: TBindings; Variables: VoyantVariables }> {
  return async (c, next) => {
    c.set("authorizePermission", (permission: VoyantPermission) =>
      evaluateRequestPermission(c, c.get("db") as VoyantDb, permission, auth),
    )
    return next()
  }
}

/** Enforces a command-specific permission after the route's coarse guard. */
// biome-ignore lint/suspicious/noExplicitAny: accepts package route contexts with narrower Variables types.
export async function requireAdditionalPermission(c: Context<any>, permission: VoyantPermission) {
  const authorize = c.get("authorizePermission") as RequestPermissionAuthorizer | undefined
  if (!authorize) {
    throw new ApiHttpError("Request permission authorizer is unavailable", {
      status: 500,
      code: "permission_authorizer_unavailable",
    })
  }
  const decision = await authorize(permission)
  if (decision === "unavailable") {
    throw new ApiHttpError("Auth permission checker is unavailable", {
      status: 500,
      code: "permission_authorizer_unavailable",
    })
  }
  if (decision === "denied") throw new ForbiddenApiError()
}

/** Shared evaluator for coarse and command-specific permission checks. */
export async function evaluateRequestPermission<TBindings extends VoyantBindings>(
  // biome-ignore lint/suspicious/noExplicitAny: only framework auth variables are read from composed route contexts.
  c: Context<any>,
  db: VoyantDb,
  permission: VoyantPermission,
  auth?: VoyantAuthIntegration<TBindings>,
): Promise<RequestPermissionDecision> {
  const scopes = c.get("scopes") as string[] | null | undefined
  if (
    scopes &&
    hasApiKeyPermission(
      permissionStringsToPermissions(scopes),
      permission.resource,
      permission.action,
    )
  ) {
    return "allowed"
  }

  if (c.get("isInternalRequest")) return "denied"
  const userId = requireUserId(c)
  const actor = c.get("actor") as Actor | undefined
  if (!actor) throw new UnauthorizedApiError()
  if (!auth?.hasPermission) return "unavailable"

  const requestAuth: VoyantRequestAuthContext = {
    userId,
    actor,
    sessionId: c.get("sessionId"),
    organizationId: c.get("organizationId"),
    callerType: c.get("callerType"),
    scopes,
    isInternalRequest: c.get("isInternalRequest"),
    apiTokenId: c.get("apiTokenId"),
    apiKeyId: c.get("apiKeyId"),
  }
  return (await auth.hasPermission({
    request: c.req.raw,
    env: c.env,
    db,
    ctx: tryGetExecutionCtx(c),
    auth: requestAuth,
    permission,
  }))
    ? "allowed"
    : "denied"
}
