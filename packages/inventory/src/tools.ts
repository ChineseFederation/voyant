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
// Type-only: the Tools that wrapped these schemas are gone, but
// InventoryConfigurationToolServices still describes the services mcp-runtime
// contributes for routes and the operator UI, and it is typed from them.
import type {
  applyProductUnitConfigurationInputSchema,
  previewProductUnitConfigurationInputSchema,
} from "./product-unit-configuration.js"
import type { ProductReadinessIssue } from "./readiness.js"
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
const setProductOpenGraphImageToolSchema = z.object({
  productId: z.string().min(1).describe("The product id."),
  mediaId: z
    .string()
    .min(1)
    .nullable()
    .describe("A product-level image media id, or null to clear the explicit Open Graph image."),
})
const productOpenGraphMediaToolSchema = z
  .object({
    id: z.string(),
    productId: z.string(),
    isOpenGraph: z.literal(true),
  })
  .passthrough()
  .nullable()
const productIdArgs = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "The full product id returned by inventory_query (normally starts with `prod_`). A product name, numeric suffix, or run marker is not an id.",
    ),
})

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
  setProductOpenGraphImage(productId: string, mediaId: string | null): Promise<unknown | null>
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
  // voyant#3921: this handler derives its own idempotency key, so the caller must
  // not be asked for one. Without this flag the admission still lists
  // `idempotencyKey` as caller-required, the agent invents a value, reuses it
  // across a retry with different input, and the ledger rejects the fingerprint.
  resolvesIdempotencyKeyServerSide: true,

  // voyant#3921: the default option has to be stated. `ensureDefaultOption` seeds
  // a "Standard" option on every create so the pricing grid opens with something
  // attached — deliberate, and invisible from here. Measured against the real
  // graph: the agent, not knowing, created a SECOND option, put its priced unit
  // there, and the booking then resolved to the empty default and refused with
  // "no bookable units". Every product in the eval ended up with two options, one
  // holding the inventory and one holding nothing.
  description:
    "Create a draft product through Inventory's real authoring service. A default option named \"Standard\" is created with it, so add priced units to THAT option rather than creating another one — list the product's options first and reuse the existing one unless you genuinely need a second. Channel publication is a separate operation.",
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

export const setProductOpenGraphImageTool = defineTool({
  capabilityId: `${OWNER}#tool.set-product-open-graph-image`,
  capabilityVersion: VERSION,
  name: "set_product_open_graph_image",
  description:
    "Set a product-level image as the product's explicit Open Graph image, or clear the explicit selection with a null mediaId.",
  inputSchema: setProductOpenGraphImageToolSchema,
  outputSchema: productOpenGraphMediaToolSchema,
  requiredScopes: ["products:write"],
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: PRODUCT_WRITE_RISK,
  annotations: { idempotentHint: true },
  async handler({ productId, mediaId }, ctx: InventoryToolContext) {
    return parseJsonResult(
      productOpenGraphMediaToolSchema,
      await inventory(ctx).setProductOpenGraphImage(productId, mediaId),
    )
  },
})

export const publishProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.publish-product`,
    name: "publish_product",
    description:
      "Make a product active. Inventory enforces scheduled-product departure readiness; effective channel publication controls where it is distributed.",
    patch: { status: "active" },
  }),
)

export const unpublishProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.unpublish-product`,
    name: "unpublish_product",
    description:
      "Return a product to draft without deleting authored history or its channel publication rules.",
    patch: { status: "draft" },
  }),
)

export const archiveProductTool = defineTool(
  productLifecycleToolDefinition({
    capabilityId: `${OWNER}#tool.archive-product`,
    name: "archive_product",
    description: "Archive a product while preserving its history and owned records.",
    patch: { status: "archived" },
  }),
)

