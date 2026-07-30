// agent-quality: file-size exception -- owner: inventory; #3929 the product,
// option, and unit Tool surface stays co-located so one schema + admission
// vocabulary backs every read/write; splitting it would fan the shared context
// type and result serializer across files without reducing review surface.
/**
 * Inventory (products) agent tools on the framework tool contract.
 *
 * Thin wrappers over existing Inventory services — no new domain logic. The
 * service is injected on the context by intersection
 * (`InventoryToolContext`), so this module stays deployment-agnostic; the
 * operator binds the service to its request `db` and registers these tools on the
 * shared MCP registry alongside every other domain's tools.
 */

import { productContentSchema } from "@voyant-travel/products-contracts/content-shape"
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
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import { productGraphSpecSchema } from "./authoring/spec.js"
import {
  listProductDaysTool as listProductDaysDefinition,
  type UpdateProductDayInput,
  updateProductDayTool as updateProductDayDefinition,
} from "./day-tools.js"
import {
  createOptionExtraConfigTool as createOptionExtraConfigDefinition,
  createProductExtraTool as createProductExtraDefinition,
  getOptionExtraConfigTool as getOptionExtraConfigDefinition,
  getProductExtraTool as getProductExtraDefinition,
  listOptionExtraConfigsTool as listOptionExtraConfigsDefinition,
  listProductExtrasTool as listProductExtrasDefinition,
  updateOptionExtraConfigTool as updateOptionExtraConfigDefinition,
  updateProductExtraTool as updateProductExtraDefinition,
} from "./extras-tools.js"
import {
  createOptionUnitTool as createOptionUnitDefinition,
  createProductOptionTool as createProductOptionDefinition,
  getOptionUnitTool as getOptionUnitDefinition,
  getProductOptionTool as getProductOptionDefinition,
  listOptionUnitsTool as listOptionUnitsDefinition,
  listProductOptionsTool as listProductOptionsDefinition,
  updateOptionUnitTool as updateOptionUnitDefinition,
  updateProductOptionTool as updateProductOptionDefinition,
} from "./option-tools.js"
import {
  appliedProductUnitConfigurationSchema,
  applyProductUnitConfigurationInputSchema,
  previewProductUnitConfigurationInputSchema,
  productUnitConfigurationPreviewSchema,
} from "./product-unit-configuration.js"
import { insertProductSchema, productListQuerySchema, updateProductSchema } from "./validation.js"

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
const PRODUCT_LIFECYCLE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const
export const CREATE_PRODUCT_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.create-product`,
  capabilityVersion: VERSION,
  canonicalName: "create_product",
  actionPolicy: {
    id: `${OWNER}#action.create-product`,
    capabilityId: `${OWNER}#action.create-product`,
    version: VERSION,
    kind: "execute",
    targetType: "product",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "product-create-command",
      resultReferenceType: "product",
      durability: "handler-command-claim-v1",
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation
export const COMPOSE_PRODUCT_HANDLER_POLICY = {
  capabilityId: `${OWNER}#authoring.tool.compose-product`,
  capabilityVersion: VERSION,
  canonicalName: "compose_product",
  actionPolicy: {
    id: `${OWNER}#authoring.action.compose-product`,
    capabilityId: `${OWNER}#authoring.action.compose-product`,
    version: VERSION,
    kind: "execute",
    targetType: "product",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "product-compose-command",
      resultReferenceType: "product",
      durability: "handler-command-claim-v1",
    },
    risk: "high",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

type ProductListQuery = z.infer<typeof productListQuerySchema>

const productToolSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: z.enum(["draft", "active", "archived"]),
    bookingMode: z.enum(["date", "date_time", "open", "stay", "transfer", "itinerary", "other"]),
    capacityMode: z.enum(["free_sale", "limited", "on_request"]),
    visibility: z.enum(["public", "private", "hidden"]),
    activated: z.boolean(),
    sellCurrency: z.string(),
    sellAmountCents: z.number().int().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    pax: z.number().int().nullable(),
    productTypeId: z.string().nullable(),
    /** Primary catalog slug when a product translation has one; otherwise null. */
    slug: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough()
const productListToolSchema = listResponseSchema(productToolSchema)
const createProductResultSchema = z.object({
  productId: z.string(),
  slug: z.string().nullable().optional(),
})
type ProductListToolResult = z.output<typeof productListToolSchema>

const productContentToolSchema = z.object({
  content: productContentSchema,
  provenance: z.object({
    source_kind: z.string(),
    source_provider: z.string().optional(),
    source_connection_id: z.string().optional(),
    source_ref: z.string().optional(),
  }),
  served_locale: z.string(),
  match_kind: z.enum(["exact", "language_match", "fallback_chain", "any"]),
  source: z.enum(["sourced-cache", "sourced-fresh", "synthesized", "owned"]),
  served_stale: z.boolean(),
  synthesized: z.boolean(),
  machine_translated: z.boolean(),
})

const getProductContentArgs = z.object({
  id: z.string().min(1).describe("The product id."),
  preferredLocales: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe("Ordered locale preference. Defaults to the grant resolver locale."),
  market: z.string().min(1).optional(),
  currency: z.string().length(3).optional(),
  acceptMachineTranslated: z.boolean().default(false),
  forceFresh: z.boolean().default(false),
})

export const createProductToolSchema = z
  .object(
    (({ status: _status, visibility: _visibility, activated: _activated, ...shape }) => shape)(
      insertProductSchema.shape,
    ),
  )
  .extend({ idempotencyKey: z.string().trim().min(1).max(255).optional() })
const updateProductToolSchema = z.object({
  id: z.string().min(1),
  ...updateProductSchema.shape,
})
const productIdArgs = z.object({ id: z.string().min(1).describe("The product id.") })

export type ProductContentToolInput = z.output<typeof getProductContentArgs>

/** A paginated product list result (the shape the products service returns). */
export interface ProductListResult {
  data: unknown[]
  total: number
  limit: number
  offset: number
}

/** The products read surface a deployment binds into the tool context. */
export interface InventoryToolServices {
  listProducts(query: z.infer<typeof productListQuerySchema>): Promise<ProductListResult>
  getProductById(id: string): Promise<unknown | null>
  getProductBySlug(slug: string): Promise<unknown | null>
  getProductAggregates(query: { from?: string; to?: string }): Promise<unknown>
  createProduct(
    input: z.output<typeof createProductToolSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateProduct(id: string, input: z.output<typeof updateProductSchema>): Promise<unknown | null>
  listProductDays(productId: string): Promise<unknown[]>
  updateProductDay(input: UpdateProductDayInput): Promise<unknown | null>
  resolveProductIdForDay(dayId: string): Promise<string | null>
}

export interface InventoryContentToolServices {
  getProductContent(input: ProductContentToolInput): Promise<unknown | null>
}

export interface InventoryAuthoringToolServices {
  composeProduct(
    input: {
      spec: z.output<typeof productGraphSpecSchema>
      idempotencyKey?: string
    },
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}

export interface InventoryConfigurationToolServices {
  previewProductUnitConfiguration(
    input: z.input<typeof previewProductUnitConfigurationInputSchema>,
  ): Promise<unknown>
  applyProductUnitConfiguration(
    input: z.input<typeof applyProductUnitConfigurationInputSchema>,
  ): Promise<unknown>
}

/** Tool context with the inventory service injected. */
export type InventoryToolContext = ToolContext & {
  inventory?: InventoryToolServices
  inventoryContent?: InventoryContentToolServices
  inventoryAuthoring?: InventoryAuthoringToolServices
  inventoryConfiguration?: InventoryConfigurationToolServices
}

function inventory(ctx: InventoryToolContext): InventoryToolServices {
  return requireService(ctx.inventory, "inventory")
}

function inventoryContent(ctx: InventoryToolContext): InventoryContentToolServices {
  return requireService(ctx.inventoryContent, "inventoryContent")
}

function inventoryAuthoring(ctx: InventoryToolContext): InventoryAuthoringToolServices {
  return requireService(ctx.inventoryAuthoring, "inventoryAuthoring")
}

function inventoryConfiguration(ctx: InventoryToolContext): InventoryConfigurationToolServices {
  return requireService(ctx.inventoryConfiguration, "inventoryConfiguration")
}

export const composeProductToolInputSchema = z.object({
  spec: productGraphSpecSchema,
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Stable retry key for atomic product-graph authoring."),
})

const authoringIssueSchema = z.object({
  code: z.string(),
  field: z.string().optional(),
  message: z.string(),
  fix: z.string().optional(),
})

export const composeProductToolOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    productId: z.string(),
    reused: z.boolean(),
    slug: z.string().nullable().optional(),
  }),
  z.object({ status: z.literal("invalid"), issues: z.array(authoringIssueSchema) }),
])

