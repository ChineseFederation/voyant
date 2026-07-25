import {
  type ActionLedgerRequestContextValues,
  buildActionLedgerApprovedExecutionFields,
} from "@voyant-travel/action-ledger"
import { isStaffRbacEnforced } from "@voyant-travel/hono"
import { defineToolContextContribution, ToolError } from "@voyant-travel/tools"
import type { Context } from "hono"
import { contributeBookingsExtrasToolContext } from "./extras/mcp-runtime.js"
import { redactBookingContact, shouldRevealBookingPii } from "./pii-redaction.js"
import { contributeBookingRequirementsToolContext } from "./requirements/mcp-runtime.js"
import {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  type BookingRouteRuntime,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
import type { Env } from "./routes-shared.js"
import { bookingsService } from "./service.js"
import { authorizeBookingStatusMutation } from "./status-authorization.js"

export * from "./tools.js"

export const voyantToolContextContribution = defineToolContextContribution({
  context: ["bookings", "bookingsExtras", "bookingRequirements"],
  contribute: (input) => {
    const { request, context } = input
    const c = request as Context<Env>
    const db = context.db as Parameters<typeof bookingsService.listBookings>[0]
    const reveal = shouldRevealBookingPii({
      actor: c.var.actor,
      scopes: c.var.scopes,
      callerType: c.var.callerType,
      isInternalRequest: c.var.isInternalRequest,
      enforceRbac: isStaffRbacEnforced(c.env),
    })
    return Object.assign(
      {
        bookings: {
          async listBookings(query: Parameters<typeof bookingsService.listBookings>[1]) {
            const result = await bookingsService.listBookings(db, query)
            if (reveal || !isRecord(result) || !Array.isArray(result.data)) return result
            return { ...result, data: result.data.map(redactBookingRow) }
          },
          async getBookingById(id: string) {
            const row = await bookingsService.getBookingById(db, id)
            return reveal ? row : redactBookingRow(row)
          },
          getBookingAggregates: (
            query: Parameters<typeof bookingsService.getBookingAggregates>[1],
          ) => bookingsService.getBookingAggregates(db, query),
          async cancelBooking(input: {
            id: string
            note?: string
            idempotencyKey: string
            approvalId?: string
          }) {
            const requestContext = bookingToolActionLedgerContext(c)
            const authorization = await authorizeBookingStatusMutation({
              db,
              key: "cancel",
              actionName: "booking.status.cancel",
              routeOrToolName: "bookings.cancel_booking",
              bookingId: input.id,
              commandInput: { note: input.note ?? null },
              actor: c.get("actor"),
              callerType: c.get("callerType"),
              scopes: c.get("scopes"),
              isInternalRequest: c.get("isInternalRequest"),
              requestContext,
              conditionalApprovalRequired: true,
              approvalReasonCode: "cancel_requested_by_agent",
              approvalId: input.approvalId ?? null,
              idempotencyKey: input.idempotencyKey,
            })

            if (authorization.status === "approval_required") {
              return {
                status: "approval_required" as const,
                requestedAction: {
                  id: authorization.requestedAction.id,
                  status: authorization.requestedAction.status,
                  actionName: authorization.requestedAction.actionName,
                  targetType: authorization.requestedAction.targetType,
                  targetId: authorization.requestedAction.targetId,
                },
                approval: {
                  id: authorization.approval.id,
                  status: authorization.approval.status,
                  requestedActionId: authorization.approval.requestedActionId,
                  policyName: authorization.approval.policyName,
                  policyVersion: authorization.approval.policyVersion,
                  riskSnapshot: authorization.approval.riskSnapshot,
                  reasonCode: authorization.approval.reasonCode,
                  expiresAt: toIsoString(authorization.approval.expiresAt),
                  createdAt: toIsoString(authorization.approval.createdAt),
                },
                replayed: authorization.replayed,
              }
            }

            if (authorization.status !== "authorized") {
              throw bookingAuthorizationToolError(authorization)
            }
            if (!authorization.approvedAction) {
              throw new ToolError(
                "Booking cancellation requires an approved action.",
                "AUTHORIZATION_DENIED",
              )
            }

            const approved = buildActionLedgerApprovedExecutionFields(authorization.approvedAction)
            const routeRuntime = getBookingToolRouteRuntime(c)
            const result = await bookingsService.cancelBooking(
              db,
              input.id,
              { note: input.note },
              c.get("userId") ?? c.get("agentId") ?? "agent",
              {
                eventBus: c.get("eventBus"),
                closePaymentSchedulesForBooking: routeRuntime.closePaymentSchedulesForBooking,
                recordCancellationFinancialSettlement:
                  routeRuntime.recordCancellationFinancialSettlement,
                actionLedgerContext: requestContext,
                actionLedgerAuthorizationSource: authorization.access.authorizationSource,
                actionLedgerCausationActionId: approved.causationActionId,
                actionLedgerApprovalId: approved.approvalId,
                actionLedgerIdempotencyScope: approved.idempotencyScope,
                actionLedgerIdempotencyKey: approved.idempotencyKey,
                actionLedgerIdempotencyFingerprint: approved.idempotencyFingerprint,
                actionLedgerRouteOrToolName: "bookings.cancel_booking",
              },
            )
            if (result.status === "not_found") {
              throw new ToolError(`Booking "${input.id}" was not found.`, "NOT_FOUND", {
                bookingId: input.id,
              })
            }
            if (result.status !== "ok" || !result.booking) {
              throw new ToolError(
                `Booking "${input.id}" cannot transition to cancelled.`,
                "INVALID_INPUT",
                { bookingId: input.id, status: result.status },
              )
            }
            return {
              status: "cancelled" as const,
              booking: {
                id: result.booking.id,
                bookingNumber: result.booking.bookingNumber,
                status: "cancelled" as const,
                cancelledAt: toIsoString(result.booking.cancelledAt),
                updatedAt: toIsoString(result.booking.updatedAt),
              },
            }
          },
        },
      },
      contributeBookingsExtrasToolContext(input),
      contributeBookingRequirementsToolContext(input),
    )
  },
})

function bookingToolActionLedgerContext(c: Context<Env>): ActionLedgerRequestContextValues {
  return {
    userId: c.get("userId") ?? null,
    agentId: c.get("agentId") ?? null,
    workflowPrincipalId: c.get("workflowPrincipalId") ?? null,
    principalSubtype: c.get("principalSubtype") ?? null,
    sessionId: c.get("sessionId") ?? null,
    apiTokenId: c.get("apiTokenId") ?? c.get("apiKeyId") ?? null,
    callerType: c.get("callerType") ?? null,
    actor: c.get("actor") ?? null,
    isInternalRequest: c.get("isInternalRequest") ?? false,
    organizationId: c.get("organizationId") ?? null,
    workflowRunId: c.get("workflowRunId") ?? null,
    workflowStepId: c.get("workflowStepId") ?? null,
    correlationId: c.req.header("x-correlation-id") ?? c.req.header("x-request-id") ?? null,
  }
}

function getBookingToolRouteRuntime(c: Context<Env>): BookingRouteRuntime {
  try {
    return (
      c.var.container?.resolve<BookingRouteRuntime>(BOOKING_ROUTE_RUNTIME_CONTAINER_KEY) ??
      buildBookingRouteRuntime(c.env)
    )
  } catch {
    return buildBookingRouteRuntime(c.env)
  }
}

function bookingAuthorizationToolError(
  result: Exclude<
    Awaited<ReturnType<typeof authorizeBookingStatusMutation>>,
    { status: "authorized" | "approval_required" }
  >,
) {
  switch (result.status) {
    case "denied":
      return new ToolError("Booking cancellation is not authorized.", "AUTHORIZATION_DENIED", {
        reason: result.access.reason,
      })
    case "missing_idempotency_key":
      return new ToolError("Booking cancellation requires an idempotency key.", "INVALID_INPUT")
    case "idempotency_conflict":
      return new ToolError(result.message, "INVALID_INPUT", {
        existingActionId: result.existingActionId,
      })
    case "invalid_approval":
      return new ToolError(
        "The approval does not authorize this exact booking cancellation.",
        "INVALID_INPUT",
        {
          reason: result.validation.reason,
          approvalId: result.validation.approval?.id,
        },
      )
  }
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function redactBookingRow<T>(row: T): T {
  return isRecord(row)
    ? (redactBookingContact(row as Parameters<typeof redactBookingContact>[0]) as T)
    : row
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
