import { executeAdmittedCreatedTargetCommand } from "@voyant-travel/action-ledger/created-command"
import {
  type ActionLedgerRequestContextValues,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger/request-context"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"

import { miceService } from "./service.js"
import type { MiceToolServices } from "./tools.js"

export * from "./tools.js"

type LedgerHttpContext = Pick<Context, "req"> & { var: object }

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["mice"],
  contribute: ({ request, context }) => {
    const c = request as Context
    const db = context.db as Parameters<typeof miceService.listPrograms>[0]
    return {
      mice: {
        listPrograms: (query: Parameters<typeof miceService.listPrograms>[1]) =>
          miceService.listPrograms(db, query),
        getProgram: (id: string) => miceService.getProgram(db, id),
        async createProgram(
          requestInput: Parameters<MiceToolServices["createProgram"]>[0],
          admitted: Parameters<MiceToolServices["createProgram"]>[1],
        ) {
          const { idempotencyKey: legacyIdempotencyKey, ...input } = requestInput
          admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
          const requestContext = actionLedgerContext(c)
          const result = await executeAdmittedCreatedTargetCommand(
            {
              db: db as unknown as AnyDrizzleDb,
              context: requestContext,
              admitted,
              idempotencyKey: legacyIdempotencyKey,
              commandTargetType: "mice-program-create-command",
              canonicalTargetType: "mice-program",
              resultReferenceType: "mice-program",
              commandInput: input,
              evaluatedRisk: "medium",
            },
            {
              async create(tx) {
                const program = await miceService.createProgram(tx as typeof db, input)
                return { value: { programId: program.id }, targetId: program.id }
              },
              async replay(_tx, completed) {
                return { programId: completed.reference.id }
              },
            },
          )
          return result.value
        },
        updateProgram: ({
          id,
          ...input
        }: Parameters<import("./tools.js").MiceToolServices["updateProgram"]>[0]) =>
          miceService.updateProgram(db, id, input),
      },
    }
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
