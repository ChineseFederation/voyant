import type { SearchFilter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type {
  CatalogMoney,
  PresentationFxQuoter,
} from "@voyant-travel/catalog-contracts/presentation-money"
import { definePort } from "@voyant-travel/core/project"

import type { StorefrontShoppingContext } from "./runtime-port.js"
import type { StorefrontResolvedScope, StorefrontShoppingIntent } from "./schemas.js"

export {
  type StorefrontOpaqueReferenceIssuer,
  storefrontOpaqueReferenceIssuerPort,
} from "./runtime-port.js"

export interface StorefrontActiveMarket {
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
export interface StorefrontShoppingMarketProvider {
  listActiveMarkets(input: {
    storefrontId: string
    channelId: string
  }): Promise<readonly StorefrontActiveMarket[]>
}

export interface StorefrontCatalogSliceSearchInput {
  /** Full server-derived ownership context; never populated from the request body. */
  context: StorefrontShoppingContext
  scope: StorefrontResolvedScope
  vertical: "products" | "accommodations" | "cruises" | "charters"
  query: string
  filters: readonly SearchFilter[]
  pagination?: { cursor?: string; limit?: number }
}

export interface StorefrontCatalogSliceItem {
  entityId: string
  title: string
  summary?: string
  href?: string
  image?: { url: string; alt?: string }
  nativePrice?: CatalogMoney
}

/** Adapter seam for the selected Catalog indexer; it is never an HTTP client. */
export interface StorefrontShoppingCatalogProvider {
  searchSlice(input: StorefrontCatalogSliceSearchInput): Promise<{
    items: readonly StorefrontCatalogSliceItem[]
    total: number
    nextCursor?: string
  }>
}

type FlightIntent = Extract<StorefrontShoppingIntent, { kind: "flight" }>
type StayIntent = Extract<StorefrontShoppingIntent, { kind: "stay" }>
type PackageIntent = Extract<StorefrontShoppingIntent, { kind: "package" }>
type CruiseIntent = Extract<StorefrontShoppingIntent, { kind: "cruise" }>

export interface StorefrontDynamicPackageSourceOffer {
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
  selection: StorefrontDynamicPackageBookingSelection
  providerData?: Readonly<Record<string, unknown>>
}

export interface StorefrontDynamicPackageBookingSelection {
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

export interface StorefrontDynamicPackageSource {
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
    scope: Pick<StorefrontResolvedScope, "marketId" | "locale" | "currency">
  }): Promise<{
    offers: readonly StorefrontDynamicPackageSourceOffer[]
    status?: "ok" | "partial" | "empty"
    nextCursor?: string
  }>
}

/**
 * Closed deployment source resolver. Implementations derive their operator,
 * connection admission, and credentials from server-owned configuration.
 */
export interface StorefrontDynamicPackageSourceProvider {
  resolveSources(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    destination: PackageIntent["destination"]
  }): Promise<readonly StorefrontDynamicPackageSource[]>
}

export interface StorefrontCruiseSourceOffer {
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

export interface StorefrontCruiseSource {
  /** Only sources with this exact commit/reconciliation policy may be admitted. */
  commitPolicy: "reserve_with_idempotent_reconciliation"
  search(input: {
    query?: string
    departureDateFrom?: string
    departureDateTo?: string
    travelers: CruiseIntent["travelers"]
    cruiseTypes?: CruiseIntent["cruiseTypes"]
    limit: number
    scope: Pick<StorefrontResolvedScope, "marketId" | "locale" | "currency">
  }): Promise<{
    offers: readonly StorefrontCruiseSourceOffer[]
    status?: "ok" | "partial" | "empty"
  }>
}

/** Closed resolver over Catalog-admitted cruise connections and credentials. */
export interface StorefrontCruiseSourceProvider {
  resolveSources(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
  }): Promise<readonly StorefrontCruiseSource[]>
}

export type StorefrontLiveSourceStatus =
  | "ok"
  | "partial"
  | "empty"
  | "timeout"
  | "error"
  | "unavailable"

export interface StorefrontLiveSearchPage<T> {
  /** Stable provider order. The managed provider sorts only after comparable FX normalization. */
  items: readonly T[]
  /** Deliberately contains no provider or connection identifiers. */
  sources: readonly { status: StorefrontLiveSourceStatus }[]
  /** Closed continuation state persisted by the opaque-reference authority. */
  continuation?: StorefrontLiveContinuation
}

export interface StorefrontLiveContinuation {
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

export interface StorefrontInternalFlightOffer extends InternalOffer {
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

export interface StorefrontInternalStayOffer extends InternalOffer {
  accommodationSelection: Readonly<Record<string, unknown>>
  title: string
  checkIn: string
  checkOut: string
  roomName?: string
  boardName?: string
  image?: { url: string; alt?: string }
}

export interface StorefrontInternalPackageOffer extends InternalOffer {
  title: string
  origin: string
  destination: string
  departureDate: string
  nights: number
  accommodationName: string
  boardName?: string
  image?: { url: string; alt?: string }
}

export interface StorefrontInternalCruiseOffer extends InternalOffer {
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
export interface StorefrontShoppingLiveProvider {
  searchFlights(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: FlightIntent
    continuation?: StorefrontLiveContinuation
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalFlightOffer>>
  searchStays(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: StayIntent
    continuation?: StorefrontLiveContinuation
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalStayOffer>>
  searchPackages(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: PackageIntent
    continuation?: StorefrontLiveContinuation
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalPackageOffer>>
  searchCruises(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: CruiseIntent
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalCruiseOffer>>
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

export const storefrontShoppingMarketProviderPort = methodsPort<StorefrontShoppingMarketProvider>(
  "storefront.shopping.market-provider",
  ["listActiveMarkets"],
)
export const storefrontShoppingCatalogProviderPort = methodsPort<StorefrontShoppingCatalogProvider>(
  "storefront.shopping.catalog-provider",
  ["searchSlice"],
)
export const storefrontShoppingLiveProviderPort = methodsPort<StorefrontShoppingLiveProvider>(
  "storefront.shopping.live-provider",
  ["searchFlights", "searchStays", "searchPackages", "searchCruises"],
)
export const storefrontDynamicPackageSourceProviderPort =
  methodsPort<StorefrontDynamicPackageSourceProvider>(
    "storefront.shopping.dynamic-package-source-provider",
    ["resolveSources"],
  )
export const storefrontPresentationFxProviderPort = definePort<PresentationFxQuoter>({
  id: "storefront.shopping.presentation-fx",
  test(provider) {
    if (typeof provider !== "function") {
      throw new Error("storefront.shopping.presentation-fx provider must be a function.")
    }
  },
})
