// agent-quality: file-size exception -- reason: deployment and admin generators share canonical formatting and runtime-entry lowering helpers.
import {
  canonicalJson,
  type ResolvedVoyantDeploymentGraph,
  type ResolvedVoyantGraphUnit,
  type VoyantGraphRuntimeTarget,
} from "./deployment-graph.js"
import { DEPLOYMENT_PROVIDER_ROLES, type VoyantDeploymentMode } from "./deployment-types.js"
import { lowerGraphRuntimeUnits } from "./graph-runtime-generation.js"
import { createVoyantGraphRuntime, type VoyantGraphRuntime } from "./runtime-lowering.js"

export {
  type CreateVoyantGraphRuntimeInput,
  registerVoyantGraphTools,
  VOYANT_GRAPH_RUNTIME_LOAD_ERROR_CODES,
  type VoyantGraphRuntimeActionDefinition,
  type VoyantGraphRuntimeConfigDefinition,
  type VoyantGraphRuntimeConfigLoader,
  type VoyantGraphRuntimeJobDefinition,
  type VoyantGraphRuntimeJobHandler,
  type VoyantGraphRuntimeJobLoader,
  VoyantGraphRuntimeLoadError,
  type VoyantGraphRuntimeLoadErrorCode,
  type VoyantGraphRuntimeProviderDefinition,
  type VoyantGraphRuntimeProviderLoader,
  type VoyantGraphRuntimeReferenceDefinition,
  type VoyantGraphRuntimeReferenceFacet,
  type VoyantGraphRuntimeReferenceLoader,
  type VoyantGraphRuntimeResourceDefinition,
  type VoyantGraphRuntimeRouteDefinition,
  type VoyantGraphRuntimeRouteLoader,
  type VoyantGraphRuntimeSecretDefinition,
  type VoyantGraphRuntimeSecretLoader,
  type VoyantGraphRuntimeSelectedIds,
  type VoyantGraphRuntimeToolDefinition,
  type VoyantGraphRuntimeToolLoader,
  type VoyantGraphRuntimeUnitDefinition,
  type VoyantGraphRuntimeUnitLoader,
  type VoyantGraphRuntimeWebhookPlan,
} from "./runtime-lowering.js"
export {
  type ResolvedVoyantGraphRuntimeProviders,
  type ResolveVoyantGraphRuntimeProvidersInput,
  resolveVoyantGraphRuntimeProviders,
  type SelectedVoyantGraphRuntimeProvider,
  VOYANT_GRAPH_RUNTIME_PROVIDER_ERROR_CODES,
  type VoyantGraphProviderFactory,
  type VoyantGraphProviderFactoryContext,
  VoyantGraphRuntimeProviderError,
  type VoyantGraphRuntimeProviderErrorCode,
  type VoyantGraphRuntimeProviderIssue,
} from "./runtime-providers.js"
export {
  type ResolvedVoyantGraphRuntimeConfig,
  type ResolvedVoyantGraphRuntimeSecret,
  type ResolvedVoyantGraphRuntimeValues,
  type ResolveVoyantGraphRuntimeValuesInput,
  resolveVoyantGraphRuntimeValues,
  VOYANT_GRAPH_RUNTIME_VALUE_ERROR_CODES,
  VoyantGraphRuntimeValueError,
  type VoyantGraphRuntimeValueErrorCode,
  type VoyantGraphRuntimeValueIssue,
} from "./runtime-values.js"
export { createVoyantGraphRuntime, type VoyantGraphRuntime }

export const VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION = "voyant.deployment-artifacts.v1" as const
export const VOYANT_NODE_RUNTIME_ENTRY_ID = "@voyant-travel/framework#runtime.node" as const

export type VoyantDeploymentRuntimeEntryKind = "node"

export interface VoyantDeploymentRuntimeEntryArtifact {
  id: string
  target: VoyantGraphRuntimeTarget
  file: string
  graphHash: string
  kind: VoyantDeploymentRuntimeEntryKind
}

export interface VoyantDeploymentMigrationSourceArtifact {
  packageName: string
  schema: string
}

export interface VoyantDeploymentArtifactManifest {
  schemaVersion: typeof VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION
  graphHash: string
  graph: string
  accessCatalog: ResolvedVoyantDeploymentGraph["accessCatalog"]
  eventCatalog: ResolvedVoyantDeploymentGraph["eventCatalog"]
  reportingCatalog: ResolvedVoyantDeploymentGraph["reportingCatalog"]
  webhookPlan: ResolvedVoyantDeploymentGraph["webhookPlan"]
  runtimeEntries: readonly VoyantDeploymentRuntimeEntryArtifact[]
  migrationSources: readonly VoyantDeploymentMigrationSourceArtifact[]
}

export interface BuildDeploymentArtifactManifestInput {
  graph: ResolvedVoyantDeploymentGraph
  graphArtifactPath: string
  runtimeEntries: readonly VoyantDeploymentRuntimeEntryArtifact[]
  migrationSources?: readonly VoyantDeploymentMigrationSourceArtifact[]
}

export interface BuildNodeRuntimeEntryArtifactInput {
  graph: ResolvedVoyantDeploymentGraph
  file: string
  id?: string
}

export interface BuildNodeRuntimeEntryInput {
  graph: ResolvedVoyantDeploymentGraph
  graphArtifactPath: string
  graphRuntimePath?: string
  command?: string
}

