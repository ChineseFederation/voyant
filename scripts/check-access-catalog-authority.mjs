import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const operatorRoot = path.join(repoRoot, "apps", "operator")
const apiKeysSource = await readFile(path.join(repoRoot, "packages/types/src/api-keys.ts"), "utf8")
const artifactSource = await readFile(
  path.join(repoRoot, "packages/framework/src/deployment-artifacts.ts"),
  "utf8",
)
const loweringSource = await readFile(
  path.join(repoRoot, "packages/framework/src/runtime-lowering.ts"),
  "utf8",
)

for (const forbidden of [
  "LEGACY_ACCESS_CATALOG",
  "createEffectiveAccessCatalog",
  "API_KEY_ACTIONS",
  "API_KEY_RESOURCES",
  "API_KEY_PERMISSION_GROUPS",
  "API_KEY_PERMISSION_PRESETS",
  "API_KEY_GRANT_PRESETS",
  "API_KEY_SCOPE_GROUPS",
  "API_KEY_SCOPE_PRESETS",
]) {
  assert.doesNotMatch(apiKeysSource, new RegExp(`\\b${forbidden}\\b`))
}
assert.doesNotMatch(artifactSource, /createEffectiveAccessCatalog|legacy-compatible/)
assert.doesNotMatch(loweringSource, /runtime-compatibility|fallbackCatalog|fallbackResources/)

if (process.argv.includes("--source-only")) {
  console.log("access catalog source authority: OK")
  process.exit(0)
}
const graph = JSON.parse(
  await readFile(path.join(operatorRoot, ".voyant", "deployment-graph.generated.json"), "utf8"),
)
const artifactManifest = JSON.parse(
  await readFile(path.join(operatorRoot, ".voyant", "deployment-artifacts.generated.json"), "utf8"),
)
const accessCatalogSource = await readFile(
  path.join(operatorRoot, ".voyant", "access", "selected-access-catalog.generated.ts"),
  "utf8",
)

assert.ok(
  artifactManifest.files.includes("access/selected-access-catalog.generated.ts"),
  "the deployment artifact manifest must include the selected access catalog",
)
assert.match(
  accessCatalogSource,
  new RegExp(
    `GENERATED_SELECTED_ACCESS_CATALOG_HASH = ${JSON.stringify(artifactManifest.graphHash)}`,
  ),
  "the selected access catalog must match the emitted deployment graph",
)

const byResource = new Map(
  graph.accessCatalog.resources.map((resource) => [resource.resource, resource]),
)
assert.equal(byResource.get("bookings")?.unitId, "@voyant-travel/bookings")
assert.deepEqual(
  byResource.get("bookings")?.actions.map(({ action }) => action),
  ["delete", "read", "write"],
)
assert.equal(byResource.get("bookings")?.legacyActions, undefined)
assert.equal(byResource.get("bookings-pii")?.unitId, "@voyant-travel/bookings")
assert.equal(byResource.get("bookings-pii")?.wildcard, "explicit-resource")
assert.equal(
  byResource.get("notifications")?.actions.find(({ action }) => action === "send")?.wildcard,
  "explicit",
)

for (const resource of graph.accessCatalog.resources) {
  assert.notEqual(resource.unitId, "@voyant-travel/types#legacy-access-catalog")
  assert.notEqual(resource.unitId, "runtime-compatibility")
}

const selectedScopes = new Set(
  graph.accessCatalog.resources.flatMap((resource) =>
    resource.actions.map((action) => `${resource.resource}:${action.action}`),
  ),
)
const visit = (value) => {
  if (!value || typeof value !== "object") return
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry)
    return
  }
  if (Array.isArray(value.requiredScopes)) {
    for (const scope of value.requiredScopes) {
      assert.ok(selectedScopes.has(scope), `required scope ${scope} must be selected`)
    }
  }
  for (const entry of Object.values(value)) visit(entry)
}
visit({
  modules: graph.modules,
  extensions: graph.extensions,
  plugins: graph.plugins,
  adapters: graph.adapters,
  providers: graph.providers,
})

const presets = new Map(graph.accessCatalog.presets.map((preset) => [preset.id, preset]))
assert.deepEqual(presets.get("commerce-read")?.grants, [
  "operations:read",
  "pricing:read",
  "products:read",
  "suppliers:read",
])
assert.deepEqual(presets.get("agent-staff")?.grants, [
  "bookings:read",
  "bookings:write",
  "catalog:read",
  "catalog:search",
  "finance:read",
  "operations:read",
  "products:read",
  "proposals:read",
  "proposals:write",
  "reports:export",
  "reports:read",
  "reports:write",
  "suppliers:read",
  "trips:read",
  "trips:write",
])
assert.deepEqual(presets.get("editor")?.grants, [
  "bookings:read",
  "bookings:write",
  "reports:read",
  "reports:write",
])

for (const [relativePath, pattern] of [
  ["packages/runtime/src/index.ts", /graphRuntime\.accessCatalog/],
  [
    "packages/operator-standard/src/standard-route-files.ts",
    /access\/selected-access-catalog\.generated/,
  ],
]) {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8")
  assert.match(source, pattern, `${relativePath} must consume the generated access catalog`)
}

console.log("access catalog authority: OK")
