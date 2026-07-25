/** Provider-neutral accommodation discovery, content, quote, and room-block tools. */

import { accommodationContentSchema } from "@voyant-travel/accommodations-contracts/content-shape"
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"

import {
  roomBlockPickupRowSchema,
  roomBlockSchema,
  roomBlockSummarySchema,
} from "./routes-room-blocks.js"
import {
  createRoomBlockSchema,
  reverseRoomBlockPickupSchema,
  roomBlockPickupSchema,
  setRoomBlockNightsSchema,
} from "./validation-room-blocks.js"

const OWNER = "@voyant-travel/accommodations"
const VERSION = "v1"
const READ_SCOPES = ["accommodations:read"] as const
const WRITE_SCOPES = ["accommodations:write"] as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const DISCOVERY_AUDIENCE = { source: "grant", allowed: ["staff", "customer"] } as const
const WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  sideEffects: ["data-write"],
} as const
const HIGH_RISK_WRITE = { ...WRITE_RISK, confirmationRequired: true } as const
const isoDateSchema = z.string().date()

const occupancySchema = z.object({
  adults: z.number().int().min(1),
  children: z.number().int().min(0).optional(),
  childrenAges: z.array(z.number().int().min(0).max(17)).optional(),
  infants: z.number().int().min(0).optional(),
})

export const searchOwnedAccommodationsInputSchema = z.object({
  destination: z
    .object({
      countryCode: z.string().optional(),
      region: z.string().optional(),
      city: z.string().optional(),
    })
    .optional(),
  near: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusKm: z.number().positive(),
    })
    .optional(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  rooms: z.array(occupancySchema).min(1),
  minStars: z.number().min(0).max(5).optional(),
  amenities: z.array(z.string().min(1)).optional(),
  refundableOnly: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
})

const accommodationSearchMatchSchema = z.object({
  accommodationId: z.string(),
  roomTypeId: z.string(),
  ratePlanId: z.string(),
  occupancy: occupancySchema,
  price: z.object({ amount: z.string(), currency: z.string() }),
  candidateRef: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
})
const accommodationSearchOutputSchema = z.object({
  matches: z.array(accommodationSearchMatchSchema),
  nextCursor: z.string().optional(),
})

export const quoteOwnedStayInputSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().min(1),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  roomCount: z.number().int().min(1).default(1),
  occupancy: occupancySchema.partial().optional(),
  occupancies: z.array(occupancySchema.partial()).optional(),
  currency: z.string().length(3).optional(),
})

const nightlyRateSchema = z.object({
  date: isoDateSchema,
  sellCurrency: z.string(),
  sellAmountCents: z.number().int(),
  taxAmountCents: z.number().int().nullable().optional(),
  feeAmountCents: z.number().int().nullable().optional(),
  occupancyBasis: z.string(),
  includedAdults: z.number().int(),
  includedChildren: z.number().int(),
  includedInfants: z.number().int(),
  quantity: z.number().int(),
  totalAmountCents: z.number().int(),
})
const availabilityNightSchema = z.object({
  date: isoDateSchema,
  capacity: z.number().int(),
  booked: z.number().int(),
  remaining: z.number().int(),
  closed: z.boolean(),
})
const ownedStayQuoteOutputSchema = z.union([
  z.object({
    status: z.literal("ok"),
    available: z.boolean(),
    propertyId: z.string(),
    roomTypeId: z.string(),
    ratePlanId: z.string(),
    mealPlanId: z.string().nullable().optional(),
    roomCount: z.number().int(),
    nights: z.number().int(),
    currency: z.string(),
    nightlyRates: z.array(nightlyRateSchema),
    totalAmountCents: z.number().int(),
    availability: z.object({
      requestedRooms: z.number().int(),
      minimumRemainingRooms: z.number().int(),
      nights: z.array(availabilityNightSchema),
    }),
  }),
  z.object({ status: z.literal("invalid_range"), reason: z.string() }),
  z.object({ status: z.literal("room_not_found") }),
  z.object({ status: z.literal("rate_plan_not_found") }),
  z.object({ status: z.literal("room_occupancy_exceeded") }),
  z.object({ status: z.literal("rates_missing"), missingDates: z.array(isoDateSchema) }),
  z.object({ status: z.literal("inventory_missing"), missingDates: z.array(isoDateSchema) }),
  z.object({
    status: z.literal("currency_mismatch"),
    expected: z.string(),
    actual: z.string(),
  }),
])

export const getAccommodationContentInputSchema = z.object({
  id: z.string().min(1),
  preferredLocales: z.array(z.string().min(1)).min(1).optional(),
  market: z.string().optional(),
  currency: z.string().length(3).optional(),
  acceptMachineTranslated: z.boolean().default(true),
})
const accommodationContentOutputSchema = z
  .object({
    content: accommodationContentSchema,
    provenance: z.object({
      source_kind: z.string(),
      source_provider: z.string().optional(),
      source_connection_id: z.string().optional(),
      source_ref: z.string().optional(),
    }),
    servedLocale: z.string(),
    matchKind: z.string(),
    source: z.enum(["sourced-cache", "sourced-fresh", "synthesized", "owned"]),
    servedStale: z.boolean(),
    synthesized: z.boolean(),
    machineTranslated: z.boolean(),
  })
  .nullable()

