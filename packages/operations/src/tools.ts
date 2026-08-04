import { bookingActionSyncSummarySchema } from "@voyant-travel/bookings-contracts/booking-actions"
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  attachDepartureResourceSchema,
  availabilityAggregatesQuerySchema,
  availabilityCloseoutListQuerySchema,
  availabilityOverviewQuerySchema,
  availabilityRuleListQuerySchema,
  availabilitySlotCoreSchema,
  availabilitySlotListQuerySchema,
  availabilitySlotStatusSchema,
  availabilityStartTimeListQuerySchema,
  batchAssignTravelerAllocationsSchema,
  detachDepartureResourceQuerySchema,
} from "./availability/validation.js"
import { getOperatorDashboardSummaryDefinition } from "./dashboard-tool.js"
import type { OperationsToolContext, OperationsToolServices } from "./tool-services.js"

export {
  type OperatorDashboardBookingsServices,
  type OperatorDashboardDistributionServices,
  type OperatorDashboardFinanceServices,
  type OperatorDashboardInventoryServices,
  type OperatorDashboardToolContext,
  operatorDashboardSummaryInputSchema,
  operatorDashboardSummaryOutputSchema,
  resolveOperatorDashboardWindow,
} from "./dashboard-tool.js"
export type { OperationsToolContext, OperationsToolServices } from "./tool-services.js"

const OWNER = "@voyant-travel/operations"
const VERSION = "v1"
const REQUIRED_SCOPES = ["operations:read"] as const
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const

export const getOperatorDashboardSummaryTool = defineTool(getOperatorDashboardSummaryDefinition)
export const operationsDashboardTools = [getOperatorDashboardSummaryTool] as const

const idArgsSchema = z.object({ id: z.string().min(1) })
const zonedDateTimeSchema = z.string().datetime({ offset: true })

/**
 * `date` is a hosted-consumer compatibility input. `dateLocal` is canonical.
 * Zoned bounds are normalized before reaching the service's UTC schema.
 */
export const departureListToolInputSchema = availabilitySlotListQuerySchema.extend({
  date: z.string().date().optional(),
  startsAtFrom: zonedDateTimeSchema.optional(),
  startsAtUntil: zonedDateTimeSchema.optional(),
})

