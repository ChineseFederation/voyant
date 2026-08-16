import {
  type FanOutAvailabilitySearchOptions,
  fanOutAvailabilitySearch,
  type PresentedAvailabilityCandidate,
} from "@voyant-travel/catalog"
import type { AvailabilitySearchRequest } from "@voyant-travel/catalog-contracts/adapter/contract"
import {
  type FanOutFlightSearchOptions,
  fanOutFlightSearch,
  type MergedFlightOffer,
} from "@voyant-travel/flights"
import type {
  PublicApiCruiseSource,
  PublicApiCruiseSourceProvider,
  PublicApiDynamicPackageSource,
  PublicApiDynamicPackageSourceProvider,
  PublicApiInternalCruiseOffer,
  PublicApiInternalPackageOffer,
  PublicApiInternalStayOffer,
  PublicApiLiveContinuation,
  PublicApiLiveSearchPage,
  PublicApiLiveSourceStatus,
  PublicApiShoppingLiveProvider,
} from "./provider-ports.js"
import type { PublicApiShoppingContext } from "./runtime-port.js"
import type { PublicApiResolvedScope, PublicApiShoppingIntent } from "./schemas.js"

export type {
  PublicApiDynamicPackageSource,
  PublicApiDynamicPackageSourceOffer,
  PublicApiDynamicPackageSourceProvider,
} from "./provider-ports.js"

type FlightIntent = Extract<PublicApiShoppingIntent, { kind: "flight" }>
type StayIntent = Extract<PublicApiShoppingIntent, { kind: "stay" }>
type PackageIntent = Extract<PublicApiShoppingIntent, { kind: "package" }>

interface TrustedShoppingInput<TIntent> {
  context: PublicApiShoppingContext
  scope: PublicApiResolvedScope
  intent: TIntent
}

export interface PublicApiStayPresentation {
  title: string
  roomName?: string
  boardName?: string
  image?: { url: string; alt?: string }
  bookingTarget?: {
    entityModule: "accommodations"
    entityId: string
    sourceKind: string
    sourceConnectionId?: string
    sourceRef?: string
  }
}

/**
 * Closed deployment seam for source discovery. The resolver authenticates the
 * trusted storefront/channel tuple and returns only sources admitted to the
 * resolved market. Connection ids remain inside the fan-out invocation.
 */
export interface PublicApiLiveFlightFanOutResolver {
  resolve(
    input: Omit<TrustedShoppingInput<FlightIntent>, "intent">,
  ): Promise<Omit<FanOutFlightSearchOptions, "request" | "presentation">>
}

/** Closed equivalent for owned + sourced accommodation availability. */
export interface PublicApiLiveStayFanOutResolver {
  resolve(
    input: Omit<TrustedShoppingInput<StayIntent>, "intent">,
  ): Promise<Omit<FanOutAvailabilitySearchOptions, "request" | "presentation">>
  present(
    input: Omit<TrustedShoppingInput<StayIntent>, "intent"> & {
      candidate: PresentedAvailabilityCandidate
    },
  ): Promise<PublicApiStayPresentation | undefined>
}

/** @deprecated Use the provider-neutral source-provider name. */
export type PublicApiDynamicPackageConnectPort = PublicApiDynamicPackageSourceProvider

export interface CreatePublicApiShoppingLiveProviderOptions {
  flights?: PublicApiLiveFlightFanOutResolver
  stays?: PublicApiLiveStayFanOutResolver
  packages?: PublicApiDynamicPackageSourceProvider
  cruises?: PublicApiCruiseSourceProvider
  perSourceTimeoutMs?: number
}

/**
 * Maps the existing domain fan-outs onto Storefront's identity-free live page.
 * FX is deliberately not configured here: the managed Storefront runtime is
 * the sole presentation-money authority after all live verticals are mapped.
 */
