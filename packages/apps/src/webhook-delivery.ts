import type { EventEnvelope } from "@voyant-travel/core"
import { isExternalWebhookPayloadSchema } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { newId } from "@voyant-travel/db/lib/typeid"
import {
  type InfraWebhookDelivery,
  infraWebhookDeliveriesTable,
  infraWebhookDeliverySelectSchema,
} from "@voyant-travel/db/schema/infra"
import {
  type CreateWebhookDeliveryWorkerOptions,
  createAppWebhookDeliveryEnvelope,
  createSelectedExternalWebhookQueue,
  createWebhookDeliveryWorker,
  type ExternalWebhookEventContract,
  hashWebhookPayload,
  isAppWebhookDeliveryEnvelope,
  serializeWebhookPayload,
  type WebhookDeliveryStore,
  type WebhookDeliveryWorker,
  type WebhookEnqueueOutcome,
  type WebhookSigningKey,
  webhookBodyExcerpt,
} from "@voyant-travel/webhook-delivery"
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { audit } from "./installation-reconciliation.js"
import type { AppsWebhookDeliveryRuntime } from "./runtime-port.js"
import { appInstallations, appWebhookSubscriptions } from "./schema.js"

export interface AppWebhookDeliveryOptions {
  contracts: readonly ExternalWebhookEventContract[]
  resolveSigningKey(input: { appId: string; installationId: string }): Promise<WebhookSigningKey>
  terminalFailureThreshold?: number
  now?: () => Date
}

export function createAppWebhookDeliveryStore(
  db: PostgresJsDatabase,
  options: Omit<AppWebhookDeliveryOptions, "contracts">,
): WebhookDeliveryStore {
  const threshold = options.terminalFailureThreshold ?? 5
  const now = options.now ?? (() => new Date())

  return {
    async listActiveSubscriptions(eventName) {
      const rows = await selectSubscriptionRows(db, eventName)
      return Promise.all(rows.map((row) => toWebhookSubscription(row, options.resolveSigningKey)))
    },

    async getSubscription(id) {
      const rows = await selectSubscriptionRows(db, undefined, id)
      const row = rows[0]
      return row ? toWebhookSubscription(row, options.resolveSigningKey) : null
    },

    async enqueueAttempt(input) {
      const existing = await db
        .select()
        .from(infraWebhookDeliveriesTable)
        .where(
          and(
            eq(infraWebhookDeliveriesTable.idempotencyKey, input.idempotencyKey),
            eq(infraWebhookDeliveriesTable.attemptNumber, input.attemptNumber),
          ),
        )
        .limit(1)
      if (existing[0]) {
        return { attempt: infraWebhookDeliverySelectSchema.parse(existing[0]), created: false }
      }
      const [row] = await db
        .insert(infraWebhookDeliveriesTable)
        .values(pending({ ...input, sourceModule: "apps" }))
        .returning()
      if (!row) throw new Error("App webhook attempt insert returned no row")
      return { attempt: infraWebhookDeliverySelectSchema.parse(row), created: true }
    },

    async listReadyAttemptIds(at, staleBefore, limit) {
      const rows = await db
        .select({ id: infraWebhookDeliveriesTable.id })
        .from(infraWebhookDeliveriesTable)
        .where(
          and(
            eq(infraWebhookDeliveriesTable.targetKind, "app"),
            or(
              and(
                eq(infraWebhookDeliveriesTable.status, "pending"),
                or(
                  isNull(infraWebhookDeliveriesTable.scheduledFor),
                  lte(infraWebhookDeliveriesTable.scheduledFor, at),
                ),
              ),
              and(
                eq(infraWebhookDeliveriesTable.status, "in_flight"),
                lte(infraWebhookDeliveriesTable.startedAt, staleBefore),
              ),
            ),
          ),
        )
        .orderBy(asc(infraWebhookDeliveriesTable.scheduledFor), asc(infraWebhookDeliveriesTable.id))
        .limit(limit)
      return rows.map(({ id }) => id)
    },

    async claimAttempt(id, at, staleBefore) {
      const rows = await db
        .update(infraWebhookDeliveriesTable)
        .set({ status: "in_flight", startedAt: at, updatedAt: at })
        .where(
          and(
            eq(infraWebhookDeliveriesTable.id, id),
            eq(infraWebhookDeliveriesTable.targetKind, "app"),
            or(
              eq(infraWebhookDeliveriesTable.status, "pending"),
              and(
                eq(infraWebhookDeliveriesTable.status, "in_flight"),
                lte(infraWebhookDeliveriesTable.startedAt, staleBefore),
              ),
            ),
          ),
        )
        .returning()
      return rows[0] ? infraWebhookDeliverySelectSchema.parse(rows[0]) : null
    },

    async completeAttempt(input) {
      const [row] = await db
        .update(infraWebhookDeliveriesTable)
        .set({ ...input, updatedAt: input.finishedAt })
        .where(eq(infraWebhookDeliveriesTable.id, input.id))
        .returning()
      if (!row) throw new Error(`Webhook attempt ${input.id} was not in flight`)
      return infraWebhookDeliverySelectSchema.parse(row)
    },

    async completeAndEnqueueRetry(completion, retry) {
      return db.transaction(async (tx) => {
        const completed = await createAppWebhookDeliveryStore(tx, options).completeAttempt(
          completion,
        )
        const enqueued = await createAppWebhookDeliveryStore(tx, options).enqueueAttempt(retry)
        return { completed, retry: enqueued.attempt }
      })
    },

    async recordSubscriptionOutcome(subscriptionId, succeeded, at) {
      const patch = succeeded
        ? { lastDeliveryAt: at, failureCount: 0, updatedAt: at }
        : {
            lastDeliveryAt: at,
            // agent-quality: raw-sql reviewed -- owner: apps; Drizzle supplies the column identifier and no caller-controlled SQL is interpolated.
            failureCount: sql`${appWebhookSubscriptions.failureCount} + 1`,
            updatedAt: at,
          }
      const [subscription] = await db
        .update(appWebhookSubscriptions)
        .set(patch)
        .where(eq(appWebhookSubscriptions.id, subscriptionId))
        .returning()
      if (!succeeded && subscription && subscription.failureCount >= threshold) {
        const [installation] = await db
          .update(appInstallations)
          .set({ status: "degraded", degradedAt: now(), updatedAt: now() })
          .where(
            and(
              eq(appInstallations.id, subscription.installationId),
              eq(appInstallations.status, "active"),
            ),
          )
          .returning()
        await db
          .update(appWebhookSubscriptions)
          .set({ status: "failed", pausedAt: now(), deactivatedAt: now() })
          .where(eq(appWebhookSubscriptions.id, subscriptionId))
        if (installation) {
          await audit(db, installation, "system", "reconciliation", "webhooks.degraded", {
            subscriptionId,
            failureCount: subscription.failureCount,
          })
        }
      }
    },
  }
}

