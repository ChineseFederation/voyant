import { z } from "zod"
import {
  applyDefaultBookingPaymentPlanSchema,
  createPaymentSessionFromInvoiceSchema,
  createPaymentSessionFromScheduleSchema,
} from "./validation.js"
import { publicPaymentSessionSchema } from "./validation-public.js"

export const checkoutCollectionMethodSchema = z.enum(["card", "bank_transfer"])
export const checkoutCollectionStageSchema = z.enum(["initial", "reminder", "manual"])
export const checkoutCollectionIntentSchema = z.enum(["deposit", "balance", "custom"])
export const checkoutPaymentSessionTargetSchema = z.enum(["schedule", "invoice"])
export const checkoutInvoiceDocumentTypeSchema = z.enum(["proforma", "invoice"])
export const checkoutNotificationChannelSchema = z.enum(["email", "sms"])
export const checkoutNotificationDeliveryStatusSchema = z.enum([
  "pending",
  "sent",
  "failed",
  "cancelled",
])
export const checkoutReminderRunStatusSchema = z.enum([
  "queued",
  "processing",
  "sent",
  "skipped",
  "failed",
])
export const checkoutReminderTargetTypeSchema = z.enum([
  "booking_confirmed",
  "booking_payment_schedule",
  "payment_complete",
  "booking_cancelled_non_payment",
  "invoice",
])
export const checkoutProviderStartInputSchema = z
  .object({
    payload: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .strict()

const checkoutNotificationRequestCoreSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(255),
    templateId: z.string().optional().nullable(),
    templateSlug: z.string().optional().nullable(),
    scheduledFor: z.string().optional().nullable(),
  })
  .strict()

export const checkoutPaymentSessionNotificationSchema =
  checkoutNotificationRequestCoreSchema.refine(
    (value) => Boolean(value.templateId || value.templateSlug),
    {
      message: "templateId or templateSlug is required",
    },
  )

export const checkoutInvoiceNotificationSchema = checkoutNotificationRequestCoreSchema.refine(
  (value) => Boolean(value.templateId || value.templateSlug),
  {
    message: "templateId or templateSlug is required",
  },
)

const planOverrideSchema = applyDefaultBookingPaymentPlanSchema.partial()
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const previewCheckoutCollectionSchema = z.object({
  method: checkoutCollectionMethodSchema,
  stage: checkoutCollectionStageSchema.default("initial"),
  scheduleId: z.string().optional(),
  invoiceId: z.string().optional(),
  amountCents: z.number().int().min(1).optional(),
  ensureDefaultPaymentPlan: z.boolean().default(true),
  paymentSessionTarget: checkoutPaymentSessionTargetSchema.optional(),
  paymentPlan: planOverrideSchema.optional(),
})

export const initiateCheckoutCollectionSchema = previewCheckoutCollectionSchema.extend({
  paymentSession: z
    .union([createPaymentSessionFromScheduleSchema, createPaymentSessionFromInvoiceSchema])
    .optional(),
  paymentSessionNotification: checkoutPaymentSessionNotificationSchema.optional(),
  invoiceNotification: checkoutInvoiceNotificationSchema.optional(),
  startProvider: checkoutProviderStartInputSchema.optional(),
  notes: z.string().optional().nullable(),
})

export const bootstrapCheckoutCollectionSchema = initiateCheckoutCollectionSchema
  .extend({
    bookingId: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    intent: checkoutCollectionIntentSchema.optional(),
  })
  .refine((value) => Boolean(value.bookingId || value.sessionId), {
    message: "Provide a bookingId or sessionId",
    path: ["bookingId"],
  })

export const checkoutCollectionScheduleSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingItemId: z.string().nullable(),
  scheduleType: z.string(),
  status: z.string(),
  dueDate: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
  notes: z.string().nullable(),
})

export const checkoutCollectionInvoiceSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  invoiceType: z.string(),
  bookingId: z.string(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  status: z.string(),
  currency: z.string(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceDueCents: z.number().int(),
  issueDate: z.string(),
  dueDate: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const checkoutNotificationDeliverySchema = z.object({
  id: z.string(),
  templateSlug: z.string().nullable(),
  channel: checkoutNotificationChannelSchema,
  provider: z.string(),
  status: checkoutNotificationDeliveryStatusSchema,
  toAddress: z.string(),
  subject: z.string().nullable(),
  sentAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
})

export const checkoutBankTransferInstructionsSchema = z.object({
  provider: z.string().nullable(),
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  documentType: checkoutInvoiceDocumentTypeSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  dueDate: z.string().nullable(),
  beneficiary: z.string(),
  iban: z.string(),
  bankName: z.string().nullable(),
  notes: z.string().nullable(),
})

export const checkoutProviderStartResultSchema = z.object({
  provider: z.string(),
  paymentSessionId: z.string(),
  redirectUrl: z.string().nullable(),
  externalReference: z.string().nullable(),
  providerSessionId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  response: z.record(z.string(), z.unknown()).nullable(),
})

export const checkoutCollectionPlanSchema = z.object({
  bookingId: z.string(),
  method: checkoutCollectionMethodSchema,
  stage: checkoutCollectionStageSchema,
  paymentSessionTarget: checkoutPaymentSessionTargetSchema.nullable(),
  documentType: checkoutInvoiceDocumentTypeSchema.nullable(),
  willCreateDefaultPaymentPlan: z.boolean(),
  selectedSchedule: checkoutCollectionScheduleSchema.nullable(),
  selectedInvoice: checkoutCollectionInvoiceSchema.nullable(),
  amountCents: z.number().int(),
  currency: z.string(),
  recommendedAction: z.enum([
    "create_bank_transfer_document",
    "create_payment_session",
    "create_invoice_then_payment_session",
    "none",
  ]),
})

export const initiatedCheckoutCollectionSchema = z.object({
  plan: checkoutCollectionPlanSchema,
  invoice: checkoutCollectionInvoiceSchema.nullable(),
  paymentSession: publicPaymentSessionSchema.nullable(),
  invoiceNotification: checkoutNotificationDeliverySchema.nullable(),
  paymentSessionNotification: checkoutNotificationDeliverySchema.nullable(),
  bankTransferInstructions: checkoutBankTransferInstructionsSchema.nullable(),
  providerStart: checkoutProviderStartResultSchema.nullable(),
})

export const bootstrappedCheckoutCollectionSchema = initiatedCheckoutCollectionSchema.extend({
  bookingId: z.string(),
  sessionId: z.string(),
  sourceType: z.enum(["booking", "session"]),
  intent: checkoutCollectionIntentSchema,
})

export const checkoutReminderRunListQuerySchema = paginationSchema.extend({
  status: checkoutReminderRunStatusSchema.optional(),
})

export const checkoutReminderRunSchema = z.object({
  id: z.string(),
  reminderRuleId: z.string(),
  reminderRuleSlug: z.string().nullable(),
  reminderRuleName: z.string().nullable(),
  targetType: checkoutReminderTargetTypeSchema,
  targetId: z.string(),
  bookingId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  notificationDeliveryId: z.string().nullable(),
  status: checkoutReminderRunStatusSchema,
  deliveryStatus: checkoutNotificationDeliveryStatusSchema.nullable(),
  channel: checkoutNotificationChannelSchema.nullable(),
  provider: z.string().nullable(),
  recipient: z.string().nullable(),
  scheduledFor: z.string(),
  processedAt: z.string(),
  errorMessage: z.string().nullable(),
  relativeDaysFromDueDate: z.number().int().nullable(),
  createdAt: z.string(),
})

export const checkoutReminderRunListResponseSchema = z.object({
  data: z.array(checkoutReminderRunSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export type PreviewCheckoutCollectionInput = z.infer<typeof previewCheckoutCollectionSchema>
export type InitiateCheckoutCollectionInput = z.infer<typeof initiateCheckoutCollectionSchema>
export type BootstrapCheckoutCollectionInput = z.infer<typeof bootstrapCheckoutCollectionSchema>
export type CheckoutCollectionPlanRecord = z.infer<typeof checkoutCollectionPlanSchema>
export type InitiatedCheckoutCollectionRecord = z.infer<typeof initiatedCheckoutCollectionSchema>
export type BootstrappedCheckoutCollectionRecord = z.infer<
  typeof bootstrappedCheckoutCollectionSchema
>
export type CheckoutProviderStartInput = z.infer<typeof checkoutProviderStartInputSchema>
export type CheckoutInvoiceNotificationInput = z.infer<typeof checkoutInvoiceNotificationSchema>
export type CheckoutPaymentSessionNotificationInput = z.infer<
  typeof checkoutPaymentSessionNotificationSchema
>
export type CheckoutBankTransferInstructionsRecord = z.infer<
  typeof checkoutBankTransferInstructionsSchema
>
export type CheckoutProviderStartResultRecord = z.infer<typeof checkoutProviderStartResultSchema>
export type CheckoutReminderRunListQuery = z.infer<typeof checkoutReminderRunListQuerySchema>
export type CheckoutReminderRunRecord = z.infer<typeof checkoutReminderRunSchema>
