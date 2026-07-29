// agent-quality: file-size exception -- owner: bookings; selected Tool contribution,
// approval admission, replay, and consequence locking remain co-located until a
// dedicated MCP runtime split preserves the public tools entry and tests.
import {
  type ActionLedgerRequestContextValues,
  actionLedgerService,
  canonicalJson,
  executeAdmittedExistingTargetCommand,
} from "@voyant-travel/action-ledger"
import type { EventBus } from "@voyant-travel/core"
import { lockBookingFinanceInsertionFence } from "@voyant-travel/db/booking-finance-fence"
import { isStaffRbacEnforced } from "@voyant-travel/hono"
import {
  defineToolContextContribution,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { sql } from "drizzle-orm"
import type { Context } from "hono"
import { contributeBookingsExtrasToolContext } from "./extras/mcp-runtime.js"
import {
  type BookingStatusToolAction,
  requiredBookingStatusReplayDetail,
} from "./mcp-booking-status-replay.js"
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
import { bookingToolDetailSchema } from "./tool-output-schemas.js"

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
      const detail = {
        ...(reveal ? row : redactBookingRow(row)),
        items,
        travelers: reveal
          ? travelers
          : travelers.map((traveler) => redactTravelerIdentity(traveler)),
      }
      return bookingToolDetailSchema.parse(toJsonValue(detail))
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
  }
  admitted: ToolHandlerActionPolicyContext
  loadBookingDetail: (id: string) => Promise<unknown>
}) {
  const routeRuntime = getBookingToolRouteRuntime(input.c)
  const preview = await bookingStatusConsequencePreviewForAdmission({
    ...input,
    settlementHookAvailable: Boolean(routeRuntime.recordCancellationFinancialSettlement),
  })
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
      async prepare(tx, command) {
        await lockBookingStatusConsequenceState(
          tx as Parameters<typeof bookingsService.getBookingById>[0],
          input.input.id,
          input.action,
        )
        const currentPreview = await loadBookingStatusConsequencePreview(
          tx as Parameters<typeof bookingsService.getBookingById>[0],
          input.input.id,
          input.action,
          input.input.suppressNotifications === true,
          Boolean(routeRuntime.recordCancellationFinancialSettlement),
        )
        if (canonicalJson(currentPreview) !== previewJson) {
          throw new ToolError(
            `Booking ${input.action} consequences changed after approval; request a new approval.`,
            "INVALID_INPUT",
            { bookingId: input.input.id, reason: "consequence_drift" },
          )
        }
        const userId = input.c.get("userId") ?? input.c.get("agentId") ?? "agent"
        const lifecycleRuntime = bookingStatusToolLifecycleRuntime(
          input.action,
          input.admitted,
          bufferingEventBus,
          bookingToolActionLedgerContext(input.c),
          command.causation.claimActionId,
        )
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
                lifecycleRuntime,
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
                  ...lifecycleRuntime,
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
        return requiredBookingStatusReplayDetail(input)
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

function bookingStatusToolLifecycleRuntime(
  action: BookingStatusToolAction,
  admitted: ToolHandlerActionPolicyContext,
  eventBus: EventBus,
  actionLedgerContext: ActionLedgerRequestContextValues,
  causationActionId: string,
) {
  const idempotencyKey = admitted.invocation.idempotencyKey?.trim() ?? null
  const routeOrToolName = admitted.capabilityId
  return {
    eventBus,
    actionLedgerContext,
    actionLedgerAuthorizationSource: "selected_graph_mcp_handler_existing_target",
    actionLedgerRouteOrToolName: routeOrToolName,
    actionLedgerCausationActionId: causationActionId,
    actionLedgerApprovalId: admitted.invocation.approvalId ?? null,
    actionLedgerIdempotencyScope: idempotencyKey
      ? `bookings.status.tool:${routeOrToolName}:${action}`
      : null,
    actionLedgerIdempotencyKey: idempotencyKey,
    actionLedgerIdempotencyFingerprint: admitted.invocation.idempotencyFingerprint ?? null,
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
  settlementHookAvailable: boolean
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
    input.settlementHookAvailable,
  )
}

export async function loadBookingStatusConsequencePreview(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
  action: BookingStatusToolAction,
  suppressNotifications: boolean,
  settlementHookAvailable: boolean,
) {
  const booking = await bookingsService.getBookingById(db, bookingId)
  if (!booking) {
    throw new ToolError(`Booking "${bookingId}" was not found.`, "NOT_FOUND", {
      bookingId,
      action,
    })
  }
  const allocations = [...(await bookingsService.listAllocations(db, bookingId))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )
  const fulfillmentProjection =
    action === "confirm" ? await loadConfirmationFulfillmentProjection(db, bookingId) : null
  const financialSettlement =
    action === "cancel"
      ? await loadCancellationFinancialConsequences(db, bookingId, settlementHookAvailable)
      : null
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
    financialSettlement,
    fulfillmentProjection,
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

async function loadConfirmationFulfillmentProjection(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
) {
  const items = [...(await bookingsService.listItems(db, bookingId))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  )
  const productIds = [
    ...new Set(
      items.map((item) => item.productId).filter((value): value is string => Boolean(value)),
    ),
  ].sort()
  const [participantEntries, travelers, fulfillments, ticketSettings] = await Promise.all([
    Promise.all(
      items.map(
        async (item) =>
          [
            item.id,
            [...(await bookingsService.listItemParticipants(db, item.id))].sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
            ),
          ] as const,
      ),
    ),
    bookingsService.listTravelers(db, bookingId),
    bookingsService.listFulfillments(db, bookingId),
    bookingsService.listProductTicketSettings(db, productIds),
  ])
  const participantsByItemId = new Map(participantEntries)

  return {
    items: items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      status: item.status,
      productId: item.productId,
      optionId: item.optionId,
      optionUnitId: item.optionUnitId,
      pricingCategoryId: item.pricingCategoryId,
      availabilitySlotId: item.availabilitySlotId,
      quantity: item.quantity,
      serviceDate: item.serviceDate,
      startsAt: toIsoString(item.startsAt),
      endsAt: toIsoString(item.endsAt),
      metadata: item.metadata,
      participants: (participantsByItemId.get(item.id) ?? []).map((participant) => ({
        id: participant.id,
        travelerId: participant.travelerId,
        role: participant.role,
        isPrimary: participant.isPrimary,
      })),
    })),
    ticketSettings: [...ticketSettings]
      .sort((a, b) => a.productId.localeCompare(b.productId) || a.id.localeCompare(b.id))
      .map((setting) => ({
        id: setting.id,
        productId: setting.productId,
        fulfillmentMode: setting.fulfillmentMode,
        defaultDeliveryFormat: setting.defaultDeliveryFormat,
      })),
    existingFulfillments: [...fulfillments]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .map((fulfillment) => ({ id: fulfillment.id })),
    travelers: [...travelers]
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((traveler) => ({
        id: traveler.id,
        participantType: traveler.participantType,
        isPrimary: traveler.isPrimary,
        createdAt: toIsoString(traveler.createdAt),
      })),
  }
}

