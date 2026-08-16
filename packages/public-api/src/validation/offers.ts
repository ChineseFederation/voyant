import { z } from "zod"

export const publicApiPromotionalOfferSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  description: z.string().nullable(),
  discountType: z.enum(["percentage", "fixed_amount"]),
  discountValue: z.string(),
  currency: z.string().nullable(),
  applicableProductIds: z.array(z.string()),
  applicableDepartureIds: z.array(z.string()),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  minTravelers: z.number().int().nullable(),
  imageMobileUrl: z.string().nullable(),
  imageDesktopUrl: z.string().nullable(),
  stackable: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const publicApiPromotionalOfferListQuerySchema = z.object({
  departureId: z.string().optional(),
  locale: z.string().trim().min(2).optional(),
})

export const publicApiPromotionalOfferListResponseSchema = z.object({
  data: z.array(publicApiPromotionalOfferSchema),
})

export const publicApiPromotionalOfferResponseSchema = z.object({
  data: publicApiPromotionalOfferSchema,
})

export const publicApiOfferAudienceSchema = z.enum(["staff", "customer", "partner", "supplier"])

const publicApiOfferTargetInputSchema = z.object({
  productId: z.string().trim().min(1),
  departureId: z.string().trim().min(1).optional().nullable(),
  bookingId: z.string().trim().min(1).optional().nullable(),
  sessionId: z.string().trim().min(1).optional().nullable(),
  locale: z.string().trim().min(2).optional(),
  pax: z.coerce.number().int().min(1),
  audience: publicApiOfferAudienceSchema.default("customer"),
  market: z.string().trim().min(1).default("default"),
  basePriceCents: z.coerce.number().int().min(0),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
})

export const publicApiOfferApplyInputSchema = publicApiOfferTargetInputSchema

export const publicApiOfferRedeemInputSchema = publicApiOfferTargetInputSchema.extend({
  code: z.string().trim().min(1).max(80),
})

export const publicApiAppliedOfferSchema = z.object({
  offerId: z.string(),
  offerName: z.string(),
  discountAppliedCents: z.number().int(),
  discountedPriceCents: z.number().int(),
  currency: z.string(),
  discountKind: z.enum(["percentage", "fixed_amount"]),
  discountPercent: z.number().nullable(),
  discountAmountCents: z.number().int().nullable(),
  appliedCode: z.string().nullable(),
  stackable: z.boolean(),
})

export const publicApiOfferMutationStatusSchema = z.enum([
  "applied",
  "not_applicable",
  "invalid",
  "conflict",
])

export const publicApiOfferMutationReasonSchema = z
  .enum([
    "offer_not_found",
    "offer_expired",
    "offer_not_yet_valid",
    "code_not_found",
    "code_required",
    "code_expired",
    "code_not_yet_valid",
    "scope",
    "min_pax",
    "eligibility",
    "currency",
    "no_discount",
    "booking_mismatch",
    "session_mismatch",
    "conflict",
  ])
  .nullable()

export const publicApiOfferConflictSchema = z.object({
  policy: z.enum(["best_discount_wins", "stackable_compose"]),
  autoAppliedOfferIds: z.array(z.string()),
  manualOfferId: z.string().nullable(),
  selectedOfferIds: z.array(z.string()),
  message: z.string(),
})

export const publicApiOfferMutationResultSchema = z.object({
  status: publicApiOfferMutationStatusSchema,
  reason: publicApiOfferMutationReasonSchema,
  offer: publicApiPromotionalOfferSchema.nullable(),
  target: z.object({
    bookingId: z.string().nullable(),
    sessionId: z.string().nullable(),
    productId: z.string(),
    departureId: z.string().nullable(),
  }),
  pricing: z.object({
    basePriceCents: z.number().int(),
    currency: z.string(),
    discountAppliedCents: z.number().int(),
    discountedPriceCents: z.number().int(),
  }),
  appliedOffers: z.array(publicApiAppliedOfferSchema),
  conflict: publicApiOfferConflictSchema.nullable(),
})

export const publicApiOfferMutationResponseSchema = z.object({
  data: publicApiOfferMutationResultSchema,
})

export type PublicApiPromotionalOffer = z.infer<typeof publicApiPromotionalOfferSchema>
export type PublicApiOfferApplyInput = z.infer<typeof publicApiOfferApplyInputSchema>
export type PublicApiOfferRedeemInput = z.infer<typeof publicApiOfferRedeemInputSchema>
export type PublicApiAppliedOffer = z.infer<typeof publicApiAppliedOfferSchema>
export type PublicApiOfferMutationResult = z.infer<typeof publicApiOfferMutationResultSchema>
