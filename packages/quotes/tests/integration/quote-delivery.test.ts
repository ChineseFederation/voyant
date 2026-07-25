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

import type { QuotesNotificationsRuntime } from "../../src/runtime-port.js"
import {
  pipelines,
  quoteProposalDeliveryRequests,
  quotes,
  quoteVersions,
  stages,
} from "../../src/schema.js"
import { executeSnapshotAndSendQuoteCommand } from "../../src/service/quote-delivery.js"
import { SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("durable quote snapshot and delivery", () => {
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
    const quoteId = await seedQuote("Durable proposal")
    const notifications = memoryNotifications()
    const command = await approvedCommand(quoteId, "quote-send-1", notifications)

    const first = await executeSnapshotAndSendQuoteCommand(command)
    const replay = await executeSnapshotAndSendQuoteCommand(command)

    expect(first.replayed).toBe(false)
    expect(replay).toEqual({ ...first, replayed: true })
    expect(first.value).toMatchObject({
      quoteVersion: { quoteId, status: "sent" },
      proposalUrl: expect.stringContaining("/proposal/"),
      delivery: { status: "pending", provider: "durable-email:v1" },
    })
    expect(notifications.enqueueQuoteProposal).toHaveBeenCalledTimes(1)
    const operations = await db.select().from(quoteProposalDeliveryRequests)
    expect(operations).toHaveLength(1)
    expect(operations[0]).toMatchObject({
      claimActionId: first.command.causation.claimActionId,
      targetType: "quote",
      targetId: quoteId,
      quoteId,
      provider: "durable-email:v1",
      resultSnapshot: first.value,
    })
    expect(await db.select().from(quoteVersions)).toHaveLength(1)
  })

  it("rolls back the snapshot, sent state, and action claim when enqueue fails", async () => {
    const quoteId = await seedQuote("Atomic proposal")
    const notifications: QuotesNotificationsRuntime = {
      providerNames: ["durable-email:v1"],
      enqueueQuoteProposal: vi.fn(async () => {
        throw new Error("enqueue failed")
      }),
    }
    await expect(
      executeSnapshotAndSendQuoteCommand(
        await approvedCommand(quoteId, "quote-send-failure", notifications),
      ),
    ).rejects.toThrow("enqueue failed")
    expect(await db.select().from(quoteVersions)).toHaveLength(0)
    expect(await db.select().from(quoteProposalDeliveryRequests)).toHaveLength(0)
  })

  async function seedQuote(title: string): Promise<string> {
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
    const [quote] = await db
      .insert(quotes)
      .values({ title, pipelineId: pipeline.id, stageId: stage.id })
      .returning()
    if (!quote) throw new Error("failed to seed quote")
    return quote.id
  }

  async function approvedCommand(
    quoteId: string,
    idempotencyKey: string,
    notifications: QuotesNotificationsRuntime,
  ) {
    const context: ActionLedgerRequestContextValues = {
      userId: "user_1",
      callerType: "session",
      actor: "staff",
      organizationId: "tenant_1",
    }
    const input = {
      quoteId,
      to: "traveler@example.test",
      templateSlug: "quote-proposal",
      channel: "email" as const,
      data: { locale: "en" },
    }
    const policy = SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.actionPolicy
    const reasonCode = "approved_quote_delivery"
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      targetType: policy.targetType,
      targetId: quoteId,
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
      targetId: quoteId,
      routeOrToolName: SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY.capabilityId,
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      authorizationSource: "integration_test",
      idempotencyScope: `tenant_1:quote-delivery-approval:${idempotencyKey}`,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      approval: {
        assignedToPrincipalId: "user_1",
        policyName: "quote-delivery",
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
      actionName: "quotes.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "high",
      organizationId: "tenant_1",
    })
    const admitted: ToolHandlerActionPolicyContext = {
      ...SNAPSHOT_AND_SEND_QUOTE_HANDLER_POLICY,
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

function memoryNotifications(): QuotesNotificationsRuntime & {
  enqueueQuoteProposal: ReturnType<typeof vi.fn>
} {
  return {
    providerNames: ["durable-email:v1"],
    enqueueQuoteProposal: vi.fn(async (_db, input) => ({
      id: `ndel_${input.quoteVersionId}`,
      status: "pending" as const,
      channel: input.channel,
      provider: "durable-email:v1",
      providerMessageId: null,
      toAddress: input.to,
    })),
  }
}
