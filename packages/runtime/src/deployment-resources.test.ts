import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { createVoyantGraphRuntime } from "@voyant-travel/framework/deployment-artifacts"
import { describe, expect, it, vi } from "vitest"

import {
  createVoyantDeploymentResources,
  resolveAdmittedHostRuntimePorts,
  resolveSelectedGraphProviderPorts,
} from "./deployment-resources.js"

function primitives(): VoyantRuntimeHostPrimitives {
  return {
    env: () => ({}),
    database: {
      resolve: <TDatabase>() => ({}) as TDatabase,
      fromContext: <TDatabase>() => ({}) as TDatabase,
      transaction: async (_bindings, operation) => operation({}),
    },
    storage: {
      resolve: () => ({}),
      read: async () => null,
      downloadUrl: async () => null,
    },
    events: { deliver: vi.fn(async () => ["queued"]) },
    jobs: { wakeAt: vi.fn() },
    config: { read: () => undefined },
  }
}

describe("createVoyantDeploymentResources", () => {
  it("passes only declared resources into selected provider factories", async () => {
    const importProvider = vi.fn(async () => ({
      createProvider: ({ getResource }: { getResource(id: string): unknown }) => ({
        database: getResource("resource.database"),
      }),
    }))
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:provider-resource",
      providerSelections: { search: "postgres" },
      entries: { "@acme/search/provider": importProvider },
      modules: [
        {
          id: "@acme/search",
          kind: "module",
          packageName: "@acme/search",
          order: 0,
          references: [
            {
              id: "search-provider",
              unitId: "@acme/search",
              facet: "providers.runtime",
              entityId: "search.postgres",
              runtime: { entry: "./provider", export: "createProvider" },
              importEntry: "@acme/search/provider",
            },
          ],
          resources: [
            {
              unitId: "@acme/search",
              declaration: { id: "resource.database", kind: "database", required: true },
            },
          ],
          providers: [
            {
              unitId: "@acme/search",
              declaration: {
                id: "search.postgres",
                port: "catalog.indexer",
                selection: { role: "search", value: "postgres" },
                runtime: { entry: "./provider", export: "createProvider" },
                uses: { resources: ["resource.database"] },
              },
              referenceId: "search-provider",
            },
          ],
          selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
          routes: [],
        },
      ],
      plugins: [],
    })

    await expect(
      resolveSelectedGraphProviderPorts(
        runtime,
        {},
        {
          resolveResource: (resource) => (resource.kind === "database" ? "shared-db" : undefined),
        },
      ),
    ).resolves.toEqual({ "catalog.indexer": { database: "shared-db" } })
  })

  it("lowers the generated runtime ports from the exact injected primitives", () => {
    const hostPrimitives = primitives()
    const createRuntimePorts = vi.fn(() => ({ "example.port": { ready: true } }))

    const resources = createVoyantDeploymentResources({
      primitives: hostPrimitives,
      createRuntimePorts,
    })

    expect(createRuntimePorts).toHaveBeenCalledWith({ primitives: hostPrimitives })
    expect(resources).toMatchObject({
      capabilities: {},
      primitives: hostPrimitives,
      ports: { "example.port": { ready: true } },
    })
  })

  it("resolves only deployment-selected providers and honors explicit exclusions", async () => {
    const importProvider = vi.fn(async () => ({
      createProvider: ({
        providerConfig,
        getConfig,
      }: {
        providerConfig: { engine?: string }
        getConfig(id: string): unknown
      }) => ({ engine: providerConfig.engine, host: getConfig("search.host") }),
    }))
    const runtime = createVoyantGraphRuntime({
      graphHash: "sha256:providers",
      providerSelections: { search: "typesense" },
      entries: { "@acme/search/provider": importProvider },
      modules: [
        {
          id: "@acme/search",
          kind: "module",
          packageName: "@acme/search",
          order: 0,
          references: [
            {
              id: "search-provider",
              unitId: "@acme/search",
              facet: "providers.runtime",
              entityId: "search.typesense",
              runtime: { entry: "./provider", export: "createProvider" },
              importEntry: "@acme/search/provider",
            },
          ],
          providers: [
            {
              unitId: "@acme/search",
              declaration: {
                id: "search.typesense",
                port: "catalog.indexer",
                selection: { role: "search", value: "typesense" },
                runtime: { entry: "./provider", export: "createProvider" },
                config: { engine: "typesense" },
                uses: { config: ["search.host"] },
              },
              referenceId: "search-provider",
            },
          ],
          config: [
            {
              unitId: "@acme/search",
              declaration: { id: "search.host", key: "SEARCH_HOST", required: true },
            },
          ],
          selectedIds: { routes: [], tools: [], events: [], webhooks: [] },
          routes: [],
        },
      ],
      plugins: [],
    })

    await expect(
      resolveSelectedGraphProviderPorts(
        runtime,
        { LEGACY_SEARCH_HOST: "https://search.example" },
        { deploymentValueAliases: { SEARCH_HOST: ["LEGACY_SEARCH_HOST"] } },
      ),
    ).resolves.toEqual({
      "catalog.indexer": { engine: "typesense", host: "https://search.example" },
    })
    expect(importProvider).toHaveBeenCalledOnce()

    importProvider.mockClear()
    await expect(
      resolveSelectedGraphProviderPorts(runtime, {}, { excludedPorts: ["catalog.indexer"] }),
    ).resolves.toEqual({})
    expect(importProvider).not.toHaveBeenCalled()

    const missingProviderRuntime = { ...runtime, providerSelections: { search: "algolia" } }
    await expect(resolveSelectedGraphProviderPorts(missingProviderRuntime, {})).rejects.toThrow(
      /VOYANT_GRAPH_RUNTIME_PROVIDER_MISSING.*catalog\.indexer/s,
    )

    await expect(
      resolveSelectedGraphProviderPorts(
        missingProviderRuntime,
        {},
        {
          excludedPorts: ["catalog.indexer"],
        },
      ),
    ).resolves.toEqual({})
  })

  it("seeds generated composition with selected and explicit provider ports", () => {
    const hostPrimitives = primitives()
    const providerPorts = { "catalog.indexer": { engine: "custom" } }
    const createRuntimePorts = vi.fn(({ runtimePorts }) => ({
      ...runtimePorts,
      "example.port": { ready: true },
    }))

    const resources = createVoyantDeploymentResources({
      primitives: hostPrimitives,
      providerPorts,
      createRuntimePorts,
    })

    expect(createRuntimePorts).toHaveBeenCalledWith({
      primitives: hostPrimitives,
      runtimePorts: providerPorts,
    })
    expect(resources.ports).toEqual({
      "catalog.indexer": { engine: "custom" },
      "example.port": { ready: true },
    })
  })

  it("delegates outbound webhook delivery to the injected event primitive", async () => {
    const hostPrimitives = primitives()
    const event = { id: "event_1" }
    const bindings = { DATABASE_URL: "postgres://example.invalid/voyant" }
    const resources = createVoyantDeploymentResources({
      primitives: hostPrimitives,
      createRuntimePorts: () => ({}),
      outboundWebhooks: { enqueue: hostPrimitives.events.deliver },
    })

    await expect(resources.outboundWebhooks?.enqueue(event as never, bindings)).resolves.toEqual([
      "queued",
    ])
    expect(hostPrimitives.events.deliver).toHaveBeenCalledWith(event, bindings)
  })

  it("omits outbound webhook composition when no enqueuer is selected", () => {
    const resources = createVoyantDeploymentResources({
      primitives: primitives(),
      createRuntimePorts: () => ({}),
    })

    expect(resources.outboundWebhooks).toBeUndefined()
  })
})

