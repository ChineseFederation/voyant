import { actionLedgerService } from "@voyant-travel/action-ledger"
import {
  createToolRegistry,
  defineTool,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { executeUpdateTeamMemberRoleCommand } from "../../src/team-member-role-command.js"
import { UPDATE_TEAM_MEMBER_ROLE_HANDLER_POLICY as POLICY } from "../../src/tools.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)
const requestContext = {
  userId: "user_team_role_actor",
  agentId: null,
  workflowPrincipalId: null,
  principalSubtype: null,
  sessionId: "session_team_role",
  apiTokenId: null,
  callerType: "human" as const,
  actor: "staff" as const,
  isInternalRequest: false,
  organizationId: "organization_team_role",
  workflowRunId: null,
  workflowStepId: null,
  correlationId: "correlation_team_role",
}

describe.skipIf(!DB_AVAILABLE)("durable team member role command", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("recovers an ambiguous desired-role setter without accepting command drift", async () => {
    const initial = await mintAdmission({ confirmed: true })
    const command = {
      db,
      context: requestContext,
      admitted: initial,
      memberId: "member_2",
      roleId: "admin",
    }
    const approvalError = await executeUpdateTeamMemberRoleCommand({
      ...command,
      update: async () => member("editor"),
    }).catch((error) => error as { code?: string; meta?: Record<string, unknown> })
    expect(approvalError).toMatchObject({ code: "APPROVAL_REQUIRED" })
    const approvalId = String(approvalError.meta?.approvalId ?? "")
    const idempotencyFingerprint = String(approvalError.meta?.idempotencyFingerprint ?? "")
    expect(approvalId).not.toBe("")
    expect(idempotencyFingerprint).not.toBe("")

    await actionLedgerService.decideApproval(db, {
      id: approvalId,
      status: "approved",
      decidedByPrincipalId: "user_team_role_approver",
      decisionAction: {
        actionName: "@voyant-travel/auth#team.action.approve-role-test",
        actionVersion: "v1",
        principalType: "user",
        principalId: "user_team_role_approver",
        organizationId: requestContext.organizationId,
      },
    })
    const approved = await mintAdmission({
      confirmed: true,
      approvalId,
      idempotencyFingerprint,
    })

    let roleId = "editor"
    let dispatches = 0
    const update = async () => {
      dispatches += 1
      roleId = "admin"
      if (dispatches === 1) throw new Error("response lost after provider accepted role")
      return member(roleId)
    }
    await expect(
      executeUpdateTeamMemberRoleCommand({ ...command, admitted: approved, update }),
    ).rejects.toThrow(/response lost/)
    await expect(
      executeUpdateTeamMemberRoleCommand({ ...command, admitted: approved, update }),
    ).resolves.toMatchObject({ id: "member_2", roleId: "admin" })

    expect(roleId).toBe("admin")
    expect(dispatches).toBe(2)
    await expect(
      executeUpdateTeamMemberRoleCommand({
        ...command,
        admitted: approved,
        roleId: "viewer",
        update: async () => member("viewer"),
      }),
    ).rejects.toThrow()
    expect(roleId).toBe("admin")
  })
})

async function mintAdmission(
  invocation: Record<string, string | boolean>,
): Promise<ToolHandlerActionPolicyContext> {
  let admitted: ToolHandlerActionPolicyContext | undefined
  const registry = createToolRegistry()
  registry.register(
    defineTool({
      capabilityId: POLICY.capabilityId,
      capabilityVersion: POLICY.capabilityVersion,
      name: POLICY.canonicalName,
      description: "Mint an authentic team role command admission for integration coverage.",
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.literal(true) }),
      requiredScopes: [],
      audience: { source: "grant", allowed: ["staff"] },
      tier: "sensitive",
      riskPolicy: {
        destructive: false,
        reversible: true,
        dryRunSupported: false,
        confirmationRequired: true,
        sideEffects: ["data-write"],
      },
      actionPolicyEnforcement: "handler",
      async handler(_args, context) {
        admitted = context.handlerActionPolicy
        return { ok: true as const }
      },
    }),
    { actionPolicy: POLICY.actionPolicy },
  )
  const manifest = registry.list()[0]
  if (!manifest?.actionPolicy) throw new Error("team role action policy missing")
  await registry.dispatch(
    POLICY.canonicalName,
    {},
    {
      db: {},
      actor: "staff",
      audience: "staff",
      tenantId: requestContext.organizationId,
      organizationId: requestContext.organizationId,
      resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
      handlerActionPolicy: {
        capabilityId: manifest.capabilityId,
        capabilityVersion: manifest.capabilityVersion,
        canonicalName: manifest.name,
        actionPolicy: manifest.actionPolicy,
        invocation,
      },
    },
  )
  if (!admitted) throw new Error("Tool registry did not mint team role admission")
  return admitted
}

function member(roleId: string) {
  return {
    id: "member_2",
    email: "member@example.com",
    name: "Member",
    roleId,
    roleName: roleId,
    status: "active" as const,
    joinedAt: null,
    lastActivityAt: null,
  }
}
