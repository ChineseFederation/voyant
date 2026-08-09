import {
  type ActionLedgerRequestContextValues,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import type { NavigationVisibilityMap } from "./contracts.js"
import {
  getNavigationPreferences,
  setMemberNavigationPreferences,
  setOrganizationNavigationPreferences,
} from "./service.js"
import type { NavigationPreferencesToolServices } from "./tools.js"

export * from "./tools.js"

export function createNavigationPreferencesToolServices(
  db: Parameters<typeof getNavigationPreferences>[0],
  memberId: string,
  scopes: readonly string[],
  request: Context,
): NavigationPreferencesToolServices {
  return {
    async get() {
      return {
        ...(await getNavigationPreferences(db, memberId)),
        canManageOrganization: hasApiKeyPermission(
          permissionStringsToPermissions([...scopes]),
          "admin-navigation",
          "write",
        ),
      }
    },
    async setOrganization(visibility, admitted: ToolHandlerActionPolicyContext) {
      let updated: NavigationVisibilityMap | undefined
      const result = await executeAdmittedExistingTargetCommand(
        {
          db,
          context: actionLedgerContext(request),
          admitted,
          commandInput: {
            preferencesId: "organization-navigation-preferences",
            visibility,
          },
          evaluatedRisk: "high",
        },
        {
          async prepare(tx) {
            updated = await setOrganizationNavigationPreferences(
              tx as PostgresJsDatabase,
              visibility,
            )
          },
          execute() {
            if (!updated) throw new Error("Navigation preference update produced no result")
            return Promise.resolve(updated)
          },
          async replay() {
            return (await getNavigationPreferences(db, memberId)).organization
          },
        },
      )
      return result.value
    },
    setMember: (visibility) => setMemberNavigationPreferences(db, memberId, visibility),
  }
}

/**
 * Navigation preference Tools are member-scoped. Organization-only API keys
 * must still compose the MCP catalog (initialize / tools/list / other Tools).
 * Until a grant carries an acting member, these services deny at Tool
 * execution time instead of failing closed during contribution.
 */
export const voyantToolContextContribution = defineToolContextContribution({
  context: ["navigationPreferences"],
  contribute: ({ context, request }) => {
    const variables = (request as { var?: { userId?: unknown; scopes?: unknown } }).var
    const memberId = variables?.userId
    if (typeof memberId !== "string" || memberId.length === 0) {
      return { navigationPreferences: actingMemberRequiredNavigationPreferences() }
    }
    const scopes = Array.isArray(variables?.scopes)
      ? variables.scopes.filter((scope): scope is string => typeof scope === "string")
      : []
    return {
      navigationPreferences: createNavigationPreferencesToolServices(
        context.db as Parameters<typeof getNavigationPreferences>[0],
        memberId,
        scopes,
        request as Context,
      ),
    }
  },
})

function actionLedgerContext(c: Context): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: (vars.workflowPrincipalId as string | undefined) ?? null,
    principalSubtype: (vars.principalSubtype as string | undefined) ?? null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: (vars.workflowRunId as string | undefined) ?? null,
    workflowStepId: (vars.workflowStepId as string | undefined) ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

function actingMemberRequiredNavigationPreferences(): NavigationPreferencesToolServices {
  const deny = async (): Promise<never> => {
    throw new ToolError(
      "Navigation preference Tools require an authenticated member.",
      "AUTHORIZATION_DENIED",
    )
  }
  return {
    get: deny,
    setOrganization: deny,
    setMember: deny,
  }
}
