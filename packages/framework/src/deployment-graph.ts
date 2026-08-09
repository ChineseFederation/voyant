// agent-quality: file-size exception -- reason: deployment graph schemas, resolution, diagnostics, hashing, and author harness remain co-located until stable split points emerge.
import {
  defineExtension,
  defineModule,
  defineProject,
  isExternalWebhookPayloadSchema,
  VOYANT_EVENT_CATALOG_SCHEMA_VERSION,
  VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION,
  VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION,
  VOYANT_GRAPH_MODULE_SCHEMA_VERSION,
  VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION,
  VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION,
  type VoyantGraphAccessDeclaration,
  type VoyantGraphAccessPreset,
  type VoyantGraphAccessResource,
  type VoyantGraphActionAvailabilityCondition,
  type VoyantGraphActionDeclaration,
  type VoyantGraphAdminDeclaration,
  type VoyantGraphCapabilityDeclaration,
  type VoyantGraphConfigDeclaration,
  type VoyantGraphCustomFieldTarget,
  type VoyantGraphEvent,
  type VoyantGraphEventCatalog,
  type VoyantGraphEventCatalogEntry,
  type VoyantGraphFacetEntity,
  type VoyantGraphJob,
  type VoyantGraphJobSchedule,
  type VoyantGraphJobSchedulingPolicy,
  type VoyantGraphJsonObject,
  type VoyantGraphLifecycleDeclaration,
  type VoyantGraphLinkDeclaration,
  type VoyantGraphMessageReference,
  type VoyantGraphMigrationFacet,
  type VoyantGraphPortDeclaration,
  type VoyantGraphPresentationDeclaration,
  type VoyantGraphProject,
  type VoyantGraphProjectDeploymentMigration,
  type VoyantGraphProjectDeploymentMode,
  type VoyantGraphProjectJobScheduling,
  type VoyantGraphProjectResponseCache,
  type VoyantGraphProjectSelections,
  type VoyantGraphProviderDeclaration,
  type VoyantGraphReportingCatalog,
  type VoyantGraphReportingDeclaration,
  type VoyantGraphReportingRequirement,
  type VoyantGraphResourceDeclaration,
  type VoyantGraphRouteBundle,
  type VoyantGraphRouteMethod,
  type VoyantGraphRouteSurface,
  type VoyantGraphRuntimeReference,
  type VoyantGraphSecretDeclaration,
  type VoyantGraphSetupMigration,
  type VoyantGraphSubscriber,
  type VoyantGraphToolDeclaration,
  type VoyantGraphUnitKind,
  type VoyantGraphUnitManifest,
  type VoyantGraphWebhookDeclaration,
} from "@voyant-travel/core/project"

export { defineAdapter, definePlugin, defineProvider } from "@voyant-travel/core/project"

import type { AccessCatalog, AccessCatalogResource } from "@voyant-travel/types/api-keys"
import { resourceRequirementsForProvider } from "./deployment-requirements.js"
import type {
  VoyantDeploymentEnvRequirement,
  VoyantDeploymentProviderRole,
  VoyantDeploymentResourceRequirement,
} from "./deployment-types.js"
import { canonicalDeploymentProvider, DEPLOYMENT_PROVIDER_ROLES } from "./deployment-types.js"
import type { VoyantScheduledJob } from "./scheduled-jobs.js"

export const VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION = "voyant.deployment.v1" as const
export const VOYANT_GRAPH_PACKAGE_SCHEMA_VERSION = "voyant.package.v1" as const
export const VOYANT_RESOLVED_GRAPH_SCHEMA_VERSION = "voyant.resolved-graph.v1" as const

export type VoyantGraphPackageKind = VoyantGraphUnitKind | "framework" | "library"
export type VoyantGraphDiagnosticSeverity = "info" | "warning" | "error"
export type VoyantGraphPackageSourceKind = "registry" | "workspace" | "file" | "git" | "unknown"

export {
  type DefineVoyantGraphProjectInput,
  type DefineVoyantGraphProjectSelection,
  type DefineVoyantGraphProjectUnitInput,
  type DefineVoyantGraphUnitInput,
  defineExtension,
  defineModule,
  defineProject,
  VOYANT_EVENT_CATALOG_SCHEMA_VERSION,
  VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION,
  VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION,
  VOYANT_GRAPH_MODULE_SCHEMA_VERSION,
  VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION,
  VOYANT_GRAPH_PROJECT_SCHEMA_VERSION,
  VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION,
  type VoyantGraphAccessDeclaration,
  type VoyantGraphActionAvailabilityCondition,
  type VoyantGraphActionDeclaration,
  type VoyantGraphAdminDeclaration,
  type VoyantGraphCapabilityDeclaration,
  type VoyantGraphConfigDeclaration,
  type VoyantGraphCustomFieldTarget,
  type VoyantGraphCustomFieldTargetDeclaration,
  type VoyantGraphEvent,
  type VoyantGraphEventCatalog,
  type VoyantGraphEventCatalogEntry,
  type VoyantGraphFacetEntity,
  type VoyantGraphJob,
  type VoyantGraphJobSchedule,
  type VoyantGraphJobSchedulingPolicy,
  type VoyantGraphJsonObject,
  type VoyantGraphJsonValue,
  type VoyantGraphLifecycleDeclaration,
  type VoyantGraphMessageReference,
  type VoyantGraphMigrationFacet,
  type VoyantGraphPortDeclaration,
  type VoyantGraphPresentationDeclaration,
  type VoyantGraphProject,
  type VoyantGraphProjectJobScheduling,
  type VoyantGraphProjectSelection,
  type VoyantGraphProjectSelectionProvenance,
  type VoyantGraphProjectSelections,
  type VoyantGraphProviderDeclaration,
  type VoyantGraphReportingCatalog,
  type VoyantGraphReportingDataset,
  type VoyantGraphReportingDeclaration,
  type VoyantGraphReportingGridPlacement,
  type VoyantGraphReportingGridSize,
  type VoyantGraphReportingRequirement,
  type VoyantGraphReportingRequirementKind,
  type VoyantGraphReportingWidget,
  type VoyantGraphReportTemplate,
  type VoyantGraphResolvedReportingDataset,
  type VoyantGraphResolvedReportingWidget,
  type VoyantGraphResolvedReportTemplate,
  type VoyantGraphResourceDeclaration,
  type VoyantGraphRouteBundle,
  type VoyantGraphRouteMethod,
  type VoyantGraphRouteSurface,
  type VoyantGraphRuntimeReference,
  type VoyantGraphSecretDeclaration,
  type VoyantGraphSetupMigration,
  type VoyantGraphSubscriber,
  type VoyantGraphToolDeclaration,
  type VoyantGraphUnitKind,
  type VoyantGraphUnitManifest,
  type VoyantGraphWebhookDeclaration,
} from "@voyant-travel/core/project"

export const VOYANT_GRAPH_RESERVED_FACETS = [
  "admin",
  "slots",
  "copy",
  "openapi",
  "tools",
  "mcp",
  "permissions",
  "rbac",
  "scopes",
  "actions",
  "audit",
  "i18n",
  "config",
  "secrets",
  "emits",
  "outboundWebhooks",
  "lifecycle",
  "runtime",
] as const

export const VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY = {
  VOYANT_GRAPH_ARTIFACT_MISSING: "A generated deployment graph artifact is missing.",
  VOYANT_GRAPH_ARTIFACT_STALE: "A generated deployment graph artifact is stale.",
  VOYANT_GRAPH_CONFLICTING_CUSTOM_FIELD_NAMESPACE_OWNER:
    "Two selected graph units claim authority for the same custom-field namespace.",
  VOYANT_GRAPH_DUPLICATE_CUSTOM_FIELD_TARGET:
    "Two selected graph units claim authority for the same custom-field target.",
  VOYANT_GRAPH_DUPLICATE_ENTITY_ID: "Two v1 graph entities resolved to the same stable entity id.",
  VOYANT_GRAPH_DUPLICATE_EVENT_TYPE:
    "Two selected graph units claim authority for the same emitted event type.",
  VOYANT_GRAPH_DUPLICATE_EVENT_VERSION:
    "One selected graph unit declares the same emitted event type and version more than once.",
  VOYANT_GRAPH_DUPLICATE_ID: "Two selected graph units resolved to the same graph id.",
  VOYANT_GRAPH_INCOMPATIBLE_EVENT_SCHEMA:
    "An emitted-event payload schema is incompatible with its previous major-version contract.",
  VOYANT_GRAPH_INCOMPATIBLE_UPGRADE:
    "A selected package does not admit upgrades from the previous package version.",
  VOYANT_GRAPH_INVALID_CAPABILITY_TOKEN:
    "A provides/requires capability token does not match v1 namespace rules.",
  VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET:
    "A custom-field target declaration does not match the closed selected-graph contract.",
  VOYANT_GRAPH_INVALID_ENTITY_ID: "A v1 facet entity is missing a stable id or uses an invalid id.",
  VOYANT_GRAPH_INVALID_FACET: "A supported v1 facet does not match its closed metadata contract.",
  VOYANT_GRAPH_INVALID_ID: "A graph unit id is missing or is not a canonical package graph id.",
  VOYANT_GRAPH_INVALID_PROVIDER_SELECTION:
    "A deployment provider role is missing, unsupported, or ambiguously selected.",
  VOYANT_GRAPH_INVALID_REPORTING_FACET:
    "A reporting dataset, widget, or template does not match the closed graph contract.",
  VOYANT_GRAPH_INVALID_ROUTE_BUNDLE:
    "An API route bundle declaration does not match the v1 route metadata contract.",
  VOYANT_GRAPH_INVALID_SCHEMA_VERSION: "A graph declaration uses an unsupported schema version.",
  VOYANT_GRAPH_INVALID_SCOPE:
    "An API route bundle required scope does not match v1 resource:action syntax.",
  VOYANT_GRAPH_MANIFEST_LOAD_FAILED:
    "An admitted package manifest could not be loaded or did not declare the selected graph unit.",
  VOYANT_GRAPH_MANIFEST_OWNERSHIP_MISMATCH:
    "A package manifest declared a graph unit owned by a different package.",
  VOYANT_GRAPH_MISSING_CAPABILITY:
    "A selected graph unit requires a capability that no selected graph unit provides.",
  VOYANT_GRAPH_MISSING_PORT:
    "A selected graph unit requires a typed port that no selected graph unit provides.",
  VOYANT_GRAPH_PACKAGE_INCOMPATIBLE:
    "A package metadata record is incompatible with the selected target or deployment mode.",
  VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED:
    "A package source kind is not admitted by the configured graph admission policy.",
  VOYANT_GRAPH_REQUIRED_JOB_DISABLED:
    "A deployment configuration attempted to disable a required package-owned job.",
  VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED:
    "A graph runtime reference points to a package that did not pass admission.",
  VOYANT_GRAPH_UNKNOWN_FACET: "A graph unit manifest contains an unknown top-level facet.",
  VOYANT_GRAPH_UNKNOWN_JOB:
    "A deployment scheduling preference references a job not selected by the graph.",
  VOYANT_GRAPH_UNKNOWN_REFERENCE:
    "A package facet references an entity that is not present in the selected graph.",
  VOYANT_GRAPH_UNSUPPORTED_FACET:
    "A graph unit manifest uses a reserved facet that this toolchain does not support yet.",
  VOYANT_GRAPH_UNSUPPORTED_JOB_SCHEDULE_PROFILE:
    "A deployment scheduling preference is not declared by the package-owned job policy.",
} as const

export type VoyantGraphDiagnosticCode = keyof typeof VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY

export interface VoyantGraphSourceLocation {
  file?: string
  line?: number
  column?: number
}

export interface VoyantGraphDiagnostic {
  code: VoyantGraphDiagnosticCode
  severity: VoyantGraphDiagnosticSeverity
  source?: string
  facet?: string
  location?: VoyantGraphSourceLocation
  message: string
  hint?: string
}

export interface VoyantGraphScheduledJob {
  id: string
  cron: string
  description: string
  route: string
  module: string
}

/** Host-facing inventory for fixed jobs selected with product packages. */
export interface VoyantGraphProvisionedJob {
  id: string
  unitId: string
  packageName: string
  schedule?: VoyantGraphJobSchedule
  /** Declared bounds and the deterministic host-resolved selection. */
  scheduling?: {
    default?: VoyantGraphJobSchedule
    profiles: Readonly<Record<string, VoyantGraphJobSchedule>>
    required: boolean
    selected?: string
  }
  wakeup: boolean
}

export interface VoyantGraphInboundWebhookPlanEntry {
  id: string
  unitId: string
  packageName: string
  apiId: string
  apiUnitId: string
  mountPath: string
  secretIds: readonly string[]
}

export interface VoyantGraphOutboundWebhookPlanEntry {
  id: string
  unitId: string
  packageName: string
  eventId: string
  eventUnitId: string
  eventType: string
  eventVersion: string
  payloadSchema: VoyantGraphJsonObject
  visibility: "external"
  audit: {
    sourceModule: string
    category: "domain" | "internal"
  }
  secretIds: readonly string[]
}

/** Executable webhook posture compiled from only the selected graph units. */
export interface VoyantGraphWebhookPlan {
  inbound: readonly VoyantGraphInboundWebhookPlanEntry[]
  outbound: readonly VoyantGraphOutboundWebhookPlanEntry[]
}

export interface DefineVoyantGraphDeploymentInput {
  schemaVersion?: typeof VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION
  project: VoyantGraphProject
  target: VoyantGraphRuntimeTarget
  providers?: Partial<Record<VoyantDeploymentProviderRole | string, string>>
  migrations?: readonly VoyantGraphProjectDeploymentMigration[]
  mode?: VoyantGraphProjectDeploymentMode
  /** How shared public responses reach requesters. See ADR 0021 section 7. */
  responseCache?: VoyantGraphProjectResponseCache
  requirements?: VoyantGraphDeploymentRequirements
  meta?: VoyantGraphJsonObject
}

/** Unified Voyant applications always execute as resident Node processes. */
export type VoyantGraphRuntimeTarget = "node"

export interface VoyantGraphDeploymentRequirements {
  resources: readonly VoyantDeploymentResourceRequirement[]
}

export interface VoyantGraphDeployment {
  schemaVersion: typeof VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION
  project: VoyantGraphProject
  target: VoyantGraphRuntimeTarget
  providers: Partial<Record<VoyantDeploymentProviderRole | string, string>>
  migrations?: readonly VoyantGraphProjectDeploymentMigration[]
  mode?: VoyantGraphProjectDeploymentMode
  /** How shared public responses reach requesters. See ADR 0021 section 7. */
  responseCache?: VoyantGraphProjectResponseCache
  requirements: VoyantGraphDeploymentRequirements
  meta?: VoyantGraphJsonObject
}

export interface VoyantGraphPackageMetadata {
  schemaVersion: typeof VOYANT_GRAPH_PACKAGE_SCHEMA_VERSION
  kind: VoyantGraphPackageKind
  /** Import-cheap package export containing package-owned graph declarations. */
  manifest?: string
  /** Package-owned runtime-port contributor selected and statically lowered with the graph. */
  runtime?: Required<Pick<VoyantGraphRuntimeReference, "entry" | "export">>
  compatibleWith?: {
    framework?: string
    targets?: readonly string[]
    modes?: readonly VoyantGraphProjectDeploymentMode[]
  }
  requires?: VoyantGraphCapabilityDeclaration
  /** Package schema export and its package-level migration dependencies. */
  schema?: string
  requiresSchemas?: readonly string[]
  /**
   * Retired ledger source names this package's `migrations/` folder absorbed.
   *
   * The ledger is keyed `(source, tag)` on the unscoped package name. When a
   * module consolidation moves another package's tags into this one, they would
   * otherwise not be found under the new name and would re-run against objects
   * that already exist. This belongs to the PACKAGE rather than to its graph
   * migration facet because a source-free managed image loads a module's
   * migrations by package name without resolving the graph — the same reason
   * `requiresSchemas` lives here. See voyant#4330.
   *
   * For a pure ownership move only: the tags and their SQL carry over
   * byte-identical, so the content hashes still match. A migration whose SQL
   * changes, or which supersedes several retired tags with one new baseline, is
   * a different problem — see `SUPERSEDED_LEDGER_IDENTITIES` in
   * `@voyant-travel/framework-migrations`.
   */
  legacyMigrationSources?: readonly string[]
}

export interface VoyantGraphPackageRecord {
  packageName: string
  version?: string
  source: {
    kind: VoyantGraphPackageSourceKind
    reference?: string
    integrity?: string
  }
  metadata?: VoyantGraphPackageMetadata
}

export type VoyantPackageMetadata = VoyantGraphPackageMetadata

export interface VoyantGraphAdmissionPolicy {
  allowedSourceKinds?: readonly VoyantGraphPackageSourceKind[]
}

export interface ResolveDeploymentGraphInput {
  project: VoyantGraphProject
  deployment?: Omit<VoyantGraphDeployment, "project" | "schemaVersion" | "target"> & {
    schemaVersion?: typeof VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION
    target?: VoyantGraphRuntimeTarget
  }
  packageRecords?: readonly VoyantGraphPackageRecord[]
  scheduledJobs?: readonly (VoyantScheduledJob | VoyantGraphScheduledJob)[]
  frameworkVersion?: string
  target?: VoyantGraphRuntimeTarget
  mode?: VoyantGraphProjectDeploymentMode
  admission?: VoyantGraphAdmissionPolicy
}

export interface ResolveDeploymentGraphWithPackageManifestsInput
  extends ResolveDeploymentGraphInput {
  loadPackageManifests: (
    record: VoyantGraphPackageRecord,
  ) => Promise<readonly VoyantGraphUnitManifest[]>
}

export interface CreateTestDeploymentInput {
  modules: readonly VoyantGraphUnitManifest[]
  extensions?: readonly VoyantGraphUnitManifest[]
  plugins?: readonly VoyantGraphUnitManifest[]
  adapters?: readonly VoyantGraphUnitManifest[]
  providers?: readonly VoyantGraphUnitManifest[]
  target?: VoyantGraphRuntimeTarget
  mode?: VoyantGraphProjectDeploymentMode
  packageRecords?: readonly VoyantGraphPackageRecord[]
}

export interface ResolvedVoyantGraphUnit {
  id: string
  kind: VoyantGraphUnitKind
  packageName: string
  localId?: string
  order: number
  /** JSON-safe values authored on this unit's project selection. */
  projectConfig?: VoyantGraphJsonObject
  runtime?: VoyantGraphRuntimeReference
  runtimePorts?: readonly VoyantGraphPortDeclaration[]
  customFieldTargets: readonly VoyantGraphCustomFieldTarget[]
  provides: {
    capabilities: readonly string[]
    ports: readonly VoyantGraphPortDeclaration[]
  }
  requires: {
    capabilities: readonly string[]
    ports: readonly VoyantGraphPortDeclaration[]
  }
  api: readonly VoyantGraphRouteBundle[]
  schema: readonly VoyantGraphFacetEntity[]
  migrations: readonly VoyantGraphMigrationFacet[]
  links: readonly VoyantGraphLinkDeclaration[]
  subscribers: readonly VoyantGraphSubscriber[]
  events: readonly VoyantGraphEvent[]
  jobs: readonly VoyantGraphJob[]
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
  actions?: readonly ResolvedVoyantGraphActionDeclaration[]
  lifecycle?: VoyantGraphLifecycleDeclaration
}

export interface ResolvedVoyantGraphActionDeclaration
  extends Omit<VoyantGraphActionDeclaration, "availability"> {
  /**
   * Conditional actions remain authored-unavailable in the resolved graph.
   * Exact-provider activation is process-local and never changes graph metadata.
   */
  availability?: VoyantGraphActionDeclaration["availability"]
}

