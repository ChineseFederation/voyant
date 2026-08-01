import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const HOST = optionPath("--host", join(ROOT, "packages/framework/src/node-runtime.ts"))
const RETIRED_APP = optionPath("--retired-app", join(ROOT, "apps/operator/src/api/app.ts"))
const RETIRED_ADAPTER = optionPath(
  "--retired-adapter",
  join(ROOT, "apps/operator/src/api/runtime/runtime-adapter.ts"),
)
const LEGACY_PUBLIC_PATHS = optionPath(
  "--legacy-public-paths",
  join(ROOT, "apps/operator/src/api/public-paths.ts"),
)

function optionPath(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  const value = process.argv[index + 1]
  if (!value) throw new Error(`${name} requires a path`)
  return value
}

function readRequired(path) {
  if (!existsSync(path)) throw new Error(`check-operator-route-posture: missing ${path}`)
  return readFileSync(path, "utf8")
}

const host = readRequired(HOST)
const violations = []

if (existsSync(RETIRED_APP)) {
  violations.push("apps/operator/src/api/app.ts must stay deleted")
}
if (existsSync(RETIRED_ADAPTER)) {
  violations.push("apps/operator/src/api/runtime/runtime-adapter.ts must stay deleted")
}
if (existsSync(LEGACY_PUBLIC_PATHS)) {
  violations.push("apps/operator/src/api/public-paths.ts must stay deleted")
}

if (host.includes("OPERATOR_PUBLIC_PATHS") || host.includes('from "./public-paths"')) {
  violations.push("Operator must not restore the OPERATOR_PUBLIC_PATHS hand-list")
}

for (const [option, graphField] of [
  ["publicPaths", "publicPaths"],
  ["dbTransactionalPaths", "transactionalPaths"],
]) {
  if (!host.includes(`...graphComposition.routePosture.${graphField}`)) {
    violations.push(`${option} must consume graphComposition.routePosture.${graphField}`)
  }
}

const publicPathLiterals = [...host.matchAll(/["'](\/v1\/public\/[^"']+)["']/g)]
  .map((match) => match[1])
  .sort()
if (publicPathLiterals.length > 0) {
  violations.push(
    `Operator must not contain application public-path adapters; found ${publicPathLiterals.join(", ")}`,
  )
}

for (const legacyNetopiaAuthority of [
  "GENERATED_GRAPH_RUNTIME_PLUGIN_IDS",
  "defineLazyApiBundle",
  "netopiaApiBundle",
]) {
  if (host.includes(legacyNetopiaAuthority)) {
    violations.push(
      `Operator must not restore the graph-owned Netopia route adapter (${legacyNetopiaAuthority})`,
    )
  }
}

if (violations.length > 0) {
  console.error("Operator route-posture architecture check failed.")
  console.error("See docs/architecture/unified-deployment-graph.md (Phase 3).\n")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log(
  "check-operator-route-posture: OK (graph posture mounted; no application posture hand-lists)",
)
