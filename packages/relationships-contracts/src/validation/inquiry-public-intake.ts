import { z } from "zod"

import {
  inquiryConsentSnapshotSchema,
  inquiryContactSnapshotSchema,
  inquiryCustomFieldsSchema,
  inquiryKindSchema,
  inquiryTargetSnapshotSchema,
  inquiryTravelBriefV1Schema,
} from "./inquiries.js"

export const publicInquiryTargetSchema = z.object({
  kind: z.enum(["product", "option_unit", "catalog_item"]),
  targetId: z.string().trim().min(1).max(500),
  snapshot: inquiryTargetSnapshotSchema,
})

/** Guarded storefront intake. Source is fixed by the route, never trusted from the body. */
export const createPublicInquirySchema = z.object({
  sourceRef: z.string().trim().min(1).max(500),
  subject: z.string().trim().min(1).max(300),
  kind: inquiryKindSchema,
  contactSnapshot: inquiryContactSnapshotSchema,
  personId: z.string().min(1).nullable().optional(),
  customerSessionRef: z.string().trim().min(1).max(500).nullable().optional(),
  customerMessage: z.string().max(20_000).nullable().optional(),
  travelBrief: inquiryTravelBriefV1Schema.nullable().optional(),
  targets: z.array(publicInquiryTargetSchema).max(20).default([]),
  locale: z.string().trim().min(2).max(35).nullable().optional(),
  sourceUrl: z.string().url().max(2_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  customFields: inquiryCustomFieldsSchema.default({}),
  consentSnapshot: inquiryConsentSnapshotSchema.nullable().optional(),
})

export const publicInquiryReceiptSchema = z.object({
  data: z.object({
    inquiryId: z.string(),
    status: z.literal("new"),
    duplicate: z.boolean(),
    receivedAt: z.string(),
  }),
})

export type CreatePublicInquiryInput = z.infer<typeof createPublicInquirySchema>
export type PublicInquiryTargetInput = z.infer<typeof publicInquiryTargetSchema>
export type PublicInquiryReceipt = z.infer<typeof publicInquiryReceiptSchema>
