type RedisConstructor = new (options: { url: string; token: string }) => RedisClient

interface RedisModule {
  Redis: RedisConstructor & {
    fromEnv?: () => RedisClient
  }
}

export interface RedisClient {
  get<T = unknown>(key: string): Promise<T | null>
  /**
   * `SET key value [EX ex] [NX]`. With `nx`, resolves to the `OK` reply only
   * when the write happened, and to a nil reply when the key already existed.
   */
  set(key: string, value: string, options?: { ex?: number; nx?: boolean }): Promise<unknown>
  del(key: string): Promise<unknown>
  scan?(
    cursor: number,
    options?: { match?: string; count?: number },
  ): Promise<[number | string, string[]]>
  incr(key: string): Promise<number>
  expire(key: string, seconds: number): Promise<unknown>
}

export interface LazyRedisClient {
  get(): Promise<RedisClient>
}

function parseRedisRestUrl(rawUrl: string): { url: string; token: string } {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("REDIS_URL must be an HTTP(S) Redis REST URL.")
  }

  const passwordToken = parsed.password
  const queryToken = parsed.searchParams.get("token")
  const token = passwordToken ? decodeURIComponent(passwordToken) : (queryToken ?? "")
  if (!token) {
    throw new Error("REDIS_URL must include a Redis REST token as the URL password or token query.")
  }

  parsed.username = ""
  parsed.password = ""
  parsed.searchParams.delete("token")
  return {
    url: parsed.toString().replace(/\/$/, ""),
    token,
  }
}

export function createLazyRedisClient(redisUrl: string): LazyRedisClient {
  let clientPromise: Promise<RedisClient> | undefined

  return {
    get() {
      clientPromise ??= import("@upstash/redis").then((mod: RedisModule) => {
        const { url, token } = parseRedisRestUrl(redisUrl)
        return new mod.Redis({ url, token })
      })
      return clientPromise
    },
  }
}
