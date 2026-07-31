import type {
  VoyantGraphFacetEntity,
  VoyantGraphJsonObject,
  VoyantGraphJsonValue,
  VoyantGraphRuntimeReference,
} from "./project.js"

export interface VoyantGraphConfigDeclaration extends VoyantGraphFacetEntity {
  key: string
  validator?: VoyantGraphRuntimeReference
  default?: VoyantGraphJsonValue
  required?: boolean
}

export interface VoyantGraphSecretDeclaration extends VoyantGraphFacetEntity {
  key: string
  validator?: VoyantGraphRuntimeReference
  required?: boolean
  description?: string
  rotation?: "supported" | "replace-only"
}

export interface VoyantGraphResourceDeclaration extends VoyantGraphFacetEntity {
  kind: string
  required?: boolean
  capabilities?: readonly string[]
  config?: VoyantGraphJsonObject
}

export interface VoyantGraphProviderDeclaration extends VoyantGraphFacetEntity {
  port: string
  /** Explicit deployment.providers match. Provider ids and env never select implementations. */
  selection?: {
    role: string
    value: string
  }
  runtime: VoyantGraphRuntimeReference
  config?: VoyantGraphJsonObject
  /** Unit-owned graph values this provider factory is allowed to consume. */
  uses?: {
    config?: readonly string[]
    secrets?: readonly string[]
    resources?: readonly string[]
  }
}

export interface VoyantGraphAccessAction {
  action: string
  label?: string
  description?: string
  /** Destructive, financial, PII, or otherwise privileged action surfaced distinctly to editors. */
  sensitive?: boolean
  /** Safe for remote app OAuth consent and token grants. */
  remoteSafe?: boolean
  /** Explicit actions are never satisfied by wildcard grants. */
  wildcard?: "allow" | "explicit"
}

export interface VoyantGraphAccessResource extends VoyantGraphFacetEntity {
  resource: string
  label?: string
  description?: string
  /** Explicit resources are never satisfied by a wildcard on another resource. */
  wildcard?: "allow" | "explicit-resource"
  /** Safe for remote app OAuth consent and token grants. */
  remoteSafe?: boolean
  actions: readonly (string | VoyantGraphAccessAction)[]
  /** Accepted for stored-token compatibility but omitted from permission editors. */
  legacyActions?: readonly string[]
}

export interface VoyantGraphAccessRole extends VoyantGraphFacetEntity {
  grants: readonly string[]
}

export interface VoyantGraphAccessDeclaration {
  resources?: readonly VoyantGraphAccessResource[]
  roles?: readonly VoyantGraphAccessRole[]
}

export type VoyantGraphAccessPresetKind = "api-token" | "api-token-grant" | "staff"

export interface VoyantGraphAccessPreset extends VoyantGraphFacetEntity {
  kind: VoyantGraphAccessPresetKind
  label?: string
  description?: string
  grants: readonly string[]
  audience?: "staff" | "customer" | "partner" | "supplier"
}

export interface VoyantGraphProjectAccessDeclaration {
  presets?: readonly VoyantGraphAccessPreset[]
}

export interface VoyantGraphMessageReference {
  namespace: string
  key: string
}

export interface VoyantGraphAdminCopy extends VoyantGraphFacetEntity {
  namespace: string
  fallbackLocale: string
  runtime: VoyantGraphRuntimeReference
}

export interface VoyantGraphAdminRoute extends VoyantGraphFacetEntity {
  path: string
  runtime: VoyantGraphRuntimeReference
  requiredScopes?: readonly string[]
  copy?: readonly VoyantGraphMessageReference[]
}

export interface VoyantGraphAdminNavItem extends VoyantGraphFacetEntity {
  routeId: string
  label: VoyantGraphMessageReference
  order?: number
}

export interface VoyantGraphAdminSlot extends VoyantGraphFacetEntity {
  routeId: string
  contract?: VoyantGraphJsonObject
}

