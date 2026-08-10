import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"

import { voyantToolContextContribution } from "../src/mcp-runtime.js"
import { teamManagementRuntimePort } from "../src/team-management-runtime-port.js"
import {
  ACTIVATE_TEAM_MEMBER_HANDLER_POLICY,
  activateTeamMemberTool,
  DEACTIVATE_TEAM_MEMBER_HANDLER_POLICY,
  deactivateTeamMemberTool,
  type TeamManagementToolContext,
  type TeamManagementToolServices,
  teamManagementTools,
  UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY,
  updateTeamMemberRoleTool,
} from "../src/tools.js"

const member = {
  id: "member_1",
  email: "staff@example.com",
  name: "Staff Member",
  roleId: "editor",
  roleName: "Editor",
  status: "active" as const,
  joinedAt: "2026-07-15T10:00:00.000Z",
  lastActivityAt: null,
}
const invitation = {
  id: "invitation_1",
  email: "invitee@example.com",
  roleId: "editor",
  roleName: "Editor",
  status: "pending" as const,
  createdAt: "2026-07-15T10:00:00.000Z",
  expiresAt: "2026-07-18T10:00:00.000Z",
}

function toolContext(
  services?: TeamManagementToolServices,
  actor: ToolContext["actor"] = "staff",
): TeamManagementToolContext {
  return {
    db: {},
    actor,
    audience: actor,
    tenantId: "operator_1",
    resolverScope: { locale: "en-GB", audience: actor, market: "default", actor },
    teamManagement: services,
  }
}

function services(): TeamManagementToolServices {
  return {
    getCapabilities: vi.fn(async () => ({
      viewRoster: true,
      inviteMembers: true,
      manageRoles: true,
      activateMembers: true,
      deactivateMembers: true,
      revokeInvitations: true,
    })),
    listMembers: vi.fn(async () => [member]),
    listRoles: vi.fn(async () => [{ id: "editor", name: "Editor", description: null }]),
    listInvitations: vi.fn(async () => [invitation]),
    inviteMember: vi.fn(async (input) => ({ ...invitation, ...input, acceptUrl: null })),
    revokeInvitation: vi.fn(async () => {}),
    updateMemberRole: vi.fn(async (_memberId, roleId) => ({ ...member, roleId, roleName: roleId })),
    activateMember: vi.fn(async () => member),
    deactivateMember: vi.fn(async () => ({ ...member, status: "deactivated" })),
  }
}

function teamRegistry() {
  const registry = createToolRegistry()
  for (const tool of teamManagementTools) {
    registry.register(
      tool,
      tool.name === "update_team_member_role"
        ? { actionPolicy: UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY.actionPolicy }
        : tool.name === "activate_team_member"
          ? { actionPolicy: ACTIVATE_TEAM_MEMBER_HANDLER_POLICY.actionPolicy }
          : tool.name === "deactivate_team_member"
            ? { actionPolicy: DEACTIVATE_TEAM_MEMBER_HANDLER_POLICY.actionPolicy }
            : undefined,
    )
  }
  return registry
}

function admission(
  registry: ReturnType<typeof createToolRegistry>,
  name = "update_team_member_role",
): ToolContext["handlerActionPolicy"] {
  const manifest = registry.list().find((tool) => tool.name === name)
  if (!manifest?.actionPolicy) throw new Error(`${name} action policy was not registered`)
  return {
    capabilityId: manifest.capabilityId,
    capabilityVersion: manifest.capabilityVersion,
    canonicalName: manifest.name,
    actionPolicy: manifest.actionPolicy,
    invocation: { approvalId: "approval_1", idempotencyFingerprint: "fingerprint_1" },
  }
}

