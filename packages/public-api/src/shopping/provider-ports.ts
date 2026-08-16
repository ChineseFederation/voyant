import type { SearchFilter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type {
  CatalogMoney,
  PresentationFxQuoter,
} from "@voyant-travel/catalog-contracts/presentation-money"
import { definePort } from "@voyant-travel/core/project"

import type { PublicApiShoppingContext } from "./runtime-port.js"
import type { PublicApiResolvedScope, PublicApiShoppingIntent } from "./schemas.js"

export {
  type PublicApiOpaqueReferenceIssuer,
  publicApiOpaqueReferenceIssuerPort,
} from "./runtime-port.js"

export interface PublicApiActiveMarket {
  id: string
  defaultLocale: string
  defaultCurrency: string
  locales: readonly string[]
  currencies: readonly string[]
  isDefault?: boolean
}

/**
 * Closed trust-plane seam. Implementations return only active Commerce markets
 * permitted for the already-authenticated storefront/channel pair.
 */
export interface PublicApiShoppingMarketProvider {
  listActiveMarkets(input: { channelId: string }): Promise<readonly PublicApiActiveMarket[]>
}

export interface PublicApiCatalogSliceSearchInput {
  /** Full server-derived ownership context; never populated from the request body. */
  context: PublicApiShoppingContext
  scope: PublicApiResolvedScope
  vertical: "products" | "accommodations" | "cruises" | "charters"
  query: string
  filters: readonly SearchFilter[]
  pagination?: { cursor?: string; limit?: number }
}

export interface PublicApiCatalogSliceItem {
  entityId: string
  title: string
  summary?: string
  href?: string
  image?: { url: string; alt?: string }
  nativePrice?: CatalogMoney
}

/** Adapter seam for the selected Catalog indexer; it is never an HTTP client. */
export interface PublicApiShoppingCatalogProvider {
  searchSlice(input: PublicApiCatalogSliceSearchInput): Promise<{
    items: readonly PublicApiCatalogSliceItem[]
    total: number
    nextCursor?: string
  }>
}

type FlightIntent = Extract<PublicApiShoppingIntent, { kind: "flight" }>
type StayIntent = Extract<PublicApiShoppingIntent, { kind: "stay" }>
type PackageIntent = Extract<PublicApiShoppingIntent, { kind: "package" }>
type CruiseIntent = Extract<PublicApiShoppingIntent, { kind: "cruise" }>

export interface PublicApiDynamicPackageSourceOffer {
  nativePrice: { amount: string; currency: string }
  title: string
  origin: string
  destination: string
  departureDate: string
  nights: number
  accommodationName: string
  boardName?: string
  image?: { url: string; alt?: string }
  expiresAt?: string
  /** Server-only stable booking target and pins persisted behind the opaque ref. */
  selection: PublicApiDynamicPackageBookingSelection
  providerData?: Readonly<Record<string, unknown>>
}

export interface PublicApiDynamicPackageBookingSelection {
  target: {
    entityModule: string
    entityId: string
    sourceKind: string
    sourceConnectionId: string
    sourceRef: string
  }
  configure: {
    departureDate: string
    departureAirportCode: string
    nights: number
    pax: Readonly<Record<string, number>>
    roomTypeId?: string
    ratePlanId?: string
    board?: string
  }
  offerExpiresAt: string
}

export interface PublicApiDynamicPackageSource {
  /** The source is a closure over its admitted connection(s) and credentials. */
  continuationKey: string
  search(input: {
    origin: string
    destination: PackageIntent["destination"]
    departureDateFrom: string
    departureDateTo: string
    nights: { min: number; max: number }
    occupancy: { adults: number; children?: number; childrenAges?: number[]; infants?: number }
    boards?: string[]
    minStars?: number
    pagination?: { cursor?: string; limit?: number }
    scope: Pick<PublicApiResolvedScope, "marketId" | "locale" | "currency">
  }): Promise<{
    offers: readonly PublicApiDynamicPackageSourceOffer[]
    status?: "ok" | "partial" | "empty"
    nextCursor?: string
  }>
}

/**
 * Closed deployment source resolver. Implementations derive their operator,
 * connection admission, and credentials from server-owned configuration.
 */
export interface PublicApiDynamicPackageSourceProvider {
  resolveSources(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
    destination: PackageIntent["destination"]
  }): Promise<readonly PublicApiDynamicPackageSource[]>
}

export interface PublicApiCruiseSourceOffer {
  nativePrice: CatalogMoney
  title: string
  cruiseType: "ocean" | "river" | "expedition" | "coastal"
  lineName: string
  shipName: string
  departureDate: string
  returnDate: string
  nights: number
  embarkPortName?: string
  disembarkPortName?: string
  cabinName: string
  availability: "available" | "limited"
  image?: { url: string; alt?: string }
  /** Exact admitted source ownership and booking configuration; opaque outside the server. */
  selection: Readonly<Record<string, unknown>>
}

