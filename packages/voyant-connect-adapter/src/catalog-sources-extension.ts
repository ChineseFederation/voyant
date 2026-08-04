import type {
  CatalogSourcesRuntimeExtension,
  SourceAdapterRegistry,
} from "@voyant-travel/catalog/runtime-contracts"

import { createVoyantConnectClient } from "@voyant-travel/connect-sdk"

import { prepareVoyantConnectSources, resolveVoyantConnectEnv } from "./env.js"
import { createDestinationNameResolver } from "./geo-resolver.js"
import { createVoyantConnectSources, registerVoyantConnectSources } from "./sources.js"

/**
 * Short-TTL read cache applied to cruise reads on both the fallback and the
 * per-connection warm path. Shares the owned-adapter TTL.
 */
const CRUISE_MEMOIZE = { memoize: { ttlMs: 60_000 } } as const

function register(
  registry: SourceAdapterRegistry,
  sources: Parameters<typeof registerVoyantConnectSources>[1],
): void {
  registerVoyantConnectSources(
    registry as unknown as Parameters<typeof registerVoyantConnectSources>[0],
    sources,
  )
}

/**
 * Voyant Connect as a catalog inventory channel.
 *
 * The catalog spine used to import these helpers directly, which made it depend
 * on this package and hard-coded Connect as *the* channel. It now resolves this
 * extension from a port, so Connect is one implementation and a self-hosted
 * channel can provide its own.
 */
export function createVoyantConnectCatalogSourcesExtension(): CatalogSourcesRuntimeExtension {
  return {
    registerFallback(registry, env) {
      const config = resolveVoyantConnectEnv(env, {
        warn: (message) => console.warn(`[voyant-connect] ${message}`),
      })
      if (!config) return
      register(registry, createVoyantConnectSources({ ...config, cruise: CRUISE_MEMOIZE }))
    },

    async warm(registry, env) {
      const sources = await prepareVoyantConnectSources(env, {
        enumerate: true,
        cruise: CRUISE_MEMOIZE,
        warn: (message) => console.warn(`[voyant-connect] ${message}`),
      })
      register(registry, sources)
    },

    createOffersClient(env) {
      const apiKey = env.VOYANT_API_KEY ?? env.VOYANT_CONNECT_API_KEY ?? env.VOYANT_CLOUD_API_KEY
      const operatorId = env.VOYANT_CONNECT_OPERATOR_ID
      if (!apiKey || !operatorId) return null
      return createVoyantConnectClient({
        apiKey,
        operatorId,
        ...(env.VOYANT_CONNECT_API_URL ? { baseUrl: env.VOYANT_CONNECT_API_URL } : {}),
      })
    },

    async resolveDestinationNames(codes, env) {
      const apiKey = env.VOYANT_API_KEY ?? env.VOYANT_CONNECT_API_KEY ?? env.VOYANT_CLOUD_API_KEY
      if (!apiKey) return codes.map((code) => ({ code, label: code }))
      let resolver: ReturnType<typeof createDestinationNameResolver> | null = null
      try {
        resolver = createDestinationNameResolver({ apiKey })
      } catch {
        return codes.map((code) => ({ code, label: code }))
      }
      return Promise.all(
        codes.map(async (code) => {
          try {
            const city = await resolver?.resolve(code)
            return { code, label: city && city !== code ? `${city} (${code})` : code }
          } catch {
            return { code, label: code }
          }
        }),
      )
    },
  }
}
