import { describe, expect, it } from "vitest"

import type { LazyRedisClient, RedisClient } from "../src/redis-client.js"
import { createRedisKvStore } from "../src/redis-kv.js"

class FakeRedisClient implements RedisClient {
  readonly values = new Map<string, string>()
  readonly expiries = new Map<string, number>()
  readonly deletions: string[] = []
  leakedScanKeys: string[] | undefined
  /** Test clock (ms). Keys written with `ex` vanish once it passes their deadline. */
  clockMs = 0
  private readonly deadlines = new Map<string, number>()

  /** Redis drops an expired key entirely; it is then absent to GET and to SET NX. */
  private expireIfDue(key: string): void {
    const deadline = this.deadlines.get(key)
    if (deadline === undefined || deadline > this.clockMs) return
    this.values.delete(key)
    this.deadlines.delete(key)
    this.expiries.delete(key)
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.expireIfDue(key)
    return (this.values.get(key) ?? null) as T | null
  }

  async set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<unknown> {
    this.expireIfDue(key)
    // Redis evaluates NX server-side and answers nil when it refuses the write.
    if (options?.nx === true && this.values.has(key)) return null
    this.values.set(key, value)
    if (options?.ex === undefined) {
      this.deadlines.delete(key)
      this.expiries.delete(key)
    } else {
      this.expiries.set(key, options.ex)
      this.deadlines.set(key, this.clockMs + options.ex * 1000)
    }
    return "OK"
  }

  async del(key: string): Promise<unknown> {
    this.deletions.push(key)
    this.values.delete(key)
    this.expiries.delete(key)
    this.deadlines.delete(key)
  }

  async scan(
    cursor: number,
    options?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]> {
    if (cursor !== 0) return [0, []]
    if (this.leakedScanKeys) return [0, this.leakedScanKeys]
    const pattern = options?.match ?? "*"
    return [0, [...this.values.keys()].filter((key) => redisGlobMatches(pattern, key)).sort()]
  }

  async incr(key: string): Promise<number> {
    const next = Number(this.values.get(key) ?? "0") + 1
    this.values.set(key, String(next))
    return next
  }

  async expire(key: string, seconds: number): Promise<unknown> {
    this.expiries.set(key, seconds)
  }
}

function fakeClient(client: RedisClient): LazyRedisClient {
  return { get: async () => client }
}

function redisGlobMatches(pattern: string, value: string): boolean {
  let regex = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === "\\") {
      const next = pattern[index + 1]
      regex += escapeRegExp(next ?? "\\")
      if (next !== undefined) index += 1
      continue
    }
    if (char === "*") {
      regex += ".*"
      continue
    }
    if (char === "?") {
      regex += "."
      continue
    }
    regex += escapeRegExp(char ?? "")
  }
  return new RegExp(`${regex}$`, "u").test(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

describe("createRedisKvStore with keyPrefix", () => {
  it("isolates adjacent namespaces and lists logical keys", async () => {
    const client = new FakeRedisClient()
    const eu = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:eu:cache:",
    })
    const europe = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:europe:cache:",
    })

    await eu.put("hotel:1", "eu")
    await europe.put("hotel:1", "europe")
    await eu.put("tour:1", "tour")

    await expect(eu.get("hotel:1")).resolves.toBe("eu")
    await expect(europe.get("hotel:1")).resolves.toBe("europe")
    await expect(eu.list({ prefix: "hotel:" })).resolves.toEqual({
      keys: [{ name: "hotel:1" }],
    })
  })

  it("deletes only the prefixed physical key", async () => {
    const client = new FakeRedisClient()
    const kv = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:ro:cache:",
    })
    client.values.set("key", "unprefixed")

    await kv.put("key", "prefixed")
    await kv.delete("key")

    expect(client.values.get("key")).toBe("unprefixed")
    expect(client.values.has("voyant:v1:ro:cache:key")).toBe(false)
  })

  it("applies TTL to the prefixed physical key", async () => {
    const client = new FakeRedisClient()
    const kv = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:ro:cache:",
    })

    await kv.put("key", "value", { expirationTtl: 1.2 })

    expect(client.expiries.get("voyant:v1:ro:cache:key")).toBe(2)
  })

  it("escapes Redis SCAN glob characters in the physical prefix", async () => {
    const client = new FakeRedisClient()
    const kv = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:[ro]*?:cache:",
    })
    client.values.set("voyant:v1:[ro]*?:cache:hotel:1", "match")
    client.values.set("voyant:v1:r:cache:hotel:2", "glob-leak")

    await expect(kv.list({ prefix: "hotel:" })).resolves.toEqual({
      keys: [{ name: "hotel:1" }],
    })
  })

  it("filters leaked physical keys and returns logical names safe for delete", async () => {
    const client = new FakeRedisClient()
    const kv = createRedisKvStore("https://example.test?token=test-token", {
      client: fakeClient(client),
      keyPrefix: "voyant:v1:ro:cache:",
    })
    client.values.set("voyant:v1:ro:cache:hotel:1", "match")
    client.leakedScanKeys = [
      "voyant:v1:ro:cache:hotel:1",
      "voyant:v1:ro:rate:hotel:2",
      "voyant:v1:ro:cache:tour:1",
      "unprefixed:hotel:3",
    ]

    const result = await kv.list({ prefix: "hotel:" })
    await kv.delete(result.keys[0]!.name)

    expect(result).toEqual({ keys: [{ name: "hotel:1" }] })
    expect(client.deletions).toEqual(["voyant:v1:ro:cache:hotel:1"])
  })

  it("rejects control characters in keyPrefix", () => {
    expect(() =>
      createRedisKvStore("https://example.test?token=test-token", {
        client: fakeClient(new FakeRedisClient()),
        keyPrefix: "voyant:v1:bad\nnamespace:cache:",
      }),
    ).toThrow(/keyPrefix/)
  })
})

