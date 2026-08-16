import { definePort } from "@voyant-travel/core/project"
import type { VoyantDb } from "@voyant-travel/hono"

export type TeamMemberStatus = "active" | "deactivated"
export type TeamInvitationStatus = "pending" | "accepted" | "expired" | "revoked"

export interface TeamMemberDto {
  id: string
  email: string | null
  name: string | null
  roleId: string
  roleName: string
  status: TeamMemberStatus
  joinedAt: string | null
  lastActivityAt: string | null
}

export interface TeamRoleDto {
  id: string
  name: string
  description: string | null
}

export interface TeamInvitationDto {
  id: string
  email: string
  roleId: string
  roleName: string
  status: TeamInvitationStatus
  createdAt: string
  expiresAt: string
}

export interface CreatedTeamInvitationDto extends TeamInvitationDto {
  acceptUrl: string | null
}

export interface TeamManagementCapabilitiesDto {
  viewMembers: boolean
  inviteMembers: boolean
  manageRoles: boolean
  activateMembers: boolean
  deactivateMembers: boolean
  revokeInvitations: boolean
}

export interface TeamManagementRequestContext {
  bindings: Record<string, unknown>
  db: VoyantDb
  userId: string
}

export interface InviteTeamMemberInput {
  email: string
  roleId: string
  expiresInDays?: number
}

export interface TeamManagementRuntimeProvider {
  getCapabilities(context: TeamManagementRequestContext): Promise<TeamManagementCapabilitiesDto>
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
}

export const teamManagementRuntimePort = definePort<TeamManagementRuntimeProvider>({
  id: "auth.team-management-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("auth.team-management-runtime provider must be an object.")
    }
    for (const method of [
      "getCapabilities",
      "listMembers",
      "listRoles",
      "listInvitations",
      "inviteMember",
      "revokeInvitation",
      "updateMemberRole",
      "activateMember",
      "deactivateMember",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`auth.team-management-runtime provider must implement ${method}().`)
      }
    }
  },
})
