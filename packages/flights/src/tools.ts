/** Provider-neutral flight search, pricing, order, ticketing, and cancellation Tools. */

import {
  flightCancelReasonSchema,
  flightCancelResponseSchema,
  flightGetOrderResponseSchema,
  flightOrdersListQuerySchema,
  flightOrdersListResponseSchema,
  flightPriceRequestSchema,
  flightPriceResponseSchema,
  flightSearchRequestSchema,
  flightSearchResponseSchema,
} from "@voyant-travel/flights-contracts/contract/schemas"
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"

const OWNER = "@voyant-travel/flights"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const orderIdSchema = z.object({ orderId: z.string().min(1) })
const cancelOrderSchema = orderIdSchema.extend({ reason: flightCancelReasonSchema.optional() })
const DURABLE_FLIGHT_ACTION_VERSION = "v2"

type FlightSearchInput = z.infer<typeof flightSearchRequestSchema>
type FlightPriceInput = z.infer<typeof flightPriceRequestSchema>
type FlightOrdersListInput = z.infer<typeof flightOrdersListQuerySchema>
type FlightCancelInput = z.infer<typeof cancelOrderSchema>

export interface FlightsToolServices {
  searchFlights(input: FlightSearchInput): Promise<unknown>
  priceOffer(input: FlightPriceInput): Promise<unknown>
  listOrders(input: FlightOrdersListInput): Promise<unknown>
  getOrder(orderId: string): Promise<unknown>
  ticketOrder(orderId: string, admitted: ToolHandlerActionPolicyContext): Promise<unknown>
  cancelOrder(input: FlightCancelInput, admitted: ToolHandlerActionPolicyContext): Promise<unknown>
}

export type FlightsToolContext = ToolContext & { flights?: FlightsToolServices }

function flights(ctx: FlightsToolContext): FlightsToolServices {
  return requireService(ctx.flights, "flights")
}

const readMetadata = {
  owner: OWNER,
  capabilityVersion: "v1",
  audience: STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const offerReadMetadata = { ...readMetadata, tier: "read" as const }
const criticalWriteRisk = {
  destructive: true,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["external-booking", "payment"],
} as const

export const TICKET_FLIGHT_ORDER_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.ticket-order`,
  capabilityVersion: DURABLE_FLIGHT_ACTION_VERSION,
  canonicalName: "ticket_flight_order",
  actionPolicy: {
    id: `${OWNER}#action.ticket-order`,
    capabilityId: `${OWNER}#action.ticket-order`,
    version: DURABLE_FLIGHT_ACTION_VERSION,
    kind: "execute",
    targetType: "flight-order",
    commandTargetField: "orderId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "critical",
    ledger: "required",
    approval: "required",
    policy: "flight-ticket",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const CANCEL_FLIGHT_ORDER_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.cancel-order`,
  capabilityVersion: DURABLE_FLIGHT_ACTION_VERSION,
  canonicalName: "cancel_flight_order",
  actionPolicy: {
    id: `${OWNER}#action.cancel-order`,
    capabilityId: `${OWNER}#action.cancel-order`,
    version: DURABLE_FLIGHT_ACTION_VERSION,
    kind: "execute",
    targetType: "flight-order",
    commandTargetField: "orderId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "critical",
    ledger: "required",
    approval: "required",
    policy: "flight-cancel",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const searchFlightsTool = defineTool({
  ...offerReadMetadata,
  capabilityId: `${OWNER}#tool.search`,
  name: "search_flights",
  description: "Search a configured flight connector for one-way, return, or multi-city offers.",
  requiredScopes: ["flights:write"],
  inputSchema: flightSearchRequestSchema,
  outputSchema: flightSearchResponseSchema,
  async handler(input, ctx: FlightsToolContext) {
    return flightSearchResponseSchema.parse(await flights(ctx).searchFlights(input))
  },
})

export const priceFlightOfferTool = defineTool({
  ...offerReadMetadata,
  capabilityId: `${OWNER}#tool.price-offer`,
  name: "price_flight_offer",
  description: "Re-price a flight offer and verify that it remains valid before booking.",
  requiredScopes: ["flights:write"],
  inputSchema: flightPriceRequestSchema,
  outputSchema: flightPriceResponseSchema,
  async handler(input, ctx: FlightsToolContext) {
    return flightPriceResponseSchema.parse(await flights(ctx).priceOffer(input))
  },
})

export const listFlightOrdersTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.list-orders`,
  name: "list_flight_orders",
  description: "List flight orders visible to the configured connector. Contains traveler data.",
  requiredScopes: ["flights:read"],
  inputSchema: flightOrdersListQuerySchema,
  outputSchema: flightOrdersListResponseSchema,
  async handler(input, ctx: FlightsToolContext) {
    return flightOrdersListResponseSchema.parse(await flights(ctx).listOrders(input))
  },
})

export const getFlightOrderTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}#tool.get-order`,
  name: "get_flight_order",
  description: "Read one flight order, travelers, itinerary, tickets, and totals.",
  requiredScopes: ["flights:read"],
  inputSchema: orderIdSchema,
  outputSchema: flightGetOrderResponseSchema,
  async handler({ orderId }, ctx: FlightsToolContext) {
    return flightGetOrderResponseSchema.parse(await flights(ctx).getOrder(orderId))
  },
})

export const ticketFlightOrderTool = defineTool({
  owner: OWNER,
  capabilityVersion: DURABLE_FLIGHT_ACTION_VERSION,
  capabilityId: `${OWNER}#tool.ticket-order`,
  name: "ticket_flight_order",
  description: "Issue tickets for a held flight order through a connector that supports ticketing.",
  requiredScopes: ["flights:write"],
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: criticalWriteRisk,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  inputSchema: orderIdSchema,
  outputSchema: flightGetOrderResponseSchema,
  async handler({ orderId }, ctx: FlightsToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, TICKET_FLIGHT_ORDER_HANDLER_POLICY)
    return flightGetOrderResponseSchema.parse(await flights(ctx).ticketOrder(orderId, admitted))
  },
})

export const cancelFlightOrderTool = defineTool({
  owner: OWNER,
  capabilityVersion: DURABLE_FLIGHT_ACTION_VERSION,
  capabilityId: `${OWNER}#tool.cancel-order`,
  name: "cancel_flight_order",
  description: "Cancel a flight order through the connector; supplier refund rules may apply.",
  requiredScopes: ["flights:write"],
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: criticalWriteRisk,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  inputSchema: cancelOrderSchema,
  outputSchema: flightCancelResponseSchema,
  async handler(input, ctx: FlightsToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CANCEL_FLIGHT_ORDER_HANDLER_POLICY)
    return flightCancelResponseSchema.parse(await flights(ctx).cancelOrder(input, admitted))
  },
})

export const flightsTools = [
  searchFlightsTool,
  priceFlightOfferTool,
  listFlightOrdersTool,
  getFlightOrderTool,
  ticketFlightOrderTool,
  cancelFlightOrderTool,
] as const

export function requireFlightCapabilityMethod<T extends (...args: never[]) => unknown>(
  method: T | undefined,
  operation: string,
): T {
  if (method) return method
  throw new ToolError(
    `The configured flight connector does not support ${operation}.`,
    "MISSING_SERVICE",
    { service: `flights.${operation}` },
  )
}
