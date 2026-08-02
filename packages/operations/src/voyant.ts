import {
  bookingActionProjectionRuntimePort,
  bookingActionSourceRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import { catalogOperationsRuntimeExtensionPort } from "@voyant-travel/catalog/ports"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"

import { operationsExpiredHoldsJobRuntimePort } from "./expired-holds-job-runtime-port.js"

const operationsAdminRuntime = {
  entry: "@voyant-travel/operations-react/admin",
  export: "createOperationsAdminExtension",
} as const

const availabilitySlotChangedEventPayloadSchema = {
  type: "object",
  properties: {
    slotId: { type: "string" },
    productId: { type: "string" },
    optionId: { type: ["string", "null"] },
    startsAt: { type: "string", format: "date-time" },
    remainingPax: { type: ["number", "null"] },
    unlimited: { type: "boolean" },
    source: {
      type: "string",
      enum: ["booking", "cancel", "expire", "modify", "manual", "refresh", "created", "deleted"],
    },
  },
  required: ["slotId", "productId", "optionId", "startsAt", "remainingPax", "unlimited", "source"],
  additionalProperties: false,
} as const

/** Import-cheap deployment declaration owned by the operations package. */
export const operationsVoyantModule = defineModule({
  id: "@voyant-travel/operations",
  packageName: "@voyant-travel/operations",
  localId: "operations",
  provides: {
    capabilities: ["operations.data-owner"],
    ports: [
      providePort(catalogOperationsRuntimeExtensionPort),
      providePort(operationsExpiredHoldsJobRuntimePort),
      providePort(bookingActionProjectionRuntimePort),
    ],
  },
  // The reaper resolves this port at run time, so the module has to declare it
  // as a requirement as well as provide it. Providing alone composes fine and
  // then fails only when the job actually fires:
  // `composeVoyantGraphRuntime: module "@voyant-travel/operations" requested
  // undeclared port "operations.expired-holds-job"`.
  runtimePorts: [
    requirePort(operationsExpiredHoldsJobRuntimePort),
    requirePort(bookingActionProjectionRuntimePort),
    requirePort(bookingActionSourceRuntimePort, { optional: true, cardinality: "many" }),
  ],
  jobs: [
    {
      id: "operations.release-expired-availability-holds",
      schedule: { cron: "*/5 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { cron: "* * * * *", overlap: "skip" },
          economical: { cron: "*/15 * * * *", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/operations/expired-holds-job",
        export: "runOperationsReleaseExpiredHoldsJob",
      },
    },
    {
      id: "operations.project-booking-actions",
      schedule: { cron: "*/5 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { cron: "* * * * *", overlap: "skip" },
          economical: { cron: "*/15 * * * *", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/operations/booking-actions-job",
        export: "runBookingActionIncrementalProjectionJob",
      },
    },
    {
      id: "operations.rebuild-booking-actions",
      schedule: { cron: "17 2 * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { cron: "17 2 * * *", overlap: "skip" },
          economical: { cron: "17 2 * * *", overlap: "skip" },
          "scale-to-zero": { cron: "17 2 * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/operations/booking-actions-job",
        export: "runBookingActionProjectionRebuildJob",
      },
    },
  ],
  api: [
    {
      id: "@voyant-travel/operations#api.admin",
      surface: "admin",
      mount: "operations",
      openapi: { document: "operations" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/operations",
        export: "createOperationsVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/operations#schema",
      source: "@voyant-travel/operations/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/operations#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/operations#linkable.departure",
      kind: "linkable",
      source: "@voyant-travel/operations/linkables",
    },
    {
      id: "@voyant-travel/operations#linkable.facility",
      kind: "linkable",
      source: "@voyant-travel/operations/linkables",
    },
    {
      id: "@voyant-travel/operations#linkable.functionSpace",
      kind: "linkable",
      source: "@voyant-travel/operations/linkables",
    },
    {
      id: "@voyant-travel/operations#linkable.property",
      kind: "linkable",
      source: "@voyant-travel/operations/linkables",
    },
    {
      id: "@voyant-travel/operations#linkable.spaceBlock",
      kind: "linkable",
      source: "@voyant-travel/operations/linkables",
    },
  ],
  events: [
    {
      id: "@voyant-travel/operations#event.availability-slot-changed",
      eventType: "availability.slot.changed",
      version: "1.0.0",
      payloadSchema: availabilitySlotChangedEventPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "operations", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/operations#access.operations",
        resource: "operations",
        label: "Operations",
        description: "Availability, resources, facilities, properties, and ground operations.",
        actions: [
          {
            action: "read",
            label: "View operations",
            description: "View availability and operational resources, places, and services.",
          },
          {
            action: "write",
            label: "Manage operations",
            description: "Create and update availability and operational records.",
          },
          {
            action: "delete",
            label: "Delete operational records",
            description: "Delete supported availability, resource, place, and service records.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/operations#tool.get-availability-overview",
      name: "get_availability_overview",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "getAvailabilityOverviewTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.get-availability-aggregates",
      name: "get_availability_aggregates",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "getAvailabilityAggregatesTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.list-availability-rules",
      name: "list_availability_rules",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "listAvailabilityRulesTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.get-availability-rule",
      name: "get_availability_rule",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "getAvailabilityRuleTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.list-availability-start-times",
      name: "list_availability_start_times",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "listAvailabilityStartTimesTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.create-departure",
      name: "create_departure",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "createDepartureTool",
      },
      requiredScopes: ["operations:write"],
      context: ["operations"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/operations#tool.update-departure",
      name: "update_departure",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "updateDepartureTool",
      },
      requiredScopes: ["operations:write"],
      context: ["operations"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/operations#tool.rebuild-booking-actions",
      name: "rebuild_booking_actions",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "rebuildBookingActionsTool",
      },
      requiredScopes: ["operations:write"],
      context: ["operations"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/operations#tool.list-departures",
      name: "list_departures",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "listDeparturesTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.get-departure",
      name: "get_departure",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "getDepartureTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
    {
      id: "@voyant-travel/operations#tool.list-availability-closeouts",
      name: "list_availability_closeouts",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "listAvailabilityCloseoutsTool",
      },
      requiredScopes: ["operations:read"],
      context: ["operations"],
      risk: "low",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/operations#action.get-availability-overview",
      version: "v1",
      kind: "read",
      targetType: "availability-overview",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.get-availability-overview"] },
    },
    {
      id: "@voyant-travel/operations#action.get-availability-aggregates",
      version: "v1",
      kind: "read",
      targetType: "availability-aggregate",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.get-availability-aggregates"] },
    },
    {
      id: "@voyant-travel/operations#action.list-availability-rules",
      version: "v1",
      kind: "read",
      targetType: "availability-rule",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.list-availability-rules"] },
    },
    {
      id: "@voyant-travel/operations#action.get-availability-rule",
      version: "v1",
      kind: "read",
      targetType: "availability-rule",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.get-availability-rule"] },
    },
    {
      id: "@voyant-travel/operations#action.list-availability-start-times",
      version: "v1",
      kind: "read",
      targetType: "availability-start-time",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.list-availability-start-times"] },
    },
    {
      id: "@voyant-travel/operations#action.list-departures",
      version: "v1",
      kind: "read",
      targetType: "departure",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.list-departures"] },
    },
    {
      id: "@voyant-travel/operations#action.create-departure",
      version: "v1",
      kind: "execute",
      targetType: "departure",
      resource: "operations",
      action: "write",
      requiredScopes: ["operations:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "departure-create-command",
        resultReferenceType: "departure",
        durability: "handler-command-claim-v1",
        parentAnchor: { targetType: "product", targetIdField: "productId" },
      },
      from: { tools: ["@voyant-travel/operations#tool.create-departure"] },
    },
    {
      id: "@voyant-travel/operations#action.update-departure",
      version: "v1",
      kind: "execute",
      targetType: "departure",
      commandTargetField: "id",
      resource: "operations",
      action: "write",
      requiredScopes: ["operations:write"],
      risk: "medium",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/operations#tool.update-departure"] },
    },
    {
      id: "@voyant-travel/operations#action.rebuild-booking-actions",
      version: "v1",
      kind: "execute",
      targetType: "booking-action-projection",
      resource: "operations",
      action: "write",
      requiredScopes: ["operations:write"],
      risk: "medium",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/operations#tool.rebuild-booking-actions"] },
    },
    {
      id: "@voyant-travel/operations#action.get-departure",
      version: "v1",
      kind: "read",
      targetType: "departure",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.get-departure"] },
    },
    {
      id: "@voyant-travel/operations#action.list-availability-closeouts",
      version: "v1",
      kind: "read",
      targetType: "availability-closeout",
      requiredScopes: ["operations:read"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/operations#tool.list-availability-closeouts"] },
    },
  ],
  admin: {
    compositionOrder: 10,
    runtime: {
      entry: "@voyant-travel/operations-react/admin",
      export: "createSelectedOperationsAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/operations#admin.copy.availability",
        namespace: "operations.availability.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/operations-react/availability/i18n",
          export: "availabilityUiMessageDefinitions",
        },
      },
      {
        id: "@voyant-travel/operations#admin.copy.resources",
        namespace: "operations.resources.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/operations-react/resources/i18n",
          export: "resourcesUiMessageDefinitions",
        },
      },
    ],
    routes: (
      [
        ["availability-index", "/operations/availability"],
        ["availability-slot-detail", "/operations/availability/$id"],
        ["availability-rule-detail", "/operations/availability/rules/$id"],
        ["availability-start-time-detail", "/operations/availability/start-times/$id"],
        ["resources-index", "/operations/resources"],
        ["resources-detail", "/operations/resources/$id"],
        ["resources-pool-detail", "/operations/resources/pools/$id"],
        ["resources-assignment-detail", "/operations/resources/assignments/$id"],
        ["resources-allocation-detail", "/operations/resources/allocations/$id"],
      ] as const
    ).map(([id, path]) => ({
      id: `@voyant-travel/operations#admin.route.${id}`,
      path,
      requiredScopes: ["operations:read"],
      runtime: operationsAdminRuntime,
    })),
    contributions: [
      {
        id: "@voyant-travel/operations#admin.contribution.product-option-resource-templates",
        slotId: "product.details.option-extras",
        requiredScopes: ["operations:read"],
        runtime: operationsAdminRuntime,
      },
    ],
    nav: [
      {
        id: "@voyant-travel/operations#admin.nav.availability",
        routeId: "@voyant-travel/operations#admin.route.availability-index",
        label: { namespace: "operator.admin.navigation", key: "nav.availability" },
      },
      {
        id: "@voyant-travel/operations#admin.nav.resources",
        routeId: "@voyant-travel/operations#admin.route.resources-index",
        label: { namespace: "operator.admin.navigation", key: "nav.resources" },
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

export const operationsDashboardVoyantModule = defineModule({
  id: "@voyant-travel/operations#dashboard",
  packageName: "@voyant-travel/operations",
  localId: "operations.dashboard",
  requires: {
    capabilities: [
      "operations.data-owner",
      "bookings.data-owner",
      "finance.data-owner",
      "inventory.data-owner",
      "distribution.data-owner",
    ],
  },
  tools: [
    {
      id: "@voyant-travel/operations#dashboard#tool.get-operator-dashboard-summary",
      name: "get_operator_dashboard_summary",
      runtime: {
        entry: "@voyant-travel/operations/tools",
        export: "getOperatorDashboardSummaryTool",
      },
      requiredScopes: [
        "operations:read",
        "bookings:read",
        "finance:read",
        "products:read",
        "suppliers:read",
      ],
      context: ["operations", "bookings", "finance", "inventory", "distribution"],
      risk: "low",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/operations#dashboard#action.get-operator-dashboard-summary",
      version: "v1",
      kind: "read",
      targetType: "operator-dashboard-summary",
      resource: "operations",
      action: "read",
      requiredScopes: [
        "operations:read",
        "bookings:read",
        "finance:read",
        "products:read",
        "suppliers:read",
      ],
      risk: "low",
      ledger: "optional",
      allowedActorTypes: ["staff"],
      from: {
        tools: ["@voyant-travel/operations#dashboard#tool.get-operator-dashboard-summary"],
      },
    },
  ],
  meta: { ownership: "package" },
})

export default operationsVoyantModule
