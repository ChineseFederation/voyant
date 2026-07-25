/** Module-owned Tools for booking extras and departure-manifest selections. */

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
  bookingExtraCoreSchema,
  bookingExtraListQuerySchema,
  extraCollectionModeSchema,
  extraCollectionStatusSchema,
  extraParticipantSelectionStatusSchema,
  extraPricingModeSchema,
  insertBookingExtraSchema,
  slotExtraCollectionBulkSchema,
  slotExtraManifestQuerySchema,
  slotExtraSelectionBulkSchema,
  slotExtraSelectionPatchSchema,
  updateBookingExtraSchema,
} from "./validation.js"

const OWNER = "@voyant-travel/bookings#extras"
const VERSION = "v1"
const READ_SCOPES = ["bookings:read"] as const
const PII_READ_SCOPES = ["bookings:read", "bookings-pii:read"] as const
const WRITE_SCOPES = ["bookings:write"] as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  sideEffects: ["data-write"],
} as const
const HIGH_RISK_WRITE = { ...WRITE_RISK, confirmationRequired: true } as const
const idArgsSchema = z.object({ id: z.string().min(1) })
const slotIdArgsSchema = z.object({ slotId: z.string().min(1) })
const jsonObjectSchema = z.record(z.string(), z.unknown())
const timestampSchema = z.string().datetime()

