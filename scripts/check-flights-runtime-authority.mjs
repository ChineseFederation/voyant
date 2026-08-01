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
const flightsRoot = pathOption("--flights-root", join(ROOT, "packages/flights"))
const retiredFlightsNodeRoot = pathOption(
  "--retired-flights-node-root",
  join(ROOT, "packages/flights-node"),
)
const compositionPath = pathOption(
  "--composition",
  join(ROOT, "packages/runtime/src/deployment-resources.ts"),
)
const retiredAdapterPath = pathOption(
  "--retired-adapter",
  join(ROOT, "apps/operator/src/api/runtime/runtime-adapter.ts"),
)
const violations = []

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`check-flights-runtime-authority: missing ${path}`)
  return readFileSync(path, "utf8")
}

const packageJson = JSON.parse(readRequired(join(flightsRoot, "package.json")))
const manifest = readRequired(join(flightsRoot, "src/voyant.ts"))
const hono = readRequired(join(flightsRoot, "src/api-runtime.ts"))
const runtimePort = readRequired(join(flightsRoot, "src/runtime-port.ts"))
const composition = readRequired(compositionPath)
const nodeContributor = readRequired(join(flightsRoot, "src/runtime-contributor.ts"))
const runtime = readRequired(join(flightsRoot, "src/runtime.ts"))

if (packageJson.dependencies?.["@voyant-travel/finance"] !== "workspace:^") {
  violations.push("Flights must own its @voyant-travel/finance runtime dependency")
}
if (!manifest.includes('export: "createFlightsVoyantRuntime"')) {
  violations.push("Flights manifest must name its package-owned runtime factory")
}
// The typed ports and the Finance capability are asserted against the resolved
// graph by verify:graph-conformance, not by matching manifest source text.
if (
  !hono.includes("defineGraphRuntimeFactory") ||
  !hono.includes("getPort(flightsRuntimePort)") ||
  !hono.includes('createOrderPaymentSessions({ targetType: "flight_order" })')
) {
  violations.push("Flights must assemble routes and payment sessions inside its graph factory")
}
for (const method of ["resolveAdapter", "startCardPayment"]) {
  if (!runtimePort.includes(`"${method}"`)) {
    violations.push(`flights.runtime conformance must require ${method}()`)
  }
}
if (
  packageJson.voyant?.runtime?.export !== "createFlightsRuntimePortContribution" ||
  !packageJson.exports?.["./runtime-contributor"] ||
  packageJson.exports?.["./standard-node"]
) {
  violations.push("Flights package must own its standard Node runtime contributor")
}
if (existsSync(retiredFlightsNodeRoot)) {
  violations.push("the retired Flights Node suffix package must stay deleted")
}
if (existsSync(retiredAdapterPath)) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
// operatorGraphRuntimeBindings, loadFlightAdminRoutes and loadFlightsRuntime are
// asserted absent from the composition by verify:symbol-policy, which matches
// identifiers in a parsed AST rather than substrings of the source text.
if (
  !nodeContributor.includes("primitives: VoyantRuntimeHostPrimitives") ||
  !nodeContributor.includes("createFlightsRuntime(host.primitives)")
) {
  violations.push("Flights must own runtime contribution from generic primitives")
}
for (const token of [
  "resolveAdapter()",
  "startCardPayment",
  "Flight connector is not configured",
]) {
  if (!runtime.includes(token))
    violations.push(`Flights standard Node runtime must preserve ${token}`)
}
// The identifier half of this rule moved to verify:symbol-policy; the module
// specifier is a string literal, not an identifier, so it stays here.
if (composition.includes("./flights-runtime")) {
  violations.push("Operator must not retain a Flights runtime facade module")
}

if (violations.length > 0) {
  console.error("Flights runtime authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("check-flights-runtime-authority: OK (Flights-owned standard Node runtime authority)")
