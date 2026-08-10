import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"

import type {
  CreatedTeamInvitationDto,
  InviteTeamMemberInput,
  TeamInvitationDto,
  TeamManagementCapabilitiesDto,
  TeamMemberDto,
  TeamRoleDto,
} from "./team-management-runtime-port.js"

const teamMemberSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(["active", "deactivated"]),
  joinedAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
})

const teamRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})

const teamInvitationSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  roleId: z.string(),
  roleName: z.string(),
  status: z.enum(["pending", "accepted", "expired", "revoked"]),
  createdAt: z.string(),
  expiresAt: z.string(),
})

const teamManagementCapabilitiesSchema = z.object({
  viewRoster: z.boolean(),
  inviteMembers: z.boolean(),
  manageRoles: z.boolean(),
  activateMembers: z.boolean(),
  deactivateMembers: z.boolean(),
  revokeInvitations: z.boolean(),
})

const emptyInputSchema = z.object({})
const inviteTeamMemberInputSchema = z.object({
  email: z.string().email().describe("Email address for the new team member."),
  roleId: z.string().trim().min(1).max(120).describe("Provider-neutral team role id."),
  expiresInDays: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Invitation validity in days. Uses the deployment default when omitted."),
})
const invitationIdInputSchema = z.object({
  invitationId: z.string().min(1).describe("Team invitation id."),
})
const memberIdInputSchema = z.object({
  memberId: z.string().min(1).describe("Team member id."),
})
const updateMemberRoleInputSchema = memberIdInputSchema.extend({
  roleId: z.string().trim().min(1).max(120).describe("Provider-neutral team role id."),
})

const actingUserRequirement =
  " Requires an authenticated acting staff user; organization-only grants are rejected."

export const UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY = {
  capabilityId: "@voyant-travel/auth#team.tool.update-member-role",
  capabilityVersion: "v1",
  canonicalName: "update_team_member_role",
  actionPolicy: {
    id: "@voyant-travel/auth#team.action.update-member-role",
    capabilityId: "@voyant-travel/auth#team.action.update-member-role",
    version: "v1",
    kind: "execute",
    targetType: "team-member",
    commandTargetField: "memberId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    policy: "@voyant-travel/auth#team.action.update-member-role",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export interface TeamManagementToolServices {
  getCapabilities(): Promise<TeamManagementCapabilitiesDto>
  listMembers(): Promise<TeamMemberDto[]>
  listRoles(): Promise<TeamRoleDto[]>
  listInvitations(): Promise<TeamInvitationDto[]>
  inviteMember(input: InviteTeamMemberInput): Promise<CreatedTeamInvitationDto>
  revokeInvitation(invitationId: string): Promise<void>
  updateMemberRole(
    memberId: string,
    roleId: string,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<TeamMemberDto>
  activateMember(memberId: string): Promise<TeamMemberDto>
  deactivateMember(memberId: string): Promise<TeamMemberDto>
}

export type TeamManagementToolContext = ToolContext & {
  teamManagement?: TeamManagementToolServices
}

function teamManagement(ctx: TeamManagementToolContext): TeamManagementToolServices {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError(
      "Team-management tools are restricted to staff grants.",
      "AUTHORIZATION_DENIED",
      {
        actor: ctx.actor,
        audience: ctx.audience,
      },
    )
  }
  return requireService(ctx.teamManagement, "teamManagement")
}

export const getTeamManagementCapabilitiesTool = defineTool<
  z.infer<typeof emptyInputSchema>,
  TeamManagementCapabilitiesDto,
  TeamManagementToolContext
>({
  name: "get_team_management_capabilities",
  description:
    "Read the current staff user's provider-neutral team-management capabilities." +
    actingUserRequirement,
  inputSchema: emptyInputSchema,
  outputSchema: teamManagementCapabilitiesSchema,
  requiredScopes: ["team:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, ctx) {
    return teamManagement(ctx).getCapabilities()
  },
})

export const listTeamMembersTool = defineTool<
  z.infer<typeof emptyInputSchema>,
  TeamMemberDto[],
  TeamManagementToolContext
>({
  name: "list_team_members",
  description:
    "List the staff team roster and access status. Contains personal information." +
    actingUserRequirement,
  inputSchema: emptyInputSchema,
  outputSchema: z.array(teamMemberSchema),
  requiredScopes: ["team:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, ctx) {
    return teamManagement(ctx).listMembers()
  },
})

export const listTeamRolesTool = defineTool<
  z.infer<typeof emptyInputSchema>,
  TeamRoleDto[],
  TeamManagementToolContext
>({
  name: "list_team_roles",
  description:
    "List the provider-neutral roles assignable to team members. Read-only." +
    actingUserRequirement,
  inputSchema: emptyInputSchema,
  outputSchema: z.array(teamRoleSchema),
  requiredScopes: ["team:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, ctx) {
    return teamManagement(ctx).listRoles()
  },
})

export const listTeamInvitationsTool = defineTool<
  z.infer<typeof emptyInputSchema>,
  TeamInvitationDto[],
  TeamManagementToolContext
>({
  name: "list_team_invitations",
  description:
    "List team invitations and their lifecycle status. Contains personal information." +
    actingUserRequirement,
  inputSchema: emptyInputSchema,
  outputSchema: z.array(teamInvitationSchema),
  requiredScopes: ["team:read"],
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, ctx) {
    return teamManagement(ctx).listInvitations()
  },
})

