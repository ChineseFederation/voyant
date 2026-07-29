// agent-quality: file-size exception -- reason: the v1 project resolver keeps package metadata admission, package export safety, local runtime lowering, and the exact CLI artifact contract in one reviewable boundary until the contract stabilizes.
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  VoyantGraphCapabilityDeclaration,
  VoyantGraphProject,
  VoyantGraphProjectSelection,
  VoyantGraphUnitKind,
  VoyantGraphUnitManifest,
} from "@voyant-travel/core/project"
import {
  buildGraphAccessCatalogModule,
  buildGraphAdminBundleDeclarationModule,
  buildGraphAdminBundleModule,
  buildGraphPresentationBundleDeclarationModule,
  buildGraphPresentationBundleModule,
  buildProjectRuntimeModule,
  createResolvedGraphRuntime,
} from "./deployment-artifacts.js"
import {
  deriveDeploymentRequirements,
  packageNameFromSpecifier,
  type ResolvedVoyantDeploymentGraph,
  type ResolvedVoyantGraphUnit,
  resolveDeploymentGraphWithPackageManifests,
  type VoyantGraphPackageMetadata,
  type VoyantGraphPackageRecord,
} from "./deployment-graph.js"
import { compileProjectAdminConventions } from "./project-admin-conventions.js"
import {
  compileProjectApiConventions,
  PROJECT_API_GENERATED_PATH,
  type ProjectApiConventionCompilation,
} from "./project-api-conventions.js"
import {
  VOYANT_PROJECT_ACCESS_CATALOG_ENTRY,
  VOYANT_PROJECT_ADMIN_BUNDLE_ENTRY,
  VOYANT_PROJECT_ADMIN_BUNDLE_TYPES_ENTRY,
  VOYANT_PROJECT_PRESENTATION_BUNDLE_ENTRY,
  VOYANT_PROJECT_PRESENTATION_BUNDLE_TYPES_ENTRY,
  VOYANT_PROJECT_PRODUCT_BOM_ENTRY,
} from "./project-artifact-paths.js"
import {
  discoverProjectConventions,
  type ProjectConventionDiscovery,
  type ProjectConventionFileContribution,
} from "./project-conventions.js"
import {
  compileProjectSubscriberLinkConventions,
  generateSelectedLinksSource,
  PROJECT_LINKS_GENERATED_PATH,
  PROJECT_SUBSCRIBERS_GENERATED_PATH,
  type ProjectSubscriberLinkConventionCompilation,
} from "./project-subscriber-link-conventions.js"

export const VOYANT_MIGRATION_PLAN_SCHEMA_VERSION = "voyant.migration-plan.v1" as const
export const VOYANT_PROJECT_RUNTIME_ENTRY = "runtime/project-runtime.generated.ts" as const
export const VOYANT_PROJECT_MIGRATION_RUNNER = "runtime/project-migrations.generated.mjs" as const

export interface ResolveProjectInput {
  project: unknown
  projectRoot: string
  configPath: string
}

export interface FrameworkGeneratedProjectFile {
  path: string
  contents: string
}

export interface VoyantProjectSchemaMigration {
  id: string
  migrationKind: "schema"
  order: number
  idempotencyKey: string
  owner: string
  packageName?: string
  source:
    | {
        kind: "package"
        packageName: string
        path: string
      }
    | {
        kind: "deployment"
        path: string
      }
}

export interface VoyantProjectSetupMigration {
  id: string
  migrationKind: "setup"
  order: number
  idempotencyKey: string
  owner: string
  packageName: string
  source: string
  runtime: { entry: string; export: string }
  dependsOn: readonly string[]
}

export type VoyantProjectMigration = VoyantProjectSchemaMigration | VoyantProjectSetupMigration

export interface VoyantProjectMigrationPlan {
  schemaVersion: typeof VOYANT_MIGRATION_PLAN_SCHEMA_VERSION
  contentHash: string
  migrations: readonly VoyantProjectMigration[]
}

export interface ResolvedProjectArtifacts {
  runtimeEntry: string
  migrationRunner: string
  files: readonly FrameworkGeneratedProjectFile[]
  migrationPlan: VoyantProjectMigrationPlan
}

export type ResolvedVoyantProjectGraph = Omit<ResolvedVoyantDeploymentGraph, "deployment"> & {
  deployment: Omit<ResolvedVoyantDeploymentGraph["deployment"], "target"> & { target?: never }
}

export interface ResolvedVoyantProject {
  graph: ResolvedVoyantProjectGraph
  runtime: import("./runtime-lowering.js").VoyantGraphRuntime
  artifacts: ResolvedProjectArtifacts
  conventions: ProjectConventionDiscovery
}

interface InspectedPackage {
  directory: string
  record: VoyantGraphPackageRecord
}

interface MaterializedProject {
  project: VoyantGraphProject
  packages: Map<string, InspectedPackage>
  resolutionRoots: readonly string[]
}

interface PackageJson {
  name?: unknown
  version?: unknown
  exports?: unknown
  voyant?: unknown
}

