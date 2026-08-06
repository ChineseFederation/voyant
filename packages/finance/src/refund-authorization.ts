/**
 * Approval orchestration for refunds.
 *
 * Two entry points. `authorizeFinanceRefund` guards issuing the credit note —
 * the accounting. `authorizeFinanceRefundSettlement` guards the money leg
 * (voyant#4303): recording that the customer was actually paid back, by whatever
 * method, and driving a processor reversal.
 *
 * The money leg does not invent a second authorization path. Its capability is
 * spread from `finance:refund`, so the grant it demands, its `critical` risk and
 * its `required` approval policy are the same values — a deployment configures
 * who may refund once. It carries its own id only because the graph keys one
 * capability per action, and paying a refund is a second action.
 *
 * Both preserve the `authorized` / `approval_required` distinction all the way
 * out to the caller. That is what lets an operator's refund be one button and
 * one dialog when policy permits it, and the *same* button park the action when
 * policy does not — without the UI ever growing a second flow.
 */

import {
  type ActionLedgerCapabilityAccessResult,
  type ActionLedgerCapabilityDefinition,
  ActionLedgerIdempotencyConflictError,
  type ActionLedgerRequestContextValues,
  actionLedgerService,
  appendActionLedgerMutation,
  type BuildActionLedgerApprovedExecutionFieldsInput,
  buildActionApprovalCommandFingerprint,
  evaluateActionLedgerApprovalRequirement,
  evaluateActionLedgerCapabilityAccess,
  mapActionLedgerRequestContext,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { financeService } from "./service.js"

export const FINANCE_REFUND_CAPABILITY = {
  id: "finance:refund",
  version: "v1",
  resource: "invoice",
  action: "refund",
  risk: "critical",
  ledgerPolicy: "required",
  approvalPolicy: "required",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [{ resource: "finance", action: "refund" }],
} as const satisfies ActionLedgerCapabilityDefinition

export const FINANCE_REFUND_APPROVAL_POLICY = "finance-credit-note-refund-approval-v1"
export const FINANCE_REFUND_ACTION_NAME = "finance.credit_note.issue_refund"
export const FINANCE_REFUND_ROUTE_OR_TOOL_NAME = "finance.issue_invoice_refund"

/**
 * The money leg's capability (voyant#4303).
 *
 * Spread from `FINANCE_REFUND_CAPABILITY` on purpose: the grant a caller needs
 * (`finance:refund`), the `critical` risk, the `required` approval policy, the
 * allowed actor types and the irreversibility are literally the same values,
 * so a deployment that has decided who may refund has decided this too and the
 * two cannot drift apart.
 *
 * Only the id and the resource differ, because the graph gives every action its
 * own capability key — one `capabilityId@version` per action — and paying a
 * refund is a second action, not a second name for the first.
 */
export const FINANCE_REFUND_SETTLEMENT_CAPABILITY = {
  ...FINANCE_REFUND_CAPABILITY,
  id: "finance:refund-settlement",
  resource: "refund_settlement",
  /**
   * `conditional`, not `required` — and this is the one place the money leg
   * deliberately differs from the accounting leg.
   *
   * A member of staff holding `finance:refund` **is** the authority. Sending
   * them round an approval loop to approve their own refund is not a control,
   * it is a second click plus a screen explaining why the first one did
   * nothing. Approval exists for principals that are not a person exercising a
   * grant — an agent acting on someone's behalf — and
   * {@link refundSettlementNeedsApproval} is where that line is drawn.
   */
  approvalPolicy: "conditional",
} as const satisfies ActionLedgerCapabilityDefinition

/**
 * Whether *this* caller has to have the refund approved.
 *
 * A human who holds the grant does not: they are the approver. An agent does,
 * whatever grant it is carrying, because the point of the approval is that a
 * person signed off on money leaving — and an internal/system caller is already
 * executing something a person authorized upstream.
 */
export function refundSettlementNeedsApproval(
  access: ActionLedgerCapabilityAccessResult,
  callerType: string | null | undefined,
) {
  if (!access.allowed) return false
  return callerType === "agent"
}

export const FINANCE_REFUND_SETTLEMENT_APPROVAL_POLICY = "finance-refund-settlement-approval-v1"
export const FINANCE_REFUND_SETTLEMENT_ACTION_NAME = "finance.refund.settle"
export const FINANCE_REFUND_SETTLEMENT_ROUTE_OR_TOOL_NAME = "finance.record_refund_settlement"

export interface FinanceRefundAuthorizationInput {
  db: PostgresJsDatabase
  invoiceId: string
  commandInput: unknown
  actor?: string | null
  callerType?: string | null
  scopes?: readonly string[] | null
  isInternalRequest?: boolean | null
  requestContext: ActionLedgerRequestContextValues
  approvalId?: string | null
  idempotencyKey?: string | null
}

export interface FinanceRefundSettlementAuthorizationInput
  extends Omit<FinanceRefundAuthorizationInput, "invoiceId"> {
  /**
   * What is being refunded — the credit note where there is one, otherwise the
   * payment. This is the approval's target, so a reviewer sees the thing the
   * money comes off rather than an opaque settlement id that does not exist yet.
   */
  targetType: "credit_note" | "payment"
  targetId: string
}

/**
 * The shared result shape. `TExecuted` is whatever the already-executed replay
 * resolves to — the credit note for the accounting leg, the settlement for the
 * money leg.
 */
export type FinanceRefundAuthorizationOutcome<TExecuted> =
  | {
      status: "authorized"
      access: ActionLedgerCapabilityAccessResult
      /**
       * The approval this executes under, or `null` when the caller needed
       * none — a person holding the grant is the authority, so there is no
       * approval to point at and the ledger records the execution directly.
       */
      approvedAction: BuildActionLedgerApprovedExecutionFieldsInput | null
      /** Replay identity, present on both paths. */
      execution: {
        idempotencyScope: string
        idempotencyKey: string
        idempotencyFingerprint: string
      }
    }
  | {
      status: "approval_required"
      access: ActionLedgerCapabilityAccessResult
      requestedAction: Awaited<ReturnType<typeof requestActionLedgerApproval>>["requestedAction"]
      approval: Awaited<ReturnType<typeof requestActionLedgerApproval>>["approval"]
      replayed: boolean
    }
  | { status: "already_executed"; access: ActionLedgerCapabilityAccessResult; executed: TExecuted }
  | { status: "denied"; access: ActionLedgerCapabilityAccessResult }
  | { status: "missing_idempotency_key"; access: ActionLedgerCapabilityAccessResult }
  | {
      status: "idempotency_conflict"
      access: ActionLedgerCapabilityAccessResult
      message: string
      existingActionId: string
    }
  | {
      status: "invalid_approval"
      access: ActionLedgerCapabilityAccessResult
      validation: Exclude<
        Awaited<ReturnType<typeof actionLedgerService.validateApprovedAction>>,
        { ok: true }
      >
    }

export type FinanceRefundAuthorizationResult =
  | Exclude<FinanceRefundAuthorizationOutcome<string>, { status: "already_executed" }>
  | {
      status: "already_executed"
      access: ActionLedgerCapabilityAccessResult
      creditNoteId: string
    }

export type FinanceRefundSettlementAuthorizationResult =
  | Exclude<FinanceRefundAuthorizationOutcome<string>, { status: "already_executed" }>
  | {
      status: "already_executed"
      access: ActionLedgerCapabilityAccessResult
      refundSettlementId: string
    }

/** What differs between the accounting leg and the money leg. */
interface FinanceRefundActionSpec {
  capability: ActionLedgerCapabilityDefinition
  /**
   * Whether this caller needs an approval. Defaults to "yes" — the accounting
   * leg's `required` policy makes the answer moot there, but the money leg
   * decides per caller.
   */
  needsApproval?: (access: ActionLedgerCapabilityAccessResult) => boolean
  actionName: string
  routeOrToolName: string
  approvalPolicy: string
  targetType: string
  targetId: string
  reasonCode: string
  deniedSummary: (reason: string) => string
  pendingSummary: string
  loadTargetState(db: PostgresJsDatabase): Promise<unknown>
  /** Prefix of the ledger's `commandResultRef` this action writes. */
  resultRefPrefix: string
}

export async function authorizeFinanceRefund(
  input: FinanceRefundAuthorizationInput,
): Promise<FinanceRefundAuthorizationResult> {
  const outcome = await authorizeFinanceRefundAction(input, {
    capability: FINANCE_REFUND_CAPABILITY,
    actionName: FINANCE_REFUND_ACTION_NAME,
    routeOrToolName: FINANCE_REFUND_ROUTE_OR_TOOL_NAME,
    approvalPolicy: FINANCE_REFUND_APPROVAL_POLICY,
    targetType: "invoice",
    targetId: input.invoiceId,
    reasonCode: "invoice_credit_note_refund_requested_by_agent",
    deniedSummary: (reason) => `Invoice refund denied: ${reason}`,
    pendingSummary: "Invoice credit-note refund awaiting approval",
    loadTargetState: (db) => loadInvoiceRefundTargetState(db, input.invoiceId),
    resultRefPrefix: "credit_note:",
  })
  return outcome.status === "already_executed"
    ? { status: "already_executed", access: outcome.access, creditNoteId: outcome.executed }
    : outcome
}

/**
 * Authorize paying the customer back (voyant#4303).
 *
 * Same grant, same `required` approval policy, same evaluation — so a deployment
 * that has already configured who may refund does not configure it again for the
 * leg that moves the money.
 */
export async function authorizeFinanceRefundSettlement(
  input: FinanceRefundSettlementAuthorizationInput,
): Promise<FinanceRefundSettlementAuthorizationResult> {
  const outcome = await authorizeFinanceRefundAction(input, {
    capability: FINANCE_REFUND_SETTLEMENT_CAPABILITY,
    needsApproval: (access) => refundSettlementNeedsApproval(access, input.callerType),
    actionName: FINANCE_REFUND_SETTLEMENT_ACTION_NAME,
    routeOrToolName: FINANCE_REFUND_SETTLEMENT_ROUTE_OR_TOOL_NAME,
    approvalPolicy: FINANCE_REFUND_SETTLEMENT_APPROVAL_POLICY,
    targetType: input.targetType,
    targetId: input.targetId,
    reasonCode: "refund_settlement_requested_by_agent",
    deniedSummary: (reason) => `Refund settlement denied: ${reason}`,
    pendingSummary: "Refund settlement awaiting approval",
    loadTargetState: (db) => loadRefundSettlementTargetState(db, input.targetType, input.targetId),
    resultRefPrefix: "refund_settlement:",
  })
  return outcome.status === "already_executed"
    ? { status: "already_executed", access: outcome.access, refundSettlementId: outcome.executed }
    : outcome
}

async function authorizeFinanceRefundAction(
  input: Omit<FinanceRefundAuthorizationInput, "invoiceId">,
  spec: FinanceRefundActionSpec,
): Promise<FinanceRefundAuthorizationOutcome<string>> {
  const access = evaluateActionLedgerCapabilityAccess({
    definition: spec.capability,
    actor: input.actor,
    callerType: input.callerType,
    scopes: input.scopes,
    isInternalRequest: input.isInternalRequest,
  })
  if (!access.allowed) {
    await appendActionLedgerMutation(input.db, {
      context: input.requestContext,
      actionName: spec.actionName,
      actionVersion: spec.capability.version,
      actionKind: "create",
      status: "denied",
      evaluatedRisk: access.evaluatedRisk,
      targetType: spec.targetType,
      targetId: spec.targetId,
      routeOrToolName: spec.routeOrToolName,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      mutationDetail: {
        summary: spec.deniedSummary(access.reason),
        reversalKind: "none",
      },
    })
    return { status: "denied", access }
  }

  const approvalRequirement = evaluateActionLedgerApprovalRequirement({
    access,
    conditionalApprovalRequired: spec.needsApproval ? spec.needsApproval(access) : true,
    reasonCode: spec.reasonCode,
  })
  const targetState = await spec.loadTargetState(input.db)
  const fingerprint = await buildActionApprovalCommandFingerprint({
    actionName: spec.actionName,
    actionVersion: spec.capability.version,
    targetType: spec.targetType,
    targetId: spec.targetId,
    commandInput: { command: input.commandInput, targetState },
    approvalPolicy: approvalRequirement.approvalPolicy,
    capabilityId: access.capabilityId,
    capabilityVersion: access.capabilityVersion,
    evaluatedRisk: approvalRequirement.evaluatedRisk,
    reasonCode: approvalRequirement.reasonCode,
  })

  if (input.approvalId) {
    const principal = mapActionLedgerRequestContext(input.requestContext)
    const validation = await actionLedgerService.validateApprovedAction(input.db, {
      approvalId: input.approvalId,
      actionName: spec.actionName,
      actionVersion: spec.capability.version,
      requestedActionKind: "create",
      requestedActionStatus: "awaiting_approval",
      targetType: spec.targetType,
      targetId: spec.targetId,
      routeOrToolName: spec.routeOrToolName,
      principalType: principal.principalType,
      principalId: principal.principalId,
      organizationId: principal.organizationId,
      idempotencyFingerprint: fingerprint,
      executionActionKind: "create",
      executionStatus: "succeeded",
    })
    if (!validation.ok) {
      const requestedAction = validation.requestedAction
      const isExactReplay =
        validation.reason === "already_executed" &&
        requestedAction !== undefined &&
        requestedAction.idempotencyFingerprint === fingerprint &&
        (!principal.principalType ||
          !principal.principalId ||
          (requestedAction.principalType === principal.principalType &&
            requestedAction.principalId === principal.principalId)) &&
        requestedAction.organizationId === principal.organizationId
      if (isExactReplay && validation.existingActionId) {
        const executed = await resolveExecutedCommandResultRef(
          input.db,
          validation.existingActionId,
          spec.resultRefPrefix,
        )
        if (executed) return { status: "already_executed", access, executed }
      }
      return { status: "invalid_approval", access, validation }
    }
    return {
      status: "authorized",
      access,
      approvedAction: {
        requestedActionId: validation.requestedAction.id,
        approvalId: validation.approval.id,
        idempotencyFingerprint: validation.idempotencyFingerprint,
      },
      execution: {
        idempotencyScope: `${spec.routeOrToolName}:${spec.targetId}`,
        idempotencyKey: input.idempotencyKey ?? validation.approval.id,
        idempotencyFingerprint: validation.idempotencyFingerprint,
      },
    }
  }

  if (!input.idempotencyKey) return { status: "missing_idempotency_key", access }

  // Nobody to ask. A person holding `finance:refund` is the authority this
  // action is gated on, so routing them through an approval they would grant
  // themselves adds a screen and no control (voyant#4303).
  if (!approvalRequirement.required) {
    return {
      status: "authorized",
      access,
      approvedAction: null,
      execution: {
        idempotencyScope: `${spec.routeOrToolName}:${spec.targetId}`,
        idempotencyKey: input.idempotencyKey,
        idempotencyFingerprint: fingerprint,
      },
    }
  }

  try {
    const result = await requestActionLedgerApproval(input.db, {
      context: input.requestContext,
      actionName: spec.actionName,
      actionVersion: spec.capability.version,
      actionKind: "create",
      evaluatedRisk: approvalRequirement.evaluatedRisk,
      targetType: spec.targetType,
      targetId: spec.targetId,
      routeOrToolName: spec.routeOrToolName,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      idempotencyScope: `${spec.routeOrToolName}:${spec.targetId}`,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      mutationDetail: {
        summary: spec.pendingSummary,
        reversalKind: "none",
      },
      approval: {
        policyName: spec.approvalPolicy,
        policyVersion: spec.capability.version,
        riskSnapshot: approvalRequirement.evaluatedRisk,
        reasonCode: approvalRequirement.reasonCode,
      },
    })
    return {
      status: "approval_required",
      access,
      requestedAction: result.requestedAction,
      approval: result.approval,
      replayed: result.replayed,
    }
  } catch (error) {
    if (error instanceof ActionLedgerIdempotencyConflictError) {
      return {
        status: "idempotency_conflict",
        access,
        message: error.message,
        existingActionId: error.existingActionId,
      }
    }
    throw error
  }
}

export function parseCreditNoteCommandResultRef(resultRef: string | null): string | null {
  return parseCommandResultRef(resultRef, "credit_note:")
}

export function parseRefundSettlementCommandResultRef(resultRef: string | null): string | null {
  return parseCommandResultRef(resultRef, "refund_settlement:")
}

function parseCommandResultRef(resultRef: string | null, prefix: string): string | null {
  if (!resultRef?.startsWith(prefix)) return null
  const id = resultRef.slice(prefix.length).trim()
  return id || null
}

export async function resolveExecutedRefundCreditNoteId(
  db: PostgresJsDatabase,
  existingActionId: string,
): Promise<string | null> {
  return resolveExecutedCommandResultRef(db, existingActionId, "credit_note:")
}

async function resolveExecutedCommandResultRef(
  db: PostgresJsDatabase,
  existingActionId: string,
  prefix: string,
): Promise<string | null> {
  const existing = await actionLedgerService.getEntry(db, existingActionId)
  return parseCommandResultRef(existing?.mutationDetail?.commandResultRef ?? null, prefix)
}

async function loadInvoiceRefundTargetState(db: PostgresJsDatabase, invoiceId: string) {
  const invoice = await financeService.getInvoiceById(db, invoiceId)
  if (!invoice) return { exists: false as const }
  return {
    exists: true as const,
    status: invoice.status,
    invoiceType: invoice.invoiceType,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    balanceDueCents: invoice.balanceDueCents,
    updatedAt: invoice.updatedAt.toISOString(),
  }
}

/**
 * What the approver is looking at when they approve paying money back.
 *
 * For a payment this includes the refundable remainder, which is the number the
 * decision actually turns on — and it is folded into the approval fingerprint,
 * so an approval granted against one remainder does not execute against a
 * different one after another refund landed in between.
 */
async function loadRefundSettlementTargetState(
  db: PostgresJsDatabase,
  targetType: "credit_note" | "payment",
  targetId: string,
) {
  if (targetType === "credit_note") {
    const creditNote = await financeService.getCreditNoteById(db, targetId)
    if (!creditNote) return { exists: false as const }
    return {
      exists: true as const,
      targetType,
      status: creditNote.status,
      creditNoteNumber: creditNote.creditNoteNumber,
      currency: creditNote.currency,
      amountCents: creditNote.amountCents,
      updatedAt: creditNote.updatedAt.toISOString(),
    }
  }

  const remainder = await financeService.refundSettlements.getPaymentRefundableRemainder(
    db,
    targetId,
  )
  if (!remainder) return { exists: false as const }
  return { exists: true as const, targetType, ...remainder }
}
