import type { EventEnvelope } from "@voyant-travel/core"
import { isExternalWebhookPayloadSchema } from "@voyant-travel/core/project"
import { newId } from "@voyant-travel/db/lib/typeid"

import { createAppWebhookDeliveryEnvelope } from "./app-envelope.js"
import { type ExternalWebhookEventContract, prepareExternalWebhookEvent } from "./contracts.js"
import { hashWebhookPayload, serializeWebhookPayload, webhookBodyExcerpt } from "./security.js"
import type {
  SelectedExternalWebhookQueue,
  WebhookDeliveryStore,
  WebhookEnqueueOutcome,
} from "./types.js"

export interface CreateSelectedExternalWebhookQueueOptions {
  contracts: readonly ExternalWebhookEventContract[]
  store: WebhookDeliveryStore
  now?: () => Date
}

export function createSelectedExternalWebhookQueue(
  options: CreateSelectedExternalWebhookQueueOptions,
): SelectedExternalWebhookQueue {
  const contracts = contractCatalog(options.contracts)
  const now = options.now ?? (() => new Date())

  return {
    async enqueue(input) {
      const eventId = requireEventId(input)
      const contract = contracts.get(input.name)
      if (!contract) {
        throw new Error(`Event "${input.name}" is not in the selected external catalog.`)
      }
      const event = prepareExternalWebhookEvent(input, contract)
      const subscriptions = await options.store.listActiveSubscriptions(event.name)

      return Promise.all(
        subscriptions
          .filter(
            (subscription) =>
              !subscription.app || subscription.app.eventVersion === contract.eventVersion,
          )
          .map(async (subscription): Promise<WebhookEnqueueOutcome> => {
            const deliveryId = newId("webhook_deliveries")
            const idempotencyKey = `graph-webhook:${eventId}:${subscription.id}`
            const payload = subscription.app
              ? createAppWebhookDeliveryEnvelope({
                  deliveryId,
                  installationId: subscription.app.installationId,
                  appId: subscription.app.appId,
                  event,
                  contract,
                  deliveredAt: now(),
                  attemptNumber: 1,
                  maxRetries: subscription.maxRetries,
                  idempotencyKey,
                })
              : event
            const body = serializeWebhookPayload(payload)
            const enqueued = await options.store.enqueueAttempt({
              id: deliveryId,
              sourceModule:
                stringMetadata(input, "graphEventSourceModule") ?? "graph-outbound-webhooks",
              sourceEvent: event.name,
              ...sourceEntity(event.data),
              subscriptionId: subscription.id,
              targetUrl: subscription.url,
              requestMethod: "POST",
              requestHeaders: {
                "content-type": "application/json",
                "idempotency-key": idempotencyKey,
                "x-voyant-event": event.name,
                "x-voyant-event-id": eventId,
                "x-voyant-event-contract": contract.eventId,
                "x-voyant-event-version": contract.eventVersion,
              },
              requestBodyHash: hashWebhookPayload(body),
              requestBodyExcerpt: webhookBodyExcerpt(body),
              requestPayload: payload,
              deliveryContract: contract,
              attemptNumber: 1,
              parentDeliveryId: null,
              idempotencyKey,
              scheduledFor: now(),
            })
            return {
              status: enqueued.created
                ? "pending"
                : isTerminal(enqueued.attempt.status)
                  ? "already_completed"
                  : "already_pending",
              subscriptionId: subscription.id,
              delivery: enqueued.attempt,
            }
          }),
      )
    },
  }
}

export function externalContractFromEventMetadata(
  event: EventEnvelope,
): ExternalWebhookEventContract {
  const eventId = stringMetadata(event, "graphEventId")
  const eventVersion = stringMetadata(event, "graphEventVersion")
  const payloadSchema = event.metadata?.graphEventPayloadSchema
  if (!eventId || !eventVersion || !isExternalWebhookPayloadSchema(payloadSchema)) {
    throw new Error(
      `External webhook event "${event.name}" is missing its selected contract metadata.`,
    )
  }
  return { eventId, eventType: event.name, eventVersion, payloadSchema }
}

function contractCatalog(
  contracts: readonly ExternalWebhookEventContract[],
): ReadonlyMap<string, ExternalWebhookEventContract> {
  const catalog = new Map<string, ExternalWebhookEventContract>()
  for (const contract of contracts) {
    if (catalog.has(contract.eventType)) {
      throw new Error(`Duplicate external webhook event contract "${contract.eventType}".`)
    }
    catalog.set(contract.eventType, contract)
  }
  return catalog
}

function requireEventId(event: EventEnvelope): string {
  const eventId = event.metadata?.eventId
  if (typeof eventId !== "string" || eventId.trim().length === 0) {
    throw new Error(`Webhook event "${event.name}" requires metadata.eventId.`)
  }
  return eventId
}

function stringMetadata(event: EventEnvelope, key: string): string | null {
  const value = event.metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function sourceEntity(data: unknown): {
  sourceEntityModule: string | null
  sourceEntityId: string | null
} {
  if (!isRecord(data)) return { sourceEntityModule: null, sourceEntityId: null }
  const module = data.entityModule ?? data.entity_module
  const id = data.entityId ?? data.entity_id
  return {
    sourceEntityModule: typeof module === "string" ? module : null,
    sourceEntityId: typeof id === "string" ? id : null,
  }
}

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "abandoned"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
