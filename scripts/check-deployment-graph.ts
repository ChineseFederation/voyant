// agent-quality: file-size exception -- owner: architecture; deployment graph admission, provenance, package metadata, and generated artifact assertions share one end-to-end checker.
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import getReleasePlan from "@changesets/get-release-plan"
import operatorProject from "../apps/operator/voyant.config.ts"
import {
  buildDeploymentArtifactManifest,
  buildDeploymentGraphJson,
  buildDeploymentMigrationSources,
  buildNodeRuntimeEntry,
  buildNodeRuntimeEntryArtifact,
  VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION,
} from "../packages/framework/src/deployment-artifacts.ts"
import {
  canonicalJson,
  graphIdFromSpecifier,
  VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY,
} from "../packages/framework/src/deployment-graph.ts"
import { runtimeReferencePackageNames } from "../packages/framework/src/project-resolver.ts"
import {
  type OperatorAuthoredProject,
  resolveOperatorDeploymentGraph,
} from "./lib/operator-deployment-graph-package-records.ts"

const failures: string[] = []
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, "..")
const operatorRoot = join(repoRoot, "apps", "operator")

const OPERATOR_SCHEMA_ONLY_MODULE_SPECIFIERS = [
  "@voyant-travel/db",
  "@voyant-travel/catalog-authoring",
] as const
const PACKAGE_OWNED_RUNTIME_MODULE_SPECIFIERS = [
  "@voyant-travel/charters",
  "@voyant-travel/cruises",
  "@voyant-travel/realtime",
  "@voyant-travel/mice",
] as const
const PACKAGE_OWNED_RUNTIME_EXTENSION_SPECIFIERS = [
  "@voyant-travel/mice/booking-extension",
] as const

const OPERATOR_PACKAGE_METADATA_KIND_EXPECTATIONS = new Map<string, string>([
  ["@voyant-travel/framework", "framework"],
  ["@voyant-travel/framework-migrations", "library"],
  ["@voyant-travel/hono", "library"],
])

