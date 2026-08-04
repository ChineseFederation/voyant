/**
 * Admin routes for booking extras — a separately, independently mounted module
 * (`bookingsExtrasApiModule`). Covers two resource sub-chains: booking-extras
 * CRUD and the slot extra manifest (read + selection/collection mutations).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114).
 * Request schemas reuse the existing `validation.ts` schemas the handlers
 * already parse; the `booking-extras` list uses the framework's canonical
 * `listResponseSchema(...)` envelope; response row schemas are authored from the
 * Drizzle `$inferSelect` shapes (§17: timestamp columns serialize to ISO strings
 * over the wire). The slot manifest GET returns a bespoke composite (slot +
 * extras + travelers-with-fullName + per-traveler/per-extra selections) that has
 * no single base row, so its response schema is authored from the
 * service-manifest shape. The manifest mutations carry typed
 * `slot_not_found`/`extra_not_found`/`traveler_not_found` → 404 unions, declared
 * inline per leg. The business logic + service wiring are unchanged.
 *
 * The routes are split into per-resource child `OpenAPIHono` sub-chains
 * (`.route("/", child)`) rather than one long flat `.openapi()` chain to keep
 * the tsc inference cost linear.
 */

import { OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { createBookingsExtrasRoute } from "./routes-openapi.js"
import { bookingsExtrasService } from "./service.js"
import {
  bookingExtraListQuerySchema,
  bookingExtraStatusSchema,
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

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

// --- shared response building blocks --------------------------------------
// Authored from the Drizzle `$inferSelect` shapes; §17: timestamp columns are
// ISO strings on the wire.

const isoTimestamp = z.string()
const nullableIsoTimestamp = z.string().nullable()
const errorResponseSchema = z.object({ error: z.string() })
const deleteResponseSchema = z.object({ success: z.boolean() })
const idParamSchema = z.object({ id: z.string() })
const slotIdParamSchema = z.object({ slotId: z.string() })
const jsonObject = z.record(z.string(), z.unknown())

// --- row response schemas (from $inferSelect) ------------------------------

const bookingExtraSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  productExtraId: z.string().nullable(),
  optionExtraConfigId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  status: bookingExtraStatusSchema,
  pricingMode: extraPricingModeSchema,
  pricedPerPerson: z.boolean(),
  quantity: z.number().int(),
  sellCurrency: z.string(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  costCurrency: z.string().nullable(),
  unitCostAmountCents: z.number().int().nullable(),
  totalCostAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const extraParticipantSelectionSchema = z.object({
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
  collectedAt: nullableIsoTimestamp,
  collectedBy: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

// --- slot manifest composite (from service-manifest shape) -----------------
// The manifest `data` is a bespoke join of the local `availability_slots`
// mirror, the `product_extras` mirror, the booking travelers (with a derived
// `fullName`), and a per-traveler/per-extra selection projection.

const manifestSlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string(),
  startsAt: isoTimestamp,
  endsAt: nullableIsoTimestamp,
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
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
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
  metadata: jsonObject.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
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
  createdAt: isoTimestamp,
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
  collectedAt: nullableIsoTimestamp,
  collectedBy: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonObject.nullable(),
  // The service derives `source` via a string-literal ternary, which TS widens
  // to `string`; keep the wire schema permissive so the handler's inferred
  // composite stays assignable to the declared response.
  source: z.string(),
  quantity: z.number().int(),
})

// Departure-level rollup per Extra — what the guide has to carry, who it
// belongs to, what is still uncollected, and whether fulfillment is done.
const manifestSummarySchema = z.object({
  productExtraId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  supplierId: z.string().nullable(),
  selectionType: z.string(),
  pricingMode: z.string(),
  pricedPerPerson: z.boolean(),
  collectionMode: extraCollectionModeSchema,
  eligibleTravelerCount: z.number().int(),
  selectedTravelerCount: z.number().int(),
  totalQuantity: z.number().int(),
  fulfilledTravelerCount: z.number().int(),
  cancelledTravelerCount: z.number().int(),
  noShowTravelerCount: z.number().int(),
  collection: z.object({
    notRequired: z.number().int(),
    pending: z.number().int(),
    collected: z.number().int(),
    waived: z.number().int(),
    refunded: z.number().int(),
  }),
  collectionCurrency: z.string().nullable(),
  collectionAmountCents: z.number().int().nullable(),
  outstandingCollectionCount: z.number().int(),
  fulfillmentComplete: z.boolean(),
})

const slotExtraManifestSchema = z.object({
  slot: manifestSlotSchema,
  extras: z.array(manifestExtraSchema),
  travelers: z.array(manifestTravelerSchema),
  selections: z.array(manifestSelectionSchema),
  summaries: z.array(manifestSummarySchema),
  /**
   * Paging state for the traveler axis. `limit: null` means no page was
   * requested. `total` is the whole departure's traveler count, so it — and
   * every figure in `summaries` — is stable across pages.
   */
  pagination: z.object({
    limit: z.number().int().nullable(),
    offset: z.number().int(),
    total: z.number().int(),
  }),
})

// --- helpers ---------------------------------------------------------------

function jsonBody<S extends z.ZodTypeAny>(schema: S, required: boolean, description: string) {
  return {
    required,
    description,
    content: { "application/json": { schema } },
  }
}

function dataResponse<S extends z.ZodTypeAny>(schema: S, description: string) {
  return {
    description,
    content: { "application/json": { schema: z.object({ data: schema }) } },
  }
}

function listResponse<S extends z.ZodTypeAny>(schema: S, description: string) {
  return {
    description,
    content: { "application/json": { schema: listResponseSchema(schema) } },
  }
}

function notFoundResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: errorResponseSchema } },
  }
}