export interface ResolvedVoyantDeploymentGraph {
  schemaVersion: typeof VOYANT_RESOLVED_GRAPH_SCHEMA_VERSION
  contentHash: string
  project: {
    productBom?: import("@voyant-travel/core/project").VoyantProductBomReference
  }
  deployment: {
    target?: VoyantGraphRuntimeTarget
    mode?: VoyantGraphProjectDeploymentMode
    providers: Partial<Record<VoyantDeploymentProviderRole | string, string>>
    migrations?: readonly VoyantGraphProjectDeploymentMigration[]
    responseCache?: VoyantGraphProjectResponseCache
  }
  requirements: VoyantGraphDeploymentRequirements
  modules: readonly ResolvedVoyantGraphUnit[]
  extensions: readonly ResolvedVoyantGraphUnit[]
  plugins: readonly ResolvedVoyantGraphUnit[]
  adapters: readonly ResolvedVoyantGraphUnit[]
  providers: readonly ResolvedVoyantGraphUnit[]
  capabilities: {
    provided: readonly string[]
    required: readonly string[]
  }
  packageRecords: readonly VoyantGraphPackageRecord[]
  accessCatalog: AccessCatalog
  eventCatalog: VoyantGraphEventCatalog
  reportingCatalog: VoyantGraphReportingCatalog
  webhookPlan: VoyantGraphWebhookPlan
  provisioning: {
    jobs: readonly VoyantGraphProvisionedJob[]
    scheduledJobs: readonly VoyantGraphScheduledJob[]
  }
  diagnostics: readonly VoyantGraphDiagnostic[]
}

export interface TestDeployment {
  graph: ResolvedVoyantDeploymentGraph
  doctor: {
    diagnostics: readonly VoyantGraphDiagnostic[]
    expectClean: () => void
  }
  migrations: {
    expectDeclared: (id: string) => void
    expectReplayParity: () => void
  }
  routes: {
    list: () => string[]
    expectMounted: (path: string) => void
  }
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

const SUPPORTED_GRAPH_UNIT_KEYS = new Set([
  "schemaVersion",
  "id",
  "localId",
  "packageName",
  "runtime",
  "runtimePorts",
  "customFieldTargets",
  "provides",
  "requires",
  "api",
  "schema",
  "migrations",
  "links",
  "subscribers",
  "events",
  "jobs",
  "setupMigrations",
  "config",
  "secrets",
  "resources",
  "providers",
  "access",
  "admin",
  "presentations",
  "reporting",
  "tools",
  "webhooks",
  "actions",
  "lifecycle",
  "meta",
])

const RESERVED_GRAPH_UNIT_KEYS = new Set<string>(VOYANT_GRAPH_RESERVED_FACETS)
const CAPABILITY_TOKEN_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/
const PORT_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/
const GRAPH_ID_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)(?:#[a-zA-Z0-9][a-zA-Z0-9._-]*)?$/
const ROUTE_RESOURCE_PATTERN = /^[a-z][a-z0-9-]*(?:[.-][a-z][a-z0-9-]*)*$/
const ROUTE_SCOPE_PATTERN =
  /^[a-z][a-z0-9-]*(?:[.-][a-z][a-z0-9-]*)*:[a-z][a-z0-9-]*(?:-[a-z][a-z0-9-]*)*$/
const OPENAPI_DOCUMENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ROUTE_METHODS = new Set<VoyantGraphRouteMethod>([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
])
const STANDARD_CAPABILITY_PREFIXES = new Set([
  "action-ledger",
  "booking",
  "bookings",
  "catalog",
  "commerce",
  "distribution",
  "finance",
  "identity",
  "inventory",
  "legal",
  "operations",
  "proposals",
  "relationships",
  "storefront",
  "trips",
])

export function defineDeployment(input: DefineVoyantGraphDeploymentInput): VoyantGraphDeployment {
  if (input.target !== "node") {
    throw new Error('defineDeployment: target must be "node".')
  }

  const providers = canonicalDeploymentProviders(input.providers)
  const deployment = {
    schemaVersion: input.schemaVersion ?? VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION,
    project: input.project,
    target: input.target,
    providers,
    ...(input.migrations?.length ? { migrations: [...input.migrations] } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.responseCache
      ? { responseCache: { edge: input.responseCache.edge } }
      : input.project.deployment?.responseCache
        ? { responseCache: { edge: input.project.deployment.responseCache.edge } }
        : {}),
    requirements: normalizeDeploymentRequirements(
      input.requirements ?? deriveDeploymentRequirements(providers),
    ),
    ...(input.meta ? { meta: input.meta } : {}),
  } satisfies VoyantGraphDeployment

  if (deployment.schemaVersion !== VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION) {
    throw new Error(
      `defineDeployment: schemaVersion must be "${VOYANT_GRAPH_DEPLOYMENT_SCHEMA_VERSION}".`,
    )
  }
  return deployment
}

export function deriveDeploymentRequirements(
  providers: Partial<Record<VoyantDeploymentProviderRole | string, string>> = {},
): VoyantGraphDeploymentRequirements {
  return normalizeDeploymentRequirements({
    resources: DEPLOYMENT_PROVIDER_ROLES.flatMap((role) => {
      const provider = providers[role]
      return typeof provider === "string" && provider.trim().length > 0
        ? resourceRequirementsForProvider(role, provider)
        : []
    }),
  })
}

function canonicalDeploymentProviders(
  providers: Partial<Record<VoyantDeploymentProviderRole | string, string>> = {},
): Partial<Record<VoyantDeploymentProviderRole | string, string>> {
  return Object.fromEntries(
    Object.entries(providers).map(([role, provider]) => [
      role,
      typeof provider === "string" ? canonicalDeploymentProvider(role, provider) : provider,
    ]),
  )
}

export function validateGraphUnitManifest(
  input: unknown,
  kind?: VoyantGraphUnitKind,
): VoyantGraphDiagnostic[] {
  if (!isRecord(input)) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_SCHEMA_VERSION",
        message: "Graph unit manifest must be an object.",
      }),
    ]
  }

  const source = typeof input.id === "string" ? input.id : undefined
  const diagnostics: VoyantGraphDiagnostic[] = []
  const expectedSchema = kind ? schemaVersionForGraphUnitKind(kind) : undefined

  if (
    input.schemaVersion !== VOYANT_GRAPH_MODULE_SCHEMA_VERSION &&
    input.schemaVersion !== VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION &&
    input.schemaVersion !== VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION &&
    input.schemaVersion !== VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION &&
    input.schemaVersion !== VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION
  ) {
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_SCHEMA_VERSION",
        source,
        facet: "schemaVersion",
        message: `schemaVersion must be "${VOYANT_GRAPH_MODULE_SCHEMA_VERSION}", "${VOYANT_GRAPH_EXTENSION_SCHEMA_VERSION}", "${VOYANT_GRAPH_PLUGIN_SCHEMA_VERSION}", "${VOYANT_GRAPH_ADAPTER_SCHEMA_VERSION}", or "${VOYANT_GRAPH_PROVIDER_SCHEMA_VERSION}".`,
      }),
    )
  } else if (kind && input.schemaVersion !== expectedSchema) {
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_SCHEMA_VERSION",
        source,
        facet: "schemaVersion",
        message: `${kind} manifests must use schemaVersion "${expectedSchema}".`,
      }),
    )
  }

  for (const key of Object.keys(input).sort()) {
    if (SUPPORTED_GRAPH_UNIT_KEYS.has(key)) continue
    diagnostics.push(
      diagnostic({
        code: RESERVED_GRAPH_UNIT_KEYS.has(key)
          ? "VOYANT_GRAPH_UNSUPPORTED_FACET"
          : "VOYANT_GRAPH_UNKNOWN_FACET",
        source,
        facet: key,
        message: RESERVED_GRAPH_UNIT_KEYS.has(key)
          ? `Facet "${key}" is reserved for a later graph version and is not supported by this toolchain.`
          : `Unknown graph manifest facet "${key}".`,
        hint: RESERVED_GRAPH_UNIT_KEYS.has(key)
          ? "Remove the facet until the running Voyant toolchain supports it."
          : 'Move package-owned opaque data under "meta", or use a supported v1 facet.',
      }),
    )
  }

  if (typeof input.id !== "string" || !isCanonicalGraphId(input.id)) {
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_ID",
        source,
        facet: "id",
        message: "Graph unit id must be a canonical package id with an optional package fragment.",
        hint: 'Use a package id such as "@acme/voyant-loyalty" or "@acme/voyant-suite#loyalty".',
      }),
    )
  }

  const packageName =
    typeof input.packageName === "string"
      ? input.packageName
      : typeof input.id === "string"
        ? packageNameFromGraphId(input.id)
        : undefined
  diagnostics.push(
    ...validateCapabilityDeclaration(input.provides, "provides", source, packageName),
  )
  diagnostics.push(
    ...validateCapabilityDeclaration(input.requires, "requires", source, packageName),
  )
  if (input.runtime !== undefined) {
    validateRuntimeReference(input.runtime, "runtime", source, diagnostics)
  }
  diagnostics.push(...validateRuntimePortDeclarations(input.runtimePorts, source))
  diagnostics.push(...validateCustomFieldTargets(input.customFieldTargets, source))
  diagnostics.push(...validateRouteBundles(input.api, source))
  diagnostics.push(...validateFacetEntities(input.schema, "schema", source))
  diagnostics.push(...validateFacetEntities(input.migrations, "migrations", source))
  diagnostics.push(...validateLinks(input.links, source))
  diagnostics.push(...validateSubscribers(input.subscribers, source))
  diagnostics.push(...validateEvents(input.events, source))
  diagnostics.push(...validateJobs(input.jobs, source))
  diagnostics.push(...validatePromotedFacets(input, source))

  return sortDiagnostics(diagnostics)
}

export async function resolveDeploymentGraph(
  input: ResolveDeploymentGraphInput,
): Promise<ResolvedVoyantDeploymentGraph> {
  const target = input.target ?? input.deployment?.target
  if (target !== undefined && target !== "node") {
    throw new Error('resolveDeploymentGraph: target must be "node".')
  }
  const mode = input.mode ?? input.deployment?.mode
  const deploymentProviders = canonicalDeploymentProviders(input.deployment?.providers)
  const requirements = normalizeDeploymentRequirements(input.deployment?.requirements)
  const migrations = input.deployment?.migrations ?? input.project.deployment?.migrations
  const responseCache = input.deployment?.responseCache ?? input.project.deployment?.responseCache
  const selectionConfigById = new Map(
    [
      ...(input.project.selections?.modules ?? []),
      ...(input.project.selections?.extensions ?? []),
      ...(input.project.selections?.plugins ?? []),
      ...(input.project.selections?.adapters ?? []),
      ...(input.project.selections?.providers ?? []),
    ]
      .filter((selection) => selection.config !== undefined)
      .map((selection) => [selection.id, selection.config!]),
  )
  const selectedModules = sortResolvedUnits(
    input.project.modules.map((unit) =>
      resolveUnit(unit, "module", selectionConfigById.get(unit.id)),
    ),
  )
  const selectedExtensions = sortResolvedUnits(
    (input.project.extensions ?? []).map((unit) =>
      resolveUnit(unit, "extension", selectionConfigById.get(unit.id)),
    ),
  )
  const selectedPlugins = sortResolvedUnits(
    input.project.plugins.map((unit) =>
      resolveUnit(unit, "plugin", selectionConfigById.get(unit.id)),
    ),
  )
  const selectedAdapters = sortResolvedUnits(
    (input.project.adapters ?? []).map((unit) =>
      resolveUnit(unit, "adapter", selectionConfigById.get(unit.id)),
    ),
  )
  const selectedProviders = sortResolvedUnits(
    (input.project.providers ?? []).map((unit) =>
      resolveUnit(unit, "provider", selectionConfigById.get(unit.id)),
    ),
  )
  const selectedUnits = [
    ...selectedModules,
    ...selectedExtensions,
    ...selectedPlugins,
    ...selectedAdapters,
    ...selectedProviders,
  ]

  const packageRecords = mergePackageRecords(
    selectedUnits,
    input.project.selections,
    input.packageRecords ?? [],
  )
  const scheduledJobs = normalizeScheduledJobs(input.scheduledJobs ?? [])
  const jobResolution = resolveProvisionedJobs(selectedUnits, input.project.jobScheduling)
  const provisionedJobs = jobResolution.jobs
  const provisionedJobsById = new Map(provisionedJobs.map((job) => [job.id, job]))
  const eventCatalog = compileEventCatalog(selectedUnits)
  const webhookPlan = compileWebhookPlan(selectedUnits)
  const accessCatalog = compileAccessCatalog(selectedUnits, input.project.access?.presets ?? [])
  const reportingCatalog = compileReportingCatalog(selectedUnits)
  const diagnostics = sortDiagnostics([
    ...selectedUnits.flatMap((unit) => validateGraphUnitManifest(unit.original, unit.kind)),
    ...validateDuplicateGraphIds(selectedUnits),
    ...validateDuplicateEventTypes(selectedUnits),
    ...validateDuplicateCustomFieldTargets(selectedUnits),
    ...validateFacetReferences(selectedUnits),
    ...validateCapabilityClosure(selectedUnits),
    ...validatePortClosure(selectedUnits),
    ...validateDuplicateEntityIds(selectedUnits),
    ...validateAccessCatalog(selectedUnits, input.project.access?.presets ?? []),
    ...validateDeploymentProviderSelections(selectedUnits, deploymentProviders),
    ...validateConditionalActionAvailability(selectedUnits, deploymentProviders),
    ...validatePackageAdmission(packageRecords, {
      frameworkVersion: input.frameworkVersion,
      target,
      mode,
      admission: input.admission,
    }),
    ...validateRuntimeReferenceAdmission(selectedUnits, packageRecords),
    ...jobResolution.diagnostics,
  ])

  const modules = selectedModules.map(({ original: _original, ...unit }) =>
    applyResolvedJobSchedules(resolveConditionalActionAvailability(unit), provisionedJobsById),
  )
  const extensions = selectedExtensions.map(({ original: _original, ...unit }) =>
    applyResolvedJobSchedules(resolveConditionalActionAvailability(unit), provisionedJobsById),
  )
  const plugins = selectedPlugins.map(({ original: _original, ...unit }) =>
    applyResolvedJobSchedules(resolveConditionalActionAvailability(unit), provisionedJobsById),
  )
  const adapters = selectedAdapters.map(({ original: _original, ...unit }) =>
    applyResolvedJobSchedules(resolveConditionalActionAvailability(unit), provisionedJobsById),
  )
  const providerUnits = selectedProviders.map(({ original: _original, ...unit }) =>
    applyResolvedJobSchedules(resolveConditionalActionAvailability(unit), provisionedJobsById),
  )
  const graphWithoutHash: Omit<ResolvedVoyantDeploymentGraph, "contentHash"> = {
    schemaVersion: VOYANT_RESOLVED_GRAPH_SCHEMA_VERSION,
    project: {
      ...(input.project.productBom ? { productBom: input.project.productBom } : {}),
    },
    deployment: {
      ...(target ? { target } : {}),
      ...(mode ? { mode } : {}),
      providers: deploymentProviders,
      ...(migrations?.length ? { migrations: [...migrations] } : {}),
      ...(responseCache ? { responseCache: { edge: responseCache.edge } } : {}),
    },
    requirements,
    modules,
    extensions,
    plugins,
    adapters,
    providers: providerUnits,
    capabilities: {
      provided: sortedUnique(selectedUnits.flatMap((unit) => unit.provides.capabilities)),
      required: sortedUnique(selectedUnits.flatMap((unit) => unit.requires.capabilities)),
    },
    packageRecords,
    accessCatalog,
    eventCatalog,
    reportingCatalog,
    webhookPlan,
    provisioning: {
      jobs: provisionedJobs,
      scheduledJobs,
    },
    diagnostics,
  }

  return {
    ...graphWithoutHash,
    contentHash: `sha256:${await sha256(graphWithoutHash)}`,
  }
}

/**
 * Resolve package selection and admission first, then import only manifests
 * belonging to packages that passed admission and resolve the graph again.
 */
export async function resolveDeploymentGraphWithPackageManifests(
  input: ResolveDeploymentGraphWithPackageManifestsInput,
): Promise<ResolvedVoyantDeploymentGraph> {
  const { loadPackageManifests, ...resolveInput } = input
  const admitted = await resolveDeploymentGraph(resolveInput)
  const admissionFailed = admitted.diagnostics.some(
    (entry) =>
      entry.severity === "error" &&
      (entry.code === "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE" ||
        entry.code === "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED"),
  )
  if (admissionFailed) return admitted

  const selectedUnits = [
    ...resolveInput.project.modules,
    ...(resolveInput.project.extensions ?? []),
    ...resolveInput.project.plugins,
    ...(resolveInput.project.adapters ?? []),
    ...(resolveInput.project.providers ?? []),
  ]
  const selectedIds = new Set(selectedUnits.map((unit) => unit.id))
  const replacements = new Map<string, VoyantGraphUnitManifest>()
  const diagnostics: VoyantGraphDiagnostic[] = []

  for (const record of admitted.packageRecords) {
    if (!record.metadata?.manifest) continue
    try {
      const manifests = await loadPackageManifests(record)
      let matched = false
      for (const manifest of manifests) {
        if (!selectedIds.has(manifest.id)) continue
        matched = true
        const idOwner = packageNameFromGraphId(manifest.id)
        const declaredOwner = manifest.packageName
        if (
          !isPackageGraphNamespace(idOwner, record.packageName) ||
          (declaredOwner !== undefined && declaredOwner !== record.packageName)
        ) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_MANIFEST_OWNERSHIP_MISMATCH",
              source: manifest.id,
              facet: "packageName",
              message: `Manifest loaded from ${record.packageName} declares unit ${manifest.id} in the ${idOwner} namespace${declaredOwner ? ` with packageName ${declaredOwner}` : ""}.`,
              hint: "A package may declare only its own package id or package-scoped fragments.",
            }),
          )
          continue
        }
        replacements.set(manifest.id, manifest)
      }
      if (!matched) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_MANIFEST_LOAD_FAILED",
            source: record.packageName,
            facet: "package.manifest",
            message: `Manifest ${record.metadata.manifest} does not declare any selected unit owned by ${record.packageName}.`,
          }),
        )
      }
    } catch (error) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_MANIFEST_LOAD_FAILED",
          source: record.packageName,
          facet: "package.manifest",
          message: `Failed to load admitted manifest ${record.metadata.manifest}: ${errorMessage(error)}.`,
        }),
      )
    }
  }

  const project: VoyantGraphProject = {
    ...resolveInput.project,
    modules: resolveInput.project.modules.map((unit) => replacements.get(unit.id) ?? unit),
    extensions: (resolveInput.project.extensions ?? []).map(
      (unit) => replacements.get(unit.id) ?? unit,
    ),
    plugins: resolveInput.project.plugins.map((unit) => replacements.get(unit.id) ?? unit),
    adapters: (resolveInput.project.adapters ?? []).map(
      (unit) => replacements.get(unit.id) ?? unit,
    ),
    providers: (resolveInput.project.providers ?? []).map(
      (unit) => replacements.get(unit.id) ?? unit,
    ),
  }
  const resolved = await resolveDeploymentGraph({ ...resolveInput, project })
  return diagnostics.length > 0 ? graphWithDiagnostics(resolved, diagnostics) : resolved
}

