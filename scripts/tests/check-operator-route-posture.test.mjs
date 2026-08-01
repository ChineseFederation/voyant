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
const checkerPath = path.join(repoRoot, "scripts/check-operator-route-posture.mjs")

async function createFixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-operator-route-posture-"))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }
  return root
}

async function runChecker(root) {
  return execFileAsync(
    process.execPath,
    [
      checkerPath,
      "--host",
      path.join(root, "host.ts"),
      "--retired-app",
      path.join(root, "retired-app.ts"),
      "--retired-adapter",
      path.join(root, "retired-adapter.ts"),
      "--legacy-public-paths",
      path.join(root, "public-paths.ts"),
    ],
    { cwd: root },
  )
}

const validApp = `
mountApp({
  publicPaths: [...graphComposition.routePosture.publicPaths],
  dbTransactionalPaths: [...graphComposition.routePosture.transactionalPaths],
})
`

describe("check-operator-route-posture", () => {
  it("accepts graph-derived posture with only the reviewed adapters", async () => {
    const root = await createFixture({ "host.ts": validApp })

    const result = await runChecker(root)

    assert.match(result.stdout, /check-operator-route-posture: OK/)
  })

  it("rejects retired hosts, legacy lists, and package-specific route overrides", async () => {
    const root = await createFixture({
      "host.ts": `${validApp}\nconst extra = "/v1/public/products"\ndefineLazyApiBundle({ load: netopiaApiBundle })\n`,
      "retired-app.ts": "export {}\n",
      "retired-adapter.ts": "export {}\n",
      "public-paths.ts": "export const OPERATOR_PUBLIC_PATHS = []\n",
    })

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /api\/app\.ts must stay deleted/)
      assert.match(error.stderr, /runtime-adapter\.ts must stay deleted/)
      assert.match(error.stderr, /public-paths\.ts must stay deleted/)
      assert.match(error.stderr, /must not contain application public-path adapters/)
      assert.match(error.stderr, /graph-owned Netopia route adapter/)
      return true
    })
  })
})
