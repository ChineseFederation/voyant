import { z } from "zod"

import {
  bookingAllocationStatusSchema,
  bookingAllocationTypeSchema,
  bookingDocumentTypeSchema,
  bookingFulfillmentDeliveryChannelSchema,
  bookingFulfillmentStatusSchema,
  bookingFulfillmentTypeSchema,
  bookingItemParticipantRoleSchema,
  bookingItemStatusSchema,
  bookingItemTypeSchema,
  bookingStatusSchema,
  bookingTravelerCategorySchema,
} from "./validation-shared.js"

const isoDateSchema = z.string().date()
const isoDateTimeSchema = z.string().datetime()
const publicBookingTravelerTypeSchema = z.enum(["traveler", "occupant"])
const publicBookingVisibleTravelerTypeSchema = z.enum(["traveler", "occupant", "other"])

export const publicBookingSessionTravelerInputSchema = z.object({
  id: z.string().optional(),
  participantType: publicBookingTravelerTypeSchema.default("traveler"),
  travelerCategory: bookingTravelerCategorySchema.nullable().optional(),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  preferredLanguage: z.string().max(35).nullable().optional(),
  specialRequests: z.string().nullable().optional(),
  isPrimary: z.boolean().default(false),
  notes: z.string().nullable().optional(),
})

export const publicCreateBookingSessionItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  itemType: bookingItemTypeSchema.default("unit"),
  quantity: z.number().int().positive().default(1),
  sellCurrency: z.string().min(3).max(3).nullable().optional(),
  unitSellAmountCents: z.number().int().min(0).nullable().optional(),
  totalSellAmountCents: z.number().int().min(0).nullable().optional(),
  costCurrency: z.string().min(3).max(3).nullable().optional(),
  unitCostAmountCents: z.number().int().min(0).nullable().optional(),
  totalCostAmountCents: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
  productId: z.string().nullable().optional(),
  optionId: z.string().nullable().optional(),
  optionUnitId: z.string().nullable().optional(),
  pricingCategoryId: z.string().nullable().optional(),
  sourceSnapshotId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  availabilitySlotId: z.string().min(1),
  allocationType: bookingAllocationTypeSchema.default("unit"),
})

export const publicCreateBookingSessionSchema = z.object({
  externalBookingRef: z.string().nullable().optional(),
  communicationLanguage: z.string().max(35).nullable().optional(),
  sellCurrency: z.string().min(3).max(3),
  baseCurrency: z.string().min(3).max(3).nullable().optional(),
  sellAmountCents: z.number().int().min(0).nullable().optional(),
  baseSellAmountCents: z.number().int().min(0).nullable().optional(),
  costAmountCents: z.number().int().min(0).nullable().optional(),
  baseCostAmountCents: z.number().int().min(0).nullable().optional(),
  marginPercent: z.number().int().nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  endDate: isoDateSchema.nullable().optional(),
  pax: z.number().int().positive().nullable().optional(),
  holdMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  holdExpiresAt: isoDateTimeSchema.nullable().optional(),
  items: z.array(publicCreateBookingSessionItemSchema).min(1),
  travelers: z.array(publicBookingSessionTravelerInputSchema).optional(),
})

export const publicUpdateBookingSessionSchema = z.object({
  externalBookingRef: z.string().nullable().optional(),
  communicationLanguage: z.string().max(35).nullable().optional(),
  pax: z.number().int().positive().nullable().optional(),
  holdMinutes: z
    .number()
    .int()
    .positive()
    .max(24 * 60)
    .optional(),
  holdExpiresAt: isoDateTimeSchema.nullable().optional(),
  travelers: z.array(publicBookingSessionTravelerInputSchema).optional(),
  removedTravelerIds: z.array(z.string()).default([]),
})

export const publicBookingSessionMutationSchema = z.object({
  note: z.string().nullable().optional(),
})

