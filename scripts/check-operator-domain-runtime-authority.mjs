import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const rootIndex = process.argv.indexOf("--root")
const root = rootIndex === -1 ? defaultRoot : process.argv[rootIndex + 1]
if (!root) throw new Error("--root requires a path")

const violations = []
const read = (path) => {
  const absolute = join(root, path)
  if (!existsSync(absolute)) {
    violations.push(`missing ${path}`)
    return ""
  }
  return readFileSync(absolute, "utf8")
}
for (const path of [
  "apps/operator/src/api/runtime/trips-catalog-runtime.ts",
  "apps/operator/src/api/runtime/trips-checkout-runtime.ts",
  "apps/operator/src/api/runtime/trips-flight-runtime.ts",
]) {
  if (existsSync(join(root, path))) violations.push(`${path} must stay deleted`)
}

const tripsAdapterPath = "apps/operator/src/api/runtime/trips-runtime.ts"
const tripsAdapter = existsSync(join(root, tripsAdapterPath)) ? read(tripsAdapterPath) : ""
if (tripsAdapter) violations.push("Trips deployment adapter must stay deleted")
const tripsRuntime = read("packages/trips/src/runtime.ts")
for (const token of [
  "createTripsRouteRuntime",
  "createCatalogComponentAdapter",
  "VoyantRuntimeHostPrimitives",
]) {
  if (!tripsRuntime.includes(token)) violations.push(`Trips package runtime must own ${token}`)
}

const paymentPolicyFacadePath = "apps/operator/src/api/runtime/booking-payment-policy-runtime.ts"
if (existsSync(join(root, paymentPolicyFacadePath))) {
  violations.push(`${paymentPolicyFacadePath} must stay deleted`)
}

const workflowAdapterPath = "apps/operator/src/api/runtime/operator-workflow-services.ts"
if (existsSync(join(root, workflowAdapterPath))) {
  violations.push(`${workflowAdapterPath} must stay deleted`)
}

for (const path of [
  "packages/trips/src/route-runtime.ts",
  "packages/trips/src/checkout/voyant-fx.ts",
  "packages/distribution/src/channel-push/jobs.ts",
  "packages/inventory/src/brochure-runtime.ts",
  "packages/inventory/src/booking-payment-policy-runtime.ts",
  "packages/accommodations/src/payment-policy-runtime.ts",
  "packages/cruises/src/payment-policy-runtime.ts",
  "packages/distribution/src/payment-policy-runtime.ts",
]) {
  read(path)
}

if (violations.length > 0) {
  console.error("Operator domain runtime authority check failed.\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  "check-operator-domain-runtime-authority: OK (workflow, Trips, and payment policy services package-owned)",
)
