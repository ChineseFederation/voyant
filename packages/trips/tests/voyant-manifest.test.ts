import { readFileSync } from "node:fs"
import { commerceCardPaymentRuntimePort } from "@voyant-travel/commerce/runtime-port"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { assertPortConforms } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import {
  PAYMENT_ADAPTER_CONTRACT_VERSION,
  type PaymentAdapter,
  paymentAdapterRuntimePort,
} from "@voyant-travel/payments"
import { publicApiOpaqueReferenceIssuerPort } from "@voyant-travel/public-api/shopping"
import { describe, expect, it, vi } from "vitest"

import {
  createTripsVoyantRuntime,
  publicApiTripOfferResolverPort,
  type TripsDatabaseRuntime,
  tripsDatabaseRuntimePort,
  tripsRoutesRuntimePort,
  tripsSourcingJobRuntimePort,
} from "../src/index.js"
import { TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY } from "../src/payment-subscriber-runtime.js"
import { createTripsRuntimePortContribution } from "../src/runtime-contributor.js"
import { tripsVoyantModule } from "../src/voyant.js"

describe("trips deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(tripsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/trips",
      packageName: "@voyant-travel/trips",
      provides: {
        ports: [
          { id: "commerce.card-payment.runtime" },
          { id: "finance.payment-link.runtime" },
          { id: "finance.payment-reconciliation-job.runtime" },
          { id: "public-api.shopping.opaque-reference-issuer" },
          { id: "trips.public-offer-resolver.runtime" },
          { id: "trips.routes-runtime" },
          { id: "trips.database-runtime" },
          { id: "trips.sourcing-job-runtime" },
          { id: "trips.durable-action-runtime" },
        ],
      },
      runtimePorts: [
        { id: "trips.routes-runtime" },
        { id: "trips.database-runtime" },
        { id: "trips.sourcing-job-runtime" },
        { id: "trips.durable-action-runtime", optional: true },
        { id: "public-api.shopping.runtime", optional: true },
        { id: "payments.adapter.runtime", optional: true },
        { id: "catalog.runtime-services" },
        { id: "catalog.composite-booking-session.runtime" },
        { id: "commerce.checkout-api-options" },
        { id: "flights.runtime", optional: true },
      ],
      api: [
        {
          id: "@voyant-travel/trips#api.admin",
          surface: "admin",
          openapi: { document: "trips" },
          transactional: true,
          runtime: { entry: "@voyant-travel/trips", export: "createTripsVoyantRuntime" },
        },
        {
          id: "@voyant-travel/trips#api.public",
          surface: "public",
          openapi: { document: "trips" },
          transactional: true,
          runtime: { entry: "@voyant-travel/trips", export: "createTripsVoyantRuntime" },
        },
      ],
      schema: [{ id: "@voyant-travel/trips#schema" }],
      migrations: [{ id: "@voyant-travel/trips#migrations" }],
      jobs: [
        {
          id: "trips.execute-durable-actions",
          wakeup: true,
          scheduling: { required: true },
          runtime: {
            entry: "@voyant-travel/trips/action-job",
            export: "runTripActionJob",
          },
        },
        {
          id: "trips.source-requirement-candidates",
          wakeup: true,
          scheduling: { required: true },
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
    })
  })

  it("owns the executable payment completion runtime reference", () => {
    expect(tripsVoyantModule.subscribers?.[0]).toHaveProperty("runtime")
  })

  it("publishes the Commerce card-payment bridge only for a selected payment adapter", () => {
    const primitives = {
      database: { transaction: vi.fn() },
    } as never
    const adapter = stubPaymentAdapter()

    const withoutAdapter = createTripsRuntimePortContribution({
      primitives,
      hasRuntimePort: () => false,
      getRuntimePort: stubRequiredRuntimePortResolver(),
    })
    expect(withoutAdapter).not.toHaveProperty(commerceCardPaymentRuntimePort.id)

    const withHostCommerce = createTripsRuntimePortContribution({
      primitives,
      hasRuntimePort: (port) =>
        port.id === commerceCardPaymentRuntimePort.id || port.id === paymentAdapterRuntimePort.id,
      getRuntimePort: stubRequiredRuntimePortResolver(adapter),
    })
    expect(withHostCommerce).not.toHaveProperty(commerceCardPaymentRuntimePort.id)

    const withAdapter = createTripsRuntimePortContribution({
      primitives,
      hasRuntimePort: (port) => port.id === paymentAdapterRuntimePort.id,
      getRuntimePort: stubRequiredRuntimePortResolver(adapter),
    })
    expect(withAdapter).toHaveProperty(commerceCardPaymentRuntimePort.id)
  })

  /**
   * `public-api` requires the opaque-reference issuer this module provides, and
   * this module needs `public-api`'s shopping runtime — so neither contributor
   * can be ordered first. Reading that port while contributions are being
   * assembled throws "read before its static contributor provided it", which
   * crashed the production image on boot after migrations had already run
   * (voyant#4627).
   *
   * The stub refuses `public-api.shopping.runtime` exactly as the real host does
   * before contributors have run. An earlier version of this test ANSWERED it,
   * which made the suite pass over the crash.
   */
  it("does not read the shopping runtime while contributions are assembled", async () => {
    const contribution = createTripsRuntimePortContribution({
      primitives: { database: { transaction: vi.fn() } } as never,
      hasRuntimePort: () => false,
      getRuntimePort: stubRequiredRuntimePortResolver(),
    })

    // The routes payload is a promise; resolving it must not reach for the port.
    await expect(contribution[tripsRoutesRuntimePort.id] as Promise<unknown>).resolves.toBeDefined()
  })

  it("publishes the durable shopping issuer and offer resolver", () => {
    const contribution = createTripsRuntimePortContribution({
      primitives: { database: { transaction: vi.fn() } } as never,
      hasRuntimePort: () => false,
      getRuntimePort: stubRequiredRuntimePortResolver(),
    })

    expect(contribution).toHaveProperty(publicApiOpaqueReferenceIssuerPort.id)
    expect(contribution).toHaveProperty(publicApiTripOfferResolverPort.id)
    // The Trip-selection runtime is no longer published on a port: this package
    // owns both the routes and the runtime behind them (voyant#4627), so it is
    // handed straight to the routes through `trips.routes`.
    expect(contribution).not.toHaveProperty("public-api.trip-selections.runtime")
    expect(() => publicApiTripOfferResolverPort.test({} as never)).toThrow(/resolve/)
  })

  it("does not resolve the optional flights runtime when flights are not selected", async () => {
    const registerCompositeBookingSessionHandler = vi.fn()
    const getRuntimePort = vi.fn((port: { id: string }) => {
      if (port.id === "catalog.runtime-services") return { registerCompositeBookingSessionHandler }
      if (port.id === "catalog.composite-booking-session.runtime") {
        return { createValidatedTripSnapshotSession: vi.fn() }
      }
      if (port.id === "commerce.checkout-api-options") return () => ({})
      throw new Error(`unexpected runtime port ${port.id}`)
    })
    const contribution = createTripsRuntimePortContribution({
      primitives: { database: { transaction: vi.fn() } } as never,
      hasRuntimePort: (port) => port.id !== "flights.runtime",
      getRuntimePort: getRuntimePort as never,
    })

    await contribution[tripsRoutesRuntimePort.id]

    expect(getRuntimePort.mock.calls.map(([port]) => port.id)).not.toContain("flights.runtime")
    expect(registerCompositeBookingSessionHandler).toHaveBeenCalledOnce()
  })

  it("scopes selected Trips navigation, routes, and contributions", () => {
    expect(tripsVoyantModule.admin?.routes?.map((route) => route.requiredScopes)).toEqual([
      ["trips:read"],
      ["trips:read"],
    ])
    expect(tripsVoyantModule.admin?.contributions?.[0]?.requiredScopes).toEqual(["trips:write"])
    expect(tripsVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/trips#admin.route.trips-index",
        label: { namespace: "operator.admin.navigation", key: "nav.trips" },
      }),
    ])
  })

  it("describes API access and binds the critical reservation action", () => {
    expect(tripsVoyantModule.access?.resources).toEqual([
      expect.objectContaining({
        resource: "trips",
        label: "Trips",
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
          expect.objectContaining({
            action: "delete",
            label: expect.any(String),
            description: expect.any(String),
            sensitive: true,
          }),
        ],
      }),
    ])
    expect(tripsVoyantModule.actions).toContainEqual({
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
            ports: ["trips.durable-action-runtime"],
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
    })
    expect(tripsVoyantModule.actions).toContainEqual({
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
            ports: ["trips.durable-action-runtime"],
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
    })
    expect(tripsVoyantModule.tools).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/trips#tool.price-trip",
        requiredScopes: ["trips:write"],
        risk: "high",
      }),
    )
    expect(tripsVoyantModule.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "@voyant-travel/trips#action.add-requirement",
          targetType: "trip",
          commandTargetField: "envelopeId",
          targetLifecycle: "existing",
          risk: "medium",
          ledger: "required",
          approval: "never",
          allowedActorTypes: ["staff"],
        }),
        expect.objectContaining({
          id: "@voyant-travel/trips#action.source-requirement-candidates",
          version: "v2",
          commandTargetField: "requirementId",
          targetLifecycle: "existing",
          availability: { status: "available" },
          existingTarget: {
            durability: "handler-command-result-v1",
          },
          durability: {
            strategy: "saga",
            testReference: "packages/trips/tests/integration/durable-sourcing.test.ts",
          },
          effectBoundary: "multistage",
          risk: "medium",
          ledger: "required",
          approval: "never",
          allowedActorTypes: ["staff"],
        }),
        expect.objectContaining({
          id: "@voyant-travel/trips#action.get-requirement-sourcing-operation",
          version: "v2",
          kind: "read",
          targetType: "trip-requirement-sourcing-operation",
          risk: "low",
          ledger: "optional",
          allowedActorTypes: ["staff"],
        }),
        expect.objectContaining({
          id: "@voyant-travel/trips#action.select-candidate",
          commandTargetField: "requirementId",
          risk: "medium",
          ledger: "required",
          approval: "required",
          allowedActorTypes: ["staff"],
          existingTarget: { durability: "handler-command-result-v1" },
        }),
      ]),
    )
    expect(tripsVoyantModule.actions.some((action) => action.id.includes("#action.reshop-"))).toBe(
      false,
    )
    expect(tripsVoyantModule.tools.some((tool) => tool.id.includes("#tool.reshop-"))).toBe(false)
    expect(tripsVoyantModule.tools).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/trips#tool.get-requirement-sourcing-operation",
        requiredScopes: ["trips:read"],
        risk: "low",
      }),
    )
  })

  it("marks every public OpenAPI operation with its graph API id", () => {
    const document = JSON.parse(
      readFileSync(new URL("../openapi/public-api/trips.json", import.meta.url), "utf8"),
    )

    expect(publicOperationApiIds(document)).not.toHaveLength(0)
    expect(new Set(publicOperationApiIds(document))).toEqual(
      new Set(["@voyant-travel/trips#api.public"]),
    )
  })

  it.each([
    ["admin", true, false],
    ["public", false, true],
    ["both", true, true],
  ] as const)("mounts only the %s graph-selected API surfaces", async (selection, admin, public_) => {
    const routeOptions = vi.fn(async () => ({}))
    const db = {} as AnyDrizzleDb
    const withDb = vi.fn(
      async <T>(_bindings: unknown, operation: (value: AnyDrizzleDb) => Promise<T>): Promise<T> =>
        operation(db),
    )
    const resolveDb = vi.fn(() => db)
    const databaseRuntime: TripsDatabaseRuntime = { resolveDb, withDb }

    await expect(assertPortConforms(tripsRoutesRuntimePort, routeOptions)).resolves.toBeUndefined()
    await expect(
      assertPortConforms(tripsRoutesRuntimePort, { routeOptions: true } as never),
    ).rejects.toThrow(/must be a function/)
    await expect(
      assertPortConforms(tripsDatabaseRuntimePort, databaseRuntime),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(tripsDatabaseRuntimePort, { resolveDb, withDb: true } as never),
    ).rejects.toThrow(/resolveDb.*withDb/)
    await expect(
      assertPortConforms(tripsDatabaseRuntimePort, { resolveDb: true, withDb } as never),
    ).rejects.toThrow(/resolveDb.*withDb/)
    await expect(
      assertPortConforms(tripsSourcingJobRuntimePort, {
        resolveDb: vi.fn(),
        resolveSourceRegistry: vi.fn(),
        resolveOwnedSearchHandlers: vi.fn(),
        warn: vi.fn(),
      }),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(tripsSourcingJobRuntimePort, {
        resolveDb: vi.fn(),
        resolveSourceRegistry: vi.fn(),
        warn: vi.fn(),
      } as never),
    ).rejects.toThrow(/provider is incomplete/)

    const module = await createTripsVoyantRuntime({
      unitId: tripsVoyantModule.id,
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      hostOptions: {},
      api: tripsVoyantModule.api!.filter(({ surface }) =>
        selection === "both" ? true : surface === selection,
      ),
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: vi.fn(async (port) =>
        port.id === tripsRoutesRuntimePort.id ? routeOptions : databaseRuntime,
      ) as never,
      getPorts: vi.fn(async () => []) as never,
    })
    const bindings = { DATABASE_URL: "postgres://test" }
    const container = createContainer()

    expect(module.adminRoutes !== undefined).toBe(admin)
    expect(module.publicRoutes !== undefined).toBe(public_)
    expect(module.module.requiresTransactionalDb).toBe(true)

    await module.module.bootstrap?.({ bindings, container, eventBus: createEventBus() })
    const runtime = container.resolve<{
      withDb<T>(operation: (input: AnyDrizzleDb) => Promise<T>): Promise<T>
    }>(TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY)
    await expect(runtime.withDb(async (value) => value)).resolves.toBe(db)
    expect(withDb).toHaveBeenCalledWith(bindings, expect.any(Function))
  })
})

