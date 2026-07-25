import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const [
  deploymentResources,
  storefrontContributor,
  relationshipsContributor,
  notificationsContributor,
  tripsContributor,
  legalContributor,
  inventoryContributor,
] = await Promise.all([
  read("packages/runtime/src/deployment-resources.ts"),
  read("packages/storefront/src/runtime-contributor.ts"),
  read("packages/relationships/src/runtime-contributor.ts"),
  read("packages/notifications/src/runtime-contributor.ts"),
  read("packages/trips/src/runtime-contributor.ts"),
  read("packages/legal/src/runtime-contributor.ts"),
  read("packages/inventory/src/runtime-contributor.ts"),
])

const packagePorts = {
  storefront: ["storefrontOffersRuntimePort", "storefrontCustomerPortalRuntimePort"],
  relationships: ["storefrontIntakeRuntimePort"],
  notifications: ["storefrontVerificationRuntimePort"],
  trips: ["storefrontPaymentLinkRuntimePort"],
  legal: ["legalRuntimePort", "legalContractDocumentRuntimePort"],
  inventory: ["inventoryRuntimePort", "inventoryBrochureRuntimePort"],
}
const contributors = {
  storefront: storefrontContributor,
  relationships: relationshipsContributor,
  notifications: notificationsContributor,
  trips: tripsContributor,
  legal: legalContributor,
  inventory: inventoryContributor,
}

const violations = []
if (existsSync(path.join(root, "starters/operator/src/api/runtime/runtime-adapter.ts"))) {
  violations.push("starters/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
for (const [packageName, ports] of Object.entries(packagePorts)) {
  for (const port of ports) {
    if (deploymentResources.includes(port)) {
      violations.push(`deployment-resources.ts must not register or import ${port}`)
    }
    const ownershipToken =
      packageName === "relationships" && port === "storefrontIntakeRuntimePort"
        ? "[storefrontIntakeRuntimePortReference.id]"
        : `[${port}.id]`
    if (!contributors[packageName].includes(ownershipToken)) {
      violations.push(`${packageName} runtime contributor must own ${port}`)
    }
  }
}

for (const token of [
  "loadInventoryRuntime",
  "createOperatorInventoryRuntime",
  "registerInventoryWorkflowService",
]) {
  if (deploymentResources.includes(token)) {
    violations.push(`Operator runtime code must not retain Inventory capability ${token}`)
  }
}
for (const token of ["createInventoryRuntime(host.primitives)"]) {
  if (!inventoryContributor.includes(token)) {
    violations.push(`Inventory contributor must own ${token}`)
  }
}
if (/host\.capabilities|loadInventoryRuntime/.test(inventoryContributor)) {
  violations.push("Inventory contributor must use generic primitives without starter capabilities")
}

for (const factory of [
  "createStorefrontRuntimePortContribution",
  "createLegalRuntimePortContribution",
  "createInventoryRuntimePortContribution",
]) {
  if (deploymentResources.includes(factory)) {
    violations.push(`deployment-resources.ts must not enumerate ${factory}`)
  }
}

const residualRegistrations = deploymentResources.match(/^\s+\[[A-Za-z][A-Za-z0-9]*Port\.id\]/gm)
if ((residualRegistrations?.length ?? 0) > 0) {
  violations.push(
    `deployment-resources.ts has ${residualRegistrations?.length ?? 0} direct runtime-port registrations; expected zero`,
  )
}

if (violations.length > 0) {
  throw new Error(
    `check-operator-storefront-legal-inventory-runtime-authority:\n- ${violations.join("\n- ")}`,
  )
}

const movedCount = Object.values(packagePorts).flat().length
console.log(
  `check-operator-storefront-legal-inventory-runtime-authority: OK (${movedCount} package-owned registrations; ${residualRegistrations?.length ?? 0} direct registrations remain)`,
)
