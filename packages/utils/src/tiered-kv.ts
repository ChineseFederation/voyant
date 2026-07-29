import type { KVStore } from "./cache.js"

export interface TieredKvOptions {
  /**
   * Maximum TTL for values stored in L1, including writes and L2 promotions.
   * Defaults to 60s to bound cross-process invalidation lag.
   */
  l2PromotionTtlSeconds?: number
}

function getType(options?: "json" | { type?: "json" | "text" }): "json" | "text" {
  return typeof options === "string" ? options : (options?.type ?? "text")
}

export function createTieredKvStore(
  l1: KVStore,
  l2: KVStore | null | undefined,
  options: TieredKvOptions = {},
): KVStore {
  const promotionTtl = options.l2PromotionTtlSeconds ?? 60
  if (!l2) return l1

  const l1PutOptions = (putOptions?: { expirationTtl?: number }) => ({
    expirationTtl: Math.min(putOptions?.expirationTtl ?? promotionTtl, promotionTtl),
  })

  return {
    async get<T = string>(
      key: string,
      getOptions?: "json" | { type?: "json" | "text" },
    ): Promise<T | null> {
      const l1Hit = await l1.get<T>(key, getOptions as { type?: "json" | "text" })
      if (l1Hit !== null && l1Hit !== undefined) return l1Hit

      const raw = await l2.get<string>(key)
      if (raw === null || raw === undefined) return null
      await l1.put(key, raw, { expirationTtl: promotionTtl }).catch(() => {})
      return (getType(getOptions) === "json" ? JSON.parse(raw) : raw) as T
    },
    async put(key: string, value: string, putOptions?: { expirationTtl?: number }): Promise<void> {
      await Promise.all([
        l2.put(key, value, putOptions),
        l1.put(key, value, l1PutOptions(putOptions)).catch(() => {}),
      ])
    },
    async delete(key: string): Promise<void> {
      await Promise.all([l2.delete(key), l1.delete(key).catch(() => {})])
    },
    async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
      if (l2.list) return l2.list(options)
      return l1.list ? l1.list(options) : { keys: [] }
    },
  }
}
