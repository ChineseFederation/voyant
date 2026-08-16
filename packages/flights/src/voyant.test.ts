import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"
import {
  createFlightsApiModule,
  createFlightsVoyantRuntime,
  FLIGHTS_OPENAPI_API_ID,
  flightsRuntimePort,
} from "./api-runtime.js"
import type { FlightConnectorAdapter } from "./contract/adapter.js"
import { flightsVoyantModule } from "./voyant.js"

describe("flights deployment manifest", () => {
  it("owns its injectable runtime, schema, and migrations", () => {
    expect(flightsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/flights",
      packageName: "@voyant-travel/flights",
      provides: { ports: [{ id: "flights.runtime" }] },
      runtimePorts: [
        { id: "flights.runtime" },
        {
          id: "flights.durable-action-runtime",
          optional: true,
          conformance: {
            entry: "@voyant-travel/flights/durable-action-runtime-port",
            export: "durableFlightActionRuntimePort",
          },
        },
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
      migrations: [{ id: "@voyant-travel/flights#migrations", source: "./migrations" }],
    })
  })

  it("requires Finance payment-session schema and graph capability", async () => {
    const packageJson = await import("../package.json", { with: { type: "json" } })

    expect(packageJson.default.voyant.requiresSchemas).toEqual([
      "@voyant-travel/db",
      "@voyant-travel/finance",
    ])
    expect(flightsVoyantModule.requires).toEqual({
      capabilities: ["finance.payment-sessions"],
    })
  })

  it("describes read and write access to the flights mount", () => {
    expect(flightsVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "flights",
        label: "Flights",
        description: expect.any(String),
        actions: [
          expect.objectContaining({
            action: "read",
            label: expect.any(String),
            description: expect.any(String),
          }),
          expect.objectContaining({
            action: "write",
            label: expect.any(String),
            description: expect.any(String),
          }),
        ],
      }),
    ])
  })

  it("scopes the selected Flights navigation and routes", () => {
    expect(flightsVoyantModule.admin?.routes?.map((route) => route.requiredScopes)).toEqual([
      ["flights:write"],
      ["flights:write"],
      ["flights:read"],
      ["flights:read"],
    ])
    expect(flightsVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/flights#admin.route.flights-index",
        label: { namespace: "operator.admin.navigation", key: "nav.flights" },
      }),
    ])
  })

  it("declares only the existing non-transactional admin surface", () => {
    expect(flightsVoyantModule.api).toEqual([
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
    ])

    const runtime = createFlightsApiModule({
      resolveAdapter: () => {
        throw new Error("not used by the manifest test")
      },
    })
    expect(runtime.module).toEqual({ name: "flights" })
    expect(runtime.adminRoutes).toBeDefined()
    expect(runtime.publicRoutes).toBeUndefined()
    expect(runtime.webhookRoutes).toBeUndefined()

    if (!isOpenApiDocumentSource(runtime.adminRoutes)) {
      throw new Error("Flights admin routes must expose an OpenAPI document.")
    }
    const document = runtime.adminRoutes.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "Flights", version: "1" },
    })
    const operations = Object.values(document.paths ?? {}).flatMap((path) =>
      Object.values(path).filter((operation) => typeof operation === "object"),
    ) as Array<Record<string, unknown>>
    expect(operations).toHaveLength(14)
    expect(
      operations.every((operation) => operation["x-voyant-api-id"] === FLIGHTS_OPENAPI_API_ID),
    ).toBe(true)
    expect(
      flightsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/flights#action.ticket-order",
      ),
    ).toMatchObject({
      version: "v2",
      commandTargetField: "orderId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: ["flights.durable-action-runtime"],
          },
        },
      },
      effectBoundary: "external",
      durability: {
        strategy: "saga",
        testReference: "packages/flights/tests/integration/durable-action-command.test.ts",
      },
      approval: "required",
      policy: "flight-ticket",
    })
    expect(
      flightsVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/flights#action.cancel-order",
      ),
    ).toMatchObject({
      version: "v2",
      commandTargetField: "orderId",
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
      availability: {
        status: "unavailable",
        reasonCode: "provider-idempotency-unavailable",
        enableWhen: {
          selectedProviderPorts: {
            mode: "all",
            ports: ["flights.durable-action-runtime"],
          },
        },
      },
      effectBoundary: "external",
      durability: {
        strategy: "saga",
        testReference: "packages/flights/tests/integration/durable-action-command.test.ts",
      },
      approval: "required",
      policy: "flight-cancel",
    })
  })

  it("owns runtime assembly and validates Node-host providers", async () => {
    const adapter: FlightConnectorAdapter = {
      capabilities: { provider: "stub", declared: [] },
      searchFlights: vi.fn(async () => ({ offers: [] })),
      priceOffer: vi.fn(async () => ({ offer: {} as never, valid: true })),
      bookFlight: vi.fn(async () => ({ order: {} as never })),
      getOrder: vi.fn(async () => ({ order: {} as never })),
      cancelOrder: vi.fn(async () => ({ order: {} as never })),
    }
    const provider = {
      resolveAdapter: vi.fn(() => adapter),
      listAdmittedShoppingSources: vi.fn(async () => []),
      startCardPayment: vi.fn(async () => {}),
    }

    await expect(assertPortConforms(flightsRuntimePort, provider)).resolves.toBeUndefined()
    await expect(assertPortConforms(flightsRuntimePort, {} as never)).rejects.toThrow(
      /resolveAdapter/,
    )

    const runtime = await createFlightsVoyantRuntime({
      unitId: "@voyant-travel/flights",
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: flightsVoyantModule.api ?? [],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: vi.fn(async () => provider) as never,
      getPorts: vi.fn(async () => []) as never,
    })
    expect(runtime.module).toEqual({ name: "flights" })
    expect(runtime.adminRoutes).toBeDefined()
  })
})

interface OpenApiDocumentSource {
  getOpenAPI31Document(input: { openapi: "3.1.0"; info: { title: string; version: string } }): {
    paths?: Record<string, Record<string, unknown>>
  }
}

function isOpenApiDocumentSource(value: unknown): value is OpenApiDocumentSource {
  return (
    typeof value === "object" &&
    value !== null &&
    "getOpenAPI31Document" in value &&
    typeof value.getOpenAPI31Document === "function"
  )
}