/** Resolve a config-authored project through admitted package-owned manifests. */
export async function resolveProject(input: ResolveProjectInput): Promise<ResolvedVoyantProject> {
  const project = requireProject(input.project)
  if (project.deployment?.target !== undefined && project.deployment.target !== "node") {
    throw new Error(
      `resolveProject: unified application deployment target must be node, got ${String(project.deployment.target)}.`,
    )
  }
  const projectRoot = path.resolve(requireNonEmptyString(input.projectRoot, "projectRoot"))
  const configPath = path.resolve(requireNonEmptyString(input.configPath, "configPath"))
  assertPathInside(projectRoot, configPath, "configPath")
  const conventions = await discoverProjectConventions({ projectRoot })
  assertProjectConventionDiagnostics(conventions)
  // Published/source-free applications have no project-local contributions.
  // Reusing this snapshot lets every compiler emit its deterministic empty
  // artifact without loading the TypeScript compiler in production.
  const [projectApi, projectAdmin, projectSubscriberLinks] = await Promise.all([
    compileProjectApiConventions({ projectRoot, discovery: conventions }),
    compileProjectAdminConventions({
      projectRoot,
      contributions: conventions.contributions,
    }),
    compileProjectSubscriberLinkConventions({ projectRoot, discovery: conventions }),
  ])

  const materialized = await materializeProjectSelections(project, projectRoot)
  await materializeProjectModuleConventions(materialized, conventions, projectRoot)
  await materializeProjectApiConventions(materialized, projectApi, projectRoot)
  await materializeProjectSubscriberLinkConventions(
    materialized,
    projectSubscriberLinks,
    projectRoot,
  )
  const providers = { ...(project.deployment?.providers ?? {}) }
  const mode = project.deployment?.mode
  const frameworkVersion = await readFrameworkVersion()
  const resolveGraph = () =>
    resolveDeploymentGraphWithPackageManifests({
      project: materialized.project,
      deployment: {
        providers,
        ...(project.deployment?.migrations?.length
          ? { migrations: project.deployment.migrations }
          : {}),
        ...(mode ? { mode } : {}),
        requirements: deriveDeploymentRequirements(providers),
      },
      packageRecords: [...materialized.packages.values()].map(({ record }) => record),
      frameworkVersion,
      loadPackageManifests: (record) => loadAdmittedPackageManifests(record, materialized.packages),
    })
  let graph = await resolveGraph()
  const packageCount = materialized.packages.size
  await materializeRuntimeReferencePackages(
    graph,
    projectRoot,
    materialized.resolutionRoots,
    materialized.packages,
  )
  if (materialized.packages.size !== packageCount) graph = await resolveGraph()
  const targetNeutralGraph = requireTargetNeutralGraph(graph)
  const projectLinkIds = new Set(projectSubscriberLinks.graphLinks.map((link) => link.id))
  const selectedLinks = [
    ...targetNeutralGraph.modules,
    ...targetNeutralGraph.extensions,
    ...targetNeutralGraph.plugins,
    ...targetNeutralGraph.adapters,
    ...targetNeutralGraph.providers,
  ]
    .flatMap((unit) => unit.links)
    .filter(
      (link): link is Required<Pick<typeof link, "id" | "kind" | "source" | "export">> =>
        link.kind === "definition" &&
        !projectLinkIds.has(link.id) &&
        typeof link.source === "string" &&
        typeof link.export === "string",
    )
  const runtimeEntry = VOYANT_PROJECT_RUNTIME_ENTRY
  const migrationRunner = VOYANT_PROJECT_MIGRATION_RUNNER
  const migrationPlan = buildMigrationPlan(targetNeutralGraph)
  const runtimeEntryOverrides = await buildLocalRuntimeEntryOverrides(
    targetNeutralGraph,
    materialized.packages,
    projectRoot,
    runtimeEntry,
    selectedLinks.map((link) => link.source),
  )
  const subscriberLinkFiles = projectSubscriberLinks.generatedFiles.map((file) =>
    file.path === PROJECT_LINKS_GENERATED_PATH
      ? {
          ...file,
          contents: generateSelectedLinksSource(
            projectSubscriberLinks.links,
            selectedLinks,
            runtimeEntryOverrides,
          ),
        }
      : file,
  )
  const files: FrameworkGeneratedProjectFile[] = [
    ...(targetNeutralGraph.project.productBom
      ? [
          {
            path: VOYANT_PROJECT_PRODUCT_BOM_ENTRY,
            contents: buildProductBomExpansionArtifact(targetNeutralGraph),
          },
        ]
      : []),
    projectApi.generatedFile,
    projectAdmin.file,
    {
      path: VOYANT_PROJECT_ACCESS_CATALOG_ENTRY,
      contents: buildGraphAccessCatalogModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
      }),
    },
    {
      path: VOYANT_PROJECT_ADMIN_BUNDLE_ENTRY,
      contents: buildGraphAdminBundleModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
        runtimeEntryOverrides,
      }),
    },
    {
      path: VOYANT_PROJECT_ADMIN_BUNDLE_TYPES_ENTRY,
      contents: buildGraphAdminBundleDeclarationModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
      }),
    },
    {
      path: VOYANT_PROJECT_PRESENTATION_BUNDLE_ENTRY,
      contents: buildGraphPresentationBundleModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
        runtimeEntryOverrides,
      }),
    },
    {
      path: VOYANT_PROJECT_PRESENTATION_BUNDLE_TYPES_ENTRY,
      contents: buildGraphPresentationBundleDeclarationModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
      }),
    },
    ...subscriberLinkFiles,
    {
      path: runtimeEntry,
      contents: buildProjectRuntimeModule({
        graph: targetNeutralGraph,
        command: "voyant project resolve",
        runtimeEntryOverrides,
      }),
    },
    {
      path: migrationRunner,
      contents: buildProjectMigrationRunnerModule({
        migrationPlan,
        runtimeEntryOverrides,
      }),
    },
  ]

  const runtimeDirectory = path.dirname(path.join(projectRoot, ".voyant", runtimeEntry))
  const runtime = createResolvedGraphRuntime({
    graph: targetNeutralGraph,
    runtimeEntryOverrides,
    runtimeImportBaseUrl: pathToFileURL(`${runtimeDirectory}${path.sep}`).href,
  })
  const resolved: ResolvedVoyantProject = {
    graph: targetNeutralGraph,
    runtime,
    conventions,
    artifacts: {
      runtimeEntry,
      migrationRunner,
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
      migrationPlan,
    },
  }
  Object.defineProperty(resolved, "runtime", {
    enumerable: false,
    value: runtime,
  })
  return resolved
}

function buildProductBomExpansionArtifact(graph: ResolvedVoyantProjectGraph): string {
  return `${JSON.stringify(
    {
      schemaVersion: "voyant.product-bom-expansion.v1",
      productBom: graph.project.productBom,
      graph: {
        contentHash: graph.contentHash,
        deploymentTarget: "node",
        modules: graph.modules.map(({ id }) => id),
        extensions: graph.extensions.map(({ id }) => id),
        plugins: graph.plugins.map(({ id }) => id),
        adapters: graph.adapters.map(({ id }) => id),
        providers: graph.providers.map(({ id }) => id),
        presentations: allResolvedGraphUnits(graph)
          .flatMap((unit) => unit.presentations ?? [])
          .map(({ id }) => id)
          .sort(),
      },
    },
    null,
    2,
  )}\n`
}

async function materializeProjectSubscriberLinkConventions(
  materialized: MaterializedProject,
  compilation: ProjectSubscriberLinkConventionCompilation,
  projectRoot: string,
): Promise<void> {
  if (compilation.graphSubscribers.length === 0 && compilation.graphLinks.length === 0) return
  const packageName = await admitProjectSourcePackage(materialized, projectRoot)
  materialized.project = {
    ...materialized.project,
    modules: [
      ...materialized.project.modules,
      {
        schemaVersion: "voyant.module.v1",
        id: graphIdForSelection(packageName, `${packageName}#project-subscribers-links`),
        packageName,
        localId: "project-subscribers-links",
        subscribers: compilation.graphSubscribers,
        links: compilation.graphLinks,
        meta: {
          source: "project-convention",
          generatedPaths: [PROJECT_SUBSCRIBERS_GENERATED_PATH, PROJECT_LINKS_GENERATED_PATH],
        },
      },
    ],
  }
}