export interface BuildGraphRuntimeModuleInput {
  graph: ResolvedVoyantDeploymentGraph
  command?: string
  /** Build-time import lowering for admitted project-relative packages. */
  runtimeEntryOverrides?: Readonly<Record<string, string>>
  /** Base URL used only when materializing relative runtime entries in memory. */
  runtimeImportBaseUrl?: string
}

/** Materialize an admitted graph for Node-side tooling without generated source evaluation. */
export function createResolvedGraphRuntime(
  input: BuildGraphRuntimeModuleInput,
): VoyantGraphRuntime {
  assertGraphRuntimeLowerable(input.graph)
  const modules = lowerGraphRuntimeUnits(
    input.graph.modules,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const extensions = lowerGraphRuntimeUnits(
    input.graph.extensions,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const plugins = lowerGraphRuntimeUnits(
    input.graph.plugins,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const adapters = lowerGraphRuntimeUnits(
    input.graph.adapters,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const providers = lowerGraphRuntimeUnits(
    input.graph.providers,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const entrySpecifiers = [
    ...new Set(
      [...modules, ...extensions, ...plugins, ...adapters, ...providers].flatMap((unit) =>
        [...unit.references, ...unit.provisionalReferences].map(
          (reference) => reference.importEntry,
        ),
      ),
    ),
  ]
  return createVoyantGraphRuntime({
    graphHash: input.graph.contentHash,
    accessCatalog: input.graph.accessCatalog,
    eventCatalog: input.graph.eventCatalog,
    reportingCatalog: input.graph.reportingCatalog,
    providerSelections: Object.fromEntries(
      Object.entries(input.graph.deployment.providers).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    entries: Object.fromEntries(
      entrySpecifiers.map((specifier) => [
        specifier,
        () =>
          import(
            input.runtimeImportBaseUrl && specifier.startsWith(".")
              ? new URL(specifier, input.runtimeImportBaseUrl).href
              : specifier
          ),
      ]),
    ),
    modules,
    extensions,
    plugins,
    adapters,
    providerUnits: providers,
    webhookPlan: input.graph.webhookPlan,
  })
}

export interface BuildProjectRuntimeModuleInput extends BuildGraphRuntimeModuleInput {}

export interface BuildGraphAdminBundleModuleInput extends BuildGraphRuntimeModuleInput {}

export interface BuildGraphPresentationBundleModuleInput extends BuildGraphRuntimeModuleInput {}

export interface BuildGraphAccessCatalogModuleInput {
  graph: ResolvedVoyantDeploymentGraph
  command?: string
}

export function buildDeploymentGraphJson(graph: ResolvedVoyantDeploymentGraph): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(graph)), null, 2)}\n`
}

/** Emit the access catalog compiled exclusively from the selected project graph. */
export function buildGraphAccessCatalogModule(input: BuildGraphAccessCatalogModuleInput): string {
  const command = input.command ?? "voyant project resolve"
  return `// GENERATED by ${command} - do not edit.
// Package and project declarations in the selected graph are the only authority.

export const GENERATED_SELECTED_ACCESS_CATALOG_HASH = ${quote(input.graph.contentHash)} as const
export const accessCatalog = ${formatGeneratedValue(input.graph.accessCatalog, 0)} as const
`
}

/** Emit the import-cheap admin factories opted into the selected package graph. */
export function buildGraphAdminBundleModule(input: BuildGraphAdminBundleModuleInput): string {
  assertGraphRuntimeLowerable(input.graph)

  const units = selectedGraphAdminUnits(input.graph)
  const command = input.command ?? "voyant project resolve"
  const imports = units.map((unit, index) => {
    const runtime = unit.admin?.runtime
    if (!runtime?.export) {
      throw new Error(`buildGraphAdminBundleModule: ${unit.id} admin.runtime requires an export.`)
    }
    const entry = lowerAdminRuntimeEntry(unit, runtime.entry)
    const importEntry = input.runtimeEntryOverrides?.[entry] ?? entry
    return `import { ${runtime.export} as selectedAdminFactory${index} } from ${quote(importEntry)}`
  })
  const factories = units.map((unit, index) => `  ${quote(unit.id)}: selectedAdminFactory${index},`)

  return `// GENERATED by ${command} - do not edit.
// Contains only graph-selected, import-cheap admin factories. Page bodies stay lazy in package UI exports.

${imports.join("\n")}${imports.length > 0 ? "\n" : ""}
export const GENERATED_SELECTED_GRAPH_ADMIN_HASH = ${quote(input.graph.contentHash)}
export const GENERATED_SELECTED_GRAPH_ADMIN_UNIT_IDS = ${formatGeneratedValue(
    units.map((unit) => unit.id),
    0,
  )}

export const selectedGraphAdminExtensionFactories = {
${factories.join("\n")}
}

export function createSelectedGraphAdminExtensions(
  context,
) {
  return Object.values(selectedGraphAdminExtensionFactories).map((factory) => factory(context))
}
`
}

/** Emit the bounded type surface paired with the generated admin ESM artifact. */
export function buildGraphAdminBundleDeclarationModule(
  input: BuildGraphAdminBundleModuleInput,
): string {
  const command = input.command ?? "voyant project resolve"
  return `// GENERATED by ${command} - do not edit.
import type {
  AdminExtension,
  SelectedAdminExtensionFactory,
  SelectedAdminExtensionFactoryContext,
} from "@voyant-travel/admin"

export declare const GENERATED_SELECTED_GRAPH_ADMIN_HASH: ${quote(input.graph.contentHash)}
export declare const GENERATED_SELECTED_GRAPH_ADMIN_UNIT_IDS: readonly string[]
export declare const selectedGraphAdminExtensionFactories: Readonly<
  Record<string, SelectedAdminExtensionFactory>
>
export declare function createSelectedGraphAdminExtensions(
  context: SelectedAdminExtensionFactoryContext,
): ReadonlyArray<AdminExtension>
`
}

/** Emit frontend presentation factories opted into the selected package graph. */
export function buildGraphPresentationBundleModule(
  input: BuildGraphPresentationBundleModuleInput,
): string {
  assertGraphRuntimeLowerable(input.graph)

  const presentations = selectedGraphPresentations(input.graph)
  const command = input.command ?? "voyant project resolve"
  const imports = presentations.map(({ unit, presentation }, index) => {
    if (!presentation.runtime.export) {
      throw new Error(
        `buildGraphPresentationBundleModule: ${presentation.id} runtime requires an export.`,
      )
    }
    const entry = lowerFacetRuntimeEntry(
      "buildGraphPresentationBundleModule",
      unit,
      presentation.runtime.entry,
    )
    const importEntry = input.runtimeEntryOverrides?.[entry] ?? entry
    return `import { ${presentation.runtime.export} as selectedPresentationFactory${index} } from ${quote(importEntry)}`
  })
  const factories = presentations.map(
    ({ presentation }, index) =>
      `  ${quote(presentation.id)}: selectedPresentationFactory${index},`,
  )

  return `// GENERATED by ${command} - do not edit.
// Contains only graph-selected package presentation factories.

${imports.join("\n")}${imports.length > 0 ? "\n" : ""}export const GENERATED_SELECTED_GRAPH_PRESENTATION_HASH = ${quote(input.graph.contentHash)}
export const GENERATED_SELECTED_GRAPH_PRESENTATION_IDS = ${formatGeneratedValue(
    presentations.map(({ presentation }) => presentation.id),
    0,
  )}

export const selectedGraphPresentationFactories = {
${factories.join("\n")}
}
`
}

/** Emit the bounded type surface paired with the generated presentation ESM artifact. */
export function buildGraphPresentationBundleDeclarationModule(
  input: BuildGraphPresentationBundleModuleInput,
): string {
  const command = input.command ?? "voyant project resolve"
  return `// GENERATED by ${command} - do not edit.
export type SelectedGraphPresentationFactory = (...args: never[]) => unknown

export declare const GENERATED_SELECTED_GRAPH_PRESENTATION_HASH: ${quote(input.graph.contentHash)}
export declare const GENERATED_SELECTED_GRAPH_PRESENTATION_IDS: readonly string[]
export declare const selectedGraphPresentationFactories: Readonly<
  Record<string, SelectedGraphPresentationFactory>
>
`
}

function selectedGraphAdminUnits(
  graph: ResolvedVoyantDeploymentGraph,
): readonly ResolvedVoyantGraphUnit[] {
  return allGraphUnits(graph)
    .filter((unit) => unit.admin?.runtime)
    .sort(
      (left, right) =>
        (left.admin?.compositionOrder ?? 0) - (right.admin?.compositionOrder ?? 0) ||
        left.id.localeCompare(right.id),
    )
}

function selectedGraphPresentations(graph: ResolvedVoyantDeploymentGraph) {
  return allGraphUnits(graph)
    .flatMap((unit) => (unit.presentations ?? []).map((presentation) => ({ unit, presentation })))
    .sort(
      (left, right) =>
        left.presentation.id.localeCompare(right.presentation.id) ||
        left.unit.id.localeCompare(right.unit.id),
    )
}

function allGraphUnits(graph: ResolvedVoyantDeploymentGraph): ResolvedVoyantGraphUnit[] {
  return [
    ...graph.modules,
    ...graph.extensions,
    ...graph.plugins,
    ...graph.adapters,
    ...graph.providers,
  ]
}

/** Emit target-neutral lazy package loaders without evaluating imports. */
export function buildGraphRuntimeModule(input: BuildGraphRuntimeModuleInput): string {
  assertGraphRuntimeLowerable(input.graph)

  const modules = lowerGraphRuntimeUnits(
    input.graph.modules,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const extensions = lowerGraphRuntimeUnits(
    input.graph.extensions,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const plugins = lowerGraphRuntimeUnits(
    input.graph.plugins,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const adapters = lowerGraphRuntimeUnits(
    input.graph.adapters,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const providers = lowerGraphRuntimeUnits(
    input.graph.providers,
    input.graph,
    input.runtimeEntryOverrides,
  )
  const publicEntries = [
    ...new Set(
      [...modules, ...extensions, ...plugins, ...adapters, ...providers].flatMap((unit) =>
        unit.references.map((definition) => definition.importEntry),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right))
  const importerEntries = [
    ...new Set(
      [...modules, ...extensions, ...plugins, ...adapters, ...providers].flatMap((unit) =>
        [...unit.references, ...unit.provisionalReferences].map(
          (definition) => definition.importEntry,
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right))
  const runtimePortCardinalities = new Map<string, "one" | "many">()
  const runtimePortDeclarations = [
    ...input.graph.modules,
    ...input.graph.extensions,
    ...input.graph.plugins,
    ...input.graph.adapters,
    ...input.graph.providers,
  ].flatMap((unit) => unit.runtimePorts ?? [])
  for (const port of runtimePortDeclarations) {
    const cardinality = port.cardinality ?? "one"
    const existing = runtimePortCardinalities.get(port.id)
    if (existing && existing !== cardinality) {
      throw new Error(
        `buildGraphRuntimeModule: runtime port "${port.id}" mixes one and many cardinalities.`,
      )
    }
    runtimePortCardinalities.set(port.id, cardinality)
  }
  const manyRuntimePorts = [
    ...new Set(
      [...modules, ...extensions, ...plugins, ...adapters, ...providers].flatMap(
        (unit) => unit.manyRuntimePorts,
      ),
    ),
  ].sort((left, right) => left.localeCompare(right))
  const customFieldTargets = [...modules, ...extensions, ...plugins, ...adapters, ...providers]
    .flatMap((unit) => unit.customFieldTargets)
    .sort((left, right) => left.id.localeCompare(right.id))
  const command = input.command ?? "voyant deployment graph emit"
  const contributors = input.graph.packageRecords
    .flatMap((record) => {
      const runtime = record.metadata?.runtime
      if (!runtime) return []
      if (
        !runtime.entry.startsWith("./") ||
        runtime.entry.includes("\\") ||
        runtime.entry
          .slice(2)
          .split("/")
          .some((part) => part.length === 0 || part === "." || part === "..")
      ) {
        throw new Error(
          `buildGraphRuntimeModule: package runtime entry "${runtime.entry}" for ${record.packageName} must be an owner-relative package export.`,
        )
      }
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(runtime.export)) {
        throw new Error(
          `buildGraphRuntimeModule: package runtime export "${runtime.export}" for ${record.packageName} is invalid.`,
        )
      }
      const entry = `${record.packageName}/${runtime.entry.slice(2)}`
      return [
        {
          packageName: record.packageName,
          entry,
          importEntry: input.runtimeEntryOverrides?.[entry] ?? entry,
          exportName: runtime.export,
        },
      ]
    })
    .sort((left, right) => left.packageName.localeCompare(right.packageName))
  const contributorImports = contributors
    .map(
      (contributor, index) =>
        `import { ${contributor.exportName} as GENERATED_RUNTIME_CONTRIBUTOR_${index} } from ${quote(contributor.importEntry)}`,
    )
    .join("\n")
  const contributorFactories = contributors
    .map((_contributor, index) => `  GENERATED_RUNTIME_CONTRIBUTOR_${index},`)
    .join("\n")

  return `// GENERATED by ${command} - do not edit.
// Package facet bodies remain lazy; runtime contributors are statically selected at build time.

${contributorImports}
import {
  createVoyantGraphRuntime,
  type VoyantGraphRuntime,
} from "@voyant-travel/framework/deployment-artifacts"
import type {
  VoyantGraphRuntimeContributor,
  VoyantGraphRuntimeContributorHost,
  VoyantGraphRuntimePorts,
} from "@voyant-travel/framework"

export const GENERATED_GRAPH_RUNTIME_HASH = ${quote(input.graph.contentHash)} as const
export const GENERATED_GRAPH_RUNTIME_ENTRY_SPECIFIERS = ${formatConstArray(publicEntries)}
export const GENERATED_GRAPH_RUNTIME_CONTRIBUTOR_SPECIFIERS = ${formatConstArray(
    contributors.map((contributor) => contributor.entry),
  )}
export const GENERATED_GRAPH_RUNTIME_MODULE_IDS = ${formatConstArray(
    modules.map((unit) => unit.id),
  )}
export const GENERATED_GRAPH_RUNTIME_EXTENSION_IDS = ${formatConstArray(
    extensions.map((unit) => unit.id),
  )}
export const GENERATED_GRAPH_RUNTIME_PLUGIN_IDS = ${formatConstArray(
    plugins.map((unit) => unit.id),
  )}
export const GENERATED_GRAPH_RUNTIME_ADAPTER_IDS = ${formatConstArray(
    adapters.map((unit) => unit.id),
  )}
export const GENERATED_GRAPH_RUNTIME_PROVIDER_IDS = ${formatConstArray(
    providers.map((unit) => unit.id),
  )}
export const GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS = ${formatConstArray(manyRuntimePorts)}
export const GENERATED_GRAPH_RUNTIME_CUSTOM_FIELD_TARGETS = ${formatGeneratedValue(
    customFieldTargets,
    0,
  )} as const
export const GENERATED_GRAPH_RUNTIME_EVENT_CATALOG = ${formatGeneratedValue(
    input.graph.eventCatalog,
    0,
  )} as const
export const GENERATED_GRAPH_RUNTIME_REPORTING_CATALOG = ${formatGeneratedValue(
    input.graph.reportingCatalog,
    0,
  )} as const
export const GENERATED_GRAPH_RUNTIME_WEBHOOK_PLAN = ${formatGeneratedValue(
    input.graph.webhookPlan,
    0,
  )} as const

const GENERATED_GRAPH_RUNTIME_IMPORTERS = ${formatRuntimeImporters(importerEntries)}

const GENERATED_GRAPH_RUNTIME_CONTRIBUTORS: readonly VoyantGraphRuntimeContributor[] = [
${contributorFactories}
]

export type GeneratedGraphRuntimeContributorHost = Omit<
  VoyantGraphRuntimeContributorHost,
  "customFieldTargets" | "getRuntimePort" | "getRuntimePorts"
> & {
  /** Selected graph providers and project-owned overrides available to contributors. */
  runtimePorts?: VoyantGraphRuntimePorts
}

function assertResolvedContributorHost(
  value: GeneratedGraphRuntimeContributorHost & VoyantGraphRuntimeContributorHost,
): asserts value is VoyantGraphRuntimeContributorHost {
  if (typeof value.getRuntimePort !== "function") {
    throw new TypeError("A generated runtime contributor host must resolve runtime ports.")
  }
}

export function createGeneratedGraphRuntimePorts(
  host: GeneratedGraphRuntimeContributorHost,
): VoyantGraphRuntimePorts {
  const { runtimePorts: initialRuntimePorts, ...contributorHostInput } = host
  const ports: Record<string, unknown> = { ...(initialRuntimePorts ?? {}) }
  const manyPortIds = new Set<string>(GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS)
  const contributorHost = {
    ...contributorHostInput,
    customFieldTargets: GENERATED_GRAPH_RUNTIME_CUSTOM_FIELD_TARGETS,
    hasRuntimePort(port: { id: string }): boolean {
      return Object.hasOwn(ports, port.id)
    },
    getRuntimePort(port: { id: string }): unknown {
      if (!Object.hasOwn(ports, port.id)) {
        throw new Error(
          \`Runtime port \${port.id} was read before its static contributor provided it.\`,
        )
      }
      return ports[port.id]
    },
    getRuntimePorts(port: { id: string }): readonly unknown[] {
      if (!Object.hasOwn(ports, port.id)) return []
      const value = ports[port.id]
      return manyPortIds.has(port.id) ? value as readonly unknown[] : [value]
    },
  }
  assertResolvedContributorHost(contributorHost)

  for (const contributor of GENERATED_GRAPH_RUNTIME_CONTRIBUTORS) {
    const contribution = contributor(contributorHost)
    for (const [id, value] of Object.entries(contribution)) {
      if (Object.hasOwn(ports, id)) {
        if (!manyPortIds.has(id)) {
          throw new Error(\`Runtime port \${id} has multiple static contributors.\`)
        }
        const values = ports[id]
        if (!Array.isArray(values)) {
          throw new Error(\`Many-valued runtime port \${id} was not initialized as an array.\`)
        }
        values.push(value)
        continue
      }
      ports[id] = manyPortIds.has(id) ? [value] : value
    }
  }
  return ports
}

export function createGeneratedGraphRuntime(
  providerSelections: Readonly<Record<string, string>> = ${formatGeneratedValue(
    input.graph.deployment.providers,
    2,
  )},
): VoyantGraphRuntime {
  return createVoyantGraphRuntime({
    graphHash: GENERATED_GRAPH_RUNTIME_HASH,
    accessCatalog: ${formatGeneratedValue(input.graph.accessCatalog, 4)},
    eventCatalog: GENERATED_GRAPH_RUNTIME_EVENT_CATALOG,
    reportingCatalog: GENERATED_GRAPH_RUNTIME_REPORTING_CATALOG,
    providerSelections,
    entries: GENERATED_GRAPH_RUNTIME_IMPORTERS,
    modules: ${formatGeneratedValue(modules, 4)},
    extensions: ${formatGeneratedValue(extensions, 4)},
    plugins: ${formatGeneratedValue(plugins, 4)},
    adapters: ${formatGeneratedValue(adapters, 4)},
    providerUnits: ${formatGeneratedValue(providers, 4)},
    webhookPlan: GENERATED_GRAPH_RUNTIME_WEBHOOK_PLAN,
  })
}
`
}

/** Emit the target-neutral application runtime used by lifecycle commands. */
export function buildProjectRuntimeModule(input: BuildProjectRuntimeModuleInput): string {
  if (input.graph.deployment.target !== undefined) {
    throw new Error(
      `buildProjectRuntimeModule: resolved graph must be target-neutral, got ${input.graph.deployment.target}.`,
    )
  }

  const graphRuntime = buildGraphRuntimeModule(input)
  const deployment = {
    ...(input.graph.deployment.mode ? { mode: input.graph.deployment.mode } : {}),
    providers: input.graph.deployment.providers,
    ...(input.graph.deployment.responseCache
      ? { responseCache: input.graph.deployment.responseCache }
      : {}),
  }

  return `${graphRuntime}
export const GENERATED_PROJECT_RUNTIME_KIND = "application" as const
export const GENERATED_PROJECT_RUNTIME_DEPLOYMENT = ${formatGeneratedValue(deployment, 0)} as const
export const GENERATED_PROJECT_PRODUCT_JOBS = ${formatGeneratedValue(
    input.graph.provisioning.jobs,
    0,
  )} as const

export function createGeneratedProjectRuntime() {
  return {
    kind: GENERATED_PROJECT_RUNTIME_KIND,
    graphHash: GENERATED_GRAPH_RUNTIME_HASH,
    deployment: GENERATED_PROJECT_RUNTIME_DEPLOYMENT,
    graphRuntime: createGeneratedGraphRuntime(),
    createGraphRuntime: createGeneratedGraphRuntime,
    createRuntimePorts: createGeneratedGraphRuntimePorts,
    productJobs: GENERATED_PROJECT_PRODUCT_JOBS,
  }
}

export default createGeneratedProjectRuntime
`
}

export function buildDeploymentArtifactManifest(
  input: BuildDeploymentArtifactManifestInput,
): VoyantDeploymentArtifactManifest {
  assertRelativeArtifactPath(input.graphArtifactPath, "graphArtifactPath")
  for (const entry of input.runtimeEntries) {
    assertRelativeArtifactPath(entry.file, `runtime entry "${entry.id}" file`)
    if (entry.graphHash !== input.graph.contentHash) {
      throw new Error(
        `runtime entry "${entry.id}" graphHash must match ${input.graph.contentHash}, got ${entry.graphHash}`,
      )
    }
  }

  return {
    schemaVersion: VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION,
    graphHash: input.graph.contentHash,
    graph: input.graphArtifactPath,
    accessCatalog: input.graph.accessCatalog,
    eventCatalog: input.graph.eventCatalog,
    reportingCatalog: input.graph.reportingCatalog,
    webhookPlan: input.graph.webhookPlan,
    runtimeEntries: [...input.runtimeEntries].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
    migrationSources: normalizeMigrationSources(input.migrationSources ?? []),
  }
}

/** Lower schema inputs for packages with migrations selected into the resolved graph. */
export function buildDeploymentMigrationSources(
  graph: ResolvedVoyantDeploymentGraph,
): VoyantDeploymentMigrationSourceArtifact[] {
  const units = allGraphUnits(graph)
  const migrationPackages = new Set(
    units
      .filter((unit) => unit.migrations.some((migration) => Boolean(migration.source)))
      .map((unit) => unit.packageName),
  )
  const sources = new Map<string, VoyantDeploymentMigrationSourceArtifact>()
  for (const unit of units) {
    if (!migrationPackages.has(unit.packageName)) continue
    for (const schema of unit.schema) {
      if (!schema.source) continue
      const source = { packageName: unit.packageName, schema: schema.source }
      sources.set(`${source.packageName}\0${source.schema}`, source)
    }
  }
  return [...sources.values()].sort(
    (left, right) =>
      left.packageName.localeCompare(right.packageName) || left.schema.localeCompare(right.schema),
  )
}

export function buildNodeRuntimeEntryArtifact(
  input: BuildNodeRuntimeEntryArtifactInput,
): VoyantDeploymentRuntimeEntryArtifact {
  assertRelativeArtifactPath(input.file, "file")
  return {
    id: input.id ?? VOYANT_NODE_RUNTIME_ENTRY_ID,
    target: input.graph.deployment.target ?? "node",
    file: input.file,
    graphHash: input.graph.contentHash,
    kind: "node",
  }
}

export function buildNodeRuntimeEntry(input: BuildNodeRuntimeEntryInput): string {
  assertRelativeArtifactPath(input.graphArtifactPath, "graphArtifactPath")
  const graphRuntimePath = input.graphRuntimePath ?? "./graph-runtime.generated.js"
  assertRelativeArtifactPath(graphRuntimePath, "graphRuntimePath")

  const command = input.command ?? "voyant deployment graph emit"
  return `// GENERATED by ${command} - do not edit.
// Recreate after changing project selection, the package lockfile, or graph resolver.
// The Node runtime consumes the admitted graph runtime directly.

import { readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  VoyantGraphDeploymentRequirements,
  VoyantGraphProvisionedJob,
} from "@voyant-travel/framework/deployment-graph"
import type { VoyantNodeRuntimeDeployment } from "@voyant-travel/framework/node-runtime"
import {
  createGeneratedGraphRuntime,
  createGeneratedGraphRuntimePorts,
} from ${quote(graphRuntimePath)}

export const GENERATED_DEPLOYMENT_GRAPH_SCHEMA_VERSION = ${quote(input.graph.schemaVersion)} as const
export const GENERATED_DEPLOYMENT_GRAPH_HASH = ${quote(input.graph.contentHash)} as const
export const GENERATED_DEPLOYMENT_GRAPH_TARGET = ${quote(input.graph.deployment.target)} as const
export const GENERATED_DEPLOYMENT_GRAPH_MODE = ${quote(input.graph.deployment.mode)} as const
export const GENERATED_DEPLOYMENT_GRAPH_ARTIFACT_PATH = ${quote(input.graphArtifactPath)} as const

export const GENERATED_DEPLOYMENT_GRAPH_MODULE_IDS = ${formatConstArray(
    input.graph.modules.map((unit) => unit.id),
  )}
export const GENERATED_DEPLOYMENT_GRAPH_EXTENSION_IDS = ${formatConstArray(
    input.graph.extensions.map((unit) => unit.id),
  )}
export const GENERATED_DEPLOYMENT_GRAPH_PLUGIN_IDS = ${formatConstArray(
    input.graph.plugins.map((unit) => unit.id),
  )}
export const GENERATED_DEPLOYMENT_GRAPH_ADAPTER_IDS = ${formatConstArray(
    input.graph.adapters.map((unit) => unit.id),
  )}
export const GENERATED_DEPLOYMENT_GRAPH_PROVIDER_IDS = ${formatConstArray(
    input.graph.providers.map((unit) => unit.id),
  )}
export const GENERATED_DEPLOYMENT_GRAPH_PACKAGE_NAMES = ${formatConstArray(
    input.graph.packageRecords.map((record) => record.packageName),
  )}
export const GENERATED_PRODUCT_JOBS = ${formatGeneratedValue(
    input.graph.provisioning.jobs,
    0,
  )} as const satisfies readonly VoyantGraphProvisionedJob[]

export function assertGeneratedDeploymentGraphArtifact(): void {
  const graph = readGeneratedDeploymentGraph()
  if (graph.schemaVersion !== GENERATED_DEPLOYMENT_GRAPH_SCHEMA_VERSION) {
    throw new Error(
      \`Generated deployment graph schemaVersion \${String(
        graph.schemaVersion,
      )} does not match \${GENERATED_DEPLOYMENT_GRAPH_SCHEMA_VERSION}\`,
    )
  }
  if (graph.contentHash !== GENERATED_DEPLOYMENT_GRAPH_HASH) {
    throw new Error(
      \`Generated deployment graph contentHash \${String(
        graph.contentHash,
      )} does not match \${GENERATED_DEPLOYMENT_GRAPH_HASH}\`,
    )
  }
  if (graph.deployment?.target !== GENERATED_DEPLOYMENT_GRAPH_TARGET) {
    throw new Error(
      \`Generated deployment graph target \${String(
        graph.deployment?.target,
      )} does not match \${GENERATED_DEPLOYMENT_GRAPH_TARGET}\`,
    )
  }
  if (graph.deployment?.mode !== GENERATED_DEPLOYMENT_GRAPH_MODE) {
    throw new Error(
      \`Generated deployment graph mode \${String(
        graph.deployment?.mode,
      )} does not match \${GENERATED_DEPLOYMENT_GRAPH_MODE}\`,
    )
  }
  const errorDiagnostics = Array.isArray(graph.diagnostics)
    ? graph.diagnostics.filter(isErrorDiagnostic)
    : []
  if (errorDiagnostics.length > 0) {
    throw new Error(
      \`Generated deployment graph contains \${errorDiagnostics.length} error diagnostic(s):\\n\${errorDiagnostics
        .map(formatGeneratedDiagnostic)
        .join("\\n")}\`,
    )
  }
}

export function resolveGeneratedDeploymentRequirements(): VoyantGraphDeploymentRequirements {
  const requirements = readGeneratedDeploymentGraph().requirements
  if (!requirements || typeof requirements !== "object" || Array.isArray(requirements)) {
    throw new Error("Generated deployment graph requirements are missing or invalid")
  }
  const candidate = requirements as { resources?: unknown }
  if (!Array.isArray(candidate.resources)) {
    throw new Error("Generated deployment graph requirements.resources must be an array")
  }
  return candidate as VoyantGraphDeploymentRequirements
}

export function resolveGeneratedRuntimeDeployment(): VoyantNodeRuntimeDeployment {
  const deployment = readGeneratedDeploymentGraph().deployment
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("Generated deployment graph deployment is missing or invalid")
  }
  const candidate = deployment as { mode?: unknown; providers?: unknown; responseCache?: unknown }
  if (
    candidate.mode !== "local" &&
    candidate.mode !== "managed-cloud" &&
    candidate.mode !== "self-hosted"
  ) {
    throw new Error("Generated deployment graph deployment.mode is invalid")
  }
  if (!isGeneratedRecord(candidate.providers)) {
    throw new Error("Generated deployment graph deployment.providers is missing or invalid")
  }
  const providers: VoyantNodeRuntimeDeployment["providers"] = ${formatRuntimeDeploymentProviders()}
  return {
    mode: candidate.mode,
    providers,
    ...(candidate.responseCache === undefined
      ? {}
      : { responseCache: generatedResponseCachePosture(candidate.responseCache) }),
  }
}

function generatedResponseCachePosture(
  value: unknown,
): NonNullable<VoyantNodeRuntimeDeployment["responseCache"]> {
  const edge = isGeneratedRecord(value) ? value.edge : undefined
  if (edge !== "declared" && edge !== "none") {
    throw new Error(
      'Generated deployment graph deployment.responseCache.edge must be "declared" or "none"',
    )
  }
  return { edge }
}

function requireGeneratedDeploymentProvider<
  Role extends keyof VoyantNodeRuntimeDeployment["providers"],
>(
  providers: Record<string, unknown>,
  role: Role,
): VoyantNodeRuntimeDeployment["providers"][Role] {
  const provider = providers[role]
  if (typeof provider !== "string" || provider.trim().length === 0) {
    throw new Error(
      \`Generated deployment graph deployment.providers.\${role} must be a non-empty string\`,
    )
  }
  return provider as VoyantNodeRuntimeDeployment["providers"][Role]
}

function isGeneratedRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readGeneratedDeploymentGraph(): {
  schemaVersion?: unknown
  contentHash?: unknown
  deployment?: { target?: unknown; mode?: unknown; providers?: unknown; responseCache?: unknown }
  requirements?: unknown
  diagnostics?: unknown
} {
  return JSON.parse(
    readFileSync(
      fileURLToPath(new URL(GENERATED_DEPLOYMENT_GRAPH_ARTIFACT_PATH, import.meta.url)),
      "utf8",
    ),
  ) as {
    schemaVersion?: unknown
    contentHash?: unknown
    deployment?: { target?: unknown; mode?: unknown; providers?: unknown; responseCache?: unknown }
    requirements?: unknown
    diagnostics?: unknown
  }
}

const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? "").href
if (isMainModule) {
  assertGeneratedDeploymentGraphArtifact()
  const deployment = resolveGeneratedRuntimeDeployment()
  const {
    createVoyantNodeEnv,
    createVoyantNodeRuntimeHostPrimitives,
    resolveVoyantNodeProviderPlan,
    startVoyantNodeRuntime,
  } = await import("@voyant-travel/framework/node-runtime")
  const env = createVoyantNodeEnv(
    process.env,
    resolveVoyantNodeProviderPlan(deployment.providers),
  )
  const primitives = createVoyantNodeRuntimeHostPrimitives({
    env,
    config: {
      "deployment.providers.adminAuth": deployment.providers.adminAuth,
      "deployment.providers.customerAuth": deployment.providers.customerAuth,
    },
  })
  const runtimePorts = createGeneratedGraphRuntimePorts({ primitives })
  const handle = await startVoyantNodeRuntime({
    deployment,
    deploymentRequirements: resolveGeneratedDeploymentRequirements(),
    env,
    graphRuntime: createGeneratedGraphRuntime(),
    jobs: GENERATED_PRODUCT_JOBS,
    runtimePorts,
    jobWakeups: {
      bind: (wakeAt) => {
        primitives.jobs.wakeAt = wakeAt
      },
    },
  })
  console.info(
    \`[node-runtime] Node runtime listening on :\${handle.port} (\${GENERATED_DEPLOYMENT_GRAPH_HASH})\`,
  )
}

function isErrorDiagnostic(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("severity" in value)) {
    return false
  }
  return (value as { severity?: unknown }).severity === "error"
}

function formatGeneratedDiagnostic(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "- unknown diagnostic"
  const diagnostic = value as { code?: unknown; message?: unknown; source?: unknown; facet?: unknown }
  const context = [
    typeof diagnostic.source === "string" ? \`source=\${diagnostic.source}\` : undefined,
    typeof diagnostic.facet === "string" ? \`facet=\${diagnostic.facet}\` : undefined,
  ]
    .filter(Boolean)
    .join(", ")
  return \`- \${String(diagnostic.code ?? "UNKNOWN")}: \${String(diagnostic.message ?? "")}\${
    context ? \` (\${context})\` : ""
  }\`
}
`
}

function assertGraphRuntimeLowerable(graph: ResolvedVoyantDeploymentGraph): void {
  const errors = graph.diagnostics.filter((diagnostic) => diagnostic.severity === "error")
  if (errors.length === 0) return

  throw new Error(
    `buildGraphRuntimeModule: resolved graph contains ${errors.length} error diagnostic(s):\n${errors
      .map(
        (diagnostic) =>
          `- ${diagnostic.code}: ${diagnostic.message}${diagnostic.source ? ` (source=${diagnostic.source})` : ""}`,
      )
      .join("\n")}`,
  )
}

function formatRuntimeImporters(entries: readonly string[]): string {
  if (entries.length === 0) {
    return "{} satisfies Readonly<Record<string, () => Promise<unknown>>>"
  }
  return `{
${entries.map((entry) => `  ${quote(entry)}: () => import(${quote(entry)}),`).join("\n")}
} satisfies Readonly<Record<string, () => Promise<unknown>>>`
}

function lowerAdminRuntimeEntry(unit: ResolvedVoyantGraphUnit, entry: string): string {
  return lowerFacetRuntimeEntry("buildGraphAdminBundleModule", unit, entry)
}

function lowerFacetRuntimeEntry(
  caller: string,
  unit: ResolvedVoyantGraphUnit,
  entry: string,
): string {
  if (!entry.startsWith(".")) return entry
  if (entry === "." || entry === "./") return unit.packageName
  if (!entry.startsWith("./") || entry.includes("\\")) {
    throw new Error(
      `${caller}: runtime entry "${entry}" for ${unit.id} must be an owner-relative package export.`,
    )
  }
  const parts = entry.slice(2).split("/")
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error(
      `${caller}: runtime entry "${entry}" for ${unit.id} contains an invalid package export path.`,
    )
  }
  return `${unit.packageName}/${parts.join("/")}`
}

function formatGeneratedValue(value: unknown, continuationIndent: number): string {
  const formatted = JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)
  return formatted.replaceAll("\n", `\n${" ".repeat(continuationIndent)}`)
}

function formatConstArray(values: readonly string[]): string {
  if (values.length === 0) return "[] as const"
  return `[\n${values.map((value) => `  ${quote(value)},`).join("\n")}\n] as const`
}

function formatRuntimeDeploymentProviders(): string {
  return `{\n${DEPLOYMENT_PROVIDER_ROLES.map(
    (role) =>
      `    ${role}: requireGeneratedDeploymentProvider(candidate.providers, ${quote(role)}),`,
  ).join("\n")}\n  }`
}

function quote(value: string | VoyantDeploymentMode | undefined): string {
  return JSON.stringify(value ?? null)
}

function normalizeMigrationSources(
  migrationSources: readonly VoyantDeploymentMigrationSourceArtifact[],
): VoyantDeploymentMigrationSourceArtifact[] {
  return migrationSources.map((source) => {
    assertRelativeArtifactPath(source.schema, `migration source "${source.packageName}" schema`)
    return { packageName: source.packageName, schema: source.schema }
  })
}

function assertRelativeArtifactPath(value: string, label: string): void {
  if (value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value)) {
    throw new Error(`${label} must be a relative path, got ${value}`)
  }
  if (value.includes("\\")) {
    throw new Error(`${label} must use POSIX separators, got ${value}`)
  }
}
