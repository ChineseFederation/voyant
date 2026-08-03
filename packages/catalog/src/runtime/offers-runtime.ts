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
import { createVoyantConnectClient } from "@voyant-travel/connect-sdk"
import type { Context } from "hono"
import { catalogRuntimeExtensions } from "./host.js"

interface PackageOffersEnv {
  VOYANT_API_KEY?: string
  VOYANT_CONNECT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CONNECT_OPERATOR_ID?: string
  VOYANT_CONNECT_API_URL?: string
}

function connectApiKey(env: PackageOffersEnv): string | undefined {
  return env.VOYANT_API_KEY ?? env.VOYANT_CONNECT_API_KEY ?? env.VOYANT_CLOUD_API_KEY
}

function resolveConnectClient(c: Context): CatalogOffersConnectClient | null {
  const env = c.env as PackageOffersEnv
  const apiKey = connectApiKey(env)
  const operatorId = env.VOYANT_CONNECT_OPERATOR_ID
  if (!apiKey || !operatorId) return null
  return createVoyantConnectClient({
    apiKey,
    operatorId,
    ...(env.VOYANT_CONNECT_API_URL ? { baseUrl: env.VOYANT_CONNECT_API_URL } : {}),
  }) as CatalogOffersConnectClient
}

async function resolveAirportLabels(
  c: Context,
  codes: string[],
): Promise<CatalogOffersAirportLabel[]> {
  const env = c.env as PackageOffersEnv
  const sorted = [...new Set(codes)].sort()
  if (sorted.length === 0) return []
  const sources = catalogRuntimeExtensions().sources
  if (!sources) return sorted.map((code) => ({ code, label: code }))
  try {
    const resolved = await sources.resolveDestinationNames(
      sorted,
      env as Record<string, string | undefined>,
    )
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
