"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalBookingBillingContactQueryOptions } from "../query-options.js"

export interface UseCustomerPortalBookingBillingContactOptions {
  enabled?: boolean
}

export function useCustomerPortalBookingBillingContact(
  bookingId: string | null | undefined,
  options: UseCustomerPortalBookingBillingContactOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  return useQuery({
    ...getCustomerPortalBookingBillingContactQueryOptions({ baseUrl, fetcher }, bookingId ?? ""),
    enabled: enabled && Boolean(bookingId),
  })
}
