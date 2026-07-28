import { bookingCustomerPaymentPolicySchema } from "@voyant-travel/bookings-contracts/validation"
import { z } from "zod"

import { bookingSourceTypeSchema, bookingStatusSchema } from "./validation.js"

const isoTimestamp = z.string()
const jsonObject = z.record(z.string(), z.unknown())
const namespacedCustomFields = z.record(z.string(), jsonObject)

/** Booking wire shape exposed by the non-PII Tool surface. Sensitive contact fields are redacted. */
export const bookingToolSchema = z.object({
  id: z.string(),
  bookingNumber: z.string(),
  status: bookingStatusSchema,
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  sourceType: bookingSourceTypeSchema,
  externalBookingRef: z.string().nullable(),
  communicationLanguage: z.string().nullable(),
  contactFirstName: z.string().nullable(),
  contactLastName: z.string().nullable(),
  contactPartyType: z.string().nullable(),
  contactTaxId: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactPreferredLanguage: z.string().nullable(),
  contactCountry: z.string().nullable(),
  contactRegion: z.string().nullable(),
  contactCity: z.string().nullable(),
  contactAddressLine1: z.string().nullable(),
  contactAddressLine2: z.string().nullable(),
  contactPostalCode: z.string().nullable(),
  sellCurrency: z.string(),
  baseCurrency: z.string().nullable(),
  fxRateSetId: z.string().nullable(),
  sellAmountCents: z.number().int().nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  baseCostAmountCents: z.number().int().nullable(),
  marginPercent: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  internalNotes: z.string().nullable(),
  notificationsSuppressed: z.boolean(),
  customerPaymentPolicy: bookingCustomerPaymentPolicySchema.nullable(),
  priceOverride: jsonObject.nullable(),
  customFields: namespacedCustomFields,
  holdExpiresAt: isoTimestamp.nullable(),
  confirmedAt: isoTimestamp.nullable(),
  expiredAt: isoTimestamp.nullable(),
  cancelledAt: isoTimestamp.nullable(),
  completedAt: isoTimestamp.nullable(),
  awaitingPaymentAt: isoTimestamp.nullable(),
  paidAt: isoTimestamp.nullable(),
  redeemedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

export const bookingToolItemSchema = z
  .object({
    id: z.string(),
    bookingId: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    itemType: z.string(),
    status: z.string(),
    serviceDate: z.string().nullable(),
    startsAt: isoTimestamp.nullable(),
    endsAt: isoTimestamp.nullable(),
    quantity: z.number().int(),
    sellCurrency: z.string(),
    unitSellAmountCents: z.number().int().nullable(),
    totalSellAmountCents: z.number().int().nullable(),
    productId: z.string().nullable(),
    optionId: z.string().nullable(),
    optionUnitId: z.string().nullable(),
    availabilitySlotId: z.string().nullable(),
    productNameSnapshot: z.string().nullable(),
    optionNameSnapshot: z.string().nullable(),
    unitNameSnapshot: z.string().nullable(),
    departureLabelSnapshot: z.string().nullable(),
    metadata: jsonObject.nullable(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .passthrough()

export const bookingToolTravelerSchema = z
  .object({
    id: z.string(),
    bookingId: z.string(),
    participantType: z.string(),
    travelerCategory: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    isPrimary: z.boolean(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .passthrough()

/** Immediately useful booking read returned by create/get/lifecycle Tools. */
export const bookingToolDetailSchema = bookingToolSchema.extend({
  items: z.array(bookingToolItemSchema),
  travelers: z.array(bookingToolTravelerSchema),
})
