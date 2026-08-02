import { definePort } from "@voyant-travel/core/project"

import type { CatalogOffersRouteModuleOptions } from "./offers/operator-routes.js"
import type { CatalogSearchRoutesOptions } from "./search/routes.js"

export { catalogBookingRuntimePort } from "./booking-runtime-port.js"

export type CatalogSearchRuntimeOptions = Pick<CatalogSearchRoutesOptions, "resolveRuntime">

export const catalogSearchRuntimePort = definePort<CatalogSearchRuntimeOptions>({
  id: "catalog.search-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("catalog.search-runtime provider must be an options object.")
    }
    if (typeof provider.resolveRuntime !== "function") {
      throw new Error("catalog.search-runtime provider must implement resolveRuntime().")
    }
  },
})

export const catalogOffersRuntimePort = definePort<CatalogOffersRouteModuleOptions>({
  id: "catalog.offers-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("catalog.offers-runtime provider must be an options object.")
    }
    for (const method of [
      "resolveConnectClient",
      "fetchIndexFields",
      "resolveDynamicHotelIds",
      "resolveAirportLabels",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`catalog.offers-runtime provider must implement ${method}().`)
      }
    }
  },
})
