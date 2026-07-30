import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const pathOption = (name, fallback) => {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${name} requires a path`)
  return value
}
const compositionPath = pathOption(
  "--composition",
  join(ROOT, "packages/runtime/src/deployment-resources.ts"),
)
const retiredAdapterPath = pathOption(
  "--retired-adapter",
  join(ROOT, "starters/operator/src/api/runtime/runtime-adapter.ts"),
)
const tripsRoot = pathOption("--trips-root", join(ROOT, "packages/trips"))
const violations = []

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`check-trips-runtime-authority: missing ${path}`)
  return readFileSync(path, "utf8")
}

const manifest = readRequired(join(tripsRoot, "src/voyant.ts"))
const packageIndex = readRequired(join(tripsRoot, "src/index.ts"))
const runtimePort = readRequired(join(tripsRoot, "src/runtime-port.ts"))
const runtimeContributor = readRequired(join(tripsRoot, "src/runtime-contributor.ts"))
const normalizedRuntimeContributor = runtimeContributor.replace(
  /host\.getRuntimePort<[^>]+>/g,
  "host.getRuntimePort",
)
const runtime = readRequired(join(tripsRoot, "src/runtime.ts"))
const composition = readRequired(compositionPath)

if (existsSync(retiredAdapterPath)) {
  violations.push("starters/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}

// Ports and the runtime-dependency references are asserted against the resolved
// graph by verify:graph-conformance, not by matching manifest source text.
if (!manifest.includes('export: "createTripsVoyantRuntime"')) {
  violations.push("Trips manifest must name its package-owned graph factory")
}
if (
  !runtimePort.includes("definePort<TripsRoutesOptionsProvider>") ||
  !runtimePort.includes('id: "trips.routes-runtime"') ||
  !runtimePort.includes("definePort<TripsDatabaseRuntime>") ||
  !runtimePort.includes('id: "trips.database-runtime"')
) {
  violations.push("Trips must define typed route and database runtime ports")
}
if (
  !packageIndex.includes("createTripsVoyantRuntime = defineGraphRuntimeFactory") ||
  !packageIndex.includes("async ({ api, getPort })") ||
  !packageIndex.includes('surface === "admin"') ||
  !packageIndex.includes('surface === "public"') ||
  !packageIndex.includes("getPort(tripsRoutesRuntimePort)") ||
  !packageIndex.includes("getPort(tripsDatabaseRuntimePort)") ||
  !packageIndex.includes("requiresTransactionalDb: true")
) {
  violations.push("Trips must compose its routes and transactional lifecycle in its graph factory")
}
if (packageIndex.includes("tripsApiModule")) {
  violations.push("Trips must not retain the preconfigured compatibility module export")
}
const genericContributorInputs =
  composition.includes("options.createRuntimePorts({ primitives })") ||
  (composition.includes("providerPorts?: VoyantGraphRuntimePorts") &&
    composition.includes("runtimePorts: options.providerPorts"))
if (
  composition.includes('from "@voyant-travel/trips/runtime-contributor"') ||
  composition.includes("createOperatorTripsRoutesOptions") ||
  composition.includes("createDeploymentCapabilities") ||
  !genericContributorInputs
) {
  violations.push(
    "Operator must expose only generic primitives and ports to the generated Trips contributor",
  )
}
if (
  runtimeContributor.includes("host.capabilities") ||
  !normalizedRuntimeContributor.includes("host.getRuntimePort(catalogRuntimeServicesPort)") ||
  !normalizedRuntimeContributor.includes("host.getRuntimePort(catalogCheckoutApiRuntimePort)") ||
  !normalizedRuntimeContributor.includes("host.getRuntimePort(flightsRuntimePort)") ||
  !runtimeContributor.includes("host.primitives.database.transaction") ||
  !runtime.includes("createTripsRouteRuntime")
) {
  violations.push("Trips must own route and database assembly through primitives and static ports")
}
if (composition.includes("operatorGraphRuntimeBindings")) {
  violations.push("Operator compatibility runtime bindings must stay deleted")
}

if (violations.length > 0) {
  console.error("Trips runtime authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  "check-trips-runtime-authority: OK (package factory authority; generic Node ports only)",
)
