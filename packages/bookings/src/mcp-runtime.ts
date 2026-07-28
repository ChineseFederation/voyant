import {
  type ActionLedgerRequestContextValues,
  actionLedgerService,
  canonicalJson,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
import { isStaffRbacEnforced } from "@voyant-travel/hono"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { Context } from "hono"
import { contributeBookingsExtrasToolContext } from "./extras/mcp-runtime.js"
import {
  redactBookingContact,
  redactTravelerIdentity,
  shouldRevealBookingPii,
} from "./pii-redaction.js"
import { contributeBookingRequirementsToolContext } from "./requirements/mcp-runtime.js"
import {
  BOOKING_ROUTE_RUNTIME_CONTAINER_KEY,
  type BookingRouteRuntime,
  buildBookingRouteRuntime,
} from "./route-runtime.js"
import type { Env } from "./routes-shared.js"
import { bookingsService } from "./service.js"

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
    const loadBookingDetail = async (id: string) => {
      const row = await bookingsService.getBookingById(db, id)
      if (!row) return null
      const [items, travelers] = await Promise.all([
        bookingsService.listItems(db, id),
        bookingsService.listTravelers(db, id),
      ])
      return {
        ...(reveal ? row : redactBookingRow(row)),
        items,
        travelers: reveal
          ? travelers
          : travelers.map((traveler) => redactTravelerIdentity(traveler)),
      }
    }
    return Object.assign(
      {
        bookings: {
          async listBookings(query: Parameters<typeof bookingsService.listBookings>[1]) {
            const result = await bookingsService.listBookings(db, query)
            if (reveal || !isRecord(result) || !Array.isArray(result.data)) return result
            return { ...result, data: result.data.map(redactBookingRow) }
          },
          async getBookingById(id: string) {
            return loadBookingDetail(id)
          },
          getBookingAggregates: (
            query: Parameters<typeof bookingsService.getBookingAggregates>[1],
          ) => bookingsService.getBookingAggregates(db, query),
          async cancelBooking(
            input: {
              id: string
              note?: string
              suppressNotifications?: boolean
              idempotencyKey: string
              approvalId?: string
            },
            admitted: ToolHandlerActionPolicyContext,
          ) {
            return executeBookingStatusToolCommand({
              action: "cancel",
              db,
              c,
              input,
              admitted,
              loadBookingDetail,
            })
          },
          async confirmBooking(
            input: {
              id: string
              note?: string
              suppressNotifications?: boolean
              idempotencyKey: string
              approvalId?: string
            },
            admitted: ToolHandlerActionPolicyContext,
          ) {
            return executeBookingStatusToolCommand({
              action: "confirm",
              db,
              c,
              input,
              admitted,
              loadBookingDetail,
            })
          },
        },
      },
      contributeBookingsExtrasToolContext(input),
      contributeBookingRequirementsToolContext(input),
    )
  },
})

type BookingStatusToolAction = "confirm" | "cancel"
type BufferedEvent = {
  event: string
  data: unknown
  metadata?: unknown
  options?: unknown
}

