import type { CatalogSearchRuntimeOptions } from "@voyant-travel/catalog/api-runtime-ports"
import type { FieldPolicyRegistry } from "@voyant-travel/catalog/contract"
import type { CatalogRuntimeServices } from "@voyant-travel/catalog/runtime-contracts"
import type {
  IndexerDocument,
  IndexerSlice,
  SearchFilter,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { indexFieldNameForPolicyPath } from "@voyant-travel/catalog-contracts/indexer/contract"
import { listPublicMarkets, type PublicMarket } from "@voyant-travel/commerce"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type {
  PublicApiActiveMarket,
  PublicApiCatalogSliceItem,
  PublicApiShoppingCatalogProvider,
  PublicApiShoppingMarketProvider,
} from "./provider-ports.js"
import { PublicApiShoppingUnavailableError } from "./runtime.js"
import type { PublicApiShoppingContext } from "./runtime-port.js"

interface PublicApiChannelBindingDatabase {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

export interface ClosedPublicApiShoppingAdapterOptions {
  primitives: VoyantRuntimeHostPrimitives
  catalogSearch: CatalogSearchRuntimeOptions
  catalogServices: Pick<CatalogRuntimeServices, "fieldPolicyRegistries">
  listMarkets?: (db: PostgresJsDatabase) => Promise<PublicMarket[]>
  isActivePublicApiChannel?: (
    db: PostgresJsDatabase,
    context: Pick<PublicApiShoppingContext, "channelId">,
  ) => Promise<boolean>
}

export interface ClosedPublicApiShoppingAdapters {
  markets: PublicApiShoppingMarketProvider
  catalog: PublicApiShoppingCatalogProvider
}

/**
 * Compose the two read-only shopping adapters from the operator's own Commerce
 * and Catalog runtimes. No request body, tenant selector, provider selector, or
 * HTTP/admin route participates in this path.
 */
export function createClosedPublicApiShoppingAdapters(
  options: ClosedPublicApiShoppingAdapterOptions,
): ClosedPublicApiShoppingAdapters {
  const loadMarkets = options.listMarkets ?? listPublicMarkets
  const isActivePublicApiChannel =
    options.isActivePublicApiChannel ?? defaultIsActivePublicApiChannel

  const markets: PublicApiShoppingMarketProvider = {
    async listActiveMarkets(context) {
      const trusted = trustedPublicApiContext(context)
      const db = options.primitives.database.resolve<PostgresJsDatabase>(undefined)
      if (!(await isActivePublicApiChannel(db, trusted))) {
        throw new PublicApiShoppingUnavailableError("active channel")
      }
      return (await loadMarkets(db)).map(toActiveMarket)
    },
  }

  const catalog: PublicApiShoppingCatalogProvider = {
    async searchSlice(input) {
      const trusted = trustedPublicApiContext(input.context)
      await assertActiveScope(markets, trusted, input.scope)

      const registry = options.catalogServices.fieldPolicyRegistries().get(input.vertical)
      if (!registry) throw new PublicApiShoppingUnavailableError("catalog field policy")
      assertCustomerSearchFilters(registry, input.filters)

      const runtime = options.catalogSearch.resolveRuntime(
        catalogRuntimeContext(options.primitives, trusted),
      )
      if (!runtime.indexer) throw new PublicApiShoppingUnavailableError("catalog indexer")

      const slice: IndexerSlice = {
        vertical: input.vertical,
        locale: input.scope.locale,
        audience: "customer",
        market: input.scope.marketId,
        channel: trusted.channelId,
      }
      const result = await runtime.indexer.search(slice, {
        query: input.query,
        mode: "keyword",
        filters: [...input.filters],
        pagination: input.pagination,
      })

      return {
        items: result.hits.map(({ document }) => catalogItem(document, registry)),
        total: result.total,
        ...(result.next_cursor ? { nextCursor: result.next_cursor } : {}),
      }
    },
  }

  return { markets, catalog }
}

function trustedPublicApiContext(
  context: Pick<PublicApiShoppingContext, "channelId">,
): Pick<PublicApiShoppingContext, "channelId"> {
  const channelId = context.channelId.trim()
  if (!channelId) {
    throw new PublicApiShoppingUnavailableError("trusted channel context")
  }
  return { channelId }
}

async function assertActiveScope(
  provider: PublicApiShoppingMarketProvider,
  context: Pick<PublicApiShoppingContext, "channelId">,
  scope: { marketId: string; locale: string; currency: string },
): Promise<void> {
  const active = await provider.listActiveMarkets(context)
  const market = active.find(({ id }) => id === scope.marketId)
  const currency = scope.currency.trim().toUpperCase()
  if (
    !market?.locales.includes(scope.locale) ||
    !active.some(({ currencies }) =>
      currencies.map((candidate) => candidate.trim().toUpperCase()).includes(currency),
    )
  ) {
    throw new PublicApiShoppingUnavailableError("active market scope")
  }
}

function toActiveMarket(market: PublicMarket): PublicApiActiveMarket {
  const locales = market.locales.map(({ languageTag }) => languageTag)
  const currencies = market.currencies.map(({ currencyCode }) => currencyCode.toUpperCase())
  return {
    id: market.id,
    defaultLocale: market.defaultLocale,
    defaultCurrency: market.defaultCurrency.toUpperCase(),
    locales,
    currencies,
  }
}

function catalogRuntimeContext(
  primitives: VoyantRuntimeHostPrimitives,
  context: Pick<PublicApiShoppingContext, "channelId">,
): never {
  return {
    env: primitives.env(undefined),
    get(key: string) {
      if (key !== "publicChannel") return undefined
      return { ...context, channelStatus: "active" }
    },
  } as never
}

function assertCustomerSearchFilters(
  registry: FieldPolicyRegistry,
  filters: readonly SearchFilter[],
): void {
  for (const filter of filters) {
    if (filter.kind === "and" || filter.kind === "or") {
      assertCustomerSearchFilters(registry, filter.clauses)
      continue
    }
    const policy = registry.policies.find(
      ({ path }) => indexFieldNameForPolicyPath(path) === filter.field,
    )
    if (!policy || policy.query === "blob-only" || !policy.visibility.includes("customer")) {
      throw new PublicApiShoppingUnavailableError(
        `customer catalog field policy for ${filter.field}`,
      )
    }
  }
}

function catalogItem(
  document: IndexerDocument,
  registry: FieldPolicyRegistry,
): PublicApiCatalogSliceItem {
  const field = (name: string): unknown =>
    customerVisibleField(registry, name) ? document.fields[name] : undefined
  const title = firstString(field("name"), field("title"))
  if (!title) throw new PublicApiShoppingUnavailableError("customer catalog title")
  const summary = firstString(field("description"), field("summary"))
  const slug = firstString(field("slug"))
  const imageUrl = firstString(
    field("thumbnailUrl"),
    field("primaryMediaUrl"),
    field("coverMediaUrl"),
  )
  const priceAmountCents = firstNumber(field("priceFromAmountCents"), field("sellAmountCents"))
  const priceCurrency = firstString(field("priceFromCurrency"), field("sellCurrency"))
  return {
    entityId: document.id,
    title,
    ...(summary ? { summary } : {}),
    ...(slug ? { href: `/catalog/${encodeURIComponent(slug)}` } : {}),
    ...(imageUrl ? { image: { url: imageUrl, alt: title } } : {}),
    ...(priceAmountCents !== undefined && priceCurrency
      ? {
          nativePrice: {
            amount: (priceAmountCents / 100).toFixed(2),
            currency: priceCurrency.trim().toUpperCase(),
          },
        }
      : {}),
  }
}

function customerVisibleField(registry: FieldPolicyRegistry, field: string): boolean {
  const policy = registry.policies.find(({ path }) => indexFieldNameForPolicyPath(path) === field)
  return policy?.visibility.includes("customer") === true
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0)
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )
}

/**
 * Whether the request's channel is one this deployment can serve on.
 *
 * Used to join `auth_storefront_distribution_channel` to prove a storefront was
 * bound to the channel. That pivot is gone with the storefront entity
 * (voyant#4624): the key names its channel, or resolves to Direct, and auth has
 * already done that resolution by the time a request reaches here. What is left
 * to check is the only thing that can still have changed underneath it — that
 * the channel is still active.
 */
async function defaultIsActivePublicApiChannel(
  db: PostgresJsDatabase,
  context: Pick<PublicApiShoppingContext, "channelId">,
): Promise<boolean> {
  const result = await (db as unknown as PublicApiChannelBindingDatabase).execute(
    sql`SELECT EXISTS (
       SELECT 1
       FROM channels AS channel
       WHERE channel.id = ${context.channelId}
         AND channel.status = 'active'
     ) AS active`,
  )
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: readonly unknown[] } | null)?.rows ?? [])
  const row = rows[0] as { active?: unknown } | undefined
  return row?.active === true || row?.active === "true" || row?.active === 1
}