async function materializeProjectApiConventions(
  materialized: MaterializedProject,
  compilation: ProjectApiConventionCompilation,
  projectRoot: string,
): Promise<void> {
  if (compilation.graphRoutes.length === 0) return
  const packageName = await admitProjectSourcePackage(materialized, projectRoot)
  const generatedRuntime = `./.voyant/${PROJECT_API_GENERATED_PATH}`
  materialized.project = {
    ...materialized.project,
    modules: [
      ...materialized.project.modules,
      {
        schemaVersion: "voyant.module.v1",
        id: graphIdForSelection(packageName, `${packageName}#project-api`),
        packageName,
        localId: "project-api",
        api: compilation.graphRoutes.map((route) => ({
          ...route,
          runtime: { entry: generatedRuntime, export: "projectApiModule" },
        })),
        meta: {
          source: "project-convention",
          generatedPath: PROJECT_API_GENERATED_PATH,
        },
      },
    ],
  }
}

function assertProjectConventionDiagnostics(discovery: ProjectConventionDiscovery): void {
  if (discovery.diagnostics.length === 0) return
  throw new Error(
    `resolveProject: project convention discovery produced ${discovery.diagnostics.length} error diagnostic(s):\n${discovery.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("\n")}`,
  )
}

async function materializeProjectModuleConventions(
  materialized: MaterializedProject,
  discovery: ProjectConventionDiscovery,
  projectRoot: string,
): Promise<void> {
  const runtimeUnits = discovery.contributions.filter(
    (contribution): contribution is ProjectConventionFileContribution =>
      contribution.kind === "module" || contribution.kind === "extension",
  )
  if (runtimeUnits.length === 0) return
  const packageName = await admitProjectSourcePackage(materialized, projectRoot)
  materialized.project = {
    ...materialized.project,
    modules: [
      ...materialized.project.modules,
      ...runtimeUnits
        .filter(({ kind }) => kind === "module")
        .map((unit) => syntheticProjectRuntimeUnit(packageName, unit)),
    ],
    extensions: [
      ...(materialized.project.extensions ?? []),
      ...runtimeUnits
        .filter(({ kind }) => kind === "extension")
        .map((unit) => syntheticProjectRuntimeUnit(packageName, unit)),
    ],
  }
}

async function admitProjectSourcePackage(
  materialized: MaterializedProject,
  projectRoot: string,
): Promise<string> {
  const packageJson = await readPackageJson(projectRoot)
  const packageName = requirePackageName(packageJson, projectRoot)
  const previous = materialized.packages.get(packageName)
  if (previous && previous.directory !== projectRoot) {
    throw new Error(`resolveProject: package ${packageName} resolves from more than one source.`)
  }
  if (!previous) {
    materialized.packages.set(packageName, {
      directory: projectRoot,
      record: {
        packageName,
        ...(typeof packageJson.version === "string" ? { version: packageJson.version } : {}),
        source: { kind: "file", reference: "." },
        metadata: { ...inferredNodeRuntimePackageMetadata(), kind: "module" },
      },
    })
  }
  return packageName
}

function syntheticProjectRuntimeUnit(
  packageName: string,
  contribution: ProjectConventionFileContribution,
): VoyantGraphUnitManifest {
  const name = path.basename(path.dirname(contribution.sourcePath))
  return {
    schemaVersion: contribution.kind === "extension" ? "voyant.extension.v1" : "voyant.module.v1",
    id: graphIdForSelection(packageName, `${packageName}#${name}`),
    packageName,
    localId: name,
    runtime: { entry: `./${contribution.sourcePath}`, export: "default" },
    meta: {
      conventionId: contribution.id,
      source: "project-convention",
      sourcePath: contribution.sourcePath,
    },
  }
}

interface RuntimePackageReference {
  ownerPackageName: string
  entry: string
}

/** Return the external package closure used by generated runtime facet importers. */
export function runtimeReferencePackageNames(units: readonly ResolvedVoyantGraphUnit[]): string[] {
  return [...new Set(runtimePackageReferences(units).map(runtimeReferencePackageName))].sort()
}

/** Metadata inferred after a package export is proven loadable by the Node resolver. */
export function inferredNodeRuntimePackageMetadata(): VoyantGraphPackageMetadata {
  return {
    schemaVersion: "voyant.package.v1",
    kind: "library",
    compatibleWith: {
      framework: "*",
      targets: ["node"],
      modes: ["local", "managed-cloud", "self-hosted"],
    },
  }
}

async function materializeRuntimeReferencePackages(
  graph: ResolvedVoyantDeploymentGraph,
  projectRoot: string,
  resolutionRoots: readonly string[],
  packages: Map<string, InspectedPackage>,
): Promise<void> {
  for (const reference of runtimePackageReferences([
    ...graph.modules,
    ...graph.extensions,
    ...graph.plugins,
    ...graph.adapters,
    ...graph.providers,
  ])) {
    const packageName = runtimeReferencePackageName(reference)
    let inspected = packages.get(packageName)
    if (!inspected) {
      inspected = await inspectRuntimePackage(packageName, resolutionRoots)
      packages.set(packageName, inspected)
    }
    if (isProjectSourceRuntimeReference(reference, inspected, projectRoot)) continue
    const packageJson = await readPackageJson(inspected.directory)
    assertRuntimeExport(packageJson.exports, reference, packageName)
  }
}

function runtimePackageReferences(
  units: readonly ResolvedVoyantGraphUnit[],
): RuntimePackageReference[] {
  const references: RuntimePackageReference[] = []
  const add = (unit: ResolvedVoyantGraphUnit, runtime?: { entry: string }) => {
    if (runtime) references.push({ ownerPackageName: unit.packageName, entry: runtime.entry })
  }

  for (const unit of units) {
    add(unit, unit.runtime)
    for (const route of unit.api) add(unit, route.runtime)
    for (const config of unit.config ?? []) add(unit, config.validator)
    for (const secret of unit.secrets ?? []) add(unit, secret.validator)
    for (const provider of unit.providers ?? []) add(unit, provider.runtime)
    add(unit, unit.admin?.runtime)
    for (const copy of unit.admin?.copy ?? []) add(unit, copy.runtime)
    for (const route of unit.admin?.routes ?? []) add(unit, route.runtime)
    for (const contribution of unit.admin?.contributions ?? []) add(unit, contribution.runtime)
    for (const presentation of unit.presentations ?? []) add(unit, presentation.runtime)
    for (const tool of unit.tools ?? []) add(unit, tool.runtime)
    for (const migration of unit.setupMigrations ?? []) add(unit, migration.runtime)
    for (const job of unit.jobs) add(unit, job.runtime)
    for (const subscriber of unit.subscribers) add(unit, subscriber.runtime)
  }

  return references.sort(
    (left, right) =>
      runtimeReferencePackageName(left).localeCompare(runtimeReferencePackageName(right)) ||
      left.entry.localeCompare(right.entry),
  )
}

