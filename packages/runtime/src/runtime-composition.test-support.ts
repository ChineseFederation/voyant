import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createVoyantGraphRuntime } from "@voyant-travel/framework/deployment-artifacts"
import { afterEach, beforeEach, type Mock, vi } from "vitest"

interface RuntimeCompositionMocks {
  adminHostOptions: Array<{
    clientAssetsDir: string
    app(request: Request, env: unknown, ctx: unknown): Promise<Response>
  }>
  adminSsrHandler: Mock
  createAdminSsrHandler: Mock
  authRuntimeOptions: Array<Record<string, unknown>>
  createNodeServer: Mock
  postgresEnqueue: Mock
  appEnqueue: Mock
  createAppWebhookDeliveryEnqueuer: Mock
  createAppWebhookDeliveryWorker: Mock
  createAppWebhookDeliveryLoop: Mock
  appWebhookDeliveryWorker: { drain: Mock; runNext: Mock }
  appWebhookDeliveryLoop: { poll: Mock; start: Mock; stop: Mock }
  createWebhookDeliveryWorker: Mock
  createWebhookDeliveryLoop: Mock
  webhookDeliveryWorker: { drain: Mock; runNext: Mock }
  webhookDeliveryLoop: { poll: Mock; start: Mock; stop: Mock }
  createPostgresWebhookDeliveryEnqueuer: Mock
  createPostgresWebhookDeliveryStore: Mock
  deploymentProviders: Record<string, string>
  loadVoyantNodeRuntime: Mock
  nodeRuntime: {
    env: Record<string, string>
    deployment: { mode: string; providers: Record<string, string> }
    app: {
      ready: Mock
      fetch: Mock<(request: Request) => Promise<Response>>
      services: { has: Mock; register: Mock; resolve: Mock }
      eventBus: { emit: Mock; subscribe: Mock }
    }
  }
  resolveNodeDatabase: Mock
  runtimePortHosts: Array<{
    primitives: unknown
    runtimePorts?: Readonly<Record<string, unknown>>
  }>
  runtimeFetch: Mock<(request: Request) => Promise<Response>>
  tsImport: Mock<(url: string) => Promise<unknown>>
  runtimePorts: Record<string, unknown>
  graphRuntime: Record<string, unknown>
  activatedGraphRuntime: Record<string, unknown>
}

const mocks: RuntimeCompositionMocks = vi.hoisted(() => {
  const graphRuntime = {
    modules: [],
    extensions: [],
    plugins: [],
    accessCatalog: { resources: [] },
  }
  const selectedGraphRuntime: Record<string, unknown> = { ...graphRuntime }
  const runtimePorts = {}
  const services = { has: vi.fn(() => false), register: vi.fn(), resolve: vi.fn() }
  const eventBus = { emit: vi.fn(), subscribe: vi.fn() }
  const runtimeFetch = vi.fn(async (request: Request) => new Response(request.url))
  const adminSsrHandler = vi.fn(async (request: Request) => new Response(request.url))
  const createAdminSsrHandler = vi.fn(() => adminSsrHandler)
  const nodeRuntime = {
    env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    deployment: { mode: "self-hosted", providers: {} },
    app: { ready: vi.fn(), fetch: runtimeFetch, services, eventBus },
  }
  return {
    adminHostOptions: [] as Array<{
      clientAssetsDir: string
      app(request: Request, env: unknown, ctx: unknown): Promise<Response>
    }>,
    adminSsrHandler,
    createAdminSsrHandler,
    authRuntimeOptions: [] as Array<Record<string, unknown>>,
    createNodeServer: vi.fn(
      (options: { residentServices?: Array<{ start(): void; stop(): void | Promise<void> }> }) => {
        for (const service of options.residentServices ?? []) service.start()
        return {
          close: vi.fn(async () => {
            await Promise.all((options.residentServices ?? []).map((service) => service.stop()))
          }),
          port: 8080,
        }
      },
    ),
    postgresEnqueue: vi.fn(async () => ["queued"]),
    appEnqueue: vi.fn(async () => ["app-queued"]),
    createAppWebhookDeliveryEnqueuer: vi.fn(),
    createAppWebhookDeliveryWorker: vi.fn(),
    createAppWebhookDeliveryLoop: vi.fn(),
    appWebhookDeliveryWorker: { drain: vi.fn(), runNext: vi.fn() },
    appWebhookDeliveryLoop: { poll: vi.fn(), start: vi.fn(), stop: vi.fn() },
    createWebhookDeliveryWorker: vi.fn(),
    createWebhookDeliveryLoop: vi.fn(),
    webhookDeliveryWorker: { drain: vi.fn(), runNext: vi.fn() },
    webhookDeliveryLoop: { poll: vi.fn(), start: vi.fn(), stop: vi.fn() },
    createPostgresWebhookDeliveryEnqueuer: vi.fn(),
    createPostgresWebhookDeliveryStore: vi.fn(),
    deploymentProviders: {
      adminAuth: "better-auth",
      customerAuth: "better-auth",
      outboundWebhooks: "postgres",
    } as Record<string, string>,
    loadVoyantNodeRuntime: vi.fn(async (options: { env?: Record<string, string> }) => {
      nodeRuntime.env = { ...nodeRuntime.env, ...options.env }
      return nodeRuntime
    }),
    nodeRuntime,
    resolveNodeDatabase: vi.fn(() => ({ kind: "database" })),
    runtimePortHosts: [] as Array<{
      primitives: unknown
      runtimePorts?: Readonly<Record<string, unknown>>
    }>,
    runtimeFetch,
    tsImport: vi.fn(),
    runtimePorts,
    graphRuntime: selectedGraphRuntime,
    activatedGraphRuntime: selectedGraphRuntime,
  }
})