export function createPublicApiShoppingLiveProvider(
  options: CreatePublicApiShoppingLiveProviderOptions,
): PublicApiShoppingLiveProvider {
  return {
    async searchFlights(input) {
      if (!options.flights) return unavailablePage()
      const resolved = await options.flights.resolve(input)
      const continued = continuationMap(input.continuation)
      const adapters = input.continuation
        ? resolved.adapters.filter(({ connectionId }) => continued.has(flightKey(connectionId)))
        : resolved.adapters
      if (adapters.length === 0) return unavailablePage()
      const result = await fanOutFlightSearch({
        ...resolved,
        adapters,
        request: flightRequest(input.intent),
        ...(input.continuation
          ? {
              continuationCursors: Object.fromEntries(
                adapters.flatMap(({ connectionId }) => {
                  const cursor = continued.get(flightKey(connectionId))
                  return cursor ? [[connectionId, cursor]] : []
                }),
              ),
            }
          : {}),
        ...(options.perSourceTimeoutMs !== undefined
          ? { perConnectionTimeoutMs: options.perSourceTimeoutMs }
          : {}),
      })
      return {
        items: result.offers.flatMap((offer) => mapMergedFlightOffers(offer, input)),
        sources: result.perConnection.map(({ status, count }) => ({
          status: mapFlightStatus(status, count),
        })),
        ...continuationResult(
          result.perConnection.flatMap(({ connectionId, status, nextCursor }) =>
            status === "ok" && nextCursor
              ? [{ key: flightKey(connectionId), cursor: nextCursor }]
              : [],
          ),
        ),
      }
    },

    async searchStays(input) {
      if (!options.stays) return unavailablePage()
      const stays = options.stays
      const resolved = await stays.resolve(input)
      const continued = continuationMap(input.continuation)
      const adapters = (resolved.adapters ?? []).filter(
        ({ connectionId }) => !input.continuation || continued.has(staySourcedKey(connectionId)),
      )
      const ownedHandlers = (resolved.ownedHandlers ?? []).filter(
        ({ handler }) => !input.continuation || continued.has(stayOwnedKey(handler.entityModule)),
      )
      if (adapters.length + ownedHandlers.length === 0) {
        return unavailablePage()
      }
      const result = await fanOutAvailabilitySearch({
        ...resolved,
        adapters,
        ownedHandlers,
        request: stayRequest(input.scope, input.intent),
        ...(input.continuation
          ? {
              continuationCursors: {
                sourced: Object.fromEntries(
                  adapters.flatMap(({ connectionId }) => {
                    const cursor = continued.get(staySourcedKey(connectionId))
                    return cursor ? [[connectionId, cursor]] : []
                  }),
                ),
                owned: Object.fromEntries(
                  ownedHandlers.flatMap(({ handler }) => {
                    const cursor = continued.get(stayOwnedKey(handler.entityModule))
                    return cursor ? [[handler.entityModule, cursor]] : []
                  }),
                ),
              },
            }
          : {}),
        ...(options.perSourceTimeoutMs !== undefined
          ? { perConnectionTimeoutMs: options.perSourceTimeoutMs }
          : {}),
      })
      const items = (
        await Promise.all(
          result.candidates.map(async (candidate) => {
            try {
              const presentation = await stays.present({
                context: input.context,
                scope: input.scope,
                candidate,
              })
              if (!presentation) return undefined
              return mapStay(candidate, input.intent, presentation)
            } catch {
              return undefined
            }
          }),
        )
      ).filter((item): item is PublicApiInternalStayOffer => item !== undefined)
      const dropped = result.candidates.length - items.length
      return {
        items,
        sources: result.perConnection.map(({ status }) => {
          const mapped = mapAvailabilityStatus(status)
          return {
            status: dropped > 0 && (mapped === "ok" || mapped === "empty") ? "partial" : mapped,
          }
        }),
        ...continuationResult(
          result.perConnection.flatMap(({ source, kind, status, nextCursor }) =>
            (status === "ok" || status === "partial" || status === "empty") && nextCursor
              ? [
                  {
                    key: kind === "sourced" ? staySourcedKey(source) : stayOwnedKey(source),
                    cursor: nextCursor,
                  },
                ]
              : [],
          ),
        ),
      }
    },

    async searchPackages(input) {
      if (!options.packages) return unavailablePage()
      const sources = await options.packages.resolveSources({
        context: input.context,
        scope: input.scope,
        destination: input.intent.destination,
      })
      const continued = continuationMap(input.continuation)
      const admittedSources = input.continuation
        ? sources.filter(({ continuationKey }) => continued.has(packageKey(continuationKey)))
        : sources
      if (admittedSources.length === 0) return unavailablePage()
      const pages = await Promise.all(
        admittedSources.map((source) =>
          runPackageSource(
            source,
            packageRequest(
              input.scope,
              input.intent,
              continued.get(packageKey(source.continuationKey)),
            ),
            options.perSourceTimeoutMs ?? 5_000,
          ),
        ),
      )
      return {
        items: pages.flatMap(({ offers }) => offers),
        sources: pages.map(({ status }) => ({ status })),
        ...continuationResult(
          pages.flatMap(({ key, status, nextCursor }) =>
            (status === "ok" || status === "partial" || status === "empty") && nextCursor
              ? [{ key: packageKey(key), cursor: nextCursor }]
              : [],
          ),
        ),
      }
    },

    async searchCruises(input) {
      if (!options.cruises) return unavailablePage()
      const sources = await options.cruises.resolveSources({
        context: input.context,
        scope: input.scope,
      })
      const admitted = sources.filter(
        ({ commitPolicy }) => commitPolicy === "reserve_with_idempotent_reconciliation",
      )
      if (admitted.length === 0) return unavailablePage()
      const pages = await Promise.all(
        admitted.map((source) =>
          runCruiseSource(
            source,
            {
              ...(input.intent.query ? { query: input.intent.query } : {}),
              ...(input.intent.departureDateFrom
                ? { departureDateFrom: input.intent.departureDateFrom }
                : {}),
              ...(input.intent.departureDateTo
                ? { departureDateTo: input.intent.departureDateTo }
                : {}),
              travelers: input.intent.travelers,
              ...(input.intent.cruiseTypes ? { cruiseTypes: input.intent.cruiseTypes } : {}),
              limit: input.intent.limit ?? 20,
              scope: {
                marketId: input.scope.marketId,
                locale: input.scope.locale,
                currency: input.scope.currency,
              },
            },
            options.perSourceTimeoutMs ?? 5_000,
          ),
        ),
      )
      return {
        items: pages.flatMap(({ offers }) => offers),
        sources: pages.map(({ status }) => ({ status })),
      }
    },
  }
}

