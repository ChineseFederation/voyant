// agent-quality: file-size exception -- owner: notifications; admission, immutable replay, provider reconciliation, leases, and settlement intentionally share one durable operation protocol.
import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import { sha256 } from "@voyant-travel/action-ledger/fingerprint"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { and, eq, inArray, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type NotificationSendOperation,
  type notificationChannelEnum,
  notificationDeliveries,
  notificationReminderRuns,
  notificationSendOperations,
  type notificationTargetTypeEnum,
  notificationTemplates,
} from "./schema.js"
import { normalizeDeliveryAttachments } from "./service-delivery-metadata.js"
import {
  NotificationError,
  NotificationIdempotencyConflictError,
  type NotificationService,
  renderNotificationTemplate,
  resolveDeliverySender,
  summarizeNotificationAttachments,
  toTimestamp,
} from "./service-shared.js"
import type { SendTemplatedNotificationInput } from "./tools.js"
import type {
  DurableNotificationDeliveryCapability,
  NotificationAttachment,
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
} from "./types.js"

export const NOTIFICATION_SEND_REQUESTED_EVENT = "notification.send-requested"
export const NOTIFICATION_SEND_COMPLETED_EVENT = "notification.sent"
export const NOTIFICATION_SEND_DEAD_LETTERED_EVENT = "notification.send-dead-lettered"

const DEFAULT_MAX_ATTEMPTS = 8
const DEFAULT_VISIBILITY_TIMEOUT_MS = 2 * 60_000
const DEFAULT_RETRY_BASE_MS = 5_000
const PROVIDER_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/
const ENQUEUE_SCOPE = "notifications.enqueue.v1"

export class NotificationDurableProviderError extends NotificationError {
  constructor(provider: string, reason: string) {
    super(`Notification provider "${provider}" cannot execute durable sends: ${reason}`)
    this.name = "NotificationDurableProviderError"
  }
}

export interface NotificationEnqueueRequest {
  idempotencyKey: string
  templateId?: string | null
  templateSlug?: string | null
  /**
   * Ledger label for a send whose template lives in CODE, not in
   * `notification_templates` — staff alerts, which are React Email components.
   *
   * Distinct from `templateSlug` on purpose: that field names a row that must
   * exist, and passing an unknown slug is an error worth failing on. A code
   * template has no row to find, so recording its name must not trigger the
   * lookup. Body and subject are pre-rendered by the caller either way.
   */
  templateLabel?: string | null
  channel?: (typeof notificationChannelEnum.enumValues)[number]
  provider?: string | null
  to: string
  from?: string | null
  subject?: string | null
  html?: string | null
  text?: string | null
  attachments?: ReadonlyArray<NotificationAttachment> | null
  data?: Record<string, unknown> | null
  targetType: (typeof notificationTargetTypeEnum.enumValues)[number]
  targetId?: string | null
  bookingId?: string | null
  invoiceId?: string | null
  paymentSessionId?: string | null
  reminderRunId?: string | null
  personId?: string | null
  organizationId?: string | null
  metadata?: Record<string, unknown> | null
  scheduledFor?: string | Date | null
  /**
   * Domain event emitted atomically with successful provider settlement.
   * Delivery/provider identifiers are added by the durable worker.
   */
  terminalEvent?: {
    name: string
    data: Record<string, unknown>
  } | null
}

export interface EnqueueNotificationInput {
  db: AnyDrizzleDb
  registry: NotificationService
  input: NotificationEnqueueRequest
  testHooks?: {
    afterPrepare?: (tx: AnyDrizzleDb, operationId: string) => Promise<void>
  }
}

export interface ExecuteDurableNotificationSendInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  dispatcher: NotificationService
  input: SendTemplatedNotificationInput
  testHooks?: {
    afterPrepare?: (tx: AnyDrizzleDb, operationId: string) => Promise<void>
  }
}

