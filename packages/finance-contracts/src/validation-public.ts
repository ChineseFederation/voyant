import { z } from "zod"
import { paymentProvenanceSchema, paymentTargetSchema } from "./validation-payments.js"
import {
  paymentInstrumentStatusSchema,
  paymentInstrumentTypeSchema,
  paymentMethodSchema,
  paymentScheduleStatusSchema,
  paymentScheduleTypeSchema,
  paymentSessionStatusSchema,
  paymentSessionTargetTypeSchema,
} from "./validation-shared.js"

export const publicFinanceInvoiceTypeSchema = z.enum(["invoice", "proforma", "credit_note"])
export const publicFinanceDocumentAvailabilitySchema = z.enum([
  "missing",
  "pending",
  "ready",
  "failed",
  "stale",
])
export const publicFinanceDocumentFormatSchema = z.enum(["html", "pdf", "xml", "json"])

export const publicPaymentOptionsQuerySchema = z.object({
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  provider: z.string().optional(),
  instrumentType: paymentInstrumentTypeSchema.optional(),
  includeInactive: z.coerce.boolean().default(false),
})

export const publicStartPaymentSessionSchema = z.object({
  target: paymentTargetSchema.optional(),
  provenance: paymentProvenanceSchema.optional(),
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  paymentInstrumentId: z.string().optional().nullable(),
  payerPersonId: z.string().optional().nullable(),
  payerOrganizationId: z.string().optional().nullable(),
  payerEmail: z.string().email().optional().nullable(),
  payerName: z.string().max(255).optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  idempotencyKey: z.string().max(255).optional().nullable(),
  clientReference: z.string().max(255).optional().nullable(),
  returnUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  callbackUrl: z.string().url().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const publicValidateTravelCreditSchema = z.object({
  code: z.string().min(1).max(255),
  bookingId: z.string().optional().nullable(),
  currency: z.string().min(3).max(3).optional().nullable(),
  amountCents: z.number().int().min(1).optional().nullable(),
})

export const publicFinanceDocumentLookupQuerySchema = z.object({
  reference: z.string().min(1).max(255),
  invoiceType: publicFinanceInvoiceTypeSchema.optional(),
})

export const publicPaymentAccountSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string().nullable(),
  instrumentType: paymentInstrumentTypeSchema,
  status: paymentInstrumentStatusSchema,
  brand: z.string().nullable(),
  last4: z.string().nullable(),
  expiryMonth: z.number().int().nullable(),
  expiryYear: z.number().int().nullable(),
  isDefault: z.boolean(),
})

export const publicBookingPaymentScheduleSchema = z.object({
  id: z.string(),
  scheduleType: paymentScheduleTypeSchema,
  status: paymentScheduleStatusSchema,
  dueDate: z.string(),
  dueTimeZone: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  notes: z.string().nullable(),
})

export const publicBookingGuaranteeSchema = z.object({
  id: z.string(),
  bookingPaymentScheduleId: z.string().nullable(),
  guaranteeType: z.string(),
  status: z.string(),
  currency: z.string().nullable(),
  amountCents: z.number().int().nullable(),
  provider: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  expiresAt: z.string().nullable(),
  notes: z.string().nullable(),
})

export const publicBookingPaymentOptionsSchema = z.object({
  bookingId: z.string(),
  accounts: z.array(publicPaymentAccountSchema),
  schedules: z.array(publicBookingPaymentScheduleSchema),
  guarantees: z.array(publicBookingGuaranteeSchema),
  recommendedTarget: z
    .object({
      targetType: z.enum(["booking_payment_schedule", "booking_guarantee"]).nullable(),
      targetId: z.string().nullable(),
    })
    .nullable(),
})