export function getRuntimeCompositionMocks(): RuntimeCompositionMocks {
  return mocks
}

vi.mock("@voyant-travel/admin-host/serve", () => ({
  serveAdminHost: (options: (typeof mocks.adminHostOptions)[number]) => {
    mocks.adminHostOptions.push(options)
    return {
      fetch: (request: Request, env: unknown, ctx: unknown) => options.app(request, env, ctx),
    }
  },
}))

vi.mock("@voyant-travel/admin-host/ssr", () => ({
  createAdminSsrHandler: mocks.createAdminSsrHandler,
}))

vi.mock("@voyant-travel/apps", () => ({
  appsWebhookDeliveryRuntimePort: {
    id: "apps.webhook-delivery",
    test: (runtime: { resolveSigningKey?: unknown }) => {
      if (typeof runtime?.resolveSigningKey !== "function") throw new Error("invalid app runtime")
    },
  },
  createAppWebhookDeliveryEnqueuer: mocks.createAppWebhookDeliveryEnqueuer,
  createAppWebhookDeliveryWorker: mocks.createAppWebhookDeliveryWorker,
}))

vi.mock("./app-webhook-delivery-loop.js", () => ({
  createAppWebhookDeliveryLoop: mocks.createAppWebhookDeliveryLoop,
  createWebhookDeliveryLoop: mocks.createWebhookDeliveryLoop,
}))

vi.mock("@voyant-travel/webhook-delivery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@voyant-travel/webhook-delivery")>()
  return {
    ...actual,
    createWebhookDeliveryWorker: mocks.createWebhookDeliveryWorker,
  }
})

vi.mock("@voyant-travel/auth/node-runtime", () => ({
  createOperatorAuthNodeRuntime: (options: Record<string, unknown>) => {
    mocks.authRuntimeOptions.push(options)
    return {
      handler: vi.fn(),
      getBootstrapStatusForRequest: vi.fn(),
      getCurrentUserForRequest: vi.fn(),
      hasAuthPermission: vi.fn(),
      resolveAuthRequest: vi.fn(),
      resolveOAuthDiscoveryRequest: vi.fn(async () => null),
      validateApiTokenAccess: vi.fn(),
    }
  },
}))

vi.mock("@voyant-travel/cloud-sdk", () => ({
  getVoyantCloudClient: vi.fn(),
}))

vi.mock("@voyant-travel/db/runtime", () => ({
  resolveNodeDatabase: mocks.resolveNodeDatabase,
}))

