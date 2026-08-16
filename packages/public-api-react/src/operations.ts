"use client"

import { type FetchWithValidationOptions, fetchWithValidation, withQueryParams } from "./client.js"
import {
  type PublicApiDepartureItineraryQuery,
  type PublicApiDepartureListQuery,
  type PublicApiDeparturePricePreviewInput,
  type PublicApiOfferApplyInput,
  type PublicApiOfferRedeemInput,
  type PublicApiProductExtensionsQuery,
  type PublicApiPromotionalOfferListQuery,
  type PublicApiSettingsPatchInput,
  publicApiDepartureItineraryQuerySchema,
  publicApiDepartureItineraryResponseSchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDeparturePricePreviewResponseSchema,
  publicApiDepartureResponseSchema,
  publicApiMarketsResponseSchema,
  publicApiOfferApplyInputSchema,
  publicApiOfferMutationResponseSchema,
  publicApiOfferRedeemInputSchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListResponseSchema,
  publicApiPromotionalOfferResponseSchema,
  publicApiSettingsPatchSchema,
  publicApiSettingsResponseSchema,
} from "./schemas.js"

export function getPublicApiSettings(client: FetchWithValidationOptions) {
  return fetchWithValidation("/v1/public/settings", publicApiSettingsResponseSchema, client)
}

/**
 * Anonymous market discovery (voyant#2643). Lists the active markets — with
 * their supported locales and currencies — so a storefront can present a
 * market/currency/locale scope selector. The returned market `id` is the
 * catalog-search scope key (thread it into catalog search as `market`).
 */
export function listPublicApiMarkets(client: FetchWithValidationOptions) {
  return fetchWithValidation("/v1/public/markets", publicApiMarketsResponseSchema, client)
}

export function getAdminPublicApiSettings(client: FetchWithValidationOptions) {
  return fetchWithValidation(
    "/v1/admin/public-api/settings",
    publicApiSettingsResponseSchema,
    client,
  )
}

export function updateAdminPublicApiSettings(
  client: FetchWithValidationOptions,
  input: PublicApiSettingsPatchInput,
) {
  const parsed = publicApiSettingsPatchSchema.parse(input)

  return fetchWithValidation(
    "/v1/admin/public-api/settings",
    publicApiSettingsResponseSchema,
    client,
    { method: "PATCH", body: JSON.stringify(parsed) },
  )
}

export function getPublicApiDeparture(client: FetchWithValidationOptions, departureId: string) {
  return fetchWithValidation(
    `/v1/public/departures/${departureId}`,
    publicApiDepartureResponseSchema,
    client,
  )
}

export function listPublicApiProductDepartures(
  client: FetchWithValidationOptions,
  productId: string,
  query?: PublicApiDepartureListQuery,
) {
  return fetchWithValidation(
    withQueryParams(`/v1/public/products/${productId}/departures`, query),
    publicApiDepartureListResponseSchema,
    client,
  )
}

export function previewPublicApiDeparturePrice(
  client: FetchWithValidationOptions,
  departureId: string,
  input: PublicApiDeparturePricePreviewInput,
) {
  const parsed = publicApiDeparturePricePreviewInputSchema.parse(input)

  return fetchWithValidation(
    `/v1/public/departures/${departureId}/price`,
    publicApiDeparturePricePreviewResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(parsed) },
  )
}

export function listPublicApiProductExtensions(
  client: FetchWithValidationOptions,
  productId: string,
  query?: PublicApiProductExtensionsQuery,
) {
  return fetchWithValidation(
    withQueryParams(`/v1/public/products/${productId}/extensions`, query),
    publicApiProductExtensionsResponseSchema,
    client,
  )
}

export function getPublicApiDepartureItinerary(
  client: FetchWithValidationOptions,
  productId: string,
  departureId: string,
  query?: PublicApiDepartureItineraryQuery,
) {
  const parsed = query ? publicApiDepartureItineraryQuerySchema.parse(query) : undefined
  return fetchWithValidation(
    withQueryParams(`/v1/public/products/${productId}/departures/${departureId}/itinerary`, parsed),
    publicApiDepartureItineraryResponseSchema,
    client,
  )
}

export function listPublicApiProductOffers(
  client: FetchWithValidationOptions,
  productId: string,
  query?: PublicApiPromotionalOfferListQuery,
) {
  return fetchWithValidation(
    withQueryParams(`/v1/public/products/${productId}/offers`, query),
    publicApiPromotionalOfferListResponseSchema,
    client,
  )
}

export function getPublicApiOfferBySlug(
  client: FetchWithValidationOptions,
  slug: string,
  query?: Pick<PublicApiPromotionalOfferListQuery, "locale">,
) {
  return fetchWithValidation(
    withQueryParams(`/v1/public/offers/${slug}`, query),
    publicApiPromotionalOfferResponseSchema,
    client,
  )
}

export function applyPublicApiOffer(
  client: FetchWithValidationOptions,
  slug: string,
  input: PublicApiOfferApplyInput,
) {
  const parsed = publicApiOfferApplyInputSchema.parse(input)

  return fetchWithValidation(
    `/v1/public/offers/${slug}/apply`,
    publicApiOfferMutationResponseSchema,
    client,
    { method: "POST", body: JSON.stringify(parsed) },
  )
}

export function redeemPublicApiOffer(
  client: FetchWithValidationOptions,
  input: PublicApiOfferRedeemInput,
) {
  const parsed = publicApiOfferRedeemInputSchema.parse(input)

  return fetchWithValidation(
    "/v1/public/offers/redeem",
    publicApiOfferMutationResponseSchema,
    client,
    {
      method: "POST",
      body: JSON.stringify(parsed),
    },
  )
}
