import {
  type ActionLedgerRequestContextValues,
  type ExecuteAdmittedCreatedTargetCommandInput,
  type ExecuteCreatedTargetCommandHandlers,
  type ExecuteCreatedTargetCommandResult,
  executeAdmittedCreatedTargetCommand,
  mapActionLedgerRequestContext,
} from "@voyant-travel/action-ledger"
import { ToolError, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { ProposalsCreatedTargetPolicy } from "./created-target-policy.js"

type ProposalRow = { id: string }

type ProposalsCreatedCommandExecutor = (
  input: ExecuteAdmittedCreatedTargetCommandInput<string>,
  handlers: ExecuteCreatedTargetCommandHandlers<ProposalRow, string>,
) => Promise<ExecuteCreatedTargetCommandResult<ProposalRow, string>>

/**
 * Run a proposal creation as a ledgered created-target command, so an exact retry
 * claims the original proposal rather than opening a duplicate.
 *
 * `replay` re-reads the claimed proposal rather than returning a bare reference:
 * the Tool's output schema is the full proposal, and a caller that retried should
 * still get a proposal back rather than a stub it has to fetch again.
 */
export async function executeProposalsCreate<TRow extends ProposalRow>(
  db: PostgresJsDatabase,
  context: ActionLedgerRequestContextValues,
  policy: ProposalsCreatedTargetPolicy,
  commandInput: unknown,
  admitted: ToolHandlerActionPolicyContext,
  create: (tx: PostgresJsDatabase) => Promise<TRow>,
  read: (tx: PostgresJsDatabase, id: string) => Promise<TRow | null>,
  executor: ProposalsCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
) {
  const principal = mapActionLedgerRequestContext(context)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Proposal created-target commands require a concrete principal")
  }
  const idempotencyKey = admittedIdempotencyKey(admitted)

  return executor(
    {
      db,
      context,
      admitted,
      idempotencyKey,
      commandTargetType: policy.commandTargetType,
      canonicalTargetType: policy.canonicalTargetType,
      resultReferenceType: policy.resultReferenceType,
      commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async create(tx) {
        const value = await create(tx as PostgresJsDatabase)
        return { value, targetId: value.id }
      },
      async replay(tx, result) {
        const row = await read(tx as PostgresJsDatabase, result.reference.id)
        if (!row) {
          throw new ToolError(
            `Proposal "${result.reference.id}" was claimed by an earlier command but no longer exists.`,
            "NOT_FOUND",
            { capabilityId: admitted.capabilityId },
          )
        }
        return row
      },
    },
  )
}

/**
 * Idempotency has to come from the admitted invocation. A key the caller could
 * vary per attempt would defeat the claim and let a retry open a second proposal.
 */
function admittedIdempotencyKey(admitted: ToolHandlerActionPolicyContext): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: admitted.capabilityId },
    )
  }
  return idempotencyKey
}