export const inviteTeamMemberTool = defineTool<
  z.infer<typeof inviteTeamMemberInputSchema>,
  TeamInvitationDto,
  TeamManagementToolContext
>({
  name: "invite_team_member",
  description:
    "Invite a staff team member with an assigned role. Sends an external invitation and requires explicit confirmation." +
    actingUserRequirement,
  inputSchema: inviteTeamMemberInputSchema,
  outputSchema: teamInvitationSchema,
  requiredScopes: ["team:write"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["email", "data-write"],
  },
  async handler(input, ctx) {
    const { acceptUrl: _acceptUrl, ...invitation } = await teamManagement(ctx).inviteMember(input)
    return invitation
  },
})

export const revokeTeamInvitationTool = defineTool<
  z.infer<typeof invitationIdInputSchema>,
  { invitationId: string; revoked: true },
  TeamManagementToolContext
>({
  name: "revoke_team_invitation",
  description:
    "Revoke a pending team invitation. Invalidates its acceptance path and requires confirmation." +
    actingUserRequirement,
  inputSchema: invitationIdInputSchema,
  outputSchema: z.object({ invitationId: z.string(), revoked: z.literal(true) }),
  requiredScopes: ["team:delete"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-delete"],
  },
  async handler({ invitationId }, ctx) {
    await teamManagement(ctx).revokeInvitation(invitationId)
    return { invitationId, revoked: true }
  },
})

export const updateTeamMemberRoleTool = defineTool<
  z.infer<typeof updateMemberRoleInputSchema>,
  TeamMemberDto,
  TeamManagementToolContext
>({
  capabilityId: UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY.capabilityId,
  capabilityVersion: UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY.capabilityVersion,
  name: "update_team_member_role",
  description:
    "Change a team member's role and effective access. Requires explicit confirmation." +
    actingUserRequirement,
  inputSchema: updateMemberRoleInputSchema,
  outputSchema: teamMemberSchema,
  requiredScopes: ["team:write"],
  tier: "sensitive",
  resolvesIdempotencyKeyServerSide: true,
  actionPolicyEnforcement: "handler",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  async handler({ memberId, roleId }, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY)
    return teamManagement(ctx).updateMemberRole(memberId, roleId, admitted)
  },
})

export const activateTeamMemberTool = defineTool<
  z.infer<typeof memberIdInputSchema>,
  TeamMemberDto,
  TeamManagementToolContext
>({
  name: "activate_team_member",
  description:
    "Restore a team member's deployment access. Requires explicit confirmation." +
    actingUserRequirement,
  inputSchema: memberIdInputSchema,
  outputSchema: teamMemberSchema,
  requiredScopes: ["team:write"],
  tier: "sensitive",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  async handler({ memberId }, ctx) {
    return teamManagement(ctx).activateMember(memberId)
  },
})

export const deactivateTeamMemberTool = defineTool<
  z.infer<typeof memberIdInputSchema>,
  TeamMemberDto,
  TeamManagementToolContext
>({
  name: "deactivate_team_member",
  description:
    "Remove a team member's deployment access and potentially revoke active credentials. Requires explicit confirmation." +
    actingUserRequirement,
  inputSchema: memberIdInputSchema,
  outputSchema: teamMemberSchema,
  requiredScopes: ["team:delete"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "data-delete"],
  },
  async handler({ memberId }, ctx) {
    return teamManagement(ctx).deactivateMember(memberId)
  },
})

export const teamManagementTools = [
  getTeamManagementCapabilitiesTool,
  listTeamMembersTool,
  listTeamRolesTool,
  listTeamInvitationsTool,
  inviteTeamMemberTool,
  revokeTeamInvitationTool,
  updateTeamMemberRoleTool,
  activateTeamMemberTool,
  deactivateTeamMemberTool,
] as const
