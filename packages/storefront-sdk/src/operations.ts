import {
  requestHeaders,
  type StorefrontRequestOptions,
  storefrontFetchWithValidation,
  type VoyantStorefrontClientOptions,
  withStorefrontQueryParams,
} from "./client.js"
import {
  type BootstrapCheckoutCollectionInput,
  bootstrapCheckoutCollectionSchema,
  bootstrappedCheckoutCollectionResponseSchema,
  checkoutCollectionPlanResponseSchema,
  type InitiateCheckoutCollectionInput,
  initiateCheckoutCollectionSchema,
  initiatedCheckoutCollectionResponseSchema,
  type PreviewCheckoutCollectionInput,
  type PublicBookingOverviewLookupQuery,
  previewCheckoutCollectionSchema,
  publicBookingOverviewLookupQuerySchema,
  publicBookingOverviewResponseSchema,
  type StorefrontDepartureItineraryQuery,
  type StorefrontDepartureListQuery,
  type StorefrontDeparturePricePreviewInput,
  type StorefrontLeadIntakeInput,
  type StorefrontNewsletterSubscribeInput,
  type StorefrontProductAvailabilitySummaryQuery,
  type StorefrontProductExtensionsQuery,
  type StorefrontPromotionalOfferListQuery,
  storefrontDepartureItineraryQuerySchema,
  storefrontDepartureItineraryResponseSchema,
  storefrontDepartureListQuerySchema,
  storefrontDepartureListResponseSchema,
  storefrontDeparturePricePreviewInputSchema,
  storefrontDeparturePricePreviewResponseSchema,
  storefrontDepartureResponseSchema,
  storefrontIntakeResponseEnvelopeSchema,
  storefrontLeadIntakeInputSchema,
  storefrontNewsletterSubscribeInputSchema,
  storefrontNewsletterSubscribeResponseEnvelopeSchema,
  storefrontProductAvailabilitySummaryQuerySchema,
  storefrontProductAvailabilitySummaryResponseSchema,
  storefrontProductExtensionsQuerySchema,
  storefrontProductExtensionsResponseSchema,
  storefrontPromotionalOfferListQuerySchema,
  storefrontPromotionalOfferListResponseSchema,
  storefrontPromotionalOfferResponseSchema,
  storefrontSettingsResponseSchema,
} from "./schemas.js"

type ResolvedClientOptions = Required<Pick<VoyantStorefrontClientOptions, "baseUrl" | "fetcher">> &
  Pick<VoyantStorefrontClientOptions, "headers">

export function getStorefrontSettings(client: ResolvedClientOptions) {
  return storefrontFetchWithValidation(
    "/v1/public/settings",
    storefrontSettingsResponseSchema,
    client,
  ).then((response) => response.data)
}

