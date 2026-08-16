"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import { getPublicApiOfferQueryOptions } from "../query-options.js"

export interface UsePublicApiOfferOptions {
  enabled?: boolean
  locale?: string
}

export function usePublicApiOffer(
  slug: string | null | undefined,
  options: UsePublicApiOfferOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true, locale } = options

  return useQuery({
    ...getPublicApiOfferQueryOptions({ baseUrl, fetcher }, slug ?? "", locale),
    enabled: enabled && Boolean(slug),
  })
}
