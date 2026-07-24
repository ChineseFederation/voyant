import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { customerBusinessAccountOnboardingRuntimePort } from "@voyant-travel/auth/customer-business-onboarding-runtime-port"
import { createVoyantGraphRuntime } from "@voyant-travel/framework/deployment-artifacts"
import { legalDocumentArtifactProviderPort } from "@voyant-travel/legal"
import { describe, expect, it, vi } from "vitest"
import {
  configureSearchProviderRuntime,
  configureStandardLegalProviderRuntime,
  createGeneratedProject,
  createTestIndexerProvider,
  getRuntimeCompositionMocks,
  loadVoyantProject,
} from "./runtime-composition.test-support.js"

const mocks = getRuntimeCompositionMocks()

describe("Voyant project runtime composition", () => {
  it("uses a statically injected generated runtime without importing a second framework graph", async () => {
    const projectRoot = await createGeneratedProject()
    const generatedProjectRuntime = {
      kind: "application" as const,
      graphHash: "graph-hash",
      deployment: { mode: "self-hosted" as const, providers: mocks.deploymentProviders },
      graphRuntime: createVoyantGraphRuntime({
        graphHash: "graph-hash",
        entries: {},
        modules: [],
        plugins: [],
      }),
      createRuntimePorts: () => ({}),
    }

    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      generatedProjectRuntime,
    })

    expect(
      mocks.tsImport.mock.calls.some(([url]) => url.includes("project-runtime.generated.ts")),
    ).toBe(false)
  })

  it("activates and behaviorally preflights the concrete Standard Legal provider", async () => {
    await configureStandardLegalProviderRuntime()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode("%PDF-standard"), { status: 200 })),
    )
    const projectRoot = await createGeneratedProject()

    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: {
        APP_URL: "http://localhost:3300",
        DATABASE_URL: "postgres://example.invalid/voyant",
        VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf",
      },
    })
    const provider = project.runtimePorts[legalDocumentArtifactProviderPort.id]

    expect(provider).toMatchObject({
      identity: {
        id: "voyant.standard.legal-document",
        protocol: "legal-document-artifact.v1",
      },
    })
    await expect(legalDocumentArtifactProviderPort.test(provider as never)).resolves.toBeUndefined()
    expect(mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0]).toMatchObject({
      graphRuntime: mocks.activatedGraphRuntime,
    })
    expect(
      (mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as { graphRuntime?: unknown }).graphRuntime,
    ).not.toBe(mocks.graphRuntime)
  })

  it("uses the bundled renderer when no HTTP renderer is configured", async () => {
    await configureStandardLegalProviderRuntime()
    const projectRoot = await createGeneratedProject()

    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: {
        APP_URL: "http://localhost:3300",
        DATABASE_URL: "postgres://example.invalid/voyant",
      },
    })
    const provider = project.runtimePorts[legalDocumentArtifactProviderPort.id] as {
      render(input: {
        contractId: string
        body: string
        bodyFormat: "html"
      }): Promise<{ bytes: Uint8Array; metadata: Record<string, string> }>
    }
    const artifact = await provider.render({
      contractId: "contract-bundled-renderer",
      body: "<h1>Diferență rămasă scadentă</h1>",
      bodyFormat: "html",
    })

    expect(new TextDecoder().decode(artifact.bytes.subarray(0, 4))).toBe("%PDF")
    expect(artifact.metadata.renderer).toBe("voyant-basic-document-renderer")
  })

  it("selects admin assets from the same generated artifact layout", async () => {
    const developmentRoot = await createGeneratedProject()
    await mkdir(path.join(developmentRoot, ".voyant/admin/client"), { recursive: true })
    await mkdir(path.join(developmentRoot, "dist/client"), { recursive: true })
    await loadVoyantProject({
      projectRoot: developmentRoot,
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })
    expect(mocks.adminHostOptions[0]?.clientAssetsDir).toBe(
      path.join(developmentRoot, ".voyant/admin/client"),
    )

    const distributionRoot = await createGeneratedProject([], "dist/.voyant")
    await mkdir(path.join(distributionRoot, ".voyant/admin/client"), { recursive: true })
    await mkdir(path.join(distributionRoot, "dist/client"), { recursive: true })
    await loadVoyantProject({
      projectRoot: distributionRoot,
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })
    expect(mocks.adminHostOptions[1]?.clientAssetsDir).toBe(
      path.join(distributionRoot, "dist/client"),
    )
  })

  it("uses current source runtime artifacts with matching built admin assets in production", async () => {
    const projectRoot = await createGeneratedProject()
    const builtArtifactRoot = path.join(projectRoot, "dist/.voyant")
    await mkdir(builtArtifactRoot, { recursive: true })
    await writeFile(
      path.join(builtArtifactRoot, "deployment-graph.generated.json"),
      JSON.stringify({
        contentHash: "graph-hash",
        requirements: { resources: [] },
        provisioning: { scheduledJobs: [] },
      }),
    )
    await mkdir(path.join(projectRoot, "dist/client"), { recursive: true })

    const project = await loadVoyantProject({
      projectRoot,
      env: { DATABASE_URL: "postgres://example.invalid/voyant", NODE_ENV: "production" },
    })

    expect(project.graphHash).toBe("graph-hash")
    expect(mocks.adminHostOptions[0]?.clientAssetsDir).toBe(path.join(projectRoot, "dist/client"))
    expect(mocks.tsImport.mock.calls[0]?.[0]).toContain(
      path.join(projectRoot, ".voyant/runtime/project-runtime.generated.ts"),
    )
  })

  it("does not serve built admin assets from a stale deployment graph", async () => {
    const projectRoot = await createGeneratedProject()
    const builtArtifactRoot = path.join(projectRoot, "dist/.voyant")
    await mkdir(builtArtifactRoot, { recursive: true })
    await writeFile(
      path.join(builtArtifactRoot, "deployment-graph.generated.json"),
      JSON.stringify({ contentHash: "stale-graph-hash" }),
    )
    await mkdir(path.join(projectRoot, "dist/client"), { recursive: true })

    await loadVoyantProject({
      projectRoot,
      env: { DATABASE_URL: "postgres://example.invalid/voyant", NODE_ENV: "production" },
    })

    expect(mocks.adminHostOptions[0]?.clientAssetsDir).toBe(
      path.join(projectRoot, ".voyant/admin/client"),
    )
  })

  it("rewrites persisted legacy media URLs before API dispatch", async () => {
    const projectRoot = await createGeneratedProject()
    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    await project.fetch(
      new Request("http://localhost:3300/api/v1/media/uploads/example.pdf?download=1"),
    )

    const dispatched = mocks.runtimeFetch.mock.calls[0]?.[0] as Request
    expect(new URL(dispatched.url)).toMatchObject({
      pathname: "/api/v1/admin/media/uploads/example.pdf",
      search: "?download=1",
    })
  })

  it("provides the standard cloud email resolver to the auth runtime", async () => {
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    expect(mocks.authRuntimeOptions[0]).toMatchObject({
      resolveEmailSender: expect.any(Function),
    })
  })

  it("passes active modules and a host customer-auth resolver to the auth runtime", async () => {
    mocks.graphRuntime.modules = [
      { id: "@voyant-travel/catalog", localId: "catalog" },
      { id: "@acme/loyalty" },
    ]
    const resolveCustomerAuthContext = async () => ({
      baseURL: "https://shop.example.com",
      trustedOrigins: ["https://shop.example.com"],
      methods: { emailCode: true, emailPassword: true },
    })
    const projectRoot = await createGeneratedProject()

    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { resolveCustomerAuthContext },
    })

    expect(mocks.authRuntimeOptions[0]).toMatchObject({
      activeModules: ["catalog", "@acme/loyalty"],
      resolveCustomerAuthContext,
    })
  })

  it("passes a provider-neutral host auth email sender to the auth runtime", async () => {
    const sender = {
      sendResetPassword: vi.fn(async () => {}),
      sendVerificationOtp: vi.fn(async () => {}),
      sendCustomerOrganizationInvitation: vi.fn(async () => {}),
    }
    const resolveAuthEmailSender = () => sender
    const projectRoot = await createGeneratedProject()

    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: {
        DATABASE_URL: "postgres://example.invalid/voyant",
        BETTER_AUTH_ADMIN_SECRET: "admin-auth-secret-with-at-least-32-characters",
        SESSION_CLAIMS_ADMIN_SECRET: "admin-claims-secret-with-at-least-32-characters",
        BETTER_AUTH_CUSTOMER_SECRET: "customer-auth-secret-with-at-least-32-characters",
        SESSION_CLAIMS_CUSTOMER_SECRET: "customer-claims-secret-with-at-least-32-characters",
      },
      host: { resolveAuthEmailSender },
    })

    expect(mocks.authRuntimeOptions[0]).toMatchObject({
      resolveEmailSender: resolveAuthEmailSender,
    })
  })

  it("injects the composed customer business onboarding port into auth", async () => {
    const provider = Object.fromEntries(
      [
        "getCapabilities",
        "createBusinessAccount",
        "requestBusinessAccount",
        "listRequests",
        "cancelRequest",
        "approveRequest",
        "rejectRequest",
        "provisionBusinessAccount",
      ].map((method) => [method, vi.fn()]),
    )
    mocks.runtimePorts[customerBusinessAccountOnboardingRuntimePort.id] = provider
    try {
      const projectRoot = await createGeneratedProject()
      await loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      })
      expect(mocks.authRuntimeOptions[0]?.customerBusinessAccountOnboarding).toBe(provider)
    } finally {
      delete mocks.runtimePorts[customerBusinessAccountOnboardingRuntimePort.id]
    }
  })

  it("derives auth mode from the selected deployment provider, not environment", async () => {
    mocks.deploymentProviders.adminAuth = "voyant-cloud"
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: {
        DATABASE_URL: "postgres://example.invalid/voyant",
        VOYANT_ADMIN_AUTH_MODE: "local",
      },
    })

    expect(mocks.authRuntimeOptions[0]).toMatchObject({ authMode: "voyant-cloud" })
  })

  it.each([
    "adminAuth",
    "customerAuth",
  ] as const)("rejects a generated deployment without explicit %s selection", async (role) => {
    delete mocks.deploymentProviders[role]
    const projectRoot = await createGeneratedProject()

    await expect(
      loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      }),
    ).rejects.toThrow(new RegExp(`deployment\\.providers\\.${role}`))

    expect(mocks.loadVoyantNodeRuntime).not.toHaveBeenCalled()
  })
})