export const publicBookingSessionStateSchema = z.object({
  sessionId: z.string(),
  stateKey: z.literal("wizard"),
  currentStep: z.string().nullable(),
  completedSteps: z.array(z.string()),
  payload: z.record(z.string(), z.unknown()),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const publicUpsertBookingSessionStateSchema = z.object({
  currentStep: z.string().max(255).nullable().optional(),
  completedSteps: z.array(z.string().min(1).max(255)).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  replacePayload: z.boolean().default(false),
})

export const publicBookingSessionRepriceSelectionSchema = z.object({
  itemId: z.string(),
  optionId: z.string().nullable().optional(),
  optionUnitId: z.string().nullable().optional(),
  pricingCategoryId: z.string().nullable().optional(),
  quantity: z.number().int().positive().optional(),
})

export const publicRepriceBookingSessionSchema = z.object({
  catalogId: z.string().optional(),
  applyToSession: z.boolean().default(false),
  selections: z.array(publicBookingSessionRepriceSelectionSchema).min(1),
})

const publicBookingOverviewLocatorShape = {
  bookingId: z.string().min(1).max(50).optional(),
  bookingNumber: z.string().min(1).max(50).optional(),
  bookingCode: z.string().min(1).max(50).optional(),
}

export const publicBookingOverviewLookupQuerySchema = z
  .object({
    ...publicBookingOverviewLocatorShape,
    email: z.string().email(),
  })
  .refine((value) => Boolean(value.bookingId || value.bookingNumber || value.bookingCode), {
    message: "Provide a bookingId, bookingNumber, or bookingCode",
  })

export const publicBookingOverviewAccessQuerySchema = z
  .object({
    ...publicBookingOverviewLocatorShape,
    email: z.string().email().optional(),
  })
  .refine((value) => Boolean(value.bookingId || value.bookingNumber || value.bookingCode), {
    message: "Provide a bookingId, bookingNumber, or bookingCode",
  })

export const publicGuestBookingLookupSchema = z.object({
  bookingCode: z.string().min(1).max(50),
  email: z.string().email(),
})

export const internalBookingOverviewLookupQuerySchema = z
  .object({
    bookingId: z.string().min(1).max(50).optional(),
    bookingNumber: z.string().min(1).max(50).optional(),
    bookingCode: z.string().min(1).max(50).optional(),
    email: z.string().email().optional(),
  })
  .refine((value) => Boolean(value.bookingId || value.bookingNumber || value.bookingCode), {
    message: "Provide a bookingId, bookingNumber, or bookingCode",
  })

export const publicBookingSessionTravelerSchema = z.object({
  id: z.string(),
  participantType: publicBookingVisibleTravelerTypeSchema,
  travelerCategory: bookingTravelerCategorySchema.nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  specialRequests: z.string().nullable(),
  isPrimary: z.boolean(),
  notes: z.string().nullable(),
})

export const publicBookingSessionItemTravelerSchema = z.object({
  id: z.string(),
  travelerId: z.string(),
  role: bookingItemParticipantRoleSchema,
  isPrimary: z.boolean(),
})

export const publicBookingSessionItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  itemType: bookingItemTypeSchema,
  status: bookingItemStatusSchema,
  serviceDate: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  quantity: z.number().int(),
  sellCurrency: z.string(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  costCurrency: z.string().nullable(),
  unitCostAmountCents: z.number().int().nullable(),
  totalCostAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  travelerLinks: z.array(publicBookingSessionItemTravelerSchema),
})

/**
 * Overview items carry an optional vertical `details` block contributed by
 * a package's public-overview enricher (e.g. accommodations adds property /
 * room / rate-plan / nightly-rate specifics). Opaque here so the bookings
 * contract stays vertical-agnostic; each vertical documents its own shape.
 * See issue #2969.
 */
export const publicBookingOverviewItemSchema = publicBookingSessionItemSchema.extend({
  details: z.unknown().optional(),
})

export const publicBookingSessionAllocationSchema = z.object({
  id: z.string(),
  bookingItemId: z.string().nullable(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  availabilitySlotId: z.string().nullable(),
  quantity: z.number().int(),
  allocationType: bookingAllocationTypeSchema,
  status: bookingAllocationStatusSchema,
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
})

export const publicBookingSessionChecklistSchema = z.object({
  hasTravelers: z.boolean(),
  hasPrimaryTraveler: z.boolean(),
  hasItems: z.boolean(),
  hasAllocations: z.boolean(),
  readyForConfirmation: z.boolean(),
})

export const publicCheckoutCapabilitySchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
  actions: z.array(
    z.enum([
      "session:read",
      "session:update",
      "session:reprice",
      "session:finalize",
      "payment:read",
      "payment:start",
    ]),
  ),
})

export const publicGuestBookingAccessSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string(),
  actions: z.array(
    z.enum([
      "overview:read",
      "payment:read",
      "payment:start",
      "amendment:read",
      "amendment:preview",
      "amendment:accept",
      "amendment:apply",
    ]),
  ),
})

