import {
  catalogBookingSessionSettlementRuntimePort,
  catalogCommerceRuntimeExtensionPort,
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/runtime-contracts"
import {
  financeAccommodationsPaymentPolicyRuntimePort,
  financeCruisesPaymentPolicyRuntimePort,
  financeDistributionPaymentPolicyRuntimePort,
  financeInventoryPaymentPolicyRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { describe, expect, it } from "vitest"
import {
  bookingMaintenanceRuntimePort,
  catalogCheckoutApiRuntimePort,
  catalogCheckoutDatabaseRuntimePort,
  catalogCheckoutLegalRuntimePort,
} from "../../src/checkout/runtime-ports.js"
import { publicMarketsRoutes } from "../../src/markets/routes-public.js"
import { publicPricingRoutes } from "../../src/pricing/routes-public.js"
import { promotionBoundaryJobRuntimePort } from "../../src/promotions/job-boundary-scheduler.js"
import { promotionReindexJobRuntimePort } from "../../src/promotions/reindex-job.js"
import {
  promotionRedemptionDatabaseRuntimePort,
  promotionsBulkReindexRuntimePort,
} from "../../src/promotions/runtime-ports.js"
import {
  commerceCardPaymentRuntimePort,
  commerceInventoryRuntimePort,
  commerceLegalRuntimePort,
  commerceOperatorSettingsRuntimePort,
} from "../../src/runtime-port.js"
import {
  commerceBookingMaintenanceVoyantPlugin,
  commerceCatalogCheckoutVoyantPlugin,
  commerceVoyantModule,
} from "../../src/voyant.js"

describe("commerce deployment manifest", () => {
  it("owns runtime, persistence, and promotion orchestration facets", () => {
    expect(commerceVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/commerce",
      packageName: "@voyant-travel/commerce",
      provides: {
        ports: [
          { id: catalogCommerceRuntimeExtensionPort.id },
          { id: promotionRedemptionDatabaseRuntimePort.id },
          { id: promotionsBulkReindexRuntimePort.id },
          { id: promotionBoundaryJobRuntimePort.id },
          { id: promotionReindexJobRuntimePort.id },
        ],
      },
      runtimePorts: [
        { id: promotionRedemptionDatabaseRuntimePort.id },
        { id: promotionsBulkReindexRuntimePort.id },
        { id: promotionBoundaryJobRuntimePort.id },
        { id: promotionReindexJobRuntimePort.id },
        { id: commerceOperatorSettingsRuntimePort.id },
        { id: commerceInventoryRuntimePort.id },
        { id: commerceLegalRuntimePort.id },
        { id: commerceCardPaymentRuntimePort.id, optional: true },
        { id: catalogRuntimeServicesPort.id },
        { id: catalogPublicationRuntimePort.id },
        { id: financeDistributionPaymentPolicyRuntimePort.id },
        { id: financeAccommodationsPaymentPolicyRuntimePort.id },
        { id: financeCruisesPaymentPolicyRuntimePort.id },
        { id: financeInventoryPaymentPolicyRuntimePort.id },
      ],
      api: [
        {
          id: "@voyant-travel/commerce#api.pricing.admin",
          surface: "admin",
          openapi: { document: "pricing" },
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "pricingApiModule",
          },
        },
        {
          id: "@voyant-travel/commerce#api.pricing.public",
          surface: "public",
          openapi: { document: "pricing" },
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "pricingApiModule",
          },
        },
        {
          id: "@voyant-travel/commerce#api.markets.admin",
          surface: "admin",
          resource: "markets",
          openapi: { document: "markets" },
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "marketsApiModule",
          },
        },
        {
          id: "@voyant-travel/commerce#api.markets.public",
          surface: "public",
          resource: "markets",
          openapi: { document: "markets" },
          anonymous: true,
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "marketsApiModule",
          },
        },
        {
          id: "@voyant-travel/commerce#api.sellability.admin",
          surface: "admin",
          resource: "sellability",
          openapi: { document: "sellability" },
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "sellabilityApiModule",
          },
        },
        {
          id: "@voyant-travel/commerce#api.promotions.admin",
          surface: "admin",
          resource: "promotions",
          openapi: { document: "promotions" },
          runtime: {
            entry: "@voyant-travel/commerce",
            export: "promotionsApiModule",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/commerce#schema" }],
      migrations: [{ id: "@voyant-travel/commerce#migrations" }],
      events: [
        {
          id: "@voyant-travel/commerce#event.checkout.finalized",
          eventType: "checkout.finalized",
        },
        {
          id: "@voyant-travel/commerce#event.promotion.changed",
          eventType: "promotion.changed",
        },
        {
          id: "@voyant-travel/commerce#event.pricing.rule.changed",
          eventType: "pricing.rule.changed",
        },
        {
          id: "@voyant-travel/commerce#event.inquiry.created",
          eventType: "inquiry.created",
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
    })

    expect(readApiIds(publicMarketsRoutes)).toEqual(["@voyant-travel/commerce#api.markets.public"])
    expect(readApiIds(publicPricingRoutes)).toEqual(["@voyant-travel/commerce#api.pricing.public"])
    expect(
      commerceVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/commerce#action.create-promotion",
      ),
    ).toMatchObject({
      availability: { status: "available" },
      effectBoundary: "multistage",
      targetType: "promotion",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "promotion_create_command",
        resultReferenceType: "promotion",
        durability: "handler-command-claim-v1",
      },
      durability: {
        strategy: "outbox",
        testReference: "packages/commerce/tests/integration/promotion-created-command.test.ts",
      },
    })
    for (const id of [
      "update-cancellation-policy",
      "update-price-catalog",
      "update-promotion",
      "archive-promotion",
    ]) {
      expect(
        commerceVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/commerce#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
  })

  it("owns the catalog checkout and booking maintenance bridges", () => {
    expect(commerceCatalogCheckoutVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/commerce#catalog-checkout-extension",
      packageName: "@voyant-travel/commerce",
      provides: {
        ports: [
          { id: catalogCheckoutApiRuntimePort.id },
          { id: catalogCheckoutDatabaseRuntimePort.id },
          { id: catalogCheckoutLegalRuntimePort.id },
        ],
      },
      runtimePorts: [
        { id: catalogCheckoutApiRuntimePort.id },
        { id: catalogCheckoutDatabaseRuntimePort.id },
        { id: catalogCheckoutLegalRuntimePort.id },
        { id: catalogBookingSessionSettlementRuntimePort.id },
      ],
      api: [
        {
          id: "@voyant-travel/commerce#catalog-checkout-extension.api",
          surface: "public",
          mount: "catalog",
          openapi: { document: "catalog" },
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
    })
    expect(commerceCatalogCheckoutVoyantPlugin.subscribers).toHaveLength(3)

    expect(commerceBookingMaintenanceVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/commerce#booking-maintenance-extension",
      packageName: "@voyant-travel/commerce",
      provides: { ports: [{ id: bookingMaintenanceRuntimePort.id }] },
      runtime: {
        entry: "@voyant-travel/commerce/checkout",
        export: "createBookingMaintenanceVoyantRuntime",
      },
      runtimePorts: [{ id: "commerce.booking-maintenance.runtime" }],
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
    })
    expect(commerceVoyantModule.access?.resources?.map(({ resource }) => resource)).toEqual([
      "pricing",
      "markets",
      "sellability",
      "promotions",
    ])
    expectConcreteEventSchemas(commerceVoyantModule.events)
  })

  it("declares the promotions route, navigation, and existing copy catalog", () => {
    expect(commerceVoyantModule.admin).toMatchObject({
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
          id: "@voyant-travel/commerce#admin.route.promotions-index",
          path: "/promotions",
          runtime: {
            entry: "@voyant-travel/commerce-react/admin",
            export: "createCommerceAdminExtension",
          },
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
          routeId: "@voyant-travel/commerce#admin.route.promotions-index",
          label: {
            namespace: "commerce.admin",
            key: "promotionsPage.title",
          },
          order: 50,
        },
      ],
    })
  })
})

function readApiIds(routes: OpenApiDocumentSource): unknown[] {
  const document = routes.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "Commerce", version: "1" },
  })
  return Object.values(document.paths ?? {}).flatMap((path) =>
    Object.values(path).map((operation) => operation["x-voyant-api-id"]),
  )
}

function expectConcreteEventSchemas(events: readonly { payloadSchema: unknown }[]) {
  for (const event of events) {
    expect(event.payloadSchema).toEqual(
      expect.objectContaining({
        type: "object",
        required: expect.any(Array),
        properties: expect.any(Object),
      }),
    )
  }
}

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, Record<string, unknown>>>
  }
}
