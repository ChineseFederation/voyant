import type { Module } from "@voyant-travel/core"
import type { ApiModule } from "@voyant-travel/hono/module"

export {
  AMBIGUOUS_OCCUPANCY_PRICE_DIAGNOSTIC,
  classifyOccupancyPrice,
  OCCUPANCY_PRICING_SEMANTICS_VERSION,
  type OccupancyPriceBasis,
  resolveOccupancyPrice,
} from "@voyant-travel/products-contracts/occupancy-pricing"

import { pricingRoutes } from "./routes.js"
import { publicPricingRoutes } from "./routes-public.js"
import { pricingService } from "./service.js"

export type { PricingRoutes } from "./routes.js"
export type { PublicPricingRoutes } from "./routes-public.js"
export { publicPricingRoutes } from "./routes-public.js"
export { publicPricingService } from "./service-public.js"

export const pricingModule: Module = {
  name: "pricing",
}

export const pricingApiModule: ApiModule = {
  module: pricingModule,
  adminRoutes: pricingRoutes,
  publicRoutes: publicPricingRoutes,
}

export type {
  CancellationPolicy,
  CancellationPolicyRule,
  DeparturePriceOverride,
  DropoffPriceRule,
  ExtraPriceRule,
  NewCancellationPolicy,
  NewCancellationPolicyRule,
  NewDeparturePriceOverride,
  NewDropoffPriceRule,
  NewExtraPriceRule,
  NewOptionPriceRule,
  NewOptionStartTimeRule,
  NewOptionUnitPriceRule,
  NewOptionUnitTier,
  NewPickupPriceRule,
  NewPriceCatalog,
  NewPriceSchedule,
  NewPricingCategory,
  NewPricingCategoryDependency,
  OptionPriceRule,
  OptionStartTimeRule,
  OptionUnitPriceRule,
  OptionUnitTier,
  PickupPriceRule,
  PriceCatalog,
  PriceSchedule,
  PricingCategory,
  PricingCategoryDependency,
} from "./schema.js"
export {
  addonPricingModeEnum,
  cancellationChargeTypeEnum,
  cancellationPolicies,
  cancellationPolicyRules,
  cancellationPolicyTypeEnum,
  departurePriceOverrides,
  dropoffPriceRules,
  extraPriceRules,
  occupancyPriceBasisEnum,
  optionPriceRules,
  optionPricingModeEnum,
  optionStartTimeRuleModeEnum,
  optionStartTimeRules,
  optionUnitPriceRules,
  optionUnitPricingModeEnum,
  optionUnitTiers,
  pickupPriceRules,
  priceAdjustmentTypeEnum,
  priceCatalogs,
  priceCatalogTypeEnum,
  priceSchedules,
  pricingCategories,
  pricingCategoryDependencies,
  pricingCategoryTypeEnum,
  pricingDependencyTypeEnum,
} from "./schema.js"
export {
  loadDeparturePriceOverrides,
  pickRulesForDate,
  type ResolverRuleInput,
  type ResolverScheduleInput,
  resolveOptionPriceRulesForDate,
  type UnitPriceOverride,
} from "./service-rule-resolver.js"
export {
  addonPricingModeSchema,
  cancellationChargeTypeSchema,
  cancellationPolicyListQuerySchema,
  cancellationPolicyRuleListQuerySchema,
  cancellationPolicyTypeSchema,
  departurePriceOverrideListQuerySchema,
  dropoffPriceRuleListQuerySchema,
  extraPriceRuleListQuerySchema,
  insertCancellationPolicyRuleSchema,
  insertCancellationPolicySchema,
  insertDeparturePriceOverrideSchema,
  insertDropoffPriceRuleSchema,
  insertExtraPriceRuleSchema,
  insertOptionPriceRuleSchema,
  insertOptionStartTimeRuleSchema,
  insertOptionUnitPriceRuleSchema,
  insertOptionUnitTierSchema,
  insertPickupPriceRuleSchema,
  insertPriceCatalogSchema,
  insertPriceScheduleSchema,
  insertPricingCategoryDependencySchema,
  insertPricingCategorySchema,
  occupancyPriceBasisSchema,
  optionPriceRuleListQuerySchema,
  optionPricingModeSchema,
  optionStartTimeRuleListQuerySchema,
  optionStartTimeRuleModeSchema,
  optionUnitPriceRuleListQuerySchema,
  optionUnitPricingModeSchema,
  optionUnitTierListQuerySchema,
  pickupPriceRuleListQuerySchema,
  priceAdjustmentTypeSchema,
  priceCatalogListQuerySchema,
  priceCatalogTypeSchema,
  priceScheduleListQuerySchema,
  pricingCategoryDependencyListQuerySchema,
  pricingCategoryListQuerySchema,
  pricingCategoryTypeSchema,
  pricingDependencyTypeSchema,
  updateCancellationPolicyRuleSchema,
  updateCancellationPolicySchema,
  updateDeparturePriceOverrideSchema,
  updateDropoffPriceRuleSchema,
  updateExtraPriceRuleSchema,
  updateOptionPriceRuleSchema,
  updateOptionStartTimeRuleSchema,
  updateOptionUnitPriceRuleSchema,
  updateOptionUnitTierSchema,
  updatePickupPriceRuleSchema,
  updatePriceCatalogSchema,
  updatePriceScheduleSchema,
  updatePricingCategoryDependencySchema,
  updatePricingCategorySchema,
} from "./validation.js"
export { pricingService }
