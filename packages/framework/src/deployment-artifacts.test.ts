// agent-quality: file-size exception -- reason: generated deployment artifact fixtures and deterministic source assertions stay in one focused suite.
import { describe, expect, it } from "vitest"
import {
  buildDeploymentArtifactManifest,
  buildDeploymentGraphJson,
  buildDeploymentMigrationSources,
  buildGraphAdminBundleDeclarationModule,
  buildGraphAdminBundleModule,
  buildGraphPresentationBundleDeclarationModule,
  buildGraphPresentationBundleModule,
  buildGraphRuntimeModule,
  buildNodeRuntimeEntry,
  buildNodeRuntimeEntryArtifact,
  buildProjectRuntimeModule,
  createResolvedGraphRuntime,
  VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION,
  VOYANT_NODE_RUNTIME_ENTRY_ID,
} from "./deployment-artifacts.js"
import {
  defineExtension,
  defineModule,
  definePlugin,
  defineProject,
  defineProvider,
  resolveDeploymentGraph,
  type VoyantGraphUnitManifest,
} from "./deployment-graph.js"

async function sampleGraph() {
  return resolveDeploymentGraph({
    project: defineProject({
      modules: [
        defineModule({
          id: "@acme/voyant-loyalty",
          provides: { capabilities: ["acme.loyalty.points"] },
          api: [
            {
              id: "@acme/voyant-loyalty#api.admin",
              surface: "admin",
              runtime: {
                entry: "@acme/voyant-loyalty/runtime-body-that-must-stay-lazy",
                export: "createLoyaltyModule",
              },
            },
          ],
        }),
      ],
    }),
    target: "node",
    mode: "self-hosted",
    packageRecords: [
      {
        packageName: "@acme/voyant-loyalty",
        version: "1.0.0",
        source: {
          kind: "registry",
          reference: "pnpm-lock:@acme/voyant-loyalty@1.0.0",
          integrity: "sha512-test",
        },
      },
    ],
  })
}

async function graphWithSelectedUnits(
  modules: readonly VoyantGraphUnitManifest[],
  plugins: readonly VoyantGraphUnitManifest[] = [],
  extensions: readonly VoyantGraphUnitManifest[] = [],
  providers: readonly VoyantGraphUnitManifest[] = [],
) {
  const units = [...modules, ...extensions, ...plugins, ...providers]
  return resolveDeploymentGraph({
    project: defineProject({ modules, extensions, plugins, providers }),
    target: "node",
    mode: "self-hosted",
    packageRecords: [
      ...new Set(units.map((unit) => unit.packageName ?? unit.id.split("#")[0])),
    ].map((packageName) => ({
      packageName: packageName ?? "",
      source: { kind: "workspace" as const },
    })),
  })
}

