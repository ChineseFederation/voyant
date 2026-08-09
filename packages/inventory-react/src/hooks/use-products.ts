"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantProductsContext } from "../provider.js"
import type { ProductsListFilters } from "../query-keys.js"
import { getProductsQueryOptions } from "../query-options.js"

export interface UseProductsOptions extends ProductsListFilters {
  enabled?: boolean
}

export function useProducts(options: UseProductsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const { enabled = true } = options

  return useQuery({
    ...getProductsQueryOptions({ baseUrl, fetcher }, options),
    enabled,
  })
}
