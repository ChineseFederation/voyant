import { z } from "zod"

export const customerVerificationChannelSchema = z.enum(["email", "sms"])
export const customerVerificationStatusSchema = z.enum([
  "pending",
  "verified",
  "expired",
  "failed",
  "cancelled",
])

const purposeSchema = z.string().trim().min(1).max(100).default("contact_confirmation")
const metadataSchema = z.record(z.string(), z.unknown()).optional().nullable()
/**
 * What the challenge authorizes, beyond its purpose — the booking draft id for
 * a self-service create. Bound here at start so a verified challenge cannot be
 * redirected at a different draft later.
 */
const subjectRefSchema = z.string().trim().min(1).max(255).optional().nullable()

export const startEmailVerificationChallengeSchema = z.object({
  email: z.email(),
  purpose: purposeSchema,
  locale: z.string().trim().min(2).max(16).optional().nullable(),
  metadata: metadataSchema,
  subjectRef: subjectRefSchema,
})

export const startSmsVerificationChallengeSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  purpose: purposeSchema,
  locale: z.string().trim().min(2).max(16).optional().nullable(),
  metadata: metadataSchema,
  subjectRef: subjectRefSchema,
})

export const confirmEmailVerificationChallengeSchema = z.object({
  email: z.email(),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
  purpose: purposeSchema,
})

export const confirmSmsVerificationChallengeSchema = z.object({
  phone: z.string().trim().min(6).max(32),
  code: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/),
  purpose: purposeSchema,
})

export const customerVerificationChallengeRecordSchema = z.object({
  id: z.string(),
  channel: customerVerificationChannelSchema,
  destination: z.string(),
  purpose: z.string(),
  status: customerVerificationStatusSchema,
  expiresAt: z.date(),
  verifiedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const customerVerificationStartResultSchema = customerVerificationChallengeRecordSchema

export const customerVerificationConfirmResultSchema =
  customerVerificationChallengeRecordSchema.extend({
    status: z.literal("verified"),
  })

/**
 * Wire shape of a challenge record as it crosses the JSON boundary
 * (voyant#2114, Batch C). The runtime record carries `Date` instances
 * (`expiresAt`/`verifiedAt`/`createdAt`/`updatedAt`); `c.json(...)` serializes
 * those to ISO strings, so the documented response must declare strings — not
 * `z.date()` — to be an honest contract. The contract test round-trips a real
 * record through `JSON.parse(JSON.stringify(...))` to keep these in step.
 */
export const customerVerificationChallengeRecordWireSchema = z.object({
  id: z.string(),
  channel: customerVerificationChannelSchema,
  destination: z.string(),
  purpose: z.string(),
  status: customerVerificationStatusSchema,
  expiresAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

/** `{ data }` envelope for the start routes (POST email/sms start). */
export const customerVerificationStartResponseSchema = z.object({
  data: customerVerificationChallengeRecordWireSchema,
})

/** `{ data }` envelope for the confirm routes; status is always `verified`. */
export const customerVerificationConfirmResponseSchema = z.object({
  data: customerVerificationChallengeRecordWireSchema.extend({
    status: z.literal("verified"),
  }),
})

/** Error envelope shared by the verification non-2xx responses. */
export const customerVerificationErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
})

export type CustomerVerificationChannel = z.infer<typeof customerVerificationChannelSchema>
export type CustomerVerificationStatus = z.infer<typeof customerVerificationStatusSchema>
export type StartEmailVerificationChallengeInput = z.infer<
  typeof startEmailVerificationChallengeSchema
>
export type StartSmsVerificationChallengeInput = z.infer<typeof startSmsVerificationChallengeSchema>
export type ConfirmEmailVerificationChallengeInput = z.infer<
  typeof confirmEmailVerificationChallengeSchema
>
export type ConfirmSmsVerificationChallengeInput = z.infer<
  typeof confirmSmsVerificationChallengeSchema
>
export type CustomerVerificationChallengeRecord = z.infer<
  typeof customerVerificationChallengeRecordSchema
>
export type CustomerVerificationStartResult = z.infer<typeof customerVerificationStartResultSchema>
export type CustomerVerificationConfirmResult = z.infer<
  typeof customerVerificationConfirmResultSchema
>
