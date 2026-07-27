import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import {
  defineToolContextContribution,
  requireService,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"
import { executeQuotesCreate } from "./created-target-command.js"
import { QUOTES_CREATED_TARGET_POLICIES } from "./created-target-policy.js"
import {
  type QuotesNotificationsRuntime,
  type QuotesProposalRuntime,
  quotesNotificationsRuntimePort,
  quotesProposalRuntimePort,
} from "./runtime-port.js"
import { quotesService } from "./service/index.js"
import { executeSnapshotAndSendQuoteCommand } from "./service/quote-delivery.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["quotes", "quoteDelivery"],
  contribute: ({ context, request, resources }) => {
    const db = context.db as Parameters<typeof quotesService.listQuotes>[0]
    const c = request as Context
    return {
      quotes: {
        listQuotes: (query: Parameters<typeof quotesService.listQuotes>[1]) =>
          quotesService.listQuotes(db, query),
        getQuoteById: (id: string) => quotesService.getQuoteById(db, id),
        listPipelines: (query: Parameters<typeof quotesService.listPipelines>[1]) =>
          quotesService.listPipelines(db, query),
        listStages: (query: Parameters<typeof quotesService.listStages>[1]) =>
          quotesService.listStages(db, query),
        async createQuote(
          input: Parameters<typeof quotesService.createQuote>[1],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          // Same three things the HTTP create route does: attribute the actor,
          // create, then announce it. A Tool that skipped any of them would
          // leave the quote unowned in the admin panel or stale in every
          // client the realtime module invalidates.
          const actorId = actorIdOf(c)
          const result = await executeQuotesCreate(
            db,
            actionLedgerContext(c),
            QUOTES_CREATED_TARGET_POLICIES.quote,
            input,
            admitted,
            async (tx) => {
              const row = await quotesService.createQuote(tx, input, actorId)
              if (!row) throw new Error("createQuote returned no row")
              return row
            },
            (tx, id) => quotesService.getQuoteById(tx, id),
          )
          if (!result.replayed) {
            await c.get("eventBus")?.emit("quote.created", { id: result.value.id })
          }
          return result.value
        },
        async addQuoteProduct(
          quoteId: string,
          input: Parameters<typeof quotesService.createQuoteProduct>[2],
        ) {
          return quotesService.createQuoteProduct(db, quoteId, input, actorIdOf(c))
        },
        snapshotQuoteVersion: (quoteId: string) =>
          quotesService.createVersionSnapshotFromQuote(db, quoteId),
        sendQuoteVersion: (
          id: string,
          input: Parameters<typeof quotesService.sendQuoteVersion>[2],
        ) => quotesService.sendQuoteVersion(db, id, input),
        acceptQuoteVersion: (id: string) => quotesService.acceptQuoteVersion(db, id),
        declineQuoteVersion: (id: string) => quotesService.declineQuoteVersion(db, id),
      },
      quoteDelivery: {
        async snapshotAndSendQuote(
          input: Parameters<typeof executeSnapshotAndSendQuoteCommand>[0]["input"],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const notifications = await Promise.resolve(
            requireService(
              resources[quotesNotificationsRuntimePort.id] as
                | QuotesNotificationsRuntime
                | Promise<QuotesNotificationsRuntime>
                | undefined,
              quotesNotificationsRuntimePort.id,
            ),
          )
          const proposal = await Promise.resolve(
            requireService(
              resources[quotesProposalRuntimePort.id] as
                | QuotesProposalRuntime
                | Promise<QuotesProposalRuntime>
                | undefined,
              quotesProposalRuntimePort.id,
            ),
          )
          const result = await executeSnapshotAndSendQuoteCommand({
            db,
            context: actionLedgerContext(c),
            admitted,
            notifications,
            input,
            publicProposalBaseUrl: proposal.resolvePublicProposalBaseUrl(c),
          })
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

/** Staff identity behind the request, so Tool-authored rows carry ownership. */
function actorIdOf(c: Context): string | null {
  return (c.get("userId") as string | undefined) ?? null
}
