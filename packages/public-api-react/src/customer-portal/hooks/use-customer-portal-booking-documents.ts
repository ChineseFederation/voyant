"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantCustomerPortalContext } from "../provider.js"
import { getCustomerPortalBookingDocumentsQueryOptions } from "../query-options.js"

export interface UseCustomerPortalBookingDocumentsOptions {
  enabled?: boolean
}

export function useCustomerPortalBookingDocuments(
  bookingId: string | null | undefined,
  options: UseCustomerPortalBookingDocumentsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCustomerPortalContext()
  const { enabled = true } = options

  return useQuery({
    ...getCustomerPortalBookingDocumentsQueryOptions({ baseUrl, fetcher }, bookingId ?? ""),
    enabled: enabled && Boolean(bookingId),
  })
}