function constrainProductListQuery(query: ProductListQuery, ctx: ToolContext): ProductListQuery {
  if (ctx.actor === "staff") return query
  return { ...query, status: "active", visibility: "public", activated: true }
}

function isVisibleProduct(product: unknown, ctx: ToolContext): boolean {
  if (ctx.actor === "staff") return true
  if (!product || typeof product !== "object") return false
  const row = product as { status?: unknown; visibility?: unknown; activated?: unknown }
  return row.status === "active" && row.visibility === "public" && row.activated === true
}

export const listProductsTool = defineTool<
  z.infer<typeof productListQuerySchema>,
  ProductListToolResult,
  InventoryToolContext
>({
  name: "list_products",
  description:
    "List products with optional filters (status, booking mode, category, tag, search, " +
    "date range, price/pax bounds) and pagination. Returns { data, total, limit, offset }. " +
    "Read-only.",
  inputSchema: productListQuerySchema,
  outputSchema: productListToolSchema,
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(query, ctx) {
    return parseJsonResult(
      productListToolSchema,
      await inventory(ctx).listProducts(constrainProductListQuery(query, ctx)),
    )
  },
})

const getProductArgs = z.object({
  id: z.string().min(1).optional().describe("The product id (prod_…). Provide this or slug."),
  slug: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The product's catalog slug. Accepted as a human-readable alternative to id; resolve it from list_products or get_product output.",
    ),
})
export type GetProductArgs = z.infer<typeof getProductArgs>

