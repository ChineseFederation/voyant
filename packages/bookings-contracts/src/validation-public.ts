import { z } from "zod"

import {
  bookingDocumentTypeSchema,
  bookingFulfillmentDeliveryChannelSchema,
  bookingFulfillmentStatusSchema,
  bookingFulfillmentTypeSchema,
  bookingItemParticipantRoleSchema,
  bookingItemStatusSchema,
  bookingItemTypeSchema,
  bookingStatusSchema,
} from "./validation-shared.js"

const publicBookingVisibleTravelerTypeSchema = z.enum(["traveler", "occupant", "other"])

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

export const publicBookingItemTravelerSchema = z.object({
  id: z.string(),
  travelerId: z.string(),
  role: bookingItemParticipantRoleSchema,
  isPrimary: z.boolean(),
})

export const publicBookingItemSchema = z.object({
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
  travelerLinks: z.array(publicBookingItemTravelerSchema),
})

/**
 * Overview items carry an optional vertical `details` block contributed by
 * a package's public-overview enricher (e.g. accommodations adds property /
 * room / rate-plan / nightly-rate specifics). Opaque here so the bookings
 * contract stays vertical-agnostic; each vertical documents its own shape.
 * See issue #2969.
 */
export const publicBookingOverviewItemSchema = publicBookingItemSchema.extend({
  details: z.unknown().optional(),
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

export type PublicGuestBookingAccess = z.infer<typeof publicGuestBookingAccessSchema>
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
