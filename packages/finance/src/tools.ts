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
} from "./routes-invoice-schemas.js"
import { bookingCreateToolSchema } from "./service-booking-create.js"
import { parseJsonResult } from "./tool-json.js"
import {
  insertCreditNoteSchema,
  invoiceFromBookingSchema,
  invoiceListQuerySchema,
  paymentDisputeRecordSchema,
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
}

export type FinanceToolContext = ToolContext & { finance?: FinanceToolServices }

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
  replayed: z.boolean(),
  booking: bookingToolDetailSchema,
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
      replayed: result.replayed,
      booking: result.booking,
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
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional. Leave this out — the platform derives a stable key from the command itself. Only send one to override that.",
    ),
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
  z.object({ status: z.literal("issued"), invoice: invoiceSchema, replayed: z.boolean() }),
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

export const financeTools = [
  listInvoicesTool,
  getInvoiceTool,
  voidInvoiceTool,
  issueInvoiceRefundTool,
  issueInvoiceFromBookingTool,
  invoiceBookingTool,
  recordPaymentDisputeTool,
  recordRefundSettlementTool,
  previewUnsyncedProformaFromBookingTool,
  issueUnsyncedProformaFromBookingTool,
] as const
