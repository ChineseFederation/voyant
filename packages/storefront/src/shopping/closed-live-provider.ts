import type { CatalogRuntimeServices } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  type CruiseAdapter,
  type CruiseSourceAdapterShim,
  type ExternalCabinCategory,
  type ExternalPriceRow,
  type ExternalSailing,
  encodeSourceRef,
  type SourceRef,
} from "@voyant-travel/cruises/adapters"
import { composeQuote } from "@voyant-travel/cruises/service-pricing"
import type { FlightsRuntime } from "@voyant-travel/flights"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createStorefrontShoppingLiveProvider } from "./live-provider.js"
import type {
  StorefrontCruiseSource,
  StorefrontCruiseSourceOffer,
  StorefrontDynamicPackageSourceProvider,
  StorefrontShoppingLiveProvider,
  StorefrontShoppingMarketProvider,
} from "./provider-ports.js"
import { StorefrontShoppingUnavailableError } from "./runtime.js"
import type { StorefrontShoppingContext } from "./runtime-port.js"
import type { StorefrontResolvedScope } from "./schemas.js"

export interface ClosedStorefrontShoppingLiveProviderOptions {
  primitives: VoyantRuntimeHostPrimitives
  catalogServices: CatalogRuntimeServices
  markets: StorefrontShoppingMarketProvider
  flights?: Pick<FlightsRuntime, "listAdmittedShoppingSources">
  packages?: StorefrontDynamicPackageSourceProvider
  loadStayPresentation?: CatalogRuntimeServices["presentAvailabilityCandidate"]
}

/**
 * Production live-shopping composition over the graph-admitted Catalog
 * runtime. Flight supply is enumerated only through the graph-admitted Flights
 * runtime and only after the trusted storefront/channel/scope is revalidated.
 */
export function createClosedStorefrontShoppingLiveProvider(
  options: ClosedStorefrontShoppingLiveProviderOptions,
): StorefrontShoppingLiveProvider {
  const present =
    options.loadStayPresentation ?? options.catalogServices.presentAvailabilityCandidate
  const flights = options.flights

  return createStorefrontShoppingLiveProvider({
    ...(flights
      ? {
          flights: {
            async resolve(input) {
              await assertActiveScope(options.markets, input.context, input.scope)
              return {
                adapters: await flights.listAdmittedShoppingSources({
                  storefrontId: input.context.storefrontId,
                  channelId: input.context.channelId,
                  marketId: input.scope.marketId,
                  locale: input.scope.locale,
                  currency: input.scope.currency,
                }),
              }
            },
          },
        }
      : {}),
    stays: {
      async resolve(input) {
        await assertActiveScope(options.markets, input.context, input.scope)
        const env = options.primitives.env(undefined)
        const registry = await options.catalogServices.ensureSourceRegistry(env)
        const adapters = registry.connections().flatMap((connectionId) => {
          const adapter = registry.resolveByConnection(connectionId)
          if (
            !adapter?.capabilities.verticals.includes("accommodations") ||
            adapter.capabilities.supportsAvailabilitySearch !== true ||
            typeof adapter.searchAvailability !== "function"
          ) {
            return []
          }
          return [{ connectionId, adapter }]
        })
        const owned = options.catalogServices.getOwnedAvailabilitySearchHandlers()
        const db = options.primitives.database.resolve<PostgresJsDatabase>(undefined)
        return {
          adapters,
          ownedHandlers: owned.modules().flatMap((entityModule) => {
            if (entityModule !== "accommodations") return []
            const handler = owned.resolve(entityModule)
            return handler
              ? [
                  {
                    handler,
                    context: {
                      db,
                      adapterContext: { connection_id: `owned:${entityModule}` },
                    },
                  },
                ]
              : []
          }),
        }
      },
      async present(input) {
        if (!present) return undefined
        await assertActiveScope(options.markets, input.context, input.scope)
        const registry = await options.catalogServices.ensureSourceRegistry(
          options.primitives.env(undefined),
        )
        return present({
          db: options.primitives.database.resolve<PostgresJsDatabase>(undefined),
          registry,
          candidate: input.candidate,
          locale: input.scope.locale,
          market: input.scope.marketId,
          currency: input.scope.currency,
        })
      },
    },
    ...(options.packages
      ? {
          packages: {
            async resolveSources(input) {
              await assertActiveScope(options.markets, input.context, input.scope)
              return options.packages?.resolveSources(input) ?? []
            },
          },
        }
      : {}),
    cruises: {
      async resolveSources(input) {
        await assertActiveScope(options.markets, input.context, input.scope)
        const registry = await options.catalogServices.ensureSourceRegistry(
          options.primitives.env(undefined),
        )
        return registry.connections().flatMap((connectionId) => {
          const adapter = registry.resolveByConnection(connectionId)
          if (!isAdmittedCruiseShim(adapter)) return []
          return [cruiseSource(connectionId, adapter)]
        })
      },
    },
  })
}