function flightRequest(intent: FlightIntent): FanOutFlightSearchOptions["request"] {
  const childrenAges = intent.travelers.childrenAges
  return {
    slices: intent.slices,
    passengers: {
      adults: intent.travelers.adults,
      ...(childrenAges?.length ? { children: childrenAges.length } : {}),
      ...(intent.travelers.infants !== undefined ? { infants: intent.travelers.infants } : {}),
    },
    ...(intent.cabin ? { cabin: intent.cabin } : {}),
    ...(intent.directOnly !== undefined
      ? { searchOptions: { directOnly: intent.directOnly } }
      : {}),
    ...(intent.pagination ? { pagination: intent.pagination } : {}),
  }
}

function stayRequest(scope: PublicApiResolvedScope, intent: StayIntent): AvailabilitySearchRequest {
  const destination = {
    ...(intent.destination.query ? { query: intent.destination.query } : {}),
    ...(intent.destination.countryCode ? { countryCode: intent.destination.countryCode } : {}),
    ...(intent.destination.city ? { city: intent.destination.city } : {}),
  }
  const near =
    intent.destination.latitude !== undefined && intent.destination.longitude !== undefined
      ? { latitude: intent.destination.latitude, longitude: intent.destination.longitude }
      : undefined
  return {
    vertical: "accommodations",
    criteria: {
      ...(Object.keys(destination).length > 0 ? { destination } : {}),
      ...(near ? { near } : {}),
      checkIn: intent.checkIn,
      checkOut: intent.checkOut,
      rooms: intent.rooms.map((room) => ({
        adults: room.adults,
        ...(room.childrenAges?.length
          ? { children: room.childrenAges.length, childrenAges: room.childrenAges }
          : {}),
      })),
      ...(intent.minStars !== undefined ? { minStars: intent.minStars } : {}),
    },
    criteriaVersion: "accommodations.v1",
    scope: sourceScope(scope),
    ...(intent.pagination?.cursor ? { cursor: intent.pagination.cursor } : {}),
    ...(intent.pagination?.limit !== undefined ? { limit: intent.pagination.limit } : {}),
  }
}

function sourceScope(scope: PublicApiResolvedScope): AvailabilitySearchRequest["scope"] {
  return {
    locale: scope.locale,
    audience: "storefront",
    market: scope.marketId,
    currency: scope.currency,
  }
}

