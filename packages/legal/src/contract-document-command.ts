import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import { ToolError, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  LEGAL_CONTRACT_DOCUMENT_POLICIES,
  type LegalContractDocumentPolicyMode,
} from "./contract-document-policy.js"
import type {
  LegalDocumentArtifactProvider,
  LegalDocumentRenderDescriptor,
} from "./contracts/document-artifact-provider.js"
import {
  createLegalDocumentOperationEngine,
  type LegalDocumentOperationResult,
  legalDocumentOperationTargetFingerprint,
} from "./contracts/document-operation.js"
import { contractDocumentOperations, contracts } from "./contracts/schema.js"

export interface LegalContractDocumentCommandInput {
  bookingId: string
  contractId: string
}

export interface ExecuteLegalContractDocumentCommandInput {
  db: PostgresJsDatabase
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  mode: LegalContractDocumentPolicyMode
  commandInput: LegalContractDocumentCommandInput
  provider: LegalDocumentArtifactProvider
  testHooks?: {
    afterPrepareCommit?: (operationId: string) => Promise<void>
  }
}

export class LegalContractDocumentCommandError extends Error {
  readonly reason: "admitted_policy_mismatch" | "missing_operation" | "operation_identity_mismatch"

  constructor(reason: LegalContractDocumentCommandError["reason"]) {
    super(`Legal contract document command failed: ${reason}`)
    this.name = "LegalContractDocumentCommandError"
    this.reason = reason
  }
}

/**
 * Binds one approved existing-target action-ledger claim to one durable
 * document operation. Admission is committed inside the claim transaction;
 * first execution and every replay resolve only the operation bound to that
 * immutable claim.
 */
export async function executeLegalContractDocumentCommand(
  input: ExecuteLegalContractDocumentCommandInput,
) {
  const policy = LEGAL_CONTRACT_DOCUMENT_POLICIES[input.mode]
  assertAdmittedPolicy(input.admitted, policy)
  const engine = createLegalDocumentOperationEngine({ provider: input.provider })

  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput: input.commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async prepare(tx, command, payload) {
        const transaction = tx as PostgresJsDatabase
        await engine.admit({
          db: transaction,
          bookingId: payload.bookingId,
          mode: input.mode,
          idempotencyKey: command.idempotency.key,
          requestFingerprint: command.idempotency.fingerprint,
          principal: {
            type: command.authorization.principalType,
            id: command.authorization.principalId,
            organizationId: command.authorization.organizationId,
          },
          claim: {
            actionId: command.causation.claimActionId,
            actionName: command.action.name,
            actionVersion: command.action.version,
            targetType: command.target.type,
            targetId: command.target.id,
            idempotencyScope: command.idempotency.scope,
            idempotencyKey: command.idempotency.key,
            idempotencyFingerprint: command.idempotency.fingerprint,
            commandPayload: payload,
          },
          prepareTarget: (documentTx) =>
            prepareDocumentTarget(documentTx, payload, command.authorization.organizationId),
        })
      },
      async execute(command, payload) {
        const operation = await requireBoundOperation(input.db, input.mode, command, payload)
        await input.testHooks?.afterPrepareCommit?.(operation.id)
        return runBoundOperation(input.db, engine, operation.id, command.causation.claimActionId)
      },
      async replay(command, payload) {
        const operation = await requireBoundOperation(input.db, input.mode, command, payload)
        return runBoundOperation(input.db, engine, operation.id, command.causation.claimActionId)
      },
    },
  )
}

async function prepareDocumentTarget(
  db: PostgresJsDatabase,
  payload: ExistingTargetCommandPayload<LegalContractDocumentCommandInput>,
  organizationId: string | null,
) {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, payload.contractId))
    .limit(1)
  if (!contract || contract.bookingId !== payload.bookingId) {
    throw new ToolError(
      `Contract "${payload.contractId}" is not owned by booking "${payload.bookingId}".`,
      "NOT_FOUND",
    )
  }
  if (!contract.renderedBody) {
    throw new ToolError(
      "The selected contract has no immutable rendered body to generate.",
      "INVALID_INPUT",
    )
  }
  const variables =
    contract.variables &&
    typeof contract.variables === "object" &&
    !Array.isArray(contract.variables)
      ? (contract.variables as Record<string, unknown>)
      : {}
  return {
    contractId: contract.id,
    bookingId: payload.bookingId,
    organizationId,
    descriptor: {
      contractId: contract.id,
      bookingId: payload.bookingId,
      templateVersionId: contract.templateVersionId,
      contractNumber: contract.contractNumber,
      body: contract.renderedBody,
      bodyFormat: contract.renderedBodyFormat,
      variables,
    },
  }
}

