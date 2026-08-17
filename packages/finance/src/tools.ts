/**
 * Finance agent tools on the framework tool contract. Thin wrappers over the
 * existing finance service; the service is injected on the tool context
 * by intersection so this module stays deployment-agnostic.
 * Refunds are issued through the credit-note service after action approval.
 */
import type { bookingToolDetailSchema } from "@voyant-travel/bookings"
// agent-quality: file-size exception -- owner: finance; the package-owned Tool catalog remains centralized while intent workflows replace its advanced command surface incrementally.
import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"
import {
  type BookProductOutput,
  bookProductToolInputSchema,
  bookProductToolOutputSchema,
} from "./book-product.js"
import {
  FINANCE_BOOK_PRODUCT_HANDLER_POLICY,
  FINANCE_BOOKING_CREATE_HANDLER_POLICY,
} from "./booking-create-policy.js"
import {
  creditNoteSchema,
  invoiceDetailSchema,
  invoiceListItemSchema,
  invoiceSchema,
  paymentSchema,
} from "./routes-invoice-schemas.js"
import { bookingCreateToolSchema } from "./service-booking-create.js"
import { parseJsonResult } from "./tool-json.js"
import {
  insertCreditNoteSchema,
  insertPaymentSchema,
  invoiceFromBookingSchema,
  invoiceListQuerySchema,
  paymentDisputeRecordSchema,
  paymentStatusSchema,
  recordPaymentDisputeSchema,
  recordRefundSettlementSchema,
  refundSettlementRecordSchema,
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
  voidInvoice(
    id: string,
    input: { reason?: string },
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<unknown>
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
  createBooking(
    input: z.infer<typeof createBookingToolInputSchema>["booking"],
    admitted: ReturnType<typeof admitHandlerActionPolicy>,
  ): Promise<{
    bookingId: string
    replayed: boolean
    booking: z.infer<typeof bookingToolDetailSchema>
  }>
  bookProduct(
    input: z.infer<typeof bookProductToolInputSchema>,
    admitted: ReturnType<typeof admitHandlerActionPolicy>,
  ): Promise<BookProductOutput>
  issueInvoiceFromBooking(
    input: z.infer<typeof issueInvoiceFromBookingToolInputSchema> & { approvalId?: string },
  ): Promise<unknown>
  recordPayment(input: z.infer<typeof recordPaymentToolInputSchema>): Promise<unknown>
  stampInvoiceFxRate(input: z.infer<typeof stampInvoiceFxRateToolInputSchema>): Promise<unknown>
  stampPaymentFxRate(input: z.infer<typeof stampPaymentFxRateToolInputSchema>): Promise<unknown>
  recordPaymentDispute(input: z.infer<typeof recordPaymentDisputeToolInputSchema>): Promise<unknown>
  recordRefundSettlement(
    input: z.infer<typeof recordRefundSettlementToolInputSchema>,
  ): Promise<unknown>
  previewUnsyncedProformaFromBooking(input: { bookingId: string }): Promise<unknown>
  issueUnsyncedProformaFromBooking(
    input: z.infer<typeof issueUnsyncedProformaFromBookingToolInputSchema>,
  ): Promise<unknown>
  invoiceBooking(
    input: z.infer<typeof invoiceBookingToolInputSchema> & {
      approvalId?: string
    },
  ): Promise<unknown>
  refundCancelledBooking(input: {
    bookingId: string
    method: "bank_transfer" | "cash" | "cheque" | "other"
    reference?: string | null
    approvalId?: string
  }): Promise<unknown>
}

export type FinanceToolContext = ToolContext & {
  finance?: FinanceToolServices
  paymentLink?: PaymentLinkToolServices
}

function finance(ctx: FinanceToolContext): FinanceToolServices {
  return requireService(ctx.finance, "finance")
}

function handlerApprovalId(ctx: FinanceToolContext): string | undefined {
  return ctx.handlerActionPolicy?.invocation.approvalId?.trim() || undefined
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

export const VOID_INVOICE_HANDLER_POLICY = {
  capabilityId: "@voyant-travel/finance#tool.void-invoice",
  capabilityVersion: "v1",
  canonicalName: "void_invoice",
  actionPolicy: {
    id: "@voyant-travel/finance#action.void-invoice",
    capabilityId: "@voyant-travel/finance#action.void-invoice",
    version: "v1",
    kind: "execute",
    targetType: "invoice",
    commandTargetField: "id",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "critical",
    ledger: "required",
    approval: "required",
    reversible: false,
  },
} as const satisfies HandlerActionPolicyExpectation

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
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler({ id, reason }, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, VOID_INVOICE_HANDLER_POLICY)
    return parseJsonResult(
      voidInvoiceResultSchema,
      await finance(ctx).voidInvoice(id, { reason }, admitted),
    )
  },
})

