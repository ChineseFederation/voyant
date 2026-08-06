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
    input: z.infer<typeof issueInvoiceFromBookingToolInputSchema>,
  ): Promise<unknown>
  recordPaymentDispute(input: z.infer<typeof recordPaymentDisputeToolInputSchema>): Promise<unknown>
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
    "Book a product for a client in one call: product and option, the billing party (a `personId` for a private client or an `organizationId` for a company), travelers, and rooms. Travelers are given INLINE here as names and details — they do not need to exist as CRM People first, so do not go looking for a companion in the CRM or create one before booking; only the billing party is an existing record. The platform resolves the booking reference and the idempotency key server-side, so nothing has to be carried across calls. An incomplete request returns actionable issues and creates nothing.",
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
  approvalId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "The approval id from a prior `approval_required` response, once that approval has been APPROVED. Omit on the first call.",
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
    "Issue an invoice or proforma from a booking. This takes TWO calls because issuing is approval-gated. First call it with just the `command`: it creates an approval and returns `approval_required` — no invoice exists yet. Then have that approval approved (`approve_action_approval`) and call this again with the identical `command` plus the `approvalId`, which issues the document. The returned `nextSteps` spell out both steps with the concrete id. Do not invent an idempotency key; the platform derives one from the command so the approved retry replays rather than issuing twice.",
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

export const financeTools = [
  listInvoicesTool,
  getInvoiceTool,
  voidInvoiceTool,
  issueInvoiceRefundTool,
  issueInvoiceFromBookingTool,
  recordPaymentDisputeTool,
  previewUnsyncedProformaFromBookingTool,
  issueUnsyncedProformaFromBookingTool,
] as const
