// agent-quality: file-size exception -- owner: notifications; existing schema contract stays co-located until a dedicated split preserves behavior and tests.
import { z } from "zod"

export const notificationChannelSchema = z.enum(["email", "sms"])
export const notificationTemplateStatusSchema = z.enum(["draft", "active", "archived"])
export const notificationDeliveryStatusSchema = z.enum(["pending", "sent", "failed", "cancelled"])
export const notificationTargetTypeSchema = z.enum([
  "booking",
  "booking_payment_schedule",
  "booking_guarantee",
  "invoice",
  "payment_session",
  "person",
  "organization",
  "other",
])
export const notificationReminderStatusSchema = z.enum(["draft", "active", "archived"])
export const notificationReminderTargetTypeSchema = z.enum([
  "booking_confirmed",
  "booking_payment_schedule",
  "payment_complete",
  "booking_cancelled_non_payment",
  "invoice",
])
export const notificationReminderRunStatusSchema = z.enum([
  "queued",
  "processing",
  "sent",
  "skipped",
  "failed",
])
export const notificationReminderStageAnchorSchema = z.enum([
  "due_date",
  "booking_created_at",
  "departure_date",
  "invoice_issued_at",
  "last_send_at",
])
export const notificationReminderStageCadenceKindSchema = z.enum([
  "once",
  "every_n_days",
  "escalating",
])
export const notificationStageRecipientKindSchema = z.enum(["primary", "cc", "bcc"])

