import {
  comparePresentationMoney,
  normalizePresentationMoney,
} from "@voyant-travel/catalog/search/presentation-money"
import type { SearchFilter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type { PresentationFxQuoter } from "@voyant-travel/catalog-contracts/presentation-money"

import type {
  StorefrontCatalogSliceItem,
  StorefrontLiveSearchPage,
  StorefrontOpaqueReferenceIssuer,
  StorefrontShoppingCatalogProvider,
  StorefrontShoppingLiveProvider,
  StorefrontShoppingMarketProvider,
} from "./provider-ports.js"
import type { StorefrontShoppingContext, StorefrontShoppingRuntime } from "./runtime-port.js"
import type {
  StorefrontRequestedScope,
  StorefrontResolvedScope,
  StorefrontShoppingIntent,
  StorefrontShoppingResult,
} from "./schemas.js"

const OFFER_TTL_SECONDS = 15 * 60
const ITEM_TTL_SECONDS = 15 * 60

export class StorefrontShoppingScopeError extends Error {
  readonly code = "storefront_shopping_scope_unsupported"
  constructor(
    readonly selector: "marketId" | "locale" | "currency" | "market",
    readonly requested?: string,
  ) {
    super(`Unsupported storefront shopping ${selector}${requested ? `: ${requested}` : "."}`)
    this.name = "StorefrontShoppingScopeError"
  }
}

export interface ManagedStorefrontShoppingRuntimeOptions {
  markets: StorefrontShoppingMarketProvider
  catalog: StorefrontShoppingCatalogProvider
  live: StorefrontShoppingLiveProvider
  references: StorefrontOpaqueReferenceIssuer
  quoteFx?: PresentationFxQuoter
  now?: () => Date
}

/** Managed OSS implementation of the provider-first shopping runtime. */
export function createManagedStorefrontShoppingRuntime(
  options: ManagedStorefrontShoppingRuntimeOptions,
): StorefrontShoppingRuntime {
  const now = options.now ?? (() => new Date())

  return {
    async resolveScope(context, requested) {
      return resolveActiveScope(options.markets, context, requested)
    },
    async search(context, input) {
      switch (input.intent.kind) {
        case "indexed-inspiration":
          return searchInspiration(options, context, input.scope, input.intent, now)
        case "flight":
          return searchFlights(options, context, input.scope, input.intent, now)
        case "stay":
          return searchStays(options, context, input.scope, input.intent, now)
        case "package":
          return searchPackages(options, context, input.scope, input.intent, now)
      }
    },
  }
}

async function resolveActiveScope(
  provider: StorefrontShoppingMarketProvider,
  context: StorefrontShoppingContext,
  requested: StorefrontRequestedScope,
): Promise<StorefrontResolvedScope> {
  const markets = await provider.listActiveMarkets({
    storefrontId: context.storefrontId,
    channelId: context.channelId,
  })
  if (markets.length === 0) throw new StorefrontShoppingScopeError("market")
  const market = requested.marketId
    ? markets.find((candidate) => candidate.id === requested.marketId)
    : (markets.find((candidate) => candidate.isDefault) ?? markets[0])
  if (!market) throw new StorefrontShoppingScopeError("marketId", requested.marketId)

  const locales = unique([market.defaultLocale, ...market.locales])
  const currencies = unique([market.defaultCurrency, ...market.currencies].map(upperCurrency))
  const locale = requested.locale ?? market.defaultLocale
  const currency = upperCurrency(requested.currency ?? market.defaultCurrency)
  if (!locales.includes(locale)) throw new StorefrontShoppingScopeError("locale", locale)
  if (!currencies.includes(currency)) throw new StorefrontShoppingScopeError("currency", currency)

  return {
    marketId: market.id,
    locale,
    currency,
    available: { marketIds: markets.map(({ id }) => id), locales, currencies },
  }
}

type InspirationIntent = Extract<StorefrontShoppingIntent, { kind: "indexed-inspiration" }>

export function inspirationCatalogSlice(group: InspirationIntent["groups"][number]["group"]): {
  vertical: "products" | "accommodations" | "cruises" | "charters"
  filters: SearchFilter[]
} {
  switch (group) {
    case "tours":
      return { vertical: "products", filters: [{ kind: "eq", field: "familyCode", value: "tour" }] }
    case "activities":
      return {
        vertical: "products",
        filters: [{ kind: "eq", field: "familyCode", value: "activity" }],
      }
    case "attractions":
      return {
        vertical: "products",
        filters: [{ kind: "eq", field: "familyCode", value: "attraction" }],
      }
    case "experiences":
      return {
        vertical: "products",
        filters: [
          {
            kind: "or",
            clauses: [
              { kind: "in", field: "categorySlugs", values: ["experience", "experiences"] },
              { kind: "in", field: "subtypeCode", values: ["experience", "local-experience"] },
            ],
          },
        ],
      }
    case "excursions":
      return {
        vertical: "products",
        filters: [
          {
            kind: "in",
            field: "subtypeCode",
            values: ["excursion", "day-excursion", "shore-excursion"],
          },
        ],
      }
    case "stays":
      return { vertical: "accommodations", filters: [] }
    case "cruises":
      return { vertical: "cruises", filters: [] }
    case "charters":
      return { vertical: "charters", filters: [] }
  }
}

async function searchInspiration(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: InspirationIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const groups = await Promise.all(
    intent.groups.map(async (request) => {
      const mapping = inspirationCatalogSlice(request.group)
      const result = await options.catalog.searchSlice({
        context,
        scope,
        vertical: mapping.vertical,
        query: request.query ?? request.destination?.query ?? "",
        filters: [...mapping.filters, ...destinationFilters(request.destination)],
        pagination: request.pagination,
      })
      const normalized = await normalizePresentationMoney(
        result.items.flatMap((item) => (item.nativePrice ? [item.nativePrice] : [])),
        { targetCurrency: scope.currency, quoteFx: options.quoteFx },
      )
      let pricedIndex = 0
      const items = await Promise.all(
        result.items.map(async (item) => {
          const priceFrom = item.nativePrice ? normalized.prices[pricedIndex++] : undefined
          const issued = await issueBoundedReference(options.references, now, {
            purpose: "catalog-item",
            context,
            scope,
            payload: { entityModule: mapping.vertical, entityId: item.entityId },
            replay: "multi-use",
          })
          return publicCatalogItem(item, issued.ref, priceFrom)
        }),
      )
      return {
        group: request.group,
        items,
        total: result.total,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      }
    }),
  )
  return { kind: "indexed-inspiration", scope, groups }
}

function publicCatalogItem(
  item: StorefrontCatalogSliceItem,
  itemRef: string,
  priceFrom: Awaited<ReturnType<typeof normalizePresentationMoney>>["prices"][number],
) {
  return {
    itemRef,
    title: item.title,
    ...(item.summary ? { summary: item.summary } : {}),
    ...(item.href ? { href: item.href } : {}),
    ...(item.image ? { image: item.image } : {}),
    ...(priceFrom ? { priceFrom } : {}),
  }
}

type FlightIntent = Extract<StorefrontShoppingIntent, { kind: "flight" }>
type StayIntent = Extract<StorefrontShoppingIntent, { kind: "stay" }>
type PackageIntent = Extract<StorefrontShoppingIntent, { kind: "package" }>

async function searchFlights(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: FlightIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const page = await options.live.searchFlights({ context, scope, intent })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const issued = await issueBoundedReference(options.references, now, {
        purpose: "flight-offer",
        context,
        scope,
        payload: { selection: item.selection, providerData: item.providerData },
        replay: "single-use",
      })
      return {
        offerRef: issued.ref,
        itineraries: item.itineraries,
        price,
        expiresAt: earlierExpiry(issued.expiresAt, item.expiresAt),
      }
    }),
  )
  return { kind: "flight", scope, offers, coverage: coverage(page, normalized.dropped) }
}

