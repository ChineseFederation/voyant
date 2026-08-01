/**
 * `@voyant-travel/framework` — the Voyant framework BOM (bill of materials).
 *
 * This package's `dependencies` pin the exact tested runtime-module set. A
 * deployment depends on **one** framework version instead of a matrix of
 * per-package versions; `voyant upgrade` bumps it, and pnpm/npm resolve the
 * pinned set transitively. The compatibility matrix is resolved *inside* the
 * BOM — the deployment never sees it.
 *
 * This is deliberately NOT global lockstep: the runtime packages keep
 * independent versions (only changed packages republish — no per-package npm
 * email spam), and the BOM is the single thing that always tracks "the
 * framework version".
 *
 * Runtime product selection and factories are owned by package manifests and
 * the generated deployment graph. This package retains API composition helpers
 * for deployment-local units.
 */

export { assertVoyantGraphMcpRuntime } from "./conditional-action-availability.js"
export {
  type CreateVoyantAppConfig,
  createVoyantApp,
  type FrameworkProviders,
} from "./create-app.js"
export {
  canonicalDeploymentProvider,
  DEFAULT_MANAGED_CLOUD_PROVIDERS,
  DEPLOYMENT_PROVIDER_CONTRACTS,
  DEPLOYMENT_PROVIDER_ROLES,
  type VoyantDeploymentEnvRequirement,
  type VoyantDeploymentEnvValueFormat,
  type VoyantDeploymentMode,
  type VoyantDeploymentProviderRole,
  type VoyantDeploymentProviders,
  type VoyantDeploymentResourceRequirement,
  type VoyantRedisBindingConstraints,
  type VoyantRedisBindingIsolation,
  type VoyantRedisBindingNetwork,
} from "./deployment-types.js"
export {
  type DeploymentExtensionDeclaration,
  type DeploymentModuleDeclaration,
  defineDeploymentExtension,
  defineDeploymentModule,
  type EagerModuleGlob,
  extensionsFromGlob,
  modulesFromGlob,
} from "./discover-modules.js"
export {
  type LowerVoyantGraphActionsOptions,
  lowerVoyantGraphActionsToActionLedgerRegistry,
  type VoyantGraphActionRiskEvaluator,
} from "./graph-action-ledger.js"
export {
  type CreateVoyantGraphLifecyclePlanInput,
  createVoyantGraphLifecyclePlan,
  executeVoyantGraphLifecyclePlan,
  type VoyantGraphLifecycleConsequence,
  type VoyantGraphLifecycleExecutionState,
  type VoyantGraphLifecycleExecutor,
  type VoyantGraphLifecycleFacet,
  type VoyantGraphLifecycleOperation,
  type VoyantGraphLifecyclePlan,
  VoyantGraphLifecyclePlanError,
  type VoyantGraphLifecycleStateStore,
  type VoyantGraphLifecycleStep,
  type VoyantGraphLifecycleStepState,
  validateVoyantGraphEventCompatibility,
  validateVoyantGraphUpgradeCompatibility,
} from "./graph-lifecycle.js"
export {
  type SelectStandardOperatorDistributionOptions,
  STANDARD_OPERATOR_ACCESS,
  STANDARD_OPERATOR_DEPLOYMENT,
  STANDARD_OPERATOR_DISTRIBUTION,
  STANDARD_OPERATOR_DISTRIBUTION_POLICY,
  STANDARD_OPERATOR_PRODUCT_BOM,
  STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
  selectStandardOperatorDistribution,
} from "./operator-distribution.js"
export {
  assertPortConforms,
  type DefineVoyantPortInput,
  definePort,
  providePort,
  type RequireVoyantPortOptions,
  requirePort,
  type VoyantPort,
  type VoyantPortConformanceTest,
} from "./ports.js"
export {
  type DefineVoyantConfigInput,
  defineConfig,
  resolveStandardNodeGraphRuntime,
} from "./project.js"
export {
  type ProjectArtifactWriteEntry,
  type ProjectArtifactWriteMode,
  type ProjectArtifactWriteResult,
  type ProjectArtifactWriteStatus,
  type WriteProjectArtifactsInput,
  writeProjectArtifacts,
} from "./project-artifacts.js"
export {
  type ComposeVoyantGraphRuntimeInput,
  composeVoyantGraphRuntime,
  composeVoyantGraphRuntimeFacetModules,
  createVoyantGraphRuntimePortStubs,
  invokeVoyantGraphJob,
  resolveVoyantGraphRouteMountPath,
  type VoyantGraphRuntimeBinding,
  type VoyantGraphRuntimeBindingContext,
  type VoyantGraphRuntimeBindings,
  type VoyantGraphRuntimeComposition,
  type VoyantGraphRuntimeContributor,
  type VoyantGraphRuntimeContributorHost,
  type VoyantGraphRuntimePortResolver,
  type VoyantGraphRuntimePorts,
} from "./runtime-composition.js"
export {
  type CreateVoyantGraphRuntimeInput,
  createVoyantGraphRuntime,
  registerVoyantGraphTools,
  VOYANT_GRAPH_RUNTIME_LOAD_ERROR_CODES,
  type VoyantGraphActivatedRuntime,
  type VoyantGraphRuntime,
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
export {
  SCHEDULED_JOB_ROUTE,
  type VoyantScheduledJob,
} from "./scheduled-jobs.js"
export {
  type ProjectVoyantSelfHostExportOptions,
  projectVoyantSelfHostExport,
  VOYANT_MIGRATION_JOURNAL_LINEAGE,
  VOYANT_OBJECT_STORAGE_EXPORT_SCHEMA_VERSION,
  VOYANT_POSTGRES_EXPORT_SCHEMA_VERSION,
  VOYANT_SELF_HOST_EXPORT_BUNDLE_JSON_SCHEMA,
  VOYANT_SELF_HOST_EXPORT_BUNDLE_SCHEMA_VERSION,
  VOYANT_SELF_HOST_MIGRATION_POLICY,
  VOYANT_SELF_HOST_PROJECTION_JSON_SCHEMA,
  VOYANT_SELF_HOST_PROJECTION_SCHEMA_VERSION,
  VOYANT_SELF_HOST_PROVIDER_DEFAULTS,
  type VoyantExportArtifactMetadata,
  type VoyantObjectStorageExportEntry,
  type VoyantObjectStorageExportManifest,
  type VoyantPostgresDumpFormat,
  type VoyantPostgresExportMetadata,
  type VoyantSelfHostExportBundle,
  VoyantSelfHostExportValidationError,
  type VoyantSelfHostExportValidationIssue,
  type VoyantSelfHostExportValidationIssueCode,
  type VoyantSelfHostExportValidationResult,
  type VoyantSelfHostPackageInstall,
  type VoyantSelfHostProjection,
  type VoyantSelfHostProjectionDiagnostic,
  type VoyantSelfHostProjectionDiagnosticCode,
  type VoyantSelfHostProjectProjection,
  type VoyantSelfHostProjectSelection,
  type VoyantSelfHostProviderRemap,
  type VoyantSelfHostStarterProjection,
  validateVoyantSelfHostExportBundle,
} from "./self-host-export.js"
export {
  buildStandardNodeStarterSnapshot,
  STANDARD_NODE_STARTER,
  VOYANT_STANDARD_NODE_STARTER_SCHEMA_VERSION,
} from "./standard-node-starter.js"
