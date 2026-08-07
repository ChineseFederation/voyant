import {
  optionUnitTypeSchema,
  productBookingModeSchema,
  productCapacityModeSchema,
  productOptionStatusSchema,
} from "@voyant-travel/products-contracts/validation"
import { z } from "zod"

import {
  occupancyPriceBasisSchema,
  optionPricingModeSchema,
  optionStartTimeRuleModeSchema,
  optionUnitPricingModeSchema,
  priceAdjustmentTypeSchema,
} from "./validation-shared.js"

const isoDateSchema = z.string().date()

const publicAvailabilitySlotStatusSchema = z.enum(["open", "closed", "sold_out", "cancelled"])

export const publicProductPricingQuerySchema = z.object({
  catalogId: z.string().optional(),
  optionId: z.string().optional(),
  date: isoDateSchema.optional(),
  departureId: z.string().optional(),
})

export const publicAvailabilitySnapshotQuerySchema = z.object({
  optionId: z.string().optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  status: publicAvailabilitySlotStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})

const publicPriceCatalogSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  currencyCode: z.string().nullable(),
})

const publicPricingTierSchema = z.object({
  id: z.string(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  sortOrder: z.number().int(),
})

const publicOptionUnitPriceSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  unitName: z.string(),
  unitType: optionUnitTypeSchema,
  pricingMode: optionUnitPricingModeSchema,
  sellAmountCents: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  pricingCategoryId: z.string().nullable(),
  sortOrder: z.number().int(),
  tiers: z.array(publicPricingTierSchema),
})

const publicStartTimeAdjustmentSchema = z.object({
  id: z.string(),
  startTimeId: z.string(),
  label: z.string().nullable(),
  startTimeLocal: z.string(),
  ruleMode: optionStartTimeRuleModeSchema,
  adjustmentType: priceAdjustmentTypeSchema.nullable(),
  sellAdjustmentCents: z.number().int().nullable(),
  adjustmentBasisPoints: z.number().int().nullable(),
})

const publicOptionPricingRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  pricingMode: optionPricingModeSchema,
  occupancyPriceBasis: occupancyPriceBasisSchema.nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  minPerBooking: z.number().int().nullable(),
  maxPerBooking: z.number().int().nullable(),
  isDefault: z.boolean(),
  cancellationPolicyId: z.string().nullable(),
  unitPrices: z.array(publicOptionUnitPriceSchema),
  startTimeAdjustments: z.array(publicStartTimeAdjustmentSchema),
})

const publicPricedOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: productOptionStatusSchema,
  isDefault: z.boolean(),
  bookingMode: productBookingModeSchema,
  capacityMode: productCapacityModeSchema,
  pricingRules: z.array(publicOptionPricingRuleSchema),
})

export const publicProductPricingSnapshotSchema = z.object({
  productId: z.string(),
  catalog: publicPriceCatalogSchema,
  options: z.array(publicPricedOptionSchema),
})

export type PublicProductPricingQuery = z.infer<typeof publicProductPricingQuerySchema>
export type PublicAvailabilitySnapshotQuery = z.infer<typeof publicAvailabilitySnapshotQuerySchema>