export interface PublicApiCruiseSource {
  /** Only sources with this exact commit/reconciliation policy may be admitted. */
  commitPolicy: "reserve_with_idempotent_reconciliation"
  search(input: {
    query?: string
    departureDateFrom?: string
    departureDateTo?: string
    travelers: CruiseIntent["travelers"]
    cruiseTypes?: CruiseIntent["cruiseTypes"]
    limit: number
    scope: Pick<PublicApiResolvedScope, "marketId" | "locale" | "currency">
  }): Promise<{
    offers: readonly PublicApiCruiseSourceOffer[]
    status?: "ok" | "partial" | "empty"
  }>
}

/** Closed resolver over Catalog-admitted cruise connections and credentials. */
export interface PublicApiCruiseSourceProvider {
  resolveSources(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
  }): Promise<readonly PublicApiCruiseSource[]>
}

export type PublicApiLiveSourceStatus =
  | "ok"
  | "partial"
  | "empty"
  | "timeout"
  | "error"
  | "unavailable"

export interface PublicApiLiveSearchPage<T> {
  /** Stable provider order. The managed provider sorts only after comparable FX normalization. */
  items: readonly T[]
  /** Deliberately contains no provider or connection identifiers. */
  sources: readonly { status: PublicApiLiveSourceStatus }[]
  /** Closed continuation state persisted by the opaque-reference authority. */
  continuation?: PublicApiLiveContinuation
}

export interface PublicApiLiveContinuation {
  /** Stable server-only source key. Never serialized into the public result. */
  sources: readonly { key: string; cursor: string }[]
}

interface InternalOffer {
  nativePrice: CatalogMoney
  /** Closed payload retained only inside the opaque reference store. */
  selection: Readonly<Record<string, unknown>>
  providerData?: Readonly<Record<string, unknown>>
  expiresAt?: string
}

export interface PublicApiInternalFlightOffer extends InternalOffer {
  itineraries: Array<{
    segments: Array<{
      origin: { code: string; at: string }
      destination: { code: string; at: string }
      marketingCarrier: string
      flightNumber: string
    }>
    duration?: string
  }>
}

export interface PublicApiInternalStayOffer extends InternalOffer {
  accommodationSelection: Readonly<Record<string, unknown>>
  title: string
  checkIn: string
  checkOut: string
  roomName?: string
  boardName?: string
  image?: { url: string; alt?: string }
}

export interface PublicApiInternalPackageOffer extends InternalOffer {
  title: string
  origin: string
  destination: string
  departureDate: string
  nights: number
  accommodationName: string
  boardName?: string
  image?: { url: string; alt?: string }
}

export interface PublicApiInternalCruiseOffer extends InternalOffer {
  title: string
  cruiseType: "ocean" | "river" | "expedition" | "coastal"
  lineName: string
  shipName: string
  departureDate: string
  returnDate: string
  nights: number
  embarkPortName?: string
  disembarkPortName?: string
  cabinName: string
  availability: "available" | "limited"
  image?: { url: string; alt?: string }
}

/**
 * Closed live-search adapter. Implementations call the owned/sourced flight and
 * availability fan-outs directly and map their internal results here.
 */
export interface PublicApiShoppingLiveProvider {
  searchFlights(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
    intent: FlightIntent
    continuation?: PublicApiLiveContinuation
  }): Promise<PublicApiLiveSearchPage<PublicApiInternalFlightOffer>>
  searchStays(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
    intent: StayIntent
    continuation?: PublicApiLiveContinuation
  }): Promise<PublicApiLiveSearchPage<PublicApiInternalStayOffer>>
  searchPackages(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
    intent: PackageIntent
    continuation?: PublicApiLiveContinuation
  }): Promise<PublicApiLiveSearchPage<PublicApiInternalPackageOffer>>
  searchCruises(input: {
    context: PublicApiShoppingContext
    scope: PublicApiResolvedScope
    intent: CruiseIntent
  }): Promise<PublicApiLiveSearchPage<PublicApiInternalCruiseOffer>>
}

function methodsPort<T>(id: string, methods: readonly string[]) {
  return definePort<T>({
    id,
    test(provider) {
      if (provider === null || typeof provider !== "object") {
        throw new Error(`${id} provider must be an object.`)
      }
      for (const method of methods) {
        if (typeof (provider as Record<string, unknown>)[method] !== "function") {
          throw new Error(`${id} provider must implement ${method}().`)
        }
      }
    },
  })
}

export const publicApiShoppingMarketProviderPort = methodsPort<PublicApiShoppingMarketProvider>(
  "public-api.shopping.market-provider",
  ["listActiveMarkets"],
)
export const publicApiShoppingCatalogProviderPort = methodsPort<PublicApiShoppingCatalogProvider>(
  "public-api.shopping.catalog-provider",
  ["searchSlice"],
)
export const publicApiShoppingLiveProviderPort = methodsPort<PublicApiShoppingLiveProvider>(
  "public-api.shopping.live-provider",
  ["searchFlights", "searchStays", "searchPackages", "searchCruises"],
)
export const publicApiDynamicPackageSourceProviderPort =
  methodsPort<PublicApiDynamicPackageSourceProvider>(
    "public-api.shopping.dynamic-package-source-provider",
    ["resolveSources"],
  )
export const publicApiPresentationFxProviderPort = definePort<PresentationFxQuoter>({
  id: "public-api.shopping.presentation-fx",
  test(provider) {
    if (typeof provider !== "function") {
      throw new Error("storefront.shopping.presentation-fx provider must be a function.")
    }
  },
})
