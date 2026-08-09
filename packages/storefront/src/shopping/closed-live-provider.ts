import type { CatalogRuntimeServices } from "@voyant-travel/catalog/runtime-contracts"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createStorefrontShoppingLiveProvider } from "./live-provider.js"
import type {
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
  packages?: StorefrontDynamicPackageSourceProvider
  loadStayPresentation?: CatalogRuntimeServices["presentAvailabilityCandidate"]
}

/**
 * Production live-shopping composition over the graph-admitted Catalog
 * runtime. Flights deliberately remain absent: Flights currently exposes a
 * request-bound single adapter, not an admitted multi-adapter discovery seam.
 */
export function createClosedStorefrontShoppingLiveProvider(
  options: ClosedStorefrontShoppingLiveProviderOptions,
): StorefrontShoppingLiveProvider {
  const present =
    options.loadStayPresentation ?? options.catalogServices.presentAvailabilityCandidate

  return createStorefrontShoppingLiveProvider({
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
  })
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
  if (
    !market?.locales.includes(scope.locale) ||
    !market.currencies.map((currency) => currency.toUpperCase()).includes(scope.currency)
  ) {
    throw new StorefrontShoppingUnavailableError("active market scope")
  }
}
