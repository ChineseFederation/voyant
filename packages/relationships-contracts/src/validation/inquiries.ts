import { z } from "zod"

import { paginationSchema } from "./common.js"

export const inquiryKindSchema = z.enum(["product", "custom_trip", "general"])
export const inquiryStatusSchema = z.enum([
  "new",
  "triaged",
  "in_progress",
  "waiting_on_customer",
  "qualified",
  "converted",
  "closed",
])
export const inquiryPrioritySchema = z.enum(["low", "normal", "high", "urgent"])
export const inquiryCloseOutcomeSchema = z.enum([
  "lost",
  "not_serviceable",
  "no_response",
  "duplicate",
  "spam",
  "customer_withdrew",
  "other",
])
export const inquirySourceSchema = z.enum([
  "storefront",
  "phone",
  "email",
  "admin",
  "import",
  "api",
])

/** Cross-module subjects an Inquiry can retain as immutable intake context. */
export const inquiryTargetKindSchema = z.enum(["product", "option_unit", "catalog_item", "trip"])

export const inquiryTargetSnapshotSchema = z.object({
  title: z.string().trim().min(1).max(500),
  optionLabel: z.string().trim().min(1).max(500).nullable().optional(),
  startDate: z.string().date().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  publicUrl: z.string().url().max(2_000).nullable().optional(),
  sourceChannel: z.string().trim().min(1).max(200).nullable().optional(),
})

export const addInquiryTargetSchema = z.object({
  kind: inquiryTargetKindSchema,
  targetId: z.string().trim().min(1).max(500),
  snapshot: inquiryTargetSnapshotSchema,
})

export const inquiryTargetRecordSchema = addInquiryTargetSchema.extend({
  linkId: z.string(),
  inquiryId: z.string(),
  createdAt: z.string(),
})

export const inquiryTargetsResponseSchema = z.object({ data: z.array(inquiryTargetRecordSchema) })
export const inquiryTargetResponseSchema = z.object({ data: inquiryTargetRecordSchema })

export const inquiryContactSnapshotSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => value.name || value.email || value.phone, {
    message: "At least one contact detail is required",
  })

const placeSchema = z.object({
  placeId: z.string().min(1).optional(),
  label: z.string().trim().min(1).max(200),
})

export const inquiryTravelBriefV1Schema = z.object({
  version: z.literal(1),
  destinations: z.array(placeSchema).max(20).optional(),
  origin: placeSchema.optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  dateFlexibility: z.enum(["exact", "few_days", "few_weeks", "open"]).optional(),
  durationNights: z.number().int().min(1).max(365).optional(),
  adults: z.number().int().min(0).max(100).optional(),
  children: z
    .array(z.object({ age: z.number().int().min(0).max(17).optional() }))
    .max(100)
    .optional(),
  rooms: z.number().int().min(1).max(100).optional(),
  budget: z
    .object({
      amountCents: z.number().int().nonnegative().optional(),
      currency: z
        .string()
        .trim()
        .regex(/^[A-Z]{3}$/),
      basis: z.enum(["total", "per_person"]).optional(),
      flexibility: z.enum(["firm", "approximate", "unknown"]).optional(),
    })
    .optional(),
  interests: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  accessibilityOrDietaryNotes: z.string().max(4000).optional(),
})

export const inquiryConsentSnapshotSchema = z.record(z.string(), z.unknown())
export const inquiryCustomFieldsSchema = z.record(z.string(), z.record(z.string(), z.unknown()))