export async function lockBookingStatusConsequenceState(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
  action: BookingStatusToolAction,
) {
  // Finance writers use advisory fence -> booking row. Cancellation preview
  // locking must use the same order, and cancelBooking will re-enter this
  // transaction-scoped advisory lock when it performs the mutation.
  if (action === "cancel") {
    await lockBookingFinanceInsertionFence(db, bookingId)
  }

  if (action === "cancel") {
    // Existing Finance mutations lock their consequence row before touching the
    // linked booking. Keep cancellation in that same row-before-booking order.
    // New Finance rows cannot appear while we do this because every insertion
    // must acquire the advisory fence above before taking any row lock.
    const financeTables = await loadFinanceConsequenceTables(db)
    if (financeTables?.invoicesTable) {
      await db.execute(sql`
        SELECT id
        FROM invoices
        WHERE booking_id = ${bookingId}
        ORDER BY id
        FOR UPDATE
      `)
    }
    if (financeTables?.paymentSchedulesTable) {
      await db.execute(sql`
        SELECT id
        FROM booking_payment_schedules
        WHERE booking_id = ${bookingId}
        ORDER BY id
        FOR UPDATE
      `)
    }
    // Preserve Finance row -> booking -> allocation ordering for cancellation.
    await lockBookingAndAllocations(db, bookingId)
    return
  }

  // Item writers update item -> booking. Confirmation takes all mutable
  // fulfillment inputs before the parent to remain compatible with that order.
  await db.execute(sql`
    SELECT id
    FROM booking_items
    WHERE booking_id = ${bookingId}
    ORDER BY created_at, id
    FOR UPDATE
  `)
  await db.execute(sql`
    SELECT id
    FROM booking_travelers
    WHERE booking_id = ${bookingId}
    ORDER BY is_primary DESC, created_at, id
    FOR UPDATE
  `)
  await db.execute(sql`
    SELECT participant.id
    FROM booking_item_travelers participant
    JOIN booking_items item ON item.id = participant.booking_item_id
    WHERE item.booking_id = ${bookingId}
    ORDER BY participant.booking_item_id, participant.created_at, participant.id
    FOR UPDATE OF participant
  `)
  await db.execute(sql`
    SELECT id
    FROM booking_fulfillments
    WHERE booking_id = ${bookingId}
    ORDER BY created_at, id
    FOR UPDATE
  `)
  // Product ticket settings are not booking-owned, so a table-level SHARE lock
  // also prevents a new setting from appearing after the drift re-read.
  await db.execute(sql`LOCK TABLE product_ticket_settings IN SHARE MODE`)
  await db.execute(sql`
    SELECT setting.id
    FROM product_ticket_settings setting
    WHERE setting.product_id IN (
      SELECT item.product_id
      FROM booking_items item
      WHERE item.booking_id = ${bookingId}
        AND item.product_id IS NOT NULL
    )
    ORDER BY setting.product_id, setting.id
    FOR UPDATE OF setting
  `)
  await lockBookingAndAllocations(db, bookingId)
}

