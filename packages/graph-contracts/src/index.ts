// agent-quality: file-size exception -- reason: project authoring validation stays import-cheap and centralized with its public serializable contracts.
/**
 * Import-cheap authoring contracts for package-owned deployment manifests.
 * Executable route, schema, UI, subscriber, job, and provider code is referenced by
 * package export, never imported from this module.
 */

import type {
  VoyantGraphAccessDeclaration,
  VoyantGraphActionDeclaration,
  VoyantGraphAdminDeclaration,
  VoyantGraphConfigDeclaration,
  VoyantGraphLifecycleDeclaration,
  VoyantGraphPresentationDeclaration,
  VoyantGraphProjectAccessDeclaration,
  VoyantGraphProviderDeclaration,
  VoyantGraphReportingCatalog,
  VoyantGraphReportingDeclaration,
  VoyantGraphResourceDeclaration,
  VoyantGraphSecretDeclaration,
  VoyantGraphSetupMigration,
  VoyantGraphToolDeclaration,
  VoyantGraphWebhookDeclaration,
} from "./facets.js"

export type * from "./facets.js"

export const VOYANT_GRAPH_PROJECT_SCHEMA_VERSION = "voyant.project.v1" as const
export const VOYANT_GRAPH_MODULE_SCHEMA_VERSION = "voyant.module.v1" as const
export const VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION = "voyant.extension.v1" as const
/** @deprecated Retired classification; see {@link definePlugin}. */
export const VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION = "voyant.plugin.v1" as const
export const VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION = "voyant.adapter.v1" as const
export const VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION = "voyant.provider.v1" as const

export type VoyantGraphUnitKind = "module" | "extension" | "plugin" | "adapter" | "provider"
export type VoyantGraphRouteSurface = "admin" | "public" | "webhook" | "internal"
export type VoyantGraphRouteMethod =
  | "DELETE"
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "PATCH"
  | "POST"
  | "PUT"

export type VoyantGraphJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly VoyantGraphJsonValue[]
  | { readonly [key: string]: VoyantGraphJsonValue }

export type VoyantGraphJsonObject = { readonly [key: string]: VoyantGraphJsonValue }

export interface VoyantGraphCapabilityDeclaration {
  capabilities?: readonly string[]
  ports?: readonly VoyantGraphPortDeclaration[]
}

export type VoyantGraphCustomFieldCapability =
  | "read"
  | "write"
  | "search"
  | "export"
  | "invoice"
  | "presentation"

/** An entity-owner declaration that Settings may expose as a custom-field target. */
export interface VoyantGraphCustomFieldTargetDeclaration {
  id: string
  /** Immutable namespace used by the target's owning deployment unit. */
  namespace: string
  label: string
  fieldTypes: readonly string[]
  capabilities: readonly VoyantGraphCustomFieldCapability[]
}

/** A selected target declaration lowered with its owning graph unit. */
export interface VoyantGraphCustomFieldTarget extends VoyantGraphCustomFieldTargetDeclaration {
  ownerUnitId: string
}

export interface VoyantGraphPortDeclaration {
  id: string
  optional?: boolean
  /** Additive static contributor aggregation. Valid only in a unit's runtimePorts. */
  cardinality?: "many"
  /** Lazy export of the owning typed VoyantPort used for startup conformance. */
  conformance?: VoyantGraphRuntimeReference
}

export interface VoyantPort<TProvider> {
  readonly id: string
  readonly test: (provider: TProvider) => void | Promise<void>
  /** Import-cheap reference back to this typed port for generic startup preflight. */
  readonly conformance?: VoyantGraphRuntimeReference
}

export function definePort<TProvider>(input: VoyantPort<TProvider>): VoyantPort<TProvider> {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(input.id)) {
    throw new Error(`Port id "${input.id}" must use dot-case namespace segments.`)
  }
  if (typeof input.test !== "function") {
    throw new Error(`Port "${input.id}" must provide a conformance test kit.`)
  }
  return Object.freeze({
    id: input.id,
    test: input.test,
    ...(input.conformance ? { conformance: input.conformance } : {}),
  })
}

export function providePort<TProvider>(port: VoyantPort<TProvider>): VoyantGraphPortDeclaration {
  return { id: port.id }
}

export function requirePort<TProvider>(
  port: VoyantPort<TProvider>,
  options: { optional?: boolean; cardinality?: "many" } = {},
): VoyantGraphPortDeclaration {
  return {
    id: port.id,
    ...(options.optional ? { optional: true } : {}),
    ...(options.cardinality ? { cardinality: options.cardinality } : {}),
    ...(port.conformance ? { conformance: port.conformance } : {}),
  }
}

export async function assertPortConforms<TProvider>(
  port: VoyantPort<TProvider>,
  provider: TProvider,
): Promise<void> {
  await port.test(provider)
}

