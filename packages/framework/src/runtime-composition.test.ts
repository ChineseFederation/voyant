// agent-quality: file-size exception -- owner: framework; graph unit, facet, port, route posture, and plugin output contracts share one composition harness.
import { createEventBus } from "@voyant-travel/core"
import {
  assertPortConforms,
  defineGraphRuntimeFactory,
  definePort,
} from "@voyant-travel/core/project"
import { mountApp } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import {
  composeVoyantGraphRuntime,
  createVoyantGraphRuntimePortStubs,
} from "./runtime-composition.js"
import { createVoyantGraphRuntime } from "./runtime-lowering.js"

const EMPTY_SELECTED_IDS = {
  routes: [],
  tools: [],
  events: [],
  webhooks: [],
} as const

function apiReference(unitId: string, routeId: string, entry: string, exportName: string) {
  return {
    id: `${routeId}:runtime`,
    unitId,
    facet: "api" as const,
    entityId: routeId,
    runtime: { entry, export: exportName },
    importEntry: entry,
  }
}

function runtimeWithDuplicateFacets(load: () => Promise<unknown>) {
  return createVoyantGraphRuntime({
    graphHash: "sha256:test",
    entries: { "@acme/loyalty": load },
    modules: [
      {
        id: "@acme/loyalty",
        kind: "module",
        packageName: "@acme/loyalty",
        order: 0,
        references: ["admin", "public"].map((surface) => ({
          id: `@acme/loyalty#api.${surface}:runtime`,
          unitId: "@acme/loyalty",
          facet: "api" as const,
          entityId: `@acme/loyalty#api.${surface}`,
          runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
          importEntry: "@acme/loyalty",
        })),
        selectedIds: {
          ...EMPTY_SELECTED_IDS,
          routes: ["@acme/loyalty#api.admin", "@acme/loyalty#api.public"],
        },
        routes: ["admin", "public"].map((surface) => ({
          route: {
            id: `@acme/loyalty#api.${surface}`,
            surface: surface as "admin" | "public",
            runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
          },
          importEntry: "@acme/loyalty",
          referenceId: `@acme/loyalty#api.${surface}:runtime`,
        })),
      },
      {
        id: "operator/invitations",
        kind: "module",
        packageName: "@acme/operator",
        order: 1,
        selectedIds: EMPTY_SELECTED_IDS,
        routes: [],
      },
    ],
    plugins: [],
  })
}

