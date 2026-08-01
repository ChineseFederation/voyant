import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const repositoryRoot = resolve(".")
const checker = resolve("scripts/check-custom-fields-namespaced-values.mjs")
const fixturePaths = [
  "packages/custom-fields/src/registry.ts",
  "packages/custom-fields/src/service.ts",
  "packages/custom-fields/src/value-contracts.ts",
  "packages/custom-fields/src/value-service.ts",
  "packages/custom-fields/src/value-mapping.ts",
  "packages/custom-fields/src/routes.ts",
  "packages/custom-fields/src/api-runtime.ts",
  "packages/core/src/runtime-port.ts",
  "packages/schema-kit/src/typeid/typeid-prefixes.ts",
  "packages/schema-kit/src/typeid/typeid-schemas.ts",
  "packages/framework-migrations/migrations/0004_framework_baseline.sql",
  "packages/relationships/migrations/meta/_journal.json",
  "packages/relationships/src/service/accounts-people.ts",
  "packages/relationships/src/service/accounts-organizations.ts",
  "packages/relationships/src/routes/accounts.ts",
  "packages/relationships/src/runtime-contributor.ts",
  "packages/bookings/src/service-core.ts",
  "packages/bookings/src/route-runtime.ts",
  "packages/bookings/src/routes-admin.ts",
  "packages/bookings/src/runtime-contributor.ts",
  "packages/proposals/src/runtime-contributor.ts",
  "packages/proposals/migrations/0000_proposals_baseline.sql",
  "packages/bookings/migrations/20260716000300_namespace_custom_field_values.sql",
  "packages/relationships/migrations/20260716000302_namespace_custom_field_values.sql",
]

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "voyant-custom-fields-values-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const path of fixturePaths) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(repositoryRoot, path), target)
  }
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

test("keeps runtime identity and package-owned namespaced persistence", () => {
  assert.match(execFileSync("node", [checker], { encoding: "utf8" }), /OK/)
})

test("accepts the minimal canonical namespaced-value fixture", (t) => {
  assert.match(runFixture(createFixture(t)), /OK/)
})

test("rejects flat package-owned JSONB writes", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/bookings/src/runtime-contributor.ts")
  const source = readFileSync(path, "utf8").replace(
    "SET custom_fields = jsonb_set(",
    "SET custom_fields = custom_fields || jsonb_build_object(",
  )
  writeFileSync(path, source)
  assert.match(fixtureFailure(root), /legacy flat JSONB merge/)
})

test("rejects synthetic ids without namespace identity", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/custom-fields/src/value-mapping.ts")
  const marker = (name) => ["$", "{", name, "}"].join("")
  const source = readFileSync(path, "utf8").replace(
    `\`${marker("entityType")}::${marker("entityId")}::${marker("namespace")}::${marker("definitionId")}\``,
    `\`${marker("entityType")}::${marker("entityId")}::${marker("definitionId")}\``,
  )
  writeFileSync(path, source)
  assert.match(fixtureFailure(root), /synthetic value ids must include namespace identity/)
})

test("rejects a missing package-owned value provider", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/proposals/src/runtime-contributor.ts")
  const source = readFileSync(path, "utf8").replace(
    "[customFieldValueOperationsRuntimePort.id]: proposalCustomFieldValueOperations,",
    "",
  )
  writeFileSync(path, source)
  assert.match(
    fixtureFailure(root),
    /Proposals must register its custom-field value operations provider/,
  )
})

test("rejects generic writes that bypass definition validation", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/custom-fields/src/value-service.ts")
  const source = readFileSync(path, "utf8").replace(
    "customFieldDefinitionFromRow(definition)",
    "null",
  )
  writeFileSync(path, source)
  assert.match(fixtureFailure(root), /validate against the locked persisted definition/)
})

test("rejects ordinary writes without transaction-scoped definition locks", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/custom-fields/src/registry.ts")
  const source = readFileSync(path, "utf8").replace('.for("share")', "")
  writeFileSync(path, source)
  assert.match(fixtureFailure(root), /share definition locks and one transaction/)
})

test("rejects the retired Bookings read-resolver seam", (t) => {
  const root = createFixture(t)
  const path = join(root, "packages/bookings/src/route-runtime.ts")
  const source = readFileSync(path, "utf8").replace(
    "customFieldsForWrite?: CustomFieldRegistryResolver",
    "customFields?: CustomFieldRegistryResolver\n  customFieldsForWrite?: CustomFieldRegistryResolver",
  )
  writeFileSync(path, source)
  assert.match(fixtureFailure(root), /must not retain the unused customFields read-resolver option/)
})

test("rejects restored EAV backfill and TypeID compatibility", (t) => {
  const root = createFixture(t)
  const migration = join(
    root,
    "packages/relationships/migrations/20260713000600_backfill_custom_field_values.sql",
  )
  mkdirSync(dirname(migration), { recursive: true })
  writeFileSync(migration, "SELECT * FROM custom_field_values;\n")
  const prefixes = join(root, "packages/schema-kit/src/typeid/typeid-prefixes.ts")
  writeFileSync(
    prefixes,
    `${readFileSync(prefixes, "utf8")}\nexport const restored = "custom_field_values"\n`,
  )
  const output = fixtureFailure(root)
  assert.match(output, /must stay deleted/)
  assert.match(output, /must not retain a TypeID contract/)
})