export const getProductTool = defineTool<
  GetProductArgs,
  { product: unknown | null },
  InventoryToolContext
>({
  name: "get_product",
  description:
    "Read a single product by id or by its catalog slug. Returns null when not found. Read-only.",
  inputSchema: getProductArgs,
  outputSchema: z.object({ product: productToolSchema.nullable() }),
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id, slug }, ctx) {
    if (!id && !slug) {
      throw new ToolError("Provide either id or slug.", "INVALID_INPUT")
    }
    const product = id
      ? await inventory(ctx).getProductById(id)
      : await inventory(ctx).getProductBySlug(slug as string)
    return parseJsonResult(z.object({ product: productToolSchema.nullable() }), {
      product: product && isVisibleProduct(product, ctx) ? product : null,
    })
  },
})

export const getProductContentTool = defineTool({
  capabilityId: `${OWNER}#content-extension.tool.get-product-content`,
  capabilityVersion: VERSION,
  name: "get_product_content",
  description:
    "Resolve essential composed product content across owned and selected sourced providers, including locale provenance, options, itinerary, media, policies, and departures. Read-only.",
  inputSchema: getProductContentArgs,
  outputSchema: productContentToolSchema.nullable(),
  requiredScopes: ["products:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx: InventoryToolContext) {
    return parseJsonResult(
      productContentToolSchema.nullable(),
      await inventoryContent(ctx).getProductContent({
        ...input,
        preferredLocales: input.preferredLocales ?? [ctx.resolverScope.locale],
        market: input.market ?? ctx.resolverScope.market,
      }),
    )
  },
})

