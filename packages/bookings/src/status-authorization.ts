/** Transport-neutral authorization and approval orchestration for booking status mutations. */

import {
  type ActionLedgerCapabilityAccessResult,
  ActionLedgerIdempotencyConflictError,
  type ActionLedgerRequestContextValues,
  actionLedgerService,
  appendActionLedgerMutation,
  type BuildActionLedgerApprovedExecutionFieldsInput,
  buildActionApprovalCommandFingerprint,
  buildIdempotencyFingerprint,
  evaluateActionLedgerApprovalRequirement,
  evaluateActionLedgerCapabilityAccess,
  mapActionLedgerRequestContext,
  requestActionLedgerApproval,
} from "@voyant-travel/action-ledger"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { BOOKING_STATUS_CAPABILITIES } from "./action-ledger-capabilities.js"
import { bookingsService } from "./service.js"

export const BOOKING_STATUS_APPROVAL_POLICY = "bookings-status-approval-v1"

export type BookingStatusCapabilityKey = keyof typeof BOOKING_STATUS_CAPABILITIES

export type BookingStatusApprovalTargetState =
  | { exists: false }
  | {
      exists: true
      status: string
      sellCurrency: string
      sellAmountCents: number | null
      costAmountCents: number | null
      customerPaymentPolicy: unknown
      confirmedAt: string | null
      cancelledAt: string | null
      completedAt: string | null
    }

export interface BookingStatusAuthorizationInput {
  db: PostgresJsDatabase
  key: BookingStatusCapabilityKey
  actionName: string
  routeOrToolName: string
  bookingId: string
  commandInput?: unknown
  actor?: string | null
  callerType?: string | null
  scopes?: readonly string[] | null
  isInternalRequest?: boolean | null
  requestContext: ActionLedgerRequestContextValues
  conditionalApprovalRequired: boolean
  approvalReasonCode: string | null
  approvalId?: string | null
  idempotencyKey?: string | null
}

export type BookingStatusAuthorizationResult =
  | {
      status: "authorized"
      access: ActionLedgerCapabilityAccessResult
      approvedAction?: BuildActionLedgerApprovedExecutionFieldsInput
    }
  | {
      status: "approval_required"
      access: ActionLedgerCapabilityAccessResult
      requestedAction: Awaited<ReturnType<typeof requestActionLedgerApproval>>["requestedAction"]
      approval: Awaited<ReturnType<typeof requestActionLedgerApproval>>["approval"]
      replayed: boolean
    }
  | {
      status: "already_executed"
      access: ActionLedgerCapabilityAccessResult
      bookingId: string
    }
  | {
      status: "denied"
      access: ActionLedgerCapabilityAccessResult
    }
  | {
      status: "missing_idempotency_key"
      access: ActionLedgerCapabilityAccessResult
    }
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

