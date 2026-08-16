"use client"

import { useQuery } from "@tanstack/react-query"

import { useCustomerPortalSessionAnalytics } from "../analytics.js"
import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalBookingsQueryOptions } from "../query-options.js"

export interface UseCustomerPortalBookingsOptions {
  enabled?: boolean
}

export function useCustomerPortalBookings(options: UseCustomerPortalBookingsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  const query = useQuery({
    ...getCustomerPortalBookingsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })

  // The portal's first successful read is what a portal session is.
  useCustomerPortalSessionAnalytics(query.data?.data.length)

  return query
}
