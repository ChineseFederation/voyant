import {
  type ActionLedgerRequestContextValues,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import {
  deriveCommandIdempotencyKey,
  defineToolContextContribution,
  deriveCommandIdempotencyKey,
  type ToolHandlerActionPolicyContext,
  withServerResolvedIdempotencyKey,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import { getOperatorSettings, upsertOperatorSettings } from "./service.js"
import type { OperatorSettingsValue } from "./tools.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["operatorSettings"],
  contribute: ({ context, request }) => {
    const db = context.db as Parameters<typeof getOperatorSettings>[0]
    return {
      operatorSettings: {
        async getSettings() {
          return serializeSettings(await getOperatorSettings(db))
        },
        async updateSettings(
          input: Parameters<typeof upsertOperatorSettings>[1],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const commandInput = { settingsId: "operator-settings", patch: input }
          const resolvedAdmitted = admitted.invocation.idempotencyKey?.trim()
            ? admitted
            : withServerResolvedIdempotencyKey(
                admitted,
                await deriveCommandIdempotencyKey("update-operator-settings", commandInput),
              )
          let settings: Awaited<ReturnType<typeof upsertOperatorSettings>> | undefined
          const result = await executeAdmittedExistingTargetCommand(
            {
              db,
              context: actionLedgerContext(request as Context),
              admitted: resolvedAdmitted,
              commandInput,
              evaluatedRisk: "high",
            },
            {
              async prepare(tx) {
                settings = await upsertOperatorSettings(tx as PostgresJsDatabase, input)
              },
              execute() {
                return Promise.resolve(serializeSettings(settings ?? null))
              },
              async replay() {
                return serializeSettings(await getOperatorSettings(db))
              },
            },
          )
          return result.value
        },
      },
    }
  },
})

function actionLedgerContext(c: Context): ActionLedgerRequestContextValues {
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

function serializeSettings(
  settings: Awaited<ReturnType<typeof getOperatorSettings>>,
): OperatorSettingsValue | null {
  if (!settings) return null
  const { createdAt, updatedAt, ...value } = settings
  return {
    ...value,
    bankTransferBeneficiary: settings.bankTransferBeneficiary ?? null,
    iban: settings.iban ?? null,
    bank: settings.bank ?? null,
    notes: settings.notes ?? null,
    customerPaymentPolicy: settings.customerPaymentPolicy ?? null,
    bookingCheckoutUrlTemplate: settings.bookingCheckoutUrlTemplate ?? null,
    invoicePayUrlTemplate: settings.invoicePayUrlTemplate ?? null,
    ...(createdAt ? { createdAt: createdAt.toISOString() } : {}),
    ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
  }
}
