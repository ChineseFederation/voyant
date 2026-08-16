import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantCruisesContext } from "../provider.js"
import { cruisesQueryKeys, type PublicApiListFilters } from "../query-keys.js"
import { getPublicApiCruisesQueryOptions } from "../query-options.js"
import {
  cruiseSourceSchema,
  effectiveItineraryDaySchema,
  priceRecordSchema,
  searchIndexEntrySchema,
  singleEnvelope,
} from "../schemas.js"

export interface UsePublicApiCruisesOptions extends PublicApiListFilters {
  enabled?: boolean
}

/**
 * Storefront catalog browse — paginated, filterable, reads from
 * cruise_search_index on the server. Mixes local and external entries
 * with provenance markers so the UI can render an "External" badge.
 */
export function usePublicApiCruises(options: UsePublicApiCruisesOptions = {}) {
  const { baseUrl, fetcher } = useVoyantCruisesContext()
  const { enabled = true, ...filters } = options
  return useQuery({
    ...getPublicApiCruisesQueryOptions({ baseUrl, fetcher }, filters),
    enabled,
  })
}

// Cruise detail — wraps the rich storefront detail payload that includes
// the index summary plus the source-resolved cruise + sailings.
const publicApiCruiseDetailSchema = singleEnvelope(
  z.object({
    source: cruiseSourceSchema,
    sourceProvider: z.string().nullable(),
    sourceRef: z.record(z.string(), z.unknown()).nullable(),
    summary: searchIndexEntrySchema,
    cruise: z.unknown(),
    sailings: z.array(z.unknown()).optional(),
  }),
)

export type PublicApiCruiseDetail = z.infer<typeof publicApiCruiseDetailSchema>["data"]

export interface UsePublicApiCruiseOptions {
  enabled?: boolean
}

export function usePublicApiCruise(
  slug: string | null | undefined,
  options: UsePublicApiCruiseOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCruisesContext()
  const { enabled = true } = options
  return useQuery({
    queryKey: cruisesQueryKeys.publicApiCruise(slug ?? ""),
    queryFn: async (): Promise<PublicApiCruiseDetail> => {
      const result = await fetchWithValidation(
        `/v1/public/cruises/${encodeURIComponent(slug ?? "")}`,
        publicApiCruiseDetailSchema,
        { baseUrl, fetcher },
      )
      return result.data
    },
    enabled: enabled && !!slug,
  })
}

// Sailing detail — accepts both local TypeIDs and `<provider>:<ref>` keys.
const publicApiSailingSchema = singleEnvelope(
  z.object({
    source: z.union([z.literal("local"), z.literal("external")]),
    sourceProvider: z.string().optional(),
    sailing: z.unknown(),
    pricing: z.array(priceRecordSchema).optional(),
    itinerary: z.array(effectiveItineraryDaySchema).optional(),
  }),
)

export type PublicApiSailingDetail = z.infer<typeof publicApiSailingSchema>["data"]

export function usePublicApiSailing(
  key: string | null | undefined,
  options: UsePublicApiCruiseOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantCruisesContext()
  const { enabled = true } = options
  return useQuery({
    queryKey: cruisesQueryKeys.publicApiSailing(key ?? ""),
    queryFn: async (): Promise<PublicApiSailingDetail> => {
      const result = await fetchWithValidation(
        `/v1/public/cruises/sailings/${encodeURIComponent(key ?? "")}`,
        publicApiSailingSchema,
        { baseUrl, fetcher },
      )
      return result.data
    },
    enabled: enabled && !!key,
  })
}