const availabilityRuleSchema = z.object({
  id: z.string(),
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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const availabilityRuleListRowSchema = availabilityRuleSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilityStartTimeSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  label: z.string().nullable(),
  startTimeLocal: z.string(),
  durationMinutes: z.number().int().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const availabilityStartTimeListRowSchema = availabilityStartTimeSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilitySlotBaseSchema = z.object({
  id: z.string(),
  productId: z.string(),
  itineraryId: z.string().nullable(),
  optionId: z.string().nullable(),
  facilityId: z.string().nullable(),
  availabilityRuleId: z.string().nullable(),
  startTimeId: z.string().nullable(),
  dateLocal: z.string().date(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
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
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const availabilitySlotSchema = availabilitySlotBaseSchema.extend({
  endDateLocal: z.string().date().nullable(),
})

const availabilitySlotListRowSchema = availabilitySlotSchema.extend({
  productName: z.string().nullable().optional(),
})

const availabilityCloseoutSchema = z.object({
  id: z.string(),
  productId: z.string(),
  slotId: z.string().nullable(),
  dateLocal: z.string().date(),
  reason: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string().datetime(),
})

const availabilityAggregatesSchema = z.object({
  total: z.number().int(),
  countsByStatus: z.array(
    z.object({ status: availabilitySlotStatusSchema, count: z.number().int() }),
  ),
  upcomingSlots: z.number().int(),
  upcomingPax: z.number().int(),
  monthlyDepartures: z.array(
    z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/), count: z.number().int() }),
  ),
})

const availabilityOverviewSchema = z.object({
  openSlotsCount: z.number().int(),
  constrainedSlotsCount: z.number().int(),
  activeRulesCount: z.number().int(),
  activePickupPointsCount: z.number().int(),
  productsWithoutUpcomingDeparturesCount: z.number().int(),
  productsWithoutUpcomingDepartures: z.array(z.object({ id: z.string(), name: z.string() })),
  constrainedSlots: z.array(
    availabilitySlotBaseSchema.extend({ productName: z.string().nullable() }),
  ),
})

/**
 * One `allocation_resources` container the departure operates. `id` is the
 * departure-scoped container (`alrs_*`); `refId` is the fleet `resources` record
 * (`res_*`) it stands for, which is what `detach_departure_fleet_resource`
 * takes.
 */
const departureFleetResourceSchema = z.object({
  id: z.string(),
  slotId: z.string(),
  kind: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  label: z.string().nullable(),
  capacity: z.number().int(),
  flags: z.record(z.string(), z.unknown()),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

const departureFleetResourceListOutputSchema = z.object({
  resources: z.array(departureFleetResourceSchema),
})

const attachDepartureFleetResourceOutputSchema = z.object({
  resource: departureFleetResourceSchema,
  assignmentId: z.string(),
  created: z.boolean(),
})

const detachDepartureFleetResourceOutputSchema = z.object({
  removedResourceIds: z.array(z.string()),
  assignmentId: z.string().nullable(),
})

const departureTravelerAssignmentsOutputSchema = z.object({
  kind: z.string(),
  assigned: z.number().int(),
  unassigned: z.number().int(),
  unchanged: z.number().int(),
  travelerIds: z.array(z.string()),
})

const availabilityRuleListOutputSchema = listResponseSchema(availabilityRuleListRowSchema)
const availabilityRuleOutputSchema = z.object({ rule: availabilityRuleSchema.nullable() })
const availabilityStartTimeListOutputSchema = listResponseSchema(availabilityStartTimeListRowSchema)
const departureListOutputSchema = listResponseSchema(availabilitySlotListRowSchema)
const departureOutputSchema = z.object({ departure: availabilitySlotSchema.nullable() })
const availabilityCloseoutListOutputSchema = listResponseSchema(availabilityCloseoutSchema)

type RuleListQuery = z.infer<typeof availabilityRuleListQuerySchema>
type StartTimeListQuery = z.infer<typeof availabilityStartTimeListQuerySchema>
type CloseoutListQuery = z.infer<typeof availabilityCloseoutListQuerySchema>
type AggregatesQuery = z.infer<typeof availabilityAggregatesQuerySchema>
type OverviewQuery = z.infer<typeof availabilityOverviewQuerySchema>

function operations(ctx: OperationsToolContext): OperationsToolServices {
  return requireService(ctx.operations, "operations")
}

const commonMetadata = {
  owner: OWNER,
  capabilityVersion: VERSION,
  requiredScopes: REQUIRED_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "read" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { idempotentHint: true },
}

const WRITE_SCOPES = ["operations:write"] as const

/**
 * Departures are the difference between a product that exists and a product
 * that can be sold. Existing departures are reversible because a wrong date
 * is edited or closed out; creation itself is recorded as an irreversible,
 * idempotent created-target command. Everything lands in the action ledger.
 */
const DEPARTURE_WRITE_RISK = {
  destructive: false,
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const

/**
 * Detaching is the one departure-planning write that removes rows. It deletes
 * the departure's container for the coach — with `cascade`, its seats too — and
 * clears every traveler allocation that pointed at them. Re-attaching brings the
 * coach back but not the seating plan, so it is irreversible in the way that
 * matters to an operator.
 */
const DEPARTURE_FLEET_DETACH_RISK = {
  destructive: true,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write", "data-delete"],
} as const

const BOOKING_ACTION_REBUILD_RISK = {
  destructive: false,
  reversible: false,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const

export const CREATE_DEPARTURE_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.create-departure`,
  capabilityVersion: VERSION,
  canonicalName: "create_departure",
  actionPolicy: {
    id: `${OWNER}#action.create-departure`,
    capabilityId: `${OWNER}#action.create-departure`,
    version: VERSION,
    kind: "execute",
    targetType: "departure",
    targetLifecycle: "created",
    createdTarget: {
      commandTargetType: "departure-create-command",
      resultReferenceType: "departure",
      durability: "handler-command-claim-v1",
      parentAnchor: { targetType: "product", targetIdField: "productId" },
    },
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: false,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

const createDepartureArgs = availabilitySlotCoreSchema
  .extend({
    idempotencyKey: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe("Stable retry key. Must match the admitted Tool invocation idempotency key."),
  })
  .strict()

// Preserve the original update Tool contract: callers commonly round-trip a
// get_departure snapshot, so known compatibility fields remain accepted and
// unrelated output metadata is stripped by Zod's default object behavior.
// updatedAt is retained as an optional revision; the service owns remainingPax
// and product ownership enforcement.
const updateDepartureArgs = availabilitySlotCoreSchema.partial().extend({
  id: z.string().min(1).describe("The departure id (`avsl_*`) to update."),
  updatedAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      "Optional revision from get_departure/list_departures. Stale full snapshots are rejected with the current departure.",
    ),
})

export const createDepartureTool = defineTool<
  z.infer<typeof createDepartureArgs>,
  { departure: z.infer<typeof availabilitySlotSchema> | null; replayed: boolean },
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.create-departure`,
  name: "create_departure",
  description:
    "Create one dated departure on a product so it can be sold. `compose_product` deliberately does not create departures, so a newly composed product has none until this runs. Repeat it per date for a recurring schedule (one call per Saturday, for instance). Requires the product's `timezone`; `startsAt` is an ISO datetime with offset.",
  inputSchema: createDepartureArgs,
  outputSchema: departureOutputSchema.extend({ replayed: z.boolean() }),
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: { ...DEPARTURE_WRITE_RISK, reversible: false },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, CREATE_DEPARTURE_HANDLER_POLICY)
    return parseJsonResult(
      departureOutputSchema.extend({ replayed: z.boolean() }),
      await operations(ctx).createDeparture(input, admitted),
    )
  },
})

export const updateDepartureTool = defineTool<
  z.infer<typeof updateDepartureArgs>,
  { departure: z.infer<typeof availabilitySlotSchema> | null },
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.update-departure`,
  name: "update_departure",
  description:
    "Update an existing departure — its capacity, status (open/closed/cancelled), times, or notes. Use `list_departures` first to resolve the departure id. Reducing capacity below what is already booked is rejected.",
  inputSchema: updateDepartureArgs,
  outputSchema: departureOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: DEPARTURE_WRITE_RISK,
  async handler({ id, ...patch }, ctx) {
    return parseJsonResult(departureOutputSchema, {
      departure: await operations(ctx).updateDeparture(id, patch),
    })
  },
})

const departureIdArgSchema = z
  .string()
  .min(1)
  .describe("The departure id (`avsl_*`) whose plan is being changed.")

// The HTTP legs carry the departure in the path and the rest in the body or
// query string; a Tool has one flat argument object, so `departureId` is the
// only field added to the route's own validation schemas.
const attachDepartureFleetResourceArgs = attachDepartureResourceSchema.extend({
  departureId: departureIdArgSchema,
})

const detachDepartureFleetResourceArgs = detachDepartureResourceQuerySchema.extend({
  departureId: departureIdArgSchema,
  fleetResourceId: z
    .string()
    .min(1)
    .describe(
      "The fleet resource id (`res_*`) to detach — the `refId` reported by " +
        "`list_departure_fleet_resources`, not the departure container's own `alrs_*` id.",
    ),
  // The HTTP leg reads `cascade` from the query string, so its schema accepts
  // only `"true"`/`"false"`. A Tool caller sends a real boolean.
  cascade: z
    .boolean()
    .optional()
    .describe(
      "Detach the resource's children too (a coach's seats). Without it a resource that has " +
        "been laid out is refused.",
    ),
})

const setDepartureTravelerAssignmentsArgs = batchAssignTravelerAllocationsSchema.extend({
  departureId: departureIdArgSchema,
})

export const attachDepartureFleetResourceTool = defineTool<
  z.infer<typeof attachDepartureFleetResourceArgs>,
  z.infer<typeof attachDepartureFleetResourceOutputSchema>,
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.attach-departure-fleet-resource`,
  name: "attach_departure_fleet_resource",
  description:
    "Attach a fleet resource — the coach, boat, or room that operates this departure — so " +
    "travelers can be placed in it. `kind` and `capacity` default from the fleet record; supply " +
    "them for a resource that declares neither. A resource already committed to an overlapping " +
    "departure is rejected, and re-attaching the same resource returns the existing link with " +
    "`created: false` rather than duplicating it.",
  inputSchema: attachDepartureFleetResourceArgs,
  outputSchema: attachDepartureFleetResourceOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: DEPARTURE_WRITE_RISK,
  annotations: { idempotentHint: true },
  async handler({ departureId, ...input }, ctx) {
    return parseJsonResult(
      attachDepartureFleetResourceOutputSchema,
      await operations(ctx).attachDepartureFleetResource(departureId, input),
    )
  },
})

export const detachDepartureFleetResourceTool = defineTool<
  z.infer<typeof detachDepartureFleetResourceArgs>,
  z.infer<typeof detachDepartureFleetResourceOutputSchema>,
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.detach-departure-fleet-resource`,
  name: "detach_departure_fleet_resource",
  description:
    "Detach a fleet resource from a departure: remove the departure's container for it, clear " +
    "the traveler placements that pointed at it, and release the fleet commitment so the " +
    "resource is free for another departure. Pass `expectedUpdatedAt` from " +
    "`list_departure_fleet_resources` to be rejected rather than overwrite a container someone " +
    "else has since reconfigured.",
  inputSchema: detachDepartureFleetResourceArgs,
  outputSchema: detachDepartureFleetResourceOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "destructive",
  riskPolicy: DEPARTURE_FLEET_DETACH_RISK,
  async handler({ departureId, fleetResourceId, ...options }, ctx) {
    return parseJsonResult(
      detachDepartureFleetResourceOutputSchema,
      await operations(ctx).detachDepartureFleetResource(departureId, fleetResourceId, options),
    )
  },
})

export const setDepartureTravelerAssignmentsTool = defineTool<
  z.infer<typeof setDepartureTravelerAssignmentsArgs>,
  z.infer<typeof departureTravelerAssignmentsOutputSchema>,
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.set-departure-traveler-assignments`,
  name: "set_departure_traveler_assignments",
  description:
    "Place a set of travelers on a departure in one transaction — either every assignment lands " +
    "or none does, so a family or sharing group can never end up half-placed. Set a traveler's " +
    "`resourceId` to the departure container (`alrs_*`) they should occupy, or to null to clear " +
    "their placement for this `kind`. Because vehicles are parent resources, a `vehicle` batch " +
    "may only clear placements; assign travelers to `vehicle_seat` resources instead. Per " +
    "traveler, `expectedResourceId` rejects the whole batch if that traveler has moved since it " +
    "was read.",
  inputSchema: setDepartureTravelerAssignmentsArgs,
  outputSchema: departureTravelerAssignmentsOutputSchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: DEPARTURE_WRITE_RISK,
  async handler({ departureId, ...input }, ctx) {
    return parseJsonResult(
      departureTravelerAssignmentsOutputSchema,
      await operations(ctx).setDepartureTravelerAssignments(departureId, input),
    )
  },
})

export const rebuildBookingActionsTool = defineTool<
  Record<string, never>,
  z.infer<typeof bookingActionSyncSummarySchema>,
  OperationsToolContext
>({
  owner: OWNER,
  capabilityVersion: VERSION,
  capabilityId: `${OWNER}#tool.rebuild-booking-actions`,
  name: "rebuild_booking_actions",
  description:
    "Deterministically rebuild the Booking action projection from the currently selected Catalog, Finance, and Legal source providers. Use this only for reconciliation or repair; ordinary projection refreshes are scheduled automatically.",
  inputSchema: z.object({}).strict(),
  outputSchema: bookingActionSyncSummarySchema,
  requiredScopes: WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: BOOKING_ACTION_REBUILD_RISK,
  annotations: { idempotentHint: true },
  async handler(_input, ctx) {
    return bookingActionSyncSummarySchema.parse(await operations(ctx).rebuildBookingActions())
  },
})

