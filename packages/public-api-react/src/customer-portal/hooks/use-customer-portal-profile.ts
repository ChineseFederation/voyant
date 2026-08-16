"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalProfileQueryOptions } from "../query-options.js"

export interface UseCustomerPortalProfileOptions {
  enabled?: boolean
}

export function useCustomerPortalProfile(options: UseCustomerPortalProfileOptions = {}) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  return useQuery({
    ...getCustomerPortalProfileQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}