/** Admit the template-only Tool command and persist the immutable pending send. */
export async function executeDurableNotificationSendCommand(
  input: ExecuteDurableNotificationSendInput,
) {
  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput: input.input,
      evaluatedRisk: "high",
    },
    {
      async prepare(tx, command, payload) {
        const operationId = await prepareDurableNotificationSend(
          tx,
          input.dispatcher,
          command,
          payload,
        )
        await input.testHooks?.afterPrepare?.(tx, operationId)
      },
      execute: (command) => resolveDurableNotificationResult(input.db, command),
      replay: (command) => resolveDurableNotificationResult(input.db, command),
    },
  )
}

async function prepareDurableNotificationSend(
  tx: AnyDrizzleDb,
  dispatcher: NotificationService,
  command: AdmittedExistingTargetCommand,
  input: ExistingTargetCommandPayload<SendTemplatedNotificationInput>,
): Promise<string> {
  assertOrganizationScope(command, input.organizationId)
  const [template] = await tx
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.slug, input.templateSlug))
    .limit(1)
  if (!template) throw new NotificationError("Notification template not found")
  if (template.status !== "active") {
    throw new NotificationError(
      `Notification template "${template.slug}" is not active and cannot be sent`,
    )
  }

  const channel = input.channel ?? template.channel
  const defaultProvider = dispatcher.getProvider(channel)
  const providerName = template.provider ?? defaultProvider?.name
  if (!providerName) {
    throw new NotificationError(`No notification provider available for channel "${channel}"`)
  }
  const provider =
    providerName === defaultProvider?.name
      ? defaultProvider
      : dispatcher.getProviderByName(providerName)
  if (!provider) {
    throw new NotificationError(`No notification provider registered with name "${providerName}"`)
  }
  requireDurableCapability(provider)

  const data = input.data ?? {}
  const fromAddress = resolveDeliverySender({
    channel,
    provider,
    templateFrom: template.fromAddress,
  })
  const subject = renderNotificationTemplate(template.subjectTemplate, data)
  const html = renderNotificationTemplate(template.htmlTemplate, data)
  const text = renderNotificationTemplate(template.textTemplate, data)
  const providerPayload: NotificationPayload & Record<string, unknown> = {
    to: input.to,
    channel,
    provider: providerName,
    template: template.slug,
    data,
    ...(fromAddress ? { from: fromAddress } : {}),
    ...(subject ? { subject } : {}),
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  }
  const [delivery] = await tx
    .insert(notificationDeliveries)
    .values({
      templateId: template.id,
      templateSlug: template.slug,
      targetType: "other",
      targetId: template.slug,
      personId: input.personId ?? null,
      organizationId: input.organizationId ?? null,
      bookingId: input.bookingId ?? null,
      invoiceId: input.invoiceId ?? null,
      channel,
      provider: providerName,
      status: "pending",
      toAddress: input.to,
      fromAddress,
      subject: subject ?? null,
      htmlBody: html ?? null,
      textBody: text ?? null,
      payloadData: data,
      metadata: { durableCommand: true, claimActionId: command.causation.claimActionId },
    })
    .returning()
  if (!delivery) throw new NotificationError("Failed to prepare notification delivery")

  const [operation] = await tx
    .insert(notificationSendOperations)
    .values({
      commandScope: command.idempotency.scope,
      idempotencyKey: command.idempotency.key,
      requestFingerprint: command.idempotency.fingerprint,
      claimActionId: command.causation.claimActionId,
      organizationId: command.authorization.organizationId,
      targetType: command.target.type,
      targetId: command.target.id,
      deliveryId: delivery.id,
      provider: providerName,
      providerIdempotencyKey: providerDeliveryKey(command.causation.claimActionId),
      requestPayload: providerPayload,
      resultSnapshot: toJsonRecord(delivery),
      terminalEvent: null,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    })
    .returning()
  if (!operation) throw new NotificationError("Failed to prepare durable notification operation")

  await insertOutboxEvents(tx, [
    {
      name: NOTIFICATION_SEND_REQUESTED_EVENT,
      data: {
        operationId: operation.id,
        deliveryId: delivery.id,
        provider: providerName,
        targetType: command.target.type,
        targetId: command.target.id,
      },
      metadata: {
        category: "domain",
        source: "service",
        eventId: requestedEventId(operation.id),
        correlationId: command.causation.claimActionId,
      },
    },
  ])
  return operation.id
}

