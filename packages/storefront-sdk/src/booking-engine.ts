import type { StorefrontRequestOptions, VoyantStorefrontClientOptions } from "./client.js"
import { type BookingEngineSnapshot, createBookingEngineSnapshot } from "./engine-state.js"
import {
  bootstrapCheckoutCollection,
  confirmPublicBookingSession,
  expirePublicBookingSession,
  getPublicBookingOverview,
  getPublicBookingSession,
  getPublicBookingSessionState,
  initiateCheckoutCollection,
  previewCheckoutCollection,
  repricePublicBookingSession,
  updatePublicBookingSession,
  updatePublicBookingSessionState,
} from "./operations.js"
import type {
  BootstrapCheckoutCollectionInput,
  InitiateCheckoutCollectionInput,
  PreviewCheckoutCollectionInput,
  PublicBookingOverviewLookupQuery,
  PublicBookingSessionMutationInput,
  PublicBookingSessionRecord,
  PublicBookingSessionRepriceInput,
  PublicUpdateBookingSessionInput,
  PublicUpsertBookingSessionStateInput,
} from "./schemas.js"

type ResolvedClientOptions = Required<Pick<VoyantStorefrontClientOptions, "baseUrl" | "fetcher">> &
  Pick<VoyantStorefrontClientOptions, "headers">

export interface BookingEngineSessionSnapshot {
  session: PublicBookingSessionRecord
  engine: BookingEngineSnapshot
}

export interface BookingEngineRepriceResult {
  pricing: Awaited<ReturnType<typeof repricePublicBookingSession>>["pricing"]
  session: BookingEngineSessionSnapshot | null
}

export type BookingEngineTravelerUpdateInput = Pick<
  PublicUpdateBookingSessionInput,
  "travelers" | "removedTravelerIds" | "pax"
>

export function createBookingEngineSessionSnapshot(
  session: PublicBookingSessionRecord,
): BookingEngineSessionSnapshot {
  return {
    session,
    engine: createBookingEngineSnapshot(session),
  }
}

export async function getBookingEngineSessionSnapshot(
  client: ResolvedClientOptions,
  sessionId: string,
) {
  const session = await getPublicBookingSession(client, sessionId)
  return createBookingEngineSessionSnapshot(session)
}

export async function updateBookingEngineSession(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PublicUpdateBookingSessionInput,
  options?: StorefrontRequestOptions,
) {
  const session = await updatePublicBookingSession(client, sessionId, input, options)
  return createBookingEngineSessionSnapshot(session)
}

export function updateBookingEngineTravelers(
  client: ResolvedClientOptions,
  sessionId: string,
  input: BookingEngineTravelerUpdateInput,
  options?: StorefrontRequestOptions,
) {
  return updateBookingEngineSession(client, sessionId, input, options)
}

export function getBookingEngineProgress(client: ResolvedClientOptions, sessionId: string) {
  return getPublicBookingSessionState(client, sessionId)
}

export function updateBookingEngineProgress(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PublicUpsertBookingSessionStateInput,
  options?: StorefrontRequestOptions,
) {
  return updatePublicBookingSessionState(client, sessionId, input, options)
}

export async function repriceBookingEngineSession(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PublicBookingSessionRepriceInput,
  options?: StorefrontRequestOptions,
): Promise<BookingEngineRepriceResult> {
  const result = await repricePublicBookingSession(client, sessionId, input, options)
  return {
    pricing: result.pricing,
    session: result.session ? createBookingEngineSessionSnapshot(result.session) : null,
  }
}

export async function confirmBookingEngineSession(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PublicBookingSessionMutationInput = {},
  options?: StorefrontRequestOptions,
) {
  const session = await confirmPublicBookingSession(client, sessionId, input, options)
  return createBookingEngineSessionSnapshot(session)
}

export async function expireBookingEngineSession(
  client: ResolvedClientOptions,
  sessionId: string,
  input: PublicBookingSessionMutationInput = {},
  options?: StorefrontRequestOptions,
) {
  const session = await expirePublicBookingSession(client, sessionId, input, options)
  return createBookingEngineSessionSnapshot(session)
}

export function getBookingEngineOverview(
  client: ResolvedClientOptions,
  query: PublicBookingOverviewLookupQuery,
) {
  return getPublicBookingOverview(client, query)
}

export function previewBookingEnginePayment(
  client: ResolvedClientOptions,
  bookingId: string,
  input: PreviewCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  return previewCheckoutCollection(client, bookingId, input, options)
}

export function startBookingEnginePayment(
  client: ResolvedClientOptions,
  bookingId: string,
  input: InitiateCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  return initiateCheckoutCollection(client, bookingId, input, options)
}

export function bootstrapBookingEnginePayment(
  client: ResolvedClientOptions,
  input: BootstrapCheckoutCollectionInput,
  options?: StorefrontRequestOptions,
) {
  return bootstrapCheckoutCollection(client, input, options)
}
