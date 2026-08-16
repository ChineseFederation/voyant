import {
  customerSignalKindSchema,
  customerSignalSourceSchema,
  customerSignalStatusSchema,
} from "@voyant-travel/relationships-contracts/validation"
import { z } from "zod"

import { languageTagSchema } from "../validation-settings.js"

const boundedRecordSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 8000, {
    message: "Object payload must be 8KB or smaller",
  })

const publicApiIntakeTagsSchema = z.array(z.string().trim().min(1).max(64)).max(20).default([])

export const publicApiIntakeConsentSchema = z.object({
  marketing: z.boolean().default(false),
  newsletter: z.boolean().default(false),
  gdpr: z.boolean().default(false),
  scope: z.string().trim().min(1).max(120).nullable().optional(),
  acceptedAt: z.string().datetime().nullable().optional(),
})

export const publicApiLeadContactSchema = z
  .object({
    name: z.string().trim().min(1).max(240).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    email: z.email().max(320).optional(),
    phone: z.string().trim().min(3).max(64).optional(),
  })
  .refine((value) => Boolean(value.email || value.phone), {
    message: "Either contact.email or contact.phone is required",
  })

export const publicApiLeadIntakeInputSchema = z.object({
  kind: customerSignalKindSchema.default("inquiry"),
  source: customerSignalSourceSchema.default("website"),
  contact: publicApiLeadContactSchema,
  productId: z.string().trim().min(1).max(160).nullable().optional(),
  optionUnitId: z.string().trim().min(1).max(160).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  tags: publicApiIntakeTagsSchema,
  sourceSubmissionId: z.string().trim().min(1).max(160).nullable().optional(),
  sourceUrl: z.url().nullable().optional(),
  locale: languageTagSchema.optional(),
  payload: boundedRecordSchema.default({}),
  consent: publicApiIntakeConsentSchema.default({
    marketing: false,
    newsletter: false,
    gdpr: false,
  }),
})

export const publicApiNewsletterSubscribeInputSchema = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(240).optional(),
  firstName: z.string().trim().min(1).max(120).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  source: customerSignalSourceSchema.default("website"),
  sourceSubmissionId: z.string().trim().min(1).max(160).nullable().optional(),
  sourceUrl: z.url().nullable().optional(),
  locale: languageTagSchema.optional(),
  tags: publicApiIntakeTagsSchema,
  payload: boundedRecordSchema.default({}),
  consent: publicApiIntakeConsentSchema.extend({ newsletter: z.literal(true) }),
})

export const publicApiIntakeResponseSchema = z.object({
  id: z.string(),
  personId: z.string(),
  kind: customerSignalKindSchema,
  source: customerSignalSourceSchema,
  status: customerSignalStatusSchema,
  duplicate: z.boolean(),
})

export const publicApiNewsletterSubscribeResponseSchema = publicApiIntakeResponseSchema.extend({
  doubleOptIn: z.enum(["not_configured", "requested"]),
})

/**
 * Wire envelopes for the intake routes (voyant#2114, Batch C). The handlers
 * answer `c.json({ data })`, so the documented response is the `{ data }`-wrapped
 * intake/newsletter shape. No `Date` fields here, so the wire shape matches the
 * record schema verbatim.
 */
export const publicApiLeadIntakeEnvelopeSchema = z.object({
  data: publicApiIntakeResponseSchema,
})

export const publicApiNewsletterSubscribeEnvelopeSchema = z.object({
  data: publicApiNewsletterSubscribeResponseSchema,
})

export type PublicApiIntakeConsent = z.infer<typeof publicApiIntakeConsentSchema>
export type PublicApiLeadContact = z.infer<typeof publicApiLeadContactSchema>
export type PublicApiLeadIntakeInput = z.infer<typeof publicApiLeadIntakeInputSchema>
export type PublicApiNewsletterSubscribeInput = z.infer<
  typeof publicApiNewsletterSubscribeInputSchema
>
export type PublicApiIntakeResponse = z.infer<typeof publicApiIntakeResponseSchema>
export type PublicApiNewsletterSubscribeResponse = z.infer<
  typeof publicApiNewsletterSubscribeResponseSchema
>
