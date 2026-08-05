import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger/created-command"
import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger/request-context"
import {
  type BookingActionProjectionRuntime,
  type BookingActionSourceRuntime,
  bookingActionProjectionRuntimePort,
  bookingActionSourceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { EventBus } from "@voyant-travel/core"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { defineToolContextContribution, requireService, ToolError } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"
import { allocationToolErrorCode } from "./allocation-tool-errors.js"
import { availabilityService } from "./availability/service.js"
import {
  type AssignTravelerAllocationsBatchInput,
  assignTravelerAllocationsBatch,
} from "./availability/service-allocation-assignment-batch.js"
import { AllocationServiceError } from "./availability/service-allocation-errors.js"
import {
  type AttachDepartureResourceInput,
  attachDepartureResource,
  type DetachDepartureResourceOptions,
  detachDepartureResource,
  listDepartureResourceLinks,
} from "./availability/service-allocation-resource-link.js"
import {
  type MaterializeFromRoomBlockInput,
  materializeDepartureRoomsFromBlock,
  releaseDepartureRoomBlock,
} from "./availability/service-allocation-room-block.js"
import {
  type UpdateTravelerRoomingPreferencesInput,
  updateTravelerRoomingPreferences,
} from "./availability/service-allocation-traveler-preferences.js"
import { AvailabilitySlotRevisionConflictError } from "./availability/service-core.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["operations"],
  contribute: ({ request, context, resources }) => {
    const c = request as Context<{
      Variables: ActionLedgerRequestContextValues & { eventBus?: EventBus }
    }>
    const db = context.db as Parameters<typeof availabilityService.listSlots>[0]
    const eventBus = c.get("eventBus")
    return {
      operations: {
        async createDeparture(
          input: Parameters<typeof availabilityService.createSlot>[1] & { idempotencyKey?: string },
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const { idempotencyKey: legacyIdempotencyKey, ...commandInput } = input
          admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
          const result = await executeAdmittedCreatedTargetCommand(
            {
              db: db as unknown as AnyDrizzleDb,
              context: actionLedgerContext(c),
              admitted,
              idempotencyKey: legacyIdempotencyKey,
              commandTargetType: "departure-create-command",
              canonicalTargetType: "departure",
              resultReferenceType: "departure",
              commandInput,
              evaluatedRisk: "medium",
            },
            {
              async create(tx) {
                const departure = await availabilityService.createSlot(
                  tx as PostgresJsDatabase,
                  commandInput,
                )
                if (!departure) throw new Error("Departure creation returned no row")
                return { value: departure, targetId: departure.id }
              },
              async replay(tx, completed) {
                return availabilityService.getSlotById(
                  tx as PostgresJsDatabase,
                  completed.reference.id,
                )
              },
            },
          )
          if (result.value) {
            await eventBus?.emit(
              "availability.slot.changed",
              {
                slotId: result.value.id,
                productId: result.value.productId,
                optionId: result.value.optionId ?? null,
                startsAt: result.value.startsAt,
                remainingPax: result.value.unlimited ? null : (result.value.remainingPax ?? null),
                unlimited: result.value.unlimited,
                source: "created",
              },
              { category: "domain", source: "service" },
            )
          }
          return { departure: result.value, replayed: result.replayed }
        },
        async updateDeparture(
          id: string,
          patch: Parameters<typeof availabilityService.updateSlot>[2],
        ) {
          try {
            return await availabilityService.updateSlot(db, id, patch, { eventBus })
          } catch (error) {
            if (error instanceof AvailabilitySlotRevisionConflictError) {
              throw new ToolError(
                "Departure changed after it was read; review the current departure before retrying.",
                "INVALID_INPUT",
                {
                  reason: "revision_conflict",
                  expectedUpdatedAt: error.expectedUpdatedAt,
                  current: jsonSafeValue(error.current),
                },
              )
            }
            throw error
          }
        },
        attachDepartureFleetResource(departureId: string, input: AttachDepartureResourceInput) {
          return withAllocationToolErrors(() =>
            attachDepartureResource(db as PostgresJsDatabase, departureId, input, {
              actorId: c.get("userId") ?? null,
            }),
          )
        },
        async detachDepartureFleetResource(
          departureId: string,
          fleetResourceId: string,
          options: Omit<DetachDepartureResourceOptions, "actorId">,
        ) {
          const detached = await withAllocationToolErrors(() =>
            detachDepartureResource(db as PostgresJsDatabase, departureId, fleetResourceId, {
              actorId: c.get("userId") ?? null,
              ...options,
            }),
          )
          if (!detached) {
            throw new ToolError(
              "That fleet resource is not attached to this departure.",
              "NOT_FOUND",
              { departureId, fleetResourceId },
            )
          }
          return detached
        },
        listDepartureFleetResources: (departureId: string) =>
          listDepartureResourceLinks(db as PostgresJsDatabase, departureId),
        setDepartureTravelerAssignments(
          departureId: string,
          input: AssignTravelerAllocationsBatchInput,
        ) {
          return withAllocationToolErrors(() =>
            assignTravelerAllocationsBatch(db as PostgresJsDatabase, departureId, input, {
              actorId: c.get("userId") ?? null,
            }),
          )
        },
        materializeDepartureRoomBlock(departureId: string, input: MaterializeFromRoomBlockInput) {
          return withAllocationToolErrors(() =>
            materializeDepartureRoomsFromBlock(db as PostgresJsDatabase, departureId, input, {
              actorId: c.get("userId") ?? null,
            }),
          )
        },
        releaseDepartureRoomBlock(
          departureId: string,
          blockId: string,
          options: { kind?: string },
        ) {
          return withAllocationToolErrors(() =>
            releaseDepartureRoomBlock(db as PostgresJsDatabase, departureId, blockId, options, {
              actorId: c.get("userId") ?? null,
            }),
          )
        },
        setDepartureTravelerRoomingPreferences(
          departureId: string,
          travelerId: string,
          input: UpdateTravelerRoomingPreferencesInput,
        ) {
          return withAllocationToolErrors(() =>
            updateTravelerRoomingPreferences(
              db as PostgresJsDatabase,
              departureId,
              travelerId,
              input,
              { actorId: c.get("userId") ?? null },
            ),
          )
        },
        async rebuildBookingActions() {
          const projection = requireService(
            resources[bookingActionProjectionRuntimePort.id] as
              | BookingActionProjectionRuntime
              | undefined,
            bookingActionProjectionRuntimePort.id,
          )
          bookingActionProjectionRuntimePort.test(projection)
          const sourceResource = resources[bookingActionSourceRuntimePort.id]
          const sources = (
            sourceResource === undefined
              ? []
              : Array.isArray(sourceResource)
                ? sourceResource
                : [sourceResource]
          ) as BookingActionSourceRuntime[]
          for (const source of sources) bookingActionSourceRuntimePort.test(source)
          return projection.synchronize(sources, "rebuild")
        },
        getAvailabilityOverview: (
          query: Parameters<typeof availabilityService.getAvailabilityOverview>[1],
        ) => availabilityService.getAvailabilityOverview(db, query),
        getAvailabilityAggregates: (
          query: Parameters<typeof availabilityService.getAvailabilityAggregates>[1],
        ) => availabilityService.getAvailabilityAggregates(db, query),
        listAvailabilityRules: (query: Parameters<typeof availabilityService.listRules>[1]) =>
          availabilityService.listRules(db, query),
        getAvailabilityRule: (id: string) => availabilityService.getRuleById(db, id),
        listAvailabilityStartTimes: (
          query: Parameters<typeof availabilityService.listStartTimes>[1],
        ) => availabilityService.listStartTimes(db, query),
        listDepartures: (query: Parameters<typeof availabilityService.listSlots>[1]) =>
          availabilityService.listSlots(db, query),
        getDeparture: (id: string) => availabilityService.getSlotById(db, id),
        listAvailabilityCloseouts: (
          query: Parameters<typeof availabilityService.listCloseouts>[1],
        ) => availabilityService.listCloseouts(db, query),
      },
    }
  },
})

