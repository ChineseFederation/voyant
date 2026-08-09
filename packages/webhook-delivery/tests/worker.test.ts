import type { EventEnvelope } from "@voyant-travel/core"
import { newId } from "@voyant-travel/db/lib/typeid"
import type { InfraWebhookDelivery } from "@voyant-travel/db/schema/infra"
import { describe, expect, it, vi } from "vitest"
import type { ExternalWebhookEventContract } from "../src/contracts.js"
import { createSelectedExternalWebhookQueue } from "../src/selected-queue.js"
import type {
  CompleteWebhookAttemptInput,
  EnqueueWebhookAttemptInput,
  WebhookDeliveryStore,
  WebhookSubscription,
} from "../src/types.js"
import { createWebhookDeliveryWorker } from "../src/worker.js"

const EVENT: EventEnvelope = {
  name: "booking.created",
  data: { entityModule: "bookings", entityId: "book_1", email: "private@example.test" },
  metadata: {
    eventId: "evt_1",
    graphEventId: "@acme/bookings#event.created",
    graphEventVersion: "1.0.0",
    graphEventSourceModule: "bookings",
  },
  emittedAt: "2026-07-11T12:00:00.000Z",
}

const CONTRACT = {
  eventId: "@acme/bookings#event.created",
  eventType: "booking.created",
  eventVersion: "1.0.0",
  payloadSchema: {
    type: "object",
    required: ["entityModule", "entityId"],
    properties: {
      entityModule: { type: "string" },
      entityId: { type: "string" },
    },
  },
} as const

const SUBSCRIPTION: WebhookSubscription = {
  id: newId("webhook_subscriptions"),
  url: "https://partner.example.test/hooks",
  secret: "s".repeat(40),
  headers: {
    Authorization: "Bearer private",
    "X-Webhook-Token": "webhook-private",
    "X-Partner-Secret": "partner-private",
  },
  maxRetries: 2,
  active: true,
}

const APP_SUBSCRIPTION: WebhookSubscription = {
  ...SUBSCRIPTION,
  id: newId("app_webhook_subscriptions"),
  keyId: "signing-key-2",
  app: {
    installationId: "appinst_1",
    appId: "app_1",
    eventVersion: "1.0.0",
  },
}