export function createAppWebhookEventQueue(
  db: PostgresJsDatabase,
  options: AppWebhookDeliveryOptions,
) {
  return createSelectedExternalWebhookQueue({
    contracts: options.contracts,
    store: createAppWebhookDeliveryStore(db, options),
    now: options.now,
  })
}

export async function enqueueAppWebhookEvent(
  db: PostgresJsDatabase,
  event: EventEnvelope,
  options: AppWebhookDeliveryOptions,
): Promise<WebhookEnqueueOutcome[]> {
  return createAppWebhookEventQueue(db, options).enqueue(event)
}

export interface CreateAppWebhookDeliveryEnqueuerOptions extends AppWebhookDeliveryOptions {
  resolveDatabase(bindings: unknown): AnyDrizzleDb
}

/** Node-host adapter that persists installed-app deliveries without performing HTTP. */
export function createAppWebhookDeliveryEnqueuer(
  options: CreateAppWebhookDeliveryEnqueuerOptions,
): {
  enqueue(event: EventEnvelope, bindings: unknown): Promise<WebhookEnqueueOutcome[]>
} {
  return {
    enqueue: (event, bindings) => {
      const selectedContract = options.contracts.find(
        (contract) =>
          contract.eventId === event.metadata?.graphEventId &&
          contract.eventVersion === event.metadata?.graphEventVersion,
      )
      return enqueueAppWebhookEvent(
        options.resolveDatabase(bindings) as PostgresJsDatabase,
        event,
        {
          // The catalog may retain multiple versions of one event type. Framework
          // subscribers stamp the exact selected graph contract on each delivery,
          // so construct this queue with that one version instead of collapsing or
          // ambiguously duplicating the event type.
          contracts: selectedContract ? [selectedContract] : options.contracts,
          resolveSigningKey: options.resolveSigningKey,
          ...(options.terminalFailureThreshold === undefined
            ? {}
            : { terminalFailureThreshold: options.terminalFailureThreshold }),
          ...(options.now ? { now: options.now } : {}),
        },
      )
    },
  }
}