describe("graph runtime composition", () => {
  it("creates conforming non-thenable stubs for package-owned runtime ports", () => {
    const graphRuntime = createVoyantGraphRuntime({
      graphHash: "sha256:runtime-port-stub",
      entries: {},
      modules: [
        {
          id: "@acme/identity",
          kind: "module",
          packageName: "@acme/identity",
          order: 0,
          requiredRuntimePorts: ["acme.identity-runtime"],
          selectedIds: EMPTY_SELECTED_IDS,
          routes: [],
        },
      ],
      plugins: [],
    })

    const provider = createVoyantGraphRuntimePortStubs(graphRuntime)[
      "acme.identity-runtime"
    ] as Record<string, unknown>

    expect(provider.then).toBeUndefined()
    expect(typeof provider.resolveDeployment).toBe("function")
    expect(typeof provider.resolveSourceAdapterRegistry).toBe("function")
    expect(typeof provider.readConfig).toBe("function")
    expect(typeof provider.resolveNotificationDispatcher).toBe("function")
    expect(typeof provider.resolveOperatorDefaultPaymentPolicy).toBe("function")
    expect(typeof provider.createPaymentPolicyRuntime).toBe("function")
    expect(typeof provider.resolvePaymentStarters).toBe("function")
    expect(typeof provider.resolvePrinter).toBe("function")
    expect(typeof provider.personExists).toBe("function")
    expect(typeof provider.resolveBankTransferInstructions).toBe("function")
    expect(typeof provider.createStartCardPayment).toBe("function")
    expect(typeof provider.ensureSourceRegistry).toBe("function")
    expect(provider.provider).toBe("inspection")
    expect(typeof provider.poller).toBe("function")
    expect(provider.primitives).toMatchObject({
      database: expect.any(Object),
      storage: expect.any(Object),
    })
    expect(provider.settings).toBeUndefined()
  })

  it("registers outbound subscribers from graph selections without a deployment event catalog", async () => {
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:webhook-runtime",
      entries: {},
      modules: [
        {
          id: "@acme/catalog",
          kind: "module",
          packageName: "@acme/catalog",
          order: 0,
          selectedIds: {
            ...EMPTY_SELECTED_IDS,
            events: ["@acme/catalog#event.updated"],
            webhooks: ["@acme/catalog#webhook.updated"],
          },
          routes: [],
        },
      ],
      plugins: [],
      webhookPlan: {
        inbound: [],
        outbound: [
          {
            id: "@acme/catalog#webhook.updated",
            unitId: "@acme/catalog",
            packageName: "@acme/catalog",
            eventId: "@acme/catalog#event.updated",
            eventUnitId: "@acme/catalog",
            eventType: "catalog.entity.updated",
            eventVersion: "1.0.0",
            payloadSchema: { type: "object", properties: {} },
            visibility: "external",
            audit: { sourceModule: "catalog", category: "domain" },
            secretIds: [],
          },
        ],
      },
    })
    const enqueue = vi.fn(async () => {})
    const composition = await composeVoyantGraphRuntime({
      runtime,
      capabilities: {},
      outboundWebhooks: { enqueue },
    })
    const module = composition.modules.find(
      (candidate) => candidate.module.name === "graph-outbound-webhooks",
    )
    const eventBus = createEventBus()
    await module?.module.bootstrap?.({ bindings: { deployment: "node" }, eventBus } as never)

    await eventBus.emit("catalog.entity.updated", { entity_id: "prod_1" })
    await eventBus.emit("catalog.entity.deleted", { entity_id: "prod_1" })

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "catalog.entity.updated",
        metadata: expect.objectContaining({
          eventId: expect.stringMatching(/^evt_/),
          category: "domain",
          graphEventId: "@acme/catalog#event.updated",
          graphEventVersion: "1.0.0",
          graphEventPayloadSchema: { type: "object", properties: {} },
          graphEventSourceModule: "catalog",
        }),
      }),
      { deployment: "node" },
    )
  })
  it("registers installed-app intake from external catalog without operator webhooks", async () => {
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:app-webhook-runtime",
      entries: {},
      eventCatalog: {
        schemaVersion: "voyant.event-catalog.v1",
        events: [
          {
            key: "invoice.issued@1.0.0",
            id: "@acme/finance#event.invoice.issued",
            unitId: "@acme/finance",
            packageName: "@acme/finance",
            eventType: "invoice.issued",
            version: "1.0.0",
            payloadSchema: {
              type: "object",
              properties: { invoiceId: { type: "string" } },
            },
            visibility: "external",
            audit: { sourceModule: "finance", category: "domain" },
            redactedFields: [],
          },
        ],
      },
      modules: [
        {
          id: "@acme/finance",
          kind: "module",
          packageName: "@acme/finance",
          order: 0,
          selectedIds: {
            ...EMPTY_SELECTED_IDS,
            events: ["@acme/finance#event.invoice.issued"],
          },
          routes: [],
        },
      ],
      plugins: [],
      webhookPlan: { inbound: [], outbound: [] },
    })
    const enqueue = vi.fn(async () => {})
    const composition = await composeVoyantGraphRuntime({
      runtime,
      capabilities: {},
      appWebhooks: { enqueue },
    })
    const module = composition.modules.find(
      (candidate) => candidate.module.name === "graph-app-webhooks",
    )
    const eventBus = createEventBus()
    await module?.module.bootstrap?.({ bindings: { deployment: "node" }, eventBus } as never)

    await eventBus.emit("invoice.issued", { invoiceId: "inv_1" })

    expect(enqueue).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "invoice.issued",
        metadata: expect.objectContaining({
          graphEventId: "@acme/finance#event.invoice.issued",
          graphEventVersion: "1.0.0",
          graphEventSourceModule: "finance",
        }),
      }),
      { deployment: "node" },
    )
  })
  it("requires selected inbound webhook APIs to execute through webhookRoutes", async () => {
    const createRuntime = (webhookRoutes: unknown) =>
      createVoyantGraphRuntime({
        graphHash: "sha256:webhook-posture",
        entries: {
          "@acme/hooks": async () => ({
            createHooksModule: () => ({ module: { name: "hooks" }, webhookRoutes }),
          }),
        },
        modules: [
          {
            id: "@acme/hooks",
            kind: "module",
            packageName: "@acme/hooks",
            order: 0,
            references: [
              {
                id: "hooks-inbound-route",
                unitId: "@acme/hooks",
                facet: "api",
                entityId: "@acme/hooks#api.inbound",
                runtime: { entry: "@acme/hooks", export: "createHooksModule" },
                importEntry: "@acme/hooks",
              },
            ],
            selectedIds: {
              ...EMPTY_SELECTED_IDS,
              routes: ["@acme/hooks#api.inbound"],
              webhooks: ["@acme/hooks#webhook.inbound"],
            },
            routes: [
              {
                route: {
                  id: "@acme/hooks#api.inbound",
                  surface: "webhook",
                  runtime: { entry: "@acme/hooks", export: "createHooksModule" },
                },
                importEntry: "@acme/hooks",
                referenceId: "hooks-inbound-route",
              },
            ],
          },
        ],
        plugins: [],
        webhookPlan: {
          inbound: [
            {
              id: "@acme/hooks#webhook.inbound",
              unitId: "@acme/hooks",
              packageName: "@acme/hooks",
              apiId: "@acme/hooks#api.inbound",
              apiUnitId: "@acme/hooks",
              mountPath: "/v1/hooks",
              secretIds: [],
            },
          ],
          outbound: [],
        },
      })

    await expect(
      composeVoyantGraphRuntime({ runtime: createRuntime({}), capabilities: {} }),
    ).resolves.toMatchObject({ modules: [{ module: { name: "hooks" } }] })
    await expect(
      composeVoyantGraphRuntime({ runtime: createRuntime(undefined), capabilities: {} }),
    ).rejects.toThrow(/inbound webhook plan.*no webhookRoutes/)
  })

  it("registers ordinary graph subscribers without treating them as workflow filters", async () => {
    const handler = vi.fn(async () => {})
    const subscriber = {
      id: "@acme/alerts#subscriber.booking-confirmed",
      eventType: "booking.confirmed",
      register: vi.fn(({ eventBus }) => {
        eventBus.subscribe("booking.confirmed", handler)
      }),
    }
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:subscriber-runtime",
      entries: {
        "@acme/alerts/subscribers": async () => ({ subscriber }),
      },
      modules: [
        {
          id: "@acme/alerts",
          localId: "alerts",
          kind: "module",
          packageName: "@acme/alerts",
          order: 0,
          references: [
            {
              id: "alerts-subscriber",
              unitId: "@acme/alerts",
              facet: "subscribers.runtime",
              entityId: subscriber.id,
              runtime: { entry: "./subscribers", export: "subscriber" },
              importEntry: "@acme/alerts/subscribers",
            },
          ],
          selectedIds: EMPTY_SELECTED_IDS,
          routes: [],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })
    const module = composition.modules.find(
      (candidate) => candidate.module.name === "alerts.graph-runtime",
    )
    const eventBus = createEventBus()

    await module?.module.bootstrap?.({ bindings: {}, container: {} as never, eventBus })
    await eventBus.emit("booking.confirmed", { bookingId: "booking_1" })

    expect(subscriber.register).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledOnce()
  })

  it("rejects an ordinary subscriber runtime with a mismatched graph id", async () => {
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:subscriber-runtime-mismatch",
      entries: {
        "@acme/alerts/subscribers": async () => ({
          subscriber: {
            id: "@acme/alerts#subscriber.wrong",
            eventType: "booking.confirmed",
            register: vi.fn(),
          },
        }),
      },
      modules: [
        {
          id: "@acme/alerts",
          kind: "module",
          packageName: "@acme/alerts",
          order: 0,
          references: [
            {
              id: "alerts-subscriber",
              unitId: "@acme/alerts",
              facet: "subscribers.runtime",
              entityId: "@acme/alerts#subscriber.booking-confirmed",
              runtime: { entry: "./subscribers", export: "subscriber" },
              importEntry: "@acme/alerts/subscribers",
            },
          ],
          selectedIds: EMPTY_SELECTED_IDS,
          routes: [],
        },
      ],
      plugins: [],
    })

    await expect(composeVoyantGraphRuntime({ runtime, capabilities: {} })).rejects.toThrow(
      /does not match graph subscriber/,
    )
  })

  it("mounts a package runtime export once when multiple API facets reference it", async () => {
    const factory = vi.fn(() => ({ module: { name: "loyalty" } }))
    const importRuntime = vi.fn(async () => ({ createLoyaltyModule: factory }))

    const composition = await composeVoyantGraphRuntime({
      runtime: runtimeWithDuplicateFacets(importRuntime),
      capabilities: {},
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual(["loyalty"])
    expect(importRuntime).toHaveBeenCalledTimes(1)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it("preserves route-owned authorization in selected graph access posture", async () => {
    const importRuntime = vi.fn(async () => ({
      createLoyaltyModule: () => ({ module: { name: "loyalty" } }),
    }))
    const base = runtimeWithDuplicateFacets(importRuntime)
    const runtime = {
      ...base,
      modules: base.modules.map((unit) => ({
        ...unit,
        routes: unit.routes.map((definition) => ({
          ...definition,
          route:
            definition.route.surface === "admin"
              ? {
                  ...definition.route,
                  mount: "navigation-preferences",
                  resource: "admin-navigation",
                  authorization: "route" as const,
                }
              : definition.route,
        })),
      })),
    }

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })

    expect(composition.accessResources).toContainEqual({
      path: "/v1/admin/navigation-preferences",
      resource: "admin-navigation",
      authorization: "route",
    })
  })

  it("preserves a project API root mount when a single public route is selected", async () => {
    const publicRoutes = new Hono().get("/foo", (context) => context.json({ route: "foo" }))
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:project-api-public-route",
      entries: {
        "./.voyant/runtime/project-api.generated.js": async () => ({
          projectApiModule: {
            module: { name: "project-api" },
            publicRoutes,
            publicPath: "/",
          },
        }),
      },
      modules: [
        {
          id: "project/api",
          localId: "project-api",
          kind: "module",
          packageName: "project",
          order: 0,
          references: [
            apiReference(
              "project/api",
              "project.api.public.foo",
              "./.voyant/runtime/project-api.generated.js",
              "projectApiModule",
            ),
          ],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["project.api.public.foo"] },
          routes: [
            {
              route: {
                id: "project.api.public.foo",
                surface: "public",
                mount: "/foo",
                // A public mount is secret-key-only unless it declares
                // `publishable` (voyant#4625); this asserts where a project API
                // root mount lands, not what the capability line does.
                publishable: true,
                runtime: {
                  entry: "./.voyant/runtime/project-api.generated.js",
                  export: "projectApiModule",
                },
              },
              importEntry: "./.voyant/runtime/project-api.generated.js",
              referenceId: "project.api.public.foo:runtime",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({ runtime, capabilities: {} })
    const app = mountApp({
      db: () => ({}) as never,
      modules: composition.modules,
      auth: {
        resolve: () => ({ userId: "user_1", actor: "customer", realm: "customer" }),
      },
    })

    expect(composition.modules[0]?.publicPath).toBe("/")
    const bindings = { DATABASE_URL: "postgres://test" }
    expect((await app.request("/v1/public/foo", {}, bindings)).status).toBe(200)
    expect((await app.request("/v1/public/foo/foo", {}, bindings)).status).toBe(404)
  })

  it("passes only selected API facets to a package runtime factory", async () => {
    const factory = defineGraphRuntimeFactory(vi.fn(() => ({ module: { name: "loyalty" } })))
    const importRuntime = vi.fn(async () => ({ createLoyaltyModule: factory }))
    const runtime = runtimeWithDuplicateFacets(importRuntime)
    const adminOnlyRuntime = {
      ...runtime,
      modules: runtime.modules.map((unit) => ({
        ...unit,
        routes: unit.routes.filter(({ route }) => route.surface === "admin"),
      })),
    }

    await composeVoyantGraphRuntime({ runtime: adminOnlyRuntime, capabilities: {} })

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        api: [{ id: "@acme/loyalty#api.admin", surface: "admin" }],
      }),
    )
  })

  it("injects only manifest-declared runtime ports into package-owned factories", async () => {
    const loyaltyPort = definePort<{ prefix: string }>({ id: "loyalty.runtime", test: () => {} })
    const factory = defineGraphRuntimeFactory(
      vi.fn(async ({ getPort }) => {
        const provider = await getPort(loyaltyPort)
        return { module: { name: provider.prefix } }
      }),
    )
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:runtime-port",
      entries: { "@acme/loyalty": async () => ({ createLoyaltyModule: factory }) },
      modules: [
        {
          id: "@acme/loyalty",
          kind: "module",
          packageName: "@acme/loyalty",
          order: 0,
          runtimePorts: [loyaltyPort.id],
          references: [
            apiReference(
              "@acme/loyalty",
              "@acme/loyalty#api",
              "@acme/loyalty",
              "createLoyaltyModule",
            ),
          ],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/loyalty#api"] },
          routes: [
            {
              route: {
                id: "@acme/loyalty#api",
                surface: "admin",
                runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
              },
              importEntry: "@acme/loyalty",
              referenceId: "@acme/loyalty#api:runtime",
            },
          ],
        },
      ],
      plugins: [],
    })

    const composition = await composeVoyantGraphRuntime({
      runtime,
      capabilities: {},
      ports: { [loyaltyPort.id]: Promise.resolve({ prefix: "loyalty" }) },
    })

    expect(composition.modules).toEqual([{ module: { name: "loyalty" } }])
    expect(factory).toHaveBeenCalledOnce()
  })

  it("rejects missing and undeclared package runtime ports", async () => {
    const declaredPort = definePort<unknown>({ id: "loyalty.runtime", test: () => {} })
    const undeclaredPort = definePort<unknown>({ id: "billing.runtime", test: () => {} })
    const createRuntime = (port: typeof declaredPort) =>
      createVoyantGraphRuntime({
        graphHash: "sha256:invalid-runtime-port",
        entries: {
          "@acme/loyalty": async () => ({
            createLoyaltyModule: defineGraphRuntimeFactory(async ({ getPort }) => {
              await getPort(port)
              return { module: { name: "loyalty" } }
            }),
          }),
        },
        modules: [
          {
            id: "@acme/loyalty",
            kind: "module",
            packageName: "@acme/loyalty",
            order: 0,
            runtimePorts: [declaredPort.id],
            references: [
              apiReference(
                "@acme/loyalty",
                "@acme/loyalty#api",
                "@acme/loyalty",
                "createLoyaltyModule",
              ),
            ],
            selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/loyalty#api"] },
            routes: [
              {
                route: {
                  id: "@acme/loyalty#api",
                  surface: "admin",
                  runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
                },
                importEntry: "@acme/loyalty",
                referenceId: "@acme/loyalty#api:runtime",
              },
            ],
          },
        ],
        plugins: [],
      })

    await expect(
      composeVoyantGraphRuntime({ runtime: createRuntime(declaredPort), capabilities: {} }),
    ).rejects.toThrow(/requires runtime port "loyalty.runtime"/)
    await expect(
      composeVoyantGraphRuntime({
        runtime: createRuntime(undeclaredPort),
        capabilities: {},
        ports: { [undeclaredPort.id]: {} },
      }),
    ).rejects.toThrow(/requested undeclared port "billing.runtime"/)
  })

  it("allows factories to branch on optional runtime-port bindings", async () => {
    const optionalPort = definePort<{ name: string }>({
      id: "loyalty.optional-runtime",
      test: () => {},
    })
    const factory = defineGraphRuntimeFactory(async ({ getPort, hasPort }) => ({
      module: {
        name: hasPort(optionalPort) ? (await getPort(optionalPort)).name : "loyalty-fallback",
      },
    }))
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:optional-runtime-port",
      entries: { "@acme/loyalty": async () => ({ createLoyaltyModule: factory }) },
      modules: [
        {
          id: "@acme/loyalty",
          kind: "module",
          packageName: "@acme/loyalty",
          order: 0,
          runtimePorts: [optionalPort.id],
          requiredRuntimePorts: [],
          references: [
            apiReference(
              "@acme/loyalty",
              "@acme/loyalty#api",
              "@acme/loyalty",
              "createLoyaltyModule",
            ),
          ],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/loyalty#api"] },
          routes: [
            {
              route: {
                id: "@acme/loyalty#api",
                surface: "admin",
                runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
              },
              importEntry: "@acme/loyalty",
              referenceId: "@acme/loyalty#api:runtime",
            },
          ],
        },
      ],
      plugins: [],
    })

    await expect(composeVoyantGraphRuntime({ runtime, capabilities: {} })).resolves.toMatchObject({
      modules: [{ module: { name: "loyalty-fallback" } }],
    })
    await expect(
      composeVoyantGraphRuntime({
        runtime,
        capabilities: {},
        ports: { [optionalPort.id]: { name: "loyalty-bound" } },
      }),
    ).resolves.toMatchObject({
      modules: [{ module: { name: "loyalty-bound" } }],
    })
  })

  it("reads optional many-valued runtime ports without collapsing contributors", async () => {
    const providerPort = definePort<{ name: string }>({
      id: "loyalty.providers",
      test: () => {},
    })
    const factory = defineGraphRuntimeFactory(async ({ getPorts }) => ({
      module: { name: (await getPorts(providerPort)).map(({ name }) => name).join(",") || "none" },
    }))
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:many-runtime-port",
      entries: { "@acme/loyalty": async () => ({ createLoyaltyModule: factory }) },
      modules: [
        {
          id: "@acme/loyalty",
          kind: "module",
          packageName: "@acme/loyalty",
          order: 0,
          runtimePorts: [providerPort.id],
          manyRuntimePorts: [providerPort.id],
          requiredRuntimePorts: [],
          references: [
            apiReference(
              "@acme/loyalty",
              "@acme/loyalty#api",
              "@acme/loyalty",
              "createLoyaltyModule",
            ),
          ],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/loyalty#api"] },
          routes: [
            {
              route: {
                id: "@acme/loyalty#api",
                surface: "admin",
                runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
              },
              importEntry: "@acme/loyalty",
              referenceId: "@acme/loyalty#api:runtime",
            },
          ],
        },
      ],
      plugins: [],
    })

    await expect(composeVoyantGraphRuntime({ runtime, capabilities: {} })).resolves.toMatchObject({
      modules: [{ module: { name: "none" } }],
    })
    await expect(
      composeVoyantGraphRuntime({
        runtime,
        capabilities: {},
        ports: { [providerPort.id]: [{ name: "alpha" }, { name: "zeta" }] },
      }),
    ).resolves.toMatchObject({ modules: [{ module: { name: "alpha,zeta" } }] })
  })

  it("runs a port's conformance kit before exposing a deployment binding", async () => {
    const exhaustiveVerification = vi.fn()
    const runtimePort = definePort<{ ready: boolean }>({
      id: "loyalty.runtime",
      test(provider) {
        if (!provider.ready) throw new Error("loyalty.runtime provider is not ready")
      },
      verify: exhaustiveVerification,
    })
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:non-conforming-runtime-port",
      entries: {
        "@acme/loyalty": async () => ({
          createLoyaltyModule: defineGraphRuntimeFactory(async ({ getPort }) => {
            await getPort(runtimePort)
            return { module: { name: "loyalty" } }
          }),
        }),
      },
      modules: [
        {
          id: "@acme/loyalty",
          kind: "module",
          packageName: "@acme/loyalty",
          order: 0,
          runtimePorts: [runtimePort.id],
          references: [
            apiReference(
              "@acme/loyalty",
              "@acme/loyalty#api",
              "@acme/loyalty",
              "createLoyaltyModule",
            ),
          ],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/loyalty#api"] },
          routes: [
            {
              route: {
                id: "@acme/loyalty#api",
                surface: "admin",
                runtime: { entry: "@acme/loyalty", export: "createLoyaltyModule" },
              },
              importEntry: "@acme/loyalty",
              referenceId: "@acme/loyalty#api:runtime",
            },
          ],
        },
      ],
      plugins: [],
    })

    await expect(
      composeVoyantGraphRuntime({
        runtime,
        capabilities: {},
        ports: { [runtimePort.id]: { ready: false } },
      }),
    ).rejects.toThrow("loyalty.runtime provider is not ready")
    expect(exhaustiveVerification).not.toHaveBeenCalled()

    await assertPortConforms(runtimePort, { ready: true })
    expect(exhaustiveVerification).toHaveBeenCalledOnce()
  })

  it("uses selected ID bindings for option-bearing factories and local units", async () => {
    const configuredFactory = vi.fn((options: { prefix: string }) => ({
      module: { name: options.prefix },
    }))
    const localBinding = vi.fn(() => ({ module: { name: "invitations" } }))

    const composition = await composeVoyantGraphRuntime({
      runtime: runtimeWithDuplicateFacets(async () => ({
        createLoyaltyModule: configuredFactory,
      })),
      capabilities: { prefix: "configured-loyalty" },
      bindings: {
        "@acme/loyalty": ({ capabilities, runtimeExports }) =>
          (runtimeExports[0] as typeof configuredFactory)({ prefix: capabilities.prefix }),
        "operator/invitations": localBinding,
      },
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual([
      "configured-loyalty",
      "invitations",
    ])
    expect(configuredFactory).toHaveBeenCalledTimes(1)
    expect(localBinding).toHaveBeenCalledTimes(1)
  })

  it("does not run or mount a binding when its unit is absent from the graph", async () => {
    const removedBinding = vi.fn(() => ({ module: { name: "removed" } }))
    const runtime = runtimeWithDuplicateFacets(async () => ({
      createLoyaltyModule: () => ({ module: { name: "loyalty" } }),
    }))

    const composition = await composeVoyantGraphRuntime({
      runtime,
      capabilities: {},
      bindings: { "@acme/removed": removedBinding },
    })

    expect(composition.modules.map((module) => module.module.name)).toEqual(["loyalty"])
    expect(removedBinding).not.toHaveBeenCalled()
  })

  it("accepts plugin-owned modules and rejects invalid plugin runtime exports", async () => {
    const moduleRuntime = createVoyantGraphRuntime({
      graphHash: "sha256:plugin-module",
      entries: { "@acme/billing": async () => ({ billing: { module: { name: "billing" } } }) },
      modules: [],
      plugins: [
        {
          id: "@acme/billing",
          kind: "plugin",
          packageName: "@acme/billing",
          order: 0,
          runtimeReferenceId: "@acme/billing#runtime",
          references: [
            {
              id: "@acme/billing#runtime",
              unitId: "@acme/billing",
              facet: "runtime",
              entityId: "@acme/billing",
              runtime: { entry: "@acme/billing", export: "billing" },
              importEntry: "@acme/billing",
            },
          ],
          selectedIds: EMPTY_SELECTED_IDS,
          routes: [],
        },
      ],
    })
    await expect(
      composeVoyantGraphRuntime({ runtime: moduleRuntime, capabilities: {} }),
    ).resolves.toMatchObject({ modules: [{ module: { name: "billing" } }] })

    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:test",
      entries: { "@acme/audit": async () => ({ audit: { wrong: true } }) },
      modules: [],
      plugins: [
        {
          id: "@acme/audit",
          kind: "plugin",
          packageName: "@acme/audit",
          order: 0,
          references: [apiReference("@acme/audit", "@acme/audit#api", "@acme/audit", "audit")],
          selectedIds: { ...EMPTY_SELECTED_IDS, routes: ["@acme/audit#api"] },
          routes: [
            {
              route: {
                id: "@acme/audit#api",
                surface: "admin",
                runtime: { entry: "@acme/audit", export: "audit" },
              },
              importEntry: "@acme/audit",
              referenceId: "@acme/audit#api:runtime",
            },
          ],
        },
      ],
    })

    await expect(composeVoyantGraphRuntime({ runtime, capabilities: {} })).rejects.toThrow(
      /plugin "@acme\/audit" must resolve to ApiModule or ApiExtension/,
    )
  })
})