export interface VoyantGraphRuntimeFactoryGraph {
  /** Explicit deployment provider selections keyed by provider role. */
  readonly providerSelections: Readonly<Record<string, string>>
  /** Read-only custom-field targets lowered from the selected entity manifests. */
  readonly customFieldTargets?: readonly VoyantGraphCustomFieldTarget[]
  readonly accessCatalog: {
    readonly resources: readonly {
      readonly id: string
      readonly unitId: string
      readonly resource: string
      readonly label: string
      readonly description: string
      readonly wildcard: "allow" | "explicit-resource"
      readonly remoteSafe?: boolean
      readonly actions: readonly {
        readonly action: string
        readonly label: string
        readonly description: string
        readonly sensitive?: boolean
        readonly remoteSafe?: boolean
        readonly wildcard?: "allow" | "explicit"
      }[]
      readonly legacyActions?: readonly string[]
    }[]
    readonly presets: readonly {
      readonly id: string
      readonly kind: "api-token" | "api-token-grant" | "staff"
      readonly label: string
      readonly description: string
      readonly grants: readonly string[]
      readonly audience?: "staff" | "customer" | "partner" | "supplier"
    }[]
  }
  /** Present on generated v1 runtimes; optional for direct factory test harnesses. */
  readonly eventCatalog?: VoyantGraphEventCatalog
  /** Source-free report datasets, presets, and page templates selected by the graph. */
  readonly reportingCatalog?: VoyantGraphReportingCatalog
  readonly tools: readonly {
    readonly referenceId: string
    readonly context?: readonly string[]
    load<T = unknown>(): Promise<T>
  }[]
  /** Action/approval policies admitted by the selected graph. */
  readonly actions?: readonly VoyantGraphActionDeclaration[]
  readonly references: readonly {
    readonly id: string
    readonly unitId: string
    readonly facet: string
    readonly entityId: string
    readonly importEntry: string
    load<T = unknown>(): Promise<T>
    loadModule<T extends Record<string, unknown> = Record<string, unknown>>(): Promise<T>
  }[]
  readonly setupSteps: readonly {
    readonly id: string
    readonly skippable: boolean
  }[]
}

export interface VoyantGraphRuntimeFactoryContext {
  readonly unitId: string
  /** Deployment bindings for fixed job invocations; absent on non-job facets. */
  readonly bindings?: unknown
  /** Validated JSON config authored on this package-scoped project selection. */
  readonly projectConfig: Readonly<VoyantGraphJsonObject>
  /** Read validated config for another explicitly selected unit by exact graph id. */
  getUnitProjectConfig(unitId: string): Readonly<VoyantGraphJsonObject> | undefined
  /** API facets selected for this runtime unit in the resolved graph. */
  readonly api: readonly Readonly<Pick<VoyantGraphRouteBundle, "id" | "surface">>[]
  /** Import-capable selected graph view for generic graph consumers such as MCP. */
  readonly graph: VoyantGraphRuntimeFactoryGraph
  /** Selected deployment providers keyed by their declared runtime-port id. */
  readonly runtimePorts: Readonly<Record<string, unknown>>
  /**
   * Options the composing deployment supplied for this unit.
   *
   * Ports carry behaviour a package declares it needs. This carries the
   * remainder: values a host knows and the graph cannot — a live plan
   * entitlement, a per-request allowance — that a package already accepts as a
   * runtime option but has no declared port for. It is merged into the default
   * factory invocation rather than replacing it, so a host contributing one
   * option keeps every other default and stays on the default path as the
   * package evolves.
   *
   * Empty when the deployment supplied nothing. A factory that accepts host
   * options should apply them last, after port-derived wiring: the deployment
   * composes the graph and is the authority over what it composed.
   */
  readonly hostOptions: Readonly<Record<string, unknown>>
  hasPort<TProvider>(port: VoyantPort<TProvider>): boolean
  getPort<TProvider>(port: VoyantPort<TProvider>): Promise<TProvider>
  getPorts<TProvider>(port: VoyantPort<TProvider>): Promise<readonly TProvider[]>
}

export type VoyantGraphRuntimeFactory<TResult = unknown> = (
  context: VoyantGraphRuntimeFactoryContext,
) => TResult | Promise<TResult>

const VOYANT_GRAPH_RUNTIME_FACTORY = Symbol.for("voyant.graph-runtime-factory.v1")

/** Mark an executable package export that consumes its manifest-declared ports. */
export function defineGraphRuntimeFactory<TResult>(
  factory: VoyantGraphRuntimeFactory<TResult>,
): VoyantGraphRuntimeFactory<TResult> {
  Object.defineProperty(factory, VOYANT_GRAPH_RUNTIME_FACTORY, { value: true })
  return factory
}

export function isGraphRuntimeFactory(value: unknown): value is VoyantGraphRuntimeFactory {
  return typeof value === "function" && Reflect.get(value, VOYANT_GRAPH_RUNTIME_FACTORY) === true
}

/** A symbolic package export resolved only after package admission. */
export interface VoyantGraphRuntimeReference {
  entry: string
  export?: string
}

