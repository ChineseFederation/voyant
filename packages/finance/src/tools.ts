/**
 * Finance agent tools on the framework tool contract. Thin wrappers over the
 * existing finance service; the service is injected on the tool context
 * by intersection so this module stays deployment-agnostic.
 * Refunds are issued through the credit-note service after action approval.
 */
import {
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

import {
  creditNoteSchema,
  invoiceDetailSchema,
  invoiceListItemSchema,
  invoiceSchema,
} from "./routes-invoice-schemas.js"
import { type BookingCreateOutcome, bookingCreateSchema } from "./service-booking-create.js"
import {
  insertCreditNoteSchema,
  invoiceFromBookingSchema,
  invoiceListQuerySchema,
} from "./validation.js"

const voidInvoiceResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("already_void"), invoice: invoiceSchema }),
  z.object({ status: z.literal("draft"), invoice: invoiceSchema }),
  z.object({ status: z.literal("invalid_status"), invoice: invoiceSchema }),
  z.object({ status: z.literal("has_payments"), invoice: invoiceSchema }),
  z.object({ status: z.literal("has_credit_notes"), invoice: invoiceSchema }),
  z.object({ status: z.literal("voided"), invoice: invoiceSchema }),
])

export interface FinanceToolServices {
  listInvoices(query: z.infer<typeof invoiceListQuerySchema>): Promise<unknown>
  getInvoiceById(id: string): Promise<unknown>
  getFinanceAggregates(query: {
    range?: "this_month" | "last_month" | "year_to_date" | "all_time" | "custom"
    from?: string
    to?: string
    outstandingTopLimit?: number
  }): Promise<unknown>
  voidInvoice(id: string, input: { reason?: string }): Promise<unknown>
  issueInvoiceRefund(input: {
    invoiceId: string
    creditNoteNumber: string
    amountCents: number
    currency: string
    baseCurrency?: string | null
    baseAmountCents?: number | null
    fxRateSetId?: string | null
    reason: string
    notes?: string | null
    idempotencyKey: string
    approvalId?: string
  }): Promise<unknown>
  createBooking(input: z.infer<typeof bookingCreateSchema>): Promise<BookingCreateOutcome>
  issueInvoiceFromBooking(
    input: z.infer<typeof issueInvoiceFromBookingToolInputSchema>,
  ): Promise<unknown>
}

export type FinanceToolContext = ToolContext & { finance?: FinanceToolServices }

function finance(ctx: FinanceToolContext): FinanceToolServices {
  return requireService(ctx.finance, "finance")
}

export const listInvoicesTool = defineTool<
  z.infer<typeof invoiceListQuerySchema>,
  unknown,
  FinanceToolContext
>({
  name: "list_invoices",
  description: "List invoices with filters and pagination. Read-only.",
  inputSchema: invoiceListQuerySchema,
  outputSchema: listResponseSchema(invoiceListItemSchema),
  requiredScopes: ["finance:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(query, ctx) {
    return parseJsonResult(
      listResponseSchema(invoiceListItemSchema),
      await finance(ctx).listInvoices(query),
    )
  },
})

const getInvoiceArgs = z.object({ id: z.string().min(1).describe("The invoice id.") })

export const getInvoiceTool = defineTool<
  z.infer<typeof getInvoiceArgs>,
  unknown,
  FinanceToolContext
>({
  name: "get_invoice",
  description: "Read a single invoice by id. Read-only.",
  inputSchema: getInvoiceArgs,
  outputSchema: invoiceDetailSchema.nullable(),
  requiredScopes: ["finance:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler({ id }, ctx) {
    return parseJsonResult(invoiceDetailSchema.nullable(), await finance(ctx).getInvoiceById(id))
  },
})

const voidInvoiceArgs = z.object({
  id: z.string().min(1).describe("The invoice id to void."),
  reason: z.string().optional().describe("Optional reason recorded on the void."),
})

export const voidInvoiceTool = defineTool<
  z.infer<typeof voidInvoiceArgs>,
  unknown,
  FinanceToolContext