function runtimeReferencePackageName(reference: RuntimePackageReference): string {
  return reference.entry.startsWith(".")
    ? reference.ownerPackageName
    : packageNameFromSpecifier(reference.entry)
}

async function inspectRuntimePackage(
  packageName: string,
  resolutionRoots: readonly string[],
): Promise<InspectedPackage> {
  let directory: string
  try {
    directory = resolveInstalledPackageDirectory(packageName, resolutionRoots)
  } catch {
    throw new Error(
      `VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED: resolveProject: runtime package ${packageName} is not installed.`,
    )
  }
  const packageJson = await readPackageJson(directory)
  const actualPackageName = requirePackageName(packageJson, directory)
  if (actualPackageName !== packageName) {
    throw new Error(
      `VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED: resolveProject: runtime package ${packageName} resolved package ${actualPackageName}.`,
    )
  }
  const metadata =
    parsePackageMetadata(packageJson.voyant, packageName, false) ??
    inferredNodeRuntimePackageMetadata()
  return {
    directory,
    record: {
      packageName,
      ...(typeof packageJson.version === "string" ? { version: packageJson.version } : {}),
      source: { kind: "registry", reference: packageName },
      metadata,
    },
  }
}

function assertRuntimeExport(
  exports: unknown,
  reference: RuntimePackageReference,
  packageName: string,
): void {
  const entry = lowerOwnerRuntimeEntry(reference.ownerPackageName, reference.entry)
  const exportKey = entry === packageName ? "." : `./${entry.slice(packageName.length + 1)}`
  const targets = isRecord(exports) ? packageExportTargets(exports[exportKey]) : undefined
  if (!targets || targets.length === 0) {
    throw new Error(
      `VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED: resolveProject: runtime entry ${reference.entry} resolves to ${packageName}, which does not export ${exportKey}.`,
    )
  }
}

function requireTargetNeutralGraph(
  graph: ResolvedVoyantDeploymentGraph,
): ResolvedVoyantProjectGraph {
  if (graph.deployment.target !== undefined) {
    throw new Error(
      `resolveProject: resolved graph must not contain deployment.target, got ${graph.deployment.target}.`,
    )
  }
  const { target: _target, ...deployment } = graph.deployment
  return { ...graph, deployment }
}

function allResolvedGraphUnits(
  graph: Pick<ResolvedVoyantProjectGraph, "modules" | "extensions" | "plugins"> & {
    adapters?: readonly ResolvedVoyantGraphUnit[]
    providers?: readonly ResolvedVoyantGraphUnit[]
  },
): ResolvedVoyantGraphUnit[] {
  return [
    ...graph.modules,
    ...graph.extensions,
    ...graph.plugins,
    ...(graph.adapters ?? []),
    ...(graph.providers ?? []),
  ]
}

async function productDistributionResolutionRoots(
  project: VoyantGraphProject,
  projectRoot: string,
): Promise<readonly string[]> {
  if (!project.productBom) return [projectRoot]

  let distributionRoot: string
  try {
    distributionRoot = resolveInstalledPackageDirectory(project.productBom.id, [projectRoot])
  } catch {
    throw new Error(
      `resolveProject: product distribution ${project.productBom.id} is not installed.`,
    )
  }
  const packageJson = await readPackageJson(distributionRoot)
  const packageName = requirePackageName(packageJson, distributionRoot)
  if (packageName !== project.productBom.id) {
    throw new Error(
      `resolveProject: product distribution ${project.productBom.id} resolved package ${packageName}.`,
    )
  }
  return [distributionRoot, projectRoot]
}

async function materializeProjectSelections(
  project: VoyantGraphProject,
  projectRoot: string,
): Promise<MaterializedProject> {
  const packages = new Map<string, InspectedPackage>()
  const resolutionRoots = await productDistributionResolutionRoots(project, projectRoot)
  const selections = project.selections
  if (!selections) return { project, packages, resolutionRoots }

  const modules = await materializeUnits(
    project.modules,
    selections.modules,
    "module",
    projectRoot,
    resolutionRoots,
    packages,
  )
  const extensions = await materializeUnits(
    project.extensions,
    selections.extensions,
    "extension",
    projectRoot,
    resolutionRoots,
    packages,
  )
  const plugins = await materializeUnits(
    project.plugins,
    selections.plugins,
    "plugin",
    projectRoot,
    resolutionRoots,
    packages,
  )
  const adapters = await materializeUnits(
    project.adapters,
    selections.adapters,
    "adapter",
    projectRoot,
    resolutionRoots,
    packages,
  )
  const providers = await materializeUnits(
    project.providers,
    selections.providers,
    "provider",
    projectRoot,
    resolutionRoots,
    packages,
  )

  return {
    packages,
    resolutionRoots,
    project: {
      ...project,
      modules: modules.units,
      extensions: extensions.units,
      plugins: plugins.units,
      adapters: adapters.units,
      providers: providers.units,
      selections: {
        modules: modules.selections,
        extensions: extensions.selections,
        plugins: plugins.selections,
        adapters: adapters.selections,
        providers: providers.selections,
      },
    },
  }
}

async function materializeUnits(
  units: readonly VoyantGraphUnitManifest[],
  selections: readonly VoyantGraphProjectSelection[],
  kind: VoyantGraphUnitKind,
  projectRoot: string,
  resolutionRoots: readonly string[],
  packages: Map<string, InspectedPackage>,
): Promise<{
  units: VoyantGraphUnitManifest[]
  selections: VoyantGraphProjectSelection[]
}> {
  const selectionsById = new Map(selections.map((selection) => [selection.id, selection]))
  const materializedUnits: VoyantGraphUnitManifest[] = []
  const materializedSelections: VoyantGraphProjectSelection[] = []

  for (const unit of units) {
    const selection = selectionsById.get(unit.id)
    if (!selection) {
      materializedUnits.push(unit)
      continue
    }

    const inspected = await inspectSelectedPackage(selection, kind, projectRoot, resolutionRoots)
    const selectedId = graphIdForSelection(inspected.record.packageName, selection.id)
    const materializedSelection: VoyantGraphProjectSelection = {
      ...selection,
      id: selectedId,
      packageName: inspected.record.packageName,
    }
    materializedUnits.push({ ...unit, id: selectedId, packageName: inspected.record.packageName })
    materializedSelections.push(materializedSelection)

    const previous = packages.get(inspected.record.packageName)
    if (previous && previous.directory !== inspected.directory) {
      throw new Error(
        `resolveProject: package ${inspected.record.packageName} resolves from more than one selected location.`,
      )
    }
    packages.set(inspected.record.packageName, inspected)
    selectionsById.delete(unit.id)
  }

  if (selectionsById.size > 0) {
    throw new Error(
      `resolveProject: stale ${kind} selection(s) have no project unit: ${[...selectionsById.keys()]
        .sort()
        .join(", ")}.`,
    )
  }
  return { units: materializedUnits, selections: materializedSelections }
}