describe("createRedisKvStore putIfAbsent", () => {
  const REDIS_URL = "https://example.test?token=test-token"

  function store(client: FakeRedisClient, keyPrefix?: string) {
    return createRedisKvStore(REDIS_URL, {
      client: fakeClient(client),
      ...(keyPrefix === undefined ? {} : { keyPrefix }),
    })
  }

  it("gives the slot to the first caller and refuses the second", async () => {
    const kv = store(new FakeRedisClient())

    await expect(kv.putIfAbsent?.("lock", "first")).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("lock", "second")).resolves.toBe(false)
  })

  it("elects exactly one winner among concurrent callers", async () => {
    const kv = store(new FakeRedisClient())

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) => kv.putIfAbsent?.("lock", `caller-${index}`)),
    )

    expect(results.filter((won) => won === true)).toHaveLength(1)
    expect(results.filter((won) => won === false)).toHaveLength(4)
  })

  it("makes the winner's value the readable value", async () => {
    const kv = store(new FakeRedisClient())

    await expect(kv.putIfAbsent?.("k", "winner")).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("k", "loser")).resolves.toBe(false)

    await expect(kv.get("k")).resolves.toBe("winner")
  })

  it("issues SET NX against the prefixed physical key and applies the TTL to it", async () => {
    const client = new FakeRedisClient()
    const kv = store(client, "voyant:v1:ro:cache:")

    await expect(kv.putIfAbsent?.("key", "winner", { expirationTtl: 1.2 })).resolves.toBe(true)

    expect(client.values.get("voyant:v1:ro:cache:key")).toBe("winner")
    expect(client.expiries.get("voyant:v1:ro:cache:key")).toBe(2)
    expect(client.values.has("key")).toBe(false)
  })

  it("isolates elections between adjacent key prefixes", async () => {
    const client = new FakeRedisClient()
    const eu = store(client, "voyant:v1:eu:cache:")
    const europe = store(client, "voyant:v1:europe:cache:")

    await expect(eu.putIfAbsent?.("lock", "eu")).resolves.toBe(true)
    await expect(europe.putIfAbsent?.("lock", "europe")).resolves.toBe(true)
    await expect(eu.putIfAbsent?.("lock", "eu-again")).resolves.toBe(false)
  })

  it("treats an expired key as absent so a later caller wins the slot again", async () => {
    const client = new FakeRedisClient()
    const kv = store(client)

    await expect(kv.putIfAbsent?.("k", "first", { expirationTtl: 30 })).resolves.toBe(true)
    await expect(kv.putIfAbsent?.("k", "blocked", { expirationTtl: 30 })).resolves.toBe(false)

    client.clockMs += 30_001
    await expect(kv.putIfAbsent?.("k", "second", { expirationTtl: 30 })).resolves.toBe(true)
    await expect(kv.get("k")).resolves.toBe("second")
  })

  it("reports false when Redis answers a nil reply", async () => {
    const client = new FakeRedisClient()
    client.values.set("k", "held")

    await expect(store(client).putIfAbsent?.("k", "mine")).resolves.toBe(false)
    expect(client.values.get("k")).toBe("held")
  })
})

const describeIfRedis = process.env.REDIS_URL ? describe : describe.skip

describeIfRedis("createRedisKvStore", () => {
  it("round-trips text and JSON with TTL against REDIS_URL", async () => {
    const kv = createRedisKvStore(process.env.REDIS_URL!)
    const key = `test:kv:${Date.now()}`
    await kv.put(key, JSON.stringify({ ok: true }), { expirationTtl: 60 })
    expect(await kv.get(key, { type: "json" })).toEqual({ ok: true })
    await kv.delete(key)
    expect(await kv.get(key)).toBeNull()
  })
})
