"use client"

import { useMutation } from "@tanstack/react-query"

import { previewPublicApiDeparturePrice } from "../operations.js"
import { useVoyantPublicApiContext } from "../provider.js"
import type { PublicApiDeparturePricePreviewInput } from "../schemas.js"

export function usePublicApiDeparturePricePreviewMutation(departureId: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()

  return useMutation({
    mutationFn: async (input: PublicApiDeparturePricePreviewInput) => {
      if (!departureId) {
        throw new Error("usePublicApiDeparturePricePreviewMutation requires a departureId")
      }

      return previewPublicApiDeparturePrice({ baseUrl, fetcher }, departureId, input)
    },
  })
}
