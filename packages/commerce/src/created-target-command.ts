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

import type { COMMERCE_CREATED_TARGET_POLICIES } from "./created-target-policy.js"

type CommerceCreatedTargetPolicy =
  (typeof COMMERCE_CREATED_TARGET_POLICIES)[keyof typeof COMMERCE_CREATED_TARGET_POLICIES]

type CommerceCreatedCommandExecutor = (
  input: ExecuteAdmittedCreatedTargetCommandInput<string>,
  handlers: ExecuteCreatedTargetCommandHandlers<{ id: string }, string>,
) => Promise<ExecuteCreatedTargetCommandResult<{ id: string }, string>>

export async function executeCommerceCreate(
  db: PostgresJsDatabase,
  context: ActionLedgerRequestContextValues,
  policy: CommerceCreatedTargetPolicy,
  legacyIdempotencyKey: string | undefined,
  commandInput: unknown,
  admitted: ToolHandlerActionPolicyContext,
  create: (tx: PostgresJsDatabase) => Promise<{ id: string }>,
  executor: CommerceCreatedCommandExecutor = executeAdmittedCreatedTargetCommand,
) {
  const principal = mapActionLedgerRequestContext(context)
  if (principal.principalId === "unknown_request") {
    throw new TypeError("Commerce created-target commands require a concrete principal")
  }
  admittedCreatedCommandIdempotencyKey(admitted, legacyIdempotencyKey)
  return executor(
    {
      db,
      context,
      admitted,
      idempotencyKey: legacyIdempotencyKey,
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
      async replay(_tx, result) {
        return { id: result.reference.id }
      },
    },
  )
}

function admittedCreatedCommandIdempotencyKey(
  admitted: ToolHandlerActionPolicyContext,
  legacyIdempotencyKey: string | undefined,
): string {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim()
  if (!idempotencyKey) {
    throw new ToolError(
      "Created-target command idempotency must come from the admitted Tool invocation.",
      "ACTION_POLICY_REQUIRED",
      { capabilityId: admitted.capabilityId },
    )
  }
  if (legacyIdempotencyKey !== undefined && legacyIdempotencyKey !== idempotencyKey) {
    throw new ToolError(
      "The legacy top-level idempotency key does not match the admitted Tool invocation.",
      "INVALID_INPUT",
      { capabilityId: admitted.capabilityId },
    )
  }
  return idempotencyKey
}
