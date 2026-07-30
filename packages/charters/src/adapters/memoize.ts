/**
 * In-memory TTL cache decorator for charter adapters.
 *
 * Wraps a `CharterAdapter` so that `fetch*` reads (product / voyage / suites /
 * schedule / yacht) are cached for a short window keyed on the source ref.
 * Mutations (`createPerSuiteBooking`, `createWholeYachtBooking`) and listings
 * (`listEntries`, `listVoyagesForProduct`) always go live — caching them risks
 * staleness against upstream availability changes.
 *
 * Templates opt in by wrapping their adapter at registration time:
 *
 *   registerCharterAdapter(memoizeCharterAdapter(createConnectCharterAdapter(...), { ttlMs: 60_000 }))
 *
 * The cache is process-local. For multi-instance deployments, prefer Connect's
 * own caching (it sits closer to the source replica) over wrapping at this layer.
 */

import type { MemoizeOptions } from "@voyant-travel/charters-contracts"

import type {
  CharterAdapter,
  ExternalCharterProduct,
  ExternalCharterScheduleDay,
  ExternalCharterSuite,
  ExternalCharterVoyage,
  ExternalCharterYacht,
  SourceRef,
} from "./index.js"

// `MemoizeOptions` is a pure options contract and lives in
// `@voyant-travel/charters-contracts` so external consumers can reference it
// without a runtime dependency on this module (ADR-0002). Re-exported here so
// existing `@voyant-travel/charters` importers keep working.
export type { MemoizeOptions }

type CacheEntry<T> = { value: T; expiresAt: number }

class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>()
  constructor(
    private ttlMs: number,
    private maxEntries: number,
  ) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    // Refresh LRU order
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    if (this.maxEntries > 0 && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) this.store.delete(oldestKey)
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

function refKey(ref: SourceRef): string {
  // Stable serialization for cache lookup. Preserves connectionId + externalId
  // and any extra adapter-specific fields.
  return JSON.stringify(ref, Object.keys(ref).sort())
}

export function memoizeCharterAdapter(
  adapter: CharterAdapter,
  options: MemoizeOptions = {},
): CharterAdapter {
  const ttlMs = options.ttlMs ?? 60_000
  const maxEntries = options.maxEntries ?? 1000

  const productCache = new TTLCache<string, ExternalCharterProduct | null>(ttlMs, maxEntries)
  const voyageCache = new TTLCache<string, ExternalCharterVoyage | null>(ttlMs, maxEntries)
  const suitesCache = new TTLCache<string, ExternalCharterSuite[]>(ttlMs, maxEntries)
  const scheduleCache = new TTLCache<string, ExternalCharterScheduleDay[]>(ttlMs, maxEntries)
  const yachtCache = new TTLCache<string, ExternalCharterYacht | null>(ttlMs, maxEntries)

  return {
    name: adapter.name,
    version: adapter.version,

    // Listings always go live.
    listEntries: (opts) => adapter.listEntries(opts),
    listVoyagesForProduct: (ref) => adapter.listVoyagesForProduct(ref),

    async fetchProduct(ref) {
      const key = refKey(ref)
      const cached = productCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchProduct(ref)
      productCache.set(key, value)
      return value
    },

    async fetchVoyage(ref) {
      const key = refKey(ref)
      const cached = voyageCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchVoyage(ref)
      voyageCache.set(key, value)
      return value
    },

    async fetchVoyageSuites(ref) {
      const key = refKey(ref)
      const cached = suitesCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchVoyageSuites(ref)
      suitesCache.set(key, value)
      return value
    },

    async fetchVoyageSchedule(ref) {
      const key = refKey(ref)
      const cached = scheduleCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchVoyageSchedule(ref)
      scheduleCache.set(key, value)
      return value
    },

    async fetchYacht(ref) {
      const key = refKey(ref)
      const cached = yachtCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchYacht(ref)
      yachtCache.set(key, value)
      return value
    },

    // Bookings never cached.
    createPerSuiteBooking: (input) => adapter.createPerSuiteBooking(input),
    createWholeYachtBooking: (input) => adapter.createWholeYachtBooking(input),
  }
}