function isAdmittedCruiseShim(value: unknown): value is CruiseSourceAdapterShim {
  if (!value || typeof value !== "object") return false
  const adapter = value as Partial<CruiseSourceAdapterShim>
  return (
    adapter.capabilities?.verticals.includes("cruises") === true &&
    adapter.capabilities.supportsLiveResolution === true &&
    adapter.capabilities.supportsBookingForwarding === true &&
    typeof adapter.liveResolve === "function" &&
    typeof adapter.reserve === "function" &&
    typeof adapter.cruiseAdapter?.listEntries === "function" &&
    typeof adapter.cruiseAdapter?.getBookingByIdempotencyKey === "function"
  )
}

function cruiseSource(
  connectionId: string,
  sourceAdapter: CruiseSourceAdapterShim,
): StorefrontCruiseSource {
  const adapter = sourceAdapter.cruiseAdapter
  return {
    commitPolicy: "reserve_with_idempotent_reconciliation",
    async search(input) {
      const page = await adapter.listEntries({ limit: Math.min(100, input.limit * 5) })
      const offers = []
      let degraded = page.nextCursor !== undefined
      for (const entry of page.entries) {
        if (offers.length >= input.limit) break
        if (!matchesCruiseQuery(entry, input.query, input.cruiseTypes)) continue
        try {
          const sailings = await adapter.listSailingsForCruise(entry.sourceRef)
          for (const sailing of sailings) {
            if (offers.length >= input.limit) break
            if (!matchesSailing(sailing, input.departureDateFrom, input.departureDateTo)) continue
            const offer = await cruiseOffer({
              adapter,
              sourceAdapter,
              connectionId,
              entry,
              sailing,
              travelers: input.travelers,
            })
            if (offer) offers.push(offer)
          }
        } catch {
          degraded = true
        }
      }
      return {
        offers,
        status: degraded ? "partial" : offers.length > 0 ? "ok" : "empty",
      }
    },
  }
}

async function cruiseOffer(input: {
  adapter: CruiseAdapter
  sourceAdapter: CruiseSourceAdapterShim
  connectionId: string
  entry: Awaited<ReturnType<CruiseAdapter["listEntries"]>>["entries"][number]
  sailing: ExternalSailing
  travelers: {
    adults: number
    childrenAges?: number[]
    infants?: number
    seniors?: number
  }
}): Promise<StorefrontCruiseSourceOffer | undefined> {
  const occupancy =
    input.travelers.adults +
    (input.travelers.childrenAges?.length ?? 0) +
    (input.travelers.infants ?? 0) +
    (input.travelers.seniors ?? 0)
  const [prices, ship] = await Promise.all([
    input.adapter.fetchSailingPricing(input.sailing.sourceRef),
    input.adapter.fetchShip(input.sailing.shipRef),
  ])
  if (!ship) return undefined
  const bookable = prices.flatMap((price) => {
    const cabin = ship.categories?.find(({ sourceRef }) =>
      sourceRefsMatch(sourceRef, price.cabinCategoryRef),
    )
    if (!cabin || !isBookablePrice(price, occupancy, cabin)) return []
    const quote = externalQuote(price, occupancy)
    return [{ price, cabin, quote }]
  })
  bookable.sort(
    (left, right) => Number(left.quote.totalForCabin) - Number(right.quote.totalForCabin),
  )
  const selected = bookable[0]
  if (!selected) return undefined
  const passengerComposition = {
    adults: input.travelers.adults,
    ...(input.travelers.childrenAges?.length
      ? {
          children: input.travelers.childrenAges.length,
          childAges: input.travelers.childrenAges,
        }
      : {}),
    ...(input.travelers.infants ? { infants: input.travelers.infants } : {}),
    ...(input.travelers.seniors ? { seniors: input.travelers.seniors } : {}),
  }
  return {
    nativePrice: { amount: selected.quote.totalForCabin, currency: selected.quote.currency },
    title: input.entry.name,
    cruiseType: input.entry.cruiseType,
    lineName: input.entry.lineName,
    shipName: ship.name,
    departureDate: input.sailing.departureDate,
    returnDate: input.sailing.returnDate,
    nights: input.entry.nights,
    ...(input.sailing.embarkPortName ? { embarkPortName: input.sailing.embarkPortName } : {}),
    ...(input.sailing.disembarkPortName
      ? { disembarkPortName: input.sailing.disembarkPortName }
      : {}),
    cabinName: selected.cabin.name,
    availability: selected.price.availability,
    ...(input.entry.heroImageUrl
      ? { image: { url: input.entry.heroImageUrl, alt: input.entry.name } }
      : {}),
    selection: {
      target: {
        entityModule: "cruises",
        entityId: `cruise:${input.entry.sourceRef.externalId}`,
        sourceKind: input.sourceAdapter.kind,
        sourceConnectionId: input.connectionId,
        sourceRef: encodeSourceRef(input.entry.sourceRef),
      },
      configure: {
        sailingId: encodeSourceRef(input.sailing.sourceRef),
        cabinCategoryId: encodeSourceRef(selected.price.cabinCategoryRef),
        occupancy,
        passengerComposition,
        fareCode: selected.price.fareCode ?? null,
        fareVariant: selected.price.fareVariant ?? "cruise_only",
        bookingTerms: selected.price.bookingTerms ?? null,
      },
    },
  }
}

