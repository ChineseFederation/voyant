import path from "node:path"

import * as frameworkProject from "@voyant-travel/framework/project"

import {
  defineDeployment,
  type ResolvedVoyantGraphUnit,
  resolveDeploymentGraph,
  resolveDeploymentGraphWithPackageManifests,
  VOYANT_GRAPH_PACKAGE_SCHEMA_VERSION,
  type VoyantGraphAdmissionPolicy,
  type VoyantGraphDeployment,
  type VoyantGraphPackageRecord,
  type VoyantGraphProject,
  type VoyantGraphRuntimeTarget,
  type VoyantGraphUnitManifest,
} from "../../packages/framework/src/deployment-graph.ts"
import type { VoyantDeploymentProviders } from "../../packages/framework/src/deployment-types.ts"
import {
  inferredNodeRuntimePackageMetadata,
  type ResolvedProjectArtifacts,
  runtimeReferencePackageNames,
} from "../../packages/framework/src/project-resolver.ts"
import { readPnpmLockfilePackageRecords } from "./deployment-graph-provenance.mjs"
import { loadVoyantPackageManifests } from "./load-voyant-package-manifests.ts"

export interface OperatorAuthoredProject extends VoyantGraphProject {
  deployment: {
    target: VoyantGraphRuntimeTarget
    mode: "local" | "managed-cloud" | "self-hosted"
    providers: VoyantDeploymentProviders
    migrations?: NonNullable<VoyantGraphProject["deployment"]>["migrations"]
  }
}

export interface ResolvedOperatorProject {
  project: VoyantGraphProject
  deployment: Omit<VoyantGraphDeployment, "project">
  artifacts: ResolvedProjectArtifacts
}

interface ResolveOperatorDeploymentGraphOptions {
  project: OperatorAuthoredProject
  projectRoot: string
  repoRoot: string
  frameworkVersion: string
}

export const OPERATOR_GRAPH_ADMISSION_POLICY = {
  allowedSourceKinds: ["file", "registry", "workspace"],
} as const satisfies VoyantGraphAdmissionPolicy

const OPERATOR_GRAPH_COMPATIBILITY = {
  framework: ">=0.26.0",
  targets: ["node", "cloudflare-worker"],
  modes: ["local", "managed-cloud", "self-hosted"],
} as const

const OPERATOR_PACKAGE_RECORD_IMPORTERS = [
  "apps/operator",
  "packages/operator-standard",
  "packages/framework",
] as const

const OPERATOR_LOCAL_PACKAGE_RECORDS = [
  {
    packageName: "operator",
    source: {
      kind: "file",
      reference: ".",
    },
    metadata: {
      schemaVersion: VOYANT_GRAPH_PACKAGE_SCHEMA_VERSION,
      kind: "module",
      compatibleWith: OPERATOR_GRAPH_COMPATIBILITY,
    },
  },
] as const satisfies readonly VoyantGraphPackageRecord[]

export function withOperatorDeploymentLocalPackageRecords(
  records: readonly VoyantGraphPackageRecord[],
): VoyantGraphPackageRecord[] {
  const byPackageName = new Map(records.map((record) => [record.packageName, record]))
  for (const record of OPERATOR_LOCAL_PACKAGE_RECORDS) {
    if (byPackageName.has(record.packageName)) byPackageName.set(record.packageName, record)
  }
  return [...byPackageName.values()].sort((left, right) =>
    left.packageName.localeCompare(right.packageName),
  )
}

export function withOperatorHostPackageCompatibility(
  records: readonly VoyantGraphPackageRecord[],
): VoyantGraphPackageRecord[] {
  return records.map((record) =>
    record.metadata
      ? {
          ...record,
          metadata: {
            ...record.metadata,
            compatibleWith: {
              ...record.metadata.compatibleWith,
              targets: ["node", "cloudflare-worker"],
            },
          },
        }
      : record,
  )
}