async function resolveDurableNotificationResult(
  db: AnyDrizzleDb,
  command: AdmittedExistingTargetCommand,
) {
  const [operation] = await db
    .select()
    .from(notificationSendOperations)
    .where(
      and(
        eq(notificationSendOperations.commandScope, command.idempotency.scope),
        eq(notificationSendOperations.idempotencyKey, command.idempotency.key),
      ),
    )
    .limit(1)
  if (
    !operation ||
    operation.requestFingerprint !== command.idempotency.fingerprint ||
    operation.claimActionId !== command.causation.claimActionId ||
    operation.targetType !== command.target.type ||
    operation.targetId !== command.target.id ||
    operation.organizationId !== command.authorization.organizationId
  ) {
    throw new NotificationError("Durable notification command state is missing or inconsistent")
  }
  return operation.resultSnapshot
}

/**
 * The only notification mutation path. It resolves the provider and template,
 * fingerprints the complete canonical delivery request, and atomically writes
 * the delivery, durable operation, reminder link, and requested outbox event.
 * Provider code is worker-only.
 */
export async function enqueueNotification({
  db,
  registry,
  input,
  testHooks,
}: EnqueueNotificationInput) {
  if (!input.idempotencyKey) {
    throw new NotificationError("Notification idempotencyKey is required")
  }

  let template: typeof notificationTemplates.$inferSelect | null = null
  if (input.templateId) {
    ;[template = null] = await db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.id, input.templateId))
      .limit(1)
  } else if (input.templateSlug) {
    ;[template = null] = await db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.slug, input.templateSlug))
      .limit(1)
  }
  if ((input.templateId || input.templateSlug) && !template) {
    throw new NotificationError("Notification template not found")
  }
  if (template && template.status !== "active") {
    throw new NotificationError(
      `Notification template "${template.slug}" is not active and cannot be sent`,
    )
  }

  const data = input.data ?? {}
  const channel = input.channel ?? template?.channel
  if (!channel) throw new NotificationError("Notification channel is required")
  const defaultProvider = registry.getProvider(channel)
  const providerName = input.provider ?? template?.provider ?? defaultProvider?.name
  if (!providerName) {
    throw new NotificationError(`No notification provider available for channel "${channel}"`)
  }
  const provider =
    providerName === defaultProvider?.name
      ? defaultProvider
      : registry.getProviderByName(providerName)
  if (!provider) {
    throw new NotificationError(`No notification provider registered with name "${providerName}"`)
  }
  requireDurableCapability(provider)

  const fromAddress = resolveDeliverySender({
    channel,
    provider,
    inputFrom: input.from,
    templateFrom: template?.fromAddress,
  })
  const subject = input.subject ?? renderNotificationTemplate(template?.subjectTemplate, data)
  const html = input.html ?? renderNotificationTemplate(template?.htmlTemplate, data)
  const text = input.text ?? renderNotificationTemplate(template?.textTemplate, data)
  const attachments = normalizeDeliveryAttachments(input.attachments)
  const attachmentSummary = summarizeNotificationAttachments(attachments)
  const scheduledFor = toTimestamp(input.scheduledFor)
  const deliveryMetadata =
    input.metadata || attachmentSummary.length > 0
      ? {
          ...(input.metadata ?? {}),
          ...(attachmentSummary.length > 0
            ? { attachmentCount: attachmentSummary.length, attachments: attachmentSummary }
            : {}),
        }
      : null
  const providerPayload: NotificationPayload & Record<string, unknown> = {
    to: input.to,
    channel,
    provider: providerName,
    template: template?.slug ?? input.templateSlug ?? "direct",
    data,
    ...(fromAddress ? { from: fromAddress } : {}),
    ...(subject ? { subject } : {}),
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments ? { attachments } : {}),
  }
  const canonicalRequest = {
    version: 1,
    template: template
      ? { id: template.id, slug: template.slug, updatedAt: template.updatedAt.toISOString() }
      : null,
    providerPayload,
    schedule: scheduledFor?.toISOString() ?? null,
    links: {
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      bookingId: input.bookingId ?? null,
      invoiceId: input.invoiceId ?? null,
      paymentSessionId: input.paymentSessionId ?? null,
      reminderRunId: input.reminderRunId ?? null,
      personId: input.personId ?? null,
      organizationId: input.organizationId ?? null,
    },
    metadata: input.metadata ?? null,
    terminalEvent: input.terminalEvent ?? null,
  }
  const requestFingerprint = `sha256:${await sha256(canonicalRequest)}`
  const claimActionId = `notification-enqueue:${await sha256({
    scope: ENQUEUE_SCOPE,
    key: input.idempotencyKey,
  })}`
  const providerIdempotencyKey = providerDeliveryKey(claimActionId)

  return db.transaction(async (tx) => {
    const transaction = tx as AnyDrizzleDb
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${ENQUEUE_SCOPE}:${input.idempotencyKey}`}))`,
    )
    const [existingOperation] = await transaction
      .select()
      .from(notificationSendOperations)
      .where(
        and(
          eq(notificationSendOperations.commandScope, ENQUEUE_SCOPE),
          eq(notificationSendOperations.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    if (existingOperation) {
      if (existingOperation.requestFingerprint !== requestFingerprint) {
        throw new NotificationIdempotencyConflictError()
      }
      const [existingDelivery] = await transaction
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.id, existingOperation.deliveryId))
        .limit(1)
      if (!existingDelivery) {
        throw new NotificationError("Idempotent notification lost its delivery")
      }
      return existingDelivery
    }

    const [delivery] = await transaction
      .insert(notificationDeliveries)
      .values({
        templateId: template?.id ?? null,
        templateSlug: template?.slug ?? input.templateSlug ?? input.templateLabel ?? null,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        personId: input.personId ?? null,
        organizationId: input.organizationId ?? null,
        bookingId: input.bookingId ?? null,
        invoiceId: input.invoiceId ?? null,
        paymentSessionId: input.paymentSessionId ?? null,
        channel,
        provider: providerName,
        status: "pending",
        toAddress: input.to,
        fromAddress,
        subject: subject ?? null,
        htmlBody: html ?? null,
        textBody: text ?? null,
        payloadData: data,
        metadata: deliveryMetadata,
        scheduledFor,
      })
      .returning()
    if (!delivery) throw new NotificationError("Failed to prepare notification delivery")

    const [operation] = await transaction
      .insert(notificationSendOperations)
      .values({
        commandScope: ENQUEUE_SCOPE,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        claimActionId,
        organizationId: input.organizationId ?? null,
        targetType: input.targetType,
        targetId: input.targetId ?? delivery.id,
        deliveryId: delivery.id,
        provider: providerName,
        providerIdempotencyKey,
        requestPayload: providerPayload,
        resultSnapshot: toJsonRecord(delivery),
        terminalEvent: input.terminalEvent ?? null,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      })
      .returning()
    if (!operation) throw new NotificationError("Failed to prepare durable notification operation")

    if (input.reminderRunId) {
      const linked = await transaction
        .update(notificationReminderRuns)
        .set({
          status: "queued",
          notificationDeliveryId: delivery.id,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(notificationReminderRuns.id, input.reminderRunId),
            eq(notificationReminderRuns.status, "queued"),
          ),
        )
        .returning()
      if (linked.length !== 1) {
        throw new NotificationError("Reminder run is not queued for durable admission")
      }
    }

    await insertOutboxEvents(transaction, [
      {
        name: NOTIFICATION_SEND_REQUESTED_EVENT,
        data: {
          operationId: operation.id,
          deliveryId: delivery.id,
          provider: providerName,
          targetType: input.targetType,
          targetId: input.targetId ?? delivery.id,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: requestedEventId(operation.id),
          correlationId: claimActionId,
        },
      },
    ])
    await testHooks?.afterPrepare?.(transaction, operation.id)
    return delivery
  })
}

