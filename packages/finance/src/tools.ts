/**
 * Finance agent tools on the framework tool contract. Thin wrappers over the
 * existing finance service; the service is injected on the tool context
 * by intersection so this module stays deployment-agnostic.
 * Refunds are issued through the credit-note service after action approval.
 */
import { bookingToolDetailSchema } from "@voyant-travel/bookings"
import {
  admitHandlerActionPolicy,
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"
import { FINANCE_BOOKING_CREATE_HANDLER_POLICY } from "./booking-create-policy.js"
import {
  creditNoteSchema,
  invoiceDetailSchema,
  invoiceListItemSchema,
  invoiceSchema,
} from "./routes-invoice-schemas.js"
import { type bookingCreateSchema, bookingCreateToolSchema } from "./service-booking-create.js"
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
  generateBookingNumber(): Promise<{ bookingNumber: string }>
  createBooking(
    input: z.infer<typeof bookingCreateSchema>,
    admitted: ReturnType<typeof admitHandlerActionPolicy>,
  ): Promise<{
    bookingId: string
    replayed: boolean
    booking: z.infer<typeof bookingToolDetailSchema>
  }>
  issueInvoiceFromBooking(
    input: z.infer<typeof issueInvoiceFromBookingToolInputSchema>,
  ): Promise<unknown>
  previewUnsyncedProformaFromBooking(input: { bookingId: string }): Promise<unknown>
  issueUnsyncedProformaFromBooking(
    input: z.infer<typeof issueUnsyncedProformaFromBookingToolInputSchema>,
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

export const createBookingToolInputSchema = z.object({
  booking: bookingCreateToolSchema.describe(
    "The atomic product/slot booking command, including travelers, room/item lines, and schedules.",
  ),
})

const durableBookingCreateResultSchema = z.object({
  status: z.literal("created"),
  bookingId: z.string().min(1),
  replayed: z.boolean(),
  booking: bookingToolDetailSchema,
})

export const createBookingTool = defineTool({
  owner: "@voyant-travel/finance#bookings-create-extension",
  capabilityId: "@voyant-travel/finance#bookings-create-extension.tool.create-booking",
  capabilityVersion: "v1",
  name: "create_booking",
  description:
    "Durably create one booking from a product or slot. Requires a billing party: set `personId` for a private client (find it with `list_people`), or `organizationId` for a company booking (find it with `list_organizations`) — at least one is mandatory. For a product with rooms or options, first use `list_product_options` and `list_option_units`, then pass explicit `optionId` and `itemLines`: room quantity means number of rooms, while each line's `travelerKeys` assigns travelers to that room type. Exact retries resolve the original immutable booking reference.",
  inputSchema: createBookingToolInputSchema,
  outputSchema: durableBookingCreateResultSchema,
  requiredScopes: ["bookings:write", "finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "external-booking", "payment"],
  },
  actionPolicyEnforcement: "handler",
  async handler({ booking }, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, FINANCE_BOOKING_CREATE_HANDLER_POLICY)
    const result = await finance(ctx).createBooking(booking, admitted)
    return {
      status: "created",
      bookingId: result.bookingId,
      replayed: result.replayed,
      booking: result.booking,
    }
  },
})

const generateBookingNumberArgs = z.object({})

const generateBookingNumberResultSchema = z.object({
  bookingNumber: z
    .string()
    .describe("The allocated booking reference. Pass it to `create_booking` unchanged."),
})

export const generateBookingNumberTool = defineTool<
  z.infer<typeof generateBookingNumberArgs>,
  z.infer<typeof generateBookingNumberResultSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance#bookings-create-extension",
  capabilityId: "@voyant-travel/finance#bookings-create-extension.tool.generate-booking-number",
  capabilityVersion: "v1",
  name: "generate_booking_number",
  description:
    "Allocate the booking reference for a new booking. Call this before `create_booking` and pass the result through as `bookingNumber`. Never invent a reference and never build one out of the traveller's or client's details — the reference is shown to travellers and printed on invoices. Re-use the same allocated value when retrying the same create so the retry resolves the original booking instead of making a second one.",
  inputSchema: generateBookingNumberArgs,
  outputSchema: generateBookingNumberResultSchema,
  requiredScopes: ["bookings:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(_args, ctx) {
    return generateBookingNumberResultSchema.parse(await finance(ctx).generateBookingNumber())
  },
})

