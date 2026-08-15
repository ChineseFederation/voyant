/**
 * Booking Document Tools.
 *
 * An operator moving historical bookings onto the platform holds paperwork that
 * was issued somewhere else: a contract signed on paper, an invoice produced by
 * the accounting system, a passport scan. The admin UI has always been able to
 * attach those; no Tool could, so the agent could create the person and the
 * booking and then had to hand the documents back to a human, one booking at a
 * time (voyant#4657).
 *
 * `record_booking_document` closes that. It RECORDS a document, which is a
 * different act from issuing one:
 *
 * - it allocates nothing from `invoice_number_series` or a contract series —
 *   the document keeps the number its own issuer gave it;
 * - it renders nothing from a template, so the recorded file is the authority;
 * - it creates no `invoices` row and no legal `contracts` row, so nothing here
 *   enters accounts receivable, settlement, or the contract lifecycle.
 *
 * To ISSUE a document, use the Tools that own that act instead:
 * `generate_booking_contract_document` for a contract Voyant renders, and
 * `issue_invoice_from_booking` for an invoice Voyant numbers.
 */

import {
  bookingDocumentTypeSchema,
  isoDateOrTimestampSchema,
  requireIssuedDocumentIdentity,
} from "@voyant-travel/bookings-contracts"
import {
  admitHandlerActionPolicy,
  defineTool,
  deriveCommandIdempotencyKey,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type ToolHandlerActionPolicyContext,
  withServerResolvedIdempotencyKey,
} from "@voyant-travel/tools"
import { z } from "zod"

const OWNER = "@voyant-travel/bookings"
const VERSION = "v1"
const STAFF_AUDIENCE = { source: "grant", allowed: ["staff"] } as const

/**
 * Traveller paperwork on a booking is identity data, so reading the collection
 * needs the explicit booking-PII grant even though recording one does not.
 */
const DOCUMENT_READ_SCOPES = ["bookings:read", "bookings-pii:read"] as const
const DOCUMENT_WRITE_SCOPES = ["bookings:write"] as const

export const bookingDocumentToolSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  travelerId: z.string().nullable(),
  type: bookingDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
  issuedBy: z.string().nullable(),
  issuedSeries: z.string().nullable(),
  issuedNumber: z.string().nullable(),
  issuedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export const listBookingDocumentsToolInputSchema = z.object({
  bookingId: z.string().min(1).describe("The booking id (book_…) whose documents to list."),
})

export const listBookingDocumentsToolOutputSchema = z.object({
  data: z.array(bookingDocumentToolSchema),
})

export const recordBookingDocumentToolInputSchema = z
  .object({
    bookingId: z.string().min(1).describe("The booking the document belongs to."),
    type: bookingDocumentTypeSchema.describe(
      "What the document is. `contract`, `invoice`, `proforma`, and `credit_note` record commercial paperwork issued outside Voyant and must carry issuedNumber and issuedAt; `passport_copy`, `visa`, `insurance`, `health`, and `other` are traveller documents.",
    ),
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("The file's name as the operator sees it."),
    fileUrl: z
      .string()
      .url()
      .describe(
        "Where the already-uploaded file lives. This Tool records a file; it renders none.",
      ),
    issuedBy: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe("Who issued the document — an accounting system, agency, or authority."),
    issuedSeries: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .optional()
      .describe("The issuer's own series, when the document carries one. Never allocated here."),
    issuedNumber: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional()
      .describe(
        "The issuer's own number, copied from the document. Required for a contract, invoice, proforma, or credit note. Recording the same series and number on the same booking twice replays the first record instead of duplicating it.",
      ),
    issuedAt: isoDateOrTimestampSchema
      .optional()
      .describe(
        "The date the issuer put on the document, not today. Required for a contract, invoice, proforma, or credit note.",
      ),
    travelerId: z
      .string()
      .min(1)
      .optional()
      .describe("The traveller a personal document belongs to. Omit for a booking-wide document."),
    expiresAt: isoDateOrTimestampSchema
      .optional()
      .describe("When the document stops being valid, for passports, visas, and insurance."),
    notes: z.string().trim().max(10_000).optional().describe("Free-text note about the record."),
  })
  .superRefine(requireIssuedDocumentIdentity)

export const recordBookingDocumentToolOutputSchema = z.object({
  status: z.literal("recorded"),
  document: bookingDocumentToolSchema,
  /** True when this exact issued document was already on the booking. */
  replayed: z.boolean(),
  nextActions: z.tuple([
    z.object({
      tool: z.literal("list_booking_documents"),
      input: z.object({ bookingId: z.string().min(1) }),
    }),
  ]),
})