export interface DrainDurableNotificationSendsOptions {
  limit?: number
  now?: Date
  visibilityTimeoutMs?: number
  retryBaseMs?: number
  testHooks?: {
    afterProviderAccepted?: (
      operation: NotificationSendOperation,
      result: NotificationResult,
    ) => Promise<void>
    beforeCompletionEvent?: (
      tx: AnyDrizzleDb,
      operation: NotificationSendOperation,
    ) => Promise<void>
  }
}

export interface DrainDurableNotificationSendsResult {
  claimed: number
  sent: number
  retried: number
  deadLettered: number
}

/**
 * Claim and process recoverable provider work. Every retry invokes the
 * provider's one idempotent mutation with the same provider-scoped key.
 */
export async function drainDurableNotificationSends(
  db: PostgresJsDatabase,
  providers: ReadonlyArray<NotificationProvider>,
  options: DrainDurableNotificationSendsOptions = {},
): Promise<DrainDurableNotificationSendsResult> {
  const now = options.now ?? new Date()
  const operations = await claimDurableNotificationSends(db, {
    limit: options.limit,
    now,
    visibilityTimeoutMs: options.visibilityTimeoutMs,
  })
  const byName = new Map(providers.map((provider) => [provider.name, provider]))
  const result = {
    claimed: operations.length,
    sent: 0,
    retried: 0,
    deadLettered: 0,
  }

  for (const operation of operations) {
    const provider = byName.get(operation.provider)
    if (!provider) {
      const terminal = operation.attempts >= operation.maxAttempts
      const transitioned = await failDurableNotificationSend(
        db,
        operation,
        "provider is not currently registered",
        now,
        options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
        terminal,
      )
      if (transitioned) {
        if (terminal) result.deadLettered += 1
        else result.retried += 1
      }
      continue
    }
    let capability: DurableNotificationDeliveryCapability
    try {
      capability = requireDurableCapability(provider)
    } catch (error) {
      const transitioned = await failDurableNotificationSend(
        db,
        operation,
        errorMessage(error),
        now,
        0,
        true,
      )
      if (transitioned) result.deadLettered += 1
      continue
    }

    try {
      const context = { idempotencyKey: operation.providerIdempotencyKey }
      const payload = notificationPayload(operation.requestPayload)
      const providerResult = await capability.send(payload, context)
      if (providerResult.provider !== operation.provider) {
        throw new NotificationError(
          `Durable notification provider result mismatch: expected "${operation.provider}", received "${providerResult.provider}"`,
        )
      }
      await options.testHooks?.afterProviderAccepted?.(operation, providerResult)
      const transitioned = await settleDurableNotificationSend(
        db,
        operation,
        providerResult,
        now,
        options.testHooks?.beforeCompletionEvent,
      )
      if (transitioned) result.sent += 1
    } catch (error) {
      const terminal = operation.attempts >= operation.maxAttempts
      const transitioned = await failDurableNotificationSend(
        db,
        operation,
        errorMessage(error),
        now,
        options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
        terminal,
      )
      if (transitioned) {
        if (terminal) result.deadLettered += 1
        else result.retried += 1
      }
    }
  }

  return result
}

