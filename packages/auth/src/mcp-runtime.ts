import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import {
  defineToolContextContribution,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"

import { teamManagementRuntimePort } from "./team-management-runtime-port.js"
import {
  executeSetTeamMemberAccessCommand,
  executeUpdateTeamMemberRoleCommand,
} from "./team-member-role-command.js"
import type { TeamManagementToolServices } from "./tools.js"

export * from "./tools.js"

type TeamMcpContext = Context<{
  Bindings: Record<string, unknown>
  Variables: { db: import("@voyant-travel/hono").VoyantDb; userId?: string }
}>

/**
 * The guarded team runtime uses a concrete acting user for authorization,
 * self-mutation prevention, and last-owner invariants. Organization identity is
 * not a user identity and must never be promoted into one.
 *
 * Organization-only API keys must still compose the MCP catalog (initialize /
 * tools/list / non-team tools). Until a grant carries an explicit delegated
 * user or service principal understood by this port, team-management services
 * deny at Tool execution time instead of failing closed during contribution.
 */
export const voyantToolContextContribution = defineToolContextContribution({
  context: ["teamManagement"],
  async contribute({ request, context, resources }) {
    if (context.actor !== "staff" || context.audience !== "staff") {
      throw new ToolError(
        "Team-management tools are restricted to staff grants.",
        "AUTHORIZATION_DENIED",
        { actor: context.actor, audience: context.audience },
      )
    }

    const c = request as TeamMcpContext
    const userId = c.get("userId")
    if (!userId) {
      return { teamManagement: actingUserRequiredTeamManagement() }
    }

    const runtime = requireService(
      resources[teamManagementRuntimePort.id] as
        | import("./team-management-runtime-port.js").TeamManagementRuntimeProvider
        | undefined,
      teamManagementRuntimePort.id,
    )
    const runtimeContext = { bindings: c.env, db: c.get("db"), userId }
    const teamManagement: TeamManagementToolServices = {
      getCapabilities: () => runtime.getCapabilities(runtimeContext),
      listMembers: () => runtime.listMembers(runtimeContext),
      listRoles: () => runtime.listRoles(runtimeContext),
      listInvitations: () => runtime.listInvitations(runtimeContext),
      inviteMember: (input) => runtime.inviteMember(runtimeContext, input),
      revokeInvitation: (invitationId) => runtime.revokeInvitation(runtimeContext, invitationId),
      async updateMemberRole(
        memberId: string,
        roleId: string,
        admitted: ToolHandlerActionPolicyContext,
      ) {
        return executeUpdateTeamMemberRoleCommand({
          db: runtimeContext.db,
          context: actionLedgerContext(c),
          admitted,
          memberId,
          roleId,
          update: () => runtime.updateMemberRole(runtimeContext, memberId, roleId),
        })
      },
      activateMember: (memberId, admitted) =>
        executeSetTeamMemberAccessCommand({
          db: runtimeContext.db,
          context: actionLedgerContext(c),
          admitted,
          memberId,
          access: "active",
          update: () => runtime.activateMember(runtimeContext, memberId),
        }),
      deactivateMember: (memberId, admitted) =>
        executeSetTeamMemberAccessCommand({
          db: runtimeContext.db,
          context: actionLedgerContext(c),
          admitted,
          memberId,
          access: "deactivated",
          update: () => runtime.deactivateMember(runtimeContext, memberId),
        }),
    }
    return { teamManagement }
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

function actingUserRequiredTeamManagement(): TeamManagementToolServices {
  const deny = async (): Promise<never> => {
    throw new ToolError(
      "Team management requires an authenticated acting user.",
      "AUTHORIZATION_DENIED",
    )
  }
  return {
    getCapabilities: deny,
    listMembers: deny,
    listRoles: deny,
    listInvitations: deny,
    inviteMember: deny,
    revokeInvitation: deny,
    updateMemberRole: deny,
    activateMember: deny,
    deactivateMember: deny,
  }
}
