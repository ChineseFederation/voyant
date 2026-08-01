import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const packageRequirements = {
  catalog: ["host.primitives", "host.getRuntimePort", "services.ensureSourceRegistry"],
  realtime: ["host.getRuntimePort", "realtimeTransportRuntimePort", "createRealtimeRuntime"],
  storage: ["host.primitives", "createStorageRuntime"],
  trips: ["host.primitives", "host.getRuntimePort", "createTripsRoutesRuntime"],
}

const [deploymentResources, ...contributors] = await Promise.all([
  read("packages/runtime/src/deployment-resources.ts"),
  ...Object.keys(packageRequirements).map((name) =>
    read(`packages/${name}/src/runtime-contributor.ts`),
  ),
])
const generatedCall = deploymentResources.slice(
  deploymentResources.indexOf("options.createRuntimePorts({"),
)
const explicitBindings = [
  "proposal",
  "snapshot",
  "cruisesRoutes",
  "flights",
  "notifications",
  "tripsRoutes",
  "tripsDatabase",
  "media",
  "realtime",
]
const violations = []
if (existsSync(path.join(root, "apps/operator/src/api/runtime/runtime-adapter.ts"))) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}

for (const binding of explicitBindings) {
  if (new RegExp(`\\n    ${binding}:`).test(generatedCall)) {
    violations.push(`deployment-resources.ts must not assemble the ${binding} binding`)
  }
}
const primitivesOnly = /options\.createRuntimePorts\(\{\s*primitives\s*\}\)/s.test(generatedCall)
const providerNeutralPorts =
  deploymentResources.includes("providerPorts?: VoyantGraphRuntimePorts") &&
  generatedCall.includes("runtimePorts: options.providerPorts")
if (!primitivesOnly && !providerNeutralPorts) {
  violations.push(
    "deployment-resources.ts must expose only primitives and graph provider ports to generated contributors",
  )
}
for (const [index, [packageName, requirements]] of Object.entries(packageRequirements).entries()) {
  for (const requirement of requirements) {
    if (!contributors[index].includes(requirement)) {
      violations.push(`${packageName} runtime contributor must own ${requirement}`)
    }
  }
}

if (violations.length > 0) {
  throw new Error(`check-operator-capability-runtime-bindings-cut-2:\n- ${violations.join("\n- ")}`)
}

console.log(
  "check-operator-capability-runtime-bindings-cut-2: OK (4 package-owned families from generic host resources)",
)