/** Whether queued or leased sends require the exact selected provider runtime. */
export async function hasRecoverableNotificationSends(db: AnyDrizzleDb): Promise<boolean> {
  const rows = await db
    .select({ id: notificationSendOperations.id })
    .from(notificationSendOperations)
    .where(inArray(notificationSendOperations.status, ["pending", "processing", "retry"]))
    .limit(1)
  return rows.length > 0
}

async function claimDurableNotificationSends(
  db: PostgresJsDatabase,
  options: Pick<DrainDurableNotificationSendsOptions, "limit" | "now" | "visibilityTimeoutMs">,
): Promise<NotificationSendOperation[]> {
  const now = options.now ?? new Date()
  const leaseExpiresAt = new Date(
    now.getTime() + (options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS),
  )
  const nowIso = now.toISOString()
  const leaseExpiresAtIso = leaseExpiresAt.toISOString()
  // agent-quality: raw-sql reviewed -- owner: notifications; fixed table/column names with bound values implement one atomic SKIP LOCKED lease claim.
  const raw = await db.execute(sql`
    UPDATE notification_send_operations
    SET
      status = 'processing',
      attempts = attempts + 1,
      lease_expires_at = ${leaseExpiresAtIso},
      updated_at = ${nowIso}
    WHERE id IN (
      SELECT operation.id
      FROM notification_send_operations operation
      INNER JOIN notification_deliveries delivery ON delivery.id = operation.delivery_id
      WHERE
        (
          operation.status IN ('pending', 'retry')
          AND operation.attempts < operation.max_attempts
          AND operation.next_attempt_at <= ${nowIso}
          AND (delivery.scheduled_for IS NULL OR delivery.scheduled_for <= ${nowIso})
        )
        OR (operation.status = 'processing' AND operation.lease_expires_at <= ${nowIso})
      ORDER BY operation.next_attempt_at, operation.created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${Math.max(1, Math.min(options.limit ?? 25, 100))}
    )
    RETURNING *
  `)
  return resultRows<Record<string, unknown>>(raw).map(normalizeClaimedOperation)
}

