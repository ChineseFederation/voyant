"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantFlightsContext } from "../provider.js"
import { getServedMarketsQueryOptions } from "../query-options.js"

export interface UseServedMarketsOptions {
  enabled?: boolean
  /** TanStack Query stale time. Default 1 hour — a network doesn't move often. */
  staleTime?: number
}

/**
 * GET `/v1/admin/flights/served-markets` — the airports the connector sells.
 *
 * Use it to *order* an airport list, never to restrict one. A connector that
 * doesn't declare `flight/served-markets` answers 501, which is the normal
 * case, not a failure: read `isCapabilityMissing` and fall back to the plain
 * reference list.
 */
export function useServedMarkets(options: UseServedMarketsOptions = {}) {
  const client = useVoyantFlightsContext()
  const { enabled = true, staleTime = 60 * 60_000 } = options
  const query = useQuery({
    ...getServedMarketsQueryOptions(client),
    enabled,
    staleTime,
  })

  const status = (query.error as { status?: number } | null | undefined)?.status
  return { ...query, isCapabilityMissing: status === 501 }
}