export const financeBookingsCreateTools = [createBookingTool, generateBookingNumberTool] as const

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

export const unsyncedProformaApprovalSnapshotSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingUpdatedAt: z.string().datetime(),
  snapshotFingerprint: z.string().min(1),
  payer: z.object({
    type: z.enum(["organization", "person"]),
    id: z.string().nullable(),
  }),
  currency: z.string(),
  subtotalCents: z.number().int(),
  taxCents: z.number().int(),
  totalCents: z.number().int(),
  lines: z.array(
    z.object({
      bookingItemId: z.string().nullable(),
      description: z.string(),
      quantity: z.number().int(),
      unitPriceCents: z.number().int(),
      totalCents: z.number().int(),
      taxes: z.array(
        z.object({
          code: z.string().nullable(),
          name: z.string(),
          jurisdiction: z.string().nullable(),
          scope: z.string(),
          currency: z.string(),
          amountCents: z.number().int(),
          rateBasisPoints: z.number().int().nullable(),
          includedInPrice: z.boolean(),
          remittanceParty: z.string().nullable(),
          sortOrder: z.number().int(),
        }),
      ),
    }),
  ),
})

export const previewUnsyncedProformaFromBookingTool = defineTool<
  { bookingId: string },
  z.infer<typeof unsyncedProformaApprovalSnapshotSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.preview-unsynced-proforma-from-booking",
  capabilityVersion: "v1",
  name: "preview_unsynced_proforma_from_booking",
  description:
    "Read the exact authoritative payer, amount, line, and tax snapshot for an unsynced proforma. Call once before issue_unsynced_proforma_from_booking and pass its revision and fingerprint unchanged.",
  inputSchema: z.strictObject({ bookingId: z.string().min(1) }),
  outputSchema: unsyncedProformaApprovalSnapshotSchema,
  requiredScopes: ["finance:write", "bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(input, ctx) {
    return unsyncedProformaApprovalSnapshotSchema.parse(
      await finance(ctx).previewUnsyncedProformaFromBooking(input),
    )
  },
})

export const issueUnsyncedProformaFromBookingToolInputSchema = z.strictObject({
  bookingId: z.string().min(1).describe("The booking id returned by the preview Tool."),
  bookingUpdatedAt: z
    .string()
    .datetime()
    .describe(
      "The booking revision returned by the same preview call. A changed booking is refused before document creation.",
    ),
  snapshotFingerprint: z
    .string()
    .min(1)
    .describe("The exact approval snapshot fingerprint returned by the preview Tool."),
  issueDate: z.string().min(1).describe("The proforma issue date (YYYY-MM-DD)."),
  dueDate: z.string().min(1).describe("The proforma due date (YYYY-MM-DD)."),
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

export const issueUnsyncedProformaFromBookingTool = defineTool<
  z.infer<typeof issueUnsyncedProformaFromBookingToolInputSchema>,
  z.infer<typeof issueInvoiceFromBookingToolOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.issue-unsynced-proforma-from-booking",
  capabilityVersion: "v1",
  name: "issue_unsynced_proforma_from_booking",
  description:
    "Create and issue one proforma from a known booking after exact approval, without fiscalizing it, syncing it to an external accounting provider, sending it, or creating a payment link. This capability cannot create a draft: for a draft-only request, do not call it; explain that draft-only is unsupported and offer either this created/issued unsynced proforma or no document. Call preview_unsynced_proforma_from_booking once, then pass its booking id, revision, and snapshot fingerprint unchanged. Amount, currency, payer, line items, and taxes are derived from that authoritative snapshot.",
  inputSchema: issueUnsyncedProformaFromBookingToolInputSchema,
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
      await finance(ctx).issueUnsyncedProformaFromBooking(input),
    )
  },
})

export const financeTools = [
  listInvoicesTool,
  getInvoiceTool,
  voidInvoiceTool,
  issueInvoiceRefundTool,
  issueInvoiceFromBookingTool,
  previewUnsyncedProformaFromBookingTool,
  issueUnsyncedProformaFromBookingTool,
] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
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