export async function createTestDeployment(
  input: CreateTestDeploymentInput,
): Promise<TestDeployment> {
  const project = defineProject({
    modules: input.modules,
    extensions: input.extensions ?? [],
    plugins: input.plugins ?? [],
    adapters: input.adapters ?? [],
    providers: input.providers ?? [],
  })
  const graph = await resolveDeploymentGraph({
    project,
    target: input.target ?? "node",
    mode: input.mode ?? "self-hosted",
    packageRecords: input.packageRecords,
  })

  return {
    graph,
    doctor: {
      diagnostics: graph.diagnostics,
      expectClean: () => {
        assert(
          graph.diagnostics.length === 0,
          `Expected deployment graph to be clean, got diagnostics:\n${formatDiagnostics(
            graph.diagnostics,
          )}`,
        )
      },
    },
    migrations: {
      expectDeclared: (id: string) => {
        const ids = graph.modules
          .flatMap((unit) => unit.migrations)
          .concat(graph.extensions.flatMap((unit) => unit.migrations))
          .concat(graph.plugins.flatMap((unit) => unit.migrations))
          .concat(graph.adapters.flatMap((unit) => unit.migrations))
          .concat(graph.providers.flatMap((unit) => unit.migrations))
          .map((migration) => migration.id)
        assert(ids.includes(id), `Expected deployment graph to include migration "${id}".`)
      },
      expectReplayParity: () => {
        const migrationIds = graph.modules
          .flatMap((unit) => unit.migrations)
          .concat(graph.extensions.flatMap((unit) => unit.migrations))
          .concat(graph.plugins.flatMap((unit) => unit.migrations))
          .concat(graph.adapters.flatMap((unit) => unit.migrations))
          .concat(graph.providers.flatMap((unit) => unit.migrations))
          .map((migration) => migration.id)
        const uniqueIds = new Set(migrationIds)
        assert(
          uniqueIds.size === migrationIds.length,
          "Expected deployment graph migrations to have unique stable ids.",
        )
      },
    },
    routes: {
      list: () => routePaths(graph),
      expectMounted: (path: string) => {
        const mounted = routePaths(graph)
        assert(
          mounted.includes(path),
          `Expected route "${path}" to be mounted. Mounted routes: ${mounted.join(", ") || "(none)"}`,
        )
      },
    },
  }
}

export function generateCustomSourceModuleManifests(
  specifiers: readonly string[] = [],
): VoyantGraphUnitManifest[] {
  return validCustomSourceSpecifiers(specifiers).map((specifier) =>
    defineModule({
      id: graphIdFromSpecifier(specifier),
      packageName: packageNameFromSpecifier(specifier),
      localId: localIdFromSpecifier(specifier),
      meta: { source: "custom-source" },
    }),
  )
}

export function generateCustomSourceExtensionManifests(
  specifiers: readonly string[] = [],
): VoyantGraphUnitManifest[] {
  return validCustomSourceSpecifiers(specifiers).map((specifier) =>
    defineExtension({
      id: graphIdFromSpecifier(specifier),
      packageName: packageNameFromSpecifier(specifier),
      localId: localIdFromSpecifier(specifier),
      meta: { source: "custom-source" },
    }),
  )
}

export function graphIdFromSpecifier(specifier: string): string {
  const { packageName, subpath } = splitPackageSpecifier(specifier)
  if (!subpath) return packageName
  return `${packageName}#${subpath.replaceAll("/", ".")}`
}

function localIdFromSpecifier(specifier: string): string {
  return specifier.replace(/^@voyant-travel\//, "").replaceAll("/", ".")
}

export function packageNameFromSpecifier(specifier: string): string {
  return splitPackageSpecifier(specifier).packageName
}

export function childGraphEntityId(parentId: string, childId: string): string {
  return parentId.includes("#") ? `${parentId}.${childId}` : `${parentId}#${childId}`
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export async function sha256(value: unknown): Promise<string> {
  const text = canonicalJson(value)
  const bytes = new TextEncoder().encode(text)
  const digest = await getCrypto().subtle.digest("SHA-256", bytes)
  return bytesToHex(new Uint8Array(digest))
}

function normalizeDeploymentRequirements(
  requirements: VoyantGraphDeploymentRequirements | undefined,
): VoyantGraphDeploymentRequirements {
  return {
    resources: [...(requirements?.resources ?? [])]
      .map(normalizeResourceRequirement)
      .sort(compareResourceRequirements),
  }
}

function normalizeResourceRequirement(
  requirement: VoyantDeploymentResourceRequirement,
): VoyantDeploymentResourceRequirement {
  return {
    resourceKey: requirement.resourceKey,
    roles: [...requirement.roles].sort(),
    provider: requirement.provider,
    required: requirement.required,
    env: [...requirement.env].sort(compareEnvRequirements).map((env) => ({
      name: env.name,
      ...(env.aliases?.length ? { aliases: [...env.aliases].sort() } : {}),
      ...(env.format ? { format: env.format } : {}),
      kind: env.kind,
      required: env.required,
      description: env.description,
    })),
    ...(requirement.notes ? { notes: requirement.notes } : {}),
  }
}

function normalizeScheduledJobs(
  jobs: readonly (VoyantScheduledJob | VoyantGraphScheduledJob)[],
): VoyantGraphScheduledJob[] {
  return jobs
    .map((job) => ({
      id: job.id,
      cron: job.cron,
      description: job.description,
      route: job.route,
      module: job.module,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

/** Keep generated runtime job declarations aligned with the resolved host inventory. */
function applyResolvedJobSchedules(
  unit: Omit<ResolvedVoyantGraphUnit, "original">,
  provisionedJobsById: ReadonlyMap<string, VoyantGraphProvisionedJob>,
): Omit<ResolvedVoyantGraphUnit, "original"> {
  return {
    ...unit,
    jobs: unit.jobs.flatMap((job) => {
      const provisioned = provisionedJobsById.get(job.id)
      if (!provisioned || provisioned.unitId !== unit.id) return []
      const { schedule: _schedule, ...withoutDeclaredSchedule } = job
      return [
        {
          ...withoutDeclaredSchedule,
          ...(provisioned.schedule ? { schedule: provisioned.schedule } : {}),
        },
      ]
    }),
  }
}

function resolveProvisionedJobs(
  units: readonly ResolvedVoyantGraphUnit[],
  preferences: VoyantGraphProjectJobScheduling | undefined,
): { jobs: VoyantGraphProvisionedJob[]; diagnostics: VoyantGraphDiagnostic[] } {
  const declared = units.flatMap((unit) => unit.jobs.map((job) => ({ unit, job })))
  const byId = new Map(declared.map((entry) => [entry.job.id, entry]))
  const diagnostics: VoyantGraphDiagnostic[] = []
  const configured = preferences?.jobs ?? {}

  for (const id of Object.keys(configured)) {
    if (!byId.has(id)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_UNKNOWN_JOB",
          facet: `jobScheduling.jobs.${id}`,
          message: `Scheduling preference references unknown selected product job "${id}".`,
        }),
      )
    }
  }
  if (
    preferences?.profile &&
    !declared.some(({ job }) => Object.hasOwn(job.scheduling?.profiles ?? {}, preferences.profile!))
  ) {
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_UNSUPPORTED_JOB_SCHEDULE_PROFILE",
        facet: "jobScheduling.profile",
        message: `Scheduling profile "${preferences.profile}" is not declared by any selected product job.`,
      }),
    )
  }

  const jobs = declared.flatMap(({ unit, job }): VoyantGraphProvisionedJob[] => {
    const policy = normalizeJobSchedulingPolicy(job.schedule, job.scheduling)
    const preference = Object.hasOwn(configured, job.id)
      ? configured[job.id]
      : policy.profiles[preferences?.profile ?? ""]
        ? preferences?.profile
        : undefined
    if (preference === false) {
      if (policy.required) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_REQUIRED_JOB_DISABLED",
            source: unit.id,
            facet: `jobScheduling.jobs.${job.id}`,
            message: `Required product job "${job.id}" cannot be disabled.`,
          }),
        )
      } else return []
    }
    let schedule = policy.default
    if (typeof preference === "string") {
      const selected = policy.profiles[preference]
      if (!selected) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_UNSUPPORTED_JOB_SCHEDULE_PROFILE",
            source: unit.id,
            facet: `jobScheduling.jobs.${job.id}`,
            message: `Product job "${job.id}" does not declare scheduling profile "${preference}".`,
          }),
        )
      } else schedule = selected
    }
    return [
      {
        id: job.id,
        unitId: unit.id,
        packageName: unit.packageName,
        ...(schedule ? { schedule } : {}),
        ...(job.scheduling
          ? {
              scheduling: {
                ...(policy.default ? { default: policy.default } : {}),
                profiles: policy.profiles,
                required: policy.required,
                ...(typeof preference === "string" && policy.profiles[preference]
                  ? { selected: preference }
                  : {}),
              },
            }
          : {}),
        wakeup: job.wakeup === true,
      },
    ]
  })
  return { jobs: jobs.sort((left, right) => left.id.localeCompare(right.id)), diagnostics }
}

function normalizeJobSchedulingPolicy(
  defaultSchedule: VoyantGraphJobSchedule | undefined,
  policy: VoyantGraphJobSchedulingPolicy | undefined,
): {
  default?: VoyantGraphJobSchedule
  profiles: Record<string, VoyantGraphJobSchedule>
  required: boolean
} {
  return {
    ...(defaultSchedule ? { default: defaultSchedule } : {}),
    profiles: Object.fromEntries(
      Object.entries(policy?.profiles ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
    required: policy?.required === true,
  }
}

function compareEnvRequirements(
  left: VoyantDeploymentEnvRequirement,
  right: VoyantDeploymentEnvRequirement,
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.kind.localeCompare(right.kind) ||
    Number(left.required) - Number(right.required) ||
    (left.aliases ?? []).join(",").localeCompare((right.aliases ?? []).join(",")) ||
    (left.format ?? "").localeCompare(right.format ?? "") ||
    left.description.localeCompare(right.description)
  )
}

function compareResourceRequirements(
  left: VoyantDeploymentResourceRequirement,
  right: VoyantDeploymentResourceRequirement,
): number {
  return (
    left.resourceKey.localeCompare(right.resourceKey) ||
    left.provider.localeCompare(right.provider) ||
    Number(left.required) - Number(right.required) ||
    left.roles.join(",").localeCompare(right.roles.join(","))
  )
}

function resolveUnit(
  unit: VoyantGraphUnitManifest,
  kind: VoyantGraphUnitKind,
  projectConfig?: VoyantGraphJsonObject,
): ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest } {
  const packageName = unit.packageName ?? packageNameFromGraphId(unit.id)
  return {
    original: unit,
    id: unit.id,
    kind,
    packageName,
    ...(unit.localId ? { localId: unit.localId } : {}),
    order: 0,
    ...(projectConfig ? { projectConfig } : {}),
    ...(unit.runtime ? { runtime: unit.runtime } : {}),
    runtimePorts: sortPorts(unit.runtimePorts ?? []),
    customFieldTargets: [...(unit.customFieldTargets ?? [])]
      .map((target) => ({
        ...target,
        namespace: target.namespace.trim(),
        ownerUnitId: unit.id,
        fieldTypes: sortedUnique(target.fieldTypes),
        capabilities: sortedUnique(target.capabilities),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    provides: {
      capabilities: sortedUnique(unit.provides?.capabilities ?? []),
      ports: sortPorts(unit.provides?.ports ?? []),
    },
    requires: {
      capabilities: sortedUnique(unit.requires?.capabilities ?? []),
      ports: sortPorts(unit.requires?.ports ?? []),
    },
    api: sortFacetEntities(unit.api ?? []).map((route) => ({
      ...route,
      ...(route.methods
        ? { methods: sortedUnique(route.methods) as VoyantGraphRouteMethod[] }
        : {}),
    })) as VoyantGraphRouteBundle[],
    schema: sortFacetEntities(unit.schema ?? []),
    migrations: sortFacetEntities(unit.migrations ?? []),
    links: sortFacetEntities(unit.links ?? []),
    subscribers: sortFacetEntities(unit.subscribers ?? []) as VoyantGraphSubscriber[],
    events: sortFacetEntities(unit.events ?? []) as VoyantGraphEvent[],
    jobs: sortFacetEntities(unit.jobs ?? []) as VoyantGraphJob[],
    ...(unit.setupMigrations?.length
      ? { setupMigrations: sortFacetEntities(unit.setupMigrations) }
      : {}),
    ...(unit.config?.length ? { config: sortFacetEntities(unit.config) } : {}),
    ...(unit.secrets?.length ? { secrets: sortFacetEntities(unit.secrets) } : {}),
    ...(unit.resources?.length ? { resources: sortFacetEntities(unit.resources) } : {}),
    ...(unit.providers?.length ? { providers: sortFacetEntities(unit.providers) } : {}),
    ...(unit.access
      ? {
          access: {
            ...(unit.access.resources?.length
              ? {
                  resources: sortFacetEntities(unit.access.resources).map((resource) => ({
                    ...resource,
                    actions: [...resource.actions].sort((left, right) =>
                      accessActionName(left).localeCompare(accessActionName(right)),
                    ),
                    ...(resource.legacyActions?.length
                      ? { legacyActions: sortedUnique(resource.legacyActions) }
                      : {}),
                  })),
                }
              : {}),
            ...(unit.access.roles?.length ? { roles: sortFacetEntities(unit.access.roles) } : {}),
          },
        }
      : {}),
    ...(unit.admin
      ? {
          admin: {
            ...(unit.admin.runtime ? { runtime: unit.admin.runtime } : {}),
            ...(unit.admin.shellRuntime ? { shellRuntime: unit.admin.shellRuntime } : {}),
            ...(unit.admin.loading ? { loading: unit.admin.loading } : {}),
            ...(unit.admin.compositionOrder !== undefined
              ? { compositionOrder: unit.admin.compositionOrder }
              : {}),
            ...(unit.admin.copy?.length ? { copy: sortFacetEntities(unit.admin.copy) } : {}),
            ...(unit.admin.routes?.length ? { routes: sortFacetEntities(unit.admin.routes) } : {}),
            ...(unit.admin.nav?.length ? { nav: sortFacetEntities(unit.admin.nav) } : {}),
            ...(unit.admin.slots?.length ? { slots: sortFacetEntities(unit.admin.slots) } : {}),
            ...(unit.admin.contributions?.length
              ? { contributions: sortFacetEntities(unit.admin.contributions) }
              : {}),
            ...(unit.admin.setupSteps?.length
              ? { setupSteps: sortFacetEntities(unit.admin.setupSteps) }
              : {}),
          },
        }
      : {}),
    ...(unit.presentations?.length ? { presentations: sortFacetEntities(unit.presentations) } : {}),
    ...(unit.reporting
      ? {
          reporting: {
            ...(unit.reporting.datasets?.length
              ? {
                  datasets: sortFacetEntities(unit.reporting.datasets).map((dataset) => ({
                    ...dataset,
                    ...(dataset.requiredScopes?.length
                      ? { requiredScopes: sortedUnique(dataset.requiredScopes) }
                      : {}),
                  })),
                }
              : {}),
            ...(unit.reporting.widgets?.length
              ? { widgets: sortFacetEntities(unit.reporting.widgets) }
              : {}),
            ...(unit.reporting.templates?.length
              ? {
                  templates: sortFacetEntities(unit.reporting.templates).map((template) => ({
                    ...template,
                    ...(template.requirements?.length
                      ? {
                          requirements: [...template.requirements].sort(
                            compareReportingRequirement,
                          ),
                        }
                      : {}),
                    widgets: [...template.widgets].sort((left, right) =>
                      left.id.localeCompare(right.id),
                    ),
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(unit.tools?.length ? { tools: sortFacetEntities(unit.tools) } : {}),
    ...(unit.webhooks?.length ? { webhooks: sortFacetEntities(unit.webhooks) } : {}),
    ...(unit.actions?.length ? { actions: sortFacetEntities(unit.actions) } : {}),
    ...(unit.lifecycle ? { lifecycle: unit.lifecycle } : {}),
  }
}

function validateRuntimePortDeclarations(
  value: unknown,
  source: string | undefined,
): VoyantGraphDiagnostic[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
        source,
        facet: "runtimePorts",
        message: "Runtime port declarations must be an array with stable dot-case ids.",
      }),
    ]
  }

  const diagnostics: VoyantGraphDiagnostic[] = []
  for (let index = 0; index < value.length; index += 1) {
    const port = value[index]
    if (!isRecord(port) || typeof port.id !== "string" || !PORT_ID_PATTERN.test(port.id)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `runtimePorts[${index}]`,
          message: "Runtime port declarations must include a stable dot-case id.",
        }),
      )
      continue
    }
    if (port.optional !== undefined && typeof port.optional !== "boolean") {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `runtimePorts[${index}].optional`,
          message: "Runtime port declaration optional must be a boolean when provided.",
        }),
      )
    }
    if (port.cardinality !== undefined && port.cardinality !== "many") {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `runtimePorts[${index}].cardinality`,
          message: 'Runtime port declaration cardinality must be "many" when provided.',
        }),
      )
    }
    if (port.conformance !== undefined) {
      validateRuntimeReference(
        port.conformance,
        `runtimePorts[${index}].conformance`,
        source,
        diagnostics,
      )
    }
  }
  return diagnostics
}

const CUSTOM_FIELD_CAPABILITIES = new Set([
  "read",
  "write",
  "search",
  "export",
  "invoice",
  "presentation",
])

function validateCustomFieldTargets(
  value: unknown,
  source: string | undefined,
): VoyantGraphDiagnostic[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
        source,
        facet: "customFieldTargets",
        message: "Custom-field targets must be an array of closed target declarations.",
      }),
    ]
  }

  const diagnostics: VoyantGraphDiagnostic[] = []
  for (let index = 0; index < value.length; index += 1) {
    const target = value[index]
    const facet = `customFieldTargets[${index}]`
    if (!isRecord(target)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet,
          message: "Custom-field target declarations must be objects.",
        }),
      )
      continue
    }
    if (typeof target.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(target.id)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet: `${facet}.id`,
          message: "Custom-field target ids must use stable lower-case kebab identifiers.",
        }),
      )
    }
    if (
      typeof target.namespace !== "string" ||
      !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(target.namespace) ||
      target.namespace === "custom" ||
      target.namespace.startsWith("app--")
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet: `${facet}.namespace`,
          message:
            "Custom-field target namespaces must be non-reserved stable lower-case dot-case identifiers.",
        }),
      )
    }
    if (typeof target.label !== "string" || target.label.trim().length === 0) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet: `${facet}.label`,
          message: "Custom-field targets must declare a non-empty operator label.",
        }),
      )
    }
    if (
      !Array.isArray(target.fieldTypes) ||
      target.fieldTypes.length === 0 ||
      target.fieldTypes.some((fieldType) => typeof fieldType !== "string" || !fieldType.trim())
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet: `${facet}.fieldTypes`,
          message: "Custom-field targets must declare at least one supported field type.",
        }),
      )
    }
    if (
      !Array.isArray(target.capabilities) ||
      target.capabilities.length === 0 ||
      target.capabilities.some(
        (capability) =>
          typeof capability !== "string" || !CUSTOM_FIELD_CAPABILITIES.has(capability),
      )
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_CUSTOM_FIELD_TARGET",
          source,
          facet: `${facet}.capabilities`,
          message:
            "Custom-field target capabilities must use the supported read/write/search/export/invoice/presentation vocabulary.",
        }),
      )
    }
  }
  return diagnostics
}

function sortResolvedUnits<
  T extends ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest },
>(units: readonly T[]): T[] {
  return [...units]
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) ||
        left.kind.localeCompare(right.kind) ||
        left.packageName.localeCompare(right.packageName),
    )
    .map((unit, index) => ({ ...unit, order: index }))
}

function validateCapabilityDeclaration(
  value: unknown,
  facet: "provides" | "requires",
  source: string | undefined,
  packageName: string | undefined,
): VoyantGraphDiagnostic[] {
  if (!isRecord(value)) return []
  const capabilities = value.capabilities
  const diagnostics: VoyantGraphDiagnostic[] = []
  if (Array.isArray(capabilities)) {
    for (const token of capabilities) {
      if (typeof token !== "string" || !CAPABILITY_TOKEN_PATTERN.test(token)) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_INVALID_CAPABILITY_TOKEN",
            source,
            facet: `${facet}.capabilities`,
            message: `Capability token "${String(token)}" must use dot-case namespace segments.`,
            hint: 'Use a token such as "identity.people" or "acme.loyalty.points".',
          }),
        )
        continue
      }

      if (!isFirstPartyPackage(packageName) && usesReservedCapabilityNamespace(token)) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_INVALID_CAPABILITY_TOKEN",
            source,
            facet: `${facet}.capabilities`,
            message: `Capability token "${token}" uses a Voyant-reserved namespace.`,
            hint: 'Third-party packages should prefix capabilities with a namespace they control, such as "acme.loyalty.points".',
          }),
        )
      }
    }
  }

  const ports = value.ports
  if (ports === undefined) return diagnostics
  if (!Array.isArray(ports)) {
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
        source,
        facet: `${facet}.ports`,
        message: "Port declarations must be an array with stable dot-case ids.",
      }),
    )
    return diagnostics
  }
  for (let index = 0; index < ports.length; index += 1) {
    const port = ports[index]
    if (!isRecord(port) || typeof port.id !== "string" || !PORT_ID_PATTERN.test(port.id)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `${facet}.ports[${index}]`,
          message: "Port declarations must include a stable dot-case id.",
        }),
      )
      continue
    }
    if (port.optional !== undefined && typeof port.optional !== "boolean") {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `${facet}.ports[${index}].optional`,
          message: "Port declaration optional must be a boolean when provided.",
        }),
      )
    }
    if (port.cardinality !== undefined) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
          source,
          facet: `${facet}.ports[${index}].cardinality`,
          message: "Port cardinality is supported only for statically composed runtimePorts.",
        }),
      )
    }
  }
  return diagnostics
}

