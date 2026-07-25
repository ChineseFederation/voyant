import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { defineToolContextContribution, requireService } from "@voyant-travel/tools"
import type { Context } from "hono"

import { executeDurableFlightAction } from "./durable-action-command.js"
import {
  type DurableFlightActionRuntime,
  durableFlightActionRuntimePort,
} from "./durable-action-runtime-port.js"
import { flightsRuntimePort } from "./runtime-port.js"
import { type FlightsToolServices, requireFlightCapabilityMethod } from "./tools.js"

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
    const durableRuntime = resources[durableFlightActionRuntimePort.id] as
      | DurableFlightActionRuntime
      | Promise<DurableFlightActionRuntime>
      | undefined
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
        ticketOrder: async (
          orderId: Parameters<FlightsToolServices["ticketOrder"]>[0],
          admitted: Parameters<FlightsToolServices["ticketOrder"]>[1],
        ) => {
          const selected = await requireDurableRuntime(durableRuntime)
          return executeDurableFlightAction({
            db: c.var.db as AnyDrizzleDb,
            context: actionLedgerContext(c),
            admitted,
            action: "ticket-order",
            capability: selected.ticket,
            input: { orderId },
          })
        },
        cancelOrder: async (
          { orderId, reason }: Parameters<FlightsToolServices["cancelOrder"]>[0],
          admitted: Parameters<FlightsToolServices["cancelOrder"]>[1],
        ) => {
          const selected = await requireDurableRuntime(durableRuntime)
          return executeDurableFlightAction({
            db: c.var.db as AnyDrizzleDb,
            context: actionLedgerContext(c),
            admitted,
            action: "cancel-order",
            capability: selected.cancel,
            input: { orderId, ...(reason === undefined ? {} : { reason }) },
          })
        },
      },
    }
  },
})

async function requireDurableRuntime(
  runtime: DurableFlightActionRuntime | Promise<DurableFlightActionRuntime> | undefined,
): Promise<DurableFlightActionRuntime> {
  return requireService(await Promise.resolve(runtime), durableFlightActionRuntimePort.id)
}

function actionLedgerContext(c: Context): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: (vars.workflowPrincipalId as string | undefined) ?? null,
    principalSubtype: (vars.principalSubtype as string | undefined) ?? null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: (vars.workflowRunId as string | undefined) ?? null,
    workflowStepId: (vars.workflowStepId as string | undefined) ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}
