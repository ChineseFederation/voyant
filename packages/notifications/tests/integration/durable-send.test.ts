// agent-quality: file-size exception -- owner: notifications; one live database suite proves the full durable-send admission, lease, reconciliation, settlement, and dead-letter protocol.
import { randomUUID } from "node:crypto"

import {
  type ActionLedgerRequestContextValues,
  buildActionApprovalCommandFingerprint,
  decideActionLedgerApproval,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import { createDbClient } from "@voyant-travel/db"
import { eventOutboxTable } from "@voyant-travel/db/schema"
import { cleanupTestDb } from "@voyant-travel/db/test-utils"
import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import {
  notificationDeliveries,
  notificationSendOperations,
  notificationTemplates,
} from "../../src/schema.js"
import { createNotificationService } from "../../src/service.js"
import {
  drainDurableNotificationSends,
  enqueueNotification,
  executeDurableNotificationSendCommand,
  NOTIFICATION_SEND_COMPLETED_EVENT,
  NOTIFICATION_SEND_DEAD_LETTERED_EVENT,
  NOTIFICATION_SEND_REQUESTED_EVENT,
} from "../../src/service-durable-send.js"
import {
  type NotificationsToolServices,
  SEND_NOTIFICATION_HANDLER_POLICY,
  sendNotificationTool,
} from "../../src/tools.js"
import type {
  DurableNotificationDeliveryContext,
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
} from "../../src/types.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL
type ClosableTestDb = PostgresJsDatabase & {
  $client: { end(options?: { timeout?: number | null }): Promise<unknown> }
}

describe.skipIf(!DB_AVAILABLE)("durable notification sends", () => {
  let db: ClosableTestDb
  let provider: ReturnType<typeof durableProvider>

  beforeAll(() => {
    db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 2,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as ClosableTestDb
  })
  beforeEach(async () => {
    await cleanupTestDb(db)
    provider = durableProvider()
    await db.insert(notificationTemplates).values({
      slug: "agent-booking-confirmed",
      name: "Agent booking confirmation",
      channel: "email",
      provider: provider.name,
      status: "active",
      subjectTemplate: "Booking {{ bookingId }} confirmed",
      textTemplate: "Confirmed for {{ traveler }}",
      fromAddress: "bookings@example.test",
    })
  })

  it("admits and exactly replays the template-only v2 Tool command", async () => {
    const command = await approvedToolCommand(`tool-${randomUUID()}`)
    const first = await executeToolCommand(command)
    const replay = await executeToolCommand(command)
    expect(first.value).toMatchObject({
      templateSlug: "agent-booking-confirmed",
      status: "pending",
    })
    expect(replay).toEqual({ ...first, replayed: true })
    expect(await db.select().from(notificationSendOperations)).toHaveLength(1)
  })
  afterAll(async () => {
    await db.$client.end({ timeout: 0 })
  })

  it("atomically prepares once, replays canonically, and rejects payload and organization drift", async () => {
    const command = await approvedCommand(`concurrent-${randomUUID()}`)
    const [first, replay] = await Promise.all([execute(command), execute(command)])

    expect(first).toMatchObject({ id: replay.id, status: "pending" })
    expect(await db.select().from(notificationSendOperations)).toHaveLength(1)
    expect(await db.select().from(notificationDeliveries)).toHaveLength(1)
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_REQUESTED_EVENT,
      ),
    ).toHaveLength(1)

    await expect(
      execute({
        ...command,
        input: { ...command.input, data: { bookingId: "BK-DRIFT", traveler: "Other" } },
      }),
    ).rejects.toMatchObject({ name: "NotificationIdempotencyConflictError" })
    await expect(
      execute({
        ...command,
        input: { ...command.input, organizationId: "org_other" },
      }),
    ).rejects.toMatchObject({ name: "NotificationIdempotencyConflictError" })
    expect(await db.select().from(notificationSendOperations)).toHaveLength(1)
  })

  it("delivers identical payloads once per distinct admitted command", async () => {
    const firstCommand = await approvedCommand(`same-payload-a-${randomUUID()}`)
    const secondCommand = await approvedCommand(`same-payload-b-${randomUUID()}`)
    expect(secondCommand.input).toEqual(firstCommand.input)

    const first = await execute(firstCommand)
    const second = await execute(secondCommand)
    const replay = await execute(firstCommand)
    expect(replay).toEqual(first)
    expect(second.id).not.toBe(first.id)

    const operations = await db.select().from(notificationSendOperations)
    expect(operations).toHaveLength(2)
    expect(
      new Set(operations.map(({ providerIdempotencyKey }) => providerIdempotencyKey)).size,
    ).toBe(2)

    await expect(drainDurableNotificationSends(db, [provider])).resolves.toMatchObject({
      claimed: 2,
      sent: 2,
    })
    expect(provider.durableSend).toHaveBeenCalledTimes(2)
  })

  it("isolates provider delivery keys for identical payloads admitted in different organizations", async () => {
    const firstCommand = await approvedCommand(`cross-org-a-${randomUUID()}`, {
      contextOrganizationId: "org_notifications_a",
      omitInputOrganizationId: true,
    })
    const secondCommand = await approvedCommand(`cross-org-b-${randomUUID()}`, {
      contextOrganizationId: "org_notifications_b",
      omitInputOrganizationId: true,
    })
    expect(secondCommand.input).toEqual(firstCommand.input)

    await execute(firstCommand)
    await execute(secondCommand)
    const operations = await db.select().from(notificationSendOperations)
    expect(operations).toHaveLength(2)
    expect(
      new Set(operations.map(({ providerIdempotencyKey }) => providerIdempotencyKey)).size,
    ).toBe(2)

    await expect(drainDurableNotificationSends(db, [provider])).resolves.toMatchObject({
      claimed: 2,
      sent: 2,
    })
    expect(provider.durableSend).toHaveBeenCalledTimes(2)
  })

  it.each([
    "draft",
    "archived",
  ] as const)("rejects a %s template before committing the command intent", async (status) => {
    await db
      .update(notificationTemplates)
      .set({ status })
      .where(eq(notificationTemplates.slug, "agent-booking-confirmed"))
    const command = await approvedCommand(`inactive-${status}-${randomUUID()}`)

    await expect(execute(command)).rejects.toThrow("is not active and cannot be sent")
    expect(await db.select().from(notificationSendOperations)).toHaveLength(0)
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_REQUESTED_EVENT,
      ),
    ).toHaveLength(0)
  })

  it("rolls back the claim, delivery, operation, and requested event when preparation crashes", async () => {
    const command = await approvedCommand(`prepare-crash-${randomUUID()}`)
    await expect(
      enqueueNotification({
        db,
        registry: createNotificationService([provider]),
        input: { ...command.input, idempotencyKey: command.idempotencyKey },
        testHooks: {
          async afterPrepare() {
            throw new Error("injected prepare crash")
          },
        },
      }),
    ).rejects.toThrow("injected prepare crash")

    expect(await db.select().from(notificationSendOperations)).toHaveLength(0)
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_REQUESTED_EVENT,
      ),
    ).toHaveLength(0)
  })

  it("fails closed before committing intent when the selected provider contract is malformed", async () => {
    const command = await approvedCommand(`unsupported-${randomUUID()}`)
    const unsupported: NotificationProvider = {
      name: provider.name,
      channels: ["email"],
      defaultFromAddress: "unsupported@example.test",
      durableDelivery: {
        protocol: "unsupported-provider-protocol",
      },
    } as never

    await expect(
      enqueueNotification({
        db,
        registry: createNotificationService([unsupported]),
        input: { ...command.input, idempotencyKey: command.idempotencyKey },
      }),
    ).rejects.toThrow("provider durable delivery capability is incomplete")
    expect(await db.select().from(notificationSendOperations)).toHaveLength(0)
    expect(await db.select().from(notificationDeliveries)).toHaveLength(0)
  })

  it("retries provider success after a local settle crash without sending twice", async () => {
    const command = await approvedCommand(`provider-crash-${randomUUID()}`)
    const pending = await execute(command)
    expect(pending.status).toBe("pending")

    const acceptedCrash = vi.fn(async () => {
      throw new Error("injected post-provider crash")
    })
    const firstDrain = await drainDurableNotificationSends(db, [provider], {
      now: workerNow(),
      retryBaseMs: 0,
      testHooks: { afterProviderAccepted: acceptedCrash },
    })
    expect(firstDrain).toMatchObject({ claimed: 1, retried: 1, sent: 0 })
    expect(provider.durableSend).toHaveBeenCalledOnce()

    const recovered = await drainDurableNotificationSends(db, [provider], {
      now: workerNow(1_000),
      retryBaseMs: 0,
    })
    expect(recovered).toMatchObject({ claimed: 1, sent: 1, retried: 0 })
    expect(provider.durableSend).toHaveBeenCalledTimes(2)

    const replay = await execute(command)
    expect(replay).toMatchObject({
      id: pending.id,
      providerMessageId: expect.any(String),
      status: "sent",
    })
    expect(
      (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, pending.id))
      )[0],
    ).toMatchObject({ status: "sent", providerMessageId: expect.any(String) })
    const events = await db.select().from(eventOutboxTable)
    expect(events.filter(({ name }) => name === NOTIFICATION_SEND_REQUESTED_EVENT)).toHaveLength(1)
    expect(events.filter(({ name }) => name === NOTIFICATION_SEND_COMPLETED_EVENT)).toHaveLength(1)
  })

  it("rolls back mutable settlement when completion event capture fails", async () => {
    const command = await approvedCommand(`settle-rollback-${randomUUID()}`)
    const pending = await execute(command)
    const failedSettle = await drainDurableNotificationSends(db, [provider], {
      now: workerNow(),
      retryBaseMs: 0,
      testHooks: {
        async beforeCompletionEvent() {
          throw new Error("injected completion event failure")
        },
      },
    })
    expect(failedSettle).toMatchObject({ claimed: 1, retried: 1, sent: 0 })
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "retry",
      lastError: "injected completion event failure",
    })
    expect(
      (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, pending.id))
      )[0],
    ).toMatchObject({ status: "pending", providerMessageId: null, sentAt: null })
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_COMPLETED_EVENT,
      ),
    ).toHaveLength(0)

    await expect(
      drainDurableNotificationSends(db, [provider], {
        now: workerNow(1_000),
        retryBaseMs: 0,
      }),
    ).resolves.toMatchObject({ sent: 1 })
  })

  it("reclaims an expired processing lease and completes exactly once", async () => {
    const command = await approvedCommand(`lease-recovery-${randomUUID()}`)
    await execute(command)
    await db.update(notificationSendOperations).set({
      status: "processing",
      attempts: 1,
      leaseExpiresAt: new Date("2026-07-24T11:59:00.000Z"),
    })

    const recovered = await drainDurableNotificationSends(db, [provider], {
      now: workerNow(),
    })
    expect(recovered).toMatchObject({ claimed: 1, sent: 1 })
    expect(provider.durableSend).toHaveBeenCalledOnce()
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "sent",
      attempts: 2,
    })
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_COMPLETED_EVENT,
      ),
    ).toHaveLength(1)
  })

  it("fences an expired worker after a successor settles the same provider result", async () => {
    const command = await approvedCommand(`lease-fencing-${randomUUID()}`)
    await execute(command)
    let releaseFirst: () => void = () => undefined
    const holdFirst = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let providerAccepted: () => void = () => undefined
    const accepted = new Promise<void>((resolve) => {
      providerAccepted = resolve
    })
    const firstDrain = drainDurableNotificationSends(db, [provider], {
      now: workerNow(),
      visibilityTimeoutMs: 1_000,
      retryBaseMs: 0,
      testHooks: {
        async afterProviderAccepted() {
          providerAccepted()
          await holdFirst
        },
      },
    })
    await accepted

    const successor = await drainDurableNotificationSends(db, [provider], {
      now: workerNow(2_000),
      visibilityTimeoutMs: 1_000,
      retryBaseMs: 0,
    })
    expect(successor).toMatchObject({ claimed: 1, sent: 1 })
    releaseFirst()
    await expect(firstDrain).resolves.toMatchObject({
      claimed: 1,
      retried: 0,
      deadLettered: 0,
      sent: 0,
    })

    expect(provider.durableSend).toHaveBeenCalledTimes(2)
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "sent",
      attempts: 2,
    })
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_COMPLETED_EVENT,
      ),
    ).toHaveLength(1)
  })

  it("retries missing provider configuration before dead-lettering at the lease budget", async () => {
    const command = await approvedCommand(`provider-missing-${randomUUID()}`)
    const pending = await execute(command)
    await db.update(notificationSendOperations).set({ maxAttempts: 2 })

    const first = await drainDurableNotificationSends(db, [], {
      now: workerNow(),
      retryBaseMs: 0,
    })
    expect(first).toMatchObject({ claimed: 1, retried: 1, deadLettered: 0, sent: 0 })
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "retry",
      attempts: 1,
      lastError: "provider is not currently registered",
    })
    expect(
      (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, pending.id))
      )[0],
    ).toMatchObject({ status: "pending", errorMessage: null })

    const exhausted = await drainDurableNotificationSends(db, [], {
      now: workerNow(1_000),
      retryBaseMs: 0,
    })
    expect(exhausted).toMatchObject({ claimed: 1, deadLettered: 1, sent: 0 })
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "dead_letter",
      attempts: 2,
      lastError: "provider is not currently registered",
      completedAt: expect.any(Date),
    })
    expect(
      (
        await db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, pending.id))
      )[0],
    ).toMatchObject({ status: "failed", errorMessage: "provider is not currently registered" })
    expect(
      (await db.select().from(eventOutboxTable)).filter(
        ({ name }) => name === NOTIFICATION_SEND_DEAD_LETTERED_EVENT,
      ),
    ).toHaveLength(1)
  })

  it("dead-letters immediately when the selected provider drops the durable contract", async () => {
    const command = await approvedCommand(`provider-unsupported-${randomUUID()}`)
    await execute(command)
    const unsupported: NotificationProvider = {
      name: provider.name,
      channels: ["email"],
      defaultFromAddress: "unsupported@example.test",
      durableDelivery: { protocol: "unsupported-provider-protocol" },
    } as never

    const drained = await drainDurableNotificationSends(db, [unsupported], {
      now: workerNow(),
    })
    expect(drained).toMatchObject({ claimed: 1, deadLettered: 1, retried: 0 })
    expect((await db.select().from(notificationSendOperations))[0]).toMatchObject({
      status: "dead_letter",
      attempts: 1,
      lastError:
        'Notification provider "durable-test-email" cannot execute durable sends: provider durable delivery capability is incomplete',
    })
  })

  async function execute(command: Awaited<ReturnType<typeof approvedCommand>>) {
    return enqueueNotification({
      db,
      registry: createNotificationService([provider]),
      input: { ...command.input, idempotencyKey: command.idempotencyKey },
    })
  }

  async function executeToolCommand(command: Awaited<ReturnType<typeof approvedToolCommand>>) {
    const registry = createToolRegistry()
    registry.register(sendNotificationTool, {
      actionPolicy: SEND_NOTIFICATION_HANDLER_POLICY.actionPolicy,
    })
    let execution: Awaited<ReturnType<typeof executeDurableNotificationSendCommand>> | undefined
    await registry.dispatch(sendNotificationTool.name, command.input, {
      db,
      actor: command.context.actor,
      audience: command.context.actor,
      tenantId: command.context.organizationId,
      organizationId: command.context.organizationId,
      resolverScope: {
        locale: "en-GB",
        audience: command.context.actor,
        market: "default",
        actor: command.context.actor,
      },
      handlerActionPolicy: command.admitted,
      notifications: {
        async sendTemplated(_input, admitted) {
          execution = await executeDurableNotificationSendCommand({
            ...command,
            db,
            admitted,
            dispatcher: createNotificationService([provider]),
          })
          return execution.value
        },
      } as NotificationsToolServices,
    } satisfies ToolContext & { notifications: NotificationsToolServices })
    if (!execution) throw new Error("Notification Tool did not execute its durable command service")
    return execution
  }

  function workerNow(offsetMs = 0) {
    return new Date(Date.now() + 60_000 + offsetMs)
  }

  async function approvedCommand(
    idempotencyKey: string,
    options: {
      inputOrganizationId?: string
      contextOrganizationId?: string
      omitInputOrganizationId?: boolean
    } = {},
  ) {
    const organizationId = options.contextOrganizationId ?? "org_notifications"
    const input = {
      templateSlug: "agent-booking-confirmed",
      to: "traveler@example.test",
      channel: "email" as const,
      targetType: "other",
      data: { bookingId: "BK-100", traveler: "Mihai" },
      bookingId: "book_100",
      ...(options.omitInputOrganizationId
        ? {}
        : { organizationId: options.inputOrganizationId ?? organizationId }),
    }
    return { idempotencyKey, input }
  }

  async function approvedToolCommand(idempotencyKey: string) {
    const organizationId = "org_notifications"
    const context: ActionLedgerRequestContextValues = {
      userId: "usr_notifications_agent",
      callerType: "session",
      actor: "staff",
      organizationId,
    }
    const input = {
      templateSlug: "agent-booking-confirmed",
      to: "traveler@example.test",
      channel: "email" as const,
      data: { bookingId: "BK-100" },
      bookingId: "book_100",
      organizationId,
    }
    const policy = SEND_NOTIFICATION_HANDLER_POLICY.actionPolicy
    const reasonCode = "approved_agent_notification"
    const fingerprint = await buildActionApprovalCommandFingerprint({
      actionName: policy.capabilityId,
      actionVersion: policy.version,
      targetType: policy.targetType,
      targetId: input.templateSlug,
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
      targetId: input.templateSlug,
      routeOrToolName: SEND_NOTIFICATION_HANDLER_POLICY.capabilityId,
      capabilityId: policy.capabilityId,
      capabilityVersion: policy.version,
      authorizationSource: "integration_test",
      idempotencyScope: `${organizationId}:notifications-approval:${idempotencyKey}`,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      approval: {
        assignedToPrincipalId: "usr_notifications_agent",
        policyName: "notifications-agent-send",
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
      actionName: "notifications.approval.decision",
      actionVersion: "v1",
      evaluatedRisk: "high",
      organizationId,
    })
    const admitted: ToolHandlerActionPolicyContext = {
      capabilityId: SEND_NOTIFICATION_HANDLER_POLICY.capabilityId,
      capabilityVersion: SEND_NOTIFICATION_HANDLER_POLICY.capabilityVersion,
      canonicalName: SEND_NOTIFICATION_HANDLER_POLICY.canonicalName,
      actionPolicy: {
        ...policy,
        enforcement: "handler",
        invocation: {
          controlField: "_voyant",
          requiredFields: [
            "confirmed",
            "targetId",
            "idempotencyKey",
            "approvalId",
            "idempotencyFingerprint",
          ],
          optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
          fingerprintAlgorithm: "action-ledger-command-v1",
        },
      },
      invocation: {
        confirmed: true,
        targetId: input.templateSlug,
        idempotencyKey,
        approvalId: requested.approval.id,
        idempotencyFingerprint: fingerprint,
        reasonCode,
      },
    }
    return { context, admitted, input }
  }
})

function durableProvider() {
  const accepted = new Map<string, NotificationResult>()
  const durableSend = vi.fn(
    async (_payload: NotificationPayload, context: DurableNotificationDeliveryContext) => {
      const existing = accepted.get(context.idempotencyKey)
      if (existing) return existing
      const result = {
        id: `provider_${context.idempotencyKey.slice(-12)}`,
        provider: "durable-test-email",
      }
      accepted.set(context.idempotencyKey, result)
      return result
    },
  )
  return {
    name: "durable-test-email",
    channels: ["email"],
    defaultFromAddress: "durable@example.test",
    durableDelivery: {
      protocol: "notification-provider-idempotency-v1",
      send: durableSend,
    },
    durableSend,
  } satisfies NotificationProvider & {
    durableSend: ReturnType<typeof vi.fn>
  }
}
