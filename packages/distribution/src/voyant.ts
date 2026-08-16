// agent-quality: file-size exception -- distribution manifest centralizes ports, events, subscribers, jobs, and deployment-owned links.
import {
  catalogDistributionRuntimeExtensionPort,
  catalogProjectionRuntimePort,
  catalogPublicationRuntimePort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/ports"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { financeDistributionPaymentPolicyRuntimePort } from "@voyant-travel/finance/runtime-port"
import { channelPushRuntimePort } from "./channel-push/runtime-port.js"
import { distributionPublicationIntentWorkerRuntimePort } from "./publication-intent-runtime-port.js"
import {
  channelLifecycleEventPayloadSchema,
  channelProductMappingChangedEventPayloadSchema,
  productPublicationChangedEventPayloadSchema,
  productSupplierReassignedEventPayloadSchema,
  supplierLifecycleEventPayloadSchema,
} from "./voyant-event-schemas.js"
import {
  distributionBookingVoyantExtensionDefinition,
  distributionChannelPushVoyantExtensionDefinition,
} from "./voyant-extensions.js"

const publicationIntentSubscriberRuntimeExports = {
  "product.created": "createPublicationProductCreatedIntentSubscriberGraphRuntime",
  "product.updated": "createPublicationProductUpdatedIntentSubscriberGraphRuntime",
  "product.deleted": "createPublicationProductDeletedIntentSubscriberGraphRuntime",
  "supplier.created": "createPublicationSupplierCreatedIntentSubscriberGraphRuntime",
  "supplier.updated": "createPublicationSupplierUpdatedIntentSubscriberGraphRuntime",
  "supplier.deleted": "createPublicationSupplierDeletedIntentSubscriberGraphRuntime",
  "channel.created": "createPublicationChannelCreatedIntentSubscriberGraphRuntime",
  "channel.updated": "createPublicationChannelUpdatedIntentSubscriberGraphRuntime",
  "channel.deleted": "createPublicationChannelDeletedIntentSubscriberGraphRuntime",
  "product.supplier.reassigned": "createPublicationSupplierReassignedIntentSubscriberGraphRuntime",
} as const

const publicationIntentSubscriberEvents = Object.keys(
  publicationIntentSubscriberRuntimeExports,
) as Array<keyof typeof publicationIntentSubscriberRuntimeExports>

export const distributionBookingVoyantPlugin = defineExtension({
  ...distributionBookingVoyantExtensionDefinition,
  id: "@voyant-travel/distribution#extension",
})
export const distributionChannelPushVoyantPlugin = defineExtension({
  ...distributionChannelPushVoyantExtensionDefinition,
  id: "@voyant-travel/distribution#channel-push-extension",
})

/** Import-cheap deployment declarations owned by the distribution package. */
export const distributionVoyantModule = defineModule({
  id: "@voyant-travel/distribution",
  packageName: "@voyant-travel/distribution",
  localId: "distribution",
  provides: {
    capabilities: ["distribution.data-owner"],
    ports: [
      providePort(channelPushRuntimePort),
      providePort(catalogDistributionRuntimeExtensionPort),
      providePort(catalogPublicationRuntimePort),
      providePort(distributionPublicationIntentWorkerRuntimePort),
      providePort(financeDistributionPaymentPolicyRuntimePort),
    ],
  },
  requires: {
    ports: [requirePort(catalogRuntimeServicesPort), requirePort(catalogProjectionRuntimePort)],
  },
  // The wakeup job resolves the worker runtime through its graph factory.
  // Providing the port makes the deployment provider available; declaring it
  // here also authorizes this module's job runtime to request that provider.
  runtimePorts: [requirePort(distributionPublicationIntentWorkerRuntimePort)],
  api: [
    {
      id: "@voyant-travel/distribution#api.external-refs",
      surface: "admin",
      mount: "external-refs",
      openapi: { document: "external-refs" },
      runtime: {
        entry: "@voyant-travel/distribution",
        export: "externalRefsApiModule",
      },
    },
    {
      id: "@voyant-travel/distribution#api",
      surface: "admin",
      mount: "distribution",
      openapi: { document: "distribution" },
      runtime: {
        entry: "@voyant-travel/distribution",
        export: "distributionApiModule",
      },
    },
    {
      id: "@voyant-travel/distribution#api.suppliers",
      surface: "admin",
      mount: "suppliers",
      openapi: { document: "suppliers" },
      runtime: {
        entry: "@voyant-travel/distribution",
        export: "suppliersApiModule",
      },
    },
  ],
  jobs: [
    {
      id: "distribution.publication-reindex-intents",
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/distribution/publication-intent-worker",
        export: "runDistributionPublicationIntentWorkerJob",
      },
    },
  ],
  subscribers: publicationIntentSubscriberEvents.map((eventType) => ({
    id: `@voyant-travel/distribution#subscriber.publication-intent-${eventType.replaceAll(".", "-")}`,
    eventType,
    source: "@voyant-travel/distribution/publication-intent-subscribers",
    runtime: {
      entry: "@voyant-travel/distribution/publication-intent-subscribers",
      export: publicationIntentSubscriberRuntimeExports[eventType],
    },
  })),
  schema: [
    {
      id: "@voyant-travel/distribution#schema",
      source: "@voyant-travel/distribution/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/distribution#migrations",
      source: "./migrations",
    },
  ],
  setupMigrations: [
    {
      id: "@voyant-travel/distribution#setup.publication-catalog-backfill.v1",
      source: "@voyant-travel/distribution/setup/publication-catalog-backfill",
      runtime: {
        entry: "@voyant-travel/distribution/setup/publication-catalog-backfill",
        export: "runPublicationCatalogBackfillSetupMigration",
      },
      dependsOn: ["@voyant-travel/distribution#migrations"],
    },
    {
      id: "@voyant-travel/distribution#setup.publication-source-backfill.v1",
      source: "@voyant-travel/distribution/setup/publication-source-backfill",
      runtime: {
        entry: "@voyant-travel/distribution/setup/publication-source-backfill",
        export: "runPublicationSourceBackfillSetupMigration",
      },
      // Reads Catalog's sourced-entry store, so it must run after Catalog has
      // created it — otherwise the backfill finds nothing and every connected
      // supplier silently drops out of the storefront.
      dependsOn: ["@voyant-travel/catalog#migrations", "@voyant-travel/distribution#migrations"],
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/distribution#access.external-refs",
        resource: "external-refs",
        label: "External references",
        description: "Mappings between Voyant records and identifiers in external systems.",
        actions: [
          {
            action: "read",
            label: "View external references",
            description: "View external-system identifier mappings.",
          },
          {
            action: "write",
            label: "Manage external references",
            description: "Create and update external-system identifier mappings.",
          },
          {
            action: "delete",
            label: "Delete external references",
            description: "Delete external-system identifier mappings.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/distribution#access.distribution",
        resource: "distribution",
        label: "Distribution",
        description: "Channels, contracts, mappings, inventory, settlements, and delivery state.",
        actions: [
          {
            action: "read",
            label: "View distribution",
            description: "View channel configuration, mappings, inventory, and delivery state.",
          },
          {
            action: "write",
            label: "Manage distribution",
            description: "Create, update, reconcile, and retry distribution records.",
          },
          {
            action: "delete",
            label: "Delete distribution records",
            description: "Delete supported channel, mapping, inventory, and settlement records.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/distribution#access.suppliers",
        resource: "suppliers",
        label: "Suppliers",
        description: "Supplier profiles, contacts, services, rates, notes, and commercial terms.",
        actions: [
          {
            action: "read",
            label: "View suppliers",
            description: "View supplier profiles and related commercial records.",
          },
          {
            action: "write",
            label: "Manage suppliers",
            description: "Create and update supplier profiles and related commercial records.",
          },
          {
            action: "delete",
            label: "Delete supplier records",
            description: "Delete suppliers and supported supplier-owned records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/distribution#tool.list-suppliers",
      name: "list_suppliers",
      runtime: { entry: "@voyant-travel/distribution/tools", export: "listSuppliersTool" },
      requiredScopes: ["suppliers:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.get-supplier",
      name: "get_supplier",
      runtime: { entry: "@voyant-travel/distribution/tools", export: "getSupplierTool" },
      requiredScopes: ["suppliers:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.get-supplier-aggregates",
      name: "get_supplier_aggregates",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "getSupplierAggregatesTool",
      },
      requiredScopes: ["suppliers:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.create-supplier",
      name: "create_supplier",
      runtime: { entry: "@voyant-travel/distribution/tools", export: "createSupplierTool" },
      requiredScopes: ["suppliers:write"],
      context: ["distribution"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/distribution#tool.update-supplier",
      name: "update_supplier",
      runtime: { entry: "@voyant-travel/distribution/tools", export: "updateSupplierTool" },
      requiredScopes: ["suppliers:write"],
      context: ["distribution"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/distribution#tool.list-channels",
      name: "list_distribution_channels",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "listDistributionChannelsTool",
      },
      requiredScopes: ["distribution:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.get-channel",
      name: "get_distribution_channel",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "getDistributionChannelTool",
      },
      requiredScopes: ["distribution:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.create-channel",
      name: "create_distribution_channel",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "createDistributionChannelTool",
      },
      requiredScopes: ["distribution:write"],
      context: ["distribution"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/distribution#tool.update-channel",
      name: "update_distribution_channel",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "updateDistributionChannelTool",
      },
      requiredScopes: ["distribution:write"],
      context: ["distribution"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/distribution#tool.list-external-references",
      name: "list_external_references",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "listExternalReferencesTool",
      },
      requiredScopes: ["external-refs:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.get-external-reference",
      name: "get_external_reference",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "getExternalReferenceTool",
      },
      requiredScopes: ["external-refs:read"],
      context: ["distribution"],
      risk: "high",
    },
    {
      id: "@voyant-travel/distribution#tool.create-external-reference",
      name: "create_external_reference",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "createExternalReferenceTool",
      },
      requiredScopes: ["external-refs:write"],
      context: ["distribution"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/distribution#tool.update-external-reference",
      name: "update_external_reference",
      runtime: {
        entry: "@voyant-travel/distribution/tools",
        export: "updateExternalReferenceTool",
      },
      requiredScopes: ["external-refs:write"],
      context: ["distribution"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/distribution#action.list-suppliers",
      version: "v1",
      kind: "sensitive-read",
      targetType: "supplier",
      requiredScopes: ["suppliers:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.list-suppliers"] },
    },
    {
      id: "@voyant-travel/distribution#action.get-supplier",
      version: "v1",
      kind: "sensitive-read",
      targetType: "supplier",
      requiredScopes: ["suppliers:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.get-supplier"] },
    },
    {
      id: "@voyant-travel/distribution#action.get-supplier-aggregates",
      version: "v1",
      kind: "sensitive-read",
      targetType: "supplier-aggregate",
      requiredScopes: ["suppliers:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.get-supplier-aggregates"] },
    },
    {
      id: "@voyant-travel/distribution#action.create-supplier",
      version: "v1",
      kind: "execute",
      targetType: "supplier",
      requiredScopes: ["suppliers:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "supplier_create_command",
        resultReferenceType: "supplier",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/distribution#tool.create-supplier"] },
    },
    {
      id: "@voyant-travel/distribution#action.update-supplier",
      version: "v1",
      kind: "execute",
      targetType: "supplier",
      commandTargetField: "id",
      requiredScopes: ["suppliers:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/distribution#tool.update-supplier"] },
    },
    {
      id: "@voyant-travel/distribution#action.list-channels",
      version: "v1",
      kind: "sensitive-read",
      targetType: "distribution-channel",
      requiredScopes: ["distribution:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.list-channels"] },
    },
    {
      id: "@voyant-travel/distribution#action.get-channel",
      version: "v1",
      kind: "sensitive-read",
      targetType: "distribution-channel",
      requiredScopes: ["distribution:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.get-channel"] },
    },
    {
      id: "@voyant-travel/distribution#action.create-channel",
      version: "v1",
      kind: "execute",
      targetType: "distribution-channel",
      requiredScopes: ["distribution:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "distribution_channel_create_command",
        resultReferenceType: "distribution-channel",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/distribution#tool.create-channel"] },
    },
    {
      id: "@voyant-travel/distribution#action.update-channel",
      version: "v1",
      kind: "execute",
      targetType: "distribution-channel",
      commandTargetField: "id",
      requiredScopes: ["distribution:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/distribution#tool.update-channel"] },
    },
    {
      id: "@voyant-travel/distribution#action.list-external-references",
      version: "v1",
      kind: "sensitive-read",
      targetType: "external-reference",
      requiredScopes: ["external-refs:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.list-external-references"] },
    },
    {
      id: "@voyant-travel/distribution#action.get-external-reference",
      version: "v1",
      kind: "sensitive-read",
      targetType: "external-reference",
      requiredScopes: ["external-refs:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/distribution#tool.get-external-reference"] },
    },
    {
      id: "@voyant-travel/distribution#action.create-external-reference",
      capabilityId: "@voyant-travel/distribution#action.create-external-reference",
      version: "v1",
      kind: "execute",
      targetType: "external-reference",
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "external-reference-create-command",
        resultReferenceType: "external_reference",
        durability: "handler-command-claim-v1",
        parentAnchor: { targetTypeField: "entityType", targetIdField: "entityId" },
      },
      requiredScopes: ["external-refs:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/distribution#tool.create-external-reference"] },
    },
    {
      id: "@voyant-travel/distribution#action.update-external-reference",
      version: "v1",
      kind: "execute",
      targetType: "external-reference",
      commandTargetField: "id",
      requiredScopes: ["external-refs:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/distribution#tool.update-external-reference"] },
    },
  ],
  links: [
    {
      id: "@voyant-travel/distribution#linkable.channel",
      kind: "linkable",
      source: "@voyant-travel/distribution/linkables",
    },
    {
      id: "@voyant-travel/distribution#linkable.supplier",
      kind: "linkable",
      source: "@voyant-travel/distribution/linkables",
    },
  ],
  events: [
    {
      id: "@voyant-travel/distribution#event.product-publication-changed",
      eventType: "product.publication.changed",
      version: "1.0.0",
      payloadSchema: productPublicationChangedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.channel-product-mapping-changed",
      eventType: "channel.product_mapping.changed",
      version: "1.0.0",
      payloadSchema: channelProductMappingChangedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.supplier-created",
      eventType: "supplier.created",
      version: "1.0.0",
      payloadSchema: supplierLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.supplier-updated",
      eventType: "supplier.updated",
      version: "1.0.0",
      payloadSchema: supplierLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.supplier-deleted",
      eventType: "supplier.deleted",
      version: "1.0.0",
      payloadSchema: supplierLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.channel-created",
      eventType: "channel.created",
      version: "1.0.0",
      payloadSchema: channelLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.channel-updated",
      eventType: "channel.updated",
      version: "1.0.0",
      payloadSchema: channelLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.channel-deleted",
      eventType: "channel.deleted",
      version: "1.0.0",
      payloadSchema: channelLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
    {
      id: "@voyant-travel/distribution#event.product-supplier-reassigned",
      eventType: "product.supplier.reassigned",
      version: "1.0.0",
      payloadSchema: productSupplierReassignedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "distribution", category: "domain" },
    },
  ],
  admin: {
    compositionOrder: 30,
    runtime: {
      entry: "@voyant-travel/distribution-react/admin",
      export: "createSelectedDistributionAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/distribution#admin.copy",
        namespace: "distribution.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/distribution-react/i18n",
          export: "distributionUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/distribution#admin.route.suppliers-index",
        path: "/suppliers",
        requiredScopes: ["suppliers:read"],
        runtime: {
          entry: "@voyant-travel/distribution-react/admin",
          export: "createDistributionAdminExtension",
        },
      },
      {
        id: "@voyant-travel/distribution#admin.route.suppliers-detail",
        path: "/suppliers/$id",
        requiredScopes: ["suppliers:read"],
        runtime: {
          entry: "@voyant-travel/distribution-react/admin",
          export: "createDistributionAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/distribution#admin.nav.suppliers",
        routeId: "@voyant-travel/distribution#admin.route.suppliers-index",
        label: { namespace: "operator.admin.navigation", key: "nav.suppliers" },
      },
    ],
    slots: [
      {
        id: "supplier.details.payment-policy",
        routeId: "@voyant-travel/distribution#admin.route.suppliers-detail",
        contract: { supplierId: "string" },
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

export default distributionVoyantModule