export const issueInvoiceRefundInputSchema = insertCreditNoteSchema.omit({ status: true }).extend({
  invoiceId: z.string().min(1).describe("Invoice that receives the issued credit note."),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .describe("Stable key used when requesting approval and replaying the command."),
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
  /** Ordered remediation, mirroring `ToolError.nextSteps` on the failure paths. */
  nextSteps: z.array(z.string()).optional(),
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
    return issueInvoiceRefundOutputSchema.parse(
      await finance(ctx).issueInvoiceRefund({ ...input, approvalId: handlerApprovalId(ctx) }),
    )
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
  bookingNumber: z.string().min(1),
  replayed: z.boolean(),
  committedChanges: z.tuple([z.literal("booking_created")]),
  nextActions: z.tuple([
    z.object({
      tool: z.literal("get_booking"),
      input: z.object({ id: z.string().min(1) }),
    }),
  ]),
})

export const createBookingTool = defineTool({
  owner: "@voyant-travel/finance#bookings-create-extension",
  capabilityId: "@voyant-travel/finance#bookings-create-extension.tool.create-booking",
  capabilityVersion: "v1",
  name: "create_booking",
  description:
    "Durably create one booking from an explicit product/slot command. The booking reference is resolved server-side; omit `booking.bookingNumber`. Prefer `book_product` for the ordinary intent — this lower-level tool is for callers that already hold a fully resolved command.",
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
      bookingNumber: result.booking.bookingNumber,
      replayed: result.replayed,
      committedChanges: ["booking_created"],
      nextActions: [{ tool: "get_booking", input: { id: result.bookingId } }],
    }
  },
})

export const bookProductTool = defineTool({
  owner: "@voyant-travel/finance#bookings-create-extension",
  capabilityId: "@voyant-travel/finance#bookings-create-extension.tool.book-product",
  capabilityVersion: "v1",
  name: "book_product",
  description:
    "Book a product for a client in one call. Put the billing party id at the TOP LEVEL as `personId` for a private client or `organizationId` for a company; do not send a `billingParty` object. For a private client also send the TOP-LEVEL `billingContact` object with firstName, lastName, and email or phone. Travelers are given INLINE here as names and details — they do not need to exist as CRM People first, so do not go looking for a companion in the CRM or create one before booking; only the billing party is an existing record. The platform resolves the booking reference and the idempotency key server-side, so nothing has to be carried across calls. An incomplete request returns actionable issues and creates nothing.",
  inputSchema: bookProductToolInputSchema,
  outputSchema: bookProductToolOutputSchema,
  requiredScopes: ["bookings:write", "finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  resolvesIdempotencyKeyServerSide: true,
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write", "external-booking", "payment"],
  },
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    const admitted = admitHandlerActionPolicy(ctx, FINANCE_BOOK_PRODUCT_HANDLER_POLICY)
    return bookProductToolOutputSchema.parse(await finance(ctx).bookProduct(input, admitted))
  },
})

export const financeBookingsCreateTools = [createBookingTool, bookProductTool] as const