export type CreateAppWebhookDeliveryWorkerOptions = Omit<
  CreateWebhookDeliveryWorkerOptions,
  "store"
> & {
  resolveSigningKey: AppsWebhookDeliveryRuntime["resolveSigningKey"]
  terminalFailureThreshold?: number
}

/** Create a worker that claims only app-owned delivery rows. */
export function createAppWebhookDeliveryWorker(
  db: AnyDrizzleDb,
  options: CreateAppWebhookDeliveryWorkerOptions,
): WebhookDeliveryWorker {
  const { resolveSigningKey, terminalFailureThreshold, ...workerOptions } = options
  return createWebhookDeliveryWorker({
    ...workerOptions,
    store: createAppWebhookDeliveryStore(db as PostgresJsDatabase, {
      resolveSigningKey,
      ...(terminalFailureThreshold === undefined ? {} : { terminalFailureThreshold }),
      ...(workerOptions.now ? { now: workerOptions.now } : {}),
    }),
  })
}

export async function listAppWebhookHealth(db: PostgresJsDatabase, installationId: string) {
  const subscriptions = await db
    .select()
    .from(appWebhookSubscriptions)
    .where(eq(appWebhookSubscriptions.installationId, installationId))
    .orderBy(appWebhookSubscriptions.eventType, appWebhookSubscriptions.eventVersion)
  return { data: subscriptions }
}

export async function replayAppWebhookDelivery(
  db: PostgresJsDatabase,
  input: {
    deliveryId: string
    actorId: string
    expectedInstallationId: string
    expectedAppId?: string
    resolveSigningKey: AppWebhookDeliveryOptions["resolveSigningKey"]
  },
) {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(infraWebhookDeliveriesTable)
      .where(eq(infraWebhookDeliveriesTable.id, input.deliveryId))
      .limit(1)
    if (!original || !isAppWebhookDeliveryEnvelope(original.requestPayload)) {
      throw new Error("Replay requires a retained app webhook delivery.")
    }
    const [installation] = await tx
      .select()
      .from(appInstallations)
      .where(eq(appInstallations.id, original.requestPayload.installationId))
      .limit(1)
    if (installation?.status !== "active") {
      throw new Error("Replay requires an active app installation.")
    }
    if (
      installation.id !== input.expectedInstallationId ||
      (input.expectedAppId !== undefined && installation.appId !== input.expectedAppId)
    ) {
      throw new Error("Replay delivery does not belong to the authenticated app installation.")
    }
    const [subscription] = await tx
      .select()
      .from(appWebhookSubscriptions)
      .where(
        and(
          eq(appWebhookSubscriptions.id, original.subscriptionId ?? ""),
          eq(appWebhookSubscriptions.installationId, installation.id),
          eq(appWebhookSubscriptions.status, "active"),
        ),
      )
      .limit(1)
    if (!subscription?.signingKeyId) {
      throw new Error("Replay requires an active subscription with a confirmed signing key.")
    }
    const signingKey = await input.resolveSigningKey({
      appId: installation.appId,
      installationId: installation.id,
    })
    if (signingKey.id !== subscription.signingKeyId) {
      throw new Error("Replay signing key does not match the confirmed subscription key.")
    }
    const parsedOriginal = infraWebhookDeliverySelectSchema.parse(original)
    const replayed = replayInput(parsedOriginal, original.requestPayload)
    const store = createAppWebhookDeliveryStore(tx, {
      resolveSigningKey: async () => signingKey,
    })
    const enqueued = await store.enqueueAttempt(replayed)
    await audit(tx, installation, input.actorId, "reconciliation", "webhooks.replay", {
      originalDeliveryId: original.id,
      replayDeliveryId: enqueued.attempt.id,
    })
    return enqueued.attempt
  })
}

async function selectSubscriptionRows(
  db: PostgresJsDatabase,
  eventName?: string,
  subscriptionId?: string,
) {
  return db
    .select({
      id: appWebhookSubscriptions.id,
      installationId: appWebhookSubscriptions.installationId,
      appId: appInstallations.appId,
      eventVersion: appWebhookSubscriptions.eventVersion,
      endpointUrl: appWebhookSubscriptions.endpointUrl,
      signingKeyId: appWebhookSubscriptions.signingKeyId,
    })
    .from(appWebhookSubscriptions)
    .innerJoin(appInstallations, eq(appInstallations.id, appWebhookSubscriptions.installationId))
    .where(
      and(
        eventName ? eq(appWebhookSubscriptions.eventType, eventName) : undefined,
        subscriptionId ? eq(appWebhookSubscriptions.id, subscriptionId) : undefined,
        eq(appWebhookSubscriptions.status, "active"),
        eq(appInstallations.status, "active"),
      ),
    )
}