function validateFacetEntities(
  value: unknown,
  facet: string,
  source: string | undefined,
): VoyantGraphDiagnostic[] {
  if (value == null) return []
  if (!Array.isArray(value)) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
        source,
        facet,
        message: `Facet "${facet}" must be an array of entities with stable id fields.`,
      }),
    ]
  }

  return value.flatMap((entry, index) => validateEntityId(entry, `${facet}[${index}]`, source))
}

function validateEvents(value: unknown, source: string | undefined): VoyantGraphDiagnostic[] {
  const diagnostics = validateFacetEntities(value, "events", source)
  validateEntityArray(value, "events", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.eventType, `${facet}.eventType`, source, diagnostics)
    if (typeof entry.version !== "string" || !/^\d+\.\d+\.\d+$/.test(entry.version)) {
      invalidFacet(
        `${facet}.version`,
        source,
        diagnostics,
        "Events must declare a semantic version such as 1.0.0.",
      )
    }
    if (!isRecord(entry.payloadSchema)) {
      invalidFacet(
        `${facet}.payloadSchema`,
        source,
        diagnostics,
        "Events must declare a JSON payload schema.",
      )
    }
    if (entry.visibility !== "internal" && entry.visibility !== "external") {
      invalidFacet(
        `${facet}.visibility`,
        source,
        diagnostics,
        "Events must declare internal or external visibility.",
      )
    }
    if (!isRecord(entry.audit)) {
      invalidFacet(
        `${facet}.audit`,
        source,
        diagnostics,
        "Events must declare audit sourceModule and category.",
      )
    } else {
      requireNonEmptyString(
        entry.audit.sourceModule,
        `${facet}.audit.sourceModule`,
        source,
        diagnostics,
      )
      if (entry.audit.category !== "domain" && entry.audit.category !== "internal") {
        invalidFacet(
          `${facet}.audit.category`,
          source,
          diagnostics,
          "Event audit category must be domain or internal.",
        )
      }
    }
  })
  return diagnostics
}

function validateLinks(value: unknown, source: string | undefined): VoyantGraphDiagnostic[] {
  const diagnostics = validateFacetEntities(value, "links", source)
  validateEntityArray(value, "links", source, diagnostics, (entry, facet) => {
    if (entry.kind !== "linkable" && entry.kind !== "definition") {
      invalidFacet(
        `${facet}.kind`,
        source,
        diagnostics,
        'Links must declare kind "linkable" or "definition".',
      )
    }
    requireNonEmptyString(entry.source, `${facet}.source`, source, diagnostics)
    if (entry.kind === "definition") {
      requireNonEmptyString(entry.export, `${facet}.export`, source, diagnostics)
    }
  })
  return diagnostics
}

function validatePromotedFacets(
  input: Record<string, unknown>,
  source: string | undefined,
): VoyantGraphDiagnostic[] {
  const diagnostics: VoyantGraphDiagnostic[] = []
  for (const facet of [
    "setupMigrations",
    "config",
    "secrets",
    "resources",
    "providers",
    "tools",
    "webhooks",
    "actions",
  ]) {
    diagnostics.push(...validateFacetEntities(input[facet], facet, source))
  }

  validateEntityArray(input.config, "config", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.key, `${facet}.key`, source, diagnostics)
    if (entry.validator !== undefined) {
      validateRuntimeReference(entry.validator, `${facet}.validator`, source, diagnostics)
    }
  })
  validateEntityArray(input.secrets, "secrets", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.key, `${facet}.key`, source, diagnostics)
    if (entry.validator !== undefined) {
      validateRuntimeReference(entry.validator, `${facet}.validator`, source, diagnostics)
    }
  })
  validateEntityArray(input.resources, "resources", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.kind, `${facet}.kind`, source, diagnostics)
  })
  const providerUseIds = {
    config: facetEntityIds(input.config),
    secrets: facetEntityIds(input.secrets),
    resources: facetEntityIds(input.resources),
  }
  validateEntityArray(input.providers, "providers", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.port, `${facet}.port`, source, diagnostics)
    if (entry.selection !== undefined) {
      if (!isRecord(entry.selection)) {
        invalidFacet(
          `${facet}.selection`,
          source,
          diagnostics,
          "Provider selection must declare a role/value object.",
        )
      } else {
        requireNonEmptyString(entry.selection.role, `${facet}.selection.role`, source, diagnostics)
        requireNonEmptyString(
          entry.selection.value,
          `${facet}.selection.value`,
          source,
          diagnostics,
        )
      }
    }
    if (entry.uses !== undefined) {
      if (!isRecord(entry.uses)) {
        invalidFacet(
          `${facet}.uses`,
          source,
          diagnostics,
          "Provider uses must declare config, secrets, or resources arrays.",
        )
      } else {
        for (const useFacet of ["config", "secrets", "resources"] as const) {
          const ids = entry.uses[useFacet]
          if (ids === undefined) continue
          if (!isStringArray(ids) || ids.some((id) => id.length === 0)) {
            invalidFacet(
              `${facet}.uses.${useFacet}`,
              source,
              diagnostics,
              `Provider ${useFacet} uses must be an array of declaration ids.`,
            )
            continue
          }
          for (const id of ids) {
            if (!providerUseIds[useFacet].has(id)) {
              invalidFacet(
                `${facet}.uses.${useFacet}`,
                source,
                diagnostics,
                `Provider references undeclared ${useFacet} id "${id}".`,
              )
            }
          }
        }
      }
    }
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
  })
  validateEntityArray(
    input.setupMigrations,
    "setupMigrations",
    source,
    diagnostics,
    (entry, facet) => {
      requireNonEmptyString(entry.source, `${facet}.source`, source, diagnostics)
      validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
    },
  )
  validateEntityArray(input.tools, "tools", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.name, `${facet}.name`, source, diagnostics)
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
    validateScopeArray(entry.requiredScopes, `${facet}.requiredScopes`, source, diagnostics)
  })
  validateEntityArray(input.webhooks, "webhooks", source, diagnostics, (entry, facet) => {
    if (entry.direction !== "inbound" && entry.direction !== "outbound") {
      invalidFacet(
        `${facet}.direction`,
        source,
        diagnostics,
        "Webhook direction must be inbound or outbound.",
      )
    } else if (entry.direction === "inbound") {
      requireNonEmptyString(entry.apiId, `${facet}.apiId`, source, diagnostics)
      if (entry.eventId !== undefined) {
        invalidFacet(
          `${facet}.eventId`,
          source,
          diagnostics,
          "Inbound webhooks cannot reference outbound events.",
        )
      }
    } else {
      requireNonEmptyString(entry.eventId, `${facet}.eventId`, source, diagnostics)
      if (entry.apiId !== undefined) {
        invalidFacet(
          `${facet}.apiId`,
          source,
          diagnostics,
          "Outbound webhooks cannot reference inbound APIs.",
        )
      }
    }
    if (entry.secretIds !== undefined && !isStringArray(entry.secretIds)) {
      invalidFacet(
        `${facet}.secretIds`,
        source,
        diagnostics,
        "Webhook secretIds must be an array of graph entity ids.",
      )
    }
  })
  validateEntityArray(input.actions, "actions", source, diagnostics, (entry, facet) => {
    if (entry.capabilityId !== undefined) {
      requireNonEmptyString(entry.capabilityId, `${facet}.capabilityId`, source, diagnostics)
    }
    requireNonEmptyString(entry.version, `${facet}.version`, source, diagnostics)
    requireNonEmptyString(entry.targetType, `${facet}.targetType`, source, diagnostics)
    if (entry.resource !== undefined) {
      requireNonEmptyString(entry.resource, `${facet}.resource`, source, diagnostics)
    }
    if (entry.action !== undefined) {
      requireNonEmptyString(entry.action, `${facet}.action`, source, diagnostics)
    }
    if (entry.commandTargetField !== undefined) {
      requireNonEmptyString(
        entry.commandTargetField,
        `${facet}.commandTargetField`,
        source,
        diagnostics,
      )
    }
    if (
      entry.targetLifecycle !== undefined &&
      entry.targetLifecycle !== "existing" &&
      entry.targetLifecycle !== "created"
    ) {
      invalidFacet(
        `${facet}.targetLifecycle`,
        source,
        diagnostics,
        'Action targetLifecycle must be "existing" or "created".',
      )
    }
    const availability = isRecord(entry.availability) ? entry.availability : undefined
    if (
      entry.availability !== undefined &&
      (!availability ||
        (availability.status !== "available" && availability.status !== "unavailable"))
    ) {
      invalidFacet(
        `${facet}.availability`,
        source,
        diagnostics,
        'Action availability must have status "available" or "unavailable".',
      )
    } else if (availability?.status === "unavailable") {
      requireNonEmptyString(
        availability.reasonCode,
        `${facet}.availability.reasonCode`,
        source,
        diagnostics,
      )
      if (availability.replacementCapabilityId !== undefined) {
        requireNonEmptyString(
          availability.replacementCapabilityId,
          `${facet}.availability.replacementCapabilityId`,
          source,
          diagnostics,
        )
      }
      if ("enableWhen" in availability) {
        validateActionAvailabilityCondition(
          availability.enableWhen,
          `${facet}.availability.enableWhen`,
          source,
          diagnostics,
        )
      }
    } else if (availability && "enableWhen" in availability) {
      invalidFacet(
        `${facet}.availability.enableWhen`,
        source,
        diagnostics,
        'Action enableWhen is valid only with the fail-closed status "unavailable".',
      )
    }
    if (
      entry.effectBoundary !== undefined &&
      entry.effectBoundary !== "local" &&
      entry.effectBoundary !== "external" &&
      entry.effectBoundary !== "multistage"
    ) {
      invalidFacet(
        `${facet}.effectBoundary`,
        source,
        diagnostics,
        'Action effectBoundary must be "local", "external", or "multistage".',
      )
    }
    if (entry.durability !== undefined) {
      if (!isRecord(entry.durability)) {
        invalidFacet(
          `${facet}.durability`,
          source,
          diagnostics,
          "Action durability must declare a strategy and testReference.",
        )
      } else {
        if (
          entry.durability.strategy !== "transactional" &&
          entry.durability.strategy !== "outbox" &&
          entry.durability.strategy !== "saga"
        ) {
          invalidFacet(
            `${facet}.durability.strategy`,
            source,
            diagnostics,
            'Action durability strategy must be "transactional", "outbox", or "saga".',
          )
        }
        requireNonEmptyString(
          entry.durability.testReference,
          `${facet}.durability.testReference`,
          source,
          diagnostics,
        )
      }
    }
    // Legacy actions may omit the whole safety contract. Once an action opts
    // into any safety metadata, omitted availability has the same callable
    // meaning as runtime lowering: available. This prevents removing only an
    // `unavailable` block from bypassing lifecycle and durability validation.
    const effectivelyAvailable =
      availability?.status !== "unavailable" ||
      (availability !== undefined && "enableWhen" in availability)
    const safetyContractSelected =
      availability !== undefined ||
      entry.effectBoundary !== undefined ||
      entry.durability !== undefined ||
      entry.existingTarget !== undefined
    const toolBound = isRecord(entry.from) && Array.isArray(entry.from.tools)
    if (
      effectivelyAvailable &&
      safetyContractSelected &&
      entry.kind === "execute" &&
      toolBound &&
      entry.targetLifecycle === undefined
    ) {
      invalidFacet(
        `${facet}.targetLifecycle`,
        source,
        diagnostics,
        "Available execute Tool actions must explicitly declare their target lifecycle and stable target anchor.",
      )
    }
    if (
      effectivelyAvailable &&
      safetyContractSelected &&
      entry.kind === "execute" &&
      (entry.effectBoundary === "external" || entry.effectBoundary === "multistage") &&
      entry.durability === undefined
    ) {
      invalidFacet(
        `${facet}.durability`,
        source,
        diagnostics,
        "Available external and multi-stage execute actions must declare tested durability.",
      )
    }
    if (entry.durability !== undefined && (entry.kind !== "execute" || entry.risk === "low")) {
      invalidFacet(
        `${facet}.durability`,
        source,
        diagnostics,
        "Read and low-risk actions cannot declare write durability; classify data-writing actions as execute with non-low risk.",
      )
    }
    if (
      effectivelyAvailable &&
      entry.kind === "execute" &&
      entry.approval === "required" &&
      entry.targetLifecycle === "existing" &&
      entry.existingTarget === undefined
    ) {
      invalidFacet(
        `${facet}.existingTarget`,
        source,
        diagnostics,
        "Available approval-required existing-target actions must declare a handler-owned durable result contract.",
      )
    }
    if (entry.targetLifecycle === "existing" && entry.existingTarget !== undefined) {
      if (entry.kind !== "execute" || entry.ledger !== "required") {
        invalidFacet(
          `${facet}.existingTarget`,
          source,
          diagnostics,
          'The existing-target durable result protocol is supported only for kind "execute" with ledger "required".',
        )
      }
      if (entry.approval === "conditional") {
        invalidFacet(
          `${facet}.approval`,
          source,
          diagnostics,
          "Existing-target durable commands do not support conditional approval.",
        )
      }
      if (!isRecord(entry.existingTarget)) {
        invalidFacet(
          `${facet}.existingTarget`,
          source,
          diagnostics,
          "Existing-target durable result metadata must be an object.",
        )
      } else if (entry.existingTarget.durability !== "handler-command-result-v1") {
        invalidFacet(
          `${facet}.existingTarget.durability`,
          source,
          diagnostics,
          'Existing-target actions must use durability "handler-command-result-v1".',
        )
      }
      if (typeof entry.commandTargetField !== "string" || !entry.commandTargetField.trim()) {
        invalidFacet(
          `${facet}.commandTargetField`,
          source,
          diagnostics,
          "Existing-target durable commands must name the stable target input field.",
        )
      }
    } else if (entry.existingTarget !== undefined) {
      invalidFacet(
        `${facet}.existingTarget`,
        source,
        diagnostics,
        'Only actions with targetLifecycle "existing" may declare existingTarget.',
      )
    }
    if (entry.targetLifecycle === "created") {
      if (entry.kind !== "execute" || entry.ledger !== "required") {
        invalidFacet(
          `${facet}.targetLifecycle`,
          source,
          diagnostics,
          'Created targets are supported only for kind "execute" with ledger "required".',
        )
      }
      if (!isRecord(entry.createdTarget)) {
        invalidFacet(
          `${facet}.createdTarget`,
          source,
          diagnostics,
          "Actions that create their target must declare a createdTarget command contract.",
        )
      } else {
        requireNonEmptyString(
          entry.createdTarget.commandTargetType,
          `${facet}.createdTarget.commandTargetType`,
          source,
          diagnostics,
        )
        requireNonEmptyString(
          entry.createdTarget.resultReferenceType,
          `${facet}.createdTarget.resultReferenceType`,
          source,
          diagnostics,
        )
        if (entry.createdTarget.durability !== "handler-command-claim-v1") {
          invalidFacet(
            `${facet}.createdTarget.durability`,
            source,
            diagnostics,
            'Created-target actions must use durability "handler-command-claim-v1".',
          )
        }
        if (entry.createdTarget.parentAnchor !== undefined) {
          const anchorFacet = `${facet}.createdTarget.parentAnchor`
          if (!isRecord(entry.createdTarget.parentAnchor)) {
            invalidFacet(
              anchorFacet,
              source,
              diagnostics,
              "Created-target parentAnchor must be an object.",
            )
          } else {
            const anchor = entry.createdTarget.parentAnchor
            requireNonEmptyString(
              anchor.targetIdField,
              `${anchorFacet}.targetIdField`,
              source,
              diagnostics,
            )
            const hasStaticType =
              typeof anchor.targetType === "string" && anchor.targetType.trim().length > 0
            const hasDynamicType =
              typeof anchor.targetTypeField === "string" && anchor.targetTypeField.trim().length > 0
            if (anchor.targetType !== undefined) {
              requireNonEmptyString(
                anchor.targetType,
                `${anchorFacet}.targetType`,
                source,
                diagnostics,
              )
            }
            if (anchor.targetTypeField !== undefined) {
              requireNonEmptyString(
                anchor.targetTypeField,
                `${anchorFacet}.targetTypeField`,
                source,
                diagnostics,
              )
            }
            if (hasStaticType === hasDynamicType) {
              invalidFacet(
                anchorFacet,
                source,
                diagnostics,
                "Created-target parentAnchor must declare exactly one of targetType or targetTypeField.",
              )
            }
            if (anchor.relatedTargetIdField !== undefined) {
              requireNonEmptyString(
                anchor.relatedTargetIdField,
                `${anchorFacet}.relatedTargetIdField`,
                source,
                diagnostics,
              )
            }
          }
        }
      }
    } else if (entry.createdTarget !== undefined) {
      invalidFacet(
        `${facet}.createdTarget`,
        source,
        diagnostics,
        'Only actions with targetLifecycle "created" may declare createdTarget.',
      )
    }
    if (entry.allowedActorTypes !== undefined && !isStringArray(entry.allowedActorTypes)) {
      invalidFacet(
        `${facet}.allowedActorTypes`,
        source,
        diagnostics,
        "Action allowedActorTypes must be an array of strings.",
      )
    }
    validateScopeArray(entry.requiredScopes, `${facet}.requiredScopes`, source, diagnostics)
    if ((entry.risk === "high" || entry.risk === "critical") && entry.ledger !== "required") {
      invalidFacet(
        `${facet}.ledger`,
        source,
        diagnostics,
        "High and critical actions must require action-ledger writes.",
      )
    }
  })
  validateEntityArray(input.events, "events", source, diagnostics, (entry, facet) => {
    if (entry.eventType !== undefined) {
      requireNonEmptyString(entry.eventType, `${facet}.eventType`, source, diagnostics)
    }
    const hasVersion = entry.version !== undefined
    const hasSchema = entry.payloadSchema !== undefined
    if (hasVersion !== hasSchema) {
      invalidFacet(
        facet,
        source,
        diagnostics,
        "Versioned events must declare both version and payloadSchema.",
      )
    }
    if (hasVersion && (typeof entry.version !== "string" || parseVersion(entry.version) === null)) {
      invalidFacet(
        `${facet}.version`,
        source,
        diagnostics,
        "Event contract versions must use semantic versioning.",
      )
    }
    if (hasSchema && !isRecord(entry.payloadSchema)) {
      invalidFacet(
        `${facet}.payloadSchema`,
        source,
        diagnostics,
        "Event payloadSchema must be a JSON Schema object.",
      )
    }
  })

  validateAccessFacet(input.access, source, diagnostics)
  validateAdminFacet(input.admin, source, diagnostics)
  diagnostics.push(...validateFacetEntities(input.presentations, "presentations", source))
  validateEntityArray(input.presentations, "presentations", source, diagnostics, (entry, facet) => {
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
    if (!isRecord(entry.runtime) || typeof entry.runtime.export !== "string") {
      invalidFacet(
        `${facet}.runtime.export`,
        source,
        diagnostics,
        "Presentation runtime references require a named factory export.",
      )
    }
    if (entry.routes !== undefined) {
      if (!Array.isArray(entry.routes)) {
        invalidFacet(
          `${facet}.routes`,
          source,
          diagnostics,
          "Presentation routes must be an array.",
        )
      } else if (entry.routes.length > 0) {
        requireNonEmptyString(entry.contribution, `${facet}.contribution`, source, diagnostics)
        entry.routes.forEach((route, index) => {
          const routeFacet = `${facet}.routes[${index}]`
          if (!isRecord(route)) {
            invalidFacet(routeFacet, source, diagnostics, "Presentation route must be an object.")
            return
          }
          if (typeof route.route !== "string" || !route.route.startsWith("/")) {
            invalidFacet(
              `${routeFacet}.route`,
              source,
              diagnostics,
              'Presentation route paths must start with "/".',
            )
          }
          requireNonEmptyString(route.member, `${routeFacet}.member`, source, diagnostics)
        })
      }
    }
  })
  validateReportingFacet(input.reporting, source, diagnostics)
  if (input.lifecycle !== undefined) {
    if (!isRecord(input.lifecycle)) {
      invalidFacet("lifecycle", source, diagnostics, "Lifecycle metadata must be an object.")
    } else {
      if (input.lifecycle.uninstall !== undefined) {
        const uninstall = input.lifecycle.uninstall
        if (!isRecord(uninstall) || uninstall.default !== "retain-data") {
          invalidFacet(
            "lifecycle.uninstall.default",
            source,
            diagnostics,
            'Uninstall metadata must default to "retain-data".',
          )
        }
      }
      validateEntityArray(
        input.lifecycle.cleanup,
        "lifecycle.cleanup",
        source,
        diagnostics,
        (entry, facet) => {
          requireNonEmptyString(entry.resourceId, `${facet}.resourceId`, source, diagnostics)
          if (entry.action !== "release") {
            invalidFacet(
              `${facet}.action`,
              source,
              diagnostics,
              'Lifecycle cleanup action must be "release".',
            )
          }
          if (
            !Array.isArray(entry.on) ||
            entry.on.length === 0 ||
            entry.on.some((operation) => operation !== "upgrade" && operation !== "uninstall")
          ) {
            invalidFacet(
              `${facet}.on`,
              source,
              diagnostics,
              "Lifecycle cleanup must name at least one supported operation.",
            )
          }
        },
      )
    }
  }
  return diagnostics
}