function deletedResponse(description: string) {
  return {
    description,
    content: { "application/json": { schema: deleteResponseSchema } },
  }
}

const invalidRequestResponse = {
  description: "invalid_request — request input failed validation",
  content: { "application/json": { schema: errorResponseSchema } },
}

// --- booking-extras sub-chain ---------------------------------------------

const listBookingExtrasRoute = createBookingsExtrasRoute({
  method: "get",
  path: "/booking-extras",
  request: { query: bookingExtraListQuerySchema },
  responses: {
    200: listResponse(bookingExtraSchema, "Paginated booking extras"),
    400: invalidRequestResponse,
  },
})

const createBookingExtraRoute = createBookingsExtrasRoute({
  method: "post",
  path: "/booking-extras",
  request: { body: jsonBody(insertBookingExtraSchema, true, "Booking extra") },
  responses: {
    201: dataResponse(bookingExtraSchema, "The created booking extra"),
    400: invalidRequestResponse,
  },
})

const getBookingExtraRoute = createBookingsExtrasRoute({
  method: "get",
  path: "/booking-extras/{id}",
  request: { params: idParamSchema },
  responses: {
    200: dataResponse(bookingExtraSchema, "A booking extra by id"),
    404: notFoundResponse("Booking extra not found"),
  },
})

const updateBookingExtraRoute = createBookingsExtrasRoute({
  method: "patch",
  path: "/booking-extras/{id}",
  request: {
    params: idParamSchema,
    body: jsonBody(updateBookingExtraSchema, false, "Partial booking extra update"),
  },
  responses: {
    200: dataResponse(bookingExtraSchema, "The updated booking extra"),
    400: invalidRequestResponse,
    404: notFoundResponse("Booking extra not found"),
  },
})

const deleteBookingExtraRoute = createBookingsExtrasRoute({
  method: "delete",
  path: "/booking-extras/{id}",
  request: { params: idParamSchema },
  responses: {
    200: deletedResponse("The booking extra was deleted"),
    404: notFoundResponse("Booking extra not found"),
  },
})

const bookingExtrasRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listBookingExtrasRoute, async (c) => {
    return c.json(
      await bookingsExtrasService.listBookingExtras(c.get("db"), c.req.valid("query")),
      200,
    )
  })
  .openapi(createBookingExtraRoute, async (c) => {
    const row = await bookingsExtrasService.createBookingExtra(c.get("db"), c.req.valid("json"))
    if (!row) throw new Error("Failed to create booking extra")
    return c.json({ data: row }, 201)
  })
  .openapi(getBookingExtraRoute, async (c) => {
    const row = await bookingsExtrasService.getBookingExtraById(
      c.get("db"),
      c.req.valid("param").id,
    )
    if (!row) return c.json({ error: "Booking extra not found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(updateBookingExtraRoute, async (c) => {
    const row = await bookingsExtrasService.updateBookingExtra(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    if (!row) return c.json({ error: "Booking extra not found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(deleteBookingExtraRoute, async (c) => {
    const row = await bookingsExtrasService.deleteBookingExtra(c.get("db"), c.req.valid("param").id)
    if (!row) return c.json({ error: "Booking extra not found" }, 404)
    return c.json({ success: true }, 200)
  })

// --- slot-manifest sub-chain ----------------------------------------------

const getSlotManifestRoute = createBookingsExtrasRoute({
  method: "get",
  path: "/slot-manifests/{slotId}",
  request: { params: slotIdParamSchema, query: slotExtraManifestQuerySchema },
  responses: {
    200: dataResponse(slotExtraManifestSchema, "The slot extra manifest"),
    400: invalidRequestResponse,
    404: notFoundResponse("Slot not found"),
  },
})

const setSlotSelectionRoute = createBookingsExtrasRoute({
  method: "patch",
  path: "/slot-manifests/{slotId}/selections",
  request: {
    params: slotIdParamSchema,
    body: jsonBody(slotExtraSelectionPatchSchema, true, "A single slot extra selection"),
  },
  responses: {
    200: dataResponse(extraParticipantSelectionSchema.nullable(), "The upserted selection"),
    400: invalidRequestResponse,
    404: notFoundResponse("Slot, extra, or traveler not found"),
  },
})

const bulkSetSlotSelectionsRoute = createBookingsExtrasRoute({
  method: "post",
  path: "/slot-manifests/{slotId}/selections/bulk",
  request: {
    params: slotIdParamSchema,
    body: jsonBody(slotExtraSelectionBulkSchema, true, "Bulk slot extra selections"),
  },
  responses: {
    200: dataResponse(
      z.array(extraParticipantSelectionSchema.nullable()),
      "The upserted selections",
    ),
    400: invalidRequestResponse,
    404: notFoundResponse("Slot, extra, or traveler not found"),
  },
})

const bulkUpdateSlotCollectionsRoute = createBookingsExtrasRoute({
  method: "post",
  path: "/slot-manifests/{slotId}/collections/bulk",
  request: {
    params: slotIdParamSchema,
    body: jsonBody(slotExtraCollectionBulkSchema, true, "Bulk slot extra collection updates"),
  },
  responses: {
    200: dataResponse(
      z.array(extraParticipantSelectionSchema.nullable()),
      "The updated collection selections",
    ),
    400: invalidRequestResponse,
    404: notFoundResponse("Slot, extra, or traveler not found"),
  },
})

const slotManifestsRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(getSlotManifestRoute, async (c) => {
    const result = await bookingsExtrasService.getSlotExtraManifest(
      c.get("db"),
      c.req.valid("param").slotId,
      c.req.valid("query"),
    )
    if (result.status === "slot_not_found") return c.json({ error: "Slot not found" }, 404)
    return c.json({ data: result.data }, 200)
  })
  .openapi(setSlotSelectionRoute, async (c) => {
    const result = await bookingsExtrasService.setSlotExtraSelection(
      c.get("db"),
      c.req.valid("param").slotId,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (result.status === "slot_not_found") return c.json({ error: "Slot not found" }, 404)
    if (result.status === "extra_not_found") return c.json({ error: "Extra not found" }, 404)
    if (result.status === "traveler_not_found") return c.json({ error: "Traveler not found" }, 404)
    return c.json({ data: result.data }, 200)
  })
  .openapi(bulkSetSlotSelectionsRoute, async (c) => {
    const result = await bookingsExtrasService.bulkSetSlotExtraSelections(
      c.get("db"),
      c.req.valid("param").slotId,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (result.status === "slot_not_found") return c.json({ error: "Slot not found" }, 404)
    if (result.status === "extra_not_found") return c.json({ error: "Extra not found" }, 404)
    if (result.status === "traveler_not_found") return c.json({ error: "Traveler not found" }, 404)
    return c.json({ data: result.data }, 200)
  })
  .openapi(bulkUpdateSlotCollectionsRoute, async (c) => {
    const result = await bookingsExtrasService.bulkUpdateSlotExtraCollections(
      c.get("db"),
      c.req.valid("param").slotId,
      c.req.valid("json"),
      c.get("userId"),
    )
    if (result.status === "slot_not_found") return c.json({ error: "Slot not found" }, 404)
    if (result.status === "extra_not_found") return c.json({ error: "Extra not found" }, 404)
    if (result.status === "traveler_not_found") return c.json({ error: "Traveler not found" }, 404)
    return c.json({ data: result.data }, 200)
  })

export const bookingsExtrasRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", bookingExtrasRoutes)
  .route("/", slotManifestsRoutes)

export type BookingsExtrasRoutes = typeof bookingsExtrasRoutes

export const __test__ = {
  bookingExtraSchema,
  extraParticipantSelectionSchema,
  slotExtraManifestSchema,
  manifestSlotSchema,
  manifestExtraSchema,
  manifestTravelerSchema,
  manifestSelectionSchema,
  manifestSummarySchema,
}