async function lockBookingAndAllocations(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
) {
  await db.execute(sql`
    SELECT id
    FROM bookings
    WHERE id = ${bookingId}
    FOR UPDATE
  `)
  await db.execute(sql`
    SELECT id
    FROM booking_allocations
    WHERE booking_id = ${bookingId}
    ORDER BY id
    FOR UPDATE
  `)
}

async function loadFinanceConsequenceTables(
  db: Parameters<typeof bookingsService.getBookingById>[0],
) {
  return rowsFromExecute<{
    invoicesTable: string | null
    paymentSchedulesTable: string | null
  }>(
    await db.execute(sql`
      SELECT
        to_regclass('invoices')::text AS "invoicesTable",
        to_regclass('booking_payment_schedules')::text AS "paymentSchedulesTable"
    `),
  )[0]
}

async function loadCancellationFinancialConsequences(
  db: Parameters<typeof bookingsService.getBookingById>[0],
  bookingId: string,
  settlementHookAvailable: boolean,
) {
  const financeTables = await loadFinanceConsequenceTables(db)
  if (!financeTables?.invoicesTable && !financeTables?.paymentSchedulesTable) {
    return {
      actionRequired: false,
      consequence: "Finance invoice data is not installed for this deployment.",
      settlementRecorderAvailable: settlementHookAvailable,
      requiredDecisionOptions: [],
      paidInvoices: [],
      paidByCurrency: {},
      schedulesToClose: [],
    }
  }
  const paidInvoices = financeTables.invoicesTable
    ? rowsFromExecute<{
        id: string
        invoiceNumber: string
        currency: string
        paidCents: number
        status: string
      }>(
        await db.execute(sql`
          SELECT
            id,
            invoice_number AS "invoiceNumber",
            currency,
            paid_cents AS "paidCents",
            status
          FROM invoices
          WHERE booking_id = ${bookingId}
            AND paid_cents > 0
            AND status <> 'void'
          ORDER BY created_at ASC, id ASC
        `),
      )
    : []
  const schedulesToClose = financeTables.paymentSchedulesTable
    ? rowsFromExecute<{
        currency: string
        amountCents: number
        status: string
      }>(
        await db.execute(sql`
          SELECT
            currency,
            amount_cents AS "amountCents",
            status
          FROM booking_payment_schedules
          WHERE booking_id = ${bookingId}
            AND status IN ('pending', 'due')
          ORDER BY created_at ASC, id ASC
        `),
      )
    : []
  const paidByCurrency = paidInvoices.reduce<Record<string, number>>((totals, invoice) => {
    totals[invoice.currency] = (totals[invoice.currency] ?? 0) + invoice.paidCents
    return totals
  }, {})
  return {
    actionRequired: paidInvoices.length > 0,
    consequence:
      paidInvoices.length > 0
        ? "Paid invoices remain paid; an operator must record a refund, credit note, or explicit no-refund decision."
        : "No paid invoice settlement action is currently required.",
    settlementRecorderAvailable: settlementHookAvailable,
    requiredDecisionOptions: paidInvoices.length > 0 ? ["refund", "credit_note", "no_refund"] : [],
    paidInvoices,
    paidByCurrency,
    schedulesToClose,
  }
}

function rowsFromExecute<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows
  }
  return []
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
    : cancellationConsequenceSummary(preview, restored, notificationText)
}

function cancellationConsequenceSummary(
  preview: Record<string, unknown>,
  restored: number,
  notificationText: string,
) {
  const settlement = isRecord(preview.financialSettlement) ? preview.financialSettlement : null
  const paidByCurrency =
    settlement && isRecord(settlement.paidByCurrency)
      ? Object.entries(settlement.paidByCurrency)
          .map(([currency, amount]) => `${currency} ${String(amount)}`)
          .join(", ")
      : "none"
  const settlementText =
    settlement?.actionRequired === true
      ? `paid invoice settlement action required (${paidByCurrency}: refund, credit note, or no-refund decision)`
      : "no paid invoice settlement action currently required"
  return `Cancel booking ${String(preview.bookingNumber)} from ${String(preview.currentStatus)}; restore ${restored} slot capacity; close pending payment schedules; ${settlementText}; ${notificationText}.`
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

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}

function redactBookingRow<T>(row: T): T {
  return isRecord(row)
    ? (redactBookingContact(row as Parameters<typeof redactBookingContact>[0]) as T)
    : row
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
