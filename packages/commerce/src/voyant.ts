import {
  catalogBookingSessionSettlementRuntimePort,
  catalogCommerceRuntimeExtensionPort,
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/ports"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import {
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeFxRateCaptureRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import {
  bookingMaintenanceRuntimePort,
  catalogCheckoutApiRuntimePort,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "./checkout/runtime-ports.js"
import { promotionBoundaryJobRuntimePort } from "./promotions/boundary-job-runtime-port.js"
import { promotionReindexJobRuntimePort } from "./promotions/reindex-job-runtime-port.js"
import {
  promotionRedemptionDatabaseRuntimePort,
  promotionsBulkReindexRuntimePort,
} from "./promotions/runtime-ports.js"
import {
  commerceCardPaymentRuntimePort,
  commerceInventoryRuntimePort,
  commerceLegalRuntimePort,
  commerceOperatorSettingsRuntimePort,
} from "./runtime-port.js"
import { commerceAccess } from "./voyant-access.js"
import {
  bookingSessionSettlementFailedPayloadSchema,
  checkoutFinalizedPayloadSchema,
  inquiryCreatedPayloadSchema,
  pricingRuleChangedPayloadSchema,
  promotionChangedPayloadSchema,
} from "./voyant-event-schemas.js"
import { commerceToolActions } from "./voyant-tool-actions.js"

const commerceAdminRouteId = "@voyant-travel/commerce#admin.route.promotions-index"
const commerceAdminRuntime = {
  entry: "@voyant-travel/commerce-react/admin",
  export: "createCommerceAdminExtension",
} as const

/** Import-cheap deployment declaration owned by the commerce package. */
export const commerceVoyantModule = defineModule({
  id: "@voyant-travel/commerce",
  packageName: "@voyant-travel/commerce",
  localId: "commerce",
  runtimePorts: [
    requirePort(promotionRedemptionDatabaseRuntimePort),
    requirePort(promotionsBulkReindexRuntimePort),
    requirePort(promotionBoundaryJobRuntimePort),
    requirePort(promotionReindexJobRuntimePort),
    requirePort(commerceOperatorSettingsRuntimePort),
    requirePort(commerceInventoryRuntimePort),
    requirePort(commerceLegalRuntimePort),
    requirePort(commerceCardPaymentRuntimePort, { optional: true }),
    requirePort(catalogRuntimeServicesPort),
    requirePort(catalogPublicationRuntimePort),
    requirePort(financeDistributionPaymentPolicyRuntimePort),
    requirePort(financeAccommodationsPaymentPolicyRuntimePort),
    requirePort(financeCruisesPaymentPolicyRuntimePort),
    requirePort(financeInventoryPaymentPolicyRuntimePort),
  ],
  provides: {
    ports: [
      providePort(catalogCommerceRuntimeExtensionPort),
      providePort(promotionRedemptionDatabaseRuntimePort),
      providePort(promotionsBulkReindexRuntimePort),
      providePort(promotionBoundaryJobRuntimePort),
      providePort(promotionReindexJobRuntimePort),
      providePort(financeFxRateCaptureRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/commerce#api.pricing.admin",
      surface: "admin",
      mount: "pricing",
      openapi: { document: "pricing" },
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "pricingApiModule",
      },
    },
    {
      id: "@voyant-travel/commerce#api.pricing.public",
      surface: "public",
      mount: "pricing",
      openapi: { document: "pricing" },
      // Product pricing a storefront renders before anyone signs in.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "pricingApiModule",
      },
    },
    {
      id: "@voyant-travel/commerce#api.markets.admin",
      surface: "admin",
      mount: "markets",
      openapi: { document: "markets" },
      resource: "markets",
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "marketsApiModule",
      },
    },
    {
      id: "@voyant-travel/commerce#api.markets.public",
      surface: "public",
      mount: "markets",
      openapi: { document: "markets" },
      resource: "markets",
      anonymous: true,
      // Market and currency metadata.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "marketsApiModule",
      },
    },
    {
      id: "@voyant-travel/commerce#api.sellability.admin",
      surface: "admin",
      mount: "sellability",
      openapi: { document: "sellability" },
      resource: "sellability",
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "sellabilityApiModule",
      },
    },
    {
      id: "@voyant-travel/commerce#api.promotions.admin",
      surface: "admin",
      mount: "promotions",
      openapi: { document: "promotions" },
      resource: "promotions",
      runtime: {
        entry: "@voyant-travel/commerce",
        export: "promotionsApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/commerce#schema",
      source: "@voyant-travel/commerce/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/commerce#migrations",
      source: "./migrations",
    },
  ],
  access: commerceAccess,
  tools: [
    {
      id: "@voyant-travel/commerce#tool.resolve-sellability",
      name: "resolve_sellability",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "resolveSellabilityTool" },
      requiredScopes: ["sellability:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.list-sellability-policies",
      name: "list_sellability_policies",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "listSellabilityPoliciesTool",
      },
      requiredScopes: ["sellability:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.get-sellability-policy",
      name: "get_sellability_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "getSellabilityPolicyTool",
      },
      requiredScopes: ["sellability:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.create-sellability-policy",
      name: "create_sellability_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "createSellabilityPolicyTool",
      },
      requiredScopes: ["sellability:write"],
      context: ["commerce"],
      risk: "medium",
      adminWrites: ["/v1/admin/sellability/policies"],
    },
    {
      id: "@voyant-travel/commerce#tool.update-sellability-policy",
      name: "update_sellability_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "updateSellabilityPolicyTool",
      },
      requiredScopes: ["sellability:write"],
      context: ["commerce"],
      risk: "medium",
      adminWrites: ["/v1/admin/sellability/policies/{id}"],
    },
    {
      id: "@voyant-travel/commerce#tool.list-cancellation-policies",
      name: "list_cancellation_policies",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "listCancellationPoliciesTool",
      },
      requiredScopes: ["pricing:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.get-cancellation-policy",
      name: "get_cancellation_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "getCancellationPolicyTool",
      },
      requiredScopes: ["pricing:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.create-cancellation-policy",
      name: "create_cancellation_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "createCancellationPolicyTool",
      },
      requiredScopes: ["pricing:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.update-cancellation-policy",
      name: "update_cancellation_policy",
      runtime: {
        entry: "@voyant-travel/commerce/tools",
        export: "updateCancellationPolicyTool",
      },
      requiredScopes: ["pricing:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.list-price-catalogs",
      name: "list_price_catalogs",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "listPriceCatalogsTool" },
      requiredScopes: ["pricing:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.get-price-catalog",
      name: "get_price_catalog",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "getPriceCatalogTool" },
      requiredScopes: ["pricing:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.create-price-catalog",
      name: "create_price_catalog",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "createPriceCatalogTool" },
      requiredScopes: ["pricing:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.update-price-catalog",
      name: "update_price_catalog",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "updatePriceCatalogTool" },
      requiredScopes: ["pricing:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.list-promotions",
      name: "list_promotions",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "listPromotionsTool" },
      requiredScopes: ["promotions:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.get-promotion",
      name: "get_promotion",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "getPromotionTool" },
      requiredScopes: ["promotions:read"],
      context: ["commerce"],
      risk: "low",
    },
    {
      id: "@voyant-travel/commerce#tool.create-promotion",
      name: "create_promotion",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "createPromotionTool" },
      requiredScopes: ["promotions:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.update-promotion",
      name: "update_promotion",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "updatePromotionTool" },
      requiredScopes: ["promotions:write"],
      context: ["commerce"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/commerce#tool.archive-promotion",
      name: "archive_promotion",
      runtime: { entry: "@voyant-travel/commerce/tools", export: "archivePromotionTool" },
      requiredScopes: ["promotions:write"],
      context: ["commerce"],
      risk: "medium",
    },
  ],
  actions: commerceToolActions,
  events: [
    {
      id: "@voyant-travel/commerce#event.checkout.finalized",
      eventType: "checkout.finalized",
      version: "1.0.0",
      payloadSchema: checkoutFinalizedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "commerce", category: "domain" },
    },
    {
      id: "@voyant-travel/commerce#event.booking-session.settlement-failed",
      eventType: "booking_session.settlement.failed",
      version: "1.0.0",
      payloadSchema: bookingSessionSettlementFailedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "commerce", category: "domain" },
    },
    {
      id: "@voyant-travel/commerce#event.promotion.changed",
      eventType: "promotion.changed",
      version: "1.0.0",
      payloadSchema: promotionChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "commerce", category: "domain" },
    },
    {
      id: "@voyant-travel/commerce#event.pricing.rule.changed",
      eventType: "pricing.rule.changed",
      version: "1.0.0",
      payloadSchema: pricingRuleChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "commerce", category: "domain" },
    },
    {
      id: "@voyant-travel/commerce#event.inquiry.created",
      eventType: "inquiry.created",
      version: "1.0.0",
      payloadSchema: inquiryCreatedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "commerce", category: "domain" },
    },
  ],
  subscribers: [
    {
      id: "@voyant-travel/commerce#subscriber.promotion-redemption-booking-confirmed",
      eventType: "booking.confirmed",
      source: "@voyant-travel/commerce/promotion-redemption-subscriber",
      runtime: {
        entry: "@voyant-travel/commerce/promotion-redemption-subscriber",
        export: "createPromotionRedemptionSubscriberGraphRuntime",
      },
    },
    {
      id: "@voyant-travel/commerce#subscriber.promotion-reindex-intent",
      eventType: "promotion.changed",
      runtime: {
        entry: "@voyant-travel/commerce/promotion-reindex-subscriber",
        export: "createPromotionReindexIntentSubscriberGraphRuntime",
      },
    },
  ],
  jobs: [
    {
      id: "promotions.reindex-all-products",
      schedule: { every: "2m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "15m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/commerce/promotion-reindex-job",
        export: "runPromotionReindexJob",
      },
    },
    {
      id: "commerce.process-promotion-boundaries",
      schedule: { cron: "*/5 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { cron: "* * * * *", overlap: "skip" },
          economical: { cron: "*/15 * * * *", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/commerce/promotion-boundary-job",
        export: "runPromotionBoundaryJob",
      },
    },
  ],
  admin: {
    compositionOrder: 80,
    setupSteps: [{ id: "@voyant-travel/commerce#setup.market", skippable: true }],
    runtime: {
      entry: "@voyant-travel/commerce-react/admin",
      export: "createSelectedCommerceAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/commerce#admin.copy.promotions",
        namespace: "commerce.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/commerce-react/promotions/i18n",
          export: "promotionsUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: commerceAdminRouteId,
        path: "/promotions",
        runtime: commerceAdminRuntime,
        copy: [
          {
            namespace: "commerce.admin",
            key: "promotionsPage.title",
          },
        ],
      },
    ],
    nav: [
      {
        id: "@voyant-travel/commerce#admin.nav.promotions",
        routeId: commerceAdminRouteId,
        label: {
          namespace: "commerce.admin",
          key: "promotionsPage.title",
        },
        order: 50,
      },
    ],
  },
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const commerceCatalogCheckoutVoyantPlugin = defineExtension({
  id: "@voyant-travel/commerce#catalog-checkout-extension",
  packageName: "@voyant-travel/commerce",
  localId: "commerce.catalog-checkout-extension",
  provides: {
    ports: [
      providePort(catalogCheckoutApiRuntimePort),
      providePort(catalogCheckoutDatabaseRuntimePort),
      providePort(catalogCheckoutLegalRuntimePort),
    ],
  },
  runtimePorts: [
    requirePort(catalogCheckoutApiRuntimePort),
    requirePort(catalogCheckoutDatabaseRuntimePort),
    requirePort(catalogCheckoutLegalRuntimePort),
    requirePort(catalogBookingSessionSettlementRuntimePort),
  ],
  api: [
    {
      id: "@voyant-travel/commerce#catalog-checkout-extension.api",
      surface: "public",
      mount: "catalog",
      openapi: { document: "catalog" },
      // Checkout start, part of the Booking Session flow above.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/commerce/checkout",
        export: "createCatalogCheckoutGraphExtension",
      },
    },
  ],
  subscribers: [
    {
      id: "@voyant-travel/commerce#subscriber.catalog-checkout-contract-document-generated",
      eventType: "contract.document.generated",
      source: "@voyant-travel/commerce/catalog-checkout-subscribers",
      runtime: {
        entry: "@voyant-travel/commerce/catalog-checkout-subscribers",
        export: "createAcceptanceSignatureSubscriberGraphRuntime",
      },
    },
    {
      id: "@voyant-travel/commerce#subscriber.catalog-checkout-payment-completed",
      eventType: "payment.completed",
      source: "@voyant-travel/commerce/catalog-checkout-subscribers",
      runtime: {
        entry: "@voyant-travel/commerce/catalog-checkout-subscribers",
        export: "createCheckoutFinalizeSubscriberGraphRuntime",
      },
    },
    {
      id: "@voyant-travel/commerce#subscriber.catalog-checkout-invoice-payment-recorded",
      eventType: "invoice.payment.recorded",
      source: "@voyant-travel/commerce/catalog-checkout-subscribers",
      runtime: {
        entry: "@voyant-travel/commerce/catalog-checkout-subscribers",
        export: "createInvoicePaymentSignatureSubscriberGraphRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const commerceBookingMaintenanceVoyantPlugin = defineExtension({
  id: "@voyant-travel/commerce#booking-maintenance-extension",
  packageName: "@voyant-travel/commerce",
  localId: "commerce.booking-maintenance-extension",
  provides: { ports: [providePort(bookingMaintenanceRuntimePort)] },
  runtime: {
    entry: "@voyant-travel/commerce/checkout",
    export: "createBookingMaintenanceVoyantRuntime",
  },
  runtimePorts: [requirePort(bookingMaintenanceRuntimePort)],
  api: [
    {
      id: "@voyant-travel/commerce#booking-maintenance-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      runtime: {
        entry: "@voyant-travel/commerce/checkout",
        export: "createBookingMaintenanceApiExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default commerceVoyantModule
