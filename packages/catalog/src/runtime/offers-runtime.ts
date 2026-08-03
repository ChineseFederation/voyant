import type {
  CatalogOffersAirportLabel,
  CatalogOffersConnectClient,
  CatalogOffersRouteModuleOptions,
} from "@voyant-travel/catalog/offers"
import {
  type CatalogOffersSearchScope,
  createCatalogOffersSearchResolvers,
} from "@voyant-travel/catalog/runtime-support"
import type { IndexerAdapter } from "@voyant-travel/catalog-contracts/indexer/contract"
import type { Context } from "hono"
import { catalogRuntimeExtensions } from "./host.js"

function resolveConnectClient(c: Context): CatalogOffersConnectClient | null {
  const sources = catalogRuntimeExtensions().sources
  if (!sources) return null
  return (sources.createOffersClient(c.env as Record<string, string | undefined>) ??
    null) as CatalogOffersConnectClient | null
}

async function resolveAirportLabels(
  c: Context,
  codes: string[],
): Promise<CatalogOffersAirportLabel[]> {
  const env = c.env as Record<string, string | undefined>
  const sorted = [...new Set(codes)].sort()
  if (sorted.length === 0) return []
  const sources = catalogRuntimeExtensions().sources
  if (!sources) return sorted.map((code) => ({ code, label: code }))
  try {
    const resolved = await sources.resolveDestinationNames(sorted, env)
    const byCode = new Map(resolved.map((entry) => [entry.code, entry.label]))
    return sorted.map((code) => ({ code, label: byCode.get(code) ?? code }))
  } catch {
    return sorted.map((code) => ({ code, label: code }))
  }
}

export function createOperatorCatalogOffersRouteModuleOptions(
  resolveScope: (context: Context) => CatalogOffersSearchScope,
  resolveIndexer: (context: Context) => IndexerAdapter | undefined,
): CatalogOffersRouteModuleOptions {
  const searchResolvers = createCatalogOffersSearchResolvers(
    (context) => resolveIndexer(context as Context),
    (context) => resolveScope(context as Context),
  )
  return {
    resolveConnectClient,
    fetchIndexFields: searchResolvers.fetchIndexFields,
    resolveDynamicHotelIds: searchResolvers.resolveDynamicHotelIds,
    resolveAirportLabels,
  }
}
