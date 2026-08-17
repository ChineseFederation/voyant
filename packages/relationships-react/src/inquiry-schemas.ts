import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

export const inquiryKindSchema = z.enum(["product", "custom_trip", "general"])
export const inquiryStatusSchema = z.enum([
  "new",
  "in_progress",
  "waiting_on_customer",
  "qualified",
  "converted",
  "closed",
])
export const inquiryPrioritySchema = z.enum(["low", "normal", "high", "urgent"])
export const inquiryCloseOutcomeSchema = z.enum([
  "lost",
  "spam",
  "duplicate",
  "not_serviceable",
  "customer_withdrew",
  "other",
])

export type InquiryKind = z.infer<typeof inquiryKindSchema>
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>
export type InquiryPriority = z.infer<typeof inquiryPrioritySchema>
export type InquiryCloseOutcome = z.infer<typeof inquiryCloseOutcomeSchema>

export const inquiryContactSnapshotSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
})

export const inquiryTravelBriefSchema = z
  .object({
    destinations: z.array(z.string()).optional(),
    earliestStartDate: z.string().nullable().optional(),
    latestEndDate: z.string().nullable().optional(),
    flexibleDates: z.boolean().optional(),
    adults: z.number().int().nonnegative().optional(),
    children: z.number().int().nonnegative().optional(),
    budgetAmount: z.number().nonnegative().nullable().optional(),
    budgetCurrency: z.string().nullable().optional(),
    origin: z.string().nullable().optional(),
    interests: z.array(z.string()).optional(),
  })
  .passthrough()

export const inquiryTargetSchema = z.object({
  id: z.string(),
  kind: z.string(),
  targetId: z.string(),
  label: z.string().nullable(),
  snapshot: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
})

export const inquiryRecordSchema = z.object({
  id: z.string(),
  subject: z.string(),
  kind: inquiryKindSchema,
  status: inquiryStatusSchema,
  closeOutcome: inquiryCloseOutcomeSchema.nullable(),
  priority: inquiryPrioritySchema,
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  contactSnapshot: inquiryContactSnapshotSchema,
  ownerId: z.string().nullable(),
  teamId: z.string().nullable(),
  nextActionAt: z.string().nullable(),
  firstResponseDueAt: z.string().nullable(),
  firstRespondedAt: z.string().nullable(),
  travelBrief: inquiryTravelBriefSchema.nullable(),
  customerMessage: z.string().nullable(),
  internalSummary: z.string().nullable(),
  source: z.string(),
  sourceRef: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  locale: z.string().nullable(),
  tags: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  targets: z.array(inquiryTargetSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActivityAt: z.string().nullable(),
  qualifiedAt: z.string().nullable(),
  convertedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
})

export type InquiryRecord = z.infer<typeof inquiryRecordSchema>
export type InquiryTargetRecord = z.infer<typeof inquiryTargetSchema>

export const inquiryConversionSchema = z.object({
  id: z.string(),
  inquiryId: z.string(),
  kind: z.enum(["proposal", "booking_session", "booking"]),
  mode: z.enum(["created", "attached_existing"]),
  targetId: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
})

export type InquiryConversionRecord = z.infer<typeof inquiryConversionSchema>
export const inquiryListResponse = listResponseSchema(inquiryRecordSchema)
export const inquirySingleResponse = singleEnvelope(inquiryRecordSchema)
export const inquiryConversionsResponse = z.object({ data: z.array(inquiryConversionSchema) })
export const inquiryConversionCommandResponse = z.object({
  data: inquiryConversionSchema,
  outcome: z.enum(["created", "replayed", "attached"]).optional(),
})