export interface VoyantGraphRouteBundle {
  id: string
  surface: VoyantGraphRouteSurface
  methods?: readonly VoyantGraphRouteMethod[]
  mount?: string
  openapi?: VoyantGraphRouteOpenApi
  resource?: string
  /** Delegate capability checks to handlers while retaining surface authentication. */
  authorization?: "coarse" | "route"
  requiredScopes?: readonly string[]
  /** Anonymous public access for the whole public mount or route-relative path subsets. */
  anonymous?: boolean | readonly string[]
  /** Transactional DB routing for the whole mount or route-relative path subsets. */
  transactional?: boolean | readonly string[]
  runtime?: VoyantGraphRuntimeReference
}

/** Build-time API document ownership declared by the route bundle. */
export interface VoyantGraphRouteOpenApi {
  document: string
}

export interface VoyantGraphFacetEntity {
  id: string
  source?: string
  /** Named executable export when a facet source contains multiple declarations. */
  export?: string
}

/**
 * A migration facet, which may declare the ledger source names it absorbed.
 *
 * The migration ledger is keyed `(source, tag)`, and `source` is the unscoped
 * package name. When one package absorbs another's migration history — a module
 * consolidation — the tags move to a new source name and would otherwise re-run
 * against objects that already exist. `legacySources` names the retired sources
 * so the ledger lookup still finds those rows.
 *
 * This is for a pure ownership move: the tags and their SQL are carried over
 * byte-identical, so the content hashes still match. A migration whose SQL
 * changes, or which supersedes several retired tags with one new baseline, is a
 * different problem — see `SUPERSEDED_LEDGER_IDENTITIES` in
 * `@voyant-travel/framework-migrations`.
 */
export interface VoyantGraphMigrationFacet extends VoyantGraphFacetEntity {
  legacySources?: readonly string[]
}

/** Distinguishes entity metadata from executable cross-module link definitions. */
export interface VoyantGraphLinkDeclaration extends VoyantGraphFacetEntity {
  kind: "linkable" | "definition"
}

export interface VoyantGraphEvent extends VoyantGraphFacetEntity {
  eventType?: string
  /** Semantic version of the emitted payload contract. Required with payloadSchema. */
  version?: string
  /**
   * JSON Schema used for upgrade compatibility and external delivery projection.
   * Object properties are allowlisted; `writeOnly` or `x-voyant-redact` fields are redacted.
   */
  payloadSchema?: VoyantGraphJsonObject
  /** External events may be selected by deployment-owned outbound webhook subscriptions. */
  visibility?: "internal" | "external"
  /** Stable provenance copied into outbound delivery audit records. */
  audit?: {
    sourceModule: string
    category: "domain" | "internal"
  }
}

export const VOYANT_EVENT_CATALOG_SCHEMA_VERSION = "voyant.event-catalog.v1" as const

/** One versioned event contract compiled from a selected package manifest. */
export interface VoyantGraphEventCatalogEntry {
  /** Stable lookup identity for one event contract version. */
  key: string
  id: string
  unitId: string
  packageName: string
  eventType: string
  version: string
  payloadSchema: VoyantGraphJsonObject
  visibility: "internal" | "external"
  audit: {
    sourceModule: string
    category: "domain" | "internal"
  }
  /** JSON paths whose schema marks them write-only or explicitly redacted. */
  redactedFields: readonly string[]
}

/** Canonical event contracts derived exclusively from the selected graph. */
export interface VoyantGraphEventCatalog {
  schemaVersion: typeof VOYANT_EVENT_CATALOG_SCHEMA_VERSION
  events: readonly VoyantGraphEventCatalogEntry[]
}

/** External delivery is deny-by-default and requires an explicit object property allowlist. */
export function isExternalWebhookPayloadSchema(value: unknown): value is VoyantGraphJsonObject & {
  type: "object"
  properties: VoyantGraphJsonObject
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const schema = value as Record<string, unknown>
  return (
    schema.type === "object" &&
    schema.properties !== null &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
  )
}

export interface VoyantGraphSubscriber extends VoyantGraphFacetEntity {
  eventType?: string
  filter?: VoyantGraphJsonObject
  runtime?: VoyantGraphRuntimeReference
}

/** Package-owned cadence for a built-in product job. */
export type VoyantGraphJobSchedule = (
  | { cron: string; every?: never }
  | { every: string | number; cron?: never }
) & {
  timezone?: string
  overlap?: "skip" | "queue"
}

/**
 * Package-declared scheduling bounds for a product job. Hosts may select only
 * one of these named profiles; they never receive an arbitrary cron expression
 * or a different runtime handler.
 */
export interface VoyantGraphJobSchedulingPolicy {
  /** Named, package-owned alternatives to the job's default schedule. */
  profiles?: Readonly<Record<string, VoyantGraphJobSchedule>>
  /** Required jobs cannot be disabled by deployment configuration. */
  required?: boolean
}

/**
 * A package-owned background operation selected with its owning graph unit.
 *
 * Jobs deliberately have no input or payload declaration. Durable work remains
 * in the owning domain, while a host only schedules or wakes the fixed runtime
 * export selected by this declaration.
 */
