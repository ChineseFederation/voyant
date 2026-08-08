import { executeAdmittedExistingTargetCommand } from "@voyant-travel/action-ledger"
import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger/created-command"
import {
  type ActionLedgerRequestContextValues,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger/request-context"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { defineToolContextContribution, requireService } from "@voyant-travel/tools"
import type { Context } from "hono"
import {
  type DurableTripActionRuntime,
  durableTripActionRuntimePort,
} from "./durable-action-runtime-port.js"
import { tripsService } from "./service.js"
import {
  executeDurableTripActionCommand,
  getTripActionOperation,
} from "./service-durable-actions.js"
import {
  executeDurableTripRequirementSourcingCommand,
  getTripRequirementSourcingOperation,
} from "./service-durable-sourcing.js"
import type { TripsToolServices } from "./tools.js"

export * from "./tools.js"

type LedgerHttpContext = Pick<Context, "req"> & { var: object }

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["trips"],
  async contribute({ request, resources }) {
    const c = request as Context
    const db = c.var.db as AnyDrizzleDb
    const trips: TripsToolServices = {
      async createTrip({ components, ...input }, admitted) {
        const requestContext = actionLedgerContext(c)
        const result = await executeAdmittedCreatedTargetCommand(
          {
            db,
            context: requestContext,
            admitted,
            commandTargetType: "trip-create-command",
            canonicalTargetType: "trip",
            resultReferenceType: "trip",
            commandInput: { ...input, components },
            evaluatedRisk: "medium",
          },
          {
            async create(tx) {
              const trip = await tripsService.createTrip(tx, input)
              for (const component of components) {
                trip.components.push(
                  await tripsService.addComponent(tx, {
                    ...component,
                    envelopeId: trip.envelope.id,
                  }),
                )
              }
              return {
                value: { envelopeId: trip.envelope.id },
                targetId: trip.envelope.id,
              }
            },
            async replay(_tx, completed) {
              return { envelopeId: completed.reference.id }
            },
          },
        )
        return result.value
      },
      listTrips: (input) => tripsService.listTrips(c.var.db, input),
      getTrip: (envelopeId) => tripsService.getTrip(c.var.db, envelopeId),
      addComponent: (input) => tripsService.addComponent(c.var.db, input),
      removeComponent: (id) => tripsService.removeComponent(c.var.db, id),
      acceptPriceTrip: async (input, admitted) => {
        const runtime = requireDurableActionRuntime(resources)
        const result = await executeDurableTripActionCommand({
          db,
          context: actionLedgerContext(c),
          admitted,
          action: "price-trip",
          backendIdentity: runtime.price.backendIdentity,
          input,
          evaluatedRisk: "high",
        })
        return result.value
      },
      acceptReserveTrip: async (input, admitted) => {
        const runtime = requireDurableActionRuntime(resources)
        const result = await executeDurableTripActionCommand({
          db,
          context: actionLedgerContext(c),
          admitted,
          action: "reserve-trip",
          backendIdentity: runtime.reserve.backendIdentity,
          input,
          evaluatedRisk: "critical",
        })
        return result.value
      },
      getTripActionOperation: (input) =>
        getTripActionOperation(db, {
          ...input,
          organizationId: actionLedgerContext(c).organizationId ?? null,
        }),
      addRequirement: (input) => tripsService.addRequirement(c.var.db, input),
      acceptRequirementCandidateSourcing: async (input, admitted) => {
        const result = await executeDurableTripRequirementSourcingCommand({
          db,
          context: actionLedgerContext(c),
          admitted,
          input,
        })
        return result.value
      },
      getRequirementSourcingOperation: (input) =>
        getTripRequirementSourcingOperation(db, {
          ...input,
          organizationId: actionLedgerContext(c).organizationId ?? null,
        }),
      selectCandidate: async (input, admitted) => {
        let selected: Awaited<ReturnType<typeof tripsService.selectCandidate>> | undefined
        const result = await executeAdmittedExistingTargetCommand(
          {
            db,
            context: actionLedgerContext(c),
            admitted,
            commandInput: input,
            evaluatedRisk: "medium",
          },
          {
            async prepare(tx) {
              selected = await tripsService.selectCandidate(tx, input)
            },
            execute() {
              if (!selected) throw new Error("Trip candidate selection produced no result")
              return Promise.resolve(selected)
            },
            replay: () => tripsService.getSelectedCandidateResult(db, input.requirementId),
          },
        )
        return result
      },
    }
    return { trips }
  },
})

function requireDurableActionRuntime(
  resources: Readonly<Record<string, unknown>>,
): DurableTripActionRuntime {
  return requireService(
    resources[durableTripActionRuntimePort.id] as DurableTripActionRuntime | undefined,
    durableTripActionRuntimePort.id,
  )
}

function actionLedgerContext(c: LedgerHttpContext): ActionLedgerRequestContextValues {
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

export function createdTargetPrincipalId(context: ActionLedgerRequestContextValues): string {
  return mapActionLedgerRequestContext(context).principalId
}
