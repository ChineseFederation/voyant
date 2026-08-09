import { randomBytes } from "node:crypto"

import type { EventEnvelope } from "@voyant-travel/core"
import { newId } from "@voyant-travel/db/lib/typeid"
import type {
  InfraWebhookDelivery,
  InfraWebhookSubscription,
  NewInfraWebhookSubscription,
  UpdateInfraWebhookSubscription,
} from "@voyant-travel/db/schema/infra"

import type {
  WebhookDeliveryListQuery,
  WebhookSubscriptionCreateInput,
  WebhookSubscriptionTestInput,
  WebhookSubscriptionUpdateInput,
} from "./admin-contracts.js"
import {
  assertWebhookSubscriptionCreateEvents,
  assertWebhookSubscriptionUpdateEvents,
  type ExternalWebhookEventContract,
  prepareExternalWebhookEvent,
} from "./contracts.js"
import {
  assertOutboundWebhookEndpointUrl,
  hashWebhookPayload,
  serializeWebhookPayload,
  webhookBodyExcerpt,
} from "./security.js"
import { generateWebhookTestPayload } from "./test-payload.js"
import type { EnqueueWebhookAttemptInput } from "./types.js"

export interface OperatorWebhookSubscription
  extends Omit<InfraWebhookSubscription, "secret" | "headers"> {}

export interface OperatorWebhookDelivery
  extends Pick<
    InfraWebhookDelivery,
    | "id"
    | "subscriptionId"
    | "sourceEvent"
    | "targetUrl"
    | "status"
    | "attemptNumber"
    | "responseStatus"
    | "errorMessage"
    | "createdAt"
    | "finishedAt"
  > {}

export class OperatorWebhookRequestError extends Error {
  constructor(
    readonly code: "invalid_subscription" | "inactive_subscription" | "replay_not_allowed",
    message: string,
  ) {
    super(message)
    this.name = "OperatorWebhookRequestError"
  }
}

export interface OperatorWebhookEvent {
  id: string
  eventType: string
  version: string
  payloadSchema: Readonly<Record<string, unknown>>
}

export interface OperatorWebhookAdminStore {
  listSubscriptions(): Promise<InfraWebhookSubscription[]>
  getSubscription(id: string): Promise<InfraWebhookSubscription | null>
  createSubscription(input: NewInfraWebhookSubscription): Promise<InfraWebhookSubscription>
  updateSubscription(
    id: string,
    input: UpdateInfraWebhookSubscription,
  ): Promise<InfraWebhookSubscription | null>
  deleteSubscription(id: string): Promise<boolean>
  listDeliveries(query: WebhookDeliveryListQuery): Promise<InfraWebhookDelivery[]>
  getDelivery(id: string): Promise<InfraWebhookDelivery | null>
  enqueueAttempt(input: EnqueueWebhookAttemptInput): Promise<InfraWebhookDelivery>
}

export interface OperatorWebhookAdminService {
  listEvents(): OperatorWebhookEvent[]
  listSubscriptions(): Promise<OperatorWebhookSubscription[]>
  getSubscription(id: string): Promise<OperatorWebhookSubscription | null>
  createSubscription(input: WebhookSubscriptionCreateInput): Promise<{
    subscription: OperatorWebhookSubscription
    secret: string
  }>
  updateSubscription(
    id: string,
    input: WebhookSubscriptionUpdateInput,
  ): Promise<OperatorWebhookSubscription | null>
  deleteSubscription(id: string): Promise<boolean>
  setSubscriptionActive(id: string, active: boolean): Promise<OperatorWebhookSubscription | null>
  rotateSubscriptionSecret(id: string): Promise<{
    subscription: OperatorWebhookSubscription
    secret: string
  } | null>
  testSubscription(
    id: string,
    input: WebhookSubscriptionTestInput,
  ): Promise<OperatorWebhookDelivery | null>
  listDeliveries(query: WebhookDeliveryListQuery): Promise<OperatorWebhookDelivery[]>
  getDelivery(id: string): Promise<OperatorWebhookDelivery | null>
  replayDelivery(id: string): Promise<OperatorWebhookDelivery | null>
}

