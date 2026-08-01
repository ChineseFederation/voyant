import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { findDomainRuntimeNamingViolations } from "./lib/domain-runtime-naming-policy.mjs"
import {
  adapterBoundaryViolations,
  findProductionDependencyCycles,
} from "./lib/node-runtime-adapter-dependency-policy.mjs"

const rootArgumentIndex = process.argv.indexOf("--root")
const root = path.resolve(rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : ".")
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8")
const adapters = []
const consolidatedPackages = [
  {
    packageName: "@voyant-travel/distribution",
    retiredPackageName: "@voyant-travel/distribution-node",
    factory: "createDistributionRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/finance",
    retiredPackageName: "@voyant-travel/finance-node",
    factory: "createFinanceRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/cruises",
    retiredPackageName: "@voyant-travel/cruises-node",
    factory: "createCruisesRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/flights",
    retiredPackageName: "@voyant-travel/flights-node",
    factory: "createFlightsRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/catalog",
    retiredPackageName: "@voyant-travel/catalog-node",
    factory: "createCatalogRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/legal",
    retiredPackageName: "@voyant-travel/legal-node",
    factory: "createLegalRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/notifications",
    retiredPackageName: "@voyant-travel/notifications-node",
    factory: "createNotificationsRuntimePortContribution",
  },
  {
    packageName: "@voyant-travel/proposals",
    retiredPackageName: "@voyant-travel/proposals-node",
    factory: "createProposalsRuntimePortContribution",
  },
]
const manifests = readWorkspaceManifests()
const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]))
const standardDistribution = read("packages/operator-standard/src/index.ts")
const productDistribution = byName.get("@voyant-travel/operator-standard")
const applicationAuthority = [
  read("apps/operator/voyant.config.ts"),
  read("packages/runtime/src/index.ts"),
  read("packages/runtime/src/deployment-resources.ts"),
  read("packages/framework/src/node-runtime.ts"),
].join("\n")
const graphGenerator = read("packages/framework/src/deployment-artifacts.ts")
const graphResolver = read("scripts/lib/operator-deployment-graph-package-records.ts")
const violations = adapterBoundaryViolations(manifests, adapters)
if (existsSync(path.join(root, "apps/operator/src/api/runtime/runtime-adapter.ts"))) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
violations.push(...findDomainRuntimeNamingViolations(root))