describe("deployment graph artifacts", () => {
  it("loads in-memory relative entries from the generated runtime directory", async () => {
    const graph = await sampleGraph()
    const runtime = createResolvedGraphRuntime({
      graph,
      runtimeEntryOverrides: {
        "@acme/voyant-loyalty/runtime-body-that-must-stay-lazy": "./runtime-lowering.js",
      },
      runtimeImportBaseUrl: new URL("./", import.meta.url).href,
    })

    await expect(runtime.modules[0]?.routes[0]?.load()).rejects.toMatchObject({
      code: "VOYANT_GRAPH_RUNTIME_EXPORT_MISSING",
    })
  })

  it("builds deterministic resolved graph JSON containing the graph hash", async () => {
    const graph = await sampleGraph()
    const first = buildDeploymentGraphJson(graph)
    const second = buildDeploymentGraphJson(graph)

    expect(first).toBe(second)
    expect(first.endsWith("\n")).toBe(true)
    expect(JSON.parse(first)).toMatchObject({
      schemaVersion: "voyant.resolved-graph.v1",
      contentHash: graph.contentHash,
      eventCatalog: { schemaVersion: "voyant.event-catalog.v1", events: [] },
      webhookPlan: { inbound: [], outbound: [] },
    })
  })

  it("lowers the selected webhook plan into generated runtime source", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/hooks",
        events: [
          {
            id: "@acme/hooks#event.changed",
            eventType: "hooks.changed",
            version: "1.0.0",
            payloadSchema: { type: "object", properties: {} },
            visibility: "external",
            audit: { sourceModule: "hooks", category: "domain" },
          },
        ],
        webhooks: [
          {
            id: "@acme/hooks#webhook.changed",
            direction: "outbound",
            eventId: "@acme/hooks#event.changed",
          },
        ],
      }),
    ])

    const source = buildGraphRuntimeModule({ graph })

    expect(source).toContain("GENERATED_GRAPH_RUNTIME_WEBHOOK_PLAN")
    expect(source).toContain("GENERATED_GRAPH_RUNTIME_EVENT_CATALOG")
    expect(source).toContain('"key": "hooks.changed@1.0.0"')
    expect(source).toContain('"eventType": "hooks.changed"')
    expect(source).toContain("eventCatalog: GENERATED_GRAPH_RUNTIME_EVENT_CATALOG")
    expect(source).toContain("webhookPlan: GENERATED_GRAPH_RUNTIME_WEBHOOK_PLAN")
  })

  it("statically lowers selected package runtime contributors", async () => {
    const resolved = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/voyant-loyalty",
        runtimePorts: [{ id: "loyalty.provider", optional: true, cardinality: "many" }],
        customFieldTargets: [
          {
            id: "person",
            namespace: "loyalty",
            label: "Person",
            fieldTypes: ["text"],
            capabilities: ["read"],
          },
        ],
      }),
    ])
    const graph = {
      ...resolved,
      packageRecords: resolved.packageRecords.map((record) => ({
        ...record,
        metadata: {
          schemaVersion: "voyant.package.v1" as const,
          kind: "module" as const,
          runtime: {
            entry: "./runtime-contributor",
            export: "createLoyaltyRuntimePortContribution",
          },
        },
      })),
    }

    const source = buildGraphRuntimeModule({ graph })

    expect(source).toContain(
      'import { createLoyaltyRuntimePortContribution as GENERATED_RUNTIME_CONTRIBUTOR_0 } from "@acme/voyant-loyalty/runtime-contributor"',
    )
    expect(source).toContain("export function createGeneratedGraphRuntimePorts(")
    expect(source).not.toContain("createRuntimePorts:")
    expect(source).toContain("GENERATED_RUNTIME_CONTRIBUTOR_0,")
    expect(source).not.toContain("Parameters<typeof GENERATED_RUNTIME_CONTRIBUTOR_0>")
    expect(source).not.toContain("asRuntimeContributor")
    expect(source).toContain('"@acme/voyant-loyalty/runtime-contributor"')
    expect(source).toContain(
      "const ports: Record<string, unknown> = { ...(initialRuntimePorts ?? {}) }",
    )
    expect(source).toContain("hasRuntimePort(port: { id: string }): boolean")
    expect(source).toContain("getRuntimePort(port: { id: string })")
    expect(source).toContain("customFieldTargets: GENERATED_GRAPH_RUNTIME_CUSTOM_FIELD_TARGETS")
    expect(source).toContain("GENERATED_GRAPH_RUNTIME_CUSTOM_FIELD_TARGETS")
    expect(source).toContain('"id": "person"')
    expect(source).toContain('"ownerUnitId": "@acme/voyant-loyalty"')
    expect(source).toContain("contributor(contributorHost)")
    expect(source).toContain("has multiple static contributors")
    expect(source).toContain(
      'GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS = [\n  "loyalty.provider",\n] as const',
    )
    expect(source).toContain("manyPortIds.has(id) ? [value] : value")
    expect(source).toContain("values.push(value)")
  })

  it("keeps conditional Tool import specifiers out of exported provisional metadata", async () => {
    const portId = "notifications.durable-send"
    const toolId = "@acme/notifications#tool.send"
    const graph = await graphWithSelectedUnits(
      [
        defineModule({
          id: "@acme/notifications",
          runtimePorts: [
            {
              id: portId,
              optional: true,
              conformance: { entry: "./durable-port", export: "durablePort" },
            },
          ],
          tools: [
            {
              id: toolId,
              name: "send_notification",
              runtime: { entry: "./tools", export: "sendNotificationTool" },
            },
          ],
          actions: [
            {
              id: "@acme/notifications#action.send",
              version: "v1",
              kind: "execute",
              targetType: "notification",
              commandTargetField: "notificationId",
              targetLifecycle: "existing",
              availability: {
                status: "unavailable",
                reasonCode: "provider-not-durable",
                enableWhen: {
                  selectedProviderPorts: { mode: "all", ports: [portId] },
                },
              },
              effectBoundary: "external",
              durability: { strategy: "saga", testReference: "durable-send.test.ts" },
              existingTarget: { durability: "handler-command-result-v1" },
              risk: "high",
              ledger: "required",
              approval: "required",
              from: { tools: [toolId] },
            },
          ],
        }),
      ],
      [],
      [],
      [
        defineProvider({
          id: "@acme/notifications-provider",
          provides: { ports: [{ id: portId }] },
          providers: [
            {
              id: "@acme/notifications-provider#provider",
              port: portId,
              selection: { role: "notifications", value: "durable" },
              runtime: { entry: "./provider", export: "createProvider" },
            },
          ],
        }),
      ],
    )
    const selectedGraph = {
      ...graph,
      deployment: {
        ...graph.deployment,
        providers: { notifications: "durable" },
      },
    }
    const source = buildGraphRuntimeModule({ graph: selectedGraph })
    const publicEntries = source.match(
      /export const GENERATED_GRAPH_RUNTIME_ENTRY_SPECIFIERS = ([^\n]+)/,
    )?.[1]

    expect(publicEntries).toBeDefined()
    expect(publicEntries).not.toContain("@acme/notifications/tools")
    expect(source).toContain('import("@acme/notifications/tools")')
    expect(source).toContain('"provisionalTools"')
  })

  it("selects a canonical package contributor when compatibility provenance is stale", async () => {
    const resolved = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/auth#invitations",
        packageName: "operator",
      }),
    ])
    const graph = {
      ...resolved,
      packageRecords: [
        ...resolved.packageRecords,
        {
          packageName: "@acme/auth",
          source: { kind: "workspace" as const },
          metadata: {
            schemaVersion: "voyant.package.v1" as const,
            kind: "module" as const,
            runtime: {
              entry: "./runtime-contributor",
              export: "createAuthRuntimePortContribution",
            },
          },
        },
      ],
    }

    const source = buildGraphRuntimeModule({ graph })

    expect(source).toContain(
      'import { createAuthRuntimePortContribution as GENERATED_RUNTIME_CONTRIBUTOR_0 } from "@acme/auth/runtime-contributor"',
    )
  })

  it("lowers only opted-in package admin factories into one selected bundle", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/voyant-loyalty",
        admin: {
          runtime: { entry: "./admin", export: "createLoyaltyAdminExtension" },
          routes: [
            {
              id: "@acme/voyant-loyalty#admin.route.index",
              path: "/loyalty",
              runtime: { entry: "./admin", export: "createLoyaltyAdminExtension" },
            },
          ],
        },
      }),
      defineModule({
        id: "@acme/reports",
        admin: {
          routes: [
            {
              id: "@acme/reports#admin.route.index",
              path: "/reports",
              runtime: { entry: "./admin", export: "createReportsAdminExtension" },
            },
          ],
        },
      }),
    ])

    const source = buildGraphAdminBundleModule({ graph })

    expect(source).toContain(
      'import { createLoyaltyAdminExtension as selectedAdminFactory0 } from "@acme/voyant-loyalty/admin"',
    )
    expect(source).toContain('"@acme/voyant-loyalty": selectedAdminFactory0')
    expect(source).not.toContain("createReportsAdminExtension")
    expect(source).toContain("Page bodies stay lazy in package UI exports")
    expect(source).not.toContain("SelectedAdminExtensionFactory")
    expect(source).not.toContain(" as const")
    expect(source).toContain("export function createSelectedGraphAdminExtensions(")
    expect(source).toContain("selectedGraphAdminExtensionLoadPlan.map")

    const declaration = buildGraphAdminBundleDeclarationModule({ graph })
    expect(declaration).toContain("SelectedAdminExtensionFactoryContext")
    expect(declaration).toContain("ReadonlyArray<AdminExtension>")
    expect(declaration).not.toContain("selectedAdminFactory0")
  })

  it("keeps opted-in route-only admin implementations behind dynamic imports", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/lazy-settings",
        localId: "lazy-settings",
        admin: {
          loading: "lazy-routes",
          runtime: { entry: "./admin", export: "createLazySettingsExtension" },
          routes: [
            {
              id: "@acme/lazy-settings#admin.route.settings",
              path: "/settings/lazy-settings",
              runtime: { entry: "./admin", export: "createLazySettingsExtension" },
            },
          ],
        },
      }),
    ])

    const source = buildGraphAdminBundleModule({ graph })

    expect(source).not.toContain("import { createLazySettingsExtension")
    expect(source).toContain('load: () => import("@acme/lazy-settings/admin")')
    expect(source).toContain('moduleId: "lazy-settings"')
    expect(source).toContain('"path": "/settings/lazy-settings"')
    expect(source).toContain("createLazySelectedAdminExtension")
  })

  it("rejects lazy route declarations that still own shell-critical nav", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/unsafe-lazy",
        admin: {
          loading: "lazy-routes",
          runtime: { entry: "./admin", export: "createUnsafeExtension" },
          routes: [
            {
              id: "@acme/unsafe-lazy#admin.route.index",
              path: "/unsafe",
              runtime: { entry: "./admin", export: "createUnsafeExtension" },
            },
          ],
          nav: [
            {
              id: "@acme/unsafe-lazy#admin.nav.index",
              routeId: "@acme/unsafe-lazy#admin.route.index",
              label: { namespace: "unsafe", key: "title" },
            },
          ],
        },
      }),
    ])

    expect(() => buildGraphAdminBundleModule({ graph })).toThrow("lazy-routes cannot carry nav")
  })

  it("statically lowers an explicit shell while keeping its routes dynamic", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/catalog",
        localId: "catalog",
        admin: {
          loading: "lazy-routes",
          runtime: { entry: "./admin", export: "createCatalogAdminExtension" },
          shellRuntime: { entry: "./admin-shell", export: "createCatalogAdminShell" },
          routes: [
            {
              id: "@acme/catalog#admin.route.index",
              path: "/catalog",
              runtime: { entry: "./admin", export: "createCatalogAdminExtension" },
            },
          ],
          nav: [
            {
              id: "@acme/catalog#admin.nav.index",
              routeId: "@acme/catalog#admin.route.index",
              label: { namespace: "catalog", key: "title" },
            },
          ],
        },
      }),
    ])

    const source = buildGraphAdminBundleModule({ graph })

    expect(source).toContain(
      'import { createCatalogAdminShell as selectedAdminShellFactory0 } from "@acme/catalog/admin-shell"',
    )
    expect(source).toContain("shell: selectedAdminShellFactory0")
    expect(source).toContain('load: () => import("@acme/catalog/admin")')
    expect(source).not.toContain("import { createCatalogAdminExtension")
  })

  it("lowers only selected presentation factories in deterministic id order", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/storefront",
        presentations: [
          {
            id: "@acme/storefront#presentation.customer",
            runtime: { entry: "./presentation", export: "createCustomerPresentation" },
          },
        ],
      }),
      defineModule({
        id: "@acme/admin-only",
        admin: { runtime: { entry: "./admin", export: "createAdminExtension" } },
      }),
    ])

    const source = buildGraphPresentationBundleModule({ graph })
    expect(source).toContain(
      'import { createCustomerPresentation as selectedPresentationFactory0 } from "@acme/storefront/presentation"',
    )
    expect(source).toContain(
      '"@acme/storefront#presentation.customer": selectedPresentationFactory0',
    )
    expect(source).not.toContain("createAdminExtension")
    expect(source).toContain("GENERATED_SELECTED_GRAPH_PRESENTATION_IDS")

    const declaration = buildGraphPresentationBundleDeclarationModule({ graph })
    expect(declaration).toContain("SelectedGraphPresentationFactory")
    expect(declaration).toContain("selectedGraphPresentationFactories")
    expect(declaration).not.toContain("createCustomerPresentation")
  })

  it("builds a deployment artifact manifest with relative runtime entries", async () => {
    const graph = await sampleGraph()
    const entry = buildNodeRuntimeEntryArtifact({
      graph,
      file: "src/runtime-entry.generated.ts",
    })

    expect(
      buildDeploymentArtifactManifest({
        graph,
        graphArtifactPath: "deployment-graph.generated.json",
        runtimeEntries: [entry],
        migrationSources: [
          {
            packageName: "@acme/voyant-loyalty",
            schema: "../../node_modules/@acme/voyant-loyalty/dist/schema.js",
          },
        ],
      }),
    ).toEqual({
      schemaVersion: VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION,
      graphHash: graph.contentHash,
      graph: "deployment-graph.generated.json",
      accessCatalog: graph.accessCatalog,
      eventCatalog: graph.eventCatalog,
      reportingCatalog: graph.reportingCatalog,
      webhookPlan: { inbound: [], outbound: [] },
      runtimeEntries: [
        {
          id: VOYANT_NODE_RUNTIME_ENTRY_ID,
          target: "node",
          file: "src/runtime-entry.generated.ts",
          graphHash: graph.contentHash,
          kind: "node",
        },
      ],
      migrationSources: [
        {
          packageName: "@acme/voyant-loyalty",
          schema: "../../node_modules/@acme/voyant-loyalty/dist/schema.js",
        },
      ],
    })
  })

  it("lowers migration schema inputs only from selected migration owners", async () => {
    const foundation = defineModule({
      id: "@acme/foundation",
      schema: [{ id: "@acme/foundation#schema", source: "@acme/foundation/schema" }],
      migrations: [{ id: "@acme/foundation#migrations", source: "./migrations" }],
    })
    const feature = defineModule({
      id: "@acme/feature",
      schema: [{ id: "@acme/feature#schema", source: "@acme/feature/schema" }],
      migrations: [{ id: "@acme/feature#migrations", source: "./migrations" }],
    })
    const featureExtension = defineExtension({
      id: "@acme/feature#extension",
      packageName: "@acme/feature",
      schema: [{ id: "@acme/feature#schema.extension", source: "@acme/feature/schema" }],
    })
    const schemaOnly = defineModule({
      id: "@acme/schema-only",
      schema: [{ id: "@acme/schema-only#schema", source: "@acme/schema-only/schema" }],
    })

    const complete = await graphWithSelectedUnits(
      [foundation, feature, schemaOnly],
      [],
      [featureExtension],
    )
    const subset = await graphWithSelectedUnits([foundation])

    expect(buildDeploymentMigrationSources(complete)).toEqual([
      { packageName: "@acme/feature", schema: "@acme/feature/schema" },
      { packageName: "@acme/foundation", schema: "@acme/foundation/schema" },
    ])
    expect(buildDeploymentMigrationSources(subset)).toEqual([
      { packageName: "@acme/foundation", schema: "@acme/foundation/schema" },
    ])
  })

  it("builds a tiny managed Node runtime entry tied to the graph hash", async () => {
    const graph = await sampleGraph()
    const source = buildNodeRuntimeEntry({
      graph,
      graphArtifactPath: "../deployment-graph.generated.json",
      command: "pnpm --filter operator prepare:verify",
    })

    expect(source).toContain(`GENERATED_DEPLOYMENT_GRAPH_HASH = "${graph.contentHash}"`)
    expect(source).toContain('import { readFileSync } from "node:fs"')
    expect(source).toContain('from "node:url"')
    expect(source).toContain("assertGeneratedDeploymentGraphArtifact()")
    expect(source).toContain("resolveGeneratedDeploymentRequirements")
    expect(source).toContain("resolveGeneratedRuntimeDeployment")
    expect(source).toContain('await import("@voyant-travel/framework/node-runtime")')
    expect(
      source.indexOf("if (isMainModule) {\n  assertGeneratedDeploymentGraphArtifact()"),
    ).toBeLessThan(source.indexOf('await import("@voyant-travel/framework/node-runtime")'))
    expect(source).toContain("startVoyantNodeRuntime")
    expect(source).not.toContain("profileSnapshotPath:")
    expect(source).toContain("const deployment = resolveGeneratedRuntimeDeployment()")
    // The runtime takes an explicit Redis binding and infers nothing from mode,
    // so the generated deployment has to state one.
    expect(source).toContain('{ isolation: "shared", network: "untrusted" }')
    expect(source).toContain('{ isolation: "dedicated", network: "trusted" }')
    expect(source).toContain("deployment,")
    expect(source).toContain("deploymentRequirements: resolveGeneratedDeploymentRequirements()")
    expect(source).toContain('from "./graph-runtime.generated.js"')
    expect(source).toContain("graphRuntime: createGeneratedGraphRuntime()")
    expect(source).toContain("createGeneratedGraphRuntimePorts")
    expect(source).toContain("createVoyantNodeEnv")
    expect(source).toContain("resolveVoyantNodeProviderPlan(deployment.providers)")
    expect(source).toContain("createVoyantNodeRuntimeHostPrimitives")
    expect(source).toContain('"deployment.providers.adminAuth": deployment.providers.adminAuth')
    expect(source).toContain(
      '"deployment.providers.customerAuth": deployment.providers.customerAuth',
    )
    expect(source).toContain("const runtimePorts = createGeneratedGraphRuntimePorts({")
    expect(source).toContain("env,")
    expect(source).toContain("runtimePorts,")
    expect(source.indexOf("const runtimePorts = createGeneratedGraphRuntimePorts({")).toBeLessThan(
      source.indexOf("const handle = await startVoyantNodeRuntime({"),
    )
    expect(source).toContain("GENERATED_PRODUCT_JOBS")
    expect(source).toContain("jobs: GENERATED_PRODUCT_JOBS")
    expect(source).not.toContain("apps/")
  })

  it("lowers selected graph runtime references into deterministic lazy source", async () => {
    const graph = await sampleGraph()
    const first = buildGraphRuntimeModule({ graph, command: "voyant graph runtime emit" })
    const second = buildGraphRuntimeModule({ graph, command: "voyant graph runtime emit" })

    expect(first).toBe(second)
    expect(first).toContain(`GENERATED_GRAPH_RUNTIME_HASH = "${graph.contentHash}"`)
    expect(first).toContain(
      '"@acme/voyant-loyalty/runtime-body-that-must-stay-lazy": () => import("@acme/voyant-loyalty/runtime-body-that-must-stay-lazy")',
    )
    expect(first).toContain('"@acme/voyant-loyalty#api.admin"')
    expect(first).toContain('"createLoyaltyModule"')
    expect(first).toContain("createGeneratedGraphRuntime")
    expect(first).toContain("providerSelections: Readonly<Record<string, string>>")
    expect(first).toContain("providerSelections,")
    expect(first).not.toContain("FRAMEWORK_RUNTIME_MANIFEST")
  })

  it("lowers package-owned jobs into the generated runtime inventory", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/voyant-notifications",
        jobs: [
          {
            id: "notifications.deliver",
            wakeup: true,
            schedule: { every: "5m", overlap: "skip" },
            runtime: { entry: "./jobs", export: "deliverNotifications" },
          },
        ],
      }),
    ])

    const source = buildGraphRuntimeModule({ graph })

    expect(source).toContain('"facet": "jobs.runtime"')
    expect(source).toContain('"jobs": [')
    expect(source).toContain('"notifications.deliver"')
    expect(source).toContain('"deliverNotifications"')
    expect(source).toContain('"wakeup": true')
  })

  it("preserves and lowers unit runtimes for modules, extensions, and plugins", async () => {
    const module = defineModule({
      id: "@acme/catalog",
      runtime: { entry: "./runtime", export: "createCatalogModule" },
    })
    const extension = defineExtension({
      id: "@acme/catalog#admin",
      runtime: { entry: "./admin-runtime", export: "createCatalogAdmin" },
    })
    const plugin = definePlugin({
      id: "@acme/catalog#audit",
      runtime: { entry: "./audit-runtime", export: "createCatalogAudit" },
    })
    const graph = await graphWithSelectedUnits([module], [plugin], [extension])
    const withoutRuntime = await graphWithSelectedUnits([defineModule({ id: "@acme/catalog" })])

    expect(graph.contentHash).not.toBe(withoutRuntime.contentHash)
    expect(graph.modules[0]?.runtime).toEqual(module.runtime)
    expect(graph.extensions[0]?.runtime).toEqual(extension.runtime)
    expect(graph.plugins[0]?.runtime).toEqual(plugin.runtime)
    expect(JSON.parse(buildDeploymentGraphJson(graph))).toMatchObject({
      modules: [{ runtime: module.runtime }],
      extensions: [{ runtime: extension.runtime }],
      plugins: [{ runtime: plugin.runtime }],
    })

    const source = buildGraphRuntimeModule({ graph })
    expect(source.match(/"facet": "runtime"/g)).toHaveLength(3)
    expect(source).toContain('import("@acme/catalog/runtime")')
    expect(source).toContain('import("@acme/catalog/admin-runtime")')
    expect(source).toContain('import("@acme/catalog/audit-runtime")')
    expect(source).toContain('"runtimeReferenceId": "%40acme%2Fcatalog/runtime/%40acme%2Fcatalog"')
    expect(source).toContain('"kind": "extension"')
    expect(source).toContain('"kind": "plugin"')
  })

  it("lowers every package-owned executable facet through deduplicated lazy imports", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/voyant-loyalty",
        api: [
          {
            id: "loyalty.api",
            surface: "webhook",
            runtime: { entry: "./runtime", export: "createRoutes" },
          },
        ],
        config: [
          {
            id: "loyalty.config",
            key: "loyalty",
            validator: { entry: "./runtime", export: "configSchema" },
          },
        ],
        secrets: [
          {
            id: "loyalty.secret",
            key: "LOYALTY_TOKEN",
            validator: { entry: "./runtime", export: "secretSchema" },
          },
        ],
        resources: [
          {
            id: "loyalty.resource",
            kind: "http-service",
            required: true,
            config: { service: "loyalty" },
          },
        ],
        providers: [
          {
            id: "loyalty.provider",
            port: "loyalty.ledger",
            runtime: { entry: "./runtime", export: "createLedgerProvider" },
          },
        ],
        access: {
          resources: [
            {
              id: "loyalty.access",
              resource: "loyalty",
              actions: ["read", "write"],
            },
          ],
        },
        admin: {
          copy: [
            {
              id: "loyalty.copy",
              namespace: "loyalty",
              fallbackLocale: "en",
              runtime: { entry: "./admin", export: "copy" },
            },
          ],
          routes: [
            {
              id: "loyalty.admin.route",
              path: "/loyalty",
              runtime: { entry: "./admin", export: "LoyaltyPage" },
            },
          ],
          slots: [{ id: "loyalty.slot", routeId: "loyalty.admin.route" }],
          contributions: [
            {
              id: "loyalty.balance",
              slotId: "loyalty.slot",
              runtime: { entry: "./admin", export: "BalanceWidget" },
            },
          ],
        },
        tools: [
          {
            id: "loyalty.adjust",
            name: "adjust_loyalty",
            runtime: { entry: "./runtime", export: "adjustLoyalty" },
            requiredScopes: ["loyalty:write"],
          },
        ],
        events: [
          {
            id: "loyalty.event",
            eventType: "loyalty.changed",
            version: "1.0.0",
            payloadSchema: { type: "object" },
            visibility: "internal",
            audit: { sourceModule: "loyalty", category: "domain" },
          },
        ],
        webhooks: [
          {
            id: "loyalty.webhook",
            direction: "inbound",
            apiId: "loyalty.api",
          },
        ],
        actions: [
          {
            id: "loyalty.points.adjust",
            version: "v1",
            kind: "execute",
            targetType: "loyalty_account",
            requiredScopes: ["loyalty:write"],
            risk: "medium",
            ledger: "required",
            from: {
              routes: ["loyalty.api"],
              tools: ["loyalty.adjust"],
              events: ["loyalty.event"],
              webhooks: ["loyalty.webhook"],
            },
          },
        ],
        subscribers: [
          {
            id: "loyalty.changed",
            eventType: "loyalty.changed",
            runtime: { entry: "./runtime", export: "loyaltyChangedFilter" },
          },
        ],
      }),
    ])

    const source = buildGraphRuntimeModule({ graph })

    for (const facet of [
      "api",
      "config.validator",
      "secrets.validator",
      "providers.runtime",
      "admin.copy.runtime",
      "admin.routes.runtime",
      "admin.contributions.runtime",
      "tools.runtime",
      "subscribers.runtime",
    ]) {
      expect(source).toContain(`"facet": "${facet}"`)
    }
    expect(source.match(/import\("@acme\/voyant-loyalty\/runtime"\)/g)).toHaveLength(1)
    expect(source.match(/import\("@acme\/voyant-loyalty\/admin"\)/g)).toHaveLength(1)
    expect(source).toContain('"accessScopes": [')
    expect(source).toContain('"loyalty:write"')
    expect(source).toContain('"tools": [')
    expect(source).toContain('"name": "adjust_loyalty"')
    expect(source).toContain('"config": [')
    expect(source).toContain('"declaration": {')
    expect(source).toContain('"key": "loyalty"')
    expect(source).toContain('"resources": [')
    expect(source).toContain('"kind": "http-service"')
    expect(source).toContain('"providers": [')
    expect(source).toContain('"actions": [')
    expect(source).toContain('"id": "loyalty.points.adjust"')
    expect(source).toContain('"selectedIds": {')
    expect(source).toContain('"loyalty.event"')
    expect(source).toContain('"loyalty.webhook"')
  })

  it("builds one target-neutral whole-application runtime", async () => {
    const graph = await sampleGraph()
    const targetNeutralGraph = {
      ...graph,
      deployment: { mode: graph.deployment.mode, providers: graph.deployment.providers },
    }
    const source = buildProjectRuntimeModule({ graph: targetNeutralGraph })

    expect(source).toContain('GENERATED_PROJECT_RUNTIME_KIND = "application"')
    expect(source).toContain(`graphHash: GENERATED_GRAPH_RUNTIME_HASH`)
    expect(source).toContain(`GENERATED_GRAPH_RUNTIME_HASH = "${graph.contentHash}"`)
    expect(source).toContain("GENERATED_PROJECT_PRODUCT_JOBS")
    expect(source).toContain("productJobs: GENERATED_PROJECT_PRODUCT_JOBS")
    expect(source).toContain("createGraphRuntime: createGeneratedGraphRuntime")
    expect(source).not.toContain("apps/")
    expect(() => buildProjectRuntimeModule({ graph })).toThrow(/must be target-neutral/)
  })

  it("exports selected package jobs from the generated project runtime", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/worker-jobs",
        jobs: [
          {
            id: "acme.worker.reconcile",
            schedule: { every: "5m" },
            runtime: { entry: "./jobs", export: "reconcile" },
          },
        ],
      }),
    ])
    const source = buildProjectRuntimeModule({
      graph: {
        ...graph,
        deployment: { mode: graph.deployment.mode, providers: graph.deployment.providers },
      },
    })
    expect(source).toContain('"id": "acme.worker.reconcile"')
    expect(source).toContain('"every": "5m"')
    expect(source).toContain("productJobs: GENERATED_PROJECT_PRODUCT_JOBS")
  })

  it("removes package importers and loaders when the package is not selected", async () => {
    const loyalty = defineModule({
      id: "@acme/voyant-loyalty",
      api: [
        {
          id: "@acme/voyant-loyalty#api.admin",
          surface: "admin",
          runtime: { entry: "@acme/voyant-loyalty", export: "loyaltyModule" },
        },
      ],
    })
    const crm = defineModule({
      id: "@acme/voyant-crm",
      api: [
        {
          id: "@acme/voyant-crm#api.admin",
          surface: "admin",
          runtime: { entry: "@acme/voyant-crm", export: "crmModule" },
        },
      ],
    })
    const auditPlugin = definePlugin({
      id: "@acme/voyant-loyalty#audit-plugin",
      api: [
        {
          id: "@acme/voyant-loyalty#audit-plugin.api",
          surface: "internal",
          runtime: { entry: "./audit-runtime", export: "auditExtension" },
        },
      ],
    })

    const complete = buildGraphRuntimeModule({
      graph: await graphWithSelectedUnits([loyalty, crm], [auditPlugin]),
    })
    const withoutCrm = buildGraphRuntimeModule({
      graph: await graphWithSelectedUnits([loyalty], [auditPlugin]),
    })

    expect(complete).toContain('import("@acme/voyant-crm")')
    expect(complete).toContain('"@acme/voyant-crm#api.admin"')
    expect(withoutCrm).not.toContain("@acme/voyant-crm")
    expect(withoutCrm).toContain('import("@acme/voyant-loyalty")')
    expect(withoutCrm).toContain('import("@acme/voyant-loyalty/audit-runtime")')
    expect(withoutCrm).toContain('kind": "plugin"')
  })

  it("keeps selected local units graph-gated without generating package importers", async () => {
    const local = defineModule({ id: "@acme/operator#invitations" })
    const source = buildGraphRuntimeModule({
      graph: await graphWithSelectedUnits([local], []),
    })

    expect(source).toContain('"@acme/operator#invitations"')
    expect(source).toContain('"routes": []')
    expect(source).toContain("{} satisfies Readonly<Record<string, () => Promise<unknown>>>")
    expect(source).not.toContain('import("@acme/operator")')
  })

  it("does not import package runtime bodies during graph resolution or generation", async () => {
    const graph = await sampleGraph()

    await expect(sampleGraph()).resolves.toEqual(graph)
    expect(() => buildGraphRuntimeModule({ graph })).not.toThrow()
  })

  it("refuses to emit runtime imports for a graph with unadmitted references", async () => {
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
      packageRecords: [{ packageName: "@acme/voyant-loyalty", source: { kind: "workspace" } }],
    })

    expect(() => buildGraphRuntimeModule({ graph })).toThrow(
      /VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED/,
    )
  })

  it("refuses unadmitted package references from non-route facets", async () => {
    const graph = await graphWithSelectedUnits([
      defineModule({
        id: "@acme/voyant-loyalty",
        providers: [
          {
            id: "loyalty.provider",
            port: "loyalty.ledger",
            runtime: { entry: "@unknown/ledger", export: "provider" },
          },
        ],
      }),
    ])

    expect(() => buildGraphRuntimeModule({ graph })).toThrow(
      /VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED.*providers\.runtime/,
    )
  })

  it("rejects absolute artifact paths", async () => {
    const graph = await sampleGraph()

    expect(() =>
      buildNodeRuntimeEntryArtifact({
        graph,
        file: "/tmp/runtime-entry.generated.ts",
      }),
    ).toThrow(/relative path/)
  })

  it("rejects runtime entry artifacts with a mismatched graph hash", async () => {
    const graph = await sampleGraph()
    const entry = buildNodeRuntimeEntryArtifact({
      graph,
      file: "src/runtime-entry.generated.ts",
    })

    expect(() =>
      buildDeploymentArtifactManifest({
        graph,
        graphArtifactPath: "deployment-graph.generated.json",
        runtimeEntries: [{ ...entry, graphHash: "sha256:stale" }],
      }),
    ).toThrow(/graphHash must match/)
  })
})
