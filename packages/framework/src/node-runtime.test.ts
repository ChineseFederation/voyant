import type { EventEnvelope } from "@voyant-travel/core"
import { definePort } from "@voyant-travel/core/project"
import type { LazyRedisClient } from "@voyant-travel/utils/redis-client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { VoyantDeploymentProviders } from "./deployment-types.js"
import { createVoyantNodeEnv, loadVoyantNodeRuntime } from "./node-runtime.js"
import {
  createVoyantGraphRuntime,
  type VoyantGraphRuntime,
  type VoyantGraphRuntimeJobHandler,
} from "./runtime-lowering.js"

const redisOperations = vi.hoisted(
  () => [] as Array<{ op: string; key: string; redisUrl?: string; client?: string }>,
)
const tcpRedisConnections = vi.hoisted(
  () => [] as Array<{ protocol: string; username: string; password: string }>,
)
const restRedisConstructed = vi.hoisted(
  () => [] as Array<{ options: { url: string; token: string } }>,
)
const resolvedRedisClientIds = vi.hoisted(() => new WeakMap<object, string>())
const redisStoreCreations = vi.hoisted(
  () => [] as Array<{ kind: "kv" | "rate"; redisUrl: string; client?: LazyRedisClient }>,
)

vi.mock("redis", () => ({
  createClient: ({ url }: { url: string }) => {
    const parsed = new URL(url)
    const id = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
    return {
      on: vi.fn(),
      connect: vi.fn(async () => {
        tcpRedisConnections.push({
          protocol: parsed.protocol,
          username: parsed.username,
          password: parsed.password,
        })
      }),
      close: vi.fn(async () => undefined),
      destroy: vi.fn(),
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
      scan: vi.fn(async () => ({ cursor: "0", keys: [] })),
      incr: vi.fn(async () => 1),
      expire: vi.fn(async () => true),
      __id: id,
    }
  },
}))

vi.mock("@upstash/redis", () => {
  class Redis {
    readonly __id: string

    constructor(readonly options: { url: string; token: string }) {
      this.__id = `rest:${options.url}`
      restRedisConstructed.push({ options })
    }
  }

  return { Redis }
})

async function redisClientId(client?: LazyRedisClient): Promise<string | undefined> {
  if (!client) return undefined
  const resolved = (await client.get()) as object
  let id = resolvedRedisClientIds.get(resolved)
  if (!id) {
    id = `client:${resolvedRedisClientIdsSize()}`
    resolvedRedisClientIds.set(resolved, id)
  }
  return id
}

function resolvedRedisClientIdsSize(): number {
  return redisOperations.reduce((size, operation) => {
    if (!operation.client) return size
    return Math.max(size, Number.parseInt(operation.client.replace("client:", ""), 10) + 1)
  }, 0)
}

vi.mock("@voyant-travel/utils/redis-kv", () => ({
  createRedisKvStore: (
    redisUrl: string,
    options?: { client?: LazyRedisClient; keyPrefix?: string },
  ) => {
    redisStoreCreations.push({ kind: "kv", redisUrl, client: options?.client })
    const values = new Map<string, string>()
    const keyPrefix = options?.keyPrefix ?? ""

    return {
      async get<T = string>(key: string): Promise<T | null> {
        const physicalKey = `${keyPrefix}${key}`
        redisOperations.push({
          op: "get",
          key: physicalKey,
          redisUrl,
          client: await redisClientId(options?.client),
        })
        return (values.get(physicalKey) ?? null) as T | null
      },
      async put(key: string, value: string): Promise<void> {
        const physicalKey = `${keyPrefix}${key}`
        redisOperations.push({
          op: "set",
          key: physicalKey,
          redisUrl,
          client: await redisClientId(options?.client),
        })
        values.set(physicalKey, value)
      },
      async delete(key: string): Promise<void> {
        const physicalKey = `${keyPrefix}${key}`
        redisOperations.push({
          op: "del",
          key: physicalKey,
          redisUrl,
          client: await redisClientId(options?.client),
        })
        values.delete(physicalKey)
      },
      async list(): Promise<{ keys: Array<{ name: string }> }> {
        return { keys: [] }
      },
    }
  },
}))

vi.mock("@voyant-travel/hono", async (importOriginal) => {
  const original = await importOriginal<typeof import("@voyant-travel/hono")>()

  return {
    ...original,
    createRedisRateLimitStore: (
      redisUrl: string,
      options?: { client?: LazyRedisClient; keyPrefix?: string },
    ) => ({
      async limit(key: string, { windowSeconds }: { max: number; windowSeconds: number }) {
        redisStoreCreations.push({ kind: "rate", redisUrl, client: options?.client })
        const windowKey = Math.floor(Math.floor(Date.now() / 1000) / windowSeconds)
        const physicalKey = `${options?.keyPrefix ?? ""}${key}:${windowKey}`
        const client = await redisClientId(options?.client)
        redisOperations.push({ op: "incr", key: physicalKey, redisUrl, client })
        redisOperations.push({ op: "expire", key: physicalKey, redisUrl, client })
        return { allowed: true, remaining: 1, retryAfterSeconds: windowSeconds }
      },
    }),
  }
})