async function main(): Promise<void> {
  const frameworkPackage = JSON.parse(
    await readFile(join(repoRoot, "packages/framework/package.json"), "utf8"),
  ) as { version: string }
  const releasePlan = await getReleasePlan(repoRoot)
  const frameworkVersion =
    releasePlan.releases.find(({ name }) => name === "@voyant-travel/framework")?.newVersion ??
    frameworkPackage.version
  const authoredOperatorProject = operatorProject as OperatorAuthoredProject
  const resolvedOperator = await resolveOperatorDeploymentGraph({
    project: authoredOperatorProject,
    projectRoot: operatorRoot,
    repoRoot,
    frameworkVersion,
  })
  const repeatedOperator = await resolveOperatorDeploymentGraph({
    project: authoredOperatorProject,
    projectRoot: operatorRoot,
    repoRoot,
    frameworkVersion,
  })
  const first = resolvedOperator.graph
  const second = repeatedOperator.graph

  if (first.schemaVersion !== "voyant.resolved-graph.v1") {
    failures.push(`expected resolved graph schema v1, got ${first.schemaVersion}`)
  }

  if (first.deployment.target !== "node") {
    failures.push(
      `expected standard Operator graph runtime target node, got ${first.deployment.target}`,
    )
  }
  if (
    first.deployment.mode !== "self-hosted" ||
    first.deployment.providers.database !== "postgres" ||
    first.deployment.providers.storage !== "memory" ||
    first.deployment.providers.adminAuth === "voyant-cloud" ||
    first.deployment.providers.customerAuth !== "better-auth"
  ) {
    failures.push("expected standard Operator graph to preserve self-hosted provider defaults")
  }

  if (!/^sha256:[a-f0-9]{64}$/.test(first.contentHash)) {
    failures.push(`expected sha256 content hash, got ${first.contentHash}`)
  }

  if (first.contentHash !== second.contentHash) {
    failures.push("expected selected graph hash to be deterministic across identical inputs")
  }

  if (canonicalJson(first) !== canonicalJson(second)) {
    failures.push("expected selected graph JSON manifest to be deterministic")
  }

  const graphJson = buildDeploymentGraphJson(first)
  const parsedGraphJson = JSON.parse(graphJson) as { contentHash?: string; schemaVersion?: string }
  if (parsedGraphJson.contentHash !== first.contentHash) {
    failures.push("expected generated graph JSON artifact to include the resolved graph hash")
  }
  if (parsedGraphJson.schemaVersion !== first.schemaVersion) {
    failures.push("expected generated graph JSON artifact to preserve the graph schema version")
  }

  const runtimeEntry = buildNodeRuntimeEntry({
    graph: first,
    graphArtifactPath: "./deployment-graph.generated.json",
  })
  if (!runtimeEntry.includes(first.contentHash)) {
    failures.push("expected generated runtime entry to reference the resolved graph hash")
  }
  if (!runtimeEntry.includes("@voyant-travel/framework/node-runtime")) {
    failures.push("expected generated runtime entry to start from the generic Node runtime")
  }
  if (runtimeEntry.includes("profileSnapshotPath:")) {
    failures.push("expected generated runtime entry to boot directly from graph artifacts")
  }

  const artifactManifest = buildDeploymentArtifactManifest({
    graph: first,
    graphArtifactPath: "./deployment-graph.generated.json",
    runtimeEntries: [
      buildNodeRuntimeEntryArtifact({
        graph: first,
        file: "./runtime-entry.generated.ts",
      }),
    ],
    migrationSources: buildDeploymentMigrationSources(first),
  })
  if (artifactManifest.schemaVersion !== VOYANT_DEPLOYMENT_ARTIFACTS_SCHEMA_VERSION) {
    failures.push("expected deployment artifact manifest schema version v1")
  }
  if (artifactManifest.graphHash !== first.contentHash) {
    failures.push("expected deployment artifact manifest to reference the resolved graph hash")
  }
  if (artifactManifest.runtimeEntries[0]?.graphHash !== first.contentHash) {
    failures.push("expected runtime entry artifact to reference the resolved graph hash")
  }
  const artifactMigrationSourcePackageNames = artifactManifest.migrationSources.map(
    (source) => source.packageName,
  )
  if (
    JSON.stringify(artifactMigrationSourcePackageNames) !==
    JSON.stringify(buildDeploymentMigrationSources(first).map((source) => source.packageName))
  ) {
    failures.push("expected deployment artifacts to preserve operator migration source packages")
  }

  if (first.diagnostics.length > 0) {
    failures.push(
      `expected selected graph to resolve cleanly, got diagnostics:\n${first.diagnostics
        .map((entry) => `  - ${entry.code}: ${entry.message}`)
        .join("\n")}`,
    )
  }

  const moduleIds = new Set(first.modules.map((unit) => unit.id))
  for (const id of [
    "@voyant-travel/action-ledger",
    "@voyant-travel/bookings",
    "@voyant-travel/finance",
    "@voyant-travel/relationships",
  ]) {
    if (!moduleIds.has(id)) failures.push(`expected selected graph to include ${id}`)
  }

  const operatorGraph = resolvedOperator.graph
  const operatorModuleIds = new Set(operatorGraph.modules.map((unit) => unit.id))
  const operatorExtensionIds = new Set(operatorGraph.extensions.map((unit) => unit.id))
  const operatorPluginIds = new Set(operatorGraph.plugins.map((unit) => unit.id))
  const operatorAdapterIds = new Set(operatorGraph.adapters.map((unit) => unit.id))
  const operatorProviderIds = new Set(operatorGraph.providers.map((unit) => unit.id))
  const declaredOperatorModuleIds = new Set(resolvedOperator.project.modules.map((unit) => unit.id))
  const declaredOperatorExtensionIds = new Set(
    resolvedOperator.project.extensions.map((unit) => unit.id),
  )
  const declaredOperatorPluginIds = new Set(resolvedOperator.project.plugins.map((unit) => unit.id))
  const declaredOperatorAdapterIds = new Set(
    resolvedOperator.project.adapters.map((unit) => unit.id),
  )
  const declaredOperatorProviderIds = new Set(
    resolvedOperator.project.providers.map((unit) => unit.id),
  )
  if (operatorGraph.deployment.target !== "node") {
    failures.push(
      `expected resolved operator graph runtime target node, got ${operatorGraph.deployment.target}`,
    )
  }
  for (const id of declaredOperatorModuleIds) {
    if (!operatorModuleIds.has(id)) {
      failures.push(`expected resolved operator graph to include declared module ${id}`)
    }
  }
  for (const id of declaredOperatorPluginIds) {
    if (!operatorPluginIds.has(id)) {
      failures.push(`expected resolved operator graph to include declared plugin ${id}`)
    }
  }
  for (const id of declaredOperatorAdapterIds) {
    if (!operatorAdapterIds.has(id)) {
      failures.push(`expected resolved operator graph to include declared adapter ${id}`)
    }
  }
  for (const id of declaredOperatorProviderIds) {
    if (!operatorProviderIds.has(id)) {
      failures.push(`expected resolved operator graph to include declared provider ${id}`)
    }
  }
  for (const id of declaredOperatorExtensionIds) {
    if (!operatorExtensionIds.has(id)) {
      failures.push(`expected resolved operator graph to include declared extension ${id}`)
    }
  }
  for (const id of operatorModuleIds) {
    if (!declaredOperatorModuleIds.has(id)) {
      failures.push(`expected resolved operator graph module ${id} to come from the declaration`)
    }
  }
  for (const id of operatorPluginIds) {
    if (!declaredOperatorPluginIds.has(id)) {
      failures.push(`expected resolved operator graph plugin ${id} to come from the declaration`)
    }
  }
  for (const id of operatorAdapterIds) {
    if (!declaredOperatorAdapterIds.has(id)) {
      failures.push(`expected resolved operator graph adapter ${id} to come from the declaration`)
    }
  }
  for (const id of operatorProviderIds) {
    if (!declaredOperatorProviderIds.has(id)) {
      failures.push(`expected resolved operator graph provider ${id} to come from the declaration`)
    }
  }
  for (const id of operatorExtensionIds) {
    if (!declaredOperatorExtensionIds.has(id)) {
      failures.push(`expected resolved operator graph extension ${id} to come from the declaration`)
    }
  }
  const operatorPackageRecords = new Map(
    operatorGraph.packageRecords.map((record) => [record.packageName, record]),
  )
  const operatorPackageNames = new Set(
    operatorGraph.packageRecords.map((record) => record.packageName),
  )
  const selectedPackageNames = new Set(
    [
      ...operatorGraph.modules,
      ...operatorGraph.plugins,
      ...operatorGraph.adapters,
      ...operatorGraph.providers,
    ].map((unit) => unit.packageName),
  )
  const runtimeOnlyPackageNames = new Set(
    runtimeReferencePackageNames([
      ...operatorGraph.modules,
      ...operatorGraph.plugins,
      ...operatorGraph.adapters,
      ...operatorGraph.providers,
    ]).filter((packageName) => !selectedPackageNames.has(packageName)),
  )
  for (const record of operatorGraph.packageRecords) {
    if (record.source?.kind === "unknown") {
      failures.push(`expected operator graph package record ${record.packageName} to be admitted`)
    }
    const expectedKind =
      OPERATOR_PACKAGE_METADATA_KIND_EXPECTATIONS.get(record.packageName) ??
      (runtimeOnlyPackageNames.has(record.packageName) ? "library" : "module")
    const metadata = record.metadata
    if (
      metadata?.schemaVersion !== "voyant.package.v1" ||
      metadata.kind !== expectedKind ||
      JSON.stringify(metadata.compatibleWith.targets) !==
        JSON.stringify(["node", "cloudflare-worker"]) ||
      typeof metadata.compatibleWith?.framework !== "string" ||
      !metadata.compatibleWith.modes?.includes("local") ||
      !metadata.compatibleWith.modes?.includes("managed-cloud") ||
      !metadata.compatibleWith.modes?.includes("self-hosted")
    ) {
      failures.push(
        `expected operator graph package record ${record.packageName} to include voyant.package.v1 ${expectedKind} compatibility metadata`,
      )
    }
  }
  if (!operatorPackageNames.has("@voyant-travel/public-document-delivery")) {
    failures.push(
      "expected public document delivery graph unit provenance to resolve to its owning package",
    )
  }
  if (
    operatorPackageNames.has("@voyant-travel/plugin-smartbill") ||
    operatorPluginIds.has("@voyant-travel/plugin-smartbill")
  ) {
    failures.push("expected the standard Operator graph not to admit optional SmartBill")
  }

  const bookingsRecord = operatorPackageRecords.get("@voyant-travel/bookings")
  if (bookingsRecord?.metadata?.manifest !== "./voyant") {
    failures.push(
      "expected @voyant-travel/bookings package metadata to advertise its ./voyant manifest",
    )
  }
  const bookingsUnit = operatorGraph.modules.find((unit) => unit.id === "@voyant-travel/bookings")
  for (const surface of ["admin", "public"] as const) {
    const route = bookingsUnit?.api?.find((entry) => entry.surface === surface)
    if (
      route?.runtime?.entry !== "@voyant-travel/bookings" ||
      route.runtime.export !== "createBookingsApiModule" ||
      route.transactional !== true
    ) {
      failures.push(
        `expected generated bookings ${surface} API to come from its package-owned runtime declaration`,
      )
    }
  }
  if (!bookingsUnit?.schema?.some((entry) => entry.source === "@voyant-travel/bookings/schema")) {
    failures.push("expected generated bookings schema to come from its package-owned manifest")
  }
  if (!bookingsUnit?.migrations?.some((entry) => entry.source === "./migrations")) {
    failures.push("expected generated bookings migrations to come from its package-owned manifest")
  }
  if (!bookingsUnit?.links?.some((entry) => entry.source === "@voyant-travel/bookings/linkables")) {
    failures.push("expected generated bookings linkables to come from its package-owned manifest")
  }
  for (const id of [
    "@voyant-travel/public-api#customer-portal",
    "@voyant-travel/identity#verification",
  ]) {
    if (!operatorModuleIds.has(id)) {
      failures.push(`expected operator graph to preserve customer surface ${id}`)
    }
  }
  for (const specifier of PACKAGE_OWNED_RUNTIME_MODULE_SPECIFIERS) {
    const id = graphIdFromSpecifier(specifier)
    if (!operatorModuleIds.has(id)) failures.push(`expected direct package graph module ${id}`)
  }
  for (const specifier of PACKAGE_OWNED_RUNTIME_EXTENSION_SPECIFIERS) {
    const id = graphIdFromSpecifier(specifier)
    if (!operatorExtensionIds.has(id))
      failures.push(`expected direct package graph extension ${id}`)
  }
  for (const id of [...operatorModuleIds, ...operatorExtensionIds, ...operatorPluginIds]) {
    if (id.startsWith("@voyant-travel/operator#")) {
      failures.push(`expected no nonlocal operator graph id, found ${id}`)
    }
  }
  const localModulePaths = (authoredOperatorProject.selections?.modules ?? [])
    .filter((selection) => selection.provenance.kind === "path")
    .map((selection) => (selection.provenance.kind === "path" ? selection.provenance.path : ""))
    .sort()
  if (localModulePaths.length !== 0) {
    failures.push(
      "expected voyant.config.ts to leave project-local modules to convention discovery",
    )
  }
  for (const forbidden of [
    "voyant.project.ts",
    "voyant.deployment.ts",
    "deployment-graph.local.ts",
    "managed-profile.json",
    "deployment-artifacts.generated.json",
    "deployment-graph.generated.json",
    "src/runtime-entry.generated.ts",
    "src/graph-runtime.generated.ts",
  ]) {
    if (existsSync(join(operatorRoot, forbidden))) {
      failures.push(`expected obsolete operator authority/artifact ${forbidden} to stay deleted`)
    }
  }
  const operatorGitignore = await readFile(join(operatorRoot, ".gitignore"), "utf8")
  if (!operatorGitignore.split(/\r?\n/).some((line) => line === ".voyant" || line === ".voyant/")) {
    failures.push("expected apps/operator/.gitignore to ignore .voyant/")
  }
  const channelPushUnit = operatorGraph.extensions.find(
    (unit) => unit.id === "@voyant-travel/distribution#channel-push-extension",
  )
  const channelPushSubscriberRuntimes = new Map(
    (channelPushUnit?.subscribers ?? []).map((subscriber) => [subscriber.id, subscriber.runtime]),
  )
  for (const [id, exportName] of [
    [
      "@voyant-travel/distribution#subscriber.channel-push-booking-confirmed",
      "channelPushBookingConfirmedSubscriber",
    ],
    [
      "@voyant-travel/distribution#subscriber.channel-push-availability-changed",
      "channelPushAvailabilityChangedSubscriber",
    ],
    [
      "@voyant-travel/distribution#subscriber.channel-push-content-changed",
      "channelPushContentChangedSubscriber",
    ],
  ] as const) {
    const runtime = channelPushSubscriberRuntimes.get(id)
    if (
      runtime?.entry !== "@voyant-travel/distribution/channel-push-subscribers" ||
      runtime.export !== exportName
    ) {
      failures.push(`expected ${id} to retain its package-owned subscriber runtime reference`)
    }
  }
  const operatorRuntimeSource = await readFile(
    join(repoRoot, "packages/runtime/src/index.ts"),
    "utf8",
  )
  const operatorChannelPushRoutePath = join(operatorRoot, "src/api/routes/channel-push.ts")
  if (existsSync(operatorChannelPushRoutePath)) {
    failures.push(
      "expected the package-owned Distribution channel-push runtime to replace the Operator compatibility route",
    )
  }
  if (operatorRuntimeSource.includes("channelPushBundle")) {
    failures.push(
      "expected package-owned distribution subscribers to stay absent from Operator hand lists",
    )
  }
  const bookingScheduleUnit = operatorGraph.extensions.find(
    (unit) => unit.id === "@voyant-travel/finance#booking-schedule-extension",
  )
  const bookingScheduleSubscriber = bookingScheduleUnit?.subscribers.find(
    (subscriber) =>
      subscriber.id === "@voyant-travel/finance#subscriber.booking-schedule-confirmed",
  )
  if (
    bookingScheduleSubscriber?.runtime?.entry !==
      "@voyant-travel/finance/booking-schedule-subscriber" ||
    bookingScheduleSubscriber.runtime.export !== "bookingScheduleConfirmedSubscriber"
  ) {
    failures.push(
      "expected Finance booking-schedule subscriber to retain its package-owned runtime reference",
    )
  }
  if (operatorRuntimeSource.includes("bookingScheduleBundle")) {
    failures.push(
      "expected package-owned Finance booking-schedule subscriber to stay absent from Operator hand lists and route wiring",
    )
  }
  const catalogCheckoutUnit = operatorGraph.extensions.find(
    (unit) => unit.id === "@voyant-travel/commerce#catalog-checkout-extension",
  )
  const expectedCatalogCheckoutSubscribers = new Map([
    [
      "@voyant-travel/commerce#subscriber.catalog-checkout-contract-document-generated",
      "createAcceptanceSignatureSubscriberGraphRuntime",
    ],
    [
      "@voyant-travel/commerce#subscriber.catalog-checkout-payment-completed",
      "createCheckoutFinalizeSubscriberGraphRuntime",
    ],
  ])
  for (const [id, exportName] of expectedCatalogCheckoutSubscribers) {
    const subscriber = catalogCheckoutUnit?.subscribers.find((candidate) => candidate.id === id)
    if (
      subscriber?.runtime?.entry !== "@voyant-travel/commerce/catalog-checkout-subscribers" ||
      subscriber.runtime.export !== exportName
    ) {
      failures.push(
        `expected Commerce checkout subscriber ${id} to retain package runtime ${exportName}`,
      )
    }
  }
  if (
    existsSync(join(operatorRoot, "src/api/subscribers/catalog-checkout-finalize-runtime.ts")) ||
    operatorRuntimeSource.includes("createCatalogCheckoutBundle")
  ) {
    failures.push(
      "expected package-owned Commerce checkout subscribers to stay absent from Operator app and subscriber authority",
    )
  }
  for (const specifier of OPERATOR_SCHEMA_ONLY_MODULE_SPECIFIERS) {
    const id = graphIdFromSpecifier(specifier)
    if (!operatorModuleIds.has(id)) {
      failures.push(`expected operator graph to include schema-only module ${id}`)
    }
  }
  for (const packageName of new Set(
    buildDeploymentMigrationSources(operatorGraph).map((source) => source.packageName),
  )) {
    if (!operatorPackageRecords.has(packageName)) {
      failures.push(
        `expected operator graph package records to include migration source ${packageName}`,
      )
    }
  }

  const operatorPackage = JSON.parse(
    await readFile(new URL("../apps/operator/package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> }
  if (!operatorPackage.scripts?.["db:migrate"]?.includes("voyant migrate")) {
    failures.push("expected operator db:migrate to delegate to the graph-native external CLI")
  }
  if (!operatorPackage.scripts?.["graph:check"]?.includes("voyant db doctor")) {
    failures.push(
      "expected operator graph drift checks to delegate to the graph-native external CLI",
    )
  }

  const frameworkRecord = first.packageRecords.find(
    (record) => record.packageName === "@voyant-travel/framework",
  )
  if (frameworkRecord?.source.kind !== "workspace" || !frameworkRecord.version) {
    failures.push(
      "expected @voyant-travel/framework package record to include workspace provenance",
    )
  }

  const diagnosticCodes = Object.keys(VOYANT_GRAPH_DIAGNOSTIC_CODE_REGISTRY)
  const sortedCodes = [...diagnosticCodes].sort()
  if (JSON.stringify(diagnosticCodes) !== JSON.stringify(sortedCodes)) {
    failures.push("expected deployment graph diagnostic code registry to stay sorted")
  }

  if (failures.length > 0) {
    console.error("Deployment graph architecture check failed.")
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exit(1)
  }

  console.log(
    `check-deployment-graph: OK (${first.modules.length} modules, ${first.plugins.length} plugins, ${first.adapters.length} adapters, ${first.providers.length} providers, ${first.contentHash})`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
