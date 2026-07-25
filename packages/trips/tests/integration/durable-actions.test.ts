import {
  type ActionLedgerRequestContextValues,
  buildActionApprovalCommandFingerprint,
  decideActionLedgerApproval,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { createDbClient } from "@voyant-travel/db"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  DurableTripActionCapability,
  DurableTripActionCommand,
} from "../../src/durable-action-runtime-port.js"
import { tripActionOperations, tripEnvelopes } from "../../src/schema.js"
import {
  drainTripActionOperations,
  executeDurableTripActionCommand,
  getTripActionOperation,
} from "../../src/service-durable-actions.js"
import { PRICE_TRIP_HANDLER_POLICY } from "../../src/tools.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("Trips durable pricing and reservation actions", () => {
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

  it("atomically admits once, binds the exact backend, and settles through reconciliation", async () => {
    const [trip] = await db.insert(tripEnvelopes).values({ title: "Durable action" }).returning()
    if (!trip) throw new Error("failed to seed trip")
    const command = await approvedPriceCommand(trip.id, "price-command-1")
    const first = await executeDurableTripActionCommand(command)
    const replay = await executeDurableTripActionCommand(command)
    expect(first.replayed).toBe(false)
    expect(replay).toEqual({ ...first, replayed: true })
    expect(first.value).toMatchObject({
      status: "accepted",
      action: "price-trip",
      envelopeId: trip.id,
      statusTool: "get_trip_action_operation",
    })
    expect(await db.select().from(tripActionOperations)).toHaveLength(1)

    const provider = memoryProvider("catalog-composite:v1")
    await expect(
      drainTripActionOperations(db, { price: provider, reserve: provider }),
    ).resolves.toMatchObject({ processed: 1, completed: 1 })
    expect(provider.reconcile).toHaveBeenCalledTimes(1)
    expect(provider.execute).toHaveBeenCalledTimes(1)

    const settled = await getTripActionOperation(db, {
      operationId: first.value.operationId,
      envelopeId: trip.id,
      organizationId: "tenant_1",
    })
    expect(settled).toMatchObject({
      status: "completed",
      outcome: {
        status: "completed",
        backendIdentity: "catalog-composite:v1",
        providerOperationId: expect.any(String),
      },
    })
  })

  it("fails closed when the selected backend identity drifts", async () => {
    const [trip] = await db.insert(tripEnvelopes).values({ title: "Identity drift" }).returning()
    if (!trip) throw new Error("failed to seed trip")
    const accepted = await executeDurableTripActionCommand(
      await approvedPriceCommand(trip.id, "price-command-drift"),
    )
    await db
      .update(tripActionOperations)
      .set({ maxAttempts: 1 })
      .where(eq(tripActionOperations.id, accepted.value.operationId))
    const changed = memoryProvider("different-backend:v2")
    await expect(
      drainTripActionOperations(db, { price: changed, reserve: changed }),
    ).resolves.toMatchObject({ processed: 1, deadLettered: 1 })
    expect(changed.execute).not.toHaveBeenCalled()
  })

  async function approvedPriceCommand(envelopeId: string, idempotencyKey: string) {
    const context: ActionLedgerRequestContextValues = {
      userId: "user_1",
      callerType: "session",
      actor: "staff",
      organizationId: "tenant_1",
    }
    const input = {
      envelopeId,
      scope: { locale: "en-GB", audience: "staff" as const, market: "RO", currency: "EUR" },
    }
    const policy = PRICE_TRIP_HANDLER_POLICY.actionPolicy
    const reasonCode = "approved_trip_price"
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      targetType: policy.targetType,
      targetId: envelopeId,
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
      targetId: envelopeId,
      routeOrToolName: PRICE_TRIP_HANDLER_POLICY.capabilityId,
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      authorizationSource: "integration_test",
      idempotencyScope: `tenant_1:trip-price-approval:${idempotencyKey}`,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      approval: {
        assignedToPrincipalId: "user_1",
        policyName: "trip-price",
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
      actionName: "trips.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "high",
      organizationId: "tenant_1",
    })
    const admitted: ToolHandlerActionPolicyContext = {
      ...PRICE_TRIP_HANDLER_POLICY,
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
      action: "price-trip" as const,
      backendIdentity: "catalog-composite:v1",
      input,
      evaluatedRisk: "high" as const,
    }
  }
})

function memoryProvider(backendIdentity: string): DurableTripActionCapability & {
  execute: ReturnType<typeof vi.fn>
  reconcile: ReturnType<typeof vi.fn>
} {
  const accepted = new Map<string, object>()
  const execute = vi.fn(async (command: DurableTripActionCommand) => {
    const result = {
      backendIdentity,
      providerOperationId: `provider:${command.operationId}`,
      outcome: { priced: true },
    }
    accepted.set(command.idempotencyKey, result)
    return result
  })
  const reconcile = vi.fn(async (command: DurableTripActionCommand) => {
    return (accepted.get(command.idempotencyKey) as never) ?? null
  })
  return {
    protocol: "trips-provider-idempotency-v1",
    backendIdentity,
    execute,
    reconcile,
  }
}
