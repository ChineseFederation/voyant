import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })
export const successEnvelope = z.object({ success: z.boolean() })

export const productExtraRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  selectionType: z.enum(["optional", "required", "default_selected", "unavailable"]),
  pricingMode: z.enum([
    "included",
    "per_person",
    "per_booking",
    "quantity_based",
    "on_request",
    "free",
  ]),
  pricedPerPerson: z.boolean(),
  collectionMode: z.enum(["booking_total", "cash_on_trip", "external", "included", "none"]),
  showOnSlotManifest: z.boolean(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  defaultQuantity: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ProductExtraRecord = z.infer<typeof productExtraRecordSchema>

export const productExtraListResponse = paginatedEnvelope(productExtraRecordSchema)
export const productExtraSingleResponse = singleEnvelope(productExtraRecordSchema)

export const slotExtraManifestSlotSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string().nullable(),
  dateLocal: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  timezone: z.string(),
  status: z.string(),
})

export const slotExtraManifestTravelerSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  bookingNumber: z.string(),
  bookingStatus: z.string(),
  participantType: z.string(),
  travelerCategory: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.string(),
})

export const slotExtraManifestSelectionSchema = z.object({
  bookingId: z.string(),
  travelerId: z.string(),
  productExtraId: z.string(),
  optionExtraConfigId: z.string().nullable(),
  bookingItemId: z.string().nullable(),
  status: z.enum(["selected", "cancelled", "fulfilled", "no_show"]),
  selected: z.boolean(),
  collectionMode: z.enum(["booking_total", "cash_on_trip", "external", "included", "none"]),
  collectionStatus: z.enum(["not_required", "pending", "collected", "waived", "refunded"]),
  collectionCurrency: z.string().nullable(),
  collectionAmountCents: z.number().int().nullable(),
  collectedAt: z.string().nullable(),
  collectedBy: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  source: z.enum(["selection", "booking_item", "empty"]),
  quantity: z.number().int(),
})

/**
 * Departure-level rollup per Extra. Derived server-side from the selection
 * matrix so the operator sees one number per Extra instead of counting cells.
 */
export const slotExtraManifestSummarySchema = z.object({
  productExtraId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  supplierId: z.string().nullable(),
  selectionType: z.string(),
  pricingMode: z.string(),
  pricedPerPerson: z.boolean(),
  collectionMode: z.enum(["booking_total", "cash_on_trip", "external", "included", "none"]),
  eligibleTravelerCount: z.number().int(),
  selectedTravelerCount: z.number().int(),
  totalQuantity: z.number().int(),
  fulfilledTravelerCount: z.number().int(),
  cancelledTravelerCount: z.number().int(),
  noShowTravelerCount: z.number().int(),
  collection: z.object({
    notRequired: z.number().int(),
    pending: z.number().int(),
    collected: z.number().int(),
    waived: z.number().int(),
    refunded: z.number().int(),
  }),
  collectionCurrency: z.string().nullable(),
  collectionAmountCents: z.number().int().nullable(),
  outstandingCollectionCount: z.number().int(),
  fulfillmentComplete: z.boolean(),
})

export const slotExtraManifestSchema = z.object({
  slot: slotExtraManifestSlotSchema,
  extras: z.array(productExtraRecordSchema),
  travelers: z.array(slotExtraManifestTravelerSchema),
  selections: z.array(slotExtraManifestSelectionSchema),
  summaries: z.array(slotExtraManifestSummarySchema).default([]),
})

export const slotExtraManifestResponse = singleEnvelope(slotExtraManifestSchema)
export const slotExtraManifestMutationResponse = singleEnvelope(z.unknown())

export type SlotExtraManifest = z.infer<typeof slotExtraManifestSchema>
export type SlotExtraManifestTraveler = z.infer<typeof slotExtraManifestTravelerSchema>
export type SlotExtraManifestSelection = z.infer<typeof slotExtraManifestSelectionSchema>
export type SlotExtraManifestSummary = z.infer<typeof slotExtraManifestSummarySchema>
