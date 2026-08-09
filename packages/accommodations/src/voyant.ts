import { bookingsAccommodationRuntimePort } from "@voyant-travel/bookings/runtime-port"
import { catalogAccommodationsRuntimeExtensionPort } from "@voyant-travel/catalog/ports"
import { catalogContentRuntimePort } from "@voyant-travel/catalog/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import { financeAccommodationsPaymentPolicyRuntimePort } from "@voyant-travel/finance/runtime-port"

/** Import-cheap deployment declaration owned by the accommodations package. */
export const accommodationsVoyantModule = defineModule({
  id: "@voyant-travel/accommodations",
  packageName: "@voyant-travel/accommodations",
  localId: "accommodations",
  provides: {
    ports: [
      providePort(catalogAccommodationsRuntimeExtensionPort),
      providePort(bookingsAccommodationRuntimePort),
      providePort(financeAccommodationsPaymentPolicyRuntimePort),
    ],
  },
  api: [
    {
      id: "@voyant-travel/accommodations#api",
      surface: "admin",
      mount: "accommodations",
      transactional: true,
      openapi: { document: "accommodations" },
      runtime: {
        entry: "@voyant-travel/accommodations",
        export: "accommodationsApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/accommodations#schema",
      source: "@voyant-travel/accommodations/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/accommodations#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/accommodations#linkable.roomBlock",
      kind: "linkable",
      source: "@voyant-travel/accommodations/linkables",
    },
    {
      id: "@voyant-travel/accommodations#link.program-room-block",
      kind: "definition",
      source: "@voyant-travel/accommodations/standard-links",
      export: "programRoomBlockLink",
    },
    {
      id: "@voyant-travel/accommodations#link.room-block-property",
      kind: "definition",
      source: "@voyant-travel/accommodations/standard-links",
      export: "roomBlockPropertyLink",
    },
    {
      id: "@voyant-travel/accommodations#link.room-block-supplier",
      kind: "definition",
      source: "@voyant-travel/accommodations/standard-links",
      export: "roomBlockSupplierLink",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/accommodations#access.accommodations",
        resource: "accommodations",
        label: "Accommodations",
        description: "Accommodation room blocks and their managed content.",
        actions: [
          {
            action: "read",
            label: "View accommodations",
            description: "View accommodation room blocks and content.",
          },
          {
            action: "write",
            label: "Manage accommodations",
            description: "Create and update accommodation room blocks and content.",
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/accommodations#tool.search-owned-accommodations",
      name: "search_owned_accommodations",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "searchOwnedAccommodationsTool",
      },
      requiredScopes: ["accommodations:read"],
      context: ["accommodations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/accommodations#tool.quote-owned-accommodation-stay",
      name: "quote_owned_accommodation_stay",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "quoteOwnedAccommodationStayTool",
      },
      requiredScopes: ["accommodations:read"],
      context: ["accommodations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/accommodations#tool.get-room-block",
      name: "get_room_block",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "getRoomBlockTool",
      },
      requiredScopes: ["accommodations:read"],
      context: ["accommodations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/accommodations#tool.create-room-block",
      name: "create_room_block",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "createRoomBlockTool",
      },
      requiredScopes: ["accommodations:write"],
      context: ["accommodations"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/accommodations#tool.set-room-block-nights",
      name: "set_room_block_nights",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "setRoomBlockNightsTool",
      },
      requiredScopes: ["accommodations:write"],
      context: ["accommodations"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/accommodations#tool.pickup-room-block",
      name: "pickup_room_block",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "pickupRoomBlockTool",
      },
      requiredScopes: ["accommodations:write"],
      context: ["accommodations"],
      risk: "high",
    },
    {
      id: "@voyant-travel/accommodations#tool.reverse-room-block-pickup",
      name: "reverse_room_block_pickup",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "reverseRoomBlockPickupTool",
      },
      requiredScopes: ["accommodations:write"],
      context: ["accommodations"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/accommodations#action.search-owned-accommodations",
      version: "v1",
      kind: "read",
      targetType: "accommodation-stay",
      requiredScopes: ["accommodations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/accommodations#tool.search-owned-accommodations"] },
    },
    {
      id: "@voyant-travel/accommodations#action.quote-owned-accommodation-stay",
      version: "v1",
      kind: "read",
      targetType: "accommodation-stay",
      requiredScopes: ["accommodations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/accommodations#tool.quote-owned-accommodation-stay"] },
    },
    {
      id: "@voyant-travel/accommodations#action.get-room-block",
      version: "v1",
      kind: "read",
      targetType: "room-block",
      requiredScopes: ["accommodations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/accommodations#tool.get-room-block"] },
    },
    {
      id: "@voyant-travel/accommodations#action.create-room-block",
      version: "v1",
      kind: "execute",
      targetType: "room-block",
      requiredScopes: ["accommodations:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "room-block-create-command",
        resultReferenceType: "room-block",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/accommodations#tool.create-room-block"] },
    },
    {
      id: "@voyant-travel/accommodations#action.set-room-block-nights",
      version: "v1",
      kind: "execute",
      targetType: "room-block-night",
      requiredScopes: ["accommodations:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/accommodations#tool.set-room-block-nights"] },
    },
    {
      id: "@voyant-travel/accommodations#action.pickup-room-block",
      version: "v1",
      kind: "execute",
      targetType: "room-block-pickup",
      requiredScopes: ["accommodations:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-unclaimed-create-target",
      },
      from: { tools: ["@voyant-travel/accommodations#tool.pickup-room-block"] },
    },
    {
      id: "@voyant-travel/accommodations#action.reverse-room-block-pickup",
      capabilityId: "@voyant-travel/accommodations#action.reverse-room-block-pickup",
      version: "v1",
      kind: "execute",
      targetType: "room-block",
      commandTargetField: "blockId",
      requiredScopes: ["accommodations:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      from: { tools: ["@voyant-travel/accommodations#tool.reverse-room-block-pickup"] },
    },
  ],
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const accommodationsContentVoyantPlugin = defineExtension({
  id: "@voyant-travel/accommodations#content-extension",
  packageName: "@voyant-travel/accommodations",
  localId: "accommodations.content-extension",
  runtimePorts: [requirePort(catalogContentRuntimePort)],
  api: [
    {
      id: "@voyant-travel/accommodations#content-extension.api.admin",
      surface: "admin",
      mount: "accommodations",
      openapi: { document: "accommodations" },
      runtime: {
        entry: "@voyant-travel/accommodations/graph-runtime",
        export: "createAccommodationsContentVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/accommodations#content-extension.api.public",
      surface: "public",
      mount: "accommodations",
      anonymous: true,
      openapi: { document: "accommodations-content-public" },
      runtime: {
        entry: "@voyant-travel/accommodations/graph-runtime",
        export: "createAccommodationsContentVoyantRuntime",
      },
    },
  ],
  tools: [
    {
      id: "@voyant-travel/accommodations#tool.get-accommodation-content",
      name: "get_accommodation_content",
      runtime: {
        entry: "@voyant-travel/accommodations/tools",
        export: "getAccommodationContentTool",
      },
      requiredScopes: ["accommodations:read"],
      context: ["accommodations"],
      risk: "low",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/accommodations#action.get-accommodation-content",
      version: "v1",
      kind: "read",
      targetType: "accommodation-content",
      requiredScopes: ["accommodations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/accommodations#tool.get-accommodation-content"] },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default accommodationsVoyantModule
