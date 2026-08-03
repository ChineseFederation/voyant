import type { KVStore } from "./cache.js"
import { createLazyRedisClient, type LazyRedisClient } from "./redis-client.js"

export interface RedisKvStoreOptions {
  client?: LazyRedisClient
  keyPrefix?: string
}

function getType(options?: "json" | { type?: "json" | "text" }): "json" | "text" {
  return typeof options === "string" ? options : (options?.type ?? "text")
}

function normalizeKeyPrefix(keyPrefix: string | undefined): string {
  if (keyPrefix === undefined || keyPrefix.length === 0) return ""
  if (hasControlCharacter(keyPrefix)) {
    throw new Error("Redis keyPrefix must not contain control characters.")
  }
  return keyPrefix
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function physicalKey(keyPrefix: string, key: string): string {
  return `${keyPrefix}${key}`
}

function expirySeconds(expirationTtl: number): number {
  return Math.max(1, Math.ceil(expirationTtl))
}

/** Redis answers `OK` when a `SET` applied and a nil reply when `NX` rejected it. */
function setApplied(reply: unknown): boolean {
  return typeof reply === "string" && reply.toUpperCase() === "OK"
}

function logicalKey(keyPrefix: string, key: string): string | undefined {
  if (!keyPrefix) return key
  return key.startsWith(keyPrefix) ? key.slice(keyPrefix.length) : undefined
}

function scanPattern(prefix: string): string {
  return `${prefix
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("*", "\\*")
    .replaceAll("?", "\\?")}*`
}

export function createRedisKvStore(redisUrl: string, options: RedisKvStoreOptions = {}): KVStore {
  const lazyClient = options.client ?? createLazyRedisClient(redisUrl)
  const keyPrefix = normalizeKeyPrefix(options.keyPrefix)

  return {
    async get<T = string>(
      key: string,
      options?: "json" | { type?: "json" | "text" },
    ): Promise<T | null> {
      const client = await lazyClient.get()
      const value = await client.get<string>(physicalKey(keyPrefix, key))
      if (value === null || value === undefined) return null
      return (
        getType(options) === "json" && typeof value === "string" ? JSON.parse(value) : value
      ) as T
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      const client = await lazyClient.get()
      const storedKey = physicalKey(keyPrefix, key)
      if (options?.expirationTtl !== undefined) {
        await client.set(storedKey, value, { ex: expirySeconds(options.expirationTtl) })
        return
      }
      await client.set(storedKey, value)
    },
    async putIfAbsent(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<boolean> {
      const client = await lazyClient.get()
      const storedKey = physicalKey(keyPrefix, key)
      // `SET key value NX [EX ttl]` decides presence and takes the slot in one
      // command, so concurrent callers are excluded by Redis itself. An expired
      // key no longer exists, so it is `NX`-absent and the next caller wins it.
      const reply =
        options?.expirationTtl === undefined
          ? await client.set(storedKey, value, { nx: true })
          : await client.set(storedKey, value, {
              nx: true,
              ex: expirySeconds(options.expirationTtl),
            })
      return setApplied(reply)
    },
    async delete(key: string): Promise<void> {
      const client = await lazyClient.get()
      await client.del(physicalKey(keyPrefix, key))
    },
    async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
      const client = await lazyClient.get()
      if (!client.scan) return { keys: [] }
      const keys: Array<{ name: string }> = []
      let cursor: number | string = 0
      const requestedPrefix = options?.prefix
      const match = scanPattern(physicalKey(keyPrefix, requestedPrefix ?? ""))
      do {
        const [nextCursor, batch] = await client.scan(Number(cursor), { match, count: 100 })
        for (const name of batch) {
          const logicalName = logicalKey(keyPrefix, name)
          if (
            logicalName !== undefined &&
            (requestedPrefix === undefined || logicalName.startsWith(requestedPrefix))
          ) {
            keys.push({ name: logicalName })
          }
        }
        cursor = nextCursor
      } while (String(cursor) !== "0")
      return { keys }
    },
  }
}