function validateActionAvailabilityCondition(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (!isRecord(value) || !hasExactKeys(value, ["selectedProviderPorts"])) {
    invalidFacet(
      facet,
      source,
      diagnostics,
      "Action enableWhen must contain exactly one selectedProviderPorts condition.",
    )
    return
  }
  const selectedProviderPorts = value.selectedProviderPorts
  if (!isRecord(selectedProviderPorts) || !hasExactKeys(selectedProviderPorts, ["mode", "ports"])) {
    invalidFacet(
      `${facet}.selectedProviderPorts`,
      source,
      diagnostics,
      "selectedProviderPorts must contain exactly mode and ports.",
    )
    return
  }
  if (selectedProviderPorts.mode !== "all" && selectedProviderPorts.mode !== "any") {
    invalidFacet(
      `${facet}.selectedProviderPorts.mode`,
      source,
      diagnostics,
      'selectedProviderPorts.mode must be "all" or "any".',
    )
  }
  const ports = selectedProviderPorts.ports
  if (
    !Array.isArray(ports) ||
    ports.length === 0 ||
    ports.some((port) => typeof port !== "string" || !PORT_ID_PATTERN.test(port)) ||
    new Set(ports).size !== ports.length
  ) {
    invalidFacet(
      `${facet}.selectedProviderPorts.ports`,
      source,
      diagnostics,
      "selectedProviderPorts.ports must be a non-empty array of unique dot-case typed port ids.",
    )
  }
}

function facetEntityIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set()
  return new Set(
    value.flatMap((entry) => (isRecord(entry) && typeof entry.id === "string" ? [entry.id] : [])),
  )
}

function validateAccessFacet(
  value: unknown,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    invalidFacet("access", source, diagnostics, "Access metadata must be an object.")
    return
  }
  diagnostics.push(...validateFacetEntities(value.resources, "access.resources", source))
  diagnostics.push(...validateFacetEntities(value.roles, "access.roles", source))
  validateEntityArray(value.resources, "access.resources", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.resource, `${facet}.resource`, source, diagnostics)
    if (!Array.isArray(entry.actions) || entry.actions.length === 0) {
      invalidFacet(
        `${facet}.actions`,
        source,
        diagnostics,
        "Access actions must be a non-empty array.",
      )
    } else {
      for (const [index, action] of entry.actions.entries()) {
        if (typeof action === "string") {
          requireNonEmptyString(action, `${facet}.actions[${index}]`, source, diagnostics)
        } else if (isRecord(action)) {
          requireNonEmptyString(
            action.action,
            `${facet}.actions[${index}].action`,
            source,
            diagnostics,
          )
          if (
            action.wildcard !== undefined &&
            action.wildcard !== "allow" &&
            action.wildcard !== "explicit"
          ) {
            invalidFacet(
              `${facet}.actions[${index}].wildcard`,
              source,
              diagnostics,
              'Access action wildcard policy must be "allow" or "explicit".',
            )
          }
          if (action.sensitive !== undefined && typeof action.sensitive !== "boolean") {
            invalidFacet(
              `${facet}.actions[${index}].sensitive`,
              source,
              diagnostics,
              "Access action sensitive metadata must be a boolean.",
            )
          }
        } else {
          invalidFacet(
            `${facet}.actions[${index}]`,
            source,
            diagnostics,
            "Access actions must be strings or display descriptors.",
          )
        }
      }
    }
    if (
      entry.wildcard !== undefined &&
      entry.wildcard !== "allow" &&
      entry.wildcard !== "explicit-resource"
    ) {
      invalidFacet(
        `${facet}.wildcard`,
        source,
        diagnostics,
        'Access wildcard policy must be "allow" or "explicit-resource".',
      )
    }
    if (entry.legacyActions !== undefined && !isStringArray(entry.legacyActions)) {
      invalidFacet(
        `${facet}.legacyActions`,
        source,
        diagnostics,
        "Legacy access actions must be a string array.",
      )
    }
  })
  validateEntityArray(value.roles, "access.roles", source, diagnostics, (entry, facet) => {
    validateScopeArray(entry.grants, `${facet}.grants`, source, diagnostics, true)
  })
}

function validateAdminFacet(
  value: unknown,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    invalidFacet("admin", source, diagnostics, "Admin metadata must be an object.")
    return
  }
  if (value.runtime !== undefined) {
    validateRuntimeReference(value.runtime, "admin.runtime", source, diagnostics)
  }
  if (value.shellRuntime !== undefined) {
    validateRuntimeReference(value.shellRuntime, "admin.shellRuntime", source, diagnostics)
  }
  if (value.loading !== undefined && value.loading !== "lazy-routes") {
    invalidFacet(
      "admin.loading",
      source,
      diagnostics,
      'Admin loading must be exactly "lazy-routes" when provided.',
    )
  }
  if (
    value.compositionOrder !== undefined &&
    (!Number.isInteger(value.compositionOrder) || !Number.isSafeInteger(value.compositionOrder))
  ) {
    invalidFacet(
      "admin.compositionOrder",
      source,
      diagnostics,
      "Admin composition order must be a safe integer.",
    )
  }
  for (const facet of ["copy", "routes", "nav", "slots", "contributions", "setupSteps"] as const) {
    diagnostics.push(...validateFacetEntities(value[facet], `admin.${facet}`, source))
  }
  validateEntityArray(value.copy, "admin.copy", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.namespace, `${facet}.namespace`, source, diagnostics)
    requireNonEmptyString(entry.fallbackLocale, `${facet}.fallbackLocale`, source, diagnostics)
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
  })
  validateEntityArray(value.routes, "admin.routes", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.path, `${facet}.path`, source, diagnostics)
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
    validateScopeArray(entry.requiredScopes, `${facet}.requiredScopes`, source, diagnostics)
  })
  validateEntityArray(value.nav, "admin.nav", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.routeId, `${facet}.routeId`, source, diagnostics)
  })
  validateEntityArray(value.slots, "admin.slots", source, diagnostics, (entry, facet) => {
    requireNonEmptyString(entry.routeId, `${facet}.routeId`, source, diagnostics)
  })
  validateEntityArray(
    value.contributions,
    "admin.contributions",
    source,
    diagnostics,
    (entry, facet) => {
      requireNonEmptyString(entry.slotId, `${facet}.slotId`, source, diagnostics)
      validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
      validateScopeArray(entry.requiredScopes, `${facet}.requiredScopes`, source, diagnostics)
    },
  )
  validateEntityArray(value.setupSteps, "admin.setupSteps", source, diagnostics, (entry, facet) => {
    if (typeof entry.skippable !== "boolean") {
      invalidFacet(`${facet}.skippable`, source, diagnostics, "Setup skippable must be boolean.")
    }
  })
}

function validateReportingFacet(
  value: unknown,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    invalidReportingFacet("reporting", source, diagnostics, "Reporting metadata must be an object.")
    return
  }

  for (const facet of ["datasets", "widgets", "templates"] as const) {
    const entries = value[facet]
    if (entries === undefined) continue
    if (!Array.isArray(entries)) {
      invalidReportingFacet(
        `reporting.${facet}`,
        source,
        diagnostics,
        `Reporting ${facet} must be an array of declarations.`,
      )
      continue
    }
    diagnostics.push(...validateFacetEntities(entries, `reporting.${facet}`, source))
  }

  validateEntityArray(value.datasets, "reporting.datasets", source, diagnostics, (entry, facet) => {
    validateReportingVersionAndLabel(entry, facet, source, diagnostics)
    if (!isRecord(entry.descriptor)) {
      invalidReportingFacet(
        `${facet}.descriptor`,
        source,
        diagnostics,
        "Reporting dataset descriptors must be JSON objects.",
      )
    }
    validateRuntimeReference(entry.runtime, `${facet}.runtime`, source, diagnostics)
    if (!isRecord(entry.runtime) || typeof entry.runtime.export !== "string") {
      invalidReportingFacet(
        `${facet}.runtime.export`,
        source,
        diagnostics,
        "Reporting dataset runtime references require a named export.",
      )
    }
    validateScopeArray(entry.requiredScopes, `${facet}.requiredScopes`, source, diagnostics)
  })

  validateEntityArray(value.widgets, "reporting.widgets", source, diagnostics, (entry, facet) => {
    validateReportingVersionAndLabel(entry, facet, source, diagnostics)
    requireReportingString(entry.datasetId, `${facet}.datasetId`, source, diagnostics)
    validateOptionalReportingVersion(
      entry.datasetVersion,
      `${facet}.datasetVersion`,
      source,
      diagnostics,
    )
    for (const property of ["query", "visualization"] as const) {
      if (!isRecord(entry[property])) {
        invalidReportingFacet(
          `${facet}.${property}`,
          source,
          diagnostics,
          `Reporting widget ${property} must be a JSON object.`,
        )
      }
    }
    validateReportingGridSize(entry.defaultSize, `${facet}.defaultSize`, source, diagnostics)
    if (entry.minSize !== undefined) {
      validateReportingGridSize(entry.minSize, `${facet}.minSize`, source, diagnostics)
    }
    if (entry.maxSize !== undefined) {
      validateReportingGridSize(entry.maxSize, `${facet}.maxSize`, source, diagnostics)
    }
  })

  validateEntityArray(
    value.templates,
    "reporting.templates",
    source,
    diagnostics,
    (entry, facet) => {
      validateReportingVersionAndLabel(entry, facet, source, diagnostics)
      if (entry.parameters !== undefined) {
        if (!Array.isArray(entry.parameters)) {
          invalidReportingFacet(
            `${facet}.parameters`,
            source,
            diagnostics,
            "Reporting template parameters must be an array.",
          )
        } else {
          entry.parameters.forEach((parameter, index) => {
            requireReportingString(parameter, `${facet}.parameters[${index}]`, source, diagnostics)
          })
        }
      }
      if (entry.requirements !== undefined) {
        if (!Array.isArray(entry.requirements)) {
          invalidReportingFacet(
            `${facet}.requirements`,
            source,
            diagnostics,
            "Reporting template requirements must be an array.",
          )
        } else {
          entry.requirements.forEach((requirement, index) => {
            const requirementFacet = `${facet}.requirements[${index}]`
            if (!isRecord(requirement)) {
              invalidReportingFacet(
                requirementFacet,
                source,
                diagnostics,
                "Reporting requirements must declare a dataset or widget id.",
              )
              return
            }
            if (requirement.kind !== "dataset" && requirement.kind !== "widget") {
              invalidReportingFacet(
                `${requirementFacet}.kind`,
                source,
                diagnostics,
                'Reporting requirement kind must be "dataset" or "widget".',
              )
            }
            requireReportingString(requirement.id, `${requirementFacet}.id`, source, diagnostics)
          })
        }
      }
      if (!Array.isArray(entry.widgets)) {
        invalidReportingFacet(
          `${facet}.widgets`,
          source,
          diagnostics,
          "Reporting templates must declare a widget instance array.",
        )
        return
      }
      const instanceIds = new Set<string>()
      entry.widgets.forEach((widget, index) => {
        const widgetFacet = `${facet}.widgets[${index}]`
        if (!isRecord(widget)) {
          invalidReportingFacet(
            widgetFacet,
            source,
            diagnostics,
            "Reporting template widgets must be objects.",
          )
          return
        }
        requireReportingString(widget.id, `${widgetFacet}.id`, source, diagnostics)
        if (typeof widget.id === "string") {
          if (instanceIds.has(widget.id)) {
            invalidReportingFacet(
              `${widgetFacet}.id`,
              source,
              diagnostics,
              `Reporting template widget instance id "${widget.id}" is duplicated.`,
            )
          }
          instanceIds.add(widget.id)
        }
        requireReportingString(widget.widgetId, `${widgetFacet}.widgetId`, source, diagnostics)
        validateOptionalReportingVersion(
          widget.widgetVersion,
          `${widgetFacet}.widgetVersion`,
          source,
          diagnostics,
        )
        validateReportingGridPlacement(widget.layout, `${widgetFacet}.layout`, source, diagnostics)
        if (widget.title !== undefined) {
          requireReportingString(widget.title, `${widgetFacet}.title`, source, diagnostics)
        }
      })
    },
  )
}

function validateOptionalReportingVersion(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (value === undefined) return
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    invalidReportingFacet(
      facet,
      source,
      diagnostics,
      "Reporting references must use positive safe integer versions.",
    )
  }
}

function validateReportingVersionAndLabel(
  entry: Record<string, unknown>,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (!Number.isSafeInteger(entry.version) || Number(entry.version) <= 0) {
    invalidReportingFacet(
      `${facet}.version`,
      source,
      diagnostics,
      "Reporting declaration versions must be positive safe integers.",
    )
  }
  requireReportingString(entry.label, `${facet}.label`, source, diagnostics)
}

function requireReportingString(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (typeof value === "string" && value.trim().length > 0) return
  invalidReportingFacet(facet, source, diagnostics, "Expected a non-empty string.")
}

function validateReportingGridSize(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (
    isRecord(value) &&
    Number.isSafeInteger(value.width) &&
    Number(value.width) > 0 &&
    Number.isSafeInteger(value.height) &&
    Number(value.height) > 0
  ) {
    return
  }
  invalidReportingFacet(
    facet,
    source,
    diagnostics,
    "Reporting grid sizes require positive safe-integer width and height.",
  )
}

function validateReportingGridPlacement(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  validateReportingGridSize(value, facet, source, diagnostics)
  if (
    isRecord(value) &&
    Number.isSafeInteger(value.x) &&
    Number(value.x) >= 0 &&
    Number.isSafeInteger(value.y) &&
    Number(value.y) >= 0
  ) {
    return
  }
  invalidReportingFacet(
    facet,
    source,
    diagnostics,
    "Reporting grid placements require non-negative safe-integer x and y coordinates.",
  )
}

function invalidReportingFacet(
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
  message: string,
): void {
  diagnostics.push(
    diagnostic({ code: "VOYANT_GRAPH_INVALID_REPORTING_FACET", source, facet, message }),
  )
}

function validateEntityArray(
  value: unknown,
  facet: string,
  _source: string | undefined,
  _diagnostics: VoyantGraphDiagnostic[],
  validate: (entry: Record<string, unknown>, facet: string) => void,
): void {
  if (!Array.isArray(value)) return
  value.forEach((entry, index) => {
    if (isRecord(entry)) validate(entry, `${facet}[${index}]`)
  })
}

function requireNonEmptyString(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (typeof value === "string" && value.length > 0) return
  invalidFacet(facet, source, diagnostics, "Expected a non-empty string.")
}

function validateRuntimeReference(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (
    isRecord(value) &&
    typeof value.entry === "string" &&
    value.entry.length > 0 &&
    (value.export === undefined || (typeof value.export === "string" && value.export.length > 0))
  ) {
    return
  }
  invalidFacet(
    facet,
    source,
    diagnostics,
    "Runtime references require entry and optional export strings.",
  )
}

function validateScopeArray(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
  required = false,
): void {
  if (value === undefined && !required) return
  if (
    !Array.isArray(value) ||
    value.some((scope) => typeof scope !== "string" || !ROUTE_SCOPE_PATTERN.test(scope))
  ) {
    invalidFacet(facet, source, diagnostics, "Scopes must be an array of resource:action strings.")
  }
}

function invalidFacet(
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
  message: string,
): void {
  diagnostics.push(diagnostic({ code: "VOYANT_GRAPH_INVALID_FACET", source, facet, message }))
}