describe("auth team-management tools", () => {
  it("registers provider-neutral reads and confirmation-gated access writes", () => {
    const registry = teamRegistry()

    expect(
      registry
        .list()
        .map(({ name }) => name)
        .sort(),
    ).toEqual([
      "activate_team_member",
      "deactivate_team_member",
      "get_team_management_capabilities",
      "invite_team_member",
      "list_team_invitations",
      "list_team_members",
      "list_team_roles",
      "revoke_team_invitation",
      "update_team_member_role",
    ])
    for (const tool of registry
      .list()
      .filter(
        ({ name }) => !name.startsWith("list_") && name !== "get_team_management_capabilities",
      )) {
      expect(tool.riskPolicy.confirmationRequired).toBe(true)
      expect(tool.requiredScopes).toHaveLength(1)
    }
    expect(registry.list().find(({ name }) => name === "invite_team_member")).toMatchObject({
      tier: "destructive",
      requiredScopes: ["team:write"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    expect(registry.list().find(({ name }) => name === "deactivate_team_member")).toMatchObject({
      tier: "destructive",
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    expect(updateTeamMemberRoleTool).toMatchObject({
      actionPolicyEnforcement: "handler",
      resolvesIdempotencyKeyServerSide: true,
      annotations: { idempotentHint: true },
    })
    for (const tool of [activateTeamMemberTool, deactivateTeamMemberTool]) {
      expect(tool).toMatchObject({
        actionPolicyEnforcement: "handler",
        resolvesIdempotencyKeyServerSide: true,
        annotations: { idempotentHint: true },
      })
    }
    expect(
      registry
        .list()
        .every(({ description }) => description.includes("authenticated acting staff user")),
    ).toBe(true)
  })

  it("delegates every operation to the injected guarded runtime service", async () => {
    const runtime = services()
    const registry = teamRegistry()
    const ctx = { ...toolContext(runtime), handlerActionPolicy: admission(registry) }

    await expect(registry.dispatch("list_team_members", {}, ctx)).resolves.toEqual([member])
    await expect(
      registry.dispatch(
        "invite_team_member",
        { email: "invitee@example.com", roleId: "editor", expiresInDays: 5 },
        ctx,
      ),
    ).resolves.toEqual(invitation)
    await expect(
      registry.dispatch("revoke_team_invitation", { invitationId: "invitation_1" }, ctx),
    ).resolves.toEqual({ invitationId: "invitation_1", revoked: true })
    await registry.dispatch(
      "update_team_member_role",
      { memberId: "member_1", roleId: "admin" },
      ctx,
    )
    await registry.dispatch(
      "activate_team_member",
      { memberId: "member_1" },
      {
        ...ctx,
        handlerActionPolicy: admission(registry, "activate_team_member"),
      },
    )
    await registry.dispatch(
      "deactivate_team_member",
      { memberId: "member_1" },
      {
        ...ctx,
        handlerActionPolicy: admission(registry, "deactivate_team_member"),
      },
    )

    expect(runtime.inviteMember).toHaveBeenCalledWith({
      email: "invitee@example.com",
      roleId: "editor",
      expiresInDays: 5,
    })
    expect(runtime.revokeInvitation).toHaveBeenCalledWith("invitation_1")
    expect(runtime.updateMemberRole).toHaveBeenCalledWith("member_1", "admin", expect.any(Object))
    expect(runtime.activateMember).toHaveBeenCalledWith("member_1", expect.any(Object))
    expect(runtime.deactivateMember).toHaveBeenCalledWith("member_1", expect.any(Object))
  })

  it("denies non-staff callers and missing service wiring", async () => {
    const registry = teamRegistry()

    await expect(
      registry.dispatch("list_team_members", {}, toolContext(services(), "customer")),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" })
    await expect(
      registry.dispatch("list_team_members", {}, toolContext(undefined)),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })

  it("contributes the graph-selected runtime using an authenticated acting user", async () => {
    const runtime = services()
    const contribution = await voyantToolContextContribution.contribute({
      request: {
        env: { DEPLOYMENT: "local" },
        get(key: string) {
          return key === "userId" ? "user_1" : key === "db" ? { kind: "db" } : undefined
        },
      },
      context: toolContext(),
      resources: { [teamManagementRuntimePort.id]: runtime },
    })
    const contributed = contribution.teamManagement as TeamManagementToolServices

    await contributed.listMembers()
    expect(runtime.listMembers).toHaveBeenCalledWith({
      bindings: { DEPLOYMENT: "local" },
      db: { kind: "db" },
      userId: "user_1",
    })
  })

  it("keeps MCP catalog composition available when the grant has no acting user", async () => {
    const contribution = await voyantToolContextContribution.contribute({
      request: { env: {}, get: () => undefined },
      context: toolContext(),
      resources: { [teamManagementRuntimePort.id]: services() },
    })

    expect(contribution).toHaveProperty("teamManagement")
    await expect(
      (contribution.teamManagement as TeamManagementToolServices).listMembers(),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "Team management requires an authenticated acting user.",
    })
  })

  it("denies team-management Tool dispatch when enrichment omitted an acting user", async () => {
    const contribution = await voyantToolContextContribution.contribute({
      request: { env: {}, get: () => undefined },
      context: toolContext(),
      resources: { [teamManagementRuntimePort.id]: services() },
    })
    const registry = teamRegistry()

    await expect(
      registry.dispatch(
        "list_team_members",
        {},
        toolContext(contribution.teamManagement as TeamManagementToolServices),
      ),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "Team management requires an authenticated acting user.",
    })
  })
})
