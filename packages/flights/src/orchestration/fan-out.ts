/**
 * Multi-connection fan-out search.
 *
 * Parallel `searchFlights` across all of an operator's flight connections
 * with per-connection timeouts, partial-success handling, and merge by
 * itinerary fingerprint. Returns a merged result set with the cheapest
 * offer per itinerary as the primary rank, alternates from other
 * connections beneath it, and a per-connection status map. Mixed currencies
 * are never compared unless a server-side presentation FX quoter normalizes
 * every offer into the shopper-selected currency.
 *
 * Implements voyant-cloud's `MergedFlightOffer` shape so consumers see the
 * same result format regardless of where the orchestration runs.
 *
 * See `docs/architecture/catalog-flights-architecture.md` §4.
 */

import {
  comparePresentationMoney,
  type NormalizePresentationMoneyOptions,
  normalizePresentationMoney,
} from "@voyant-travel/catalog/search/presentation-money"
import type {
  PresentationMoney,
  PriceRanking,
} from "@voyant-travel/catalog-contracts/presentation-money"
import type { FlightAdapterContext, FlightConnectorAdapter } from "../contract/adapter.js"
import type { FlightOffer, FlightSearchRequest } from "../contract/types.js"
import { itineraryFingerprint } from "./fingerprint.js"

/**
 * One source's result — the primary offer plus alternates from other
 * connections selling the same flight.
 */
export interface MergedFlightOffer {
  itineraryFingerprint: string
  /**
   * Cheapest offer when `priceRanking` is ranked; stable first-provider offer
   * when FX is unavailable. The property name is retained for compatibility.
   */
  cheapest: FlightOffer
  /** Native + shopper-selected money for `cheapest`, when presentation succeeded. */
  cheapestPresentationPrice?: PresentationMoney
  /** Other offers, price-sorted only when `priceRanking` is ranked. */
  alternates: FlightOffer[]
  /** Presentation prices aligned by index with `alternates`. */
  alternatePresentationPrices?: Array<PresentationMoney | undefined>
  /** Connection ids that returned an offer for this itinerary. */
  sourceConnectionIds: string[]
}

/**
 * Per-connection status, returned alongside the merged offers so callers
 * can surface "X provider timed out" without losing the rest of the results.
 */
export type ConnectionSearchStatus = "ok" | "timeout" | "error" | "not_found" | "capability_missing"

export interface ConnectionResult {
  connectionId: string
  status: ConnectionSearchStatus
  count: number
  latencyMs: number
  errorMessage?: string
}

export interface FanOutFlightSearchOptions {
  /** Adapters to fan out across. Each carries its own connectionId in capabilities. */
  adapters: ReadonlyArray<{
    connectionId: string
    adapter: FlightConnectorAdapter
    /** Optional override for the adapter context per connection. */
    context?: Partial<FlightAdapterContext>
  }>
  request: FlightSearchRequest
  /**
   * Per-connection timeout. Default 5000ms. One slow provider doesn't
   * tank the whole search — its slot is reported as `timeout` and other
   * results return on time.
   */
  perConnectionTimeoutMs?: number
  /**
   * Optional caller-supplied limit on the merged offer count. The fan-out
   * still queries every connection in full; this caps the merged result.
   */
  limit?: number
  /** Server-side display FX configuration. Credentials stay behind `quoteFx`. */
  presentation?: NormalizePresentationMoneyOptions
}

export interface FanOutFlightSearchResult {
  offers: MergedFlightOffer[]
  perConnection: ConnectionResult[]
  /** Explicitly fails closed when a mixed-currency page cannot be normalized. */
  priceRanking?: PriceRanking
}

/**
 * Fan out a flight search across an operator's connections, parallelized
 * with per-connection timeout, then merge by itinerary fingerprint.
 *
 * Partial-success semantics: connections that time out / error / report
 * capability-missing are flagged in `perConnection`; the orchestration
 * still returns whatever responding connections produced.
 */