export const issueInvoiceFromBookingToolInputSchema = z.object({
  command: invoiceFromBookingSchema.describe("The exact invoice or proforma issue command."),
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
  // Was: "Request approval to create and issue an invoice or proforma from a
  // booking, or execute and idempotently replay the exact approved command."
  // Accurate about the server and useless to a caller — it describes two branches
  // the SERVER takes without saying that they are two calls the CALLER makes, in
  // order, with a human decision in between. Issuing an invoice needs approval,
  // so the first call never issues anything, and nothing here said so.
  description:
    "Issue an invoice or proforma from a booking. This takes TWO calls because issuing is approval-gated. First call it with the `command` and `_voyant.confirmed: true`: it creates an approval and returns `approval_required` — no invoice exists yet. Then approve that request with `approve_action_approval` and call this again with the identical `command`, `_voyant.confirmed: true`, and `_voyant.approvalId` set to the approved id. The returned `nextSteps` spell out both steps with the concrete id. Do not put approvalId at the top level and do not invent an idempotency key; both are protocol controls owned by the platform.",
  inputSchema: issueInvoiceFromBookingToolInputSchema,
  outputSchema: issueInvoiceFromBookingToolOutputSchema,
  requiredScopes: ["finance:write", "bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  resolvesIdempotencyKeyServerSide: true,
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
      await finance(ctx).issueInvoiceFromBooking({ ...input, approvalId: handlerApprovalId(ctx) }),
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

export const invoiceBookingToolInputSchema = z.strictObject({
  bookingId: z.string().min(1),
  issueDate: z.string().min(1).describe("The proforma issue date (YYYY-MM-DD)."),
  dueDate: z.string().min(1).describe("The proforma due date (YYYY-MM-DD)."),
})

export const invoiceBookingToolOutputSchema = z.union([
  pendingFinanceApprovalSchema.extend({ preview: unsyncedProformaApprovalSnapshotSchema }),
  z.object({
    status: z.literal("issued"),
    invoiceId: z.string().min(1),
    invoiceNumber: z.string().min(1),
    bookingId: z.string().min(1),
    currency: z.string().min(1),
    totalCents: z.number().int(),
    replayed: z.boolean(),
    committedChanges: z.tuple([z.literal("invoice_issued")]),
    nextActions: z.tuple([
      z.object({
        tool: z.literal("get_invoice"),
        input: z.object({ id: z.string().min(1) }),
      }),
    ]),
  }),
])

export const invoiceBookingTool = defineTool<
  z.infer<typeof invoiceBookingToolInputSchema>,
  z.infer<typeof invoiceBookingToolOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.invoice-booking",
  capabilityVersion: "v1",
  name: "invoice_booking",
  description:
    "Issue an unsynced proforma for a booking. The first call returns the exact payer, amount, lines, taxes, and a server-issued approval without writing a document. Approve it, then retry the same business input with `_voyant.approvalId`; the server revalidates the financial snapshot before issuing.",
  inputSchema: invoiceBookingToolInputSchema,
  outputSchema: invoiceBookingToolOutputSchema,
  requiredScopes: ["finance:write", "bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  resolvesIdempotencyKeyServerSide: true,
  actionPolicyEnforcement: "handler",
  tier: "destructive",
  riskPolicy: {
    destructive: false,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return invoiceBookingToolOutputSchema.parse(
      await finance(ctx).invoiceBooking({ ...input, approvalId: handlerApprovalId(ctx) }),
    )
  },
})

export const refundCancelledBookingToolInputSchema = z.strictObject({
  bookingId: z.string().min(1),
  method: z.enum(["bank_transfer", "cash", "cheque", "other"]),
  reference: z.string().max(255).optional().nullable(),
})

const bookingCancellationRefundPreviewSchema = z.object({
  bookingId: z.string().min(1),
  bookingNumber: z.string().min(1),
  cancellationActivityId: z.string().min(1),
  cancellationAsOf: z.string().datetime(),
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().min(1),
  paymentId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
  refundableRemainderCents: z.number().int().nonnegative(),
  creditNoteNumber: z.string().min(1),
})

export const refundCancelledBookingToolOutputSchema = z.union([
  pendingFinanceApprovalSchema.extend({ preview: bookingCancellationRefundPreviewSchema }),
  z.object({
    status: z.enum(["pending", "settled", "failed"]),
    bookingId: z.string().min(1),
    invoiceId: z.string().min(1),
    paymentId: z.string().min(1),
    creditNoteId: z.string().min(1),
    settlementId: z.string().min(1),
    amountCents: z.number().int().positive(),
    currency: z.string().length(3),
    replayed: z.boolean(),
    committedChanges: z.tuple([
      z.literal("credit_note_issued"),
      z.literal("refund_settlement_recorded"),
    ]),
    nextActions: z.tuple([]),
  }),
])

export const refundCancelledBookingTool = defineTool<
  z.infer<typeof refundCancelledBookingToolInputSchema>,
  z.infer<typeof refundCancelledBookingToolOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.refund-cancelled-booking",
  capabilityVersion: "v1",
  name: "refund_cancelled_booking",
  description:
    "Pay the contractual cash refund for a cancelled booking. The server resolves the durable cancellation entitlement, exact amount, paid invoice, and original payment; the first call returns one approval for both the credit note and settlement, and an approved retry refuses any drift.",
  inputSchema: refundCancelledBookingToolInputSchema,
  outputSchema: refundCancelledBookingToolOutputSchema,
  requiredScopes: ["finance:refund", "bookings:read"],
  audience: { source: "grant", allowed: ["staff"] },
  resolvesIdempotencyKeyServerSide: true,
  actionPolicyEnforcement: "handler",
  tier: "destructive",
  riskPolicy: {
    destructive: true,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["refund", "data-write"],
  },
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return refundCancelledBookingToolOutputSchema.parse(
      await finance(ctx).refundCancelledBooking({
        ...input,
        approvalId: handlerApprovalId(ctx),
      }),
    )
  },
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
    "Advanced read of the exact authoritative payer, amount, line, and tax snapshot for an unsynced proforma. Prefer invoice_booking for the ordinary issue workflow.",
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
    "Advanced low-level command that creates and issues one unsynced proforma from a caller-held approval snapshot. Prefer invoice_booking for the ordinary workflow; use this only when the caller deliberately manages the revision, fingerprint, and idempotency contract.",
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

/**
 * The payment states an agent may RECORD, out of the four the lifecycle has.
 *
 * Derived by subsetting `paymentStatusSchema` rather than re-listing it, so a new
 * lifecycle state has to be considered here rather than silently admitted.
 */
export const recordablePaymentStatusSchema = paymentStatusSchema.extract(["pending", "completed"])

/**
 * The agent-facing shape of "money arrived against this invoice".
 *
 * Derived from `insertPaymentSchema` — the body the admin route takes under
 * `/invoices/{id}/payments` — so the two cannot drift, then narrowed three ways:
 *
 * - `invoiceId` moves INTO the body. A Tool has no path, and the graph action
 *   resolves its target from a named command field.
 * - The FX and card-plumbing fields are dropped. `baseCurrency`,
 *   `baseAmountCents` and `fxRateSetId` are resolved server-side against the
 *   invoice's currency and rate set, and `paymentInstrumentId` /
 *   `paymentAuthorizationId` / `paymentCaptureId` belong to a processor session
 *   that recorded its own payment. An agent that had to fill them in would guess,
 *   and every one of them also rides the eager `tools/list`.
 * - `status` is narrowed to the two RECORDABLE states and defaults to
 *   `completed` rather than `pending`. An operator telling an agent to record a
 *   payment is recording money it already has; the route's `pending` default
 *   belongs to a checkout session that settles later, and getting that backwards
 *   leaves the invoice reading unpaid after the agent reports success. The other
 *   two lifecycle states are not things this call means: `failed` is not money
 *   received, and `refunded` is reached by refunding a payment
 *   (`issue_invoice_refund` then `record_refund_settlement`), never by recording
 *   one. Both were accepted, inserted, and then silently ignored by the balance
 *   recomputation, which counts only `completed` (voyant#4661 review).
 */
export const recordPaymentToolInputSchema = insertPaymentSchema
  .pick({
    amountCents: true,
    currency: true,
    paymentMethod: true,
    paymentDate: true,
    referenceNumber: true,
    notes: true,
  })
  .safeExtend({
    invoiceId: z.string().min(1).describe("The invoice this payment settles."),
    status: recordablePaymentStatusSchema
      .default("completed")
      .describe(
        "Settlement state. `completed` counts against the invoice balance; `pending` records " +
          "an expected payment that does not. A failed attempt is not recorded here, and a " +
          "refund goes through `issue_invoice_refund`.",
      ),
    idempotencyKey: z
      .string()
      .max(255)
      .optional()
      .describe(
        "Optional stable key. Repeating a recording with the same key replays the first one " +
          "instead of taking the money twice.",
      ),
  })

/**
 * Recording a payment an operator already received (voyant#4656).
 *
 * The gap this closes was not discovery: there was no Tool at all. An operator
 * asked the agent for a confirmed, fully-paid booking and was told payment
 * recording did not exist — correctly, because `/finance/invoices/{id}/payments`
 * had no agent-facing front. Entering historical bookings and their payments for
 * a regulatory filing is exactly the work an operator delegates.
 *
 * `medium` risk, no approval, for the same reason `record_payment_dispute` needs
 * none: the money moved before this call, and the record only catches up with
 * it. Gating a back-entry sweep behind per-payment approval would stall the one
 * job this exists for, while the invoice kept reporting a balance nobody owes.
 * The service still refuses to overpay an invoice or to accept a payment against
 * one that cannot take another, so the destructive cases fail closed on their
 * own.
 */
export const recordPaymentTool = defineTool<
  z.infer<typeof recordPaymentToolInputSchema>,
  unknown,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.record-payment",
  capabilityVersion: "v1",
  name: "record_payment",
  description:
    "Record a payment received against an invoice — bank transfer, card, cash, cheque, " +
    "wallet, direct bill, or travel credit. Recomputes the invoice's paid amount, balance, " +
    "and status, so a payment that covers the total marks the invoice `paid`. Amounts are " +
    "in MINOR units (`amountCents`) and `paymentDate` is the date the money was received, " +
    "which is what makes back-entering historical payments work. Rejected when the invoice " +
    "would be overpaid or is not in a state that accepts payments. Refunds go through " +
    "`issue_invoice_refund` and `record_refund_settlement`, not a negative payment.",
  inputSchema: recordPaymentToolInputSchema,
  outputSchema: paymentSchema,
  requiredScopes: ["finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    // Matches the graph action. Removing a payment is an admin operation with no
    // agent-facing counterpart, so from here the record does not come back.
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  // Deliberately NOT `idempotentHint`. This is idempotent only when the caller
  // sends `idempotencyKey`, which is optional — and it has to stay optional,
  // because two genuinely identical payments are a thing customers do. Claiming
  // the hint would tell an agent that repeating the call is free, about money.
  async handler(input, ctx) {
    return parseJsonResult(paymentSchema, await finance(ctx).recordPayment(input))
  },
})

