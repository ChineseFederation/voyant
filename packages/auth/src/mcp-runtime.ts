import { defineToolContextContribution, requireService, ToolError } from "@voyant-travel/tools"
import type { Context } from "hono"

import { teamManagementRuntimePort } from "./team-management-runtime-port.js"
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
      updateMemberRole: (memberId, roleId) =>
        runtime.updateMemberRole(runtimeContext, memberId, roleId),
      activateMember: (memberId) => runtime.activateMember(runtimeContext, memberId),
      deactivateMember: (memberId) => runtime.deactivateMember(runtimeContext, memberId),
    }
    return { teamManagement }
  },
})

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