export const createInquirySchema = z.object({
  subject: z.string().trim().min(1).max(300),
  kind: inquiryKindSchema,
  priority: inquiryPrioritySchema.default("normal"),
  personId: z.string().min(1).nullable().optional(),
  organizationId: z.string().min(1).nullable().optional(),
  contactSnapshot: inquiryContactSnapshotSchema,
  ownerId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
  unassignedReason: z.string().trim().min(1).max(500).nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
  firstResponseDueAt: z.string().datetime().nullable().optional(),
  travelBrief: inquiryTravelBriefV1Schema.nullable().optional(),
  customerMessage: z.string().max(20_000).nullable().optional(),
  internalSummary: z.string().max(10_000).nullable().optional(),
  source: inquirySourceSchema,
  sourceRef: z.string().trim().min(1).max(500).nullable().optional(),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
  locale: z.string().trim().min(2).max(35).nullable().optional(),
  consentSnapshot: inquiryConsentSnapshotSchema.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  customFields: inquiryCustomFieldsSchema.default({}),
})

export const updateInquirySchema = createInquirySchema
  .pick({
    subject: true,
    kind: true,
    priority: true,
    personId: true,
    organizationId: true,
    contactSnapshot: true,
    nextActionAt: true,
    travelBrief: true,
    customerMessage: true,
    internalSummary: true,
    tags: true,
    customFields: true,
  })
  .partial()

export const inquiryListQuerySchema = paginationSchema.extend({
  view: z
    .enum([
      "actionable",
      "new",
      "mine",
      "unassigned",
      "overdue",
      "waiting",
      "qualified",
      "converted",
      "closed",
    ])
    .describe("Saved work-queue view; combined with explicit filters using AND")
    .default("actionable"),
  status: inquiryStatusSchema.optional(),
  ownerId: z.string().optional(),
  teamId: z.string().optional(),
  priority: inquiryPrioritySchema.optional(),
  kind: inquiryKindSchema.optional(),
  source: inquirySourceSchema.optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  overdue: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  search: z.string().trim().max(300).optional(),
})

export const transitionInquirySchema = z.object({
  status: z.enum(["triaged", "in_progress", "waiting_on_customer", "qualified"]),
  nextActionAt: z.string().datetime().nullable().optional(),
  noFollowUpExpected: z.boolean().optional(),
  unassignedReason: z.string().trim().min(1).max(500).nullable().optional(),
})

export const assignInquirySchema = z
  .object({
    ownerId: z.string().min(1).nullable(),
    teamId: z.string().min(1).nullable().optional(),
    unassignedReason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.ownerId === null && !value.unassignedReason) {
      ctx.addIssue({
        code: "custom",
        path: ["unassignedReason"],
        message: "An unassigned reason is required when clearing the owner",
      })
    }
  })

export const closeInquirySchema = z
  .object({
    outcome: inquiryCloseOutcomeSchema,
    duplicateOfInquiryId: z.string().min(1).nullable().optional(),
    note: z.string().trim().min(1).max(4000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.outcome === "duplicate" && !value.duplicateOfInquiryId) {
      ctx.addIssue({
        code: "custom",
        path: ["duplicateOfInquiryId"],
        message: "A duplicate inquiry id is required",
      })
    }
    if (value.outcome === "other" && !value.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "A close note is required" })
    }
  })

export const reopenInquirySchema = z.object({
  nextActionAt: z.string().datetime().nullable().optional(),
  unassignedReason: z.string().trim().min(1).max(500).nullable().optional(),
})

export const convertInquiryToProposalSchema = z.object({
  kind: z.literal("proposal"),
  idempotencyKey: z.string().trim().min(1).max(255),
  pipelineId: z.string().min(1).nullable().optional(),
  stageId: z.string().min(1).nullable().optional(),
  keepInquiryOpen: z.boolean().default(false),
})

export const inquiryProposalConversionRefusalReasonSchema = z.enum([
  "invalid_input",
  "pipeline_not_found",
  "default_pipeline_not_found",
  "stage_not_found",
  "stage_pipeline_mismatch",
  "stage_closed",
  "open_stage_not_found",
  "source_conflict",
])

export const inquiryProposalConversionResultSchema = z.object({
  data: z.object({
    kind: z.enum(["created", "replayed"]),
    conversionId: z.string(),
    inquiryId: z.string(),
    inquiryStatus: z.enum(["qualified", "converted"]),
    target: z.object({
      kind: z.literal("proposal"),
      id: z.string(),
      pipelineId: z.string(),
      stageId: z.string(),
    }),
  }),
})

