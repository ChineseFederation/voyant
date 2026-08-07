import { z } from "zod"

export const pricingCategoryTypeSchema = z.enum([
  "adult",
  "child",
  "infant",
  "senior",
  "group",
  "room",
  "vehicle",
  "service",
  "other",
])

export const pricingDependencyTypeSchema = z.enum([
  "requires",
  "limits_per_master",
  "limits_sum",
  "excludes",
])

export const cancellationPolicyTypeSchema = z.enum([
  "simple",
  "advanced",
  "non_refundable",
  "custom",
])

export const cancellationChargeTypeSchema = z.enum(["none", "amount", "percentage"])
export const priceCatalogTypeSchema = z.enum([
  "public",
  "contract",
  "net",
  "gross",
  "promo",
  "internal",
  "other",
])
export const optionPricingModeSchema = z.enum([
  "per_person",
  "per_booking",
  "starting_from",
  "free",
  "on_request",
])
export const optionUnitPricingModeSchema = z.enum([
  "per_unit",
  "per_person",
  "per_booking",
  "included",
  "free",
  "on_request",
])
export { occupancyPriceBasisSchema } from "@voyant-travel/products-contracts/occupancy-pricing"
export const optionStartTimeRuleModeSchema = z.enum([
  "included",
  "excluded",
  "override",
  "adjustment",
])
export const priceAdjustmentTypeSchema = z.enum(["fixed", "percentage"])
export const addonPricingModeSchema = z.enum([
  "included",
  "per_person",
  "per_booking",
  "on_request",
  "unavailable",
])