async function searchStays(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: StayIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const page = await options.live.searchStays({ context, scope, intent })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const [offer, accommodation] = await Promise.all([
        issueBoundedReference(options.references, now, {
          purpose: "stay-offer",
          context,
          scope,
          payload: { selection: item.selection, providerData: item.providerData },
          replay: "single-use",
        }),
        issueBoundedReference(options.references, now, {
          purpose: "catalog-item",
          context,
          scope,
          payload: { entityModule: "accommodations", selection: item.accommodationSelection },
          replay: "multi-use",
        }),
      ])
      return {
        offerRef: offer.ref,
        accommodationRef: accommodation.ref,
        title: item.title,
        checkIn: item.checkIn,
        checkOut: item.checkOut,
        ...(item.roomName ? { roomName: item.roomName } : {}),
        ...(item.boardName ? { boardName: item.boardName } : {}),
        ...(item.image ? { image: item.image } : {}),
        price,
        expiresAt: earlierExpiry(offer.expiresAt, item.expiresAt),
      }
    }),
  )
  return { kind: "stay", scope, offers, coverage: coverage(page, normalized.dropped) }
}

async function searchPackages(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: PackageIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const page = await options.live.searchPackages({ context, scope, intent })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const issued = await issueBoundedReference(options.references, now, {
        purpose: "package-offer",
        context,
        scope,
        payload: { selection: item.selection, providerData: item.providerData },
        replay: "single-use",
      })
      return {
        offerRef: issued.ref,
        title: item.title,
        origin: item.origin,
        destination: item.destination,
        departureDate: item.departureDate,
        nights: item.nights,
        accommodationName: item.accommodationName,
        ...(item.boardName ? { boardName: item.boardName } : {}),
        ...(item.image ? { image: item.image } : {}),
        price,
        expiresAt: earlierExpiry(issued.expiresAt, item.expiresAt),
      }
    }),
  )
  return { kind: "package", scope, offers, coverage: coverage(page, normalized.dropped) }
}