export interface VoyantGraphAdminContribution extends VoyantGraphFacetEntity {
  slotId: string
  runtime: VoyantGraphRuntimeReference
  order?: number
  requiredScopes?: readonly string[]
  copy?: readonly VoyantGraphMessageReference[]
}

export interface VoyantGraphAdminSetupStep extends VoyantGraphFacetEntity {
  skippable: boolean
}

export interface VoyantGraphAdminDeclaration {
  /** Import-cheap factory for this unit's complete nav/route/page extension. */
  runtime?: VoyantGraphRuntimeReference
  /** Stable ordering for selected factories that contribute at the same host anchor. */
  compositionOrder?: number
  copy?: readonly VoyantGraphAdminCopy[]
  routes?: readonly VoyantGraphAdminRoute[]
  nav?: readonly VoyantGraphAdminNavItem[]
  slots?: readonly VoyantGraphAdminSlot[]
  contributions?: readonly VoyantGraphAdminContribution[]
  /** Trusted persistence policy for package-owned setup guidance. */
  setupSteps?: readonly VoyantGraphAdminSetupStep[]
}

export interface VoyantGraphPresentationRouteDeclaration {
  /** Router path as passed to `createFileRoute`, e.g. "/(auth)/sign-in". */
  route: string
  /** Member on the presentation's frontend route contribution, e.g. "signIn". */
  member: string
}

/** A package-owned frontend presentation selected through the deployment graph. */
export interface VoyantGraphPresentationDeclaration extends VoyantGraphFacetEntity {
  runtime: VoyantGraphRuntimeReference
  /**
   * Key on `operatorFrontend.routes` carrying this presentation's route
   * contribution. Required when `routes` is present.
   */
  contribution?: string
  routes?: readonly VoyantGraphPresentationRouteDeclaration[]
}

export interface VoyantGraphReportingGridSize {
  width: number
  height: number
}

export interface VoyantGraphReportingGridPlacement extends VoyantGraphReportingGridSize {
  x: number
  y: number
}

export type VoyantGraphReportingFieldValueType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "currency"
  | "json"

export type VoyantGraphReportingAggregation =
  | "count"
  | "countDistinct"
  | "sum"
  | "average"
  | "minimum"
  | "maximum"

export interface VoyantGraphReportingDatasetField {
  id: string
  label: string
  description?: string
  role: "dimension" | "measure"
  valueType: VoyantGraphReportingFieldValueType
  sensitivity?: "public" | "internal" | "pii" | "sensitive"
  requiredScopes?: readonly string[]
  aggregations?: readonly VoyantGraphReportingAggregation[]
}

/** Serializable dataset definition fields; identity and scopes live on the facet entity. */
export interface VoyantGraphReportingDatasetDescriptor {
  grain: string
  fields: readonly VoyantGraphReportingDatasetField[]
  defaultLimit?: number
  maximumLimit?: number
  /**
   * Field the page-level date window (`dateFrom`/`dateTo`) filters on when a
   * report does not name one explicitly. Optional: datasets without a natural
   * primary date leave it unset and simply ignore the window.
   */
  defaultDateField?: string
}

/** Package-owned semantic dataset metadata. Executable query behavior stays behind runtime. */
export interface VoyantGraphReportingDataset extends VoyantGraphFacetEntity {
  version: number
  label: string
  description?: string
  descriptor: VoyantGraphReportingDatasetDescriptor
  runtime: VoyantGraphRuntimeReference
  requiredScopes?: readonly string[]
}

export type VoyantGraphReportingScalar = string | number | boolean | null

export type VoyantGraphReportingValueReference =
  | {
      kind: "literal"
      value: VoyantGraphReportingScalar | readonly VoyantGraphReportingScalar[]
    }
  | { kind: "parameter"; name: string }

export interface VoyantGraphReportingFilter {
  field: string
  operator:
    | "equal"
    | "notEqual"
    | "in"
    | "notIn"
    | "greaterThan"
    | "greaterThanOrEqual"
    | "lessThan"
    | "lessThanOrEqual"
    | "between"
    | "contains"
    | "isNull"
    | "isNotNull"
  value?: VoyantGraphReportingValueReference
}

