import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { beforeEach, describe, expect, it, vi } from "vitest"

const executeAdmittedExistingTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@voyant-travel/action-ledger")>()),
  executeAdmittedExistingTargetCommand,
}))

import { voyantToolContextContribution } from "../../src/mcp-runtime.js"
import { teamManagementRuntimePort } from "../../src/team-management-runtime-port.js"
import {
  type TeamManagementToolContext,
  UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY,
  updateTeamMemberRoleTool,
} from "../../src/tools.js"

const member = {
  id: "member_2",
  email: "member@example.com",
  name: "Member",
  roleId: "admin",
  roleName: "Admin",
  status: "active" as const,
  joinedAt: null,
  lastActivityAt: null,
}

describe("Auth MCP durable team role command", () => {
  beforeEach(() => {
    executeAdmittedExistingTargetCommand.mockReset()
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => ({
      replayed: false,
      command: { claimActionId: "claim_1" },
      value: await handlers.execute(),
    }))
  })

  it("derives command identity and enters the ledger before changing provider state", async () => {
    const updateMemberRole = vi.fn(async () => member)
    const db = { kind: "transactional-db" }
    const request = {
      env: { DEPLOYMENT: "local" },
      var: { userId: "user_1", actor: "staff" },
      get(key: string) {
        return key === "userId" ? "user_1" : key === "db" ? db : undefined
      },
      req: { header: () => undefined },
    }
    const contribution = await voyantToolContextContribution.contribute({
      request,
      context: context(),
      resources: {
        [teamManagementRuntimePort.id]: {
          updateMemberRole,
        },
      },
    })
    const registry = createToolRegistry()
    registry.register(updateTeamMemberRoleTool, {
      actionPolicy: UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY.actionPolicy,
    })
    const manifest = registry.list()[0]
    if (!manifest?.actionPolicy) throw new Error("role command policy missing")

    await expect(
      registry.dispatch(
        "update_team_member_role",
        { memberId: "member_2", roleId: "admin" },
        {
          ...context(),
          teamManagement: contribution.teamManagement,
          handlerActionPolicy: {
            capabilityId: manifest.capabilityId,
            capabilityVersion: manifest.capabilityVersion,
            canonicalName: manifest.name,
            actionPolicy: manifest.actionPolicy,
            invocation: {
              approvalId: "approval_1",
              idempotencyFingerprint: "fingerprint_1",
            },
          },
        },
      ),
    ).resolves.toEqual(member)

    expect(executeAdmittedExistingTargetCommand).toHaveBeenCalledOnce()
    const [command] = executeAdmittedExistingTargetCommand.mock.calls[0] ?? []
    expect(command).toMatchObject({
      db,
      commandInput: { memberId: "member_2", roleId: "admin" },
      evaluatedRisk: "high",
      admitted: {
        capabilityId: UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY.capabilityId,
        invocation: { idempotencyKey: expect.stringMatching(/^update-team-member-role:v1:/) },
      },
    })
    expect(updateMemberRole).toHaveBeenCalledWith(
      { bindings: request.env, db, userId: "user_1" },
      "member_2",
      "admin",
    )
  })
})

function context(): TeamManagementToolContext {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "operator_1",
    resolverScope: {
      locale: "en-GB",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
  } satisfies ToolContext
}
