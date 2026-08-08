import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import {
  defineToolContextContribution,
  requireService,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"
import { executeProposalsCreate } from "./created-target-command.js"
import { PROPOSALS_CREATED_TARGET_POLICIES } from "./created-target-policy.js"
import {
  type ProposalsNotificationsRuntime,
  type ProposalsPresentationRuntime,
  proposalsNotificationsRuntimePort,
  proposalsPresentationRuntimePort,
} from "./runtime-port.js"
import { proposalsService } from "./service/index.js"
import { ProposalAcceptanceError } from "./service/proposal-acceptance.js"
import { executeAcceptProposalForBookingCommand } from "./service/proposal-booking-acceptance-command.js"
import { executeSnapshotAndSendProposalCommand } from "./service/proposal-delivery.js"
import { executeAcceptProposalVersionCommand } from "./service/proposal-version-acceptance-command.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["proposals", "proposalDelivery", "proposalAcceptance"],
  contribute: ({ context, request, resources }) => {
    const db = context.db as Parameters<typeof proposalsService.listProposals>[0]
    const c = request as Context
    return {
      proposals: {
        listProposals: (query: Parameters<typeof proposalsService.listProposals>[1]) =>
          proposalsService.listProposals(db, query),
        getProposalById: (id: string) => proposalsService.getProposalById(db, id),
        listPipelines: (query: Parameters<typeof proposalsService.listPipelines>[1]) =>
          proposalsService.listPipelines(db, query),
        listStages: (query: Parameters<typeof proposalsService.listStages>[1]) =>
          proposalsService.listStages(db, query),
        async createProposal(
          input: Parameters<typeof proposalsService.createProposal>[1],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          // Same three things the HTTP create route does: attribute the actor,
          // create, then announce it. A Tool that skipped any of them would
          // leave the proposal unowned in the admin panel or stale in every
          // client the realtime module invalidates.
          const actorId = actorIdOf(c)
          const result = await executeProposalsCreate(
            db,
            actionLedgerContext(c),
            PROPOSALS_CREATED_TARGET_POLICIES.proposal,
            input,
            admitted,
            async (tx) => {
              const row = await proposalsService.createProposal(tx, input, actorId)
              if (!row) throw new Error("createProposal returned no row")
              return row
            },
            (tx, id) => proposalsService.getProposalById(tx, id),
          )
          if (!result.replayed) {
            await c.get("eventBus")?.emit("proposal.created", { id: result.value.id })
          }
          return result.value
        },
        async addProposalProduct(
          proposalId: string,
          input: Parameters<typeof proposalsService.createProposalProduct>[2],
        ) {
          return proposalsService.createProposalProduct(db, proposalId, input, actorIdOf(c))
        },
        snapshotProposalVersion: (proposalId: string) =>
          proposalsService.createVersionSnapshotFromProposal(db, proposalId),
        sendProposalVersion: (
          id: string,
          input: Parameters<typeof proposalsService.sendProposalVersion>[2],
        ) => proposalsService.sendProposalVersion(db, id, input),
        async acceptProposalVersion(id: string, admitted: ToolHandlerActionPolicyContext) {
          const result = await executeAcceptProposalVersionCommand({
            db,
            context: actionLedgerContext(c),
            admitted,
            proposalVersionId: id,
          })
          return result.value
        },
        declineProposalVersion: (id: string) => proposalsService.declineProposalVersion(db, id),
      },
      proposalDelivery: {
        async snapshotAndSendProposal(
          input: Parameters<typeof executeSnapshotAndSendProposalCommand>[0]["input"],
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const notifications = await Promise.resolve(
            requireService(
              resources[proposalsNotificationsRuntimePort.id] as
                | ProposalsNotificationsRuntime
                | Promise<ProposalsNotificationsRuntime>
                | undefined,
              proposalsNotificationsRuntimePort.id,
            ),
          )
          const proposal = await Promise.resolve(
            requireService(
              resources[proposalsPresentationRuntimePort.id] as
                | ProposalsPresentationRuntime
                | Promise<ProposalsPresentationRuntime>
                | undefined,
              proposalsPresentationRuntimePort.id,
            ),
          )
          const result = await executeSnapshotAndSendProposalCommand({
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
      proposalAcceptance: {
        async acceptProposalForBooking(
          proposalVersionId: string,
          admitted: ToolHandlerActionPolicyContext,
        ) {
          const proposal = await Promise.resolve(
            requireService(
              resources[proposalsPresentationRuntimePort.id] as
                | ProposalsPresentationRuntime
                | Promise<ProposalsPresentationRuntime>
                | undefined,
              proposalsPresentationRuntimePort.id,
            ),
          )
          try {
            const result = await executeAcceptProposalForBookingCommand({
              db,
              context: actionLedgerContext(c),
              admitted,
              proposalVersionId,
              seedBookingSession: (transactionalDb, input) =>
                proposal.seedAcceptedProposalBookingSession(transactionalDb, input, c),
            })
            return result.value
          } catch (error) {
            if (error instanceof ProposalAcceptanceError) {
              const code = error.code === "not_found" ? "NOT_FOUND" : "INVALID_INPUT"
              throw new ToolError(error.message, code, {
                nextSteps:
                  error.code === "booking_session_rejected"
                    ? [
                        `Resolve the Booking Session rejection (${error.detail ?? "unknown"}) and call again with the same Proposal Version. Acceptance and session creation are atomic.`,
                      ]
                    : undefined,
              })
            }
            throw error
          }
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
