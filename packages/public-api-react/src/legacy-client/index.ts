/**
 * The hand-written Public API operations, moved here from
 * `@voyant-travel/public-api-client` (voyant#4626).
 *
 * They cover roughly two dozen of the 138 public paths and validate responses
 * at runtime against zod schemas imported from `bookings`, `finance` and
 * `public-api`. Those are server packages, which is precisely why they could
 * not stay in a package destined for npm — they were declared as
 * devDependencies, so a published install would have failed at import.
 *
 * This package is private and already depends on them, so here they cost
 * nothing. For anything not covered, use `createPublicApiClient` from
 * `@voyant-travel/public-api-client`, which is typed on the whole surface.
 */
import {
  acceptBookingAmendment,
  applyBookingAmendment,
  getBookingAmendment,
  listBookingAmendments,
  previewTravelerCorrection,
} from "./booking-amendments.js"
import {
  abandonBookingSessionV1,
  adoptBookingSessionV1,
  commitBookingSessionV1,
  createBookingSessionV1,
  holdBookingSessionV1,
  quoteBookingSessionV1,
  renewBookingSessionV1,
  resumeBookingSessionV1,
  runOwnedProductBookingTracerV1,
  updateBookingSessionV1,
} from "./booking-session-v1.js"
import { defaultPublicApiFetcher, type VoyantPublicApiClientOptions } from "./client.js"
import {
  bootstrapCheckoutCollection,
  createPublicApiLead,
  getPublicApiDeparture,
  getPublicApiDepartureItinerary,
  getPublicApiOfferBySlug,
  getPublicApiProductAvailability,
  getPublicApiSettings,
  getPublicBookingOverview,
  initiateCheckoutCollection,
  listPublicApiProductDepartures,
  listPublicApiProductExtensions,
  listPublicApiProductOffers,
  previewCheckoutCollection,
  previewPublicApiDeparturePrice,
  subscribePublicApiNewsletter,
} from "./operations.js"

export * from "./booking-amendments.js"
export * from "./booking-session-v1.js"
export type {
  PublicApiQueryParamValue,
  PublicApiRequestOptions,
  VoyantPublicApiClientOptions,
  VoyantPublicApiFetcher,
} from "./client.js"
export {
  defaultPublicApiFetcher,
  publicApiFetchWithValidation,
  VoyantPublicApiError,
  withPublicApiQueryParams,
} from "./client.js"
export * from "./errors.js"
export * from "./operations.js"
export * from "./schemas.js"