export const getAvailabilityOverviewTool = defineTool<
  OverviewQuery,
  z.infer<typeof availabilityOverviewSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.get-availability-overview`,
  name: "get_availability_overview",
  description:
    "Summarize upcoming availability: open and constrained departures, active recurrence " +
    "rules and pickup points, products missing future departures, and the next constrained slots.",
  inputSchema: availabilityOverviewQuerySchema,
  outputSchema: availabilityOverviewSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      availabilityOverviewSchema,
      await operations(ctx).getAvailabilityOverview(query),
    )
  },
})

export const getAvailabilityAggregatesTool = defineTool<
  AggregatesQuery,
  z.infer<typeof availabilityAggregatesSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.get-availability-aggregates`,
  name: "get_availability_aggregates",
  description:
    "Read availability dashboard KPIs for an optional departure window: totals by status, " +
    "upcoming sellable departures and capacity, and monthly departure counts.",
  inputSchema: availabilityAggregatesQuerySchema,
  outputSchema: availabilityAggregatesSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      availabilityAggregatesSchema,
      await operations(ctx).getAvailabilityAggregates(query),
    )
  },
})

export const listAvailabilityRulesTool = defineTool<
  RuleListQuery,
  z.infer<typeof availabilityRuleListOutputSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.list-availability-rules`,
  name: "list_availability_rules",
  description:
    "List recurrence rules that generate departures, filtered by product, option, facility, or active status.",
  inputSchema: availabilityRuleListQuerySchema,
  outputSchema: availabilityRuleListOutputSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      availabilityRuleListOutputSchema,
      await operations(ctx).listAvailabilityRules(query),
    )
  },
})

export const getAvailabilityRuleTool = defineTool<
  z.infer<typeof idArgsSchema>,
  { rule: z.infer<typeof availabilityRuleSchema> | null },
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.get-availability-rule`,
  name: "get_availability_rule",
  description: "Read one availability recurrence rule by id. Returns null when not found.",
  inputSchema: idArgsSchema,
  outputSchema: availabilityRuleOutputSchema,
  async handler({ id }, ctx) {
    return parseJsonResult(availabilityRuleOutputSchema, {
      rule: await operations(ctx).getAvailabilityRule(id),
    })
  },
})