export interface VoyantGraphJob extends VoyantGraphFacetEntity {
  runtime: VoyantGraphRuntimeReference
  /** The safe package default retained for existing job declarations. */
  schedule?: VoyantGraphJobSchedule
  /** Bounded host-resolved cadence choices; handlers and identities remain fixed. */
  scheduling?: VoyantGraphJobSchedulingPolicy
  /** Marks a job that may be prompted after its domain records durable work. */
  wakeup?: boolean
}

export interface VoyantGraphUnitManifest {
  schemaVersion:
    | typeof VOYANT_GRAPH_MODULE_SCHEMA_VERSION
    | typeof VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION
    | typeof VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION
    | typeof VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION
    | typeof VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION
  id: string
  localId?: string
  packageName?: string
  /** The package export that creates this unit's runtime module or extension. */
  runtime?: VoyantGraphRuntimeReference
  /** Deployment-supplied ports available only to this unit's runtime factories. */
  runtimePorts?: readonly VoyantGraphPortDeclaration[]
  customFieldTargets?: readonly VoyantGraphCustomFieldTargetDeclaration[]
  provides?: VoyantGraphCapabilityDeclaration
  requires?: VoyantGraphCapabilityDeclaration
  api?: readonly VoyantGraphRouteBundle[]
  schema?: readonly VoyantGraphFacetEntity[]
  migrations?: readonly VoyantGraphMigrationFacet[]
  links?: readonly VoyantGraphLinkDeclaration[]
  subscribers?: readonly VoyantGraphSubscriber[]
  events?: readonly VoyantGraphEvent[]
  jobs?: readonly VoyantGraphJob[]
  setupMigrations?: readonly VoyantGraphSetupMigration[]
  config?: readonly VoyantGraphConfigDeclaration[]
  secrets?: readonly VoyantGraphSecretDeclaration[]
  resources?: readonly VoyantGraphResourceDeclaration[]
  providers?: readonly VoyantGraphProviderDeclaration[]
  access?: VoyantGraphAccessDeclaration
  admin?: VoyantGraphAdminDeclaration
  presentations?: readonly VoyantGraphPresentationDeclaration[]
  reporting?: VoyantGraphReportingDeclaration
  tools?: readonly VoyantGraphToolDeclaration[]
  webhooks?: readonly VoyantGraphWebhookDeclaration[]
  actions?: readonly VoyantGraphActionDeclaration[]
  lifecycle?: VoyantGraphLifecycleDeclaration
  meta?: VoyantGraphJsonObject
}

export interface DefineVoyantGraphUnitInput extends Omit<VoyantGraphUnitManifest, "schemaVersion"> {
  schemaVersion?: VoyantGraphUnitManifest["schemaVersion"]
}

export interface DefineVoyantGraphProjectSelection {
  resolve: string
  config?: VoyantGraphJsonObject
}

export type DefineVoyantGraphProjectUnitInput =
  | string
  | DefineVoyantGraphProjectSelection
  | VoyantGraphUnitManifest

export type VoyantGraphProjectSelectionProvenance =
  | {
      kind: "package"
      packageName: string
      unitPath?: string
    }
  | {
      kind: "path"
      path: string
    }

/** Serializable author intent retained separately from package-owned facets. */
export interface VoyantGraphProjectSelection {
  id: string
  resolve: string
  packageName: string
  provenance: VoyantGraphProjectSelectionProvenance
  config?: VoyantGraphJsonObject
}

export interface VoyantGraphProjectSelections {
  modules: readonly VoyantGraphProjectSelection[]
  extensions: readonly VoyantGraphProjectSelection[]
  plugins: readonly VoyantGraphProjectSelection[]
  adapters: readonly VoyantGraphProjectSelection[]
  providers: readonly VoyantGraphProjectSelection[]
}

export const VOYANT_PRODUCT_BOM_REFERENCE_SCHEMA_VERSION =
  "voyant.product-bom-reference.v1" as const

/** Identifies the versioned product declaration expanded into an explicit project graph. */
export interface VoyantProductBomReference {
  schemaVersion: typeof VOYANT_PRODUCT_BOM_REFERENCE_SCHEMA_VERSION
  id: string
  version: string
}

export type VoyantGraphProjectDeploymentMode = "local" | "managed-cloud" | "self-hosted"

/** A migration folder owned by the deployment rather than an installed package. */
export interface VoyantGraphProjectDeploymentMigration {
  id: string
  /** Project-relative path to a committed Drizzle migration folder. */
  source: string
}

/**
 * How shared public responses reach requesters.
 *
 * `edge: "declared"` states that an HTTP cache in front of the origin honours
 * the route's `Cache-Control`; `"none"` states that the origin is the only
 * shared cache. Absent means undeclared, which reads as `"none"`.
 *
 * This is a deployment property, not a provider role: no component is resolved
 * from it, so it is not part of `providers`.
 */
export interface VoyantGraphProjectResponseCache {
  edge: "declared" | "none"
}

/**
 * Unified application graphs always compile to the Node runtime. Hosting
 * choices such as Voyant Cloud, Docker, Fly, or Railway are CLI target adapters
 * for that Node artifact, not alternate application runtimes.
 */
