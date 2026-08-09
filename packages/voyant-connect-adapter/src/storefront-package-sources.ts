import {
  createVoyantConnectClient,
  type PackageOffer,
  type PackageSearchQuery,
} from "@voyant-travel/connect-sdk"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type {
  StorefrontDynamicPackageSourceOffer,
  StorefrontDynamicPackageSourceProvider,
} from "@voyant-travel/storefront/shopping/provider-ports"

import { resolveVoyantConnectEnv } from "./env.js"

const BOARD_CODES = new Set(["RO", "BB", "HB", "FB", "AI"])

/** Connect's admitted cross-provider package search behind Storefront's closed port. */
export function createVoyantConnectStorefrontPackageSourceProvider(
  primitives: VoyantRuntimeHostPrimitives,
): StorefrontDynamicPackageSourceProvider {
  return {
    async resolveSources() {
      const config = resolveVoyantConnectEnv(primitives.env(undefined), {
        warn: (message) => console.warn(`[voyant-connect] ${message}`),
      })
      if (!config) return []
      const client = createVoyantConnectClient({
        apiKey: config.apiKey,
        operatorId: config.operatorId,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
      })
      return [
        {
          continuationKey: "voyant-connect-packages",
          async search(input) {
            const query = packageQuery(input)
            const response = await client.packages.searchAcrossProviders(query, {
              operatorId: config.operatorId,
            })
            const mapped = response.offers.flatMap((offer) => {
              const value = packageOffer(offer, input)
              return value ? [value] : []
            })
            const degraded =
              mapped.length !== response.offers.length ||
              response.connectionDiagnostics?.some(({ status }) => status !== "ok") === true
            return {
              offers: mapped,
              status: degraded ? "partial" : mapped.length > 0 ? "ok" : "empty",
              ...connectContinuation(response),
            }
          },
        },
      ]
    },
  }
}

function connectContinuation(response: unknown): { nextCursor?: string } {
  if (!response || typeof response !== "object") return {}
  const value = response as {
    nextCursor?: unknown
    next_cursor?: unknown
    pagination?: { cursor?: unknown }
  }
  const cursor = value.nextCursor ?? value.next_cursor ?? value.pagination?.cursor
  return typeof cursor === "string" && cursor.length > 0 ? { nextCursor: cursor } : {}
}

type PackageSourceInput = Parameters<
  Awaited<ReturnType<StorefrontDynamicPackageSourceProvider["resolveSources"]>>[number]["search"]
>[0]

function packageQuery(input: PackageSourceInput): PackageSearchQuery {
  if (input.minStars !== undefined) {
    throw new Error("Connect package search does not support a minimum-stars constraint")
  }
  if (input.destination.query || input.destination.latitude || input.destination.longitude) {
    throw new Error("Connect package search requires a country or city destination")
  }
  const boards = input.boards?.map((board) => board.toUpperCase())
  if (boards?.some((board) => !BOARD_CODES.has(board))) {
    throw new Error("Connect package search received an unsupported board code")
  }
  return {
    departure: { airportCodes: [input.origin] },
    destination: {
      ...(input.destination.countryCode
        ? { countryCode: input.destination.countryCode.toUpperCase() }
        : {}),
      ...(input.destination.city ? { city: input.destination.city } : {}),
    },
    departureDateFrom: input.departureDateFrom,
    departureDateTo: input.departureDateTo,
    nights: input.nights,
    occupancy: input.occupancy,
    ...(boards ? { boards: boards as PackageSearchQuery["boards"] } : {}),
    flightIncluded: true,
    locale: input.scope.locale,
    ...(input.pagination?.limit !== undefined ? { limit: input.pagination.limit } : {}),
    ...(input.pagination?.cursor ? { cursor: input.pagination.cursor } : {}),
  }
}

function packageOffer(
  offer: PackageOffer,
  input: PackageSourceInput,
): StorefrontDynamicPackageSourceOffer | undefined {
  const accommodationName = offer.stay.name ?? offer.stay.ref.label ?? undefined
  if (!accommodationName || offer.flights.length === 0) return undefined
  const firstFlight = offer.flights[0]
  const lastFlight = offer.flights.at(-1)
  const destination =
    input.destination.city ?? input.destination.countryCode ?? lastFlight?.destination
  if (!firstFlight || !destination) return undefined
  return {
    nativePrice: money(offer.pricing.total),
    title: offer.title ?? `${accommodationName} package`,
    origin: firstFlight.origin,
    destination,
    departureDate: firstFlight.departureAt?.slice(0, 10) ?? input.departureDateFrom,
    nights: offer.stay.nights,
    accommodationName,
    boardName: offer.stay.board,
    expiresAt: offer.expiresAt,
    // Persist only stable re-resolution pins behind the opaque capability. The
    // broad short-lived provider offer never becomes Trip state.
    selection: {
      target: {
        entityModule: offer.productRef.entityModule,
        entityId: offer.productRef.entityId,
        sourceKind: "voyant-connect",
        sourceConnectionId: offer.connectionId,
        sourceRef: offer.stay.ref.entityId,
      },
      configure: {
        departureDate: firstFlight.departureAt?.slice(0, 10) ?? offer.stay.checkIn,
        departureAirportCode: firstFlight.origin,
        nights: offer.stay.nights,
        pax: {
          adult: offer.stay.occupancy.adults,
          ...(offer.stay.occupancy.children !== undefined
            ? { child: offer.stay.occupancy.children }
            : {}),
        },
        ...(offer.stay.roomTypeId ? { roomTypeId: offer.stay.roomTypeId } : {}),
        ...(offer.stay.ratePlanId ? { ratePlanId: offer.stay.ratePlanId } : {}),
        ...(offer.stay.board ? { board: offer.stay.board } : {}),
      },
      offerExpiresAt: offer.expiresAt,
    },
  }
}

function money(input: { amountMinor: number; currency: string; currencyPrecision: number }): {
  amount: string
  currency: string
} {
  const precision = input.currencyPrecision
  if (precision <= 0) return { amount: String(input.amountMinor), currency: input.currency }
  const negative = input.amountMinor < 0
  const digits = Math.abs(input.amountMinor)
    .toString()
    .padStart(precision + 1, "0")
  return {
    amount: `${negative ? "-" : ""}${digits.slice(0, -precision)}.${digits.slice(-precision)}`,
    currency: input.currency,
  }
}
