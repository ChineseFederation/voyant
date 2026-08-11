/** Guarded Commerce Tools for sellability, pricing policy, and promotions. */

import {
  admitHandlerActionPolicy,
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"
import {
  COMMERCE_CREATED_TARGET_POLICIES,
  commerceHandlerActionPolicyExpectation,
} from "./created-target-policy.js"
import {
  cancellationPolicyListQuerySchema,
  insertCancellationPolicySchema,
  insertPriceCatalogSchema,
  priceCatalogListQuerySchema,
  priceCatalogTypeSchema,
  updateCancellationPolicySchema,
  updatePriceCatalogSchema,
} from "./pricing/validation.js"
import {
  insertPromotionalOfferSchema,
  promotionalOfferListQuerySchema,
  promotionalOfferSchema,
  updatePromotionalOfferSchema,
} from "./promotions/validation.js"
import {
  insertSellabilityPolicySchema,
  sellabilityPolicyListQuerySchema,
  sellabilityPolicyScopeSchema,
  sellabilityPolicyTypeSchema,
  sellabilityResolveQuerySchema,
  updateSellabilityPolicySchema,
} from "./sellability/validation.js"

const OWNER = "@voyant-travel/commerce"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const reversibleWriteRisk = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const
const createdWriteRisk = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: false,
  sideEffects: ["data-write"],
} as const

const idSchema = z.object({ id: z.string().min(1) })
const updateCancellationPolicyToolSchema = z.intersection(idSchema, updateCancellationPolicySchema)
const updatePriceCatalogToolSchema = z.intersection(idSchema, updatePriceCatalogSchema)
const updatePromotionToolSchema = z.intersection(idSchema, updatePromotionalOfferSchema)
const updateSellabilityPolicyToolSchema = z.intersection(idSchema, updateSellabilityPolicySchema)
const createdCommandInput = {
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Stable key used to replay this exact create command."),
}
const createCancellationPolicyToolInputSchema =
  insertCancellationPolicySchema.extend(createdCommandInput)
const createPriceCatalogToolInputSchema = insertPriceCatalogSchema.extend(createdCommandInput)
const createPromotionToolInputSchema = insertPromotionalOfferSchema.extend(createdCommandInput)
const createSellabilityPolicyToolInputSchema =
  insertSellabilityPolicySchema.extend(createdCommandInput)

