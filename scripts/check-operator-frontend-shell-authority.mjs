import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const starterRoot = join(root, "starters/operator/src")
const files = readdirSync(starterRoot, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name).slice(starterRoot.length + 1))
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
assert.deepEqual(files, expected, "operator starter src authority changed; classify the new file")

for (const directory of [
  "admin",
  "api/admin",
  "api/public",
  "extensions",
  "links",
  "modules",
  "subscribers",
]) {
  assert(existsSync(join(starterRoot, directory, "README.md")), `${directory} overlay must remain`)
}

assert(!existsSync(join(starterRoot, "custom-fields")), "custom-fields overlay must stay deleted")

const composition = ["router.tsx", "start.ts", "styles.css"]
  .map((file) => readFileSync(join(starterRoot, file), "utf8"))
  .join("\n")
assert(!composition.includes("#"), "starter composition must not contain first-party unit IDs")
assert(!composition.includes("@voyant-travel/bookings"), "starter must not select product packages")
assert(!composition.includes("@voyant-travel/finance"), "starter must not select product packages")

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

console.log(`Operator frontend shell authority: OK (${files.length} starter src files)`)
