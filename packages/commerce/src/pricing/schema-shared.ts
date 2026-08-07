import { pgEnum } from "drizzle-orm/pg-core"

export const pricingCategoryTypeEnum = pgEnum("pricing_category_type", [
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

export const pricingDependencyTypeEnum = pgEnum("pricing_dependency_type", [
  "requires",
  "limits_per_master",
  "limits_sum",
  "excludes",
])

export const cancellationPolicyTypeEnum = pgEnum("cancellation_policy_type", [
  "simple",
  "advanced",
  "non_refundable",
  "custom",
])

export const cancellationChargeTypeEnum = pgEnum("cancellation_charge_type", [
  "none",
  "amount",
  "percentage",
])

export const priceCatalogTypeEnum = pgEnum("price_catalog_type", [
  "public",
  "contract",
  "net",
  "gross",
  "promo",
  "internal",
  "other",
])

export const optionPricingModeEnum = pgEnum("option_pricing_mode", [
  "per_person",
  "per_booking",
  "starting_from",
  "free",
  "on_request",
])

export const optionUnitPricingModeEnum = pgEnum("option_unit_pricing_mode", [
  "per_unit",
  "per_person",
  "per_booking",
  "included",
  "free",
  "on_request",
])

export const occupancyPriceBasisEnum = pgEnum("occupancy_price_basis", ["supplement", "all_in"])

export const optionStartTimeRuleModeEnum = pgEnum("option_start_time_rule_mode", [
  "included",
  "excluded",
  "override",
  "adjustment",
])

export const priceAdjustmentTypeEnum = pgEnum("price_adjustment_type", ["fixed", "percentage"])

export const addonPricingModeEnum = pgEnum("addon_pricing_mode", [
  "included",
  "per_person",
  "per_booking",
  "on_request",
  "unavailable",
])