export type VoyantGraphReportingSelection =
  | { kind: "field"; field: string; as?: string }
  | { kind: "aggregate"; operation: VoyantGraphReportingAggregation; field?: string; as: string }

export interface VoyantGraphReportingQuery {
  select: readonly VoyantGraphReportingSelection[]
  filters?: readonly VoyantGraphReportingFilter[]
  groupBy?: readonly {
    field: string
    timeGrain?: "day" | "week" | "month" | "quarter" | "year"
  }[]
  orderBy?: readonly { by: string; direction?: "ascending" | "descending" }[]
  limit?: number
}

export interface VoyantGraphReportingVisualization {
  type: "kpi" | "table" | "line" | "bar" | "pie"
  options?: VoyantGraphJsonObject
}

/** A reusable, package-owned query and visualization preset. */
export interface VoyantGraphReportingWidget extends VoyantGraphFacetEntity {
  version: number
  label: string
  description?: string
  datasetId: string
  /** Dataset contract version used by this preset. Omit only to deliberately follow latest. */
  datasetVersion?: number
  query: VoyantGraphReportingQuery
  visualization: VoyantGraphReportingVisualization
  defaultSize: VoyantGraphReportingGridSize
  minSize?: VoyantGraphReportingGridSize
  maxSize?: VoyantGraphReportingGridSize
}

export type VoyantGraphReportingRequirementKind = "dataset" | "widget"

export interface VoyantGraphReportingRequirement {
  kind: VoyantGraphReportingRequirementKind
  id: string
}

export interface VoyantGraphReportTemplateWidget {
  /** Template-local stable instance id used by persisted layouts. */
  id: string
  widgetId: string
  /** Widget preset version used by this template. Omit only to deliberately follow latest. */
  widgetVersion?: number
  layout: VoyantGraphReportingGridPlacement
  title?: string
}

/** A complete grid page which may compose widgets contributed by several selected units. */
export interface VoyantGraphReportTemplate extends VoyantGraphFacetEntity {
  version: number
  label: string
  description?: string
  parameters?: readonly string[]
  requirements?: readonly VoyantGraphReportingRequirement[]
  widgets: readonly VoyantGraphReportTemplateWidget[]
}

export interface VoyantGraphReportingDeclaration {
  datasets?: readonly VoyantGraphReportingDataset[]
  widgets?: readonly VoyantGraphReportingWidget[]
  templates?: readonly VoyantGraphReportTemplate[]
}

export interface VoyantGraphResolvedReportingDataset extends VoyantGraphReportingDataset {
  ownerUnitId: string
  runtimeReferenceId: string
}

export interface VoyantGraphResolvedReportingWidget extends VoyantGraphReportingWidget {
  ownerUnitId: string
  available: boolean
  missingRequirements: readonly VoyantGraphReportingRequirement[]
}

export interface VoyantGraphResolvedReportTemplate extends VoyantGraphReportTemplate {
  ownerUnitId: string
  available: boolean
  missingRequirements: readonly VoyantGraphReportingRequirement[]
}

export interface VoyantGraphReportingCatalog {
  datasets: readonly VoyantGraphResolvedReportingDataset[]
  widgets: readonly VoyantGraphResolvedReportingWidget[]
  templates: readonly VoyantGraphResolvedReportTemplate[]
}

export interface VoyantGraphToolDeclaration extends VoyantGraphFacetEntity {
  name: string
  runtime: VoyantGraphRuntimeReference
  requiredScopes?: readonly string[]
  context?: readonly string[]
  risk?: "low" | "medium" | "high" | "critical"
}

export interface VoyantGraphWebhookDeclaration extends VoyantGraphFacetEntity {
  direction: "inbound" | "outbound"
  apiId?: string
  eventId?: string
  secretIds?: readonly string[]
}