async function executeBookingStatusToolCommand(input: {
  action: BookingStatusToolAction
  db: Parameters<typeof bookingsService.getBookingById>[0]
  c: Context<Env>
  input: {
    id: string
    note?: string
    suppressNotifications?: boolean
    idempotencyKey: string
    approvalId?: string
  }
  admitted: ToolHandlerActionPolicyContext
  loadBookingDetail: (id: string) => Promise<unknown>
}) {
  const preview = await bookingStatusConsequencePreviewForAdmission(input)
  const previewJson = canonicalJson(preview)
  const bufferedEvents: BufferedEvent[] = []
  const bufferingEventBus = {
    async emit(event: string, data: unknown, metadata?: unknown, options?: unknown) {
      bufferedEvents.push({ event, data, metadata, options })
    },
    subscribe() {
      return { unsubscribe() {} }
    },
  } as EventBus
  const routeRuntime = getBookingToolRouteRuntime(input.c)
  const result = await executeAdmittedExistingTargetCommand(
    {
      db: input.db,
      context: bookingToolActionLedgerContext(input.c),
      admitted: input.admitted,
      commandInput: {
        id: input.input.id,
        note: input.input.note ?? null,
        suppressNotifications: input.input.suppressNotifications === true,
        consequencePreview: preview,
      },
      evaluatedRisk: input.action === "confirm" ? "high" : "critical",
      idempotencyKey: input.input.idempotencyKey,
      targetId: input.input.id,
      approvalMutationDetail: {
        commandInputRef: previewJson,
        summary: bookingStatusConsequenceSummary(input.action, preview),
        reversalKind: "none",
      },
      approvalErrorMetadata: { consequencePreview: preview },
    },
    {
      async prepare(tx) {
        const currentPreview = await loadBookingStatusConsequencePreview(
          tx as Parameters<typeof bookingsService.getBookingById>[0],
          input.input.id,
          input.action,
          input.input.suppressNotifications === true,
        )
        if (canonicalJson(currentPreview) !== previewJson) {
          throw new ToolError(
            `Booking ${input.action} consequences changed after approval; request a new approval.`,
            "INVALID_INPUT",
            { bookingId: input.input.id, reason: "consequence_drift" },
          )
        }
        const userId = input.c.get("userId") ?? input.c.get("agentId") ?? "agent"
        const statusResult =
          input.action === "confirm"
            ? await bookingsService.confirmBooking(
                tx as Parameters<typeof bookingsService.confirmBooking>[0],
                input.input.id,
                {
                  note: input.input.note,
                  suppressNotifications: input.input.suppressNotifications,
                },
                userId,
                { eventBus: bufferingEventBus },
              )
            : await bookingsService.cancelBooking(
                tx as Parameters<typeof bookingsService.cancelBooking>[0],
                input.input.id,
                {
                  note: input.input.note,
                  suppressNotifications: input.input.suppressNotifications,
                },
                userId,
                {
                  eventBus: bufferingEventBus,
                  closePaymentSchedulesForBooking: routeRuntime.closePaymentSchedulesForBooking,
                  recordCancellationFinancialSettlement:
                    routeRuntime.recordCancellationFinancialSettlement,
                },
              )
        if (statusResult.status !== "ok" || !("booking" in statusResult) || !statusResult.booking) {
          throw bookingStatusCommandError(input.action, input.input.id, statusResult.status)
        }
      },
      async execute() {
        return requiredBookingStatusDetail(input)
      },
      async replay() {
        return requiredBookingStatusDetail(input)
      },
    },
  )
  if (!result.replayed) {
    const eventBus = input.c.get("eventBus")
    for (const event of bufferedEvents) {
      await eventBus?.emit(event.event, event.data, event.metadata as never, event.options as never)
    }
  }
  return {
    status: input.action === "confirm" ? ("confirmed" as const) : ("cancelled" as const),
    booking: result.value,
    replayed: result.replayed,
  }
}

async function requiredBookingStatusDetail(input: {
  action: BookingStatusToolAction
  input: { id: string }
  loadBookingDetail: (id: string) => Promise<unknown>
}) {
  const detail = await input.loadBookingDetail(input.input.id)
  if (!detail) {
    throw new ToolError(
      `${input.action === "confirm" ? "Confirmed" : "Cancelled"} booking could not be read.`,
      "NOT_FOUND",
      { bookingId: input.input.id, action: input.action },
    )
  }
  return detail
}