/**
 * The allocation services signal failure with an HTTP status because their
 * first caller was a route. A Tool caller has no status line to read, so the
 * status becomes the Tool error code and the service's structured `detail` —
 * the conflicting departure, the capacity violations, the travelers whose
 * placement moved — is carried through as `meta` rather than flattened into
 * prose.
 */
async function withAllocationToolErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof AllocationServiceError)) throw error
    throw new ToolError(
      error.message,
      allocationToolErrorCode(error.status),
      {
        status: error.status,
        ...(error.detail === undefined ? {} : { detail: jsonSafeValue(error.detail) }),
      },
      { cause: error },
    )
  }
}

function jsonSafeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(jsonSafeValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonSafeValue(nested)]),
    )
  }
  return value
}

function admittedCreatedCommandIdempotencyKey(
  admitted: ToolHandlerActionPolicyContext,
  legacyIdempotencyKey: string | undefined,
): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
    )
  }
  if (legacyIdempotencyKey !== undefined && legacyIdempotencyKey !== idempotencyKey) {
    throw new ToolError(
      "The legacy top-level idempotency key does not match the admitted Tool invocation.",
      "INVALID_INPUT",
    )
  }
  return idempotencyKey
}

function actionLedgerContext(
  c: Pick<Context, "req"> & { var: object },
): ActionLedgerRequestContextValues {
  const vars = c.var as Record<string, unknown>
  return {
    userId: (vars.userId as string | undefined) ?? null,
    agentId: (vars.agentId as string | undefined) ?? null,
    workflowPrincipalId: (vars.workflowPrincipalId as string | undefined) ?? null,
    principalSubtype: (vars.principalSubtype as string | undefined) ?? null,
    sessionId: (vars.sessionId as string | undefined) ?? null,
    apiTokenId: ((vars.apiTokenId ?? vars.apiKeyId) as string | undefined) ?? null,
    callerType: (vars.callerType as ActionLedgerRequestContextValues["callerType"]) ?? null,
    actor: (vars.actor as ActionLedgerRequestContextValues["actor"]) ?? null,
    isInternalRequest: (vars.isInternalRequest as boolean | undefined) ?? false,
    organizationId: (vars.organizationId as string | undefined) ?? null,
    workflowRunId: (vars.workflowRunId as string | undefined) ?? null,
    workflowStepId: (vars.workflowStepId as string | undefined) ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}
