"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import {
  getPublicApiProductDeparturesQueryOptions,
  type PublicApiDepartureFilters,
} from "../query-options.js"

export interface UsePublicApiProductDeparturesOptions extends PublicApiDepartureFilters {
  enabled?: boolean
}

export function usePublicApiProductDepartures(
  productId: string | null | undefined,
  options: UsePublicApiProductDeparturesOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    ...getPublicApiProductDeparturesQueryOptions({ baseUrl, fetcher }, productId ?? "", filters),
    enabled: enabled && Boolean(productId),
  })
}
