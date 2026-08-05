"use client"

import { useQuery } from "@tanstack/react-query"

import { useCustomerPortalBookingAnalytics } from "../analytics.js"
import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalBookingQueryOptions } from "../query-options.js"

export interface UseCustomerPortalBookingOptions {
  enabled?: boolean
}

export function useCustomerPortalBooking(
  bookingId: string | null | undefined,
  options: UseCustomerPortalBookingOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  const query = useQuery({
    ...getCustomerPortalBookingQueryOptions({ baseUrl, fetcher }, bookingId ?? ""),
    enabled: enabled && Boolean(bookingId),
  })

  useCustomerPortalBookingAnalytics(query.data ? bookingId : null)

  return query
}
