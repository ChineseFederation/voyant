import { definePort } from "@voyant-travel/core/project"

import type { CatalogBookingRouteModuleOptions } from "./booking-engine/operator-routes.js"

/** Manifest-safe contract for the Catalog booking API runtime. */
export const catalogBookingRuntimePort = definePort<CatalogBookingRouteModuleOptions>({
  id: "catalog.booking-runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("catalog.booking-runtime provider must be an options object.")
    }
    if (provider.booking === null || typeof provider.booking !== "object") {
      throw new Error("catalog.booking-runtime provider must configure booking options.")
    }
    for (const method of [
      "resolveRegistry",
      "getProductContent",
      "listAvailabilitySlots",
      "getOwnedProductById",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`catalog.booking-runtime provider must implement ${method}().`)
      }
    }
  },
})