async function requireBoundOperation(
  db: PostgresJsDatabase,
  mode: LegalContractDocumentPolicyMode,
  command: AdmittedExistingTargetCommand,
  payload: ExistingTargetCommandPayload<LegalContractDocumentCommandInput>,
) {
  const [operation] = await db
    .select()
    .from(contractDocumentOperations)
    .where(eq(contractDocumentOperations.claimActionId, command.causation.claimActionId))
    .limit(1)
  if (!operation) throw new LegalContractDocumentCommandError("missing_operation")
  const targetFingerprint = await legalDocumentOperationTargetFingerprint({
    bookingId: operation.bookingId,
    contractId: operation.contractId!,
    organizationId: operation.organizationId,
    mode: operation.mode as LegalContractDocumentPolicyMode,
    providerId: operation.providerId,
    providerVersion: operation.providerVersion,
    providerProtocol: operation.providerProtocol,
    descriptor: operation.renderDescriptor as LegalDocumentRenderDescriptor,
  })
  if (
    operation.mode !== mode ||
    operation.bookingId !== payload.bookingId ||
    operation.contractId !== payload.contractId ||
    operation.requestFingerprint !== command.idempotency.fingerprint ||
    operation.targetFingerprint !== targetFingerprint ||
    operation.tenantScope !== tenantScope(command.authorization.organizationId) ||
    operation.claimActionName !== command.action.name ||
    operation.claimActionVersion !== command.action.version ||
    operation.claimTargetType !== command.target.type ||
    operation.claimTargetId !== command.target.id ||
    operation.claimIdempotencyScope !== command.idempotency.scope ||
    operation.idempotencyKey !== command.idempotency.key ||
    operation.claimIdempotencyFingerprint !== command.idempotency.fingerprint ||
    operation.principalType !== command.authorization.principalType ||
    operation.principalId !== command.authorization.principalId ||
    operation.organizationId !== command.authorization.organizationId ||
    canonicalJson(operation.claimCommandPayload) !== canonicalJson(payload) ||
    !matchesBoundResult(operation)
  ) {
    throw new LegalContractDocumentCommandError("operation_identity_mismatch")
  }
  return operation
}

async function runBoundOperation(
  db: PostgresJsDatabase,
  engine: ReturnType<typeof createLegalDocumentOperationEngine>,
  operationId: string,
  claimActionId: string,
): Promise<LegalDocumentOperationResult> {
  const immediate = await engine.run(
    db,
    operationId,
    `action-${claimActionId}-${crypto.randomUUID()}`,
  )
  if (immediate) return immediate

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const [operation] = await db
      .select({
        result: contractDocumentOperations.result,
        status: contractDocumentOperations.status,
      })
      .from(contractDocumentOperations)
      .where(eq(contractDocumentOperations.id, operationId))
      .limit(1)
    const result = parseResult(operation?.result)
    if (result) return result
    if (
      operation?.status === "dead_lettered" ||
      operation?.status === "dead_lettered_cleanup_complete"
    ) {
      throw new Error(`Legal document operation ${operationId} was dead-lettered.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Legal document operation ${operationId} did not complete before replay timeout.`)
}

function parseResult(value: unknown): LegalDocumentOperationResult | null {
  if (!value || typeof value !== "object") return null
  const result = value as LegalDocumentOperationResult
  return result.operationId && result.contractId && result.attachmentId ? result : null
}

function matchesBoundResult(operation: typeof contractDocumentOperations.$inferSelect): boolean {
  if (operation.result === null) return true
  const result = parseResult(operation.result)
  return (
    result !== null &&
    result.operationId === operation.id &&
    result.bookingId === operation.bookingId &&
    result.contractId === operation.contractId &&
    result.mode === operation.mode &&
    result.attachmentId === operation.canonicalAttachmentId &&
    result.checksumSha256 === operation.artifactChecksum
  )
}

function tenantScope(organizationId: string | null): string {
  return organizationId ? `organization:${organizationId}` : "organization:<none>"
}

function assertAdmittedPolicy(
  admitted: ToolHandlerActionPolicyContext,
  policy: (typeof LEGAL_CONTRACT_DOCUMENT_POLICIES)[LegalContractDocumentPolicyMode],
): void {
  if (
    admitted.capabilityId !== policy.toolCapabilityId ||
    admitted.actionPolicy.capabilityId !== policy.actionName ||
    admitted.actionPolicy.version !== policy.actionVersion ||
    admitted.actionPolicy.targetType !== policy.canonicalTargetType ||
    admitted.actionPolicy.commandTargetField !== policy.commandTargetField ||
    admitted.actionPolicy.risk !== policy.evaluatedRisk ||
    admitted.actionPolicy.policy !== policy.approvalPolicyName
  ) {
    throw new LegalContractDocumentCommandError("admitted_policy_mismatch")
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`
}
