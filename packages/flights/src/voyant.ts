import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { durableFlightActionRuntimePort } from "./durable-action-runtime-port.js"
import { flightsRuntimePort } from "./runtime-port.js"

/** Import-cheap deployment declaration owned by the flights package. */
export const flightsVoyantModule = defineModule({
  id: "@voyant-travel/flights",
  packageName: "@voyant-travel/flights",
  localId: "flights",
  provides: { ports: [providePort(flightsRuntimePort)] },
  runtimePorts: [
    requirePort(flightsRuntimePort),
    requirePort(durableFlightActionRuntimePort, { optional: true }),
  ],
  requires: { capabilities: ["finance.payment-sessions"] },
  api: [
    {
      id: "@voyant-travel/flights#api",
      surface: "admin",
      mount: "flights",
      openapi: { document: "flights" },
      runtime: {
        entry: "@voyant-travel/flights/api-runtime",
        export: "createFlightsVoyantRuntime",
      },
    },
  ],
  schema: [
    {
      id: "@voyant-travel/flights#schema",
      source: "@voyant-travel/flights/reference/local-postgres",
    },
  ],
  migrations: [
    {
      id: "@voyant-travel/flights#migrations",
      source: "./migrations",
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/flights#access.flights",
        resource: "flights",
        label: "Flights",
        description: "Flight search, pricing, booking, orders, ticketing, and reference data.",
        actions: [
          {
            action: "read",
            label: "View flights",
            description: "View flight orders and reference data.",
          },
          {
            action: "write",
            label: "Manage flights",
            description: "Search, price, book, ticket, and cancel flights.",
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/flights#tool.search",
      name: "search_flights",
      runtime: { entry: "@voyant-travel/flights/tools", export: "searchFlightsTool" },
      requiredScopes: ["flights:write"],
      context: ["flights"],
      risk: "low",
    },
    {
      id: "@voyant-travel/flights#tool.price-offer",
      name: "price_flight_offer",
      runtime: { entry: "@voyant-travel/flights/tools", export: "priceFlightOfferTool" },
      requiredScopes: ["flights:write"],
      context: ["flights"],
      risk: "low",
    },
    {
      id: "@voyant-travel/flights#tool.list-orders",
      name: "list_flight_orders",
      runtime: { entry: "@voyant-travel/flights/tools", export: "listFlightOrdersTool" },
      requiredScopes: ["flights:read"],
      context: ["flights"],
      risk: "high",
    },
    {
      id: "@voyant-travel/flights#tool.get-order",
      name: "get_flight_order",
      runtime: { entry: "@voyant-travel/flights/tools", export: "getFlightOrderTool" },
      requiredScopes: ["flights:read"],
      context: ["flights"],
      risk: "high",
    },
    {
      id: "@voyant-travel/flights#tool.ticket-order",
      name: "ticket_flight_order",
      runtime: { entry: "@voyant-travel/flights/tools", export: "ticketFlightOrderTool" },
      requiredScopes: ["flights:write"],
      context: ["flights"],
      risk: "critical",
    },
    {
      id: "@voyant-travel/flights#tool.cancel-order",
      name: "cancel_flight_order",
      runtime: { entry: "@voyant-travel/flights/tools", export: "cancelFlightOrderTool" },
      requiredScopes: ["flights:write"],
      context: ["flights"],
      risk: "critical",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/flights#action.search",
      version: "v1",
      kind: "read",
      targetType: "flight-offer",
      requiredScopes: ["flights:write"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/flights#tool.search"] },
    },
    {
      id: "@voyant-travel/flights#action.price-offer",
      version: "v1",
      kind: "read",
      targetType: "flight-offer",
      requiredScopes: ["flights:write"],
      risk: "low",
      ledger: "optional",
      from: { tools: ["@voyant-travel/flights#tool.price-offer"] },
    },
    {
      id: "@voyant-travel/flights#action.list-orders",
      version: "v1",
      kind: "sensitive-read",
      targetType: "flight-order",
      requiredScopes: ["flights:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/flights#tool.list-orders"] },
    },
    {
      id: "@voyant-travel/flights#action.get-order",
      version: "v1",
      kind: "sensitive-read",
      targetType: "flight-order",
      requiredScopes: ["flights:read"],
      risk: "high",
      ledger: "required",
      from: { tools: ["@voyant-travel/flights#tool.get-order"] },
    },
    {
      id: "@voyant-travel/flights#action.ticket-order",
      version: "v2",
      kind: "execute",
      targetType: "flight-order",
      commandTargetField: "orderId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: [durableFlightActionRuntimePort.id],
          },
        },
      },
      effectBoundary: "external",
      durability: {
        strategy: "saga",
        testReference: "packages/flights/tests/integration/durable-action-command.test.ts",
      },
      requiredScopes: ["flights:write"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      from: { tools: ["@voyant-travel/flights#tool.ticket-order"] },
    },
    {
      id: "@voyant-travel/flights#action.cancel-order",
      version: "v2",
      kind: "execute",
      targetType: "flight-order",
      commandTargetField: "orderId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: [durableFlightActionRuntimePort.id],
          },
        },
      },
      effectBoundary: "external",
      durability: {
        strategy: "saga",
        testReference: "packages/flights/tests/integration/durable-action-command.test.ts",
      },
      requiredScopes: ["flights:write"],
      risk: "critical",
      ledger: "required",
      approval: "required",
      reversible: false,
      from: { tools: ["@voyant-travel/flights#tool.cancel-order"] },
    },
  ],
  admin: {
    compositionOrder: 50,
    runtime: {
      entry: "@voyant-travel/flights-react/admin",
      export: "createSelectedFlightsAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/flights#admin.copy",
        namespace: "flights.admin",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/flights-react/i18n",
          export: "flightsUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/flights#admin.route.flights-index",
        path: "/flights",
        requiredScopes: ["flights:write"],
        runtime: {
          entry: "@voyant-travel/flights-react/admin",
          export: "createFlightsAdminExtension",
        },
      },
      {
        id: "@voyant-travel/flights#admin.route.flights-book",
        path: "/flights/book/$offerId",
        requiredScopes: ["flights:write"],
        runtime: {
          entry: "@voyant-travel/flights-react/admin",
          export: "createFlightsAdminExtension",
        },
      },
      {
        id: "@voyant-travel/flights#admin.route.flights-orders",
        path: "/flights/orders",
        requiredScopes: ["flights:read"],
        runtime: {
          entry: "@voyant-travel/flights-react/admin",
          export: "createFlightsAdminExtension",
        },
      },
      {
        id: "@voyant-travel/flights#admin.route.flights-order-detail",
        path: "/flights/orders/$orderId",
        requiredScopes: ["flights:read"],
        runtime: {
          entry: "@voyant-travel/flights-react/admin",
          export: "createFlightsAdminExtension",
        },
      },
    ],
    nav: [
      {
        id: "@voyant-travel/flights#admin.nav.flights",
        routeId: "@voyant-travel/flights#admin.route.flights-index",
        label: { namespace: "operator.admin.navigation", key: "nav.flights" },
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

export default flightsVoyantModule
