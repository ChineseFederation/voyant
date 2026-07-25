/** Provider-neutral cruise Tools over the search index, local owner, and selected adapters. */

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
  CRUISE_HANDLER_ACTION_POLICY,
  CRUISE_SHIP_HANDLER_ACTION_POLICY,
} from "./created-target-policy.js"
import { quotePayloadSchema } from "./routes-booking-payloads.js"
import {
  cruiseRowSchema,
  cruiseSailingRowSchema,
  cruiseSearchIndexRowSchema,
  cruiseShipRowSchema,
} from "./routes-openapi-schemas.js"
import { insertShipSchema, updateShipSchema } from "./validation-cabins.js"
import {
  insertCruiseSchema,
  insertSailingSchema,
  updateCruiseSchema,
  updateSailingSchema,
} from "./validation-core.js"
import { searchIndexQuerySchema } from "./validation-search.js"
import {
  cruiseSourceSchema,
  cruiseStatusSchema,
  cruiseTypeSchema,
  currencyCodeSchema,
  priceFareVariantSchema,
  sailingSalesStatusSchema,
  shipTypeSchema,
} from "./validation-shared.js"

const OWNER = "@voyant-travel/cruises"
const READ_SCOPES = ["cruises:read"] as const
const WRITE_SCOPES = ["cruises:write"] as const
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
const sourceRefSchema = z
  .object({ externalId: z.string().min(1), connectionId: z.string().optional() })
  .catchall(z.unknown())

const cruiseSummarySchema = z.object({
  source: cruiseSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  name: z.string(),
  slug: z.string(),
  cruiseType: cruiseTypeSchema,
  lineName: z.string(),
  shipName: z.string().nullable(),
  nights: z.number().int(),
  embarkPortName: z.string().nullable(),
  disembarkPortName: z.string().nullable(),
  regions: z.array(z.string()),
  themes: z.array(z.string()),
  earliestDeparture: z.string().nullable(),
  latestDeparture: z.string().nullable(),
  lowestPriceCents: z.number().int().nullable(),
  lowestPriceCurrency: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
})
const sailingSummarySchema = z.object({
  source: cruiseSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  cruiseKey: z.string(),
  shipKey: z.string(),
  departureDate: z.string(),
  returnDate: z.string(),
  embarkPortName: z.string().nullable(),
  disembarkPortName: z.string().nullable(),
  direction: z.enum(["upstream", "downstream", "round_trip", "one_way"]).nullable(),
  isCharter: z.boolean(),
  salesStatus: sailingSalesStatusSchema,
  lowestPriceCents: z.number().int().nullable(),
  currency: z.string().nullable(),
})
const shipSummarySchema = z.object({
  source: cruiseSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: sourceRefSchema.nullable(),
  key: z.string(),
  name: z.string(),
  slug: z.string(),
  shipType: shipTypeSchema,
  capacityGuests: z.number().int().nullable(),
  capacityCrew: z.number().int().nullable(),
  cabinCount: z.number().int().nullable(),
  deckCount: z.number().int().nullable(),
  description: z.string().nullable(),
  gallery: z.array(z.string()),
  amenities: z.record(z.string(), z.unknown()),
})
const cruiseDetailSchema = z.object({
  summary: cruiseSummarySchema,
  status: cruiseStatusSchema,
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  highlights: z.array(z.string()),
  sailings: z.array(sailingSummarySchema),
})
const quoteComponentSchema = z.object({
  kind: z.string(),
  label: z.string().nullable(),
  amount: z.string(),
  currency: currencyCodeSchema,
  direction: z.enum(["addition", "inclusion", "credit"]),
  perPerson: z.boolean(),
})
const quoteSchema = z.object({
  fareCode: z.string().nullable(),
  fareCodeName: z.string().nullable(),
  fareVariant: priceFareVariantSchema,
  currency: currencyCodeSchema,
  occupancy: z.number().int(),
  guestCount: z.number().int(),
  basePerPerson: z.string(),
  originalPricePerPerson: z.string().nullable(),
  singlePricePerPerson: z.string().nullable(),
  earlyBookingDeadline: z.string().nullable(),
  earlyBookingBonusDescription: z.string().nullable(),
  components: z.array(quoteComponentSchema),
  totalPerPerson: z.string(),
  totalForCabin: z.string(),
  bookingTerms: z.record(z.string(), z.unknown()).nullable().optional(),
})
const keyInputSchema = z.object({ key: z.string().min(1) })
const slugInputSchema = z.object({ slug: z.string().min(1) })
const quoteInputSchema = z.object({ key: z.string().min(1) }).and(quotePayloadSchema)
const idInput = z.object({ id: z.string().min(1) })
const createCruiseToolInputSchema = insertCruiseSchema.extend({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Stable key used to replay this exact create command."),
})
const createdCruiseOutputSchema = z.object({
  status: z.literal("created"),
  cruise: z.object({ id: z.string() }),
  replayed: z.boolean(),
})
const createShipToolInputSchema = insertShipSchema.extend({
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Stable key used to replay this exact create command."),
})
const createdShipOutputSchema = z.object({
  status: z.literal("created"),
  ship: z.object({ id: z.string() }),
  replayed: z.boolean(),
})

export type CruisesToolOperation =
  | "searchCruises"
  | "getCruise"
  | "getSailing"
  | "getShip"
  | "quoteSailing"
  | "createCruise"
  | "updateCruise"
  | "upsertSailing"
  | "updateSailing"
  | "createShip"
  | "updateShip"