export interface VoyantGraphActionBindings {
  routes?: readonly string[]
  tools?: readonly string[]
  events?: readonly string[]
  webhooks?: readonly string[]
}

/**
 * A closed deployment-graph condition that can restore a quarantined action.
 *
 * The referenced ports must be one-valued typed runtime ports consumed by the
 * action owner and provided by explicitly selected graph provider factories.
 */
export interface VoyantGraphActionAvailabilityCondition {
  selectedProviderPorts: {
    mode: "all" | "any"
    ports: readonly string[]
  }
}

export type VoyantGraphActionAvailability =
  | { status: "available" }
  | {
      status: "unavailable"
      /** Stable machine-readable reason retained in deployment graph diagnostics. */
      reasonCode: string
      /** Optional safe replacement capability that callers may migrate to. */
      replacementCapabilityId?: string
      /**
       * Opt-in activation condition. Older framework versions ignore this
       * field and retain the fail-closed unavailable posture.
       */
      enableWhen?: VoyantGraphActionAvailabilityCondition
    }

export interface VoyantGraphActionDurability {
  strategy: "transactional" | "outbox" | "saga"
  /** Stable test or conformance-kit reference proving the selected durability strategy. */
  testReference: string
}

export interface VoyantGraphActionDeclaration extends VoyantGraphFacetEntity {
  capabilityId?: string
  version: string
  kind: "execute" | "read" | "sensitive-read"
  targetType: string
  /** Top-level command input field whose value must equal the policy/ledger target id. */
  commandTargetField?: string
  targetLifecycle?: "existing" | "created"
  /**
   * Explicit exposure posture. Unavailable actions remain in graph metadata for
   * diagnostics, but their Tool bindings are not lowered into callable runtime.
   */
  availability?: VoyantGraphActionAvailability
  /** Required for available external or multi-stage execute effects. */
  effectBoundary?: "local" | "external" | "multistage"
  durability?: VoyantGraphActionDurability
  /**
   * Opt-in contract for handler-owned commands whose canonical target already
   * exists. The handler must durably persist/resolve its command result; the
   * action ledger owns exact command admission and replay classification.
   */
  existingTarget?: {
    durability: "handler-command-result-v1"
  }
  createdTarget?: {
    commandTargetType: string
    resultReferenceType: string
    durability: "handler-command-claim-v1"
    /**
     * Stable existing owner used to anchor creation of a generated child.
     * Exactly one of targetType or targetTypeField identifies the parent type.
     */
    parentAnchor?: {
      targetIdField: string
      targetType?: string
      targetTypeField?: string
      /** Additional input whose referenced row must belong to the parent. */
      relatedTargetIdField?: string
    }
  }
  resource?: string
  action?: string
  requiredScopes?: readonly string[]
  risk: "low" | "medium" | "high" | "critical"
  ledger: "required" | "optional"
  approval?: "never" | "conditional" | "required"
  policy?: string
  reversible?: boolean
  allowedActorTypes?: readonly string[]
  from?: VoyantGraphActionBindings
  copy?: readonly VoyantGraphMessageReference[]
}

export interface VoyantGraphSetupMigration extends VoyantGraphFacetEntity {
  source: string
  runtime: VoyantGraphRuntimeReference
  dependsOn?: readonly string[]
}

export interface VoyantGraphLifecycleDeclaration {
  compatibility?: {
    upgradeFrom?: string
  }
  uninstall?: {
    default: "retain-data"
    purge?: "not-supported" | "explicit"
  }
  /**
   * Explicit non-durable resources released by graph lifecycle execution.
   * Durable package data remains retained; destructive purge is not modeled here.
   */
  cleanup?: readonly VoyantGraphLifecycleResourceCleanup[]
}

export interface VoyantGraphLifecycleResourceCleanup extends VoyantGraphFacetEntity {
  resourceId: string
  on: readonly ("upgrade" | "uninstall")[]
  action: "release"
}
