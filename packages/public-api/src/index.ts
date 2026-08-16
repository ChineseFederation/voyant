import {
  type CatalogPublicationRuntime,
  catalogPublicationRuntimePort,
} from "@voyant-travel/catalog/runtime-contracts"
import type { Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"

import { createPublicApiAdminRoutes } from "./routes-admin.js"
import { createPublicApiRoutes } from "./routes-public.js"
import { publicApiIntakeRuntimePort, publicApiOffersRuntimePort } from "./runtime-port.js"
import {
  publicApiShoppingRuntimePort,
  publicApiTripSelectionsRuntimePort,
} from "./shopping/runtime-port.js"

export {
  createPublicApiAvailabilityReadModelInvalidationSubscriber,
  DEPARTURES_DOC_TTL_SECONDS,
  departuresDocKey,
  departuresDocPrefix,
  invalidateDeparturesReadModel,
  PUBLIC_API_AVAILABILITY_READ_MODEL_SUBSCRIBER_ID,
  publicApiAvailabilityReadModelInvalidationSubscriber,
  readThroughDepartures,
} from "./departures-read-model.js"

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
export type { PublicApiAdminRoutes } from "./routes-admin.js"
export { createPublicApiAdminRoutes } from "./routes-admin.js"
export type { PublicApiRoutes } from "./routes-public.js"
export { createPublicApiRoutes } from "./routes-public.js"
export type {
  PublicApiOfferResolvers,
  PublicApiRequestContext,
  PublicApiServiceOptions,
} from "./service.js"
export {
  createPublicApiService,
  mergePublicApiSettingsPatch,
  resolvePublicApiSettings,
} from "./service.js"
export type {
  PublicApiCustomerSignalCreatedEvent,
  PublicApiIntakeGuard,
  PublicApiIntakeGuardDecision,
  PublicApiIntakeOptions,
  PublicApiIntakePersistence,
  PublicApiIntakePersistenceResolver,
  PublicApiIntakePerson,
  PublicApiIntakeSignal,
  PublicApiNewsletterDoubleOptInHook,
} from "./service-intake.js"
export { CUSTOMER_SIGNAL_CREATED_EVENT, emitCustomerSignalCreated } from "./service-intake.js"
export type {
  PublicApiAppliedOffer,
  PublicApiBankTransfer,
  PublicApiBankTransferAccount,
  PublicApiBankTransferAccountInput,
  PublicApiBankTransferInput,
  PublicApiCurrencyDisplay,
  PublicApiDepartureListQuery,
  PublicApiDeparturePricePreview,
  PublicApiFormField,
  PublicApiFormFieldInput,
  PublicApiIntakeConsent,
  PublicApiIntakeResponse,
  PublicApiLeadContact,
  PublicApiLeadIntakeInput,
  PublicApiNewsletterSubscribeInput,
  PublicApiNewsletterSubscribeResponse,
  PublicApiOfferApplyInput,
  PublicApiOfferMutationResult,
  PublicApiOfferRedeemInput,
  PublicApiPaymentDueCondition,
  PublicApiPaymentMethod,
  PublicApiPaymentMethodCode,
  PublicApiPaymentMethodInput,
  PublicApiPaymentSchedule,
  PublicApiPaymentScheduleEntry,
  PublicApiPaymentScheduleEntryInput,
  PublicApiPaymentScheduleInput,
  PublicApiPaymentStructure,
  PublicApiProductAvailabilitySummaryQuery,
  PublicApiPromotionalOffer,
  PublicApiSettings,
  PublicApiSettingsInput,
  PublicApiSettingsPatchInput,
  PublicApiSupportLink,
  PublicApiSupportLinkInput,
} from "./validation.js"
export {
  publicApiAppliedOfferSchema,
  publicApiBankTransferAccountInputSchema,
  publicApiBankTransferAccountSchema,
  publicApiBankTransferInputSchema,
  publicApiBankTransferSchema,
  publicApiCurrencyDisplaySchema,
  publicApiDepartureItinerarySchema,
  publicApiDepartureListQuerySchema,
  publicApiDepartureListResponseSchema,
  publicApiDeparturePriceAllocationSchema,
  publicApiDeparturePriceExtraImpactSchema,
  publicApiDeparturePriceLineItemSchema,
  publicApiDeparturePriceOfferImpactSchema,
  publicApiDeparturePriceOffersSchema,
  publicApiDeparturePricePaxSchema,
  publicApiDeparturePricePreviewInputSchema,
  publicApiDeparturePricePreviewSchema,
  publicApiDeparturePriceRequestedOfferSchema,
  publicApiDeparturePriceRoomRowSchema,
  publicApiDeparturePriceSlotSchema,
  publicApiDeparturePriceTotalsSchema,
  publicApiDeparturePriceUnitRowSchema,
  publicApiDepartureSchema,
  publicApiFormFieldInputSchema,
  publicApiFormFieldOptionSchema,
  publicApiFormFieldSchema,
  publicApiFormFieldTypeSchema,
  publicApiIntakeConsentSchema,
  publicApiIntakeResponseSchema,
  publicApiLeadContactSchema,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeInputSchema,
  publicApiNewsletterSubscribeResponseSchema,
  publicApiOfferApplyInputSchema,
  publicApiOfferAudienceSchema,
  publicApiOfferConflictSchema,
  publicApiOfferMutationReasonSchema,
  publicApiOfferMutationResponseSchema,
  publicApiOfferMutationResultSchema,
  publicApiOfferMutationStatusSchema,
  publicApiOfferRedeemInputSchema,
  publicApiPaymentDueConditionSchema,
  publicApiPaymentMethodCodeSchema,
  publicApiPaymentMethodInputSchema,
  publicApiPaymentMethodSchema,
  publicApiPaymentScheduleEntryInputSchema,
  publicApiPaymentScheduleEntrySchema,
  publicApiPaymentScheduleInputSchema,
  publicApiPaymentScheduleSchema,
  publicApiPaymentStructureSchema,
  publicApiProductAvailabilitySlotSchema,
  publicApiProductAvailabilityStateSchema,
  publicApiProductAvailabilitySummaryQuerySchema,
  publicApiProductAvailabilitySummaryResponseSchema,
  publicApiProductAvailabilitySummarySchema,
  publicApiProductExtensionsQuerySchema,
  publicApiProductExtensionsResponseSchema,
  publicApiPromotionalOfferListQuerySchema,
  publicApiPromotionalOfferListResponseSchema,
  publicApiPromotionalOfferResponseSchema,
  publicApiPromotionalOfferSchema,
  publicApiSettingsInputSchema,
  publicApiSettingsPatchSchema,
  publicApiSettingsSchema,
  publicApiSupportLinkInputSchema,
  publicApiSupportLinkSchema,
} from "./validation.js"

export const publicApiModule: Module = {
  name: "storefront",
}

export const publicApiAnonymousPublicPaths = [
  "/bookings",
  "/departures",
  "/leads",
  "/newsletter",
  "/offers",
  "/shopping",
  "/settings",
] as const
// These guest-facing route families still need the customer-auth resolver to
// derive trusted Storefront -> Channel context from the BFF key/origin. A
// missing session remains anonymous; a successfully resolved storefront is
// carried into publication and checkout guards.
export const publicApiOptionalCustomerAuthPaths = [
  "/bookings",
  "/departures",
  "/leads",
  "/newsletter",
  "/offers",
  "/products",
  "/shopping",
  "/settings",
] as const

export type PublicApiModuleOptions = Parameters<typeof createPublicApiRoutes>[0]

export function createPublicApiModule(options?: PublicApiModuleOptions): ApiModule {
  return {
    module: {
      ...publicApiModule,
    },
    adminRoutes: stampOpenApiRegistryApiId(
      createPublicApiAdminRoutes(options),
      "@voyant-travel/public-api#api.admin",
    ),
    publicPath: "/",
    publicRoutes: stampOpenApiRegistryApiId(
      createPublicApiRoutes(options),
      "@voyant-travel/public-api#api.public",
    ),
    anonymous: publicApiAnonymousPublicPaths,
    optionalCustomerAuth: publicApiOptionalCustomerAuthPaths,
    // Lead and newsletter intake capture a person with nothing challenging the
    // submitter, so a publishable key reaches them only once a guard exists
    // (voyant#4625 §3). Reporting it from here means wiring the guard IS the
    // unlock — there is no second flag to forget, and no way to claim the
    // deployment guards intake while nothing does.
    ...(options?.intake?.guard ? { publicIntakeGuarded: true } : {}),
    bodyKeyedCache: ["/shopping/search"],
  }
}

export const createPublicApiVoyantRuntime = defineGraphRuntimeFactory(
  async ({ api, getPort, hasPort }) => {
    const [offers, persistence, publication] = await Promise.all([
      getPort(publicApiOffersRuntimePort),
      getPort(publicApiIntakeRuntimePort),
      getPort<CatalogPublicationRuntime>(catalogPublicationRuntimePort),
    ])
    const configured = createPublicApiModule({
      offers,
      intake: { persistence },
      publication: {
        isProductPublished: ({ productId, context }) => {
          if (!context.db || !context.channelId) return false
          return publication.isProductPublished({
            db: context.db,
            productId,
            channelId: context.channelId,
          })
        },
      },
      shoppingGateway: {
        shopping: hasPort(publicApiShoppingRuntimePort)
          ? await getPort(publicApiShoppingRuntimePort)
          : undefined,
        tripSelections: hasPort(publicApiTripSelectionsRuntimePort)
          ? await getPort(publicApiTripSelectionsRuntimePort)
          : undefined,
      },
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
      if (configured.bodyKeyedCache !== undefined) {
        selected.bodyKeyedCache = configured.bodyKeyedCache
      }
      if (configured.publicIntakeGuarded !== undefined) {
        selected.publicIntakeGuarded = configured.publicIntakeGuarded
      }
    }
    return selected
  },
)

export {
  createVoyantDataPresentationFxQuoter,
  type VoyantDataPresentationFxOptions,
} from "./presentation-money/voyant-data-fx.js"
export {
  publicApiCustomerPortalRuntimePort,
  publicApiIntakeRuntimePort,
  publicApiOffersRuntimePort,
  publicApiPaymentLinkRuntimePort,
  publicApiPaymentReconciliationJobRuntimePort,
} from "./runtime-port.js"
export type {
  PublicApiRequestedScope,
  PublicApiResolvedScope,
  PublicApiShoppingContext,
  PublicApiShoppingGateway,
  PublicApiShoppingIntent,
  PublicApiShoppingRequest,
  PublicApiShoppingResult,
  PublicApiShoppingRuntime,
  PublicApiTripSelection,
  PublicApiTripSelectionCreate,
  PublicApiTripSelectionsRuntime,
  PublicApiTripSelectionUpdate,
} from "./shopping/index.js"
export {
  createPublicApiShoppingGateway,
  PublicApiShoppingUnavailableError,
  publicApiShoppingRuntimePort,
  publicApiTripSelectionsRuntimePort,
} from "./shopping/index.js"
