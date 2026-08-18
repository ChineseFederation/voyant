// agent-quality: file-size exception -- owner: catalog; the package-owned manifest centralizes its APIs, Tools, runtime ports, and deployment declarations.
import {
  bookingActionSourceRuntimePort,
  bookingsRelationshipsRuntimePort,
  bookingsSupplierAmendmentRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
// From `/runtime-port`, not `/analytics`: a package manifest must stay
// import-cheap, so it may reach only for authoring helpers and port contracts.
// `@voyant-travel/core/analytics` carries the emitter and the catalogue too.
import { analyticsPort } from "@voyant-travel/core/runtime-port"
import { financeOperatorSettingsRuntimePort } from "@voyant-travel/finance/runtime-port"
import {
  catalogBookingRuntimePort,
  catalogOffersRuntimePort,
  catalogSearchRuntimePort,
} from "./api-runtime-ports.js"
import { catalogBookingSessionCreatedAnalyticsSubscriberDeclaration } from "./booking-session-created-analytics-subscriber.js"
import { catalogBookingSessionMaintenanceJobRuntimePort } from "./booking-session-maintenance-job-runtime-port.js"
import { catalogBookingSessionSettlementRuntimePort } from "./booking-session-settlement-runtime-port.js"
import { catalogBookingSnapshotSubscriberDeclaration } from "./booking-snapshot-subscriber-declaration.js"
import { catalogCompositeBookingSessionRuntimePort } from "./composite-booking-session-runtime-port.js"
import { catalogContentRuntimePort } from "./content-runtime-port.js"
import { catalogIndexSubscriberDeclarations } from "./index-subscriber-declarations.js"
import { catalogIndexerProviderPort } from "./indexer/provider.js"
import { catalogInquiryBookingSessionRuntimePort } from "./inquiry-booking-session-runtime-port.js"
import { catalogReindexJobRuntimePort } from "./reindex-job-runtime-port.js"
import {
  catalogAccommodationsRuntimeExtensionPort,
  catalogChartersRuntimeExtensionPort,
  catalogCommerceRuntimeExtensionPort,
  catalogCruisesRuntimeExtensionPort,
  catalogDistributionRuntimeExtensionPort,
  catalogInventoryRuntimeExtensionPort,
  catalogLegalRuntimeExtensionPort,
  catalogOperationsRuntimeExtensionPort,
  catalogRuntimeServicesPort,
  catalogSourcesRuntimeExtensionPort,
} from "./runtime-contracts.js"
import { catalogSourcesSyncJobRuntimePort } from "./sources-sync-job-runtime-port.js"
import {
  catalogBookingSnapshotRuntimePort,
  catalogProjectionRuntimePort,
} from "./subscriber-runtime-ports.js"
import {
  catalogEventDeclarations,
  catalogOverlayChangedPayloadSchema,
  catalogWebhookDeclarations,
} from "./voyant-events.js"

// Importing Cruises here would create a Catalog <-> Cruises package cycle.
const cruisesRoutesRuntimePortReference = { id: "cruises.routes-runtime" } as const
const paymentAdapterRuntimePortReference = { id: "payments.adapter.runtime" } as const

const catalogAdminRuntime = {
  entry: "@voyant-travel/catalog-react/admin",
  export: "createCatalogAdminExtension",
} as const

const catalogIndexSubscriberRuntimeExports = {
  "product.created": "createCatalogProductCreatedIndexSubscriberGraphRuntime",
  "product.updated": "createCatalogProductUpdatedIndexSubscriberGraphRuntime",
  "product.deleted": "createCatalogProductDeletedIndexSubscriberGraphRuntime",
  "product.content.changed": "createCatalogProductContentChangedIndexSubscriberGraphRuntime",
  "availability.slot.changed": "createCatalogAvailabilityChangedIndexSubscriberGraphRuntime",
  "pricing.rule.changed": "createCatalogPricingChangedIndexSubscriberGraphRuntime",
  "product.publication.changed": "createCatalogPublicationChangedIndexSubscriberGraphRuntime",
  "promotion.changed": "createCatalogPromotionChangedIndexSubscriberGraphRuntime",
  "catalog.entity.overlay.changed": "createCatalogEntityOverlayChangedIndexSubscriberGraphRuntime",
} as const

/** Import-cheap deployment declaration owned by the catalog package. */
export const catalogVoyantModule = defineModule({
  id: "@voyant-travel/catalog",
  packageName: "@voyant-travel/catalog",
  localId: "catalog",
  requires: {
    ports: [
      requirePort(catalogIndexerProviderPort, { optional: true }),
      requirePort(catalogAccommodationsRuntimeExtensionPort),
      requirePort(catalogChartersRuntimeExtensionPort),
      requirePort(catalogCommerceRuntimeExtensionPort),
      requirePort(catalogDistributionRuntimeExtensionPort),
      requirePort(catalogCruisesRuntimeExtensionPort),
      requirePort(catalogSourcesRuntimeExtensionPort, { optional: true }),
      requirePort(catalogInventoryRuntimeExtensionPort),
      requirePort(catalogLegalRuntimeExtensionPort),
      requirePort(catalogOperationsRuntimeExtensionPort),
      requirePort(financeOperatorSettingsRuntimePort),
      { ...paymentAdapterRuntimePortReference, optional: true },
    ],
  },
  provides: {
    capabilities: ["catalog.data-owner"],
    ports: [
      providePort(catalogSearchRuntimePort),
      providePort(catalogContentRuntimePort),
      providePort(catalogProjectionRuntimePort),
      providePort(catalogBookingSnapshotRuntimePort),
      providePort(catalogBookingSessionMaintenanceJobRuntimePort),
      providePort(catalogBookingSessionSettlementRuntimePort),
      providePort(catalogCompositeBookingSessionRuntimePort),
      providePort(catalogInquiryBookingSessionRuntimePort),
      providePort(catalogRuntimeServicesPort),
      providePort(catalogReindexJobRuntimePort),
      providePort(catalogSourcesSyncJobRuntimePort),
      providePort(bookingsSupplierAmendmentRuntimePort),
      providePort(bookingActionSourceRuntimePort),
      cruisesRoutesRuntimePortReference,
    ],
  },
  runtimePorts: [
    requirePort(catalogSearchRuntimePort),
    requirePort(catalogProjectionRuntimePort),
    requirePort(catalogBookingSnapshotRuntimePort),
    requirePort(catalogBookingSessionMaintenanceJobRuntimePort),
    requirePort(catalogBookingSessionSettlementRuntimePort),
    requirePort(catalogCompositeBookingSessionRuntimePort),
    requirePort(catalogReindexJobRuntimePort),
    requirePort(catalogSourcesSyncJobRuntimePort),
  ],
  api: [
    {
      id: "@voyant-travel/catalog#api.admin",
      surface: "admin",
      mount: "catalog",
      openapi: { document: "catalog" },
      runtime: {
        entry: "@voyant-travel/catalog/graph-runtime",
        export: "createCatalogSearchVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/catalog#api.public",
      surface: "public",
      mount: "catalog",
      openapi: { document: "catalog" },
      anonymous: true,
      // Catalog search is the canonical publishable read.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/catalog/graph-runtime",
        export: "createCatalogSearchVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/catalog#schema",
      source: "@voyant-travel/catalog/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/catalog#migrations",
      source: "./migrations",
    },
  ],
  config: [
    {
      id: "@voyant-travel/catalog#config.booking-session-terminal-retention-days",
      key: "BOOKING_SESSION_TERMINAL_RETENTION_DAYS",
      required: false,
    },
    {
      id: "@voyant-travel/catalog#config.typesense-host",
      key: "TYPESENSE_HOST",
      required: false,
    },
    {
      id: "@voyant-travel/catalog#config.typesense-collection-prefix",
      key: "TYPESENSE_COLLECTION_PREFIX",
      required: false,
    },
    {
      id: "@voyant-travel/catalog#config.postgres-search-vector-strategy",
      key: "POSTGRES_SEARCH_VECTOR_STRATEGY",
      required: false,
    },
    {
      id: "@voyant-travel/catalog#config.postgres-search-typo-strategy",
      key: "POSTGRES_SEARCH_TYPO_STRATEGY",
      required: false,
    },
    {
      id: "@voyant-travel/catalog#config.postgres-search-text-strategy",
      key: "POSTGRES_SEARCH_TEXT_STRATEGY",
      required: false,
    },
  ],
  secrets: [
    {
      id: "@voyant-travel/catalog#secret.typesense-api-key",
      key: "TYPESENSE_API_KEY",
      required: false,
      description: "Typesense API key used by the selected catalog indexer provider.",
      rotation: "replace-only",
    },
    {
      id: "@voyant-travel/catalog#secret.postgres-search-cursor-signing-key",
      key: "POSTGRES_SEARCH_CURSOR_SIGNING_KEY",
      required: false,
      description: "HMAC key for opaque Postgres catalog-search pagination cursors.",
      rotation: "replace-only",
    },
  ],
  resources: [
    {
      id: "@voyant-travel/catalog#resource.database",
      kind: "database",
      required: true,
      config: { purpose: "catalog-search-projection" },
    },
  ],
  providers: [
    {
      id: "@voyant-travel/catalog#provider.postgres",
      port: "catalog.indexer",
      selection: { role: "search", value: "postgres" },
      uses: {
        resources: ["@voyant-travel/catalog#resource.database"],
        config: [
          "@voyant-travel/catalog#config.postgres-search-vector-strategy",
          "@voyant-travel/catalog#config.postgres-search-typo-strategy",
          "@voyant-travel/catalog#config.postgres-search-text-strategy",
        ],
        secrets: ["@voyant-travel/catalog#secret.postgres-search-cursor-signing-key"],
      },
      runtime: {
        entry: "@voyant-travel/catalog/indexer/postgres-provider",
        export: "createPostgresGraphIndexerProvider",
      },
      config: { engine: "postgres" },
    },
    {
      id: "@voyant-travel/catalog#provider.typesense",
      port: "catalog.indexer",
      selection: { role: "search", value: "typesense" },
      uses: {
        config: [
          "@voyant-travel/catalog#config.typesense-host",
          "@voyant-travel/catalog#config.typesense-collection-prefix",
        ],
        secrets: ["@voyant-travel/catalog#secret.typesense-api-key"],
      },
      runtime: {
        entry: "@voyant-travel/catalog/indexer/typesense-provider",
        export: "createTypesenseGraphIndexerProvider",
      },
      config: { engine: "typesense" },
    },
  ],
  events: [
    ...catalogEventDeclarations,
    {
      id: "@voyant-travel/catalog#event.entity.overlay-changed",
      eventType: "catalog.entity.overlay.changed",
      version: "1.0.0",
      payloadSchema: catalogOverlayChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "catalog", category: "domain" },
    },
  ],
  subscribers: [
    {
      ...catalogBookingSessionCreatedAnalyticsSubscriberDeclaration,
      runtime: {
        entry: "@voyant-travel/catalog/booking-session-created-analytics-subscriber",
        export: "createCatalogBookingSessionCreatedAnalyticsSubscriberGraphRuntime",
      },
    },
    ...catalogIndexSubscriberDeclarations.map((subscriber) => ({
      ...subscriber,
      runtime: {
        entry: "@voyant-travel/catalog/index-subscribers",
        export: catalogIndexSubscriberRuntimeExports[subscriber.eventType],
      },
    })),
    {
      ...catalogBookingSnapshotSubscriberDeclaration,
      runtime: {
        entry: "@voyant-travel/catalog/booking-snapshot-subscriber",
        export: "createCatalogBookingSnapshotSubscriberGraphRuntime",
      },
    },
  ],
  jobs: [
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
      // Sourced inventory only reaches catalog browse through a discovery
      // pass; the live book path resolves adapters on its own. Wakeable so a
      // newly added Connect connection can index without waiting for the tick.
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
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/catalog#access.catalog",
        resource: "catalog",
        label: "Catalog",
        description: "Read and search the selected product catalog.",
        actions: [
          {
            action: "read",
            label: "Read catalog entries",
            description: "Read individual catalog entries and their projections.",
          },
          {
            action: "search",
            label: "Search catalog",
            description: "Search catalog entries and product projections.",
          },
          {
            action: "quote",
            label: "Quote catalog entries",
            description: "Resolve and persist short-lived live catalog quotes.",
            sensitive: true,
          },
          {
            action: "booking-session-read",
            label: "Read Booking Sessions",
            description: "Inspect redacted Booking Session state with durable audit.",
            sensitive: true,
          },
          {
            action: "booking-session-write",
            label: "Manage Booking Sessions",
            description: "Perform admitted staff Booking Session lifecycle operations.",
            sensitive: true,
          },
          {
            action: "booking-session-retention",
            label: "Retain Booking Sessions",
            description: "Run expiry and PII-retention maintenance for Booking Sessions.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/catalog#tool.search-catalog",
      name: "search_catalog",
      runtime: { entry: "@voyant-travel/catalog/tools", export: "searchCatalogTool" },
      requiredScopes: ["catalog:search"],
      context: ["catalog"],
      risk: "low",
    },
    {
      id: "@voyant-travel/catalog#tool.get-catalog-entry",
      name: "get_catalog_entry",
      runtime: { entry: "@voyant-travel/catalog/tools", export: "getCatalogEntryTool" },
      requiredScopes: ["catalog:read"],
      context: ["catalog"],
      risk: "low",
    },
  ],
  webhooks: catalogWebhookDeclarations,
  admin: {
    compositionOrder: 2,
    runtime: {
      entry: "@voyant-travel/catalog-react/admin",
      export: "createSelectedCatalogAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/catalog#admin.copy",
        namespace: "catalog.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/catalog-react/i18n",
          export: "catalogUiMessageDefinitions",
        },
      },
    ],
    routes: (
      [
        ["index", "/catalog"],
        ["products-index", "/catalog/products"],
        ["products-detail", "/catalog/products/$productId"],
        ["excursions-index", "/catalog/excursions"],
        ["excursions-detail", "/catalog/excursions/$id"],
        ["tours-index", "/catalog/tours"],
        ["tours-detail", "/catalog/tours/$id"],
        ["activities-index", "/catalog/activities"],
        ["activities-detail", "/catalog/activities/$id"],
        ["attractions-index", "/catalog/attractions"],
        ["attractions-detail", "/catalog/attractions/$id"],
        ["events-index", "/catalog/events"],
        ["events-detail", "/catalog/events/$id"],
        ["transportation-index", "/catalog/transportation"],
        ["transportation-detail", "/catalog/transportation/$id"],
        ["cruises-index", "/catalog/cruises"],
        ["cruises-detail", "/catalog/cruises/$id"],
        ["accommodations-index", "/catalog/accommodations"],
        ["accommodations-detail", "/catalog/accommodations/$id"],
      ] as const
    ).map(([id, path]) => ({
      id: `@voyant-travel/catalog#admin.route.${id}`,
      path,
      requiredScopes: ["catalog:read"],
      runtime: catalogAdminRuntime,
    })),
    nav: [
      {
        id: "@voyant-travel/catalog#admin.nav.catalog",
        routeId: "@voyant-travel/catalog#admin.route.products-index",
        label: {
          namespace: "catalog.admin",
          key: "catalogPage.title",
        },
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

export const catalogBookingEngineVoyantModule = defineModule({
  id: "@voyant-travel/catalog#booking-engine",
  packageName: "@voyant-travel/catalog",
  localId: "catalog.booking-engine",
  requires: { capabilities: ["catalog.data-owner"] },
  provides: { ports: [providePort(catalogBookingRuntimePort)] },
  runtimePorts: [
    requirePort(catalogBookingRuntimePort),
    // Resolves the billing party for a verified guest, who has no account.
    // Optional: without it only authenticated customers can self-serve.
    requirePort(bookingsRelationshipsRuntimePort, { optional: true }),
    // Product analytics. Optional, and unbound is the intended default for a
    // self-hosted deployment: nothing here depends on an analytics vendor.
    requirePort(analyticsPort, { optional: true }),
  ],
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
      // Open, quote, hold and commit a Booking Session. Authority is the
      // session capability plus its revision and idempotency key, all of which
      // hold with nothing but a publishable key present.
      publishable: true,
      runtime: {
        entry: "@voyant-travel/catalog/graph-runtime",
        export: "createCatalogBookingVoyantRuntime",
      },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/catalog#booking-engine#tool.list-catalog-orders",
      name: "list_catalog_orders",
      runtime: {
        entry: "@voyant-travel/catalog/tools",
        export: "listCatalogOrdersTool",
      },
      requiredScopes: ["bookings:read"],
      context: ["catalogBooking"],
      risk: "high",
    },
    {
      id: "@voyant-travel/catalog#booking-engine#tool.get-catalog-order",
      name: "get_catalog_order",
      runtime: {
        entry: "@voyant-travel/catalog/tools",
        export: "getCatalogOrderTool",
      },
      requiredScopes: ["bookings:read"],
      context: ["catalogBooking"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/catalog#booking-engine#action.inspect-catalog-orders",
      version: "v1",
      kind: "sensitive-read",
      targetType: "catalog-order",
      resource: "bookings",
      action: "read",
      requiredScopes: ["bookings:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: {
        tools: [
          "@voyant-travel/catalog#booking-engine#tool.list-catalog-orders",
          "@voyant-travel/catalog#booking-engine#tool.get-catalog-order",
        ],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const catalogOffersVoyantPlugin = defineExtension({
  id: "@voyant-travel/catalog#offers-extension",
  packageName: "@voyant-travel/catalog",
  localId: "catalog.offers-extension",
  provides: { ports: [providePort(catalogOffersRuntimePort)] },
  runtimePorts: [requirePort(catalogOffersRuntimePort)],
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
  meta: {
    ownership: "package",
  },
})

export default catalogVoyantModule
