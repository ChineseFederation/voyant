import {
  catalogCruisesRuntimeExtensionPort,
  catalogRuntimeServicesPort,
} from "@voyant-travel/catalog/ports"
import { catalogContentRuntimePort } from "@voyant-travel/catalog/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { financeCruisesPaymentPolicyRuntimePort } from "@voyant-travel/finance/runtime-port"
import { cruisesExternalRefreshJobRuntimePort } from "./external-refresh-job.js"
import { cruisesRoutesRuntimePort } from "./runtime-port.js"

const cruiseLifecycleEventPayloadSchema = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false,
} as const

/** Import-cheap deployment declaration owned by the cruises package. */
export const cruisesVoyantModule = defineModule({
  id: "@voyant-travel/cruises",
  packageName: "@voyant-travel/cruises",
  localId: "cruises",
  provides: {
    ports: [
      providePort(catalogCruisesRuntimeExtensionPort),
      providePort(financeCruisesPaymentPolicyRuntimePort),
      providePort(cruisesExternalRefreshJobRuntimePort),
    ],
  },
  requires: { ports: [requirePort(catalogRuntimeServicesPort)] },
  runtimePorts: [
    requirePort(cruisesRoutesRuntimePort),
    requirePort(cruisesExternalRefreshJobRuntimePort),
  ],
  api: [
    {
      id: "@voyant-travel/cruises#api.admin",
      surface: "admin",
      mount: "cruises",
      transactional: true,
      openapi: { document: "cruises" },
      runtime: {
        entry: "@voyant-travel/cruises",
        export: "createCruisesVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/cruises#api.public",
      surface: "public",
      mount: "cruises",
      anonymous: true,
      transactional: true,
      openapi: { document: "cruises" },
      runtime: {
        entry: "@voyant-travel/cruises",
        export: "createCruisesVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/cruises#schema",
      source: "@voyant-travel/cruises/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/cruises#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/cruises#access.cruises",
        resource: "cruises",
        label: "Cruises",
        description: "Cruise products, ships, sailings, voyage groups, prices, and content.",
        actions: [
          {
            action: "read",
            label: "View cruises",
            description: "View cruise products and related operational data.",
          },
          {
            action: "write",
            label: "Manage cruises",
            description: "Create and update cruise products and related operational data.",
          },
          {
            action: "delete",
            label: "Delete cruises",
            description: "Delete or archive cruise products and related records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  links: [
    {
      id: "@voyant-travel/cruises#linkable.cruise",
      kind: "linkable",
      source: "@voyant-travel/cruises",
    },
    {
      id: "@voyant-travel/cruises#linkable.cruise_voyage_group",
      kind: "linkable",
      source: "@voyant-travel/cruises",
    },
    {
      id: "@voyant-travel/cruises#linkable.cruise_sailing",
      kind: "linkable",
      source: "@voyant-travel/cruises",
    },
    {
      id: "@voyant-travel/cruises#linkable.cruise_ship",
      kind: "linkable",
      source: "@voyant-travel/cruises",
    },
  ],
  events: [
    {
      id: "@voyant-travel/cruises#event.cruise-created",
      eventType: "cruise.created",
      version: "1.0.0",
      payloadSchema: cruiseLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "cruises", category: "domain" },
    },
    {
      id: "@voyant-travel/cruises#event.cruise-updated",
      eventType: "cruise.updated",
      version: "1.0.0",
      payloadSchema: cruiseLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "cruises", category: "domain" },
    },
    {
      id: "@voyant-travel/cruises#event.cruise-deleted",
      eventType: "cruise.deleted",
      version: "1.0.0",
      payloadSchema: cruiseLifecycleEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "cruises", category: "domain" },
    },
  ],
  jobs: [
    {
      id: "cruises.external-catalog-refresh",
      schedule: { cron: "30 3 * * *", overlap: "skip" },
      runtime: {
        entry: "@voyant-travel/cruises/external-refresh-job",
        export: "runCruisesExternalCatalogRefreshJob",
      },
    },
  ],
  tools: [
    ...(
      [
        ["search-cruises", "search_cruises", "searchCruisesTool"],
        ["get-cruise", "get_cruise", "getCruiseTool"],
        ["get-cruise-sailing", "get_cruise_sailing", "getCruiseSailingTool"],
        ["get-cruise-ship", "get_cruise_ship", "getCruiseShipTool"],
        ["quote-cruise-sailing", "quote_cruise_sailing", "quoteCruiseSailingTool"],
      ] as const
    ).map(([id, name, exportName]) => ({
      id: `@voyant-travel/cruises#tool.${id}`,
      name,
      runtime: { entry: "@voyant-travel/cruises/tools", export: exportName },
      requiredScopes: ["cruises:read"],
      context: ["cruises"],
      risk: "low" as const,
    })),
    ...(
      [
        ["create-cruise", "create_cruise", "createCruiseTool"],
        ["update-cruise", "update_cruise", "updateCruiseTool"],
        ["upsert-cruise-sailing", "upsert_cruise_sailing", "upsertCruiseSailingTool"],
        ["update-cruise-sailing", "update_cruise_sailing", "updateCruiseSailingTool"],
        ["create-cruise-ship", "create_cruise_ship", "createCruiseShipTool"],
        ["update-cruise-ship", "update_cruise_ship", "updateCruiseShipTool"],
      ] as const
    ).map(([id, name, exportName]) => ({
      id: `@voyant-travel/cruises#tool.${id}`,
      name,
      runtime: { entry: "@voyant-travel/cruises/tools", export: exportName },
      requiredScopes: ["cruises:write"],
      context: ["cruises"],
      risk: "medium" as const,
    })),
  ],
  actions: [
    ...(
      [
        "search-cruises",
        "get-cruise",
        "get-cruise-sailing",
        "get-cruise-ship",
        "quote-cruise-sailing",
      ] as const
    ).map((id) => ({
      id: `@voyant-travel/cruises#action.${id}`,
      version: "v1" as const,
      kind: "read" as const,
      targetType: "cruise",
      requiredScopes: ["cruises:read"],
      risk: "low" as const,
      ledger: "optional" as const,
      approval: "never" as const,
      reversible: false,
      allowedActorTypes: ["staff" as const, "customer" as const],
      from: { tools: [`@voyant-travel/cruises#tool.${id}`] },
    })),
    ...(
      [
        "create-cruise",
        "update-cruise",
        "upsert-cruise-sailing",
        "update-cruise-sailing",
        "update-cruise-ship",
      ] as const
    ).map((id) => ({
      id: `@voyant-travel/cruises#action.${id}`,
      version: "v1" as const,
      kind: "execute" as const,
      targetType: "cruise",
      ...(["update-cruise", "update-cruise-sailing", "update-cruise-ship"].includes(id)
        ? { commandTargetField: "id" }
        : {}),
      ...(id === "create-cruise"
        ? {
            availability: { status: "available" as const },
            targetLifecycle: "created" as const,
            createdTarget: {
              commandTargetType: "cruise_create_command",
              resultReferenceType: "cruise",
              durability: "handler-command-claim-v1" as const,
            },
            effectBoundary: "multistage" as const,
            durability: {
              strategy: "outbox" as const,
              testReference: "tests/integration/created-target-tools.test.ts",
            },
          }
        : {}),
      requiredScopes: ["cruises:write"],
      risk: "medium" as const,
      ledger: "required" as const,
      approval: "never" as const,
      reversible: id !== "create-cruise",
      allowedActorTypes: ["staff" as const],
      from: { tools: [`@voyant-travel/cruises#tool.${id}`] },
    })),
    {
      id: "@voyant-travel/cruises#action.create-cruise-ship",
      version: "v1",
      kind: "execute",
      targetType: "cruise-ship",
      requiredScopes: ["cruises:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "cruise_ship_create_command",
        resultReferenceType: "cruise-ship",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/cruises#tool.create-cruise-ship"] },
    },
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const cruisesContentVoyantPlugin = defineExtension({
  id: "@voyant-travel/cruises#content-extension",
  packageName: "@voyant-travel/cruises",
  localId: "cruises.content-extension",
  runtimePorts: [requirePort(catalogContentRuntimePort)],
  api: [
    {
      id: "@voyant-travel/cruises#content-extension.api.admin",
      surface: "admin",
      mount: "cruises",
      openapi: { document: "cruises" },
      runtime: {
        entry: "@voyant-travel/cruises/graph-runtime",
        export: "createCruisesContentVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/cruises#content-extension.api.public",
      surface: "public",
      mount: "cruises",
      anonymous: true,
      openapi: { document: "cruises" },
      runtime: {
        entry: "@voyant-travel/cruises/graph-runtime",
        export: "createCruisesContentVoyantRuntime",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export const cruisesBookingVoyantPlugin = defineExtension({
  id: "@voyant-travel/cruises#booking-extension",
  packageName: "@voyant-travel/cruises",
  localId: "cruises.booking-extension",
  api: [
    {
      id: "@voyant-travel/cruises#booking-extension.api.admin",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      runtime: {
        entry: "@voyant-travel/cruises/booking-extension",
        export: "cruisesBookingExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default cruisesVoyantModule