export function createOperatorWebhookAdminService(options: {
  contracts: readonly ExternalWebhookEventContract[]
  store: OperatorWebhookAdminStore
  generateSecret?: () => string
  now?: () => Date
}): OperatorWebhookAdminService {
  const contracts = [...options.contracts]
  const byEventType = new Map(contracts.map((contract) => [contract.eventType, contract]))
  const generateSecret =
    options.generateSecret ?? (() => `whsec_${randomBytes(32).toString("base64url")}`)
  const now = options.now ?? (() => new Date())

  return {
    listEvents() {
      return contracts.map((contract) => ({
        id: contract.eventId,
        eventType: contract.eventType,
        version: contract.eventVersion,
        payloadSchema: contract.payloadSchema,
      }))
    },

    async listSubscriptions() {
      return (await options.store.listSubscriptions()).map(withoutSecret)
    },

    async getSubscription(id) {
      const subscription = await options.store.getSubscription(id)
      return subscription ? withoutSecret(subscription) : null
    },

    async createSubscription(input) {
      validateSubscriptionInput(() => {
        assertOutboundWebhookEndpointUrl(input.url)
        assertWebhookSubscriptionCreateEvents(input, contracts)
      })
      const secret = generateSecret()
      const subscription = await options.store.createSubscription({
        ...input,
        headers: null,
        secret,
      })
      return { subscription: withoutSecret(subscription), secret }
    },

    async updateSubscription(id, input) {
      validateSubscriptionInput(() => {
        if (input.url !== undefined) assertOutboundWebhookEndpointUrl(input.url)
        assertWebhookSubscriptionUpdateEvents(input, contracts)
      })
      const subscription = await options.store.updateSubscription(id, input)
      return subscription ? withoutSecret(subscription) : null
    },

    deleteSubscription: (id) => options.store.deleteSubscription(id),

    async setSubscriptionActive(id, active) {
      const subscription = await options.store.updateSubscription(id, { active })
      return subscription ? withoutSecret(subscription) : null
    },

    async rotateSubscriptionSecret(id) {
      const secret = generateSecret()
      const subscription = await options.store.updateSubscription(id, { secret })
      return subscription ? { subscription: withoutSecret(subscription), secret } : null
    },

    async testSubscription(id, input) {
      const subscription = await options.store.getSubscription(id)
      if (!subscription) return null
      if (!subscription.active) {
        throw new OperatorWebhookRequestError(
          "inactive_subscription",
          "Enable the webhook subscription before sending a test.",
        )
      }
      const eventType = input.event ?? subscription.events[0]
      if (!eventType || !subscription.events.includes(eventType)) {
        throw new OperatorWebhookRequestError(
          "invalid_subscription",
          "The test event must be selected by the subscription.",
        )
      }
      const contract = byEventType.get(eventType)
      if (!contract) {
        throw new OperatorWebhookRequestError(
          "invalid_subscription",
          "The test event is no longer available in the selected event catalog.",
        )
      }
      const at = now()
      const event = prepareExternalWebhookEvent(testEvent(contract, at), contract)
      return safeDelivery(
        await options.store.enqueueAttempt(
          deliveryInput({
            subscription,
            event,
            contract,
            now: at,
            idempotencyPrefix: "operator-webhook-test",
          }),
        ),
      )
    },

    async listDeliveries(query) {
      return (await options.store.listDeliveries(query)).map(safeDelivery)
    },
    async getDelivery(id) {
      const delivery = await options.store.getDelivery(id)
      return delivery ? safeDelivery(delivery) : null
    },

    async replayDelivery(id) {
      const original = await options.store.getDelivery(id)
      if (!original?.subscriptionId || !isEventEnvelope(original.requestPayload)) return null
      const subscription = await options.store.getSubscription(original.subscriptionId)
      if (!subscription) return null
      if (!subscription.active) {
        throw new OperatorWebhookRequestError(
          "inactive_subscription",
          "Enable the webhook subscription before replaying a delivery.",
        )
      }
      if (!subscription.events.includes(original.requestPayload.name)) {
        throw new OperatorWebhookRequestError(
          "replay_not_allowed",
          "The original event is no longer selected by this subscription.",
        )
      }
      const contract = byEventType.get(original.requestPayload.name)
      if (!contract) {
        throw new OperatorWebhookRequestError(
          "replay_not_allowed",
          "The original event is no longer available in the selected event catalog.",
        )
      }
      let event: EventEnvelope
      try {
        event = prepareExternalWebhookEvent(original.requestPayload, contract)
      } catch {
        throw new OperatorWebhookRequestError(
          "replay_not_allowed",
          "The original payload no longer satisfies the selected event contract.",
        )
      }
      const at = now()
      return safeDelivery(
        await options.store.enqueueAttempt(
          deliveryInput({
            subscription,
            event,
            contract,
            now: at,
            idempotencyPrefix: `operator-webhook-replay:${original.id}`,
            parentDeliveryId: original.id,
            sourceEntityModule: original.sourceEntityModule,
            sourceEntityId: original.sourceEntityId,
          }),
        ),
      )
    },
  }
}

