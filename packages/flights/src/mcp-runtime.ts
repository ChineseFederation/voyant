import { defineToolContextContribution, requireService } from "@voyant-travel/tools"
import type { Context } from "hono"

import { flightsRuntimePort } from "./runtime-port.js"
import { requireFlightCapabilityMethod } from "./tools.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["flights"],
  async contribute({ request, resources }) {
    const c = request as Context
    const runtime = await Promise.resolve(
      requireService(
        resources[flightsRuntimePort.id] as
          | import("./runtime-port.js").FlightsRuntime
          | Promise<import("./runtime-port.js").FlightsRuntime>
          | undefined,
        flightsRuntimePort.id,
      ),
    )
    flightsRuntimePort.test(runtime)
    const adapterContext = {
      connectionId: "mcp",
      correlationId: c.req.header("x-request-id") ?? undefined,
    }
    return {
      flights: {
        searchFlights: (
          input: Parameters<ReturnType<typeof runtime.resolveAdapter>["searchFlights"]>[1],
        ) => runtime.resolveAdapter(c).searchFlights(adapterContext, input),
        priceOffer: (
          input: Parameters<ReturnType<typeof runtime.resolveAdapter>["priceOffer"]>[1],
        ) => runtime.resolveAdapter(c).priceOffer(adapterContext, input),
        listOrders: (
          input: NonNullable<ReturnType<typeof runtime.resolveAdapter>["listOrders"]> extends (
            ...args: infer P
          ) => unknown
            ? P[1]
            : never,
        ) => {
          const adapter = runtime.resolveAdapter(c)
          return requireFlightCapabilityMethod(adapter.listOrders?.bind(adapter), "listOrders")(
            adapterContext,
            input,
          )
        },
        getOrder: (orderId: string) => runtime.resolveAdapter(c).getOrder(adapterContext, orderId),
        ticketOrder: (orderId: string) => {
          const adapter = runtime.resolveAdapter(c)
          return requireFlightCapabilityMethod(adapter.ticketOrder?.bind(adapter), "ticketOrder")(
            adapterContext,
            orderId,
          )
        },
        cancelOrder: ({
          orderId,
          reason,
        }: {
          orderId: string
          reason?: Parameters<ReturnType<typeof runtime.resolveAdapter>["cancelOrder"]>[2]
        }) => runtime.resolveAdapter(c).cancelOrder(adapterContext, orderId, reason),
      },
    }
  },
})
