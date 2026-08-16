import { cloudAuthUserLinks } from "@voyant-travel/db/schema/iam"
import { eq } from "drizzle-orm"

import {
  type CloudAdminInvitation,
  type CloudAdminMember,
  type CloudAdminMembersRequest,
  inviteCloudAdminMember,
  listCloudAdminInvitations,
  listCloudAdminMemberRoles,
  listCloudAdminMembers,
  revokeCloudAdminInvitation,
  setCloudAdminMemberAccess,
  setCloudAdminMemberRole,
} from "./cloud-broker.js"
import type { IdentityAccessRuntimeProvider } from "./identity-access-runtime-port.js"
import { type TeamManagementAdapter, TeamManagementError } from "./team-management-policy.js"
import type {
  CreatedTeamInvitationDto,
  TeamInvitationDto,
  TeamManagementCapabilitiesDto,
  TeamManagementRequestContext,
  TeamMemberDto,
} from "./team-management-runtime-port.js"

function roleLevel(roleId: string): number {
  switch (roleId.trim().toLowerCase()) {
    case "owner":
      return 40
    case "admin":
      return 30
    case "editor":
    case "member":
      return 20
    case "viewer":
    case "guest":
      return 10
    default:
      return 0
  }
}

export function cloudTeamMemberDto(member: CloudAdminMember): TeamMemberDto {
  const roleId = member.roleSlug ?? "member"
  return {
    id: member.membershipId,
    email: member.email,
    name: member.name ?? null,
    roleId,
    roleName: member.roleName ?? roleId,
    status:
      member.hasDeploymentAccess && member.status.toLowerCase() === "active"
        ? "active"
        : "deactivated",
    joinedAt: member.createdAt ?? null,
    lastActivityAt: member.lastActivityAt ?? null,
  }
}

export function cloudTeamInvitationDto(invitation: CloudAdminInvitation): TeamInvitationDto {
  const roleId = invitation.roleSlug ?? "member"
  return {
    id: invitation.id,
    email: invitation.email,
    roleId,
    roleName: invitation.roleName ?? roleId,
    status: invitation.state,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  }
}

function createdInvitationDto(invitation: CloudAdminInvitation): CreatedTeamInvitationDto {
  return {
    ...cloudTeamInvitationDto(invitation),
    acceptUrl: invitation.acceptInvitationUrl || null,
  }
}

async function resolveCloudRequest(
  identityAccess: IdentityAccessRuntimeProvider,
  context: TeamManagementRequestContext,
): Promise<CloudAdminMembersRequest & { actingExternalUserId: string }> {
  const deployment = identityAccess.resolveDeployment(context.bindings)
  if (!deployment.cloudAdminMembers) {
    throw new TeamManagementError(
      "not_configured",
      "Voyant Cloud team management is not configured.",
      501,
    )
  }
  const [link] = await context.db
    .select({ providerAccountId: cloudAuthUserLinks.providerAccountId })
    .from(cloudAuthUserLinks)
    .where(eq(cloudAuthUserLinks.userId, context.userId))
    .limit(1)
  if (!link?.providerAccountId) {
    throw new TeamManagementError("forbidden", "No Cloud identity is linked to this session.")
  }
  return {
    config: deployment.cloudAdminMembers,
    actingWorkosUserId: link.providerAccountId,
    actingExternalUserId: link.providerAccountId,
  }
}

export function createCloudTeamManagementAdapter(
  identityAccess: IdentityAccessRuntimeProvider,
): TeamManagementAdapter {
  const requests = new WeakMap<
    TeamManagementRequestContext,
    Promise<CloudAdminMembersRequest & { actingExternalUserId: string }>
  >()
  const members = new WeakMap<TeamManagementRequestContext, Promise<CloudAdminMember[]>>()

  function requestFor(context: TeamManagementRequestContext) {
    const existing = requests.get(context)
    if (existing) return existing
    const pending = resolveCloudRequest(identityAccess, context)
    requests.set(context, pending)
    void pending.catch(() => {
      if (requests.get(context) === pending) requests.delete(context)
    })
    return pending
  }

  function membersFor(context: TeamManagementRequestContext) {
    const existing = members.get(context)
    if (existing) return existing
    const pending = requestFor(context).then(listCloudAdminMembers)
    members.set(context, pending)
    void pending.catch(() => {
      if (members.get(context) === pending) members.delete(context)
    })
    return pending
  }

  return {
    async getActor(context) {
      const request = await requestFor(context)
      const actor = (await membersFor(context)).find(
        (member) => member.externalUserId === request.actingExternalUserId,
      )
      if (!actor?.hasDeploymentAccess) {
        throw new TeamManagementError("forbidden", "The current user cannot manage this team.")
      }
      return { memberId: actor.membershipId, roleId: actor.roleSlug ?? "member" }
    },
    async getCapabilities(_context, actor): Promise<TeamManagementCapabilitiesDto> {
      const canManage = actor.roleId === "owner" || actor.roleId === "admin"
      return {
        viewMembers: true,
        inviteMembers: canManage,
        manageRoles: canManage,
        activateMembers: canManage,
        deactivateMembers: canManage,
        revokeInvitations: canManage,
      }
    },
    async listMembers(context) {
      return (await membersFor(context)).map(cloudTeamMemberDto)
    },
    async listRoles(context) {
      return (await listCloudAdminMemberRoles(await requestFor(context))).map((role) => ({
        id: role.slug,
        name: role.name,
        description: role.description,
      }))
    },
    async listInvitations(context) {
      return (await listCloudAdminInvitations(await requestFor(context))).map(
        cloudTeamInvitationDto,
      )
    },
    async inviteMember(context, input) {
      return createdInvitationDto(
        await inviteCloudAdminMember({
          ...(await requestFor(context)),
          input: {
            email: input.email,
            roleSlug: input.roleId,
            expiresInDays: input.expiresInDays,
          },
        }),
      )
    },
    async revokeInvitation(context, invitationId) {
      await revokeCloudAdminInvitation({
        ...(await requestFor(context)),
        invitationId,
      })
    },
    async updateMemberRole(context, memberId, roleId) {
      return cloudTeamMemberDto(
        await setCloudAdminMemberRole({
          ...(await requestFor(context)),
          membershipId: memberId,
          roleSlug: roleId,
        }),
      )
    },
    async deactivateMember(context, memberId) {
      return cloudTeamMemberDto(
        await setCloudAdminMemberAccess({
          ...(await requestFor(context)),
          membershipId: memberId,
          hasAccess: false,
        }),
      )
    },
    async activateMember(context, memberId) {
      return cloudTeamMemberDto(
        await setCloudAdminMemberAccess({
          ...(await requestFor(context)),
          membershipId: memberId,
          hasAccess: true,
        }),
      )
    },
    roleLevel,
    isOwnerRole(roleId) {
      return roleId === "owner"
    },
  }
}
