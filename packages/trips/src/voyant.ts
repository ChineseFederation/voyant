import { commerceCardPaymentRuntimePort } from "@voyant-travel/commerce/runtime-port"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import {
  storefrontPaymentLinkRuntimePort,
  storefrontPaymentReconciliationJobRuntimePort,
} from "@voyant-travel/storefront/runtime-port"
import { durableTripActionRuntimePort } from "./durable-action-runtime-port.js"
import { tripsDatabaseRuntimePort, tripsRoutesRuntimePort } from "./runtime-port.js"
import { tripsSourcingJobRuntimePort } from "./sourcing-job-runtime-port.js"

const catalogRuntimeServicesPortReference = { id: "catalog.runtime-services" } as const
const catalogCheckoutApiRuntimePortReference = { id: "commerce.checkout-api-options" } as const
const flightsRuntimePortReference = { id: "flights.runtime" } as const
const paymentAdapterRuntimePortReference = { id: "payments.adapter.runtime" } as const

const tripActionRequestedPayloadSchema = {
  type: "object",
  required: ["operationId", "action", "envelopeId", "backendIdentity"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    action: { type: "string", enum: ["price-trip", "reserve-trip"] },
    envelopeId: { type: "string", minLength: 1 },
    backendIdentity: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const

const tripActionCompletedPayloadSchema = {
  type: "object",
  required: ["operationId", "action", "envelopeId", "backendIdentity", "providerOperationId"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    action: { type: "string", enum: ["price-trip", "reserve-trip"] },
    envelopeId: { type: "string", minLength: 1 },
    backendIdentity: { type: "string", minLength: 1 },
    providerOperationId: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const

const tripActionDeadLetteredPayloadSchema = {
  type: "object",
  required: ["operationId", "action", "envelopeId", "attempts", "error"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    action: { type: "string", enum: ["price-trip", "reserve-trip"] },
    envelopeId: { type: "string", minLength: 1 },
    attempts: { type: "integer", minimum: 1 },
    error: { type: "string" },
  },
  additionalProperties: false,
} as const

const tripRequirementSourcingRequestedPayloadSchema = {
  type: "object",
  required: ["operationId", "requirementId", "envelopeId"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    requirementId: { type: "string", minLength: 1 },
    envelopeId: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
} as const

const tripRequirementSourcingCompletedPayloadSchema = {
  type: "object",
  required: ["operationId", "requirementId", "envelopeId", "candidateCount", "status"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    requirementId: { type: "string", minLength: 1 },
    envelopeId: { type: "string", minLength: 1 },
    candidateCount: { type: "integer", minimum: 0 },
    status: { type: "string", enum: ["candidates_ready", "no_availability"] },
  },
  additionalProperties: false,
} as const

const tripRequirementSourcingDeadLetteredPayloadSchema = {
  type: "object",
  required: ["operationId", "requirementId", "attempts", "error"],
  properties: {
    operationId: { type: "string", minLength: 1 },
    requirementId: { type: "string", minLength: 1 },
    attempts: { type: "integer", minimum: 0 },
    error: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  additionalProperties: false,
} as const

export {
  type DurableTripActionRuntime,
  durableTripActionRuntimePort,
} from "./durable-action-runtime-port.js"
export {
  type TripsDatabaseRuntime,
  tripsDatabaseRuntimePort,
  tripsRoutesRuntimePort,
} from "./runtime-port.js"

/** Import-cheap deployment declaration owned by the trips package. */
export const tripsVoyantModule = defineModule({
  id: "@voyant-travel/trips",
  packageName: "@voyant-travel/trips",
  localId: "trips",
  provides: {
    ports: [
      providePort(commerceCardPaymentRuntimePort),
      providePort(storefrontPaymentLinkRuntimePort),
      providePort(storefrontPaymentReconciliationJobRuntimePort),
      providePort(tripsRoutesRuntimePort),
      providePort(tripsDatabaseRuntimePort),
      providePort(tripsSourcingJobRuntimePort),
      providePort(durableTripActionRuntimePort),
    ],
  },
  runtimePorts: [
    requirePort(tripsRoutesRuntimePort),
    requirePort(tripsDatabaseRuntimePort),
    requirePort(tripsSourcingJobRuntimePort),
    requirePort(durableTripActionRuntimePort, { optional: true }),
    { ...paymentAdapterRuntimePortReference, optional: true },
    catalogRuntimeServicesPortReference,
    catalogCheckoutApiRuntimePortReference,
    { ...flightsRuntimePortReference, optional: true },
  ],
  api: [
    {
      id: "@voyant-travel/trips#api.admin",
      surface: "admin",
      mount: "trips",
      openapi: { document: "trips" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/trips",
        export: "createTripsVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/trips#api.public",
      surface: "public",
      mount: "trips",
      openapi: { document: "trips" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/trips",
        export: "createTripsVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/trips#schema",
      source: "@voyant-travel/trips/schema",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/trips#migrations",
      source: "./migrations",
    },
  ],
  jobs: [
    {
      id: "trips.execute-durable-actions",
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/trips/action-job",
        export: "runTripActionJob",
      },
    },
    {
      id: "trips.source-requirement-candidates",
      schedule: { every: "1m", overlap: "skip" },
      scheduling: {
        required: true,
        profiles: {
          eager: { every: "1m", overlap: "skip" },
          economical: { every: "5m", overlap: "skip" },
          "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
        },
      },
      wakeup: true,
      runtime: {
        entry: "@voyant-travel/trips/sourcing-job",
        export: "runTripRequirementSourcingJob",
      },
    },
  ],
  config: [
    {
      id: "@voyant-travel/trips#config.payment-callback-base-url",
      key: "PAYMENT_CALLBACK_BASE_URL",
      required: false,
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/trips#access.trips",
        resource: "trips",
        label: "Trips",
        description: "Customer trips, components, pricing, reservations, and requirements.",
        actions: [
          {
            action: "read",
            label: "View trips",
            description: "View trips, components, prices, and reservation status.",
          },
          {
            action: "write",
            label: "Manage trips",
            description: "Create, revise, price, and reserve trips and their components.",
          },
          {
            action: "delete",
            label: "Delete trip components",
            description: "Remove components from a trip.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/trips#tool.list-trips",
      name: "list_trips",
      runtime: { entry: "@voyant-travel/trips/tools", export: "listTripsTool" },
      requiredScopes: ["trips:read"],
      context: ["trips"],
      // Returns traveler PII; matches the CRM contact-method readers.
      risk: "high",
    },
    {
      id: "@voyant-travel/trips#tool.get-trip",
      name: "get_trip",
      runtime: { entry: "@voyant-travel/trips/tools", export: "getTripTool" },
      requiredScopes: ["trips:read"],
      context: ["trips"],
      // Returns traveler PII; matches the CRM contact-method readers.
      risk: "high",
    },
    {
      id: "@voyant-travel/trips#tool.create-trip",
      name: "create_trip",
      runtime: { entry: "@voyant-travel/trips/tools", export: "createTripTool" },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/trips#tool.revise-trip",
      name: "revise_trip",
      runtime: { entry: "@voyant-travel/trips/tools", export: "reviseTripTool" },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/trips#tool.price-trip",
      name: "price_trip",
      runtime: { entry: "@voyant-travel/trips/tools", export: "priceTripTool" },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "high",
    },
    {
      id: "@voyant-travel/trips#tool.reserve-trip",
      name: "reserve_trip",
      runtime: { entry: "@voyant-travel/trips/tools", export: "reserveTripTool" },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/trips#tool.get-trip-action-operation",
      name: "get_trip_action_operation",
      runtime: {
        entry: "@voyant-travel/trips/tools",
        export: "getTripActionOperationTool",
      },
      requiredScopes: ["trips:read"],
      context: ["trips"],
      risk: "low",
    },
    {
      id: "@voyant-travel/trips#tool.source-requirement-candidates",
      name: "source_trip_requirement_candidates",
      runtime: {
        entry: "@voyant-travel/trips/tools",
        export: "sourceTripRequirementCandidatesTool",
      },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/trips#tool.get-requirement-sourcing-operation",
      name: "get_trip_requirement_sourcing_operation",
      runtime: {
        entry: "@voyant-travel/trips/tools",
        export: "getTripRequirementSourcingOperationTool",
      },
      requiredScopes: ["trips:read"],
      context: ["trips"],
      risk: "low",
    },
    {
      id: "@voyant-travel/trips#tool.add-requirement",
      name: "add_trip_requirement",
      runtime: { entry: "@voyant-travel/trips/tools", export: "addTripRequirementTool" },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "medium",
    },
    {
      id: "@voyant-travel/trips#tool.select-candidate",
      name: "select_trip_candidate",
      runtime: {
        entry: "@voyant-travel/trips/tools",
        export: "selectTripCandidateTool",
      },
      requiredScopes: ["trips:write"],
      context: ["trips"],
      risk: "medium",
    },
  ],
  actions: [
    // A trip envelope carries traveler names, dates of birth, emails and phones,
    // so reading one is a sensitive read: ledgered, never approval-gated. Same
    // posture as the CRM contact-method and address readers.
    {
      id: "@voyant-travel/trips#action.list-trips",
      version: "v1",
      kind: "sensitive-read",
      targetType: "trip",
      requiredScopes: ["trips:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      from: { tools: ["@voyant-travel/trips#tool.list-trips"] },
    },
    {
      id: "@voyant-travel/trips#action.get-trip",
      version: "v1",
      kind: "sensitive-read",
      targetType: "trip",
      requiredScopes: ["trips:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      reversible: false,
      from: { tools: ["@voyant-travel/trips#tool.get-trip"] },
    },
    {
      id: "@voyant-travel/trips#action.create-trip",
      version: "v1",
      kind: "execute",
      targetType: "trip",
      requiredScopes: ["trips:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: false,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "created",
      createdTarget: {
        commandTargetType: "trip-create-command",
        resultReferenceType: "trip",
        durability: "handler-command-claim-v1",
      },
      from: { tools: ["@voyant-travel/trips#tool.create-trip"] },
    },
    {
      id: "@voyant-travel/trips#action.revise-trip",
      version: "v1",
      kind: "execute",
      targetType: "trip",
      commandTargetField: "envelopeId",
      requiredScopes: ["trips:write"],
      risk: "medium",
      ledger: "optional",
      reversible: true,
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/trips#tool.revise-trip"] },
    },
    {
      id: "@voyant-travel/trips#action.price-trip",
      version: "v2",
      kind: "execute",
      targetType: "trip",
      targetLifecycle: "existing",
      commandTargetField: "envelopeId",
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: [durableTripActionRuntimePort.id],
          },
        },
      },
      existingTarget: { durability: "handler-command-result-v1" },
      effectBoundary: "multistage",
      durability: {
        strategy: "saga",
        testReference: "packages/trips/tests/integration/durable-actions.test.ts",
      },
      requiredScopes: ["trips:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      policy: "trips.price-trip.v1",
      reversible: true,
      from: { tools: ["@voyant-travel/trips#tool.price-trip"] },
    },
    {
      id: "@voyant-travel/trips#action.reserve-trip",
      version: "v2",
      kind: "execute",
      targetType: "trip",
      commandTargetField: "envelopeId",
      targetLifecycle: "existing",
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: [durableTripActionRuntimePort.id],
          },
        },
      },
      existingTarget: { durability: "handler-command-result-v1" },
      effectBoundary: "multistage",
      durability: {
        strategy: "saga",
        testReference: "packages/trips/tests/integration/durable-actions.test.ts",
      },
      requiredScopes: ["trips:write"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      policy: "trips.reserve-trip.v1",
      reversible: false,
      from: { tools: ["@voyant-travel/trips#tool.reserve-trip"] },
    },
    {
      id: "@voyant-travel/trips#action.source-requirement-candidates",
      version: "v2",
      kind: "execute",
      targetType: "trip-requirement",
      commandTargetField: "requirementId",
      targetLifecycle: "existing",
      availability: { status: "available" },
      existingTarget: {
        durability: "handler-command-result-v1",
      },
      effectBoundary: "multistage",
      durability: {
        strategy: "saga",
        testReference: "packages/trips/tests/integration/durable-sourcing.test.ts",
      },
      requiredScopes: ["trips:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/trips#tool.source-requirement-candidates"] },
    },
    {
      id: "@voyant-travel/trips#action.get-requirement-sourcing-operation",
      version: "v2",
      kind: "read",
      targetType: "trip-requirement-sourcing-operation",
      requiredScopes: ["trips:read"],
      risk: "low",
      ledger: "optional",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/trips#tool.get-requirement-sourcing-operation"] },
    },
    {
      id: "@voyant-travel/trips#action.add-requirement",
      version: "v1",
      kind: "execute",
      targetType: "trip",
      commandTargetField: "envelopeId",
      targetLifecycle: "existing",
      requiredScopes: ["trips:write"],
      risk: "medium",
      ledger: "required",
      approval: "never",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      from: { tools: ["@voyant-travel/trips#tool.add-requirement"] },
    },
    {
      id: "@voyant-travel/trips#action.select-candidate",
      version: "v1",
      kind: "execute",
      targetType: "trip-requirement",
      commandTargetField: "requirementId",
      requiredScopes: ["trips:write"],
      risk: "medium",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      availability: { status: "available" },
      effectBoundary: "local",
      targetLifecycle: "existing",
      from: { tools: ["@voyant-travel/trips#tool.select-candidate"] },
    },
  ],
  events: [
    {
      id: "@voyant-travel/trips#event.action-requested",
      eventType: "trip.action-requested",
      version: "1.0.0",
      payloadSchema: tripActionRequestedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
    {
      id: "@voyant-travel/trips#event.action-completed",
      eventType: "trip.action-completed",
      version: "1.0.0",
      payloadSchema: tripActionCompletedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
    {
      id: "@voyant-travel/trips#event.action-dead-lettered",
      eventType: "trip.action-dead-lettered",
      version: "1.0.0",
      payloadSchema: tripActionDeadLetteredPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
    {
      id: "@voyant-travel/trips#event.requirement-sourcing-requested",
      eventType: "trip.requirement-sourcing-requested",
      version: "1.0.0",
      payloadSchema: tripRequirementSourcingRequestedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
    {
      id: "@voyant-travel/trips#event.requirement-sourcing-completed",
      eventType: "trip.requirement-sourcing-completed",
      version: "1.0.0",
      payloadSchema: tripRequirementSourcingCompletedPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
    {
      id: "@voyant-travel/trips#event.requirement-sourcing-dead-lettered",
      eventType: "trip.requirement-sourcing-dead-lettered",
      version: "1.0.0",
      payloadSchema: tripRequirementSourcingDeadLetteredPayloadSchema,
      visibility: "internal",
      audit: { sourceModule: "trips", category: "domain" },
    },
  ],
  subscribers: [
    {
      id: "@voyant-travel/trips#subscriber.payment-completed",
      eventType: "payment.completed",
      source: "@voyant-travel/trips",
      runtime: {
        entry: "@voyant-travel/trips/payment-subscribers",
        export: "tripsPaymentCompletedSubscriber",
      },
    },
  ],
  admin: {
    compositionOrder: 90,
    runtime: {
      entry: "@voyant-travel/trips-react/admin",
      export: "createSelectedTripsAdminExtension",
    },
    routes: [
      {
        id: "@voyant-travel/trips#admin.route.trips-index",
        path: "/trips",
        requiredScopes: ["trips:read"],
        runtime: {
          entry: "@voyant-travel/trips-react/admin",
          export: "createTripsAdminExtension",
        },
      },
      {
        id: "@voyant-travel/trips#admin.route.trips-detail",
        path: "/trips/$id",
        requiredScopes: ["trips:read"],
        runtime: {
          entry: "@voyant-travel/trips-react/admin",
          export: "createTripsAdminExtension",
        },
      },
    ],
    contributions: [
      {
        id: "@voyant-travel/trips#admin.contribution.compose-booking",
        slotId: "bookings.list.header-actions",
        requiredScopes: ["trips:write"],
        runtime: {
          entry: "@voyant-travel/trips-react/admin",
          export: "createTripsAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/trips#admin.nav.trips",
        routeId: "@voyant-travel/trips#admin.route.trips-index",
        label: { namespace: "operator.admin.navigation", key: "nav.trips" },
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

export default tripsVoyantModule
