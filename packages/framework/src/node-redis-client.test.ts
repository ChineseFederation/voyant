import { beforeEach, describe, expect, it, vi } from "vitest"

const redisClients = vi.hoisted(
  () =>
    [] as Array<{
      url: string
      events: string[]
      connect: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      destroy: ReturnType<typeof vi.fn>
      get: ReturnType<typeof vi.fn>
      set: ReturnType<typeof vi.fn>
      del: ReturnType<typeof vi.fn>
      scan: ReturnType<typeof vi.fn>
      incr: ReturnType<typeof vi.fn>
      expire: ReturnType<typeof vi.fn>
    }>,
)
const nextConnectError = vi.hoisted(() => ({ error: undefined as Error | undefined }))

vi.mock("redis", () => ({
  createClient: ({ url }: { url: string }) => {
    const client = {
      url,
      events: [] as string[],
      connect: vi.fn(async () => {
        if (nextConnectError.error) throw nextConnectError.error
      }),
      close: vi.fn(async () => undefined),
      destroy: vi.fn(),
      get: vi.fn(async () => "stored-value"),
      set: vi.fn(async () => "OK"),
      del: vi.fn(async () => 1),
      scan: vi.fn(async () => ({ cursor: "0", keys: ["key:1"] })),
      incr: vi.fn(async () => 2),
      expire: vi.fn(async () => true),
      on: vi.fn((event: string) => {
        client.events.push(event)
      }),
    }
    redisClients.push(client)
    return client
  },
}))

beforeEach(() => {
  redisClients.length = 0
  nextConnectError.error = undefined
  vi.resetModules()
})

function credentialedRedisUrl(protocol: "redis:" | "rediss:" | "https:"): string {
  const path = protocol === "https:" ? "/redis" : "/0"
  const port = protocol === "redis:" ? ":6379" : protocol === "rediss:" ? ":6380" : ""
  const url = new URL(`${protocol}//example.redis.test${port}${path}`)
  url.username = "default"
  url.password = "secret"
  return url.toString()
}

async function createTcpClient(redisUrl = credentialedRedisUrl("rediss:")) {
  const { createLazyNodeRedisTcpClient } = await import("./node-redis-client.js")
  return createLazyNodeRedisTcpClient(redisUrl)
}

describe("createLazyNodeRedisTcpClient", () => {
  it("connects lazily once and maps Redis commands", async () => {
    const lazyClient = await createTcpClient()
    const client = await lazyClient.get()

    await expect(lazyClient.get()).resolves.toBe(client)
    await expect(client.get("key")).resolves.toBe("stored-value")
    await client.set("ttl-key", "value", { ex: 12 })
    await client.set("plain-key", "value")
    await client.del("old-key")
    await expect(client.scan!(0, { match: "prefix:*", count: 100 })).resolves.toEqual([
      "0",
      ["key:1"],
    ])
    await expect(client.incr("counter")).resolves.toBe(2)
    await client.expire("counter", 60)

    expect(redisClients).toHaveLength(1)
    expect(redisClients[0]!.events).toEqual(["error"])
    expect(redisClients[0]!.connect).toHaveBeenCalledOnce()
    expect(redisClients[0]!.set).toHaveBeenNthCalledWith(1, "ttl-key", "value", {
      expiration: { type: "EX", value: 12 },
    })
    expect(redisClients[0]!.set).toHaveBeenNthCalledWith(2, "plain-key", "value")
    expect(redisClients[0]!.del).toHaveBeenCalledWith("old-key")
    expect(redisClients[0]!.scan).toHaveBeenCalledWith("0", {
      COUNT: 100,
      MATCH: "prefix:*",
    })
    expect(redisClients[0]!.expire).toHaveBeenCalledWith("counter", 60)
  })

  it("sends nx as the SET NX condition so putIfAbsent can exclude", async () => {
    const lazyClient = await createTcpClient()
    const client = await lazyClient.get()

    await client.set("lock", "value", { nx: true, ex: 30 })
    await client.set("lock", "value", { nx: true })

    expect(redisClients[0]!.set).toHaveBeenNthCalledWith(1, "lock", "value", {
      expiration: { type: "EX", value: 30 },
      condition: "NX",
    })
    expect(redisClients[0]!.set).toHaveBeenNthCalledWith(2, "lock", "value", {
      condition: "NX",
    })
  })

  it("relays the nil SET NX reply that means another holder won", async () => {
    const lazyClient = await createTcpClient()
    const client = await lazyClient.get()
    redisClients[0]!.set.mockResolvedValueOnce(null)

    await expect(client.set("lock", "value", { nx: true })).resolves.toBeNull()
  })

  it("normalizes tuple SCAN replies from compatible clients", async () => {
    const lazyClient = await createTcpClient()
    const client = await lazyClient.get()
    redisClients[0]!.scan.mockResolvedValueOnce(["7", ["a", "b"]])

    await expect(client.scan!(0)).resolves.toEqual(["7", ["a", "b"]])
  })

  it("rejects non-TCP URLs before constructing a TCP client", async () => {
    const lazyClient = await createTcpClient(credentialedRedisUrl("https:"))

    await expect(lazyClient.get()).rejects.toThrow(/redis:\/\/ or rediss:\/\//)
    expect(redisClients).toHaveLength(0)
  })

  it("sanitizes connection failures", async () => {
    nextConnectError.error = Object.assign(
      new Error(`connect ${credentialedRedisUrl("rediss:")} failed`),
      { code: "ECONNREFUSED" },
    )
    const lazyClient = await createTcpClient()

    await expect(lazyClient.get()).rejects.toThrow(
      "Redis TCP client failed to connect (ECONNREFUSED)",
    )
    await expect(lazyClient.get()).rejects.not.toThrow(/secret|example\.redis\.test/u)
    expect(redisClients[0]!.close).toHaveBeenCalled()
  })

  it("retries with a fresh client after an initial sanitized connection failure", async () => {
    nextConnectError.error = Object.assign(
      new Error(`connect ${credentialedRedisUrl("rediss:")} failed`),
      { code: "WRONGPASS" },
    )
    const lazyClient = await createTcpClient()

    const firstAttempt = lazyClient.get()
    const concurrentFirstAttempt = lazyClient.get()
    expect(concurrentFirstAttempt).toBe(firstAttempt)
    await expect(firstAttempt).rejects.toThrow("Redis TCP client failed to connect (WRONGPASS)")
    await expect(concurrentFirstAttempt).rejects.not.toThrow(/default|secret|example\.redis\.test/u)
    expect(redisClients).toHaveLength(1)
    expect(redisClients[0]!.connect).toHaveBeenCalledOnce()
    expect(redisClients[0]!.close).toHaveBeenCalledOnce()

    nextConnectError.error = undefined
    const client = await lazyClient.get()

    await expect(lazyClient.get()).resolves.toBe(client)
    expect(redisClients).toHaveLength(2)
    expect(redisClients[1]!.connect).toHaveBeenCalledOnce()
  })
})