describe("resolveAdmittedHostRuntimePorts", () => {
  it.each([
    "none",
    "typesense",
    "algolia",
    "postgres",
  ])("keeps search provider %s authoritative over a catalog.indexer host port", (search) => {
    const otherPort = { ready: true }

    expect(
      resolveAdmittedHostRuntimePorts(
        {
          "catalog.indexer": { engine: "host" },
          "example.port": otherPort,
        },
        searchProviderAuthority(search),
      ),
    ).toEqual({ "example.port": otherPort })
  })

  it("admits a catalog.indexer host port only for custom search", () => {
    const runtimePorts = {
      "catalog.indexer": { engine: "host" },
      "example.port": { ready: true },
    }

    expect(resolveAdmittedHostRuntimePorts(runtimePorts, searchProviderAuthority("custom"))).toBe(
      runtimePorts,
    )
  })

  it("rejects inconsistent deployment and graph search selections", () => {
    expect(() =>
      resolveAdmittedHostRuntimePorts(
        { "catalog.indexer": { engine: "host" } },
        searchProviderAuthority("custom", "typesense"),
      ),
    ).toThrow(/deployment\.providers\.search="custom".*providerSelections\.search="typesense"/)
  })
})

function searchProviderAuthority(deploymentSearch: string, graphSearch = deploymentSearch) {
  return {
    deployment: { providers: { search: deploymentSearch } },
    graphRuntime: { providerSelections: { search: graphSearch } },
  }
}
