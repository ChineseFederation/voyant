/**
 * Availability "core" admin routes — the dashboard read-models (aggregates +
 * overview) and CRUD/batch surfaces for the four core availability resources:
 * recurrence rules, start times, departure slots, and closeouts. Mounted on the
 * legacy `/v1/operations/availability/*` surface (operator React clients hit
 * those paths) AND, for the published OpenAPI admin contract, on the staff
 * surface at `/v1/admin/operations/availability/*` (see
 * `availability/routes.ts`).
 *
 * Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 /
 * voyant#2208 — operations sub-batch 10A). Request schemas reuse the exported
 * `validation.ts` insert/update/list-query schemas the handlers already parse;
 * response row schemas are authored here from the Drizzle `$inferSelect` shapes
 * (§17 dates → strings, plus the service-joined `productName` and the slot's
 * computed `endDateLocal`). Each resource is its own small `OpenAPIHono`
 * sub-chain composed onto `availabilityCoreRoutes` via `.route("/")` so the
 * `.openapi()` operations propagate up through the parent registries while
 * keeping type-inference cost bounded (one flat chain has O(n²) inference cost).
 *
 * agent-quality: file-size exception — intentional: a mechanically-repetitive
 * CRUD + batch bundle over five availability resources (31 legs), each with a
 * `createRoute` def + co-located handler per the established admin route pattern
 * (mirrors finance's `routes-invoice-core.ts`). Splitting per resource would
 * fragment the single mounted instance without aiding review. See voyant#2114 /
 * voyant#2208 (operations sub-batch 10A).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  aggregateSnapshotKey,
  readThroughAggregateSnapshot,
} from "@voyant-travel/db/aggregate-snapshots"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"

import {
  batchIdsSchema,
  createBatchUpdateSchema,
  type Env,
  handleBatchDelete,
  handleBatchUpdate,
} from "./routes-shared.js"
import { availabilityService } from "./service.js"
import {
  availabilityAggregatesQuerySchema,
  availabilityCloseoutListQuerySchema,
  availabilityOverviewQuerySchema,
  availabilityRuleListQuerySchema,
  availabilitySlotListQuerySchema,
  availabilitySlotStatusSchema,
  availabilityStartTimeListQuerySchema,
  insertAvailabilityCloseoutSchema,
  insertAvailabilityRuleSchema,
  insertAvailabilitySlotSchema,
  insertAvailabilityStartTimeSchema,
  updateAvailabilityCloseoutSchema,
  updateAvailabilityRuleSchema,
  updateAvailabilitySlotSchema,
  updateAvailabilityStartTimeSchema,
} from "./validation.js"

const batchUpdateAvailabilityRuleSchema = createBatchUpdateSchema(updateAvailabilityRuleSchema)
const batchUpdateAvailabilityStartTimeSchema = createBatchUpdateSchema(
  updateAvailabilityStartTimeSchema,
)
const batchUpdateAvailabilitySlotSchema = createBatchUpdateSchema(updateAvailabilitySlotSchema)
const batchUpdateAvailabilityCloseoutSchema = createBatchUpdateSchema(
  updateAvailabilityCloseoutSchema,
)

const DASHBOARD_AGGREGATES_CACHE_CONTROL = "private, max-age=30"

/** Server-side snapshot TTL — see readThroughAggregateSnapshot (#1629). */
const DASHBOARD_AGGREGATES_TTL_SECONDS = 60

function cacheDashboardAggregates(c: {
  header: (name: string, value: string, options?: { append?: boolean }) => void
}) {
  c.header("Cache-Control", DASHBOARD_AGGREGATES_CACHE_CONTROL)
  c.header("Vary", "Authorization", { append: true })
  c.header("Vary", "Cookie", { append: true })
}

// --- shared response schemas ------------------------------------------------

const errorResponseSchema = z.object({ error: z.string() })
const successResponseSchema = z.object({ success: z.literal(true) })
const idSchema = z.string()
const idParamSchema = z.object({ id: idSchema })

/** Envelope returned by the shared batch-update handler. */
function batchUpdateResponseSchema<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    data: z.array(row),
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.array(z.object({ id: idSchema, error: z.string() })),
  })
}

