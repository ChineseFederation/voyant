/**
 * Departure-planning allocation routes: attaching a fleet `resources` record to
 * a departure, placing a whole set of travelers atomically, previewing an
 * auto-allocation before it writes, and the server-side conflicts projection.
 *
 * Its own `OpenAPIHono` sub-chain composed onto `availabilityAllocationRoutes`,
 * per the per-family pattern documented in `routes-allocation.ts`.
 *
 * ## Retry safety
 *
 * Every mutating leg here mounts the framework's `Idempotency-Key` middleware.
 * A retried `POST` with the same key replays the stored response instead of
 * re-running the command — which is what a dropped connection on auto-allocate
 * needs, because re-planning a departure that has since been half-assigned is
 * not the same operation twice. The header stays optional so existing clients
 * keep working; supplying it is what buys the guarantee.
 *
 * Every mutating leg also appends an action-ledger mutation entry, so a
 * departure's fleet and seating changes are visible in the same admission trail
 * as every other operator command, alongside the domain-specific
 * `allocation_audit_log` row the services write inside their transaction.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  type ActionLedgerRequestContextValues,
  appendActionLedgerMutation,
} from "@voyant-travel/action-ledger"
import { idempotencyKey, openApiValidationHook } from "@voyant-travel/hono"
import type { Context } from "hono"

import {
  allocationErrorResponses,
  allocationResourceSchema,
  errorResponseSchema,
  handleAllocationRouteError,
  slotIdParamSchema,
} from "./routes-allocation-shared.js"
import type { Env } from "./routes-shared.js"
import { assignTravelerAllocationsBatch } from "./service-allocation-assignment-batch.js"
import { previewAutoAllocateSlotResources } from "./service-allocation-automation.js"
import { getSlotAllocationConflicts } from "./service-allocation-conflicts.js"
import {
  attachDepartureResource,
  detachDepartureResource,
  listDepartureResourceLinks,
} from "./service-allocation-resource-link.js"
import {
  allocationKindQuerySchema,
  attachDepartureResourceSchema,
  batchAssignTravelerAllocationsSchema,
  detachDepartureResourceQuerySchema,
} from "./validation.js"

const fleetResourceParamSchema = z.object({ id: z.string(), fleetResourceId: z.string() })

const departureResourceLinkSchema = z.object({
  resource: allocationResourceSchema,
  assignmentId: z.string(),
  created: z.boolean(),
})

const allocationConflictSchema = z.object({
  code: z.string(),
  severity: z.enum(["critical", "warning"]),
  kind: z.string(),
  subjectType: z.enum(["traveler", "allocation_resource", "sharing_group", "departure"]),
  subjectId: z.string(),
  count: z.number().int(),
  travelerIds: z.array(z.string()),
  resourceIds: z.array(z.string()),
  message: z.string(),
})

/** A group the planner could not place, or could only place by compromising. */
const allocationUnplacedGroupSchema = z.object({
  groupKey: z.string(),
  sharingGroupId: z.string().nullable(),
  travelerIds: z.array(z.string()),
  reason: z.enum(["no_resources", "no_capacity"]),
  largestFreeCapacity: z.number().int(),
})

const allocationCompromiseSchema = z.object({
  groupKey: z.string(),
  sharingGroupId: z.string().nullable(),
  travelerIds: z.array(z.string()),
  resourceId: z.string(),
  relaxed: z.array(
    z.enum(["bed_preference", "room_type", "option", "option_unit", "age_band", "accessibility"]),
  ),
})

const allocationPlanPreviewSchema = z.object({
  kind: z.string(),
  assigned: z.number().int(),
  skipped: z.number().int(),
  unplaced: z.array(allocationUnplacedGroupSchema),
  compromises: z.array(allocationCompromiseSchema),
  entries: z.array(
    z.object({
      travelerId: z.string(),
      travelerName: z.string(),
      bookingId: z.string(),
      bookingNumber: z.string(),
      sharingGroupId: z.string().nullable(),
      resourceId: z.string(),
      resourceLabel: z.string().nullable(),
      currentResourceId: z.string().nullable(),
      unchanged: z.boolean(),
    }),
  ),
  violations: z.array(
    z.object({
      slotId: z.string(),
      resourceId: z.string(),
      kind: z.string(),
      capacity: z.number().int(),
      existingAssigned: z.number().int(),
      requested: z.number().int(),
    }),
  ),
})

