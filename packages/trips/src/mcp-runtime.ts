import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger/created-command"
import {
  type ActionLedgerRequestContextValues,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger/request-context"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  defineToolContextContribution,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"
import type { TripsRoutesOptions } from "./routes.js"
import { tripsRoutesRuntimePort } from "./runtime-port.js"
import { tripsService } from "./service.js"
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
    const provider = await Promise.resolve(
      requireService(
        resources[tripsRoutesRuntimePort.id] as
          | (() => TripsRoutesOptions | Promise<TripsRoutesOptions>)
          | undefined,
        tripsRoutesRuntimePort.id,
      ),
    )
    const options = await provider()
    const db = c.var.db as AnyDrizzleDb
    const trips: TripsToolServices = {
      async createTrip({ idempotencyKey: legacyIdempotencyKey, components, ...input }, admitted) {
        admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
        const requestContext = actionLedgerContext(c)
        const result = await executeAdmittedCreatedTargetCommand(
          {
            db,
            context: requestContext,
            admitted,
            idempotencyKey: legacyIdempotencyKey,
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
      addComponent: (input) => tripsService.addComponent(c.var.db, input),
      removeComponent: (id) => tripsService.removeComponent(c.var.db, id),
      priceTrip: async (input) => {
        const deps = await resolveDeps(c, options.priceTripDeps)
        if (!deps) throw new Error("Trips price dependencies are not configured")
        return tripsService.priceTrip(c.var.db, input, deps)
      },
      reserveTrip: async (input) => {
        const deps = await resolveDeps(c, options.reserveTripDeps)
        if (!deps) throw new Error("Trips reserve dependencies are not configured")
        return tripsService.reserveTrip(c.var.db, input, deps)
      },
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
      selectCandidate: (input) => tripsService.selectCandidate(c.var.db, input),
    }
    return { trips }
  },
})

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

function resolveDeps<T>(
  c: Context,
  deps: T | ((c: Context) => T | Promise<T | undefined> | undefined) | undefined,
) {
  if (typeof deps !== "function") return deps
  return (deps as (c: Context) => T | Promise<T | undefined> | undefined)(c)
}