export const inquiryProposalConversionRefusalSchema = z.object({
  error: z.string(),
  reason: inquiryProposalConversionRefusalReasonSchema,
})

const isoTimestampSchema = z.string()

/** Canonical serialized Inquiry row shared by admin clients and future intake surfaces. */
export const inquiryRecordSchema = z.object({
  id: z.string(),
  subject: z.string(),
  kind: inquiryKindSchema,
  status: inquiryStatusSchema,
  closeOutcome: inquiryCloseOutcomeSchema.nullable(),
  closeNote: z.string().nullable(),
  duplicateOfInquiryId: z.string().nullable(),
  priority: z.string(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  contactSnapshot: inquiryContactSnapshotSchema,
  ownerId: z.string().nullable(),
  teamId: z.string().nullable(),
  unassignedReason: z.string().nullable(),
  nextActionAt: isoTimestampSchema.nullable(),
  firstResponseDueAt: isoTimestampSchema.nullable(),
  firstRespondedAt: isoTimestampSchema.nullable(),
  travelBrief: inquiryTravelBriefV1Schema.nullable(),
  customerMessage: z.string().nullable(),
  internalSummary: z.string().nullable(),
  source: z.string(),
  sourceRef: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  locale: z.string().nullable(),
  consentSnapshot: inquiryConsentSnapshotSchema.nullable(),
  tags: z.array(z.string()),
  customFields: inquiryCustomFieldsSchema,
  lastActivityAt: isoTimestampSchema.nullable(),
  qualifiedAt: isoTimestampSchema.nullable(),
  convertedAt: isoTimestampSchema.nullable(),
  closedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  targets: z.array(inquiryTargetRecordSchema),
})

export const inquiryResponseSchema = z.object({ data: inquiryRecordSchema })
export const inquiryCreateResponseSchema = z.object({
  data: inquiryRecordSchema,
  replayed: z.boolean(),
})
export const inquiryListResponseSchema = z.object({
  data: z.array(inquiryRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})

export type InquiryKind = z.infer<typeof inquiryKindSchema>
export type InquiryTargetKind = z.infer<typeof inquiryTargetKindSchema>
export type InquiryTargetSnapshot = z.infer<typeof inquiryTargetSnapshotSchema>
export type AddInquiryTargetInput = z.infer<typeof addInquiryTargetSchema>
export type InquiryTargetRecord = z.infer<typeof inquiryTargetRecordSchema>
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>
export type InquiryPriority = z.infer<typeof inquiryPrioritySchema>
export type InquiryCloseOutcome = z.infer<typeof inquiryCloseOutcomeSchema>
export type InquiryTravelBriefV1 = z.infer<typeof inquiryTravelBriefV1Schema>
export type CreateInquiryInput = z.infer<typeof createInquirySchema>
export type UpdateInquiryInput = z.infer<typeof updateInquirySchema>
export type InquiryListQueryInput = z.infer<typeof inquiryListQuerySchema>
export type TransitionInquiryInput = z.infer<typeof transitionInquirySchema>
export type AssignInquiryInput = z.infer<typeof assignInquirySchema>
export type CloseInquiryInput = z.infer<typeof closeInquirySchema>
export type ReopenInquiryInput = z.infer<typeof reopenInquirySchema>
export type ConvertInquiryToProposalCommand = z.infer<typeof convertInquiryToProposalSchema>
export type InquiryProposalConversionResult = z.infer<
  typeof inquiryProposalConversionResultSchema
>["data"]
export type InquiryProposalConversionRefusalReason = z.infer<
  typeof inquiryProposalConversionRefusalReasonSchema
>
export type InquiryRecord = z.infer<typeof inquiryRecordSchema>
export type InquiryCreateResponse = z.infer<typeof inquiryCreateResponseSchema>
