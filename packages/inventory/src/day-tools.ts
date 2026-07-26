/**
 * Inventory MCP tools for listing and updating product itinerary day copy.
 */

import { defineTool, READ_ONLY_RISK, requireService, type ToolContext } from "@voyant-travel/tools"
import { z } from "zod"

import { updateDaySchema } from "./validation.js"

const OWNER = "@voyant-travel/inventory"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const PRODUCT_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

const productDayToolSchema = z.object({
  id: z.string(),
  itineraryId: z.string(),
  dayNumber: z.number().int().positive(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
const productDaysListToolSchema = z.object({
  data: z.array(productDayToolSchema),
})
const listProductDaysArgs = z.object({
  id: z.string().min(1).describe("The product id."),
})
export const updateProductDayArgs = z
  .object({
    id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Product id that owns the itinerary day. Required with dayNumber; optional when dayId is set (resolved from the day).",
      ),
    dayId: z
      .string()
      .min(1)
      .optional()
      .describe("Existing day id (`pday_*`). Prefer this when available from list_product_days."),
    dayNumber: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("1-based day number when dayId is unknown (requires product id)."),
    title: z.string().max(255).nullable().optional(),
    description: z.string().nullable().optional(),
    location: z.string().max(255).nullable().optional(),
  })
  .refine((value) => value.dayId != null || value.dayNumber != null, {
    message: "Provide dayId or dayNumber.",
    path: ["dayId"],
  })
  .refine((value) => value.dayId != null || value.id != null, {
    message: "Provide product id when updating by dayNumber.",
    path: ["id"],
  })
  .refine(
    (value) =>
      value.title !== undefined || value.description !== undefined || value.location !== undefined,
    {
      message: "Provide at least one of title, description, or location.",
      path: ["description"],
    },
  )

export type UpdateProductDayInput = z.output<typeof updateProductDayArgs>

export interface InventoryDayToolServices {
  listProductDays(productId: string): Promise<unknown[]>
  updateProductDay(input: UpdateProductDayInput): Promise<unknown | null>
  /** Resolve the owning product id for a day (`pday_*`) when Max omits product id. */
  resolveProductIdForDay(dayId: string): Promise<string | null>
}

type InventoryDayToolContext = ToolContext & {
  inventory?: InventoryDayToolServices
}

function inventory(ctx: InventoryDayToolContext): InventoryDayToolServices {
  return requireService(ctx.inventory, "inventory")
}

export const listProductDaysTool = defineTool({
  capabilityId: `${OWNER}#tool.list-product-days`,
  capabilityVersion: VERSION,
  name: "list_product_days",
  description:
    "List a product's itinerary days (`pday_*`) with day number and current copy (title/description/location). Call this before editing an itinerary: `get_product` omits days. Pass the returned dayId (preferred) or dayNumber to `update_product_day`. Returns an empty list when the product has no days.",
  inputSchema: listProductDaysArgs,
  outputSchema: productDaysListToolSchema,
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx: InventoryDayToolContext) {
    return parseJsonResult(productDaysListToolSchema, {
      data: await inventory(ctx).listProductDays(id),
    })
  },
})

export const updateProductDayTool = defineTool({
  capabilityId: `${OWNER}#tool.update-product-day`,
  capabilityVersion: VERSION,
  name: "update_product_day",
  description:
    "Update an existing itinerary day's title, description, and/or location on a product. Resolve the day with `list_product_days` first. Prefer dayId from that list; product id is optional when dayId is set. Does not create days — rebuild the itinerary with `compose_product` when the day structure is missing.",
  inputSchema: updateProductDayArgs,
  outputSchema: productDayToolSchema.nullable(),
  requiredScopes: ["products:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: PRODUCT_WRITE_RISK,
  annotations: { idempotentHint: true },
  async resolveActionTarget(input, ctx: InventoryDayToolContext) {
    if (input.id) return input.id
    if (!input.dayId) return ""
    return (await inventory(ctx).resolveProductIdForDay(input.dayId)) ?? ""
  },
  async handler(input, ctx: InventoryDayToolContext) {
    updateDaySchema.parse({
      title: input.title,
      description: input.description,
      location: input.location,
    })
    return parseJsonResult(
      productDayToolSchema.nullable(),
      await inventory(ctx).updateProductDay(input),
    )
  },
})

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
