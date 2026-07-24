import type { VoyantGraphRuntime } from "@voyant-travel/framework"
import {
  createVoyantNodeEnv,
  createVoyantNodeRuntimeHostPrimitives,
} from "@voyant-travel/framework/node-runtime"
import {
  type CreateVoyantDeploymentResourcesOptions,
  createVoyantDeploymentResources,
  resolveSelectedGraphRuntimeProviders,
} from "@voyant-travel/runtime/deployment-resources"
import { createLocalStorageProvider } from "@voyant-travel/storage/providers/local"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

interface GeneratedProjectRuntimeModule {
  createGeneratedGraphRuntime(): VoyantGraphRuntime
  createGeneratedGraphRuntimePorts: CreateVoyantDeploymentResourcesOptions["createRuntimePorts"]
  GENERATED_GRAPH_RUNTIME_EXTENSION_IDS: readonly string[]
  GENERATED_GRAPH_RUNTIME_MODULE_IDS: readonly string[]
  GENERATED_GRAPH_RUNTIME_PLUGIN_IDS: readonly string[]
}

// Generated wiring is executed by integration tests but checked at its framework source boundary.
const generatedRuntimeSpecifier = "../../.voyant/runtime/project-runtime.generated.ts"
const generatedRuntime = (await import(generatedRuntimeSpecifier)) as GeneratedProjectRuntimeModule

export const {
  createGeneratedGraphRuntime,
  createGeneratedGraphRuntimePorts,
  GENERATED_GRAPH_RUNTIME_EXTENSION_IDS,
  GENERATED_GRAPH_RUNTIME_MODULE_IDS,
  GENERATED_GRAPH_RUNTIME_PLUGIN_IDS,
} = generatedRuntime

const TEST_DEPLOYMENT_VALUES = { DATABASE_URL: "postgres://test" }
const TEST_DOCUMENT_STORAGE = createLocalStorageProvider({
  name: "operator-test:documents",
  baseUrl: "test://documents/",
})
const TEST_DOCUMENT_RENDERER = {
  name: "operator-test-renderer",
  async resolveBackendIdentity() {
    return "operator-test-renderer"
  },
  async renderPdf() {
    return new Uint8Array([37, 80, 68, 70])
  },
}
const TEST_DOCUMENT_DATABASE = {
  transaction: async <T>(callback: (tx: { execute: () => Promise<void> }) => Promise<T>) =>
    callback({ execute: async () => undefined }),
} as unknown as PostgresJsDatabase

export function createGeneratedStaticTestDeploymentResources(
  providerPorts: Parameters<typeof createVoyantDeploymentResources>[0]["providerPorts"] = {},
) {
  const env = createVoyantNodeEnv(TEST_DEPLOYMENT_VALUES)
  const primitives = createVoyantNodeRuntimeHostPrimitives({
    env,
    deliverEvent: async () => undefined,
  })
  return createVoyantDeploymentResources({
    primitives,
    providerPorts,
    createRuntimePorts: createGeneratedGraphRuntimePorts,
  })
}

export async function createGeneratedTestDeploymentResources(
  runtime = createGeneratedGraphRuntime(),
) {
  const providers = await resolveSelectedGraphRuntimeProviders(runtime, TEST_DEPLOYMENT_VALUES, {
    resolveResource: (resource) => {
      if (resource.kind === "database") return TEST_DOCUMENT_DATABASE
      if (resource.kind === "document-storage") return TEST_DOCUMENT_STORAGE
      if (resource.kind === "document-renderer") return TEST_DOCUMENT_RENDERER
      return undefined
    },
  })
  const providerPorts = Object.fromEntries(
    await Promise.all(
      providers.selectedProviders.map(async ({ port }) => [
        port,
        await providers.getProvider(port),
      ]),
    ),
  )
  return {
    ...createGeneratedStaticTestDeploymentResources(providerPorts),
    runtime: await providers.activateRuntime(),
  }
}
