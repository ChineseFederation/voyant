import type {
  PublicApiDepartureItineraryQuery,
  PublicApiDepartureListQuery,
  PublicApiProductExtensionsQuery,
  PublicApiPromotionalOfferListQuery,
} from "./schemas.js"

export type PublicApiDepartureFilters = PublicApiDepartureListQuery

export type PublicApiDepartureItineraryFilters = PublicApiDepartureItineraryQuery

export type PublicApiOfferFilters = PublicApiPromotionalOfferListQuery

export type PublicApiExtensionsFilters = PublicApiProductExtensionsQuery

export const publicApiQueryKeys = {
  all: ["voyant", "storefront"] as const,

  markets: () => [...publicApiQueryKeys.all, "markets"] as const,
  settings: () => [...publicApiQueryKeys.all, "settings"] as const,
  adminSettings: () => [...publicApiQueryKeys.all, "admin", "settings"] as const,
  departures: () => [...publicApiQueryKeys.all, "departures"] as const,
  departure: (departureId: string) =>
    [...publicApiQueryKeys.departures(), "detail", departureId] as const,
  productDepartures: (productId: string, filters: PublicApiDepartureFilters) =>
    [...publicApiQueryKeys.departures(), "product-list", productId, filters] as const,
  departureItinerary: (
    productId: string,
    departureId: string,
    filters: PublicApiDepartureItineraryFilters,
  ) => [...publicApiQueryKeys.departure(departureId), "itinerary", productId, filters] as const,
  departurePricePreview: (departureId: string) =>
    [...publicApiQueryKeys.departure(departureId), "price-preview"] as const,

  extensions: () => [...publicApiQueryKeys.all, "extensions"] as const,
  productExtensions: (productId: string, filters: PublicApiExtensionsFilters) =>
    [...publicApiQueryKeys.extensions(), productId, filters] as const,

  offers: () => [...publicApiQueryKeys.all, "offers"] as const,
  productOffers: (productId: string, filters: PublicApiOfferFilters) =>
    [...publicApiQueryKeys.offers(), "product-list", productId, filters] as const,
  offer: (slug: string, locale?: string) =>
    [...publicApiQueryKeys.offers(), "detail", slug, locale ?? null] as const,
} as const