export const recordPaymentDisputeToolInputSchema = recordPaymentDisputeSchema

/**
 * A chargeback an agent found — reconciling a processor console, or reading a
 * notification — put against the payment it contests (voyant#4289).
 *
 * Idempotent on `(paymentSessionId, processorReference)`, so an agent that runs
 * the same reconciliation twice advances one dispute rather than opening two.
 * Omitting `processorReference` always opens a new record, which is why an agent
 * should carry the processor's own id whenever it has one.
 */
export const recordPaymentDisputeTool = defineTool<
  z.infer<typeof recordPaymentDisputeToolInputSchema>,
  unknown,
  FinanceToolContext
>({
  name: "record_payment_dispute",
  description:
    "Record a card dispute (chargeback) against the payment session it contests, or advance one " +
    "already recorded. The contested amount may be partial. Idempotent on the processor's own " +
    "dispute reference; a different reference opens a second dispute rather than overwriting the " +
    "first. Unrelated to the `disputed` supplier-invoice status.",
  inputSchema: recordPaymentDisputeToolInputSchema,
  outputSchema: paymentDisputeRecordSchema,
  requiredScopes: ["finance:write"],
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: false,
    dryRunSupported: false,
    confirmationRequired: true,
  },
  async handler(input, ctx) {
    return parseJsonResult(
      paymentDisputeRecordSchema,
      await finance(ctx).recordPaymentDispute(input),
    )
  },
})

