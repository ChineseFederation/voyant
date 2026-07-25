import { actionLedgerBookingDriftRuntimePort } from "@voyant-travel/action-ledger/runtime-port"
import {
  defineExtension,
  defineModule,
  providePort,
  requirePort,
} from "@voyant-travel/core/project"
import {
  customFieldsRuntimePort,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"

import { BOOKING_VOYANT_ACTIONS } from "./action-declarations.js"
import { bookingsReportingDeclaration } from "./reporting-definitions.js"
import {
  bookingsAccommodationRuntimePort,
  bookingsFinanceRuntimePort,
  bookingsInventoryRuntimePort,
  bookingsRelationshipsRuntimePort,
} from "./runtime-port.js"
import { bookingsStaleHoldsJobRuntimePort } from "./stale-holds-job-runtime-port.js"
import { bookingsVoyantAdmin } from "./voyant-admin.js"
import {
  bookingCancelledPayloadSchema,
  bookingConfirmedPayloadSchema,
  bookingExpiredPayloadSchema,
  bookingLifecyclePayloadSchema,
  bookingRefundedPayloadSchema,
  bookingStatusOverriddenPayloadSchema,
} from "./voyant-event-schemas.js"

type BookingExtensionToolSpec = readonly [
  slug: string,
  name: string,
  exportName: string,
  targetType: string,
  requiredScopes: readonly string[],
  risk: "low" | "medium" | "high",
  allowedActorTypes?: readonly ("staff" | "customer")[],
]

const BOOKING_EXTENSION_ID_TARGET_ACTIONS = new Set([
  "update-booking-answer",
  "update-booking-extra",
  "update-booking-question-extra-trigger",
  "update-booking-question-option",
  "update-booking-question-option-trigger",
  "update-booking-question-unit-trigger",
  "update-option-booking-question",
  "update-product-booking-question",
  "update-product-contact-requirement",
])

function declareBookingExtensionTools(
  owner: string,
  context: string,
  specs: readonly BookingExtensionToolSpec[],
) {
  return specs.map(([slug, name, exportName, _targetType, requiredScopes, risk]) => ({
    id: `${owner}.tool.${slug}`,
    name,
    runtime: { entry: "@voyant-travel/bookings/tools", export: exportName },
    requiredScopes: [...requiredScopes],
    context: [context],
    risk,
  }))
}

function declareBookingExtensionActions(owner: string, specs: readonly BookingExtensionToolSpec[]) {
  return specs.map(
    ([slug, _name, _exportName, targetType, requiredScopes, risk, allowedActorTypes]) => {
      const write = requiredScopes.some((scope) => scope.endsWith(":write"))
      return {
        id: `${owner}.action.${slug}`,
        version: "v1" as const,
        kind: write
          ? ("execute" as const)
          : risk === "high"
            ? ("sensitive-read" as const)
            : ("read" as const),
        targetType,
        ...(BOOKING_EXTENSION_ID_TARGET_ACTIONS.has(slug) ? { commandTargetField: "id" } : {}),
        requiredScopes: [...requiredScopes],
        risk,
        ledger: write || risk === "high" ? ("required" as const) : ("optional" as const),
        approval: write && risk === "high" ? ("conditional" as const) : ("never" as const),
        reversible: write,
        allowedActorTypes: allowedActorTypes ? [...allowedActorTypes] : (["staff"] as const),
        from: { tools: [`${owner}.tool.${slug}`] },
      }
    },
  )
}

const BOOKING_REQUIREMENTS_OWNER = "@voyant-travel/bookings#requirements"
const BOOKING_REQUIREMENTS_TOOL_SPECS = [
  [
    "get-public-transport-requirements",
    "get_public_transport_requirements",
    "getPublicTransportRequirementsTool",
    "product-transport-requirements",
    ["bookings:read"],
    "low",
    ["staff", "customer"],
  ],
  ...(
    [
      ["product-contact-requirements", "ProductContactRequirement", "product-contact-requirement"],
      ["product-booking-questions", "ProductBookingQuestion", "product-booking-question"],
      ["option-booking-questions", "OptionBookingQuestion", "option-booking-question"],
      ["booking-question-options", "BookingQuestionOption", "booking-question-option"],
      [
        "booking-question-unit-triggers",
        "BookingQuestionUnitTrigger",
        "booking-question-unit-trigger",
      ],
      [
        "booking-question-option-triggers",
        "BookingQuestionOptionTrigger",
        "booking-question-option-trigger",
      ],
      [
        "booking-question-extra-triggers",
        "BookingQuestionExtraTrigger",
        "booking-question-extra-trigger",
      ],
    ] as const
  ).flatMap(([pluralSlug, exportStem, targetType]) => {
    const singularSlug = pluralSlug.replace(/s$/, "")
    const singularName = singularSlug.replaceAll("-", "_")
    const pluralName = pluralSlug.replaceAll("-", "_")
    return [
      [
        `list-${pluralSlug}`,
        `list_${pluralName}`,
        `list${exportStem}sTool`,
        targetType,
        ["bookings:read"],
        "low",
      ],
      [
        `get-${singularSlug}`,
        `get_${singularName}`,
        `get${exportStem}Tool`,
        targetType,
        ["bookings:read"],
        "low",
      ],
      [
        `create-${singularSlug}`,
        `create_${singularName}`,
        `create${exportStem}Tool`,
        targetType,
        ["bookings:write"],
        "high",
      ],
      [
        `update-${singularSlug}`,
        `update_${singularName}`,
        `update${exportStem}Tool`,
        targetType,
        ["bookings:write"],
        "high",
      ],
    ] as const
  }),
  [
    "list-booking-answers",
    "list_booking_answers",
    "listBookingAnswersTool",
    "booking-answer",
    ["bookings:read", "bookings-pii:read"],
    "high",
  ],
  [
    "get-booking-answer",
    "get_booking_answer",
    "getBookingAnswerTool",
    "booking-answer",
    ["bookings:read", "bookings-pii:read"],
    "high",
  ],
  [
    "create-booking-answer",
    "create_booking_answer",
    "createBookingAnswerTool",
    "booking-answer",
    ["bookings:write"],
    "high",
  ],
  [
    "update-booking-answer",
    "update_booking_answer",
    "updateBookingAnswerTool",
    "booking-answer",
    ["bookings:write"],
    "high",
  ],
] as const satisfies readonly BookingExtensionToolSpec[]

const BOOKING_EXTRAS_OWNER = "@voyant-travel/bookings#extras"
const BOOKING_EXTRAS_TOOL_SPECS = [
  [
    "list-booking-extras",
    "list_booking_extras",
    "listBookingExtrasTool",
    "booking-extra",
    ["bookings:read"],
    "low",
  ],
  [
    "get-booking-extra",
    "get_booking_extra",
    "getBookingExtraTool",
    "booking-extra",
    ["bookings:read"],
    "low",
  ],
  [
    "create-booking-extra",
    "create_booking_extra",
    "createBookingExtraTool",
    "booking-extra",
    ["bookings:write"],
    "high",
  ],
  [
    "update-booking-extra",
    "update_booking_extra",
    "updateBookingExtraTool",
    "booking-extra",
    ["bookings:write"],
    "high",
  ],
  [
    "get-slot-extra-manifest",
    "get_slot_extra_manifest",
    "getSlotExtraManifestTool",
    "departure-extra-manifest",
    ["bookings:read", "bookings-pii:read"],
    "high",
  ],
  [
    "set-slot-extra-selection",
    "set_slot_extra_selection",
    "setSlotExtraSelectionTool",
    "departure-extra-selection",
    ["bookings:write"],
    "high",
  ],
  [
    "bulk-set-slot-extra-selections",
    "bulk_set_slot_extra_selections",
    "bulkSetSlotExtraSelectionsTool",
    "departure-extra-selection",
    ["bookings:write"],
    "high",
  ],
  [
    "bulk-update-slot-extra-collections",
    "bulk_update_slot_extra_collections",
    "bulkUpdateSlotExtraCollectionsTool",
    "departure-extra-collection",
    ["bookings:write"],
    "high",
  ],
] as const satisfies readonly BookingExtensionToolSpec[]

/**
 * Import-cheap deployment declaration owned by the bookings package.
 * Executable package surfaces stay behind symbolic package export references.
 */
export const bookingsVoyantModule = defineModule({
  id: "@voyant-travel/bookings",
  packageName: "@voyant-travel/bookings",
  localId: "bookings",
  runtime: { entry: "@voyant-travel/bookings", export: "createBookingsVoyantRuntime" },
  runtimePorts: [
    requirePort(bookingsAccommodationRuntimePort),
    requirePort(customFieldsRuntimePort),
    requirePort(bookingsFinanceRuntimePort),
    requirePort(bookingsStaleHoldsJobRuntimePort),
    requirePort(bookingsRelationshipsRuntimePort),
  ],
  customFieldTargets: [
    {
      id: "booking",
      namespace: "bookings",
      label: "Booking",
      fieldTypes: [
        "varchar",
        "text",
        "double",
        "monetary",
        "date",
        "boolean",
        "enum",
        "set",
        "json",
      ],
      capabilities: ["read", "write", "presentation"],
    },
  ],
  provides: {
    capabilities: ["bookings.data-owner"],
    ports: [
      providePort(actionLedgerBookingDriftRuntimePort),
      providePort(customFieldValueLifecycleRuntimePort),
      providePort(customFieldValueOperationsRuntimePort),
      providePort(bookingsStaleHoldsJobRuntimePort),
    ],
  },
  reporting: bookingsReportingDeclaration,
  api: [
    {
      id: "@voyant-travel/bookings#api.admin",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      resource: "bookings",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/bookings",
        export: "createBookingsApiModule",
      },
    },
    {
      id: "@voyant-travel/bookings#api.public",
      surface: "public",
      mount: "bookings",
      openapi: { document: "bookings" },
      resource: "bookings",
      anonymous: true,
      transactional: true,
      runtime: {
        entry: "@voyant-travel/bookings",
        export: "createBookingsApiModule",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/bookings#schema",
      source: "@voyant-travel/bookings/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/bookings#migrations",
      source: "./migrations",
    },
  ],
  links: [
    {
      id: "@voyant-travel/bookings#linkable.booking",
      kind: "linkable",
      source: "@voyant-travel/bookings/linkables",
    },
  ],
  jobs: [
    {
      id: "bookings.expire-stale-holds",
      schedule: { cron: "*/5 * * * *", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { cron: "* * * * *", overlap: "skip" },
          economical: { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      runtime: {
        entry: "@voyant-travel/bookings/stale-holds-job",
        export: "runBookingsExpireStaleHoldsJob",
      },
    },
  ],
  events: [
    {
      id: "@voyant-travel/bookings#event.booking.confirmed",
      eventType: "booking.confirmed",
      version: "1.0.0",
      payloadSchema: bookingConfirmedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.expired",
      eventType: "booking.expired",
      version: "1.0.0",
      payloadSchema: bookingExpiredPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.cancelled",
      eventType: "booking.cancelled",
      version: "1.0.0",
      payloadSchema: bookingCancelledPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.started",
      eventType: "booking.started",
      version: "1.0.0",
      payloadSchema: bookingLifecyclePayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.completed",
      eventType: "booking.completed",
      version: "1.0.0",
      payloadSchema: bookingLifecyclePayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.status-overridden",
      eventType: "booking.status_overridden",
      version: "1.0.0",
      payloadSchema: bookingStatusOverriddenPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
    {
      id: "@voyant-travel/bookings#event.booking.refunded",
      eventType: "booking.refunded",
      version: "1.0.0",
      payloadSchema: bookingRefundedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "bookings", category: "domain" },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/bookings#access.bookings",
        resource: "bookings",
        label: "Bookings",
        description: "Read and manage booking records and booking workflows.",
        actions: [
          {
            action: "read",
            label: "Read bookings",
            description: "Read booking records and non-sensitive booking state.",
          },
          {
            action: "write",
            label: "Manage bookings",
            description: "Create, update, confirm, or cancel bookings.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete bookings",
            description: "Delete booking-owned records where supported.",
            sensitive: true,
          },
        ],
        legacyActions: ["cancel"],
      },
      {
        id: "@voyant-travel/bookings#access.bookings-pii",
        resource: "bookings-pii",
        label: "Booking PII",
        description: "Personally-identifiable traveller data on bookings. Grant explicitly.",
        wildcard: "explicit-resource",
        actions: [
          {
            action: "read",
            label: "Read booking PII",
            description:
              "Read personally-identifiable traveller fields on bookings. Never granted by a wildcard.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/bookings#tool.list-bookings",
      name: "list_bookings",
      runtime: { entry: "@voyant-travel/bookings/tools", export: "listBookingsTool" },
      requiredScopes: ["bookings:read"],
      context: ["bookings"],
      risk: "low",
    },
    {
      id: "@voyant-travel/bookings#tool.get-booking",
      name: "get_booking",
      runtime: { entry: "@voyant-travel/bookings/tools", export: "getBookingTool" },
      requiredScopes: ["bookings:read"],
      context: ["bookings"],
      risk: "low",
    },
    {
      id: "@voyant-travel/bookings#tool.cancel-booking",
      name: "cancel_booking",
      runtime: { entry: "@voyant-travel/bookings/tools", export: "cancelBookingTool" },
      requiredScopes: ["bookings:write"],
      context: ["bookings"],
      risk: "critical",
    },
  ],
  actions: BOOKING_VOYANT_ACTIONS,
  admin: bookingsVoyantAdmin,
  lifecycle: {
    uninstall: { default: "retain-data", purge: "not-supported" },
  },
  meta: {
    ownership: "package",
  },
})

export const bookingRequirementsVoyantModule = defineModule({
  id: "@voyant-travel/bookings#requirements",
  packageName: "@voyant-travel/bookings",
  localId: "bookings.requirements",
  runtime: {
    entry: "@voyant-travel/bookings/requirements",
    export: "createBookingRequirementsVoyantRuntime",
  },
  runtimePorts: [requirePort(bookingsInventoryRuntimePort)],
  requires: { capabilities: ["bookings.data-owner"] },
  api: [
    {
      id: "@voyant-travel/bookings#requirements.api",
      surface: "admin",
      mount: "booking-requirements",
      openapi: { document: "booking-requirements" },
      resource: "bookings",
      runtime: {
        entry: "@voyant-travel/bookings/requirements",
        export: "createBookingRequirementsApiModule",
      },
    },
    {
      id: "@voyant-travel/bookings#requirements.api.public",
      surface: "public",
      mount: "booking-requirements",
      openapi: { document: "booking-requirements" },
      resource: "bookings",
      runtime: {
        entry: "@voyant-travel/bookings/requirements",
        export: "createBookingRequirementsApiModule",
      },
    },
  ],
  tools: declareBookingExtensionTools(
    BOOKING_REQUIREMENTS_OWNER,
    "bookingRequirements",
    BOOKING_REQUIREMENTS_TOOL_SPECS,
  ),
  actions: declareBookingExtensionActions(
    BOOKING_REQUIREMENTS_OWNER,
    BOOKING_REQUIREMENTS_TOOL_SPECS,
  ),
  meta: {
    ownership: "package",
  },
})

export const bookingsExtrasVoyantModule = defineModule({
  id: "@voyant-travel/bookings#extras",
  packageName: "@voyant-travel/bookings",
  localId: "bookings.extras",
  requires: { capabilities: ["bookings.data-owner"] },
  api: [
    {
      id: "@voyant-travel/bookings#extras.api",
      surface: "admin",
      mount: "extras",
      openapi: { document: "booking-extras" },
      resource: "bookings",
      transactional: true,
      runtime: {
        entry: "@voyant-travel/bookings/extras",
        export: "createBookingsExtrasVoyantRuntime",
      },
    },
  ],
  tools: declareBookingExtensionTools(
    BOOKING_EXTRAS_OWNER,
    "bookingsExtras",
    BOOKING_EXTRAS_TOOL_SPECS,
  ),
  actions: declareBookingExtensionActions(BOOKING_EXTRAS_OWNER, BOOKING_EXTRAS_TOOL_SPECS).map(
    (action) =>
      action.id === `${BOOKING_EXTRAS_OWNER}.action.create-booking-extra`
        ? {
            ...action,
            capabilityId: action.id,
            targetLifecycle: "created" as const,
            createdTarget: {
              commandTargetType: "booking-extra-create-command",
              resultReferenceType: "booking_extra",
              durability: "handler-command-claim-v1" as const,
              parentAnchor: { targetType: "booking", targetIdField: "bookingId" },
            },
            approval: "never" as const,
            reversible: false,
          }
        : action,
  ),
  meta: {
    ownership: "package",
  },
})

export const bookingsSupplierVoyantPlugin = defineExtension({
  id: "@voyant-travel/bookings#booking-supplier-extension",
  packageName: "@voyant-travel/bookings",
  localId: "bookings.booking-supplier-extension",
  api: [
    {
      id: "@voyant-travel/bookings#booking-supplier-extension.api",
      surface: "admin",
      mount: "bookings",
      openapi: { document: "bookings" },
      runtime: {
        entry: "@voyant-travel/bookings/extensions/suppliers",
        export: "bookingsSupplierExtension",
      },
    },
  ],
  meta: {
    ownership: "package",
  },
})

export default bookingsVoyantModule