const bookingExtraSchema = bookingExtraCoreSchema.extend({
  id: z.string().min(1),
  productExtraId: z.string().nullable(),
  optionExtraConfigId: z.string().nullable(),
  description: z.string().nullable(),
  costCurrency: z.string().nullable(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  unitCostAmountCents: z.number().int().nullable(),
  totalCostAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObjectSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
const updateBookingExtraToolSchema = updateBookingExtraSchema.extend({ id: z.string().min(1) })
export const createBookingExtraInputSchema = insertBookingExtraSchema.extend({
  idempotencyKey: z.string().trim().min(1).max(255).optional(),
})
const createdBookingExtraReferenceSchema = z.object({ id: z.string(), replayed: z.boolean() })

const participantSelectionSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string(),
  productExtraId: z.string(),
  optionExtraConfigId: z.string().nullable(),
  status: extraParticipantSelectionStatusSchema,
  collectionMode: extraCollectionModeSchema,
  collectionStatus: extraCollectionStatusSchema,
  collectionCurrency: z.string().nullable(),
  collectionAmountCents: z.number().int().nullable(),
  collectedAt: timestampSchema.nullable(),
  collectedBy: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObjectSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const manifestSlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string(),
  startsAt: timestampSchema,
  endsAt: timestampSchema.nullable(),
  timezone: z.string(),
  status: z.enum(["open", "closed", "sold_out", "cancelled"]),
  unlimited: z.boolean(),
  initialPax: z.number().int().nullable(),
  remainingPax: z.number().int().nullable(),
  initialPickups: z.number().int().nullable(),
  remainingPickups: z.number().int().nullable(),
  remainingResources: z.number().int().nullable(),
  pastCutoff: z.boolean(),
  tooEarly: z.boolean(),
  nights: z.number().int().nullable(),
  days: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
const manifestExtraSchema = z.object({
  id: z.string(),
  productId: z.string(),
  supplierId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  selectionType: z.enum(["optional", "required", "default_selected", "unavailable"]),
  pricingMode: extraPricingModeSchema,
  pricedPerPerson: z.boolean(),
  collectionMode: extraCollectionModeSchema,
  showOnSlotManifest: z.boolean(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  defaultQuantity: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  metadata: jsonObjectSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})
const manifestTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  participantType: z.string(),
  travelerCategory: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: timestampSchema,
  fullName: z.string(),
})
const manifestSelectionSchema = z.object({
  bookingId: z.string(),
  travelerId: z.string(),
  productExtraId: z.string(),
  optionExtraConfigId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  status: z.string(),
  selected: z.boolean(),
  collectionMode: extraCollectionModeSchema,
  collectionStatus: z.string(),
  collectionCurrency: z.string().nullable(),
  collectionAmountCents: z.number().int().nullable(),
  collectedAt: timestampSchema.nullable(),
  collectedBy: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObjectSchema.nullable(),
  source: z.string(),
})
const slotManifestResultSchema = z.union([
  z.object({ status: z.literal("slot_not_found") }),
  z.object({
    status: z.literal("ok"),
    data: z.object({
      slot: manifestSlotSchema,
      extras: z.array(manifestExtraSchema),
      travelers: z.array(manifestTravelerSchema),
      selections: z.array(manifestSelectionSchema),
    }),
  }),
])
const selectionResultSchema = z.union([
  z.object({ status: z.literal("slot_not_found") }),
  z.object({ status: z.literal("extra_not_found") }),
  z.object({ status: z.literal("traveler_not_found") }),
  z.object({ status: z.literal("ok"), data: participantSelectionSchema.nullable() }),
])
const bulkSelectionResultSchema = z.union([
  z.object({ status: z.literal("slot_not_found") }),
  z.object({ status: z.literal("extra_not_found") }),
  z.object({ status: z.literal("traveler_not_found") }),
  z.object({ status: z.literal("ok"), data: z.array(participantSelectionSchema.nullable()) }),
])

type ExtrasOperation =
  | "listBookingExtras"
  | "getBookingExtra"
  | "createBookingExtra"
  | "updateBookingExtra"
  | "getSlotExtraManifest"
  | "setSlotExtraSelection"
  | "bulkSetSlotExtraSelections"
  | "bulkUpdateSlotExtraCollections"

export interface BookingsExtrasToolServices {
  execute(
    operation: ExtrasOperation,
    input: unknown,
    admitted?: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
}
export type BookingsExtrasToolContext = ToolContext & {
  bookingsExtras?: BookingsExtrasToolServices
}

function service(ctx: BookingsExtrasToolContext) {
  return requireService(ctx.bookingsExtras, "bookingsExtras")
}
function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
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
  tier: "sensitive" as const,
  riskPolicy: WRITE_RISK,
}

export const CREATE_BOOKING_EXTRA_HANDLER_POLICY = {
  capabilityId: `${OWNER}.tool.create-booking-extra`,
  capabilityVersion: VERSION,
  canonicalName: "create_booking_extra",
  actionPolicy: {
    id: `${OWNER}.action.create-booking-extra`,
    capabilityId: `${OWNER}.action.create-booking-extra`,
    version: VERSION,
    kind: "execute",
    targetType: "booking-extra",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "booking-extra-create-command",
      resultReferenceType: "booking_extra",
      durability: "handler-command-claim-v1",
      parentAnchor: { targetType: "booking", targetIdField: "bookingId" },
    },
    risk: "high",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation
const highRiskWriteMetadata = { ...writeMetadata, riskPolicy: HIGH_RISK_WRITE }

export const listBookingExtrasTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}.tool.list-booking-extras`,
  name: "list_booking_extras",
  description: "List booking-level extras with status and source filters.",
  inputSchema: bookingExtraListQuerySchema,
  outputSchema: listResponseSchema(bookingExtraSchema),
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      listResponseSchema(bookingExtraSchema),
      await service(ctx).execute("listBookingExtras", input),
    )
  },
})

export const getBookingExtraTool = defineTool({
  ...readMetadata,
  capabilityId: `${OWNER}.tool.get-booking-extra`,
  name: "get_booking_extra",
  description: "Read one booking extra by id.",
  inputSchema: idArgsSchema,
  outputSchema: bookingExtraSchema.nullable(),
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      bookingExtraSchema.nullable(),
      await service(ctx).execute("getBookingExtra", input),
    )
  },
})

export const createBookingExtraTool = defineTool({
  ...writeMetadata,
  riskPolicy: { ...WRITE_RISK, reversible: false },
  capabilityId: `${OWNER}.tool.create-booking-extra`,
  name: "create_booking_extra",
  description: "Create a booking extra without deleting or replacing historical selections.",
  inputSchema: createBookingExtraInputSchema,
  outputSchema: createdBookingExtraReferenceSchema,
  actionPolicyEnforcement: "handler",
  async handler(input, ctx: BookingsExtrasToolContext) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_BOOKING_EXTRA_HANDLER_POLICY)
    return createdBookingExtraReferenceSchema.parse(
      await service(ctx).execute("createBookingExtra", input, admitted),
    )
  },
})

export const updateBookingExtraTool = defineTool({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}.tool.update-booking-extra`,
  name: "update_booking_extra",
  description: "Update booking-extra lifecycle, sell, or cost state. Requires confirmation.",
  inputSchema: updateBookingExtraToolSchema,
  outputSchema: bookingExtraSchema.nullable(),
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      bookingExtraSchema.nullable(),
      await service(ctx).execute("updateBookingExtra", input),
    )
  },
})

