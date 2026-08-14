import { catalogChartersRuntimeExtensionPort } from "@voyant-travel/catalog/ports"
import { defineExtension, defineModule, providePort } from "@voyant-travel/core/project"

/** Import-cheap deployment declaration owned by the charters package. */
export const chartersVoyantModule = defineModule({
  id: "@voyant-travel/charters",
  packageName: "@voyant-travel/charters",
  localId: "charters",
  provides: { ports: [providePort(catalogChartersRuntimeExtensionPort)] },
  api: [
    {
      id: "@voyant-travel/charters#api.admin",
      surface: "admin",
      mount: "charters",
      transactional: true,
      openapi: { document: "charters" },
      runtime: {
        entry: "@voyant-travel/charters",
        export: "createChartersVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/charters#api.public",
      surface: "public",
      mount: "charters",
      anonymous: true,
      transactional: true,
      // Voyage/yacht content plus per-suite and whole-yacht price quotes.
      publishable: true,
      openapi: { document: "charters" },
      runtime: {
        entry: "@voyant-travel/charters",
        export: "createChartersVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/charters#schema",
      source: "@voyant-travel/charters/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/charters#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/charters#linkable.charter_product",
      kind: "linkable",
      source: "@voyant-travel/charters",
    },
    {
      id: "@voyant-travel/charters#linkable.charter_voyage",
      kind: "linkable",
      source: "@voyant-travel/charters",
    },
    {
      id: "@voyant-travel/charters#linkable.charter_yacht",
      kind: "linkable",
      source: "@voyant-travel/charters",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/charters#access.charters",
        resource: "charters",
        label: "Charters",
        description: "Charter products, yachts, voyages, availability, and pricing.",
        actions: [
          {
            action: "read",
            label: "View charters",
            description: "View charter products and related operational data.",
          },
          {
            action: "write",
            label: "Manage charters",
            description: "Create and update charter products and related operational data.",
          },
          {
            action: "delete",
            label: "Delete charters",
            description: "Delete or archive charter products and related records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    ...(
      [
        ["browse-charters", "browse_charters", "browseChartersTool"],
        ["get-charter-product", "get_charter_product", "getCharterProductTool"],
        ["get-charter-voyage", "get_charter_voyage", "getCharterVoyageTool"],
        ["get-charter-yacht", "get_charter_yacht", "getCharterYachtTool"],
        ["quote-charter-per-suite", "quote_charter_per_suite", "quoteCharterPerSuiteTool"],
        ["quote-charter-whole-yacht", "quote_charter_whole_yacht", "quoteCharterWholeYachtTool"],
      ] as const
    ).map(([id, name, exportName]) => ({
      id: `@voyant-travel/charters#tool.${id}`,
      name,
      runtime: { entry: "@voyant-travel/charters/tools", export: exportName },
      requiredScopes: ["charters:read"],
      context: ["charters"],
      risk: "low" as const,
    })),
    ...(
      [
        ["create-charter-product", "create_charter_product", "createCharterProductTool"],
        ["update-charter-product", "update_charter_product", "updateCharterProductTool"],
        ["upsert-charter-voyage", "upsert_charter_voyage", "upsertCharterVoyageTool"],
        ["update-charter-voyage", "update_charter_voyage", "updateCharterVoyageTool"],
        ["create-charter-yacht", "create_charter_yacht", "createCharterYachtTool"],
        ["update-charter-yacht", "update_charter_yacht", "updateCharterYachtTool"],
      ] as const
    ).map(([id, name, exportName]) => ({
      id: `@voyant-travel/charters#tool.${id}`,
      name,
      runtime: { entry: "@voyant-travel/charters/tools", export: exportName },
      requiredScopes: ["charters:write"],
      context: ["charters"],
      risk: "medium" as const,
    })),
  ],
  actions: [
    ...(
      [
        "browse-charters",
        "get-charter-product",
        "get-charter-voyage",
        "get-charter-yacht",
        "quote-charter-per-suite",
        "quote-charter-whole-yacht",
      ] as const
    ).map((id) => ({
      id: `@voyant-travel/charters#action.${id}`,
      version: "v1" as const,
      kind: "read" as const,
      targetType: "charter",
      requiredScopes: ["charters:read"],
      risk: "low" as const,
      ledger: "optional" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff" as const, "customer" as const],
      from: { tools: [`@voyant-travel/charters#tool.${id}`] },
    })),
    ...(
      [
        "update-charter-product",
        "upsert-charter-voyage",
        "update-charter-voyage",
        "update-charter-yacht",
      ] as const
    ).map((id) => ({
      id: `@voyant-travel/charters#action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType: "charter",
      ...(["update-charter-product", "update-charter-voyage", "update-charter-yacht"].includes(id)
        ? {
            commandTargetField: "id",
            availability: { status: "available" as const },
            effectBoundary: "local" as const,
            targetLifecycle: "existing" as const,
          }
        : {
            // "upsert-charter-voyage" dedupes on the (productId, departureDate,
            // yachtId) unique index and fully overwrites on a matching retry.
            // It has no client-supplied row id, but is anchored to the existing
            // charter product it belongs to.
            commandTargetField: "productId",
            availability: { status: "available" as const },
            effectBoundary: "local" as const,
            targetLifecycle: "existing" as const,
          }),
      requiredScopes: ["charters:write"],
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: true,
      allowedActorTypes: ["staff" as const],
      from: { tools: [`@voyant-travel/charters#tool.${id}`] },
    })),
    ...(
      [
        [
          "create-charter-product",
          "charter-product",
          "charter_product_create_command",
          "charter-product",
        ],
        ["create-charter-yacht", "charter-yacht", "charter_yacht_create_command", "charter-yacht"],
      ] as const
    ).map(([id, targetType, commandTargetType, resultReferenceType]) => ({
      id: `@voyant-travel/charters#action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType,
      requiredScopes: ["charters:write"],
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff" as const],
      availability: { status: "available" as const },
      effectBoundary: "local" as const,
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType,
        resultReferenceType,
        durability: "handler-command-claim-v1" as const,
      },
      from: { tools: [`@voyant-travel/charters#tool.${id}`] },
    })),
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const chartersBookingVoyantPlugin = defineExtension({
  id: "@voyant-travel/charters#booking-extension",
  packageName: "@voyant-travel/charters",
  localId: "charters.booking-extension",
  api: [
    {
      id: "@voyant-travel/charters#booking-extension.api.admin",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      runtime: {
        entry: "@voyant-travel/charters/booking-extension",
        export: "chartersBookingExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default chartersVoyantModule
