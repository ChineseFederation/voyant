"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import { getPublicApiDepartureQueryOptions } from "../query-options.js"

export interface UsePublicApiDepartureOptions {
  enabled?: boolean
}

export function usePublicApiDeparture(
  departureId: string | null | undefined,
  options: UsePublicApiDepartureOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true } = options

  return useQuery({
    ...getPublicApiDepartureQueryOptions({ baseUrl, fetcher }, departureId ?? ""),
    enabled: enabled && Boolean(departureId),
  })
}