async function settleDurableNotificationSend(
  db: PostgresJsDatabase,
  operation: NotificationSendOperation,
  result: NotificationResult,
  now: Date,
  beforeCompletionEvent:
    | ((tx: AnyDrizzleDb, operation: NotificationSendOperation) => Promise<void>)
    | undefined,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(notificationSendOperations)
      .set({
        status: "sent",
        leaseExpiresAt: null,
        lastError: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationSendOperations.id, operation.id),
          eq(notificationSendOperations.status, "processing"),
          eq(notificationSendOperations.leaseExpiresAt, operation.leaseExpiresAt!),
        ),
      )
      .returning({ id: notificationSendOperations.id })
    if (updated.length !== 1) return false
    await tx
      .update(notificationDeliveries)
      .set({
        status: "sent",
        providerMessageId: result.id ?? null,
        sentAt: now,
        failedAt: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, operation.deliveryId))
    await tx
      .update(notificationReminderRuns)
      .set({
        status: "sent",
        processedAt: now,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(notificationReminderRuns.notificationDeliveryId, operation.deliveryId))
    await beforeCompletionEvent?.(tx, operation)
    const events: Array<{
      name: string
      data: unknown
      metadata: {
        category: "domain"
        source: "service"
        eventId: string
        correlationId: string
      }
    }> = [
      {
        name: NOTIFICATION_SEND_COMPLETED_EVENT,
        data: {
          operationId: operation.id,
          deliveryId: operation.deliveryId,
          provider: result.provider,
          providerMessageId: result.id ?? null,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: completedEventId(operation.id),
          correlationId: operation.claimActionId,
        },
      },
    ]
    if (operation.terminalEvent) {
      events.push({
        name: operation.terminalEvent.name,
        data: {
          ...operation.terminalEvent.data,
          deliveryId: operation.deliveryId,
          provider: result.provider,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: terminalEventId(operation.id, operation.terminalEvent.name),
          correlationId: operation.claimActionId,
        },
      })
    }
    await insertOutboxEvents(tx, events)
    return true
  })
}

