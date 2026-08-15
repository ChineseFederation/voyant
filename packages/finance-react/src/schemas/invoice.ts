import { z } from "zod"

import { arrayEnvelope, paginatedEnvelope, singleEnvelope } from "./common.js"

export const invoiceStatusSchema = z.enum([
  "draft",
  "pending_external_allocation",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
])

export const paymentStatusSchema = z.enum(["pending", "completed", "failed", "refunded"])
export type PaymentStatus = z.infer<typeof paymentStatusSchema>

// Mirrors the backend's `paymentMethodSchema` from
// `@voyant-travel/finance/validation-shared`. Kept inline rather than
// re-imported from `@voyant-travel/finance` so the browser bundle doesn't
// drag in drizzle and the rest of the server-only package.
export const paymentMethodSchema = z.enum([
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
export type PaymentMethod = z.infer<typeof paymentMethodSchema>
export const creditNoteStatusSchema = z.enum(["draft", "issued", "applied"])

export const invoiceTypeSchema = z.enum(["invoice", "proforma", "credit_note"])

export const invoiceNumberResetStrategySchema = z.enum(["never", "annual", "monthly"])
export type InvoiceNumberResetStrategy = z.infer<typeof invoiceNumberResetStrategySchema>

export const invoiceNumberSeriesScopeSchema = invoiceTypeSchema
export type InvoiceNumberSeriesScope = z.infer<typeof invoiceNumberSeriesScopeSchema>

export const invoiceNumberSeriesRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  prefix: z.string(),
  separator: z.string(),
  padLength: z.number().int(),
  currentSequence: z.number().int(),
  resetStrategy: invoiceNumberResetStrategySchema,
  resetAt: z.string().nullable(),
  scope: invoiceNumberSeriesScopeSchema,
  isDefault: z.boolean(),
  externalProvider: z.string().nullable(),
  externalConfigKey: z.string().nullable(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type InvoiceNumberSeriesRecord = z.infer<typeof invoiceNumberSeriesRecordSchema>

export const invoiceRecordSchema = z
  .object({
    id: z.string(),
    invoiceNumber: z.string(),
    bookingId: z.string(),
    personId: z.string().nullable(),
    organizationId: z.string().nullable(),
    /**
     * `invoice` (final), `proforma` (placeholder pending bank transfer),
     * or `credit_note` (refund / cancellation). Drives the type badge
     * + filename on the booking detail page.
     */
    invoiceType: invoiceTypeSchema.optional(),
    status: invoiceStatusSchema,
    currency: z.string(),
    subtotalCents: z.number().int(),
    taxCents: z.number().int(),
    totalCents: z.number().int(),
    paidCents: z.number().int(),
    balanceDueCents: z.number().int(),
    issueDate: z.string(),
    dueDate: z.string(),
    notes: z.string().nullable(),
    voidedAt: z.string().nullable().optional(),
    voidReason: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    /**
     * Distinct payment-schedule ids referenced by this invoice's line
     * items. Populated by the list endpoint so the booking-detail
     * payment-schedule table can hide "Generate invoice/proforma" when
     * a document already covers a row.
     */
    bookingPaymentScheduleIds: z.array(z.string()).optional(),
    /**
     * For proforma rows, points at the final invoice that replaced
     * this proforma (and is the inverse of `convertedFromInvoiceId`).
     * Populated by `getInvoiceById` — letting the booking detail page
     * surface "Invoiced" status + a deep link on a void proforma.
     */
    convertedToInvoiceId: z.string().nullable().optional(),
    convertedToInvoiceNumber: z.string().nullable().optional(),
  })
  // Permissive on extra columns the server may return (e.g.
  // `convertedFromInvoiceId`, `baseCurrency`). Adding them all to the
  // schema invites churn; passthrough lets the UI use what it needs.
  .passthrough()

export type InvoiceRecord = z.infer<typeof invoiceRecordSchema>

export const lineItemRecordSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  description: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  taxRate: z.number().int().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
})

export type LineItemRecord = z.infer<typeof lineItemRecordSchema>

export const paymentRecordSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  fxRateSetId: z.string().nullable().optional(),
  paymentMethod: z.string(),
  status: paymentStatusSchema,
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export type PaymentRecord = z.infer<typeof paymentRecordSchema>

export const creditNoteRecordSchema = z.object({
  id: z.string(),
  creditNoteNumber: z.string(),
  invoiceId: z.string(),
  status: creditNoteStatusSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  reason: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
})

export type CreditNoteRecord = z.infer<typeof creditNoteRecordSchema>

export const financeNoteRecordSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  authorId: z.string(),
  content: z.string(),
  createdAt: z.string(),
})

