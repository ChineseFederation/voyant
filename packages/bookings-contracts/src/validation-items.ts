import { z } from "zod"

import {
  bookingAllocationStatusSchema,
  bookingAllocationTypeSchema,
  bookingDocumentTypeSchema,
  bookingFulfillmentDeliveryChannelSchema,
  bookingFulfillmentStatusSchema,
  bookingFulfillmentTypeSchema,
  bookingItemParticipantRoleSchema,
  bookingItemTypeSchema,
  bookingRedemptionMethodSchema,
  supplierConfirmationStatusSchema,
} from "./validation-shared.js"

// ---------- booking items ----------

const bookingItemCoreShape = {
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  itemType: bookingItemTypeSchema.default("unit"),
  serviceDate: z.string().optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  quantity: z.number().int().positive().default(1),
  sellCurrency: z.string().min(3).max(3),
  unitSellAmountCents: z.number().int().optional().nullable(),
  totalSellAmountCents: z.number().int().optional().nullable(),
  costCurrency: z.string().min(3).max(3).optional().nullable(),
  unitCostAmountCents: z.number().int().optional().nullable(),
  totalCostAmountCents: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  optionId: z.string().optional().nullable(),
  optionUnitId: z.string().optional().nullable(),
  pricingCategoryId: z.string().optional().nullable(),
  availabilitySlotId: z.string().optional().nullable(),
  // Catalog-snapshot overrides for catalog-less deployments (OTA case)
  // or when the caller wants to write a specific historical label. If
  // omitted, the service looks the values up from the catalog refs
  // using the foreign IDs.
  productNameSnapshot: z.string().optional().nullable(),
  optionNameSnapshot: z.string().optional().nullable(),
  unitNameSnapshot: z.string().optional().nullable(),
  departureLabelSnapshot: z.string().optional().nullable(),
  sourceSnapshotId: z.string().optional().nullable(),
  sourceOfferId: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}

function hasCostAmount(value: {
  unitCostAmountCents?: number | null
  totalCostAmountCents?: number | null
}) {
  return value.unitCostAmountCents != null || value.totalCostAmountCents != null
}

const bookingItemCoreObjectSchema = z.object(bookingItemCoreShape).strict()
type BookingItemCoreInput = z.input<typeof bookingItemCoreObjectSchema>

const bookingItemCoreSchema = bookingItemCoreObjectSchema.refine(
  (value) => !hasCostAmount(value) || Boolean(value.costCurrency),
  {
    message: "Cost currency is required when cost amounts are provided",
    path: ["costCurrency"],
  },
)

export const insertBookingItemSchema = bookingItemCoreSchema
export const updateBookingItemSchema = bookingItemCoreObjectSchema
  .partial()
  .extend({
    itemType: bookingItemTypeSchema.optional(),
    quantity: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => !hasCostAmount(value) || Boolean(value.costCurrency), {
    message: "Cost currency is required when cost amounts are provided",
    path: ["costCurrency"],
  }) as z.ZodType<Partial<BookingItemCoreInput>>

export const insertBookingAllocationSchema = z.object({
  bookingItemId: z.string().min(1),
  productId: z.string().optional().nullable(),
  optionId: z.string().optional().nullable(),
  optionUnitId: z.string().optional().nullable(),
  pricingCategoryId: z.string().optional().nullable(),
  availabilitySlotId: z.string().optional().nullable(),
  quantity: z.number().int().positive().default(1),
  allocationType: bookingAllocationTypeSchema.default("unit"),
  status: bookingAllocationStatusSchema.default("held"),
  holdExpiresAt: z.string().datetime().optional().nullable(),
  confirmedAt: z.string().datetime().optional().nullable(),
  releasedAt: z.string().datetime().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
})

export const updateBookingAllocationSchema = insertBookingAllocationSchema.partial().extend({
  quantity: z.number().int().positive().optional(),
  allocationType: bookingAllocationTypeSchema.optional(),
  status: bookingAllocationStatusSchema.optional(),
})

// ---------- booking fulfillments ----------

const bookingFulfillmentInputSchema = z.object({
  bookingItemId: z.string().optional().nullable(),
  travelerId: z.string().optional().nullable(),
  fulfillmentType: bookingFulfillmentTypeSchema,
  deliveryChannel: bookingFulfillmentDeliveryChannelSchema,
  status: bookingFulfillmentStatusSchema.default("issued"),
  artifactUrl: z.string().url().optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
  issuedAt: z.string().datetime().optional().nullable(),
  revokedAt: z.string().datetime().optional().nullable(),
})

export const insertBookingFulfillmentSchema = bookingFulfillmentInputSchema.transform(
  ({ travelerId, ...rest }) => ({
    ...rest,
    travelerId: travelerId ?? null,
  }),
)

export const updateBookingFulfillmentSchema = bookingFulfillmentInputSchema
  .partial()
  .extend({
    status: bookingFulfillmentStatusSchema.optional(),
  })
  .transform(({ travelerId, ...rest }) => ({
    ...rest,
    travelerId: travelerId !== undefined ? (travelerId ?? null) : undefined,
  }))

// ---------- booking redemption events ----------

export const recordBookingRedemptionSchema = z
  .object({
    bookingItemId: z.string().optional().nullable(),
    travelerId: z.string().optional().nullable(),
    redeemedAt: z.string().datetime().optional().nullable(),
    redeemedBy: z.string().max(255).optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    method: bookingRedemptionMethodSchema.default("manual"),
    metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .transform(({ travelerId, ...rest }) => ({
    ...rest,
    travelerId: travelerId ?? null,
  }))

// ---------- booking item participants ----------

export const insertBookingItemTravelerSchema = z
  .object({
    travelerId: z.string().min(1).optional(),
    role: bookingItemParticipantRoleSchema.default("traveler"),
    isPrimary: z.boolean().default(false),
  })
  .refine((value) => Boolean(value.travelerId), {
    message: "travelerId is required",
    path: ["travelerId"],
  })
  .transform(({ travelerId, ...rest }) => ({
    ...rest,
    travelerId: travelerId!,
  }))

export const insertBookingItemParticipantSchema = insertBookingItemTravelerSchema

// ---------- supplier statuses ----------

const supplierStatusCoreSchema = z.object({
  supplierServiceId: z.string().optional().nullable(),
  serviceName: z.string().min(1).max(255),
  status: supplierConfirmationStatusSchema.default("pending"),
  supplierReference: z.string().max(255).optional().nullable(),
  costCurrency: z.string().min(3).max(3),
  costAmountCents: z.number().int().min(0),
  notes: z.string().optional().nullable(),
})

export const insertSupplierStatusSchema = supplierStatusCoreSchema
export const updateSupplierStatusSchema = supplierStatusCoreSchema.partial().extend({
  status: supplierConfirmationStatusSchema.optional(),
  confirmedAt: z.string().optional().nullable(),
})

// ---------- notes ----------

export const insertBookingNoteSchema = z.object({
  content: z.string().min(1).max(10000),
})

export const updateBookingNoteSchema = z.object({
  content: z.string().min(1).max(10000),
})

// ---------- documents ----------

export const insertBookingDocumentSchema = z
  .object({
    travelerId: z.string().optional().nullable(),
    type: bookingDocumentTypeSchema,
    fileName: z.string().min(1).max(500),
    fileUrl: z.string().url(),
    expiresAt: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .transform(({ travelerId, ...rest }) => ({
    ...rest,
    travelerId: travelerId ?? null,
  }))

export const insertBookingTravelerDocumentSchema = insertBookingDocumentSchema