const roomBlockIdSchema = z.object({ blockId: z.string().min(1) })
const getRoomBlockOutputSchema = z
  .object({ block: roomBlockSchema, summary: roomBlockSummarySchema.nullable() })
  .nullable()
const setRoomBlockNightsInputSchema = roomBlockIdSchema.and(setRoomBlockNightsSchema)
const pickupRoomBlockInputSchema = roomBlockIdSchema.and(roomBlockPickupSchema)
const reversePickupInputSchema = roomBlockIdSchema.and(reverseRoomBlockPickupSchema)
const pickupOutcomeSchema = z.union([
  z.object({
    status: z.literal("ok"),
    pickup: roomBlockPickupRowSchema,
    idempotent: z.boolean(),
  }),
  z.object({ status: z.literal("invalid_range") }),
  z.object({ status: z.literal("block_not_found") }),
  z.object({ status: z.literal("block_not_active") }),
  z.object({
    status: z.literal("night_unavailable"),
    date: isoDateSchema,
    remaining: z.number().int(),
    needed: z.number().int(),
  }),
])
const reversalOutcomeSchema = z.union([
  z.object({ status: z.literal("ok"), pickup: roomBlockPickupRowSchema }),
  z.object({ status: z.literal("pickup_not_found") }),
])

type SearchInput = z.infer<typeof searchOwnedAccommodationsInputSchema>
type QuoteInput = z.infer<typeof quoteOwnedStayInputSchema>
type ContentInput = z.infer<typeof getAccommodationContentInputSchema>
type SetNightsInput = z.infer<typeof setRoomBlockNightsInputSchema>
type PickupInput = z.infer<typeof pickupRoomBlockInputSchema>
type ReversalInput = z.infer<typeof reversePickupInputSchema>
export const createRoomBlockToolInputSchema = createRoomBlockSchema.extend({
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
})
const createRoomBlockResultSchema = z.object({ roomBlockId: z.string() })

/** Provider-neutral package services injected for the selected deployment. */
export interface AccommodationsToolServices {
  searchOwned(input: SearchInput): Promise<unknown>
  quoteOwned(input: QuoteInput): Promise<unknown>
  getContent(input: ContentInput): Promise<unknown>
  getRoomBlock(blockId: string): Promise<unknown>
  createRoomBlock(
    input: z.infer<typeof createRoomBlockToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
  setRoomBlockNights(input: SetNightsInput): Promise<unknown>
  pickupRoomBlock(input: PickupInput): Promise<unknown>
  reverseRoomBlockPickup(input: ReversalInput): Promise<unknown>
}

export type AccommodationsToolContext = ToolContext & {
  accommodations?: AccommodationsToolServices
}

function accommodations(ctx: AccommodationsToolContext): AccommodationsToolServices {
  return requireService(ctx.accommodations, "accommodations")
}

const discoveryReadMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: READ_SCOPES,
  audience: DISCOVERY_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
}
const staffReadMetadata = { ...discoveryReadMetadata, audience: STAFF_AUDIENCE }
const writeMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write" as const,
  riskPolicy: WRITE_RISK,
}
const highRiskWriteMetadata = { ...writeMetadata, riskPolicy: HIGH_RISK_WRITE }
export const CREATE_ROOM_BLOCK_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.create-room-block`,
  capabilityVersion: VERSION,
  canonicalName: "create_room_block",
  actionPolicy: {
    id: `${OWNER}#action.create-room-block`,
    capabilityId: `${OWNER}#action.create-room-block`,
    version: VERSION,
    kind: "execute",
    targetType: "room-block",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "room-block-create-command",
      resultReferenceType: "room-block",
      durability: "handler-command-claim-v1",
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

export const searchOwnedAccommodationsTool = defineTool<
  SearchInput,
  z.infer<typeof accommodationSearchOutputSchema>,
  AccommodationsToolContext
>({
  ...discoveryReadMetadata,
  capabilityId: `${OWNER}#tool.search-owned-accommodations`,
  name: "search_owned_accommodations",
  description:
    "Search first-party accommodation inventory by destination or proximity, dates, room occupancies, amenities, stars, and refundability.",
  inputSchema: searchOwnedAccommodationsInputSchema,
  outputSchema: accommodationSearchOutputSchema,
  async handler(input, ctx) {
    return parseJsonResult(
      accommodationSearchOutputSchema,
      await accommodations(ctx).searchOwned(input),
    )
  },
})

export const quoteOwnedAccommodationStayTool = defineTool<
  QuoteInput,
  z.infer<typeof ownedStayQuoteOutputSchema>,
  AccommodationsToolContext
