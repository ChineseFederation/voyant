"use client"

import { useQuery } from "@tanstack/react-query"

import { defaultFetcher } from "../client.js"
import { useOptionalVoyantFinanceContext } from "../provider.js"
import { getBookingRefundSettlementsQueryOptions } from "../query-options.js"

export interface UseBookingRefundSettlementsOptions {
  enabled?: boolean
}

/**
 * How the booking's refunds were actually paid, and which are still owed
 * (voyant#4303).
 *
 * An issued credit note reads exactly the same whether or not anyone paid it,
 * so this is the only read that can tell a refunded booking from one that still
 * owes somebody money.
 *
 * Uses the *optional* finance context, for the same reason
 * `useBookingPaymentDisputes` does: `BookingRefundBanner` renders on the booking
 * detail page whether or not the host asked for it, and a host that has not
 * mounted `VoyantFinanceProvider` should get no banner rather than a crashed
 * page.
 */
export function useBookingRefundSettlements(
  bookingId: string | null | undefined,
  options: UseBookingRefundSettlementsOptions = {},
) {
  const context = useOptionalVoyantFinanceContext()
  const { enabled = true } = options

  return useQuery({
    ...getBookingRefundSettlementsQueryOptions(
      // Placeholders only: the query below is disabled without a context, so
      // neither is ever used to build a request.
      { baseUrl: context?.baseUrl ?? "", fetcher: context?.fetcher ?? defaultFetcher },
      bookingId,
    ),
    enabled: enabled && Boolean(bookingId) && Boolean(context),
  })
}