/** Resolve the one authored operator config, then admit and load package manifests. */
export async function resolveOperatorDeploymentGraph(
  options: ResolveOperatorDeploymentGraphOptions,
) {
  const resolved = await resolveOperatorProject(options.project, options.projectRoot)
  const graphInput = {
    project: resolved.project,
    deployment: resolved.deployment,
    frameworkVersion: options.frameworkVersion,
    target: resolved.deployment.target,
    mode: resolved.deployment.mode,
    admission: OPERATOR_GRAPH_ADMISSION_POLICY,
  } as const
  const discoveredGraph = await resolveDeploymentGraph(graphInput)
  const selectedPackageRecords = withOperatorHostPackageCompatibility(
    withOperatorDeploymentLocalPackageRecords(
      readPnpmLockfilePackageRecords({
        repoRoot: options.repoRoot,
        projectRoot: options.projectRoot,
        importerPaths: OPERATOR_PACKAGE_RECORD_IMPORTERS,
        packageNames: [
          "@voyant-travel/framework",
          "@voyant-travel/framework-migrations",
          ...discoveredGraph.packageRecords.map((record) => record.packageName),
        ],
      }),
    ),
  )
  const manifestedGraph = await resolveDeploymentGraphWithPackageManifests({
    ...graphInput,
    packageRecords: selectedPackageRecords,
    loadPackageManifests: (record) =>
      loadVoyantPackageManifests(record, {
        projectRoot: options.projectRoot,
        repoRoot: options.repoRoot,
      }),
  })
  const referencedPackageNames = runtimeReferencePackageNames([
    ...manifestedGraph.modules,
    ...manifestedGraph.extensions,
    ...manifestedGraph.plugins,
    ...(manifestedGraph.adapters ?? []),
    ...(manifestedGraph.providers ?? []),
  ])
  const packageRecords = withOperatorHostPackageCompatibility(
    withInferredRuntimePackageMetadata(
      withOperatorDeploymentLocalPackageRecords(
        readPnpmLockfilePackageRecords({
          repoRoot: options.repoRoot,
          projectRoot: options.projectRoot,
          importerPaths: OPERATOR_PACKAGE_RECORD_IMPORTERS,
          packageNames: [
            ...manifestedGraph.packageRecords.map((record) => record.packageName),
            ...referencedPackageNames,
          ],
        }),
      ),
      referencedPackageNames,
    ),
  )
  const graph = await resolveDeploymentGraphWithPackageManifests({
    ...graphInput,
    packageRecords,
    loadPackageManifests: (record) =>
      loadVoyantPackageManifests(record, {
        projectRoot: options.projectRoot,
        repoRoot: options.repoRoot,
      }),
  })

  return { ...resolved, graph }
}

function withInferredRuntimePackageMetadata(
  records: readonly VoyantGraphPackageRecord[],
  runtimePackageNames: readonly string[],
): VoyantGraphPackageRecord[] {
  const runtimePackages = new Set(runtimePackageNames)
  return records.map((record) =>
    runtimePackages.has(record.packageName) && !record.metadata
      ? { ...record, metadata: inferredNodeRuntimePackageMetadata() }
      : record,
  )
}

async function resolveOperatorProject(
  project: OperatorAuthoredProject,
  projectRoot: string,
): Promise<ResolvedOperatorProject> {
  return normalizeFrameworkResolution(
    await frameworkProject.resolveProject({
      project,
      projectRoot,
      configPath: path.join(projectRoot, "voyant.config.ts"),
    }),
    project,
  )
}

function normalizeFrameworkResolution(
  value: unknown,
  authored: OperatorAuthoredProject,
): ResolvedOperatorProject {
  if (!value || typeof value !== "object") {
    throw new Error("resolveProject must return a resolved project/deployment object")
  }
  const record = value as Record<string, unknown>
  const project = isGraphProject(record.project)
    ? record.project
    : isGraphProject(value)
      ? value
      : isResolvedGraph(record.graph)
        ? projectFromResolvedGraph(record.graph, authored)
        : undefined
  if (!project) throw new Error("resolveProject did not return a resolved project")

  const deploymentValue =
    record.deployment && typeof record.deployment === "object"
      ? (record.deployment as Record<string, unknown>)
      : record
  const mode = deploymentMode(deploymentValue.mode) ?? authored.deployment.mode
  const providers = stringRecord(deploymentValue.providers) ?? authored.deployment.providers

  return {
    project,
    deployment: deploymentFromSettings(project, { mode, providers }),
    artifacts: requireResolvedProjectArtifacts(record.artifacts),
  }
}

function requireResolvedProjectArtifacts(value: unknown): ResolvedProjectArtifacts {
  if (!value || typeof value !== "object") {
    throw new Error("resolveProject did not return generated project artifacts")
  }
  const artifacts = value as Partial<ResolvedProjectArtifacts>
  if (
    typeof artifacts.runtimeEntry !== "string" ||
    typeof artifacts.migrationRunner !== "string" ||
    !Array.isArray(artifacts.files) ||
    !artifacts.migrationPlan
  ) {
    throw new Error("resolveProject returned an invalid generated project artifact contract")
  }
  return artifacts as ResolvedProjectArtifacts
}

