import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const [deploymentResources, auth, customFields, mice, proposals, relationships, trips] =
  await Promise.all([
    read("packages/runtime/src/deployment-resources.ts"),
    read("packages/auth/src/runtime-contributor.ts"),
    read("packages/custom-fields/src/runtime-contributor.ts"),
    read("packages/mice/src/runtime-contributor.ts"),
    read("packages/proposals/src/runtime-contributor.ts"),
    read("packages/relationships/src/runtime-contributor.ts"),
    read("packages/trips/src/runtime-contributor.ts"),
  ])

const violations = []
if (existsSync(path.join(root, "apps/operator/src/api/runtime/runtime-adapter.ts"))) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
const explicitBindings = ["identityAccess", "mice", "proposals", "relationshipsRoutes"]

for (const binding of explicitBindings) {
  if (new RegExp(`\\b${binding}\\s*:`).test(deploymentResources)) {
    violations.push(`deployment-resources.ts must not assemble the ${binding} binding`)
  }
}

const primitivesOnly = /options\.createRuntimePorts\(\{\s*primitives\s*\}\)/s.test(
  deploymentResources,
)
const providerNeutralPorts =
  deploymentResources.includes("providerPorts?: VoyantGraphRuntimePorts") &&
  deploymentResources.includes("runtimePorts: options.providerPorts")
if (!primitivesOnly && !providerNeutralPorts) {
  violations.push(
    "deployment-resources.ts must expose only generic primitives and graph provider ports to contributors",
  )
}
if (deploymentResources.includes("createOperatorIdentityAccessRuntime")) {
  violations.push("deployment-resources.ts must not retain the Auth runtime factory")
}

const contributorRequirements = [
  [
    "auth",
    auth,
    ["host.primitives.config.read", "cloudAdminMembersConfigFromRevalidate", "auth.invitation"],
  ],
  [
    "mice",
    mice,
    ["host.getRuntimePort(relationshipsMiceRuntimePort)", "resolveDelegatePersonById"],
  ],
  ["proposals", proposals, ["createProposalsRuntime(host"]],
  ["custom-fields", customFields, ["customFieldsRuntimePort.id"]],
  [
    "relationships",
    relationships,
    ["customFieldValueReaderRuntimePort.id", "relationshipsMiceRuntimePort.id"],
  ],
  ["trips", trips, ["host.primitives", "host.getRuntimePort(catalogRuntimeServicesPort)"]],
]

for (const [packageName, source, requirements] of contributorRequirements) {
  const normalizedSource = source.replace(/host\.getRuntimePort<[^>]+>/g, "host.getRuntimePort")
  for (const requirement of requirements) {
    if (!normalizedSource.includes(requirement)) {
      violations.push(`${packageName} runtime contributor must own ${requirement}`)
    }
  }
}

for (const [packageName, source] of [
  ["auth", auth],
  ["custom-fields", customFields],
  ["mice", mice],
  ["proposals", proposals],
  ["relationships", relationships],
  ["trips", trips],
]) {
  if (source.includes("host.capabilities")) {
    violations.push(`${packageName} runtime contributor must not consume host.capabilities`)
  }
}
if (deploymentResources.includes("createDeploymentCapabilities")) {
  violations.push("deployment-resources.ts must not define a capability container")
}
if (relationships.includes("host.primitives.config.read")) {
  violations.push(
    "relationships runtime contributor must not restore deployment-configured custom fields",
  )
}
if (proposals.includes("tripsRoutesRuntimePort")) {
  violations.push("proposals runtime contributor must not consume Trips route mutation authority")
}

if (violations.length > 0) {
  throw new Error(
    `check-operator-capability-derived-runtime-bindings:\n- ${violations.join("\n- ")}`,
  )
}

console.log(
  "check-operator-capability-derived-runtime-bindings: OK (6 package bindings derived from primitives and static ports)",
)