function mapMergedFlightOffers(
  merged: MergedFlightOffer,
  input: Omit<TrustedShoppingInput<FlightIntent>, "intent">,
) {
  const ownedOffers = [
    { offer: merged.cheapest, connectionId: merged.cheapestSourceConnectionId },
    ...merged.alternates.map((offer, index) => ({
      offer,
      connectionId: merged.alternateSourceConnectionIds[index],
    })),
  ]
  return ownedOffers.flatMap(({ offer, connectionId }) =>
    connectionId
      ? [
          {
            nativePrice: offer.totalPrice,
            itineraries: offer.itineraries.map((itinerary) => ({
              segments: itinerary.segments.map((segment) => ({
                origin: { code: segment.departure.iataCode, at: segment.departure.at },
                destination: { code: segment.arrival.iataCode, at: segment.arrival.at },
                marketingCarrier: segment.carrierCode,
                flightNumber: segment.flightNumber,
              })),
              ...(itinerary.duration ? { duration: itinerary.duration } : {}),
            })),
            selection: {
              offerId: offer.offerId,
              source: offer.source,
              itineraryFingerprint: merged.itineraryFingerprint,
              connectionId,
              authority: {
                channelId: input.context.channelId,
                marketId: input.scope.marketId,
                locale: input.scope.locale,
                currency: input.scope.currency,
              },
              offer,
              revision: 0,
            },
            ...(offer.providerData ? { providerData: offer.providerData } : {}),
            ...(offer.expiresAt ? { expiresAt: offer.expiresAt } : {}),
          },
        ]
      : [],
  )
}