const cancellationPolicySchema = z.object({
  id: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  policyType: z.enum(["flexible", "moderate", "strict", "non_refundable", "custom"]),
  simpleCutoffHours: z.number().int().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const sellabilityPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  scope: sellabilityPolicyScopeSchema,
  policyType: sellabilityPolicyTypeSchema,
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  marketId: z.string().nullable(),
  channelId: z.string().nullable(),
  priority: z.number().int(),
  active: z.boolean(),
  conditions: z.record(z.string(), z.unknown()),
  effects: z.record(z.string(), z.unknown()),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const priceCatalogSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  currencyCode: z.string().nullable(),
  // Was a hand-written `z.enum(["public", "private", "contracted", "internal",
  // "wholesale"])` that shared only TWO values with the `price_catalog_type`
  // Postgres enum it claims to describe (public, contract, net, gross, promo,
  // internal, other). Three of its members do not exist in the database and five
  // real ones were missing, so `list_price_catalogs` threw on any deployment
  // holding a contract/net/gross/promo/other catalog — the output failed its own
  // parse. Caught by a live agent run against a database with one `gross` row.
  // The canonical schema is derived from the same pgEnum, so this cannot drift again.
  catalogType: priceCatalogTypeSchema,
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
const createdCancellationPolicyOutputSchema = z.object({
  status: z.literal("created"),
  cancellationPolicy: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
const createdPriceCatalogOutputSchema = z.object({
  status: z.literal("created"),
  priceCatalog: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
const createdPromotionOutputSchema = z.object({
  status: z.literal("created"),
  promotion: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
const createdSellabilityPolicyOutputSchema = z.object({
  status: z.literal("created"),
  sellabilityPolicy: z.object({ id: z.string() }),
  replayed: z.boolean(),
})

const resolvedComponentSchema = z.object({
  kind: z.enum(["base", "unit", "pickup", "start_time_adjustment"]),
  title: z.string(),
  quantity: z.number(),
  pricingMode: z.string(),
  sellAmountCents: z.number().int(),
  costAmountCents: z.number().int(),
  unitId: z.string().nullable(),
  unitName: z.string().nullable(),
  unitType: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  pricingCategoryName: z.string().nullable(),
  requestRef: z.string().nullable(),
  sourceRuleId: z.string().nullable(),
  tierId: z.string().nullable(),
})

const sellabilityCandidateSchema = z.object({
  product: z.object({ id: z.string(), name: z.string() }),
  option: z.object({ id: z.string(), name: z.string(), code: z.string().nullable() }),
  slot: z.object({
    id: z.string(),
    productId: z.string(),
    optionId: z.string().nullable(),
    startTimeId: z.string().nullable(),
    dateLocal: z.string(),
    startsAt: z.string(),
    timezone: z.string(),
    unlimited: z.boolean(),
    remainingPax: z.number().int().nullable(),
    remainingPickups: z.number().int().nullable(),
    pastCutoff: z.boolean(),
    tooEarly: z.boolean(),
  }),
  market: z.object({ id: z.string(), code: z.string(), name: z.string() }).nullable(),
  channel: z.record(z.string(), z.unknown()).nullable(),
  sellability: z.object({
    mode: z.enum(["sellable", "on_request", "unavailable"]),
    onRequest: z.boolean(),
    allotmentStatus: z.enum(["not_applicable", "sellable", "sold_out"]),
  }),
  pricing: z.object({
    currencyCode: z.string(),
    sellAmountCents: z.number().int(),
    costAmountCents: z.number().int(),
    marginAmountCents: z.number().int(),
    breakdown: z.array(z.record(z.string(), z.unknown())),
    components: z.array(resolvedComponentSchema),
    fx: z
      .object({
        fxRateSetId: z.string(),
        baseCurrency: z.string(),
        quoteCurrency: z.string(),
        rateDecimal: z.number(),
      })
      .nullable(),
  }),
  sources: z.object({
    marketProductRuleId: z.string().nullable(),
    marketChannelRuleId: z.string().nullable(),
    marketPriceCatalogId: z.string().nullable(),
    optionPriceRuleId: z.string(),
    optionStartTimeRuleId: z.string().nullable(),
    channelInventoryAllotmentIds: z.array(z.string()),
    channelInventoryReleaseRuleId: z.string().nullable(),
  }),
})
const resolveSellabilityOutputSchema = z.object({
  data: z.array(sellabilityCandidateSchema),
  meta: z.object({ total: z.number().int() }),
})

type AnyServiceInput = Record<string, unknown>
export interface CommerceToolServices {
  resolveSellability(input: z.infer<typeof sellabilityResolveQuerySchema>): Promise<unknown>
  listSellabilityPolicies(input: z.infer<typeof sellabilityPolicyListQuerySchema>): Promise<unknown>
  getSellabilityPolicy(id: string): Promise<unknown>
  createSellabilityPolicy(
    input: z.infer<typeof createSellabilityPolicyToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateSellabilityPolicy(id: string, input: AnyServiceInput): Promise<unknown>
  listCancellationPolicies(
    input: z.infer<typeof cancellationPolicyListQuerySchema>,
  ): Promise<unknown>
  getCancellationPolicy(id: string): Promise<unknown>
  createCancellationPolicy(
    input: z.infer<typeof createCancellationPolicyToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updateCancellationPolicy(id: string, input: AnyServiceInput): Promise<unknown>
  listPriceCatalogs(input: z.infer<typeof priceCatalogListQuerySchema>): Promise<unknown>
  getPriceCatalog(id: string): Promise<unknown>
  createPriceCatalog(
    input: z.infer<typeof createPriceCatalogToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updatePriceCatalog(id: string, input: AnyServiceInput): Promise<unknown>
  listPromotions(input: z.infer<typeof promotionalOfferListQuerySchema>): Promise<unknown>
  getPromotion(id: string): Promise<unknown>
  createPromotion(
    input: z.infer<typeof createPromotionToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  updatePromotion(id: string, input: z.infer<typeof updatePromotionalOfferSchema>): Promise<unknown>
  archivePromotion(id: string): Promise<unknown>
}

export type CommerceToolContext = ToolContext & { commerce?: CommerceToolServices }

function commerce(ctx: CommerceToolContext): CommerceToolServices {
  return requireService(ctx.commerce, "commerce")
}

function readMetadata(scopes: readonly string[]) {
  return {
    owner: OWNER,
    capabilityVersion: VERSION,
    requiredScopes: scopes,
    audience: STAFF_AUDIENCE,
    tier: "read" as const,
    riskPolicy: READ_ONLY_RISK,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }
}

function writeMetadata(scopes: readonly string[]) {
  return {
    owner: OWNER,
    capabilityVersion: VERSION,
    requiredScopes: scopes,
    audience: STAFF_AUDIENCE,
    tier: "write" as const,
    riskPolicy: reversibleWriteRisk,
  }
}

export const resolveSellabilityTool = defineTool({
  ...readMetadata(["sellability:read"]),
  capabilityId: `${OWNER}#tool.resolve-sellability`,
  name: "resolve_sellability",
  description:
    "Resolve live sellability, allotment, pricing, margin, and FX candidates for a product/option/slot request. Read-only.",
  inputSchema: sellabilityResolveQuerySchema,
  outputSchema: resolveSellabilityOutputSchema,
  async handler(input, ctx: CommerceToolContext) {
    return resolveSellabilityOutputSchema.parse(await commerce(ctx).resolveSellability(input))
  },
})

export const listSellabilityPoliciesTool = defineTool({
  ...readMetadata(["sellability:read"]),
  capabilityId: `${OWNER}#tool.list-sellability-policies`,
  name: "list_sellability_policies",
  description:
    "List the commercial policies that determine whether an offer can be sold. Read-only.",
  inputSchema: sellabilityPolicyListQuerySchema,
  outputSchema: listResponseSchema(sellabilityPolicySchema),
  async handler(input, ctx: CommerceToolContext) {
    return listResponseSchema(sellabilityPolicySchema).parse(
      await commerce(ctx).listSellabilityPolicies(input),
    )
  },
})

export const getSellabilityPolicyTool = defineTool({
  ...readMetadata(["sellability:read"]),
  capabilityId: `${OWNER}#tool.get-sellability-policy`,
  name: "get_sellability_policy",
  description: "Read one commercial sellability policy by id. Read-only.",
  inputSchema: idSchema,
  outputSchema: sellabilityPolicySchema.nullable(),
  async handler({ id }, ctx: CommerceToolContext) {
    return sellabilityPolicySchema.nullable().parse(await commerce(ctx).getSellabilityPolicy(id))
  },
})

export const createSellabilityPolicyTool = defineTool({
  ...writeMetadata(["sellability:write"]),
  riskPolicy: createdWriteRisk,
  capabilityId: `${OWNER}#tool.create-sellability-policy`,
  name: "create_sellability_policy",
  description:
    "Create a commercial sellability rule for a global, product, option, market, or channel scope. Exact retries return the original reference.",
  inputSchema: createSellabilityPolicyToolInputSchema,
  outputSchema: createdSellabilityPolicyOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CommerceToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      commerceHandlerActionPolicyExpectation(COMMERCE_CREATED_TARGET_POLICIES.sellabilityPolicy),
    )
    return createdSellabilityPolicyOutputSchema.parse(
      await commerce(ctx).createSellabilityPolicy(input, admitted),
    )
  },
})

export const updateSellabilityPolicyTool = defineTool({
  ...writeMetadata(["sellability:write"]),
  capabilityId: `${OWNER}#tool.update-sellability-policy`,
  name: "update_sellability_policy",
  description:
    "Update or deactivate an existing sellability policy while preserving its identity and evaluation history.",
  inputSchema: updateSellabilityPolicyToolSchema,
  outputSchema: sellabilityPolicySchema.nullable(),
  annotations: { idempotentHint: true },
  async handler({ id, ...patch }, ctx: CommerceToolContext) {
    return sellabilityPolicySchema
      .nullable()
      .parse(await commerce(ctx).updateSellabilityPolicy(id, patch))
  },
})

export const listCancellationPoliciesTool = defineTool({
  ...readMetadata(["pricing:read"]),
  capabilityId: `${OWNER}#tool.list-cancellation-policies`,
  name: "list_cancellation_policies",
  description: "List cancellation policies used by pricing and booking flows. Read-only.",
  inputSchema: cancellationPolicyListQuerySchema,
  outputSchema: listResponseSchema(cancellationPolicySchema),
  async handler(input, ctx: CommerceToolContext) {
    return listResponseSchema(cancellationPolicySchema).parse(
      await commerce(ctx).listCancellationPolicies(input),
    )
  },
})

export const getCancellationPolicyTool = defineTool({
  ...readMetadata(["pricing:read"]),
  capabilityId: `${OWNER}#tool.get-cancellation-policy`,
  name: "get_cancellation_policy",
  description: "Read one cancellation policy by id. Read-only.",
  inputSchema: idSchema,
  outputSchema: cancellationPolicySchema.nullable(),
  async handler({ id }, ctx: CommerceToolContext) {
    return cancellationPolicySchema.nullable().parse(await commerce(ctx).getCancellationPolicy(id))
  },
})

export const createCancellationPolicyTool = defineTool({
  ...writeMetadata(["pricing:write"]),
  riskPolicy: createdWriteRisk,
  capabilityId: `${OWNER}#tool.create-cancellation-policy`,
  name: "create_cancellation_policy",
  description:
    "Create a cancellation policy configuration. Exact retries return the original immutable reference.",
  inputSchema: createCancellationPolicyToolInputSchema,
  outputSchema: createdCancellationPolicyOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CommerceToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      commerceHandlerActionPolicyExpectation(COMMERCE_CREATED_TARGET_POLICIES.cancellationPolicy),
    )
    return createdCancellationPolicyOutputSchema.parse(
      await commerce(ctx).createCancellationPolicy(input, admitted),
    )
  },
})

export const updateCancellationPolicyTool = defineTool({
  ...writeMetadata(["pricing:write"]),
  capabilityId: `${OWNER}#tool.update-cancellation-policy`,
  name: "update_cancellation_policy",
  description: "Update an existing cancellation policy without deleting it.",
  inputSchema: updateCancellationPolicyToolSchema,
  outputSchema: cancellationPolicySchema.nullable(),
  annotations: { idempotentHint: true },
  async handler({ id, ...patch }, ctx: CommerceToolContext) {
    return cancellationPolicySchema
      .nullable()
      .parse(await commerce(ctx).updateCancellationPolicy(id, patch))
  },
})

export const listPriceCatalogsTool = defineTool({
  ...readMetadata(["pricing:read"]),
  capabilityId: `${OWNER}#tool.list-price-catalogs`,
  name: "list_price_catalogs",
  description: "List configured price catalogs and currencies. Read-only.",
  inputSchema: priceCatalogListQuerySchema,
  outputSchema: listResponseSchema(priceCatalogSchema),
  async handler(input, ctx: CommerceToolContext) {
    return listResponseSchema(priceCatalogSchema).parse(
      await commerce(ctx).listPriceCatalogs(input),
    )
  },
})

export const getPriceCatalogTool = defineTool({
  ...readMetadata(["pricing:read"]),
  capabilityId: `${OWNER}#tool.get-price-catalog`,
  name: "get_price_catalog",
  description: "Read one price catalog by id. Read-only.",
  inputSchema: idSchema,
  outputSchema: priceCatalogSchema.nullable(),
  async handler({ id }, ctx: CommerceToolContext) {
    return priceCatalogSchema.nullable().parse(await commerce(ctx).getPriceCatalog(id))
  },
})

export const createPriceCatalogTool = defineTool({
  ...writeMetadata(["pricing:write"]),
  riskPolicy: createdWriteRisk,
  capabilityId: `${OWNER}#tool.create-price-catalog`,
  name: "create_price_catalog",
  description:
    "Create a price catalog for a commercial audience or channel. Exact retries return the original immutable reference.",
  inputSchema: createPriceCatalogToolInputSchema,
  outputSchema: createdPriceCatalogOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CommerceToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      commerceHandlerActionPolicyExpectation(COMMERCE_CREATED_TARGET_POLICIES.priceCatalog),
    )
    return createdPriceCatalogOutputSchema.parse(
      await commerce(ctx).createPriceCatalog(input, admitted),
    )
  },
})

export const updatePriceCatalogTool = defineTool({
  ...writeMetadata(["pricing:write"]),
  capabilityId: `${OWNER}#tool.update-price-catalog`,
  name: "update_price_catalog",
  description: "Update a price catalog without deleting its pricing history.",
  inputSchema: updatePriceCatalogToolSchema,
  outputSchema: priceCatalogSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler({ id, ...patch }, ctx: CommerceToolContext) {
    return priceCatalogSchema.nullable().parse(await commerce(ctx).updatePriceCatalog(id, patch))
  },
})

export const listPromotionsTool = defineTool({
  ...readMetadata(["promotions:read"]),
  capabilityId: `${OWNER}#tool.list-promotions`,
  name: "list_promotions",
  description:
    "List promotional offers by lifecycle status, scope, application mode, or code. Read-only.",
  inputSchema: promotionalOfferListQuerySchema,
  outputSchema: listResponseSchema(promotionalOfferSchema),
  async handler(input, ctx: CommerceToolContext) {
    return listResponseSchema(promotionalOfferSchema).parse(
      await commerce(ctx).listPromotions(input),
    )
  },
})

export const getPromotionTool = defineTool({
  ...readMetadata(["promotions:read"]),
  capabilityId: `${OWNER}#tool.get-promotion`,
  name: "get_promotion",
  description: "Read one promotional offer by id. Read-only.",
  inputSchema: idSchema,
  outputSchema: promotionalOfferSchema.nullable(),
  async handler({ id }, ctx: CommerceToolContext) {
    return promotionalOfferSchema.nullable().parse(await commerce(ctx).getPromotion(id))
  },
})

export const createPromotionTool = defineTool({
  ...writeMetadata(["promotions:write"]),
  riskPolicy: createdWriteRisk,
  capabilityId: `${OWNER}#tool.create-promotion`,
  name: "create_promotion",
  description:
    "Create a promotional offer and materialize its affected product scope. Exact retries return the original immutable reference.",
  inputSchema: createPromotionToolInputSchema,
  outputSchema: createdPromotionOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CommerceToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      commerceHandlerActionPolicyExpectation(COMMERCE_CREATED_TARGET_POLICIES.promotion),
    )
    return createdPromotionOutputSchema.parse(await commerce(ctx).createPromotion(input, admitted))
  },
})

export const updatePromotionTool = defineTool({
  ...writeMetadata(["promotions:write"]),
  capabilityId: `${OWNER}#tool.update-promotion`,
  name: "update_promotion",
  description: "Update a promotional offer and recompute its affected product scope.",
  inputSchema: updatePromotionToolSchema,
  outputSchema: promotionalOfferSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler({ id, ...patch }, ctx: CommerceToolContext) {
    return promotionalOfferSchema.nullable().parse(await commerce(ctx).updatePromotion(id, patch))
  },
})

export const archivePromotionTool = defineTool({
  ...writeMetadata(["promotions:write"]),
  capabilityId: `${OWNER}#tool.archive-promotion`,
  name: "archive_promotion",
  description: "Deactivate and archive a promotion while preserving redemption and audit history.",
  inputSchema: idSchema,
  outputSchema: promotionalOfferSchema.nullable(),
  async handler({ id }, ctx: CommerceToolContext) {
    return promotionalOfferSchema.nullable().parse(await commerce(ctx).archivePromotion(id))
  },
})

export const commerceTools = [
  resolveSellabilityTool,
  listSellabilityPoliciesTool,
  getSellabilityPolicyTool,
  createSellabilityPolicyTool,
  updateSellabilityPolicyTool,
  listCancellationPoliciesTool,
  getCancellationPolicyTool,
  createCancellationPolicyTool,
  updateCancellationPolicyTool,
  listPriceCatalogsTool,
  getPriceCatalogTool,
  createPriceCatalogTool,
  updatePriceCatalogTool,
  listPromotionsTool,
  getPromotionTool,
  createPromotionTool,
  updatePromotionTool,
  archivePromotionTool,
] as const