export async function authorizeBookingStatusMutation(
  input: BookingStatusAuthorizationInput,
): Promise<BookingStatusAuthorizationResult> {
  const capability = BOOKING_STATUS_CAPABILITIES[input.key]
  const access = evaluateActionLedgerCapabilityAccess({
    definition: capability,
    actor: input.actor,
    callerType: input.callerType,
    scopes: input.scopes,
    isInternalRequest: input.isInternalRequest,
  })

  if (!access.allowed) {
    await appendActionLedgerMutation(input.db, {
      context: input.requestContext,
      actionName: input.actionName,
      actionVersion: capability.version,
      actionKind: "update",
      status: "denied",
      evaluatedRisk: access.evaluatedRisk,
      targetType: "booking",
      targetId: input.bookingId,
      routeOrToolName: input.routeOrToolName,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      mutationDetail: {
        summary: `Booking status ${capability.action} denied: ${access.reason}`,
        reversalKind: "none",
      },
    })
    return { status: "denied", access }
  }

  const approvalRequirement = evaluateActionLedgerApprovalRequirement({
    access,
    conditionalApprovalRequired: input.conditionalApprovalRequired,
    reasonCode: input.approvalReasonCode,
  })
  if (!approvalRequirement.required) return { status: "authorized", access }

  const commandFingerprint = await buildBookingStatusCommandFingerprint(input, access)
  if (input.approvalId) {
    const replay = await resolveExecutedBookingStatusReplay(input, access, commandFingerprint)
    if (replay) return replay
  }

  const targetState = await loadBookingStatusApprovalTargetState(input.db, input.bookingId)
  const fingerprint = await buildBookingStatusApprovalFingerprint(
    input,
    targetState,
    access,
    approvalRequirement,
  )

  if (input.approvalId) {
    const actorFields = mapActionLedgerRequestContext(input.requestContext)
    const validation = await actionLedgerService.validateApprovedAction(input.db, {
      approvalId: input.approvalId,
      actionName: input.actionName,
      actionVersion: capability.version,
      requestedActionKind: "update",
      requestedActionStatus: "awaiting_approval",
      targetType: "booking",
      targetId: input.bookingId,
      routeOrToolName: input.routeOrToolName,
      principalType: actorFields.principalType,
      principalId: actorFields.principalId,
      organizationId: actorFields.organizationId,
      idempotencyFingerprint: fingerprint,
      executionActionKind: "update",
      executionStatus: "succeeded",
    })
    if (!validation.ok) return { status: "invalid_approval", access, validation }
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
      actionName: input.actionName,
      actionVersion: capability.version,
      actionKind: "update",
      evaluatedRisk: approvalRequirement.evaluatedRisk,
      targetType: "booking",
      targetId: input.bookingId,
      routeOrToolName: input.routeOrToolName,
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      authorizationSource: access.authorizationSource,
      idempotencyScope: `${input.routeOrToolName}:${input.bookingId}`,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      mutationDetail: {
        commandInputRef: commandFingerprint,
        summary: `Booking status ${capability.action} awaiting approval: ${approvalRequirement.reasonCode}`,
        reversalKind: "none",
      },
      approval: {
        policyName: BOOKING_STATUS_APPROVAL_POLICY,
        policyVersion: capability.version,
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

async function buildBookingStatusCommandFingerprint(
  input: BookingStatusAuthorizationInput,
  access: ActionLedgerCapabilityAccessResult,
) {
  return buildIdempotencyFingerprint({
    actionName: input.actionName,
    actionVersion: BOOKING_STATUS_CAPABILITIES[input.key].version,
    targetType: "booking",
    targetId: input.bookingId,
    commandInput: input.commandInput ?? null,
    policyInputs: {
      capabilityId: access.capabilityId,
      capabilityVersion: access.capabilityVersion,
      routeOrToolName: input.routeOrToolName,
    },
  })
}

async function resolveExecutedBookingStatusReplay(
  input: BookingStatusAuthorizationInput,
  access: ActionLedgerCapabilityAccessResult,
  commandFingerprint: string,
): Promise<Extract<BookingStatusAuthorizationResult, { status: "already_executed" }> | null> {
  if (!input.approvalId) return null
  const approval = await actionLedgerService.getApproval(input.db, input.approvalId)
  const requested = approval?.requestedAction
  if (approval?.approval.status !== "approved" || !requested) return null
  const principal = mapActionLedgerRequestContext(input.requestContext)
  const entry = requested.entry
  const exactRequest =
    entry.actionName === input.actionName &&
    entry.actionVersion === BOOKING_STATUS_CAPABILITIES[input.key].version &&
    entry.actionKind === "update" &&
    entry.targetType === "booking" &&
    entry.targetId === input.bookingId &&
    entry.routeOrToolName === input.routeOrToolName &&
    entry.capabilityId === access.capabilityId &&
    entry.capabilityVersion === access.capabilityVersion &&
    entry.principalType === principal.principalType &&
    entry.principalId === principal.principalId &&
    entry.organizationId === principal.organizationId &&
    entry.idempotencyKey === input.idempotencyKey &&
    requested.mutationDetail?.commandInputRef === commandFingerprint
  if (!exactRequest) return null

  const execution = await actionLedgerService.listEntries(input.db, {
    actionName: input.actionName,
    actionKind: "update",
    targetType: "booking",
    targetId: input.bookingId,
    routeOrToolName: input.routeOrToolName,
    causationActionId: entry.id,
    approvalId: approval.approval.id,
    status: "succeeded",
    limit: 1,
  })
  return execution.entries.length > 0
    ? { status: "already_executed", access, bookingId: input.bookingId }
    : null
}

async function buildBookingStatusApprovalFingerprint(
  input: BookingStatusAuthorizationInput,
  targetState: BookingStatusApprovalTargetState,
  access: ActionLedgerCapabilityAccessResult,
  approvalRequirement: ReturnType<typeof evaluateActionLedgerApprovalRequirement>,
) {
  return buildActionApprovalCommandFingerprint({
    actionName: input.actionName,
    actionVersion: BOOKING_STATUS_CAPABILITIES[input.key].version,
    targetType: "booking",
    targetId: input.bookingId,
    commandInput: { command: input.commandInput ?? null, targetState },
    approvalPolicy: approvalRequirement.approvalPolicy,
    capabilityId: access.capabilityId,
    capabilityVersion: access.capabilityVersion,
    evaluatedRisk: approvalRequirement.evaluatedRisk,
    reasonCode: approvalRequirement.reasonCode,
  })
}

async function loadBookingStatusApprovalTargetState(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingStatusApprovalTargetState> {
  const booking = await bookingsService.getBookingById(db, bookingId)
  if (!booking) return { exists: false }
  return {
    exists: true,
    status: booking.status,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents,
    costAmountCents: booking.costAmountCents,
    customerPaymentPolicy: booking.customerPaymentPolicy,
    confirmedAt: serializeDate(booking.confirmedAt),
    cancelledAt: serializeDate(booking.cancelledAt),
    completedAt: serializeDate(booking.completedAt),
  }
}

function serializeDate(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}
