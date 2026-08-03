import type { LazyRedisClient, RedisClient } from "@voyant-travel/utils/redis-client"
import { createClient, type RedisClientType } from "redis"

type NodeRedisClient = RedisClientType

export function createLazyNodeRedisTcpClient(redisUrl: string): LazyRedisClient {
  let clientPromise: Promise<RedisClient> | undefined

  return {
    get() {
      if (!clientPromise) {
        const connectPromise = connectNodeRedisClient(redisUrl).catch((error: unknown) => {
          if (clientPromise === connectPromise) clientPromise = undefined
          throw error
        })
        clientPromise = connectPromise
      }
      return clientPromise
    },
  }
}

async function connectNodeRedisClient(redisUrl: string): Promise<RedisClient> {
  assertRedisTcpUrl(redisUrl)
  const client = createClient({ url: redisUrl })
  client.on("error", () => {
    // node-redis requires an error listener. Keep details out of framework logs because
    // connection errors can include credential-bearing URLs from lower layers.
  })
  try {
    await client.connect()
  } catch (error) {
    await closeNodeRedisClient(client)
    throw sanitizedRedisTcpError(error)
  }
  return adaptNodeRedisClient(client)
}

function adaptNodeRedisClient(client: NodeRedisClient): RedisClient {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      return (await client.get(key)) as T | null
    },
    async set(
      key: string,
      value: string,
      options?: { ex?: number; nx?: boolean },
    ): Promise<unknown> {
      // `nx` must reach the server as the SET NX condition. Dropping it would
      // turn a conditional write into an unconditional one that always reports
      // success, which silently breaks `putIfAbsent` callers.
      const setOptions = {
        ...(options?.ex !== undefined
          ? { expiration: { type: "EX" as const, value: options.ex } }
          : {}),
        ...(options?.nx === true ? { condition: "NX" as const } : {}),
      }
      if (Object.keys(setOptions).length === 0) return client.set(key, value)
      return client.set(key, value, setOptions)
    },
    async del(key: string): Promise<unknown> {
      return client.del(key)
    },
    async scan(
      cursor: number,
      options?: { match?: string; count?: number },
    ): Promise<[number | string, string[]]> {
      const result = await client.scan(String(cursor), {
        ...(options?.match ? { MATCH: options.match } : {}),
        ...(options?.count !== undefined ? { COUNT: options.count } : {}),
      })
      return normalizeScanResult(result)
    },
    async incr(key: string): Promise<number> {
      return client.incr(key)
    },
    async expire(key: string, seconds: number): Promise<unknown> {
      return client.expire(key, seconds)
    },
  }
}

function normalizeScanResult(result: unknown): [number | string, string[]] {
  if (Array.isArray(result)) {
    return [String(result[0] ?? "0"), normalizeScanKeys(result[1])]
  }
  if (result && typeof result === "object") {
    const record = result as { cursor?: unknown; keys?: unknown }
    return [String(record.cursor ?? "0"), normalizeScanKeys(record.keys)]
  }
  return ["0", []]
}

function normalizeScanKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : []
}

function assertRedisTcpUrl(redisUrl: string): void {
  try {
    const parsed = new URL(redisUrl)
    if (parsed.protocol === "redis:" || parsed.protocol === "rediss:") return
  } catch {
    // Fall through to sanitized error below.
  }
  throw new Error("REDIS_URL must be a redis:// or rediss:// Redis TCP URL.")
}

async function closeNodeRedisClient(client: NodeRedisClient): Promise<void> {
  try {
    await client.close()
  } catch {
    try {
      client.destroy()
    } catch {
      // Ignore cleanup failures after a failed connection attempt.
    }
  }
}

function sanitizedRedisTcpError(error: unknown): Error {
  const code =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? ` (${error.code})`
      : ""
  return new Error(`Redis TCP client failed to connect${code}`)
}
