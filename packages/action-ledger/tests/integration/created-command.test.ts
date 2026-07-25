import { randomUUID } from "node:crypto"

import type { AnyDrizzleDb } from "@voyant-travel/db"
import { createDbClient } from "@voyant-travel/db"
import { dbClientDispose } from "@voyant-travel/db/transaction-capability"
import { eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it } from "vitest"

import {
  ActionLedgerCreatedCommandApprovalError,
  buildCreatedTargetCommandFingerprint,
  executeCreatedTargetCommand,
} from "../../src/created-command-internal.js"
import {
  decideActionLedgerApproval,
  requestActionLedgerApproval,
} from "../../src/request-context.js"
import { actionApprovals, actionLedgerEntries } from "../../src/schema.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const describeIfDb: typeof describe = describe.skipIf(!TEST_DATABASE_URL)

describeIfDb("created-target command transaction protocol", () => {
  it("rolls back failed mutation and serializes concurrent equal commands", async () => {
    const db = createDbClient(TEST_DATABASE_URL!, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as PostgresJsDatabase
    const unique = randomUUID()
    const scope = `action-ledger.created-command.integration:${unique}`
    const commandTarget = {
      type: "test-resource-create-command",
      id: `command_${unique}`,
    }
    const fingerprintInput = {
      actionName: "test.resource.create",
      actionVersion: "v1",
      commandTarget,
      canonicalTargetType: "test-resource",
      resultReferenceType: "test-resource-ref",
      commandInput: { label: "Integration resource" },
      capabilityId: "test:resource:create",
      capabilityVersion: "v1",
      evaluatedRisk: "medium" as const,
      approvalPolicy: "none" as const,
      approvalReasonCode: null,
    }
    const input = {
      context: {
        userId: "usr_created_command_test",
        callerType: "session",
        actor: "staff",
        organizationId: "org_created_command_test",
      },
      ...fingerprintInput,
      idempotency: {
        scope,
        key: `key_${unique}`,
        fingerprint: await buildCreatedTargetCommandFingerprint(fingerprintInput),
      },
    }
    let createCalls = 0
    const handlers = {
      async create() {
        createCalls += 1
        return {
          value: { id: `resource_${unique}` },
          targetId: `resource_${unique}`,
        }
      },
      async replay(_tx: AnyDrizzleDb, result: { reference: { id: string } }) {
        return { id: result.reference.id }
      },
    }

    try {
      await expect(
        executeCreatedTargetCommand(db, input, {
          ...handlers,
          async create() {
            throw new Error("simulate domain mutation failure")
          },
        }),
      ).rejects.toThrow("simulate domain mutation failure")

      expect(await rowsForScopes(db, scope)).toEqual([])

      const [first, second] = await Promise.all([
        executeCreatedTargetCommand(db, input, handlers),
        executeCreatedTargetCommand(db, input, handlers),
      ])

      expect(createCalls).toBe(1)
      expect([first.replayed, second.replayed].sort()).toEqual([false, true])
      expect(first.value.id).toBe(`resource_${unique}`)
      expect(second.value.id).toBe(`resource_${unique}`)
      expect(await rowsForScopes(db, scope)).toHaveLength(2)
    } finally {
      await db
        .delete(actionLedgerEntries)
        .where(
          inArray(actionLedgerEntries.idempotencyScope, [claimScope(scope), resultScope(scope)]),
        )
      await dbClientDispose(db)?.()
    }
  })

  it("executes an approved created command, replays it, and rejects approval drift", async () => {
    const db = createDbClient(TEST_DATABASE_URL!, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as PostgresJsDatabase
    const unique = randomUUID()
    const organizationId = `org_created_approval_${unique}`
    const approvalIds: string[] = []
    const commandScopes: string[] = []
    const requestContext = {
      userId: `usr_created_approval_${unique}`,
      callerType: "session",
      actor: "staff",
      organizationId,
    } as const

    async function approvedInput(
      suffix: string,
      options: { expiresAt?: Date; executionUserId?: string } = {},
    ) {
      const actionName = "test.resource.approved-create"
      const actionVersion = "v1"
      const commandTarget = {
        type: "test-resource-approved-create-command",
        id: `command_${suffix}_${unique}`,
      }
      const commandInput = { label: `Approved ${suffix}` }
      const idempotencyKey = `key_${suffix}_${unique}`
      const fingerprintInput = {
        actionName,
        actionVersion,
        commandTarget,
        canonicalTargetType: "test-resource",
        resultReferenceType: "test-resource-ref",
        commandInput,
        capabilityId: "test:resource:approved-create",
        capabilityVersion: "v1",
        evaluatedRisk: "high" as const,
        approvalPolicy: "required" as const,
        approvalReasonCode: "integration_approved_create",
      }
      const fingerprint = await buildCreatedTargetCommandFingerprint(fingerprintInput)
      const requested = await requestActionLedgerApproval(db, {
        context: requestContext,
        actionName,
        actionVersion,
        actionKind: "execute",
        evaluatedRisk: "high",
        targetType: commandTarget.type,
        targetId: commandTarget.id,
        routeOrToolName: "test:tool:approved-create",
        capabilityId: "test:resource:approved-create",
        capabilityVersion: "v1",
        authorizationSource: "integration_test",
        idempotencyScope: `approval:${suffix}:${unique}`,
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
        approval: {
          assignedToPrincipalId: requestContext.userId,
          policyName: "test-approved-create-policy",
          policyVersion: "v1",
          riskSnapshot: "high",
          reasonCode: "integration_approved_create",
          expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000),
        },
      })
      approvalIds.push(requested.approval.id)
      await decideActionLedgerApproval(db, {
        context: requestContext,
        id: requested.approval.id,
        status: "approved",
        actionName: "test.approval.decision",
        actionVersion: "v1",
        evaluatedRisk: "high",
        organizationId,
      })
      const scope = `approved-command:${suffix}:${unique}`
      commandScopes.push(scope)
      return {
        context: {
          ...requestContext,
          userId: options.executionUserId ?? requestContext.userId,
        },
        ...fingerprintInput,
        routeOrToolName: "test:tool:approved-create",
        authorizationSource: "integration_test",
        approvalPolicyName: "test-approved-create-policy",
        approvalControls: {
          approvalId: requested.approval.id,
          idempotencyKey,
          idempotencyFingerprint: fingerprint,
          reasonCode: "integration_approved_create",
        },
        idempotency: { scope, key: idempotencyKey, fingerprint },
      }
    }

    let approvedCreateCalls = 0
    const handlers = {
      async create() {
        approvedCreateCalls += 1
        return { value: { id: `resource_${unique}` }, targetId: `resource_${unique}` }
      },
      async replay(_tx: AnyDrizzleDb, result: { reference: { id: string } }) {
        return { id: result.reference.id }
      },
    }

    try {
      const input = await approvedInput("success")
      const first = await executeCreatedTargetCommand(db, input, handlers)
      await db
        .update(actionApprovals)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(actionApprovals.id, input.approvalControls.approvalId))
      const replay = await executeCreatedTargetCommand(db, input, handlers)
      expect(first).toMatchObject({
        replayed: false,
        result: {
          entry: { approvalId: input.approvalControls.approvalId },
          reference: { type: "test-resource-ref", id: `resource_${unique}` },
        },
      })
      expect(replay).toMatchObject({ replayed: true, value: { id: `resource_${unique}` } })

      const reused = await approvedInput("reused")
      await executeCreatedTargetCommand(db, reused, handlers)
      await expect(
        executeCreatedTargetCommand(
          db,
          {
            ...reused,
            idempotency: { ...reused.idempotency, scope: `${reused.idempotency.scope}:other` },
          },
          handlers,
        ),
      ).rejects.toMatchObject({
        name: ActionLedgerCreatedCommandApprovalError.name,
        reason: "already_executed",
      })
      expect(approvedCreateCalls).toBe(2)

      const drifted = await approvedInput("drift")
      const driftFingerprintInput = { ...drifted, evaluatedRisk: "critical" as const }
      const driftFingerprint = await buildCreatedTargetCommandFingerprint(driftFingerprintInput)
      await expect(
        executeCreatedTargetCommand(
          db,
          {
            ...drifted,
            evaluatedRisk: "critical",
            approvalControls: {
              ...drifted.approvalControls,
              idempotencyFingerprint: driftFingerprint,
            },
            idempotency: { ...drifted.idempotency, fingerprint: driftFingerprint },
          },
          handlers,
        ),
      ).rejects.toMatchObject({
        name: ActionLedgerCreatedCommandApprovalError.name,
        reason: "fingerprint_mismatch",
      })

      const expired = await approvedInput("expired", { expiresAt: new Date(Date.now() - 60_000) })
      await expect(executeCreatedTargetCommand(db, expired, handlers)).rejects.toMatchObject({
        name: ActionLedgerCreatedCommandApprovalError.name,
        reason: "expired",
      })

      const wrongPrincipal = await approvedInput("principal", {
        executionUserId: `usr_wrong_${unique}`,
      })
      await expect(executeCreatedTargetCommand(db, wrongPrincipal, handlers)).rejects.toMatchObject(
        {
          name: ActionLedgerCreatedCommandApprovalError.name,
          reason: "principal_mismatch",
        },
      )
    } finally {
      if (approvalIds.length > 0) {
        await db.delete(actionApprovals).where(inArray(actionApprovals.id, approvalIds))
      }
      await db
        .delete(actionLedgerEntries)
        .where(eq(actionLedgerEntries.organizationId, organizationId))
    }
  })
})

function rowsForScopes(db: PostgresJsDatabase, scope: string) {
  return db
    .select()
    .from(actionLedgerEntries)
    .where(inArray(actionLedgerEntries.idempotencyScope, [claimScope(scope), resultScope(scope)]))
}

function claimScope(scope: string): string {
  return `${scope}:created-command-claim`
}

function resultScope(scope: string): string {
  return `${scope}:created-command-result`
}
