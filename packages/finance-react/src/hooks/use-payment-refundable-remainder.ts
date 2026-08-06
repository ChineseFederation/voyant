"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantFinanceContext } from "../provider.js"
import { getPaymentRefundableRemainderQueryOptions } from "../query-options.js"

export interface UsePaymentRefundableRemainderOptions {
  enabled?: boolean
}

/**
 * How much of a payment may still be refunded (voyant#4303).
 *
 * Not "paid minus refunded": a refund that is pending is subtracted too, so
 * this shrinks the moment a bank transfer is started or a processor reversal is
 * accepted-but-unconfirmed. That is deliberate — the alternative is an operator
 * being shown headroom that a refund already in flight has spoken for, and
 * refunding the same money twice.
 */
export function usePaymentRefundableRemainder(
  paymentId: string | null | undefined,
  options: UsePaymentRefundableRemainderOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const { enabled = true } = options

  return useQuery({
    ...getPaymentRefundableRemainderQueryOptions({ baseUrl, fetcher }, paymentId),
    enabled: enabled && Boolean(paymentId),
  })
}