export function createStorefrontLead(
  client: ResolvedClientOptions,
  input: StorefrontLeadIntakeInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = storefrontLeadIntakeInputSchema.parse(input)
  return storefrontFetchWithValidation(
    "/v1/public/leads",
    storefrontIntakeResponseEnvelopeSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function subscribeStorefrontNewsletter(
  client: ResolvedClientOptions,
  input: StorefrontNewsletterSubscribeInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = storefrontNewsletterSubscribeInputSchema.parse(input)
  return storefrontFetchWithValidation(
    "/v1/public/newsletter/subscribe",
    storefrontNewsletterSubscribeResponseEnvelopeSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function getStorefrontDeparture(client: ResolvedClientOptions, departureId: string) {
  return storefrontFetchWithValidation(
    `/v1/public/departures/${encodeURIComponent(departureId)}`,
    storefrontDepartureResponseSchema,
    client,
  ).then((response) => response.data)
}

export function listStorefrontProductDepartures(
  client: ResolvedClientOptions,
  productId: string,
  query?: StorefrontDepartureListQuery,
) {
  const parsed = query ? storefrontDepartureListQuerySchema.parse(query) : undefined
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/departures`,
      parsed,
    ),
    storefrontDepartureListResponseSchema,
    client,
  )
}

export function getStorefrontProductAvailability(
  client: ResolvedClientOptions,
  productId: string,
  query?: StorefrontProductAvailabilitySummaryQuery,
) {
  const parsed = query ? storefrontProductAvailabilitySummaryQuerySchema.parse(query) : undefined
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/availability`,
      parsed,
    ),
    storefrontProductAvailabilitySummaryResponseSchema,
    client,
  ).then((response) => response.data)
}

export function previewStorefrontDeparturePrice(
  client: ResolvedClientOptions,
  departureId: string,
  input: StorefrontDeparturePricePreviewInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = storefrontDeparturePricePreviewInputSchema.parse(input)
  return storefrontFetchWithValidation(
    `/v1/public/departures/${encodeURIComponent(departureId)}/price`,
    storefrontDeparturePricePreviewResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function listStorefrontProductExtensions(
  client: ResolvedClientOptions,
  productId: string,
  query?: StorefrontProductExtensionsQuery,
) {
  const parsed = query ? storefrontProductExtensionsQuerySchema.parse(query) : undefined
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/extensions`,
      parsed,
    ),
    storefrontProductExtensionsResponseSchema,
    client,
  )
}

export function getStorefrontDepartureItinerary(
  client: ResolvedClientOptions,
  productId: string,
  departureId: string,
  query?: StorefrontDepartureItineraryQuery,
) {
  const parsed = query ? storefrontDepartureItineraryQuerySchema.parse(query) : undefined
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/departures/${encodeURIComponent(
        departureId,
      )}/itinerary`,
      parsed,
    ),
    storefrontDepartureItineraryResponseSchema,
    client,
  ).then((response) => response.data)
}

export function listStorefrontProductOffers(
  client: ResolvedClientOptions,
  productId: string,
  query?: StorefrontPromotionalOfferListQuery,
) {
  const parsed = query ? storefrontPromotionalOfferListQuerySchema.parse(query) : undefined
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/offers`,
      parsed,
    ),
    storefrontPromotionalOfferListResponseSchema,
    client,
  ).then((response) => response.data)
}

export function getStorefrontOfferBySlug(
  client: ResolvedClientOptions,
  slug: string,
  query?: Pick<StorefrontPromotionalOfferListQuery, "locale">,
) {
  return storefrontFetchWithValidation(
    withStorefrontQueryParams(`/v1/public/offers/${encodeURIComponent(slug)}`, query),
    storefrontPromotionalOfferResponseSchema,
    client,
  ).then((response) => response.data)
}

export function getPublicBookingOverview(
  client: ResolvedClientOptions,
  query: PublicBookingOverviewLookupQuery,
) {
  const parsed = publicBookingOverviewLookupQuerySchema.parse(query)
  return storefrontFetchWithValidation(
    withStorefrontQueryParams("/v1/public/bookings/overview", parsed),
    publicBookingOverviewResponseSchema,
    client,
  ).then((response) => response.data)
}

export function previewCheckoutCollection(
  client: ResolvedClientOptions,
  bookingId: string,
  input: PreviewCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = previewCheckoutCollectionSchema.parse(input)
  return storefrontFetchWithValidation(
    `/v1/public/finance/bookings/${encodeURIComponent(bookingId)}/collection-plan`,
    checkoutCollectionPlanResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function initiateCheckoutCollection(
  client: ResolvedClientOptions,
  bookingId: string,
  input: InitiateCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = initiateCheckoutCollectionSchema.parse(input)
  return storefrontFetchWithValidation(
    `/v1/public/finance/bookings/${encodeURIComponent(bookingId)}/initiate-collection`,
    initiatedCheckoutCollectionResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function bootstrapCheckoutCollection(
  client: ResolvedClientOptions,
  input: BootstrapCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  const parsed = bootstrapCheckoutCollectionSchema.parse(input)
  return storefrontFetchWithValidation(
    "/v1/public/finance/collections/bootstrap",
    bootstrappedCheckoutCollectionResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}
