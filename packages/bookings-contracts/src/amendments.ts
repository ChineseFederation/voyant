import { z } from "zod"

import { bookingTravelerCategorySchema } from "./validation-shared.js"

export const bookingAmendmentStatusSchema = z.enum([
  "proposed",
  "accepted",
  "applying",
  "applied",
  "rejected",
  "failed",
  "in_doubt",
  "manual_review",
])

export const bookingRevisionRoleSchema = z.enum(["before", "proposed_after"])

export const travelerCorrectionPatchSchema = z
  .object({
    firstName: z.string().min(1).max(255).optional(),
    lastName: z.string().min(1).max(255).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    preferredLanguage: z.string().max(35).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one traveler field is required",
  })

export const previewTravelerCorrectionSchema = z.object({
  travelerId: z.string().min(1),
  expectedBookingRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000),
  patch: travelerCorrectionPatchSchema.describe(
    "At least one traveler correction field must be provided.",
  ),
})

const bookingItemIdsSchema = z
  .array(z.string().min(1))
  .min(1)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Booking item ids must be unique",
  })
  .describe("One or more distinct Booking Item ids; duplicate ids are rejected.")

export const travelerRosterAdditionSchema = z.object({
  type: z.literal("traveler_add"),
  bookingItemIds: bookingItemIdsSchema,
  traveler: z.object({
    personId: z.string().min(1).nullable().optional(),
    participantType: z.enum(["traveler", "occupant", "other"]).default("traveler"),
    travelerCategory: bookingTravelerCategorySchema.nullable().optional(),
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    preferredLanguage: z.string().max(35).nullable().optional(),
  }),
})

export const travelerRosterRemovalSchema = z.object({
  type: z.literal("traveler_drop"),
  bookingItemIds: bookingItemIdsSchema,
  travelerId: z.string().min(1),
})

export const travelerRosterChangeSchema = z.discriminatedUnion("type", [
  travelerRosterAdditionSchema,
  travelerRosterRemovalSchema,
])

export const previewTravelerRosterChangeSchema = z.object({
  expectedBookingRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000),
  change: travelerRosterChangeSchema,
})

export const acceptBookingAmendmentSchema = z.object({
  proposedRevisionId: z.string().min(1),
})

export const applyBookingAmendmentSchema = z.object({
  expectedBookingRevision: z.number().int().positive(),
  proposedRevisionId: z.string().min(1),
})

export const bookingAmendmentPolicyDecisionSchema = z.object({
  code: z.string(),
  version: z.string(),
  decision: z.enum(["allowed", "acceptance_required"]),
  reason: z.string(),
})

export const bookingAmendmentEffectsSchema = z.object({
  finance: z.enum(["not_required", "collection_required", "refund_required", "recorded"]),
  legal: z.enum(["not_required", "review_required"]),
  documents: z.enum(["not_required", "reissue_required"]),
  fulfillment: z.enum(["not_required", "reissue_required"]),
  supplier: z.enum([
    "not_required",
    "modify_required",
    "pending",
    "secured",
    "refused",
    "in_doubt",
    "manual_review",
  ]),
  allocation: z.enum(["not_required", "increase_required", "release_required", "applied"]),
})

export const bookingAmendmentPriceSchema = z.object({
  currency: z.string().min(3).max(8),
  subtotalDeltaCents: z.number().int(),
  feeDeltaCents: z.number().int(),
  taxDeltaCents: z.number().int(),
  amountCents: z.number().int(),
  collectionAmountCents: z.number().int().nonnegative(),
  refundAmountCents: z.number().int().nonnegative(),
  taxLines: z.array(
    z.object({
      bookingItemId: z.string(),
      code: z.string().nullable(),
      name: z.string(),
      amountCents: z.number().int(),
      rateBasisPoints: z.number().int().nullable(),
      includedInPrice: z.boolean(),
    }),
  ),
})

export const bookingAmendmentFinancialConsequencesSchema = z.object({
  collection: z.enum(["not_required", "required"]),
  refund: z.enum(["not_required", "required"]),
  invoice: z.enum(["not_required", "reissue_required"]),
  creditNote: z.enum(["not_required", "issue_required"]),
  paymentSchedule: z.enum(["not_required", "recalculate_required"]),
})

export const bookingRevisionTravelerSchema = z.object({
  id: z.string(),
  personId: z.string().nullable(),
  participantType: z.enum(["traveler", "occupant", "other"]),
  travelerCategory: bookingTravelerCategorySchema.nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  isPrimary: z.boolean(),
})

export const bookingRevisionSnapshotSchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  revision: z.number().int().positive(),
  sellAmountCents: z.number().int().nullable().optional(),
  pax: z.number().int().nonnegative().nullable().optional(),
  travelers: z.array(bookingRevisionTravelerSchema),
  items: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number().int().nonnegative(),
        totalSellAmountCents: z.number().int().nullable(),
        travelerIds: z.array(z.string()),
        allocations: z.array(
          z.object({
            id: z.string(),
            quantity: z.number().int().nonnegative(),
            status: z.string(),
          }),
        ),
      }),
    )
    .optional(),
})

export const bookingRevisionSchema = z.object({
  id: z.string(),
  amendmentId: z.string(),
  bookingId: z.string(),
  bookingRevision: z.number().int().positive(),
  role: bookingRevisionRoleSchema,
  snapshot: bookingRevisionSnapshotSchema,
  changedFields: z.array(z.string()),
  authorizedBy: z.string().nullable(),
  reason: z.string(),
  createdAt: z.string(),
})

export const bookingAmendmentSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  travelerId: z.string(),
  kind: z.enum(["traveler_correction", "traveler_add", "traveler_drop"]),
  status: bookingAmendmentStatusSchema,
  baseBookingRevision: z.number().int().positive(),
  resultBookingRevision: z.number().int().positive(),
  acceptanceRequired: z.boolean(),
  policyDecisions: z.array(bookingAmendmentPolicyDecisionSchema),
  priceDelta: bookingAmendmentPriceSchema,
  financialConsequences: bookingAmendmentFinancialConsequencesSchema,
  effects: bookingAmendmentEffectsSchema,
  nextActions: z.array(
    z.enum([
      "accept",
      "apply",
      "wait_supplier",
      "reconcile_supplier",
      "manual_review",
      "collect_payment",
      "issue_refund",
      "reissue_documents",
    ]),
  ),
  quotedAt: z.string(),
  quoteExpiresAt: z.string().nullable(),
  supplierOperationIds: z.array(z.string()),
  failureCode: z.string().nullable(),
  requestedBy: z.string().nullable(),
  requestedActor: z.enum(["customer", "staff", "partner", "system"]),
  reason: z.string(),
  acceptedAt: z.string().nullable(),
  acceptedBy: z.string().nullable(),
  acceptedActor: z.enum(["customer", "staff", "partner", "system"]).nullable(),
  appliedAt: z.string().nullable(),
  appliedBy: z.string().nullable(),
  appliedActor: z.enum(["customer", "staff", "partner", "system"]).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revisions: z.array(bookingRevisionSchema).optional(),
})

export const bookingAmendmentPreviewResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), amendment: bookingAmendmentSchema }),
  z.object({
    status: z.literal("no_op"),
    bookingId: z.string(),
    travelerId: z.string(),
    bookingRevision: z.number().int().positive(),
  }),
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("idempotency_conflict") }),
  z.object({ status: z.literal("unsupported_configuration"), reason: z.string() }),
  z.object({ status: z.literal("availability_changed"), bookingItemId: z.string() }),
  z.object({
    status: z.literal("stale_revision"),
    currentBookingRevision: z.number().int().positive(),
  }),
])

export const bookingAmendmentApplyResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("supplier_pending"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("supplier_in_doubt"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("supplier_refused"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("manual_review"), amendment: bookingAmendmentSchema }),
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("revision_mismatch") }),
  z.object({ status: z.literal("acceptance_required") }),
  z.object({ status: z.literal("invalid_state") }),
  z.object({ status: z.literal("idempotency_conflict") }),
  z.object({ status: z.literal("quote_expired") }),
  z.object({ status: z.literal("unsupported_capability") }),
  z.object({ status: z.literal("availability_changed"), bookingItemId: z.string() }),
  z.object({
    status: z.literal("stale_revision"),
    currentBookingRevision: z.number().int().positive(),
  }),
])

export type BookingAmendment = z.infer<typeof bookingAmendmentSchema>
export type BookingAmendmentFinancialConsequences = z.infer<
  typeof bookingAmendmentFinancialConsequencesSchema
>
export type BookingAmendmentPrice = z.infer<typeof bookingAmendmentPriceSchema>
export type BookingRevisionSnapshot = z.infer<typeof bookingRevisionSnapshotSchema>
export type PreviewTravelerCorrectionInput = z.infer<typeof previewTravelerCorrectionSchema>
export type PreviewTravelerRosterChangeInput = z.infer<typeof previewTravelerRosterChangeSchema>
export type TravelerRosterChange = z.infer<typeof travelerRosterChangeSchema>
export type TravelerCorrectionPatch = z.infer<typeof travelerCorrectionPatchSchema>
export type AcceptBookingAmendmentInput = z.infer<typeof acceptBookingAmendmentSchema>
export type ApplyBookingAmendmentInput = z.infer<typeof applyBookingAmendmentSchema>
