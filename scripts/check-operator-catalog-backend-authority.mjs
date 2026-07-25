import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
for (const relativePath of [
  "starters/operator/src/api/lib/catalog-runtime.ts",
  "starters/operator/src/api/runtime/catalog-booking-runtime.ts",
  "starters/operator/src/api/runtime/catalog-booking-shape-enricher.ts",
  "starters/operator/src/api/runtime/catalog-offers-runtime.ts",
  "starters/operator/src/api/runtime/catalog-subscriber-runtime.ts",
]) {
  if (existsSync(resolve(root, relativePath))) {
    throw new Error(`Operator must not retain Catalog backend adapter: ${relativePath}`)
  }
}

const packageRuntimePath = "packages/catalog/src/runtime-support.ts"
const packageRuntime = readFileSync(resolve(root, packageRuntimePath), "utf8")
const catalogRuntimePath = "packages/catalog/src/runtime/catalog-runtime.ts"
const catalogRuntime = readFileSync(resolve(root, catalogRuntimePath), "utf8")
const commerceRuntimePath = "packages/commerce/src/runtime.ts"
const commerceRuntime = readFileSync(resolve(root, commerceRuntimePath), "utf8")
for (const authority of [
  "buildCatalogSlices",
  "createCatalogOffersSearchResolvers",
  "createProductQuoteShapeEnricher",
  "resolveCatalogHoldTtlMs",
  "applyCatalogTaxToQuoteResult",
  "createCatalogProjectionRuntimeAdapter",
  "createCatalogBookingSnapshotRuntimeAdapter",
]) {
  if (
    !packageRuntime.includes(`export function ${authority}`) &&
    !packageRuntime.includes(`export async function ${authority}`)
  ) {
    throw new Error(`${packageRuntimePath} must own ${authority}`)
  }
}

for (const retiredAuthority of [
  "buildSourcedBookingRowValues",
  "createCatalogPackageHoldPreparer",
]) {
  if (packageRuntime.includes(retiredAuthority)) {
    throw new Error(`${packageRuntimePath} must not restore ${retiredAuthority}`)
  }
}

if (!catalogRuntime.includes("export function buildIndexer")) {
  throw new Error(`${catalogRuntimePath} must own buildIndexer`)
}
if (commerceRuntime.includes("buildTypesenseIndexer")) {
  throw new Error(`${commerceRuntimePath} must consume the provider-neutral buildIndexer service`)
}

for (const forbidden of [
  "createCatalogOffersTypesenseResolvers",
  "starters/operator",
  "@voyant-travel/inventory",
  "@voyant-travel/commerce",
]) {
  if (packageRuntime.includes(forbidden)) {
    throw new Error(`${packageRuntimePath} must not depend on ${forbidden}`)
  }
}

console.log("Operator Catalog backend authority: 0 starter adapter lines")
