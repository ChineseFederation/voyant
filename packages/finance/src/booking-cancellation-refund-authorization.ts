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

import type { BookingCancellationRefundConsequence } from "./service-booking-cancellation-refund.js"

export const BOOKING_CANCELLATION_REFUND_CAPABILITY = {
  id: "finance:booking-cancellation-refund",
  version: "v1",
  resource: "finance",
  action: "refund",
  risk: "critical",
  ledgerPolicy: "required",
  approvalPolicy: "required",
  reversible: false,
  allowedActorTypes: ["staff", "system"],
  requiredGrants: [
    { resource: "finance", action: "refund" },
    { resource: "bookings", action: "read" },
  ],
} as const satisfies ActionLedgerCapabilityDefinition

export const BOOKING_CANCELLATION_REFUND_APPROVAL_POLICY =
  "finance-booking-cancellation-refund-approval-v1"
export const BOOKING_CANCELLATION_REFUND_ACTION_NAME = "finance.booking.refund_cancellation"
export const BOOKING_CANCELLATION_REFUND_TOOL_NAME = "finance.refund_cancelled_booking"

export type BookingCancellationRefundCommand = BookingCancellationRefundConsequence & {
  method: "bank_transfer" | "cash" | "cheque" | "other"
  reference: string | null
}

export interface AuthorizeBookingCancellationRefundInput {
  db: PostgresJsDatabase
  commandInput: BookingCancellationRefundCommand
  actor?: string | null
  callerType?: string | null
  scopes?: readonly string[] | null
  isInternalRequest?: boolean | null
  requestContext: ActionLedgerRequestContextValues
  approvalId?: string | null
  idempotencyKey: string
}

export type BookingCancellationRefundAuthorizationResult =
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
  | { status: "already_executed"; access: ActionLedgerCapabilityAccessResult; creditNoteId: string }
  | { status: "denied"; access: ActionLedgerCapabilityAccessResult }
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

export async function authorizeBookingCancellationRefund(
  input: AuthorizeBookingCancellationRefundInput,
): Promise<BookingCancellationRefundAuthorizationResult> {
  const access = evaluateActionLedgerCapabilityAccess({
    definition: BOOKING_CANCELLATION_REFUND_CAPABILITY,
    actor: input.actor,
    callerType: input.callerType,
    scopes: input.scopes,
    isInternalRequest: input.isInternalRequest,
  })
  if (!access.allowed) {
    await appendActionLedgerMutation(input.db, {
      context: input.requestContext,
      actionName: BOOKING_CANCELLATION_REFUND_ACTION_NAME,
      actionVersion: BOOKING_CANCELLATION_REFUND_CAPABILITY.version,
      actionKind: "execute",
      status: "denied",
      evaluatedRisk: access.evaluatedRisk,
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: BOOKING_CANCELLATION_REFUND_TOOL_NAME,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      mutationDetail: {
        summary: `Booking cancellation refund denied: ${access.reason}`,
        reversalKind: "none",
      },
    })
    return { status: "denied", access }
  }

  const approvalRequirement = evaluateActionLedgerApprovalRequirement({
    access,
    conditionalApprovalRequired: true,
    reasonCode: "booking_cancellation_refund_requested_by_agent",
  })
  const fingerprint = await buildActionApprovalCommandFingerprint({
    actionName: BOOKING_CANCELLATION_REFUND_ACTION_NAME,
    actionVersion: BOOKING_CANCELLATION_REFUND_CAPABILITY.version,
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
      actionName: BOOKING_CANCELLATION_REFUND_ACTION_NAME,
      actionVersion: BOOKING_CANCELLATION_REFUND_CAPABILITY.version,
      requestedActionKind: "execute",
      requestedActionStatus: "awaiting_approval",
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: BOOKING_CANCELLATION_REFUND_TOOL_NAME,
      principalType: principal.principalType,
      principalId: principal.principalId,
      organizationId: principal.organizationId,
      idempotencyFingerprint: fingerprint,
      // The approved intent executes as one command, while its durable result
      // row is the credit note created by that command.
      executionActionKind: "create",
      executionStatus: "succeeded",
    })
    if (!validation.ok) {
      if (validation.reason === "already_executed" && validation.existingActionId) {
        const existing = await actionLedgerService.getEntry(input.db, validation.existingActionId)
        const resultRef = existing?.mutationDetail?.commandResultRef
        if (resultRef?.startsWith("credit_note:")) {
          return {
            status: "already_executed",
            access,
            creditNoteId: resultRef.slice("credit_note:".length),
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

  try {
    const result = await requestActionLedgerApproval(input.db, {
      context: input.requestContext,
      actionName: BOOKING_CANCELLATION_REFUND_ACTION_NAME,
      actionVersion: BOOKING_CANCELLATION_REFUND_CAPABILITY.version,
      actionKind: "execute",
      evaluatedRisk: approvalRequirement.evaluatedRisk,
      targetType: "booking",
      targetId: input.commandInput.bookingId,
      routeOrToolName: BOOKING_CANCELLATION_REFUND_TOOL_NAME,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      idempotencyScope: `${BOOKING_CANCELLATION_REFUND_TOOL_NAME}:${input.commandInput.bookingId}`,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      mutationDetail: {
        summary: `Refund ${input.commandInput.amountCents} ${input.commandInput.currency} cents for cancelled booking ${input.commandInput.bookingNumber}`,
        reversalKind: "none",
      },
      approval: {
        policyName: BOOKING_CANCELLATION_REFUND_APPROVAL_POLICY,
        policyVersion: BOOKING_CANCELLATION_REFUND_CAPABILITY.version,
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
