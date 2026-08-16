import { z } from "zod"

const nullableTrimmedString = (max: number) => z.string().trim().min(1).max(max).nullable()

export const publicApiOriginSchema = z
  .url()
  .refine((value) => {
    const url = new URL(value)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    )
  }, "Must be an exact HTTP(S) origin without credentials, path, query, or hash")
  .transform((value) => new URL(value).origin)

export const customerBusinessOnboardingModeSchema = z.enum(["open", "request", "invite-only"])
export const customerBusinessAccountRoleSchema = z.enum(["owner", "admin", "member"])
export const customerBusinessAccountRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "canceled",
])

export const customerBusinessProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    legalName: nullableTrimmedString(240).optional().default(null),
    taxId: nullableTrimmedString(100).optional().default(null),
    website: z.url().max(2_048).nullable().optional().default(null),
  })
  .strict()

export const customerBusinessAccountRequestSchema = z
  .object({
    id: z.string().min(1),
    requesterUserId: z.string().min(1),
    requesterEmail: z.email().nullable(),
    requesterName: z.string().nullable(),
    publicApiOrigin: publicApiOriginSchema,
    mode: customerBusinessOnboardingModeSchema,
    profile: customerBusinessProfileSchema,
    status: customerBusinessAccountRequestStatusSchema,
    idempotencyKey: z.string().min(1),
    authOrganizationId: z.string().nullable(),
    relationshipOrganizationId: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    decidedAt: z.string().datetime().nullable(),
    decidedBy: z.string().nullable(),
    decisionReason: z.string().nullable(),
  })
  .strict()

export const customerBusinessAccountSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal("business"),
    name: z.string(),
    authOrganizationId: z.string().min(1),
    relationshipOrganizationId: z.string().min(1),
    relationshipPersonId: z.null(),
    membershipId: z.string().min(1),
    membershipRole: customerBusinessAccountRoleSchema,
  })
  .strict()

export const customerBusinessAccountCapabilitiesSchema = z
  .object({
    viewRequests: z.boolean(),
    decideRequests: z.boolean(),
    provisionAccounts: z.boolean(),
  })
  .strict()

export const customerBusinessAccountCreateInputSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    profile: customerBusinessProfileSchema,
  })
  .strict()

export const customerBusinessAccountRequestCreateInputSchema =
  customerBusinessAccountCreateInputSchema

export const customerBusinessAccountRequestListQuerySchema = z
  .object({ status: customerBusinessAccountRequestStatusSchema.optional() })
  .strict()

export const customerBusinessAccountDecisionInputSchema = z
  .object({ reason: z.string().trim().min(1).max(2_000).nullable().optional() })
  .strict()

const customerOwnerSelectorSchema = z
  .object({ userId: z.string().min(1).optional(), email: z.email().optional() })
  .strict()
  .refine((value) => Number(Boolean(value.userId)) + Number(Boolean(value.email)) === 1, {
    message: "Exactly one customer owner userId or email is required",
  })

const customerBusinessAccountProvisionBaseSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(200),
    publicApiOrigin: publicApiOriginSchema,
    owner: customerOwnerSelectorSchema,
  })
  .strict()

export const customerBusinessAccountProvisionInputSchema = z.union([
  customerBusinessAccountProvisionBaseSchema.extend({
    relationshipOrganizationId: z.string().min(1),
    profile: z.never().optional(),
  }),
  customerBusinessAccountProvisionBaseSchema.extend({
    relationshipOrganizationId: z.never().optional(),
    profile: customerBusinessProfileSchema,
  }),
])

export const customerBusinessInvitationAcceptInputSchema = z
  .object({ invitationId: z.string().trim().min(1) })
  .strict()

export const customerBusinessInvitationAcceptResultSchema = z
  .object({ account: customerBusinessAccountSchema })
  .strict()

export type CustomerBusinessOnboardingMode = z.infer<typeof customerBusinessOnboardingModeSchema>
export type CustomerBusinessAccountRole = z.infer<typeof customerBusinessAccountRoleSchema>
export type CustomerBusinessAccountRequestStatus = z.infer<
  typeof customerBusinessAccountRequestStatusSchema
>
export type CustomerBusinessProfile = z.infer<typeof customerBusinessProfileSchema>
export type CustomerBusinessAccountRequestDto = z.infer<typeof customerBusinessAccountRequestSchema>
export type CustomerBusinessAccountDto = z.infer<typeof customerBusinessAccountSchema>
export type CustomerBusinessAccountCapabilitiesDto = z.infer<
  typeof customerBusinessAccountCapabilitiesSchema
>
export type CustomerBusinessAccountCreateInput = z.infer<
  typeof customerBusinessAccountCreateInputSchema
>
export type CustomerBusinessAccountDecisionInput = z.infer<
  typeof customerBusinessAccountDecisionInputSchema
>
export type CustomerBusinessAccountProvisionInput = z.infer<
  typeof customerBusinessAccountProvisionInputSchema
>
export type CustomerBusinessInvitationAcceptInput = z.infer<
  typeof customerBusinessInvitationAcceptInputSchema
>
export type CustomerBusinessInvitationAcceptResult = z.infer<
  typeof customerBusinessInvitationAcceptResultSchema
>
