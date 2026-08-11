import {
  comparePresentationMoney,
  normalizePresentationMoney,
} from "@voyant-travel/catalog/search/presentation-money"
import type { SearchFilter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type { PresentationFxQuoter } from "@voyant-travel/catalog-contracts/presentation-money"
import { sha256Hex } from "@voyant-travel/hono"

import type {
  StorefrontActiveMarket,
  StorefrontCatalogSliceItem,
  StorefrontLiveContinuation,
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
const CONTINUATION_TTL_SECONDS = 5 * 60
const MAX_CONTINUATION_PAGE = 100
const MAX_CONTINUATION_SOURCES = 64
const MAX_SOURCE_KEY_LENGTH = 256
const MAX_SOURCE_CURSOR_LENGTH = 8_192

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

export class StorefrontShoppingContinuationError extends Error {
  readonly code = "storefront_shopping_continuation_unavailable"
  constructor() {
    super("Storefront shopping continuation is invalid, expired, consumed, or stale.")
    this.name = "StorefrontShoppingContinuationError"
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
        case "cruise":
          return searchCruises(options, context, input.scope, input.intent, now)
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
  const availableLocales = unique(
    markets.flatMap((market) => [market.defaultLocale, ...market.locales]),
  )
  const availableCurrencies = unique(
    markets.flatMap((market) => [market.defaultCurrency, ...market.currencies]).map(upperCurrency),
  )
  const requestedCurrency = requested.currency ? upperCurrency(requested.currency) : undefined
  const eligible = markets.filter(
    (candidate) => !requested.locale || resolveSupportedLocale(candidate, requested.locale),
  )
  const market = requested.marketId
    ? markets.find((candidate) => candidate.id === requested.marketId)
    : (eligible.find((candidate) => candidate.isDefault) ?? eligible[0])
  if (!market) {
    if (requested.marketId) {
      throw new StorefrontShoppingScopeError("marketId", requested.marketId)
    }
    if (requested.locale && !availableLocale(availableLocales, requested.locale)) {
      throw new StorefrontShoppingScopeError("locale", requested.locale)
    }
    if (requestedCurrency && !availableCurrencies.includes(requestedCurrency)) {
      throw new StorefrontShoppingScopeError("currency", requestedCurrency)
    }
    throw new StorefrontShoppingScopeError("market")
  }

  const locale = requested.locale
    ? resolveSupportedLocale(market, requested.locale)
    : market.defaultLocale
  const currency = requestedCurrency ?? upperCurrency(market.defaultCurrency)
  if (!locale) throw new StorefrontShoppingScopeError("locale", requested.locale)
  if (!availableCurrencies.includes(currency)) {
    throw new StorefrontShoppingScopeError("currency", currency)
  }

  return {
    marketId: market.id,
    locale,
    currency,
    available: {
      marketIds: markets.map(({ id }) => id),
      locales: availableLocales,
      currencies: availableCurrencies,
    },
  }
}

function marketLocales(market: StorefrontActiveMarket): string[] {
  return unique([market.defaultLocale, ...market.locales])
}

function baseLanguageRange(locale: string): string | null {
  try {
    const parsed = new Intl.Locale(locale)
    return parsed.region || parsed.script ? null : parsed.language
  } catch {
    return null
  }
}

function availableLocale(locales: readonly string[], requested: string): string | undefined {
  const exact = locales.find((locale) => locale === requested)
  if (exact) return exact
  const language = baseLanguageRange(requested)
  return language
    ? locales.find((locale) => new Intl.Locale(locale).language === language)
    : undefined
}

function resolveSupportedLocale(
  market: StorefrontActiveMarket,
  requested: string,
): string | undefined {
  return availableLocale(marketLocales(market), requested)
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
            payload: {
              entityModule: mapping.vertical,
              entityId: item.entityId,
              ...(item.nativePrice
                ? { estimatedPricing: tripPricingEstimate(item.nativePrice) }
                : {}),
            },
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
type CruiseIntent = Extract<StorefrontShoppingIntent, { kind: "cruise" }>

async function searchFlights(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: FlightIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const continuation = await resolveLiveContinuation(options.references, context, scope, intent)
  const page = await options.live.searchFlights({
    context,
    scope,
    intent: withoutLiveCursor(intent),
    ...(continuation ? { continuation: continuation.state } : {}),
  })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const issued = await issueBoundedReference(options.references, now, {
        purpose: "flight-offer",
        context,
        scope,
        payload: {
          selection: item.selection,
          providerData: item.providerData,
          estimatedPricing: tripPricingEstimate(item.nativePrice, item.expiresAt),
        },
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
  const nextCursor = await issueLiveContinuation(
    options.references,
    now,
    context,
    scope,
    intent,
    page.continuation,
    continuation?.page ?? 0,
  )
  return {
    kind: "flight",
    scope,
    offers,
    coverage: coverage(page, normalized.dropped),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

async function searchStays(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: StayIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const continuation = await resolveLiveContinuation(options.references, context, scope, intent)
  const page = await options.live.searchStays({
    context,
    scope,
    intent: withoutLiveCursor(intent),
    ...(continuation ? { continuation: continuation.state } : {}),
  })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const [offer, accommodation] = await Promise.all([
        issueBoundedReference(options.references, now, {
          purpose: "stay-offer",
          context,
          scope,
          payload: {
            selection: item.selection,
            estimatedPricing: tripPricingEstimate(item.nativePrice, item.expiresAt),
          },
          replay: "single-use",
        }),
        issueBoundedReference(options.references, now, {
          purpose: "catalog-item",
          context,
          scope,
          payload: item.accommodationSelection,
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
  const nextCursor = await issueLiveContinuation(
    options.references,
    now,
    context,
    scope,
    intent,
    page.continuation,
    continuation?.page ?? 0,
  )
  return {
    kind: "stay",
    scope,
    offers,
    coverage: coverage(page, normalized.dropped),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

async function searchPackages(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: PackageIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const continuation = await resolveLiveContinuation(options.references, context, scope, intent)
  const page = await options.live.searchPackages({
    context,
    scope,
    intent: withoutLiveCursor(intent),
    ...(continuation ? { continuation: continuation.state } : {}),
  })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const issued = await issueBoundedReference(options.references, now, {
        purpose: "package-offer",
        context,
        scope,
        payload: {
          selection: item.selection,
          providerData: item.providerData,
          estimatedPricing: tripPricingEstimate(item.nativePrice, item.expiresAt),
        },
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
  const nextCursor = await issueLiveContinuation(
    options.references,
    now,
    context,
    scope,
    intent,
    page.continuation,
    continuation?.page ?? 0,
  )
  return {
    kind: "package",
    scope,
    offers,
    coverage: coverage(page, normalized.dropped),
    ...(nextCursor ? { nextCursor } : {}),
  }
}

type LiveIntent = FlightIntent | StayIntent | PackageIntent

async function resolveLiveContinuation(
  authority: StorefrontOpaqueReferenceIssuer,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: LiveIntent,
): Promise<{ state: StorefrontLiveContinuation; page: number } | undefined> {
  const ref = intent.pagination?.cursor
  if (!ref) return undefined
  const expectedFingerprint = await liveIntentFingerprint(intent)
  const resolved = await authority.redeem({
    ref,
    purpose: "live-continuation",
    storefrontId: context.storefrontId,
    channelId: context.channelId,
    owner: owner(context),
    scope: scopeBinding(scope),
    kind: intent.kind,
    intentFingerprint: expectedFingerprint,
  })
  if (!resolved) throw new StorefrontShoppingContinuationError()
  const payload = resolved.payload
  if (
    payload.version !== 1 ||
    payload.kind !== intent.kind ||
    payload.intentFingerprint !== expectedFingerprint ||
    typeof payload.page !== "number" ||
    !Number.isInteger(payload.page) ||
    (payload.page as number) < 1 ||
    (payload.page as number) >= MAX_CONTINUATION_PAGE ||
    !Array.isArray(payload.sources)
  ) {
    throw new StorefrontShoppingContinuationError()
  }
  const sources = payload.sources.flatMap((entry) => {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof (entry as { key?: unknown }).key !== "string" ||
      typeof (entry as { cursor?: unknown }).cursor !== "string"
    ) {
      return []
    }
    return [{ key: (entry as { key: string }).key, cursor: (entry as { cursor: string }).cursor }]
  })
  if (sources.length !== payload.sources.length || !validContinuationSources(sources)) {
    throw new StorefrontShoppingContinuationError()
  }
  return { state: { sources }, page: payload.page as number }
}

async function issueLiveContinuation(
  authority: StorefrontOpaqueReferenceIssuer,
  now: () => Date,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: LiveIntent,
  continuation: StorefrontLiveContinuation | undefined,
  currentPage: number,
): Promise<string | undefined> {
  if (!continuation || continuation.sources.length === 0) return undefined
  if (!validContinuationSources(continuation.sources)) {
    throw new StorefrontShoppingContinuationError()
  }
  const page = currentPage + 1
  if (page >= MAX_CONTINUATION_PAGE) return undefined
  const issued = await authority.issue({
    purpose: "live-continuation",
    storefrontId: context.storefrontId,
    channelId: context.channelId,
    owner: owner(context),
    scope: scopeBinding(scope),
    payload: {
      version: 1,
      kind: intent.kind,
      intentFingerprint: await liveIntentFingerprint(intent),
      page,
      sources: continuation.sources,
    },
    ttlSeconds: CONTINUATION_TTL_SECONDS,
    replay: "single-use",
  })
  validateIssuedReference(issued, now().getTime(), CONTINUATION_TTL_SECONDS)
  return issued.ref
}

function withoutLiveCursor<T extends LiveIntent>(intent: T): T {
  if (!intent.pagination?.cursor) return intent
  const { cursor: _cursor, ...pagination } = intent.pagination
  return {
    ...intent,
    ...(Object.keys(pagination).length > 0 ? { pagination } : { pagination: undefined }),
  } as T
}

async function liveIntentFingerprint(intent: LiveIntent): Promise<string> {
  return sha256Hex(canonicalJson(withoutLiveCursor(intent)))
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}

function validContinuationSources(sources: readonly { key: string; cursor: string }[]): boolean {
  return (
    sources.length <= MAX_CONTINUATION_SOURCES &&
    new Set(sources.map(({ key }) => key)).size === sources.length &&
    sources.every(
      ({ key, cursor }) =>
        key.length > 0 &&
        key.length <= MAX_SOURCE_KEY_LENGTH &&
        cursor.length > 0 &&
        cursor.length <= MAX_SOURCE_CURSOR_LENGTH,
    )
  )
}

function owner(context: StorefrontShoppingContext) {
  return {
    userId: context.userId ?? null,
    buyerAccountId: context.buyerAccountId ?? null,
  }
}

function scopeBinding(scope: StorefrontResolvedScope) {
  return { marketId: scope.marketId, locale: scope.locale, currency: scope.currency }
}

async function searchCruises(
  options: ManagedStorefrontShoppingRuntimeOptions,
  context: StorefrontShoppingContext,
  scope: StorefrontResolvedScope,
  intent: CruiseIntent,
  now: () => Date,
): Promise<StorefrontShoppingResult> {
  const page = await options.live.searchCruises({ context, scope, intent })
  const normalized = await normalizeLive(page, scope.currency, options.quoteFx)
  const offers = await Promise.all(
    normalized.items.map(async ({ item, price }) => {
      const issued = await issueBoundedReference(options.references, now, {
        purpose: "cruise-offer",
        context,
        scope,
        payload: {
          selection: item.selection,
          providerData: item.providerData,
          estimatedPricing: tripPricingEstimate(item.nativePrice, item.expiresAt),
        },
        replay: "single-use",
      })
      return {
        offerRef: issued.ref,
        title: item.title,
        cruiseType: item.cruiseType,
        lineName: item.lineName,
        shipName: item.shipName,
        departureDate: item.departureDate,
        returnDate: item.returnDate,
        nights: item.nights,
        ...(item.embarkPortName ? { embarkPortName: item.embarkPortName } : {}),
        ...(item.disembarkPortName ? { disembarkPortName: item.disembarkPortName } : {}),
        cabinName: item.cabinName,
        availability: item.availability,
        ...(item.image ? { image: item.image } : {}),
        price,
        expiresAt: earlierExpiry(issued.expiresAt, item.expiresAt),
      }
    }),
  )
  return { kind: "cruise", scope, offers, coverage: coverage(page, normalized.dropped) }
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

/**
 * Preserve the provider-native, non-binding search estimate behind the opaque
 * reference. Trips needs an accepted estimate to freeze an itinerary before
 * Catalog immediately revalidates every component for the Booking Session.
 * Presentation/FX money is deliberately never accepted here.
 */
function tripPricingEstimate(money: { amount: string; currency: string }, priceExpiresAt?: string) {
  const fractionDigits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: money.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  const [whole = "0", fraction = ""] = money.amount.split(".")
  if (fraction.length > fractionDigits) throw new Error("native_price_precision_unsupported")
  const amountMinor = Number(BigInt(`${whole}${fraction.padEnd(fractionDigits, "0") || "0"}`))
  if (!Number.isSafeInteger(amountMinor)) throw new Error("native_price_amount_unsupported")
  return {
    currency: money.currency,
    subtotalAmountCents: amountMinor,
    taxAmountCents: 0,
    totalAmountCents: amountMinor,
    ...(priceExpiresAt ? { priceExpiresAt } : {}),
    warnings: ["non_binding_storefront_estimate"],
  }
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
    purpose: "catalog-item" | "flight-offer" | "stay-offer" | "package-offer" | "cruise-offer"
    context: StorefrontShoppingContext
    scope: StorefrontResolvedScope
    payload: Readonly<Record<string, unknown>>
    replay: "multi-use" | "single-use"
  },
) {
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
  validateIssuedReference(
    issued,
    now().getTime(),
    input.purpose === "catalog-item" ? ITEM_TTL_SECONDS : OFFER_TTL_SECONDS,
  )
  return issued
}

function validateIssuedReference(
  issued: { ref: string; expiresAt: string },
  issuedAt: number,
  ttlSeconds: number,
): void {
  if (issued.ref.length < 16 || issued.ref.length > 512) throw new Error("opaque_reference_invalid")
  const expiry = Date.parse(issued.expiresAt)
  const max = issuedAt + ttlSeconds * 1000
  if (!Number.isFinite(expiry) || expiry <= issuedAt || expiry > max) {
    throw new Error("opaque_reference_expiry_invalid")
  }
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
