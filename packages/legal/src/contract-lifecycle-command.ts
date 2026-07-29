import {
  type ActionLedgerRequestContextValues,
  type AdmittedExistingTargetCommand,
  type ExistingTargetCommandPayload,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import { ToolError, type ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  bookingContractContentFingerprint,
} from "./booking-contract-review.js"
import { legalContractDetail } from "./contract-dto.js"
import {
  appendContractStageHistory,
  buildContractLifecycleEvent,
  CONTRACT_LIFECYCLE_EVENT_NAMES,
  type ContractLifecycleEvent,
  createContractStageHistoryEntry,
} from "./contracts/lifecycle.js"
import {
  type Contract,
  contractLifecycleCommandResults,
  contracts,
  contractTemplateVersions,
} from "./contracts/schema.js"
import {
  allocateContractNumber,
  mergeContractNumberIntoVariables,
  renderTemplate,
} from "./contracts/service-shared.js"
import { LEGAL_CONTRACT_LIFECYCLE_POLICIES } from "./existing-target-policy.js"
import { parseManagedBookingContractReviewWorkflow } from "./managed-booking-contract-workflow.js"
import { type LegalContractDetail, legalContractDetailSchema } from "./tools.js"

type LifecycleTransition = keyof typeof LEGAL_CONTRACT_LIFECYCLE_POLICIES
type LifecyclePolicy = (typeof LEGAL_CONTRACT_LIFECYCLE_POLICIES)[LifecycleTransition]
type LifecycleCommandPayload =
  | { contractId: string }
  | {
      contractId: string
      recipient: string
      channel: "email" | "sms" | "whatsapp"
      revision: number
      contentFingerprint: string
      notificationsSuppressed: boolean
      subject: string | null
      message: string | null
    }
  | {
      contractId: string
      recipientEmail: string | null
      subject: string | null
      message: string | null
    }
  | {
      contractId: string
      revision: number
      reason: string
      acknowledgedConsequences: true
    }

type InsertOutbox = typeof insertOutboxEvents

export interface ExecuteLegalContractLifecycleCommandInput {
  db: PostgresJsDatabase
  context: ActionLedgerRequestContextValues
  admitted: ToolHandlerActionPolicyContext
  transition: LifecycleTransition
  commandInput: {
    contractId: string
    recipientEmail?: string | null
    recipient?: string
    channel?: "email" | "sms" | "whatsapp"
    revision?: number
    contentFingerprint?: string
    notificationsSuppressed?: boolean
    reason?: string
    acknowledgedConsequences?: true
    subject?: string | null
    message?: string | null
  }
  testHooks?: {
    afterTransition?: (tx: PostgresJsDatabase, contract: LegalContractDetail) => Promise<void>
  }
  insertEvents?: InsertOutbox
}

export class LegalContractLifecycleCommandError extends Error {
  readonly reason:
    | "missing_result"
    | "result_identity_mismatch"
    | "outbox_event_collision"
    | "admitted_policy_mismatch"

  constructor(reason: LegalContractLifecycleCommandError["reason"]) {
    super(`Legal contract lifecycle command failed: ${reason}`)
    this.name = "LegalContractLifecycleCommandError"
    this.reason = reason
  }
}

/**
 * Completes a Tool-owned contract transition through the framework's
 * existing-target command seam.
 *
 * The prepare callback is the whole authoritative operation: contract row
 * lock + transition, immutable result mailbox, and deterministic outbox append
 * share the action-ledger claim transaction. The execute/replay callbacks only
 * resolve the committed mailbox and never publish request-scoped events.
 */
export async function executeLegalContractLifecycleCommand(
  input: ExecuteLegalContractLifecycleCommandInput,
) {
  const policy = LEGAL_CONTRACT_LIFECYCLE_POLICIES[input.transition]
  assertAdmittedPolicy(input.admitted, policy)
  const commandInput = normalizeCommandInput(input.transition, input.commandInput)

  return executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      commandInput,
      evaluatedRisk: policy.evaluatedRisk,
    },
    {
      async prepare(tx, command, payload) {
        const transaction = tx as PostgresJsDatabase
        const mutation = await applyLifecycleTransition(
          transaction,
          input.transition,
          payload as ExistingTargetCommandPayload<LifecycleCommandPayload>,
        )
        const result = legalContractDetail(mutation.contract)
        await input.testHooks?.afterTransition?.(transaction, result)
        const eventId = legalContractLifecycleEventId(command)
        await transaction.insert(contractLifecycleCommandResults).values({
          claimActionId: command.causation.claimActionId,
          actionName: command.action.name,
          actionVersion: command.action.version,
          targetType: command.target.type,
          contractId: command.target.id,
          transition: input.transition,
          idempotencyScope: command.idempotency.scope,
          idempotencyKey: command.idempotency.key,
          idempotencyFingerprint: command.idempotency.fingerprint,
          principalType: command.authorization.principalType,
          principalId: command.authorization.principalId,
          organizationId: command.authorization.organizationId,
          commandPayload: payload as unknown as Record<string, unknown>,
          result,
          eventId,
        })
        const inserted = await (input.insertEvents ?? insertOutboxEvents)(transaction, [
          {
            name: CONTRACT_LIFECYCLE_EVENT_NAMES[mutation.event.transition],
            data: mutation.event,
            metadata: {
              category: "domain",
              source: "service",
              eventId,
            },
          },
        ])
        if (inserted.length !== 1) {
          throw new LegalContractLifecycleCommandError("outbox_event_collision")
        }
      },
      execute: (command, payload) =>
        resolveLifecycleCommandResult(input.db, input.transition, command, payload),
      replay: (command, payload) =>
        resolveLifecycleCommandResult(input.db, input.transition, command, payload),
    },
  )
}

