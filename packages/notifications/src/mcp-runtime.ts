import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import { defineToolContextContribution, requireService } from "@voyant-travel/tools"
import type { Context } from "hono"
import {
  type DurableNotificationProviderRuntime,
  durableNotificationProviderPort,
} from "./durable-provider-port.js"
import { notificationsService } from "./service.js"
import { executeDurableNotificationSendCommand } from "./service-durable-send.js"
import { createNotificationService } from "./service-shared.js"
import type { NotificationsToolServices } from "./tools.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["notifications"],
  async contribute({ request, resources }) {
    const c = request as Context
    const durableRuntime = resources[durableNotificationProviderPort.id] as
      | DurableNotificationProviderRuntime
      | undefined
    const notifications: NotificationsToolServices = {
      listDeliveries: (query) => notificationsService.listDeliveries(c.var.db, query),
      getDeliveryById: (id) => notificationsService.getDeliveryById(c.var.db, id),
      async sendTemplated(input, admitted) {
        const selectedRuntime = requireService(durableRuntime, durableNotificationProviderPort.id)
        const result = await executeDurableNotificationSendCommand({
          db: c.var.db,
          context: actionLedgerContext(c),
          admitted,
          dispatcher: createNotificationService(selectedRuntime.providers),
          input,
        })
        return result.value
      },
    }
    return { notifications }
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