/**
 * The agent-facing input requires `creditNoteId`.
 *
 * The admin route accepts a settlement bound to a payment alone — an operator
 * paying somebody back before the paperwork catches up is ordinary. An agent
 * gets the narrower door on purpose: the credit note is the document a reviewer
 * approves against, and it is what makes `commandTargetField` in the graph
 * manifest name one field rather than two that take turns.
 */
export const recordRefundSettlementToolInputSchema = recordRefundSettlementSchema.safeExtend({
  creditNoteId: z.string().min(1),
  idempotencyKey: z.string().min(1).max(255),
  approvalId: z.string().min(1).optional(),
})

export const recordRefundSettlementOutputSchema = z.union([
  pendingFinanceApprovalSchema,
  z.object({
    status: z.literal("recorded"),
    refundSettlement: refundSettlementRecordSchema,
    replayed: z.boolean(),
  }),
])

/**
 * The money leg of a refund, for an agent that has been asked to pay somebody
 * back (voyant#4303).
 *
 * The method is the point: `bank_transfer`, `cash`, `voucher` and
 * `counterparty_offset` are as ordinary here as a card reversal, and a
 * deployment with no processor at all can still record one.
 *
 * Runs the same `finance:refund` capability as `issue_invoice_refund`, so a
 * deployment configures who may refund once. Returns `approval_required` with
 * the approval to grant when policy demands one, and the settlement when it
 * does not — the same call either way.
 */
