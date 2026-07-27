/**
 * Module-owned Tools for product options and their bookable units.
 *
 * The admin API has carried full option/unit CRUD since the OpenAPI backfill,
 * but no Tool ever exposed it. `compose_product` can author options and units
 * as part of building a product graph from scratch; afterwards there was no way
 * to add a unit to an option, so a product created by the agent shipped with
 * nothing sellable on it and the operator had to finish the job by hand.
 *
 * Note on schema shape: `insertOptionUnitSchema` carries its occupancy rule in
 * a `superRefine`, and Zod refinements do NOT serialize into JSON Schema — the
 * model never sees them at tool-selection time. Any constraint the caller must
 * satisfy is therefore restated in the field descriptions, the same fix applied
 * to `create_booking`'s billing party.
 */

import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  insertOptionUnitSchema,
  insertProductOptionSchema,
  optionUnitListQuerySchema,
  productOptionListQuerySchema,
  updateOptionUnitSchema,
  updateProductOptionSchema,
} from "./validation.js"

// Options and units are part of the core inventory module surface, so `owner`
// must be the module that registers them — the graph checks the two agree.
// Capability ids keep the `#options` segment purely to namespace them.
const OWNER = "@voyant-travel/inventory"
const CAPABILITY_PREFIX = "@voyant-travel/inventory#options"
const VERSION = "v1"
const READ_SCOPES = ["products:read"] as const
const WRITE_SCOPES = ["products:write"] as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

const isoTimestamp = z.string()
const optionIdArgsSchema = z.object({
  id: z.string().min(1).describe("The product option id."),
})
const unitIdArgsSchema = z.object({ id: z.string().min(1).describe("The option unit id.") })

const productOptionValueSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["draft", "active", "archived"]),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const optionUnitValueSchema = z.object({
  id: z.string(),
  optionId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  unitType: z.enum(["person", "group", "room", "vehicle", "service", "other"]),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  occupancyMin: z.number().int().nullable(),
  occupancyMax: z.number().int().nullable(),
  isRequired: z.boolean(),
  isHidden: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const idempotencyKeySchema = z.string().trim().min(1).max(255).optional()

export const createProductOptionInputSchema = insertProductOptionSchema.safeExtend({
  productId: z
    .string()
    .min(1)
    .describe(
      "Id of the product this option belongs to. Resolve it with `list_products`, or create the product first with `create_product`.",
    ),
  idempotencyKey: idempotencyKeySchema,
})

export const createOptionUnitInputSchema = insertOptionUnitSchema.safeExtend({
  optionId: z
    .string()
    .min(1)
    .describe(
      "Id of the product option this unit is sold under. Resolve it with `list_product_options`, or create the option first with `create_product_option`.",
    ),
  occupancyMin: z
    .number()
    .int()
    .min(0)
    .optional()
    .nullable()
    .describe(
      "How many travellers one unit sleeps or seats, at minimum. REQUIRED (and ≥ 1) when unitType is `room` or `vehicle` — storefront pricing multiplies occupancy by quantity, so omitting it silently under-charges the booking.",
    ),
  idempotencyKey: idempotencyKeySchema,
})

const updateProductOptionToolSchema = updateProductOptionSchema.safeExtend({
  id: z.string().min(1).describe("The product option id."),
})
const updateOptionUnitToolSchema = updateOptionUnitSchema.safeExtend({
  id: z.string().min(1).describe("The option unit id."),
})

const createdChildReferenceSchema = z.object({ id: z.string(), replayed: z.boolean() })

type ProductOptionListInput = z.infer<typeof productOptionListQuerySchema>
type OptionUnitListInput = z.infer<typeof optionUnitListQuerySchema>
type CreateProductOptionInput = z.infer<typeof createProductOptionInputSchema>
type UpdateProductOptionInput = z.infer<typeof updateProductOptionToolSchema>
type CreateOptionUnitInput = z.infer<typeof createOptionUnitInputSchema>
type UpdateOptionUnitInput = z.infer<typeof updateOptionUnitToolSchema>

export interface InventoryOptionToolServices {
  listProductOptions(input: ProductOptionListInput): Promise<unknown>
  getProductOptionById(id: string): Promise<unknown>
  createProductOption(
    input: CreateProductOptionInput,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateProductOption(input: UpdateProductOptionInput): Promise<unknown>
  listOptionUnits(input: OptionUnitListInput): Promise<unknown>
  getOptionUnitById(id: string): Promise<unknown>
  createOptionUnit(
    input: CreateOptionUnitInput,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateOptionUnit(input: UpdateOptionUnitInput): Promise<unknown>
}

export type InventoryOptionToolContext = ToolContext & {
  inventoryOptions?: InventoryOptionToolServices
}

function options(ctx: InventoryOptionToolContext): InventoryOptionToolServices {
  return requireService(ctx.inventoryOptions, "inventoryOptions")
}

const readMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const writeMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write" as const,
  riskPolicy: WRITE_RISK,
}

export const CREATE_PRODUCT_OPTION_HANDLER_POLICY = {
  capabilityId: `${CAPABILITY_PREFIX}.tool.create-product-option`,
  capabilityVersion: VERSION,
  canonicalName: "create_product_option",
  actionPolicy: {
    id: `${CAPABILITY_PREFIX}.action.create-product-option`,
    capabilityId: `${CAPABILITY_PREFIX}.action.create-product-option`,
    version: VERSION,
    kind: "execute",
    targetType: "product_option",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "product-option-create-command",
      resultReferenceType: "product_option",
      durability: "handler-command-claim-v1",
      parentAnchor: { targetType: "product", targetIdField: "productId" },
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const CREATE_OPTION_UNIT_HANDLER_POLICY = {
  capabilityId: `${CAPABILITY_PREFIX}.tool.create-option-unit`,
  capabilityVersion: VERSION,
  canonicalName: "create_option_unit",
  actionPolicy: {
    id: `${CAPABILITY_PREFIX}.action.create-option-unit`,
    capabilityId: `${CAPABILITY_PREFIX}.action.create-option-unit`,
    version: VERSION,
    kind: "execute",
    targetType: "option_unit",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "option-unit-create-command",
      resultReferenceType: "option_unit",
      durability: "handler-command-claim-v1",
      parentAnchor: { targetType: "product_option", targetIdField: "optionId" },
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const listProductOptionsTool = defineTool({
  ...readMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.list-product-options`,
  name: "list_product_options",
  description:
    "List the options (fare classes, departure variants, room plans) a product is sold under. Filter by productId to see one product's options.",
  inputSchema: productOptionListQuerySchema,
  outputSchema: listResponseSchema(productOptionValueSchema),
  async handler(input, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      listResponseSchema(productOptionValueSchema),
      await options(ctx).listProductOptions(input),
    )
  },
})

export const getProductOptionTool = defineTool({
  ...readMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.get-product-option`,
  name: "get_product_option",
  description: "Read one product option and its availability window and status.",
  inputSchema: optionIdArgsSchema,
  outputSchema: productOptionValueSchema.nullable(),
  async handler({ id }, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      productOptionValueSchema.nullable(),
      await options(ctx).getProductOptionById(id),
    )
  },
})

export const createProductOptionTool = defineTool({
  ...writeMetadata,
  riskPolicy: { ...WRITE_RISK, reversible: false },
  capabilityId: `${CAPABILITY_PREFIX}.tool.create-product-option`,
  name: "create_product_option",
  description:
    "Add an option to an existing product — the level a price and its bookable units hang off. A product needs at least one option before it can be sold.",
  inputSchema: createProductOptionInputSchema,
  outputSchema: createdChildReferenceSchema,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryOptionToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_PRODUCT_OPTION_HANDLER_POLICY)
    return createdChildReferenceSchema.parse(
      await options(ctx).createProductOption(input, admitted),
    )
  },
})

export const updateProductOptionTool = defineTool({
  ...writeMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.update-product-option`,
  name: "update_product_option",
  description:
    "Update an option's name, code, description, status, default flag, ordering, or availability window.",
  inputSchema: updateProductOptionToolSchema,
  outputSchema: productOptionValueSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      productOptionValueSchema.nullable(),
      await options(ctx).updateProductOption(input),
    )
  },
})

export const listOptionUnitsTool = defineTool({
  ...readMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.list-option-units`,
  name: "list_option_units",
  description:
    "List the bookable units under product options — the per-person, per-room, or per-vehicle lines a traveller actually books. Filter by optionId.",
  inputSchema: optionUnitListQuerySchema,
  outputSchema: listResponseSchema(optionUnitValueSchema),
  async handler(input, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      listResponseSchema(optionUnitValueSchema),
      await options(ctx).listOptionUnits(input),
    )
  },
})

export const getOptionUnitTool = defineTool({
  ...readMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.get-option-unit`,
  name: "get_option_unit",
  description: "Read one bookable unit with its quantity, age, and occupancy bounds.",
  inputSchema: unitIdArgsSchema,
  outputSchema: optionUnitValueSchema.nullable(),
  async handler({ id }, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      optionUnitValueSchema.nullable(),
      await options(ctx).getOptionUnitById(id),
    )
  },
})

export const createOptionUnitTool = defineTool({
  ...writeMetadata,
  riskPolicy: { ...WRITE_RISK, reversible: false },
  capabilityId: `${CAPABILITY_PREFIX}.tool.create-option-unit`,
  name: "create_option_unit",
  description:
    "Add a bookable unit to an existing product option — an adult or child fare, a room plan, a vehicle seat. Without at least one unit an option has nothing a traveller can book.",
  inputSchema: createOptionUnitInputSchema,
  outputSchema: createdChildReferenceSchema,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryOptionToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_OPTION_UNIT_HANDLER_POLICY)
    return createdChildReferenceSchema.parse(await options(ctx).createOptionUnit(input, admitted))
  },
})

export const updateOptionUnitTool = defineTool({
  ...writeMetadata,
  capabilityId: `${CAPABILITY_PREFIX}.tool.update-option-unit`,
  name: "update_option_unit",
  description:
    "Update a bookable unit's name, code, quantity bounds, age bounds, occupancy, or visibility. Clearing occupancy on a room or vehicle unit is rejected.",
  inputSchema: updateOptionUnitToolSchema,
  outputSchema: optionUnitValueSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryOptionToolContext) {
    return parseJsonResult(
      optionUnitValueSchema.nullable(),
      await options(ctx).updateOptionUnit(input),
    )
  },
})

export const inventoryOptionTools = [
  listProductOptionsTool,
  getProductOptionTool,
  createProductOptionTool,
  updateProductOptionTool,
  listOptionUnitsTool,
  getOptionUnitTool,
  createOptionUnitTool,
  updateOptionUnitTool,
] as const

/**
 * Serialize domain rows the way every sibling tools file does: `Date` columns
 * become ISO strings and `undefined` entries are dropped before the output
 * schema parses them. Kept file-local to match `tools.ts`, `extras-tools.ts`
 * and `day-tools.ts` — it is not exported by `@voyant-travel/tools`.
 */
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
