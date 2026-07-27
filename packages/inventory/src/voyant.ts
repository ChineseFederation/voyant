// agent-quality: file-size exception -- owner: inventory; the import-cheap package manifest keeps routes, events, actions, extensions, and runtime-port declarations co-located for deterministic graph review.
import { actionLedgerInventoryDriftRuntimePort } from "@voyant-travel/action-ledger/runtime-port"
import { bookingsInventoryRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { catalogInventoryRuntimeExtensionPort } from "@voyant-travel/catalog/ports"
import { catalogContentRuntimePort } from "@voyant-travel/catalog/runtime-port"
import { commerceInventoryRuntimePort } from "@voyant-travel/commerce/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { documentRendererPort } from "@voyant-travel/core/runtime-port"
import { financeInventoryPaymentPolicyRuntimePort } from "@voyant-travel/finance/runtime-port"
import { storageMediaRuntimePort } from "@voyant-travel/storage/runtime-port"
import { inventoryBrochureRuntimePort, inventoryRuntimePort } from "./runtime-ports.js"
import {
  productContentChangedPayloadSchema,
  productIdentityEventPayloadSchema,
} from "./voyant-event-schemas.js"

/** Import-cheap deployment declarations owned by the inventory package. */
export const inventoryVoyantModule = defineModule({
  id: "@voyant-travel/inventory",
  packageName: "@voyant-travel/inventory",
  localId: "inventory",
  runtimePorts: [
    requirePort(inventoryRuntimePort),
    requirePort(documentRendererPort, { optional: true }),
  ],
  provides: {
    capabilities: ["inventory.data-owner"],
    ports: [
      providePort(catalogInventoryRuntimeExtensionPort),
      providePort(commerceInventoryRuntimePort),
      providePort(actionLedgerInventoryDriftRuntimePort),
      providePort(bookingsInventoryRuntimePort),
      providePort(financeInventoryPaymentPolicyRuntimePort),
      providePort(inventoryRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/inventory#api.admin",
      surface: "admin",
      mount: "products",
      openapi: { document: "products" },
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/inventory#api.public",
      surface: "public",
      mount: "products",
      openapi: { document: "products" },
      anonymous: true,
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/inventory#schema",
      source: "@voyant-travel/inventory/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/inventory#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/inventory#linkable.product",
      kind: "linkable",
      source: "@voyant-travel/inventory/linkables",
    },
    {
      id: "@voyant-travel/inventory#link.organization-product",
      kind: "definition",
      source: "@voyant-travel/inventory/standard-links",
      export: "organizationProductLink",
    },
    {
      id: "@voyant-travel/inventory#link.person-product",
      kind: "definition",
      source: "@voyant-travel/inventory/standard-links",
      export: "personProductLink",
    },
  ],
  events: [
    {
      id: "@voyant-travel/inventory#event.product-created",
      eventType: "product.created",
      version: "1.0.0",
      payloadSchema: productIdentityEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "inventory", category: "domain" },
    },
    {
      id: "@voyant-travel/inventory#event.product-updated",
      eventType: "product.updated",
      version: "1.0.0",
      payloadSchema: productIdentityEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "inventory", category: "domain" },
    },
    {
      id: "@voyant-travel/inventory#event.product-deleted",
      eventType: "product.deleted",
      version: "1.0.0",
      payloadSchema: productIdentityEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "inventory", category: "domain" },
    },
    {
      id: "@voyant-travel/inventory#event.product-content-changed",
      eventType: "product.content.changed",
      version: "1.0.0",
      payloadSchema: productContentChangedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "inventory", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/inventory#access.products",
        resource: "products",
        label: "Products",
        description: "Read and manage inventory products and product content.",
        actions: [
          {
            action: "read",
            label: "Read products",
            description: "Read products, options, and product content.",
          },
          {
            action: "write",
            label: "Manage products",
            description: "Create and update products, options, and product content.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete products",
            description: "Delete inventory products and product-owned records.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/inventory#access.departures",
        resource: "departures",
        label: "Departures",
        description: "Read and manage scheduled product departures.",
        actions: [
          {
            action: "read",
            label: "Read departures",
            description: "Read scheduled product departure records.",
          },
          {
            action: "write",
            label: "Manage departures",
            description: "Create and update scheduled product departures.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/inventory#access.itineraries",
        resource: "itineraries",
        label: "Itineraries",
        description: "Read and manage product itinerary content.",
        actions: [
          {
            action: "read",
            label: "Read itineraries",
            description: "Read product itinerary records and content.",
          },
          {
            action: "write",
            label: "Manage itineraries",
            description: "Create and update product itinerary records and content.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/inventory#tool.list-products",
      name: "list_products",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "listProductsTool",
      },
      requiredScopes: ["products:read"],
      context: ["inventory"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#tool.get-product",
      name: "get_product",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "getProductTool",
      },
      requiredScopes: ["products:read"],
      context: ["inventory"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#tool.list-product-days",
      name: "list_product_days",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "listProductDaysTool",
      },
      requiredScopes: ["products:read"],
      context: ["inventory"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#tool.create-product",
      name: "create_product",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "createProductTool" },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#tool.update-product",
      name: "update_product",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "updateProductTool" },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#tool.update-product-day",
      name: "update_product_day",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "updateProductDayTool",
      },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#tool.publish-product",
      name: "publish_product",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "publishProductTool" },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#tool.unpublish-product",
      name: "unpublish_product",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "unpublishProductTool" },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#tool.archive-product",
      name: "archive_product",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "archiveProductTool" },
      requiredScopes: ["products:write"],
      context: ["inventory"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#options.tool.list-product-options",
      name: "list_product_options",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "listProductOptionsTool" },
      requiredScopes: ["products:read"],
      context: ["inventoryOptions"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#options.tool.get-product-option",
      name: "get_product_option",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "getProductOptionTool" },
      requiredScopes: ["products:read"],
      context: ["inventoryOptions"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#options.tool.create-product-option",
      name: "create_product_option",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "createProductOptionTool" },
      requiredScopes: ["products:write"],
      context: ["inventoryOptions"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#options.tool.update-product-option",
      name: "update_product_option",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "updateProductOptionTool" },
      requiredScopes: ["products:write"],
      context: ["inventoryOptions"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#options.tool.list-option-units",
      name: "list_option_units",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "listOptionUnitsTool" },
      requiredScopes: ["products:read"],
      context: ["inventoryOptions"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#options.tool.get-option-unit",
      name: "get_option_unit",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "getOptionUnitTool" },
      requiredScopes: ["products:read"],
      context: ["inventoryOptions"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#options.tool.create-option-unit",
      name: "create_option_unit",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "createOptionUnitTool" },
      requiredScopes: ["products:write"],
      context: ["inventoryOptions"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/inventory#options.tool.update-option-unit",
      name: "update_option_unit",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "updateOptionUnitTool" },
      requiredScopes: ["products:write"],
      context: ["inventoryOptions"],
      risk: "medium",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/inventory#action.list-products",
      version: "v1",
      kind: "read",
      targetType: "product",
      requiredScopes: ["products:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/inventory#tool.list-products"] },
    },
    {
      id: "@voyant-travel/inventory#action.get-product",
      version: "v1",
      kind: "read",
      targetType: "product",
      requiredScopes: ["products:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/inventory#tool.get-product"] },
    },
    {
      id: "@voyant-travel/inventory#action.list-product-days",
      version: "v1",
      kind: "read",
      targetType: "product",
      requiredScopes: ["products:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/inventory#tool.list-product-days"] },
    },
    {
      id: "@voyant-travel/inventory#action.create-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      requiredScopes: ["products:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/created-target-tools.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "product-create-command",
        resultReferenceType: "product",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/inventory#tool.create-product"] },
    },
    {
      id: "@voyant-travel/inventory#action.update-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      commandTargetField: "id",
      requiredScopes: ["products:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/inventory#tool.update-product"] },
    },
    {
      id: "@voyant-travel/inventory#action.update-product-day",
      version: "v1",
      kind: "execute",
      targetType: "product",
      commandTargetField: "id",
      requiredScopes: ["products:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/inventory#tool.update-product-day"] },
    },
    {
      id: "@voyant-travel/inventory#action.publish-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      commandTargetField: "id",
      requiredScopes: ["products:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/inventory#tool.publish-product"] },
    },
    {
      id: "@voyant-travel/inventory#action.unpublish-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      commandTargetField: "id",
      requiredScopes: ["products:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/inventory#tool.unpublish-product"] },
    },
    {
      id: "@voyant-travel/inventory#action.archive-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      commandTargetField: "id",
      requiredScopes: ["products:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/inventory#tool.archive-product"] },
    },
    ...(
      [
        ["list-product-options", "product_option"],
        ["get-product-option", "product_option"],
        ["list-option-units", "option_unit"],
        ["get-option-unit", "option_unit"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/inventory#options.action.${id}`,
      version: "v1" as const,
      kind: "read" as const,
      targetType,
      requiredScopes: ["products:read"],
      risk: "low" as const,
      ledger: "optional" as const,
      approval: "never" as const,
      reversible: false,
      from: { tools: [`@voyant-travel/inventory#options.tool.${id}`] },
    })),
    ...(
      [
        [
          "create-product-option",
          "product_option",
          "product-option-create-command",
          "product_option",
          { targetType: "product", targetIdField: "productId" },
        ],
        [
          "create-option-unit",
          "option_unit",
          "option-unit-create-command",
          "option_unit",
          { targetType: "product_option", targetIdField: "optionId" },
        ],
      ] as const
    ).map(([id, targetType, commandTargetType, resultReferenceType, parentAnchor]) => ({
      id: `@voyant-travel/inventory#options.action.${id}`,
      capabilityId: `@voyant-travel/inventory#options.action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType,
        resultReferenceType,
        durability: "handler-command-claim-v1" as const,
        parentAnchor,
      },
      requiredScopes: ["products:write"],
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: [`@voyant-travel/inventory#options.tool.${id}`] },
    })),
    ...(
      [
        ["update-product-option", "product_option"],
        ["update-option-unit", "option_unit"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/inventory#options.action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      commandTargetField: "id",
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "existing" as const,
      requiredScopes: ["products:write"],
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      from: { tools: [`@voyant-travel/inventory#options.tool.${id}`] },
    })),
  ],
  admin: {
    compositionOrder: 3,
    setupSteps: [{ id: "@voyant-travel/inventory#setup.first-product", skippable: true }],
    runtime: {
      entry: "@voyant-travel/inventory-react/admin",
      export: "createSelectedInventoryAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/inventory#admin.copy",
        namespace: "inventory.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/inventory-react/i18n",
          export: "productsUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/inventory#admin.route.products-index",
        path: "/products",
        requiredScopes: ["products:read"],
        runtime: {
          entry: "@voyant-travel/inventory-react/admin",
          export: "createInventoryAdminExtension",
        },
      },
      {
        id: "@voyant-travel/inventory#admin.route.products-categories",
        path: "/products/categories",
        requiredScopes: ["products:read"],
        runtime: {
          entry: "@voyant-travel/inventory-react/admin",
          export: "createInventoryAdminExtension",
        },
      },
      {
        id: "@voyant-travel/inventory#admin.route.products-detail",
        path: "/products/$id",
        requiredScopes: ["products:read"],
        runtime: {
          entry: "@voyant-travel/inventory-react/admin",
          export: "createInventoryAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/inventory#admin.nav.products",
        routeId: "@voyant-travel/inventory#admin.route.products-index",
        label: {
          namespace: "inventory.admin",
          key: "productsPage.title",
        },
      },
    ],
    slots: [
      {
        id: "product.details.option-extras",
        routeId: "@voyant-travel/inventory#admin.route.products-detail",
        contract: { productId: "string", optionId: "string" },
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

export const inventoryExtrasVoyantModule = defineModule({
  id: "@voyant-travel/inventory#extras",
  packageName: "@voyant-travel/inventory",
  localId: "inventory.extras",
  requires: { capabilities: ["inventory.data-owner"] },
  api: [
    {
      id: "@voyant-travel/inventory#extras.api",
      surface: "admin",
      mount: "extras",
      openapi: { document: "extras" },
      resource: "extras",
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryExtrasVoyantRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/inventory#extras.access.extras",
        resource: "extras",
        label: "Product extras",
        description: "Read and manage optional product extras and their prices.",
        actions: [
          {
            action: "read",
            label: "Read product extras",
            description: "Read optional product extras and pricing details.",
          },
          {
            action: "write",
            label: "Manage product extras",
            description: "Create and update optional product extras and prices.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete product extras",
            description: "Delete optional product extra records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/inventory#extras.tool.list-product-extras",
      name: "list_product_extras",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "listProductExtrasTool" },
      requiredScopes: ["extras:read"],
      context: ["inventoryExtras"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.get-product-extra",
      name: "get_product_extra",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "getProductExtraTool" },
      requiredScopes: ["extras:read"],
      context: ["inventoryExtras"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.create-product-extra",
      name: "create_product_extra",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "createProductExtraTool" },
      requiredScopes: ["extras:write"],
      context: ["inventoryExtras"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.update-product-extra",
      name: "update_product_extra",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "updateProductExtraTool" },
      requiredScopes: ["extras:write"],
      context: ["inventoryExtras"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.list-option-extra-configs",
      name: "list_option_extra_configs",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "listOptionExtraConfigsTool" },
      requiredScopes: ["extras:read"],
      context: ["inventoryExtras"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.get-option-extra-config",
      name: "get_option_extra_config",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "getOptionExtraConfigTool" },
      requiredScopes: ["extras:read"],
      context: ["inventoryExtras"],
      risk: "low",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.create-option-extra-config",
      name: "create_option_extra_config",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "createOptionExtraConfigTool" },
      requiredScopes: ["extras:write"],
      context: ["inventoryExtras"],
      risk: "high",
    },
    {
      id: "@voyant-travel/inventory#extras.tool.update-option-extra-config",
      name: "update_option_extra_config",
      runtime: { entry: "@voyant-travel/inventory/tools", export: "updateOptionExtraConfigTool" },
      requiredScopes: ["extras:write"],
      context: ["inventoryExtras"],
      risk: "high",
    },
  ],
  actions: [
    ...(
      [
        ["list-product-extras", "product_extra"],
        ["get-product-extra", "product_extra"],
        ["list-option-extra-configs", "option_extra_config"],
        ["get-option-extra-config", "option_extra_config"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/inventory#extras.action.${id}`,
      version: "v1" as const,
      kind: "read" as const,
      targetType,
      requiredScopes: ["extras:read"],
      risk: "low" as const,
      ledger: "optional" as const,
      approval: "never" as const,
      reversible: false,
      from: { tools: [`@voyant-travel/inventory#extras.tool.${id}`] },
    })),
    ...(
      [
        [
          "create-product-extra",
          "product_extra",
          "product-extra-create-command",
          "product_extra",
          { targetType: "product", targetIdField: "productId" },
        ],
        [
          "create-option-extra-config",
          "option_extra_config",
          "option-extra-config-create-command",
          "option_extra_config",
          {
            targetType: "product_extra",
            targetIdField: "productExtraId",
            relatedTargetIdField: "optionId",
          },
        ],
      ] as const
    ).map(([id, targetType, commandTargetType, resultReferenceType, parentAnchor]) => ({
      id: `@voyant-travel/inventory#extras.action.${id}`,
      capabilityId: `@voyant-travel/inventory#extras.action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType,
        resultReferenceType,
        durability: "handler-command-claim-v1" as const,
        parentAnchor,
      },
      requiredScopes: ["extras:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: [`@voyant-travel/inventory#extras.tool.${id}`] },
    })),
    ...(
      [
        ["update-product-extra", "product_extra"],
        ["update-option-extra-config", "option_extra_config"],
      ] as const
    ).map(([id, targetType]) => ({
      id: `@voyant-travel/inventory#extras.action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      commandTargetField: "id",
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "existing" as const,
      requiredScopes: ["extras:write"],
      risk: "high" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      from: { tools: [`@voyant-travel/inventory#extras.tool.${id}`] },
    })),
  ],
  meta: {
    ownership: "package",
  },
})

export const inventoryAuthoringVoyantPlugin = defineExtension({
  id: "@voyant-travel/inventory#authoring.extension",
  packageName: "@voyant-travel/inventory",
  localId: "inventory.authoring.extension",
  api: [
    {
      id: "@voyant-travel/inventory#authoring.extension.api",
      surface: "admin",
      mount: "products",
      openapi: { document: "inventory-authoring" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/inventory/authoring/extension",
        export: "inventoryAuthoringExtension",
      },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/inventory#authoring.tool.compose-product",
      name: "compose_product",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "composeProductTool",
      },
      requiredScopes: ["products:write"],
      context: ["inventoryAuthoring"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/inventory#authoring.action.compose-product",
      version: "v1",
      kind: "execute",
      targetType: "product",
      resource: "products",
      action: "write",
      requiredScopes: ["products:write"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "multistage",
      durability: {
        strategy: "outbox",
        testReference: "tests/integration/created-target-tools.test.ts",
      },
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "product-compose-command",
        resultReferenceType: "product",
        durability: "handler-command-claim-v1",
      },
      from: {
        tools: ["@voyant-travel/inventory#authoring.tool.compose-product"],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const inventoryBookingVoyantPlugin = defineExtension({
  id: "@voyant-travel/inventory#booking-extension",
  packageName: "@voyant-travel/inventory",
  localId: "inventory.booking-extension",
  api: [
    {
      id: "@voyant-travel/inventory#booking-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "inventory-booking" },
      runtime: {
        entry: "@voyant-travel/inventory/booking-extension",
        export: "productsBookingExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const inventoryContentVoyantPlugin = defineExtension({
  id: "@voyant-travel/inventory#content-extension",
  packageName: "@voyant-travel/inventory",
  localId: "inventory.content-extension",
  runtimePorts: [requirePort(catalogContentRuntimePort)],
  api: [
    {
      id: "@voyant-travel/inventory#content-extension.api.admin",
      surface: "admin",
      mount: "products",
      openapi: { document: "products" },
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryContentVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/inventory#content-extension.api.public",
      surface: "public",
      mount: "products",
      openapi: { document: "products" },
      anonymous: true,
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryContentVoyantRuntime",
      },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/inventory#content-extension.tool.get-product-content",
      name: "get_product_content",
      runtime: {
        entry: "@voyant-travel/inventory/tools",
        export: "getProductContentTool",
      },
      requiredScopes: ["products:read"],
      context: ["inventoryContent"],
      risk: "low",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/inventory#content-extension.action.get-product-content",
      version: "v1",
      kind: "read",
      targetType: "product",
      requiredScopes: ["products:read"],
      risk: "low",
      ledger: "optional",
      from: {
        tools: ["@voyant-travel/inventory#content-extension.tool.get-product-content"],
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const inventoryBrochureVoyantPlugin = defineExtension({
  id: "@voyant-travel/inventory#brochure-extension",
  packageName: "@voyant-travel/inventory",
  localId: "inventory.brochure-extension",
  provides: { ports: [providePort(inventoryBrochureRuntimePort)] },
  runtimePorts: [requirePort(inventoryBrochureRuntimePort), requirePort(storageMediaRuntimePort)],
  api: [
    {
      id: "@voyant-travel/inventory#brochure-extension.api.admin",
      surface: "admin",
      mount: "products",
      openapi: { document: "products" },
      runtime: {
        entry: "@voyant-travel/inventory/graph-runtime",
        export: "createInventoryBrochureVoyantRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default inventoryVoyantModule
