import type { Module } from "@voyant-travel/core"

export const commerceModule: Module = {
  name: "commerce",
}

export {
  CommercialDecisionError,
  createCommerceAdapterRegistry,
  createCommercialDecisionEvaluator,
  evaluateCommercialDecision,
  recordCommercialSnapshot,
} from "./interface.js"
export * from "./markets/index.js"
export * from "./pricing/index.js"
export {
  createProductPricingProjectionExtension,
  loadProductPriceFrom,
} from "./pricing/service-catalog-plane-pricing.js"
export * from "./promotions/index.js"
export { recordPromotionRedemptionsForBooking } from "./promotions/service-booking-confirmed.js"
export {
  type BoundarySchedulerResult,
  runPromotionBoundaryScheduler,
} from "./promotions/service-boundary-scheduler.js"
export { createCatalogPromotionEvaluator } from "./promotions/service-catalog-evaluator.js"
export { createProductPromotionsProjectionExtension } from "./promotions/service-catalog-plane-promotions.js"
export {
  type CommerceApiModulesOptions,
  type CommerceRuntimeModuleName,
  commerceRuntimeModuleNames,
  createCommerceApiModules,
  createCommercePublicApiOfferResolvers,
} from "./runtime.js"
export * from "./sellability/index.js"
export type {
  CommercialAdapterHandle,
  CommercialAdapterRegistrationKind,
  CommercialAvailabilityFact,
  CommercialBuyerRef,
  CommercialChannelRef,
  CommercialCurrencyCode,
  CommercialDecision,
  CommercialDecisionErrorCode,
  CommercialDecisionEvaluationContext,
  CommercialDecisionEvaluator,
  CommercialDecisionInput,
  CommercialDecisionReason,
  CommercialDecisionStatus,
  CommercialDecisionTrace,
  CommercialDecisionTraceOutcome,
  CommercialDecisionTraceSource,
  CommercialFxFact,
  CommercialItemRef,
  CommercialJson,
  CommercialMarketRef,
  CommercialMoney,
  CommercialParty,
  CommercialPriceAvailabilityAdapter,
  CommercialPriceAvailabilityResult,
  CommercialPricingComponent,
  CommercialPricingFacts,
  CommercialPromotionFact,
  CommercialPromotionFacts,
  CommercialProviderHandle,
  CommercialSellabilityFact,
  CommercialSnapshotRecord,
  CommercialSnapshotRepository,
  CommercialSnapshotTarget,
  CommercialSnapshotWriteInput,
  EvaluateCommercialDecision,
} from "./types.js"
