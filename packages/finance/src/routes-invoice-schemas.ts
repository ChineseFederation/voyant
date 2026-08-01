/**
 * Shared OpenAPI response row schemas for the finance invoice admin routes
 * (voyant#2114 / voyant#2208 — finance sub-batch 9B). Authored from the Drizzle
 * `$inferSelect` shapes of the invoice-family tables (`invoices`,
 * `invoice_line_items`, `payments`, `credit_notes`, `credit_note_line_items`,
 * `finance_notes`, `invoice_renditions`, `invoice_attachments`,
 * `invoice_external_refs`, `payment_sessions`).
 *
 * §17: timestamp / date columns serialize to strings over the wire; integer
 * money columns (`*_cents`, `*_rate`, `quantity`, `sequence`, `file_size`) stay
 * numbers. Typed jsonb (`Record<string, unknown>`) is modeled as a record;
 * untyped jsonb is `z.unknown().nullable()`. Used by the three invoice route
 * files (core / documents / issue) so the declared wire shape stays consistent.
 */

import { z } from "@hono/zod-openapi"

export const errorResponseSchema = z.object({ error: z.string() })
export const successResponseSchema = z.object({ success: z.boolean() })
export const idParamSchema = z.object({ id: z.string() })

/** `date`/timestamp columns serialize to strings (§17). */
const isoString = z.string()
/** Untyped jsonb columns. */
const unknownJsonb = z.unknown().nullable()
/** `jsonb().$type<Record<string, unknown>>()` columns. */
const recordJsonb = z.record(z.string(), z.unknown()).nullable()

export const invoiceStatusValues = [
  "draft",
  "pending_external_allocation",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const

export const invoiceTypeValues = ["invoice", "proforma", "credit_note"] as const

const paymentMethodValues = [
  "bank_transfer",
  "credit_card",
  "debit_card",
  "cash",
  "cheque",
  "wallet",
  "direct_bill",
  "travel_credit",
  "other",
] as const

const paymentStatusValues = ["pending", "completed", "failed", "refunded"] as const

const creditNoteStatusValues = ["draft", "issued", "applied"] as const

const renditionFormatValues = ["html", "pdf", "xml", "json"] as const
const renditionStatusValues = ["pending", "ready", "failed", "stale"] as const

const paymentSessionStatusValues = [
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
] as const

const paymentSessionTargetTypeValues = [
  "booking_session",
  "booking",
  "order",
  "invoice",
  "booking_payment_schedule",
  "booking_guarantee",
  "flight_order",
  "other",
] as const

// --- invoices -------------------------------------------------------------

/** Bare `invoices.$inferSelect` wire shape. */
export const invoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  invoiceType: z.enum(invoiceTypeValues),
  convertedFromInvoiceId: z.string().nullable(),
  seriesId: z.string().nullable(),
  sequence: z.number().int().nullable(),
  templateId: z.string().nullable(),
  taxRegimeId: z.string().nullable(),
  language: z.string().nullable(),
  bookingId: z.string(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  status: z.enum(invoiceStatusValues),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  fxRateSetId: z.string().nullable(),
  subtotalCents: z.number().int(),
  baseSubtotalCents: z.number().int().nullable(),
  taxCents: z.number().int(),
  baseTaxCents: z.number().int().nullable(),
  totalCents: z.number().int(),
  baseTotalCents: z.number().int().nullable(),
  paidCents: z.number().int(),
  basePaidCents: z.number().int().nullable(),
  balanceDueCents: z.number().int(),
  baseBalanceDueCents: z.number().int().nullable(),
  commissionPercent: z.number().int().nullable(),
  commissionAmountCents: z.number().int().nullable(),
  issueDate: isoString,
  dueDate: isoString,
  notes: z.string().nullable(),
  voidedAt: isoString.nullable(),
  voidReason: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

/**
 * `getInvoiceById` augments the bare row with the inverse proforma→invoice
 * link so the UI can show "Invoiced" for a converted proforma.
 */
export const invoiceDetailSchema = invoiceSchema.extend({
  convertedToInvoiceId: z.string().nullable(),
  convertedToInvoiceNumber: z.string().nullable(),
})

/** `listInvoices` rows carry the distinct linked payment-schedule ids. */
export const invoiceListItemSchema = invoiceSchema.extend({
  bookingPaymentScheduleIds: z.array(z.string()),
})

// --- invoice line items ---------------------------------------------------

export const invoiceLineItemSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  bookingItemId: z.string().nullable(),
  bookingPaymentScheduleId: z.string().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  taxRate: z.number().int().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoString,
})