function derivePublicPaymentTarget(value: {
  targetType: z.infer<typeof paymentSessionTargetTypeSchema>
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
  if (value.targetType === "booking_session" && value.targetId) {
    return { type: "booking_session" as const, bookingSessionId: value.targetId }
  }
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

export const publicPaymentSessionSchema = z
  .object({
    id: z.string(),
    target: paymentTargetSchema.nullable().optional(),
    provenance: paymentProvenanceSchema.nullable().optional(),
    targetType: paymentSessionTargetTypeSchema,
    targetId: z.string().nullable(),
    bookingId: z.string().nullable(),
    legacyOrderId: z.string().nullable().optional(),
    invoiceId: z.string().nullable(),
    bookingPaymentScheduleId: z.string().nullable(),
    bookingGuaranteeId: z.string().nullable(),
    status: paymentSessionStatusSchema,
    provider: z.string().nullable(),
    providerConnectionId: z.string().nullable().optional(),
    providerSessionId: z.string().nullable(),
    providerPaymentId: z.string().nullable(),
    externalReference: z.string().nullable(),
    clientReference: z.string().nullable(),
    currency: z.string(),
    amountCents: z.number().int(),
    paymentMethod: paymentMethodSchema.nullable(),
    payerEmail: z.string().nullable(),
    payerName: z.string().nullable(),
    redirectUrl: z.string().nullable(),
    returnUrl: z.string().nullable(),
    cancelUrl: z.string().nullable(),
    expiresAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    failureCode: z.string().nullable(),
    failureMessage: z.string().nullable(),
    /**
     * Operator-supplied human-readable context (e.g. "London → New York,
     * Sat 16 May · Diego Müller"). Surfaced on the public landing page so
     * the customer can see what they're paying for. Server-controlled — only
     * populated when the session is created with `notes`.
     */
    notes: z.string().nullable(),
  })
  .transform(({ legacyOrderId, target, provenance, ...value }) => {
    const resolvedLegacyOrderId = legacyOrderId ?? null
    return {
      ...value,
      legacyOrderId: resolvedLegacyOrderId,
      providerConnectionId: value.providerConnectionId ?? null,
      target:
        target ??
        derivePublicPaymentTarget({
          ...value,
          legacyOrderId: resolvedLegacyOrderId,
        }),
      provenance: provenance ?? null,
    }
  })

export const publicFinanceBookingDocumentSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  invoiceType: publicFinanceInvoiceTypeSchema,
  invoiceStatus: z.enum([
    "draft",
    "pending_external_allocation",
    "issued",
    "partially_paid",
    "paid",
    "overdue",
    "void",
  ]),
  currency: z.string(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceDueCents: z.number().int(),
  issueDate: z.string(),
  dueDate: z.string(),
  renditionId: z.string().nullable(),
  documentStatus: publicFinanceDocumentAvailabilitySchema,
  format: publicFinanceDocumentFormatSchema.nullable(),
  language: z.string().nullable(),
  generatedAt: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  checksum: z.string().nullable(),
  downloadUrl: z.string().nullable(),
})

export const publicBookingFinanceDocumentsSchema = z.object({
  bookingId: z.string(),
  documents: z.array(publicFinanceBookingDocumentSchema),
})

export const publicFinanceDocumentLookupSchema = publicFinanceBookingDocumentSchema.extend({
  bookingId: z.string(),
})

export const publicFinanceBookingPaymentSchema = z.object({
  id: z.string(),
  source: z.enum(["payment", "travel_credit_redemption"]).default("payment"),
  invoiceId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  invoiceType: publicFinanceInvoiceTypeSchema.nullable(),
  status: z.enum(["pending", "completed", "failed", "refunded"]),
  paymentMethod: paymentMethodSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  /**
   * When the customer paid in a currency different from the invoice
   * (`currency`), `baseCurrency` is the invoice's currency and
   * `baseAmountCents` is the converted amount at the payment date.
   * Both are null for same-currency payments.
   */
  baseCurrency: z.string().nullable(),
  baseAmountCents: z.number().int().nullable(),
  paymentDate: z.string(),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
})

export const publicBookingFinancePaymentsSchema = z.object({
  bookingId: z.string(),
  payments: z.array(publicFinanceBookingPaymentSchema),
})

export const publicTravelCreditValidationSchema = z.object({
  valid: z.boolean(),
  reason: z
    .enum([
      "not_found",
      "inactive",
      "not_started",
      "expired",
      "booking_mismatch",
      "currency_mismatch",
      "insufficient_balance",
    ])
    .nullable(),
  travelCredit: z
    .object({
      id: z.string(),
      code: z.string(),
      currency: z.string().nullable(),
      amountCents: z.number().int().nullable(),
      remainingAmountCents: z.number().int().nullable(),
      expiresAt: z.string().nullable(),
    })
    .nullable(),
})

export type PublicPaymentOptionsQuery = z.infer<typeof publicPaymentOptionsQuerySchema>
export type PublicBookingPaymentOptions = z.infer<typeof publicBookingPaymentOptionsSchema>
export type PublicPaymentSession = z.infer<typeof publicPaymentSessionSchema>
export type PublicFinanceBookingDocument = z.infer<typeof publicFinanceBookingDocumentSchema>
export type PublicBookingFinanceDocuments = z.infer<typeof publicBookingFinanceDocumentsSchema>
export type PublicFinanceDocumentLookupQuery = z.infer<
  typeof publicFinanceDocumentLookupQuerySchema
>
export type PublicFinanceDocumentLookup = z.infer<typeof publicFinanceDocumentLookupSchema>
export type PublicFinanceBookingPayment = z.infer<typeof publicFinanceBookingPaymentSchema>
export type PublicBookingFinancePayments = z.infer<typeof publicBookingFinancePaymentsSchema>
export type PublicStartPaymentSessionInput = z.infer<typeof publicStartPaymentSessionSchema>
export type PublicValidateTravelCreditInput = z.infer<typeof publicValidateTravelCreditSchema>
export type PublicTravelCreditValidationResult = z.infer<typeof publicTravelCreditValidationSchema>