export const recordRefundSettlementTool = defineTool<
  z.infer<typeof recordRefundSettlementToolInputSchema>,
  z.infer<typeof recordRefundSettlementOutputSchema>,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.record-refund-settlement",
  capabilityVersion: "v1",
  name: "record_refund_settlement",
  description:
    "Record how a customer was actually paid back — processor reversal, bank transfer, cash, " +
    "cheque, travel credit, voucher, or an offset against a counterparty balance — against the " +
    "credit note it settles. A refund may be owed now (`pending`) and settled later; repeated " +
    "partial refunds against one payment are ordinary. Requires approval under the same " +
    "`finance:refund` policy that governs issuing the credit note. " +
    "Three input rules the JSON schema cannot express: `creditNoteId` is required, and " +
    "`paymentId` should also be given when the refund reverses a specific payment, because that " +
    'is what bounds the refundable amount; `method: "processor_reversal"` requires ' +
    "`paymentSessionId`, since that is what the payment adapter is addressed to; and " +
    "`instrumentAmountCents` requires `instrumentCurrency` — send both only when the voucher or " +
    "credit is worth something other than `amountCents`, which is the 110%-in-credit case.",
  inputSchema: recordRefundSettlementToolInputSchema,
  outputSchema: recordRefundSettlementOutputSchema,
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
    return recordRefundSettlementOutputSchema.parse(
      await finance(ctx).recordRefundSettlement(input),
    )
  },
})

const fxStampFieldsSchema = {
  rate: z
    .number()
    .positive()
    .optional()
    .describe(
      "The rate the source published for the document's own date — reporting-currency " +
        "units per one unit of the document's currency, BEFORE the operator's " +
        "currency-risk margin. Omit to ask the configured reference source.",
    ),
  source: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .describe("Who published `rate`, e.g. `bnr`. Defaults to `manual`."),
  force: z.boolean().optional().describe("Replace a stamp the document already carries."),
}

export const stampInvoiceFxRateToolInputSchema = z.object({
  invoiceId: z.string().min(1).describe("The invoice to stamp."),
  ...fxStampFieldsSchema,
})

export const stampPaymentFxRateToolInputSchema = z.object({
  paymentId: z.string().min(1).describe("The payment to stamp."),
  ...fxStampFieldsSchema,
})

const fxStampResultSchema = z.object({
  documentId: z.string(),
  currency: z.string(),
  reportingCurrency: z.string(),
  rate: z.number(),
  effectiveRate: z.number(),
  commissionBps: z.number().int(),
  fxRateSetId: z.string().nullable(),
  reportingAmountCents: z.number().int(),
})

const FX_STAMP_RISK_POLICY = {
  destructive: false,
  // Re-stamping is a `force` away, so a wrong rate is correctable.
  reversible: true,
  dryRunSupported: false,
  confirmationRequired: true,
  sideEffects: ["data-write"],
} as const

