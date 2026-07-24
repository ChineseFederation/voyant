import { existsSync } from "node:fs"
import { access, readFile } from "node:fs/promises"
import path from "node:path"

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const root = argument("--root", ".")
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8")
const [deploymentResources, catalogContributor, commerceContributor, tripsContributor] =
  await Promise.all([
    read("packages/runtime/src/deployment-resources.ts"),
    read("packages/catalog/src/runtime-contributor.ts"),
    read("packages/commerce/src/runtime-contributor.ts"),
    read("packages/trips/src/runtime-contributor.ts"),
  ])
const commerceRuntime = await read("packages/commerce/src/runtime.ts")
const normalizedCommerceContributor = commerceContributor.replace(
  /getRuntimePort<[^>]+>/g,
  "getRuntimePort",
)

const catalogPorts = [
  "catalogSearchRuntimePort",
  "catalogBookingRuntimePort",
  "catalogOffersRuntimePort",
  "catalogContentRuntimePort",
  "catalogProjectionRuntimePort",
  "catalogBookingSnapshotRuntimePort",
]
const commercePorts = [
  "bookingMaintenanceRuntimePort",
  "catalogCheckoutApiRuntimePort",
  "catalogCheckoutDatabaseRuntimePort",
  "catalogCheckoutLegalRuntimePort",
  "promotionRedemptionDatabaseRuntimePort",
  "promotionsBulkReindexRuntimePort",
]

const violations = []
if (existsSync(path.join(root, "starters/operator/src/api/runtime/runtime-adapter.ts"))) {
  violations.push("starters/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
for (const port of [...catalogPorts, ...commercePorts]) {
  if (deploymentResources.includes(port)) {
    violations.push(`deployment-resources.ts must not register or import ${port}`)
  }
}
for (const required of [
  "createCatalogRuntimePortContribution",
  "createCommerceRuntimePortContribution",
]) {
  if (deploymentResources.includes(required)) {
    violations.push(`deployment-resources.ts must not enumerate ${required}`)
  }
}
for (const legacy of [
  "loadCommerceRuntime",
  "createOperatorCommerceRuntime",
  "catalog-checkout-options",
  "bulk-reindex-service",
]) {
  if (deploymentResources.includes(legacy)) {
    violations.push(`deployment-resources.ts must not retain ${legacy}`)
  }
}
for (const port of catalogPorts) {
  if (!catalogContributor.includes(`[${port}.id]`)) {
    violations.push(`Catalog runtime contributor must own ${port}`)
  }
}
for (const port of commercePorts) {
  if (!commerceContributor.includes(`[${port}.id]`)) {
    violations.push(`Commerce runtime contributor must own ${port}`)
  }
}
for (const provider of [
  "commerceOperatorSettingsRuntimePort",
  "commerceInventoryRuntimePort",
  "commerceLegalRuntimePort",
  "catalogRuntimeServicesPort",
]) {
  if (!normalizedCommerceContributor.includes(`getRuntimePort(${provider})`)) {
    violations.push(`Commerce runtime contributor must resolve ${provider}`)
  }
}
if (!commerceRuntime.includes("createCommerceRuntime")) {
  violations.push("Commerce package must own createCommerceRuntime")
}
if (!tripsContributor.includes("[commerceCardPaymentRuntimePort.id]")) {
  violations.push("selected payment package must provide Commerce's card-payment runtime port")
}
for (const removedPath of [
  "starters/operator/src/api/runtime/catalog-checkout-options.ts",
  "starters/operator/src/api/lib/bulk-reindex-service.ts",
]) {
  try {
    await access(path.join(root, removedPath))
    violations.push(`${removedPath} must be removed`)
  } catch {}
}

if (violations.length > 0) {
  throw new Error(
    `check-operator-catalog-commerce-runtime-authority:\n- ${violations.join("\n- ")}`,
  )
}

console.log(
  `check-operator-catalog-commerce-runtime-authority: OK (${catalogPorts.length + commercePorts.length} package-owned registrations)`,
)