function mapStay(
  candidate: PresentedAvailabilityCandidate,
  intent: StayIntent,
  presentation: PublicApiStayPresentation,
): PublicApiInternalStayOffer {
  if (!presentation.bookingTarget) {
    throw new Error("stay_booking_target_unavailable")
  }
  const candidateSelection = record(candidate.selection)
  const nestedRooms = Array.isArray(candidateSelection?.rooms)
    ? candidateSelection.rooms.flatMap((value) => {
        const room = record(value)
        const roomTypeId = nonEmptyString(room?.roomTypeId)
        const ratePlanId = nonEmptyString(room?.ratePlanId)
        if (!roomTypeId || !ratePlanId) return []
        return [
          {
            roomTypeId,
            ratePlanId,
            ...(record(room?.occupancy) ? { occupancy: record(room?.occupancy) } : {}),
          },
        ]
      })
    : []
  const flatRoomTypeId = nonEmptyString(candidateSelection?.roomTypeId)
  const flatRatePlanId = nonEmptyString(candidateSelection?.ratePlanId)
  const selectedRooms =
    nestedRooms.length > 0
      ? nestedRooms
      : flatRoomTypeId && flatRatePlanId
        ? [
            {
              roomTypeId: flatRoomTypeId,
              ratePlanId: flatRatePlanId,
              occupancy: {
                adults: intent.rooms[0]?.adults ?? 1,
                ...(intent.rooms[0]?.childrenAges?.length
                  ? { children: intent.rooms[0].childrenAges.length }
                  : {}),
              },
            },
          ]
        : []
  if (selectedRooms.length === 0) throw new Error("stay_rate_pin_unavailable")
  const firstRoom = selectedRooms[0]
  const pax = intent.rooms.reduce(
    (counts, room) => ({
      adult: counts.adult + room.adults,
      child: counts.child + (room.childrenAges?.length ?? 0),
    }),
    { adult: 0, child: 0 },
  )
  return {
    nativePrice: candidate.price,
    selection: {
      target: presentation.bookingTarget,
      configure: {
        dateRange: { checkIn: intent.checkIn, checkOut: intent.checkOut },
        pax,
        ...(firstRoom
          ? { roomTypeId: firstRoom.roomTypeId, ratePlanId: firstRoom.ratePlanId }
          : {}),
      },
      rooms: selectedRooms,
    },
    accommodationSelection: {
      entityModule: presentation.bookingTarget.entityModule,
      entityId: presentation.bookingTarget.entityId,
    },
    title: presentation.title,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    ...(presentation.roomName ? { roomName: presentation.roomName } : {}),
    ...(presentation.boardName ? { boardName: presentation.boardName } : {}),
    ...(presentation.image ? { image: presentation.image } : {}),
    ...(candidate.expiresAt ? { expiresAt: candidate.expiresAt.toISOString() } : {}),
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function packageRequest(
  scope: PublicApiResolvedScope,
  intent: PackageIntent,
  continuationCursor?: string,
) {
  return {
    origin: intent.origin,
    destination: intent.destination,
    departureDateFrom: intent.departureDateFrom,
    departureDateTo: intent.departureDateTo,
    nights: intent.nights,
    occupancy: {
      adults: intent.travelers.adults,
      ...(intent.travelers.childrenAges?.length
        ? {
            children: intent.travelers.childrenAges.length,
            childrenAges: intent.travelers.childrenAges,
          }
        : {}),
      ...(intent.travelers.infants !== undefined ? { infants: intent.travelers.infants } : {}),
    },
    ...(intent.boards ? { boards: intent.boards } : {}),
    ...(intent.minStars !== undefined ? { minStars: intent.minStars } : {}),
    ...(intent.pagination || continuationCursor
      ? {
          pagination: {
            ...intent.pagination,
            ...(continuationCursor ? { cursor: continuationCursor } : {}),
          },
        }
      : {}),
    scope: { marketId: scope.marketId, locale: scope.locale, currency: scope.currency },
  }
}

async function runPackageSource(
  source: PublicApiDynamicPackageSource,
  request: Parameters<PublicApiDynamicPackageSource["search"]>[0],
  timeoutMs: number,
): Promise<{
  key: string
  offers: readonly PublicApiInternalPackageOffer[]
  status: PublicApiLiveSourceStatus
  nextCursor?: string
}> {
  try {
    const result = await withTimeout(source.search(request), timeoutMs)
    return {
      key: source.continuationKey,
      offers: result.offers.map((offer) => ({
        ...offer,
        selection: { ...offer.selection },
      })),
      status: result.status ?? (result.offers.length > 0 ? "ok" : "empty"),
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    }
  } catch (error) {
    return {
      key: source.continuationKey,
      offers: [],
      status: error instanceof SourceTimeoutError ? "timeout" : "error",
    }
  }
}

function continuationMap(continuation: PublicApiLiveContinuation | undefined): Map<string, string> {
  return new Map(continuation?.sources.map(({ key, cursor }) => [key, cursor]) ?? [])
}

function continuationResult(sources: Array<{ key: string; cursor: string }>) {
  return sources.length > 0 ? { continuation: { sources } } : {}
}

function flightKey(connectionId: string): string {
  return `flight:${connectionId}`
}

function staySourcedKey(connectionId: string): string {
  return `stay:sourced:${connectionId}`
}

function stayOwnedKey(entityModule: string): string {
  return `stay:owned:${entityModule}`
}

function packageKey(sourceKey: string): string {
  return `package:${sourceKey}`
}

async function runCruiseSource(
  source: PublicApiCruiseSource,
  request: Parameters<PublicApiCruiseSource["search"]>[0],
  timeoutMs: number,
): Promise<{
  offers: readonly PublicApiInternalCruiseOffer[]
  status: PublicApiLiveSourceStatus
}> {
  try {
    const result = await withTimeout(source.search(request), timeoutMs)
    return {
      offers: result.offers.map((offer) => ({ ...offer })),
      status: result.status ?? (result.offers.length > 0 ? "ok" : "empty"),
    }
  } catch (error) {
    return { offers: [], status: error instanceof SourceTimeoutError ? "timeout" : "error" }
  }
}

class SourceTimeoutError extends Error {}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new SourceTimeoutError("dynamic package source timed out")),
          timeoutMs,
        )
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

function mapFlightStatus(
  status: "ok" | "timeout" | "error" | "not_found" | "capability_missing",
  count: number,
): PublicApiLiveSourceStatus {
  if (status === "ok") return count > 0 ? "ok" : "empty"
  if (status === "timeout") return "timeout"
  if (status === "error") return "error"
  return "unavailable"
}

function mapAvailabilityStatus(
  status:
    | "ok"
    | "partial"
    | "empty"
    | "unsupported"
    | "timeout"
    | "error"
    | "capability_missing"
    | "vertical_skipped",
): PublicApiLiveSourceStatus {
  if (
    status === "unsupported" ||
    status === "capability_missing" ||
    status === "vertical_skipped"
  ) {
    return "unavailable"
  }
  return status
}

function unavailablePage<T>(): PublicApiLiveSearchPage<T> {
  return { items: [], sources: [{ status: "unavailable" }] }
}