describe("durable external webhook delivery", () => {
  it("enqueues a complete projected payload without executing HTTP", async () => {
    const store = new MemoryWebhookDeliveryStore([SUBSCRIPTION])
    const queue = createSelectedExternalWebhookQueue({ contracts: [CONTRACT], store })

    await expect(queue.enqueue(EVENT)).resolves.toMatchObject([{ status: "pending" }])
    expect(store.records[0]).toMatchObject({
      status: "pending",
      requestPayload: {
        name: "booking.created",
        data: { entityModule: "bookings", entityId: "book_1" },
      },
      deliveryContract: CONTRACT,
    })
    expect(JSON.stringify(store.records[0]?.requestPayload)).not.toContain("private@example.test")
  })

  it("rehydrates after restart and runs signing, completion, and audit in the worker", async () => {
    const store = await queuedStore()
    const onAudit = vi.fn()
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get("x-voyant-signature")).toMatch(/^sha256=[a-f0-9]{64}$/)
      expect(headers.get("x-voyant-event-contract")).toBe(CONTRACT.eventId)
      expect(headers.get("authorization")).toBeNull()
      expect(headers.get("x-webhook-token")).toBeNull()
      expect(headers.get("x-partner-secret")).toBeNull()
      return new Response(null, { status: 204 })
    })
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: fetch as typeof globalThis.fetch,
      onAudit,
    })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "succeeded" })
    expect(fetch).toHaveBeenCalledOnce()
    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: CONTRACT.eventId, outcome: "succeeded" }),
    )
  })

  it("keeps the payload hash stable when jsonb reorders object keys", async () => {
    const store = new MemoryWebhookDeliveryStore([APP_SUBSCRIPTION])
    await createSelectedExternalWebhookQueue({ contracts: [CONTRACT], store }).enqueue(EVENT)
    const queued = store.records[0]
    if (!queued) throw new Error("Expected a queued webhook delivery")

    // PostgreSQL jsonb normalizes object keys instead of preserving the
    // insertion order used by the enqueueing process. Model that round trip
    // without changing the payload's JSON value.
    queued.requestPayload = reorderObjectKeys(queued.requestPayload)

    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: fetch as typeof globalThis.fetch,
    })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "succeeded" })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it("delivers installed app subscriptions with the RFC envelope and signing key id", async () => {
    const store = new MemoryWebhookDeliveryStore([APP_SUBSCRIPTION])
    await createSelectedExternalWebhookQueue({ contracts: [CONTRACT], store }).enqueue(EVENT)
    expect(store.records[0]?.requestPayload).toMatchObject({
      schema: "voyant.app-webhook.delivery.v1",
      installationId: "appinst_1",
      appId: "app_1",
      event: { type: "booking.created", schemaVersion: "1.0.0" },
      payload: { entityModule: "bookings", entityId: "book_1" },
    })
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(headers.get("x-voyant-key-id")).toBe("signing-key-2")
      expect(headers.get("x-voyant-installation-id")).toBe("appinst_1")
      expect(body.deliveryId).toBe(store.records[0]?.id)
      return new Response(null, { status: 204 })
    })

    const worker = createWebhookDeliveryWorker({ store, fetch: fetch as typeof globalThis.fetch })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "succeeded" })
  })

  it("persists retry backoff and lets a later worker resume it", async () => {
    const store = await queuedStore()
    let clock = new Date("2026-07-11T12:00:00.000Z").getTime()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: fetch as typeof globalThis.fetch,
      retry: { baseDelayMs: 1_000 },
      now: () => new Date(clock),
    })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "retry_scheduled" })
    expect(store.records).toHaveLength(2)
    expect(store.records[1]).toMatchObject({ status: "pending", attemptNumber: 2 })
    expect(await worker.runNext()).toEqual({ status: "idle" })
    clock += 1_000
    await expect(worker.runNext()).resolves.toMatchObject({ status: "succeeded" })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("gives app retries a new delivery id that references the original", async () => {
    const store = new MemoryWebhookDeliveryStore([APP_SUBSCRIPTION])
    await createSelectedExternalWebhookQueue({
      contracts: [CONTRACT],
      store,
      now: () => new Date("2026-07-11T12:00:00.000Z"),
    }).enqueue(EVENT)
    const originalPayload = store.records[0]?.requestPayload as Record<string, unknown>
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: vi.fn(async () => new Response("down", { status: 503 })) as typeof globalThis.fetch,
      retry: { baseDelayMs: 1_000 },
      now: () => new Date("2026-07-11T12:00:00.000Z"),
    })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "retry_scheduled" })

    const retryPayload = store.records[1]?.requestPayload as {
      deliveryId: string
      attempt: { originalDeliveryId: string | null; parentDeliveryId: string | null }
    }
    expect(retryPayload.deliveryId).toBe(store.records[1]?.id)
    expect(retryPayload.deliveryId).not.toBe(originalPayload.deliveryId)
    expect(retryPayload.attempt.originalDeliveryId).toBe(originalPayload.deliveryId)
    expect(retryPayload.attempt.parentDeliveryId).toBe(store.records[0]?.id)
  })

  it("dead-letters legacy pending rows without complete payloads and never dispatches", async () => {
    const store = new MemoryWebhookDeliveryStore([SUBSCRIPTION])
    store.records.push(deliveryRecord({ requestPayload: null, deliveryContract: null }))
    const fetch = vi.fn()
    const worker = createWebhookDeliveryWorker({ store, fetch: fetch as typeof globalThis.fetch })

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "dead_lettered",
      delivery: { status: "abandoned", errorClass: "adapter_error" },
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("dead-letters non-retryable responses", async () => {
    const store = await queuedStore()
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: vi.fn(async () => new Response("invalid", { status: 422 })) as typeof globalThis.fetch,
    })

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "dead_lettered",
      delivery: { status: "abandoned", errorClass: "4xx" },
    })
  })

  it("validates every redirect and refuses redirects to private addresses", async () => {
    const store = await queuedStore()
    const resolveHost = vi.fn(async () => ["8.8.8.8"])
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/internal" },
        }),
    )
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: fetch as typeof globalThis.fetch,
      resolveHost,
    })

    await expect(worker.runNext()).resolves.toMatchObject({
      status: "dead_lettered",
      delivery: {
        status: "abandoned",
        errorClass: "network",
        errorMessage: "Webhook endpoint is not allowed.",
      },
    })
    expect(fetch).toHaveBeenCalledOnce()
    expect(resolveHost).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(
      SUBSCRIPTION.url,
      expect.objectContaining({ redirect: "manual" }),
    )
  })

  it("manually follows a bounded public redirect without external DNS", async () => {
    const store = await queuedStore()
    const resolveHost = vi.fn(async () => ["8.8.8.8"])
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "https://receiver.example.test/voyant" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const worker = createWebhookDeliveryWorker({
      store,
      fetch: fetch as typeof globalThis.fetch,
      resolveHost,
      retry: { maxRedirects: 1 },
    })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "succeeded" })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(resolveHost).toHaveBeenNthCalledWith(1, "partner.example.test")
    expect(resolveHost).toHaveBeenNthCalledWith(2, "receiver.example.test")
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://receiver.example.test/voyant",
      expect.objectContaining({ redirect: "manual" }),
    )
    for (const call of fetch.mock.calls) {
      const headers = new Headers(call[1]?.headers)
      expect(headers.get("x-voyant-signature")).toMatch(/^sha256=[a-f0-9]{64}$/)
      expect(headers.get("authorization")).toBeNull()
      expect(headers.get("x-webhook-token")).toBeNull()
      expect(headers.get("x-partner-secret")).toBeNull()
    }
  })

  it("halts pending deliveries when an app subscription is paused or uninstalled", async () => {
    const pausedSubscription = { ...APP_SUBSCRIPTION, active: false }
    const store = new MemoryWebhookDeliveryStore([pausedSubscription])
    await createSelectedExternalWebhookQueue({ contracts: [CONTRACT], store }).enqueue(EVENT)
    const fetch = vi.fn()
    const worker = createWebhookDeliveryWorker({ store, fetch: fetch as typeof globalThis.fetch })

    await expect(worker.runNext()).resolves.toMatchObject({ status: "dead_lettered" })
    expect(fetch).not.toHaveBeenCalled()
  })
})

function reorderObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderObjectKeys)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reorderObjectKeys(nested)]),
  )
}

async function queuedStore(): Promise<MemoryWebhookDeliveryStore> {
  const store = new MemoryWebhookDeliveryStore([SUBSCRIPTION])
  await createSelectedExternalWebhookQueue({
    contracts: [CONTRACT],
    store,
    now: () => new Date("2026-07-11T12:00:00.000Z"),
  }).enqueue(EVENT)
  return store
}

class MemoryWebhookDeliveryStore implements WebhookDeliveryStore {
  readonly records: InfraWebhookDelivery[] = []
  readonly outcomes: Array<{ subscriptionId: string; succeeded: boolean }> = []

  constructor(private readonly subscriptions: WebhookSubscription[]) {}

  async listActiveSubscriptions(): Promise<WebhookSubscription[]> {
    return this.subscriptions
  }

  async getSubscription(id: string): Promise<WebhookSubscription | null> {
    return this.subscriptions.find((subscription) => subscription.id === id) ?? null
  }

  async enqueueAttempt(input: EnqueueWebhookAttemptInput) {
    const existing = this.records.find(
      (record) =>
        record.idempotencyKey === input.idempotencyKey &&
        record.attemptNumber === input.attemptNumber,
    )
    if (existing) return { attempt: existing, created: false }
    const record = deliveryRecord(input)
    this.records.push(record)
    return { attempt: record, created: true }
  }