async function toWebhookSubscription(
  row: Awaited<ReturnType<typeof selectSubscriptionRows>>[number],
  resolveSigningKey: AppWebhookDeliveryOptions["resolveSigningKey"],
) {
  if (!row.signingKeyId) {
    throw new Error(`App webhook subscription ${row.id} has no confirmed signing key.`)
  }
  const key = await resolveSigningKey({ appId: row.appId, installationId: row.installationId })
  if (key.id !== row.signingKeyId) {
    throw new Error(
      `App webhook subscription ${row.id} expects signing key ${row.signingKeyId}, not ${key.id}.`,
    )
  }
  return {
    id: row.id,
    url: row.endpointUrl,
    secret: key.secret,
    keyId: key.id,
    headers: null,
    maxRetries: 5,
    active: true,
    app: {
      installationId: row.installationId,
      appId: row.appId,
      eventVersion: row.eventVersion,
    },
  }
}

function pending(input: Parameters<WebhookDeliveryStore["enqueueAttempt"]>[0]) {
  return {
    id: input.id ?? newId("webhook_deliveries"),
    sourceModule: input.sourceModule,
    sourceEvent: input.sourceEvent,
    sourceEntityModule: input.sourceEntityModule,
    sourceEntityId: input.sourceEntityId,
    subscriptionId: input.subscriptionId,
    targetUrl: input.targetUrl,
    targetKind: "app",
    targetRef: input.subscriptionId,
    requestMethod: input.requestMethod,
    requestHeaders: input.requestHeaders,
    requestBodyHash: input.requestBodyHash,
    requestBodyExcerpt: input.requestBodyExcerpt,
    requestPayload: objectRecord(input.requestPayload),
    deliveryContract: objectRecord(input.deliveryContract),
    attemptNumber: input.attemptNumber,
    parentDeliveryId: input.parentDeliveryId,
    idempotencyKey: input.idempotencyKey,
    status: "pending" as const,
    scheduledFor: input.scheduledFor,
    startedAt: null,
  } as const
}

function replayInput(
  original: InfraWebhookDelivery,
  envelope: ReturnType<typeof createAppWebhookDeliveryEnvelope>,
) {
  const contract = parseDeliveryContract(original.deliveryContract)
  const deliveryId = newId("webhook_deliveries")
  const replay = createAppWebhookDeliveryEnvelope({
    deliveryId,
    installationId: envelope.installationId,
    appId: envelope.appId,
    event: {
      name: envelope.event.type,
      data: envelope.payload,
      emittedAt: envelope.event.occurredAt,
      metadata: envelope.metadata,
    },
    contract,
    deliveredAt: new Date(),
    attemptNumber: 1,
    maxRetries: envelope.attempt.maxRetries,
    idempotencyKey: `app-webhook-replay:${original.id}:${deliveryId}`,
    originalDeliveryId: original.id,
  })
  const body = serializeWebhookPayload(replay)
  return {
    id: deliveryId,
    sourceModule: "apps",
    sourceEvent: envelope.event.type,
    sourceEntityModule: envelope.subject.module,
    sourceEntityId: envelope.subject.id,
    subscriptionId: original.subscriptionId ?? "",
    targetUrl: original.targetUrl,
    requestMethod: "POST",
    requestHeaders: original.requestHeaders ?? {},
    requestBodyHash: hashWebhookPayload(body),
    requestBodyExcerpt: webhookBodyExcerpt(body),
    requestPayload: replay,
    deliveryContract: contract,
    attemptNumber: 1,
    parentDeliveryId: original.id,
    idempotencyKey: replay.attempt.idempotencyKey,
    scheduledFor: new Date(),
  }
}

function objectRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value))
}

function parseDeliveryContract(value: unknown): ExternalWebhookEventContract {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).eventId === "string" &&
    typeof (value as Record<string, unknown>).eventType === "string" &&
    typeof (value as Record<string, unknown>).eventVersion === "string" &&
    isExternalWebhookPayloadSchema((value as Record<string, unknown>).payloadSchema)
  ) {
    return value as ExternalWebhookEventContract
  }
  throw new Error("Replay requires a delivery contract snapshot.")
}