export interface VoyantGraphProjectDeployment {
  target?: "node"
  mode?: VoyantGraphProjectDeploymentMode
  providers?: Readonly<Record<string, string>>
  migrations?: readonly VoyantGraphProjectDeploymentMigration[]
  /** Declared by a deployment that mounts public routes. See ADR 0021 section 7. */
  responseCache?: VoyantGraphProjectResponseCache
}

/** A host preference may select only package-declared profile names. */
export interface VoyantGraphProjectJobScheduling {
  /** Applies to jobs that publish this profile, unless a job preference overrides it. */
  profile?: string
  /** Per-job profile selection, or false to disable an optional job. */
  jobs?: Readonly<Record<string, string | false>>
}

export interface DefineVoyantGraphProjectInput {
  schemaVersion?: typeof VOYANT_GRAPH_PROJECT_SCHEMA_VERSION
  productBom?: VoyantProductBomReference
  modules: readonly DefineVoyantGraphProjectUnitInput[]
  extensions?: readonly DefineVoyantGraphProjectUnitInput[]
  plugins?: readonly DefineVoyantGraphProjectUnitInput[]
  adapters?: readonly DefineVoyantGraphProjectUnitInput[]
  providers?: readonly DefineVoyantGraphProjectUnitInput[]
  access?: VoyantGraphProjectAccessDeclaration
  jobScheduling?: VoyantGraphProjectJobScheduling
  deployment?: VoyantGraphProjectDeployment
  meta?: VoyantGraphJsonObject
}

export interface VoyantGraphProject {
  schemaVersion: typeof VOYANT_GRAPH_PROJECT_SCHEMA_VERSION
  productBom?: VoyantProductBomReference
  modules: readonly VoyantGraphUnitManifest[]
  extensions: readonly VoyantGraphUnitManifest[]
  plugins: readonly VoyantGraphUnitManifest[]
  adapters: readonly VoyantGraphUnitManifest[]
  providers: readonly VoyantGraphUnitManifest[]
  selections?: VoyantGraphProjectSelections
  access?: VoyantGraphProjectAccessDeclaration
  jobScheduling?: VoyantGraphProjectJobScheduling
  deployment?: VoyantGraphProjectDeployment
  meta?: VoyantGraphJsonObject
}

export function defineModule(input: DefineVoyantGraphUnitInput): VoyantGraphUnitManifest {
  return defineGraphUnit(VOYANT_GRAPH_MODULE_SCHEMA_VERSION, input)
}

export function defineExtension(input: DefineVoyantGraphUnitInput): VoyantGraphUnitManifest {
  return defineGraphUnit(VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION, input)
}

/**
 * @deprecated RFC #3395 retired "plugin" as a classification — integrations are
 * apps or adapters. Use {@link defineAdapter} for a vendor or channel
 * integration, or {@link defineExtension} for a first-party graph contribution.
 * Kept so existing external adapters keep building while they migrate.
 */
export function definePlugin(input: DefineVoyantGraphUnitInput): VoyantGraphUnitManifest {
  return defineGraphUnit(VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION, input)
}

export function defineAdapter(input: DefineVoyantGraphUnitInput): VoyantGraphUnitManifest {
  return defineGraphUnit(VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION, input)
}

export function defineProvider(input: DefineVoyantGraphUnitInput): VoyantGraphUnitManifest {
  return defineGraphUnit(VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION, input)
}

export function defineProject(input: DefineVoyantGraphProjectInput): VoyantGraphProject {
  const schemaVersion = input.schemaVersion ?? VOYANT_GRAPH_PROJECT_SCHEMA_VERSION
  if (schemaVersion !== VOYANT_GRAPH_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `defineProject: schemaVersion must be "${VOYANT_GRAPH_PROJECT_SCHEMA_VERSION}".`,
    )
  }

  const modules = normalizeProjectUnits(input.modules, "module")
  const extensions = normalizeProjectUnits(input.extensions ?? [], "extension")
  const plugins = normalizeProjectUnits(input.plugins ?? [], "plugin")
  const adapters = normalizeProjectUnits(input.adapters ?? [], "adapter")
  const providers = normalizeProjectUnits(input.providers ?? [], "provider")
  const hasSelections =
    modules.selections.length > 0 ||
    extensions.selections.length > 0 ||
    plugins.selections.length > 0 ||
    adapters.selections.length > 0 ||
    providers.selections.length > 0
  const deployment = normalizeProjectDeployment(input.deployment)

  return {
    schemaVersion,
    ...(input.productBom ? { productBom: normalizeProductBomReference(input.productBom) } : {}),
    modules: modules.units,
    extensions: extensions.units,
    plugins: plugins.units,
    adapters: adapters.units,
    providers: providers.units,
    ...(hasSelections
      ? {
          selections: {
            modules: modules.selections,
            extensions: extensions.selections,
            plugins: plugins.selections,
            adapters: adapters.selections,
            providers: providers.selections,
          },
        }
      : {}),
    ...(input.access ? { access: normalizeProjectAccess(input.access) } : {}),
    ...(input.jobScheduling
      ? { jobScheduling: normalizeProjectJobScheduling(input.jobScheduling) }
      : {}),
    ...(deployment ? { deployment } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  }
}

