import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
for (const relativePath of [
  "apps/operator/src/api/lib/catalog-runtime.ts",
  "apps/operator/src/api/runtime/catalog-booking-runtime.ts",
  "apps/operator/src/api/runtime/catalog-booking-shape-enricher.ts",
  "apps/operator/src/api/runtime/catalog-offers-runtime.ts",
  "apps/operator/src/api/runtime/catalog-subscriber-runtime.ts",
]) {
  if (existsSync(resolve(root, relativePath))) {
    throw new Error(`Operator must not retain Catalog backend adapter: ${relativePath}`)
  }
}

// Which package OWNS each catalog runtime authority, which retired ones must
// not come back, and the Typesense pin, are all statements about identifiers.
// They moved to scripts/checks/symbols/symbol-policy.json under
// "operator-catalog-backend-authority" in voyant#4188 — two of the seven names
// this file pinned by substring were deleted by that issue, and a declarative
// identifier rule neither breaks on reformatting nor needs editing to proceed.
//
// What stays here is the part symbol policy cannot express: these are import
// specifiers, not identifiers.
const packageRuntimePath = "packages/catalog/src/runtime-support.ts"
const packageRuntime = readFileSync(resolve(root, packageRuntimePath), "utf8")

for (const forbidden of ["apps/operator", "@voyant-travel/inventory", "@voyant-travel/commerce"]) {
  if (packageRuntime.includes(forbidden)) {
    throw new Error(`${packageRuntimePath} must not depend on ${forbidden}`)
  }
}

console.log("Operator Catalog backend authority: 0 application adapter lines")
