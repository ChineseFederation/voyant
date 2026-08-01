import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { inspectBookingsRuntimeAuthority } from "./lib/bookings-runtime-authority.mjs"

const root = path.resolve(".")
const policy = JSON.parse(
  readFileSync(path.join(root, "scripts/fixtures/bookings-runtime-authority.json"), "utf8"),
)
const filePaths = [
  "packages/bookings/src/runtime-contributor.ts",
  "packages/bookings/src/runtime.ts",
  "packages/bookings/src/runtime-port.ts",
  "packages/bookings/src/voyant.ts",
  "packages/accommodations/src/runtime-contributor.ts",
  "packages/finance/src/runtime-contributor.ts",
  "packages/inventory/src/runtime-contributor.ts",
  "packages/relationships/src/runtime-contributor.ts",
  "packages/runtime/src/deployment-resources.ts",
  "packages/core/src/runtime-host.ts",
]
const files = new Map(
  filePaths.map((relativePath) => [
    relativePath,
    readFileSync(path.join(root, relativePath), "utf8"),
  ]),
)
const violations = inspectBookingsRuntimeAuthority({
  files,
  manifests: readWorkspaceManifests(root),
  policy,
})

if (violations.length > 0) {
  throw new Error(`check-bookings-runtime-authority:\n- ${violations.join("\n- ")}`)
}
console.log(
  `check-bookings-runtime-authority: OK (${policy.providers.length} static domain providers; production graph acyclic)`,
)

function readWorkspaceManifests(workspaceRoot) {
  const manifests = []
  for (const directory of ["packages", "apps", "examples"]) {
    const absolute = path.join(workspaceRoot, directory)
    if (!existsSync(absolute)) continue
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const packageJson = path.join(absolute, entry.name, "package.json")
      if (existsSync(packageJson)) {
        manifests.push(JSON.parse(readFileSync(packageJson, "utf8")))
      } else if (directory === "packages") {
        for (const nested of readdirSync(path.join(absolute, entry.name), {
          withFileTypes: true,
        })) {
          const nestedPackageJson = path.join(absolute, entry.name, nested.name, "package.json")
          if (nested.isDirectory() && existsSync(nestedPackageJson)) {
            manifests.push(JSON.parse(readFileSync(nestedPackageJson, "utf8")))
          }
        }
      }
    }
  }
  return manifests
}
