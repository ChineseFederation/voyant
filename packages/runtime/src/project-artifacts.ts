import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import type { LinkDefinition, VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantGraphRuntimePorts } from "@voyant-travel/framework"
import type { VoyantGraphRuntime } from "@voyant-travel/framework/deployment-artifacts"
import type {
  VoyantGraphDeploymentRequirements,
  VoyantGraphProvisionedJob,
} from "@voyant-travel/framework/deployment-graph"
import type { VoyantNodeRuntime } from "@voyant-travel/framework/node-runtime"

/**
 * Load `tsx` only when a TypeScript artifact actually has to be transpiled.
 *
 * These loaders read `*.generated.ts` straight from `.voyant/`, which is the
 * right thing for the CLI (`voyant start`, dev, tooling) where the artifacts
 * are source. A BUILT server never reaches them: `voyant build` emits
 * `.voyant/app/project-runtime.ts`, which pulls the same artifact through an
 * eager `import.meta.glob`, and passes the result as
 * `LoadVoyantProjectOptions.generatedProjectRuntime` — so the functions below
 * are skipped entirely.
 *
 * The import still has to be lazy. The operator's Vite config inlines
 * `@voyant-travel/*` from source, so a static `import ... from "tsx/esm/api"`
 * here is linked into `dist/server/server.js` whether or not it is ever
 * called — and `tsx` is a devDependency, which `pnpm deploy --prod` strips.
 * That combination is what stopped the production image from booting
 * (voyant#3994): it died at ESM link time on a module it would never execute.
 *
 * Keeping this dynamic states the real contract — transpilation is a
 * development capability, not something the shipped server is allowed to need.
 */
let tsImportLoad: Promise<typeof import("tsx/esm/api")["tsImport"]> | undefined
const loadTsImport = () => (tsImportLoad ??= import("tsx/esm/api").then((tsx) => tsx.tsImport))

const GENERATED_ARTIFACT_LAYOUTS = [".voyant", "dist/.voyant"] as const
const PROJECT_RUNTIME_ENTRY = "runtime/project-runtime.generated.ts"
const GRAPH_RUNTIME_ENTRY = "runtime/graph-runtime.generated.ts"
const PROJECT_LINKS_ENTRY = "runtime/project-links.generated.ts"
const PROJECT_GRAPH_ENTRY = "deployment-graph.generated.json"

export interface GeneratedProjectRuntime {
  kind: "application"
  graphHash: string
  deployment: {
    mode?: "local" | "managed-cloud" | "self-hosted"
    providers: VoyantNodeRuntime["deployment"]["providers"]
    responseCache?: VoyantNodeRuntime["deployment"]["responseCache"]
  }
  graphRuntime: VoyantGraphRuntime
  /** Recreate the fixed graph with boot-selected provider bindings. */
  createGraphRuntime?: (providerSelections: Readonly<Record<string, string>>) => VoyantGraphRuntime
  createRuntimePorts(host: {
    primitives: VoyantRuntimeHostPrimitives
    runtimePorts?: VoyantGraphRuntimePorts
  }): VoyantGraphRuntimePorts
}

export interface GeneratedScheduledJob {
  id: string
  cron: string
}

interface GeneratedProjectLinks {
  projectLinks?: readonly LinkDefinition[]
}

export async function resolveGeneratedArtifactRoot(projectRoot: string): Promise<string> {
  for (const layout of GENERATED_ARTIFACT_LAYOUTS) {
    const artifactRoot = path.join(projectRoot, layout)
    if (
      (await pathExists(path.join(artifactRoot, PROJECT_GRAPH_ENTRY))) &&
      ((await pathExists(path.join(artifactRoot, PROJECT_RUNTIME_ENTRY))) ||
        (await pathExists(path.join(artifactRoot, GRAPH_RUNTIME_ENTRY))))
    ) {
      return artifactRoot
    }
  }
  throw new Error(
    `Generated Voyant project artifacts were not found under ${GENERATED_ARTIFACT_LAYOUTS.join(" or ")}. Run voyant build first.`,
  )
}

export async function loadGeneratedProjectRuntime(
  artifactRoot: string,
): Promise<GeneratedProjectRuntime> {
  const entry = path.join(artifactRoot, PROJECT_RUNTIME_ENTRY)
  let generated: GeneratedProjectRuntime
  if (await pathExists(entry)) {
    const tsImport = await loadTsImport()
    const namespace = (await tsImport(pathToFileURL(entry).href, {
      parentURL: import.meta.url,
    })) as { createGeneratedProjectRuntime?: () => GeneratedProjectRuntime }
    if (typeof namespace.createGeneratedProjectRuntime !== "function") {
      throw new Error(`${PROJECT_RUNTIME_ENTRY} does not export createGeneratedProjectRuntime().`)
    }
    generated = namespace.createGeneratedProjectRuntime()
  } else {
    generated = await loadDeploymentGraphRuntime(artifactRoot)
  }
  if (generated.kind !== "application") {
    throw new Error(`${PROJECT_RUNTIME_ENTRY} is not a Voyant application runtime.`)
  }
  if (typeof generated.createRuntimePorts !== "function") {
    throw new Error(`${PROJECT_RUNTIME_ENTRY} does not expose static runtime port composition.`)
  }
  return generated
}

