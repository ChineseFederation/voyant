/**
 * TanStack `queryOptions()` factories for the cruises module.
 *
 * Hooks under `./hooks/` wrap these so they can be used both inside React
 * components and outside (SSR loaders, route preloads, framework adapters).
 * Each factory takes a `FetchWithValidationOptions` instead of reading from
 * context — the hook provides that, but a server loader can pass it in
 * directly.
 */

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import {
  type CruisesListFilters,
  cruisesQueryKeys,
  type PricesListFilters,
  type PublicApiListFilters,
  type SailingsListFilters,
  type ShipsListFilters,
} from "./query-keys.js"
import {
  adminCruiseListResponse,
  cabinCategoryListResponse,
  cabinListResponse,
  cruiseSingleResponse,
  deckListResponse,
  effectiveItineraryResponse,
  enrichmentListResponse,
  priceListResponse,
  sailingListResponse,
  sailingSingleResponse,
  searchIndexListResponse,
  shipListResponse,
  shipSingleResponse,
} from "./schemas.js"

// ---------- helpers ----------

function buildQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue
    search.set(k, String(v))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

// ---------- cruises ----------

export function getCruisesQueryOptions(
  client: FetchWithValidationOptions,
  filters: CruisesListFilters = {},
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.cruisesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/cruises${buildQueryString(filters as Record<string, unknown>)}`,
        adminCruiseListResponse,
        client,
      ),
  })
}

export function getCruiseQueryOptions(
  client: FetchWithValidationOptions,
  key: string,
  options: { include?: ReadonlyArray<"sailings" | "days"> } = {},
) {
  const include = options.include ?? []
  const qs = include.length > 0 ? `?include=${include.join(",")}` : ""
  return queryOptions({
    queryKey: cruisesQueryKeys.cruise(key, include),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/${encodeURIComponent(key)}${qs}`,
        cruiseSingleResponse,
        client,
      )
      return result.data
    },
  })
}

// ---------- sailings ----------

export function getSailingsQueryOptions(
  client: FetchWithValidationOptions,
  filters: SailingsListFilters = {},
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.sailingsList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/cruises/sailings${buildQueryString(filters as Record<string, unknown>)}`,
        sailingListResponse,
        client,
      ),
  })
}

export function getSailingQueryOptions(
  client: FetchWithValidationOptions,
  key: string,
  options: { include?: ReadonlyArray<"pricing" | "itinerary"> } = {},
) {
  const include = options.include ?? []
  const qs = include.length > 0 ? `?include=${include.join(",")}` : ""
  return queryOptions({
    queryKey: cruisesQueryKeys.sailing(key, include),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/sailings/${encodeURIComponent(key)}${qs}`,
        sailingSingleResponse,
        client,
      )
      return result.data
    },
  })
}

export function getEffectiveItineraryQueryOptions(
  client: FetchWithValidationOptions,
  sailingKey: string,
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.sailingItinerary(sailingKey),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/sailings/${encodeURIComponent(sailingKey)}/itinerary`,
        effectiveItineraryResponse,
        client,
      )
      return result.data
    },
  })
}

// ---------- ships ----------

export function getShipsQueryOptions(
  client: FetchWithValidationOptions,
  filters: ShipsListFilters = {},
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.shipsList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/cruises/ships${buildQueryString(filters as Record<string, unknown>)}`,
        shipListResponse,
        client,
      ),
  })
}

export function getShipQueryOptions(client: FetchWithValidationOptions, key: string) {
  return queryOptions({
    queryKey: cruisesQueryKeys.ship(key),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/ships/${encodeURIComponent(key)}`,
        shipSingleResponse,
        client,
      )
      return result.data
    },
  })
}

export function getShipDecksQueryOptions(client: FetchWithValidationOptions, key: string) {
  return queryOptions({
    queryKey: cruisesQueryKeys.shipDecks(key),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/ships/${encodeURIComponent(key)}/decks`,
        deckListResponse,
        client,
      )
      return result.data
    },
  })
}

export function getShipCategoriesQueryOptions(client: FetchWithValidationOptions, key: string) {
  return queryOptions({
    queryKey: cruisesQueryKeys.shipCategories(key),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/ships/${encodeURIComponent(key)}/categories`,
        cabinCategoryListResponse,
        client,
      )
      return result.data
    },
  })
}

export function getCategoryCabinsQueryOptions(
  client: FetchWithValidationOptions,
  categoryId: string,
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.categoryCabins(categoryId),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/categories/${encodeURIComponent(categoryId)}/cabins`,
        cabinListResponse,
        client,
      )
      return result.data
    },
  })
}

// ---------- pricing ----------

export function getPricesQueryOptions(
  client: FetchWithValidationOptions,
  filters: PricesListFilters = {},
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.pricesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/cruises/prices${buildQueryString(filters as Record<string, unknown>)}`,
        priceListResponse,
        client,
      ),
  })
}

// ---------- enrichment programs ----------

export function getEnrichmentProgramsQueryOptions(
  client: FetchWithValidationOptions,
  cruiseKey: string,
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.enrichment(cruiseKey),
    queryFn: async () => {
      const result = await fetchWithValidation(
        `/v1/admin/cruises/${encodeURIComponent(cruiseKey)}/enrichment`,
        enrichmentListResponse,
        client,
      )
      return result.data
    },
  })
}

// ---------- storefront (public) ----------

export function getPublicApiCruisesQueryOptions(
  client: FetchWithValidationOptions,
  filters: PublicApiListFilters = {},
) {
  return queryOptions({
    queryKey: cruisesQueryKeys.publicApiList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/public/cruises${buildQueryString(filters as Record<string, unknown>)}`,
        searchIndexListResponse,
        client,
      ),
  })
}
