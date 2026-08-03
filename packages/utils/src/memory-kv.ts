import type { KVStore } from "./cache.js"

export type KvValueType = "text" | "json"

export interface KvGetOptions {
  type?: KvValueType
}

export interface KvPutOptions {
  /** TTL in seconds. The entry is treated as absent once it elapses. */
  expirationTtl?: number
}

/** Minimal KV surface consumed across Voyant packages. */
export interface KvNamespaceShim extends KVStore {
  get(key: string): Promise<string | null>
  get<T = unknown>(key: string, type: "json"): Promise<T | null>
  get<T = unknown>(key: string, options: KvGetOptions): Promise<T | string | null>
}

export interface MemoryKvOptions {
  /**
   * Cap on resident entries before least-recently-used eviction. Defaults to
   * 10,000. Set `0` to disable eviction.
   */
  maxEntries?: number
  /** Injectable clock (ms) for deterministic TTL tests. Defaults to `Date.now`. */
  now?: () => number
}

interface Entry {
  value: string
  /** Absolute expiry (ms), or `Infinity` for no TTL. */
  expiresAt: number
}

const DEFAULT_MAX_ENTRIES = 10_000

export function createMemoryKvNamespace(options: MemoryKvOptions = {}): KvNamespaceShim {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const now = options.now ?? Date.now
  const map = new Map<string, Entry>()

  function readFresh(key: string): string | null {
    const entry = map.get(key)
    if (!entry) return null
    if (entry.expiresAt <= now()) {
      map.delete(key)
      return null
    }
    map.delete(key)
    map.set(key, entry)
    return entry.value
  }

  function writeEntry(key: string, value: string, expirationTtl: number | undefined): void {
    if (map.has(key)) map.delete(key)
    const expiresAt =
      expirationTtl === undefined ? Number.POSITIVE_INFINITY : now() + expirationTtl * 1000
    map.set(key, { value, expiresAt })
    if (maxEntries > 0) {
      while (map.size > maxEntries) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    }
  }

  async function get(
    key: string,
    typeOrOptions?: "json" | KvGetOptions,
  ): Promise<string | null | unknown> {
    const type = typeof typeOrOptions === "string" ? typeOrOptions : (typeOrOptions?.type ?? "text")
    const raw = readFresh(key)
    if (raw === null) return null
    return type === "json" ? JSON.parse(raw) : raw
  }

  return {
    get: get as KvNamespaceShim["get"],
    async put(key: string, value: string, putOptions?: KvPutOptions): Promise<void> {
      writeEntry(key, value, putOptions?.expirationTtl)
    },
    async putIfAbsent(key: string, value: string, putOptions?: KvPutOptions): Promise<boolean> {
      // Atomic by construction: a single-threaded isolate cannot interleave
      // another caller between this read and the write, because neither awaits.
      if (readFresh(key) !== null) return false
      writeEntry(key, value, putOptions?.expirationTtl)
      return true
    },
    async delete(key: string): Promise<void> {
      map.delete(key)
    },
    async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
      const prefix = options?.prefix ?? ""
      const keys: Array<{ name: string }> = []
      for (const key of [...map.keys()]) {
        if (readFresh(key) !== null && key.startsWith(prefix)) {
          keys.push({ name: key })
        }
      }
      return { keys }
    },
  }
}
