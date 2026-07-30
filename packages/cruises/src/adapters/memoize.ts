/**
 * In-memory TTL cache decorator for cruise adapters.
 *
 * Wraps a `CruiseAdapter` so that `fetch*` reads (cruise/sailing/ship/itinerary/
 * pricing detail) are cached for a short window keyed on the source ref.
 * Listings always go live. The low-level `createBooking` provider SPI also
 * passes through uncached, but has no route, Tool, service, or application
 * caller; a future durable admitted command must own any use of it.
 *
 * Templates opt in by wrapping their adapter at registration time:
 *
 *   registerCruiseAdapter(memoizeCruiseAdapter(createConnectCruiseAdapter(...), { ttlMs: 60_000 }))
 *
 * The cache is process-local. For multi-instance deployments, prefer Connect's
 * own caching (it sits closer to the source replica) over wrapping at this layer.
 */

import type { MemoizeOptions } from "@voyant-travel/cruises-contracts"

import type {
  CruiseAdapter,
  ExternalCruise,
  ExternalItineraryDay,
  ExternalPriceRow,
  ExternalSailing,
  ExternalShip,
  SourceRef,
} from "./index.js"

// `MemoizeOptions` is a pure options contract and lives in
// `@voyant-travel/cruises-contracts` so external consumers can reference it
// without a runtime dependency on this module (ADR-0002). Re-exported here so
// existing `@voyant-travel/cruises` importers keep working.
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
  return JSON.stringify(sortValue(ref))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== "object") return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    out[key] = sortValue((value as Record<string, unknown>)[key])
  }
  return out
}

export function memoizeCruiseAdapter(
  adapter: CruiseAdapter,
  options: MemoizeOptions = {},
): CruiseAdapter {
  const ttlMs = options.ttlMs ?? 60_000
  const maxEntries = options.maxEntries ?? 1000

  const cruiseCache = new TTLCache<string, ExternalCruise | null>(ttlMs, maxEntries)
  const sailingCache = new TTLCache<string, ExternalSailing | null>(ttlMs, maxEntries)
  const shipCache = new TTLCache<string, ExternalShip | null>(ttlMs, maxEntries)
  const pricingCache = new TTLCache<string, ExternalPriceRow[]>(ttlMs, maxEntries)
  const itineraryCache = new TTLCache<string, ExternalItineraryDay[]>(ttlMs, maxEntries)

  return {
    name: adapter.name,
    version: adapter.version,

    // Listings always go live — too risky to serve a cached page when upstream
    // adds/removes sailings.
    listEntries: (opts) => adapter.listEntries(opts),
    listSailingsForCruise: (ref) => adapter.listSailingsForCruise(ref),
    searchProjection: (opts) => adapter.searchProjection(opts),

    async fetchCruise(ref) {
      const key = refKey(ref)
      const cached = cruiseCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchCruise(ref)
      cruiseCache.set(key, value)
      return value
    },

    async fetchSailing(ref) {
      const key = refKey(ref)
      const cached = sailingCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchSailing(ref)
      sailingCache.set(key, value)
      return value
    },

    async fetchSailingPricing(ref) {
      const key = refKey(ref)
      const cached = pricingCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchSailingPricing(ref)
      pricingCache.set(key, value)
      return value
    },

    async fetchSailingItinerary(ref) {
      const key = refKey(ref)
      const cached = itineraryCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchSailingItinerary(ref)
      itineraryCache.set(key, value)
      return value
    },

    async fetchShip(ref) {
      const key = refKey(ref)
      const cached = shipCache.get(key)
      if (cached !== undefined) return cached
      const value = await adapter.fetchShip(ref)
      shipCache.set(key, value)
      return value
    },

    // Bookings never cached.
    createBooking: (input) => adapter.createBooking(input),
  }
}