async function inspectSelectedPackage(
  selection: VoyantGraphProjectSelection,
  kind: VoyantGraphUnitKind,
  projectRoot: string,
  resolutionRoots: readonly string[],
): Promise<InspectedPackage> {
  const localPath = selection.provenance.kind === "path" ? selection.provenance.path : undefined
  const directory = localPath
    ? resolveLocalPackageDirectory(projectRoot, localPath)
    : resolveInstalledPackageDirectory(selection.packageName, resolutionRoots)
  const packageJson = await readPackageJson(directory)
  const packageName = requirePackageName(packageJson, directory)
  if (!localPath && packageName !== selection.packageName) {
    throw new Error(
      `resolveProject: selection ${selection.resolve} resolved package ${packageName}, expected ${selection.packageName}.`,
    )
  }

  const metadata = requirePackageMetadata(packageJson.voyant, packageName)
  if (metadata.kind !== kind && metadata.kind !== "module") {
    throw new Error(
      `resolveProject: ${packageName} metadata kind ${metadata.kind} cannot provide a selected ${kind}.`,
    )
  }
  assertManifestExport(packageJson.exports, metadata.manifest, packageName)

  return {
    directory,
    record: {
      packageName,
      ...(typeof packageJson.version === "string" ? { version: packageJson.version } : {}),
      source: localPath
        ? { kind: "file", reference: localPath }
        : { kind: "registry", reference: selection.packageName },
      metadata,
    },
  }
}

async function loadAdmittedPackageManifests(
  record: VoyantGraphPackageRecord,
  packages: ReadonlyMap<string, InspectedPackage>,
): Promise<readonly VoyantGraphUnitManifest[]> {
  const inspected = packages.get(record.packageName)
  if (!inspected) {
    throw new Error(`Package ${record.packageName} was not inspected before admission.`)
  }
  const packageJson = await readPackageJson(inspected.directory)
  const target = resolveManifestExportTarget(
    inspected.directory,
    packageJson.exports,
    record.metadata?.manifest,
    record.packageName,
  )
  const namespace = (await import(pathToFileURL(target).href)) as Record<string, unknown>
  const manifests = new Map<string, VoyantGraphUnitManifest>()
  for (const value of Object.values(namespace)) {
    if (!isGraphUnitManifest(value)) continue
    manifests.set(value.id, value)
  }
  return [...manifests.values()].sort((left, right) => left.id.localeCompare(right.id))
}

async function buildLocalRuntimeEntryOverrides(
  graph: ResolvedVoyantDeploymentGraph,
  packages: ReadonlyMap<string, InspectedPackage>,
  projectRoot: string,
  runtimeEntry: string,
  extraPackageEntries: readonly string[] = [],
): Promise<Record<string, string>> {
  const overrides: Record<string, string> = {}
  const runtimeDirectory = path.dirname(path.join(projectRoot, ".voyant", runtimeEntry))
  const references = [
    ...runtimePackageReferences(allResolvedGraphUnits(graph)),
    ...[...packages.values()].flatMap(({ record }) =>
      record.metadata?.runtime
        ? [{ ownerPackageName: record.packageName, entry: record.metadata.runtime.entry }]
        : [],
    ),
    ...extraPackageEntries.map((entry) => ({
      ownerPackageName: packageNameFromSpecifier(entry),
      entry,
    })),
  ]
  for (const reference of references) {
    const packageName = runtimeReferencePackageName(reference)
    const inspected = packages.get(packageName)
    if (!inspected) continue
    const projectSource =
      inspected.directory === projectRoot && inspected.record.source.reference === "."
    const packageJson = projectSource ? undefined : await readPackageJson(inspected.directory)
    const packageEntry = lowerOwnerRuntimeEntry(reference.ownerPackageName, reference.entry)
    const target = projectSource
      ? resolveProjectSourceRuntimeTarget(projectRoot, reference.entry)
      : resolvePackageExportTarget(
          inspected.directory,
          packageJson!.exports,
          packageEntry === packageName ? "." : `./${packageEntry.slice(packageName.length + 1)}`,
          packageName,
        )
    const relative = path.relative(runtimeDirectory, target).replaceAll("\\", "/")
    overrides[packageEntry] = relative.startsWith(".") ? relative : `./${relative}`
  }
  return overrides
}

function isProjectSourceRuntimeReference(
  reference: RuntimePackageReference,
  inspected: InspectedPackage,
  projectRoot: string,
): boolean {
  if (
    inspected.directory !== projectRoot ||
    inspected.record.source.kind !== "file" ||
    inspected.record.source.reference !== "." ||
    !reference.entry.startsWith("./")
  ) {
    return false
  }
  resolveProjectSourceRuntimeTarget(projectRoot, reference.entry)
  return true
}

function resolveProjectSourceRuntimeTarget(projectRoot: string, entry: string): string {
  const target = path.resolve(projectRoot, entry)
  assertPathInside(projectRoot, target, `project runtime entry ${entry}`)
  if (!isGeneratedProjectRuntimeEntry(entry) && !existsSync(target)) {
    throw new Error(`resolveProject: project runtime entry ${entry} does not exist.`)
  }
  return target
}

function isGeneratedProjectRuntimeEntry(entry: string): boolean {
  return [PROJECT_API_GENERATED_PATH, PROJECT_SUBSCRIBERS_GENERATED_PATH].some(
    (generatedPath) => entry === `./.voyant/${generatedPath}`,
  )
}

function lowerOwnerRuntimeEntry(packageName: string, entry: string): string {
  if (!entry.startsWith(".")) return entry
  if (entry === "." || entry === "./") return packageName
  return `${packageName}/${entry.slice(2)}`
}