>({
  name: "void_invoice",
  description:
    "Void an invoice (irreversible). Returns a not-found status when the invoice does not exist.",
  inputSchema: voidInvoiceArgs,
  outputSchema: voidInvoiceResultSchema,
  requiredScopes: ["finance:void"],
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
  },
  async handler({ id, reason }, ctx) {
    return parseJsonResult(voidInvoiceResultSchema, await finance(ctx).voidInvoice(id, { reason }))
  },
})

export const issueInvoiceRefundInputSchema = insertCreditNoteSchema.omit({ status: true }).extend({
  invoiceId: z.string().min(1).describe("Invoice that receives the issued credit note."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .describe("Stable key used when requesting approval and replaying the command."),
  approvalId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Approval id returned after the prior request is approved."),
})

const pendingFinanceApprovalSchema = z.object({
  status: z.literal("approval_required"),
  requestedAction: z.object({
    id: z.string(),
    status: z.string(),
    actionName: z.string(),
    targetType: z.string(),
    targetId: z.string(),
  }),
  approval: z.object({
    id: z.string(),
    status: z.string(),
    requestedActionId: z.string(),
    policyName: z.string(),
    policyVersion: z.string(),
    riskSnapshot: z.string(),
    reasonCode: z.string(),
    expiresAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }),
  replayed: z.boolean(),
})

export const issueInvoiceRefundOutputSchema = z.union([
  pendingFinanceApprovalSchema,
  z.object({ status: z.literal("issued"), creditNote: creditNoteSchema, replayed: z.boolean() }),
])

export const issueInvoiceRefundTool = defineTool<
  z.infer<typeof issueInvoiceRefundInputSchema>,
  z.infer<typeof issueInvoiceRefundOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.issue-invoice-refund",
  capabilityVersion: "v1",
  name: "issue_invoice_refund",
  description:
    "Request approval to refund an invoice by issuing a credit note, or execute the exact approved request.",
  inputSchema: issueInvoiceRefundInputSchema,
  outputSchema: issueInvoiceRefundOutputSchema,
  requiredScopes: ["finance:refund"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["refund", "data-write"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler(input, ctx) {
    return issueInvoiceRefundOutputSchema.parse(await finance(ctx).issueInvoiceRefund(input))
  },
})

const bookingCreateSummarySchema = z.object({
  status: z.literal("created"),
  booking: z.object({
    id: z.string(),
    bookingNumber: z.string(),
    status: z.string(),
    currency: z.string(),
    amountCents: z.number().int().nullable(),
    pax: z.number().int().nullable(),
  }),
  travelerIds: z.array(z.string()),
  paymentSchedules: z.array(
    z.object({
      id: z.string(),
      scheduleType: z.string(),
      status: z.string(),
      dueDate: z.string(),
      currency: z.string(),
      amountCents: z.number().int(),
    }),
  ),
  invoice: z
    .object({
      id: z.string(),
      invoiceNumber: z.string(),
      invoiceType: z.string(),
      status: z.string(),
    })
    .nullable(),
  invoiceDocument: z.discriminatedUnion("status", [
    z.object({ status: z.literal("requested"), renditionId: z.string().nullable() }),
    z.object({ status: z.literal("generated"), renditionId: z.string() }),
    z.object({ status: z.enum(["not_requested", "not_available", "failed"]) }),
  ]),
  paymentIds: z.array(z.string()),
  groupId: z.string().nullable(),
  travelCreditRedemptionId: z.string().nullable(),
})

export const createBookingToolInputSchema = z.object({
  booking: bookingCreateSchema.describe(
    "The atomic product/slot booking command, including travelers, room/item lines, and schedules.",
  ),
})

export const createBookingTool = defineTool<
  z.infer<typeof createBookingToolInputSchema>,
  z.infer<typeof bookingCreateSummarySchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance#bookings-create-extension",
  capabilityId: "@voyant-travel/finance#bookings-create-extension.tool.create-booking",
  capabilityVersion: "v1",
  name: "create_booking",
  aliases: ["bookings_create"],
  description:
    "Create a booking from a product or slot with travelers, room/item lines, payment schedules, optional credit, group membership, and invoice documents.",
  inputSchema: createBookingToolInputSchema,
  outputSchema: bookingCreateSummarySchema,
  requiredScopes: ["bookings:write", "finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "destructive",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "external-booking", "payment"],
  },
  // Finance records the authoritative booking.create action with the generated
  // booking id inside the booking transaction. The generic gate cannot know
  // that id before dispatch and would create a second, caller-invented ledger
  // timeline.
  actionPolicyEnforcement: "handler",
  async handler({ booking }, ctx) {
    const outcome = await finance(ctx).createBooking(booking)
    if (outcome.status !== "ok") {
      throw bookingCreateToolError(outcome)
    }
    const result = outcome.result
    return {
      status: "created",
      booking: {
        id: result.booking.id,
        bookingNumber: result.booking.bookingNumber,
        status: result.booking.status,
        currency: result.booking.sellCurrency,
        amountCents: result.booking.sellAmountCents,
        pax: result.booking.pax,
      },
      travelerIds: result.travelers.map((traveler) => traveler.id),
      paymentSchedules: result.paymentSchedules.map((schedule) => ({
        id: schedule.id,
        scheduleType: schedule.scheduleType,
        status: schedule.status,
        dueDate: schedule.dueDate,
        currency: schedule.currency,
        amountCents: schedule.amountCents,
      })),
      invoice: result.invoice
        ? {
            id: result.invoice.id,
            invoiceNumber: result.invoice.invoiceNumber,
            invoiceType: result.invoice.invoiceType,
            status: result.invoice.status,
          }
        : null,
      invoiceDocument: result.invoiceDocument,
      paymentIds: result.payments.map((payment) => payment.id),
      groupId: result.groupMembership?.groupId ?? null,
      travelCreditRedemptionId: result.travelCreditRedemption?.redemption.id ?? null,
    }
  },
})