export function createVoyantPublicApiClient(options: VoyantPublicApiClientOptions) {
  const client = {
    baseUrl: options.baseUrl,
    fetcher: options.fetcher ?? defaultPublicApiFetcher,
    headers: options.headers,
  }

  return {
    storefront: {
      getSettings: () => getPublicApiSettings(client),
      createLead: (
        input: Parameters<typeof createPublicApiLead>[1],
        requestOptions?: Parameters<typeof createPublicApiLead>[2],
      ) => createPublicApiLead(client, input, requestOptions),
      subscribeNewsletter: (
        input: Parameters<typeof subscribePublicApiNewsletter>[1],
        requestOptions?: Parameters<typeof subscribePublicApiNewsletter>[2],
      ) => subscribePublicApiNewsletter(client, input, requestOptions),
      getDeparture: (departureId: string) => getPublicApiDeparture(client, departureId),
      listProductDepartures: (
        productId: string,
        query?: Parameters<typeof listPublicApiProductDepartures>[2],
      ) => listPublicApiProductDepartures(client, productId, query),
      getProductAvailability: (
        productId: string,
        query?: Parameters<typeof getPublicApiProductAvailability>[2],
      ) => getPublicApiProductAvailability(client, productId, query),
      previewDeparturePrice: (
        departureId: string,
        input: Parameters<typeof previewPublicApiDeparturePrice>[2],
        requestOptions?: Parameters<typeof previewPublicApiDeparturePrice>[3],
      ) => previewPublicApiDeparturePrice(client, departureId, input, requestOptions),
      listProductExtensions: (
        productId: string,
        query?: Parameters<typeof listPublicApiProductExtensions>[2],
      ) => listPublicApiProductExtensions(client, productId, query),
      getDepartureItinerary: (
        productId: string,
        departureId: string,
        query?: Parameters<typeof getPublicApiDepartureItinerary>[3],
      ) => getPublicApiDepartureItinerary(client, productId, departureId, query),
      listProductOffers: (
        productId: string,
        query?: Parameters<typeof listPublicApiProductOffers>[2],
      ) => listPublicApiProductOffers(client, productId, query),
      getOfferBySlug: (slug: string, query?: Parameters<typeof getPublicApiOfferBySlug>[2]) =>
        getPublicApiOfferBySlug(client, slug, query),
    },
    booking: {
      getOverview: (query: Parameters<typeof getPublicBookingOverview>[1]) =>
        getPublicBookingOverview(client, query),
    },
    bookingAmendments: {
      previewTravelerCorrection: (
        bookingId: string,
        input: Parameters<typeof previewTravelerCorrection>[2],
        requestOptions: Parameters<typeof previewTravelerCorrection>[3],
      ) => previewTravelerCorrection(client, bookingId, input, requestOptions),
      list: (bookingId: string, requestOptions?: Parameters<typeof listBookingAmendments>[2]) =>
        listBookingAmendments(client, bookingId, requestOptions),
      get: (
        bookingId: string,
        amendmentId: string,
        requestOptions?: Parameters<typeof getBookingAmendment>[3],
      ) => getBookingAmendment(client, bookingId, amendmentId, requestOptions),
      accept: (
        bookingId: string,
        amendmentId: string,
        input: Parameters<typeof acceptBookingAmendment>[3],
        requestOptions: Parameters<typeof acceptBookingAmendment>[4],
      ) => acceptBookingAmendment(client, bookingId, amendmentId, input, requestOptions),
      apply: (
        bookingId: string,
        amendmentId: string,
        input: Parameters<typeof applyBookingAmendment>[3],
        requestOptions: Parameters<typeof applyBookingAmendment>[4],
      ) => applyBookingAmendment(client, bookingId, amendmentId, input, requestOptions),
    },
    bookingSessionsV1: {
      create: (
        input: Parameters<typeof createBookingSessionV1>[1],
        requestOptions: Parameters<typeof createBookingSessionV1>[2],
      ) => createBookingSessionV1(client, input, requestOptions),
      resume: (sessionId: string, requestOptions: Parameters<typeof resumeBookingSessionV1>[2]) =>
        resumeBookingSessionV1(client, sessionId, requestOptions),
      adopt: (
        sessionId: string,
        input: Parameters<typeof adoptBookingSessionV1>[2],
        requestOptions: Parameters<typeof adoptBookingSessionV1>[3],
      ) => adoptBookingSessionV1(client, sessionId, input, requestOptions),
      renew: (
        sessionId: string,
        input: Parameters<typeof renewBookingSessionV1>[2],
        requestOptions: Parameters<typeof renewBookingSessionV1>[3],
      ) => renewBookingSessionV1(client, sessionId, input, requestOptions),
      abandon: (
        sessionId: string,
        input: Parameters<typeof abandonBookingSessionV1>[2],
        requestOptions: Parameters<typeof abandonBookingSessionV1>[3],
      ) => abandonBookingSessionV1(client, sessionId, input, requestOptions),
      update: (
        sessionId: string,
        input: Parameters<typeof updateBookingSessionV1>[2],
        requestOptions?: Parameters<typeof updateBookingSessionV1>[3],
      ) => updateBookingSessionV1(client, sessionId, input, requestOptions),
      quote: (
        sessionId: string,
        input: Parameters<typeof quoteBookingSessionV1>[2],
        requestOptions?: Parameters<typeof quoteBookingSessionV1>[3],
      ) => quoteBookingSessionV1(client, sessionId, input, requestOptions),
      hold: (
        sessionId: string,
        input: Parameters<typeof holdBookingSessionV1>[2],
        requestOptions?: Parameters<typeof holdBookingSessionV1>[3],
      ) => holdBookingSessionV1(client, sessionId, input, requestOptions),
      commit: (
        sessionId: string,
        input: Parameters<typeof commitBookingSessionV1>[2],
        requestOptions?: Parameters<typeof commitBookingSessionV1>[3],
      ) => commitBookingSessionV1(client, sessionId, input, requestOptions),
      runOwnedProductTracer: (input: Parameters<typeof runOwnedProductBookingTracerV1>[1]) =>
        runOwnedProductBookingTracerV1(client, input),
    },
    checkout: {
      previewCollection: (
        bookingId: string,
        input: Parameters<typeof previewCheckoutCollection>[2],
        requestOptions?: Parameters<typeof previewCheckoutCollection>[3],
      ) => previewCheckoutCollection(client, bookingId, input, requestOptions),
      initiateCollection: (
        bookingId: string,
        input: Parameters<typeof initiateCheckoutCollection>[2],
        requestOptions?: Parameters<typeof initiateCheckoutCollection>[3],
      ) => initiateCheckoutCollection(client, bookingId, input, requestOptions),
      bootstrapCollection: (
        input: Parameters<typeof bootstrapCheckoutCollection>[1],
        requestOptions?: Parameters<typeof bootstrapCheckoutCollection>[2],
      ) => bootstrapCheckoutCollection(client, input, requestOptions),
    },
  }
}

export type VoyantPublicApiClient = ReturnType<typeof createVoyantPublicApiClient>