function normalizeProjectJobScheduling(
  input: VoyantGraphProjectJobScheduling,
): VoyantGraphProjectJobScheduling {
  const profile =
    input.profile === undefined
      ? undefined
      : normalizeProfileName(input.profile, "jobScheduling.profile")
  const jobs = input.jobs
    ? Object.entries(input.jobs)
        .sort(([left], [right]) => left.localeCompare(right))
        .reduce<Record<string, string | false>>((normalized, [id, preference]) => {
          if (!id.trim())
            throw new Error("defineProject: jobScheduling.jobs keys must be non-empty job ids.")
          if (preference !== false && typeof preference !== "string") {
            throw new Error(
              `defineProject: jobScheduling.jobs.${id} must be a profile name or false.`,
            )
          }
          normalized[id] =
            preference === false
              ? false
              : normalizeProfileName(preference, `jobScheduling.jobs.${id}`)
          return normalized
        }, {})
    : undefined
  return {
    ...(profile ? { profile } : {}),
    ...(jobs && Object.keys(jobs).length ? { jobs } : {}),
  }
}

function normalizeProfileName(value: string, field: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`defineProject: ${field} must be a lower-case profile token.`)
  }
  return value
}

function normalizeProductBomReference(input: VoyantProductBomReference): VoyantProductBomReference {
  if (input.schemaVersion !== VOYANT_PRODUCT_BOM_REFERENCE_SCHEMA_VERSION) {
    throw new Error(
      `defineProject: productBom.schemaVersion must be "${VOYANT_PRODUCT_BOM_REFERENCE_SCHEMA_VERSION}".`,
    )
  }
  return {
    schemaVersion: input.schemaVersion,
    id: normalizeOptionalString(input.id, "productBom.id")!,
    version: normalizeOptionalString(input.version, "productBom.version")!,
  }
}