export const getSlotExtraManifestTool = defineTool({
  ...readMetadata,
  requiredScopes: PII_READ_SCOPES,
  tier: "sensitive",
  capabilityId: `${OWNER}.tool.get-slot-extra-manifest`,
  name: "get_slot_extra_manifest",
  description:
    "Read a departure's extras, participating travelers, and current selections. Includes booking PII.",
  inputSchema: slotIdArgsSchema.and(slotExtraManifestQuerySchema),
  outputSchema: slotManifestResultSchema,
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      slotManifestResultSchema,
      await service(ctx).execute("getSlotExtraManifest", input),
    )
  },
})

export const setSlotExtraSelectionTool = defineTool({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}.tool.set-slot-extra-selection`,
  name: "set_slot_extra_selection",
  description:
    "Set one traveler's extra selection and collection state for a departure. Requires confirmation.",
  inputSchema: slotIdArgsSchema.and(slotExtraSelectionPatchSchema),
  outputSchema: selectionResultSchema,
  annotations: { idempotentHint: true },
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      selectionResultSchema,
      await service(ctx).execute("setSlotExtraSelection", input),
    )
  },
})

export const bulkSetSlotExtraSelectionsTool = defineTool({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}.tool.bulk-set-slot-extra-selections`,
  name: "bulk_set_slot_extra_selections",
  description: "Set multiple traveler extra selections for a departure. Requires confirmation.",
  inputSchema: slotIdArgsSchema.and(slotExtraSelectionBulkSchema),
  outputSchema: bulkSelectionResultSchema,
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      bulkSelectionResultSchema,
      await service(ctx).execute("bulkSetSlotExtraSelections", input),
    )
  },
})

export const bulkUpdateSlotExtraCollectionsTool = defineTool({
  ...highRiskWriteMetadata,
  capabilityId: `${OWNER}.tool.bulk-update-slot-extra-collections`,
  name: "bulk_update_slot_extra_collections",
  description: "Update collection state for one extra across travelers. Requires confirmation.",
  inputSchema: slotIdArgsSchema.and(slotExtraCollectionBulkSchema),
  outputSchema: bulkSelectionResultSchema,
  async handler(input, ctx: BookingsExtrasToolContext) {
    return parseJsonResult(
      bulkSelectionResultSchema,
      await service(ctx).execute("bulkUpdateSlotExtraCollections", input),
    )
  },
})

export const bookingsExtrasTools = [
  listBookingExtrasTool,
  getBookingExtraTool,
  createBookingExtraTool,
  updateBookingExtraTool,
  getSlotExtraManifestTool,
  setSlotExtraSelectionTool,
  bulkSetSlotExtraSelectionsTool,
  bulkUpdateSlotExtraCollectionsTool,
] as const

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
