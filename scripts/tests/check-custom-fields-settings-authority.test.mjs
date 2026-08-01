import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const repositoryRoot = resolve(".")
const checker = resolve("scripts/check-custom-fields-settings-authority.mjs")
const fixturePaths = [
  "packages/custom-fields/src/voyant.ts",
  "packages/custom-fields/src/api-runtime.ts",
  "packages/custom-fields/src/routes.ts",
  "packages/custom-fields/src/service.ts",
  "packages/custom-fields/openapi/admin/custom-fields.json",
  "packages/custom-fields/migrations/20260716000100_custom_field_namespace_ownership.sql",
  "packages/custom-fields-react/package.json",
  "packages/custom-fields-react/src/i18n/index.ts",
  "packages/custom-fields-react/src/admin.tsx",
  "packages/custom-fields-react/src/query-options.ts",
  "packages/custom-fields-react/src/components/custom-field-definition-sheet.tsx",
  "packages/custom-fields-react/src/components/custom-field-definitions-page.tsx",
  "packages/relationships/package.json",
  "packages/relationships/src/voyant.ts",
  "packages/relationships/src/runtime-contributor.ts",
  "packages/relationships/src/routes/index.ts",
  "packages/relationships/src/service/index.ts",
  "packages/relationships/src/validation.ts",
  "packages/relationships/src/index.ts",
  "packages/relationships/openapi/admin/relationships.json",
  "packages/relationships/tests/integration/generic-custom-field-values.test.ts",
  "packages/relationships-react/src/admin/index.tsx",
  "packages/relationships-contracts/src/validation.ts",
  "packages/relationships-contracts/src/index.ts",
  "packages/core/src/custom-fields.ts",
  "packages/core/src/index.ts",
  "packages/core/src/runtime-port.ts",
  "packages/bookings/src/voyant.ts",
  "packages/bookings/src/runtime-contributor.ts",
  "packages/proposals/src/voyant.ts",
  "packages/proposals/src/runtime-contributor.ts",
  "scripts/generate-operator-application-metadata.mjs",
  ".github/workflows/ci.yml",
]

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "voyant-custom-fields-settings-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of fixturePaths) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(repositoryRoot, path), target)
  }
  mkdirSync(join(root, "apps"), { recursive: true })
  return root
}

function runFixture(root) {
  return execFileSync("node", [checker, "--root", root], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function fixtureFailure(root) {
  try {
    runFixture(root)
  } catch (error) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`
  }
  assert.fail("expected checker fixture to fail")
}

test("keeps generic Settings, API, and provider ownership", () => {
  assert.match(execFileSync("node", [checker], { encoding: "utf8" }), /OK/)
})

test("accepts the minimal canonical authority fixture", (t) => {
  assert.match(runFixture(createFixture(t)), /OK/)
})

test("rejects restored local TypeScript authoring exports", (t) => {
  const root = createFixture(t)
  appendFileSync(
    join(root, "packages/core/src/custom-fields.ts"),
    "\nexport function defineCustomField() {}\n",
  )
  assert.match(fixtureFailure(root), /defineCustomField/)
})

test("rejects restored application custom-field source directories", (t) => {
  const root = createFixture(t)
  const path = join(root, "apps/operator/src/custom-fields/index.ts")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, "export const field = {}\n")
  assert.match(fixtureFailure(root), /src\/custom-fields must stay absent/)
})

test("rejects restored metadata globs and host injection", (t) => {
  const root = createFixture(t)
  appendFileSync(
    join(root, "scripts/generate-operator-application-metadata.mjs"),
    '\nconst restoredGlob = "src/custom-fields/**/*.ts"\n',
  )
  const hostPath = join(root, "apps/operator/src/config.ts")
  mkdirSync(dirname(hostPath), { recursive: true })
  writeFileSync(hostPath, "export const restored = FrameworkProviders.customFields\n")
  const output = fixtureFailure(root)
  assert.match(output, /must not discover project-local custom-field files/)
  assert.match(output, /must not restore host injection token/)
})

test("rejects restored Relationships compatibility APIs", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/relationships/src/routes/custom-fields.ts")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, "export const customFieldRoutes = {}\n")
  assert.match(fixtureFailure(root), /must stay deleted/)
})