vi.mock("@voyant-travel/framework/node-runtime", () => ({
  createVoyantNodeEnv: (env: Record<string, string | undefined>) => env,
  createVoyantNodeRuntimeHostPrimitives: (options: {
    env: Record<string, string | undefined>
    deliverEvent(event: unknown, bindings: unknown): Promise<unknown>
  }) => ({
    env: () => options.env,
    database: {},
    storage: {},
    config: {},
    events: { deliver: options.deliverEvent },
  }),
  loadVoyantNodeRuntime: mocks.loadVoyantNodeRuntime,
  resolveVoyantNodeProviderPlan: () => ({
    storage: "memory",
    cache: "memory",
    sharedState: "memory",
    rateLimit: "memory",
  }),
  validateVoyantNodeProviderPlanEnv: () => [],
}))

vi.mock("./deployment-resources.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./deployment-resources.js")>()
  return {
    ...actual,
    resolveSelectedGraphProviderPorts: async (
      ...args: Parameters<typeof actual.resolveSelectedGraphProviderPorts>
    ) => {
      const resolved = await actual.resolveSelectedGraphProviderPorts(...args)
      if (args[2]?.excludedPorts?.includes("storage.object")) return resolved
      return { "storage.object": { resolve: () => null }, ...resolved }
    },
    resolveSelectedGraphRuntimeProviders: async (
      ...args: Parameters<typeof actual.resolveSelectedGraphRuntimeProviders>
    ) => {
      mocks.activatedGraphRuntime = { ...args[0], activatedForConditionalActions: true }
      if ((args[0].providers ?? []).length === 0) {
        return {
          graphHash: args[0].graphHash,
          selectedProviders: [],
          getProvider: async () => undefined,
          activateRuntime: async () => mocks.activatedGraphRuntime,
        }
      }
      const ports = await actual.resolveSelectedGraphProviderPorts(...args)
      return {
        graphHash: args[0].graphHash,
        selectedProviders: Object.keys(ports).map((port) => ({
          unitId: "test",
          declarationId: `test:${port}`,
          port,
          selection: { role: "test", value: "test" },
        })),
        getProvider: async (port: string) => ports[port],
        activateRuntime: async () => mocks.activatedGraphRuntime,
      }
    },
  }
})

vi.mock("@voyant-travel/hono/observability/reporter", () => ({
  consoleReporter: () => ({}),
}))

vi.mock("@voyant-travel/runtime-core", () => ({
  createNodeServer: mocks.createNodeServer,
}))

vi.mock("@voyant-travel/webhook-delivery/postgres", () => ({
  createPostgresWebhookDeliveryEnqueuer: mocks.createPostgresWebhookDeliveryEnqueuer,
  createPostgresWebhookDeliveryStore: mocks.createPostgresWebhookDeliveryStore,
}))

vi.mock("tsx/esm/api", () => ({
  tsImport: mocks.tsImport,
}))

mocks.tsImport.mockImplementation(async (url: string) => {
  if (url.includes("project-runtime.generated.ts")) {
    return {
      createGeneratedProjectRuntime: () => ({
        kind: "application",
        graphHash: "graph-hash",
        deployment: { mode: "self-hosted", providers: mocks.deploymentProviders },
        graphRuntime: mocks.graphRuntime,
        createRuntimePorts: (host: (typeof mocks.runtimePortHosts)[number]) => {
          mocks.runtimePortHosts.push(host)
          return { ...host.runtimePorts, ...mocks.runtimePorts }
        },
      }),
    }
  }
  if (url.includes("project-links.generated.ts")) return { projectLinks: [] }
  throw new Error(`Unexpected generated import: ${url}`)
})

type RuntimeModule = typeof import("./index.js")

export async function loadVoyantProject(
  ...args: Parameters<RuntimeModule["loadVoyantProject"]>
): ReturnType<RuntimeModule["loadVoyantProject"]> {
  const runtime = await import("./index.js")
  const [options = {}] = args
  return runtime.loadVoyantProject({
    ...options,
    env: {
      BETTER_AUTH_ADMIN_SECRET: "admin-auth-secret-with-at-least-32-characters",
      BETTER_AUTH_CUSTOMER_SECRET: "customer-auth-secret-with-at-least-32-characters",
      SESSION_CLAIMS_ADMIN_SECRET: "admin-claims-secret-with-at-least-32-characters",
      SESSION_CLAIMS_CUSTOMER_SECRET: "customer-claims-secret-with-at-least-32-characters",
      VOYANT_CLOUD_DEPLOYMENT_ID: "dpl_test",
      VOYANT_CLOUD_ADMIN_AUTH_START_URL: "https://cloud.example/auth/start",
      VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL: "https://cloud.example/auth/exchange",
      VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL: "https://cloud.example/.well-known/jwks.json",
      VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL: "https://cloud.example/auth/revalidate",
      VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN: "client-token",
      ...options.env,
    },
  })
}