function normalizeProjectAccess(
  input: VoyantGraphProjectAccessDeclaration,
): VoyantGraphProjectAccessDeclaration {
  return {
    ...(input.presets?.length
      ? {
          presets: [...input.presets]
            .map((preset) => ({ ...preset, grants: [...new Set(preset.grants)].sort() }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
      : {}),
  }
}

function normalizeProjectDeployment(
  input: VoyantGraphProjectDeployment | undefined,
): VoyantGraphProjectDeployment | undefined {
  if (!input) return undefined

  const target = normalizeOptionalString(input.target, "deployment.target")
  if (target !== undefined && target !== "node") {
    throw new Error('defineProject: deployment.target must be "node".')
  }
  if (
    input.mode !== undefined &&
    input.mode !== "local" &&
    input.mode !== "managed-cloud" &&
    input.mode !== "self-hosted"
  ) {
    throw new Error(
      'defineProject: deployment.mode must be "local", "managed-cloud", or "self-hosted".',
    )
  }

  const providers: Record<string, string> = {}
  if (input.providers !== undefined) {
    if (!isPlainObject(input.providers)) {
      throw new Error("defineProject: deployment.providers must be a plain string record.")
    }
    for (const role of Object.keys(input.providers).sort((left, right) =>
      left.localeCompare(right),
    )) {
      if (role.trim().length === 0) {
        throw new Error("defineProject: deployment.providers keys must be non-empty strings.")
      }
      if (role === "auth") {
        throw new Error(
          "defineProject: deployment.providers.auth is no longer supported; select deployment.providers.adminAuth and deployment.providers.customerAuth explicitly.",
        )
      }
      const provider = normalizeOptionalString(
        input.providers[role],
        `deployment.providers.${role}`,
      )
      if (!provider) {
        throw new Error(`defineProject: deployment.providers.${role} must be a non-empty string.`)
      }
      providers[role] = provider
    }
  }

  const migrations = (input.migrations ?? [])
    .map((migration, index) => ({
      id: normalizeOptionalString(migration.id, `deployment.migrations[${index}].id`)!,
      source: normalizeProjectRelativePath(
        migration.source,
        `deployment.migrations[${index}].source`,
      ),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const duplicateMigration = migrations.find(
    (migration, index) => index > 0 && migrations[index - 1]?.id === migration.id,
  )
  if (duplicateMigration) {
    throw new Error(
      `defineProject: deployment.migrations contains duplicate id "${duplicateMigration.id}".`,
    )
  }

  let responseCache: VoyantGraphProjectResponseCache | undefined
  if (input.responseCache !== undefined) {
    if (!isPlainObject(input.responseCache)) {
      throw new Error("defineProject: deployment.responseCache must be a plain object.")
    }
    const edge = (input.responseCache as { edge?: unknown }).edge
    if (edge !== "declared" && edge !== "none") {
      throw new Error('defineProject: deployment.responseCache.edge must be "declared" or "none".')
    }
    responseCache = { edge }
  }

  if (
    !target &&
    input.mode === undefined &&
    Object.keys(providers).length === 0 &&
    migrations.length === 0 &&
    responseCache === undefined
  ) {
    return undefined
  }
  return {
    ...(target ? { target } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(Object.keys(providers).length > 0 ? { providers } : {}),
    ...(migrations.length > 0 ? { migrations } : {}),
    ...(responseCache ? { responseCache } : {}),
  }
}

function normalizeProjectRelativePath(value: unknown, label: string): string {
  const normalized = normalizeOptionalString(value, label)?.replaceAll("\\", "/")
  if (!normalized?.startsWith("./") || normalized.includes("#")) {
    throw new Error(`defineProject: ${label} must be a project-relative path starting with "./".`)
  }
  const segments: string[] = []
  for (const segment of normalized.slice(2).split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(`defineProject: ${label} must not escape the project.`)
      }
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  if (segments.length === 0) throw new Error(`defineProject: ${label} must identify a directory.`)
  return `./${segments.join("/")}`
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`defineProject: ${label} must be a non-empty string.`)
  }
  return value.trim()
}

function normalizeProjectUnits(
  inputs: readonly DefineVoyantGraphProjectUnitInput[],
  kind: VoyantGraphUnitKind,
): {
  units: VoyantGraphUnitManifest[]
  selections: VoyantGraphProjectSelection[]
} {
  const units: VoyantGraphUnitManifest[] = []
  const selections: VoyantGraphProjectSelection[] = []

  for (const [index, input] of inputs.entries()) {
    if (typeof input !== "string" && !isProjectSelection(input)) {
      units.push(input)
      continue
    }

    const label = `${projectUnitKindLabel(kind)}[${index}]`
    if (typeof input !== "string") {
      const unsupportedKeys = Object.keys(input).filter(
        (key) => key !== "resolve" && key !== "config",
      )
      if (unsupportedKeys.length > 0) {
        throw new Error(
          `defineProject: ${label} selection supports only "resolve" and serializable "config"; unsupported key "${unsupportedKeys.sort().join('", "')}".`,
        )
      }
    }
    const selection = normalizeProjectSelection(
      typeof input === "string" ? input : input.resolve,
      typeof input === "string" ? undefined : input.config,
      label,
    )
    units.push(
      defineGraphUnit(schemaVersionForGraphUnitKind(kind), {
        id: selection.id,
        packageName: selection.packageName,
      }),
    )
    selections.push(selection)
  }

  return { units, selections }
}

function projectUnitKindLabel(kind: VoyantGraphUnitKind): string {
  if (kind === "module") return "modules"
  if (kind === "extension") return "extensions"
  if (kind === "plugin") return "plugins"
  if (kind === "adapter") return "adapters"
  return "providers"
}

function schemaVersionForGraphUnitKind(
  kind: VoyantGraphUnitKind,
): VoyantGraphUnitManifest["schemaVersion"] {
  if (kind === "module") return VOYANT_GRAPH_MODULE_SCHEMA_VERSION
  if (kind === "extension") return VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION
  if (kind === "plugin") return VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION
  if (kind === "adapter") return VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION
  return VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION
}

function isProjectSelection(
  input: DefineVoyantGraphProjectSelection | VoyantGraphUnitManifest,
): input is DefineVoyantGraphProjectSelection {
  return "resolve" in input
}

function normalizeProjectSelection(
  resolve: string,
  config: VoyantGraphJsonObject | undefined,
  label: string,
): VoyantGraphProjectSelection {
  if (typeof resolve !== "string" || resolve.trim().length === 0) {
    throw new Error(`defineProject: ${label}.resolve must be a non-empty string.`)
  }

  const trimmed = resolve.trim().replaceAll("\\", "/")
  const normalized = isLocalPath(trimmed)
    ? normalizePathSelection(trimmed, label)
    : normalizePackageSelection(trimmed, label)

  return {
    ...normalized,
    ...(config === undefined ? {} : { config: normalizeJsonObject(config, `${label}.config`) }),
  }
}

function normalizePackageSelection(
  resolve: string,
  label: string,
): Omit<VoyantGraphProjectSelection, "config"> {
  const { reference, fragment } = splitSelectionFragment(resolve, label)
  const parts = reference.split("/")
  const scoped = reference.startsWith("@")
  const packageName = scoped ? parts.slice(0, 2).join("/") : (parts[0] ?? "")
  const packageNamePattern = scoped
    ? /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/
    : /^[a-z0-9][a-z0-9._-]*$/
  if ((scoped && parts.length < 2) || !packageNamePattern.test(packageName)) {
    throw new Error(
      `defineProject: ${label}.resolve must start with a canonical package name. Use "./" for a local path.`,
    )
  }

  const subpath = parts.slice(scoped ? 2 : 1).join("/")
  const unitPath = normalizeUnitPath([subpath, fragment].filter(Boolean).join("/"), label)
  const graphPackageId = scoped ? packageName : `npm/${packageName}`
  const id = unitPath ? `${graphPackageId}#${unitPath}` : graphPackageId

  return {
    id,
    resolve: id,
    packageName,
    provenance: {
      kind: "package",
      packageName,
      ...(unitPath ? { unitPath } : {}),
    },
  }
}

function normalizePathSelection(
  resolve: string,
  label: string,
): Omit<VoyantGraphProjectSelection, "config"> {
  const withoutFilePrefix = resolve.startsWith("file:") ? resolve.slice("file:".length) : resolve
  if (withoutFilePrefix.startsWith("/") || /^[a-zA-Z]:\//.test(withoutFilePrefix)) {
    throw new Error(
      `defineProject: ${label}.resolve must be project-relative; absolute local paths are not deterministic.`,
    )
  }

  const { reference, fragment } = splitSelectionFragment(withoutFilePrefix, label)
  const segments: string[] = []
  for (const segment of reference.split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      if (segments.length === 0) {
        throw new Error(
          `defineProject: ${label}.resolve must not escape the project with ".." segments.`,
        )
      }
      segments.pop()
      continue
    }
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(segment)) {
      throw new Error(
        `defineProject: ${label}.resolve local path segment "${segment}" must use lowercase letters, numbers, dots, underscores, or hyphens.`,
      )
    }
    segments.push(segment)
  }

  if (segments.length === 0) {
    throw new Error(`defineProject: ${label}.resolve must identify a local graph-unit path.`)
  }

  const path = `./${segments.join("/")}`
  const packageName = `local/${segments.join(".")}`
  const unitPath = normalizeUnitPath(fragment, label)
  const id = unitPath ? `${packageName}#${unitPath}` : packageName

  return {
    id,
    resolve: unitPath ? `${path}#${unitPath}` : path,
    packageName,
    provenance: { kind: "path", path },
  }
}

function isLocalPath(resolve: string): boolean {
  return (
    resolve.startsWith("./") ||
    resolve.startsWith("../") ||
    resolve.startsWith("/") ||
    resolve.startsWith("file:") ||
    /^[a-zA-Z]:\//.test(resolve)
  )
}

function splitSelectionFragment(
  resolve: string,
  label: string,
): { reference: string; fragment: string } {
  const separator = resolve.indexOf("#")
  if (separator === -1) return { reference: resolve, fragment: "" }
  if (resolve.indexOf("#", separator + 1) !== -1) {
    throw new Error(`defineProject: ${label}.resolve may contain only one "#" fragment.`)
  }

  const reference = resolve.slice(0, separator)
  const fragment = resolve.slice(separator + 1)
  if (reference.length === 0 || fragment.length === 0) {
    throw new Error(`defineProject: ${label}.resolve contains an empty package/path or fragment.`)
  }
  return { reference, fragment }
}

function normalizeUnitPath(value: string, label: string): string {
  if (!value) return ""
  const segments = value.split("/").filter(Boolean)
  if (segments.some((segment) => !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment))) {
    throw new Error(
      `defineProject: ${label}.resolve unit subpaths and fragments must use letters, numbers, dots, underscores, or hyphens.`,
    )
  }
  return segments.join(".")
}

function normalizeJsonObject(input: VoyantGraphJsonObject, label: string): VoyantGraphJsonObject {
  if (!isPlainObject(input)) {
    throw new Error(`defineProject: ${label} must be a plain JSON object.`)
  }
  return normalizeJsonValue(input, label, new Set()) as VoyantGraphJsonObject
}

function normalizeJsonValue(
  input: unknown,
  label: string,
  ancestors: Set<object>,
): VoyantGraphJsonValue {
  if (input === null || typeof input === "string" || typeof input === "boolean") return input
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`defineProject: ${label} must contain only finite JSON numbers.`)
    }
    return Object.is(input, -0) ? 0 : input
  }
  if (typeof input !== "object") {
    throw new Error(`defineProject: ${label} must contain only JSON-serializable values.`)
  }
  if (ancestors.has(input)) {
    throw new Error(`defineProject: ${label} must not contain circular references.`)
  }

  ancestors.add(input)
  try {
    if (Array.isArray(input)) {
      return input.map((value, index) => normalizeJsonValue(value, `${label}[${index}]`, ancestors))
    }
    if (!isPlainObject(input)) {
      throw new Error(`defineProject: ${label} must contain only plain JSON objects.`)
    }

    const normalized: Record<string, VoyantGraphJsonValue> = {}
    for (const key of Object.keys(input).sort((left, right) => left.localeCompare(right))) {
      Object.defineProperty(normalized, key, {
        configurable: true,
        enumerable: true,
        value: normalizeJsonValue(input[key], `${label}.${key}`, ancestors),
        writable: true,
      })
    }
    return normalized
  } finally {
    ancestors.delete(input)
  }
}

function isPlainObject(input: object): input is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function defineGraphUnit(
  schemaVersion: VoyantGraphUnitManifest["schemaVersion"],
  input: DefineVoyantGraphUnitInput,
): VoyantGraphUnitManifest {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? schemaVersion,
  }
}
