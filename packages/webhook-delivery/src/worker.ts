// agent-quality: file-size exception -- reason: durable claim, dispatch, retry, and audit transitions form one state machine.
import type { EventEnvelope } from "@voyant-travel/core"
import { isExternalWebhookPayloadSchema } from "@voyant-travel/core/project"
import { newId } from "@voyant-travel/db/lib/typeid"
import type { InfraWebhookDelivery } from "@voyant-travel/db/schema/infra"

import {
  type AppWebhookDeliveryEnvelope,
  createAppWebhookDeliveryEnvelope,
  isAppWebhookDeliveryEnvelope,
} from "./app-envelope.js"
import type { ExternalWebhookEventContract } from "./contracts.js"
import {
  assertPublicWebhookEndpoint,
  createPinnedWebhookFetch,
  resolveWebhookHost,
  UnsafeWebhookEndpointError,
  type WebhookHostResolver,
} from "./protected-fetch.js"
import {
  assertOutboundWebhookEndpointUrl,
  hashWebhookPayload,
  redactWebhookHeaders,
  serializeWebhookPayload,
  signWebhookPayload,
  webhookBodyExcerpt,
} from "./security.js"
import type {
  CompleteWebhookAttemptInput,
  CreateWebhookDeliveryWorkerOptions,
  EnqueueWebhookAttemptInput,
  WebhookDeliveryAuditEvent,
  WebhookDeliveryOutcome,
  WebhookDeliveryWorker,
  WebhookSubscription,
} from "./types.js"

const DEFAULT_BASE_DELAY_MS = 1_000
const DEFAULT_MAX_DELAY_MS = 60_000
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_CLAIM_TIMEOUT_MS = 60_000
const DEFAULT_MAX_REDIRECTS = 3
const MAX_RESPONSE_BODY_BYTES = 4 * 1024
const MAX_ERROR_MESSAGE_LENGTH = 1_000

export function createWebhookDeliveryWorker(
  options: CreateWebhookDeliveryWorkerOptions,
): WebhookDeliveryWorker {
  const resolveHost = options.resolveHost ?? (options.fetch ? undefined : resolveWebhookHost)
  const fetchImpl = options.fetch ?? createPinnedWebhookFetch(resolveHost)
  const now = options.now ?? (() => new Date())
  const baseDelayMs = positiveInteger(options.retry?.baseDelayMs, DEFAULT_BASE_DELAY_MS)
  const maxDelayMs = positiveInteger(options.retry?.maxDelayMs, DEFAULT_MAX_DELAY_MS)
  const requestTimeoutMs = positiveInteger(
    options.retry?.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
  )
  const claimTimeoutMs = positiveInteger(options.retry?.claimTimeoutMs, DEFAULT_CLAIM_TIMEOUT_MS)
  const maxRedirects = nonNegativeInteger(options.retry?.maxRedirects, DEFAULT_MAX_REDIRECTS)

  return {
    async runNext() {
      const claimedAt = now()
      const staleBefore = new Date(claimedAt.getTime() - claimTimeoutMs)
      const ids = await options.store.listReadyAttemptIds(claimedAt, staleBefore, 1)
      for (const id of ids) {
        const delivery = await options.store.claimAttempt(id, claimedAt, staleBefore)
        if (delivery) return execute(delivery, claimedAt)
      }
      return { status: "idle" }
    },
    async drain(input = {}) {
      const outcomes: WebhookDeliveryOutcome[] = []
      const limit = positiveInteger(input.limit, 100)
      while (outcomes.length < limit) {
        const outcome = await this.runNext()
        if (outcome.status === "idle") break
        outcomes.push(outcome)
      }
      return outcomes
    },
  }

  async function execute(
    delivery: InfraWebhookDelivery,
    startedAt: Date,
  ): Promise<WebhookDeliveryOutcome> {
    const hydrated = hydrateAttempt(delivery)
    if (!hydrated.ok) return abandon(delivery, startedAt, hydrated.reason)

    const subscription = await options.store.getSubscription(delivery.subscriptionId ?? "")
    if (!subscription?.active) {
      return abandon(delivery, startedAt, "webhook subscription is unavailable or inactive")
    }

    const body = serializeWebhookPayload(hydrated.payload)
    if (hashWebhookPayload(body) !== delivery.requestBodyHash) {
      return abandon(delivery, startedAt, "persisted webhook payload hash does not match")
    }
    const timestamp = Math.floor(startedAt.getTime() / 1_000).toString()
    const requestHeaders = signedHeaders(
      subscription,
      hydrated.event,
      hydrated.contract,
      delivery.idempotencyKey ?? delivery.id,
      timestamp,
      body,
    )
    const result = await dispatch(
      fetchImpl,
      delivery.targetUrl,
      requestHeaders,
      body,
      requestTimeoutMs,
      maxRedirects,
      resolveHost,
    )
    const finishedAt = now()
    const completion = completionInput(delivery, result, startedAt, finishedAt)

    if (result.succeeded) {
      const completed = await options.store.completeAttempt({ ...completion, status: "succeeded" })
      await options.store.recordSubscriptionOutcome(subscription.id, true, finishedAt)
      const outcome: WebhookDeliveryOutcome = {
        status: "succeeded",
        subscriptionId: subscription.id,
        delivery: completed,
      }
      await audit(options, hydrated.event, hydrated.contract, outcome)
      return outcome
    }

    const mayRetry = result.retryable && delivery.attemptNumber <= subscription.maxRetries
    if (mayRetry) {
      const retry = retryInput(
        delivery,
        hydrated.payload,
        hydrated.contract,
        subscription,
        finishedAt,
        baseDelayMs,
        maxDelayMs,
      )
      const persisted = await options.store.completeAndEnqueueRetry(
        { ...completion, status: "failed" },
        retry,
      )
      const outcome: WebhookDeliveryOutcome = {
        status: "retry_scheduled",
        subscriptionId: subscription.id,
        delivery: persisted.completed,
        nextAttempt: persisted.retry,
      }
      await audit(options, hydrated.event, hydrated.contract, outcome)
      return outcome
    }

    const completed = await options.store.completeAttempt({ ...completion, status: "abandoned" })
    await options.store.recordSubscriptionOutcome(subscription.id, false, finishedAt)
    const outcome: WebhookDeliveryOutcome = {
      status: "dead_lettered",
      subscriptionId: subscription.id,
      delivery: completed,
    }
    await audit(options, hydrated.event, hydrated.contract, outcome)
    return outcome
  }

  async function abandon(
    delivery: InfraWebhookDelivery,
    startedAt: Date,
    reason: string,
  ): Promise<WebhookDeliveryOutcome> {
    const finishedAt = now()
    const completed = await options.store.completeAttempt({
      id: delivery.id,
      status: "abandoned",
      responseStatus: null,
      responseHeaders: null,
      responseBodyExcerpt: null,
      errorClass: "adapter_error",
      errorMessage: boundedMessage(reason),
      finishedAt,
      durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
    })
    if (delivery.subscriptionId) {
      await options.store.recordSubscriptionOutcome(delivery.subscriptionId, false, finishedAt)
    }
    const outcome: WebhookDeliveryOutcome = {
      status: "dead_lettered",
      subscriptionId: delivery.subscriptionId,
      delivery: completed,
    }
    await auditFromDelivery(options, delivery, outcome, reason)
    return outcome
  }
}

