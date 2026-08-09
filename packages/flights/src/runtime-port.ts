import { definePort } from "@voyant-travel/core/project"
import type { Context } from "hono"

import type { FlightAdapterContext, FlightConnectorAdapter } from "./contract/adapter.js"
import type { FlightCardBilling } from "./payment-integration.js"

/**
 * Trusted Storefront authority used to enumerate flight supply. Every field is
 * resolved server-side; no provider or connection selector is accepted.
 */
export interface FlightStorefrontShoppingContext {
  storefrontId: string
  channelId: string
  marketId: string
  locale: string
  currency: string
}

/** One graph-admitted connection, closed over its adapter credentials/context. */
export interface AdmittedFlightShoppingSource {
  connectionId: string
  adapter: FlightConnectorAdapter
  context?: Omit<Partial<FlightAdapterContext>, "connectionId">
}

/** Node-host behavior required by the package-owned Flights runtime factory. */
export interface FlightsRuntime {
  resolveAdapter(c: Context): FlightConnectorAdapter
  /**
   * Enumerate every source admitted for the trusted Storefront scope. Returning
   * an empty array fails public shopping closed; callers must never fall back to
   * `resolveAdapter()` or infer supply from credentials.
   */
  listAdmittedShoppingSources(
    context: FlightStorefrontShoppingContext,
  ): Promise<readonly AdmittedFlightShoppingSource[]>
  startCardPayment(c: Context, sessionId: string, billing: FlightCardBilling): Promise<void>
}

/** Typed deployment contract for connector and card-provider resolution. */
export const flightsRuntimePort = definePort<FlightsRuntime>({
  id: "flights.runtime",
  test(provider) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("flights.runtime provider must be an options object.")
    }
    for (const method of [
      "resolveAdapter",
      "listAdmittedShoppingSources",
      "startCardPayment",
    ] as const) {
      if (typeof provider[method] !== "function") {
        throw new Error(`flights.runtime provider must implement ${method}().`)
      }
    }
  },
})