const FX_STAMP_RATE_GUIDANCE =
  "Pass `rate` to use the rate printed on the document — the published rate BEFORE the " +
  "operator's currency-risk margin, which is applied on top and recorded alongside it — " +
  "or omit it to ask the configured reference source for that date. The rate is kept as " +
  "a rate set, so every document of that day resolves to the same number afterwards. " +
  "Refuses a document that already carries a stamp unless `force` is set; a stamp is " +
  "meant to hold, because changing it restates a figure someone has already reported."

/**
 * Repair a foreign-currency document that predates rate capture (voyant#4703).
 *
 * These are agent surfaces because the work they exist for is agent-shaped: the
 * operator's accounting provider prints the applied rate on every invoice
 * ("Total plata 420.00 EUR (2247.92 Lei) Curs 1 EUR = 5.3522 Lei"), and putting a
 * month of those back onto the records is what made the last period return
 * manual. Documents issued from now on stamp themselves.
 */
export const stampInvoiceFxRateTool = defineTool<
  z.infer<typeof stampInvoiceFxRateToolInputSchema>,
  unknown,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.stamp-invoice-fx-rate",
  capabilityVersion: "v1",
  name: "stamp_invoice_fx_rate",
  description:
    "Record what a foreign-currency invoice was worth in the operator's reporting " +
    `currency, at the rate of the invoice's OWN issue date. ${FX_STAMP_RATE_GUIDANCE}`,
  inputSchema: stampInvoiceFxRateToolInputSchema,
  outputSchema: fxStampResultSchema,
  requiredScopes: ["finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: FX_STAMP_RISK_POLICY,
  // Stamping the same invoice with the same rate lands on the same numbers, and
  // a captured rate is never rewritten — so a repeat really is free.
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return fxStampResultSchema.parse(await finance(ctx).stampInvoiceFxRate(input))
  },
})

export const stampPaymentFxRateTool = defineTool<
  z.infer<typeof stampPaymentFxRateToolInputSchema>,
  unknown,
  FinanceToolContext
