import { z } from "zod"

import {
  inquiryConsentSnapshotSchema,
  inquiryContactSnapshotSchema,
  inquiryCustomFieldsSchema,
  inquiryKindSchema,
  inquiryTargetSnapshotSchema,
  inquiryTravelBriefV1Schema,
} from "./inquiries.js"

export const publicInquiryTargetSnapshotSchema = inquiryTargetSnapshotSchema.omit({
  sourceChannel: true,
})

export const publicInquiryTargetSchema = z.object({
  kind: z.enum(["product", "option_unit"]),
  targetId: z.string().trim().min(1).max(500),
  snapshot: publicInquiryTargetSnapshotSchema,
})

/** Guarded storefront intake. Source is fixed by the route, never trusted from the body. */
export const createPublicInquirySchema = z
  .object({
    sourceRef: z.string().trim().min(1).max(500),
    subject: z.string().trim().min(1).max(300),
    kind: inquiryKindSchema,
    contactSnapshot: inquiryContactSnapshotSchema,
    customerMessage: z.string().max(20_000).nullable().optional(),
    travelBrief: inquiryTravelBriefV1Schema.nullable().optional(),
    targets: z.array(publicInquiryTargetSchema).max(20).default([]),
    locale: z.string().trim().min(2).max(35).nullable().optional(),
    sourceUrl: z.string().url().max(2_000).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    customFields: inquiryCustomFieldsSchema.default({}),
    consentSnapshot: inquiryConsentSnapshotSchema.nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.kind === "product" && !input.targets.some((target) => target.kind === "product")) {
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "A product Inquiry requires a Product target",
      })
    }
    const seen = new Set<string>()
    input.targets.forEach((target, index) => {
      const key = `${target.kind}:${target.targetId}`
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["targets", index],
          message: "An Inquiry target may appear only once",
        })
      }
      seen.add(key)
    })
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