export const createProductTool = defineTool({
  capabilityId: `${OWNER}#tool.create-product`,
  capabilityVersion: VERSION,
  name: "create_product",
  description:
    "Create a private draft product through Inventory's real authoring service. Publication is a separate confirmed lifecycle operation.",
  inputSchema: createProductToolSchema,
  outputSchema: createProductResultSchema,
  requiredScopes: ["products:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: PRODUCT_WRITE_RISK,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_PRODUCT_HANDLER_POLICY)
    return createProductResultSchema.parse(await inventory(ctx).createProduct(input, admitted))
  },
})

export const updateProductTool = defineTool({
  capabilityId: `${OWNER}#tool.update-product`,
  capabilityVersion: VERSION,
  name: "update_product",
  description:
    "Update authored product identity, commercial configuration, dates, policy, and core content without changing publication lifecycle fields. Use sellAmountCents + sellCurrency for package selling price.",
  inputSchema: updateProductToolSchema.omit({
    status: true,
    visibility: true,
    activated: true,
  }),
  outputSchema: productToolSchema.nullable(),
  requiredScopes: ["products:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: PRODUCT_WRITE_RISK,
  annotations: { idempotentHint: true },
  async handler({ id, ...input }, ctx: InventoryToolContext) {
    return parseJsonResult(
      productToolSchema.nullable(),
      await inventory(ctx).updateProduct(id, input),
    )
  },
})

export const publishProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.publish-product`,
    name: "publish_product",
    description:
      "Publish a product to the public catalog. Inventory enforces scheduled-product departure readiness before committing.",
    patch: { status: "active", visibility: "public", activated: true },
  }),
)

export const unpublishProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.unpublish-product`,
    name: "unpublish_product",
    description:
      "Remove a product from the public catalog without deleting authored product history.",
    patch: { activated: false },
  }),
)

export const archiveProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.archive-product`,
    name: "archive_product",
    description: "Archive and deactivate a product while preserving its history and owned records.",
    patch: { status: "archived", activated: false },
  }),
)

export const composeProductTool = defineTool({
  capabilityId: `${OWNER}#authoring.tool.compose-product`,
  capabilityVersion: VERSION,
  name: "compose_product",
  description:
    "Atomically author a complete product graph through Inventory's category-aware composer: product, options, units, pricing rules, and itinerary. Invalid graphs return actionable issues without writing. Departures and publication remain separate confirmed operations.",
  inputSchema: composeProductToolInputSchema,
  outputSchema: composeProductToolOutputSchema,
  requiredScopes: ["products:write"],
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: InventoryToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, COMPOSE_PRODUCT_HANDLER_POLICY)
    return composeProductToolOutputSchema.parse(
      await inventoryAuthoring(ctx).composeProduct(input, admitted),
    )
  },
})

export const previewProductUnitConfigurationTool = defineTool({
  capabilityId: `${OWNER}#tool.preview-product-unit-configuration`,
  capabilityVersion: VERSION,
  name: "preview_product_unit_configuration",
  description:
    "Prevalidate a room/unit quantity and price edit and return an exhaustive approval plan. " +
    "The plan includes exact before/after values for every unit, including untouched units. " +
    "Pass the returned ready plan unchanged to apply_product_unit_configuration.",
  inputSchema: previewProductUnitConfigurationInputSchema,
  outputSchema: productUnitConfigurationPreviewSchema,
  requiredScopes: ["products:read", "pricing:read"],
  audience: STAFF_AUDIENCE,
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: InventoryToolContext) {
    return productUnitConfigurationPreviewSchema.parse(
      await inventoryConfiguration(ctx).previewProductUnitConfiguration(input),
    )
  },
})