const batchAssignResultSchema = z.object({
  kind: z.string(),
  assigned: z.number().int(),
  unassigned: z.number().int(),
  unchanged: z.number().int(),
  travelerIds: z.array(z.string()),
  /**
   * Room constraints the accepted batch leaves behind. Blocking ones only
   * appear here when the caller supplied an `override.reason`; without one the
   * leg answers 409 with the same payload under `detail.violations`.
   */
  violations: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["blocking", "advisory"]),
      message: z.string(),
      expected: z.union([z.string(), z.number()]).nullable().optional(),
      actual: z.union([z.string(), z.number()]).nullable().optional(),
      travelerIds: z.array(z.string()).optional(),
    }),
  ),
})

// --- route definitions ------------------------------------------------------

const listFleetResourcesRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation/fleet-resources",
  description:
    "Fleet `resources` records attached to this departure — the `allocation_resources` " +
    "rows whose `refType` is `resource`.",
  request: { params: slotIdParamSchema },
  responses: {
    200: {
      description: "The departure's attached fleet resources",
      content: {
        "application/json": { schema: z.object({ data: z.array(allocationResourceSchema) }) },
      },
    },
  },
})

const attachFleetResourceRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/fleet-resources",
  description:
    "Attach a fleet `resources` record (a coach, a boat, a room) to this departure. " +
    "Writes the departure's `allocation_resources` container and the cross-departure " +
    "`resource_slot_assignments` commitment in one transaction, adopting an existing " +
    "live assignment rather than duplicating it. Rejects a resource already committed " +
    "to an overlapping departure. Re-attaching the same resource is a no-op.",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: attachDepartureResourceSchema } },
    },
  },
  responses: {
    201: {
      description: "The attached resource and its fleet commitment",
      content: { "application/json": { schema: z.object({ data: departureResourceLinkSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const detachFleetResourceRoute = createRoute({
  method: "delete",
  path: "/slots/{id}/allocation/fleet-resources/{fleetResourceId}",
  description:
    "Detach a fleet resource from this departure: remove its container (and, with " +
    "`cascade`, its seats), clear the traveler allocations that pointed at them, and " +
    "release the fleet commitment.",
  request: { params: fleetResourceParamSchema, query: detachDepartureResourceQuerySchema },
  responses: {
    200: {
      description: "The removed allocation resources and the released assignment",
      content: {
        "application/json": {
          schema: z.object({
            data: z.object({
              removedResourceIds: z.array(z.string()),
              assignmentId: z.string().nullable(),
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

const batchAssignRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/travelers/assignments",
  description:
    "Place a set of travelers in one transaction. Either every assignment lands or " +
    "none does, so a sharing group can never end up half-placed. Per-traveler " +
    "`expectedResourceId` is an optimistic-concurrency precondition.",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: batchAssignTravelerAllocationsSchema } },
    },
  },
  responses: {
    200: {
      description: "Counts of what the batch assigned, unassigned, and left unchanged",
      content: { "application/json": { schema: z.object({ data: batchAssignResultSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const previewAutoAllocateRoute = createRoute({
  method: "post",
  path: "/slots/{id}/allocation/auto-allocate/preview",
  description:
    "Compute the auto-allocation plan without writing it. Returns the traveler→resource " +
    "entries the commit would produce, which of them change anything, and any capacity " +
    "violations the plan would create.",
  request: {
    params: slotIdParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: allocationKindQuerySchema } },
    },
  },
  responses: {
    200: {
      description: "The uncommitted allocation plan",
      content: { "application/json": { schema: z.object({ data: allocationPlanPreviewSchema }) } },
    },
    400: allocationErrorResponses[400],
    404: allocationErrorResponses[404],
    409: allocationErrorResponses[409],
    500: allocationErrorResponses[500],
  },
})

const conflictsRoute = createRoute({
  method: "get",
  path: "/slots/{id}/allocation/conflicts",
  description:
    "The departure's allocation conflicts for one resource kind: unassigned travelers, " +
    "over-capacity and duplicated resources, inaccessible and incompatible placements, " +
    "and oversubscribed or split sharing groups. Codes are stable; the UI, the CSV " +
    "export and the printed manifest all read this one projection.",
  request: { params: slotIdParamSchema, query: allocationKindQuerySchema },
  responses: {
    200: {
      description: "The departure's allocation conflicts, critical first",
      content: {
        "application/json": { schema: z.object({ data: z.array(allocationConflictSchema) }) },
      },
    },
    404: {
      description: "Availability slot not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// --- ledger plumbing --------------------------------------------------------

const LEDGER_ACTION_VERSION = "v1"

function actionLedgerContext(c: Context<Env>): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: null,
    principalSubtype: null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: null,
    workflowStepId: null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

/**
 * Record the mutation in the action ledger. Best-effort: the departure change
 * has already committed by the time this runs, so a ledger outage must not turn
 * a successful placement into a 500. The transactional
 * `allocation_audit_log` row is the durable domain record.
 */
async function appendAllocationLedgerEntry(
  c: Context<Env>,
  input: { actionName: string; slotId: string; summary: string },
) {
  try {
    await appendActionLedgerMutation(c.get("db"), {
      context: actionLedgerContext(c),
      actionName: input.actionName,
      actionVersion: LEDGER_ACTION_VERSION,
      actionKind: "update",
      evaluatedRisk: "medium",
      targetType: "departure",
      targetId: input.slotId,
      routeOrToolName: `${c.req.method} ${new URL(c.req.url).pathname}`,
      authorizationSource: "operations.route",
      mutationDetail: { summary: input.summary, reversalKind: "none" },
    })
  } catch {
    // Intentional: see the docblock. Logging is the deployment's job.
  }
}

// --- handlers ---------------------------------------------------------------

export const availabilityAllocationPlanningRoutes = new OpenAPIHono<Env>({
  defaultHook: openApiValidationHook,
})

// Retry protection for the mutating legs only; the reads below are naturally
// idempotent and must not consume a key.
availabilityAllocationPlanningRoutes.use(
  "/slots/:id/allocation/fleet-resources",
  idempotencyKey({ scope: "operations.allocation.fleet-resource.attach" }),
)
availabilityAllocationPlanningRoutes.use(
  "/slots/:id/allocation/travelers/assignments",
  idempotencyKey({ scope: "operations.allocation.travelers.assign-batch" }),
)

availabilityAllocationPlanningRoutes
  .openapi(listFleetResourcesRoute, async (c) => {
    const data = await listDepartureResourceLinks(c.get("db"), c.req.valid("param").id)
    return c.json({ data }, 200)
  })
  .openapi(attachFleetResourceRoute, async (c) => {
    try {
      const slotId = c.req.valid("param").id
      const body = c.req.valid("json")
      const data = await attachDepartureResource(c.get("db"), slotId, body, {
        actorId: c.get("userId") ?? null,
      })
      await appendAllocationLedgerEntry(c, {
        actionName: "operations.allocation.fleet-resource.attach",
        slotId,
        summary: data.created
          ? `Attached resource ${body.resourceId} to departure ${slotId}`
          : `Resource ${body.resourceId} was already attached to departure ${slotId}`,
      })
      return c.json({ data }, 201)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(detachFleetResourceRoute, async (c) => {
    try {
      const params = c.req.valid("param")
      const query = c.req.valid("query")
      const data = await detachDepartureResource(c.get("db"), params.id, params.fleetResourceId, {
        actorId: c.get("userId") ?? null,
        ...(query.expectedUpdatedAt !== undefined
          ? { expectedUpdatedAt: query.expectedUpdatedAt }
          : {}),
        ...(query.cascade !== undefined ? { cascade: query.cascade } : {}),
      })
      if (!data) return c.json({ error: "Resource is not attached to this departure" }, 404)
      await appendAllocationLedgerEntry(c, {
        actionName: "operations.allocation.fleet-resource.detach",
        slotId: params.id,
        summary: `Detached resource ${params.fleetResourceId} from departure ${params.id}`,
      })
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(batchAssignRoute, async (c) => {
    try {
      const slotId = c.req.valid("param").id
      const body = c.req.valid("json")
      const data = await assignTravelerAllocationsBatch(c.get("db"), slotId, body, {
        actorId: c.get("userId") ?? null,
      })
      await appendAllocationLedgerEntry(c, {
        actionName: "operations.allocation.travelers.assign-batch",
        slotId,
        summary: `Placed ${data.assigned} and cleared ${data.unassigned} ${body.kind} assignments on departure ${slotId}`,
      })
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(previewAutoAllocateRoute, async (c) => {
    try {
      const data = await previewAutoAllocateSlotResources(
        c.get("db"),
        c.req.valid("param").id,
        c.req.valid("json"),
      )
      return c.json({ data }, 200)
    } catch (error) {
      return handleAllocationRouteError(c, error)
    }
  })
  .openapi(conflictsRoute, async (c) => {
    const data = await getSlotAllocationConflicts(c.get("db"), c.req.valid("param").id, {
      kind: c.req.valid("query").kind,
    })
    return data ? c.json({ data }, 200) : c.json({ error: "Availability slot not found" }, 404)
  })

export type AvailabilityAllocationPlanningRoutes = typeof availabilityAllocationPlanningRoutes