describe("Voyant search provider composition", () => {
  it("ignores a catalog.indexer host override when search is none", async () => {
    const graph = configureSearchProviderRuntime("none", ["typesense"])
    const hostIndexer = createTestIndexerProvider("host")
    const projectRoot = await createGeneratedProject()

    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { runtimePorts: { "catalog.indexer": hostIndexer } },
    })

    expect(project.runtimePorts["catalog.indexer"]).toBeUndefined()
    expect(graph.typesense!.importProvider).not.toHaveBeenCalled()
  })

  it.each([
    "typesense",
    "algolia",
    "postgres",
  ])("keeps selected %s search authoritative over a catalog.indexer host override", async (search) => {
    const graph = configureSearchProviderRuntime(search, [search])
    const hostIndexer = createTestIndexerProvider("host")
    const projectRoot = await createGeneratedProject()

    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { runtimePorts: { "catalog.indexer": hostIndexer } },
    })

    expect(project.runtimePorts["catalog.indexer"]).toBe(graph[search]?.port)
    expect(graph[search]?.importProvider).toHaveBeenCalledOnce()
  })

  it("gives a custom catalog.indexer host port precedence over a graph custom provider", async () => {
    const graph = configureSearchProviderRuntime("custom", ["custom"])
    const hostIndexer = createTestIndexerProvider("host")
    const projectRoot = await createGeneratedProject()

    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { runtimePorts: { "catalog.indexer": hostIndexer } },
    })

    expect(project.runtimePorts["catalog.indexer"]).toBe(hostIndexer)
    expect(graph.custom!.importProvider).not.toHaveBeenCalled()
  })

  it("rejects a selected search provider that is missing from the graph", async () => {
    const graph = configureSearchProviderRuntime("algolia", ["typesense"])
    const projectRoot = await createGeneratedProject()

    await expect(
      loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
        host: { runtimePorts: { "catalog.indexer": createTestIndexerProvider("host") } },
      }),
    ).rejects.toThrow(/VOYANT_GRAPH_RUNTIME_PROVIDER_MISSING.*catalog\.indexer/s)
    expect(graph.typesense!.importProvider).not.toHaveBeenCalled()
    expect(mocks.loadVoyantNodeRuntime).not.toHaveBeenCalled()
  })

  it("rejects mismatched generated search authority before admitting a custom host port", async () => {
    const graph = configureSearchProviderRuntime("typesense", ["typesense"])
    mocks.deploymentProviders.search = "custom"
    const projectRoot = await createGeneratedProject()

    await expect(
      loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
        host: { runtimePorts: { "catalog.indexer": createTestIndexerProvider("host") } },
      }),
    ).rejects.toThrow(
      /deployment\.providers\.search="custom".*providerSelections\.search="typesense"/,
    )
    expect(graph.typesense!.importProvider).not.toHaveBeenCalled()
    expect(mocks.loadVoyantNodeRuntime).not.toHaveBeenCalled()
  })
})