async function bookingStatusConsequencePreviewForAdmission(input: {
  action: BookingStatusToolAction
  db: Parameters<typeof bookingsService.getBookingById>[0]
  c: Context<Env>
  input: { id: string; suppressNotifications?: boolean }
  admitted: ToolHandlerActionPolicyContext
}) {
  const approvalId = input.admitted.invocation.approvalId?.trim()
  if (approvalId) {
    const approved = await actionLedgerService.getApproval(input.db, approvalId)
    const stored = approved?.requestedAction?.mutationDetail?.commandInputRef
    if (!stored) {
      throw new ToolError("The approved booking consequence preview is missing.", "INVALID_INPUT", {
        bookingId: input.input.id,
        action: input.action,
        approvalId,
      })
    }
    try {
      return JSON.parse(stored) as Record<string, unknown>
    } catch {
      throw new ToolError("The approved booking consequence preview is invalid.", "INVALID_INPUT", {
        bookingId: input.input.id,
        action: input.action,
        approvalId,
      })
    }
  }
  return loadBookingStatusConsequencePreview(
    input.db,
    input.input.id,
    input.action,
    input.input.suppressNotifications === true,
  )
}

async function loadBookingStatusConsequencePreview(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
  action: BookingStatusToolAction,
  suppressNotifications: boolean,
) {
  const booking = await bookingsService.getBookingById(db, bookingId)
  if (!booking) {
    throw new ToolError(`Booking "${bookingId}" was not found.`, "NOT_FOUND", {
      bookingId,
      action,
    })
  }
  const allocations = await bookingsService.listAllocations(db, bookingId)
  return {
    action,
    bookingId,
    bookingNumber: booking.bookingNumber,
    currentStatus: booking.status,
    resultingStatus: action === "confirm" ? "confirmed" : "cancelled",
    pax: booking.pax,
    sellCurrency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents,
    costAmountCents: booking.costAmountCents,
    holdExpiresAt: toIsoString(booking.holdExpiresAt),
    notificationsSuppressed: booking.notificationsSuppressed || suppressNotifications === true,
    closesPaymentSchedules: action === "cancel",
    recordsFinancialSettlement: action === "cancel",
    allocations: allocations.map((allocation) => ({
      id: allocation.id,
      status: allocation.status,
      availabilitySlotId: allocation.availabilitySlotId,
      quantity: allocation.quantity,
      resultingStatus: action === "confirm" ? "confirmed" : "cancelled",
      restoresCapacity:
        action === "cancel" &&
        allocation.availabilitySlotId !== null &&
        ["held", "confirmed", "fulfilled"].includes(allocation.status),
    })),
  }
}

function bookingStatusConsequenceSummary(
  action: BookingStatusToolAction,
  preview: Record<string, unknown>,
) {
  const allocations = Array.isArray(preview.allocations) ? preview.allocations : []
  const restored = allocations.reduce(
    (sum, allocation) =>
      isRecord(allocation) && allocation.restoresCapacity === true
        ? sum + (typeof allocation.quantity === "number" ? allocation.quantity : 0)
        : sum,
    0,
  )
  const notificationText = preview.notificationsSuppressed
    ? "customer notifications suppressed"
    : "customer notifications enabled"
  return action === "confirm"
    ? `Confirm booking ${String(preview.bookingNumber)} for ${String(preview.sellCurrency)} ${String(preview.sellAmountCents)}; pax ${String(preview.pax)}; ${allocations.length} allocation(s); ${notificationText}.`
    : `Cancel booking ${String(preview.bookingNumber)} from ${String(preview.currentStatus)}; restore ${restored} slot capacity; close payment schedules and record financial settlement; ${notificationText}.`
}

function bookingStatusCommandError(
  action: BookingStatusToolAction,
  bookingId: string,
  status: string,
) {
  if (status === "not_found") {
    return new ToolError(`Booking "${bookingId}" was not found for ${action}.`, "NOT_FOUND", {
      bookingId,
      action,
      status,
    })
  }
  const detail =
    status === "slot_not_found" || status === "slot_unavailable"
      ? "Capacity restoration could not complete; the booking remains unchanged and may be retried."
      : `Booking cannot transition to ${action === "confirm" ? "confirmed" : "cancelled"}.`
  return new ToolError(
    `${action === "confirm" ? "Confirmation" : "Cancellation"} failed. ${detail}`,
    "INVALID_INPUT",
    {
      bookingId,
      action,
      status,
      retryable: status === "slot_not_found" || status === "slot_unavailable",
    },
  )
}

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
