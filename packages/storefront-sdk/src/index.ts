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
import { defaultStorefrontFetcher, type VoyantStorefrontClientOptions } from "./client.js"
import {
  bootstrapCheckoutCollection,
  createStorefrontLead,
  getPublicBookingOverview,
  getStorefrontDeparture,
  getStorefrontDepartureItinerary,
  getStorefrontOfferBySlug,
  getStorefrontProductAvailability,
  getStorefrontSettings,
  initiateCheckoutCollection,
  listStorefrontProductDepartures,
  listStorefrontProductExtensions,
  listStorefrontProductOffers,
  previewCheckoutCollection,
  previewStorefrontDeparturePrice,
  subscribeStorefrontNewsletter,
} from "./operations.js"

export * from "./booking-amendments.js"
export * from "./booking-session-v1.js"
export type {
  StorefrontQueryParamValue,
  StorefrontRequestOptions,
  VoyantStorefrontClientOptions,
  VoyantStorefrontFetcher,
} from "./client.js"
export {
  defaultStorefrontFetcher,
  storefrontFetchWithValidation,
  VoyantStorefrontApiError,
  withStorefrontQueryParams,
} from "./client.js"
export * from "./errors.js"
export * from "./operations.js"
export * from "./schemas.js"

export function createVoyantStorefrontClient(options: VoyantStorefrontClientOptions) {
  const client = {
    baseUrl: options.baseUrl,
    fetcher: options.fetcher ?? defaultStorefrontFetcher,
    headers: options.headers,
  }

  return {
    storefront: {
      getSettings: () => getStorefrontSettings(client),
      createLead: (
        input: Parameters<typeof createStorefrontLead>[1],
        requestOptions?: Parameters<typeof createStorefrontLead>[2],
      ) => createStorefrontLead(client, input, requestOptions),
      subscribeNewsletter: (
        input: Parameters<typeof subscribeStorefrontNewsletter>[1],
        requestOptions?: Parameters<typeof subscribeStorefrontNewsletter>[2],
      ) => subscribeStorefrontNewsletter(client, input, requestOptions),
      getDeparture: (departureId: string) => getStorefrontDeparture(client, departureId),
      listProductDepartures: (
        productId: string,
        query?: Parameters<typeof listStorefrontProductDepartures>[2],
      ) => listStorefrontProductDepartures(client, productId, query),
      getProductAvailability: (
        productId: string,
        query?: Parameters<typeof getStorefrontProductAvailability>[2],
      ) => getStorefrontProductAvailability(client, productId, query),
      previewDeparturePrice: (
        departureId: string,
        input: Parameters<typeof previewStorefrontDeparturePrice>[2],
        requestOptions?: Parameters<typeof previewStorefrontDeparturePrice>[3],
      ) => previewStorefrontDeparturePrice(client, departureId, input, requestOptions),
      listProductExtensions: (
        productId: string,
        query?: Parameters<typeof listStorefrontProductExtensions>[2],
      ) => listStorefrontProductExtensions(client, productId, query),
      getDepartureItinerary: (
        productId: string,
        departureId: string,
        query?: Parameters<typeof getStorefrontDepartureItinerary>[3],
      ) => getStorefrontDepartureItinerary(client, productId, departureId, query),
      listProductOffers: (
        productId: string,
        query?: Parameters<typeof listStorefrontProductOffers>[2],
      ) => listStorefrontProductOffers(client, productId, query),
      getOfferBySlug: (slug: string, query?: Parameters<typeof getStorefrontOfferBySlug>[2]) =>
        getStorefrontOfferBySlug(client, slug, query),
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

export type VoyantStorefrontClient = ReturnType<typeof createVoyantStorefrontClient>
