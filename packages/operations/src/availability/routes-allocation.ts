/**
 * Availability "allocation" admin routes — the per-slot resource/traveler
 * allocation surface (manifests, resource CRUD, traveler↔resource assignment,
 * sharing-group pairing/labels, audit log, CSV exports) plus the product-option
 * resource-template configuration and the materialisation / auto-allocation
 * automations. Mounted for the published OpenAPI admin contract under
 * `/v1/admin/operations/availability/*` (see `availability/routes.ts`).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — operations sub-batch 10B). Request schemas reuse the exported
 * `validation.ts` schemas the handlers already parse; response schemas are
 * authored here from the service return shapes (manifests, mutation results,
 * audit entries, resource-template trees) — §17: timestamps serialize to ISO
 * strings on the wire; the resource `flags` jsonb is an open record; the CSV
 * export legs return `text/csv` (no JSON body).
 *
 * Each resource family is its own small `OpenAPIHono` sub-chain composed onto
 * `availabilityAllocationRoutes` via `.route("/")` so the `.openapi()`
 * operations propagate up through the parent availability registries while
 * keeping type-inference cost bounded (one flat chain has O(n²) inference cost).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * allocation bundle (22 legs) over the slot-allocation, resource-template, and
 * automation families, each with a `createRoute` def + co-located handler per
 * the established admin route pattern (mirrors `routes-core.ts`). Splitting per
 * family would fragment the single mounted instance without aiding review. See
 * voyant#2114 / voyant#2208 (operations sub-batch 10B).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { idempotencyKey, openApiValidationHook } from "@voyant-travel/hono"

import { availabilityAllocationPlanningRoutes } from "./routes-allocation-planning.js"
import {
  allocationErrorResponses,
  allocationResourceSchema,
  csvResponse,
  errorResponseSchema,
  flagsSchema,
  handleAllocationRouteError,
  isoTimestamp,
  slotIdParamSchema,
} from "./routes-allocation-shared.js"
import type { Env } from "./routes-shared.js"
import {
  assignTravelerAllocation,
  createAllocationResource,
  deleteAllocationResource,
  deleteSharingGroupLabel,
  getSlotAllocationManifest,
  listAllocationAuditLog,
  pairSharingGroup,
  updateAllocationResource,
  updateSharingGroupLabel,
  updateTravelerSharingGroup,
} from "./service-allocation.js"
import {
  autoAllocateSlotResources,
  autoMaterializeAllocationResources,
  deleteProductOptionResourceTemplate,
  listProductOptionResourceTemplates,
  materializeOpenSlotsFromTemplateDefaults,
  materializeSlotResourcesFromTemplateDefaults,
  upsertProductOptionResourceTemplate,
} from "./service-allocation-automation.js"
import {
  allocationExportFilename,
  allocationExportPrefixForKind,
  buildAllocationPassengersCsv,
  buildAllocationRoomingCsv,
} from "./service-allocation-exports.js"
import {
  materializeDepartureRoomsFromBlock,
  releaseDepartureRoomBlock,
} from "./service-allocation-room-block.js"
import { updateTravelerRoomingPreferences } from "./service-allocation-traveler-preferences.js"
import {
  allocationAuditLogQuerySchema,
  allocationAutomationSchema,
  allocationKindQuerySchema,
  allocationManifestQuerySchema,
  assignTravelerAllocationSchema,
  deleteAllocationResourceQuerySchema,
  insertAllocationResourceSchema,
  materializeFromRoomBlockSchema,
  materializeOpenSlotsSchema,
  pairSharingGroupSchema,
  updateAllocationResourceSchema,
  updateSharingGroupLabelSchema,
  updateTravelerRoomingPreferencesSchema,
  updateTravelerSharingGroupSchema,
  upsertResourceTemplateSchema,
} from "./validation.js"

// --- shared response schemas ------------------------------------------------

const slotResourceParamSchema = z.object({ id: z.string(), resourceId: z.string() })
const slotTravelerParamSchema = z.object({ id: z.string(), travelerId: z.string() })
const slotGroupParamSchema = z.object({ id: z.string(), groupId: z.string() })
const productIdParamSchema = z.object({ productId: z.string() })
const allocationExportQuerySchema = allocationKindQuerySchema
const templateParamSchema = z.object({
  productId: z.string(),
  optionId: z.string(),
  kind: z.string(),
})

/** Trimmed `returning()` projection from delete (id/kind/label/capacity only). */
const deletedAllocationResourceSchema = z.object({
  id: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  capacity: z.number().int(),
})

const allocationManifestTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  bookingSequence: z.number().int(),
  paymentStatus: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isLeadTraveler: z.boolean(),
  isPrimary: z.boolean(),
  sharingGroupId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  optionUnitCode: z.string().nullable(),
  roomTypeId: z.string().nullable(),
  bedPreference: z.string().nullable(),
  allocations: z.record(z.string(), z.string()),
  travelerCategory: z.string().nullable(),
  participantType: z.string(),
  hasAccessibilityNeeds: z.boolean(),
  hasDietaryRequirements: z.boolean(),
})

const allocationManifestBookingSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: z.string(),
  bookingSequence: z.number().int(),
  paymentStatus: z.string(),
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  sellCurrency: z.string().nullable(),
  pax: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  paidAmountCents: z.number().int().nullable(),
  travelers: z.array(allocationManifestTravelerSchema),
})

const slotAllocationManifestSchema = z.object({
  slot: z.object({
    id: z.string(),
    productId: z.string().nullable(),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
  }),
  bookings: z.array(allocationManifestBookingSchema),
  resources: z.array(allocationResourceSchema),
  sharingGroupLabels: z.record(z.string(), z.string()),
  /** `limit: null` means every booking is present; `total` is always the departure's. */
  pagination: z.object({
    limit: z.number().int().nullable(),
    offset: z.number().int(),
    total: z.number().int(),
  }),
  summary: z.object({
    bookingCount: z.number().int(),
    travelerCount: z.number().int(),
    leadTravelerCount: z.number().int(),
    bookingsByStatus: z.record(z.string(), z.number().int()),
  }),
})

/** One room constraint the assignment breached. See `room-constraints.ts`. */
const allocationConstraintViolationSchema = z.object({
  code: z.string(),
  severity: z.enum(["blocking", "advisory"]),
  message: z.string(),
  expected: z.union([z.string(), z.number()]).nullable().optional(),
  actual: z.union([z.string(), z.number()]).nullable().optional(),
  travelerIds: z.array(z.string()).optional(),
})

const assignTravelerResultSchema = z.object({
  travelerId: z.string(),
  kind: z.string(),
  resourceId: z.string().nullable(),
  /**
   * Every constraint the accepted assignment breached, advisory ones included.
   * A blocking violation only reaches this response when the caller supplied an
   * `override.reason`; without one the leg answers 409 with the same payload
   * under `detail.violations`.
   */
  violations: z.array(allocationConstraintViolationSchema),
})

const travelerRoomingPreferencesResultSchema = z.object({
  travelerId: z.string(),
  bedPreference: z.string().nullable(),
  roomTypeId: z.string().nullable(),
})

const roomBlockMaterializationResultSchema = z.object({
  blockId: z.string(),
  kind: z.string(),
  created: z.number().int(),
  skippedExisting: z.number().int(),
  roomsPickedUp: z.number().int(),
  pickupId: z.string().nullable(),
  remainingAfter: z.number().int(),
  resources: z.array(allocationResourceSchema),
})

const roomBlockReleaseResultSchema = z.object({
  blockId: z.string(),
  kind: z.string(),
  removed: z.number().int(),
  roomsReleased: z.number().int(),
})

const updateTravelerSharingGroupResultSchema = z.object({
  travelerId: z.string(),
  sharingGroupId: z.string().nullable(),
})

const pairSharingGroupResultSchema = z.object({
  sharingGroupId: z.string(),
  travelerIds: z.array(z.string()),
})