function matchesCruiseQuery(
  entry: Awaited<ReturnType<CruiseAdapter["listEntries"]>>["entries"][number],
  query: string | undefined,
  cruiseTypes: readonly string[] | undefined,
): boolean {
  if (cruiseTypes && !cruiseTypes.includes(entry.cruiseType)) return false
  if (!query) return true
  const needle = query.trim().toLocaleLowerCase()
  return [entry.name, entry.lineName, entry.shipName]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLocaleLowerCase().includes(needle))
}

function matchesSailing(
  sailing: ExternalSailing,
  from: string | undefined,
  to: string | undefined,
): boolean {
  if (from && sailing.departureDate < from) return false
  if (to && sailing.departureDate > to) return false
  return sailing.salesStatus === undefined || sailing.salesStatus === "open"
}

function isBookablePrice(
  price: ExternalPriceRow,
  occupancy: number,
  cabin: ExternalCabinCategory,
): price is ExternalPriceRow & { availability: "available" | "limited" } {
  return (
    price.occupancy === occupancy &&
    occupancy >= cabin.minOccupancy &&
    occupancy <= cabin.maxOccupancy &&
    (price.availability === "available" || price.availability === "limited") &&
    price.requiresRequest !== true
  )
}

function externalQuote(price: ExternalPriceRow, occupancy: number) {
  return composeQuote({
    price: {
      pricePerPerson: price.pricePerPerson,
      originalPricePerPerson: price.originalPricePerPerson ?? null,
      secondGuestPricePerPerson: price.secondGuestPricePerPerson ?? null,
      singlePricePerPerson: price.singlePricePerPerson ?? null,
      singleSupplementPercent: price.singleSupplementPercent ?? null,
      currency: price.currency,
      fareCode: price.fareCode ?? null,
      fareCodeName: price.fareCodeName ?? null,
      fareVariant: price.fareVariant ?? "cruise_only",
      earlyBookingDeadline: price.earlyBookingDeadline ?? null,
      earlyBookingBonusDescription: price.earlyBookingBonusDescription ?? null,
    },
    components: (price.components ?? []).map((component) => ({
      ...component,
      label: component.label ?? null,
    })),
    occupancy,
    guestCount: occupancy,
    ...(price.bookingTerms !== undefined ? { bookingTerms: price.bookingTerms } : {}),
  })
}

function sourceRefsMatch(left: SourceRef, right: SourceRef): boolean {
  return encodeSourceRef(left) === encodeSourceRef(right)
}

async function assertActiveScope(
  markets: StorefrontShoppingMarketProvider,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
): Promise<void> {
  const active = await markets.listActiveMarkets({
    storefrontId: context.storefrontId,
    channelId: context.channelId,
  })
  const market = active.find(({ id }) => id === scope.marketId)
  const currency = scope.currency.trim().toUpperCase()
  if (
    !market?.locales.includes(scope.locale) ||
    !active.some(({ currencies }) =>
      currencies.map((candidate) => candidate.trim().toUpperCase()).includes(currency),
    )
  ) {
    throw new StorefrontShoppingUnavailableError("active market scope")
  }
}