function validateRouteBundles(value: unknown, source: string | undefined): VoyantGraphDiagnostic[] {
  const diagnostics = validateFacetEntities(value, "api", source)
  if (value == null || !Array.isArray(value)) return diagnostics

  for (let index = 0; index < value.length; index += 1) {
    const route = value[index]
    const facet = `api[${index}]`
    if (!isRecord(route)) continue

    if (!isRouteSurface(route.surface)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.surface`,
          message: `Route bundle "${route.id ?? index}" must declare surface as admin, public, webhook, or internal.`,
        }),
      )
    }

    if (
      route.methods !== undefined &&
      (!Array.isArray(route.methods) ||
        route.methods.length === 0 ||
        route.methods.some(
          (method) =>
            typeof method !== "string" || !ROUTE_METHODS.has(method as VoyantGraphRouteMethod),
        ) ||
        new Set(route.methods).size !== route.methods.length)
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.methods`,
          message: `Route bundle "${route.id ?? index}" methods must be a non-empty array of unique supported uppercase HTTP methods.`,
        }),
      )
    }

    if (
      route.mount !== undefined &&
      (typeof route.mount !== "string" || route.mount.length === 0)
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.mount`,
          message: `Route bundle "${route.id ?? index}" mount must be a non-empty string when present.`,
        }),
      )
    }

    if (route.openapi !== undefined) {
      if (
        !isRecord(route.openapi) ||
        typeof route.openapi.document !== "string" ||
        !OPENAPI_DOCUMENT_SLUG_PATTERN.test(route.openapi.document)
      ) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
            source,
            facet: `${facet}.openapi.document`,
            message: `Route bundle "${route.id ?? index}" OpenAPI document must be a non-empty lowercase slug.`,
          }),
        )
      }
    }

    if (
      route.resource !== undefined &&
      (typeof route.resource !== "string" || !ROUTE_RESOURCE_PATTERN.test(route.resource))
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.resource`,
          message: `Route bundle "${route.id ?? index}" resource must use dot/hyphen namespace syntax.`,
        }),
      )
    }

    if (
      route.authorization !== undefined &&
      route.authorization !== "coarse" &&
      route.authorization !== "route"
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.authorization`,
          message: `Route bundle "${route.id ?? index}" authorization must be coarse or route.`,
        }),
      )
    }

    if (route.authorization === "route" && route.resource === undefined) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.authorization`,
          message: `Route bundle "${route.id ?? index}" must declare a resource when authorization is route-owned.`,
        }),
      )
    }

    if (route.requiredScopes !== undefined) {
      if (!Array.isArray(route.requiredScopes)) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
            source,
            facet: `${facet}.requiredScopes`,
            message: `Route bundle "${route.id ?? index}" requiredScopes must be an array of resource:action strings.`,
          }),
        )
      } else {
        for (let scopeIndex = 0; scopeIndex < route.requiredScopes.length; scopeIndex += 1) {
          const scope = route.requiredScopes[scopeIndex]
          if (typeof scope === "string" && ROUTE_SCOPE_PATTERN.test(scope)) continue
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_SCOPE",
              source,
              facet: `${facet}.requiredScopes[${scopeIndex}]`,
              message: `Route bundle "${route.id ?? index}" required scope "${String(
                scope,
              )}" must use resource:action syntax.`,
            }),
          )
        }
      }
    }

    if (
      route.anonymous !== undefined &&
      ((typeof route.anonymous !== "boolean" && !isRouteRelativePathArray(route.anonymous)) ||
        (route.surface !== "public" && route.surface !== "webhook"))
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.anonymous`,
          message: `Route bundle "${route.id ?? index}" anonymous metadata must be declared on a public or webhook bundle as true or a non-empty array of unique route-relative paths.`,
        }),
      )
    }

    if (
      route.transactional !== undefined &&
      typeof route.transactional !== "boolean" &&
      !isRouteRelativePathArray(route.transactional)
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
          source,
          facet: `${facet}.transactional`,
          message: `Route bundle "${route.id ?? index}" transactional metadata must be a boolean or non-empty array of unique route-relative paths.`,
        }),
      )
    }

    if (route.runtime !== undefined) {
      if (
        !isRecord(route.runtime) ||
        typeof route.runtime.entry !== "string" ||
        route.runtime.entry.length === 0 ||
        (route.runtime.export !== undefined &&
          (typeof route.runtime.export !== "string" || route.runtime.export.length === 0))
      ) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_INVALID_ROUTE_BUNDLE",
            source,
            facet: `${facet}.runtime`,
            message: `Route bundle "${route.id ?? index}" runtime must reference a non-empty package entry and optional export.`,
          }),
        )
      }
    }
  }

  return diagnostics
}

function isRouteSurface(value: unknown): value is VoyantGraphRouteSurface {
  return value === "admin" || value === "public" || value === "webhook" || value === "internal"
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
}

function isRouteRelativePathArray(value: unknown): value is string[] {
  if (!isStringArray(value) || value.length === 0) return false
  const normalized = value.map(normalizeRouteRelativePath)
  return (
    normalized.every((entry) => entry !== undefined) &&
    new Set(normalized).size === normalized.length
  )
}

function normalizeRouteRelativePath(value: string): string | undefined {
  if (value.trim() !== value || value.includes("?") || value.includes("#")) return undefined
  const normalized = value.replace(/^\/+|\/+$/g, "")
  if (!normalized || normalized.includes("//")) return undefined
  const segments = normalized.split("/")
  return segments.some((segment) => segment === "." || segment === "..") ? undefined : normalized
}

function validateJobs(value: unknown, source: string | undefined): VoyantGraphDiagnostic[] {
  const diagnostics = validateFacetEntities(value, "jobs", source)
  if (!Array.isArray(value)) return diagnostics

  value.forEach((job, index) => {
    if (!isRecord(job)) return
    const facet = `jobs[${index}]`
    for (const key of Object.keys(job)) {
      if (["id", "runtime", "schedule", "scheduling", "wakeup"].includes(key)) continue
      invalidFacet(
        `${facet}.${key}`,
        source,
        diagnostics,
        `Job declarations do not support "${key}". Jobs are fixed package-owned operations without payloads or user-authored controls.`,
      )
    }

    validateRuntimeReference(job.runtime, `${facet}.runtime`, source, diagnostics)
    if (!isRecord(job.runtime) || typeof job.runtime.export !== "string" || !job.runtime.export) {
      invalidFacet(
        `${facet}.runtime.export`,
        source,
        diagnostics,
        "Job runtime references require a named export.",
      )
    }

    const scheduled = job.schedule !== undefined
    const wakeable = job.wakeup === true
    if (!scheduled && !wakeable) {
      invalidFacet(
        facet,
        source,
        diagnostics,
        "Jobs must declare a package-owned schedule, wakeup: true, or both.",
      )
    }
    if (job.wakeup !== undefined && job.wakeup !== true) {
      invalidFacet(`${facet}.wakeup`, source, diagnostics, "Job wakeup must be true when declared.")
    }
    if (job.scheduling !== undefined) {
      if (!isRecord(job.scheduling)) {
        invalidFacet(
          `${facet}.scheduling`,
          source,
          diagnostics,
          "Job scheduling policy must be an object.",
        )
      } else {
        for (const key of Object.keys(job.scheduling)) {
          if (["profiles", "required"].includes(key)) continue
          invalidFacet(
            `${facet}.scheduling.${key}`,
            source,
            diagnostics,
            `Job scheduling policies do not support "${key}".`,
          )
        }
        if (job.scheduling.required !== undefined && typeof job.scheduling.required !== "boolean") {
          invalidFacet(
            `${facet}.scheduling.required`,
            source,
            diagnostics,
            "Job scheduling required must be a boolean.",
          )
        }
        if (job.scheduling.profiles !== undefined) {
          if (!isRecord(job.scheduling.profiles)) {
            invalidFacet(
              `${facet}.scheduling.profiles`,
              source,
              diagnostics,
              "Job scheduling profiles must be a record of named schedules.",
            )
          } else {
            for (const [name, schedule] of Object.entries(job.scheduling.profiles)) {
              if (!/^[a-z][a-z0-9-]*$/.test(name)) {
                invalidFacet(
                  `${facet}.scheduling.profiles.${name}`,
                  source,
                  diagnostics,
                  "Job scheduling profile names must be lower-case tokens.",
                )
                continue
              }
              validateJobSchedule(
                schedule,
                `${facet}.scheduling.profiles.${name}`,
                source,
                diagnostics,
              )
            }
          }
        }
      }
    }
    if (scheduled) validateJobSchedule(job.schedule, `${facet}.schedule`, source, diagnostics)
  })
  return diagnostics
}

function validateJobSchedule(
  value: unknown,
  facet: string,
  source: string | undefined,
  diagnostics: VoyantGraphDiagnostic[],
): void {
  if (!isRecord(value)) {
    invalidFacet(
      facet,
      source,
      diagnostics,
      "Job schedules must declare exactly one cron or every cadence.",
    )
    return
  }
  const schedule = value
  for (const key of Object.keys(schedule)) {
    if (["cron", "every", "timezone", "overlap"].includes(key)) continue
    invalidFacet(`${facet}.${key}`, source, diagnostics, `Job schedules do not support "${key}".`)
  }
  const hasCron = typeof schedule.cron === "string" && schedule.cron.trim().length > 0
  const hasEvery =
    (typeof schedule.every === "string" && schedule.every.trim().length > 0) ||
    (typeof schedule.every === "number" && Number.isFinite(schedule.every) && schedule.every > 0)
  if (hasCron === hasEvery) {
    invalidFacet(
      facet,
      source,
      diagnostics,
      "Job schedules must declare exactly one non-empty cron or positive every cadence.",
    )
  }
  if (hasCron && !isSupportedProductJobCron(schedule.cron as string)) {
    invalidFacet(
      `${facet}.cron`,
      source,
      diagnostics,
      "Job cron schedules must use five numeric fields with wildcards, lists, ranges, or steps.",
    )
  }
  if (hasEvery && !isSupportedProductJobEvery(schedule.every as string | number)) {
    invalidFacet(
      `${facet}.every`,
      source,
      diagnostics,
      "Job every schedules must be at least one minute and use milliseconds, a duration such as 5m, or an ISO PT duration.",
    )
  }
  if (schedule.timezone !== undefined && typeof schedule.timezone !== "string") {
    invalidFacet(
      `${facet}.timezone`,
      source,
      diagnostics,
      "Job schedule timezone must be a string.",
    )
  }
  if (typeof schedule.timezone === "string" && !isSupportedProductJobTimezone(schedule.timezone)) {
    invalidFacet(
      `${facet}.timezone`,
      source,
      diagnostics,
      "Job schedule timezone must be a valid IANA time zone.",
    )
  }
  if (
    schedule.overlap !== undefined &&
    schedule.overlap !== "skip" &&
    schedule.overlap !== "queue"
  ) {
    invalidFacet(
      `${facet}.overlap`,
      source,
      diagnostics,
      "Job schedule overlap must be skip or queue; product jobs never run concurrently in one host.",
    )
  }
}

function isSupportedProductJobCron(expression: string): boolean {
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const
  const fields = expression.trim().split(/\s+/)
  return (
    fields.length === 5 &&
    fields.every((field, index) => {
      const [minimum, maximum] = ranges[index]!
      return field.split(",").every((part) => {
        const [range, stepText, extra] = part.split("/")
        if (extra !== undefined) return false
        const step = stepText === undefined ? 1 : Number(stepText)
        if (!Number.isInteger(step) || step <= 0) return false
        if (range === "*") return true
        const values = range!.split("-").map(Number)
        if (values.length > 2 || values.some((value) => !Number.isInteger(value))) return false
        const [start, end = start] = values
        return start! >= minimum && end! <= maximum && start! <= end!
      })
    })
  )
}

function isSupportedProductJobEvery(value: string | number): boolean {
  const milliseconds = productJobEveryMilliseconds(value)
  return milliseconds !== undefined && milliseconds >= 60_000
}

function productJobEveryMilliseconds(value: string | number): number | undefined {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  const duration = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/i.exec(value.trim())
  if (duration) {
    const unit = duration[2]!.toLowerCase()
    const multiplier =
      unit === "ms"
        ? 1
        : unit === "s"
          ? 1_000
          : unit === "m"
            ? 60_000
            : unit === "h"
              ? 3_600_000
              : 86_400_000
    return Number(duration[1]) * multiplier
  }
  const iso = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(
    value.trim(),
  )
  if (!iso) return undefined
  return (
    Number(iso[1] ?? 0) * 3_600_000 + Number(iso[2] ?? 0) * 60_000 + Number(iso[3] ?? 0) * 1_000
  )
}

function isSupportedProductJobTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

function validateSubscribers(value: unknown, source: string | undefined): VoyantGraphDiagnostic[] {
  const diagnostics = validateFacetEntities(value, "subscribers", source)
  if (!Array.isArray(value)) return diagnostics
  for (let index = 0; index < value.length; index++) {
    const subscriber = value[index]
    if (!isRecord(subscriber) || subscriber.runtime === undefined) continue
    validateRuntimeReference(
      subscriber.runtime,
      `subscribers[${index}].runtime`,
      source,
      diagnostics,
    )
  }
  return diagnostics
}

function validateEntityId(
  value: unknown,
  facet: string,
  source: string | undefined,
): VoyantGraphDiagnostic[] {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_ENTITY_ID",
        source,
        facet,
        message: `Graph entity at "${facet}" must include a stable string id.`,
      }),
    ]
  }
  return []
}

function validateDuplicateGraphIds(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const byId = new Map<string, string[]>()
  for (const unit of units) {
    const ids = byId.get(unit.id) ?? []
    ids.push(unit.kind)
    byId.set(unit.id, ids)
  }
  return [...byId.entries()]
    .filter(([, kinds]) => kinds.length > 1)
    .map(([id]) =>
      diagnostic({
        code: "VOYANT_GRAPH_DUPLICATE_ID",
        source: id,
        facet: "id",
        message: `Graph id "${id}" is selected more than once. V1 allows one instance per graph id.`,
      }),
    )
}

function validateDuplicateCustomFieldTargets(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const owners = new Map<string, string[]>()
  const namespaceOwners = new Map<string, string[]>()
  for (const unit of units) {
    for (const target of unit.customFieldTargets) {
      const targetOwners = owners.get(target.id) ?? []
      targetOwners.push(unit.id)
      owners.set(target.id, targetOwners)
      const unitIds = namespaceOwners.get(target.namespace) ?? []
      unitIds.push(unit.id)
      namespaceOwners.set(target.namespace, unitIds)
    }
  }

  const duplicateTargetDiagnostics = [...owners.entries()]
    .filter(([, unitIds]) => unitIds.length > 1)
    .map(([target, unitIds]) =>
      diagnostic({
        code: "VOYANT_GRAPH_DUPLICATE_CUSTOM_FIELD_TARGET",
        source: sortedUnique(unitIds).join(", "),
        facet: "customFieldTargets",
        message: `Custom-field target "${target}" is declared by more than one selected graph unit.`,
      }),
    )
  const conflictingNamespaceDiagnostics = [...namespaceOwners.entries()]
    .filter(([, unitIds]) => new Set(unitIds).size > 1)
    .map(([namespace, unitIds]) =>
      diagnostic({
        code: "VOYANT_GRAPH_CONFLICTING_CUSTOM_FIELD_NAMESPACE_OWNER",
        source: sortedUnique(unitIds).join(", "),
        facet: "customFieldTargets",
        message: `Custom-field namespace "${namespace}" is claimed by more than one selected graph unit.`,
      }),
    )
  return [...duplicateTargetDiagnostics, ...conflictingNamespaceDiagnostics]
}

function validateDuplicateEventTypes(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const declarations = new Map<string, Map<string, string[]>>()
  const versions = new Map<string, Map<string, string[]>>()
  for (const unit of units) {
    for (const event of unit.events) {
      const eventType = event.eventType?.trim()
      if (!eventType) continue
      const owners = declarations.get(eventType) ?? new Map<string, string[]>()
      const eventIds = owners.get(unit.id) ?? []
      eventIds.push(event.id)
      owners.set(unit.id, eventIds)
      declarations.set(eventType, owners)

      const version = event.version?.trim()
      if (!version) continue
      const key = `${eventType}@${version}`
      const versionOwners = versions.get(key) ?? new Map<string, string[]>()
      const versionEventIds = versionOwners.get(unit.id) ?? []
      versionEventIds.push(event.id)
      versionOwners.set(unit.id, versionEventIds)
      versions.set(key, versionOwners)
    }
  }

  const authorityDiagnostics = [...declarations.entries()].flatMap(([eventType, owners]) => {
    if (owners.size < 2) return []
    const authority = [...owners.entries()]
      .map(([unitId, eventIds]) => `${eventIds.sort().join(", ")} (${unitId})`)
      .sort()
      .join(", ")
    return [
      diagnostic({
        code: "VOYANT_GRAPH_DUPLICATE_EVENT_TYPE",
        source: [...owners.keys()].sort()[1],
        facet: "events.eventType",
        message: `Event type "${eventType}" has multiple selected authorities: ${authority}. Keep one domain-owned contract; other packages may still emit that event type.`,
      }),
    ]
  })

  const versionDiagnostics = [...versions.entries()].flatMap(([key, owners]) =>
    [...owners.entries()].flatMap(([unitId, eventIds]) => {
      if (eventIds.length < 2) return []
      return [
        diagnostic({
          code: "VOYANT_GRAPH_DUPLICATE_EVENT_VERSION",
          source: unitId,
          facet: "events.version",
          message: `Event contract "${key}" is declared more than once by "${unitId}": ${eventIds.sort().join(", ")}. Keep one stable declaration per event type and version.`,
        }),
      ]
    }),
  )

  return [...authorityDiagnostics, ...versionDiagnostics]
}

function validateFacetReferences(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const entityIds = new Set(units.flatMap(unitEntityIds))
  const apiById = new Map(units.flatMap((unit) => unit.api.map((api) => [api.id, api] as const)))
  const eventById = new Map(
    units.flatMap((unit) => unit.events.map((event) => [event.id, event] as const)),
  )
  const eventTypes = new Set(
    units.flatMap((unit) =>
      unit.events
        .map((event) => event.eventType?.trim())
        .filter((eventType): eventType is string => Boolean(eventType)),
    ),
  )
  const actionBindings = {
    routes: new Set(units.flatMap((unit) => unit.api.map((entry) => entry.id))),
    tools: new Set(units.flatMap((unit) => (unit.tools ?? []).map((entry) => entry.id))),
    events: new Set(units.flatMap((unit) => unit.events.map((entry) => entry.id))),
    webhooks: new Set(units.flatMap((unit) => (unit.webhooks ?? []).map((entry) => entry.id))),
  } as const
  const scopes = new Set(
    units.flatMap((unit) =>
      (unit.access?.resources ?? []).flatMap((resource) =>
        resource.actions.map((action) => `${resource.resource}:${accessActionName(action)}`),
      ),
    ),
  )
  const copyNamespaces = new Set(
    units.flatMap((unit) => (unit.admin?.copy ?? []).map((copy) => copy.namespace)),
  )
  const diagnostics: VoyantGraphDiagnostic[] = []

  const reference = (unitId: string, facet: string, id: string) => {
    if (entityIds.has(id)) return
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
        source: unitId,
        facet,
        message: `Facet reference "${id}" does not exist in the selected graph.`,
      }),
    )
  }
  const requireScope = (unitId: string, facet: string, scope: string) => {
    if (scopes.has(scope)) return
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
        source: unitId,
        facet,
        message: `Scope "${scope}" is not declared by a selected access resource.`,
      }),
    )
  }
  const requireCopy = (unitId: string, facet: string, copy: VoyantGraphMessageReference) => {
    if (copyNamespaces.size === 0) return
    if (copyNamespaces.has(copy.namespace)) return
    diagnostics.push(
      diagnostic({
        code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
        source: unitId,
        facet,
        message: `Copy namespace "${copy.namespace}" is not declared by the selected graph.`,
      }),
    )
  }

  for (const unit of units) {
    for (const subscriber of unit.subscribers) {
      if (subscriber.eventType?.trim() && !eventTypes.has(subscriber.eventType.trim())) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
            source: unit.id,
            facet: `${subscriber.id}.eventType`,
            message: `Subscriber event type "${subscriber.eventType}" is not declared by an event in the selected graph.`,
          }),
        )
      }
    }
    for (const route of unit.api) {
      if (route.resource && ![...scopes].some((scope) => scope.startsWith(`${route.resource}:`))) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
            source: unit.id,
            facet: `${route.id}.resource`,
            message: `Route resource "${route.resource}" is not declared by a selected access resource.`,
          }),
        )
      }
      for (const scope of route.requiredScopes ?? []) {
        requireScope(unit.id, `${route.id}.requiredScopes`, scope)
      }
    }
    for (const role of unit.access?.roles ?? []) {
      for (const scope of role.grants) requireScope(unit.id, `${role.id}.grants`, scope)
    }
    for (const route of unit.admin?.routes ?? []) {
      for (const scope of route.requiredScopes ?? []) {
        requireScope(unit.id, `${route.id}.requiredScopes`, scope)
      }
      for (const copy of route.copy ?? []) requireCopy(unit.id, `${route.id}.copy`, copy)
    }
    for (const nav of unit.admin?.nav ?? []) {
      reference(unit.id, `${nav.id}.routeId`, nav.routeId)
      requireCopy(unit.id, `${nav.id}.label`, nav.label)
    }
    for (const slot of unit.admin?.slots ?? []) {
      reference(unit.id, `${slot.id}.routeId`, slot.routeId)
    }
    for (const contribution of unit.admin?.contributions ?? []) {
      reference(unit.id, `${contribution.id}.slotId`, contribution.slotId)
      for (const scope of contribution.requiredScopes ?? []) {
        requireScope(unit.id, `${contribution.id}.requiredScopes`, scope)
      }
      for (const copy of contribution.copy ?? []) {
        requireCopy(unit.id, `${contribution.id}.copy`, copy)
      }
    }
    for (const tool of unit.tools ?? []) {
      for (const scope of tool.requiredScopes ?? []) {
        requireScope(unit.id, `${tool.id}.requiredScopes`, scope)
      }
    }
    for (const webhook of unit.webhooks ?? []) {
      if (webhook.direction === "inbound" && webhook.apiId) {
        const api = apiById.get(webhook.apiId)
        if (!api) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
              source: unit.id,
              facet: `${webhook.id}.apiId`,
              message: `Inbound webhook API reference "${webhook.apiId}" is not an API bundle in the selected graph.`,
            }),
          )
        } else if (api.surface !== "webhook") {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
              source: unit.id,
              facet: `${webhook.id}.apiId`,
              message: `Inbound webhook API reference "${webhook.apiId}" must select an API bundle with surface "webhook".`,
            }),
          )
        } else if (!api.runtime) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_FACET",
              source: unit.id,
              facet: `${webhook.id}.apiId`,
              message: `Inbound webhook API reference "${webhook.apiId}" must select an executable API bundle with a runtime reference.`,
            }),
          )
        }
      }
      if (webhook.direction === "outbound" && webhook.eventId) {
        const event = eventById.get(webhook.eventId)
        if (!event) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
              source: unit.id,
              facet: `${webhook.id}.eventId`,
              message: `Outbound webhook event reference "${webhook.eventId}" is not an event in the selected graph.`,
            }),
          )
        } else if (!event.eventType?.trim()) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_FACET",
              source: unit.id,
              facet: `${webhook.id}.eventId`,
              message: `Outbound webhook event reference "${webhook.eventId}" must select an event with a concrete eventType.`,
            }),
          )
        } else if (
          event.visibility !== "external" ||
          !event.version ||
          !isExternalWebhookPayloadSchema(event.payloadSchema) ||
          !event.audit?.sourceModule ||
          !event.audit.category
        ) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_FACET",
              source: unit.id,
              facet: `${webhook.id}.eventId`,
              message: `Outbound webhook event reference "${webhook.eventId}" must select an external, versioned event with an explicit object property schema and audit metadata.`,
            }),
          )
        }
      }
      for (const id of webhook.secretIds ?? []) {
        reference(unit.id, `${webhook.id}.secretIds`, id)
      }
    }
    for (const migration of unit.setupMigrations ?? []) {
      for (const id of migration.dependsOn ?? []) {
        reference(unit.id, `${migration.id}.dependsOn`, id)
      }
    }
    for (const cleanup of unit.lifecycle?.cleanup ?? []) {
      reference(unit.id, `${cleanup.id}.resourceId`, cleanup.resourceId)
    }
    for (const action of unit.actions ?? []) {
      for (const scope of action.requiredScopes ?? []) {
        requireScope(unit.id, `${action.id}.requiredScopes`, scope)
      }
      for (const copy of action.copy ?? []) requireCopy(unit.id, `${action.id}.copy`, copy)
      for (const kind of Object.keys(actionBindings) as (keyof typeof actionBindings)[]) {
        for (const id of action.from?.[kind] ?? []) {
          if (actionBindings[kind].has(id)) continue
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
              source: unit.id,
              facet: `${action.id}.from.${kind}`,
              message: `Action ${kind} reference "${id}" is not a ${kind} declaration in the selected graph.`,
            }),
          )
        }
      }
    }
  }
  return diagnostics
}

function accessActionName(action: VoyantGraphAccessResource["actions"][number]): string {
  return typeof action === "string" ? action : action.action
}

function compileReportingCatalog(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphReportingCatalog {
  const datasets = units
    .flatMap((unit) =>
      (unit.reporting?.datasets ?? []).map((dataset) => ({
        ...dataset,
        ownerUnitId: unit.id,
        runtimeReferenceId: reportingDatasetRuntimeReferenceId(unit.id, dataset.id),
      })),
    )
    .sort(compareReportingVersionedEntity)
  const datasetVersions = new Set(datasets.map(({ id, version }) => `${id}\0${version}`))
  const datasetIds = new Set(datasets.map(({ id }) => id))

  const widgets = units
    .flatMap((unit) =>
      (unit.reporting?.widgets ?? []).map((widget) => {
        const datasetAvailable = widget.datasetVersion
          ? datasetVersions.has(`${widget.datasetId}\0${widget.datasetVersion}`)
          : datasetIds.has(widget.datasetId)
        const missingRequirements = datasetAvailable
          ? []
          : [{ kind: "dataset" as const, id: widget.datasetId }]
        return {
          ...widget,
          ownerUnitId: unit.id,
          available: missingRequirements.length === 0,
          missingRequirements,
        }
      }),
    )
    .sort(compareReportingVersionedEntity)
  const widgetsById = new Map<string, (typeof widgets)[number][]>()
  for (const widget of widgets) {
    const versions = widgetsById.get(widget.id) ?? []
    versions.push(widget)
    widgetsById.set(widget.id, versions)
  }

  const templates = units
    .flatMap((unit) =>
      (unit.reporting?.templates ?? []).map((template) => {
        const requirements = [
          ...(template.requirements ?? []),
          ...template.widgets.map(
            ({ widgetId }): VoyantGraphReportingRequirement => ({
              kind: "widget",
              id: widgetId,
            }),
          ),
        ]
        const missingRequirements = uniqueReportingRequirements([
          ...requirements.filter((requirement) => {
            if (requirement.kind === "dataset") return !datasetIds.has(requirement.id)
            return !widgetsById.get(requirement.id)?.some((widget) => widget.available)
          }),
          ...template.widgets
            .filter(
              (placement) =>
                placement.widgetVersion !== undefined &&
                !widgetsById
                  .get(placement.widgetId)
                  ?.some(
                    (widget) => widget.version === placement.widgetVersion && widget.available,
                  ),
            )
            .map(
              ({ widgetId }): VoyantGraphReportingRequirement => ({
                kind: "widget",
                id: widgetId,
              }),
            ),
        ])
        return {
          ...template,
          ownerUnitId: unit.id,
          available: missingRequirements.length === 0,
          missingRequirements,
        }
      }),
    )
    .sort(compareReportingVersionedEntity)

  return { datasets, widgets, templates }
}

function compareReportingVersionedEntity(
  left: { id: string; version: number },
  right: { id: string; version: number },
): number {
  return left.id.localeCompare(right.id) || left.version - right.version
}

function uniqueReportingRequirements(
  requirements: readonly VoyantGraphReportingRequirement[],
): VoyantGraphReportingRequirement[] {
  const byKey = new Map(
    requirements.map((requirement) => [`${requirement.kind}\0${requirement.id}`, requirement]),
  )
  return [...byKey.values()].sort(compareReportingRequirement)
}

function compareReportingRequirement(
  left: VoyantGraphReportingRequirement,
  right: VoyantGraphReportingRequirement,
): number {
  return left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
}

function reportingDatasetRuntimeReferenceId(unitId: string, datasetId: string): string {
  return `${encodeURIComponent(unitId)}/reporting.datasets.runtime/${encodeURIComponent(datasetId)}`
}

function compileAccessCatalog(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  projectPresets: readonly VoyantGraphAccessPreset[],
): AccessCatalog {
  const resources = units
    .flatMap((unit) =>
      (unit.access?.resources ?? []).map(
        (resource): AccessCatalogResource => ({
          id: resource.id,
          unitId: unit.id,
          resource: resource.resource,
          label: resource.label ?? titleFromPermissionName(resource.resource),
          description: resource.description ?? `Access ${resource.resource} resources.`,
          wildcard: resource.wildcard ?? "allow",
          ...(resource.remoteSafe ? { remoteSafe: true as const } : {}),
          actions: resource.actions
            .map((action) => {
              const name = accessActionName(action)
              return {
                action: name,
                label:
                  typeof action === "string"
                    ? `${titleFromPermissionName(name)} ${resource.label ?? resource.resource}`
                    : (action.label ??
                      `${titleFromPermissionName(name)} ${resource.label ?? resource.resource}`),
                description:
                  typeof action === "string"
                    ? `${titleFromPermissionName(name)} access to ${resource.resource}.`
                    : (action.description ??
                      `${titleFromPermissionName(name)} access to ${resource.resource}.`),
                ...(typeof action !== "string" && action.sensitive
                  ? { sensitive: true as const }
                  : {}),
                ...(typeof action !== "string" && action.remoteSafe
                  ? { remoteSafe: true as const }
                  : {}),
                ...(typeof action !== "string" && action.wildcard === "explicit"
                  ? { wildcard: "explicit" as const }
                  : {}),
              }
            })
            .sort((left, right) => left.action.localeCompare(right.action)),
          ...(resource.legacyActions?.length
            ? { legacyActions: sortedUnique(resource.legacyActions) }
            : {}),
        }),
      ),
    )
    .sort((left, right) => left.resource.localeCompare(right.resource))
  const unitRoles: VoyantGraphAccessPreset[] = units.flatMap((unit) =>
    (unit.access?.roles ?? []).map((role) => ({
      id: role.id,
      kind: "staff" as const,
      label: titleFromPermissionName(role.id.split(".").at(-1) ?? role.id),
      description: "Package compatibility role preset.",
      grants: sortedUnique(role.grants),
    })),
  )
  const presets = [...projectPresets, ...unitRoles]
    .map((preset) => ({
      id: preset.id,
      kind: preset.kind,
      label: preset.label ?? titleFromPermissionName(preset.id),
      description: preset.description ?? `${preset.label ?? preset.id} access preset.`,
      grants: sortedUnique(preset.grants),
      ...(preset.audience ? { audience: preset.audience } : {}),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  return { resources, presets }
}

function validateAccessCatalog(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  projectPresets: readonly VoyantGraphAccessPreset[],
): VoyantGraphDiagnostic[] {
  const resources = units.flatMap((unit) =>
    (unit.access?.resources ?? []).map((resource) => ({ unitId: unit.id, resource })),
  )
  const diagnostics: VoyantGraphDiagnostic[] = []
  const authority = new Map<string, string>()
  const scopes = new Set<string>()
  for (const { unitId, resource } of resources) {
    const previous = authority.get(resource.resource)
    if (previous) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_DUPLICATE_ID",
          source: unitId,
          facet: resource.id,
          message: `Access resource "${resource.resource}" has duplicate authorities ${previous} and ${unitId}.`,
        }),
      )
    } else {
      authority.set(resource.resource, unitId)
    }
    const actions = new Set<string>()
    for (const action of resource.actions) {
      const name = accessActionName(action)
      if (actions.has(name)) {
        diagnostics.push(
          diagnostic({
            code: "VOYANT_GRAPH_DUPLICATE_ID",
            source: unitId,
            facet: resource.id,
            message: `Access resource "${resource.resource}" declares action "${name}" more than once.`,
          }),
        )
      }
      actions.add(name)
      scopes.add(`${resource.resource}:${name}`)
    }
  }
  const presets = [
    ...projectPresets,
    ...units
      .flatMap((unit) => unit.access?.roles ?? [])
      .map((role) => ({
        ...role,
        kind: "staff" as const,
      })),
  ]
  const presetIds = new Set<string>()
  for (const preset of presets) {
    if (presetIds.has(preset.id)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_DUPLICATE_ID",
          source: preset.id,
          facet: "access.presets",
          message: `Access preset "${preset.id}" is declared more than once.`,
        }),
      )
    }
    presetIds.add(preset.id)
    for (const grant of preset.grants) {
      if (grant === "*" || grant === "*:*" || /^\*:[a-z][a-z0-9-]*$/.test(grant)) continue
      if (/^[a-z][a-z0-9-]*:\*$/.test(grant)) {
        if (authority.has(grant.slice(0, -2))) continue
      } else if (scopes.has(grant)) {
        continue
      }
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_UNKNOWN_REFERENCE",
          source: preset.id,
          facet: "access.presets.grants",
          message: `Access preset "${preset.id}" references undeclared grant "${grant}".`,
        }),
      )
    }
  }
  return diagnostics
}

function titleFromPermissionName(value: string): string {
  return value
    .split(/[-.:]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function compileEventCatalog(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphEventCatalog {
  const events = units.flatMap((unit) =>
    unit.events.flatMap((event): VoyantGraphEventCatalogEntry[] => {
      const eventType = event.eventType?.trim()
      const version = event.version?.trim()
      if (
        !eventType ||
        !version ||
        parseVersion(version) === null ||
        !isRecord(event.payloadSchema) ||
        (event.visibility !== "internal" && event.visibility !== "external") ||
        !event.audit?.sourceModule.trim() ||
        (event.audit.category !== "domain" && event.audit.category !== "internal")
      ) {
        return []
      }
      return [
        {
          key: `${eventType}@${version}`,
          id: event.id,
          unitId: unit.id,
          packageName: unit.packageName,
          eventType,
          version,
          payloadSchema: event.payloadSchema,
          visibility: event.visibility,
          audit: event.audit,
          redactedFields: collectRedactedFieldPaths(event.payloadSchema),
        },
      ]
    }),
  )
  return {
    schemaVersion: VOYANT_EVENT_CATALOG_SCHEMA_VERSION,
    events: events.sort(
      (left, right) =>
        left.eventType.localeCompare(right.eventType) ||
        left.version.localeCompare(right.version) ||
        left.id.localeCompare(right.id),
    ),
  }
}

function collectRedactedFieldPaths(schema: VoyantGraphJsonObject): string[] {
  const paths = new Set<string>()

  const visit = (value: unknown, path: string) => {
    if (!isRecord(value)) return
    if (path && (value.writeOnly === true || value["x-voyant-redact"] === true)) {
      paths.add(path)
    }
    if (isRecord(value.properties)) {
      for (const [property, propertySchema] of Object.entries(value.properties)) {
        visit(propertySchema, path ? `${path}.${property}` : property)
      }
    }
    if (value.items !== undefined) visit(value.items, `${path}[]`)
    for (const combinator of ["allOf", "anyOf", "oneOf"] as const) {
      if (!Array.isArray(value[combinator])) continue
      for (const branch of value[combinator]) visit(branch, path)
    }
  }

  visit(schema, "")
  return [...paths].sort()
}

function compileWebhookPlan(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphWebhookPlan {
  const apiById = new Map(
    units.flatMap((unit) => unit.api.map((api) => [api.id, { api, unit }] as const)),
  )
  const eventById = new Map(
    units.flatMap((unit) => unit.events.map((event) => [event.id, { event, unit }] as const)),
  )
  const inbound: VoyantGraphInboundWebhookPlanEntry[] = []
  const outbound: VoyantGraphOutboundWebhookPlanEntry[] = []

  for (const unit of units) {
    for (const webhook of unit.webhooks ?? []) {
      const secretIds = sortedUnique(webhook.secretIds ?? [])
      if (webhook.direction === "inbound" && webhook.apiId) {
        const target = apiById.get(webhook.apiId)
        if (target?.api.surface === "webhook" && target.api.runtime) {
          inbound.push({
            id: webhook.id,
            unitId: unit.id,
            packageName: unit.packageName,
            apiId: webhook.apiId,
            apiUnitId: target.unit.id,
            mountPath: webhookRouteMountPath(target.unit, target.api),
            secretIds,
          })
        }
      }
      if (webhook.direction === "outbound" && webhook.eventId) {
        const target = eventById.get(webhook.eventId)
        if (
          target?.event.eventType?.trim() &&
          target.event.visibility === "external" &&
          target.event.version &&
          isExternalWebhookPayloadSchema(target.event.payloadSchema) &&
          target.event.audit
        ) {
          outbound.push({
            id: webhook.id,
            unitId: unit.id,
            packageName: unit.packageName,
            eventId: webhook.eventId,
            eventUnitId: target.unit.id,
            eventType: target.event.eventType,
            eventVersion: target.event.version,
            payloadSchema: target.event.payloadSchema,
            visibility: target.event.visibility,
            audit: target.event.audit,
            secretIds,
          })
        }
      }
    }
  }

  const byIdentity = <T extends { id: string; unitId: string }>(left: T, right: T) =>
    left.id.localeCompare(right.id) || left.unitId.localeCompare(right.unitId)
  return { inbound: inbound.sort(byIdentity), outbound: outbound.sort(byIdentity) }
}

function webhookRouteMountPath(
  unit: ResolvedVoyantGraphUnit,
  route: VoyantGraphRouteBundle,
): string {
  if (route.mount?.startsWith("/")) return route.mount
  const segment = route.mount ?? unit.localId ?? unit.id.split("#").at(-1) ?? unit.id
  return `/v1/${segment.replace(/^\/+|\/+$/g, "")}`
}

function validateCapabilityClosure(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const providers = new Set(units.flatMap((unit) => unit.provides.capabilities))
  const diagnostics: VoyantGraphDiagnostic[] = []
  for (const unit of units) {
    for (const capability of unit.requires.capabilities) {
      if (providers.has(capability)) continue
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_MISSING_CAPABILITY",
          source: unit.id,
          facet: "requires.capabilities",
          message: `Required capability ${capability} is not provided by the selected graph.`,
          hint: "Select a graph unit that provides the required capability.",
        }),
      )
    }
  }
  return diagnostics
}

function validatePortClosure(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const providers = new Set(units.flatMap((unit) => unit.provides.ports.map((port) => port.id)))
  const diagnostics: VoyantGraphDiagnostic[] = []
  for (const unit of units) {
    for (const port of unit.requires.ports) {
      if (port.optional || providers.has(port.id)) continue
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_MISSING_PORT",
          source: unit.id,
          facet: "requires.ports",
          message: `Required port ${port.id} is not provided by the selected graph.`,
          hint: "Select a graph unit that provides the required port.",
        }),
      )
    }
  }
  return diagnostics
}

function validateDeploymentProviderSelections(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  providers: Partial<Record<VoyantDeploymentProviderRole | string, string>>,
): VoyantGraphDiagnostic[] {
  return [...validatePaymentProviderSelection(units, providers)]
}

function validateConditionalActionAvailability(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  selections: Partial<Record<VoyantDeploymentProviderRole | string, string>>,
): VoyantGraphDiagnostic[] {
  const diagnostics: VoyantGraphDiagnostic[] = []
  for (const unit of units) {
    for (const [actionIndex, action] of (unit.actions ?? []).entries()) {
      const condition = normalizedActionAvailabilityCondition(action)
      if (!condition) continue
      for (const port of condition.selectedProviderPorts.ports) {
        const facet = `actions[${actionIndex}].availability.enableWhen.selectedProviderPorts.ports`
        const consumerPort = unit.runtimePorts?.find((candidate) => candidate.id === port)
        if (
          !consumerPort ||
          consumerPort.cardinality === "many" ||
          consumerPort.conformance === undefined
        ) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_FACET",
              source: unit.id,
              facet,
              message: `Conditional action "${action.id}" must consume one-valued typed runtime port "${port}" with an importable conformance reference in its owning unit runtimePorts.`,
              hint: "Declare the dedicated typed port with definePort({ conformance }) and consume it as an optional or required one-valued runtime port.",
            }),
          )
        }

        const candidates = closedProviderDeclarationsForPort(units, port)
        if (candidates.length === 0) {
          // Provider packages can be project-local or supplied by a managed
          // deployment. Their absence from a distributable OSS graph is a
          // valid disabled state: the action remains unavailable until one
          // exact provider declaration is selected and passes runtime
          // conformance. The owning module's typed, one-valued consumer port
          // above still catches misspelled or untyped conditions.
          continue
        }

        const selected = candidates.filter(({ declaration }) =>
          providerDeclarationIsSelected(declaration, selections),
        )
        if (selected.length > 1) {
          diagnostics.push(
            diagnostic({
              code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
              source: unit.id,
              facet,
              message: `Conditional action "${action.id}" resolves provider port "${port}" ambiguously to ${selected.length} selected provider declarations.`,
              hint: `Select exactly one provider declaration for "${port}".`,
            }),
          )
        }
      }
    }
  }
  return diagnostics
}

function resolveConditionalActionAvailability(
  unit: ResolvedVoyantGraphUnit,
): ResolvedVoyantGraphUnit {
  if (!unit.actions?.some((action) => normalizedActionAvailabilityCondition(action))) return unit
  return {
    ...unit,
    actions: unit.actions.map((action) => {
      const condition = normalizedActionAvailabilityCondition(action)
      if (!condition) return action
      const availability = action.availability
      if (availability?.status !== "unavailable") return action
      return {
        ...action,
        availability: { ...availability, enableWhen: condition },
      }
    }),
  }
}

function normalizedActionAvailabilityCondition(
  action: VoyantGraphActionDeclaration | ResolvedVoyantGraphActionDeclaration,
): VoyantGraphActionAvailabilityCondition | undefined {
  const availability = action.availability
  if (availability?.status !== "unavailable") return undefined
  const condition = availability.enableWhen
  if (!isRecord(condition) || !hasExactKeys(condition, ["selectedProviderPorts"])) return undefined
  const selectedProviderPorts = condition.selectedProviderPorts
  if (
    !isRecord(selectedProviderPorts) ||
    !hasExactKeys(selectedProviderPorts, ["mode", "ports"]) ||
    (selectedProviderPorts.mode !== "all" && selectedProviderPorts.mode !== "any") ||
    !Array.isArray(selectedProviderPorts.ports) ||
    selectedProviderPorts.ports.length === 0 ||
    selectedProviderPorts.ports.some(
      (port) => typeof port !== "string" || !PORT_ID_PATTERN.test(port),
    ) ||
    new Set(selectedProviderPorts.ports).size !== selectedProviderPorts.ports.length
  ) {
    return undefined
  }
  return {
    selectedProviderPorts: {
      mode: selectedProviderPorts.mode,
      ports: sortedUnique(selectedProviderPorts.ports as string[]),
    },
  }
}

function closedProviderDeclarationsForPort(
  units: readonly (ResolvedVoyantGraphUnit & { original?: VoyantGraphUnitManifest })[],
  port: string,
): { unitId: string; declaration: VoyantGraphProviderDeclaration }[] {
  return units.flatMap((unit) => {
    if (!unit.provides.ports.some((provided) => provided.id === port)) return []
    return (unit.providers ?? [])
      .filter(
        (declaration) =>
          declaration.port === port &&
          typeof declaration.selection?.role === "string" &&
          typeof declaration.selection.value === "string",
      )
      .map((declaration) => ({ unitId: unit.id, declaration }))
  })
}

function providerDeclarationIsSelected(
  declaration: VoyantGraphProviderDeclaration,
  selections: Partial<Record<VoyantDeploymentProviderRole | string, string>>,
): boolean {
  const selection = declaration.selection
  return (
    selection !== undefined &&
    selections[selection.role] === canonicalDeploymentProvider(selection.role, selection.value)
  )
}

function validatePaymentProviderSelection(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  providers: Partial<Record<VoyantDeploymentProviderRole | string, string>>,
): VoyantGraphDiagnostic[] {
  const paymentCapable = units.some(
    (unit) =>
      unit.provides.capabilities.includes("finance.payment-sessions") ||
      unit.requires.capabilities.includes("finance.payment-sessions"),
  )
  if (!paymentCapable) return []

  const selected = providers.payments
  if (!selected || selected === "none") {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
        facet: "deployment.providers.payments",
        message:
          "Payment-capable graphs must explicitly select one active deployment.providers.payments adapter.",
        hint: 'Set deployment.providers.payments to "managed", "voyant-pay", or "custom"; environment variables never select a payment processor. A specific processor is chosen as catalog data, not here.',
      }),
    ]
  }

  if (selected === "custom") return []

  const selectedProviderDeclarations = units.flatMap((unit) =>
    (unit.providers ?? [])
      .filter(
        (provider) =>
          provider.selection?.role === "payments" &&
          canonicalDeploymentProvider("payments", provider.selection.value) === selected,
      )
      .map((provider) => ({ unitId: unit.id, providerId: provider.id })),
  )
  if (selectedProviderDeclarations.length !== 1) {
    return [
      diagnostic({
        code: "VOYANT_GRAPH_INVALID_PROVIDER_SELECTION",
        facet: "providers.selection",
        message: `deployment.providers.payments=${JSON.stringify(
          selected,
        )} must match exactly one selected payment adapter provider; found ${selectedProviderDeclarations.length}.`,
        hint: "Select exactly one adapter package for the configured payment provider, or use custom for an operator-owned adapter.",
      }),
    ]
  }

  return []
}

function validateDuplicateEntityIds(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
): VoyantGraphDiagnostic[] {
  const owners = new Map<string, string[]>()
  for (const unit of units) {
    for (const id of unitEntityIds(unit)) {
      const seen = owners.get(id) ?? []
      seen.push(unit.id)
      owners.set(id, seen)
    }
  }

  return [...owners.entries()]
    .filter(([, unitIds]) => unitIds.length > 1)
    .map(([id, unitIds]) =>
      diagnostic({
        code: "VOYANT_GRAPH_DUPLICATE_ENTITY_ID",
        source: sortedUnique(unitIds).join(", "),
        message: `Graph entity id "${id}" is declared more than once.`,
      }),
    )
}

function validatePackageAdmission(
  packageRecords: readonly VoyantGraphPackageRecord[],
  context: {
    frameworkVersion?: string
    target?: VoyantGraphRuntimeTarget
    mode?: VoyantGraphProjectDeploymentMode
    admission?: VoyantGraphAdmissionPolicy
  },
): VoyantGraphDiagnostic[] {
  const diagnostics: VoyantGraphDiagnostic[] = []
  const allowedSources = context.admission?.allowedSourceKinds
    ? new Set(context.admission.allowedSourceKinds)
    : undefined

  for (const record of packageRecords) {
    if (allowedSources && !allowedSources.has(record.source.kind)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_PACKAGE_SOURCE_UNADMITTED",
          source: record.packageName,
          facet: "package.source",
          message: `Package "${record.packageName}" is sourced from "${record.source.kind}", which is not admitted by policy.`,
        }),
      )
    }

    const compatibleWith = record.metadata?.compatibleWith
    if (
      context.frameworkVersion &&
      compatibleWith?.framework &&
      !isVoyantVersionCompatible(context.frameworkVersion, compatibleWith.framework)
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE",
          source: record.packageName,
          facet: "package.compatibleWith.framework",
          message: `Package "${record.packageName}" is not compatible with framework version "${context.frameworkVersion}".`,
        }),
      )
    }
    if (
      context.target &&
      compatibleWith?.targets &&
      !compatibleWith.targets.includes(context.target)
    ) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE",
          source: record.packageName,
          facet: "package.compatibleWith.targets",
          message: `Package "${record.packageName}" is not compatible with target "${context.target}".`,
        }),
      )
    }
    if (context.mode && compatibleWith?.modes && !compatibleWith.modes.includes(context.mode)) {
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_PACKAGE_INCOMPATIBLE",
          source: record.packageName,
          facet: "package.compatibleWith.modes",
          message: `Package "${record.packageName}" is not compatible with deployment mode "${context.mode}".`,
        }),
      )
    }
  }
  return diagnostics
}

function validateRuntimeReferenceAdmission(
  units: readonly ResolvedVoyantGraphUnit[],
  packageRecords: readonly VoyantGraphPackageRecord[],
): VoyantGraphDiagnostic[] {
  const admittedPackages = new Set(packageRecords.map((record) => record.packageName))
  const diagnostics: VoyantGraphDiagnostic[] = []

  for (const unit of units) {
    const references: Array<{ entry: string; facet: string }> = []
    const add = (facet: string, runtime?: { entry: string }) => {
      if (runtime) references.push({ entry: runtime.entry, facet })
    }
    add("runtime.entry", unit.runtime)
    for (const route of unit.api) add(`api.${route.id}.runtime.entry`, route.runtime)
    for (const config of unit.config ?? []) {
      add(`config.validator.${config.id}.entry`, config.validator)
    }
    for (const secret of unit.secrets ?? []) {
      add(`secrets.validator.${secret.id}.entry`, secret.validator)
    }
    for (const provider of unit.providers ?? []) {
      add(`providers.runtime.${provider.id}.entry`, provider.runtime)
    }
    add("admin.runtime.entry", unit.admin?.runtime)
    add("admin.shellRuntime.entry", unit.admin?.shellRuntime)
    for (const copy of unit.admin?.copy ?? []) {
      add(`admin.copy.runtime.${copy.id}.entry`, copy.runtime)
    }
    for (const route of unit.admin?.routes ?? []) {
      add(`admin.routes.runtime.${route.id}.entry`, route.runtime)
    }
    for (const contribution of unit.admin?.contributions ?? []) {
      add(`admin.contributions.runtime.${contribution.id}.entry`, contribution.runtime)
    }
    for (const presentation of unit.presentations ?? []) {
      add(`presentations.runtime.${presentation.id}.entry`, presentation.runtime)
    }
    for (const dataset of unit.reporting?.datasets ?? []) {
      add(`reporting.datasets.runtime.${dataset.id}.entry`, dataset.runtime)
    }
    for (const tool of unit.tools ?? []) add(`tools.runtime.${tool.id}.entry`, tool.runtime)
    for (const job of unit.jobs) add(`jobs.runtime.${job.id}.entry`, job.runtime)
    for (const subscriber of unit.subscribers) {
      add(`subscribers.runtime.${subscriber.id}.entry`, subscriber.runtime)
    }

    for (const { entry, facet } of references) {
      const packageName = entry.startsWith(".") ? unit.packageName : packageNameFromSpecifier(entry)
      if (admittedPackages.has(packageName)) continue
      diagnostics.push(
        diagnostic({
          code: "VOYANT_GRAPH_RUNTIME_PACKAGE_UNADMITTED",
          source: unit.id,
          facet,
          message: `Runtime ${facet} entry ${entry} resolves to ${packageName}, which is not present in admitted package records.`,
          hint: "Declare runtime code from the owning package or add and admit the referenced package.",
        }),
      )
    }
  }

  return diagnostics
}

/** Deterministic semver-range subset shared by package admission and graph lifecycle planning. */
export function isVoyantVersionCompatible(version: string, range: string): boolean {
  const parsedVersion = parseVersion(version)
  if (!parsedVersion) return version === range
  const clauses = range
    .split("||")
    .map((clause) => clause.trim())
    .filter(Boolean)
  for (const clause of clauses) {
    const tokens = clause.split(/\s+/).filter(Boolean)
    if (tokens.every((token) => satisfiesVersionConstraint(parsedVersion, token))) return true
  }
  return false
}

function satisfiesVersionConstraint(version: ParsedVersion, token: string): boolean {
  const normalized = token.trim()
  if (normalized === "*" || normalized.toLowerCase() === "x") return true
  if (normalized.startsWith("^")) return satisfiesCaret(version, normalized.slice(1))
  if (normalized.startsWith("~")) return satisfiesTilde(version, normalized.slice(1))

  for (const operator of [">=", "<=", ">", "<"] as const) {
    if (!normalized.startsWith(operator)) continue
    const target = parseVersion(normalized.slice(operator.length))
    if (!target) return false
    const comparison = compareVersions(version, target)
    if (operator === ">=") return comparison >= 0
    if (operator === "<=") return comparison <= 0
    if (operator === ">") return comparison > 0
    return comparison < 0
  }

  const targetText = normalized.startsWith("=") ? normalized.slice(1) : normalized
  if (isWildcardVersion(targetText)) return satisfiesWildcard(version, targetText)

  const target = parseVersion(targetText)
  if (!target) return false
  return compareVersions(version, target) === 0
}

function satisfiesCaret(version: ParsedVersion, targetText: string): boolean {
  const target = parseVersion(targetText)
  if (!target || compareVersions(version, target) < 0) return false
  if (target.major > 0) {
    return compareVersions(version, { major: target.major + 1, minor: 0, patch: 0 }) < 0
  }
  if (target.minor > 0) {
    return compareVersions(version, { major: 0, minor: target.minor + 1, patch: 0 }) < 0
  }
  return compareVersions(version, { major: 0, minor: 0, patch: target.patch + 1 }) < 0
}

function satisfiesTilde(version: ParsedVersion, targetText: string): boolean {
  const target = parseVersion(targetText)
  if (!target) return false
  return (
    compareVersions(version, target) >= 0 &&
    compareVersions(version, { major: target.major, minor: target.minor + 1, patch: 0 }) < 0
  )
}

function isWildcardVersion(value: string): boolean {
  return /^(?:\d+|x|\*)(?:\.(?:\d+|x|\*)){0,2}$/i.test(value)
}

function satisfiesWildcard(version: ParsedVersion, targetText: string): boolean {
  const [major, minor, patch] = targetText.split(".")
  if (!matchesVersionPart(version.major, major)) return false
  if (minor == null) return true
  if (!matchesVersionPart(version.minor, minor)) return false
  if (patch == null) return true
  return matchesVersionPart(version.patch, patch)
}

function matchesVersionPart(actual: number, expected: string | undefined): boolean {
  return expected == null || expected === "*" || expected.toLowerCase() === "x"
    ? true
    : actual === Number(expected)
}

function parseVersion(value: string): ParsedVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim())
  if (!match) return null
  return {
    major: Number(match[1] ?? 0),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
  }
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

function unitEntityIds(unit: ResolvedVoyantGraphUnit): string[] {
  return [
    ...unit.api.map((entry) => entry.id),
    ...unit.schema.map((entry) => entry.id),
    ...unit.migrations.map((entry) => entry.id),
    ...unit.links.map((entry) => entry.id),
    ...unit.subscribers.map((entry) => entry.id),
    ...unit.events.map((entry) => entry.id),
    ...(unit.setupMigrations ?? []).map((entry) => entry.id),
    ...(unit.config ?? []).map((entry) => entry.id),
    ...(unit.secrets ?? []).map((entry) => entry.id),
    ...(unit.resources ?? []).map((entry) => entry.id),
    ...(unit.providers ?? []).map((entry) => entry.id),
    ...(unit.access?.resources ?? []).map((entry) => entry.id),
    ...(unit.access?.roles ?? []).map((entry) => entry.id),
    ...(unit.admin?.copy ?? []).map((entry) => entry.id),
    ...(unit.admin?.routes ?? []).map((entry) => entry.id),
    ...(unit.admin?.nav ?? []).map((entry) => entry.id),
    ...(unit.admin?.slots ?? []).map((entry) => entry.id),
    ...(unit.admin?.contributions ?? []).map((entry) => entry.id),
    ...(unit.presentations ?? []).map((entry) => entry.id),
    ...(unit.reporting?.datasets ?? []).map((entry) => entry.id),
    ...(unit.reporting?.widgets ?? []).map((entry) => entry.id),
    ...(unit.reporting?.templates ?? []).map((entry) => entry.id),
    ...(unit.tools ?? []).map((entry) => entry.id),
    ...(unit.webhooks ?? []).map((entry) => entry.id),
    ...(unit.actions ?? []).map((entry) => entry.id),
    ...(unit.lifecycle?.cleanup ?? []).map((entry) => entry.id),
    ...unit.jobs.map((entry) => entry.id),
  ]
}

function mergePackageRecords(
  units: readonly (ResolvedVoyantGraphUnit & { original: VoyantGraphUnitManifest })[],
  selections: VoyantGraphProjectSelections | undefined,
  input: readonly VoyantGraphPackageRecord[],
): VoyantGraphPackageRecord[] {
  const selectionsById = new Map(
    [
      ...(selections?.modules ?? []),
      ...(selections?.extensions ?? []),
      ...(selections?.plugins ?? []),
      ...(selections?.adapters ?? []),
      ...(selections?.providers ?? []),
    ].map((selection) => [selection.id, selection]),
  )
  const records = new Map<string, VoyantGraphPackageRecord>()
  for (const unit of units) {
    const selection = selectionsById.get(unit.id)
    records.set(unit.packageName, {
      packageName: unit.packageName,
      source:
        selection?.provenance.kind === "path"
          ? { kind: "file", reference: selection.provenance.path }
          : {
              kind: "unknown",
              ...(selection?.provenance.kind === "package"
                ? { reference: selection.provenance.packageName }
                : {}),
            },
    })
  }
  for (const record of input) {
    records.set(record.packageName, normalizePackageRecord(record))
  }
  return [...records.values()].sort((a, b) => a.packageName.localeCompare(b.packageName))
}

function normalizePackageRecord(record: VoyantGraphPackageRecord): VoyantGraphPackageRecord {
  return {
    packageName: record.packageName,
    ...(record.version ? { version: record.version } : {}),
    source: {
      kind: record.source.kind,
      ...(record.source.reference ? { reference: record.source.reference } : {}),
      ...(record.source.integrity ? { integrity: record.source.integrity } : {}),
    },
    ...(record.metadata ? { metadata: record.metadata } : {}),
  }
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

function allResolvedGraphUnits(
  graph: Pick<ResolvedVoyantDeploymentGraph, "modules" | "extensions" | "plugins"> & {
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

function routePaths(graph: ResolvedVoyantDeploymentGraph): string[] {
  return allResolvedGraphUnits(graph)
    .flatMap((unit) =>
      unit.api.map((route) => {
        if (route.mount?.startsWith("/")) return route.mount
        const segment = unit.localId ?? unit.id.split("#").at(-1) ?? unit.id
        if (route.surface === "admin") return `/v1/admin/${segment}`
        if (route.surface === "public") return `/v1/public/${segment}`
        if (route.surface === "webhook") return `/v1/${segment}`
        return route.mount ?? route.id
      }),
    )
    .sort()
}

function formatDiagnostics(diagnostics: readonly VoyantGraphDiagnostic[]): string {
  return diagnostics
    .map((entry) => `- ${entry.code}: ${entry.message}${entry.source ? ` (${entry.source})` : ""}`)
    .join("\n")
}

async function graphWithDiagnostics(
  graph: ResolvedVoyantDeploymentGraph,
  additional: readonly VoyantGraphDiagnostic[],
): Promise<ResolvedVoyantDeploymentGraph> {
  const { contentHash: _contentHash, ...withoutHash } = graph
  const next = {
    ...withoutHash,
    diagnostics: sortDiagnostics([...graph.diagnostics, ...additional]),
  }
  return {
    ...next,
    contentHash: `sha256:${await sha256(next)}`,
  }
}

function sortFacetEntities<T extends { id: string }>(entities: readonly T[]): T[] {
  return [...entities].sort((a, b) => a.id.localeCompare(b.id))
}

function sortPorts(ports: readonly VoyantGraphPortDeclaration[]): VoyantGraphPortDeclaration[] {
  return [...ports].sort((a, b) => a.id.localeCompare(b.id))
}

function validCustomSourceSpecifiers(specifiers: readonly string[]): string[] {
  return sortedUnique(
    specifiers.map((specifier) => specifier.trim()).filter((specifier) => specifier.length > 0),
  )
}

function splitPackageSpecifier(specifier: string): { packageName: string; subpath?: string } {
  const trimmed = specifier.trim()
  if (trimmed.startsWith("operator/")) {
    return {
      packageName: "@voyant-travel/operator",
      subpath: trimmed.slice("operator/".length),
    }
  }

  const parts = trimmed.split("/")
  if (trimmed.startsWith("@")) {
    const packageName = parts.slice(0, 2).join("/")
    const subpath = parts.slice(2).join("/")
    return { packageName, ...(subpath ? { subpath } : {}) }
  }

  const [packageName, ...subpathParts] = parts
  return {
    packageName: packageName ?? trimmed,
    ...(subpathParts.length > 0 ? { subpath: subpathParts.join("/") } : {}),
  }
}

function packageNameFromGraphId(id: string): string {
  return id.split("#")[0] ?? id
}

function isPackageGraphNamespace(graphPackageId: string, packageName: string): boolean {
  return (
    graphPackageId === packageName ||
    (!packageName.includes("/") && graphPackageId === `npm/${packageName}`)
  )
}

function isCanonicalGraphId(id: string): boolean {
  return GRAPH_ID_PATTERN.test(id)
}

function usesReservedCapabilityNamespace(token: string): boolean {
  const [prefix] = token.split(".")
  return prefix === "voyant" || STANDARD_CAPABILITY_PREFIXES.has(prefix ?? "")
}

function isFirstPartyPackage(packageName: string | undefined): boolean {
  return packageName?.startsWith("@voyant-travel/") ?? false
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function sortDiagnostics(diagnostics: readonly VoyantGraphDiagnostic[]): VoyantGraphDiagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      (a.source ?? "").localeCompare(b.source ?? "") ||
      (a.facet ?? "").localeCompare(b.facet ?? "") ||
      a.message.localeCompare(b.message),
  )
}

function diagnostic(
  input: Omit<VoyantGraphDiagnostic, "severity"> & {
    severity?: VoyantGraphDiagnosticSeverity
  },
): VoyantGraphDiagnostic {
  return {
    severity: input.severity ?? "error",
    ...input,
  }
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(canonicalize)

  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key])
  }
  return sorted
}

function getCrypto(): Crypto {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) {
    throw new Error(
      "@voyant-travel/framework/deployment-graph: globalThis.crypto.subtle is required for graph hashing.",
    )
  }
  return crypto
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0")
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  const actual = Object.keys(value)
  return actual.length === expected.size && actual.every((key) => expected.has(key))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