function publicOperationApiIds(document: unknown): unknown[] {
  const paths = (document as { paths?: Record<string, Record<string, unknown>> } | undefined)?.paths
  return Object.values(paths ?? {}).flatMap((path) =>
    Object.values(path).map(
      (operation) => (operation as Record<string, unknown>)["x-voyant-api-id"],
    ),
  )
}

function stubRequiredRuntimePortResolver(paymentAdapter?: PaymentAdapter) {
  return vi.fn((port: { id: string }) => {
    if (port.id === "catalog.runtime-services") return {}
    if (port.id === "catalog.composite-booking-session.runtime") {
      return { createValidatedTripSnapshotSession: vi.fn() }
    }
    if (port.id === "commerce.checkout-api-options") return () => ({})
    if (port.id === paymentAdapterRuntimePort.id && paymentAdapter) return paymentAdapter
    throw new Error(`unexpected runtime port ${port.id}`)
  }) as never
}

function stubPaymentAdapter(): PaymentAdapter {
  return {
    id: "test-payments",
    label: "Test Payments",
    contractVersion: PAYMENT_ADAPTER_CONTRACT_VERSION,
    mode: "test",
    capabilities: {
      hostedCheckout: true,
      redirectCheckout: true,
      authorize: false,
      capture: false,
      void: false,
      refund: false,
      status: false,
      callbackSignatureVerification: true,
      idempotencyKeys: true,
      retrySafeInitiation: true,
    },
    initiate: vi.fn(async (_context, input) => ({
      nextState: "requires_redirect",
      idempotencyKey: input.idempotencyKey,
      checkout: { kind: "redirect", url: "https://payments.example/checkout" },
      processorSessionId: "processor_session_1",
    })),
    verifyCallback: vi.fn(async () => ({ verified: false, reason: "malformed" })),
    health: vi.fn(async () => ({
      status: "ok",
      checkedAt: "2026-07-17T00:00:00.000Z",
    })),
  }
}
