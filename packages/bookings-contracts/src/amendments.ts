import { z } from "zod"

import { bookingTravelerCategorySchema } from "./validation-shared.js"

export const bookingAmendmentStatusSchema = z.enum([
  "proposed",
  "accepted",
  "applied",
  "rejected",
  "failed",
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
  finance: z.literal("not_required"),
  legal: z.literal("not_required"),
  documents: z.literal("not_required"),
  fulfillment: z.literal("not_required"),
  supplier: z.literal("not_required"),
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
  travelers: z.array(bookingRevisionTravelerSchema),
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
  kind: z.literal("traveler_correction"),
  status: bookingAmendmentStatusSchema,
  baseBookingRevision: z.number().int().positive(),
  resultBookingRevision: z.number().int().positive(),
  acceptanceRequired: z.boolean(),
  policyDecisions: z.array(bookingAmendmentPolicyDecisionSchema),
  priceDelta: z.object({ amountCents: z.literal(0), currency: z.string() }),
  effects: bookingAmendmentEffectsSchema,
  nextActions: z.array(z.enum(["accept", "apply"])),
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
  z.object({
    status: z.literal("stale_revision"),
    currentBookingRevision: z.number().int().positive(),
  }),
])

export type BookingAmendment = z.infer<typeof bookingAmendmentSchema>
export type BookingRevisionSnapshot = z.infer<typeof bookingRevisionSnapshotSchema>
export type PreviewTravelerCorrectionInput = z.infer<typeof previewTravelerCorrectionSchema>
export type TravelerCorrectionPatch = z.infer<typeof travelerCorrectionPatchSchema>
export type AcceptBookingAmendmentInput = z.infer<typeof acceptBookingAmendmentSchema>
export type ApplyBookingAmendmentInput = z.infer<typeof applyBookingAmendmentSchema>
