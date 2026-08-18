import { isGraphRuntimeFactory } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"
import {
  createCatalogBookingVoyantRuntime,
  createCatalogOffersVoyantRuntime,
  createCatalogSearchVoyantRuntime,
} from "../../src/graph-runtime.js"
import {
  catalogBookingEngineVoyantModule,
  catalogOffersVoyantPlugin,
  catalogVoyantModule,
} from "../../src/voyant.js"

describe("catalog deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(catalogVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/catalog",
      packageName: "@voyant-travel/catalog",
      provides: {
        capabilities: ["catalog.data-owner"],
        ports: [
          { id: "catalog.search-runtime" },
          { id: "catalog.content-runtime" },
          { id: "catalog.projection-runtime" },
          { id: "catalog.booking-snapshot-runtime" },
          { id: "catalog.booking-session-maintenance-job" },
          { id: "catalog.booking-session-settlement-runtime" },
          { id: "catalog.composite-booking-session.runtime" },
          { id: "catalog.inquiry-booking-session.runtime" },
          { id: "catalog.runtime-services" },
          { id: "catalog.reindex-products-job" },
          { id: "catalog.sources-sync-job" },
          { id: "bookings.supplier-amendment.runtime" },
          { id: "bookings.booking-action-source.runtime" },
          { id: "cruises.routes-runtime" },
        ],
      },
      requires: {
        ports: [
          { id: "catalog.indexer", optional: true },
          { id: "catalog.extension.accommodations" },
          { id: "catalog.extension.charters" },
          { id: "catalog.extension.commerce" },
          { id: "catalog.extension.distribution" },
          { id: "catalog.extension.cruises" },
          { id: "catalog.extension.sources", optional: true },
          { id: "catalog.extension.inventory" },
          { id: "catalog.extension.legal" },
          { id: "catalog.extension.operations" },
          { id: "finance.operator-settings.runtime" },
          { id: "payments.adapter.runtime", optional: true },
        ],
      },
      api: [
        {
          id: "@voyant-travel/catalog#api.admin",
          surface: "admin",
          openapi: { document: "catalog" },
          runtime: {
            entry: "@voyant-travel/catalog/graph-runtime",
            export: "createCatalogSearchVoyantRuntime",
          },
        },
        {
          id: "@voyant-travel/catalog#api.public",
          surface: "public",
          openapi: { document: "catalog" },
          anonymous: true,
          runtime: {
            entry: "@voyant-travel/catalog/graph-runtime",
            export: "createCatalogSearchVoyantRuntime",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/catalog#schema" }],
      migrations: [{ id: "@voyant-travel/catalog#migrations" }],
    })
    expectConcreteEventSchemas(catalogVoyantModule.events)
  })

  it("owns executable declarations for Catalog indexing and booking snapshots", () => {
    expect(catalogVoyantModule.subscribers).toEqual(
      [
        ["booking-session-created-analytics", "catalog.booking-session.created"],
        ["index-product-created", "product.created"],
        ["index-product-updated", "product.updated"],
        ["delete-product", "product.deleted"],
        ["index-product-content-changed", "product.content.changed"],
        ["index-product-availability-changed", "availability.slot.changed"],
        ["index-product-pricing-changed", "pricing.rule.changed"],
        ["index-product-publication-changed", "product.publication.changed"],
        ["index-product-promotion-changed", "promotion.changed"],
        ["index-entity-overlay-changed", "catalog.entity.overlay.changed"],
        ["capture-booking-snapshot", "booking.confirmed"],
      ].map(([localId, eventType]) => ({
        id: `@voyant-travel/catalog#subscriber.${localId}`,
        eventType,
        source:
          eventType === "booking.confirmed"
            ? "@voyant-travel/catalog/booking-snapshot-subscriber"
            : eventType === "catalog.booking-session.created"
              ? "@voyant-travel/catalog/booking-session-created-analytics-subscriber"
              : "@voyant-travel/catalog/index-subscribers",
        runtime:
          eventType === "booking.confirmed"
            ? {
                entry: "@voyant-travel/catalog/booking-snapshot-subscriber",
                export: "createCatalogBookingSnapshotSubscriberGraphRuntime",
              }
            : eventType === "catalog.booking-session.created"
              ? {
                  entry: "@voyant-travel/catalog/booking-session-created-analytics-subscriber",
                  export: "createCatalogBookingSessionCreatedAnalyticsSubscriberGraphRuntime",
                }
              : {
                  entry: "@voyant-travel/catalog/index-subscribers",
                  export: expect.stringMatching(/^createCatalog.+IndexSubscriberGraphRuntime$/),
                },
      })),
    )
    expect(catalogVoyantModule.runtimePorts).toEqual([
      { id: "catalog.search-runtime" },
      { id: "catalog.projection-runtime" },
      { id: "catalog.booking-snapshot-runtime" },
      { id: "catalog.booking-session-maintenance-job" },
      { id: "catalog.booking-session-settlement-runtime" },
      { id: "catalog.composite-booking-session.runtime" },
      { id: "catalog.reindex-products-job" },
      { id: "catalog.sources-sync-job" },
    ])
    expect(catalogVoyantModule.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "search_catalog", risk: "low" }),
        expect.objectContaining({ name: "get_catalog_entry", risk: "low" }),
      ]),
    )
    expect(catalogVoyantModule.jobs).toEqual([
      {
        id: "catalog.maintain-booking-sessions",
        schedule: { cron: "10 * * * *", overlap: "skip" },
        scheduling: {
          required: true,
          profiles: {
            eager: { cron: "*/15 * * * *", overlap: "skip" },
            economical: { cron: "10 */6 * * *", overlap: "skip" },
            "scale-to-zero": { cron: "10 */6 * * *", overlap: "skip" },
          },
        },
        runtime: {
          entry: "@voyant-travel/catalog/booking-session-maintenance-job",
          export: "runCatalogBookingSessionMaintenanceJob",
        },
      },
      {
        id: "catalog.reindex-products",
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/catalog/reindex-job",
          export: "runCatalogReindexProductsJob",
        },
      },
      {
        id: "catalog.sync-sources",
        wakeup: true,
        schedule: { cron: "20 * * * *", overlap: "skip" },
        scheduling: {
          profiles: {
            eager: { cron: "*/20 * * * *", overlap: "skip" },
            economical: { cron: "20 */6 * * *", overlap: "skip" },
            "scale-to-zero": { cron: "20 */6 * * *", overlap: "skip" },
          },
        },
        runtime: {
          entry: "@voyant-travel/catalog/sources-sync-job",
          export: "runCatalogSourcesSyncJob",
        },
      },
    ])
  })

  it("owns the booking engine and offers bridge declarations", () => {
    expect(catalogBookingEngineVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/catalog#booking-engine",
      packageName: "@voyant-travel/catalog",
      requires: { capabilities: ["catalog.data-owner"] },
      provides: { ports: [{ id: "catalog.booking-runtime" }] },
      api: [
        {
          id: "@voyant-travel/catalog#booking-engine.api.admin",
          surface: "admin",
          mount: "catalog",
          openapi: { document: "catalog-booking" },
          transactional: ["/booking-sessions", "/orders"],
          runtime: {
            entry: "@voyant-travel/catalog/graph-runtime",
            export: "createCatalogBookingVoyantRuntime",
          },
        },
        {
          id: "@voyant-travel/catalog#booking-engine.api.public",
          surface: "public",
          mount: "catalog",
          openapi: { document: "catalog-booking" },
          transactional: ["/booking-sessions"],
          runtime: {
            entry: "@voyant-travel/catalog/graph-runtime",
            export: "createCatalogBookingVoyantRuntime",
          },
        },
      ],
      runtimePorts: [
        { id: "catalog.booking-runtime" },
        // Optional: resolves the billing party for a verified guest. Without
        // it only authenticated customers can self-serve.
        { id: "bookings.relationships.runtime", optional: true },
        // Optional, and unbound is the intended default for a self-hosted
        // deployment — nothing in the engine depends on an analytics vendor.
        { id: "analytics.runtime", optional: true },
      ],
    })
    expect(catalogBookingEngineVoyantModule.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ context: ["catalogBooking"] })]),
    )
    expect(
      catalogBookingEngineVoyantModule.tools?.every(
        ({ context }) => context?.length === 1 && context[0] === "catalogBooking",
      ),
    ).toBe(true)

    expect(catalogOffersVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/catalog#offers-extension",
      packageName: "@voyant-travel/catalog",
      provides: { ports: [{ id: "catalog.offers-runtime" }] },
      api: [
        {
          id: "@voyant-travel/catalog#offers-extension.api",
          surface: "admin",
          mount: "catalog",
          openapi: { document: "catalog" },
          runtime: {
            entry: "@voyant-travel/catalog/graph-runtime",
            export: "createCatalogOffersVoyantRuntime",
          },
        },
      ],
      runtimePorts: [{ id: "catalog.offers-runtime" }],
    })

    expect(isGraphRuntimeFactory(createCatalogSearchVoyantRuntime)).toBe(true)
    expect(isGraphRuntimeFactory(createCatalogBookingVoyantRuntime)).toBe(true)
    expect(isGraphRuntimeFactory(createCatalogOffersVoyantRuntime)).toBe(true)
  })

  it("declares every route in the packaged catalog admin extension", () => {
    expect(catalogVoyantModule.admin?.routes?.map(({ id, path }) => [id, path])).toEqual([
      ["@voyant-travel/catalog#admin.route.index", "/catalog"],
      ["@voyant-travel/catalog#admin.route.products-index", "/catalog/products"],
      ["@voyant-travel/catalog#admin.route.products-detail", "/catalog/products/$productId"],
      ["@voyant-travel/catalog#admin.route.excursions-index", "/catalog/excursions"],
      ["@voyant-travel/catalog#admin.route.excursions-detail", "/catalog/excursions/$id"],
      ["@voyant-travel/catalog#admin.route.tours-index", "/catalog/tours"],
      ["@voyant-travel/catalog#admin.route.tours-detail", "/catalog/tours/$id"],
      ["@voyant-travel/catalog#admin.route.activities-index", "/catalog/activities"],
      ["@voyant-travel/catalog#admin.route.activities-detail", "/catalog/activities/$id"],
      ["@voyant-travel/catalog#admin.route.attractions-index", "/catalog/attractions"],
      ["@voyant-travel/catalog#admin.route.attractions-detail", "/catalog/attractions/$id"],
      ["@voyant-travel/catalog#admin.route.events-index", "/catalog/events"],
      ["@voyant-travel/catalog#admin.route.events-detail", "/catalog/events/$id"],
      ["@voyant-travel/catalog#admin.route.transportation-index", "/catalog/transportation"],
      ["@voyant-travel/catalog#admin.route.transportation-detail", "/catalog/transportation/$id"],
      ["@voyant-travel/catalog#admin.route.cruises-index", "/catalog/cruises"],
      ["@voyant-travel/catalog#admin.route.cruises-detail", "/catalog/cruises/$id"],
      ["@voyant-travel/catalog#admin.route.accommodations-index", "/catalog/accommodations"],
      ["@voyant-travel/catalog#admin.route.accommodations-detail", "/catalog/accommodations/$id"],
    ])
    expect(new Set(catalogVoyantModule.admin?.routes?.map(({ runtime }) => runtime))).toEqual(
      new Set([
        {
          entry: "@voyant-travel/catalog-react/admin",
          export: "createCatalogAdminExtension",
        },
      ]),
    )
    expect(
      catalogVoyantModule.admin?.routes?.every((route) =>
        route.requiredScopes?.includes("catalog:read"),
      ),
    ).toBe(true)
    expect(catalogVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/catalog#admin.route.products-index",
        label: { namespace: "catalog.admin", key: "catalogPage.title" },
      }),
    ])
  })
})

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