export interface CruisesToolServices {
  execute(
    operation: CruisesToolOperation,
    input: unknown,
    admitted?: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}
export type CruisesToolContext = ToolContext & { cruises?: CruisesToolServices }
const service = (ctx: CruisesToolContext) => requireService(ctx.cruises, "cruises")
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

export const searchCruisesTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.search-cruises`,
  name: "search_cruises",
  description: "Search the selected local and external cruise projection with bounded facets.",
  inputSchema: searchIndexQuerySchema,
  outputSchema: listResponseSchema(cruiseSearchIndexRowSchema),
  async handler(input, ctx: CruisesToolContext) {
    return parse(
      listResponseSchema(cruiseSearchIndexRowSchema),
      await service(ctx).execute("searchCruises", input),
    )
  },
})
export const getCruiseTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-cruise`,
  name: "get_cruise",
  description:
    "Get a normalized local or selected-provider cruise and its sailings by public slug.",
  inputSchema: slugInputSchema,
  outputSchema: cruiseDetailSchema.nullable(),
  async handler(input, ctx: CruisesToolContext) {
    return parse(cruiseDetailSchema.nullable(), await service(ctx).execute("getCruise", input))
  },
})
export const getCruiseSailingTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-cruise-sailing`,
  name: "get_cruise_sailing",
  description: "Get a normalized local or external cruise sailing.",
  inputSchema: keyInputSchema,
  outputSchema: sailingSummarySchema.nullable(),
  async handler(input, ctx: CruisesToolContext) {
    return parse(sailingSummarySchema.nullable(), await service(ctx).execute("getSailing", input))
  },
})
export const getCruiseShipTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.get-cruise-ship`,
  name: "get_cruise_ship",
  description: "Get a normalized local or external cruise ship.",
  inputSchema: keyInputSchema,
  outputSchema: shipSummarySchema.nullable(),
  async handler(input, ctx: CruisesToolContext) {
    return parse(shipSummarySchema.nullable(), await service(ctx).execute("getShip", input))
  },
})
export const quoteCruiseSailingTool = defineTool({
  ...read,
  capabilityId: `${OWNER}#tool.quote-cruise-sailing`,
  name: "quote_cruise_sailing",
  description: "Compose a cruise cabin quote from local or selected-provider pricing.",
  inputSchema: quoteInputSchema,
  outputSchema: quoteSchema,
  async handler(input, ctx: CruisesToolContext) {
    return parse(quoteSchema, await service(ctx).execute("quoteSailing", input))
  },
})
export const createCruiseTool = defineTool({
  ...write,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-cruise`,
  name: "create_cruise",
  description:
    "Create a locally managed cruise product. Exact retries return the original immutable reference.",
  inputSchema: createCruiseToolInputSchema,
  outputSchema: createdCruiseOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CruisesToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CRUISE_HANDLER_ACTION_POLICY)
    return parse(
      createdCruiseOutputSchema,
      await service(ctx).execute("createCruise", input, admitted),
    )
  },
})
export const updateCruiseTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-cruise`,
  name: "update_cruise",
  description: "Update a locally managed cruise without archiving it.",
  inputSchema: idInput.and(updateCruiseSchema),
  outputSchema: cruiseRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: CruisesToolContext) {
    return parse(cruiseRowSchema.nullable(), await service(ctx).execute("updateCruise", input))
  },
})
export const upsertCruiseSailingTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.upsert-cruise-sailing`,
  name: "upsert_cruise_sailing",
  description: "Create or update a local cruise sailing by natural key.",
  inputSchema: insertSailingSchema,
  outputSchema: cruiseSailingRowSchema,
  annotations: { idempotentHint: true },
  async handler(input, ctx: CruisesToolContext) {
    return parse(cruiseSailingRowSchema, await service(ctx).execute("upsertSailing", input))
  },
})
export const updateCruiseSailingTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-cruise-sailing`,
  name: "update_cruise_sailing",
  description: "Update a locally managed cruise sailing.",
  inputSchema: idInput.and(updateSailingSchema),
  outputSchema: cruiseSailingRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: CruisesToolContext) {
    return parse(
      cruiseSailingRowSchema.nullable(),
      await service(ctx).execute("updateSailing", input),
    )
  },
})
export const createCruiseShipTool = defineTool({
  ...write,
  riskPolicy: CREATED_WRITE_RISK,
  capabilityId: `${OWNER}#tool.create-cruise-ship`,
  name: "create_cruise_ship",
  description:
    "Create a locally managed cruise ship. Exact retries return the original immutable reference.",
  inputSchema: createShipToolInputSchema,
  outputSchema: createdShipOutputSchema,
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: CruisesToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CRUISE_SHIP_HANDLER_ACTION_POLICY)
    return parse(createdShipOutputSchema, await service(ctx).execute("createShip", input, admitted))
  },
})
export const updateCruiseShipTool = defineTool({
  ...write,
  capabilityId: `${OWNER}#tool.update-cruise-ship`,
  name: "update_cruise_ship",
  description: "Update a locally managed cruise ship.",
  inputSchema: idInput.and(updateShipSchema),
  outputSchema: cruiseShipRowSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: CruisesToolContext) {
    return parse(cruiseShipRowSchema.nullable(), await service(ctx).execute("updateShip", input))
  },
})
export const cruisesTools = [
  searchCruisesTool,
  getCruiseTool,
  getCruiseSailingTool,
  getCruiseShipTool,
  quoteCruiseSailingTool,
  createCruiseTool,
  updateCruiseTool,
  upsertCruiseSailingTool,
  updateCruiseSailingTool,
  createCruiseShipTool,
  updateCruiseShipTool,
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