export function legalContractLifecycleEventId(command: AdmittedExistingTargetCommand): string {
  return `evt_legal_contract_lifecycle_${command.causation.claimActionId}`
}

async function resolveLifecycleCommandResult(
  db: PostgresJsDatabase,
  transition: LifecycleTransition,
  command: AdmittedExistingTargetCommand,
  payload: ExistingTargetCommandPayload<LifecycleCommandPayload>,
): Promise<LegalContractDetail> {
  const [row] = await db
    .select()
    .from(contractLifecycleCommandResults)
    .where(eq(contractLifecycleCommandResults.claimActionId, command.causation.claimActionId))
    .limit(1)
  if (!row) throw new LegalContractLifecycleCommandError("missing_result")
  if (
    row.actionName !== command.action.name ||
    row.actionVersion !== command.action.version ||
    row.targetType !== command.target.type ||
    row.contractId !== command.target.id ||
    row.transition !== transition ||
    row.idempotencyScope !== command.idempotency.scope ||
    row.idempotencyKey !== command.idempotency.key ||
    row.idempotencyFingerprint !== command.idempotency.fingerprint ||
    row.principalType !== command.authorization.principalType ||
    row.principalId !== command.authorization.principalId ||
    row.organizationId !== command.authorization.organizationId ||
    canonicalJson(row.commandPayload) !== canonicalJson(payload)
  ) {
    throw new LegalContractLifecycleCommandError("result_identity_mismatch")
  }
  return legalContractDetailSchema.parse(row.result)
}

async function applyLifecycleTransition(
  db: PostgresJsDatabase,
  transition: LifecycleTransition,
  payload: ExistingTargetCommandPayload<LifecycleCommandPayload>,
): Promise<{ contract: Contract; event: ContractLifecycleEvent }> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(eq(contracts.id, payload.contractId))
    .for("update")
    .limit(1)
  if (!contract) {
    throw new ToolError(`Contract "${payload.contractId}" was not found.`, "NOT_FOUND", {
      contractId: payload.contractId,
    })
  }

  switch (transition) {
    case "issue":
      return issueContract(db, contract)
    case "send":
      if (contract.status === "draft" && "contentFingerprint" in payload) {
        const issued = await issueContract(db, contract)
        return sendContract(db, issued.contract, payload)
      }
      return sendContract(db, contract, payload)
    case "void":
      return voidContract(db, contract, payload)
    case "execute":
      return executeContract(db, contract)
  }
}

async function issueContract(
  db: PostgresJsDatabase,
  contract: Contract,
): Promise<{ contract: Contract; event: ContractLifecycleEvent }> {
  if (contract.status !== "draft") {
    throw new ToolError("Only draft contracts can be issued.", "INVALID_INPUT", {
      contractId: contract.id,
    })
  }

  let contractNumber = contract.contractNumber
  const metadata =
    contract.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
      ? (contract.metadata as Record<string, unknown>)
      : {}
  const immutableReviewedRevision = parseManagedBookingContractReviewWorkflow(metadata) !== null
  if (!immutableReviewedRevision && !contractNumber && contract.seriesId) {
    const allocated = await allocateContractNumber(db, contract.seriesId)
    if (allocated) contractNumber = allocated.number
  }
  const baseVariables = (contract.variables as Record<string, unknown> | null) ?? {}
  const variables = contractNumber
    ? mergeContractNumberIntoVariables(baseVariables, contractNumber)
    : baseVariables
  let renderedBody = contract.renderedBody
  let renderedBodyFormat = contract.renderedBodyFormat
  if (!immutableReviewedRevision && contract.templateVersionId) {
    const [version] = await db
      .select()
      .from(contractTemplateVersions)
      .where(eq(contractTemplateVersions.id, contract.templateVersionId))
      .limit(1)
    if (version) {
      renderedBody = renderTemplate(version.body, "html", variables)
      renderedBodyFormat = "html"
    }
  }
  const now = new Date()
  const stageHistory = appendContractStageHistory(
    contract.stageHistory,
    createContractStageHistoryEntry("issued", {
      previousStage: contract.status,
      transition: "issued",
      enteredAt: now,
    }),
  )
  const [updated] = await db
    .update(contracts)
    .set({
      status: "issued",
      stageHistory,
      issuedAt: now,
      renderedBody,
      renderedBodyFormat,
      contractNumber,
      variables: variables !== baseVariables ? variables : contract.variables,
      updatedAt: now,
    })
    .where(eq(contracts.id, contract.id))
    .returning()
  if (!updated) throw new Error("Contract issue transition did not return a row")
  return {
    contract: updated,
    event: buildContractLifecycleEvent(updated, contract.status, "issued", "issued", now),
  }
}

