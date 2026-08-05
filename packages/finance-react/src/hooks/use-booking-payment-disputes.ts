"use client"

import { useQuery } from "@tanstack/react-query"

import { defaultFetcher } from "../client.js"
import { useOptionalVoyantFinanceContext } from "../provider.js"
import { getBookingPaymentDisputesQueryOptions } from "../query-options.js"

export interface UseBookingPaymentDisputesOptions {
  enabled?: boolean
}

/**
 * The booking's card disputes (voyant#4289).
 *
 * A contested payment still reads `paid` everywhere else, so this is the read
 * that tells a cleanly paid booking from one whose money is being taken back.
 *
 * Uses the *optional* finance context. `BookingDisputeBanner` renders on the
 * booking detail page whether or not the host asked for it, and a host that has
 * not mounted `VoyantFinanceProvider` should get no banner rather than a crashed
 * page. Every other finance hook here stays strict — they are the point of the
 * screen they are on, so a missing provider there is worth failing loudly.
 */
export function useBookingPaymentDisputes(
  bookingId: string | null | undefined,
  options: UseBookingPaymentDisputesOptions = {},
) {
  const context = useOptionalVoyantFinanceContext()
  const { enabled = true } = options

  return useQuery({
    ...getBookingPaymentDisputesQueryOptions(
      // Placeholders only: the query below is disabled without a context, so
      // neither is ever used to build a request.
      { baseUrl: context?.baseUrl ?? "", fetcher: context?.fetcher ?? defaultFetcher },
      bookingId,
    ),
    enabled: enabled && Boolean(bookingId) && Boolean(context),
  })
}
