import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const applicationRoot = join(root, "apps/operator/src")
const files = readdirSync(applicationRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(applicationRoot.length + 1))
  .sort()

const expected = [
  "admin/README.md",
  "api/admin/README.md",
  "api/public/README.md",
  "extensions/README.md",
  "links/README.md",
  "modules/README.md",
  "router.tsx",
  "server.ts",
  "start.ts",
  "styles.css",
  "subscribers/README.md",
].sort()
assert.deepEqual(
  files,
  expected,
  "operator application src authority changed; classify the new file",
)

for (const directory of [
  "admin",
  "api/admin",
  "api/public",
  "extensions",
  "links",
  "modules",
  "subscribers",
]) {
  assert(
    existsSync(join(applicationRoot, directory, "README.md")),
    `${directory} overlay must remain`,
  )
}

assert(
  !existsSync(join(applicationRoot, "custom-fields")),
  "custom-fields overlay must stay deleted",
)

const composition = ["router.tsx", "start.ts", "styles.css"]
  .map((file) => readFileSync(join(applicationRoot, file), "utf8"))
  .join("\n")
assert(!composition.includes("#"), "application composition must not contain first-party unit IDs")
assert(
  !composition.includes("@voyant-travel/bookings"),
  "application must not select product packages",
)
assert(
  !composition.includes("@voyant-travel/finance"),
  "application must not select product packages",
)

const routeRegistry = readFileSync(
  join(root, "packages/operator-standard/src/standard-route-files.ts"),
  "utf8",
)
for (const token of [
  "createStandardOperatorFrontend",
  "operatorFrontend.routes.docs",
  "presentationRoute(route.route, contribution, route.member)",
  "operatorFrontend.workspace",
  "createStandardOperatorRouteFiles",
  "selectedGraphPresentationFactories",
]) {
  assert(routeRegistry.includes(token), `package route registry must contain ${token}`)
}

console.log(`Operator frontend shell authority: OK (${files.length} application src files)`)
