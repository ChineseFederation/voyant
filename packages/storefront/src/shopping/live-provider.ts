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
  StorefrontDynamicPackageSource,
  StorefrontDynamicPackageSourceProvider,
  StorefrontInternalPackageOffer,
  StorefrontInternalStayOffer,
  StorefrontLiveSearchPage,
  StorefrontLiveSourceStatus,
  StorefrontShoppingLiveProvider,
} from "./provider-ports.js"
import type { StorefrontShoppingContext } from "./runtime-port.js"
import type { StorefrontResolvedScope, StorefrontShoppingIntent } from "./schemas.js"

export type {
  StorefrontDynamicPackageSource,
  StorefrontDynamicPackageSourceOffer,
  StorefrontDynamicPackageSourceProvider,
} from "./provider-ports.js"

type FlightIntent = Extract<StorefrontShoppingIntent, { kind: "flight" }>
type StayIntent = Extract<StorefrontShoppingIntent, { kind: "stay" }>
type PackageIntent = Extract<StorefrontShoppingIntent, { kind: "package" }>

interface TrustedShoppingInput<TIntent> {
  context: StorefrontShoppingContext
  scope: StorefrontResolvedScope
  intent: TIntent
}

export interface StorefrontStayPresentation {
  title: string
  roomName?: string
  boardName?: string
  image?: { url: string; alt?: string }
}

/**
 * Closed deployment seam for source discovery. The resolver authenticates the
 * trusted storefront/channel tuple and returns only sources admitted to the
 * resolved market. Connection ids remain inside the fan-out invocation.
 */
export interface StorefrontLiveFlightFanOutResolver {
  resolve(
    input: Omit<TrustedShoppingInput<FlightIntent>, "intent">,
  ): Promise<Omit<FanOutFlightSearchOptions, "request" | "presentation">>
}

/** Closed equivalent for owned + sourced accommodation availability. */
export interface StorefrontLiveStayFanOutResolver {
  resolve(
    input: Omit<TrustedShoppingInput<StayIntent>, "intent">,
  ): Promise<Omit<FanOutAvailabilitySearchOptions, "request" | "presentation">>
  present(
    input: Omit<TrustedShoppingInput<StayIntent>, "intent"> & {
      candidate: PresentedAvailabilityCandidate
    },
  ): Promise<StorefrontStayPresentation | undefined>
}

/** @deprecated Use the provider-neutral source-provider name. */
export type StorefrontDynamicPackageConnectPort = StorefrontDynamicPackageSourceProvider

export interface CreateStorefrontShoppingLiveProviderOptions {
  flights?: StorefrontLiveFlightFanOutResolver
  stays?: StorefrontLiveStayFanOutResolver
  packages?: StorefrontDynamicPackageSourceProvider
  perSourceTimeoutMs?: number
}

/**
 * Maps the existing domain fan-outs onto Storefront's identity-free live page.
 * FX is deliberately not configured here: the managed Storefront runtime is
 * the sole presentation-money authority after all live verticals are mapped.
 */
