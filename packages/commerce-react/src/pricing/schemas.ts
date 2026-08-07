import { listResponseSchema } from "@voyant-travel/types"
import { z } from "zod"

export const paginatedEnvelope = listResponseSchema

export const singleEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: item })

export const successEnvelope = z.object({ success: z.boolean() })

export const pricingCategoryRecordSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  optionId: z.string().nullable(),
  unitId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  categoryType: z.enum([
    "adult",
    "child",
    "infant",
    "senior",
    "group",
    "room",
    "vehicle",
    "service",
    "other",
  ]),
  seatOccupancy: z.number().int(),
  groupSize: z.number().int().nullable(),
  isAgeQualified: z.boolean(),
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),
  internalUseOnly: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PricingCategoryRecord = z.infer<typeof pricingCategoryRecordSchema>

export const pricingCategoryDependencyRecordSchema = z.object({
  id: z.string(),
  pricingCategoryId: z.string(),
  masterPricingCategoryId: z.string(),
  dependencyType: z.enum(["requires", "limits_per_master", "limits_sum", "excludes"]),
  maxPerMaster: z.number().int().nullable(),
  maxDependentSum: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type PricingCategoryDependencyRecord = z.infer<typeof pricingCategoryDependencyRecordSchema>

export const priceCatalogRecordSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  currencyCode: z.string().nullable(),
  catalogType: z.enum(["public", "contract", "net", "gross", "promo", "internal", "other"]),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type PriceCatalogRecord = z.infer<typeof priceCatalogRecordSchema>

export const priceScheduleRecordSchema = z.object({
  id: z.string(),
  priceCatalogId: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  recurrenceRule: z.string(),
  timezone: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  weekdays: z.array(z.string()).nullable(),
  priority: z.number().int(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type PriceScheduleRecord = z.infer<typeof priceScheduleRecordSchema>

export const cancellationPolicyRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  policyType: z.enum(["simple", "advanced", "non_refundable", "custom"]),
  simpleCutoffHours: z.number().int().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type CancellationPolicyRecord = z.infer<typeof cancellationPolicyRecordSchema>

export const cancellationPolicyRuleRecordSchema = z.object({
  id: z.string(),
  cancellationPolicyId: z.string(),
  sortOrder: z.number().int(),
  cutoffMinutesBefore: z.number().int().nullable(),
  chargeType: z.enum(["none", "amount", "percentage"]),
  chargeAmountCents: z.number().int().nullable(),
  chargePercentBasisPoints: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type CancellationPolicyRuleRecord = z.infer<typeof cancellationPolicyRuleRecordSchema>

export const optionPriceRuleRecordSchema = z.object({
  id: z.string(),
  productId: z.string(),
  optionId: z.string(),
  priceCatalogId: z.string(),
  priceScheduleId: z.string().nullable(),
  cancellationPolicyId: z.string().nullable(),
  code: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  pricingMode: z.enum(["per_person", "per_booking", "starting_from", "free", "on_request"]),
  occupancyPriceBasis: z.enum(["supplement", "all_in"]).nullable(),
  baseSellAmountCents: z.number().int().nullable(),
  baseCostAmountCents: z.number().int().nullable(),
  minPerBooking: z.number().int().nullable(),
  maxPerBooking: z.number().int().nullable(),
  allPricingCategories: z.boolean(),
  isDefault: z.boolean(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type OptionPriceRuleRecord = z.infer<typeof optionPriceRuleRecordSchema>

export const optionUnitPriceRuleRecordSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  unitId: z.string(),
  pricingCategoryId: z.string().nullable(),
  pricingMode: z.enum(["per_unit", "per_person", "per_booking", "included", "free", "on_request"]),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  minQuantity: z.number().int().nullable(),
  maxQuantity: z.number().int().nullable(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type OptionUnitPriceRuleRecord = z.infer<typeof optionUnitPriceRuleRecordSchema>

export const optionUnitTierRecordSchema = z.object({
  id: z.string(),
  optionUnitPriceRuleId: z.string(),
  minQuantity: z.number().int(),
  maxQuantity: z.number().int().nullable(),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
})

export type OptionUnitTierRecord = z.infer<typeof optionUnitTierRecordSchema>

export const pickupPriceRuleRecordSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  pickupPointId: z.string(),
  pricingMode: z.enum(["included", "per_person", "per_booking", "on_request", "unavailable"]),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
})

export type PickupPriceRuleRecord = z.infer<typeof pickupPriceRuleRecordSchema>

export const dropoffPriceRuleRecordSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  facilityId: z.string().nullable(),
  dropoffCode: z.string().nullable(),
  dropoffName: z.string(),
  pricingMode: z.enum(["included", "per_person", "per_booking", "on_request", "unavailable"]),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
})

export type DropoffPriceRuleRecord = z.infer<typeof dropoffPriceRuleRecordSchema>

export const extraPriceRuleRecordSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  productExtraId: z.string().nullable(),
  optionExtraConfigId: z.string().nullable(),
  pricingMode: z.enum(["included", "per_person", "per_booking", "on_request", "unavailable"]),
  sellAmountCents: z.number().int().nullable(),
  costAmountCents: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
  notes: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type ExtraPriceRuleRecord = z.infer<typeof extraPriceRuleRecordSchema>

export const departurePriceOverrideRecordSchema = z.object({
  id: z.string(),
  departureId: z.string(),
  optionId: z.string(),
  optionUnitId: z.string(),
  priceCatalogId: z.string(),
  sellAmountCents: z.number().int(),
  costAmountCents: z.number().int().nullable(),
  notes: z.string().nullable(),
  active: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
})

export type DeparturePriceOverrideRecord = z.infer<typeof departurePriceOverrideRecordSchema>

export const optionStartTimeRuleRecordSchema = z.object({
  id: z.string(),
  optionPriceRuleId: z.string(),
  optionId: z.string(),
  startTimeId: z.string(),
  ruleMode: z.enum(["included", "excluded", "override", "adjustment"]),
  adjustmentType: z.enum(["fixed", "percentage"]).nullable(),
  sellAdjustmentCents: z.number().int().nullable(),
  costAdjustmentCents: z.number().int().nullable(),
  adjustmentBasisPoints: z.number().int().nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
})

export type OptionStartTimeRuleRecord = z.infer<typeof optionStartTimeRuleRecordSchema>

export const pricingCategoryListResponse = paginatedEnvelope(pricingCategoryRecordSchema)
export const pricingCategorySingleResponse = singleEnvelope(pricingCategoryRecordSchema)
export const pricingCategoryDependencyListResponse = paginatedEnvelope(
  pricingCategoryDependencyRecordSchema,
)
export const pricingCategoryDependencySingleResponse = singleEnvelope(
  pricingCategoryDependencyRecordSchema,
)
export const priceCatalogListResponse = paginatedEnvelope(priceCatalogRecordSchema)
export const priceCatalogSingleResponse = singleEnvelope(priceCatalogRecordSchema)
export const priceScheduleListResponse = paginatedEnvelope(priceScheduleRecordSchema)
export const priceScheduleSingleResponse = singleEnvelope(priceScheduleRecordSchema)
export const cancellationPolicyListResponse = paginatedEnvelope(cancellationPolicyRecordSchema)
export const cancellationPolicySingleResponse = singleEnvelope(cancellationPolicyRecordSchema)
export const cancellationPolicyRuleListResponse = paginatedEnvelope(
  cancellationPolicyRuleRecordSchema,
)
export const cancellationPolicyRuleSingleResponse = singleEnvelope(
  cancellationPolicyRuleRecordSchema,
)
export const optionPriceRuleListResponse = paginatedEnvelope(optionPriceRuleRecordSchema)
export const optionPriceRuleSingleResponse = singleEnvelope(optionPriceRuleRecordSchema)
export const optionUnitPriceRuleListResponse = paginatedEnvelope(optionUnitPriceRuleRecordSchema)
export const optionUnitPriceRuleSingleResponse = singleEnvelope(optionUnitPriceRuleRecordSchema)
export const optionUnitTierListResponse = paginatedEnvelope(optionUnitTierRecordSchema)
export const optionUnitTierSingleResponse = singleEnvelope(optionUnitTierRecordSchema)
export const pickupPriceRuleListResponse = paginatedEnvelope(pickupPriceRuleRecordSchema)
export const pickupPriceRuleSingleResponse = singleEnvelope(pickupPriceRuleRecordSchema)
export const dropoffPriceRuleListResponse = paginatedEnvelope(dropoffPriceRuleRecordSchema)
export const dropoffPriceRuleSingleResponse = singleEnvelope(dropoffPriceRuleRecordSchema)
export const extraPriceRuleListResponse = paginatedEnvelope(extraPriceRuleRecordSchema)
export const extraPriceRuleSingleResponse = singleEnvelope(extraPriceRuleRecordSchema)
export const departurePriceOverrideListResponse = paginatedEnvelope(
  departurePriceOverrideRecordSchema,
)
export const departurePriceOverrideSingleResponse = singleEnvelope(
  departurePriceOverrideRecordSchema,
)
export const optionStartTimeRuleListResponse = paginatedEnvelope(optionStartTimeRuleRecordSchema)
export const optionStartTimeRuleSingleResponse = singleEnvelope(optionStartTimeRuleRecordSchema)
