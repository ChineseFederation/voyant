/** Guarded MCP tools for the provider-neutral catalog booking engine. */

import {
  READ_ONLY_RISK,
  requireService,
  type ToolAudiencePolicy,
  type ToolContext,
} from "@voyant-travel/tools"
import { z } from "zod"

const OWNER = "@voyant-travel/catalog#booking-engine"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const orderListInputSchema = z.object({
  bookingId: z.string().min(1).optional(),
  entityModule: z.string().min(1).optional(),
  sourceKinds: z.array(z.string().min(1)).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
})
const orderIdInputSchema = z.object({ id: z.string().min(1) })
const catalogOrderSchema = z.object({
  id: z.string(),
  booking_id: z.string(),
  entity_module: z.string(),
  entity_id: z.string(),
  source_kind: z.string(),
  source_provider: z.string().nullable(),
  source_connection_id: z.string().nullable(),
  source_ref: z.string().nullable(),
  frozen_payload: z.record(z.string(), z.unknown()),
  overlay_state_at_capture: z.record(z.string(), z.unknown()).nullable(),
  pricing_base_amount: z.string().nullable(),
  pricing_taxes: z.string().nullable(),
  pricing_fees: z.string().nullable(),
  pricing_surcharges: z.string().nullable(),
  pricing_currency: z.string().nullable(),
  pricing_breakdown: z.record(z.string(), z.unknown()).nullable(),
  pricing_applied_offers: z.array(z.record(z.string(), z.unknown())).nullable(),
  idempotency_key: z.string().nullable(),
  captured_at: z.string().datetime(),
})
const orderListOutputSchema = z.object({ rows: z.array(catalogOrderSchema) })

type OrderListInput = z.infer<typeof orderListInputSchema>

export interface CatalogBookingToolServices {
  listOrders(input: OrderListInput): Promise<{ rows: unknown[] }>
  getOrder(id: string): Promise<unknown | null>
}

export type CatalogBookingToolContext = ToolContext & {
  catalogBooking?: CatalogBookingToolServices
}

function booking(ctx: CatalogBookingToolContext): CatalogBookingToolServices {
  return requireService(ctx.catalogBooking, "catalogBooking")
}

function metadata(scopes: readonly string[], audience: ToolAudiencePolicy) {
  return {
    owner: OWNER,
    capabilityVersion: VERSION,
    requiredScopes: scopes,
    audience,
  }
}

export const listCatalogOrdersDefinition = {
  ...metadata(["bookings:read"], STAFF_AUDIENCE),
  capabilityId: `${OWNER}#tool.list-catalog-orders`,
  name: "list_catalog_orders",
  description:
    "List immutable catalog booking snapshots across verticals. Staff-only and read-only.",
  inputSchema: orderListInputSchema,
  outputSchema: orderListOutputSchema,
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input: OrderListInput, ctx: CatalogBookingToolContext) {
    return orderListOutputSchema.parse(await booking(ctx).listOrders(input))
  },
} as const

export const getCatalogOrderDefinition = {
  ...metadata(["bookings:read"], STAFF_AUDIENCE),
  capabilityId: `${OWNER}#tool.get-catalog-order`,
  name: "get_catalog_order",
  description: "Read one immutable catalog booking snapshot by id. Staff-only and read-only.",
  inputSchema: orderIdInputSchema,
  outputSchema: catalogOrderSchema.nullable(),
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler({ id }: z.infer<typeof orderIdInputSchema>, ctx: CatalogBookingToolContext) {
    return catalogOrderSchema.nullable().parse(await booking(ctx).getOrder(id))
  },
} as const
