import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

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
  "no_response",
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
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
})

export const inquiryTravelBriefSchema = z
  .object({
    version: z.literal(1).optional(),
    destinations: z
      .array(z.object({ placeId: z.string().optional(), label: z.string() }))
      .optional(),
    origin: z.object({ placeId: z.string().optional(), label: z.string() }).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dateFlexibility: z.enum(["exact", "few_days", "few_weeks", "open"]).optional(),
    durationNights: z.number().int().positive().optional(),
    adults: z.number().int().nonnegative().optional(),
    children: z.array(z.object({ age: z.number().int().nonnegative().optional() })).optional(),
    rooms: z.number().int().positive().optional(),
    budget: z
      .object({
        amountCents: z.number().int().nonnegative().optional(),
        currency: z.string(),
        basis: z.enum(["total", "per_person"]).optional(),
        flexibility: z.enum(["firm", "approximate", "unknown"]).optional(),
      })
      .optional(),
    interests: z.array(z.string()).optional(),
    accessibilityOrDietaryNotes: z.string().optional(),
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
  closeNote: z.string().nullable(),
  duplicateOfInquiryId: z.string().nullable(),
  priority: inquiryPrioritySchema,
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  contactSnapshot: inquiryContactSnapshotSchema,
  ownerId: z.string().nullable(),
  teamId: z.string().nullable(),
  unassignedReason: z.string().nullable(),
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
  consentSnapshot: z.record(z.string(), z.unknown()).nullable(),
  tags: z.array(z.string()),
  customFields: z.record(z.string(), z.record(z.string(), z.unknown())),
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