export function createStorefrontShoppingLiveProvider(
  options: CreateStorefrontShoppingLiveProviderOptions,
): StorefrontShoppingLiveProvider {
  return {
    async searchFlights(input) {
      if (!options.flights) return unavailablePage()
      const resolved = await options.flights.resolve(input)
      if (resolved.adapters.length === 0) return unavailablePage()
      const result = await fanOutFlightSearch({
        ...resolved,
        request: flightRequest(input.intent),
        ...(options.perSourceTimeoutMs !== undefined
          ? { perConnectionTimeoutMs: options.perSourceTimeoutMs }
          : {}),
      })
      return {
        items: result.offers.flatMap(mapMergedFlightOffers),
        sources: result.perConnection.map(({ status, count }) => ({
          status: mapFlightStatus(status, count),
        })),
      }
    },

    async searchStays(input) {
      if (!options.stays) return unavailablePage()
      const stays = options.stays
      const resolved = await stays.resolve(input)
      if ((resolved.adapters?.length ?? 0) + (resolved.ownedHandlers?.length ?? 0) === 0) {
        return unavailablePage()
      }
      const result = await fanOutAvailabilitySearch({
        ...resolved,
        request: stayRequest(input.scope, input.intent),
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
      ).filter((item): item is StorefrontInternalStayOffer => item !== undefined)
      const dropped = result.candidates.length - items.length
      return {
        items,
        sources: result.perConnection.map(({ status }) => {
          const mapped = mapAvailabilityStatus(status)
          return {
            status: dropped > 0 && (mapped === "ok" || mapped === "empty") ? "partial" : mapped,
          }
        }),
      }
    },

    async searchPackages(input) {
      if (!options.packages) return unavailablePage()
      const sources = await options.packages.resolveSources({
        context: input.context,
        scope: input.scope,
        destination: input.intent.destination,
      })
      if (sources.length === 0) return unavailablePage()
      const pages = await Promise.all(
        sources.map((source) =>
          runPackageSource(
            source,
            packageRequest(input.scope, input.intent),
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

function stayRequest(
  scope: StorefrontResolvedScope,
  intent: StayIntent,
): AvailabilitySearchRequest {
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

function sourceScope(scope: StorefrontResolvedScope): AvailabilitySearchRequest["scope"] {
  return {
    locale: scope.locale,
    audience: "storefront",
    market: scope.marketId,
    currency: scope.currency,
  }
}

function mapMergedFlightOffers(merged: MergedFlightOffer) {
  return [merged.cheapest, ...merged.alternates].map((offer) => ({
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
      sourceConnectionIds: merged.sourceConnectionIds,
    },
    providerData: {
      sourceConnectionIds: merged.sourceConnectionIds,
      ...(offer.providerData ?? {}),
    },
    ...(offer.expiresAt ? { expiresAt: offer.expiresAt } : {}),
  }))
}

function mapStay(
  candidate: PresentedAvailabilityCandidate,
  intent: StayIntent,
  presentation: StorefrontStayPresentation,
): StorefrontInternalStayOffer {
  return {
    nativePrice: candidate.price,
    selection: {
      entityModule: candidate.entity_module,
      entityId: candidate.entity_id,
      selection: candidate.selection,
      source: candidate.source,
    },
    accommodationSelection: {
      entityModule: candidate.entity_module,
      entityId: candidate.entity_id,
    },
    providerData: candidate.providerData,
    title: presentation.title,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    ...(presentation.roomName ? { roomName: presentation.roomName } : {}),
    ...(presentation.boardName ? { boardName: presentation.boardName } : {}),
    ...(presentation.image ? { image: presentation.image } : {}),
    ...(candidate.expiresAt ? { expiresAt: candidate.expiresAt.toISOString() } : {}),
  }
}

function packageRequest(scope: StorefrontResolvedScope, intent: PackageIntent) {
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
    ...(intent.pagination ? { pagination: intent.pagination } : {}),
    scope: { marketId: scope.marketId, locale: scope.locale, currency: scope.currency },
  }
}

async function runPackageSource(
  source: StorefrontDynamicPackageSource,
  request: Parameters<StorefrontDynamicPackageSource["search"]>[0],
  timeoutMs: number,
): Promise<{
  offers: readonly StorefrontInternalPackageOffer[]
  status: StorefrontLiveSourceStatus
}> {
  try {
    const result = await withTimeout(source.search(request), timeoutMs)
    return {
      offers: result.offers,
      status: result.status ?? (result.offers.length > 0 ? "ok" : "empty"),
    }
  } catch (error) {
    return {
      offers: [],
      status: error instanceof SourceTimeoutError ? "timeout" : "error",
    }
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
): StorefrontLiveSourceStatus {
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
): StorefrontLiveSourceStatus {
  if (
    status === "unsupported" ||
    status === "capability_missing" ||
    status === "vertical_skipped"
  ) {
    return "unavailable"
  }
  return status
}

function unavailablePage<T>(): StorefrontLiveSearchPage<T> {
  return { items: [], sources: [{ status: "unavailable" }] }
}