interface HydratedAttempt {
  event: EventEnvelope
  payload: EventEnvelope | AppWebhookDeliveryEnvelope
  contract: ExternalWebhookEventContract
}

function hydrateAttempt(
  delivery: InfraWebhookDelivery,
): ({ ok: true } & HydratedAttempt) | { ok: false; reason: string } {
  if (!isExternalContract(delivery.deliveryContract)) {
    return { ok: false, reason: "pending webhook delivery has no valid contract snapshot" }
  }
  if (isAppWebhookDeliveryEnvelope(delivery.requestPayload)) {
    if (delivery.requestPayload.event.type !== delivery.deliveryContract.eventType) {
      return { ok: false, reason: "persisted webhook payload and contract event types differ" }
    }
    return {
      ok: true,
      event: eventFromAppEnvelope(delivery.requestPayload),
      payload: delivery.requestPayload,
      contract: delivery.deliveryContract,
    }
  }
  if (!isEventEnvelope(delivery.requestPayload)) {
    return { ok: false, reason: "pending webhook delivery has no complete request payload" }
  }
  if (delivery.requestPayload.name !== delivery.deliveryContract.eventType) {
    return { ok: false, reason: "persisted webhook payload and contract event types differ" }
  }
  return {
    ok: true,
    event: delivery.requestPayload,
    payload: delivery.requestPayload,
    contract: delivery.deliveryContract,
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

function isExternalContract(value: unknown): value is ExternalWebhookEventContract {
  return (
    isRecord(value) &&
    typeof value.eventId === "string" &&
    typeof value.eventType === "string" &&
    typeof value.eventVersion === "string" &&
    isExternalWebhookPayloadSchema(value.payloadSchema)
  )
}

function eventFromAppEnvelope(envelope: AppWebhookDeliveryEnvelope): EventEnvelope {
  return {
    name: envelope.event.type,
    data: envelope.payload,
    emittedAt: envelope.event.occurredAt,
    metadata: envelope.metadata,
  }
}

interface DispatchResult {
  succeeded: boolean
  retryable: boolean
  responseStatus: number | null
  responseHeaders?: Record<string, string>
  responseBody?: string
  errorClass: InfraWebhookDelivery["errorClass"]
  errorMessage: string | null
}

async function dispatch(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
  maxRedirects: number,
  resolveHost: WebhookHostResolver | undefined,
): Promise<DispatchResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let currentUrl = url
  let requestHeaders = headers
  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      try {
        assertOutboundWebhookEndpointUrl(currentUrl)
      } catch {
        return rejectedEndpointResult()
      }
      if (resolveHost) {
        try {
          await assertPublicWebhookEndpoint(currentUrl, resolveHost)
        } catch (error) {
          if (error instanceof UnsafeWebhookEndpointError) return rejectedEndpointResult()
          throw error
        }
      }

      const response = await fetchImpl(currentUrl, {
        method: "POST",
        headers: requestHeaders,
        body,
        signal: controller.signal,
        redirect: "manual",
      })
      if (isRedirect(response.status)) {
        if (redirectCount >= maxRedirects) {
          return {
            ...rejectedEndpointResult(),
            responseStatus: response.status,
            errorMessage: "Webhook endpoint exceeded the redirect limit.",
          }
        }
        const location = response.headers.get("location")
        if (!location) {
          return {
            ...rejectedEndpointResult(),
            responseStatus: response.status,
            errorMessage: "Webhook endpoint returned a redirect without a location.",
          }
        }
        try {
          const nextUrl = new URL(location, currentUrl)
          if (nextUrl.origin !== new URL(currentUrl).origin) {
            requestHeaders = safeCrossOriginRedirectHeaders(requestHeaders)
          }
          currentUrl = nextUrl.href
        } catch {
          return rejectedEndpointResult()
        }
        continue
      }

      const responseBody = await readBoundedResponseBody(response, MAX_RESPONSE_BODY_BYTES)
      const responseHeaders = Object.fromEntries(response.headers.entries())
      if (response.ok) {
        return {
          succeeded: true,
          retryable: false,
          responseStatus: response.status,
          responseHeaders,
          responseBody,
          errorClass: null,
          errorMessage: null,
        }
      }
      const rateLimited = response.status === 429
      return {
        succeeded: false,
        retryable: rateLimited || response.status === 408 || response.status >= 500,
        responseStatus: response.status,
        responseHeaders,
        responseBody,
        errorClass: rateLimited ? "rate_limited" : response.status >= 500 ? "5xx" : "4xx",
        errorMessage: boundedMessage(`HTTP ${response.status}`),
      }
    }
  } catch (error) {
    return {
      succeeded: false,
      retryable: true,
      responseStatus: null,
      errorClass: controller.signal.aborted ? "timeout" : "network",
      errorMessage: boundedMessage(error instanceof Error ? error.message : String(error)),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function rejectedEndpointResult(): DispatchResult {
  return {
    succeeded: false,
    retryable: false,
    responseStatus: null,
    errorClass: "network",
    errorMessage: "Webhook endpoint is not allowed.",
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function safeCrossOriginRedirectHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => {
      const normalized = name.toLowerCase()
      return (
        normalized === "content-type" ||
        normalized === "idempotency-key" ||
        normalized.startsWith("x-voyant-")
      )
    }),
  )
}

function retryInput(
  delivery: InfraWebhookDelivery,
  payload: EventEnvelope | AppWebhookDeliveryEnvelope,
  contract: ExternalWebhookEventContract,
  subscription: WebhookSubscription,
  now: Date,
  baseDelayMs: number,
  maxDelayMs: number,
): EnqueueWebhookAttemptInput {
  const nextAttempt = delivery.attemptNumber + 1
  const deliveryId = newId("webhook_deliveries")
  const retryPayload = isAppWebhookDeliveryEnvelope(payload)
    ? createAppWebhookDeliveryEnvelope({
        deliveryId,
        installationId: payload.installationId,
        appId: payload.appId,
        event: eventFromAppEnvelope(payload),
        contract,
        deliveredAt: now,
        attemptNumber: nextAttempt,
        maxRetries: subscription.maxRetries,
        idempotencyKey: delivery.idempotencyKey ?? delivery.id,
        originalDeliveryId: payload.attempt.originalDeliveryId ?? payload.deliveryId,
        parentDeliveryId: delivery.id,
      })
    : payload
  const body = serializeWebhookPayload(retryPayload)
  return {
    id: deliveryId,
    sourceModule: delivery.sourceModule,
    sourceEvent: delivery.sourceEvent,
    sourceEntityModule: delivery.sourceEntityModule,
    sourceEntityId: delivery.sourceEntityId,
    subscriptionId: subscription.id,
    targetUrl: delivery.targetUrl,
    requestMethod: "POST",
    requestHeaders: {},
    requestBodyHash: hashWebhookPayload(body),
    requestBodyExcerpt: webhookBodyExcerpt(body),
    requestPayload: retryPayload,
    deliveryContract: contract,
    attemptNumber: nextAttempt,
    parentDeliveryId: delivery.id,
    idempotencyKey: delivery.idempotencyKey ?? delivery.id,
    scheduledFor: new Date(
      now.getTime() + retryDelay(delivery.attemptNumber, baseDelayMs, maxDelayMs),
    ),
  }
}

function completionInput(
  delivery: InfraWebhookDelivery,
  result: DispatchResult,
  startedAt: Date,
  finishedAt: Date,
): Omit<CompleteWebhookAttemptInput, "status"> {
  return {
    id: delivery.id,
    responseStatus: result.responseStatus,
    responseHeaders: redactWebhookHeaders(result.responseHeaders),
    responseBodyExcerpt: webhookBodyExcerpt(result.responseBody),
    errorClass: result.errorClass,
    errorMessage: result.errorMessage,
    finishedAt,
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  }
}

function signedHeaders(
  subscription: WebhookSubscription,
  event: EventEnvelope,
  contract: ExternalWebhookEventContract,
  idempotencyKey: string,
  timestamp: string,
  body: string,
): Record<string, string> {
  const eventId = stringMetadata(event, "eventId")
  if (!eventId) throw new Error(`Persisted webhook event "${event.name}" has no event id.`)
  return {
    "content-type": "application/json",
    "idempotency-key": idempotencyKey,
    "x-voyant-event": event.name,
    "x-voyant-event-id": eventId,
    "x-voyant-event-contract": contract.eventId,
    "x-voyant-event-version": contract.eventVersion,
    "x-voyant-timestamp": timestamp,
    ...(subscription.keyId ? { "x-voyant-key-id": subscription.keyId } : {}),
    ...(subscription.app
      ? {
          "x-voyant-app-id": subscription.app.appId,
          "x-voyant-installation-id": subscription.app.installationId,
        }
      : {}),
    "x-voyant-signature": signWebhookPayload(subscription.secret, timestamp, body),
  }
}

async function audit(
  options: CreateWebhookDeliveryWorkerOptions,
  event: EventEnvelope,
  contract: ExternalWebhookEventContract,
  outcome: Exclude<WebhookDeliveryOutcome, { status: "idle" }>,
): Promise<void> {
  if (!options.onAudit) return
  await options.onAudit({
    eventId: stringMetadata(event, "eventId"),
    eventName: event.name,
    contractId: contract.eventId,
    contractVersion: contract.eventVersion,
    subscriptionId: outcome.subscriptionId,
    outcome: outcome.status,
    deliveryId: outcome.delivery.id,
    attemptNumber: outcome.delivery.attemptNumber,
  })
}

async function auditFromDelivery(
  options: CreateWebhookDeliveryWorkerOptions,
  delivery: InfraWebhookDelivery,
  outcome: Exclude<WebhookDeliveryOutcome, { status: "idle" }>,
  reason: string,
): Promise<void> {
  if (!options.onAudit) return
  const payload = isEventEnvelope(delivery.requestPayload) ? delivery.requestPayload : null
  const contract = isExternalContract(delivery.deliveryContract) ? delivery.deliveryContract : null
  const auditEvent: WebhookDeliveryAuditEvent = {
    eventId: payload ? stringMetadata(payload, "eventId") : null,
    eventName: payload?.name ?? delivery.sourceEvent,
    ...(contract ? { contractId: contract.eventId, contractVersion: contract.eventVersion } : {}),
    subscriptionId: delivery.subscriptionId,
    outcome: outcome.status,
    deliveryId: outcome.delivery.id,
    attemptNumber: outcome.delivery.attemptNumber,
    reason,
  }
  await options.onAudit(auditEvent)
}

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const buffer = new Uint8Array(maxBytes)
  let offset = 0
  let complete = false
  try {
    while (offset < maxBytes) {
      const chunk = await reader.read()
      if (chunk.done) {
        complete = true
        break
      }
      const length = Math.min(maxBytes - offset, chunk.value.byteLength)
      buffer.set(chunk.value.subarray(0, length), offset)
      offset += length
      if (length < chunk.value.byteLength) break
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined)
  }
  return new TextDecoder().decode(buffer.subarray(0, offset))
}

function retryDelay(attemptNumber: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attemptNumber - 1))
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : fallback
}

function boundedMessage(message: string): string {
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

function stringMetadata(event: EventEnvelope, key: string): string | null {
  const value = event.metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