const BASE_PROVIDERS = {
  database: "postgres",
  storage: "memory",
  cache: "memory",
  sharedState: "memory",
  rateLimit: "memory",
  search: "none",
  email: "none",
  sms: "none",
  adminAuth: "voyant-cloud",
  customerAuth: "disabled",
  realtime: "none",
  scheduledJobs: "none",
  outboundWebhooks: "none",
  payments: "none",
} satisfies VoyantDeploymentProviders

afterEach(() => {
  redisOperations.length = 0
  tcpRedisConnections.length = 0
  restRedisConstructed.length = 0
  redisStoreCreations.length = 0
  vi.clearAllMocks()
})

function emptyGraphRuntime(providers: VoyantDeploymentProviders) {
  return createVoyantGraphRuntime({
    graphHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    entries: {},
    modules: [],
    plugins: [],
    providerSelections: { ...providers },
  })
}

const OUTBOX_JOB_ID = "infrastructure.event-outbox-drain"
const outboxRuntimePort = definePort<{
  deliver(event: EventEnvelope): Promise<unknown>
}>({
  id: "infrastructure.event-outbox-delivery",
  test(runtime) {
    if (!runtime || typeof runtime.deliver !== "function") {
      throw new TypeError("test event-delivery port must implement deliver().")
    }
  },
})

function outboxJobRuntime(
  providers: VoyantDeploymentProviders,
  handler: VoyantGraphRuntimeJobHandler,
): VoyantGraphRuntime {
  const unitId = "@voyant-travel/db"
  return createVoyantGraphRuntime({
    graphHash: "sha256:node-outbox-delivery",
    entries: { "@voyant-travel/db/outbox-job": async () => ({ runJob: handler }) },
    modules: [
      {
        id: unitId,
        kind: "module",
        packageName: unitId,
        order: 0,
        runtimePorts: [outboxRuntimePort.id],
        references: [
          {
            id: "event-outbox-job",
            unitId,
            facet: "jobs.runtime",
            entityId: OUTBOX_JOB_ID,
            runtime: { entry: "./outbox-job", export: "runJob" },
            importEntry: "@voyant-travel/db/outbox-job",
          },
        ],
        jobs: [
          {
            unitId,
            declaration: {
              id: OUTBOX_JOB_ID,
              wakeup: true,
              runtime: { entry: "./outbox-job", export: "runJob" },
            },
            referenceId: "event-outbox-job",
          },
        ],
        selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
        routes: [],
      },
    ],
    plugins: [],
    providerSelections: { ...providers },
  })
}

function authIntegration() {
  return {
    handler: () => ({
      fetch: async () => new Response(null, { status: 404 }),
    }),
  }
}

function redisUrlWithCredentials(options: {
  protocol: "redis:" | "rediss:" | "https:"
  host: string
  port?: string
  path?: string
  credential: string
}): string {
  const url = new URL(
    `${options.protocol}//${options.host}${options.port ?? ""}${options.path ?? "/0"}`,
  )
  url.username = "default"
  url.password = options.credential
  return url.toString()
}

