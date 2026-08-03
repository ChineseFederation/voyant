// agent-quality: file-size exception -- owner: framework; deployment graph v1 tests stay co-located while resolver, diagnostics, hashing, and compatibility behavior share one harness.

import { describe, expect, it } from "vitest"
import {
  createTestDeployment,
  defineAdapter,
  defineDeployment,
  defineExtension,
  defineModule,
  definePlugin,
  defineProject,
  defineProvider,
  graphIdFromSpecifier,
  packageNameFromSpecifier,
  resolveDeploymentGraph,
  resolveDeploymentGraphWithPackageManifests,
  VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY,
  VOYANT_RESOLVED_GRAPH_SCHEMA_VERSION,
  validateGraphUnitManifest,
} from "./deployment-graph.js"
import { assertPortConforms, definePort, providePort, requirePort } from "./ports.js"

describe("deployment graph v1", () => {
  it("validates and lowers selected custom-field targets with one owner", async () => {
    const module = defineModule({
      id: "@acme/voyant-bookings",
      customFieldTargets: [
        {
          id: "booking",
          namespace: "bookings",
          label: "Booking",
          fieldTypes: ["text", "boolean", "text"],
          capabilities: ["write", "read"],
        },
      ],
    })

    expect(validateGraphUnitManifest(module)).toEqual([])

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [module] }),
    })
    expect(graph.modules[0]?.customFieldTargets).toEqual([
      {
        id: "booking",
        namespace: "bookings",
        label: "Booking",
        fieldTypes: ["boolean", "text"],
        capabilities: ["read", "write"],
        ownerUnitId: "@acme/voyant-bookings",
      },
    ])
  })

  it("rejects invalid and duplicate selected custom-field target authorities", async () => {
    const invalidTarget = {
      id: "Booking",
      namespace: "Invalid Namespace",
      label: "",
      fieldTypes: [],
      capabilities: ["vendor-specific"],
    }

    expect(
      validateGraphUnitManifest({
        ...defineModule({ id: "@acme/voyant-invalid" }),
        customFieldTargets: [invalidTarget],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET" }),
      ]),
    )

    const target = {
      id: "booking",
      namespace: "bookings",
      label: "Booking",
      fieldTypes: ["text"],
      capabilities: ["read"] as const,
    }
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({ id: "@acme/voyant-bookings", customFieldTargets: [target] }),
          defineModule({ id: "@acme/voyant-orders", customFieldTargets: [target] }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_DUPLICATE_CUSTOM_FIELD_TARGET",
          facet: "customFieldTargets",
        }),
      ]),
    )

    const namespaceGraph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({ id: "@acme/voyant-bookings", customFieldTargets: [target] }),
          defineModule({
            id: "@acme/voyant-orders",
            customFieldTargets: [{ ...target, id: "order" }],
          }),
        ],
      }),
    })
    expect(namespaceGraph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_CONFLICTING_CUSTOM_FIELD_NAMESPACE_OWNER" }),
      ]),
    )

    const reservedNamespaceGraph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/voyant-bookings",
            customFieldTargets: [{ ...target, namespace: "app--claimed" }],
          }),
        ],
      }),
    })
    expect(reservedNamespaceGraph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          facet: "customFieldTargets[0].namespace",
        }),
      ]),
    )
  })

  it("defines closed module, extension, plugin, adapter, and provider manifests", () => {
    const module = defineModule({
      id: "@acme/voyant-loyalty",
      provides: { capabilities: ["acme.loyalty.points"] },
      api: [{ id: "@acme/voyant-loyalty#api.admin", surface: "admin" }],
    })
    const plugin = definePlugin({
      id: "@acme/voyant-fiscal#smartbill",
      provides: { capabilities: ["acme.fiscal.invoice"] },
    })
    const adapter = defineAdapter({
      id: "@acme/voyant-payments#netopia",
      providers: [
        {
          id: "@acme/voyant-payments#provider.netopia",
          port: "payments.processor",
          selection: { role: "payments", value: "netopia" },
          runtime: { entry: "./netopia", export: "createNetopiaProcessor" },
        },
      ],
    })
    const provider = defineProvider({
      id: "@acme/voyant-storage#s3",
      providers: [
        {
          id: "@acme/voyant-storage#provider.s3",
          port: "storage.object",
          selection: { role: "storage", value: "s3" },
          runtime: { entry: "./s3", export: "createObjectStorage" },
        },
      ],
    })
    const extension = defineExtension({ id: "@acme/voyant-loyalty#admin-extension" })

    expect(module.schemaVersion).toBe("voyant.module.v1")
    expect(extension.schemaVersion).toBe("voyant.extension.v1")
    expect(plugin.schemaVersion).toBe("voyant.plugin.v1")
    expect(adapter.schemaVersion).toBe("voyant.adapter.v1")
    expect(provider.schemaVersion).toBe("voyant.provider.v1")

    expect(
      validateGraphUnitManifest({
        ...module,
        audit: { actions: [] },
        unsupportedThing: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_UNSUPPORTED_FACET",
          facet: "audit",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_UNKNOWN_FACET",
          facet: "unsupportedThing",
        }),
      ]),
    )
    expect(validateGraphUnitManifest(module)).toEqual([])
    expect(validateGraphUnitManifest(adapter, "adapter")).toEqual([])
    expect(validateGraphUnitManifest(provider, "provider")).toEqual([])
    expect(
      validateGraphUnitManifest({ ...adapter, schemaVersion: "voyant.plugin.v1" }, "adapter"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_SCHEMA_VERSION" }),
      ]),
    )
    expect(
      validateGraphUnitManifest(
        { schemaVersion: "voyant.unknown.v1", id: "@acme/voyant-unknown" },
        "provider",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_SCHEMA_VERSION" }),
      ]),
    )
  })

  it("requires provider value usage to reference declarations from the same manifest", () => {
    const plugin = definePlugin({
      id: "@acme/voyant-storage",
      providers: [
        {
          id: "@acme/voyant-storage#provider.custom",
          port: "storage.object",
          selection: { role: "storage", value: "custom" },
          uses: { secrets: ["@acme/voyant-storage#secret.missing"] },
          runtime: { entry: "@acme/voyant-storage/provider", export: "createStorageResolver" },
        },
      ],
    })

    expect(validateGraphUnitManifest(plugin)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "providers[0].uses.secrets",
        }),
      ]),
    )
  })

  it("rejects ambiguous and malformed graph link declarations", () => {
    const diagnostics = validateGraphUnitManifest({
      schemaVersion: "voyant.module.v1",
      id: "@acme/voyant-links",
      links: [
        {
          id: "@acme/voyant-links#linkable.customer",
          source: "@acme/voyant-links/linkables",
          export: "customerLinkable",
        },
        {
          id: "@acme/voyant-links#link.customer-order",
          kind: "definition",
          source: "@acme/voyant-links/links",
        },
      ],
    })

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "links[0].kind",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "links[1].export",
        }),
      ]),
    )
  })

  it("carries a declared response-cache posture from the project into the resolved graph", async () => {
    const declared = defineProject({
      modules: [],
      deployment: { responseCache: { edge: "declared" } },
    })
    const undeclared = defineProject({ modules: [] })

    expect((await resolveDeploymentGraph({ project: declared })).deployment.responseCache).toEqual({
      edge: "declared",
    })
    // Absent stays absent in the artifact; the runtime is what reads it as "none".
    expect(
      (await resolveDeploymentGraph({ project: undeclared })).deployment.responseCache,
    ).toBeUndefined()
    expect(() =>
      defineProject({
        modules: [],
        deployment: { responseCache: { edge: "cdn" } as never },
      }),
    ).toThrow(/deployment\.responseCache\.edge/)
  })

  it("normalizes legacy v1 projects without an extension lane", async () => {
    const plugin = definePlugin({ id: "@acme/voyant-fiscal#smartbill" })
    const project = defineProject({ modules: [], plugins: [plugin] })
    Reflect.deleteProperty(project, "extensions")

    const graph = await resolveDeploymentGraph({ project })

    expect(graph.extensions).toEqual([])
    expect(graph.plugins.map((unit) => unit.id)).toEqual(["@acme/voyant-fiscal#smartbill"])
  })

  it("validates and normalizes package-owned presentation factories", async () => {
    const module = defineModule({
      id: "@acme/storefront",
      presentations: [
        {
          id: "@acme/storefront#presentation.partner",
          runtime: { entry: "./partner", export: "createPartnerPresentation" },
        },
        {
          id: "@acme/storefront#presentation.customer",
          runtime: { entry: "./customer", export: "createCustomerPresentation" },
        },
      ],
    })

    expect(validateGraphUnitManifest(module)).toEqual([])
    expect(
      validateGraphUnitManifest({
        ...module,
        presentations: [
          { id: "@acme/storefront#presentation.invalid", runtime: { entry: "./invalid" } },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "presentations[0].runtime.export" }),
      ]),
    )

    expect(
      validateGraphUnitManifest({
        ...module,
        presentations: [
          {
            id: "@acme/storefront#presentation.customer",
            runtime: { entry: "./customer", export: "createCustomerPresentation" },
            routes: [{ route: "shop", member: "" }],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "presentations[0].contribution" }),
        expect.objectContaining({ facet: "presentations[0].routes[0].route" }),
        expect.objectContaining({ facet: "presentations[0].routes[0].member" }),
      ]),
    )

    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })
    expect(graph.modules[0]?.presentations?.map(({ id }) => id)).toEqual([
      "@acme/storefront#presentation.customer",
      "@acme/storefront#presentation.partner",
    ])
  })

  it("validates versioned event contracts and declarative lifecycle cleanup", () => {
    const diagnostics = validateGraphUnitManifest({
      ...defineModule({
        id: "@acme/voyant-loyalty",
        resources: [{ id: "@acme/voyant-loyalty#resource.cache", kind: "cache" }],
        events: [
          {
            id: "@acme/voyant-loyalty#event.changed",
            eventType: "loyalty.changed",
            version: "not-semver",
          },
        ],
        lifecycle: {
          cleanup: [
            {
              id: "@acme/voyant-loyalty#cleanup.cache",
              resourceId: "@acme/voyant-loyalty#resource.cache",
              on: [],
              action: "release",
            },
          ],
        },
      }),
    })

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "events[0]" }),
        expect.objectContaining({ facet: "events[0].version" }),
        expect.objectContaining({ facet: "lifecycle.cleanup[0].on" }),
      ]),
    )
    expect(() =>
      validateGraphUnitManifest({
        ...defineModule({ id: "@acme/voyant-loyalty" }),
        lifecycle: null,
      }),
    ).not.toThrow()
  })

  it("rejects duplicate selected event type authorities", async () => {
    const event = {
      eventType: "loyalty.changed",
      version: "1.0.0",
      payloadSchema: { type: "object", properties: {} },
      visibility: "internal" as const,
      audit: { sourceModule: "loyalty", category: "domain" as const },
    }
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/loyalty",
            events: [{ id: "@acme/loyalty#event.changed", ...event }],
          }),
          defineModule({
            id: "@acme/rewards",
            events: [{ id: "@acme/rewards#event.changed", ...event }],
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_DUPLICATE_EVENT_TYPE",
          facet: "events.eventType",
        }),
      ]),
    )
  })

  it("allows one selected unit to own multiple versions of an event type", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/loyalty",
            events: ["1.0.0", "2.0.0"].map((version) => ({
              id: `@acme/loyalty#event.changed-v${version[0]}`,
              eventType: "loyalty.changed",
              version,
              payloadSchema: { type: "object", properties: {} },
              visibility: "internal" as const,
              audit: { sourceModule: "loyalty", category: "domain" as const },
            })),
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual([])
    expect(graph.eventCatalog.events.map(({ key }) => key)).toEqual([
      "loyalty.changed@1.0.0",
      "loyalty.changed@2.0.0",
    ])
  })

  it("rejects duplicate event versions declared by one selected unit", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/loyalty",
            events: ["changed", "updated"].map((name) => ({
              id: `@acme/loyalty#event.${name}`,
              eventType: "loyalty.changed",
              version: "1.0.0",
              payloadSchema: { type: "object", properties: {} },
              visibility: "internal" as const,
              audit: { sourceModule: "loyalty", category: "domain" as const },
            })),
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_DUPLICATE_EVENT_VERSION",
          facet: "events.version",
          source: "@acme/loyalty",
        }),
      ]),
    )
  })

  it("resolves the full package-owned facet contract without starter catalogs", async () => {
    const module = defineModule({
      id: "@acme/voyant-loyalty",
      api: [
        {
          id: "@acme/voyant-loyalty#api.admin",
          surface: "admin",
          methods: ["POST", "GET"],
          requiredScopes: ["loyalty:read"],
          runtime: { entry: "@acme/voyant-loyalty/routes", export: "adminRoutes" },
        },
      ],
      migrations: [{ id: "@acme/voyant-loyalty#migration.001", source: "./migrations" }],
      setupMigrations: [
        {
          id: "@acme/voyant-loyalty#setup.default-tiers",
          source: "./setup/default-tiers",
          runtime: { entry: "@acme/voyant-loyalty/setup", export: "runSetup" },
          dependsOn: ["@acme/voyant-loyalty#migration.001"],
        },
      ],
      config: [
        {
          id: "@acme/voyant-loyalty#config.tiers",
          key: "tiers",
          validator: { entry: "@acme/voyant-loyalty/config", export: "tiersSchema" },
        },
      ],
      secrets: [
        {
          id: "@acme/voyant-loyalty#secret.webhook",
          key: "webhookSecret",
          required: true,
        },
      ],
      resources: [{ id: "@acme/voyant-loyalty#resource.store", kind: "database", required: true }],
      providers: [
        {
          id: "@acme/voyant-loyalty#provider.ledger",
          port: "acme.loyalty.ledger",
          uses: {
            config: ["@acme/voyant-loyalty#config.tiers"],
            secrets: ["@acme/voyant-loyalty#secret.webhook"],
            resources: ["@acme/voyant-loyalty#resource.store"],
          },
          runtime: { entry: "@acme/voyant-loyalty/provider", export: "ledgerProvider" },
        },
      ],
      access: {
        resources: [
          {
            id: "@acme/voyant-loyalty#access.loyalty",
            resource: "loyalty",
            actions: ["read", "write"],
          },
        ],
        roles: [
          {
            id: "@acme/voyant-loyalty#role.agent",
            grants: ["loyalty:read"],
          },
        ],
      },
      admin: {
        runtime: {
          entry: "@acme/voyant-loyalty/admin",
          export: "createLoyaltyAdminExtension",
        },
        copy: [
          {
            id: "@acme/voyant-loyalty#copy.admin",
            namespace: "loyalty.admin",
            fallbackLocale: "en",
            runtime: { entry: "@acme/voyant-loyalty/admin/copy" },
          },
        ],
        routes: [
          {
            id: "@acme/voyant-loyalty#admin.route.index",
            path: "/loyalty",
            runtime: { entry: "@acme/voyant-loyalty/admin", export: "LoyaltyPage" },
            requiredScopes: ["loyalty:read"],
            copy: [{ namespace: "loyalty.admin", key: "routes.index.title" }],
          },
        ],
        nav: [
          {
            id: "@acme/voyant-loyalty#admin.nav",
            routeId: "@acme/voyant-loyalty#admin.route.index",
            label: { namespace: "loyalty.admin", key: "nav.loyalty" },
          },
        ],
        slots: [
          {
            id: "@acme/voyant-loyalty#admin.slot.summary",
            routeId: "@acme/voyant-loyalty#admin.route.index",
          },
        ],
        contributions: [
          {
            id: "@acme/voyant-loyalty#admin.contribution.balance",
            slotId: "@acme/voyant-loyalty#admin.slot.summary",
            runtime: { entry: "@acme/voyant-loyalty/admin", export: "BalanceWidget" },
          },
        ],
      },
      tools: [
        {
          id: "@acme/voyant-loyalty#tool.adjust-points",
          name: "adjust_loyalty_points",
          runtime: { entry: "@acme/voyant-loyalty/tools", export: "adjustPoints" },
          requiredScopes: ["loyalty:write"],
          risk: "high",
        },
      ],
      events: [
        {
          id: "@acme/voyant-loyalty#event.points-adjusted",
          eventType: "points.adjusted",
          version: "1.0.0",
          payloadSchema: {
            type: "object",
            properties: {
              accountId: { type: "string" },
              secret: { type: "string", writeOnly: true },
            },
          },
          visibility: "external",
          audit: { sourceModule: "loyalty", category: "domain" },
        },
      ],
      webhooks: [
        {
          id: "@acme/voyant-loyalty#webhook.points-adjusted",
          direction: "outbound",
          eventId: "@acme/voyant-loyalty#event.points-adjusted",
          secretIds: ["@acme/voyant-loyalty#secret.webhook"],
        },
      ],
      actions: [
        {
          id: "@acme/voyant-loyalty#action.adjust-points",
          version: "v1",
          kind: "execute",
          targetType: "loyalty-account",
          requiredScopes: ["loyalty:write"],
          risk: "high",
          ledger: "required",
          from: {
            routes: ["@acme/voyant-loyalty#api.admin"],
            tools: ["@acme/voyant-loyalty#tool.adjust-points"],
            events: ["@acme/voyant-loyalty#event.points-adjusted"],
            webhooks: ["@acme/voyant-loyalty#webhook.points-adjusted"],
          },
          copy: [{ namespace: "loyalty.admin", key: "actions.adjust" }],
        },
      ],
      lifecycle: { uninstall: { default: "retain-data", purge: "not-supported" } },
    })

    expect(validateGraphUnitManifest(module)).toEqual([])
    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [module] }),
      target: "node",
      mode: "self-hosted",
    })
    expect(graph.diagnostics).toEqual([])
    expect(graph.modules[0]).toMatchObject({
      id: "@acme/voyant-loyalty",
      api: [{ id: "@acme/voyant-loyalty#api.admin", methods: ["GET", "POST"] }],
      tools: [{ id: "@acme/voyant-loyalty#tool.adjust-points" }],
      admin: {
        runtime: {
          entry: "@acme/voyant-loyalty/admin",
          export: "createLoyaltyAdminExtension",
        },
        routes: [{ id: "@acme/voyant-loyalty#admin.route.index" }],
      },
      lifecycle: { uninstall: { default: "retain-data" } },
    })
    expect(graph.webhookPlan.outbound).toEqual([
      {
        id: "@acme/voyant-loyalty#webhook.points-adjusted",
        unitId: "@acme/voyant-loyalty",
        packageName: "@acme/voyant-loyalty",
        eventId: "@acme/voyant-loyalty#event.points-adjusted",
        eventUnitId: "@acme/voyant-loyalty",
        eventType: "points.adjusted",
        eventVersion: "1.0.0",
        payloadSchema: {
          type: "object",
          properties: {
            accountId: { type: "string" },
            secret: { type: "string", writeOnly: true },
          },
        },
        visibility: "external",
        audit: { sourceModule: "loyalty", category: "domain" },
        secretIds: ["@acme/voyant-loyalty#secret.webhook"],
      },
    ])
    expect(graph.eventCatalog).toEqual({
      schemaVersion: "voyant.event-catalog.v1",
      events: [
        {
          key: "points.adjusted@1.0.0",
          id: "@acme/voyant-loyalty#event.points-adjusted",
          unitId: "@acme/voyant-loyalty",
          packageName: "@acme/voyant-loyalty",
          eventType: "points.adjusted",
          version: "1.0.0",
          payloadSchema: {
            type: "object",
            properties: {
              accountId: { type: "string" },
              secret: { type: "string", writeOnly: true },
            },
          },
          visibility: "external",
          audit: { sourceModule: "loyalty", category: "domain" },
          redactedFields: ["secret"],
        },
      ],
    })
  })

  it("compiles cross-unit inbound routes and outbound events into a deterministic plan", async () => {
    const routes = defineModule({
      id: "@acme/voyant-hooks",
      localId: "hooks",
      api: [
        {
          id: "@acme/voyant-hooks#api.inbound",
          surface: "webhook",
          mount: "partner-hooks",
          runtime: { entry: "@acme/voyant-hooks", export: "createHooksModule" },
        },
      ],
      events: [
        {
          id: "@acme/voyant-hooks#event.changed",
          eventType: "partner.changed",
          version: "1.0.0",
          payloadSchema: { type: "object", properties: {} },
          visibility: "external",
          audit: { sourceModule: "hooks", category: "domain" },
        },
      ],
    })
    const delivery = definePlugin({
      id: "@acme/voyant-delivery",
      webhooks: [
        {
          id: "@acme/voyant-delivery#webhook.outbound",
          direction: "outbound",
          eventId: "@acme/voyant-hooks#event.changed",
        },
        {
          id: "@acme/voyant-delivery#webhook.inbound",
          direction: "inbound",
          apiId: "@acme/voyant-hooks#api.inbound",
        },
      ],
    })

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [routes], plugins: [delivery] }),
    })

    expect(graph.diagnostics).toEqual([])
    expect(graph.webhookPlan).toEqual({
      inbound: [
        expect.objectContaining({
          id: "@acme/voyant-delivery#webhook.inbound",
          apiId: "@acme/voyant-hooks#api.inbound",
          apiUnitId: "@acme/voyant-hooks",
          mountPath: "/v1/partner-hooks",
        }),
      ],
      outbound: [
        expect.objectContaining({
          id: "@acme/voyant-delivery#webhook.outbound",
          eventId: "@acme/voyant-hooks#event.changed",
          eventUnitId: "@acme/voyant-hooks",
          eventType: "partner.changed",
        }),
      ],
    })
  })

  it("rejects webhook references to the wrong selected graph entity kinds", async () => {
    const module = defineModule({
      id: "@acme/voyant-hooks",
      api: [{ id: "@acme/voyant-hooks#api.admin", surface: "admin" }],
      events: [{ id: "@acme/voyant-hooks#event.untyped" }],
      webhooks: [
        {
          id: "@acme/voyant-hooks#webhook.inbound",
          direction: "inbound",
          apiId: "@acme/voyant-hooks#api.admin",
        },
        {
          id: "@acme/voyant-hooks#webhook.outbound",
          direction: "outbound",
          eventId: "@acme/voyant-hooks#event.untyped",
        },
      ],
    })

    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
          facet: "@acme/voyant-hooks#webhook.inbound.apiId",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "@acme/voyant-hooks#webhook.outbound.eventId",
        }),
      ]),
    )
    expect(graph.webhookPlan).toEqual({ inbound: [], outbound: [] })
  })

  it("rejects external webhook events without an explicit object property allowlist", async () => {
    const module = defineModule({
      id: "@acme/voyant-hooks",
      events: [
        {
          id: "@acme/voyant-hooks#event.open",
          eventType: "partner.open",
          version: "1.0.0",
          payloadSchema: { type: "object" },
          visibility: "external",
          audit: { sourceModule: "hooks", category: "domain" },
        },
      ],
      webhooks: [
        {
          id: "@acme/voyant-hooks#webhook.open",
          direction: "outbound",
          eventId: "@acme/voyant-hooks#event.open",
        },
      ],
    })

    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })

    expect(graph.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "@acme/voyant-hooks#webhook.open.eventId",
      }),
    )
    expect(graph.webhookPlan.outbound).toEqual([])
  })

  it("rejects subscribers whose event contract owner is absent from the selected graph", async () => {
    const subscriber = definePlugin({
      id: "@acme/voyant-listener",
      subscribers: [
        {
          id: "@acme/voyant-listener#subscriber.changed",
          eventType: "partner.changed",
          runtime: { entry: "./runtime", export: "partnerChangedSubscriber" },
        },
      ],
    })

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [], plugins: [subscriber] }),
    })

    expect(graph.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
        facet: "@acme/voyant-listener#subscriber.changed.eventType",
        message: expect.stringContaining('event type "partner.changed"'),
      }),
    )
  })

  it("fails closed for invalid promoted facets and unresolved references", async () => {
    const module = defineModule({
      id: "@acme/voyant-loyalty",
      access: {
        resources: [
          {
            id: "@acme/voyant-loyalty#access.loyalty",
            resource: "loyalty",
            actions: ["read"],
          },
        ],
      },
      tools: [
        {
          id: "@acme/voyant-loyalty#tool.adjust-points",
          name: "adjust_loyalty_points",
          runtime: { entry: "" },
          requiredScopes: ["loyalty:write"],
        },
      ],
      actions: [
        {
          id: "@acme/voyant-loyalty#action.adjust-points",
          version: "v1",
          kind: "execute",
          targetType: "loyalty-account",
          risk: "critical",
          ledger: "optional",
          from: { routes: ["@acme/voyant-loyalty#api.missing"] },
        },
      ],
    })

    expect(validateGraphUnitManifest(module)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_FACET", facet: "tools[0].runtime" }),
        expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_FACET", facet: "actions[0].ledger" }),
      ]),
    )
    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })
    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_UNKNOWN_REFERENCE" }),
        expect.objectContaining({ message: expect.stringContaining("loyalty:write") }),
      ]),
    )
  })

  it("validates created-target action command contracts", () => {
    const action = {
      id: "@acme/voyant-actions#action.create-task",
      version: "v1",
      kind: "execute" as const,
      targetType: "task",
      risk: "medium" as const,
      ledger: "required" as const,
      targetLifecycle: "created" as const,
      createdTarget: {
        commandTargetType: "task-create-command",
        resultReferenceType: "task",
        durability: "handler-command-claim-v1" as const,
      },
    }
    const manifest = (candidate: Record<string, unknown>) => ({
      ...defineModule({ id: "@acme/voyant-actions" }),
      actions: [{ ...action, ...candidate }],
    })

    expect(validateGraphUnitManifest(manifest({}))).toEqual([])
    expect(
      validateGraphUnitManifest(
        manifest({
          createdTarget: {
            ...action.createdTarget,
            parentAnchor: {
              targetType: "customer",
              targetTypeField: "entityType",
              targetIdField: "customerId",
            },
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].createdTarget.parentAnchor",
        message: expect.stringContaining("exactly one"),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          createdTarget: {
            ...action.createdTarget,
            parentAnchor: { targetType: "customer", targetIdField: "" },
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].createdTarget.parentAnchor.targetIdField",
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          createdTarget: undefined,
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].createdTarget",
        message: expect.stringContaining("must declare a createdTarget command contract"),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          targetLifecycle: "existing",
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].createdTarget",
        message: expect.stringContaining('targetLifecycle "created"'),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          targetLifecycle: undefined,
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].createdTarget",
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          createdTarget: {
            commandTargetType: "",
            resultReferenceType: "",
            durability: "best-effort",
          },
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "actions[0].createdTarget.commandTargetType",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "actions[0].createdTarget.resultReferenceType",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "actions[0].createdTarget.durability",
        }),
      ]),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          kind: "read",
          ledger: "optional",
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].targetLifecycle",
        message: expect.stringContaining('kind "execute" with ledger "required"'),
      }),
    )
  })

  it("validates existing-target durable result command contracts", () => {
    const action = {
      id: "@acme/voyant-actions#action.run-task",
      version: "v1",
      kind: "execute" as const,
      targetType: "task",
      commandTargetField: "taskId",
      targetLifecycle: "existing" as const,
      existingTarget: { durability: "handler-command-result-v1" as const },
      risk: "high" as const,
      ledger: "required" as const,
    }
    const manifest = (candidate: Record<string, unknown>) => ({
      ...defineModule({ id: "@acme/voyant-actions" }),
      actions: [{ ...action, ...candidate }],
    })

    expect(validateGraphUnitManifest(manifest({}))).toEqual([])
    expect(
      validateGraphUnitManifest(
        manifest({
          existingTarget: { durability: "best-effort" },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].existingTarget.durability",
        message: expect.stringContaining("handler-command-result-v1"),
      }),
    )
    expect(validateGraphUnitManifest(manifest({ commandTargetField: "" }))).toContainEqual(
      expect.objectContaining({ facet: "actions[0].commandTargetField" }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          targetLifecycle: "created",
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].existingTarget",
        message: expect.stringContaining('targetLifecycle "existing"'),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          kind: "read",
          ledger: "optional",
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].existingTarget",
        message: expect.stringContaining('kind "execute" with ledger "required"'),
      }),
    )
    expect(validateGraphUnitManifest(manifest({ approval: "conditional" }))).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].approval",
        message: expect.stringContaining("do not support conditional approval"),
      }),
    )
  })

  it("validates an action command target field binding", () => {
    const manifest = defineModule({
      id: "@acme/voyant-actions",
      actions: [
        {
          id: "@acme/voyant-actions#action.update-task",
          version: "v1",
          kind: "execute",
          targetType: "task",
          commandTargetField: "",
          risk: "medium",
          ledger: "required",
        },
      ],
    })

    expect(validateGraphUnitManifest(manifest)).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_FACET",
        facet: "actions[0].commandTargetField",
      }),
    )
  })

  it("validates safety-reviewed Tool action availability and durability completeness", () => {
    const baseAction = {
      id: "@acme/voyant-actions#action.run",
      version: "v1",
      kind: "execute" as const,
      targetType: "task",
      risk: "medium" as const,
      ledger: "required" as const,
      from: { tools: ["@acme/voyant-actions#tool.run"] },
    }
    const manifest = (action: Record<string, unknown>) => ({
      ...defineModule({
        id: "@acme/voyant-actions",
        tools: [
          {
            id: "@acme/voyant-actions#tool.run",
            name: "run_action",
            runtime: { entry: "./tools", export: "runAction" },
          },
        ],
      }),
      actions: [{ ...baseAction, ...action }],
    })

    expect(
      validateGraphUnitManifest(
        manifest({
          availability: { status: "available" },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].targetLifecycle",
        message: expect.stringContaining("stable target anchor"),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          availability: { status: "available" },
          targetLifecycle: "existing",
          effectBoundary: "external",
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].durability",
        message: expect.stringContaining("tested durability"),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          effectBoundary: "external",
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          facet: "actions[0].targetLifecycle",
          message: expect.stringContaining("stable target anchor"),
        }),
        expect.objectContaining({
          facet: "actions[0].durability",
          message: expect.stringContaining("tested durability"),
        }),
      ]),
    )
    expect(validateGraphUnitManifest(manifest({}))).toEqual([])
    expect(
      validateGraphUnitManifest(
        manifest({
          kind: "read",
          risk: "low",
          durability: { strategy: "transactional", testReference: "run.test.ts" },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        facet: "actions[0].durability",
        message: expect.stringContaining("classify data-writing actions as execute"),
      }),
    )
    expect(
      validateGraphUnitManifest(
        manifest({
          availability: {
            status: "unavailable",
            reasonCode: "unsafe-nontransactional-effect",
          },
          effectBoundary: "multistage",
        }),
      ),
    ).toEqual([])
    expect(
      validateGraphUnitManifest(
        manifest({
          availability: {
            status: "unavailable",
            reasonCode: "provider-not-durable",
            enableWhen: {
              selectedProviderPorts: {
                mode: "all",
                ports: ["notifications.durable-send"],
              },
            },
          },
          effectBoundary: "external",
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          facet: "actions[0].targetLifecycle",
        }),
        expect.objectContaining({
          facet: "actions[0].durability",
        }),
      ]),
    )
  })

  it("keeps selected provider-conditional actions provisional until runtime preflight", async () => {
    const provider = (id: string, port: string, role: string, value: string) =>
      defineProvider({
        id,
        provides: { ports: [{ id: port }] },
        providers: [
          {
            id: `${id}#provider`,
            port,
            selection: { role, value },
            runtime: { entry: "./provider", export: "createProvider" },
          },
        ],
      })
    const actionModule = (
      mode: "all" | "any",
      ports: readonly string[],
      availability: "conditional" | "legacy" = "conditional",
    ) =>
      defineModule({
        id: "@acme/voyant-actions",
        runtimePorts: ports.map((id) => ({
          id,
          optional: true,
          conformance: { entry: "./durable-port", export: "durablePort" },
        })),
        tools: [
          {
            id: "@acme/voyant-actions#tool.send",
            name: "send",
            runtime: { entry: "./tools", export: "sendTool" },
          },
        ],
        actions: [
          {
            id: "@acme/voyant-actions#action.send",
            version: "v1",
            kind: "execute",
            targetType: "message",
            commandTargetField: "messageId",
            targetLifecycle: "existing",
            ...(availability === "conditional"
              ? {
                  availability: {
                    status: "unavailable" as const,
                    reasonCode: "provider-not-durable",
                    enableWhen: {
                      selectedProviderPorts: { mode, ports },
                    },
                  },
                }
              : {
                  availability: {
                    status: "unavailable" as const,
                    reasonCode: "provider-not-durable",
                  },
                }),
            effectBoundary: "external",
            durability: { strategy: "saga", testReference: "send.test.ts" },
            existingTarget: { durability: "handler-command-result-v1" },
            risk: "high",
            ledger: "required",
            approval: "required",
            from: { tools: ["@acme/voyant-actions#tool.send"] },
          },
        ],
      })
    const email = provider(
      "@acme/voyant-email-provider",
      "notifications.durable-email",
      "email",
      "durable",
    )
    const sms = provider("@acme/voyant-sms-provider", "notifications.durable-sms", "sms", "durable")
    const resolve = (
      mode: "all" | "any",
      ports: readonly string[],
      selections: Record<string, string>,
    ) =>
      resolveDeploymentGraph({
        project: defineProject({
          modules: [actionModule(mode, ports)],
          providers: [email, sms],
        }),
        deployment: {
          target: "node",
          providers: selections,
          requirements: { resources: [] },
        },
      })

    const allSelected = await resolve(
      "all",
      ["notifications.durable-sms", "notifications.durable-email"],
      { email: "durable", sms: "durable" },
    )
    expect(allSelected.diagnostics).toEqual([])
    expect(allSelected.modules[0]?.actions?.[0]?.availability).toEqual({
      status: "unavailable",
      reasonCode: "provider-not-durable",
      enableWhen: {
        selectedProviderPorts: {
          mode: "all",
          ports: ["notifications.durable-email", "notifications.durable-sms"],
        },
      },
    })

    const missingOne = await resolve(
      "all",
      ["notifications.durable-email", "notifications.durable-sms"],
      { email: "durable", sms: "none" },
    )
    expect(missingOne.modules[0]?.actions?.[0]?.availability?.status).toBe("unavailable")

    const anySelected = await resolve(
      "any",
      ["notifications.durable-email", "notifications.durable-sms"],
      { email: "none", sms: "durable" },
    )
    expect(anySelected.modules[0]?.actions?.[0]?.availability?.status).toBe("unavailable")

    const oldManifest = await resolveDeploymentGraph({
      project: defineProject({
        modules: [actionModule("all", ["notifications.durable-email"], "legacy")],
        providers: [email],
      }),
      deployment: {
        target: "node",
        providers: { email: "durable" },
        requirements: { resources: [] },
      },
    })
    expect(oldManifest.modules[0]?.actions?.[0]?.availability?.status).toBe("unavailable")

    const reordered = await resolve(
      "all",
      ["notifications.durable-email", "notifications.durable-sms"],
      { email: "durable", sms: "durable" },
    )
    expect(reordered.contentHash).toBe(allSelected.contentHash)
    expect(missingOne.contentHash).not.toBe(allSelected.contentHash)
    const disabledAll = await resolve(
      "all",
      ["notifications.durable-email", "notifications.durable-sms"],
      { email: "none", sms: "none" },
    )
    const disabledAny = await resolve(
      "any",
      ["notifications.durable-email", "notifications.durable-sms"],
      { email: "none", sms: "none" },
    )
    expect(disabledAny.contentHash).not.toBe(disabledAll.contentHash)
  })

  it("rejects malformed and ambiguous conditional action providers while allowing absent external providers", async () => {
    const baseAction = {
      id: "@acme/voyant-actions#action.send",
      version: "v1",
      kind: "execute" as const,
      targetType: "message",
      commandTargetField: "messageId",
      targetLifecycle: "existing" as const,
      effectBoundary: "external" as const,
      durability: { strategy: "saga" as const, testReference: "send.test.ts" },
      existingTarget: { durability: "handler-command-result-v1" as const },
      risk: "high" as const,
      ledger: "required" as const,
    }
    const malformed = defineModule({
      id: "@acme/voyant-actions",
      actions: [
        {
          ...baseAction,
          availability: {
            status: "unavailable",
            reasonCode: "provider-not-durable",
            enableWhen: {
              selectedProviderPorts: {
                mode: "some",
                ports: ["notifications.durable-send", "notifications.durable-send"],
                callback: "hostCanSend",
              },
            },
          } as never,
        },
      ],
    })
    expect(validateGraphUnitManifest(malformed)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_FACET",
          facet: "actions[0].availability.enableWhen.selectedProviderPorts",
        }),
      ]),
    )

    const actionModule = defineModule({
      id: "@acme/voyant-actions",
      runtimePorts: [
        {
          id: "notifications.durable-send",
          optional: true,
          conformance: { entry: "./durable-port", export: "durablePort" },
        },
      ],
      actions: [
        {
          ...baseAction,
          availability: {
            status: "unavailable",
            reasonCode: "provider-not-durable",
            enableWhen: {
              selectedProviderPorts: {
                mode: "all",
                ports: ["notifications.durable-send"],
              },
            },
          },
        },
      ],
    })
    const unknown = await resolveDeploymentGraph({
      project: defineProject({ modules: [actionModule] }),
    })
    expect(unknown.diagnostics).toEqual([])
    expect(unknown.modules[0]?.actions?.[0]?.availability).toEqual(
      expect.objectContaining({
        status: "unavailable",
        reasonCode: "provider-not-durable",
      }),
    )

    const selectedProvider = (id: string) =>
      defineProvider({
        id,
        provides: { ports: [{ id: "notifications.durable-send" }] },
        providers: [
          {
            id: `${id}#provider`,
            port: "notifications.durable-send",
            selection: { role: "notifications", value: "durable" },
            runtime: { entry: "./provider", export: "createProvider" },
          },
        ],
      })
    const ambiguous = await resolveDeploymentGraph({
      project: defineProject({
        modules: [actionModule],
        providers: [
          selectedProvider("@acme/voyant-notifications-a"),
          selectedProvider("@acme/voyant-notifications-b"),
        ],
      }),
      deployment: {
        target: "node",
        providers: { notifications: "durable" },
        requirements: { resources: [] },
      },
    })
    expect(ambiguous.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
          facet: "actions[0].availability.enableWhen.selectedProviderPorts.ports",
        }),
      ]),
    )
    expect(ambiguous.modules[0]?.actions?.[0]?.availability?.status).toBe("unavailable")
  })

  it("rejects action bindings that reference the wrong selected facet kind", async () => {
    const module = defineModule({
      id: "@acme/voyant-actions",
      tools: [
        {
          id: "@acme/voyant-actions#tool.run",
          name: "run_action",
          runtime: { entry: "./tools", export: "runAction" },
        },
      ],
      actions: [
        {
          id: "@acme/voyant-actions#action.run",
          version: "v1",
          kind: "execute",
          targetType: "task",
          risk: "medium",
          ledger: "required",
          from: { routes: ["@acme/voyant-actions#tool.run"] },
        },
      ],
    })

    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })

    expect(graph.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
        facet: "@acme/voyant-actions#action.run.from.routes",
        message: expect.stringContaining("is not a routes declaration in the selected graph"),
      }),
    )
  })

  it("loads package manifests only after package admission", async () => {
    let loaded = false
    const graph = await resolveDeploymentGraphWithPackageManifests({
      project: defineProject({
        modules: [defineModule({ id: "@acme/voyant-loyalty" })],
      }),
      target: "node",
      mode: "self-hosted",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "workspace" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            manifest: "./voyant",
            compatibleWith: { targets: ["node"], modes: ["self-hosted"] },
          },
        },
      ],
      admission: { allowedSourceKinds: ["workspace"] },
      loadPackageManifests: async () => {
        loaded = true
        return [
          defineModule({
            id: "@acme/voyant-loyalty",
            schema: [{ id: "@acme/voyant-loyalty#schema", source: "./schema" }],
          }),
        ]
      },
    })

    expect(loaded).toBe(true)
    expect(graph.modules[0]?.schema).toEqual([
      { id: "@acme/voyant-loyalty#schema", source: "./schema" },
    ])
    expect(graph.diagnostics).toEqual([])
  })

  it("derives pre-admission provenance from clean project selections", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: ["@acme/voyant-suite/loyalty"],
        plugins: ["./src/plugins/smartbill"],
      }),
    })

    expect(graph.modules.map((unit) => unit.id)).toEqual(["@acme/voyant-suite#loyalty"])
    expect(graph.plugins.map((unit) => unit.id)).toEqual(["local/src.plugins.smartbill"])
    expect(graph.packageRecords).toEqual([
      {
        packageName: "@acme/voyant-suite",
        source: { kind: "unknown", reference: "@acme/voyant-suite" },
      },
      {
        packageName: "local/src.plugins.smartbill",
        source: { kind: "file", reference: "./src/plugins/smartbill" },
      },
    ])
    expect(graph.diagnostics).toEqual([])
  })

  it("replaces a clean package selection with its admitted voyant manifest", async () => {
    const project = defineProject({
      modules: [
        {
          resolve: "@acme/voyant-suite/loyalty",
          config: { tiers: ["silver", "gold"] },
        },
      ],
    })
    const graph = await resolveDeploymentGraphWithPackageManifests({
      project,
      packageRecords: [
        {
          packageName: "@acme/voyant-suite",
          source: { kind: "workspace" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            manifest: "./voyant",
          },
        },
      ],
      admission: { allowedSourceKinds: ["workspace"] },
      loadPackageManifests: async (record) => {
        expect(record.packageName).toBe("@acme/voyant-suite")
        return [
          defineModule({
            id: "@acme/voyant-suite#loyalty",
            packageName: "@acme/voyant-suite",
            schema: [{ id: "@acme/voyant-suite#loyalty.schema", source: "./schema" }],
          }),
        ]
      },
    })

    expect(project.selections?.modules[0]?.config).toEqual({ tiers: ["silver", "gold"] })
    expect(graph.modules[0]?.projectConfig).toEqual({ tiers: ["silver", "gold"] })
    expect(graph.modules[0]?.schema).toEqual([
      { id: "@acme/voyant-suite#loyalty.schema", source: "./schema" },
    ])
    expect(graph.diagnostics).toEqual([])
  })

  it("replaces adapter and provider selections with their admitted voyant manifests", async () => {
    const project = defineProject({
      modules: [],
      adapters: [{ resolve: "@acme/voyant-payments#netopia", config: { environment: "test" } }],
      providers: ["@acme/voyant-search#typesense"],
    })
    const graph = await resolveDeploymentGraphWithPackageManifests({
      project,
      packageRecords: [
        {
          packageName: "@acme/voyant-payments",
          source: { kind: "workspace" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "adapter",
            manifest: "./voyant",
          },
        },
        {
          packageName: "@acme/voyant-search",
          source: { kind: "workspace" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "provider",
            manifest: "./voyant",
          },
        },
      ],
      admission: { allowedSourceKinds: ["workspace"] },
      loadPackageManifests: async (record) =>
        record.packageName === "@acme/voyant-payments"
          ? [
              defineAdapter({
                id: "@acme/voyant-payments#netopia",
                packageName: "@acme/voyant-payments",
                providers: [
                  {
                    id: "@acme/voyant-payments#provider.netopia",
                    port: "payments.processor",
                    selection: { role: "payments", value: "netopia" },
                    runtime: { entry: "./netopia", export: "createNetopiaProcessor" },
                  },
                ],
              }),
            ]
          : [
              defineProvider({
                id: "@acme/voyant-search#typesense",
                packageName: "@acme/voyant-search",
                providers: [
                  {
                    id: "@acme/voyant-search#provider.typesense",
                    port: "storage.object",
                    selection: { role: "storage", value: "typesense" },
                    runtime: { entry: "./typesense", export: "createSearchProvider" },
                  },
                ],
              }),
            ],
    })

    expect(graph.adapters[0]).toMatchObject({
      id: "@acme/voyant-payments#netopia",
      kind: "adapter",
      projectConfig: { environment: "test" },
      providers: [
        expect.objectContaining({
          port: "payments.processor",
          selection: { role: "payments", value: "netopia" },
        }),
      ],
    })
    expect(graph.providers[0]).toMatchObject({
      id: "@acme/voyant-search#typesense",
      kind: "provider",
      providers: [
        expect.objectContaining({
          port: "storage.object",
          selection: { role: "storage", value: "typesense" },
        }),
      ],
    })
    expect(graph.diagnostics).toEqual([])
  })

  it("does not execute package manifests when admission fails", async () => {
    let loaded = false
    const graph = await resolveDeploymentGraphWithPackageManifests({
      project: defineProject({
        modules: [defineModule({ id: "@acme/voyant-loyalty" })],
      }),
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "registry" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            manifest: "./voyant",
          },
        },
      ],
      admission: { allowedSourceKinds: ["workspace"] },
      loadPackageManifests: async () => {
        loaded = true
        return []
      },
    })

    expect(loaded).toBe(false)
    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED" }),
      ]),
    )
  })

  it("prevents an admitted package manifest from replacing another package's unit", async () => {
    const graph = await resolveDeploymentGraphWithPackageManifests({
      project: defineProject({
        modules: [defineModule({ id: "@acme/victim" }), defineModule({ id: "@zzz/attacker" })],
      }),
      packageRecords: [
        { packageName: "@acme/victim", source: { kind: "workspace" } },
        {
          packageName: "@zzz/attacker",
          source: { kind: "workspace" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            manifest: "./voyant",
          },
        },
      ],
      loadPackageManifests: async () => [
        defineModule({
          id: "@acme/victim",
          packageName: "@zzz/attacker",
          schema: [{ id: "@acme/victim#hostile-schema", source: "./hostile-schema" }],
        }),
      ],
    })

    expect(graph.modules.find((unit) => unit.id === "@acme/victim")?.schema).toEqual([])
    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_MANIFEST_OWNERSHIP_MISMATCH" }),
      ]),
    )
  })

  it("rejects runtime references to packages that were not admitted", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/voyant-loyalty",
            api: [
              {
                id: "@acme/voyant-loyalty#api.admin",
                surface: "admin",
                runtime: { entry: "@unknown/runtime", export: "routes" },
              },
            ],
          }),
        ],
      }),
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "workspace" },
        },
      ],
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED" }),
      ]),
    )
  })

  it("rejects unadmitted runtime packages from non-API facets during resolution", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/voyant-loyalty",
            admin: {
              routes: [
                {
                  id: "@acme/voyant-loyalty#admin.members",
                  path: "/members",
                  runtime: { entry: "@unknown/loyalty-react/admin", export: "membersRoute" },
                },
              ],
            },
          }),
        ],
      }),
      packageRecords: [{ packageName: "@acme/voyant-loyalty", source: { kind: "workspace" } }],
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED",
          facet: "admin.routes.runtime.@acme/voyant-loyalty#admin.members.entry",
          source: "@acme/voyant-loyalty",
        }),
      ]),
    )
  })

  it("rejects bare legacy aliases as canonical graph ids", () => {
    expect(
      validateGraphUnitManifest({
        schemaVersion: "voyant.module.v1",
        id: "bookings",
      }).map((entry) => entry.code),
    ).toContain("VOYANT_GRAPH_INVALID_ID")

    expect(
      validateGraphUnitManifest({ schemaVersion: "voyant.module.v1", id: "acme/bookings" }),
    ).toEqual([])
  })

  it("validates API route bundle metadata without requiring the deferred permissions facet", () => {
    expect(
      validateGraphUnitManifest({
        schemaVersion: "voyant.module.v1",
        id: "@acme/voyant-loyalty",
        api: [
          {
            id: "@acme/voyant-loyalty#api.public",
            surface: "public",
            methods: ["POST", "GET"],
            mount: "loyalty",
            openapi: { document: "loyalty" },
            resource: "loyalty.points",
            authorization: "route",
            requiredScopes: ["loyalty:read", "loyalty-points:write"],
            anonymous: ["/status", "health"],
          },
          {
            id: "@acme/voyant-loyalty#api.webhook",
            surface: "webhook",
            mount: "loyalty",
            anonymous: true,
            transactional: true,
          },
        ],
      }),
    ).toEqual([])

    expect(
      validateGraphUnitManifest({
        schemaVersion: "voyant.module.v1",
        id: "@acme/voyant-loyalty",
        api: [
          {
            id: "@acme/voyant-loyalty#api.invalid",
            surface: "worker",
            methods: ["get", "GET", "GET"],
            mount: "",
            openapi: { document: "Loyalty API" },
            resource: "Loyalty Points",
            authorization: "handler",
            requiredScopes: ["loyalty.points.read", "loyalty:Read"],
            anonymous: true,
            transactional: ["/commit", "commit"],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].surface",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].methods",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].mount",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].openapi.document",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].resource",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].authorization",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_SCOPE",
          facet: "api[0].requiredScopes[0]",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_SCOPE",
          facet: "api[0].requiredScopes[1]",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].anonymous",
        }),
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          facet: "api[0].transactional",
        }),
      ]),
    )

    expect(
      validateGraphUnitManifest({
        schemaVersion: "voyant.module.v1",
        id: "@acme/voyant-loyalty",
        api: [
          {
            id: "@acme/voyant-loyalty#api.invalid-paths",
            surface: "public",
            anonymous: ["/"],
            transactional: ["../commit"],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "api[0].anonymous" }),
        expect.objectContaining({ facet: "api[0].transactional" }),
      ]),
    )

    expect(
      validateGraphUnitManifest({
        schemaVersion: "voyant.module.v1",
        id: "@acme/voyant-route-owned",
        api: [
          {
            id: "@acme/voyant-route-owned#api.admin",
            surface: "admin",
            authorization: "route",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
        facet: "api[0].authorization",
      }),
    ])
  })

  it("detects duplicate graph ids and missing required capabilities", async () => {
    const project = defineProject({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
          requires: { capabilities: ["acme.crm.people"] },
        }),
        defineModule({
          id: "@acme/voyant-loyalty",
          provides: { capabilities: ["acme.loyalty.points"] },
        }),
      ],
    })

    const graph = await resolveDeploymentGraph({ project, target: "node", mode: "self-hosted" })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_DUPLICATE_ID" }),
        expect.objectContaining({ code: "VOYANT_GRAPH_MISSING_CAPABILITY" }),
      ]),
    )
  })

  it("selects package-owned product jobs as closed graph metadata", async () => {
    const module = defineModule({
      id: "@acme/voyant-notifications",
      jobs: [
        {
          id: "notifications.deliver-reminders",
          wakeup: true,
          schedule: { every: "5m", overlap: "skip" },
          runtime: { entry: "./jobs", export: "deliverReminders" },
        },
        {
          id: "notifications.sweep-due-reminders",
          schedule: { cron: "0 * * * *", timezone: "UTC" },
          runtime: { entry: "./jobs", export: "sweepDueReminders" },
        },
      ],
    })

    expect(validateGraphUnitManifest(module)).toEqual([])
    const graph = await resolveDeploymentGraph({ project: defineProject({ modules: [module] }) })

    expect(graph.modules[0]?.jobs).toEqual([
      {
        id: "notifications.deliver-reminders",
        wakeup: true,
        schedule: { every: "5m", overlap: "skip" },
        runtime: { entry: "./jobs", export: "deliverReminders" },
      },
      {
        id: "notifications.sweep-due-reminders",
        schedule: { cron: "0 * * * *", timezone: "UTC" },
        runtime: { entry: "./jobs", export: "sweepDueReminders" },
      },
    ])
    expect(graph.provisioning.jobs).toEqual([
      {
        id: "notifications.deliver-reminders",
        unitId: "@acme/voyant-notifications",
        packageName: "@acme/voyant-notifications",
        schedule: { every: "5m", overlap: "skip" },
        wakeup: true,
      },
      {
        id: "notifications.sweep-due-reminders",
        unitId: "@acme/voyant-notifications",
        packageName: "@acme/voyant-notifications",
        schedule: { cron: "0 * * * *", timezone: "UTC" },
        wakeup: false,
      },
    ])
  })

  it("resolves only package-declared product-job scheduling profiles", async () => {
    const module = defineModule({
      id: "@acme/voyant-notifications",
      jobs: [
        {
          id: "notifications.drain",
          wakeup: true,
          schedule: { every: "5m" },
          scheduling: {
            required: true,
            profiles: { eager: { every: "1m" }, economical: { every: "15m" } },
          },
          runtime: { entry: "./jobs", export: "drain" },
        },
        {
          id: "notifications.optional-sweep",
          schedule: { every: "1h" },
          scheduling: { profiles: { economical: { every: "6h" } } },
          runtime: { entry: "./jobs", export: "sweep" },
        },
      ],
    })
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [module],
        jobScheduling: { profile: "economical", jobs: { "notifications.drain": "eager" } },
      }),
    })

    expect(graph.diagnostics).toEqual([])
    expect(graph.modules[0]?.jobs.map(({ id, schedule }) => ({ id, schedule }))).toEqual([
      { id: "notifications.drain", schedule: { every: "1m" } },
      { id: "notifications.optional-sweep", schedule: { every: "6h" } },
    ])
    expect(graph.provisioning.jobs).toEqual([
      expect.objectContaining({
        id: "notifications.drain",
        schedule: { every: "1m" },
        scheduling: expect.objectContaining({ selected: "eager", required: true }),
      }),
      expect.objectContaining({
        id: "notifications.optional-sweep",
        schedule: { every: "6h" },
        scheduling: expect.objectContaining({ selected: "economical", required: false }),
      }),
    ])
  })

  it("rejects unknown profiles, unknown jobs, and disabling required product jobs", async () => {
    const module = defineModule({
      id: "@acme/voyant-notifications",
      jobs: [
        {
          id: "notifications.drain",
          schedule: { every: "5m" },
          scheduling: { required: true, profiles: { eager: { every: "1m" } } },
          runtime: { entry: "./jobs", export: "drain" },
        },
      ],
    })
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [module],
        jobScheduling: {
          jobs: { "notifications.drain": false, "notifications.missing": "eager" },
        },
      }),
    })
    expect(graph.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["VOYANT_GRAPH_REQUIRED_JOB_DISABLED", "VOYANT_GRAPH_UNKNOWN_JOB"]),
    )

    const unsupported = await resolveDeploymentGraph({
      project: defineProject({
        modules: [module],
        jobScheduling: { jobs: { "notifications.drain": "unsafe" } },
      }),
    })
    expect(unsupported.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOYANT_GRAPH_UNSUPPORTED_JOB_SCHEDULE_PROFILE" }),
      ]),
    )
  })

  it("rejects unsafe product-job cadence intervals", () => {
    const module = defineModule({
      id: "@acme/voyant-notifications",
      jobs: [
        {
          id: "notifications.drain",
          schedule: { every: "30s" },
          scheduling: { profiles: { eager: { every: 1_000 } } },
          runtime: { entry: "./jobs", export: "drain" },
        },
      ],
    })
    expect(validateGraphUnitManifest(module)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "VOYANT_GRAPH_INVALID_FACET" })]),
    )
  })

  it("validates complete named profile schedules", () => {
    const module = defineModule({
      id: "@acme/voyant-notifications",
      jobs: [
        {
          id: "notifications.drain",
          schedule: { every: "5m" },
          scheduling: {
            profiles: {
              invalid: { cron: "0 * * * *", timezone: "Not/AZone" },
            },
          },
          runtime: { entry: "./jobs", export: "drain" },
        },
      ],
    })
    expect(validateGraphUnitManifest(module)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ facet: "jobs[0].scheduling.profiles.invalid.timezone" }),
      ]),
    )
  })

  it("hashes deterministic canonical graph content", async () => {
    const project = defineProject({
      modules: [
        defineModule({
          id: "@acme/voyant-crm",
          provides: { capabilities: ["acme.crm.people"] },
          api: [
            {
              id: "@acme/voyant-crm#api.admin",
              surface: "admin",
              openapi: { document: "crm" },
            },
          ],
        }),
        defineModule({
          id: "@acme/voyant-loyalty",
          provides: { capabilities: ["acme.loyalty.points"] },
          requires: { capabilities: ["acme.crm.people"] },
          api: [{ id: "@acme/voyant-loyalty#api.admin", surface: "admin" }],
        }),
      ],
      plugins: [
        definePlugin({
          id: "@acme/voyant-fiscal#smartbill",
          provides: { capabilities: ["acme.fiscal.invoice"] },
        }),
      ],
    })

    const first = await resolveDeploymentGraph({
      project,
      target: "node",
      mode: "self-hosted",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "registry", reference: "npm:@acme/voyant-loyalty@1.0.0" },
        },
      ],
    })
    const second = await resolveDeploymentGraph({
      project,
      mode: "self-hosted",
      target: "node",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { reference: "npm:@acme/voyant-loyalty@1.0.0", kind: "registry" },
        },
      ],
    })

    expect(first.schemaVersion).toBe(VOYANT_RESOLVED_GRAPH_SCHEMA_VERSION)
    expect(first.diagnostics).toEqual([])
    expect(first.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(second.contentHash).toBe(first.contentHash)
    expect(first.modules[0]?.api[0]?.openapi).toEqual({ document: "crm" })
  })

  it("keeps resolved unit ordering independent of declaration order", async () => {
    const crm = defineModule({
      id: "@acme/voyant-crm",
      provides: { capabilities: ["acme.crm.people"] },
    })
    const loyalty = defineModule({
      id: "@acme/voyant-loyalty",
      provides: { capabilities: ["acme.loyalty.points"] },
      requires: { capabilities: ["acme.crm.people"] },
    })
    const fiscal = definePlugin({
      id: "@acme/voyant-fiscal#smartbill",
      provides: { capabilities: ["acme.fiscal.invoice"] },
    })
    const webhook = definePlugin({
      id: "@acme/voyant-webhooks#hubspot",
      provides: { capabilities: ["acme.webhooks.hubspot"] },
    })
    const admin = defineExtension({ id: "@acme/voyant-loyalty#admin-extension" })
    const checkout = defineExtension({ id: "@acme/voyant-loyalty#checkout-extension" })

    const first = await resolveDeploymentGraph({
      project: defineProject({
        modules: [loyalty, crm],
        extensions: [checkout, admin],
        plugins: [webhook, fiscal],
      }),
      target: "node",
      mode: "self-hosted",
    })
    const second = await resolveDeploymentGraph({
      project: defineProject({
        modules: [crm, loyalty],
        extensions: [admin, checkout],
        plugins: [fiscal, webhook],
      }),
      target: "node",
      mode: "self-hosted",
    })

    expect(first.diagnostics).toEqual([])
    expect(first.modules.map((unit) => [unit.id, unit.order])).toEqual([
      ["@acme/voyant-crm", 0],
      ["@acme/voyant-loyalty", 1],
    ])
    expect(first.extensions.map((unit) => [unit.id, unit.order])).toEqual([
      ["@acme/voyant-loyalty#admin-extension", 0],
      ["@acme/voyant-loyalty#checkout-extension", 1],
    ])
    expect(first.plugins.map((unit) => [unit.id, unit.order])).toEqual([
      ["@acme/voyant-fiscal#smartbill", 0],
      ["@acme/voyant-webhooks#hubspot", 1],
    ])
    expect(second).toEqual(first)
  })

  it("normalizes the legacy Voyant Payments deployment selector in output", () => {
    const deployment = defineDeployment({
      project: defineProject({ modules: [] }),
      target: "node",
      providers: { payments: "voyant-payments" },
    })

    expect(deployment.providers.payments).toBe("voyant-pay")
    expect(deployment.requirements.resources).toEqual([
      expect.objectContaining({ provider: "voyant-pay", resourceKey: "payments:voyant-pay" }),
    ])
  })

  it("normalizes deployment resource requirements before hashing", async () => {
    const project = defineProject({
      modules: [],
    })
    const firstDeployment = defineDeployment({
      project,
      target: "node",
      mode: "self-hosted",
      requirements: {
        resources: [
          {
            resourceKey: "database:postgres",
            roles: ["database", "cache"],
            provider: "postgres",
            required: true,
            env: [
              {
                name: "DATABASE_URL_REPLICAS",
                kind: "secret",
                required: false,
                description: "Read replicas.",
              },
              {
                name: "DATABASE_URL",
                aliases: ["DATABASE_URL_DIRECT", "POSTGRES_URL"],
                kind: "secret",
                required: true,
                description: "Primary database.",
              },
            ],
          },
        ],
      },
    })
    const secondDeployment = defineDeployment({
      project,
      target: "node",
      mode: "self-hosted",
      requirements: {
        resources: [
          {
            resourceKey: "database:postgres",
            roles: ["cache", "database"],
            provider: "postgres",
            required: true,
            env: [
              {
                name: "DATABASE_URL",
                aliases: ["POSTGRES_URL", "DATABASE_URL_DIRECT"],
                kind: "secret",
                required: true,
                description: "Primary database.",
              },
              {
                name: "DATABASE_URL_REPLICAS",
                kind: "secret",
                required: false,
                description: "Read replicas.",
              },
            ],
          },
        ],
      },
    })
    const { project: _firstProject, ...firstDeploymentInput } = firstDeployment
    const { project: _secondProject, ...secondDeploymentInput } = secondDeployment

    const first = await resolveDeploymentGraph({
      project,
      deployment: firstDeploymentInput,
    })
    const second = await resolveDeploymentGraph({
      project,
      deployment: secondDeploymentInput,
    })

    expect(first.requirements.resources).toEqual(second.requirements.resources)
    expect(first.requirements.resources[0]?.env[0]).toMatchObject({
      name: "DATABASE_URL",
      aliases: ["DATABASE_URL_DIRECT", "POSTGRES_URL"],
    })
    expect(JSON.stringify(first.requirements)).not.toContain('"notes":null')
    expect(second.contentHash).toBe(first.contentHash)
  })

  it("derives resource requirements from declared deployment providers", () => {
    const deployment = defineDeployment({
      project: defineProject({ modules: [] }),
      target: "node",
      mode: "self-hosted",
      providers: {
        database: "postgres",
        cache: "redis",
        search: "none",
        realtime: "voyant-cloud",
        outboundWebhooks: "postgres",
      },
    })

    expect(deployment.requirements.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceKey: "database:postgres",
          provider: "postgres",
          roles: ["database"],
        }),
        expect.objectContaining({
          resourceKey: "redis",
          provider: "redis",
          roles: ["cache"],
        }),
        expect.objectContaining({
          resourceKey: "search:none",
          provider: "none",
          required: false,
        }),
        expect.objectContaining({
          resourceKey: "realtime:voyant-cloud",
          provider: "voyant-cloud",
          roles: ["realtime"],
        }),
        expect.objectContaining({
          resourceKey: "outboundWebhooks:postgres",
          provider: "postgres",
          roles: ["outboundWebhooks"],
        }),
      ]),
    )
  })

  it("rejects non-node authored deployment targets", () => {
    expect(() =>
      defineDeployment({
        project: defineProject({ modules: [] }),
        target: "voyant-cloud" as never,
        mode: "managed-cloud",
      }),
    ).toThrow('defineDeployment: target must be "node".')
  })

  it("rejects non-node direct resolver targets", async () => {
    await expect(
      resolveDeploymentGraph({
        project: defineProject({ modules: [] }),
        target: "workers" as never,
      }),
    ).rejects.toThrow('resolveDeploymentGraph: target must be "node".')
  })

  it("detects package framework incompatibility from metadata", async () => {
    const project = defineProject({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
        }),
      ],
    })

    const graph = await resolveDeploymentGraph({
      project,
      frameworkVersion: "0.24.1",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "registry", reference: "npm:@acme/voyant-loyalty@1.0.0" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            compatibleWith: { framework: "^0.25.0" },
          },
        },
      ],
    })

    expect(graph.diagnostics).toEqual([
      expect.objectContaining({
        code: "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE",
        source: "@acme/voyant-loyalty",
        facet: "package.compatibleWith.framework",
      }),
    ])

    const compatibleGraph = await resolveDeploymentGraph({
      project,
      frameworkVersion: "0.24.1",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "registry", reference: "npm:@acme/voyant-loyalty@1.0.0" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            compatibleWith: { framework: "^0.24.0" },
          },
        },
      ],
    })

    expect(compatibleGraph.diagnostics).toEqual([])

    const lowerBoundGraph = await resolveDeploymentGraph({
      project,
      frameworkVersion: "0.32.0",
      packageRecords: [
        {
          packageName: "@acme/voyant-loyalty",
          source: { kind: "registry", reference: "npm:@acme/voyant-loyalty@1.0.0" },
          metadata: {
            schemaVersion: "voyant.package.v1",
            kind: "module",
            compatibleWith: { framework: ">=0.26.0" },
          },
        },
      ],
    })

    expect(lowerBoundGraph.diagnostics).toEqual([])
  })

  it("validates admission policy against inferred package records", async () => {
    const project = defineProject({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
        }),
      ],
    })

    const graph = await resolveDeploymentGraph({
      project,
      admission: { allowedSourceKinds: ["workspace"] },
    })

    expect(graph.packageRecords).toEqual([
      expect.objectContaining({
        packageName: "@acme/voyant-loyalty",
        source: { kind: "unknown" },
      }),
    ])
    expect(graph.diagnostics).toEqual([
      expect.objectContaining({
        code: "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED",
        source: "@acme/voyant-loyalty",
      }),
    ])
  })

  it("does not infer first-party package provenance from package scope", async () => {
    const project = defineProject({
      modules: [
        defineModule({
          id: "@voyant-travel/custom-managed-module",
        }),
      ],
      plugins: [
        definePlugin({
          id: "@voyant-travel/plugin-netopia",
        }),
      ],
    })

    const graph = await resolveDeploymentGraph({ project })
    const workspaceOnlyGraph = await resolveDeploymentGraph({
      project,
      admission: { allowedSourceKinds: ["workspace"] },
    })

    expect(graph.packageRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          packageName: "@voyant-travel/custom-managed-module",
          source: { kind: "unknown" },
        }),
        expect.objectContaining({
          packageName: "@voyant-travel/plugin-netopia",
          source: { kind: "unknown" },
        }),
      ]),
    )
    expect(graph.packageRecords).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: { kind: "workspace" },
        }),
      ]),
    )
    expect(workspaceOnlyGraph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED",
          source: "@voyant-travel/plugin-netopia",
        }),
      ]),
    )
  })

  it("normalizes framework specifiers to package-scoped graph ids", () => {
    expect(graphIdFromSpecifier("@voyant-travel/inventory/extras")).toBe(
      "@voyant-travel/inventory#extras",
    )
    expect(graphIdFromSpecifier("operator/mcp")).toBe("@voyant-travel/operator#mcp")
    expect(graphIdFromSpecifier("@voyant-travel/public-document-delivery")).toBe(
      "@voyant-travel/public-document-delivery",
    )
    expect(packageNameFromSpecifier("@voyant-travel/public-document-delivery")).toBe(
      "@voyant-travel/public-document-delivery",
    )
  })

  it("keeps diagnostic codes checked in and sorted", () => {
    expect(Object.keys(VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY)).toEqual([
      "VOYANT_GRAPH_ARTIFACT_MISSING",
      "VOYANT_GRAPH_ARTIFACT_STALE",
      "VOYANT_GRAPH_CONFLICTING_CUSTOM_FIELD_NAMESPACE_OWNER",
      "VOYANT_GRAPH_DUPLICATE_CUSTOM_FIELD_TARGET",
      "VOYANT_GRAPH_DUPLICATE_ENTITY_ID",
      "VOYANT_GRAPH_DUPLICATE_EVENT_TYPE",
      "VOYANT_GRAPH_DUPLICATE_EVENT_VERSION",
      "VOYANT_GRAPH_DUPLICATE_ID",
      "VOYANT_GRAPH_INCOMPATIBLE_EVENT_SCHEMA",
      "VOYANT_GRAPH_INCOMPATIBLE_UPGRADE",
      "VOYANT_GRAPH_INVALID_CAPABILITY_TOKEN",
      "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
      "VOYANT_GRAPH_INVALID_ENTITY_ID",
      "VOYANT_GRAPH_INVALID_FACET",
      "VOYANT_GRAPH_INVALID_ID",
      "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
      "VOYANT_GRAPH_INVALID_REPORTING_FACET",
      "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
      "VOYANT_GRAPH_INVALID_SCHEMA_VERSION",
      "VOYANT_GRAPH_INVALID_SCOPE",
      "VOYANT_GRAPH_MANIFEST_LOAD_FAILED",
      "VOYANT_GRAPH_MANIFEST_OWNERSHIP_MISMATCH",
      "VOYANT_GRAPH_MISSING_CAPABILITY",
      "VOYANT_GRAPH_MISSING_PORT",
      "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE",
      "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED",
      "VOYANT_GRAPH_REQUIRED_JOB_DISABLED",
      "VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED",
      "VOYANT_GRAPH_UNKNOWN_FACET",
      "VOYANT_GRAPH_UNKNOWN_JOB",
      "VOYANT_GRAPH_UNKNOWN_REFERENCE",
      "VOYANT_GRAPH_UNSUPPORTED_FACET",
      "VOYANT_GRAPH_UNSUPPORTED_JOB_SCHEDULE_PROFILE",
    ])
  })

  it("provides a module/plugin author test harness skeleton", async () => {
    const deployment = await createTestDeployment({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
          localId: "loyalty",
          provides: { capabilities: ["acme.loyalty.points"] },
          api: [{ id: "@acme/voyant-loyalty#api.admin", surface: "admin" }],
          migrations: [{ id: "@acme/voyant-loyalty#migration.20260709120000_create_loyalty" }],
        }),
      ],
    })

    expect(() => deployment.doctor.expectClean()).not.toThrow()
    expect(() =>
      deployment.migrations.expectDeclared(
        "@acme/voyant-loyalty#migration.20260709120000_create_loyalty",
      ),
    ).not.toThrow()
    expect(() => deployment.migrations.expectReplayParity()).not.toThrow()
    expect(deployment.routes.list()).toEqual(["/v1/admin/loyalty"])
    expect(() => deployment.routes.expectMounted("/v1/admin/loyalty")).not.toThrow()
  })

  it("closes required typed ports from selected providers", async () => {
    expect(() => definePort({ id: "booking", test: () => {} })).toThrow(/dot-case/)
    expect(() => definePort({ id: "booking.read-model", test: undefined as never })).toThrow(
      /conformance test kit/,
    )

    const bookingReadModel = definePort<{ getBooking: (id: string) => string }>({
      id: "booking.read-model",
      test: (provider) => {
        if (provider.getBooking("booking_1") !== "booking_1") {
          throw new Error("getBooking must return the requested booking.")
        }
      },
    })

    await expect(
      assertPortConforms(bookingReadModel, { getBooking: (id) => id }),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(bookingReadModel, { getBooking: () => "wrong" }),
    ).rejects.toThrow(/requested booking/)

    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/voyant-bookings",
            provides: { ports: [providePort(bookingReadModel)] },
          }),
          defineModule({
            id: "@acme/voyant-loyalty",
            requires: { ports: [requirePort(bookingReadModel)] },
            runtimePorts: [requirePort(bookingReadModel, { optional: true, cardinality: "many" })],
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual([])
    expect(graph.modules[1]?.requires.ports).toEqual([{ id: "booking.read-model" }])
    expect(graph.modules[1]?.runtimePorts).toEqual([
      { id: "booking.read-model", optional: true, cardinality: "many" },
    ])
  })

  it("reports missing required ports while allowing optional ports", async () => {
    const peopleDirectory = definePort({ id: "identity.people-directory", test: () => {} })

    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/voyant-loyalty",
            requires: {
              ports: [
                requirePort(peopleDirectory),
                requirePort(peopleDirectory, { optional: true }),
              ],
            },
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual([
      expect.objectContaining({
        code: "VOYANT_GRAPH_MISSING_PORT",
        source: "@acme/voyant-loyalty",
        facet: "requires.ports",
      }),
    ])
  })

  it("surfaces graph diagnostics through the author test harness", async () => {
    const deployment = await createTestDeployment({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
          requires: { capabilities: ["acme.crm.people"] },
        }),
      ],
    })

    expect(() => deployment.doctor.expectClean()).toThrow(/VOYANT_GRAPH_MISSING_CAPABILITY/)
  })

  it("requires exactly one explicit payment adapter for payment-capable graphs", async () => {
    const financeModule = defineModule({
      id: "@voyant-travel/finance",
      provides: { capabilities: ["finance.payment-sessions"] },
    })
    const netopiaAdapter = definePlugin({
      id: "@acme/payment-netopia",
      providers: [
        {
          id: "@acme/payment-netopia#provider",
          port: "payments.adapter.runtime",
          selection: { role: "payments", value: "netopia" },
          runtime: { entry: "@acme/payment-netopia", export: "createPaymentAdapter" },
        },
      ],
    })

    const missing = await resolveDeploymentGraph({
      project: defineProject({ modules: [financeModule], plugins: [netopiaAdapter] }),
      deployment: {
        target: "node",
        providers: { payments: "none" },
        requirements: { resources: [] },
      },
    })
    expect(missing.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
          facet: "deployment.providers.payments",
        }),
      ]),
    )

    const selected = await resolveDeploymentGraph({
      project: defineProject({ modules: [financeModule], plugins: [netopiaAdapter] }),
      deployment: {
        target: "node",
        providers: { payments: "netopia" },
        requirements: { resources: [] },
      },
    })
    expect(selected.diagnostics).toEqual([])

    const duplicate = await resolveDeploymentGraph({
      project: defineProject({
        modules: [financeModule],
        plugins: [
          netopiaAdapter,
          definePlugin({
            id: "@acme/payment-netopia-secondary",
            providers: [
              {
                id: "@acme/payment-netopia-secondary#provider",
                port: "payments.adapter.runtime",
                selection: { role: "payments", value: "netopia" },
                runtime: {
                  entry: "@acme/payment-netopia-secondary",
                  export: "createPaymentAdapter",
                },
              },
            ],
          }),
        ],
      }),
      deployment: {
        target: "node",
        providers: { payments: "netopia" },
        requirements: { resources: [] },
      },
    })
    expect(duplicate.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
          facet: "providers.selection",
        }),
      ]),
    )

    const custom = await resolveDeploymentGraph({
      project: defineProject({ modules: [financeModule] }),
      deployment: {
        target: "node",
        providers: { payments: "custom" },
        requirements: { resources: [] },
      },
    })
    expect(custom.diagnostics).toEqual([])
  })

  it("compiles a deterministic catalog and rejects duplicate access authorities", async () => {
    const access = (id: string) =>
      defineModule({
        id,
        access: {
          resources: [
            {
              id: `${id}#access.bookings`,
              resource: "bookings",
              label: "Bookings",
              actions: [{ action: "read", label: "Read bookings" }],
            },
          ],
        },
      })
    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [access("@acme/one"), access("@acme/two")] }),
    })

    expect(graph.accessCatalog.resources.map(({ resource }) => resource)).toEqual([
      "bookings",
      "bookings",
    ])
    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_DUPLICATE_ID",
          message: expect.stringContaining("duplicate authorities"),
        }),
      ]),
    )
  })

  it("rejects unknown scope references even when no access resources are selected", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/empty-access",
            api: [
              {
                id: "@acme/empty-access#api.admin",
                surface: "admin",
                requiredScopes: ["bookings:read"],
              },
            ],
          }),
        ],
      }),
    })

    expect(graph.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
          facet: "@acme/empty-access#api.admin.requiredScopes",
        }),
      ]),
    )
  })

  it("carries explicit action wildcard policy from package access declarations", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          defineModule({
            id: "@acme/notifications",
            access: {
              resources: [
                {
                  id: "@acme/notifications#access.notifications",
                  resource: "notifications",
                  actions: [{ action: "send", sensitive: true, wildcard: "explicit" }],
                },
              ],
            },
          }),
        ],
      }),
    })

    expect(graph.accessCatalog.resources[0]?.actions[0]?.wildcard).toBe("explicit")
    expect(graph.accessCatalog.resources[0]?.actions[0]?.sensitive).toBe(true)
  })
})
