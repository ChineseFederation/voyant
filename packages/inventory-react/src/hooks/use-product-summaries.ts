"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantProductsContext } from "../provider.js"
import type { ProductsListFilters } from "../query-keys.js"
import { getProductSummariesQueryOptions } from "../query-options.js"

export interface UseProductSummariesOptions extends ProductsListFilters {
  enabled?: boolean
}

export function useProductSummaries(options: UseProductSummariesOptions = {}) {
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const { enabled = true } = options

  return useQuery({
    ...getProductSummariesQueryOptions({ baseUrl, fetcher }, options),
    enabled,
  })
}
