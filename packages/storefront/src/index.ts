import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"

import { createStorefrontAdminRoutes } from "./routes-admin.js"
import { createStorefrontPublicRoutes } from "./routes-public.js"
import { storefrontIntakeRuntimePort, storefrontOffersRuntimePort } from "./runtime-port.js"

export type {
  GuestBookingGuardOptions,
  GuestBookingGuardRequest,
  GuestBookingLookupInput,
} from "./guest-booking-guard.js"
export { createGuestBookingGuard } from "./guest-booking-guard.js"
export type {
  PaymentLinkBankTransferDetails,
  PaymentLinkRoutesOptions,
  PaymentLinkSessionInput,
  PaymentLinkTripComponent,
  PaymentLinkTripData,
} from "./payment-link/routes.js"
export {
  createPaymentLinkApiModule,
  createPaymentLinkRoutes,
  PAYMENT_LINK_ROUTE_PATHS,
} from "./payment-link/routes.js"
export type { StorefrontAdminRoutes } from "./routes-admin.js"
export { createStorefrontAdminRoutes } from "./routes-admin.js"
export type { StorefrontPublicRoutes } from "./routes-public.js"
export { createStorefrontPublicRoutes } from "./routes-public.js"
export type {
  StorefrontOfferResolvers,
  StorefrontRequestContext,
  StorefrontServiceOptions,
} from "./service.js"
export {
  createStorefrontService,
  mergeStorefrontSettingsPatch,
  resolveStorefrontSettings,
} from "./service.js"
export type {
  StorefrontCustomerSignalCreatedEvent,
  StorefrontIntakeGuard,
  StorefrontIntakeGuardDecision,
  StorefrontIntakeOptions,
  StorefrontIntakePersistence,
  StorefrontIntakePersistenceResolver,
  StorefrontIntakePerson,
  StorefrontIntakeSignal,
  StorefrontNewsletterDoubleOptInHook,
} from "./service-intake.js"
export { CUSTOMER_SIGNAL_CREATED_EVENT, emitCustomerSignalCreated } from "./service-intake.js"
export { evaluateStorefrontTransportEligibility } from "./service-transport-eligibility.js"
export type {
  StorefrontAppliedOffer,
  StorefrontBankTransfer,
  StorefrontBankTransferAccount,
  StorefrontBankTransferAccountInput,
  StorefrontBankTransferInput,
  StorefrontCurrencyDisplay,
  StorefrontDepartureListQuery,
  StorefrontDeparturePricePreview,
  StorefrontFormField,
  StorefrontFormFieldInput,
  StorefrontIntakeConsent,
  StorefrontIntakeResponse,
  StorefrontLeadContact,
  StorefrontLeadIntakeInput,
  StorefrontNewsletterSubscribeInput,
  StorefrontNewsletterSubscribeResponse,
  StorefrontOfferApplyInput,
  StorefrontOfferMutationResult,
  StorefrontOfferRedeemInput,
  StorefrontPaymentDueCondition,
  StorefrontPaymentMethod,
  StorefrontPaymentMethodCode,
  StorefrontPaymentMethodInput,
  StorefrontPaymentSchedule,
  StorefrontPaymentScheduleEntry,
  StorefrontPaymentScheduleEntryInput,
  StorefrontPaymentScheduleInput,
  StorefrontPaymentStructure,
  StorefrontProductAvailabilitySummaryQuery,
  StorefrontPromotionalOffer,
  StorefrontSettings,
  StorefrontSettingsInput,
  StorefrontSettingsPatchInput,
  StorefrontSupportLink,
  StorefrontSupportLinkInput,
} from "./validation.js"
export {
  storefrontAppliedOfferSchema,
  storefrontBankTransferAccountInputSchema,
  storefrontBankTransferAccountSchema,
  storefrontBankTransferInputSchema,
  storefrontBankTransferSchema,
  storefrontCurrencyDisplaySchema,
  storefrontDepartureItinerarySchema,
  storefrontDepartureListQuerySchema,
  storefrontDepartureListResponseSchema,
  storefrontDeparturePriceAllocationSchema,
  storefrontDeparturePriceExtraImpactSchema,
  storefrontDeparturePriceLineItemSchema,
  storefrontDeparturePriceOfferImpactSchema,
  storefrontDeparturePriceOffersSchema,
  storefrontDeparturePricePaxSchema,
  storefrontDeparturePricePreviewInputSchema,
  storefrontDeparturePricePreviewSchema,
  storefrontDeparturePriceRequestedOfferSchema,
  storefrontDeparturePriceRoomRowSchema,
  storefrontDeparturePriceSlotSchema,
  storefrontDeparturePriceTotalsSchema,
  storefrontDeparturePriceUnitRowSchema,
  storefrontDepartureSchema,
  storefrontFormFieldInputSchema,
  storefrontFormFieldOptionSchema,
  storefrontFormFieldSchema,
  storefrontFormFieldTypeSchema,
  storefrontIntakeConsentSchema,
  storefrontIntakeResponseSchema,
  storefrontLeadContactSchema,
  storefrontLeadIntakeInputSchema,
  storefrontNewsletterSubscribeInputSchema,
  storefrontNewsletterSubscribeResponseSchema,
  storefrontOfferApplyInputSchema,
  storefrontOfferAudienceSchema,
  storefrontOfferConflictSchema,
  storefrontOfferMutationReasonSchema,
  storefrontOfferMutationResponseSchema,
  storefrontOfferMutationResultSchema,
  storefrontOfferMutationStatusSchema,
  storefrontOfferRedeemInputSchema,
  storefrontPaymentDueConditionSchema,
  storefrontPaymentMethodCodeSchema,
  storefrontPaymentMethodInputSchema,
  storefrontPaymentMethodSchema,
  storefrontPaymentScheduleEntryInputSchema,
  storefrontPaymentScheduleEntrySchema,
  storefrontPaymentScheduleInputSchema,
  storefrontPaymentScheduleSchema,
  storefrontPaymentStructureSchema,
  storefrontProductAvailabilitySlotSchema,
  storefrontProductAvailabilityStateSchema,
  storefrontProductAvailabilitySummaryQuerySchema,
  storefrontProductAvailabilitySummaryResponseSchema,
  storefrontProductAvailabilitySummarySchema,
  storefrontProductExtensionsQuerySchema,
  storefrontProductExtensionsResponseSchema,
  storefrontPromotionalOfferListQuerySchema,
  storefrontPromotionalOfferListResponseSchema,
  storefrontPromotionalOfferResponseSchema,
  storefrontPromotionalOfferSchema,
  storefrontSettingsInputSchema,
  storefrontSettingsPatchSchema,
  storefrontSettingsSchema,
  storefrontSupportLinkInputSchema,
  storefrontSupportLinkSchema,
} from "./validation.js"
export type {
  StorefrontTransportEligibilityInput,
  StorefrontTransportEligibilityIssue,
  StorefrontTransportEligibilityResult,
  StorefrontTransportEligibilityRule,
  StorefrontTransportEligibilityRuleInput,
} from "./validation-transport-eligibility.js"
export {
  storefrontRequiredDocumentTypeSchema,
  storefrontTransportEligibilityDocumentInputSchema,
  storefrontTransportEligibilityInputSchema,
  storefrontTransportEligibilityIssueCodeSchema,
  storefrontTransportEligibilityIssueSchema,
  storefrontTransportEligibilityResultSchema,
  storefrontTransportEligibilityRuleSchema,
  storefrontTransportEligibilitySeveritySchema,
  storefrontTransportEligibilityTravelerInputSchema,
  storefrontTransportEligibilityTravelerResultSchema,
  storefrontTravelDocumentTypeSchema,
} from "./validation-transport-eligibility.js"

