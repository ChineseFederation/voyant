"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import {
  getPublicApiProductOffersQueryOptions,
  type PublicApiOfferFilters,
} from "../query-options.js"

export interface UsePublicApiProductOffersOptions extends PublicApiOfferFilters {
  enabled?: boolean
}

export function usePublicApiProductOffers(
  productId: string | null | undefined,
  options: UsePublicApiProductOffersOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    ...getPublicApiProductOffersQueryOptions({ baseUrl, fetcher }, productId ?? "", filters),
    enabled: enabled && Boolean(productId),
  })
}
