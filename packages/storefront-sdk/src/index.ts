import {
  bootstrapBookingEnginePayment,
  confirmBookingEngineSession,
  expireBookingEngineSession,
  getBookingEngineOverview,
  getBookingEngineProgress,
  getBookingEngineSessionSnapshot,
  previewBookingEnginePayment,
  repriceBookingEngineSession,
  startBookingEnginePayment,
  updateBookingEngineProgress,
  updateBookingEngineSession,
  updateBookingEngineTravelers,
} from "./booking-engine.js"
import {
  commitBookingSessionV1,
  createBookingSessionV1,
  holdBookingSessionV1,
  quoteBookingSessionV1,
  runOwnedProductBookingTracerV1,
  updateBookingSessionV1,
} from "./booking-session-v1.js"
import { defaultStorefrontFetcher, type VoyantStorefrontClientOptions } from "./client.js"
import {
  canRunBookingEngineAction,
  createBookingEngineSnapshot,
  deriveBookingEngineState,
} from "./engine-state.js"
import {
  bootstrapCheckoutCollection,
  confirmPublicBookingSession,
  createStorefrontLead,
  expirePublicBookingSession,
  getPublicBookingOverview,
  getPublicBookingSession,
  getPublicBookingSessionState,
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
  repricePublicBookingSession,
  subscribeStorefrontNewsletter,
  updatePublicBookingSession,
  updatePublicBookingSessionState,
} from "./operations.js"

export * from "./booking-engine.js"
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
export type {
  BookingEngineAction,
  BookingEngineSnapshot,
  BookingEngineState,
} from "./engine-state.js"
export {
  bookingEngineActions,
  bookingEngineStates,
  canRunBookingEngineAction,
  createBookingEngineSnapshot,
  deriveBookingEngineState,
  getAllowedBookingEngineActions,
} from "./engine-state.js"
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
      getSession: (sessionId: string) => getPublicBookingSession(client, sessionId),
      updateSession: (
        sessionId: string,
        input: Parameters<typeof updatePublicBookingSession>[2],
        requestOptions?: Parameters<typeof updatePublicBookingSession>[3],
      ) => updatePublicBookingSession(client, sessionId, input, requestOptions),
      getSessionState: (sessionId: string) => getPublicBookingSessionState(client, sessionId),
      updateSessionState: (
        sessionId: string,
        input: Parameters<typeof updatePublicBookingSessionState>[2],
        requestOptions?: Parameters<typeof updatePublicBookingSessionState>[3],
      ) => updatePublicBookingSessionState(client, sessionId, input, requestOptions),
      reprice: (
        sessionId: string,
        input: Parameters<typeof repricePublicBookingSession>[2],
        requestOptions?: Parameters<typeof repricePublicBookingSession>[3],
      ) => repricePublicBookingSession(client, sessionId, input, requestOptions),
      confirm: (
        sessionId: string,
        input?: Parameters<typeof confirmPublicBookingSession>[2],
        requestOptions?: Parameters<typeof confirmPublicBookingSession>[3],
      ) => confirmPublicBookingSession(client, sessionId, input, requestOptions),
      expire: (
        sessionId: string,
        input?: Parameters<typeof expirePublicBookingSession>[2],
        requestOptions?: Parameters<typeof expirePublicBookingSession>[3],
      ) => expirePublicBookingSession(client, sessionId, input, requestOptions),
      getOverview: (query: Parameters<typeof getPublicBookingOverview>[1]) =>
        getPublicBookingOverview(client, query),
      deriveState: deriveBookingEngineState,
      createSnapshot: createBookingEngineSnapshot,
      canRunAction: canRunBookingEngineAction,
    },
    bookingEngine: {
      getSnapshot: (sessionId: string) => getBookingEngineSessionSnapshot(client, sessionId),
      updateSession: (
        sessionId: string,
        input: Parameters<typeof updateBookingEngineSession>[2],
        requestOptions?: Parameters<typeof updateBookingEngineSession>[3],
      ) => updateBookingEngineSession(client, sessionId, input, requestOptions),
      updateTravelers: (
        sessionId: string,
        input: Parameters<typeof updateBookingEngineTravelers>[2],
        requestOptions?: Parameters<typeof updateBookingEngineTravelers>[3],
      ) => updateBookingEngineTravelers(client, sessionId, input, requestOptions),
      getProgress: (sessionId: string) => getBookingEngineProgress(client, sessionId),
      updateProgress: (
        sessionId: string,
        input: Parameters<typeof updateBookingEngineProgress>[2],
        requestOptions?: Parameters<typeof updateBookingEngineProgress>[3],
      ) => updateBookingEngineProgress(client, sessionId, input, requestOptions),
      reprice: (
        sessionId: string,
        input: Parameters<typeof repriceBookingEngineSession>[2],
        requestOptions?: Parameters<typeof repriceBookingEngineSession>[3],
      ) => repriceBookingEngineSession(client, sessionId, input, requestOptions),
      confirm: (
        sessionId: string,
        input?: Parameters<typeof confirmBookingEngineSession>[2],
        requestOptions?: Parameters<typeof confirmBookingEngineSession>[3],
      ) => confirmBookingEngineSession(client, sessionId, input, requestOptions),
      expire: (
        sessionId: string,
        input?: Parameters<typeof expireBookingEngineSession>[2],
        requestOptions?: Parameters<typeof expireBookingEngineSession>[3],
      ) => expireBookingEngineSession(client, sessionId, input, requestOptions),
      getOverview: (query: Parameters<typeof getBookingEngineOverview>[1]) =>
        getBookingEngineOverview(client, query),
      previewPayment: (
        bookingId: string,
        input: Parameters<typeof previewBookingEnginePayment>[2],
        requestOptions?: Parameters<typeof previewBookingEnginePayment>[3],
      ) => previewBookingEnginePayment(client, bookingId, input, requestOptions),
      startPayment: (
        bookingId: string,
        input: Parameters<typeof startBookingEnginePayment>[2],
        requestOptions?: Parameters<typeof startBookingEnginePayment>[3],
      ) => startBookingEnginePayment(client, bookingId, input, requestOptions),
      bootstrapPayment: (
        input: Parameters<typeof bootstrapBookingEnginePayment>[1],
        requestOptions?: Parameters<typeof bootstrapBookingEnginePayment>[2],
      ) => bootstrapBookingEnginePayment(client, input, requestOptions),
      deriveState: deriveBookingEngineState,
      createSnapshot: createBookingEngineSnapshot,
      canRunAction: canRunBookingEngineAction,
    },
    bookingSessionsV1: {
      create: (
        input: Parameters<typeof createBookingSessionV1>[1],
        requestOptions?: Parameters<typeof createBookingSessionV1>[2],
      ) => createBookingSessionV1(client, input, requestOptions),
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