export function buildMigrationPlan(
  graph: ResolvedVoyantDeploymentGraph,
): VoyantProjectMigrationPlan {
  const units = allResolvedGraphUnits(graph)
  const packageSchemaMigrations = units.flatMap((unit) =>
    unit.migrations
      .filter((migration): migration is typeof migration & { source: string } =>
        Boolean(migration.source),
      )
      .map((migration) => ({
        id: migration.id,
        migrationKind: "schema" as const,
        order: 0,
        idempotencyKey: `schema:${migration.id}`,
        owner: unit.id,
        packageName: unit.packageName,
        source: {
          kind: "package" as const,
          packageName: unit.packageName,
          path: migration.source,
        },
      })),
  )
  const schemaDependencies = new Map(
    graph.packageRecords.map((record) => [
      record.packageName,
      record.metadata?.requiresSchemas ?? [],
    ]),
  )
  const orderedPackageMigrations = orderPackageSchemaMigrations(
    packageSchemaMigrations,
    schemaDependencies,
  )
  const deploymentMigrations: VoyantProjectSchemaMigration[] = (
    graph.deployment.migrations ?? []
  ).map((migration) => ({
    id: migration.id,
    migrationKind: "schema",
    order: 0,
    idempotencyKey: `schema:${migration.id}`,
    owner: migration.id,
    source: {
      kind: "deployment",
      path: migration.source,
    },
  }))
  const schemaMigrations = [...orderedPackageMigrations, ...deploymentMigrations]
  const setupMigrations = units
    .flatMap((unit) =>
      (unit.setupMigrations ?? []).map((migration) => ({
        id: migration.id,
        migrationKind: "setup" as const,
        order: 0,
        idempotencyKey: `setup:${migration.id}`,
        owner: unit.id,
        packageName: unit.packageName,
        source: migration.source,
        runtime: {
          entry: lowerOwnerRuntimeEntry(unit.packageName, migration.runtime.entry),
          export: migration.runtime.export ?? "default",
        },
        dependsOn: [...(migration.dependsOn ?? [])].sort(),
      })),
    )
    .sort((left, right) => left.owner.localeCompare(right.owner) || left.id.localeCompare(right.id))
  const orderedSetupMigrations = orderSetupMigrations(setupMigrations, schemaMigrations)
  const migrations = [...schemaMigrations, ...orderedSetupMigrations].map((migration, order) => ({
    ...migration,
    order,
  }))
  return {
    schemaVersion: VOYANT_MIGRATION_PLAN_SCHEMA_VERSION,
    contentHash: graph.contentHash,
    migrations,
  }
}

function orderPackageSchemaMigrations(
  migrations: readonly VoyantProjectSchemaMigration[],
  dependencies: ReadonlyMap<string, readonly string[]>,
): VoyantProjectSchemaMigration[] {
  const byPackage = new Map<string, VoyantProjectSchemaMigration[]>()
  for (const migration of migrations) {
    if (!migration.packageName) continue
    const packageMigrations = byPackage.get(migration.packageName) ?? []
    packageMigrations.push(migration)
    byPackage.set(migration.packageName, packageMigrations)
  }
  for (const packageMigrations of byPackage.values()) {
    packageMigrations.sort((left, right) => left.id.localeCompare(right.id))
  }

  for (const packageName of [...byPackage.keys()].sort()) {
    const missingDependencies = (dependencies.get(packageName) ?? []).filter(
      (dependency) => !byPackage.has(dependency),
    )
    if (missingDependencies.length > 0) {
      throw new Error(
        `buildMigrationPlan: package schema dependency is not selected: ${packageName} requires ${missingDependencies.join(", ")}`,
      )
    }
  }

  const pending = [...byPackage.keys()].sort()
  const completed = new Set<string>()
  const ordered: VoyantProjectSchemaMigration[] = []
  while (pending.length > 0) {
    const index = pending.findIndex((packageName) =>
      (dependencies.get(packageName) ?? []).every((dependency) => completed.has(dependency)),
    )
    if (index === -1) {
      throw new Error(
        `buildMigrationPlan: package schema dependencies are cyclic: ${pending.join(", ")}`,
      )
    }
    const [packageName] = pending.splice(index, 1)
    if (!packageName) continue
    ordered.push(...(byPackage.get(packageName) ?? []))
    completed.add(packageName)
  }
  return ordered
}

function orderSetupMigrations(
  setupMigrations: readonly VoyantProjectSetupMigration[],
  schemaMigrations: readonly VoyantProjectSchemaMigration[],
): VoyantProjectSetupMigration[] {
  const completed = new Set(schemaMigrations.map((migration) => migration.id))
  const pending = [...setupMigrations]
  const ordered: VoyantProjectSetupMigration[] = []
  while (pending.length > 0) {
    const index = pending.findIndex((migration) =>
      migration.dependsOn.every((dependency) => completed.has(dependency)),
    )
    if (index === -1) {
      throw new Error(
        `buildMigrationPlan: setup migration dependencies are cyclic or do not reference an earlier migration: ${pending.map((migration) => migration.id).join(", ")}`,
      )
    }
    const [migration] = pending.splice(index, 1)
    if (!migration) continue
    ordered.push(migration)
    completed.add(migration.id)
  }
  return ordered
}

export function buildProjectMigrationRunnerModule(input: {
  migrationPlan: VoyantProjectMigrationPlan
  runtimeEntryOverrides?: Readonly<Record<string, string>>
}): string {
  const setupMigrations = input.migrationPlan.migrations.filter(
    (migration): migration is VoyantProjectSetupMigration => migration.migrationKind === "setup",
  )
  const loaders = setupMigrations
    .map((migration) => {
      const entry =
        input.runtimeEntryOverrides?.[migration.runtime.entry] ?? migration.runtime.entry
      return `${JSON.stringify(migration.id)}: async () => {\n    const module = await import(${JSON.stringify(entry)})\n    const handler = module[${JSON.stringify(migration.runtime.export)}]\n    if (typeof handler !== "function") throw new Error(${JSON.stringify(`Setup migration ${migration.id} must export ${migration.runtime.export} as a function.`)})\n    return handler\n  }`
    })
    .join(",\n  ")
  return `// Generated by @voyant-travel/framework. Do not edit.\nimport { executeNodeMigrationPlan } from "@voyant-travel/framework/project"\n\nexport const schemaVersion = "voyant.node-migration-runner.v1"\nexport const contentHash = ${JSON.stringify(input.migrationPlan.contentHash)}\nexport const migrationPlan = ${JSON.stringify(input.migrationPlan, null, 2)}\n\nconst setupLoaders = {\n  ${loaders}\n}\n\nexport async function runVoyantMigrations(options = {}) {\n  return executeNodeMigrationPlan(migrationPlan, { setupLoaders, resolveFrom: import.meta.url }, options)\n}\n`
}

function graphIdForSelection(packageName: string, authoredId: string): string {
  const separator = authoredId.indexOf("#")
  const unitPath = separator === -1 ? "" : authoredId.slice(separator + 1)
  const packageId = packageName.startsWith("@") ? packageName : `npm/${packageName}`
  return unitPath ? `${packageId}#${unitPath}` : packageId
}

function resolveLocalPackageDirectory(projectRoot: string, relativePath: string): string {
  const directory = path.resolve(projectRoot, relativePath)
  assertPathInside(projectRoot, directory, `local selection ${relativePath}`)
  if (!existsSync(path.join(directory, "package.json"))) {
    throw new Error(
      `resolveProject: local selection ${relativePath} must contain package.json with a ./voyant export.`,
    )
  }
  return directory
}