async function normalizeLive<T extends { nativePrice: { amount: string; currency: string } }>(
  page: StorefrontLiveSearchPage<T>,
  currency: string,
  quoteFx: PresentationFxQuoter | undefined,
) {
  const normalized = await normalizePresentationMoney(
    page.items.map(({ nativePrice }) => nativePrice),
    { targetCurrency: currency, quoteFx },
  )
  const items = page.items.flatMap((item, index) => {
    const price = normalized.prices[index]
    return price ? [{ item, price }] : []
  })
  if (
    normalized.ranking.status === "ranked_native" ||
    normalized.ranking.status === "ranked_presentation"
  ) {
    items.sort((left, right) => comparePresentationMoney(left.price, right.price))
  }
  return { items, dropped: page.items.length - items.length }
}

function coverage(page: StorefrontLiveSearchPage<unknown>, dropped: number) {
  const succeeded = page.sources.filter(
    ({ status }) => status === "ok" || status === "partial" || status === "empty",
  ).length
  const timedOut = page.sources.filter(({ status }) => status === "timeout").length
  const failed = page.sources.length - succeeded - timedOut + (dropped > 0 ? 1 : 0)
  return {
    status:
      succeeded === 0
        ? failed > 0 || timedOut > 0
          ? "unavailable"
          : "complete"
        : failed > 0 || timedOut > 0 || page.sources.some(({ status }) => status === "partial")
          ? "partial"
          : "complete",
    succeeded,
    failed,
    timedOut,
  } as const
}

async function issueBoundedReference(
  issuer: StorefrontOpaqueReferenceIssuer,
  now: () => Date,
  input: {
    purpose: "catalog-item" | "flight-offer" | "stay-offer" | "package-offer"
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    payload: Readonly<Record<string, unknown>>
    replay: "multi-use" | "single-use"
  },
) {
  const issuedAt = now().getTime()
  const issued = await issuer.issue({
    purpose: input.purpose,
    storefrontId: input.context.storefrontId,
    channelId: input.context.channelId,
    owner: {
      userId: input.context.userId ?? null,
      buyerAccountId: input.context.buyerAccountId ?? null,
    },
    scope: {
      marketId: input.scope.marketId,
      locale: input.scope.locale,
      currency: input.scope.currency,
    },
    payload: input.payload,
    ttlSeconds: input.purpose === "catalog-item" ? ITEM_TTL_SECONDS : OFFER_TTL_SECONDS,
    replay: input.replay,
  })
  if (issued.ref.length < 16 || issued.ref.length > 512) throw new Error("opaque_reference_invalid")
  const expiry = Date.parse(issued.expiresAt)
  const max =
    issuedAt + (input.purpose === "catalog-item" ? ITEM_TTL_SECONDS : OFFER_TTL_SECONDS) * 1000
  if (!Number.isFinite(expiry) || expiry <= issuedAt || expiry > max) {
    throw new Error("opaque_reference_expiry_invalid")
  }
  return issued
}

function destinationFilters(
  destination: InspirationIntent["groups"][number]["destination"],
): SearchFilter[] {
  if (!destination) return []
  const filters: SearchFilter[] = []
  if (destination.countryCode) {
    filters.push({ kind: "in", field: "countryCodes", values: [destination.countryCode] })
  }
  if (destination.city) {
    filters.push({ kind: "in", field: "destinations", values: [destination.city] })
  }
  return filters
}

function earlierExpiry(issued: string, upstream: string | undefined): string {
  if (!upstream) return issued
  return Date.parse(upstream) < Date.parse(issued) ? upstream : issued
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function upperCurrency(value: string): string {
  return value.trim().toUpperCase()
}
