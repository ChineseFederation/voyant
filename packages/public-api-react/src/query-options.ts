"use client"

import { queryOptions } from "@tanstack/react-query"

import type { FetchWithValidationOptions } from "./client.js"
import {
  getAdminPublicApiSettings,
  getPublicApiDeparture,
  getPublicApiDepartureItinerary,
  getPublicApiOfferBySlug,
  getPublicApiSettings,
  listPublicApiMarkets,
  listPublicApiProductDepartures,
  listPublicApiProductExtensions,
  listPublicApiProductOffers,
} from "./operations.js"
import {
  type PublicApiDepartureFilters,
  type PublicApiDepartureItineraryFilters,
  type PublicApiExtensionsFilters,
  type PublicApiOfferFilters,
  publicApiQueryKeys,
} from "./query-keys.js"

export function getPublicApiSettingsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: publicApiQueryKeys.settings(),
    queryFn: () => getPublicApiSettings(client),
  })
}

export function getPublicApiMarketsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: publicApiQueryKeys.markets(),
    queryFn: () => listPublicApiMarkets(client),
    // Markets change rarely and the endpoint is edge-cached (s-maxage=300);
    // hold results for five minutes to avoid re-fetching on every mount.
    staleTime: 5 * 60_000,
  })
}

export function getAdminPublicApiSettingsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: publicApiQueryKeys.adminSettings(),
    queryFn: () => getAdminPublicApiSettings(client),
  })
}

export function getPublicApiDepartureQueryOptions(
  client: FetchWithValidationOptions,
  departureId: string,
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.departure(departureId),
    queryFn: () => getPublicApiDeparture(client, departureId),
  })
}

export function getPublicApiProductDeparturesQueryOptions(
  client: FetchWithValidationOptions,
  productId: string,
  filters: PublicApiDepartureFilters = {},
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.productDepartures(productId, filters),
    queryFn: () => listPublicApiProductDepartures(client, productId, filters),
  })
}

export function getPublicApiDepartureItineraryQueryOptions(
  client: FetchWithValidationOptions,
  productId: string,
  departureId: string,
  filters: PublicApiDepartureItineraryFilters = {},
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.departureItinerary(productId, departureId, filters),
    queryFn: () => getPublicApiDepartureItinerary(client, productId, departureId, filters),
  })
}

export function getPublicApiProductExtensionsQueryOptions(
  client: FetchWithValidationOptions,
  productId: string,
  filters: PublicApiExtensionsFilters = {},
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.productExtensions(productId, filters),
    queryFn: () => listPublicApiProductExtensions(client, productId, filters),
  })
}

export function getPublicApiProductOffersQueryOptions(
  client: FetchWithValidationOptions,
  productId: string,
  filters: PublicApiOfferFilters = {},
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.productOffers(productId, filters),
    queryFn: () => listPublicApiProductOffers(client, productId, filters),
  })
}

export function getPublicApiOfferQueryOptions(
  client: FetchWithValidationOptions,
  slug: string,
  locale?: string,
) {
  return queryOptions({
    queryKey: publicApiQueryKeys.offer(slug, locale),
    queryFn: () => getPublicApiOfferBySlug(client, slug, locale ? { locale } : undefined),
  })
}

export type {
  PublicApiDepartureFilters,
  PublicApiExtensionsFilters,
  PublicApiOfferFilters,
} from "./query-keys.js"
