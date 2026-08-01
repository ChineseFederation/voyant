import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const probe = join(repoRoot, "scripts/measure-operator-application.mjs")

test("measures a built Operator application without starting a listener", () => {
  const root = mkdtempSync(join(tmpdir(), "voyant-operator-application-measurement-"))
  try {
    write(root, "apps/operator/package.json", '{"type":"module"}\n')
    write(root, "apps/operator/voyant.config.ts", "export default defineConfig({})\n")
    for (const file of [
      "deployment-artifacts.generated.json",
      "deployment-graph.generated.json",
      "migration-plan.generated.json",
      "product-bom.generated.json",
    ]) {
      write(root, `apps/operator/dist/.voyant/${file}`, "{}\n")
    }
    write(root, "apps/operator/dist/server/server.js", "export default { fetch() {} }\n")
    write(root, "apps/operator/dist/client/assets/admin-page.js", "export const page = true\n")

    const output = execFileSync(
      process.execPath,
      [probe, "--root", root, "--require-build", "--check"],
      { cwd: repoRoot, encoding: "utf8" },
    )
    const report = JSON.parse(output)

    assert.equal(report.schemaVersion, "voyant.operator-application-performance.v1")
    assert.equal(report.metadata.checkedIn.files, 0)
    assert.equal(report.metadata.generated.files, 4)
    assert.equal(report.server.files, 1)
    assert.equal(report.admin.files, 1)
    assert.equal(report.boot.ok, true)
    assert.ok(report.boot.milliseconds >= 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

function write(root, path, contents) {
  const destination = join(root, path)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, contents)
}
