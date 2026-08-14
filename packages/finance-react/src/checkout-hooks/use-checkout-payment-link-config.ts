"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantFinanceContext } from "../provider.js"

export interface CheckoutPaymentLinkConfig {
  paymentLinkUrlTemplate?: string | null
  publicCheckoutBaseUrl?: string | null
  bankTransfer: {
    provider?: string | null
    beneficiary: string
    iban: string
    bankName?: string | null
    currency?: string | null
    notes?: string | null
  } | null
}

interface ConfigResponse {
  data: CheckoutPaymentLinkConfig
}

/**
 * Fetch the template-side bank-transfer block for the public payment-link
 * landing page. Templates expose this at
 * `/v1/public/payment-link-config` (added to `publicPaths`); when the
 * endpoint is unavailable or unconfigured, callers fall back to hiding
 * the bank-transfer tab.
 */
export function useCheckoutPaymentLinkConfig() {
  const { baseUrl, fetcher } = useVoyantFinanceContext()

  return useQuery({
    queryKey: ["checkout-payment-link-config"],
    queryFn: async (): Promise<CheckoutPaymentLinkConfig> => {
      const response = await fetcher(`${baseUrl}/v1/public/payment-link-config`, {
        headers: { Accept: "application/json" },
      })
      if (!response.ok) throw new Error(`config fetch failed: ${response.status}`)
      const body = (await response.json()) as ConfigResponse
      return body.data
    },
    staleTime: 5 * 60 * 1000,
  })
}