export const listAvailabilityStartTimesTool = defineTool<
  StartTimeListQuery,
  z.infer<typeof availabilityStartTimeListOutputSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.list-availability-start-times`,
  name: "list_availability_start_times",
  description:
    "List configured local departure start times, filtered by product, option, facility, or active status.",
  inputSchema: availabilityStartTimeListQuerySchema,
  outputSchema: availabilityStartTimeListOutputSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      availabilityStartTimeListOutputSchema,
      await operations(ctx).listAvailabilityStartTimes(query),
    )
  },
})

export const listDeparturesTool = defineTool<
  z.infer<typeof departureListToolInputSchema>,
  z.infer<typeof departureListOutputSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.list-departures`,
  name: "list_departures",
  description:
    "List departures across the catalog or for one product, with local date, start window, " +
    "status, remaining capacity, product name, and pagination. Results are ordered by start time.",
  inputSchema: departureListToolInputSchema,
  outputSchema: departureListOutputSchema,
  async handler(args, ctx) {
    const { date, startsAtFrom, startsAtUntil, ...query } = args
    return parseJsonResult(
      departureListOutputSchema,
      await operations(ctx).listDepartures({
        ...query,
        dateLocal: query.dateLocal ?? date,
        startsAtFrom: toUtc(startsAtFrom),
        startsAtUntil: toUtc(startsAtUntil),
      }),
    )
  },
})