async function sendContract(
  db: PostgresJsDatabase,
  contract: Contract,
  payload: ExistingTargetCommandPayload<LifecycleCommandPayload>,
): Promise<{ contract: Contract; event: ContractLifecycleEvent }> {
  if (contract.status !== "issued") {
    throw new ToolError("Only issued contracts can be sent.", "INVALID_INPUT", {
      contractId: contract.id,
    })
  }
  const delivery = sendDelivery(payload)
  const metadata =
    contract.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
      ? (contract.metadata as Record<string, unknown>)
      : {}
  const managedWorkflow = parseManagedBookingContractReviewWorkflow(metadata)
  const expectedRevision = managedWorkflow?.revision ?? 1
  if (managedWorkflow && !("contentFingerprint" in payload)) {
    throw new ToolError(
      "Booking contract revisions require an exact review content fingerprint.",
      "INVALID_INPUT",
    )
  }
  if ("contentFingerprint" in payload) {
    const currentFingerprint = await bookingContractContentFingerprint(contract)
    if (payload.contentFingerprint !== currentFingerprint) {
      throw new ToolError(
        "The approved contract content is no longer the reviewed content.",
        "INVALID_INPUT",
        { contractId: contract.id, currentFingerprint },
      )
    }
  }
  if ("revision" in payload && delivery.revision !== expectedRevision) {
    throw new ToolError(
      "The approved contract revision is no longer the selected revision.",
      "INVALID_INPUT",
      {
        contractId: contract.id,
        expectedRevision,
        approvedRevision: delivery.revision,
      },
    )
  }
  const now = new Date()
  const stageHistory = appendContractStageHistory(
    contract.stageHistory,
    createContractStageHistoryEntry("sent", {
      previousStage: contract.status,
      transition: "sent",
      enteredAt: now,
    }),
  )
  const [updated] = await db
    .update(contracts)
    .set({
      status: "sent",
      stageHistory,
      sentAt: now,
      metadata: managedWorkflow
        ? {
            ...metadata,
            bookingContractWorkflow: {
              ...managedWorkflow,
              reviewOnly: false,
              delivery: {
                recipient: delivery.recipient,
                channel: delivery.channel,
                revision: delivery.revision,
                notificationsSuppressed: delivery.notificationsSuppressed,
              },
            },
          }
        : metadata,
      updatedAt: now,
    })
    .where(eq(contracts.id, contract.id))
    .returning()
  if (!updated) throw new Error("Contract send transition did not return a row")
  return {
    contract: updated,
    event: buildContractLifecycleEvent(updated, contract.status, "sent", "sent", now, delivery),
  }
}

async function executeContract(
  db: PostgresJsDatabase,
  contract: Contract,
): Promise<{ contract: Contract; event: ContractLifecycleEvent }> {
  if (contract.status !== "signed") {
    throw new ToolError("Only authoritatively signed contracts can be executed.", "INVALID_INPUT", {
      contractId: contract.id,
    })
  }
  const now = new Date()
  const stageHistory = appendContractStageHistory(
    contract.stageHistory,
    createContractStageHistoryEntry("executed", {
      previousStage: contract.status,
      transition: "executed",
      enteredAt: now,
    }),
  )
  const [updated] = await db
    .update(contracts)
    .set({ status: "executed", stageHistory, executedAt: now, updatedAt: now })
    .where(eq(contracts.id, contract.id))
    .returning()
  if (!updated) throw new Error("Contract execute transition did not return a row")
  return {
    contract: updated,
    event: buildContractLifecycleEvent(updated, contract.status, "executed", "executed", now),
  }
}

