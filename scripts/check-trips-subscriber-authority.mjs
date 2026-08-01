import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const rootArg = process.argv.indexOf("--root")
const repoRoot = rootArg >= 0 ? path.resolve(process.argv[rootArg + 1]) : defaultRoot

const paths = {
  manifest: "packages/trips/src/voyant.ts",
  packageRuntime: "packages/trips/src/index.ts",
  tripsRuntime: "packages/trips/src/runtime.ts",
  composition: "packages/runtime/src/deployment-resources.ts",
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([name, relativePath]) => [
      name,
      await readFile(path.join(repoRoot, relativePath), "utf8"),
    ]),
  ),
)

const failures = []
for (const retiredPath of [
  "apps/operator/src/api/app.ts",
  "apps/operator/src/api/runtime/runtime-adapter.ts",
]) {
  if (existsSync(path.join(repoRoot, retiredPath)))
    failures.push(`${retiredPath} must stay deleted`)
}
const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) failures.push(message)
}
const rejectMatch = (source, pattern, message) => {
  if (pattern.test(source)) failures.push(message)
}

requireMatch(
  sources.manifest,
  /entry:\s*["']@voyant-travel\/trips\/payment-subscribers["'][\s\S]*export:\s*["']tripsPaymentCompletedSubscriber["']/,
  "Trips manifest must own the payment subscriber runtime reference",
)
if (
  !/options\.createRuntimePorts\(\{\s*primitives\s*\}\)/.test(sources.composition) &&
  !(
    sources.composition.includes("providerPorts?: VoyantGraphRuntimePorts") &&
    sources.composition.includes("runtimePorts: options.providerPorts")
  )
) {
  failures.push("Operator must pass only generic primitives and ports to selected contributors")
}
requireMatch(
  sources.tripsRuntime,
  /VoyantRuntimeHostPrimitives/,
  "Trips must own its route runtime on generic host primitives",
)
requireMatch(
  sources.packageRuntime,
  /container\.register\(TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY, runtime\)/,
  "Trips package graph runtime must register the payment runtime service",
)
requireMatch(
  sources.packageRuntime,
  /withDb:\s*\(operation\)\s*=>\s*databaseRuntime\.withDb\(context\.bindings, operation\)/,
  "Trips payment runtime service must consume the package-declared DB lifecycle port",
)
rejectMatch(
  sources.composition,
  /tripsPaymentCompletedSubscriber\.register|eventBus\.subscribe[^\n]*payment\.completed/,
  "Operator composition must leave subscriber registration to selected-graph lowering",
)

if (failures.length > 0) {
  console.error("Trips subscriber authority check failed:\n")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Trips subscriber authority: OK")
