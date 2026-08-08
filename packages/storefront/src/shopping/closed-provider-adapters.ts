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
  StorefrontActiveMarket,
  StorefrontCatalogSliceItem,
  StorefrontShoppingCatalogProvider,
  StorefrontShoppingMarketProvider,
} from "./provider-ports.js"
import { StorefrontShoppingUnavailableError } from "./runtime.js"
import type { StorefrontShoppingContext } from "./runtime-port.js"

interface StorefrontChannelBindingDatabase {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

export interface ClosedStorefrontShoppingAdapterOptions {
  primitives: VoyantRuntimeHostPrimitives
  catalogSearch: CatalogSearchRuntimeOptions
  catalogServices: Pick<CatalogRuntimeServices, "fieldPolicyRegistries">
  listMarkets?: (db: PostgresJsDatabase) => Promise<PublicMarket[]>
  isActiveStorefrontChannel?: (
    db: PostgresJsDatabase,
    context: Pick<StorefrontShoppingContext, "storefrontId" | "channelId">,
  ) => Promise<boolean>
}

export interface ClosedStorefrontShoppingAdapters {
  markets: StorefrontShoppingMarketProvider
  catalog: StorefrontShoppingCatalogProvider
}

/**
 * Compose the two read-only shopping adapters from the operator's own Commerce
 * and Catalog runtimes. No request body, tenant selector, provider selector, or
 * HTTP/admin route participates in this path.
 */
export function createClosedStorefrontShoppingAdapters(
  options: ClosedStorefrontShoppingAdapterOptions,
): ClosedStorefrontShoppingAdapters {
  const loadMarkets = options.listMarkets ?? listPublicMarkets
  const isActiveStorefrontChannel =
    options.isActiveStorefrontChannel ?? defaultIsActiveStorefrontChannel

  const markets: StorefrontShoppingMarketProvider = {
    async listActiveMarkets(context) {
      const trusted = trustedStorefrontContext(context)
      const db = options.primitives.database.resolve<PostgresJsDatabase>(undefined)
      if (!(await isActiveStorefrontChannel(db, trusted))) {
        throw new StorefrontShoppingUnavailableError("active storefront channel")
      }
      return (await loadMarkets(db)).map(toActiveMarket)
    },
  }

  const catalog: StorefrontShoppingCatalogProvider = {
    async searchSlice(input) {
      const trusted = trustedStorefrontContext(input.context)
      await assertActiveScope(markets, trusted, input.scope)

      const registry = options.catalogServices.fieldPolicyRegistries().get(input.vertical)
      if (!registry) throw new StorefrontShoppingUnavailableError("catalog field policy")
      assertCustomerSearchFilters(registry, input.filters)

      const runtime = options.catalogSearch.resolveRuntime(
        catalogRuntimeContext(options.primitives, trusted),
      )
      if (!runtime.indexer) throw new StorefrontShoppingUnavailableError("catalog indexer")

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

function trustedStorefrontContext(
  context: Pick<StorefrontShoppingContext, "storefrontId" | "channelId">,
): Pick<StorefrontShoppingContext, "storefrontId" | "channelId"> {
  const storefrontId = context.storefrontId.trim()
  const channelId = context.channelId.trim()
  if (!storefrontId || !channelId) {
    throw new StorefrontShoppingUnavailableError("trusted storefront channel context")
  }
  return { storefrontId, channelId }
}

async function assertActiveScope(
  provider: StorefrontShoppingMarketProvider,
  context: Pick<StorefrontShoppingContext, "storefrontId" | "channelId">,
  scope: { marketId: string; locale: string; currency: string },
): Promise<void> {
  const active = await provider.listActiveMarkets(context)
  const market = active.find(({ id }) => id === scope.marketId)
  if (
    !market?.locales.includes(scope.locale) ||
    !market.currencies.includes(scope.currency.trim().toUpperCase())
  ) {
    throw new StorefrontShoppingUnavailableError("active market scope")
  }
}

function toActiveMarket(market: PublicMarket): StorefrontActiveMarket {
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
  context: Pick<StorefrontShoppingContext, "storefrontId" | "channelId">,
): never {
  return {
    env: primitives.env(undefined),
    get(key: string) {
      if (key !== "storefrontChannel") return undefined
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
      throw new StorefrontShoppingUnavailableError(
        `customer catalog field policy for ${filter.field}`,
      )
    }
  }
}

function catalogItem(
  document: IndexerDocument,
  registry: FieldPolicyRegistry,
): StorefrontCatalogSliceItem {
  const field = (name: string): unknown =>
    customerVisibleField(registry, name) ? document.fields[name] : undefined
  const title = firstString(field("name"), field("title"))
  if (!title) throw new StorefrontShoppingUnavailableError("customer catalog title")
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

async function defaultIsActiveStorefrontChannel(
  db: PostgresJsDatabase,
  context: Pick<StorefrontShoppingContext, "storefrontId" | "channelId">,
): Promise<boolean> {
  const result = await (db as unknown as StorefrontChannelBindingDatabase).execute(
    sql`SELECT EXISTS (
       SELECT 1
       FROM auth_storefront_distribution_channel AS binding
       INNER JOIN channels AS channel ON channel.id = binding.channel_id
       WHERE binding.storefront_id = ${context.storefrontId}
         AND binding.channel_id = ${context.channelId}
         AND binding.deleted_at IS NULL
         AND channel.status = 'active'
     ) AS active`,
  )
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: readonly unknown[] } | null)?.rows ?? [])
  const row = rows[0] as { active?: unknown } | undefined
  return row?.active === true || row?.active === "true" || row?.active === 1
}