function withoutSecret(subscription: InfraWebhookSubscription): OperatorWebhookSubscription {
  const { headers: _headers, secret: _secret, ...safe } = subscription
  return safe
}

function safeDelivery(delivery: InfraWebhookDelivery): OperatorWebhookDelivery {
  return {
    id: delivery.id,
    subscriptionId: delivery.subscriptionId,
    sourceEvent: delivery.sourceEvent,
    targetUrl: delivery.targetUrl,
    status: delivery.status,
    attemptNumber: delivery.attemptNumber,
    responseStatus: delivery.responseStatus,
    errorMessage: delivery.errorMessage,
    createdAt: delivery.createdAt,
    finishedAt: delivery.finishedAt,
  }
}

function validateSubscriptionInput(validate: () => void): void {
  try {
    validate()
  } catch {
    throw new OperatorWebhookRequestError(
      "invalid_subscription",
      "The webhook subscription contains an invalid URL or event.",
    )
  }
}

function testEvent(contract: ExternalWebhookEventContract, now: Date): EventEnvelope {
  return {
    name: contract.eventType,
    data: generateWebhookTestPayload(contract.payloadSchema, now),
    emittedAt: now.toISOString(),
    metadata: {
      eventId: `evt_test_${newId("webhook_deliveries")}`,
      graphEventId: contract.eventId,
      graphEventVersion: contract.eventVersion,
      graphEventSourceModule: "operator-webhooks",
    },
  }
}

function deliveryInput(input: {
  subscription: InfraWebhookSubscription
  event: EventEnvelope
  contract: ExternalWebhookEventContract
  now: Date
  idempotencyPrefix: string
  parentDeliveryId?: string
  sourceEntityModule?: string | null
  sourceEntityId?: string | null
}): EnqueueWebhookAttemptInput {
  const id = newId("webhook_deliveries")
  const idempotencyKey = `${input.idempotencyPrefix}:${id}`
  const body = serializeWebhookPayload(input.event)
  return {
    id,
    sourceModule: "operator-webhooks",
    sourceEvent: input.event.name,
    sourceEntityModule: input.sourceEntityModule ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    subscriptionId: input.subscription.id,
    targetUrl: input.subscription.url,
    requestMethod: "POST",
    requestHeaders: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      "x-voyant-event": input.event.name,
      "x-voyant-event-contract": input.contract.eventId,
      "x-voyant-event-version": input.contract.eventVersion,
    },
    requestBodyHash: hashWebhookPayload(body),
    requestBodyExcerpt: webhookBodyExcerpt(body),
    requestPayload: input.event,
    deliveryContract: input.contract,
    attemptNumber: 1,
    parentDeliveryId: input.parentDeliveryId ?? null,
    idempotencyKey,
    scheduledFor: input.now,
  }
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    "data" in value &&
    typeof value.emittedAt === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
