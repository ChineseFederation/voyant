import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = path.resolve(argument("--root", "."))
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const packageFactories = {
  accommodations: "createAccommodationsRuntimePortContribution",
  auth: "createAuthRuntimePortContribution",
  bookings: "createBookingsRuntimePortContribution",
  catalog: "createCatalogRuntimePortContribution",
  charters: "createChartersRuntimePortContribution",
  commerce: "createCommerceRuntimePortContribution",
  cruises: "createCruisesRuntimePortContribution",
  distribution: "createDistributionRuntimePortContribution",
  finance: "createFinanceRuntimePortContribution",
  flights: "createFlightsRuntimePortContribution",
  inventory: "createInventoryRuntimePortContribution",
  legal: "createLegalRuntimePortContribution",
  mice: "createMiceRuntimePortContribution",
  notifications: "createNotificationsRuntimePortContribution",
  "operator-settings": "createOperatorSettingsRuntimePortContribution",
  operations: "createOperationsRuntimePortContribution",
  quotes: "createQuotesRuntimePortContribution",
  realtime: "createRealtimeRuntimePortContribution",
  relationships: "createRelationshipsRuntimePortContribution",
  storage: "createStorageRuntimePortContribution",
  storefront: "createStorefrontRuntimePortContribution",
  trips: "createTripsRuntimePortContribution",
}

const [
  deploymentResources,
  operatorRuntime,
  generator,
  runtimeComposition,
  resolver,
  bomGenerator,
  ...packageJsonSources
] = await Promise.all([
  read("packages/runtime/src/deployment-resources.ts"),
  read("packages/runtime/src/index.ts"),
  read("packages/framework/src/deployment-artifacts.ts"),
  read("packages/framework/src/runtime-composition.ts"),
  read("packages/framework/src/project-resolver.ts"),
  read("scripts/generate-standard-product-distribution.mjs"),
  ...Object.keys(packageFactories).map((packageName) => {
    const packageJsonPath = `packages/${packageName}/package.json`
    return existsSync(path.join(root, packageJsonPath)) ? read(packageJsonPath) : null
  }),
])

const violations = []
for (const retiredPath of [
  "release.runtime-packages.generated.json",
  "packages/framework/src/runtime-packages.generated.ts",
  "packages/framework/src/runtime-contributors.generated.ts",
]) {
  if (existsSync(path.join(root, retiredPath))) {
    violations.push(`${retiredPath} is a retired generated resolver input`)
  }
}
if (
  /from\s+["'][^"']+\/runtime-contributor["']/.test(`${deploymentResources}\n${operatorRuntime}`)
) {
  violations.push("Operator deployment resources must not import package runtime contributors")
}
if (
  /create[A-Za-z0-9]+RuntimePortContribution/.test(`${deploymentResources}\n${operatorRuntime}`)
) {
  violations.push("Operator deployment resources must not call package runtime contributors")
}
if (
  !operatorRuntime.includes("createRuntimePorts: generated.createRuntimePorts") ||
  !deploymentResources.includes("ports: options.createRuntimePorts({")
) {
  violations.push(
    "Operator must compose one generated contributor set through opaque deployment resources",
  )
}
if (
  /Smart[Bb]ill|smartbill|invoiceSettlementPollers/.test(
    `${deploymentResources}\n${operatorRuntime}`,
  )
) {
  violations.push("Operator runtime must not retain SmartBill-specific contributor host authority")
}
for (const required of [
  "GENERATED_GRAPH_RUNTIME_CONTRIBUTORS",
  "GENERATED_GRAPH_RUNTIME_CONTRIBUTOR_SPECIFIERS",
  "GeneratedGraphRuntimeContributorHost",
  "const GENERATED_GRAPH_RUNTIME_CONTRIBUTORS: readonly VoyantGraphRuntimeContributor[]",
  "createGeneratedGraphRuntimePorts",
  "record.metadata?.runtime",
  "input.runtimeEntryOverrides?.[entry]",
  "contributor.importEntry",
  "getRuntimePort",
  "contributor(contributorHost)",
  "has multiple static contributors",
  "GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS",
  "manyPortIds.has(id) ? [value] : value",
]) {
  if (!generator.includes(required)) {
    violations.push(`graph runtime generator must contain ${required}`)
  }
}
if (!/GENERATED_RUNTIME_CONTRIBUTOR_\$\{index\},/.test(generator)) {
  violations.push("generated contributors must enter the typed array directly")
}
if (/Parameters<typeof GENERATED_RUNTIME_CONTRIBUTOR_|asRuntimeContributor/.test(generator)) {
  violations.push("generated contributor composition must not infer a product-wide host type")
}
if (
  !runtimeComposition.includes(
    "interface VoyantGraphRuntimeContributorHost extends VoyantGraphRuntimePortResolver",
  ) ||
  !runtimeComposition.includes("primitives: VoyantRuntimeHostPrimitives")
) {
  violations.push("runtime contributors must share the bounded framework host contract")
}
if (
  !generator.includes("contributor.exportName") ||
  !generator.includes("as GENERATED_RUNTIME_CONTRIBUTOR_")
) {
  violations.push("graph runtime contributors must be emitted as static imports")
}
if (/require\s*\(|createRequire/.test(generator)) {
  violations.push("graph runtime contributor lowering must not add runtime require")
}
if (!generator.includes("record.metadata?.runtime") || !generator.includes("contributor.entry")) {
  violations.push("graph runtime generation must import admitted package runtime entries directly")
}
for (const [name, source] of [
  ["project resolver", resolver],
  ["product distribution generator", bomGenerator],
]) {
  if (
    /runtime-packages\.generated|runtime-contributors\.generated|framework\/runtime-contributors/.test(
      source,
    )
  ) {
    violations.push(`${name} must not consume a generated runtime discovery catalog`)
  }
}
if (!bomGenerator.includes("writeFileSync(DISTRIBUTION_PKG, nextDistributionPkg)")) {
  violations.push("distribution generation must retain output-only publish dependencies")
}
if (/writeFileSync\((?:SRC|CONTRIBUTORS|MANIFEST)/.test(bomGenerator)) {
  violations.push("distribution generation must not emit resolver discovery inputs")
}

for (const [index, [packageName, factory]] of Object.entries(packageFactories).entries()) {
  const packageJsonSource = packageJsonSources[index]
  if (packageJsonSource === null) {
    violations.push(`${packageName} contributor package does not exist`)
    continue
  }
  const packageJson = JSON.parse(packageJsonSource)
  const runtime = packageJson.voyant?.runtime
  if (runtime?.entry !== "./runtime-contributor" || runtime?.export !== factory) {
    violations.push(`${packageName} must declare its package-owned runtime contributor metadata`)
  }
  if (!packageJson.exports?.["./runtime-contributor"]) {
    violations.push(`${packageName} must export ./runtime-contributor`)
  }
}

if (violations.length > 0) {
  throw new Error(`check-generated-runtime-contributor-authority:\n- ${violations.join("\n- ")}`)
}

console.log(
  `check-generated-runtime-contributor-authority: OK (${Object.keys(packageFactories).length} package-owned contributors; direct admitted imports; 0 generated discovery inputs)`,
)