export const composeProductTool = defineTool({
  capabilityId: `${OWNER}#authoring.tool.compose-product`,
  capabilityVersion: VERSION,
  name: "compose_product",
  description:
    // voyant#3921: says what it is FOR, so it stops being the default answer to
    // "add a unit". The agent reached for this repeatedly to add one unit to an
    // existing product and looped, because composing a whole graph over a product
    // that already exists is not what it does.
    "Atomically author a COMPLETE product graph in one call — product, options, units, pricing rules and itinerary together — through Inventory's category-aware composer. Use it to create a fully-specified product from nothing; it is not the way to add one unit or option to a product that already exists (use create_option_unit or create_product_option for that). Invalid graphs return actionable issues without writing. Departures and publication remain separate confirmed operations.",
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

// voyant#3921: the preview/apply unit-configuration TOOLS are gone. They made an
// agent carry an exhaustive before/after plan verbatim between two calls, and
// they read as the way to touch units at all, so an agent trying to ADD one spent
// twenty-odd calls cycling over units that did not exist; removing them took that
// journey 0/10 to 10/10. create_option_unit and update_option_unit cover
// add-a-unit and change-a-unit, and the agent finds them unaided.
//
// The Tool wrappers are deleted rather than merely unbound: first-party manifest
// convergence requires every defineTool export to be declared in the selected
// graph, so "keep the export for programmatic callers" is not a state this repo
// allows. The SERVICES they wrapped — previewProductUnitConfiguration and
// applyProductUnitConfiguration in product-unit-configuration.ts — are untouched
// and still serve routes, the operator UI and their integration tests.

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
  setProductOpenGraphImageTool,
  updateProductDayTool,
  publishProductTool,
  unpublishProductTool,
  archiveProductTool,
  composeProductTool,
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
    outputSchema: productToolSchema,
    requiredScopes: ["products:write"],
    audience: STAFF_AUDIENCE,
    tier: "write",
    riskPolicy: PRODUCT_LIFECYCLE_RISK,
    annotations: { idempotentHint: true },
    async handler({ id }: z.infer<typeof productIdArgs>, ctx: InventoryToolContext) {
      try {
        const product = await inventory(ctx).updateProduct(id, input.patch)
        if (!product) {
          // A lifecycle mutation returning `null` is not success. The live GPT
          // client supplied a run-marker suffix as the id, received
          // `{ result: null }`, and confidently reported publication even though
          // the database stayed in draft. Turn absence into an actionable error
          // and require the same concrete output shape as a successful mutation.
          throw new ToolError(
            `No product exists with id "${id}". Resolve the full product id with inventory_query, then retry this lifecycle action.`,
            "NOT_FOUND",
            { id },
          )
        }
        return parseJsonResult(productToolSchema, product)
      } catch (error) {
        throw toPublishReadinessToolError(error)
      }
    },
  } as const
}

/**
 * Readiness refusal shape, matched structurally rather than with `instanceof`.
 *
 * The error may have been constructed by a different loaded copy of this package
 * — the same duplicate-install problem `isToolError` exists for (voyant#4115) —
 * and an `instanceof` miss here silently restores the very defect this converts.
 */
function isPublishReadinessError(
  error: unknown,
): error is { code: string; issues: ProductReadinessIssue[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "product_not_ready_to_publish" &&
    Array.isArray((error as { issues?: unknown }).issues)
  )
}

/**
 * Turn a publish refusal into something a caller can act on.
 *
 * `ProductPublishReadinessError` is a plain Error carrying a fully-formed
 * `issues[]` — each with a stable code, a description, and a `fix` written as an
 * instruction ("Create a future availability slot with status 'open', then
 * publish the product again."). None of it reached the caller: not being a
 * ToolError, it fell to the registry's unknown-throw wrapper and arrived as
 *
 *   [PROVIDER_ERROR] Tool "publish_product" failed: Product is not ready to publish
 *
 * which is wrong twice over. PROVIDER_ERROR means terminal and not-your-fault, so
 * a caller is being told to give up on something it could fix; and every issue
 * and every `fix` string was dropped on the floor.
 *
 * Measured consequence: no product the capability harness ever created reached
 * `active`, so bookings were refused as "not bookable" and invoicing had nothing
 * to invoice. The system knew exactly why and exactly how to fix it the whole
 * time.
 *
 * INVALID_INPUT, not PROVIDER_ERROR: the call is refused because of state the
 * caller can change, and an identical retry does fail identically until it does.
 */
function toPublishReadinessToolError(error: unknown): unknown {
  if (!isPublishReadinessError(error)) return error
  const issues = error.issues
  return new ToolError(
    `Product is not ready to publish: ${issues.map((issue) => issue.message).join(" ")}`,
    "INVALID_INPUT",
    { issues },
    { cause: error },
    { nextSteps: issues.map((issue, index) => `${index + 1}. ${issue.fix}`) },
  )
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