const temporaryRoots: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  mocks.adminHostOptions.length = 0
  mocks.authRuntimeOptions.length = 0
  mocks.runtimePortHosts.length = 0
  mocks.nodeRuntime.env = { DATABASE_URL: "postgres://example.invalid/voyant" }
  mocks.createAdminSsrHandler.mockImplementation(() => mocks.adminSsrHandler)
  mocks.deploymentProviders = {
    adminAuth: "better-auth",
    customerAuth: "better-auth",
    outboundWebhooks: "postgres",
  }
  mocks.graphRuntime = {
    modules: [],
    extensions: [],
    plugins: [],
    accessCatalog: { resources: [] },
  }
  mocks.createPostgresWebhookDeliveryEnqueuer.mockReturnValue({
    enqueue: mocks.postgresEnqueue,
  })
  mocks.createAppWebhookDeliveryEnqueuer.mockReturnValue({ enqueue: mocks.appEnqueue })
  mocks.createAppWebhookDeliveryWorker.mockReturnValue(mocks.appWebhookDeliveryWorker)
  mocks.createAppWebhookDeliveryLoop.mockReturnValue(mocks.appWebhookDeliveryLoop)
  mocks.createPostgresWebhookDeliveryStore.mockReturnValue({ kind: "subscription-store" })
  mocks.createWebhookDeliveryWorker.mockReturnValue(mocks.webhookDeliveryWorker)
  mocks.createWebhookDeliveryLoop.mockReturnValue(mocks.webhookDeliveryLoop)
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })))
})

export async function createGeneratedProject(
  scheduledJobs: readonly Readonly<Record<string, unknown>>[] = [],
  layout = ".voyant",
): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "voyant-runtime-"))
  temporaryRoots.push(projectRoot)
  const artifactRoot = path.join(projectRoot, layout)
  const runtimeDir = path.join(artifactRoot, "runtime")
  await mkdir(runtimeDir, { recursive: true })
  await writeFile(path.join(runtimeDir, "project-runtime.generated.ts"), "export {}\n")
  await writeFile(
    path.join(artifactRoot, "deployment-graph.generated.json"),
    JSON.stringify({
      contentHash: "graph-hash",
      requirements: { resources: [] },
      provisioning: { scheduledJobs },
    }),
  )
  return projectRoot
}

export function configureSearchProviderRuntime(
  selection: string,
  declarations: readonly string[],
): Record<string, { importProvider: ReturnType<typeof vi.fn>; port: unknown }> {
  const configured: Record<string, { importProvider: ReturnType<typeof vi.fn>; port: unknown }> = {}
  const entries: Record<string, () => Promise<unknown>> = {}
  const references = declarations.map((value) => {
    const importEntry = `@acme/search-${value}/provider`
    const port = createTestIndexerProvider(`graph:${value}`)
    const createProvider = vi.fn(() => port)
    const importProvider = vi.fn(async () => ({ createProvider }))
    configured[value] = { importProvider, port }
    entries[importEntry] = importProvider
    return {
      id: `search-${value}-provider`,
      unitId: "@acme/search",
      facet: "providers.runtime" as const,
      entityId: `search.${value}`,
      runtime: { entry: "./provider", export: "createProvider" },
      importEntry,
    }
  })

  mocks.deploymentProviders.search = selection
  mocks.graphRuntime = {
    ...createVoyantGraphRuntime({
      graphHash: `sha256:search-${selection}`,
      providerSelections: { search: selection },
      entries,
      modules: [
        {
          id: "@acme/search",
          kind: "module",
          packageName: "@acme/search",
          order: 0,
          references,
          providers: declarations.map((value, index) => ({
            unitId: "@acme/search",
            declaration: {
              id: `search.${value}`,
              port: "catalog.indexer",
              selection: { role: "search", value },
              runtime: { entry: "./provider", export: "createProvider" },
            },
            referenceId: references[index]?.id ?? "",
          })),
          selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
          routes: [],
        },
      ],
      plugins: [],
    }),
  }
  return configured
}