async function failDurableNotificationSend(
  db: PostgresJsDatabase,
  operation: NotificationSendOperation,
  message: string,
  now: Date,
  retryBaseMs: number,
  terminal: boolean,
): Promise<boolean> {
  const lastError = message.slice(0, 2_000)
  const nextAttemptAt = new Date(
    now.getTime() + Math.min(retryBaseMs * 2 ** Math.max(0, operation.attempts - 1), 15 * 60_000),
  )
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(notificationSendOperations)
      .set({
        status: terminal ? "dead_letter" : "retry",
        leaseExpiresAt: null,
        lastError,
        nextAttemptAt,
        completedAt: terminal ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationSendOperations.id, operation.id),
          eq(notificationSendOperations.status, "processing"),
          eq(notificationSendOperations.leaseExpiresAt, operation.leaseExpiresAt!),
        ),
      )
      .returning({ id: notificationSendOperations.id })
    if (updated.length !== 1) return false
    if (!terminal) return true
    await tx
      .update(notificationDeliveries)
      .set({
        status: "failed",
        failedAt: now,
        errorMessage: lastError,
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, operation.deliveryId))
    await tx
      .update(notificationReminderRuns)
      .set({
        status: "failed",
        processedAt: now,
        errorMessage: lastError,
        updatedAt: now,
      })
      .where(eq(notificationReminderRuns.notificationDeliveryId, operation.deliveryId))
    await insertOutboxEvents(tx, [
      {
        name: NOTIFICATION_SEND_DEAD_LETTERED_EVENT,
        data: {
          operationId: operation.id,
          deliveryId: operation.deliveryId,
          provider: operation.provider,
          attempts: operation.attempts,
          error: lastError,
        },
        metadata: {
          category: "domain",
          source: "service",
          eventId: deadLetteredEventId(operation.id),
          correlationId: operation.claimActionId,
        },
      },
    ])
    return true
  })
}

function requireDurableCapability(
  provider: NotificationProvider,
): DurableNotificationDeliveryCapability {
  const capability = provider.durableDelivery
  if (!capability) {
    throw new NotificationDurableProviderError(
      provider.name,
      "provider does not declare durable delivery support",
    )
  }
  if (
    capability.protocol !== "notification-provider-idempotency-v1" ||
    typeof capability.send !== "function"
  ) {
    throw new NotificationDurableProviderError(
      provider.name,
      "provider durable delivery capability is incomplete",
    )
  }
  return capability
}

function assertOrganizationScope(
  command: AdmittedExistingTargetCommand,
  associatedOrganizationId: string | undefined,
): void {
  if (
    associatedOrganizationId !== undefined &&
    associatedOrganizationId !== command.authorization.organizationId
  ) {
    throw new NotificationError(
      "Notification organization association does not match the admitted organization",
    )
  }
}

function providerDeliveryKey(claimActionId: string): string {
  const key = `voyant:notification:${claimActionId.replace("notification-enqueue:", "")}`
  if (!PROVIDER_IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new NotificationError("Admitted notification command cannot form a provider-safe key")
  }
  return key
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows
  }
  return []
}

