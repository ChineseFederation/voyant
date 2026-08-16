"use client"

import { useQuery } from "@tanstack/react-query"

import { useVoyantPublicApiContext } from "../provider.js"
import { getPublicApiSettingsQueryOptions } from "../query-options.js"

export interface UsePublicApiSettingsOptions {
  enabled?: boolean
}

export function usePublicApiSettings(options: UsePublicApiSettingsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true } = options

  return useQuery({
    ...getPublicApiSettingsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}
