import { booleanQueryParam } from "@voyant-travel/schema-kit/query-params"
import { z } from "zod"

import {
  captureModeSchema,
  guaranteeStatusSchema,
  guaranteeTypeSchema,
  ianaTimeZoneSchema,
  paginationSchema,
  paymentAuthorizationStatusSchema,
  paymentCaptureStatusSchema,
  paymentCheckoutSchema,
  paymentDisputeStatusSchema,
  paymentInstrumentOwnerTypeSchema,
  paymentInstrumentStatusSchema,
  paymentInstrumentTypeSchema,
  paymentMethodSchema,
  paymentScheduleStatusSchema,
  paymentScheduleTypeSchema,
  paymentSessionStatusSchema,
  paymentSessionTargetTypeSchema,
  paymentStatusSchema,
  refundSettlementMethodSchema,
  refundSettlementStatusSchema,
} from "./validation-shared.js"

const paymentInstrumentCoreSchema = z.object({
  ownerType: paymentInstrumentOwnerTypeSchema.default("client"),
  personId: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  channelId: z.string().optional().nullable(),
  instrumentType: paymentInstrumentTypeSchema,
  status: paymentInstrumentStatusSchema.default("active"),
  label: z.string().min(1).max(255),
  provider: z.string().max(255).optional().nullable(),
  brand: z.string().max(100).optional().nullable(),
  last4: z.string().max(4).optional().nullable(),
  holderName: z.string().max(255).optional().nullable(),
  expiryMonth: z.number().int().min(1).max(12).optional().nullable(),
  expiryYear: z.number().int().min(2000).max(9999).optional().nullable(),
  externalToken: z.string().max(255).optional().nullable(),
  externalCustomerId: z.string().max(255).optional().nullable(),
  billingEmail: z.string().email().optional().nullable(),
  billingAddress: z.string().max(2000).optional().nullable(),
  directBillReference: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPaymentInstrumentSchema = paymentInstrumentCoreSchema
export const updatePaymentInstrumentSchema = paymentInstrumentCoreSchema.partial()
export const paymentInstrumentListQuerySchema = paginationSchema.extend({
  ownerType: paymentInstrumentOwnerTypeSchema.optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  supplierId: z.string().optional(),
  channelId: z.string().optional(),
  status: paymentInstrumentStatusSchema.optional(),
  instrumentType: paymentInstrumentTypeSchema.optional(),
  search: z.string().optional(),
})

export const paymentTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("booking_session"), bookingSessionId: z.string().min(1) }),
  z.object({ type: z.literal("booking"), bookingId: z.string().min(1) }),
  z.object({ type: z.literal("invoice"), invoiceId: z.string().min(1) }),
  z.object({
    type: z.literal("booking_payment_schedule"),
    bookingPaymentScheduleId: z.string().min(1),
  }),
  z.object({ type: z.literal("booking_guarantee"), bookingGuaranteeId: z.string().min(1) }),
  z.object({ type: z.literal("flight_order"), flightOrderId: z.string().min(1) }),
  z.object({ type: z.literal("program"), programId: z.string().min(1) }),
  z.object({ type: z.literal("supplier_settlement"), supplierSettlementId: z.string().min(1) }),
  z.object({ type: z.literal("channel_settlement"), channelSettlementId: z.string().min(1) }),
  z.object({
    type: z.literal("provider_reference"),
    provider: z.string().min(1).max(255),
    reference: z.string().min(1).max(255),
  }),
  z.object({ type: z.literal("legacy_order"), legacyOrderId: z.string().min(1) }),
])

export const paymentProvenanceSchema = z.object({
  source: z
    .enum([
      "operator",
      "storefront",
      "customer_portal",
      "payment_provider",
      "supplier_channel",
      "migration",
      "other",
    ])
    .default("operator"),
  provider: z.string().max(255).optional().nullable(),
  reference: z.string().max(255).optional().nullable(),
  idempotencyKey: z.string().max(255).optional().nullable(),
})

const noGenericOrderIdSchema = z.object({
  orderId: z.never().optional(),
})

function withLegacyOrderCompatibility<TShape extends z.ZodRawShape>(schema: z.ZodObject<TShape>) {
  return schema
    .extend({ legacyOrderId: z.string().optional().nullable() })
    .and(noGenericOrderIdSchema)
}