export const notificationReminderStageCadenceIntervalSchema = z.object({
  whenDaysUntilDueGT: z.coerce.number().int().optional().nullable(),
  whenDaysUntilDueLT: z.coerce.number().int().optional().nullable(),
  repeatEveryDays: z.coerce.number().int().min(1).max(365),
})
export const notificationDocumentTypeSchema = z.enum([
  "contract",
  "invoice",
  "proforma",
  "brochure",
])
export const notificationDocumentSourceSchema = z.enum(["legal", "finance", "products"])
export const notificationAttachmentSchema = z
  .object({
    filename: z.string().min(1).max(500),
    contentBase64: z.string().min(1).optional().nullable(),
    path: z.string().min(1).max(4000).optional().nullable(),
    contentType: z.string().max(255).optional().nullable(),
    disposition: z.enum(["attachment", "inline"]).optional().nullable(),
    contentId: z.string().max(255).optional().nullable(),
  })
  .refine((value) => Boolean(value.contentBase64 || value.path), {
    message: "contentBase64 or path is required",
    path: ["contentBase64"],
  })

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const notificationTemplateCoreSchema = z.object({
  slug: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  channel: notificationChannelSchema,
  provider: z.string().max(255).optional().nullable(),
  status: notificationTemplateStatusSchema.default("draft"),
  subjectTemplate: z.string().max(2000).optional().nullable(),
  htmlTemplate: z.string().optional().nullable(),
  textTemplate: z.string().optional().nullable(),
  fromAddress: z.string().max(500).optional().nullable(),
  isSystem: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertNotificationTemplateSchema = notificationTemplateCoreSchema
export const updateNotificationTemplateSchema = notificationTemplateCoreSchema.partial()

export const notificationTemplateListQuerySchema = paginationSchema.extend({
  channel: notificationChannelSchema.optional(),
  provider: z.string().optional(),
  status: notificationTemplateStatusSchema.optional(),
  search: z.string().optional(),
})

export const notificationDeliveryListQuerySchema = paginationSchema.extend({
  channel: notificationChannelSchema.optional(),
  provider: z.string().optional(),
  status: notificationDeliveryStatusSchema.optional(),
  templateSlug: z.string().optional(),
  targetType: notificationTargetTypeSchema.optional(),
  targetId: z.string().optional(),
  bookingId: z.string().optional(),
  invoiceId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
})

const notificationReminderRuleCoreSchema = z.object({
  slug: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  status: notificationReminderStatusSchema.default("draft"),
  targetType: notificationReminderTargetTypeSchema,
  channel: notificationChannelSchema,
  provider: z.string().max(255).optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateSlug: z.string().max(255).optional().nullable(),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  suppressionGroup: z.string().max(255).optional().nullable(),
  isSystem: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

// templateId / templateSlug are both optional now: stage channels carry
// their own templates and override the rule-level default. A rule with no
// template is valid as long as it has stages (or the legacy
// relativeDaysFromDueDate path stays unused).
export const insertNotificationReminderRuleSchema = notificationReminderRuleCoreSchema

export const updateNotificationReminderRuleSchema = notificationReminderRuleCoreSchema.partial()

export const notificationReminderRuleStageBaseSchema = z.object({
  name: z.string().max(255).optional().nullable(),
  orderIndex: z.coerce.number().int().min(0).max(1000),
  anchor: notificationReminderStageAnchorSchema,
  windowStartDays: z.coerce.number().int().min(-3650).max(3650),
  windowEndDays: z.coerce.number().int().min(-3650).max(3650),
  cadenceKind: notificationReminderStageCadenceKindSchema,
  cadenceEveryDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
  cadenceIntervals: z
    .array(notificationReminderStageCadenceIntervalSchema)
    .min(1)
    .max(20)
    .optional()
    .nullable(),
  maxSendsInStage: z.coerce.number().int().min(1).max(100).optional().nullable(),
  respectQuietHours: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertNotificationReminderRuleStageSchema =
  notificationReminderRuleStageBaseSchema.superRefine((value, ctx) => {
    if (value.windowEndDays < value.windowStartDays) {
      ctx.addIssue({
        code: "custom",
        path: ["windowEndDays"],
        message: "windowEndDays must be >= windowStartDays",
      })
    }
    if (value.cadenceKind === "every_n_days" && !value.cadenceEveryDays) {
      ctx.addIssue({
        code: "custom",
        path: ["cadenceEveryDays"],
        message: "cadenceEveryDays is required when cadenceKind=every_n_days",
      })
    }
    if (
      value.cadenceKind === "escalating" &&
      (!value.cadenceIntervals || value.cadenceIntervals.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cadenceIntervals"],
        message: "cadenceIntervals is required when cadenceKind=escalating",
      })
    }
  })

export const updateNotificationReminderRuleStageSchema =
  notificationReminderRuleStageBaseSchema.partial()

export const reorderReminderRuleStagesSchema = z.object({
  stageIds: z.array(z.string().min(1)).min(1).max(50),
})

export const notificationReminderStageChannelBaseSchema = z.object({
  orderIndex: z.coerce.number().int().min(0).max(50).default(0),
  channel: notificationChannelSchema,
  provider: z.string().max(255).optional().nullable(),
  templateId: z.string().optional().nullable(),
  templateSlug: z.string().max(255).optional().nullable(),
  recipientKind: notificationStageRecipientKindSchema.default("primary"),
  recipientRole: z.string().max(255).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const insertNotificationReminderStageChannelSchema =
  notificationReminderStageChannelBaseSchema.refine(
    (value) => Boolean(value.templateId || value.templateSlug),
    {
      message: "templateId or templateSlug is required",
      path: ["templateId"],
    },
  )

export const updateNotificationReminderStageChannelSchema =
  notificationReminderStageChannelBaseSchema.partial()

export const composeNotificationReminderRuleStageSchema =
  notificationReminderRuleStageBaseSchema.extend({
    channels: z.array(notificationReminderStageChannelBaseSchema).min(1).max(50),
  })

export const composeNotificationReminderRuleSchema = z.object({
  rule: insertNotificationReminderRuleSchema,
  stages: z.array(composeNotificationReminderRuleStageSchema).min(1).max(50),
  idempotencyKey: z.string().min(1).max(255).optional(),
})

const notificationQuietHoursConfigSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  tz: z.string().min(1).max(255),
})

const notificationSettingsCoreSchema = z.object({
  scope: z.string().min(1).max(64).default("default"),
  quietHoursLocal: notificationQuietHoursConfigSchema.nullable().optional(),
  blackoutDates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(366)
    .nullable()
    .optional(),
  skipWeekends: z.boolean().default(false),
  recipientRateLimitPerDay: z.coerce.number().int().min(1).max(10000).nullable().optional(),
  suppressionWindowHours: z.coerce.number().int().min(0).max(720).default(24),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const updateNotificationSettingsSchema = notificationSettingsCoreSchema.partial()

export const previewRemindersQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ruleId: z.string().optional(),
  targetId: z.string().optional(),
})

export const notificationReminderRuleListQuerySchema = paginationSchema.extend({
  status: notificationReminderStatusSchema.optional(),
  targetType: notificationReminderTargetTypeSchema.optional(),
  channel: notificationChannelSchema.optional(),
  search: z.string().optional(),
})

export const notificationReminderRunListQuerySchema = paginationSchema.extend({
  reminderRuleId: z.string().optional(),
  targetType: notificationReminderTargetTypeSchema.optional(),
  targetId: z.string().optional(),
  scheduleId: z.string().optional(),
  invoiceId: z.string().optional(),
  bookingId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  notificationDeliveryId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  recipient: z.string().optional(),
  status: notificationReminderRunStatusSchema.optional(),
})

export const notificationReminderRunRuleSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  status: notificationReminderStatusSchema,
  targetType: notificationReminderTargetTypeSchema,
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  templateId: z.string().nullable(),
  templateSlug: z.string().nullable(),
})

export const notificationReminderRunDeliverySummarySchema = z.object({
  id: z.string(),
  status: notificationDeliveryStatusSchema,
  channel: notificationChannelSchema,
  provider: z.string(),
  toAddress: z.string(),
  subject: z.string().nullable(),
  sentAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
})

export const notificationReminderRunLinksSchema = z.object({
  bookingId: z.string().nullable(),
  bookingPaymentScheduleId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  notificationDeliveryId: z.string().nullable(),
})

export const notificationReminderRunRecordSchema = z.object({
  id: z.string(),
  reminderRuleId: z.string(),
  targetType: notificationReminderTargetTypeSchema,
  targetId: z.string(),
  dedupeKey: z.string(),
  status: notificationReminderRunStatusSchema,
  recipient: z.string().nullable(),
  scheduledFor: z.string(),
  processedAt: z.string(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  links: notificationReminderRunLinksSchema,
  reminderRule: notificationReminderRunRuleSummarySchema,
  delivery: notificationReminderRunDeliverySummarySchema.nullable(),
})

export const notificationReminderRunListResponseSchema = z.object({
  data: z.array(notificationReminderRunRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const runDueRemindersSchema = z.object({
  now: z.string().datetime().optional().nullable(),
})

const durableDomainNotificationFields = {
  idempotencyKey: z.string().trim().min(8).max(255),
  templateId: z.string().optional().nullable(),
  templateSlug: z.string().optional().nullable(),
  scheduledFor: z.string().optional().nullable(),
}

const durableDomainNotificationSchema = z
  .object(durableDomainNotificationFields)
  .strict()
  .refine((value) => Boolean(value.templateId || value.templateSlug), {
    message: "templateId or templateSlug is required",
  })

export const sendPaymentSessionNotificationSchema = durableDomainNotificationSchema

export const sendInvoiceNotificationSchema = durableDomainNotificationSchema

export const previewNotificationTemplateSchema = z
  .object({
    channel: notificationChannelSchema,
    provider: z.string().optional().nullable(),
    subjectTemplate: z.string().max(2000).optional().nullable(),
    htmlTemplate: z.string().optional().nullable(),
    textTemplate: z.string().optional().nullable(),
    fromAddress: z.string().max(500).optional().nullable(),
    data: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .refine((value) => Boolean(value.subjectTemplate || value.htmlTemplate || value.textTemplate), {
    message: "subjectTemplate, htmlTemplate, or textTemplate is required",
  })

export const previewNotificationTemplateResultSchema = z.object({
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  fromAddress: z.string().nullable(),
  subject: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string().nullable(),
})

export const bookingDocumentBundleItemSchema = z.object({
  key: z.string().min(1),
  source: notificationDocumentSourceSchema,
  documentType: notificationDocumentTypeSchema,
  bookingId: z.string().min(1),
  contractId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  attachmentId: z.string().optional().nullable(),
  renditionId: z.string().optional().nullable(),
  contractStatus: z.string().optional().nullable(),
  invoiceStatus: z.string().optional().nullable(),
  name: z.string().min(1),
  format: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
  downloadUrl: z.string().url().optional().nullable(),
  language: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  createdAt: z.string().datetime(),
})

export const bookingDocumentBundleSchema = z.object({
  bookingId: z.string().min(1),
  documents: z.array(bookingDocumentBundleItemSchema),
})

export const sendBookingDocumentsNotificationSchema = z
  .object({
    ...durableDomainNotificationFields,
    documentTypes: z.array(notificationDocumentTypeSchema).optional().nullable(),
  })
  .strict()
  .refine((value) => Boolean(value.templateId || value.templateSlug), {
    message: "templateId or templateSlug is required",
  })

export const sendBookingDocumentsNotificationResultSchema = z.object({
  bookingId: z.string().min(1),
  recipient: z.string().min(1),
  documents: z.array(bookingDocumentBundleItemSchema),
  deliveryId: z.string().min(1),
  provider: z.string().optional().nullable(),
  status: notificationDeliveryStatusSchema,
})

/**
 * Confirm-and-dispatch — single orchestrated request that lists the booking's
 * document bundle and (optionally) sends it to the client in one round-trip.
 *
 * `sendNotification: false` turns the call into a preview: the bundle comes
 * back but no delivery is attempted. Templates use the preview to render the
 * "here's what's ready" checkbox list before the operator confirms.
 */
export const confirmAndDispatchBookingSchema = z.union([
  z
    .object({
      sendNotification: z.literal(false),
      documentTypes: z.array(notificationDocumentTypeSchema).optional().nullable(),
    })
    .strict(),
  sendBookingDocumentsNotificationSchema.and(
    z.object({
      sendNotification: z.literal(true).default(true),
    }),
  ),
])

export const confirmAndDispatchBookingResultSchema = z.object({
  bookingId: z.string().min(1),
  documents: z.array(bookingDocumentBundleItemSchema),
  /**
   * Non-null when `sendNotification` was true and a delivery actually went
   * out. Null when either the operator asked for a preview only, or the send
   * couldn't proceed (no recipient / no attachments / no matching documents).
   */
  notification: z
    .object({
      recipient: z.string().min(1),
      deliveryId: z.string().min(1),
      provider: z.string().optional().nullable(),
      status: notificationDeliveryStatusSchema,
    })
    .nullable(),
  /**
   * When `sendNotification` was true but the dispatcher declined to send,
   * this captures which guard tripped so the UI can explain it — e.g.
   * "No recipient on file, add an email to the lead traveler and retry".
   */
  skipReason: z
    .enum(["preview_only", "no_documents", "no_recipient", "no_attachments", "send_failed"])
    .nullable(),
})
