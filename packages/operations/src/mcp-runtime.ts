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
import { availabilityService } from "./availability/service.js"
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