/**
 * Documentable (`ZodObject`) twin of {@link withLegacyOrderCompatibility}: it
 * carries the same fields plus the `legacyOrderId` shim but omits the
 * `.and({ orderId?: never })` ban. The ban relies on `z.never()`, which the
 * `@hono/zod-openapi` spec generator cannot render — so admin routes declare
 * the `*WithLegacyOrder` variant as the OpenAPI request body while the
 * intersection variant stays the canonical parse schema everywhere else.
 */
function withLegacyOrderField<TShape extends z.ZodRawShape>(schema: z.ZodObject<TShape>) {
  return schema.extend({ legacyOrderId: z.string().optional().nullable() })
}

const paymentSessionCoreSchema = z.object({
  target: paymentTargetSchema.optional(),
  provenance: paymentProvenanceSchema.optional(),
  targetType: paymentSessionTargetTypeSchema.default("other"),
  targetId: z.string().optional().nullable(),
  bookingId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  bookingPaymentScheduleId: z.string().optional().nullable(),
  bookingGuaranteeId: z.string().optional().nullable(),
  paymentInstrumentId: z.string().optional().nullable(),
  paymentAuthorizationId: z.string().optional().nullable(),
  paymentCaptureId: z.string().optional().nullable(),
  paymentId: z.string().optional().nullable(),
  status: paymentSessionStatusSchema.default("pending"),
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  providerSessionId: z.string().max(255).optional().nullable(),
  providerPaymentId: z.string().max(255).optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  idempotencyKey: z.string().max(255).optional().nullable(),
  clientReference: z.string().max(255).optional().nullable(),
  currency: z.string().min(3).max(3),
  amountCents: z.number().int().min(1),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  payerPersonId: z.string().optional().nullable(),
  payerOrganizationId: z.string().optional().nullable(),
  payerEmail: z.string().email().optional().nullable(),
  payerName: z.string().max(255).optional().nullable(),
  redirectUrl: z.string().url().optional().nullable(),
  checkout: paymentCheckoutSchema.optional().nullable(),
  returnUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  callbackUrl: z.string().url().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  failedAt: z.string().optional().nullable(),
  cancelledAt: z.string().optional().nullable(),
  expiredAt: z.string().optional().nullable(),
  failureCode: z.string().max(255).optional().nullable(),
  failureMessage: z.string().max(2000).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertPaymentSessionSchema = withLegacyOrderCompatibility(paymentSessionCoreSchema)
export const updatePaymentSessionSchema = withLegacyOrderCompatibility(
  paymentSessionCoreSchema.partial(),
)
/** Documentable request-body twins (see {@link withLegacyOrderField}). */
export const insertPaymentSessionBodySchema = withLegacyOrderField(paymentSessionCoreSchema)
export const updatePaymentSessionBodySchema = withLegacyOrderField(
  paymentSessionCoreSchema.partial(),
)
export const paymentSessionListQuerySchema = withLegacyOrderCompatibility(
  paginationSchema.extend({
    bookingId: z.string().optional(),
    invoiceId: z.string().optional(),
    bookingPaymentScheduleId: z.string().optional(),
    bookingGuaranteeId: z.string().optional(),
    targetType: paymentSessionTargetTypeSchema.optional(),
    status: paymentSessionStatusSchema.optional(),
    provider: z.string().optional(),
    providerConnectionId: z.string().optional(),
    providerSessionId: z.string().optional(),
    providerPaymentId: z.string().optional(),
    externalReference: z.string().optional(),
    clientReference: z.string().optional(),
    idempotencyKey: z.string().optional(),
  }),
)

const paymentSessionProvisioningSchema = z.object({
  target: paymentTargetSchema.optional(),
  provenance: paymentProvenanceSchema.optional(),
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  paymentMethod: paymentMethodSchema.optional().nullable(),
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

export const createPaymentSessionFromScheduleSchema = paymentSessionProvisioningSchema
export const createPaymentSessionFromGuaranteeSchema = paymentSessionProvisioningSchema
export const createPaymentSessionFromInvoiceSchema = paymentSessionProvisioningSchema

export const applyDefaultBookingPaymentPlanSchema = z.object({
  depositMode: z.enum(["none", "percentage", "fixed_amount"]).default("percentage"),
  depositValue: z.number().int().min(0).default(30),
  depositDueDate: z.string().optional().nullable(),
  balanceDueDaysBeforeStart: z.number().int().min(0).default(30),
  clearExistingPending: z.boolean().default(true),
  createGuarantee: z.boolean().default(false),
  guaranteeType: guaranteeTypeSchema.default("deposit"),
  notes: z.string().optional().nullable(),
})

export const markPaymentSessionRequiresRedirectSchema = z.object({
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  providerSessionId: z.string().max(255).optional().nullable(),
  providerPaymentId: z.string().max(255).optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  redirectUrl: z.string().url(),
  returnUrl: z.string().url().optional().nullable(),
  cancelUrl: z.string().url().optional().nullable(),
  callbackUrl: z.string().url().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const completePaymentSessionSchema = z.object({
  status: z.enum(["authorized", "paid"]).default("paid"),
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  providerSessionId: z.string().max(255).optional().nullable(),
  providerPaymentId: z.string().max(255).optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  paymentMethod: paymentMethodSchema.optional().nullable(),
  paymentInstrumentId: z.string().optional().nullable(),
  captureMode: captureModeSchema.default("manual"),
  externalAuthorizationId: z.string().max(255).optional().nullable(),
  externalCaptureId: z.string().max(255).optional().nullable(),
  approvalCode: z.string().max(255).optional().nullable(),
  authorizedAt: z.string().optional().nullable(),
  capturedAt: z.string().optional().nullable(),
  settledAt: z.string().optional().nullable(),
  paymentDate: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  referenceNumber: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const failPaymentSessionSchema = z.object({
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  providerSessionId: z.string().max(255).optional().nullable(),
  providerPaymentId: z.string().max(255).optional().nullable(),
  externalReference: z.string().max(255).optional().nullable(),
  failureCode: z.string().max(255).optional().nullable(),
  failureMessage: z.string().max(2000).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const cancelPaymentSessionSchema = z.object({
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  cancelledAt: z.string().optional().nullable(),
})

export const expirePaymentSessionSchema = z.object({
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  expiredAt: z.string().optional().nullable(),
})

const paymentAuthorizationCoreSchema = z.object({
  target: paymentTargetSchema.optional(),
  provenance: paymentProvenanceSchema.optional(),
  bookingId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  bookingGuaranteeId: z.string().optional().nullable(),
  paymentInstrumentId: z.string().optional().nullable(),
  status: paymentAuthorizationStatusSchema.default("pending"),
  captureMode: captureModeSchema.default("manual"),
  currency: z.string().min(3).max(3),
  amountCents: z.number().int().min(1),
  provider: z.string().max(255).optional().nullable(),
  externalAuthorizationId: z.string().max(255).optional().nullable(),
  approvalCode: z.string().max(255).optional().nullable(),
  authorizedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  voidedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const insertPaymentAuthorizationSchema = withLegacyOrderCompatibility(
  paymentAuthorizationCoreSchema,
)
export const updatePaymentAuthorizationSchema = withLegacyOrderCompatibility(
  paymentAuthorizationCoreSchema.partial(),
)
/** Documentable request-body twins (see {@link withLegacyOrderField}). */
export const insertPaymentAuthorizationBodySchema = withLegacyOrderField(
  paymentAuthorizationCoreSchema,
)
export const updatePaymentAuthorizationBodySchema = withLegacyOrderField(
  paymentAuthorizationCoreSchema.partial(),
)
export const paymentAuthorizationListQuerySchema = withLegacyOrderCompatibility(
  paginationSchema.extend({
    bookingId: z.string().optional(),
    invoiceId: z.string().optional(),
    bookingGuaranteeId: z.string().optional(),
    paymentInstrumentId: z.string().optional(),
    status: paymentAuthorizationStatusSchema.optional(),
  }),
)

const paymentCaptureCoreSchema = z.object({
  paymentAuthorizationId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  status: paymentCaptureStatusSchema.default("pending"),
  currency: z.string().min(3).max(3),
  amountCents: z.number().int().min(1),
  provider: z.string().max(255).optional().nullable(),
  externalCaptureId: z.string().max(255).optional().nullable(),
  capturedAt: z.string().optional().nullable(),
  settledAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const insertPaymentCaptureSchema = paymentCaptureCoreSchema
export const updatePaymentCaptureSchema = paymentCaptureCoreSchema.partial()
export const paymentCaptureListQuerySchema = paginationSchema.extend({
  paymentAuthorizationId: z.string().optional(),
  invoiceId: z.string().optional(),
  status: paymentCaptureStatusSchema.optional(),
})

const bookingPaymentScheduleCoreSchema = z.object({
  bookingItemId: z.string().optional().nullable(),
  scheduleType: paymentScheduleTypeSchema.default("balance"),
  status: paymentScheduleStatusSchema.default("pending"),
  dueDate: z.string().min(1),
  dueTimeZone: ianaTimeZoneSchema.default("UTC"),
  currency: z.string().min(3).max(3),
  amountCents: z.number().int().min(0),
  notes: z.string().optional().nullable(),
})

export const insertBookingPaymentScheduleSchema = bookingPaymentScheduleCoreSchema
export const updateBookingPaymentScheduleSchema = bookingPaymentScheduleCoreSchema.partial()

const bookingGuaranteeCoreSchema = z.object({
  bookingPaymentScheduleId: z.string().optional().nullable(),
  bookingItemId: z.string().optional().nullable(),
  guaranteeType: guaranteeTypeSchema,
  status: guaranteeStatusSchema.default("pending"),
  paymentInstrumentId: z.string().optional().nullable(),
  paymentAuthorizationId: z.string().optional().nullable(),
  currency: z.string().min(3).max(3).optional().nullable(),
  amountCents: z.number().int().min(0).optional().nullable(),
  provider: z.string().max(255).optional().nullable(),
  referenceNumber: z.string().max(255).optional().nullable(),
  guaranteedAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  releasedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const insertBookingGuaranteeSchema = bookingGuaranteeCoreSchema
export const updateBookingGuaranteeSchema = bookingGuaranteeCoreSchema.partial()

const paymentCoreSchema = z.object({
  amountCents: z.number().int().min(1),
  currency: z.string().min(3).max(3),
  baseCurrency: z.string().min(3).max(3).optional().nullable(),
  baseAmountCents: z.number().int().min(0).optional().nullable(),
  fxRateSetId: z.string().optional().nullable(),
  paymentMethod: paymentMethodSchema,
  paymentInstrumentId: z.string().optional().nullable(),
  paymentAuthorizationId: z.string().optional().nullable(),
  paymentCaptureId: z.string().optional().nullable(),
  status: paymentStatusSchema,
  referenceNumber: z.string().max(255).optional().nullable(),
  paymentDate: z.string().min(1),
  notes: z.string().optional().nullable(),
})

export const insertPaymentSchema = paymentCoreSchema.extend({
  status: paymentStatusSchema.default("pending"),
  idempotencyKey: z.string().max(255).optional().nullable(),
})
export const updatePaymentSchema = paymentCoreSchema.partial()

const supplierPaymentCoreSchema = z.object({
  // bookingId is now optional: an AP payment may settle a whole supplier
  // invoice with no single booking. At least one of bookingId /
  // supplierInvoiceId must be present (enforced on insert below). See §5.4.
  bookingId: z.string().min(1).optional().nullable(),
  supplierInvoiceId: z.string().optional().nullable(),
  supplierId: z.string().optional().nullable(),
  bookingSupplierStatusId: z.string().optional().nullable(),
  amountCents: z.number().int().min(1),
  currency: z.string().min(3).max(3),
  baseCurrency: z.string().min(3).max(3).optional().nullable(),
  baseAmountCents: z.number().int().min(0).optional().nullable(),
  fxRateSetId: z.string().optional().nullable(),
  paymentMethod: paymentMethodSchema,
  paymentInstrumentId: z.string().optional().nullable(),
  status: paymentStatusSchema.default("pending"),
  referenceNumber: z.string().max(255).optional().nullable(),
  paymentDate: z.string().min(1),
  notes: z.string().optional().nullable(),
})

export const insertSupplierPaymentSchema = supplierPaymentCoreSchema.refine(
  (v) => Boolean(v.bookingId) || Boolean(v.supplierInvoiceId),
  { message: "a supplier payment must reference a bookingId and/or a supplierInvoiceId" },
)

/**
 * Body schema for the nested `POST /supplier-invoices/{id}/payments` route: the
 * `supplierInvoiceId` is taken from the path, so it's omitted from the body and
 * the bookingId/supplierInvoiceId invariant is satisfied by the merged path id
 * (the `insertSupplierPaymentSchema` refine would otherwise 400 a contract-
 * following body that omits it).
 */
export const insertSupplierInvoicePaymentBodySchema = supplierPaymentCoreSchema.omit({
  supplierInvoiceId: true,
})
export const updateSupplierPaymentSchema = supplierPaymentCoreSchema.partial()

export const supplierPaymentListSortFieldSchema = z.enum([
  "amountCents",
  "status",
  "paymentDate",
  "createdAt",
])

export const supplierPaymentListSortDirSchema = z.enum(["asc", "desc"])

export const supplierPaymentListQuerySchema = z.object({
  bookingId: z.string().optional(),
  supplierInvoiceId: z.string().optional(),
  supplierId: z.string().optional(),
  status: paymentStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  currency: z.string().optional(),
  paymentDateFrom: z.string().optional(),
  paymentDateTo: z.string().optional(),
  sortBy: supplierPaymentListSortFieldSchema.default("createdAt"),
  sortDir: supplierPaymentListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ---------- unified payments listing (customer + supplier) ----------

export const paymentKindSchema = z.enum(["customer", "supplier"])

export const paymentListSortFieldSchema = z.enum([
  "amountCents",
  "status",
  "paymentDate",
  "createdAt",
])

export const paymentListSortDirSchema = z.enum(["asc", "desc"])

export const paymentListQuerySchema = z.object({
  kind: paymentKindSchema.optional(),
  status: paymentStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  currency: z.string().optional(),
  invoiceId: z.string().optional(),
  bookingId: z.string().optional(),
  supplierId: z.string().optional(),
  paymentDateFrom: z.string().optional(),
  paymentDateTo: z.string().optional(),
  search: z.string().optional(),
  sortBy: paymentListSortFieldSchema.default("createdAt"),
  sortDir: paymentListSortDirSchema.default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ---------- card disputes (voyant#4289) ----------

/**
 * Recording a chargeback against the payment session it contests.
 *
 * `processorReference` is the processor's own opaque id for the dispute and is
 * what makes a repeated report update the record it already made. Omitting it —
 * an operator typing in a dispute they saw in a console — always opens a new
 * record, which is the safe default: two rows are recoverable, a silently
 * overwritten dispute is not.
 *
 * `currency` defaults to the contested session's currency. Supply it only when
 * the processor states the contested sum in a different settlement currency.
 */
export const recordPaymentDisputeSchema = z.object({
  paymentSessionId: z.string().min(1),
  processorReference: z.string().max(255).optional().nullable(),
  status: paymentDisputeStatusSchema.default("opened"),
  amountCents: z.number().int().min(1),
  currency: z.string().min(3).max(3).optional().nullable(),
  openedAt: z.string().optional().nullable(),
  respondBy: z.string().optional().nullable(),
  reasonCode: z.string().max(255).optional().nullable(),
  resolvedAt: z.string().optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  evidenceSubmittedAt: z.string().optional().nullable(),
  provider: z.string().max(255).optional().nullable(),
  providerConnectionId: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

/**
 * Advancing a dispute already on record. The contested amount and the session
 * it is bound to are fixed at open time — a different amount is a different
 * dispute.
 */
export const updatePaymentDisputeSchema = z.object({
  status: paymentDisputeStatusSchema.optional(),
  respondBy: z.string().optional().nullable(),
  reasonCode: z.string().max(255).optional().nullable(),
  resolvedAt: z.string().optional().nullable(),
  resolutionNote: z.string().max(2000).optional().nullable(),
  evidenceSubmittedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const paymentDisputeListQuerySchema = paginationSchema.extend({
  bookingId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  invoiceId: z.string().optional(),
  status: paymentDisputeStatusSchema.optional(),
  /** `true` narrows to unresolved disputes, `false` to resolved ones. */
  open: booleanQueryParam.optional(),
  provider: z.string().optional(),
  processorReference: z.string().optional(),
})

/**
 * The dispute row as it serializes over the wire. §17: timestamp columns become
 * strings; `*Cents` columns stay numbers.
 */
export const paymentDisputeRecordSchema = z.object({
  id: z.string(),
  paymentSessionId: z.string(),
  bookingId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  paymentId: z.string().nullable(),
  status: paymentDisputeStatusSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  openedAt: z.string(),
  respondBy: z.string().nullable(),
  processorReference: z.string().nullable(),
  provider: z.string().nullable(),
  providerConnectionId: z.string().nullable(),
  reasonCode: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  evidenceSubmittedAt: z.string().nullable(),
  notes: z.string().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * What a booking's payments cannot say on their own. A contested payment still
 * reads `paid`, so `hasOpenDispute` is how a caller tells a cleanly paid booking
 * from one whose money is being taken back.
 */
export const bookingPaymentDisputesSchema = z.object({
  bookingId: z.string(),
  disputes: z.array(paymentDisputeRecordSchema),
  hasOpenDispute: z.boolean(),
  openContestedAmountsByCurrency: z.record(z.string(), z.number().int()),
  nextRespondBy: z.string().nullable(),
})

export type PaymentDisputeRecord = z.infer<typeof paymentDisputeRecordSchema>
export type BookingPaymentDisputes = z.infer<typeof bookingPaymentDisputesSchema>
export type RecordPaymentDisputeInput = z.infer<typeof recordPaymentDisputeSchema>
export type UpdatePaymentDisputeInput = z.infer<typeof updatePaymentDisputeSchema>
export type PaymentDisputeListQuery = z.infer<typeof paymentDisputeListQuerySchema>

/**
 * Recording that money went back to the customer (voyant#4303).
 *
 * A credit note says a refund is owed; this says it was paid, by what method,
 * and whether it has arrived. `status` defaults to `pending` because that is
 * the honest default for every method that is not instantaneous — a bank
 * transfer is owed for a day or two, and the booking must not claim otherwise
 * in the meantime.
 *
 * At least one of `creditNoteId` / `paymentId` is required: a settlement that
 * reverses nothing is not a refund. `paymentId` is also what bounds the amount,
 * so a settlement without one is only checked against its credit note.
 */
export const recordRefundSettlementSchema = z
  .object({
    creditNoteId: z.string().min(1).optional().nullable(),
    paymentId: z.string().min(1).optional().nullable(),
    invoiceId: z.string().min(1).optional().nullable(),
    /** Required for `processor_reversal` — it is what `adapter.refund()` addresses. */
    paymentSessionId: z.string().min(1).optional().nullable(),
    method: refundSettlementMethodSchema,
    status: refundSettlementStatusSchema.default("pending"),
    amountCents: z.number().int().min(1),
    /** Defaults to the currency of the payment or credit note being reversed. */
    currency: z.string().min(3).max(3).optional().nullable(),
    /**
     * What the instrument is worth, when that is not what was refunded. Sending
     * 110 here against an `amountCents` of 100 is the standard uplift offer;
     * omit it when the instrument is worth exactly the amount refunded.
     */
    instrumentAmountCents: z.number().int().min(1).optional().nullable(),
    instrumentCurrency: z.string().min(3).max(3).optional().nullable(),
    travelCreditId: z.string().min(1).optional().nullable(),
    counterpartyOrganizationId: z.string().min(1).optional().nullable(),
    counterpartyPersonId: z.string().min(1).optional().nullable(),
    externalReference: z.string().max(255).optional().nullable(),
    provider: z.string().max(255).optional().nullable(),
    providerConnectionId: z.string().max(255).optional().nullable(),
    processorReference: z.string().max(255).optional().nullable(),
    authorizedByUserId: z.string().max(255).optional().nullable(),
    /** The `finance:refund` approval that authorized this. Not a second path. */
    approvalId: z.string().max(255).optional().nullable(),
    requestedActionId: z.string().max(255).optional().nullable(),
    /** Scoped to the payment. A retry carrying the same key settles once. */
    idempotencyKey: z.string().max(255).optional().nullable(),
    initiatedAt: z.string().optional().nullable(),
    settledAt: z.string().optional().nullable(),
    failedAt: z.string().optional().nullable(),
    failureReason: z.string().max(2000).optional().nullable(),
    notes: z.string().optional().nullable(),
    providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .refine((input) => Boolean(input.creditNoteId ?? input.paymentId), {
    message: "A refund settlement must reverse a credit note, a payment, or both",
    path: ["paymentId"],
  })
  .refine((input) => input.method !== "processor_reversal" || Boolean(input.paymentSessionId), {
    message: "A processor reversal must name the payment session it reverses",
    path: ["paymentSessionId"],
  })
  .refine((input) => (input.instrumentAmountCents == null) === (input.instrumentCurrency == null), {
    message: "An instrument amount requires its currency",
    path: ["instrumentCurrency"],
  })

/**
 * Advancing a settlement already on record — the bank transfer landed, or the
 * processor came back and declined.
 *
 * The amount, the method and what it reverses are fixed at record time: a
 * different amount is a different refund. A failed settlement is not retried by
 * reviving it, so `settled` and `failed` are terminal.
 */
export const updateRefundSettlementSchema = z.object({
  status: refundSettlementStatusSchema.optional(),
  externalReference: z.string().max(255).optional().nullable(),
  processorReference: z.string().max(255).optional().nullable(),
  settledAt: z.string().optional().nullable(),
  failedAt: z.string().optional().nullable(),
  failureReason: z.string().max(2000).optional().nullable(),
  notes: z.string().optional().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const refundSettlementListQuerySchema = paginationSchema.extend({
  bookingId: z.string().optional(),
  creditNoteId: z.string().optional(),
  paymentId: z.string().optional(),
  invoiceId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  method: refundSettlementMethodSchema.optional(),
  status: refundSettlementStatusSchema.optional(),
  /** `true` narrows to refunds still owed, `false` to those no longer pending. */
  owed: booleanQueryParam.optional(),
})

/**
 * The settlement row as it serializes over the wire. §17: timestamp columns
 * become strings; `*Cents` columns stay numbers.
 */
export const refundSettlementRecordSchema = z.object({
  id: z.string(),
  creditNoteId: z.string().nullable(),
  paymentId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  bookingId: z.string().nullable(),
  method: refundSettlementMethodSchema,
  status: refundSettlementStatusSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  instrumentAmountCents: z.number().int().nullable(),
  instrumentCurrency: z.string().nullable(),
  travelCreditId: z.string().nullable(),
  counterpartyOrganizationId: z.string().nullable(),
  counterpartyPersonId: z.string().nullable(),
  externalReference: z.string().nullable(),
  provider: z.string().nullable(),
  providerConnectionId: z.string().nullable(),
  processorReference: z.string().nullable(),
  authorizedByUserId: z.string().nullable(),
  approvalId: z.string().nullable(),
  requestedActionId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  initiatedAt: z.string(),
  settledAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
  notes: z.string().nullable(),
  providerPayload: z.record(z.string(), z.unknown()).nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * How much of a payment may still be refunded.
 *
 * `pendingCents` is subtracted like `settledCents` is. A refund the processor
 * accepted but has not confirmed still holds its amount, because the alternative
 * is refunding it twice — the one error here that cannot be undone by retrying.
 */
export const paymentRefundableRemainderSchema = z.object({
  paymentId: z.string(),
  currency: z.string(),
  paidAmountCents: z.number().int(),
  settledCents: z.number().int(),
  pendingCents: z.number().int(),
  failedCents: z.number().int(),
  refundableRemainderCents: z.number().int(),
})

/**
 * What a booking's payments cannot say on their own: whether a refund it owes
 * has actually been paid. An issued credit note reads the same either way.
 */
export const bookingRefundSettlementsSchema = z.object({
  bookingId: z.string(),
  settlements: z.array(refundSettlementRecordSchema),
  hasOwedRefund: z.boolean(),
  owedAmountsByCurrency: z.record(z.string(), z.number().int()),
  settledAmountsByCurrency: z.record(z.string(), z.number().int()),
})

export type RefundSettlementRecord = z.infer<typeof refundSettlementRecordSchema>
export type RecordRefundSettlementInput = z.infer<typeof recordRefundSettlementSchema>
export type UpdateRefundSettlementInput = z.infer<typeof updateRefundSettlementSchema>
export type RefundSettlementListQuery = z.infer<typeof refundSettlementListQuerySchema>
export type PaymentRefundableRemainder = z.infer<typeof paymentRefundableRemainderSchema>
export type BookingRefundSettlements = z.infer<typeof bookingRefundSettlementsSchema>
