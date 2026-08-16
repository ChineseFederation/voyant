"use client"

import { useMutation } from "@tanstack/react-query"

import { applyPublicApiOffer } from "../operations.js"
import { useVoyantPublicApiContext } from "../provider.js"
import type { PublicApiOfferApplyInput } from "../schemas.js"

export function usePublicApiOfferApplyMutation(slug: string | null | undefined) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()

  return useMutation({
    mutationFn: async (input: PublicApiOfferApplyInput) => {
      if (!slug) {
        throw new Error("usePublicApiOfferApplyMutation requires a slug")
      }

      return applyPublicApiOffer({ baseUrl, fetcher }, slug, input)
    },
  })
}