async function loadDeploymentGraphRuntime(artifactRoot: string): Promise<GeneratedProjectRuntime> {
  const entry = path.join(artifactRoot, GRAPH_RUNTIME_ENTRY)
  const tsImport = await loadTsImport()
  const namespace = (await tsImport(pathToFileURL(entry).href, {
    parentURL: import.meta.url,
  })) as {
    GENERATED_GRAPH_RUNTIME_HASH?: string
    createGeneratedGraphRuntime?: (
      providerSelections?: Readonly<Record<string, string>>,
    ) => GeneratedProjectRuntime["graphRuntime"]
    createGeneratedGraphRuntimePorts?: GeneratedProjectRuntime["createRuntimePorts"]
  }
  const graph = JSON.parse(
    await readFile(path.join(artifactRoot, PROJECT_GRAPH_ENTRY), "utf8"),
  ) as {
    deployment?: {
      mode?: GeneratedProjectRuntime["deployment"]["mode"]
      providers?: unknown
      responseCache?: GeneratedProjectRuntime["deployment"]["responseCache"]
    }
  }
  if (
    typeof namespace.GENERATED_GRAPH_RUNTIME_HASH !== "string" ||
    typeof namespace.createGeneratedGraphRuntime !== "function" ||
    typeof namespace.createGeneratedGraphRuntimePorts !== "function" ||
    !graph.deployment ||
    !graph.deployment.providers ||
    typeof graph.deployment.providers !== "object"
  ) {
    throw new Error("Generated deployment graph runtime is missing or invalid.")
  }
  const providers = graph.deployment.providers as Record<string, string>
  return {
    kind: "application",
    graphHash: namespace.GENERATED_GRAPH_RUNTIME_HASH,
    deployment: {
      mode: graph.deployment.mode,
      providers: { ...providers },
      ...(graph.deployment.responseCache
        ? { responseCache: { ...graph.deployment.responseCache } }
        : {}),
    },
    graphRuntime: namespace.createGeneratedGraphRuntime(),
    createGraphRuntime: (providerSelections) =>
      namespace.createGeneratedGraphRuntime!(providerSelections),
    createRuntimePorts: namespace.createGeneratedGraphRuntimePorts,
  }
}

export async function readGeneratedDeploymentGraph(
  artifactRoot: string,
  runtime: GeneratedProjectRuntime,
): Promise<{
  requirements: VoyantGraphDeploymentRequirements
  jobs: readonly VoyantGraphProvisionedJob[]
  scheduledJobs: readonly GeneratedScheduledJob[]
}> {
  const graph = JSON.parse(
    await readFile(path.join(artifactRoot, PROJECT_GRAPH_ENTRY), "utf8"),
  ) as {
    contentHash?: unknown
    requirements?: unknown
    provisioning?: { jobs?: unknown; scheduledJobs?: unknown }
  }
  if (graph.contentHash !== runtime.graphHash) {
    throw new Error("Generated project runtime and deployment graph hashes do not match.")
  }
  if (
    !graph.requirements ||
    typeof graph.requirements !== "object" ||
    !("resources" in graph.requirements) ||
    !Array.isArray(graph.requirements.resources)
  ) {
    throw new Error("Generated deployment graph requirements are missing or invalid.")
  }
  return {
    requirements: graph.requirements as VoyantGraphDeploymentRequirements,
    jobs: Array.isArray(graph.provisioning?.jobs)
      ? (graph.provisioning.jobs as VoyantGraphProvisionedJob[])
      : [],
    scheduledJobs: Array.isArray(graph.provisioning?.scheduledJobs)
      ? (graph.provisioning.scheduledJobs as GeneratedScheduledJob[])
      : [],
  }
}

export async function loadGeneratedProjectLinks(artifactRoot: string) {
  const entry = path.join(artifactRoot, PROJECT_LINKS_ENTRY)
  try {
    const tsImport = await loadTsImport()
    const namespace = (await tsImport(pathToFileURL(entry).href, {
      parentURL: import.meta.url,
    })) as GeneratedProjectLinks
    return namespace.projectLinks ?? []
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

export async function resolveAdminAssetsDir(
  projectRoot: string,
  artifactRoot: string,
  explicit?: string,
  preferBuiltAssets = false,
): Promise<string> {
  if (explicit) return path.resolve(explicit)
  const sourceArtifactRoot = path.join(projectRoot, ".voyant")
  const builtArtifactRoot = path.join(projectRoot, "dist/.voyant")
  const builtClientDir = path.join(projectRoot, "dist/client")
  if (artifactRoot === builtArtifactRoot) return builtClientDir
  if (
    preferBuiltAssets &&
    artifactRoot === sourceArtifactRoot &&
    (await pathExists(builtClientDir)) &&
    (await generatedArtifactGraphsMatch(sourceArtifactRoot, builtArtifactRoot))
  ) {
    return builtClientDir
  }
  return path.join(artifactRoot, "admin/client")
}

async function generatedArtifactGraphsMatch(
  sourceArtifactRoot: string,
  builtArtifactRoot: string,
): Promise<boolean> {
  const [sourceHash, builtHash] = await Promise.all([
    readGeneratedArtifactGraphHash(sourceArtifactRoot),
    readGeneratedArtifactGraphHash(builtArtifactRoot),
  ])
  return sourceHash !== undefined && sourceHash === builtHash
}

async function readGeneratedArtifactGraphHash(artifactRoot: string): Promise<string | undefined> {
  try {
    const graph = JSON.parse(
      await readFile(path.join(artifactRoot, PROJECT_GRAPH_ENTRY), "utf8"),
    ) as { contentHash?: unknown }
    return typeof graph.contentHash === "string" ? graph.contentHash : undefined
  } catch {
    return undefined
  }
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}
