"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import type { PublicApiDepartureItineraryFilters } from "../query-keys.js"
import { getPublicApiDepartureItineraryQueryOptions } from "../query-options.js"

export interface UsePublicApiDepartureItineraryOptions {
  enabled?: boolean
  filters?: PublicApiDepartureItineraryFilters
}

export function usePublicApiDepartureItinerary(
  productId: string | null | undefined,
  departureId: string | null | undefined,
  options: UsePublicApiDepartureItineraryOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true, filters = {} } = options

  return useQuery({
    ...getPublicApiDepartureItineraryQueryOptions(
      { baseUrl, fetcher },
      productId ?? "",
      departureId ?? "",
      filters,
    ),
    enabled: enabled && Boolean(productId) && Boolean(departureId),
  })
}
