import { booleanQueryParam } from "@voyant-travel/db/helpers"
import { z } from "zod"

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const moneySchema = z.number().int().min(0).nullable().optional()

export const extraSelectionTypeSchema = z.enum([
  "optional",
  "required",
  "default_selected",
  "unavailable",
])

export const extraPricingModeSchema = z.enum([
  "included",
  "per_person",
  "per_booking",
  "quantity_based",
  "on_request",
  "free",
])

export const bookingExtraStatusSchema = z.enum([
  "draft",
  "selected",
  "confirmed",
  "cancelled",
  "fulfilled",
])

export const extraCollectionModeSchema = z.enum([
  "booking_total",
  "cash_on_trip",
  "external",
  "included",
  "none",
])

export const extraParticipantSelectionStatusSchema = z.enum([
  "selected",
  "cancelled",
  "fulfilled",
  "no_show",
])

export const extraCollectionStatusSchema = z.enum([
  "not_required",
  "pending",
  "collected",
  "waived",
  "refunded",
])

export const bookingExtraCoreSchema = z.object({
  bookingId: z.string(),
  productExtraId: z.string().nullable().optional(),
  optionExtraConfigId: z.string().nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  status: bookingExtraStatusSchema.default("draft"),
  pricingMode: extraPricingModeSchema.default("per_booking"),
  pricedPerPerson: z.boolean().default(false),
  quantity: z.number().int().min(1).default(1),
  sellCurrency: z.string().length(3),
  unitSellAmountCents: moneySchema,
  totalSellAmountCents: moneySchema,
  costCurrency: z.string().length(3).nullable().optional(),
  unitCostAmountCents: moneySchema,
  totalCostAmountCents: moneySchema,
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const insertBookingExtraSchema = bookingExtraCoreSchema
export const updateBookingExtraSchema = bookingExtraCoreSchema.partial()
export const bookingExtraListQuerySchema = paginationSchema.extend({
  bookingId: z.string().optional(),
  productExtraId: z.string().optional(),
  optionExtraConfigId: z.string().optional(),
  status: bookingExtraStatusSchema.optional(),
})

/**
 * `limit`/`offset` page the **traveler** axis of the matrix only. The extras
 * axis and every rollup in `summaries` stay whole-departure, so paging can
 * never change a headline count. Omitting `limit` returns every traveler,
 * which is the pre-pagination behaviour.
 */
export const slotExtraManifestQuerySchema = z.object({
  includeInactiveExtras: booleanQueryParam.default(false),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).default(0),
})

export const slotExtraSelectionPatchSchema = z.object({
  bookingId: z.string().min(1),
  travelerId: z.string().min(1),
  productExtraId: z.string().min(1),
  optionExtraConfigId: z.string().nullable().optional(),
  status: extraParticipantSelectionStatusSchema.default("selected"),
  collectionStatus: extraCollectionStatusSchema.optional(),
  collectionCurrency: z.string().length(3).nullable().optional(),
  collectionAmountCents: moneySchema,
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export const slotExtraSelectionBulkSchema = z.object({
  selections: z.array(slotExtraSelectionPatchSchema).min(1).max(500),
})

export const slotExtraCollectionBulkSchema = z.object({
  productExtraId: z.string().min(1),
  travelerIds: z.array(z.string().min(1)).min(1).max(500),
  collectionStatus: extraCollectionStatusSchema,
  collectionCurrency: z.string().length(3).nullable().optional(),
  collectionAmountCents: moneySchema,
  notes: z.string().nullable().optional(),
})