export type FinanceNoteRecord = z.infer<typeof financeNoteRecordSchema>

export const supplierPaymentRecordSchema = z.object({
  id: z.string(),
  // AP payments may settle a whole invoice with no booking (§5.4).
  bookingId: z.string().nullable(),
  supplierInvoiceId: z.string().nullable().optional(),
  supplierId: z.string().nullable(),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable().optional(),
  baseAmountCents: z.number().int().nullable().optional(),
  fxRateSetId: z.string().nullable().optional(),
  paymentMethod: z.string(),
  status: paymentStatusSchema,
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
})

export type SupplierPaymentRecord = z.infer<typeof supplierPaymentRecordSchema>

export const paymentKindSchema = z.enum(["customer", "supplier"])

export const unifiedPaymentRecordSchema = z.object({
  kind: paymentKindSchema,
  id: z.string(),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  bookingId: z.string().nullable(),
  bookingNumber: z.string().nullable(),
  supplierId: z.string().nullable(),
  supplierName: z.string().nullable(),
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  amountCents: z.number().int(),
  currency: z.string(),
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  paymentMethod: z.string(),
  status: paymentStatusSchema,
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UnifiedPaymentRecord = z.infer<typeof unifiedPaymentRecordSchema>

export const paymentScheduleTypeSchema = z.enum([
  "deposit",
  "installment",
  "balance",
  "hold",
  "other",
])

export const paymentScheduleStatusSchema = z.enum([
  "pending",
  "due",
  "paid",
  "waived",
  "cancelled",
  "expired",
])

export const bookingPaymentScheduleRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  /** Present when a Booking Amendment raised this obligation. */
  amendmentId: z.string().nullable().default(null),
  scheduleType: paymentScheduleTypeSchema,
  status: paymentScheduleStatusSchema,
  dueDate: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingPaymentScheduleRecord = z.infer<typeof bookingPaymentScheduleRecordSchema>

export const bookingPaymentSchedulesResponse = arrayEnvelope(bookingPaymentScheduleRecordSchema)

// Payment sessions — admin surface of `/v1/admin/finance/payment-sessions`.
// Mirrors the backend's `payment_sessions` row (dates serialized to ISO
// strings); the status enum is kept inline like `paymentMethodSchema`
// above so the browser bundle doesn't drag in the server package.
export const paymentSessionStatusSchema = z.enum([
  "pending",
  "requires_redirect",
  "processing",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
])
export type PaymentSessionStatus = z.infer<typeof paymentSessionStatusSchema>

export const paymentTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("booking"), bookingId: z.string() }),
  z.object({ type: z.literal("invoice"), invoiceId: z.string() }),
  z.object({ type: z.literal("booking_payment_schedule"), bookingPaymentScheduleId: z.string() }),
  z.object({ type: z.literal("booking_guarantee"), bookingGuaranteeId: z.string() }),
  z.object({ type: z.literal("flight_order"), flightOrderId: z.string() }),
  z.object({ type: z.literal("program"), programId: z.string() }),
  z.object({ type: z.literal("supplier_settlement"), supplierSettlementId: z.string() }),
  z.object({ type: z.literal("channel_settlement"), channelSettlementId: z.string() }),
  z.object({ type: z.literal("provider_reference"), provider: z.string(), reference: z.string() }),
  z.object({ type: z.literal("legacy_order"), legacyOrderId: z.string() }),
])

