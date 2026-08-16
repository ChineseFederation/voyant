"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantLegalContext } from "../provider.js"
import { getLegalBookingContractReviewQueryOptions } from "../query-options.js"

export interface UseLegalBookingContractReviewOptions {
  contractId: string
  enabled?: boolean
}

/**
 * The un-redacted review of one managed booking-contract revision. Only
 * managed booking contracts have one — everything else 404s, which is the
 * signal the generic lifecycle applies.
 */
export function useLegalBookingContractReview(options: UseLegalBookingContractReviewOptions) {
  const { baseUrl, fetcher } = useVoyantLegalContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    ...getLegalBookingContractReviewQueryOptions({ baseUrl, fetcher }, filters),
    enabled,
  })
}