export const getDepartureTool = defineTool<
  z.infer<typeof idArgsSchema>,
  { departure: z.infer<typeof availabilitySlotSchema> | null },
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.get-departure`,
  name: "get_departure",
  description:
    "Read one departure by id, including status, timing, remaining capacity, and local end date. Returns null when not found.",
  inputSchema: idArgsSchema,
  outputSchema: departureOutputSchema,
  async handler({ id }, ctx) {
    return parseJsonResult(departureOutputSchema, {
      departure: await operations(ctx).getDeparture(id),
    })
  },
})

export const listDepartureFleetResourcesTool = defineTool<
  { departureId: string },
  z.infer<typeof departureFleetResourceListOutputSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.list-departure-fleet-resources`,
  name: "list_departure_fleet_resources",
  description:
    "List the fleet resources attached to one departure — the coaches, boats, and rooms it " +
    "operates — with the capacity travelers are placed against. Read this to resolve the " +
    "`refId` that `detach_departure_fleet_resource` takes and the container ids " +
    "`set_departure_traveler_assignments` places travelers into.",
  inputSchema: z.object({ departureId: departureIdArgSchema }),
  outputSchema: departureFleetResourceListOutputSchema,
  async handler({ departureId }, ctx) {
    return parseJsonResult(departureFleetResourceListOutputSchema, {
      resources: await operations(ctx).listDepartureFleetResources(departureId),
    })
  },
})

export const listAvailabilityCloseoutsTool = defineTool<
  CloseoutListQuery,
  z.infer<typeof availabilityCloseoutListOutputSchema>,
  OperationsToolContext
>({
  ...commonMetadata,
  capabilityId: `${OWNER}#tool.list-availability-closeouts`,
  name: "list_availability_closeouts",
  description:
    "List product/date or departure-specific closeouts, filtered by product, departure, or local date.",
  inputSchema: availabilityCloseoutListQuerySchema,
  outputSchema: availabilityCloseoutListOutputSchema,
  async handler(query, ctx) {
    return parseJsonResult(
      availabilityCloseoutListOutputSchema,
      await operations(ctx).listAvailabilityCloseouts(query),
    )
  },
})

export const operationsWriteTools = [
  createDepartureTool,
  updateDepartureTool,
  attachDepartureFleetResourceTool,
  detachDepartureFleetResourceTool,
  setDepartureTravelerAssignmentsTool,
  rebuildBookingActionsTool,
] as const

export const operationsTools = [
  getAvailabilityOverviewTool,
  getAvailabilityAggregatesTool,
  listAvailabilityRulesTool,
  getAvailabilityRuleTool,
  listAvailabilityStartTimesTool,
  listDeparturesTool,
  getDepartureTool,
  listDepartureFleetResourcesTool,
  listAvailabilityCloseoutsTool,
] as const

function toUtc(value: string | undefined): string | undefined {
  return value ? new Date(value).toISOString() : undefined
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