for (const cycle of findProductionDependencyCycles(manifests)) {
  violations.push(`workspace production dependency cycle: ${cycle.join(" -> ")}`)
}
for (const adapter of adapters) {
  const manifest = byName.get(adapter.packageName)
  const runtime = manifest?.voyant?.runtime
  if (manifest?.voyant?.schemaVersion !== "voyant.package.v1") {
    violations.push(`${adapter.packageName} must declare voyant.package.v1 metadata`)
  }
  if (manifest?.voyant?.kind !== "library") {
    violations.push(`${adapter.packageName} must remain a target adapter library`)
  }
  if (runtime?.entry !== "./runtime-contributor" || runtime?.export !== adapter.factory) {
    violations.push(`${adapter.packageName} has invalid runtime contributor metadata`)
  }
  if (!manifest?.exports?.["./runtime-contributor"]) {
    violations.push(`${adapter.packageName} must export ./runtime-contributor`)
  }
  if (!standardDistribution.includes(`resolve: "${adapter.packageName}`)) {
    violations.push(`${adapter.packageName} must be selected by the authored standard product BOM`)
  }
  if (!productDistribution?.dependencies?.[adapter.packageName]) {
    violations.push(`${adapter.packageName} must be supplied by the product distribution`)
  }
  if (applicationAuthority.includes(adapter.packageName)) {
    violations.push(
      `application/framework resident composition must not name ${adapter.packageName}`,
    )
  }
}
for (const consolidated of consolidatedPackages) {
  const manifest = byName.get(consolidated.packageName)
  const runtime = manifest?.voyant?.runtime
  if (byName.has(consolidated.retiredPackageName)) {
    violations.push(`${consolidated.retiredPackageName} must stay deleted`)
  }
  if (manifest?.voyant?.kind !== "module") {
    violations.push(`${consolidated.packageName} must remain a domain module`)
  }
  if (runtime?.entry !== "./runtime-contributor" || runtime?.export !== consolidated.factory) {
    violations.push(`${consolidated.packageName} has invalid runtime contributor metadata`)
  }
  if (!manifest?.exports?.["./runtime-contributor"]) {
    violations.push(`${consolidated.packageName} must export ./runtime-contributor`)
  }
  if (manifest?.exports?.["./standard-node"]) {
    violations.push(`${consolidated.packageName} must not expose a target-labelled runtime`)
  }
  if (!standardDistribution.includes(`resolve: "${consolidated.packageName}`)) {
    violations.push(
      `${consolidated.packageName} must be selected by the authored standard product BOM`,
    )
  }
  if (!productDistribution?.dependencies?.[consolidated.packageName]) {
    violations.push(`${consolidated.packageName} must be supplied by the product distribution`)
  }
  if (productDistribution?.dependencies?.[consolidated.retiredPackageName]) {
    violations.push(`product distribution must not retain ${consolidated.retiredPackageName}`)
  }
}
for (const domainPackageName of ["@voyant-travel/action-ledger"]) {
  const domain = byName.get(domainPackageName)
  if (byName.has(`${domainPackageName}-node`)) {
    violations.push(`${domainPackageName}-node must stay deleted`)
  }
  if (standardDistribution.includes(`resolve: "${domainPackageName}-node`)) {
    violations.push(`${domainPackageName}-node must not remain in the standard product BOM`)
  }
  if (productDistribution?.dependencies?.[`${domainPackageName}-node`]) {
    violations.push(`${domainPackageName}-node must not remain in the product distribution`)
  }
  if (domain?.voyant?.runtime) {
    violations.push(`${domainPackageName} must not need a deployment-target contributor`)
  }
  if (domain?.exports?.["./runtime-contributor"]) {
    violations.push(`${domainPackageName} must not export an empty deployment-target contributor`)
  }
}
if (
  /FRAMEWORK_RUNTIME_PACKAGES|runtime-packages\.generated|additionalRuntimePackageNames/.test(
    graphResolver,
  )
) {
  violations.push("Operator graph resolution must not consume a generated runtime package catalog")
}
if (!graphResolver.includes('"packages/operator-standard"')) {
  violations.push("Operator graph resolution must derive provenance from the product distribution")
}
if (!graphGenerator.includes("const runtime = record.metadata?.runtime")) {
  violations.push("Graph runtime generation must lower contributors from admitted package records")
}
if (graphGenerator.includes("selectedPackageNames.has(record.packageName)")) {
  violations.push("Graph runtime generation must not require an adapter to own a product unit")
}

if (violations.length > 0) {
  throw new Error(`check-node-runtime-adapter-dependencies:\n- ${violations.join("\n- ")}`)
}
console.log(
  `check-node-runtime-adapter-dependencies: OK (${adapters.length} leaf adapters; ${consolidatedPackages.length} consolidated domain runtimes; production graph acyclic)`,
)

function readWorkspaceManifests() {
  const manifests = []
  for (const workspaceRoot of ["packages", "apps", "examples"]) {
    const absoluteRoot = path.join(root, workspaceRoot)
    if (!existsSync(absoluteRoot)) continue
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const packageJsonPath = path.join(absoluteRoot, entry.name, "package.json")
      if (existsSync(packageJsonPath)) {
        manifests.push(JSON.parse(readFileSync(packageJsonPath, "utf8")))
      } else if (workspaceRoot === "packages") {
        for (const nested of readdirSync(path.join(absoluteRoot, entry.name), {
          withFileTypes: true,
        })) {
          if (!nested.isDirectory()) continue
          const nestedPackageJson = path.join(absoluteRoot, entry.name, nested.name, "package.json")
          if (existsSync(nestedPackageJson)) {
            manifests.push(JSON.parse(readFileSync(nestedPackageJson, "utf8")))
          }
        }
      }
    }
  }
  return manifests
}