function resolveInstalledPackageDirectory(
  packageName: string,
  resolutionRoots: readonly string[],
): string {
  const startPaths = [...resolutionRoots, path.dirname(fileURLToPath(import.meta.url))]
  for (const start of startPaths) {
    const walked = findNodeModulesPackage(start, packageName)
    if (walked) return walked
  }

  for (const from of [
    ...resolutionRoots.map((root) => path.join(root, "package.json")),
    import.meta.url,
  ]) {
    try {
      const entry = createRequire(from).resolve(packageName)
      const root = findOwningPackageDirectory(path.dirname(entry), packageName)
      if (root) return root
    } catch {
      // Import-only packages are found by the node_modules walk above.
    }
  }
  throw new Error(`resolveProject: selected package ${packageName} is not installed.`)
}

function findNodeModulesPackage(start: string, packageName: string): string | undefined {
  let current = path.resolve(start)
  for (;;) {
    const candidate = path.join(current, "node_modules", packageName)
    if (existsSync(path.join(candidate, "package.json"))) return candidate
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function findOwningPackageDirectory(start: string, packageName: string): string | undefined {
  let current = start
  for (;;) {
    const packageJsonPath = path.join(current, "package.json")
    if (existsSync(packageJsonPath)) {
      try {
        const parsed = JSON.parse(createRequire(import.meta.url)(packageJsonPath)) as PackageJson
        if (parsed.name === packageName) return current
      } catch {
        // Continue towards the filesystem root.
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

async function readPackageJson(directory: string): Promise<PackageJson> {
  const packageJsonPath = path.join(directory, "package.json")
  try {
    return JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson
  } catch (error) {
    throw new Error(
      `resolveProject: could not read ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function requirePackageName(packageJson: PackageJson, directory: string): string {
  if (typeof packageJson.name !== "string" || !isPackageName(packageJson.name)) {
    throw new Error(
      `resolveProject: ${directory}/package.json must declare a canonical package name.`,
    )
  }
  return packageJson.name
}

function requirePackageMetadata(value: unknown, packageName: string): VoyantGraphPackageMetadata {
  const metadata = parsePackageMetadata(value, packageName, true)
  if (!metadata) throw new Error(`resolveProject: ${packageName} package metadata is missing.`)
  return metadata
}

function parsePackageMetadata(
  value: unknown,
  packageName: string,
  requireManifest: boolean,
): VoyantGraphPackageMetadata | undefined {
  if (value === undefined && !requireManifest) return undefined
  if (!isRecord(value) || value.schemaVersion !== "voyant.package.v1") {
    throw new Error(
      `resolveProject: ${packageName} must declare package.json#voyant schemaVersion voyant.package.v1.`,
    )
  }
  if (
    value.kind !== "module" &&
    value.kind !== "plugin" &&
    value.kind !== "adapter" &&
    value.kind !== "provider" &&
    value.kind !== "framework" &&
    value.kind !== "library"
  ) {
    throw new Error(`resolveProject: ${packageName} package.json#voyant.kind is invalid.`)
  }
  if (requireManifest && value.manifest !== "./voyant") {
    throw new Error(
      `resolveProject: ${packageName} package.json#voyant.manifest must be "./voyant".`,
    )
  }
  if (value.manifest !== undefined && value.manifest !== "./voyant") {
    throw new Error(
      `resolveProject: ${packageName} package.json#voyant.manifest must be "./voyant" when declared.`,
    )
  }
  const compatibleWith = parseCompatibleWith(value.compatibleWith, packageName)
  const requires = parseCapabilityDeclaration(value.requires, packageName)
  const runtime = parsePackageRuntime(value.runtime, packageName)
  if (value.schema !== undefined && typeof value.schema !== "string") {
    throw new Error(`resolveProject: ${packageName} package schema must be a string.`)
  }
  if (value.requiresSchemas !== undefined && !isStringArray(value.requiresSchemas)) {
    throw new Error(`resolveProject: ${packageName} required schemas must be a string array.`)
  }
  const requiresSchemas = (value.requiresSchemas ?? []) as string[]
  const invalidRequiredSchema = requiresSchemas.find((dependency) => !isPackageName(dependency))
  if (invalidRequiredSchema) {
    throw new Error(
      `resolveProject: ${packageName} required schema ${invalidRequiredSchema} must be a canonical package name.`,
    )
  }
  return {
    schemaVersion: "voyant.package.v1",
    kind: value.kind,
    ...(value.manifest === "./voyant" ? { manifest: "./voyant" as const } : {}),
    ...(runtime ? { runtime } : {}),
    ...(compatibleWith ? { compatibleWith } : {}),
    ...(requires ? { requires } : {}),
    ...(typeof value.schema === "string" ? { schema: value.schema } : {}),
    ...(requiresSchemas.length > 0 ? { requiresSchemas: [...requiresSchemas].sort() } : {}),
  }
}

function parsePackageRuntime(
  value: unknown,
  packageName: string,
): VoyantGraphPackageMetadata["runtime"] {
  if (value === undefined) return undefined
  if (!isRecord(value) || typeof value.entry !== "string" || typeof value.export !== "string") {
    throw new Error(
      `resolveProject: ${packageName} package runtime must declare string entry and export fields.`,
    )
  }
  if (!value.entry.startsWith("./") || value.entry.includes("\\")) {
    throw new Error(
      `resolveProject: ${packageName} package runtime entry must be an owner-relative package export.`,
    )
  }
  const parts = value.entry.slice(2).split("/")
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(`resolveProject: ${packageName} package runtime entry is invalid.`)
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value.export)) {
    throw new Error(`resolveProject: ${packageName} package runtime export is invalid.`)
  }
  return { entry: value.entry, export: value.export }
}

function parseCompatibleWith(
  value: unknown,
  packageName: string,
): VoyantGraphPackageMetadata["compatibleWith"] {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`resolveProject: ${packageName} package compatibility must be an object.`)
  }
  const framework = value.framework
  const targets = value.targets
  const modes = value.modes
  if (framework !== undefined && typeof framework !== "string") {
    throw new Error(`resolveProject: ${packageName} compatibleWith.framework must be a string.`)
  }
  if (targets !== undefined && !isStringArray(targets)) {
    throw new Error(`resolveProject: ${packageName} compatibleWith.targets must be a string array.`)
  }
  if (
    modes !== undefined &&
    (!isStringArray(modes) ||
      modes.some((mode) => mode !== "local" && mode !== "managed-cloud" && mode !== "self-hosted"))
  ) {
    throw new Error(`resolveProject: ${packageName} compatibleWith.modes is invalid.`)
  }
  return {
    ...(framework ? { framework } : {}),
    ...(targets ? { targets } : {}),
    ...(modes ? { modes: modes as Array<"local" | "managed-cloud" | "self-hosted"> } : {}),
  }
}

function parseCapabilityDeclaration(
  value: unknown,
  packageName: string,
): VoyantGraphCapabilityDeclaration | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    throw new Error(`resolveProject: ${packageName} package requirements must be an object.`)
  }
  if (value.capabilities !== undefined && !isStringArray(value.capabilities)) {
    throw new Error(`resolveProject: ${packageName} required capabilities must be a string array.`)
  }
  if (
    value.ports !== undefined &&
    (!Array.isArray(value.ports) ||
      value.ports.some(
        (port) =>
          !isRecord(port) ||
          typeof port.id !== "string" ||
          (port.optional !== undefined && typeof port.optional !== "boolean"),
      ))
  ) {
    throw new Error(`resolveProject: ${packageName} required ports are invalid.`)
  }
  return value as VoyantGraphCapabilityDeclaration
}

