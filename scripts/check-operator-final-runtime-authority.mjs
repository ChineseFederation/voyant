import { readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const packagePorts = {
  auth: ["identityAccessRuntimePort"],
  cruises: ["cruisesRoutesRuntimePort"],
  distribution: ["channelPushRuntimePort"],
  flights: ["flightsRuntimePort"],
  mice: ["miceRuntimePort"],
  notifications: ["notificationsRuntimePort"],
  realtime: ["realtimeRuntimePort"],
  relationships: ["relationshipsRouteRuntimePort"],
  storage: ["storageMediaRuntimePort"],
  trips: ["tripsRoutesRuntimePort", "tripsDatabaseRuntimePort"],
}
const contributorFactories = [
  "createAuthRuntimePortContribution",
  "createCatalogRuntimePortContribution",
  "createDistributionRuntimePortContribution",
  "createFlightsRuntimePortContribution",
  "createMiceRuntimePortContribution",
  "createNotificationsRuntimePortContribution",
  "createRealtimeRuntimePortContribution",
  "createRelationshipsRuntimePortContribution",
  "createStorageRuntimePortContribution",
  "createTripsRuntimePortContribution",
]

const [deploymentResources, smartbillAdapter, ...contributors] = await Promise.all([
  read("packages/runtime/src/deployment-resources.ts"),
  read("packages/runtime/src/index.ts"),
  ...Object.keys(packagePorts).map((packageName) =>
    read(
      packageName === "cruises"
        ? "packages/catalog/src/runtime-contributor.ts"
        : `packages/${packageName}/src/runtime-contributor.ts`,
    ),
  ),
])

const violations = []
const directRegistrations = deploymentResources.match(/\[[A-Za-z][A-Za-z0-9]*Port\.id\]/g) ?? []
if (directRegistrations.length > 0) {
  violations.push(
    `deployment-resources.ts has ${directRegistrations.length} direct runtime-port registrations; expected zero`,
  )
}

for (const [index, [packageName, ports]] of Object.entries(packagePorts).entries()) {
  const contributor = contributors[index]
  for (const port of ports) {
    if (deploymentResources.includes(port)) {
      violations.push(`deployment-resources.ts must not import or register ${port}`)
    }
    if (
      !contributor.includes(`[${port}.id]`) &&
      !(
        port === "cruisesRoutesRuntimePort" &&
        (contributor.includes("CRUISES_ROUTES_RUNTIME_PORT_ID") ||
          contributor.includes("[cruisesRoutesRuntimePortReference.id]"))
      )
    ) {
      violations.push(`${packageName} runtime contributor must own ${port}`)
    }
  }
}

for (const factory of contributorFactories) {
  if (deploymentResources.includes(factory)) {
    violations.push(`deployment-resources.ts must not enumerate ${factory}`)
  }
}

if (!deploymentResources.includes("options.createRuntimePorts({")) {
  violations.push(
    "deployment-resources.ts must compose selected contributors through generated graph source",
  )
}

if (deploymentResources.includes("SmartbillRuntimePortContribution")) {
  violations.push("deployment-resources.ts must not enumerate the SmartBill contributor")
}
if (smartbillAdapter.includes("smartbillRuntimeHostPort")) {
  violations.push(
    "Operator SmartBill adapter must expose host resources without registering a port",
  )
}

if (violations.length > 0) {
  throw new Error(`check-operator-final-runtime-authority:\n- ${violations.join("\n- ")}`)
}

const movedCount = Object.values(packagePorts).flat().length
console.log(
  `check-operator-final-runtime-authority: OK (${movedCount} package-owned registrations; generated SmartBill contributor; 0 direct registrations remain)`,
)
