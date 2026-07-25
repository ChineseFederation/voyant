/** Provider-neutral charter Tools over local inventory and selected adapters. */

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
  CHARTERS_CREATED_TARGET_POLICIES,
  chartersHandlerActionPolicyExpectation,
} from "./created-target-policy.js"
import {
  insertProductSchema,
  insertVoyageSchema,
  productListQuerySchema,
  updateProductSchema,
  updateVoyageSchema,
} from "./validation-core.js"
import {
  charterBookingModeSchema,
  charterSourceSchema,
  charterStatusSchema,
  currencyCodeSchema,
  voyageSalesStatusSchema,
  yachtClassSchema,
} from "./validation-shared.js"
import { insertYachtSchema, updateYachtSchema } from "./validation-yachts.js"

const OWNER = "@voyant-travel/charters"
const READ_SCOPES = ["charters:read"] as const
const WRITE_SCOPES = ["charters:write"] as const
const PUBLIC_AUDIENCE = { source: "grant", allowed: ["staff", "customer"] } as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  sideEffects: ["data-write"],
} as const
const CREATED_WRITE_RISK = {
  ...WRITE_RISK,
  reversible: false,
} as const
const timestampSchema = z.string().datetime()
const sourceRefSchema = z
  .object({ externalId: z.string().min(1), connectionId: z.string().optional() })
  .catchall(z.unknown())

const productRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  lineSupplierId: z.string().nullable(),
  defaultYachtId: z.string().nullable(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
  mapImageUrl: z.string().nullable(),
  regions: z.array(z.string()).nullable(),
  themes: z.array(z.string()).nullable(),
  status: charterStatusSchema,
  defaultBookingModes: z.array(charterBookingModeSchema).nullable(),
  defaultMybaTemplateId: z.string().nullable(),
  defaultApaPercent: z.string().nullable(),
  lowestPriceCachedAmount: z.string().nullable(),
  lowestPriceCachedCurrency: z.string().nullable(),
  earliestVoyageCached: z.string().nullable(),
  latestVoyageCached: z.string().nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
const voyageRowSchema = z.object({
  id: z.string(),
  productId: z.string(),
  yachtId: z.string(),
  voyageCode: z.string(),
  name: z.string().nullable(),
  embarkPortFacilityId: z.string().nullable(),
  embarkPortName: z.string().nullable(),
  disembarkPortFacilityId: z.string().nullable(),
  disembarkPortName: z.string().nullable(),
  departureDate: z.string(),
  returnDate: z.string(),
  nights: z.number().int(),
  bookingModes: z.array(charterBookingModeSchema),
  appointmentOnly: z.boolean(),
  wholeYachtPricesByCurrency: z.record(z.string(), z.string()),
  apaPercentOverride: z.string().nullable(),
  mybaTemplateIdOverride: z.string().nullable(),
  charterAreaOverride: z.string().nullable(),
  salesStatus: voyageSalesStatusSchema,
  availabilityNote: z.string().nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  lastSyncedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
const yachtRowSchema = z.object({
  id: z.string(),
  lineSupplierId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  yachtClass: yachtClassSchema,
  capacityGuests: z.number().int().nullable(),
  capacityCrew: z.number().int().nullable(),
  lengthMeters: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  yearRefurbished: z.number().int().nullable(),
  imo: z.string().nullable(),
  description: z.string().nullable(),
  gallery: z.array(z.string()).nullable(),
  amenities: z.record(z.string(), z.unknown()).nullable(),
  crewBios: z
    .array(
      z.object({
        role: z.string(),
        name: z.string(),
        bio: z.string().optional(),
        photoUrl: z.string().optional(),
      }),
    )
    .nullable(),
  defaultCharterAreas: z.array(z.string()).nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const charterSummarySchema = z.object({
  source: charterSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  name: z.string(),
  slug: z.string(),
  lineName: z.string().nullable(),
  yachtName: z.string().nullable(),
  regions: z.array(z.string()),
  themes: z.array(z.string()),
  earliestVoyage: z.string().nullable(),
  latestVoyage: z.string().nullable(),
  lowestPriceAmount: z.string().nullable(),
  lowestPriceCurrency: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
})
const charterVoyageSchema = z.object({
  source: charterSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  productKey: z.string().nullable(),
  yachtKey: z.string(),
  voyageCode: z.string(),
  name: z.string().nullable(),
  departureDate: z.string(),
  returnDate: z.string(),
  nights: z.number().int(),
  bookingModes: z.array(charterBookingModeSchema),
  appointmentOnly: z.boolean(),
  salesStatus: voyageSalesStatusSchema,
  embarkPortName: z.string().nullable(),
  disembarkPortName: z.string().nullable(),
  wholeYachtPricesByCurrency: z.record(z.string(), z.string()),
  apaPercentOverride: z.string().nullable(),
})
const charterYachtSchema = z.object({
  source: charterSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  name: z.string(),
  slug: z.string(),
  yachtClass: yachtClassSchema,
  capacityGuests: z.number().int().nullable(),
  capacityCrew: z.number().int().nullable(),
  description: z.string().nullable(),
  gallery: z.array(z.string()),
  amenities: z.record(z.string(), z.unknown()),
  defaultCharterAreas: z.array(z.string()),
})
const productDetailSchema = z.object({
  summary: charterSummarySchema,
  status: charterStatusSchema,
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  bookingModes: z.array(charterBookingModeSchema),
  defaultApaPercent: z.string().nullable(),
  voyages: z.array(charterVoyageSchema),
  yacht: charterYachtSchema.nullable(),
})
const perSuiteQuoteSchema = z.object({
  mode: z.literal("per_suite"),
  voyageId: z.string(),
  suiteId: z.string(),
  suiteName: z.string(),
  currency: currencyCodeSchema,
  suitePrice: z.string(),
  portFee: z.string().nullable(),
  total: z.string(),
})
const wholeYachtQuoteSchema = z.object({
  mode: z.literal("whole_yacht"),
  voyageId: z.string(),
  currency: currencyCodeSchema,
  charterFee: z.string(),
  apaPercent: z.string(),
  apaAmount: z.string(),
  total: z.string(),
})

const keyInputSchema = z.object({ key: z.string().min(1) })
const perSuiteQuoteInputSchema = keyInputSchema.extend({
  suiteId: z.string().min(1),
  currency: currencyCodeSchema,
})
const wholeYachtQuoteInputSchema = keyInputSchema.extend({ currency: currencyCodeSchema })
export type ChartersToolOperation =
  | "browseCharters"
  | "getProduct"
  | "getVoyage"
  | "getYacht"
  | "quotePerSuite"
  | "quoteWholeYacht"
  | "createProduct"
  | "updateProduct"
  | "upsertVoyage"
  | "updateVoyage"
  | "createYacht"
  | "updateYacht"
export interface ChartersToolServices {
  execute(
    operation: ChartersToolOperation,
    input: unknown,
    admitted?: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}
export type ChartersToolContext = ToolContext & { charters?: ChartersToolServices }
const service = (ctx: ChartersToolContext) => requireService(ctx.charters, "charters")
const parse = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> =>
  schema.parse(toJsonValue(value))

const read = {
  owner: OWNER,
  capabilityVersion: "v1",
  requiredScopes: READ_SCOPES,
  audience: PUBLIC_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
const write = {
  owner: OWNER,
  capabilityVersion: "v1",
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write" as const,
  riskPolicy: WRITE_RISK,
}

export const browseChartersTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.browse-charters`,
  name: "browse_charters",
  description: "Browse local live charters and selected external charter providers.",
  inputSchema: productListQuerySchema.omit({ status: true, lineSupplierId: true }),
  outputSchema: listResponseSchema(charterSummarySchema),
  async handler(input, ctx: ChartersToolContext) {
    return parse(
      listResponseSchema(charterSummarySchema),
      await service(ctx).execute("browseCharters", input),
    )
  },
})
export const getCharterProductTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-charter-product`,
  name: "get_charter_product",
  description: "Get a normalized local or external charter product with voyages and yacht.",
  inputSchema: keyInputSchema,
  outputSchema: productDetailSchema.nullable(),
  async handler(input, ctx: ChartersToolContext) {
    return parse(productDetailSchema.nullable(), await service(ctx).execute("getProduct", input))
  },
})
export const getCharterVoyageTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-charter-voyage`,
  name: "get_charter_voyage",
  description: "Get a normalized local or external charter voyage.",
  inputSchema: keyInputSchema,
  outputSchema: charterVoyageSchema.nullable(),
  async handler(input, ctx: ChartersToolContext) {
    return parse(charterVoyageSchema.nullable(), await service(ctx).execute("getVoyage", input))
  },
})
export const getCharterYachtTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-charter-yacht`,
  name: "get_charter_yacht",
  description: "Get a normalized local or external charter yacht.",
  inputSchema: keyInputSchema,
  outputSchema: charterYachtSchema.nullable(),
  async handler(input, ctx: ChartersToolContext) {
    return parse(charterYachtSchema.nullable(), await service(ctx).execute("getYacht", input))
  },
})
export const quoteCharterPerSuiteTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.quote-charter-per-suite`,
  name: "quote_charter_per_suite",
  description: "Compose a per-suite charter quote from local or selected provider pricing.",
  inputSchema: perSuiteQuoteInputSchema,
  outputSchema: perSuiteQuoteSchema,
  async handler(input, ctx: ChartersToolContext) {
    return parse(perSuiteQuoteSchema, await service(ctx).execute("quotePerSuite", input))
  },
})
export const quoteCharterWholeYachtTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.quote-charter-whole-yacht`,
  name: "quote_charter_whole_yacht",
  description: "Compose a whole-yacht charter quote including APA.",
  inputSchema: wholeYachtQuoteInputSchema,
  outputSchema: wholeYachtQuoteSchema,
  async handler(input, ctx: ChartersToolContext) {
    return parse(wholeYachtQuoteSchema, await service(ctx).execute("quoteWholeYacht", input))
  },
})

const idInput = z.object({ id: z.string().min(1) })
const createdCommandInput = {
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Stable key used to replay this exact create command."),
}
const createProductToolInputSchema = insertProductSchema.extend(createdCommandInput)
const createYachtToolInputSchema = insertYachtSchema.extend(createdCommandInput)
const createdProductOutputSchema = z.object({
  status: z.literal("created"),
  product: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
const createdYachtOutputSchema = z.object({
  status: z.literal("created"),
  yacht: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
export const createCharterProductTool = defineTool({
  ...write,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-charter-product`,
  name: "create_charter_product",
  description:
    "Create a locally managed charter product. Exact retries return the original immutable reference.",
  inputSchema: createProductToolInputSchema,
  outputSchema: createdProductOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: ChartersToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      chartersHandlerActionPolicyExpectation(CHARTERS_CREATED_TARGET_POLICIES.product),
    )
    return parse(
      createdProductOutputSchema,
      await service(ctx).execute("createProduct", input, admitted),
    )
  },
})
export const updateCharterProductTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-charter-product`,
  name: "update_charter_product",
  description: "Update a locally managed charter product without archiving it.",
  inputSchema: idInput.and(updateProductSchema),
  outputSchema: productRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: ChartersToolContext) {
    return parse(productRowSchema.nullable(), await service(ctx).execute("updateProduct", input))
  },
})
export const upsertCharterVoyageTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.upsert-charter-voyage`,
  name: "upsert_charter_voyage",
  description: "Create or update a locally managed charter voyage by its natural key.",
  inputSchema: insertVoyageSchema,
  outputSchema: voyageRowSchema,
  annotations: { idempotentHint: true },
  async handler(input, ctx: ChartersToolContext) {
    return parse(voyageRowSchema, await service(ctx).execute("upsertVoyage", input))
  },
})
export const updateCharterVoyageTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-charter-voyage`,
  name: "update_charter_voyage",
  description: "Update a locally managed charter voyage.",
  inputSchema: idInput.and(updateVoyageSchema),
  outputSchema: voyageRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: ChartersToolContext) {
    return parse(voyageRowSchema.nullable(), await service(ctx).execute("updateVoyage", input))
  },
})
export const createCharterYachtTool = defineTool({
  ...write,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-charter-yacht`,
  name: "create_charter_yacht",
  description:
    "Create a locally managed charter yacht. Exact retries return the original immutable reference.",
  inputSchema: createYachtToolInputSchema,
  outputSchema: createdYachtOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: ChartersToolContext) {
    const admitted = admitHandlerActionPolicy(
      ctx,
      chartersHandlerActionPolicyExpectation(CHARTERS_CREATED_TARGET_POLICIES.yacht),
    )
    return parse(
      createdYachtOutputSchema,
      await service(ctx).execute("createYacht", input, admitted),
    )
  },
})
export const updateCharterYachtTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-charter-yacht`,
  name: "update_charter_yacht",
  description: "Update a locally managed charter yacht.",
  inputSchema: idInput.and(updateYachtSchema),
  outputSchema: yachtRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: ChartersToolContext) {
    return parse(yachtRowSchema.nullable(), await service(ctx).execute("updateYacht", input))
  },
})
export const chartersTools = [
  browseChartersTool,
  getCharterProductTool,
  getCharterVoyageTool,
  getCharterYachtTool,
  quoteCharterPerSuiteTool,
  quoteCharterWholeYachtTool,
  createCharterProductTool,
  updateCharterProductTool,
  upsertCharterVoyageTool,
  updateCharterVoyageTool,
  createCharterYachtTool,
  updateCharterYachtTool,
] as const

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)])
      .filter(([, nested]) => nested !== undefined),
  )
}
