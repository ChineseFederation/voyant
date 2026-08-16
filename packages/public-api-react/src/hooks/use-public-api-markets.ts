"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import { getPublicApiMarketsQueryOptions } from "../query-options.js"

export interface UsePublicApiMarketsOptions {
  enabled?: boolean
}

/**
 * Fetches the anonymous market discovery list (`GET /v1/public/markets`,
 * voyant#2643). Each market carries its supported locales and currencies so a
 * storefront can render a market/currency/locale scope selector. The market
 * `id` is the catalog-search scope key.
 */
export function usePublicApiMarkets(options: UsePublicApiMarketsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true } = options

  return useQuery({
    ...getPublicApiMarketsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}
