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

/**
 * Closed live-search adapter. Implementations call the owned/sourced flight and
 * availability fan-outs directly and map their internal results here.
 */
export interface StorefrontShoppingLiveProvider {
  searchFlights(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: FlightIntent
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalFlightOffer>>
  searchStays(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: StayIntent
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalStayOffer>>
  searchPackages(input: {
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    intent: PackageIntent
  }): Promise<StorefrontLiveSearchPage<StorefrontInternalPackageOffer>>
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
  ["searchFlights", "searchStays", "searchPackages"],
)
export const storefrontPresentationFxProviderPort = definePort<PresentationFxQuoter>({
  id: "storefront.shopping.presentation-fx",
  test(provider) {
    if (typeof provider !== "function") {
      throw new Error("storefront.shopping.presentation-fx provider must be a function.")
    }
  },
})