export const paymentProvenanceSchema = z.object({
  source: z.enum([
    "operator",
    "storefront",
    "customer_portal",
    "payment_provider",
    "supplier_channel",
    "migration",
    "other",
  ]),
  provider: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
})

function derivePaymentTarget(value: {
  targetType: string
  targetId: string | null
  bookingId: string | null
  legacyOrderId: string | null
  invoiceId: string | null
  bookingPaymentScheduleId: string | null
  bookingGuaranteeId: string | null
  provider: string | null
  externalReference: string | null
}) {
  if (value.bookingPaymentScheduleId) {
    return {
      type: "booking_payment_schedule" as const,
      bookingPaymentScheduleId: value.bookingPaymentScheduleId,
    }
  }
  if (value.bookingGuaranteeId) {
    return { type: "booking_guarantee" as const, bookingGuaranteeId: value.bookingGuaranteeId }
  }
  if (value.invoiceId) return { type: "invoice" as const, invoiceId: value.invoiceId }
  if (value.targetType === "flight_order" && value.targetId) {
    return { type: "flight_order" as const, flightOrderId: value.targetId }
  }
  if (value.bookingId) return { type: "booking" as const, bookingId: value.bookingId }
  if (value.legacyOrderId) {
    return { type: "legacy_order" as const, legacyOrderId: value.legacyOrderId }
  }
  if (value.provider && value.externalReference) {
    return {
      type: "provider_reference" as const,
      provider: value.provider,
      reference: value.externalReference,
    }
  }
  return null
}

