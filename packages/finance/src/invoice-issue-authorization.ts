/** Exact approval and idempotency orchestration for invoice issue Tools. */

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

import type { CreateInvoiceFromBookingInput } from "./service.js"

export const FINANCE_INVOICE_ISSUE_CAPABILITY = {
  id: "finance:invoice-issue-from-booking",
  version: "v1",
  resource: "finance",
  action: "write",
  risk: "high",
  ledgerPolicy: "required",
  approvalPolicy: "required",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [
    { resource: "finance", action: "write" },
    { resource: "bookings", action: "read" },
  ],
} as const satisfies ActionLedgerCapabilityDefinition

export const FINANCE_INVOICE_ISSUE_APPROVAL_POLICY = "finance-invoice-issue-approval-v1"
export const FINANCE_INVOICE_ISSUE_ACTION_NAME = "finance.invoice.issue_from_booking"
export const FINANCE_INVOICE_ISSUE_TOOL_NAME = "finance.issue_invoice_from_booking"

export interface FinanceInvoiceIssueAuthorizationInput {
  db: PostgresJsDatabase
  commandInput: CreateInvoiceFromBookingInput & {
    bookingUpdatedAt?: string
    snapshotFingerprint?: string
  }
  actor?: string | null
  callerType?: string | null
  scopes?: readonly string[] | null
  isInternalRequest?: boolean | null
  requestContext: ActionLedgerRequestContextValues
  approvalId?: string | null
  idempotencyKey?: string | null
}

export type FinanceInvoiceIssueAuthorizationResult =
  | {
      status: "authorized"
      access: ActionLedgerCapabilityAccessResult
      approvedAction: BuildActionLedgerApprovedExecutionFieldsInput
    }
  | {
      status: "approval_required"
      access: ActionLedgerCapabilityAccessResult
      requestedAction: Awaited<ReturnType<typeof requestActionLedgerApproval>>["requestedAction"]
      approval: Awaited<ReturnType<typeof requestActionLedgerApproval>>["approval"]
      replayed: boolean
    }
  | { status: "already_executed"; access: ActionLedgerCapabilityAccessResult; invoiceId: string }
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

export async function authorizeFinanceInvoiceIssue(
  input: FinanceInvoiceIssueAuthorizationInput,
): Promise<FinanceInvoiceIssueAuthorizationResult> {
  const access = evaluateActionLedgerCapabilityAccess({
    definition: FINANCE_INVOICE_ISSUE_CAPABILITY,
    actor: input.actor,
    callerType: input.callerType,
    scopes: input.scopes,
    isInternalRequest: input.isInternalRequest,
  })
  if (!access.allowed) {
    await appendActionLedgerMutation(input.db, {
      context: input.requestContext,
      actionName: FINANCE_INVOICE_ISSUE_ACTION_NAME,
      actionVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
      actionKind: "create",
      status: "denied",
      evaluatedRisk: access.evaluatedRisk,
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: FINANCE_INVOICE_ISSUE_TOOL_NAME,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      mutationDetail: {
        summary: `Invoice issue denied: ${access.reason}`,
        reversalKind: "none",
      },
    })
    return { status: "denied", access }
  }

  const approvalRequirement = evaluateActionLedgerApprovalRequirement({
    access,
    conditionalApprovalRequired: true,
    reasonCode: "invoice_issue_from_booking_requested_by_agent",
  })
  const fingerprint = await buildActionApprovalCommandFingerprint({
    actionName: FINANCE_INVOICE_ISSUE_ACTION_NAME,
    actionVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
    targetType: "booking",
    targetId: input.commandInput.bookingId,
    commandInput: input.commandInput,
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
      actionName: FINANCE_INVOICE_ISSUE_ACTION_NAME,
      actionVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
      requestedActionKind: "create",
      requestedActionStatus: "awaiting_approval",
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: FINANCE_INVOICE_ISSUE_TOOL_NAME,
      principalType: principal.principalType,
      principalId: principal.principalId,
      organizationId: principal.organizationId,
      idempotencyFingerprint: fingerprint,
      executionActionKind: "create",
      executionStatus: "succeeded",
    })
    if (!validation.ok) {
      if (validation.reason === "already_executed" && validation.existingActionId) {
        const existing = await actionLedgerService.getEntry(input.db, validation.existingActionId)
        const resultRef = existing?.mutationDetail?.commandResultRef
        if (resultRef?.startsWith("invoice:")) {
          return {
            status: "already_executed",
            access,
            invoiceId: resultRef.slice("invoice:".length),
          }
        }
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
    }
  }

  if (!input.idempotencyKey) return { status: "missing_idempotency_key", access }
  try {
    const result = await requestActionLedgerApproval(input.db, {
      context: input.requestContext,
      actionName: FINANCE_INVOICE_ISSUE_ACTION_NAME,
      actionVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
      actionKind: "create",
      evaluatedRisk: approvalRequirement.evaluatedRisk,
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: FINANCE_INVOICE_ISSUE_TOOL_NAME,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      idempotencyScope: `${FINANCE_INVOICE_ISSUE_TOOL_NAME}:${input.commandInput.bookingId}`,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      mutationDetail: {
        summary: "Invoice issue from booking awaiting approval",
        reversalKind: "none",
      },
      approval: {
        policyName: FINANCE_INVOICE_ISSUE_APPROVAL_POLICY,
        policyVersion: FINANCE_INVOICE_ISSUE_CAPABILITY.version,
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
