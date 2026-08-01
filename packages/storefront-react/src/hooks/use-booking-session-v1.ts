"use client"

import { useMutation } from "@tanstack/react-query"
import {
  createVoyantStorefrontClient,
  type OwnedProductBookingTracerInput,
  type OwnedProductBookingTracerResult,
} from "@voyant-travel/storefront-sdk"

import { useVoyantStorefrontContext } from "../provider.js"

export function useOwnedProductBookingTracerV1() {
  const { baseUrl, fetcher } = useVoyantStorefrontContext()
  const client = createVoyantStorefrontClient({ baseUrl, fetcher })

  return useMutation<OwnedProductBookingTracerResult, Error, OwnedProductBookingTracerInput>({
    mutationFn: (input) => client.bookingSessionsV1.runOwnedProductTracer(input),
  })
}