export async function configureStandardLegalProviderRuntime(): Promise<void> {
  const [
    { STANDARD_OPERATOR_DEPLOYMENT },
    { legalVoyantModule },
    { createLegalDocumentArtifactGraphProvider },
    { storageVoyantModule },
    { createMemoryGraphStorageProvider },
  ] = await Promise.all([
    import("@voyant-travel/operator-standard"),
    import("@voyant-travel/legal/voyant"),
    import("@voyant-travel/legal/runtime-contributor"),
    import("@voyant-travel/storage/voyant"),
    import("@voyant-travel/storage/providers/graph"),
  ])
  const legalProvider = legalVoyantModule.providers?.find(
    ({ selection }) => selection?.role === "legalDocumentArtifact",
  )
  const storageProvider = storageVoyantModule.providers?.find(
    ({ selection }) => selection?.role === "storage" && selection.value === "memory",
  )
  if (!legalProvider || !storageProvider)
    throw new Error("Standard Legal provider graph is missing.")

  const legalReference = {
    id: "legal-document-artifact-provider",
    unitId: legalVoyantModule.id,
    facet: "providers.runtime" as const,
    entityId: legalProvider.id,
    runtime: legalProvider.runtime,
    importEntry: "@voyant-travel/legal/runtime-contributor",
  }
  const storageReference = {
    id: "memory-storage-provider",
    unitId: storageVoyantModule.id,
    facet: "providers.runtime" as const,
    entityId: storageProvider.id,
    runtime: storageProvider.runtime,
    importEntry: "@voyant-travel/storage/providers/graph",
  }
  mocks.deploymentProviders = {
    ...mocks.deploymentProviders,
    ...STANDARD_OPERATOR_DEPLOYMENT.providers,
  } as Record<string, string>
  mocks.graphRuntime = {
    ...createVoyantGraphRuntime({
      graphHash: "sha256:standard-legal-provider",
      providerSelections: {
        search: STANDARD_OPERATOR_DEPLOYMENT.providers!.search!,
        storage: STANDARD_OPERATOR_DEPLOYMENT.providers!.storage!,
        legalDocumentArtifact: STANDARD_OPERATOR_DEPLOYMENT.providers!.legalDocumentArtifact!,
      },
      entries: {
        [legalReference.importEntry]: async () => ({
          createLegalDocumentArtifactGraphProvider,
        }),
        [storageReference.importEntry]: async () => ({ createMemoryGraphStorageProvider }),
      },
      modules: [
        {
          id: storageVoyantModule.id,
          kind: "module",
          packageName: storageVoyantModule.packageName!,
          order: 0,
          references: [storageReference],
          providers: [
            {
              unitId: storageVoyantModule.id,
              declaration: storageProvider,
              referenceId: storageReference.id,
            },
          ],
          config: (storageVoyantModule.config ?? []).map((declaration) => ({
            unitId: storageVoyantModule.id,
            declaration,
          })),
          selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
          routes: [],
        },
        {
          id: legalVoyantModule.id,
          kind: "module",
          packageName: legalVoyantModule.packageName!,
          order: 1,
          references: [legalReference],
          resources: (legalVoyantModule.resources ?? []).map((declaration) => ({
            unitId: legalVoyantModule.id,
            declaration,
          })),
          providers: [
            {
              unitId: legalVoyantModule.id,
              declaration: legalProvider,
              referenceId: legalReference.id,
            },
          ],
          selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
          routes: [],
        },
      ],
      plugins: [],
    }),
  }
  mocks.resolveNodeDatabase.mockReturnValue({
    transaction: async (operation: (tx: { execute: Mock }) => Promise<unknown>) =>
      operation({ execute: vi.fn(async () => []) }),
  })
}

export function createTestIndexerProvider(source: string) {
  return {
    create: vi.fn(() => ({
      capabilities: {
        supportsKeywordSearch: true,
        supportsHybridSearch: false,
        supportsVectorFields: false,
        vectorDimensions: null,
        maxVectorsPerDocument: null,
        supportsCrossAudienceFederation: false,
        supportsAdminDenormalization: false,
      },
      ensureCollection: vi.fn(async () => undefined),
      upsert: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      search: vi.fn(async () => ({ hits: [], total: 0 })),
      bulkReindex: vi.fn(async () => undefined),
    })),
    source,
  }
}