>({
  owner: "@voyant-travel/finance",
  capabilityId: "@voyant-travel/finance#tool.stamp-payment-fx-rate",
  capabilityVersion: "v1",
  name: "stamp_payment_fx_rate",
  description:
    "Record what a foreign-currency payment was worth in the operator's reporting " +
    "currency, at the rate of the day it landed — the figure a period return asks for " +
    `as advances collected. ${FX_STAMP_RATE_GUIDANCE}`,
  inputSchema: stampPaymentFxRateToolInputSchema,
  outputSchema: fxStampResultSchema,
  requiredScopes: ["finance:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: FX_STAMP_RISK_POLICY,
  annotations: { idempotentHint: true },
  async handler(input, ctx) {
    return fxStampResultSchema.parse(await finance(ctx).stampPaymentFxRate(input))
  },
})

export const financeTools = [
  listInvoicesTool,
  getInvoiceTool,
  voidInvoiceTool,
  issueInvoiceRefundTool,
  issueInvoiceFromBookingTool,
  invoiceBookingTool,
  refundCancelledBookingTool,
  recordPaymentTool,
  recordPaymentDisputeTool,
  recordRefundSettlementTool,
  stampInvoiceFxRateTool,
  stampPaymentFxRateTool,
  previewUnsyncedProformaFromBookingTool,
  issueUnsyncedProformaFromBookingTool,
] as const

// Payment-link Tools moved here with the module (voyant#4627). They keep the
// spread-constant shape they were written in; the owner is the surviving
// @voyant-travel/finance#payment-link graph unit.
const PAYMENT_LINK_OWNER = "@voyant-travel/finance#payment-link-routes"
const PAYMENT_LINK_VERSION = "v1"
const PAYMENT_LINK_READ_SCOPES = ["finance:read"] as const
const PAYMENT_LINK_WRITE_SCOPES = ["finance:write"] as const
const PAYMENT_LINK_STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const
const paymentLinkIdSchema = z.string().trim().min(1)
const paymentSessionStatusSchema = z.enum([
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])

const paymentLinkSchema = z.object({
  id: z.string(),
  status: paymentSessionStatusSchema,
  invoiceId: z.string().nullable(),
  bookingId: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  paymentMethod: z.string().nullable(),
  provider: z.string().nullable(),
  redirectUrl: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  paymentUrl: z.string().min(1),
})
const createInvoicePaymentLinkInputSchema = z.object({
  invoiceId: paymentLinkIdSchema,
  idempotencyKey: z.string().trim().min(1).max(255),
  provider: z.string().trim().min(1).max(255).nullable().optional(),
  paymentMethod: z
    .enum([
      "bank_transfer",
      "credit_card",
      "debit_card",
      "cash",
      "cheque",
      "wallet",
      "direct_bill",
      "travel_credit",
      "other",
    ])
    .nullable()
    .optional(),
  returnUrl: z.string().url().nullable().optional(),
  cancelUrl: z.string().url().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})
const getPaymentLinkInputSchema = z.object({ sessionId: paymentLinkIdSchema })
export interface PaymentLinkToolServices {
  createFromInvoice(
    input: z.infer<typeof createInvoicePaymentLinkInputSchema>,
    admitted: import("@voyant-travel/tools").ToolHandlerActionPolicyContext,
  ): Promise<z.infer<typeof paymentLinkSchema>>
  get(sessionId: string): Promise<z.infer<typeof paymentLinkSchema>>
}
function paymentLink(ctx: FinanceToolContext) {
  if (ctx.actor !== "staff" || ctx.audience !== "staff") {
    throw new ToolError("Payment-link Tools require a staff grant.", "AUTHORIZATION_DENIED")
  }
  return requireService(ctx.paymentLink, "paymentLink")
}
const staffPaymentRead = {
  owner: PAYMENT_LINK_OWNER,
  capabilityVersion: PAYMENT_LINK_VERSION,
  requiredScopes: PAYMENT_LINK_READ_SCOPES,
  audience: PAYMENT_LINK_STAFF_AUDIENCE,
  tier: "sensitive" as const,
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
}
export const getPaymentLinkTool = defineTool({
  ...staffPaymentRead,
  capabilityId: `@voyant-travel/finance#tool.get-payment-link`,
  name: "get_payment_link",
  description: "Inspect one payment link using a staff grant without exposing provider payloads.",
  inputSchema: getPaymentLinkInputSchema,
  outputSchema: paymentLinkSchema,
  handler: ({ sessionId }, ctx: FinanceToolContext) => paymentLink(ctx).get(sessionId),
})
export const CREATE_INVOICE_PAYMENT_LINK_HANDLER_POLICY = {
  capabilityId: `@voyant-travel/finance#tool.create-invoice-payment-link`,
  capabilityVersion: PAYMENT_LINK_VERSION,
  canonicalName: "create_invoice_payment_link",
  actionPolicy: {
    id: `@voyant-travel/finance#action.create-invoice-payment-link`,
    capabilityId: `@voyant-travel/finance#action.create-invoice-payment-link`,
    version: PAYMENT_LINK_VERSION,
    kind: "execute",
    targetType: "invoice",
    commandTargetField: "invoiceId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation
export const createInvoicePaymentLinkTool = defineTool({
  owner: PAYMENT_LINK_OWNER,
  capabilityVersion: PAYMENT_LINK_VERSION,
  requiredScopes: PAYMENT_LINK_WRITE_SCOPES,
  audience: PAYMENT_LINK_STAFF_AUDIENCE,
  tier: "write",
  capabilityId: `@voyant-travel/finance#tool.create-invoice-payment-link`,
  name: "create_invoice_payment_link",
  description:
    "Create an idempotent payment link for an invoice's authoritative outstanding balance. Amount and currency cannot be overridden.",
  inputSchema: createInvoicePaymentLinkInputSchema,
  outputSchema: paymentLinkSchema,
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  actionPolicyEnforcement: "handler",
  annotations: { idempotentHint: true },
  handler: (input, ctx: FinanceToolContext) =>
    paymentLink(ctx).createFromInvoice(
      input,
      admitHandlerActionPolicy(ctx, CREATE_INVOICE_PAYMENT_LINK_HANDLER_POLICY),
    ),
})
export const financePaymentLinkTools = [getPaymentLinkTool, createInvoicePaymentLinkTool] as const