  async listReadyAttemptIds(now: Date, staleBefore: Date, limit: number): Promise<string[]> {
    return this.records
      .filter(
        (record) =>
          (record.status === "pending" && (!record.scheduledFor || record.scheduledFor <= now)) ||
          (record.status === "in_flight" && !!record.startedAt && record.startedAt <= staleBefore),
      )
      .slice(0, limit)
      .map(({ id }) => id)
  }

  async claimAttempt(id: string, now: Date): Promise<InfraWebhookDelivery | null> {
    const record = this.records.find((candidate) => candidate.id === id)
    if (!record) return null
    record.status = "in_flight"
    record.startedAt = now
    return record
  }

  async completeAttempt(input: CompleteWebhookAttemptInput): Promise<InfraWebhookDelivery> {
    const record = this.require(input.id)
    Object.assign(record, input, { updatedAt: input.finishedAt })
    return record
  }

  async completeAndEnqueueRetry(
    completion: CompleteWebhookAttemptInput,
    retry: EnqueueWebhookAttemptInput,
  ) {
    const completed = await this.completeAttempt(completion)
    const enqueued = await this.enqueueAttempt(retry)
    return { completed, retry: enqueued.attempt }
  }

  async recordSubscriptionOutcome(subscriptionId: string, succeeded: boolean) {
    this.outcomes.push({ subscriptionId, succeeded })
  }

  private require(id: string): InfraWebhookDelivery {
    const record = this.records.find((candidate) => candidate.id === id)
    if (!record) throw new Error(`Missing delivery ${id}`)
    return record
  }
}

type DeliveryRecordInput = Partial<
  Omit<InfraWebhookDelivery, "requestPayload" | "deliveryContract">
> & {
  requestPayload?: EventEnvelope | null
  deliveryContract?: ExternalWebhookEventContract | null
}

function deliveryRecord(input: DeliveryRecordInput = {}): InfraWebhookDelivery {
  const timestamp = new Date("2026-07-11T12:00:00.000Z")
  return {
    id: input.id ?? newId("webhook_deliveries"),
    sourceModule: input.sourceModule ?? "bookings",
    sourceEvent: input.sourceEvent ?? EVENT.name,
    sourceEntityModule: input.sourceEntityModule ?? null,
    sourceEntityId: input.sourceEntityId ?? null,
    subscriptionId: input.subscriptionId ?? SUBSCRIPTION.id,
    targetUrl: input.targetUrl ?? SUBSCRIPTION.url,
    targetKind: "subscription",
    targetRef: input.subscriptionId ?? SUBSCRIPTION.id,
    requestMethod: input.requestMethod ?? "POST",
    requestHeaders: input.requestHeaders ?? {},
    requestBodyHash: input.requestBodyHash ?? null,
    requestBodyExcerpt: input.requestBodyExcerpt ?? null,
    requestPayload: input.requestPayload ? objectRecord(input.requestPayload) : null,
    deliveryContract: input.deliveryContract ? objectRecord(input.deliveryContract) : null,
    responseStatus: null,
    responseHeaders: null,
    responseBodyExcerpt: null,
    attemptNumber: input.attemptNumber ?? 1,
    parentDeliveryId: input.parentDeliveryId ?? null,
    idempotencyKey: input.idempotencyKey ?? "graph-webhook:evt_1:hksub_1",
    status: input.status ?? "pending",
    scheduledFor: input.scheduledFor ?? timestamp,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    errorClass: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function objectRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value))
}