async function voidContract(
  db: PostgresJsDatabase,
  contract: Contract,
  payload: ExistingTargetCommandPayload<LifecycleCommandPayload>,
): Promise<{ contract: Contract; event: ContractLifecycleEvent }> {
  if (contract.status === "void") {
    throw new ToolError("Contract is already void.", "INVALID_INPUT", { contractId: contract.id })
  }
  if (
    !("revision" in payload) ||
    !("reason" in payload) ||
    !("acknowledgedConsequences" in payload) ||
    payload.acknowledgedConsequences !== true
  ) {
    throw new LegalContractLifecycleCommandError("result_identity_mismatch")
  }
  const metadata =
    contract.metadata && typeof contract.metadata === "object" && !Array.isArray(contract.metadata)
      ? (contract.metadata as Record<string, unknown>)
      : {}
  const managedWorkflow = parseManagedBookingContractReviewWorkflow(metadata)
  if (managedWorkflow && payload.revision !== managedWorkflow.revision) {
    throw new ToolError(
      "The approved contract revision is no longer the selected revision.",
      "INVALID_INPUT",
    )
  }
  const now = new Date()
  const stageHistory = appendContractStageHistory(
    contract.stageHistory,
    createContractStageHistoryEntry("void", {
      previousStage: contract.status,
      transition: "voided",
      enteredAt: now,
    }),
  )
  const [updated] = await db
    .update(contracts)
    .set({
      status: "void",
      stageHistory,
      voidedAt: now,
      metadata: managedWorkflow
        ? {
            ...metadata,
            bookingContractWorkflow: {
              ...managedWorkflow,
              voidReason: payload.reason,
              voidedRevision: payload.revision,
            },
          }
        : contract.metadata,
      updatedAt: now,
    })
    .where(eq(contracts.id, contract.id))
    .returning()
  if (!updated) throw new Error("Contract void transition did not return a row")
  return {
    contract: updated,
    event: buildContractLifecycleEvent(updated, contract.status, "void", "voided", now),
  }
}

function sendDelivery(
  payload: ExistingTargetCommandPayload<LifecycleCommandPayload>,
): NonNullable<ContractLifecycleEvent["delivery"]> {
  if ("recipientEmail" in payload) {
    return {
      recipientEmail: payload.recipientEmail,
      recipient: payload.recipientEmail,
      channel: payload.recipientEmail ? "email" : null,
      revision: null,
      notificationsSuppressed: false,
      subject: payload.subject,
      message: payload.message,
    }
  }
  if (
    !("recipient" in payload) ||
    !("channel" in payload) ||
    !("revision" in payload) ||
    !("notificationsSuppressed" in payload) ||
    !("subject" in payload) ||
    !("message" in payload)
  ) {
    throw new LegalContractLifecycleCommandError("result_identity_mismatch")
  }
  return {
    recipientEmail: payload.channel === "email" ? payload.recipient : null,
    recipient: payload.recipient,
    channel: payload.channel,
    revision: payload.revision,
    notificationsSuppressed: payload.notificationsSuppressed,
    subject: payload.subject,
    message: payload.message,
  }
}

function normalizeCommandInput(
  transition: LifecycleTransition,
  commandInput: ExecuteLegalContractLifecycleCommandInput["commandInput"],
): LifecycleCommandPayload {
  if (transition === "void") {
    return {
      contractId: commandInput.contractId,
      revision: commandInput.revision as number,
      reason: commandInput.reason as string,
      acknowledgedConsequences: commandInput.acknowledgedConsequences as true,
    }
  }
  if (transition !== "send") return { contractId: commandInput.contractId }
  if (!("recipient" in commandInput) || !commandInput.contentFingerprint) {
    return {
      contractId: commandInput.contractId,
      recipientEmail:
        "recipientEmail" in commandInput
          ? (commandInput.recipientEmail ?? null)
          : (commandInput.recipient ?? null),
      subject: "subject" in commandInput ? (commandInput.subject ?? null) : null,
      message: "message" in commandInput ? (commandInput.message ?? null) : null,
    }
  }
  return {
    contractId: commandInput.contractId,
    recipient: commandInput.recipient as string,
    channel: commandInput.channel as "email" | "sms" | "whatsapp",
    revision: commandInput.revision as number,
    contentFingerprint: commandInput.contentFingerprint as string,
    notificationsSuppressed: commandInput.notificationsSuppressed ?? false,
    subject: "subject" in commandInput ? (commandInput.subject ?? null) : null,
    message: "message" in commandInput ? (commandInput.message ?? null) : null,
  }
}

function assertAdmittedPolicy(
  admitted: ToolHandlerActionPolicyContext,
  policy: LifecyclePolicy,
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
    throw new LegalContractLifecycleCommandError("admitted_policy_mismatch")
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
