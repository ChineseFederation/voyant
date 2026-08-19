import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..")
const checkerPath = path.join(repoRoot, "scripts/check-deployment-graph-openapi-coverage.mjs")

async function createFixture(packageRecords) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-external-openapi-coverage-"))
  const packageName = "@acme/plugin-payments"
  const apiId = `${packageName}#api.admin`
  const files = {
    ".voyant/graph.json": JSON.stringify({
      schemaVersion: "voyant.resolved-graph.v1",
      modules: [],
      extensions: [],
      plugins: [
        {
          id: packageName,
          packageName,
          api: [{ id: apiId, surface: "admin", openapi: { document: "payments" } }],
        },
      ],
      packageRecords,
    }),
    "openapi/.keep": "",
    "node_modules/@acme/plugin-payments/package.json": JSON.stringify({
      name: packageName,
      version: "1.2.3",
    }),
    "node_modules/@acme/plugin-payments/openapi/admin/payments.json": JSON.stringify({
      openapi: "3.1.0",
      info: { title: "fixture", version: "0" },
      paths: {
        "/v1/admin/payments": {
          post: { responses: { 200: { description: "OK" } }, "x-voyant-api-id": apiId },
        },
      },
    }),
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, `${content}\n`)
  }
  return root
}

function runChecker(cwd) {
  return execFileAsync(
    process.execPath,
    [
      checkerPath,
      "--graph",
      ".voyant/graph.json",
      "--openapi-dir",
      "openapi",
      "--no-default-allowlist",
    ],
    { cwd },
  )
}

describe("external package deployment graph OpenAPI coverage", () => {
  it("discovers documents from selected installed external plugin records", async () => {
    const packageName = "@acme/plugin-payments"
    const root = await createFixture([
      {
        packageName,
        version: "1.2.3",
        source: { kind: "registry", reference: `${packageName}@1.2.3` },
      },
    ])

    const result = await runChecker(root)

    assert.match(result.stdout, /1 covered graph API bundles/)
  })

  it("reports a version mismatch as a stale graph, with the command that fixes it", async () => {
    // The graph is untracked build output, so any version bump — a release, a
    // rebase, a branch switch — leaves it selecting a version that is no longer
    // installed. This surfaced as a raw stack trace, which reads as a broken
    // install rather than a regenerable artifact.
    const packageName = "@acme/plugin-payments"
    const root = await createFixture([
      {
        packageName,
        version: "1.2.4",
        source: { kind: "registry", reference: `${packageName}@1.2.4` },
      },
    ])

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /stale deployment graph/)
      assert.match(error.stderr, /pnpm --filter operator prepare:verify/)
      assert.match(error.stderr, /selects 1\.2\.4.*contains 1\.2\.3/s)
      assert.doesNotMatch(error.stderr, /at discoverInstalledPackageOpenApiRoots/)
      return true
    })
  })

  it("does not discover installed documents without a selected package record", async () => {
    const root = await createFixture([])

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /deployment-graph-openapi-coverage:missing-docs/)
      return true
    })
  })
})