function projectFromResolvedGraph(
  graph: {
    modules: readonly ResolvedVoyantGraphUnit[]
    extensions: readonly ResolvedVoyantGraphUnit[]
    plugins: readonly ResolvedVoyantGraphUnit[]
    adapters?: readonly ResolvedVoyantGraphUnit[]
    providers?: readonly ResolvedVoyantGraphUnit[]
  },
  authored: OperatorAuthoredProject,
): VoyantGraphProject {
  return {
    schemaVersion: "voyant.project.v1",
    modules: graph.modules.map((unit) => manifestFromResolvedUnit(unit, "voyant.module.v1")),
    extensions: graph.extensions.map((unit) =>
      manifestFromResolvedUnit(unit, "voyant.extension.v1"),
    ),
    plugins: graph.plugins.map((unit) => manifestFromResolvedUnit(unit, "voyant.plugin.v1")),
    adapters: (graph.adapters ?? []).map((unit) =>
      manifestFromResolvedUnit(unit, "voyant.adapter.v1"),
    ),
    providers: (graph.providers ?? []).map((unit) =>
      manifestFromResolvedUnit(unit, "voyant.provider.v1"),
    ),
    ...(authored.access ? { access: authored.access } : {}),
    deployment: authored.deployment,
  }
}

function manifestFromResolvedUnit(
  unit: ResolvedVoyantGraphUnit,
  schemaVersion: VoyantGraphUnitManifest["schemaVersion"],
): VoyantGraphUnitManifest {
  return {
    schemaVersion,
    id: unit.id,
    packageName: unit.packageName,
    ...(unit.localId ? { localId: unit.localId } : {}),
    ...(unit.runtime ? { runtime: unit.runtime } : {}),
    provides: unit.provides,
    requires: unit.requires,
    api: unit.api,
    schema: unit.schema,
    migrations: unit.migrations,
    links: unit.links,
    subscribers: unit.subscribers,
    events: unit.events,
    ...(unit.setupMigrations ? { setupMigrations: unit.setupMigrations } : {}),
    ...(unit.config ? { config: unit.config } : {}),
    ...(unit.secrets ? { secrets: unit.secrets } : {}),
    ...(unit.resources ? { resources: unit.resources } : {}),
    ...(unit.providers ? { providers: unit.providers } : {}),
    ...(unit.access ? { access: unit.access } : {}),
    ...(unit.admin ? { admin: unit.admin } : {}),
    ...(unit.tools ? { tools: unit.tools } : {}),
    ...(unit.webhooks ? { webhooks: unit.webhooks } : {}),
    ...(unit.actions ? { actions: unit.actions } : {}),
    ...(unit.lifecycle ? { lifecycle: unit.lifecycle } : {}),
  }
}

function deploymentFromSettings(
  project: VoyantGraphProject,
  settings: Pick<OperatorAuthoredProject["deployment"], "mode" | "providers">,
): Omit<VoyantGraphDeployment, "project"> {
  const { project: _project, ...deployment } = defineDeployment({
    project,
    target: "node",
    mode: settings.mode,
    providers: settings.providers,
    ...(project.deployment?.migrations?.length
      ? { migrations: project.deployment.migrations }
      : {}),
  })
  return {
    ...deployment,
  }
}

function isGraphProject(value: unknown): value is VoyantGraphProject {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return (
    record.schemaVersion === "voyant.project.v1" &&
    Array.isArray(record.modules) &&
    Array.isArray(record.extensions) &&
    Array.isArray(record.plugins)
  )
}

function isResolvedGraph(value: unknown): value is {
  modules: readonly ResolvedVoyantGraphUnit[]
  extensions: readonly ResolvedVoyantGraphUnit[]
  plugins: readonly ResolvedVoyantGraphUnit[]
  adapters?: readonly ResolvedVoyantGraphUnit[]
  providers?: readonly ResolvedVoyantGraphUnit[]
} {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return Boolean(
    record.project &&
      Array.isArray(record.modules) &&
      Array.isArray(record.extensions) &&
      Array.isArray(record.plugins),
  )
}

function deploymentMode(value: unknown): OperatorAuthoredProject["deployment"]["mode"] | undefined {
  return value === "local" || value === "managed-cloud" || value === "self-hosted"
    ? value
    : undefined
}

function stringRecord(value: unknown): VoyantDeploymentProviders | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const entries = Object.entries(value)
  return entries.every((entry): entry is [string, string] => typeof entry[1] === "string")
    ? (Object.fromEntries(entries) as VoyantDeploymentProviders)
    : undefined
}