function assertManifestExport(exports: unknown, manifest: string | undefined, packageName: string) {
  const targets = isRecord(exports) ? packageExportTargets(exports[manifest ?? ""]) : undefined
  if (!targets || targets.length === 0) {
    throw new Error(`resolveProject: ${packageName} does not export ${manifest ?? "./voyant"}.`)
  }
}

function resolveManifestExportTarget(
  packageDirectory: string,
  exports: unknown,
  manifest: string | undefined,
  packageName: string,
): string {
  const targets = isRecord(exports) ? packageExportTargets(exports[manifest ?? ""]) : undefined
  if (!targets || targets.length === 0) {
    throw new Error(`resolveProject: ${packageName} does not export ${manifest ?? "./voyant"}.`)
  }

  let invalid: Error | undefined
  for (const target of targets) {
    try {
      if (!target.startsWith("./")) {
        throw new Error(`${packageName} ./voyant export target must start with ./`)
      }
      const resolved = path.resolve(packageDirectory, target)
      assertPathInside(packageDirectory, resolved, `${packageName} ./voyant export`)
      return resolved
    } catch (error) {
      invalid = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw invalid ?? new Error(`resolveProject: ${packageName} has no valid ./voyant export target.`)
}

function resolvePackageExportTarget(
  packageDirectory: string,
  exports: unknown,
  exportKey: string,
  packageName: string,
): string {
  const targets = isRecord(exports) ? packageExportTargets(exports[exportKey]) : undefined
  if (!targets || targets.length === 0) {
    throw new Error(`resolveProject: ${packageName} does not export ${exportKey}.`)
  }
  for (const target of targets) {
    if (!target.startsWith("./")) continue
    const resolved = path.resolve(packageDirectory, target)
    assertPathInside(packageDirectory, resolved, `${packageName} ${exportKey} export`)
    return resolved
  }
  throw new Error(`resolveProject: ${packageName} has no valid ${exportKey} export target.`)
}

function packageExportTargets(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) {
    return value.flatMap((candidate) => packageExportTargets(candidate) ?? [])
  }
  if (value === null) return []
  if (!isRecord(value)) return undefined
  for (const condition of ["node", "import", "default"]) {
    if (!Object.hasOwn(value, condition)) continue
    return packageExportTargets(value[condition])
  }
  return undefined
}

function requireProject(value: unknown): VoyantGraphProject {
  if (!isVoyantGraphProject(value)) {
    throw new Error(
      "resolveProject: project must be the voyant.project.v1 result returned by defineProject(...).",
    )
  }
  return {
    ...value,
    extensions: value.extensions ?? [],
    adapters: value.adapters ?? [],
    providers: value.providers ?? [],
    ...(value.selections
      ? {
          selections: {
            ...value.selections,
            extensions: value.selections.extensions ?? [],
            adapters: value.selections.adapters ?? [],
            providers: value.selections.providers ?? [],
          },
        }
      : {}),
  }
}

function isVoyantGraphProject(value: unknown): value is VoyantGraphProject {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "voyant.project.v1" ||
    !Array.isArray(value.modules) ||
    !value.modules.every(isGraphUnitManifest) ||
    (value.extensions !== undefined &&
      (!Array.isArray(value.extensions) || !value.extensions.every(isGraphUnitManifest))) ||
    !Array.isArray(value.plugins) ||
    !value.plugins.every(isGraphUnitManifest) ||
    (value.adapters !== undefined &&
      (!Array.isArray(value.adapters) || !value.adapters.every(isGraphUnitManifest))) ||
    (value.providers !== undefined &&
      (!Array.isArray(value.providers) || !value.providers.every(isGraphUnitManifest)))
  ) {
    return false
  }
  if (value.selections === undefined) return true
  if (!isRecord(value.selections)) return false
  return (
    Array.isArray(value.selections.modules) &&
    value.selections.modules.every(isProjectSelection) &&
    (value.selections.extensions === undefined ||
      (Array.isArray(value.selections.extensions) &&
        value.selections.extensions.every(isProjectSelection))) &&
    Array.isArray(value.selections.plugins) &&
    value.selections.plugins.every(isProjectSelection) &&
    (value.selections.adapters === undefined ||
      (Array.isArray(value.selections.adapters) &&
        value.selections.adapters.every(isProjectSelection))) &&
    (value.selections.providers === undefined ||
      (Array.isArray(value.selections.providers) &&
        value.selections.providers.every(isProjectSelection)))
  )
}

function isProjectSelection(value: unknown): value is VoyantGraphProjectSelection {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.resolve === "string" &&
    typeof value.packageName === "string" &&
    isRecord(value.provenance) &&
    (value.provenance.kind === "package" || value.provenance.kind === "path")
  )
}

function isGraphUnitManifest(value: unknown): value is VoyantGraphUnitManifest {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.schemaVersion === "voyant.module.v1" ||
      value.schemaVersion === "voyant.extension.v1" ||
      value.schemaVersion === "voyant.plugin.v1" ||
      value.schemaVersion === "voyant.adapter.v1" ||
      value.schemaVersion === "voyant.provider.v1")
  )
}

function isPackageName(value: string): boolean {
  return (
    /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(value) ||
    /^[a-z0-9][a-z0-9._-]*$/.test(value)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`resolveProject: ${label} must be a non-empty string.`)
  }
  return value
}

function assertPathInside(root: string, candidate: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return
  throw new Error(`resolveProject: ${label} must stay inside ${root}.`)
}

async function readFrameworkVersion(): Promise<string | undefined> {
  const directory = findOwningPackageDirectory(
    path.dirname(fileURLToPath(import.meta.url)),
    "@voyant-travel/framework",
  )
  if (!directory) return undefined
  const packageJson = await readPackageJson(directory)
  return typeof packageJson.version === "string" ? packageJson.version : undefined
}