export const publicBookingSessionSchema = z.object({
  sessionId: z.string(),
  bookingNumber: z.string(),
  status: bookingStatusSchema,
  externalBookingRef: z.string().nullable(),
  communicationLanguage: z.string().nullable(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  expiredAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  travelers: z.array(publicBookingSessionTravelerSchema),
  items: z.array(publicBookingSessionItemSchema),
  allocations: z.array(publicBookingSessionAllocationSchema),
  checklist: publicBookingSessionChecklistSchema,
  state: publicBookingSessionStateSchema.nullable(),
  checkoutCapability: publicCheckoutCapabilitySchema.optional(),
})

export const publicBookingSessionRepriceItemSchema = z.object({
  itemId: z.string(),
  title: z.string(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  optionUnitId: z.string().nullable(),
  optionUnitName: z.string().nullable(),
  optionUnitType: z.string().nullable(),
  pricingCategoryId: z.string().nullable(),
  quantity: z.number().int(),
  pricingMode: z.string(),
  unitSellAmountCents: z.number().int().nullable(),
  totalSellAmountCents: z.number().int().nullable(),
  warnings: z.array(z.string()),
})

export const publicBookingSessionRepriceSummarySchema = z.object({
  sessionId: z.string(),
  catalogId: z.string().nullable(),
  currencyCode: z.string(),
  totalSellAmountCents: z.number().int(),
  items: z.array(publicBookingSessionRepriceItemSchema),
  warnings: z.array(z.string()),
  appliedToSession: z.boolean(),
})

export const publicBookingSessionRepriceResultSchema = z.object({
  pricing: publicBookingSessionRepriceSummarySchema,
  session: publicBookingSessionSchema.nullable(),
})

export const publicBookingOverviewTravelerSchema = z.object({
  id: z.string(),
  participantType: publicBookingVisibleTravelerTypeSchema,
  firstName: z.string(),
  lastName: z.string(),
  isPrimary: z.boolean(),
})

export const publicBookingOverviewDocumentSchema = z.object({
  id: z.string(),
  travelerId: z.string().nullable(),
  type: bookingDocumentTypeSchema,
  fileName: z.string(),
  fileUrl: z.string(),
})

export const publicBookingOverviewFulfillmentSchema = z.object({
  id: z.string(),
  bookingItemId: z.string().nullable(),
  travelerId: z.string().nullable(),
  fulfillmentType: bookingFulfillmentTypeSchema,
  deliveryChannel: bookingFulfillmentDeliveryChannelSchema,
  status: bookingFulfillmentStatusSchema,
  artifactUrl: z.string().nullable(),
})

export const publicBookingOverviewSchema = z.object({
  bookingId: z.string(),
  bookingNumber: z.string(),
  revision: z.number().int().positive(),
  status: bookingStatusSchema,
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  travelers: z.array(publicBookingOverviewTravelerSchema),
  items: z.array(publicBookingOverviewItemSchema),
  documents: z.array(publicBookingOverviewDocumentSchema),
  fulfillments: z.array(publicBookingOverviewFulfillmentSchema),
})

export const publicGuestBookingLookupResponseSchema = z.object({
  overview: publicBookingOverviewSchema,
  guestBookingAccess: publicGuestBookingAccessSchema,
})

export type PublicCreateBookingSessionInput = z.infer<typeof publicCreateBookingSessionSchema>
export type PublicUpdateBookingSessionInput = z.infer<typeof publicUpdateBookingSessionSchema>
export type PublicBookingSessionMutationInput = z.infer<typeof publicBookingSessionMutationSchema>
export type PublicCheckoutCapability = z.infer<typeof publicCheckoutCapabilitySchema>
export type PublicGuestBookingAccess = z.infer<typeof publicGuestBookingAccessSchema>
export type PublicBookingSessionState = z.infer<typeof publicBookingSessionStateSchema>
export type PublicUpsertBookingSessionStateInput = z.infer<
  typeof publicUpsertBookingSessionStateSchema
>
export type PublicBookingSessionRepriceInput = z.infer<typeof publicRepriceBookingSessionSchema>
export type PublicBookingOverviewLookupQuery = z.infer<
  typeof publicBookingOverviewLookupQuerySchema
>
export type PublicBookingOverviewAccessQuery = z.infer<
  typeof publicBookingOverviewAccessQuerySchema
>
export type PublicGuestBookingLookupInput = z.infer<typeof publicGuestBookingLookupSchema>
export type PublicGuestBookingLookupResponse = z.infer<
  typeof publicGuestBookingLookupResponseSchema
>
export type InternalBookingOverviewLookupQuery = z.infer<
  typeof internalBookingOverviewLookupQuerySchema
>
export type PublicBookingOverviewItem = z.infer<typeof publicBookingOverviewItemSchema>
export type PublicBookingOverview = z.infer<typeof publicBookingOverviewSchema>