export const storefrontModule: Module = {
  name: "storefront",
}

export const storefrontAnonymousPublicPaths = [
  "/bookings",
  "/departures",
  "/leads",
  "/newsletter",
  "/offers",
  "/settings",
] as const
export const storefrontOptionalCustomerAuthPaths = ["/bookings"] as const

export type StorefrontApiModuleOptions = Parameters<typeof createStorefrontPublicRoutes>[0]

export function createStorefrontApiModule(options?: StorefrontApiModuleOptions): ApiModule {
  return {
    module: {
      ...storefrontModule,
    },
    adminRoutes: stampOpenApiRegistryApiId(
      createStorefrontAdminRoutes(options),
      "@voyant-travel/storefront#api.admin",
    ),
    publicPath: "/",
    publicRoutes: stampOpenApiRegistryApiId(
      createStorefrontPublicRoutes(options),
      "@voyant-travel/storefront#api.public",
    ),
    anonymous: storefrontAnonymousPublicPaths,
    optionalCustomerAuth: storefrontOptionalCustomerAuthPaths,
  }
}

export const createStorefrontVoyantRuntime = defineGraphRuntimeFactory(async ({ api, getPort }) => {
  const [offers, persistence] = await Promise.all([
    getPort(storefrontOffersRuntimePort),
    getPort(storefrontIntakeRuntimePort),
  ])
  const configured = createStorefrontApiModule({
    offers,
    intake: { persistence },
  })
  const selected: ApiModule = { module: configured.module }
  if (api.some(({ surface }) => surface === "admin") && configured.adminRoutes) {
    selected.adminRoutes = configured.adminRoutes
  }
  if (api.some(({ surface }) => surface === "public") && configured.publicRoutes) {
    selected.publicRoutes = configured.publicRoutes
    if (configured.publicPath !== undefined) selected.publicPath = configured.publicPath
    if (configured.anonymous !== undefined) selected.anonymous = configured.anonymous
    if (configured.optionalCustomerAuth !== undefined) {
      selected.optionalCustomerAuth = configured.optionalCustomerAuth
    }
  }
  return selected
})

export {
  storefrontCustomerPortalRuntimePort,
  storefrontIntakeRuntimePort,
  storefrontOffersRuntimePort,
  storefrontPaymentLinkRuntimePort,
  storefrontPaymentReconciliationJobRuntimePort,
  storefrontVerificationRuntimePort,
} from "./runtime-port.js"