export interface BookingDocumentsToolServices {
  listBookingDocuments(
    input: z.infer<typeof listBookingDocumentsToolInputSchema>,
  ): Promise<z.infer<typeof listBookingDocumentsToolOutputSchema> | null>
  recordBookingDocument(
    input: z.infer<typeof recordBookingDocumentToolInputSchema>,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<{ document: unknown; replayed: boolean } | null>
}

export type BookingDocumentsToolContext = ToolContext & {
  bookingDocuments?: BookingDocumentsToolServices
}

function bookingDocuments(ctx: BookingDocumentsToolContext): BookingDocumentsToolServices {
  return requireService(ctx.bookingDocuments, "bookingDocuments")
}

/**
 * Handler-owned enforcement, deliberately.
 *
 * Under the generic gate a required-ledger execute action with a command
 * target field keys its preflight on a fingerprint of the whole command, so an
 * identical retry is refused as a duplicate dispatch before the handler runs —
 * and this Tool's whole point is that an operator can replay a batch of
 * historical bookings safely. Owning the policy here lets the recording itself
 * be the replay authority: the unique index on the document's issued identity
 * decides, and the caller gets `replayed: true` instead of an authorization
 * error. `resolvesIdempotencyKeyServerSide` keeps the key off the wire, so no
 * token has to cross calls.
 */
export const RECORD_BOOKING_DOCUMENT_HANDLER_POLICY = {
  capabilityId: `${OWNER}#tool.record-booking-document`,
  capabilityVersion: VERSION,
  canonicalName: "record_booking_document",
  actionPolicy: {
    id: `${OWNER}#action.record-booking-document`,
    capabilityId: "bookings:documents:record",
    version: VERSION,
    kind: "execute",
    targetType: "booking_document",
    commandTargetField: "bookingId",
    targetLifecycle: "existing",
    risk: "medium",
    ledger: "required",
    approval: "never",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export const listBookingDocumentsTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.list-booking-documents`,
  capabilityVersion: VERSION,
  name: "list_booking_documents",
  description:
    "List the documents held against one booking: contracts, invoices, proformas, and credit notes recorded from outside Voyant, plus traveller documents. Read-only. Generated booking-contract PDFs are legal's attachments and are read with list_contract_attachments instead.",
  inputSchema: listBookingDocumentsToolInputSchema,
  outputSchema: listBookingDocumentsToolOutputSchema,
  requiredScopes: DOCUMENT_READ_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "sensitive",
  riskPolicy: READ_ONLY_RISK,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async handler(input, ctx: BookingDocumentsToolContext) {
    const result = await bookingDocuments(ctx).listBookingDocuments(input)
    if (!result) {
      throw new ToolError(`Booking "${input.bookingId}" was not found.`, "NOT_FOUND", {
        bookingId: input.bookingId,
      })
    }
    return listBookingDocumentsToolOutputSchema.parse(result)
  },
})

export const recordBookingDocumentTool = defineTool({
  owner: OWNER,
  capabilityId: `${OWNER}#tool.record-booking-document`,
  capabilityVersion: VERSION,
  name: "record_booking_document",
  description:
    "Record a document that already exists against a booking — a contract, invoice, proforma, or credit note issued outside Voyant, or a traveller document such as a passport copy, visa, or insurance certificate. This RECORDS, it does not ISSUE: it allocates no number from any Voyant series, renders nothing from a template, and creates no invoice or legal contract, so the recorded file stays the authority. Supply the issuer's own series, number, and issue date for a contract, invoice, proforma, or credit note. To have Voyant issue a document instead, use generate_booking_contract_document or issue_invoice_from_booking.",
  inputSchema: recordBookingDocumentToolInputSchema,
  outputSchema: recordBookingDocumentToolOutputSchema,
  requiredScopes: DOCUMENT_WRITE_SCOPES,
  audience: STAFF_AUDIENCE,
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  resolvesIdempotencyKeyServerSide: true,
  async handler(input, ctx: BookingDocumentsToolContext) {
    const admitted = withServerResolvedIdempotencyKey(
      admitHandlerActionPolicy(ctx, RECORD_BOOKING_DOCUMENT_HANDLER_POLICY),
      await deriveCommandIdempotencyKey("record-booking-document", input),
    )
    const result = await bookingDocuments(ctx).recordBookingDocument(input, admitted)
    if (!result) {
      throw new ToolError(`Booking "${input.bookingId}" was not found.`, "NOT_FOUND", {
        bookingId: input.bookingId,
      })
    }
    return recordBookingDocumentToolOutputSchema.parse({
      status: "recorded",
      document: result.document,
      replayed: result.replayed,
      nextActions: [{ tool: "list_booking_documents", input: { bookingId: input.bookingId } }],
    })
  },
})

export const bookingDocumentsTools = [listBookingDocumentsTool, recordBookingDocumentTool] as const
