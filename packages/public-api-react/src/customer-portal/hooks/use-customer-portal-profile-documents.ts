"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalProfileDocumentsQueryOptions } from "../query-options.js"

export interface UseCustomerPortalProfileDocumentsOptions {
  enabled?: boolean
}

export function useCustomerPortalProfileDocuments(
  options: UseCustomerPortalProfileDocumentsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  return useQuery({
    ...getCustomerPortalProfileDocumentsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}
