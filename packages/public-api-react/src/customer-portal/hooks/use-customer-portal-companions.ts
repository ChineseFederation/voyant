"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalCompanionsQueryOptions } from "../query-options.js"

export interface UseCustomerPortalCompanionsOptions {
  enabled?: boolean
}

export function useCustomerPortalCompanions(options: UseCustomerPortalCompanionsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  return useQuery({
    ...getCustomerPortalCompanionsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}