export const financeBookingsCreateTools = [createBookingTool] as const

export const issueInvoiceFromBookingToolInputSchema = z.object({
  command: invoiceFromBookingSchema.describe("The exact invoice or proforma issue command."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .describe("Stable key used when requesting approval and replaying the exact command."),
  approvalId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Approval id returned after the exact prior command is approved."),
})

export const issueInvoiceFromBookingToolOutputSchema = z.union([
  pendingFinanceApprovalSchema,
  z.object({ status: z.literal("issued"), invoice: invoiceSchema, replayed: z.boolean() }),
])

export const issueInvoiceFromBookingTool = defineTool<
  z.infer<typeof issueInvoiceFromBookingToolInputSchema>,
  z.infer<typeof issueInvoiceFromBookingToolOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.issue-invoice-from-booking",
  capabilityVersion: "v1",
  name: "issue_invoice_from_booking",
  aliases: ["invoices_issue_from_booking"],
  description:
    "Request approval to create and issue an invoice or proforma from a booking, or execute and idempotently replay the exact approved command.",
  inputSchema: issueInvoiceFromBookingToolInputSchema,
  outputSchema: issueInvoiceFromBookingToolOutputSchema,
  requiredScopes: ["finance:write", "bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  actionPolicyEnforcement: "handler",
  tier: "destructive",
  riskPolicy: {
    destructive: false,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return issueInvoiceFromBookingToolOutputSchema.parse(
      await finance(ctx).issueInvoiceFromBooking(input),
    )
  },
})

export const financeTools = [
  listInvoicesTool,
  getInvoiceTool,
  voidInvoiceTool,
  issueInvoiceRefundTool,
  issueInvoiceFromBookingTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function bookingCreateToolError(outcome: Exclude<BookingCreateOutcome, { status: "ok" }>) {
  switch (outcome.status) {
    case "product_not_found":
    case "travel_credit_not_found":
    case "group_not_found":
      return new ToolError(`Booking create failed: ${outcome.status}`, "NOT_FOUND", { outcome })
    default:
      return new ToolError(`Booking create rejected: ${outcome.status}`, "INVALID_INPUT", {
        outcome,
      })
  }
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