export async function fanOutFlightSearch(
  options: FanOutFlightSearchOptions,
): Promise<FanOutFlightSearchResult> {
  const timeoutMs = options.perConnectionTimeoutMs ?? 5000

  const settled = await Promise.all(
    options.adapters.map(async ({ connectionId, adapter, context }) => {
      const start = Date.now()
      try {
        // Capability check up front. If the adapter declares a max-slices
        // limit and the request exceeds it, fail fast as `capability_missing`.
        const max = adapter.capabilities.maxSlicesPerSearch
        if (max != null && options.request.slices.length > max) {
          return {
            connectionId,
            status: "capability_missing" as const,
            offers: [] as FlightOffer[],
            latencyMs: Date.now() - start,
            errorMessage: `Connection supports max ${max} slices; request had ${options.request.slices.length}`,
          }
        }

        const ctx: FlightAdapterContext = { connectionId, ...context }
        const response = await withTimeout(
          adapter.searchFlights(ctx, options.request),
          timeoutMs,
          `connection ${connectionId} timed out after ${timeoutMs}ms`,
        )
        return {
          connectionId,
          status: "ok" as const,
          offers: response.offers,
          latencyMs: Date.now() - start,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const isTimeout = message.includes("timed out")
        return {
          connectionId,
          status: isTimeout ? ("timeout" as const) : ("error" as const),
          offers: [] as FlightOffer[],
          latencyMs: Date.now() - start,
          errorMessage: message,
        }
      }
    }),
  )

  // Build per-connection status report.
  const perConnection: ConnectionResult[] = settled.map((r) => ({
    connectionId: r.connectionId,
    status: r.status,
    count: r.offers.length,
    latencyMs: r.latencyMs,
    errorMessage: r.errorMessage,
  }))

  const flatOffers = settled.flatMap((result) => result.offers)
  const presentation = await normalizePresentationMoney(
    flatOffers.map((offer) => offer.totalPrice),
    options.presentation,
  )
  const presentedByOffer = new Map<FlightOffer, PresentationMoney>()
  for (const [index, price] of presentation.prices.entries()) {
    const offer = flatOffers[index]
    if (offer && price) presentedByOffer.set(offer, price)
  }
  const canRank =
    presentation.ranking.status === "ranked_native" ||
    presentation.ranking.status === "ranked_presentation"

  // Group offers by itinerary fingerprint, building MergedFlightOffer per group.
  const merged = mergeByFingerprint(settled, presentedByOffer, canRank)

  // Only sort when every compared amount is in one proven currency.
  if (canRank) {
    merged.sort((a, b) => {
      if (!a.cheapestPresentationPrice || !b.cheapestPresentationPrice) return 0
      return comparePresentationMoney(a.cheapestPresentationPrice, b.cheapestPresentationPrice)
    })
  }

  const limited = options.limit != null ? merged.slice(0, options.limit) : merged

  return { offers: limited, perConnection, priceRanking: presentation.ranking }
}

interface ConnectionFanOutOk {
  connectionId: string
  offers: FlightOffer[]
}

function mergeByFingerprint(
  results: ReadonlyArray<{ connectionId: string; offers: FlightOffer[] }>,
  presentedByOffer: ReadonlyMap<FlightOffer, PresentationMoney>,
  canRank: boolean,
): MergedFlightOffer[] {
  const buckets = new Map<
    string,
    {
      offers: Array<{ connectionId: string; offer: FlightOffer }>
      sourceConnectionIds: Set<string>
    }
  >()

  for (const { connectionId, offers } of results) {
    for (const offer of offers) {
      const key = itineraryFingerprint(offer)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.offers.push({ connectionId, offer })
        bucket.sourceConnectionIds.add(connectionId)
      } else {
        buckets.set(key, {
          offers: [{ connectionId, offer }],
          sourceConnectionIds: new Set([connectionId]),
        })
      }
    }
  }

  const merged: MergedFlightOffer[] = []
  for (const [fingerprint, bucket] of buckets) {
    // Sort only after all offers have one comparable presentation currency.
    if (canRank) {
      bucket.offers.sort((a, b) => {
        const left = presentedByOffer.get(a.offer)
        const right = presentedByOffer.get(b.offer)
        if (!left || !right) return 0
        return comparePresentationMoney(left, right)
      })
    }
    const cheapestEntry = bucket.offers[0]
    if (!cheapestEntry) continue
    const alternateEntries = bucket.offers.slice(1)
    merged.push({
      itineraryFingerprint: fingerprint,
      cheapest: cheapestEntry.offer,
      cheapestPresentationPrice: presentedByOffer.get(cheapestEntry.offer),
      alternates: alternateEntries.map((entry) => entry.offer),
      alternatePresentationPrices: alternateEntries.map((entry) =>
        presentedByOffer.get(entry.offer),
      ),
      sourceConnectionIds: Array.from(bucket.sourceConnectionIds),
    })
  }
  return merged
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

// Re-export the fan-out result variant types used by orchestration consumers.
export type { ConnectionFanOutOk }