/** Envelope returned by the shared batch-delete handler. */
const batchDeleteResponseSchema = z.object({
  deletedIds: z.array(idSchema),
  total: z.number().int(),
  succeeded: z.number().int(),
  failed: z.array(z.object({ id: idSchema, error: z.string() })),
})

// §17: timestamps/dates are serialized to ISO strings on the wire.
const availabilityRuleSchema = z.object({
  id: idSchema,
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  timezone: z.string(),
  recurrenceRule: z.string(),
  maxCapacity: z.number().int(),
  maxPickupCapacity: z.number().int().nullable(),
  minTotalPax: z.number().int().nullable(),
  cutoffMinutes: z.number().int().nullable(),
  earlyBookingLimitMinutes: z.number().int().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * List rows are left-joined to `products` for the display name. `productName`
 * is `nullable().optional()` because the service spreads the slot/rule columns
 * through a generic that widens the joined column to `string | null |
 * undefined`; on the wire it is always present (possibly `null`).
 */
const availabilityRuleListRowSchema = availabilityRuleSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilityStartTimeSchema = z.object({
  id: idSchema,
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  label: z.string().nullable(),
  startTimeLocal: z.string(),
  durationMinutes: z.number().int().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const availabilityStartTimeListRowSchema = availabilityStartTimeSchema.extend({
  productName: z.string().nullable().optional(),
})

/** Raw `availability_slots` row (no derived/joined columns). */
const availabilitySlotBaseSchema = z.object({
  id: idSchema,
  productId: z.string(),
  /**
   * The immutable Product Version this departure was materialized from.
   * Persisted and accepted on write since #4032 but previously dropped on the
   * way out, which left the operator unable to see which frozen definition a
   * departure is operating. `null` on legacy rows and never-published
   * products.
   */
  productVersionId: z.string().nullable(),
  itineraryId: z.string().nullable(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  timezone: z.string(),
  status: availabilitySlotStatusSchema,
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
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Single-slot read/mutation rows carry the computed local end date. */
const availabilitySlotSchema = availabilitySlotBaseSchema.extend({
  /** Computed local end date (slot timezone); `null` when not derivable. */
  endDateLocal: z.string().nullable(),
})

/** List rows additionally carry the joined product display name. */
const availabilitySlotListRowSchema = availabilitySlotSchema.extend({
  productName: z.string().nullable().optional(),
})

/**
 * The overview's `constrainedSlots` are raw `$inferSelect` rows + the joined
 * `productName` — they do NOT pass through `withSlotEndDateLocal`, so they have
 * no `endDateLocal`.
 */
const constrainedSlotRowSchema = availabilitySlotBaseSchema.extend({
  productName: z.string().nullable(),
})

const slotUnitAvailabilitySchema = z.object({
  optionUnitId: z.string(),
  unitName: z.string(),
  occupancyMax: z.number().int().nullable(),
  initial: z.number().int().nullable(),
  reserved: z.number().int(),
  remaining: z.number().int().nullable(),
})

// --- departure summary ------------------------------------------------------

/**
 * The composed departure envelope. Every field is a scalar, a small record, or
 * a capped list — this route is the workspace's headline, and it must stay a
 * single bounded response no matter how large the departure is.
 */
const departureIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["critical", "warning"]),
  subjectType: z.enum([
    "departure",
    "booking",
    "booking_allocation",
    "availability_hold",
    "allocation_resource",
  ]),
  subjectId: z.string(),
  count: z.number().int(),
  message: z.string(),
})

const departureHoldCountersSchema = z.object({
  active: z.number().int(),
  activePax: z.number().int(),
  expired: z.number().int(),
  expiredPax: z.number().int(),
  released: z.number().int(),
  converted: z.number().int(),
})

const departureAllocationCountersSchema = z.object({
  held: z.number().int(),
  confirmed: z.number().int(),
  fulfilled: z.number().int(),
  staleHeld: z.number().int(),
  released: z.number().int(),
  expired: z.number().int(),
  cancelled: z.number().int(),
  active: z.number().int(),
  inactive: z.number().int(),
})

const departureTravelerCountersSchema = z.object({
  entered: z.number().int(),
  lead: z.number().int(),
  assigned: z.number().int(),
  unassigned: z.number().int(),
  missing: z.number().int(),
})

const departureResourceCountersSchema = z.object({
  total: z.number().int(),
  seating: z.number().int(),
  capacity: z.number().int(),
  assigned: z.number().int(),
  available: z.number().int(),
  overCapacity: z.number().int(),
})

const departureResourceRowSchema = z.object({
  id: idSchema,
  slotId: z.string(),
  kind: z.string(),
  label: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  parentId: z.string().nullable(),
  capacity: z.number().int(),
  assigned: z.number().int(),
  available: z.number().int(),
  flags: z.record(z.string(), z.unknown()),
  sortOrder: z.number().int(),
})

const departureCapacityCountersSchema = z.object({
  slotId: z.string(),
  unlimited: z.boolean(),
  initialPax: z.number().int().nullable(),
  effectivePax: z.number().int().nullable(),
  remainingPax: z.number().int().nullable(),
  derivedRemainingPax: z.number().int().nullable(),
  derivedConsumedPax: z.number().int(),
  holds: departureHoldCountersSchema,
  allocations: departureAllocationCountersSchema,
  bookings: z.object({
    active: z.number().int(),
    cancelledWithLiveAllocation: z.number().int(),
    expectedPax: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  }),
  travelers: departureTravelerCountersSchema,
  resources: departureResourceCountersSchema,
  resourceBreakdown: z.array(departureResourceRowSchema),
})

const departureFinanceLineSchema = z.object({
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})

const departureSummarySchema = z.object({
  departure: z.object({
    id: idSchema,
    productId: z.string(),
    productVersionId: z.string().nullable(),
    itineraryId: z.string().nullable(),
    optionId: z.string().nullable(),
    facilityId: z.string().nullable(),
    status: availabilitySlotStatusSchema,
    dateLocal: z.string(),
    startsAt: z.string(),
    endsAt: z.string().nullable(),
    timezone: z.string(),
    notes: z.string().nullable(),
  }),
  capacity: departureCapacityCountersSchema,
  bookings: z.object({
    count: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
    expectedPax: z.number().int(),
    currency: z.string().nullable(),
    soldAmountCents: z.number().int().nullable(),
    paidAmountCents: z.number().int().nullable(),
    outstandingAmountCents: z.number().int().nullable(),
  }),
  travelers: departureTravelerCountersSchema,
  allocation: departureResourceCountersSchema,
  operations: z.object({
    issues: z.array(departureIssueSchema),
    criticalCount: z.number().int(),
    warningCount: z.number().int(),
    clear: z.boolean(),
  }),
  /** Null when the Extras module is not deployed. */
  extras: z
    .object({
      offered: z.number().int(),
      withSelections: z.number().int(),
      selectedTravelerCount: z.number().int(),
      totalQuantity: z.number().int(),
      outstandingCollectionCount: z.number().int(),
      fulfilledExtraCount: z.number().int(),
    })
    .nullable(),
  /** Null when no Finance provider is bound in this deployment. */
  finance: z
    .object({
      perCurrency: z.array(departureFinanceLineSchema),
      base: departureFinanceLineSchema.nullable(),
      unconvertibleCurrencies: z.array(z.string()),
    })
    .nullable(),
})

const availabilityCloseoutSchema = z.object({
  id: idSchema,
  productId: z.string(),
  slotId: z.string().nullable(),
  dateLocal: z.string(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
})

const availabilityAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(
    z.object({ status: availabilitySlotStatusSchema, count: z.number().int() }),
  ),
  upcomingSlots: z.number().int(),
  upcomingPax: z.number().int(),
  monthlyDepartures: z.array(z.object({ yearMonth: z.string(), count: z.number().int() })),
})

const availabilityOverviewSchema = z.object({
  openSlotsCount: z.number().int(),
  constrainedSlotsCount: z.number().int(),
  activeRulesCount: z.number().int(),
  activePickupPointsCount: z.number().int(),
  productsWithoutUpcomingDeparturesCount: z.number().int(),
  productsWithoutUpcomingDepartures: z.array(z.object({ id: idSchema, name: z.string() })),
  constrainedSlots: z.array(constrainedSlotRowSchema),
})

// --- dashboard read-models --------------------------------------------------

const getAggregatesRoute = createRoute({
  method: "get",
  path: "/aggregates",
  description:
    "Dashboard KPI aggregates over availability slots, served from a read-through " +
    "TTL snapshot (#1629). The optional `from`/`to` ISO-datetime query window is " +
    "anchored on each slot's `startsAt`.",
  request: { query: availabilityAggregatesQuerySchema },
  responses: {
    200: {
      description: "Availability dashboard aggregates",
      content: { "application/json": { schema: z.object({ data: availabilityAggregatesSchema }) } },
    },
  },
})

const getOverviewRoute = createRoute({
  method: "get",
  path: "/overview",
  description:
    "Availability operations overview — open / constrained slot counts, active " +
    "rule and pickup-point counts, products lacking upcoming departures, and the " +
    "next constrained slots needing attention (`attentionLimit`, default 4).",
  request: { query: availabilityOverviewQuerySchema },
  responses: {
    200: {
      description: "Availability overview read-model",
      content: { "application/json": { schema: z.object({ data: availabilityOverviewSchema }) } },
    },
  },
})

const dashboardRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(getAggregatesRoute, async (c) => {
    const query = c.req.valid("query")
    cacheDashboardAggregates(c)
    const snapshot = await readThroughAggregateSnapshot(c.get("db"), {
      key: aggregateSnapshotKey("availability", "aggregates", query),
      ttlSeconds: DASHBOARD_AGGREGATES_TTL_SECONDS,
      compute: () => availabilityService.getAvailabilityAggregates(c.get("db"), query),
    })
    return c.json({ data: snapshot.data }, 200)
  })
  .openapi(getOverviewRoute, async (c) =>
    c.json(
      {
        data: await availabilityService.getAvailabilityOverview(c.get("db"), c.req.valid("query")),
      },
      200,
    ),
  )

// --- recurrence rules -------------------------------------------------------

const listRulesRoute = createRoute({
  method: "get",
  path: "/rules",
  request: { query: availabilityRuleListQuerySchema },
  responses: {
    200: {
      description: "Paginated availability recurrence rules",
      content: {
        "application/json": { schema: listResponseSchema(availabilityRuleListRowSchema) },
      },
    },
  },
})

const createRuleRoute = createRoute({
  method: "post",
  path: "/rules",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertAvailabilityRuleSchema } },
    },
  },
  responses: {
    201: {
      description: "The created availability rule",
      content: { "application/json": { schema: z.object({ data: availabilityRuleSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchUpdateRulesRoute = createRoute({
  method: "post",
  path: "/rules/batch-update",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: batchUpdateAvailabilityRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "Per-id batch-update results (missing ids reported under `failed`)",
      content: {
        "application/json": { schema: batchUpdateResponseSchema(availabilityRuleSchema) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchDeleteRulesRoute = createRoute({
  method: "post",
  path: "/rules/batch-delete",
  request: {
    body: { required: true, content: { "application/json": { schema: batchIdsSchema } } },
  },
  responses: {
    200: {
      description: "Per-id batch-delete results (missing ids reported under `failed`)",
      content: { "application/json": { schema: batchDeleteResponseSchema } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getRuleRoute = createRoute({
  method: "get",
  path: "/rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "An availability rule by id",
      content: { "application/json": { schema: z.object({ data: availabilityRuleSchema }) } },
    },
    404: {
      description: "Availability rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateRuleRoute = createRoute({
  method: "patch",
  path: "/rules/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAvailabilityRuleSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated availability rule",
      content: { "application/json": { schema: z.object({ data: availabilityRuleSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Availability rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteRuleRoute = createRoute({
  method: "delete",
  path: "/rules/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Availability rule deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Availability rule not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const ruleRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listRulesRoute, async (c) =>
    c.json(await availabilityService.listRules(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createRuleRoute, async (c) => {
    // Insert always returns the created row (`returning()` over one VALUES row).
    const row = await availabilityService.createRule(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateRulesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: availabilityService.updateRule,
      }),
      200,
    )
  })
  .openapi(batchDeleteRulesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: availabilityService.deleteRule,
      }),
      200,
    )
  })
  .openapi(getRuleRoute, async (c) => {
    const row = await availabilityService.getRuleById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Availability rule not found" }, 404)
  })
  .openapi(updateRuleRoute, async (c) => {
    const row = await availabilityService.updateRule(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Availability rule not found" }, 404)
  })
  .openapi(deleteRuleRoute, async (c) => {
    const row = await availabilityService.deleteRule(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Availability rule not found" }, 404)
  })

// --- start times ------------------------------------------------------------

const listStartTimesRoute = createRoute({
  method: "get",
  path: "/start-times",
  request: { query: availabilityStartTimeListQuerySchema },
  responses: {
    200: {
      description: "Paginated availability start times",
      content: {
        "application/json": { schema: listResponseSchema(availabilityStartTimeListRowSchema) },
      },
    },
  },
})

const createStartTimeRoute = createRoute({
  method: "post",
  path: "/start-times",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertAvailabilityStartTimeSchema } },
    },
  },
  responses: {
    201: {
      description: "The created start time",
      content: { "application/json": { schema: z.object({ data: availabilityStartTimeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchUpdateStartTimesRoute = createRoute({
  method: "post",
  path: "/start-times/batch-update",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: batchUpdateAvailabilityStartTimeSchema } },
    },
  },
  responses: {
    200: {
      description: "Per-id batch-update results (missing ids reported under `failed`)",
      content: {
        "application/json": { schema: batchUpdateResponseSchema(availabilityStartTimeSchema) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchDeleteStartTimesRoute = createRoute({
  method: "post",
  path: "/start-times/batch-delete",
  request: {
    body: { required: true, content: { "application/json": { schema: batchIdsSchema } } },
  },
  responses: {
    200: {
      description: "Per-id batch-delete results (missing ids reported under `failed`)",
      content: { "application/json": { schema: batchDeleteResponseSchema } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getStartTimeRoute = createRoute({
  method: "get",
  path: "/start-times/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A start time by id",
      content: { "application/json": { schema: z.object({ data: availabilityStartTimeSchema }) } },
    },
    404: {
      description: "Availability start time not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateStartTimeRoute = createRoute({
  method: "patch",
  path: "/start-times/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAvailabilityStartTimeSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated start time",
      content: { "application/json": { schema: z.object({ data: availabilityStartTimeSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Availability start time not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteStartTimeRoute = createRoute({
  method: "delete",
  path: "/start-times/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Start time deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Availability start time not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const startTimeRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listStartTimesRoute, async (c) =>
    c.json(await availabilityService.listStartTimes(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createStartTimeRoute, async (c) => {
    const row = await availabilityService.createStartTime(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateStartTimesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: availabilityService.updateStartTime,
      }),
      200,
    )
  })
  .openapi(batchDeleteStartTimesRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: availabilityService.deleteStartTime,
      }),
      200,
    )
  })
  .openapi(getStartTimeRoute, async (c) => {
    const row = await availabilityService.getStartTimeById(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Availability start time not found" }, 404)
  })
  .openapi(updateStartTimeRoute, async (c) => {
    const row = await availabilityService.updateStartTime(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Availability start time not found" }, 404)
  })
  .openapi(deleteStartTimeRoute, async (c) => {
    const row = await availabilityService.deleteStartTime(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Availability start time not found" }, 404)
  })

// --- slots ------------------------------------------------------------------

const listSlotsRoute = createRoute({
  method: "get",
  path: "/slots",
  request: { query: availabilitySlotListQuerySchema },
  responses: {
    200: {
      description: "Paginated availability slots (departures)",
      content: {
        "application/json": { schema: listResponseSchema(availabilitySlotListRowSchema) },
      },
    },
  },
})

const createSlotRoute = createRoute({
  method: "post",
  path: "/slots",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertAvailabilitySlotSchema } },
    },
  },
  responses: {
    201: {
      description: "The created slot",
      content: { "application/json": { schema: z.object({ data: availabilitySlotSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchUpdateSlotsRoute = createRoute({
  method: "post",
  path: "/slots/batch-update",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: batchUpdateAvailabilitySlotSchema } },
    },
  },
  responses: {
    200: {
      description: "Per-id batch-update results (missing ids reported under `failed`)",
      content: {
        "application/json": { schema: batchUpdateResponseSchema(availabilitySlotSchema) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchDeleteSlotsRoute = createRoute({
  method: "post",
  path: "/slots/batch-delete",
  request: {
    body: { required: true, content: { "application/json": { schema: batchIdsSchema } } },
  },
  responses: {
    200: {
      description: "Per-id batch-delete results (missing ids reported under `failed`)",
      content: { "application/json": { schema: batchDeleteResponseSchema } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getSlotRoute = createRoute({
  method: "get",
  path: "/slots/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A slot by id",
      content: { "application/json": { schema: z.object({ data: availabilitySlotSchema }) } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getSlotUnitAvailabilityRoute = createRoute({
  method: "get",
  path: "/slots/{id}/unit-availability",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Per-option-unit availability for the slot",
      content: {
        "application/json": { schema: z.object({ data: z.array(slotUnitAvailabilitySchema) }) },
      },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getDepartureSummaryRoute = createRoute({
  method: "get",
  path: "/slots/{id}/summary",
  description:
    "One bounded envelope for an operated Departure: slot + Product Version " +
    "identity, capacity counters (holds, allocations, travelers, resources), " +
    "booking quantities and settlement, typed attention issues, the extras " +
    "rollup, and Finance's headline P&L. Composes existing truths — Finance " +
    "remains the monetary authority and money is null when it is not deployed. " +
    "Every counter is whole-departure, so paging the allocation manifest never " +
    "changes a figure here.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "The departure summary",
      content: { "application/json": { schema: z.object({ data: departureSummarySchema }) } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateSlotRoute = createRoute({
  method: "patch",
  path: "/slots/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAvailabilitySlotSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated slot",
      content: { "application/json": { schema: z.object({ data: availabilitySlotSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteSlotRoute = createRoute({
  method: "delete",
  path: "/slots/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Slot deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const slotRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listSlotsRoute, async (c) =>
    c.json(await availabilityService.listSlots(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createSlotRoute, async (c) => {
    const row = await availabilityService.createSlot(c.get("db"), c.req.valid("json"), {
      eventBus: c.get("eventBus"),
    })
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateSlotsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: availabilityService.updateSlot,
      }),
      200,
    )
  })
  .openapi(batchDeleteSlotsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: availabilityService.deleteSlot,
      }),
      200,
    )
  })
  .openapi(getSlotRoute, async (c) => {
    const row = await availabilityService.getSlotById(c.get("db"), c.req.valid("param").id)
    return row ? c.json({ data: row }, 200) : c.json({ error: "Availability slot not found" }, 404)
  })
  .openapi(getSlotUnitAvailabilityRoute, async (c) => {
    const rows = await availabilityService.getSlotUnitAvailability(
      c.get("db"),
      c.req.valid("param").id,
    )
    return rows
      ? c.json({ data: rows }, 200)
      : c.json({ error: "Availability slot not found" }, 404)
  })
  .openapi(getDepartureSummaryRoute, async (c) => {
    const summary = await availabilityService.getDepartureSummary(
      c.get("db"),
      c.req.valid("param").id,
    )
    return summary
      ? c.json({ data: summary }, 200)
      : c.json({ error: "Availability slot not found" }, 404)
  })
  .openapi(updateSlotRoute, async (c) => {
    const row = await availabilityService.updateSlot(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
      { eventBus: c.get("eventBus"), source: "manual" },
    )
    return row ? c.json({ data: row }, 200) : c.json({ error: "Availability slot not found" }, 404)
  })
  .openapi(deleteSlotRoute, async (c) => {
    const row = await availabilityService.deleteSlot(c.get("db"), c.req.valid("param").id, {
      eventBus: c.get("eventBus"),
    })
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Availability slot not found" }, 404)
  })

// --- closeouts --------------------------------------------------------------

const listCloseoutsRoute = createRoute({
  method: "get",
  path: "/closeouts",
  request: { query: availabilityCloseoutListQuerySchema },
  responses: {
    200: {
      description: "Paginated availability closeouts",
      content: {
        // `listCloseouts` left-joins `products` for the display name, so list
        // rows carry a `productName` the single-closeout schema omits.
        "application/json": {
          schema: listResponseSchema(
            availabilityCloseoutSchema.extend({ productName: z.string().nullable() }),
          ),
        },
      },
    },
  },
})

const createCloseoutRoute = createRoute({
  method: "post",
  path: "/closeouts",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: insertAvailabilityCloseoutSchema } },
    },
  },
  responses: {
    201: {
      description: "The created closeout",
      content: { "application/json": { schema: z.object({ data: availabilityCloseoutSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchUpdateCloseoutsRoute = createRoute({
  method: "post",
  path: "/closeouts/batch-update",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: batchUpdateAvailabilityCloseoutSchema } },
    },
  },
  responses: {
    200: {
      description: "Per-id batch-update results (missing ids reported under `failed`)",
      content: {
        "application/json": { schema: batchUpdateResponseSchema(availabilityCloseoutSchema) },
      },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const batchDeleteCloseoutsRoute = createRoute({
  method: "post",
  path: "/closeouts/batch-delete",
  request: {
    body: { required: true, content: { "application/json": { schema: batchIdsSchema } } },
  },
  responses: {
    200: {
      description: "Per-id batch-delete results (missing ids reported under `failed`)",
      content: { "application/json": { schema: batchDeleteResponseSchema } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const getCloseoutRoute = createRoute({
  method: "get",
  path: "/closeouts/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A closeout by id",
      content: { "application/json": { schema: z.object({ data: availabilityCloseoutSchema }) } },
    },
    404: {
      description: "Availability closeout not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const updateCloseoutRoute = createRoute({
  method: "patch",
  path: "/closeouts/{id}",
  request: {
    params: idParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: updateAvailabilityCloseoutSchema } },
    },
  },
  responses: {
    200: {
      description: "The updated closeout",
      content: { "application/json": { schema: z.object({ data: availabilityCloseoutSchema }) } },
    },
    400: {
      description: "invalid_request: request body failed validation",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Availability closeout not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const deleteCloseoutRoute = createRoute({
  method: "delete",
  path: "/closeouts/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Closeout deleted",
      content: { "application/json": { schema: successResponseSchema } },
    },
    404: {
      description: "Availability closeout not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const closeoutRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listCloseoutsRoute, async (c) =>
    c.json(await availabilityService.listCloseouts(c.get("db"), c.req.valid("query")), 200),
  )
  .openapi(createCloseoutRoute, async (c) => {
    const row = await availabilityService.createCloseout(c.get("db"), c.req.valid("json"))
    return c.json({ data: row! }, 201)
  })
  .openapi(batchUpdateCloseoutsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchUpdate({
        db: c.get("db"),
        ids: body.ids,
        patch: body.patch,
        update: availabilityService.updateCloseout,
      }),
      200,
    )
  })
  .openapi(batchDeleteCloseoutsRoute, async (c) => {
    const body = c.req.valid("json")
    return c.json(
      await handleBatchDelete({
        db: c.get("db"),
        ids: body.ids,
        remove: availabilityService.deleteCloseout,
      }),
      200,
    )
  })
  .openapi(getCloseoutRoute, async (c) => {
    const row = await availabilityService.getCloseoutById(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Availability closeout not found" }, 404)
  })
  .openapi(updateCloseoutRoute, async (c) => {
    const row = await availabilityService.updateCloseout(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("json"),
    )
    return row
      ? c.json({ data: row }, 200)
      : c.json({ error: "Availability closeout not found" }, 404)
  })
  .openapi(deleteCloseoutRoute, async (c) => {
    const row = await availabilityService.deleteCloseout(c.get("db"), c.req.valid("param").id)
    return row
      ? c.json({ success: true } as const, 200)
      : c.json({ error: "Availability closeout not found" }, 404)
  })

/**
 * Compose the per-resource sub-chains onto a single `OpenAPIHono` so the
 * `.openapi()` operations propagate up through the parent availability
 * registries (`OpenAPIHono.route` copies the sub-app's registered routes).
 */
export const availabilityCoreRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})
  .route("/", dashboardRoutes)
  .route("/", ruleRoutes)
  .route("/", startTimeRoutes)
  .route("/", slotRoutes)
  .route("/", closeoutRoutes)