// --- payments -------------------------------------------------------------

export const paymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  fxRateSetId: z.string().nullable(),
  paymentMethod: z.enum(paymentMethodValues),
  paymentInstrumentId: z.string().nullable(),
  paymentAuthorizationId: z.string().nullable(),
  paymentCaptureId: z.string().nullable(),
  status: z.enum(paymentStatusValues),
  referenceNumber: z.string().nullable(),
  paymentDate: isoString,
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

// --- credit notes ---------------------------------------------------------

export const creditNoteSchema = z.object({
  id: z.string(),
  creditNoteNumber: z.string(),
  invoiceId: z.string(),
  status: z.enum(creditNoteStatusValues),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  fxRateSetId: z.string().nullable(),
  reason: z.string(),
  notes: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

export const creditNoteLineItemSchema = z.object({
  id: z.string(),
  creditNoteId: z.string(),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  sortOrder: z.number().int(),
  createdAt: isoString,
})

// --- finance notes --------------------------------------------------------

export const financeNoteSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: isoString,
})

// --- invoice renditions ---------------------------------------------------

export const invoiceRenditionSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  templateId: z.string().nullable(),
  format: z.enum(renditionFormatValues),
  status: z.enum(renditionStatusValues),
  storageKey: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  checksum: z.string().nullable(),
  language: z.string().nullable(),
  errorMessage: z.string().nullable(),
  generatedAt: isoString.nullable(),
  metadata: unknownJsonb,
  createdAt: isoString,
  updatedAt: isoString,
})

// --- invoice attachments --------------------------------------------------

export const invoiceAttachmentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  metadata: unknownJsonb,
  createdAt: isoString,
})

// --- invoice external refs ------------------------------------------------

export const invoiceExternalRefSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  provider: z.string(),
  externalId: z.string().nullable(),
  externalNumber: z.string().nullable(),
  externalUrl: z.string().nullable(),
  status: z.string().nullable(),
  metadata: unknownJsonb,
  syncedAt: isoString.nullable(),
  syncError: z.string().nullable(),
  createdAt: isoString,
  updatedAt: isoString,
})

// --- payment sessions -----------------------------------------------------

export const paymentSessionSchema = z.object({
  id: z.string(),
  targetType: z.enum(paymentSessionTargetTypeValues),
  targetId: z.string().nullable(),
  bookingId: z.string().nullable(),
  orderId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  bookingPaymentScheduleId: z.string().nullable(),
  bookingGuaranteeId: z.string().nullable(),
  paymentInstrumentId: z.string().nullable(),
  paymentAuthorizationId: z.string().nullable(),
  paymentCaptureId: z.string().nullable(),
  paymentId: z.string().nullable(),
  status: z.enum(paymentSessionStatusValues),
  provider: z.string().nullable(),
  providerConnectionId: z.string().nullable(),
  providerSessionId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  externalReference: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  clientReference: z.string().nullable(),
  currency: z.string(),
  amountCents: z.number().int(),
  paymentMethod: z.enum(paymentMethodValues).nullable(),
  payerPersonId: z.string().nullable(),
  payerOrganizationId: z.string().nullable(),
  payerEmail: z.string().nullable(),
  payerName: z.string().nullable(),
  redirectUrl: z.string().nullable(),
  returnUrl: z.string().nullable(),
  cancelUrl: z.string().nullable(),
  callbackUrl: z.string().nullable(),
  expiresAt: isoString.nullable(),
  completedAt: isoString.nullable(),
  failedAt: isoString.nullable(),
  cancelledAt: isoString.nullable(),
  expiredAt: isoString.nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  notes: z.string().nullable(),
  providerPayload: recordJsonb,
  metadata: recordJsonb,
  createdAt: isoString,
  updatedAt: isoString,
})