export const applyProductUnitConfigurationTool = defineTool({
  capabilityId: `${OWNER}#tool.apply-product-unit-configuration`,
  capabilityVersion: VERSION,
  name: "apply_product_unit_configuration",
  description:
    "Atomically apply an unchanged preview_product_unit_configuration plan. Requires confirmation " +
    "because the full input is the operator's exact before/after approval record. Stale plans fail " +
    "without writing; exact retries return replayed.",
  inputSchema: applyProductUnitConfigurationInputSchema,
  outputSchema: appliedProductUnitConfigurationSchema,
  requiredScopes: ["products:write", "pricing:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  async handler(input, ctx: InventoryToolContext) {
    return appliedProductUnitConfigurationSchema.parse(
      await inventoryConfiguration(ctx).applyProductUnitConfiguration(input),
    )
  },
})

// Product options and their bookable units live in their own file; re-declare
// them through `defineTool` here so the manifest's single
// `@voyant-travel/inventory/tools` entry points at a defineTool export, as the
// graph convergence check requires (same shape as the extras Tools above).
export const listProductOptionsTool = defineTool(listProductOptionsDefinition)
export const getProductOptionTool = defineTool(getProductOptionDefinition)
export const createProductOptionTool = defineTool(createProductOptionDefinition)
export const updateProductOptionTool = defineTool(updateProductOptionDefinition)
export const listOptionUnitsTool = defineTool(listOptionUnitsDefinition)
export const getOptionUnitTool = defineTool(getOptionUnitDefinition)
export const createOptionUnitTool = defineTool(createOptionUnitDefinition)
export const updateOptionUnitTool = defineTool(updateOptionUnitDefinition)

export const listProductDaysTool = defineTool(listProductDaysDefinition)
export const updateProductDayTool = defineTool(updateProductDayDefinition)

export const listProductExtrasTool = defineTool(listProductExtrasDefinition)
export const getProductExtraTool = defineTool(getProductExtraDefinition)
export const createProductExtraTool = defineTool(createProductExtraDefinition)
export const updateProductExtraTool = defineTool(updateProductExtraDefinition)
export const listOptionExtraConfigsTool = defineTool(listOptionExtraConfigsDefinition)
export const getOptionExtraConfigTool = defineTool(getOptionExtraConfigDefinition)
export const createOptionExtraConfigTool = defineTool(createOptionExtraConfigDefinition)
export const updateOptionExtraConfigTool = defineTool(updateOptionExtraConfigDefinition)

/** All inventory agent tools, ready to register on a `ToolRegistry`. */
export const inventoryTools = [
  listProductsTool,
  getProductTool,
  getProductContentTool,
  listProductDaysTool,
  createProductTool,
  updateProductTool,
  updateProductDayTool,
  publishProductTool,
  unpublishProductTool,
  archiveProductTool,
  composeProductTool,
  previewProductUnitConfigurationTool,
  applyProductUnitConfigurationTool,
] as const

function productLifecycleToolDefinition(input: {
  capabilityId: string
  name: string
  description: string
  patch: z.output<typeof updateProductSchema>
}) {
  return {
    capabilityId: input.capabilityId,
    capabilityVersion: VERSION,
    name: input.name,
    description: input.description,
    inputSchema: productIdArgs,
    outputSchema: productToolSchema.nullable(),
    requiredScopes: ["products:write"],
    audience: STAFF_AUDIENCE,
    tier: "write",
    riskPolicy: PRODUCT_LIFECYCLE_RISK,
    annotations: { idempotentHint: true },
    async handler({ id }: z.infer<typeof productIdArgs>, ctx: InventoryToolContext) {
      return parseJsonResult(
        productToolSchema.nullable(),
        await inventory(ctx).updateProduct(id, input.patch),
      )
    },
  } as const
}

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
