import { emailAddress } from "@voyant-travel/schema-kit/email"
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
    email: emailAddress().nullable().optional(),
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
    email: emailAddress().nullable().optional(),
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

/**
 * Adding a catalog-linked service to a booking that already exists — an
 * extra excursion, a transfer, another room.
 *
 * Only the identity of what is being added crosses the wire. Price, name,
 * and timing are resolved from the catalog server-side, so an operator
 * cannot quote themselves a number the catalog does not agree with, and
 * the snapshot columns on the resulting Booking Item stay authoritative.
 */
export const bookingItemAdditionSchema = z.object({
  type: z.literal("item_add"),
  productId: z.string().min(1),
  optionId: z.string().min(1).nullable().optional(),
  optionUnitId: z.string().min(1).nullable().optional(),
  /**
   * Departure to consume capacity from. Required for a product that sells
   * by departure; the preview refuses the addition when the product needs
   * one and none is given.
   */
  availabilitySlotId: z.string().min(1).nullable().optional(),
  quantity: z.number().int().positive().max(99).default(1),
  /** Overrides the catalog name on the Booking Item only — never the price. */
  title: z.string().trim().min(1).max(255).optional(),
})

export const previewBookingItemAdditionSchema = z.object({
  expectedBookingRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000),
  addition: bookingItemAdditionSchema,
})

/**
 * What to do when moving a Booking Item lands on a cheaper departure.
 *
 * There is no single right answer — operators differ, and the same operator
 * differs between a goodwill move and a customer-requested one — so the
 * choice is made per move rather than baked into policy.
 */
export const bookingItemMoveRefundHandlingSchema = z.enum([
  /** Record what is owed back so an operator can pay it out. */
  "refund",
  /** Hold the difference as a travel credit against the customer. */
  "travel_credit",
  /** Customer keeps the original price; the move costs nothing back. */
  "waive",
])

/**
 * Moving a Booking Item to a different departure — the "can we push this to
 * next month?" call.
 *
 * The target departure is all the caller chooses about price: the new fare
 * is resolved from the catalog for that date, including any departure price
 * override and quantity tier, so an operator cannot quote a number the
 * catalog disagrees with. The change fee is the one number they *do* set,
 * because no policy in this system models one.
 *
 * The move is quoted as `(new fare − old fare) + change fee`. A negative
 * result is settled per `refundHandling`.
 */
export const bookingItemMoveSchema = z.object({
  type: z.literal("item_move"),
  bookingItemId: z.string().min(1),
  /** Departure to move onto. Must belong to the item's own product. */
  availabilitySlotId: z.string().min(1),
  /**
   * Operator-set fee for making the change, in the Booking's currency.
   * Added on top of the fare difference and quoted as its own line, so the
   * customer-facing record separates "the new date costs more" from "we
   * charge for changing".
   */
  changeFeeCents: z.number().int().min(0).max(10_000_000).default(0),
  /**
   * How much of a price increase the operator absorbs rather than passes
   * on — the goodwill lever for "the new date costs more, but we are only
   * charging you part of it".
   *
   * Kept separate from the fare rather than letting the caller overwrite
   * it, so the catalog price stays authoritative and visible and the
   * concession is its own auditable line. Capped server-side at the
   * increase: a move that costs more must not turn into a payout.
   */
  fareDiscountCents: z.number().int().min(0).max(10_000_000).default(0),
  refundHandling: bookingItemMoveRefundHandlingSchema.default("refund"),
})

export const previewBookingItemMoveSchema = z.object({
  expectedBookingRevision: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2_000),
  move: bookingItemMoveSchema,
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
  allocation: z.enum([
    "not_required",
    "increase_required",
    "release_required",
    // A move gives one departure's capacity back and takes another's, so
    // it is neither an increase nor a release on its own.
    "move_required",
    "applied",
  ]),
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
  /** Null for `item_add`, which concerns a service rather than a person. */
  travelerId: z.string().nullable(),
  kind: z.enum(["traveler_correction", "traveler_add", "traveler_drop", "item_add", "item_move"]),
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
    travelerId: z.string().nullable(),
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
export type BookingItemAddition = z.infer<typeof bookingItemAdditionSchema>
export type PreviewBookingItemAdditionInput = z.infer<typeof previewBookingItemAdditionSchema>
export type BookingItemMove = z.infer<typeof bookingItemMoveSchema>
export type BookingItemMoveRefundHandling = z.infer<typeof bookingItemMoveRefundHandlingSchema>
export type PreviewBookingItemMoveInput = z.infer<typeof previewBookingItemMoveSchema>
export type TravelerRosterChange = z.infer<typeof travelerRosterChangeSchema>
export type TravelerCorrectionPatch = z.infer<typeof travelerCorrectionPatchSchema>
export type AcceptBookingAmendmentInput = z.infer<typeof acceptBookingAmendmentSchema>
export type ApplyBookingAmendmentInput = z.infer<typeof applyBookingAmendmentSchema>