function normalizeClaimedOperation(row: Record<string, unknown>): NotificationSendOperation {
  return {
    id: row.id,
    commandScope: row.command_scope ?? row.commandScope,
    idempotencyKey: row.idempotency_key ?? row.idempotencyKey,
    requestFingerprint: row.request_fingerprint ?? row.requestFingerprint,
    claimActionId: row.claim_action_id ?? row.claimActionId,
    organizationId: row.organization_id ?? row.organizationId ?? null,
    targetType: row.target_type ?? row.targetType,
    targetId: row.target_id ?? row.targetId,
    deliveryId: row.delivery_id ?? row.deliveryId,
    provider: row.provider,
    providerIdempotencyKey: row.provider_idempotency_key ?? row.providerIdempotencyKey,
    requestPayload: row.request_payload ?? row.requestPayload,
    resultSnapshot: row.result_snapshot ?? row.resultSnapshot,
    terminalEvent: row.terminal_event ?? row.terminalEvent ?? null,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts ?? row.maxAttempts,
    nextAttemptAt: coerceDate(row.next_attempt_at ?? row.nextAttemptAt),
    leaseExpiresAt:
      (row.lease_expires_at ?? row.leaseExpiresAt) == null
        ? null
        : coerceDate(row.lease_expires_at ?? row.leaseExpiresAt),
    lastError: row.last_error ?? row.lastError ?? null,
    completedAt:
      (row.completed_at ?? row.completedAt) == null
        ? null
        : coerceDate(row.completed_at ?? row.completedAt),
    createdAt: coerceDate(row.created_at ?? row.createdAt),
    updatedAt: coerceDate(row.updated_at ?? row.updatedAt),
  } as NotificationSendOperation
}

function coerceDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}

function toJsonRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return toJsonRecord(value)
}

function notificationPayload(value: Record<string, unknown>): NotificationPayload {
  const to = requiredPayloadString(value, "to")
  const channel = requiredPayloadString(value, "channel")
  const template = requiredPayloadString(value, "template")
  const provider = optionalPayloadString(value, "provider")
  const from = optionalPayloadString(value, "from")
  const subject = optionalPayloadString(value, "subject")
  const html = optionalPayloadString(value, "html")
  const text = optionalPayloadString(value, "text")
  const attachments = notificationAttachments(value.attachments)
  return {
    to,
    channel,
    template,
    data: value.data,
    ...(provider ? { provider } : {}),
    ...(from ? { from } : {}),
    ...(subject ? { subject } : {}),
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(attachments ? { attachments } : {}),
  }
}

function notificationAttachments(value: unknown): NotificationPayload["attachments"] {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new NotificationError('Durable notification payload has invalid "attachments"')
  }
  return value.map((attachment) => {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
      throw new NotificationError('Durable notification payload has invalid "attachments"')
    }
    const record = attachment as Record<string, unknown>
    const filename = requiredPayloadString(record, "filename")
    return {
      filename,
      ...copyOptionalAttachmentString(record, "contentBase64"),
      ...copyOptionalAttachmentString(record, "path"),
      ...copyOptionalAttachmentString(record, "contentType"),
      ...copyOptionalAttachmentString(record, "disposition"),
      ...copyOptionalAttachmentString(record, "contentId"),
    }
  }) as NotificationPayload["attachments"]
}

function copyOptionalAttachmentString(
  value: Record<string, unknown>,
  field: string,
): Record<string, string> {
  const candidate = optionalPayloadString(value, field)
  return candidate === undefined ? {} : { [field]: candidate }
}

function requiredPayloadString(value: Record<string, unknown>, field: string): string {
  const candidate = value[field]
  if (typeof candidate !== "string" || !candidate) {
    throw new NotificationError(`Durable notification payload is missing "${field}"`)
  }
  return candidate
}

function optionalPayloadString(value: Record<string, unknown>, field: string): string | undefined {
  const candidate = value[field]
  if (candidate === undefined) return undefined
  if (typeof candidate !== "string") {
    throw new NotificationError(`Durable notification payload has invalid "${field}"`)
  }
  return candidate
}

function requestedEventId(operationId: string): string {
  return `evt_notifications_send_requested_${operationId}`
}

function completedEventId(operationId: string): string {
  return `evt_notifications_send_completed_${operationId}`
}

function terminalEventId(operationId: string, eventName: string): string {
  return `evt_notifications_send_terminal_${operationId}_${eventName}`
}

function deadLetteredEventId(operationId: string): string {
  return `evt_notifications_send_dead_lettered_${operationId}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Notification provider delivery failed"
}