>({
  ...discoveryReadMetadata,
  capabilityId: `${OWNER}#tool.quote-owned-accommodation-stay`,
  name: "quote_owned_accommodation_stay",
  description:
    "Check first-party room/rate availability and return a public sell-price quote for a stay without reserving it.",
  inputSchema: quoteOwnedStayInputSchema,
  outputSchema: ownedStayQuoteOutputSchema,
  async handler(input, ctx) {
    return parseJsonResult(ownedStayQuoteOutputSchema, await accommodations(ctx).quoteOwned(input))
  },
})

export const getAccommodationContentTool = defineTool<
  ContentInput,
  z.infer<typeof accommodationContentOutputSchema>,
  AccommodationsToolContext
>({
  ...discoveryReadMetadata,
  owner: `${OWNER}#content-extension`,
  capabilityId: `${OWNER}#tool.get-accommodation-content`,
  name: "get_accommodation_content",
  description:
    "Resolve localized provider-neutral accommodation content from owned inventory, sourced cache, or the selected adapter. Returns null when absent.",
  inputSchema: getAccommodationContentInputSchema,
  outputSchema: accommodationContentOutputSchema,
  async handler(input, ctx) {
    return parseJsonResult(
      accommodationContentOutputSchema,
      await accommodations(ctx).getContent(input),
    )
  },
})

export const getRoomBlockTool = defineTool<
  z.infer<typeof roomBlockIdSchema>,
  z.infer<typeof getRoomBlockOutputSchema>,
  AccommodationsToolContext
>({
  ...staffReadMetadata,
  capabilityId: `${OWNER}#tool.get-room-block`,
  name: "get_room_block",
  description: "Read a room-block header and its derived held/picked/released summary.",
  inputSchema: roomBlockIdSchema,
  outputSchema: getRoomBlockOutputSchema,
  async handler({ blockId }, ctx) {
    return parseJsonResult(
      getRoomBlockOutputSchema,
      await accommodations(ctx).getRoomBlock(blockId),
    )
  },
})

export const createRoomBlockTool = defineTool<
  z.infer<typeof createRoomBlockToolInputSchema>,
  z.infer<typeof createRoomBlockResultSchema>,
  AccommodationsToolContext
>({
  ...writeMetadata,
  capabilityId: `${OWNER}#tool.create-room-block`,
  name: "create_room_block",
  description:
    "Create a supplier room-block header in inquiry status. Set held inventory separately per night.",
  inputSchema: createRoomBlockToolInputSchema,
  outputSchema: createRoomBlockResultSchema,
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_ROOM_BLOCK_HANDLER_POLICY)
    return createRoomBlockResultSchema.parse(
      await accommodations(ctx).createRoomBlock(input, admitted),
    )
  },
})

export const setRoomBlockNightsTool = defineTool<
  SetNightsInput,
  z.infer<typeof roomBlockSummarySchema> | null,
  AccommodationsToolContext
>({
  ...writeMetadata,
  capabilityId: `${OWNER}#tool.set-room-block-nights`,
  name: "set_room_block_nights",
  description:
    "Upsert held-room counts and optional rate overrides per night, returning the recomputed summary.",
  inputSchema: setRoomBlockNightsInputSchema,
  outputSchema: roomBlockSummarySchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(
      roomBlockSummarySchema.nullable(),
      await accommodations(ctx).setRoomBlockNights(input),
    )
  },
})

export const pickupRoomBlockTool = defineTool<
  PickupInput,
  z.infer<typeof pickupOutcomeSchema>,
  AccommodationsToolContext
>({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}#tool.pickup-room-block`,
  name: "pickup_room_block",
  description:
    "Record a booking pickup against held rooms. Capacity changes atomically; stayBookingItemId makes retries idempotent. Requires confirmation.",
  inputSchema: pickupRoomBlockInputSchema,
  outputSchema: pickupOutcomeSchema,
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(pickupOutcomeSchema, await accommodations(ctx).pickupRoomBlock(input))
  },
})

export const reverseRoomBlockPickupTool = defineTool<
  ReversalInput,
  z.infer<typeof reversalOutcomeSchema>,
  AccommodationsToolContext
>({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}#tool.reverse-room-block-pickup`,
  name: "reverse_room_block_pickup",
  description:
    "Compensate an active room-block pickup and return its rooms to remaining inventory. Requires confirmation.",
  inputSchema: reversePickupInputSchema,
  outputSchema: reversalOutcomeSchema,
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return parseJsonResult(
      reversalOutcomeSchema,
      await accommodations(ctx).reverseRoomBlockPickup(input),
    )
  },
})

export const accommodationsTools = [
  searchOwnedAccommodationsTool,
  quoteOwnedAccommodationStayTool,
  getAccommodationContentTool,
  getRoomBlockTool,
  createRoomBlockTool,
  setRoomBlockNightsTool,
  pickupRoomBlockTool,
  reverseRoomBlockPickupTool,
] as const

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
