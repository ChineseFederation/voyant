"use client"

import { useMutation } from "@tanstack/react-query"

import { redeemPublicApiOffer } from "../operations.js"
import { useVoyantPublicApiContext } from "../provider.js"
import type { PublicApiOfferRedeemInput } from "../schemas.js"

export function usePublicApiOfferRedeemMutation() {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()

  return useMutation({
    mutationFn: async (input: PublicApiOfferRedeemInput) => {
      return redeemPublicApiOffer({ baseUrl, fetcher }, input)
    },
  })
}
