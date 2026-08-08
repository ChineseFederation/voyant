import {
  type ActionLedgerRequestContextValues,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { and, eq, inArray, ne } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { proposals, proposalVersions } from "../schema.js"
import {
  type AcceptProposalVersionResult,
  ProposalVersionConflictError,
  proposalVersionsService,
} from "./proposal-versions.js"

export interface ExecuteAcceptProposalVersionCommandInput {
  db: AnyDrizzleDb
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  proposalVersionId: string
}

/**
 * Accept a proposal version under the handler-owned command claim. The claim,
 * proposal/version lifecycle changes, and approval consumption commit in one
 * transaction; exact retries resolve the already accepted state.
 */
export async function executeAcceptProposalVersionCommand(
  input: ExecuteAcceptProposalVersionCommandInput,
) {
  const commandInput = { proposalVersionId: input.proposalVersionId }
  let preparedValue: Awaited<ReturnType<typeof proposalVersionsService.acceptProposalVersion>> =
    null
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
        preparedValue = await proposalVersionsService.acceptProposalVersion(
          tx as PostgresJsDatabase,
          input.proposalVersionId,
        )
      },
      execute: () => Promise.resolve(preparedValue),
      replay: () => resolveAcceptedProposalVersion(input.db, input.proposalVersionId),
    },
  )
}

async function resolveAcceptedProposalVersion(
  db: AnyDrizzleDb,
  proposalVersionId: string,
): Promise<AcceptProposalVersionResult | null> {
  const [accepted] = await db
    .select({ proposal: proposals, proposalVersion: proposalVersions })
    .from(proposalVersions)
    .innerJoin(proposals, eq(proposalVersions.proposalId, proposals.id))
    .where(eq(proposalVersions.id, proposalVersionId))
    .limit(1)
  if (!accepted) return null
  if (
    accepted.proposalVersion.status !== "accepted" ||
    accepted.proposal.acceptedVersionId !== proposalVersionId
  ) {
    throw new ProposalVersionConflictError(
      `Proposal Version ${proposalVersionId} no longer resolves to its accepted result`,
    )
  }
  const closedProposalVersions = await db
    .select()
    .from(proposalVersions)
    .where(
      and(
        eq(proposalVersions.proposalId, accepted.proposal.id),
        ne(proposalVersions.id, proposalVersionId),
        inArray(proposalVersions.status, ["declined", "superseded"]),
      ),
    )
  return { ...accepted, closedProposalVersions }
}
