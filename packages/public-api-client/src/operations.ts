import {
  type PublicApiRequestOptions,
  publicApiFetchWithValidation,
  requestHeaders,
  type VoyantPublicApiClientOptions,
  withPublicApiQueryParams,
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
  type PublicApiDepartureItineraryQuery,
  type PublicApiDepartureListQuery,
  type PublicApiDeparturePricePreviewInput,
  type PublicApiLeadIntakeInput,
  type PublicApiNewsletterSubscribeInput,
  type PublicApiProductAvailabilitySummaryQuery,
  type PublicApiProductExtensionsQuery,
  type PublicApiPromotionalOfferListQuery,
  type PublicBookingOverviewLookupQuery,
  previewCheckoutCollectionSchema,
  publicApiDepartureItineraryQuerySchema,
  publicApiDepartureItineraryResponseSchema,
  publicApiDepartureListQuerySchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDeparturePricePreviewResponseSchema,
  publicApiDepartureResponseSchema,
  publicApiIntakeResponseEnvelopeSchema,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeInputSchema,
  publicApiNewsletterSubscribeResponseEnvelopeSchema,
  publicApiProductAvailabilitySummaryQuerySchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferListResponseSchema,
  publicApiPromotionalOfferResponseSchema,
  publicApiSettingsResponseSchema,
  publicBookingOverviewLookupQuerySchema,
  publicBookingOverviewResponseSchema,
} from "./schemas.js"

type ResolvedClientOptions = Required<Pick<VoyantPublicApiClientOptions, "baseUrl" | "fetcher">> &
  Pick<VoyantPublicApiClientOptions, "headers">

export function getPublicApiSettings(client: ResolvedClientOptions) {
  return publicApiFetchWithValidation(
    "/v1/public/settings",
    publicApiSettingsResponseSchema,
    client,
  ).then((response) => response.data)
}

export function createPublicApiLead(
  client: ResolvedClientOptions,
  input: PublicApiLeadIntakeInput,
  options?: PublicApiRequestOptions,
) {
  const parsed = publicApiLeadIntakeInputSchema.parse(input)
  return publicApiFetchWithValidation(
    "/v1/public/leads",
    publicApiIntakeResponseEnvelopeSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function subscribePublicApiNewsletter(
  client: ResolvedClientOptions,
  input: PublicApiNewsletterSubscribeInput,
  options?: PublicApiRequestOptions,
) {
  const parsed = publicApiNewsletterSubscribeInputSchema.parse(input)
  return publicApiFetchWithValidation(
    "/v1/public/newsletter/subscribe",
    publicApiNewsletterSubscribeResponseEnvelopeSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function getPublicApiDeparture(client: ResolvedClientOptions, departureId: string) {
  return publicApiFetchWithValidation(
    `/v1/public/departures/${encodeURIComponent(departureId)}`,
    publicApiDepartureResponseSchema,
    client,
  ).then((response) => response.data)
}

export function listPublicApiProductDepartures(
  client: ResolvedClientOptions,
  productId: string,
  query?: PublicApiDepartureListQuery,
) {
  const parsed = query ? publicApiDepartureListQuerySchema.parse(query) : undefined
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/departures`,
      parsed,
    ),
    publicApiDepartureListResponseSchema,
    client,
  )
}

export function getPublicApiProductAvailability(
  client: ResolvedClientOptions,
  productId: string,
  query?: PublicApiProductAvailabilitySummaryQuery,
) {
  const parsed = query ? publicApiProductAvailabilitySummaryQuerySchema.parse(query) : undefined
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/availability`,
      parsed,
    ),
    publicApiProductAvailabilitySummaryResponseSchema,
    client,
  ).then((response) => response.data)
}

export function previewPublicApiDeparturePrice(
  client: ResolvedClientOptions,
  departureId: string,
  input: PublicApiDeparturePricePreviewInput,
  options?: PublicApiRequestOptions,
) {
  const parsed = publicApiDeparturePricePreviewInputSchema.parse(input)
  return publicApiFetchWithValidation(
    `/v1/public/departures/${encodeURIComponent(departureId)}/price`,
    publicApiDeparturePricePreviewResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function listPublicApiProductExtensions(
  client: ResolvedClientOptions,
  productId: string,
  query?: PublicApiProductExtensionsQuery,
) {
  const parsed = query ? publicApiProductExtensionsQuerySchema.parse(query) : undefined
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/extensions`,
      parsed,
    ),
    publicApiProductExtensionsResponseSchema,
    client,
  )
}

export function getPublicApiDepartureItinerary(
  client: ResolvedClientOptions,
  productId: string,
  departureId: string,
  query?: PublicApiDepartureItineraryQuery,
) {
  const parsed = query ? publicApiDepartureItineraryQuerySchema.parse(query) : undefined
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(
      `/v1/public/products/${encodeURIComponent(productId)}/departures/${encodeURIComponent(
        departureId,
      )}/itinerary`,
      parsed,
    ),
    publicApiDepartureItineraryResponseSchema,
    client,
  ).then((response) => response.data)
}

export function listPublicApiProductOffers(
  client: ResolvedClientOptions,
  productId: string,
  query?: PublicApiPromotionalOfferListQuery,
) {
  const parsed = query ? publicApiPromotionalOfferListQuerySchema.parse(query) : undefined
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(`/v1/public/products/${encodeURIComponent(productId)}/offers`, parsed),
    publicApiPromotionalOfferListResponseSchema,
    client,
  ).then((response) => response.data)
}

export function getPublicApiOfferBySlug(
  client: ResolvedClientOptions,
  slug: string,
  query?: Pick<PublicApiPromotionalOfferListQuery, "locale">,
) {
  return publicApiFetchWithValidation(
    withPublicApiQueryParams(`/v1/public/offers/${encodeURIComponent(slug)}`, query),
    publicApiPromotionalOfferResponseSchema,
    client,
  ).then((response) => response.data)
}

export function getPublicBookingOverview(
  client: ResolvedClientOptions,
  query: PublicBookingOverviewLookupQuery,
) {
  const parsed = publicBookingOverviewLookupQuerySchema.parse(query)
  return publicApiFetchWithValidation(
    withPublicApiQueryParams("/v1/public/bookings/overview", parsed),
    publicBookingOverviewResponseSchema,
    client,
  ).then((response) => response.data)
}

export function previewCheckoutCollection(
  client: ResolvedClientOptions,
  bookingId: string,
  input: PreviewCheckoutCollectionInput,
  options?: PublicApiRequestOptions,
) {
  const parsed = previewCheckoutCollectionSchema.parse(input)
  return publicApiFetchWithValidation(
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
  options?: PublicApiRequestOptions,
) {
  const parsed = initiateCheckoutCollectionSchema.parse(input)
  return publicApiFetchWithValidation(
    `/v1/public/finance/bookings/${encodeURIComponent(bookingId)}/initiate-collection`,
    initiatedCheckoutCollectionResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}

export function bootstrapCheckoutCollection(
  client: ResolvedClientOptions,
  input: BootstrapCheckoutCollectionInput,
  options?: PublicApiRequestOptions,
) {
  const parsed = bootstrapCheckoutCollectionSchema.parse(input)
  return publicApiFetchWithValidation(
    "/v1/public/finance/collections/bootstrap",
    bootstrappedCheckoutCollectionResponseSchema,
    client,
    { method: "POST", headers: requestHeaders(options), body: JSON.stringify(parsed) },
  ).then((response) => response.data)
}
