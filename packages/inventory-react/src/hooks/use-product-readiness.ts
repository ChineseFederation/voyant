"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantProductsContext } from "../provider.js"
import { getProductReadinessQueryOptions } from "../query-options.js"

export interface UseProductReadinessOptions {
  enabled?: boolean
}

/**
 * Current publish readiness for a product. Backed by the same evaluation the
 * publish gate runs, so what the operator sees and what a refused publish says
 * cannot drift apart.
 */
export function useProductReadiness(
  productId: string | null | undefined,
  options: UseProductReadinessOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantProductsContext()
  const { enabled = true } = options

  return useQuery({
    ...getProductReadinessQueryOptions({ baseUrl, fetcher }, productId),
    enabled: enabled && Boolean(productId),
  })
}