export const paymentSessionRecordSchema = z
  .object({
    id: z.string(),
    target: paymentTargetSchema.nullable().optional(),
    provenance: paymentProvenanceSchema.nullable().optional(),
    targetType: z.string(),
    targetId: z.string().nullable(),
    bookingId: z.string().nullable(),
    legacyOrderId: z.string().nullable().optional(),
    orderId: z.string().nullable().optional(),
    invoiceId: z.string().nullable(),
    bookingPaymentScheduleId: z.string().nullable(),
    bookingGuaranteeId: z.string().nullable(),
    paymentInstrumentId: z.string().nullable(),
    paymentAuthorizationId: z.string().nullable(),
    paymentCaptureId: z.string().nullable(),
    paymentId: z.string().nullable(),
    status: paymentSessionStatusSchema,
    provider: z.string().nullable(),
    providerConnectionId: z.string().nullable().optional(),
    providerSessionId: z.string().nullable(),
    providerPaymentId: z.string().nullable(),
    externalReference: z.string().nullable(),
    idempotencyKey: z.string().nullable(),
    clientReference: z.string().nullable(),
    currency: z.string(),
    amountCents: z.number().int(),
    paymentMethod: paymentMethodSchema.nullable(),
    payerPersonId: z.string().nullable(),
    payerOrganizationId: z.string().nullable(),
    payerEmail: z.string().nullable(),
    payerName: z.string().nullable(),
    redirectUrl: z.string().nullable(),
    returnUrl: z.string().nullable(),
    cancelUrl: z.string().nullable(),
    callbackUrl: z.string().nullable(),
    expiresAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    failedAt: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    expiredAt: z.string().nullable(),
    failureCode: z.string().nullable(),
    failureMessage: z.string().nullable(),
    notes: z.string().nullable(),
    providerPayload: z.record(z.string(), z.unknown()).nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .transform(({ orderId, legacyOrderId, target, provenance, ...value }) => {
    const resolvedLegacyOrderId = legacyOrderId ?? orderId ?? null
    return {
      ...value,
      legacyOrderId: resolvedLegacyOrderId,
      target:
        target ??
        derivePaymentTarget({
          ...value,
          legacyOrderId: resolvedLegacyOrderId,
        }),
      provenance: provenance ?? null,
    }
  })

export type PaymentSessionRecord = z.infer<typeof paymentSessionRecordSchema>

export const paymentSessionListResponse = paginatedEnvelope(paymentSessionRecordSchema)
export const paymentSessionSingleResponse = singleEnvelope(paymentSessionRecordSchema)

// Customer payment policy — structural mirror of `PaymentPolicy` /
// `PaymentPolicySource` from `@voyant-travel/finance/payment-policy`, kept
// inline for the same browser-bundle reason as the enums above.
export const financeDepositRuleSchema = z.object({
  kind: z.enum(["none", "percent", "fixed_cents"]),
  percent: z.number().min(0).max(100).optional(),
  amountCents: z.number().int().min(0).optional(),
})

export const financePaymentPolicySchema = z.object({
  deposit: financeDepositRuleSchema,
  minDaysBeforeDepartureForDeposit: z.number().int().min(0),
  balanceDueDaysBeforeDeparture: z.number().int().min(0),
  balanceDueMinDaysFromNow: z.number().int().min(0),
})

export type FinancePaymentPolicy = z.infer<typeof financePaymentPolicySchema>

export const financePaymentPolicySourceSchema = z.enum([
  "booking",
  "listing",
  "category",
  "supplier",
  "operator_default",
])

export type FinancePaymentPolicySource = z.infer<typeof financePaymentPolicySourceSchema>

// `POST /v1/admin/bookings/:bookingId/payment-schedule/regenerate` —
// returns the regenerated schedule rows plus the persisted booking-level
// override (or null) and which cascade layer produced the schedule.
export const regenerateBookingPaymentScheduleResultSchema = z.object({
  schedule: z.array(bookingPaymentScheduleRecordSchema),
  bookingPolicy: financePaymentPolicySchema.nullable(),
  cascadeSource: financePaymentPolicySourceSchema,
})

export type RegenerateBookingPaymentScheduleResult = z.infer<
  typeof regenerateBookingPaymentScheduleResultSchema
>

export const regenerateBookingPaymentScheduleResponse = singleEnvelope(
  regenerateBookingPaymentScheduleResultSchema,
)

export const invoiceFxRateRecordSchema = z.object({
  baseCurrency: z.string(),
  quoteCurrency: z.string(),
  date: z.string().optional(),
  rate: z.number(),
  source: z.string().optional(),
  quotedAt: z.string().optional(),
  validUntil: z.string().optional(),
  fxCommissionBps: z.number().int().nonnegative().default(0),
  effectiveRate: z.number(),
  fxCommissionInvoiceMention: z.string().optional(),
})

export type InvoiceFxRateRecord = z.infer<typeof invoiceFxRateRecordSchema>

export const invoiceFxRateResponse = singleEnvelope(invoiceFxRateRecordSchema)

export const guaranteeTypeSchema = z.enum([
  "deposit",
  "credit_card",
  "preauth",
  "card_on_file",
  "bank_transfer",
  "voucher",
  "agency_letter",
  "other",
])

export const guaranteeStatusSchema = z.enum([
  "pending",
  "active",
  "released",
  "failed",
  "cancelled",
  "expired",
])

export const bookingGuaranteeRecordSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingPaymentScheduleId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  guaranteeType: guaranteeTypeSchema,
  status: guaranteeStatusSchema,
  currency: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  provider: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  guaranteedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type BookingGuaranteeRecord = z.infer<typeof bookingGuaranteeRecordSchema>

export const bookingGuaranteesResponse = arrayEnvelope(bookingGuaranteeRecordSchema)

export const invoiceAttachmentRecordSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  kind: z.string(),
  name: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  storageKey: z.string().nullable(),
  checksum: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
})

export type InvoiceAttachmentRecord = z.infer<typeof invoiceAttachmentRecordSchema>

// ---------- supplier invoices (accounts payable) ----------
