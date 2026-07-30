/**
 * Authorization (D2) for the MCP transport: each tool's `requiredScopes` are
 * checked against the caller's granted scopes with **AND** semantics.
 * Unauthorized tools are neither listed nor registered on the per-request
 * server, so they cannot be called.
 */
import type { ToolContext, ToolManifestEntry } from "@voyant-travel/tools"
import {
  type AccessCatalog,
  type ApiKeyPermissions,
  hasApiKeyPermission,
  permissionStringsToPermissions,
} from "@voyant-travel/types/api-keys"
import type { Context } from "hono"

/** Resolve the caller's granted permissions from `c.var.scopes`. */
export function callerPermissions(c: Context): ApiKeyPermissions {
  return permissionStringsToPermissions(callerGrantedScopes(c))
}

export async function buildAuthenticatedContext(
  c: Context,
  buildContext: (c: Context) => ToolContext | Promise<ToolContext>,
): Promise<ToolContext> {
  const context = await buildContext(c)
  return { ...context, scopes: callerGrantedScopes(c) }
}

export function callerGrantedScopes(c: Context): string[] {
  const scopes = (c.var as { scopes?: unknown }).scopes
  if (!Array.isArray(scopes)) return []
  return scopes.filter((scope): scope is string => typeof scope === "string" && scope.length > 0)
}

/** AND semantics — the caller must hold every one of the tool's required scopes. */
export function isAuthorized(
  tool: ToolManifestEntry,
  permissions: ApiKeyPermissions,
  accessCatalog: AccessCatalog,
  audience: ToolContext["audience"],
): boolean {
  if (tool.audience.allowed && !tool.audience.allowed.includes(audience)) return false
  return tool.requiredScopes.every((scope) => {
    const [resource, action] = scope.split(":")
    return Boolean(
      resource && action && hasApiKeyPermission(permissions, resource, action, accessCatalog),
    )
  })
}
