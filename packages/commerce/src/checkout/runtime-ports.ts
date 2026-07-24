import { definePort } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import type { AcceptanceSignatureLegalPort } from "./acceptance-signature.js"
import type { CheckoutStartOptions } from "./options.js"
import type { BookingMaintenanceRoutesOptions } from "./routes.js"

export type CatalogCheckoutApiRuntime = (context: Context) => CheckoutStartOptions
export const CATALOG_CHECKOUT_API_RUNTIME_KEY = "commerce.checkout-api-options" as const

export const bookingMaintenanceRuntimePort = definePort<BookingMaintenanceRoutesOptions>({
  id: "commerce.booking-maintenance.runtime",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.resolveBookingTaxSettings !== "function"
    ) {
      throw new Error(
        "commerce.booking-maintenance.runtime provider must implement resolveBookingTaxSettings().",
      )
    }
  },
})

export interface CatalogCheckoutDatabaseRuntime {
  withDb<T>(bindings: unknown, operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
}

export const catalogCheckoutDatabaseRuntimePort = definePort<CatalogCheckoutDatabaseRuntime>({
  id: "commerce.checkout-database",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.withDb !== "function"
    ) {
      throw new Error("commerce.checkout-database provider must implement withDb().")
    }
  },
})

export const catalogCheckoutLegalRuntimePort = definePort<AcceptanceSignatureLegalPort>({
  id: "legal.acceptance-signature",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("legal.acceptance-signature provider must be an object.")
    }
    for (const method of [
      "getContract",
      "listSignatures",
      "sendContract",
      "signContract",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`legal.acceptance-signature provider must implement ${method}().`)
      }
    }
  },
})

export const catalogCheckoutApiRuntimePort = definePort<CatalogCheckoutApiRuntime>({
  id: "commerce.checkout-api-options",
  test(provider) {
    if (typeof provider !== "function") {
      throw new Error("commerce.checkout-api-options provider must be a function.")
    }
  },
})