describe("createVoyantNodeEnv Redis namespace", () => {
  it("uses role-specific Redis key prefixes when REDIS_NAMESPACE is supplied", async () => {
    const env = createVoyantNodeEnv(
      {
        REDIS_URL: "https://example.upstash.io?token=test-token",
        REDIS_NAMESPACE: "region_eu-1",
      },
      {
        storage: "memory",
        cache: "redis",
        sharedState: "redis",
        rateLimit: "redis",
      },
    )

    await env.CACHE!.put("cache-key", "cache-value")
    await env.SHARED_STATE!.put("state-key", "state-value")
    await env.RATE_LIMIT_STORE!.limit("lim:auth:client", { max: 10, windowSeconds: 60 })

    expect(redisOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ op: "set", key: "voyant:v1:region_eu-1:cache:cache-key" }),
        expect.objectContaining({ op: "set", key: "voyant:v1:region_eu-1:state:state-key" }),
        expect.objectContaining({
          op: "incr",
          key: expect.stringMatching(/^voyant:v1:region_eu-1:rate:lim:auth:client:\d+$/u),
        }),
        expect.objectContaining({
          op: "expire",
          key: expect.stringMatching(/^voyant:v1:region_eu-1:rate:lim:auth:client:\d+$/u),
        }),
      ]),
    )
  })

  it("leaves self-hosted Redis shared state compatible when namespace is omitted", async () => {
    const env = createVoyantNodeEnv(
      {
        REDIS_URL: "http://redis-rest.local?token=test-token",
      },
      {
        storage: "memory",
        cache: "memory",
        sharedState: "redis",
        rateLimit: "memory",
      },
    )

    await env.SHARED_STATE!.put("state-key", "state-value")

    expect(redisOperations).toContainEqual(expect.objectContaining({ op: "set", key: "state-key" }))
  })

  it("reuses one lazy TCP Redis client across cache, shared-state, and rate-limit roles", async () => {
    const redisUrl = redisUrlWithCredentials({
      protocol: "rediss:",
      host: "redis.example.test",
      port: ":6380",
      credential: "secret",
    })
    const env = createVoyantNodeEnv(
      {
        REDIS_URL: redisUrl,
        REDIS_NAMESPACE: "region-eu-1",
      },
      {
        storage: "memory",
        cache: "redis",
        sharedState: "redis",
        rateLimit: "redis",
      },
    )

    await env.CACHE!.put("cache-key", "cache-value")
    await env.SHARED_STATE!.put("state-key", "state-value")
    await env.RATE_LIMIT_STORE!.limit("lim:auth:client", { max: 10, windowSeconds: 60 })

    expect(tcpRedisConnections).toEqual([
      { protocol: "rediss:", username: "default", password: "secret" },
    ])
    expect(new Set(redisOperations.map((operation) => operation.client))).toEqual(
      new Set(["client:0"]),
    )
  })

  it("keeps HTTPS Redis REST compatibility through the shared Upstash adapter", async () => {
    const redisUrl = redisUrlWithCredentials({
      protocol: "https:",
      host: "example.upstash.io",
      path: "/redis",
      credential: "test-token",
    })
    const env = createVoyantNodeEnv(
      {
        REDIS_URL: redisUrl,
        REDIS_NAMESPACE: "region-eu-1",
      },
      {
        storage: "memory",
        cache: "redis",
        sharedState: "memory",
        rateLimit: "redis",
      },
    )

    await env.CACHE!.put("cache-key", "cache-value")
    await env.RATE_LIMIT_STORE!.limit("lim:auth:client", { max: 10, windowSeconds: 60 })

    expect(tcpRedisConnections).toEqual([])
    expect(redisStoreCreations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "kv",
          redisUrl,
        }),
        expect.objectContaining({
          kind: "rate",
          redisUrl,
        }),
      ]),
    )
    expect(new Set(redisOperations.map((operation) => operation.client))).toEqual(
      new Set(["client:0"]),
    )
  })
})

