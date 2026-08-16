import type {
  CreatedTeamInvitationDto,
  InviteTeamMemberInput,
  TeamInvitationDto,
  TeamManagementCapabilitiesDto,
  TeamManagementRequestContext,
  TeamManagementRuntimeProvider,
  TeamMemberDto,
  TeamRoleDto,
} from "./team-management-runtime-port.js"

export type TeamManagementErrorCode =
  | "forbidden"
  | "member_not_found"
  | "role_not_found"
  | "self_change_forbidden"
  | "privilege_escalation"
  | "last_owner"
  | "activation_unavailable"
  | "not_configured"

export class TeamManagementError extends Error {
  constructor(
    readonly code: TeamManagementErrorCode,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 501 = 403,
  ) {
    super(message)
    this.name = "TeamManagementError"
  }
}

export interface TeamManagementActor {
  memberId: string
  roleId: string
}

export interface TeamManagementAdapter {
  getActor(context: TeamManagementRequestContext): Promise<TeamManagementActor>
  getCapabilities(
    context: TeamManagementRequestContext,
    actor: TeamManagementActor,
  ): Promise<TeamManagementCapabilitiesDto>
  listMembers(context: TeamManagementRequestContext): Promise<TeamMemberDto[]>
  listRoles(context: TeamManagementRequestContext): Promise<TeamRoleDto[]>
  listInvitations(context: TeamManagementRequestContext): Promise<TeamInvitationDto[]>
  inviteMember(
    context: TeamManagementRequestContext,
    input: InviteTeamMemberInput,
  ): Promise<CreatedTeamInvitationDto>
  revokeInvitation(context: TeamManagementRequestContext, invitationId: string): Promise<void>
  updateMemberRole(
    context: TeamManagementRequestContext,
    memberId: string,
    roleId: string,
  ): Promise<TeamMemberDto>
  activateMember(context: TeamManagementRequestContext, memberId: string): Promise<TeamMemberDto>
  deactivateMember(context: TeamManagementRequestContext, memberId: string): Promise<TeamMemberDto>
  roleLevel(roleId: string): number
  isOwnerRole(roleId: string): boolean
}

type Capability = keyof TeamManagementCapabilitiesDto

function requireCapability(capabilities: TeamManagementCapabilitiesDto, capability: Capability) {
  if (!capabilities[capability]) {
    throw new TeamManagementError("forbidden", "This team-management action is not allowed.")
  }
}

async function authorize(
  adapter: TeamManagementAdapter,
  context: TeamManagementRequestContext,
  capability: Capability,
) {
  const actor = await adapter.getActor(context)
  const capabilities = await adapter.getCapabilities(context, actor)
  requireCapability(capabilities, capability)
  return { actor, capabilities }
}

async function mutationState(
  adapter: TeamManagementAdapter,
  context: TeamManagementRequestContext,
  capability: Capability,
  memberId: string,
) {
  const { actor } = await authorize(adapter, context, capability)
  const members = await adapter.listMembers(context)
  const target = members.find((member) => member.id === memberId)
  if (!target) {
    throw new TeamManagementError("member_not_found", "Team member not found.", 404)
  }
  if (target.id === actor.memberId) {
    throw new TeamManagementError(
      "self_change_forbidden",
      "You cannot change your own role or access.",
      409,
    )
  }
  if (adapter.roleLevel(target.roleId) > adapter.roleLevel(actor.roleId)) {
    throw new TeamManagementError(
      "privilege_escalation",
      "You cannot manage a member with a more privileged role.",
    )
  }
  return { actor, members, target }
}

function assertAssignableRole(
  adapter: TeamManagementAdapter,
  actor: TeamManagementActor,
  roles: TeamRoleDto[],
  roleId: string,
) {
  if (!roles.some((role) => role.id === roleId)) {
    throw new TeamManagementError("role_not_found", "Team role not found.", 404)
  }
  if (adapter.roleLevel(roleId) > adapter.roleLevel(actor.roleId)) {
    throw new TeamManagementError(
      "privilege_escalation",
      "You cannot assign a role above your own privilege level.",
    )
  }
}

function assertOwnerRemains(
  adapter: TeamManagementAdapter,
  members: TeamMemberDto[],
  target: TeamMemberDto,
) {
  if (!adapter.isOwnerRole(target.roleId)) return
  const activeOwners = members.filter(
    (member) => member.status === "active" && adapter.isOwnerRole(member.roleId),
  )
  if (activeOwners.length <= 1) {
    throw new TeamManagementError(
      "last_owner",
      "The last active owner cannot be demoted or deactivated.",
      409,
    )
  }
}

/** Applies provider-neutral authorization and invariants before invoking an adapter. */
export function createGuardedTeamManagementProvider(
  resolveAdapter: (context: TeamManagementRequestContext) => TeamManagementAdapter,
): TeamManagementRuntimeProvider {
  return {
    async getCapabilities(context) {
      const adapter = resolveAdapter(context)
      const actor = await adapter.getActor(context)
      return adapter.getCapabilities(context, actor)
    },
    async listMembers(context) {
      const adapter = resolveAdapter(context)
      await authorize(adapter, context, "viewMembers")
      return adapter.listMembers(context)
    },
    async listRoles(context) {
      const adapter = resolveAdapter(context)
      await authorize(adapter, context, "viewMembers")
      return adapter.listRoles(context)
    },
    async listInvitations(context) {
      const adapter = resolveAdapter(context)
      await authorize(adapter, context, "viewMembers")
      return adapter.listInvitations(context)
    },
    async inviteMember(context, input) {
      const adapter = resolveAdapter(context)
      const { actor } = await authorize(adapter, context, "inviteMembers")
      assertAssignableRole(adapter, actor, await adapter.listRoles(context), input.roleId)
      return adapter.inviteMember(context, input)
    },
    async revokeInvitation(context, invitationId) {
      const adapter = resolveAdapter(context)
      await authorize(adapter, context, "revokeInvitations")
      return adapter.revokeInvitation(context, invitationId)
    },
    async updateMemberRole(context, memberId, roleId) {
      const adapter = resolveAdapter(context)
      const { actor, members, target } = await mutationState(
        adapter,
        context,
        "manageRoles",
        memberId,
      )
      assertAssignableRole(adapter, actor, await adapter.listRoles(context), roleId)
      if (adapter.isOwnerRole(target.roleId) && !adapter.isOwnerRole(roleId)) {
        assertOwnerRemains(adapter, members, target)
      }
      return adapter.updateMemberRole(context, memberId, roleId)
    },
    async deactivateMember(context, memberId) {
      const adapter = resolveAdapter(context)
      const { members, target } = await mutationState(
        adapter,
        context,
        "deactivateMembers",
        memberId,
      )
      assertOwnerRemains(adapter, members, target)
      return adapter.deactivateMember(context, memberId)
    },
    async activateMember(context, memberId) {
      const adapter = resolveAdapter(context)
      await mutationState(adapter, context, "activateMembers", memberId)
      return adapter.activateMember(context, memberId)
    },
  }
}
