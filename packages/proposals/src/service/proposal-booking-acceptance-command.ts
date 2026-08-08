import {
  type ActionLedgerRequestContextValues,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type AcceptedProposalBookingSessionSeed,
  type AcceptedProposalBookingSessionSeedResult,
  acceptProposalAndPrepareBooking,
} from "./proposal-acceptance.js"

export interface ExecuteAcceptProposalForBookingCommandInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  proposalVersionId: string
  seedBookingSession: (
    db: PostgresJsDatabase,
    input: AcceptedProposalBookingSessionSeed,
  ) => Promise<AcceptedProposalBookingSessionSeedResult>
}

/**
 * Bind approved proposal acceptance and its Booking Session handoff to one
 * handler-owned command claim. The domain workflow already keys the session by
 * accepted Proposal Version, so replay resolves/reconciles that same session.
 */
export async function executeAcceptProposalForBookingCommand(
  input: ExecuteAcceptProposalForBookingCommandInput,
) {
  const commandInput = { proposalVersionId: input.proposalVersionId }
  let preparedValue: Awaited<ReturnType<typeof acceptProposalAndPrepareBooking>> | undefined
  const executeWorkflow = (db: PostgresJsDatabase) =>
    acceptProposalAndPrepareBooking(db, input.proposalVersionId, input.seedBookingSession)
  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput,
      evaluatedRisk: "high",
    },
    {
      async prepare(tx) {
        preparedValue = await executeWorkflow(tx as PostgresJsDatabase)
      },
      execute() {
        if (!preparedValue) throw new Error("Proposal booking acceptance produced no result")
        return Promise.resolve(preparedValue)
      },
      replay: () => executeWorkflow(input.db as PostgresJsDatabase),
    },
  )
}
