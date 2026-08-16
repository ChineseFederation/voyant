"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import {
  getPublicApiProductExtensionsQueryOptions,
  type PublicApiExtensionsFilters,
} from "../query-options.js"

export interface UsePublicApiProductExtensionsOptions extends PublicApiExtensionsFilters {
  enabled?: boolean
}

export function usePublicApiProductExtensions(
  productId: string | null | undefined,
  options: UsePublicApiProductExtensionsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    ...getPublicApiProductExtensionsQueryOptions({ baseUrl, fetcher }, productId ?? "", filters),
    enabled: enabled && Boolean(productId),
  })
}