describe("loadVoyantNodeRuntime Redis URL validation", () => {
  it("delivers outbox events through the composed internal subscriber bus", async () => {
    const originalDeliver = vi.fn(async (_envelope: EventEnvelope) => ({
      attempted: 0,
      failed: 0,
      errors: [],
    }))
    const event: EventEnvelope = {
      name: "person.changed",
      data: { personId: "pers_1" },
      metadata: { eventId: "evt_1" },
      emittedAt: "2026-07-29T00:00:00.000Z",
    }
    let markJobFinished!: () => void
    const jobFinished = new Promise<void>((resolve) => {
      markJobFinished = resolve
    })
    const handler: VoyantGraphRuntimeJobHandler = async ({ getPort }) => {
      try {
        const outbox = await getPort(outboxRuntimePort)
        await outbox.deliver(event)
      } finally {
        markJobFinished()
      }
    }
    let deliverEvent: (envelope: EventEnvelope) => Promise<unknown> = originalDeliver
    const runtime = await loadVoyantNodeRuntime({
      graphRuntime: outboxJobRuntime(BASE_PROVIDERS, handler),
      jobs: [
        {
          id: OUTBOX_JOB_ID,
          unitId: "@voyant-travel/db",
          packageName: "@voyant-travel/db",
          wakeup: true,
        },
      ],
      deployment: { mode: "self-hosted", providers: BASE_PROVIDERS },
      deploymentRequirements: { resources: [] },
      runtimePorts: {
        [outboxRuntimePort.id]: {
          withDb: vi.fn(),
          deliver: (envelope: EventEnvelope) => deliverEvent(envelope),
          warn: vi.fn(),
        },
      },
      eventDelivery: {
        bind(deliver) {
          deliverEvent = deliver
        },
      },
    })
    const subscriber = vi.fn(async () => undefined)
    await runtime.app.ready(runtime.env)
    runtime.app.eventBus.subscribe(event.name, subscriber)

    await runtime.jobs.invoke(OUTBOX_JOB_ID, "wakeup")
    await jobFinished

    expect(subscriber).toHaveBeenCalledWith(event)
    expect(originalDeliver).not.toHaveBeenCalled()
  })

  it("routes the exact managed product-job inventory endpoint", async () => {
    const providers = {
      ...BASE_PROVIDERS,
      adminAuth: "better-auth",
    } satisfies VoyantDeploymentProviders
    const runtime = await loadVoyantNodeRuntime({
      graphRuntime: emptyGraphRuntime(providers),
      jobs: [],
      deployment: { mode: "self-hosted", providers },
      deploymentRequirements: { resources: [] },
      env: { ORIGIN_TRUST_SECRET: "secret" },
    })

    const response = await runtime.fetch(
      new Request("https://operator.test/__voyant/jobs", {
        headers: { "x-voyant-origin-trust": "secret" },
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ provisioning: { jobs: [] } })
  })

  it("requires REDIS_NAMESPACE when managed shared state uses Redis", async () => {
    const providers = {
      ...BASE_PROVIDERS,
      sharedState: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: "https://example.upstash.io?token=test-token",
        },
        auth: authIntegration(),
      }),
    ).rejects.toThrow(
      /managed-cloud Redis cache, shared-state, and rate-limit providers require REDIS_NAMESPACE/,
    )
  })

  it("rejects HTTP Redis REST URLs in managed cloud", async () => {
    const providers = {
      ...BASE_PROVIDERS,
      cache: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: "http://example.upstash.io?token=test-token",
          REDIS_NAMESPACE: "region-eu-1",
        },
        auth: authIntegration(),
      }),
    ).rejects.toThrow(
      /managed-cloud Redis providers require rediss:\/\/ for Redis TCP or an HTTPS Redis REST URL with a token/,
    )
  })

  it("rejects plaintext Redis TCP URLs in managed cloud without leaking credentials", async () => {
    const redisUrl = redisUrlWithCredentials({
      protocol: "redis:",
      host: "example.redis.test",
      port: ":6379",
      credential: ["credential", "sentinel"].join("-"),
    })
    const providers = {
      ...BASE_PROVIDERS,
      cache: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: redisUrl,
          REDIS_NAMESPACE: "region-eu-1",
        },
        auth: authIntegration(),
      }),
    ).rejects.toThrow(
      /managed-cloud Redis providers require rediss:\/\/ for Redis TCP or an HTTPS Redis REST URL with a token/,
    )

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: redisUrl,
          REDIS_NAMESPACE: "region-eu-1",
        },
        auth: authIntegration(),
      }),
    ).rejects.not.toThrow(/credential-sentinel|example\.redis\.test/u)
  })

  it("allows managed Redis providers when HTTPS URL and namespace are configured", async () => {
    const providers = {
      ...BASE_PROVIDERS,
      cache: "redis",
      rateLimit: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: "https://example.upstash.io?token=test-token",
          REDIS_NAMESPACE: "region-eu-1",
        },
        auth: authIntegration(),
      }),
    ).resolves.toMatchObject({
      deployment: { mode: "managed-cloud" },
      env: { REDIS_NAMESPACE: "region-eu-1" },
    })
  })

  it("allows managed Redis providers when rediss URL and namespace are configured", async () => {
    const redisUrl = redisUrlWithCredentials({
      protocol: "rediss:",
      host: "example.redis.test",
      port: ":6380",
      credential: "test-token",
    })
    const providers = {
      ...BASE_PROVIDERS,
      cache: "redis",
      rateLimit: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "managed-cloud", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: redisUrl,
          REDIS_NAMESPACE: "region-eu-1",
        },
        auth: authIntegration(),
      }),
    ).resolves.toMatchObject({
      deployment: { mode: "managed-cloud" },
      env: { REDIS_NAMESPACE: "region-eu-1" },
    })
  })

  it("allows self-hosted Redis providers to use plaintext TCP without a namespace", async () => {
    const redisUrl = redisUrlWithCredentials({
      protocol: "redis:",
      host: "example.redis.test",
      port: ":6379",
      credential: "test-token",
    })
    const providers = {
      ...BASE_PROVIDERS,
      adminAuth: "better-auth",
      cache: "redis",
    } satisfies VoyantDeploymentProviders

    await expect(
      loadVoyantNodeRuntime({
        graphRuntime: emptyGraphRuntime(providers),
        jobs: [],
        deployment: { mode: "self-hosted", providers },
        deploymentRequirements: { resources: [] },
        env: {
          REDIS_URL: redisUrl,
        },
      }),
    ).resolves.toMatchObject({
      deployment: { mode: "self-hosted" },
    })
  })
})
