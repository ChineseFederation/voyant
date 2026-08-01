import {
  type ActionLedgerRequestContextValues,
  buildActionApprovalCommandFingerprint,
  decideActionLedgerApproval,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type { ProposalsNotificationsRuntime } from "../../src/runtime-port.js"
import {
  pipelines,
  proposalDeliveryRequests,
  proposals,
  proposalVersions,
  stages,
} from "../../src/schema.js"
import { executeSnapshotAndSendProposalCommand } from "../../src/service/proposal-delivery.js"
import { SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("durable proposal snapshot and delivery", () => {
  let db: ClosableTestDb

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 4,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(() => cleanupTestDb(db))
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("commits one admitted replay result with the exact selected provider identity", async () => {
    const proposalId = await seedProposal("Durable proposal")
    const notifications = memoryNotifications()
    const command = await approvedCommand(proposalId, "proposal-send-1", notifications)

    const first = await executeSnapshotAndSendProposalCommand(command)
    const replay = await executeSnapshotAndSendProposalCommand(command)

    expect(first.replayed).toBe(false)
    expect(replay).toEqual({ ...first, replayed: true })
    expect(first.value).toMatchObject({
      proposalVersion: { proposalId, status: "sent" },
      proposalUrl: expect.stringContaining("/proposal/"),
      delivery: { status: "pending", provider: "durable-email:v1" },
    })
    expect(notifications.enqueueProposalNotification).toHaveBeenCalledTimes(1)
    const operations = await db.select().from(proposalDeliveryRequests)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      claimActionId: first.command.causation.claimActionId,
      targetType: "proposal",
      targetId: proposalId,
      proposalId,
      provider: "durable-email:v1",
      resultSnapshot: first.value,
    })
    expect(await db.select().from(proposalVersions)).toHaveLength(1)
  })

  it("rolls back the snapshot, sent state, and action claim when enqueue fails", async () => {
    const proposalId = await seedProposal("Atomic proposal")
    const notifications: ProposalsNotificationsRuntime = {
      providerNames: ["durable-email:v1"],
      enqueueProposalNotification: vi.fn(async () => {
        throw new Error("enqueue failed")
      }),
    }
    await expect(
      executeSnapshotAndSendProposalCommand(
        await approvedCommand(proposalId, "proposal-send-failure", notifications),
      ),
    ).rejects.toThrow("enqueue failed")
    expect(await db.select().from(proposalVersions)).toHaveLength(0)
    expect(await db.select().from(proposalDeliveryRequests)).toHaveLength(0)
  })

  async function seedProposal(title: string): Promise<string> {
    const [pipeline] = await db
      .insert(pipelines)
      .values({ name: `${title} pipeline` })
      .returning()
    if (!pipeline) throw new Error("failed to seed pipeline")
    const [stage] = await db
      .insert(stages)
      .values({ pipelineId: pipeline.id, name: `${title} stage` })
      .returning()
    if (!stage) throw new Error("failed to seed stage")
    const [proposal] = await db
      .insert(proposals)
      .values({ title, pipelineId: pipeline.id, stageId: stage.id })
      .returning()
    if (!proposal) throw new Error("failed to seed proposal")
    return proposal.id
  }

  async function approvedCommand(
    proposalId: string,
    idempotencyKey: string,
    notifications: ProposalsNotificationsRuntime,
  ) {
    const context: ActionLedgerRequestContextValues = {
      userId: "user_1",
      callerType: "session",
      actor: "staff",
      organizationId: "tenant_1",
    }
    const input = {
      proposalId,
      to: "traveler@example.test",
      templateSlug: "proposal-proposal",
      channel: "email" as const,
      data: { locale: "en" },
    }
    const policy = SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.actionPolicy
    const reasonCode = "approved_proposal_delivery"
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      targetType: policy.targetType,
      targetId: proposalId,
      commandInput: input,
      approvalPolicy: "required",
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      evaluatedRisk: "high",
      reasonCode,
    })
    const requested = await requestActionLedgerApproval(db, {
      context,
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      actionKind: "execute",
      evaluatedRisk: "high",
      targetType: policy.targetType,
      targetId: proposalId,
      routeOrToolName: SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY.capabilityId,
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      authorizationSource: "integration_test",
      idempotencyScope: `tenant_1:proposal-delivery-approval:${idempotencyKey}`,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      approval: {
        assignedToPrincipalId: "user_1",
        policyName: "proposal-delivery",
        policyVersion: policy.version,
        riskSnapshot: "high",
        reasonCode,
        expiresAt: new Date(Date.now() + 60_000),
      },
    })
    await decideActionLedgerApproval(db, {
      context,
      id: requested.approval.id,
      status: "approved",
      actionName: "proposals.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "high",
      organizationId: "tenant_1",
    })
    const admitted: ToolHandlerActionPolicyContext = {
      ...SNAPSHOT_AND_SEND_PROPOSAL_HANDLER_POLICY,
      actionPolicy: {
        ...policy,
        enforcement: "handler",
        invocation: {
          controlField: "_voyant",
          requiredFields: ["idempotencyKey", "approvalId", "idempotencyFingerprint"],
          optionalFields: ["reasonCode"],
          fingerprintAlgorithm: "action-ledger-command-v1",
        },
      },
      invocation: {
        idempotencyKey,
        approvalId: requested.approval.id,
        idempotencyFingerprint: fingerprint,
        reasonCode,
      },
    }
    return {
      db,
      context,
      admitted,
      notifications,
      input,
      publicProposalBaseUrl: "https://travel.example.test",
    }
  }
})

function memoryNotifications(): ProposalsNotificationsRuntime & {
  enqueueProposalNotification: ReturnType<typeof vi.fn>
} {
  return {
    providerNames: ["durable-email:v1"],
    enqueueProposalNotification: vi.fn(async (_db, input) => ({
      id: `ndel_${input.proposalVersionId}`,
      status: "pending" as const,
      channel: input.channel,
      provider: "durable-email:v1",
      providerMessageId: null,
      toAddress: input.to,
    })),
  }
}