/** `sharing_group_labels.$inferSelect`-shaped result (or synthesized fallback). */
const sharingGroupLabelSchema = z.object({
  groupId: z.string(),
  label: z.string(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const allocationAuditLogEntrySchema = z.object({
  id: z.string(),
  slotId: z.string(),
  action: z.string(),
  actorId: z.string().nullable(),
  travelerId: z.string().nullable(),
  resourceId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  createdAt: isoTimestamp,
})

const allocationAutomationResultSchema = z.object({
  kind: z.string(),
  assigned: z.number().int().optional(),
  skipped: z.number().int().optional(),
  /** The groups behind `skipped`, each with its sharing group and a reason. */
  unplaced: z
    .array(
      z.object({
        groupKey: z.string(),
        sharingGroupId: z.string().nullable(),
        travelerIds: z.array(z.string()),
        reason: z.enum(["no_resources", "no_capacity"]),
        largestFreeCapacity: z.number().int(),
      }),
    )
    .optional(),
  /** Groups the planner could only place by relaxing a constraint. */
  compromises: z
    .array(
      z.object({
        groupKey: z.string(),
        sharingGroupId: z.string().nullable(),
        travelerIds: z.array(z.string()),
        resourceId: z.string(),
        relaxed: z.array(z.string()),
      }),
    )
    .optional(),
  created: z.number().int().optional(),
  /** Template groups already materialised on this slot and left alone. */
  skippedExisting: z.number().int().optional(),
  resources: z.array(allocationResourceSchema).optional(),
})

const resourceTemplateSchema = z.object({
  id: z.string(),
  productOptionId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  /** Maximum occupancy; kept in step with `occupancyMax` when that is set. */
  capacity: z.number().int(),
  occupancyMin: z.number().int().nullable(),
  occupancyMax: z.number().int().nullable(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  roomTypeId: z.string().nullable(),
  bedConfiguration: z.string().nullable(),
  accessible: z.boolean(),
  namePattern: z.string(),
  layout: z.string().nullable(),
  defaultCount: z.number().int().nullable(),
  flags: flagsSchema,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

const productOptionResourceTemplatesSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  templates: z.array(resourceTemplateSchema),
})

// --- slot allocation manifest + resources -----------------------------------

const getManifestRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation",
  description:
    "The slot's allocation manifest. `limit`/`offset` page the booking axis; " +
    "omitting `limit` returns every booking. The `summary` counters are " +
    "whole-departure and do not change with the page.",
  request: { params: slotIdParamSchema, query: allocationManifestQuerySchema },
  responses: {
    200: {
      description: "The slot's allocation manifest (bookings, travelers, resources, summary)",
      content: { "application/json": { schema: z.object({ data: slotAllocationManifestSchema }) } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const createResourceRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/resources",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: insertAllocationResourceSchema } },
    },
  },
  responses: {
    201: {
      description: "The created allocation resource",
      content: { "application/json": { schema: z.object({ data: allocationResourceSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const updateResourceRoute = createRoute({
  method: "patch",
  path: "/slots/{id}/allocation/resources/{resourceId}",
  request: {
    params: slotResourceParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAllocationResourceSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated allocation resource",
      content: { "application/json": { schema: z.object({ data: allocationResourceSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const deleteResourceRoute = createRoute({
  method: "delete",
  path: "/slots/{id}/allocation/resources/{resourceId}",
  request: { params: slotResourceParamSchema, query: deleteAllocationResourceQuerySchema },
  responses: {
    200: {
      description: "The deleted allocation resource (id/kind/label/capacity)",
      content: {
        "application/json": { schema: z.object({ data: deletedAllocationResourceSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const slotResourceRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(getManifestRoute, async (c) => {
    const manifest = await getSlotAllocationManifest(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("query"),
    )
    return manifest
      ? c.json({ data: manifest }, 200)
      : c.json({ error: "Availability slot not found" }, 404)
  })
  .openapi(createResourceRoute, async (c) => {
    try {
      const row = await createAllocationResource(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return row
        ? c.json({ data: row }, 201)
        : c.json({ error: "Availability slot not found" }, 404)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(updateResourceRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const row = await updateAllocationResource(
        c.get("db"),
        params.id,
        params.resourceId,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Allocation resource not found" }, 404)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(deleteResourceRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const { expectedUpdatedAt } = c.req.valid("query")
      const row = await deleteAllocationResource(c.get("db"), params.id, params.resourceId, {
        actorId: c.get("userId") ?? null,
        ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
      })
      return row
        ? c.json({ data: row }, 200)
        : c.json({ error: "Allocation resource not found" }, 404)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })

// --- traveler assignment + sharing groups -----------------------------------

const assignTravelerRoute = createRoute({
  method: "patch",
  path: "/slots/{id}/allocation/travelers/{travelerId}",
  request: {
    params: slotTravelerParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: assignTravelerAllocationSchema } },
    },
  },
  responses: {
    200: {
      description: "The traveler's resolved allocation (kind + resourceId, null to unassign)",
      content: { "application/json": { schema: z.object({ data: assignTravelerResultSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

/**
 * The rooming preferences the constraint evaluator reads. Before #4036 these
 * were writable only through the admin travel-details API, so the departure
 * workspace could enforce a bed preference it gave no way to enter.
 */
const updateTravelerRoomingPreferencesRoute = createRoute({
  method: "patch",
  path: "/slots/{id}/allocation/travelers/{travelerId}/rooming-preferences",
  description:
    "Set the traveler's bed preference and booked room type. A field the caller " +
    "omits keeps its stored value; an explicit `null` clears it.",
  request: {
    params: slotTravelerParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateTravelerRoomingPreferencesSchema } },
    },
  },
  responses: {
    200: {
      description: "The traveler's resolved rooming preferences",
      content: {
        "application/json": { schema: z.object({ data: travelerRoomingPreferencesResultSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const updateTravelerSharingGroupRoute = createRoute({
  method: "patch",
  path: "/slots/{id}/allocation/travelers/{travelerId}/sharing-group",
  request: {
    params: slotTravelerParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateTravelerSharingGroupSchema } },
    },
  },
  responses: {
    200: {
      description: "The traveler's resolved sharing group (null to clear)",
      content: {
        "application/json": { schema: z.object({ data: updateTravelerSharingGroupResultSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const pairSharingGroupRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/sharing-groups/pair",
  request: {
    params: slotIdParamSchema,
    body: { required: true, content: { "application/json": { schema: pairSharingGroupSchema } } },
  },
  responses: {
    201: {
      description: "The paired sharing group (id + member traveler ids)",
      content: { "application/json": { schema: z.object({ data: pairSharingGroupResultSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const updateSharingGroupLabelRoute = createRoute({
  method: "put",
  path: "/slots/{id}/allocation/sharing-groups/{groupId}/label",
  request: {
    params: slotGroupParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateSharingGroupLabelSchema } },
    },
  },
  responses: {
    200: {
      description: "The upserted sharing-group label",
      content: { "application/json": { schema: z.object({ data: sharingGroupLabelSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const deleteSharingGroupLabelRoute = createRoute({
  method: "delete",
  path: "/slots/{id}/allocation/sharing-groups/{groupId}/label",
  request: { params: slotGroupParamSchema },
  responses: {
    200: {
      description: "The cleared sharing-group label",
      content: { "application/json": { schema: z.object({ data: sharingGroupLabelSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const slotTravelerRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(assignTravelerRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const result = await assignTravelerAllocation(
        c.get("db"),
        params.id,
        params.travelerId,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data: result }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(updateTravelerRoomingPreferencesRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const result = await updateTravelerRoomingPreferences(
        c.get("db"),
        params.id,
        params.travelerId,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data: result }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(updateTravelerSharingGroupRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const result = await updateTravelerSharingGroup(
        c.get("db"),
        params.id,
        params.travelerId,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data: result }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(pairSharingGroupRoute, async (c) => {
    try {
      const result = await pairSharingGroup(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data: result }, 201)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(updateSharingGroupLabelRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const data = await updateSharingGroupLabel(
        c.get("db"),
        params.id,
        params.groupId,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(deleteSharingGroupLabelRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const data = await deleteSharingGroupLabel(c.get("db"), params.id, params.groupId, {
        actorId: c.get("userId") ?? null,
      })
      return data ? c.json({ data }, 200) : c.json({ error: "Sharing group label not found" }, 404)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })

// --- audit log + CSV exports ------------------------------------------------

const listAuditLogRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation/audit-log",
  request: { params: slotIdParamSchema, query: allocationAuditLogQuerySchema },
  responses: {
    200: {
      description: "The slot's allocation audit-log entries (newest first)",
      content: {
        "application/json": { schema: z.object({ data: z.array(allocationAuditLogEntrySchema) }) },
      },
    },
  },
})

const exportPassengersRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation/export-passengers",
  request: { params: slotIdParamSchema },
  responses: {
    200: {
      description: "Passenger manifest CSV (text/csv attachment)",
      content: { "text/csv": { schema: z.string() } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const exportRoomingRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation/export-rooming-list",
  description:
    "Resource-occupancy CSV for one allocation kind. `kind=vehicle_seat` produces the " +
    "coach seating manifest; the default `room` produces the rooming list. The CSV " +
    "builder always took a kind — until now the route never let a caller name one.",
  request: { params: slotIdParamSchema, query: allocationExportQuerySchema },
  responses: {
    200: {
      description: "Rooming-list or seating-manifest CSV (text/csv attachment)",
      content: { "text/csv": { schema: z.string() } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const slotAuditExportRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listAuditLogRoute, async (c) => {
    const data = await listAllocationAuditLog(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("query").limit,
    )
    return c.json({ data }, 200)
  })
  .openapi(exportPassengersRoute, async (c) => {
    const manifest = await getSlotAllocationManifest(c.get("db"), c.req.valid("param").id)
    if (!manifest) return c.json({ error: "Availability slot not found" }, 404)
    return csvResponse(
      c,
      buildAllocationPassengersCsv(manifest),
      allocationExportFilename(manifest, "passengers"),
    )
  })
  .openapi(exportRoomingRoute, async (c) => {
    const manifest = await getSlotAllocationManifest(c.get("db"), c.req.valid("param").id)
    if (!manifest) return c.json({ error: "Availability slot not found" }, 404)
    const { kind } = c.req.valid("query")
    return csvResponse(
      c,
      buildAllocationRoomingCsv(manifest, kind),
      allocationExportFilename(manifest, allocationExportPrefixForKind(kind)),
    )
  })

// --- slot allocation automations --------------------------------------------

const autoMaterializeRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/auto-materialize",
  description:
    "Materialise resources for this kind from the option's templates, sized to the pax " +
    "already booked. Idempotent: template groups that already have resources on this " +
    "slot are skipped and reported in `skippedExisting`, so a retry is a no-op rather " +
    "than a 409.",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: allocationAutomationSchema } },
    },
  },
  responses: {
    200: {
      description: "Pax-derived materialisation result (kind + created count + resources)",
      content: {
        "application/json": { schema: z.object({ data: allocationAutomationResultSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const materializeTemplatesRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/materialize-templates",
  description:
    "Lay this departure out from its option's template `default_count`s, before any " +
    "sale. `vehicle_seat` templates count vehicles and draw each one's full seat map.",
  request: { params: slotIdParamSchema },
  responses: {
    200: {
      description: "The count of resources materialised from the slot's template defaults",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              created: z.number().int(),
              skippedExisting: z.number().int(),
            }),
          }),
        },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const autoAllocateRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/auto-allocate",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: allocationAutomationSchema } },
    },
  },
  responses: {
    200: {
      description: "Auto-allocation result (kind + assigned + skipped counts)",
      content: {
        "application/json": { schema: z.object({ data: allocationAutomationResultSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

/**
 * Draw a departure's room inventory from a contracted accommodation block.
 *
 * The one write path: it creates the positions **and** takes the nightly pickup
 * in one transaction, so `room_block_nights` can never disagree with what the
 * departure operates. See `service-allocation-room-block.ts`.
 */
const materializeFromRoomBlockRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/room-blocks/materialize",
  description:
    "Materialise room positions from a contracted room block and take the matching " +
    "nightly pickup. Idempotent at (kind, block) granularity: a repeat creates nothing " +
    "and takes no second pickup. Omit `rooms` to take the block's whole remaining hold " +
    "for the departure's nights.",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: materializeFromRoomBlockSchema } },
    },
  },
  responses: {
    200: {
      description: "The positions created and the rooms taken off the block",
      content: {
        "application/json": {
          schema: z.object({ data: roomBlockMaterializationResultSchema }),
        },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const releaseRoomBlockRoute = createRoute({
  method: "delete",
  path: "/slots/{id}/allocation/room-blocks/{blockId}",
  description:
    "Give the departure's block rooms back: remove the positions, clear the traveler " +
    "allocations that pointed at them, and reverse the pickup so another departure can " +
    "draw the same rooms.",
  request: {
    params: z.object({ id: z.string(), blockId: z.string() }),
    query: allocationKindQuerySchema,
  },
  responses: {
    200: {
      description: "The positions removed and the rooms handed back",
      content: {
        "application/json": { schema: z.object({ data: roomBlockReleaseResultSchema }) },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const slotAutomationRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })

// Auto-allocate re-plans from live state, so a retry after a dropped connection
// is *not* the same operation twice. An `Idempotency-Key` makes it replayable;
// the header stays optional so existing clients are unaffected.
slotAutomationRoutes.use(
  "/slots/:id/allocation/auto-allocate",
  idempotencyKey({ scope: "operations.allocation.auto-allocate" }),
)
slotAutomationRoutes.use(
  "/slots/:id/allocation/auto-materialize",
  idempotencyKey({ scope: "operations.allocation.auto-materialize" }),
)
// Drawing down a supplier's block is the one materialisation with an
// irreversible side effect outside this module, so a retried request must not
// take the rooms twice. The (kind, block) skip rule already makes it a no-op;
// the key makes the *response* the same too.
slotAutomationRoutes.use(
  "/slots/:id/allocation/room-blocks/materialize",
  idempotencyKey({ scope: "operations.allocation.room-block-materialize" }),
)

slotAutomationRoutes
  .openapi(autoMaterializeRoute, async (c) => {
    try {
      const data = await autoMaterializeAllocationResources(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(materializeTemplatesRoute, async (c) => {
    try {
      const result = await materializeSlotResourcesFromTemplateDefaults(
        c.get("db"),
        c.req.valid("param").id,
      )
      return c.json(
        { data: { created: result.created, skippedExisting: result.skippedExisting } },
        200,
      )
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(autoAllocateRoute, async (c) => {
    try {
      const data = await autoAllocateSlotResources(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(materializeFromRoomBlockRoute, async (c) => {
    try {
      const data = await materializeDepartureRoomsFromBlock(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(releaseRoomBlockRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const data = await releaseDepartureRoomBlock(
        c.get("db"),
        params.id,
        params.blockId,
        { kind: c.req.valid("query").kind },
        { actorId: c.get("userId") ?? null },
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })

// --- product-option resource templates + open-slot materialisation ----------

const listResourceTemplatesRoute = createRoute({
  method: "get",
  path: "/products/{productId}/allocation/resource-templates",
  request: { params: productIdParamSchema },
  responses: {
    200: {
      description: "The product's options, each with its configured resource templates",
      content: {
        "application/json": {
          schema: z.object({ data: z.array(productOptionResourceTemplatesSchema) }),
        },
      },
    },
  },
})

const upsertResourceTemplateRoute = createRoute({
  method: "put",
  path: "/products/{productId}/options/{optionId}/allocation/resource-templates/{kind}",
  request: {
    params: templateParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: upsertResourceTemplateSchema } },
    },
  },
  responses: {
    200: {
      description: "The upserted resource template",
      content: { "application/json": { schema: z.object({ data: resourceTemplateSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const deleteResourceTemplateRoute = createRoute({
  method: "delete",
  path: "/products/{productId}/options/{optionId}/allocation/resource-templates/{kind}",
  request: {
    params: templateParamSchema,
    query: z.object({ refId: z.string().optional() }),
  },
  responses: {
    200: {
      description: "The deleted template's option + kind",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({ productOptionId: z.string(), kind: z.string() }),
          }),
        },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const materializeOpenSlotsRoute = createRoute({
  method: "post",
  path: "/products/{id}/allocation/materialize-open-slots",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: materializeOpenSlotsSchema } },
    },
  },
  responses: {
    200: {
      description: "Open-slot back-fill result (slots touched + resources created)",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({ slots: z.number().int(), created: z.number().int() }),
          }),
        },
      },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const templateRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listResourceTemplatesRoute, async (c) => {
    const data = await listProductOptionResourceTemplates(
      c.get("db"),
      c.req.valid("param").productId,
    )
    return c.json({ data }, 200)
  })
  .openapi(upsertResourceTemplateRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const data = await upsertProductOptionResourceTemplate(
        c.get("db"),
        params.productId,
        params.optionId,
        params.kind,
        c.req.valid("json"),
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(deleteResourceTemplateRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const data = await deleteProductOptionResourceTemplate(
        c.get("db"),
        params.productId,
        params.optionId,
        params.kind,
        c.req.valid("query").refId ?? null,
      )
      return data ? c.json({ data }, 200) : c.json({ error: "Resource template not found" }, 404)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(materializeOpenSlotsRoute, async (c) => {
    try {
      const body = c.req.valid("json")
      const data = await materializeOpenSlotsFromTemplateDefaults(c.get("db"), {
        productId: c.req.valid("param").id,
        ...(body.optionId !== undefined ? { optionId: body.optionId } : {}),
      })
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })

/**
 * Compose the per-family sub-chains onto a single `OpenAPIHono` so the
 * `.openapi()` operations propagate up through the parent availability
 * registries (`OpenAPIHono.route` copies the sub-app's registered routes).
 */
export const availabilityAllocationRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", slotResourceRoutes)
  .route("/", slotTravelerRoutes)
  .route("/", slotAuditExportRoutes)
  .route("/", slotAutomationRoutes)
  .route("/", templateRoutes)
  .route("/", availabilityAllocationPlanningRoutes)
