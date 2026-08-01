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
const checkerPath = path.join(repoRoot, "scripts/check-deployment-graph-import-cheap.mjs")

async function createFixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-graph-import-cheap-"))
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, content)
  }
  return root
}

async function runChecker(cwd, entry = "manifest:manifest.ts") {
  return execFileAsync(process.execPath, [checkerPath, "--entry", entry], { cwd })
}

async function runDefaultChecker(cwd) {
  return execFileAsync(process.execPath, [checkerPath], { cwd })
}

describe("check-deployment-graph-import-cheap", () => {
  it("rejects static managed runtime imports from generated metadata entries", async () => {
    const root = await createFixture({
      "manifest.ts": `import { startManagedProfileRuntime } from "@voyant-travel/framework/managed-runtime"

export const GENERATED_DEPLOYMENT_GRAPH_HASH = "sha256:test" as const
void startManagedProfileRuntime
`,
    })

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /deployment-graph-import-cheap:runtime-heavy-import/)
      assert.match(error.stderr, /manifest\.ts imports @voyant-travel\/framework\/managed-runtime/)
      return true
    })
  })

  it("allows managed runtime to stay behind a dynamic import", async () => {
    const root = await createFixture({
      "manifest.ts": `export const GENERATED_DEPLOYMENT_GRAPH_HASH = "sha256:test" as const

export async function start() {
  const { startManagedProfileRuntime } = await import("@voyant-travel/framework/managed-runtime")
  return startManagedProfileRuntime
}
`,
    })

    const result = await runChecker(root)

    assert.match(result.stdout, /check-deployment-graph-import-cheap: OK/)
  })

  it("allows dedicated runtime port contract imports from package manifests", async () => {
    const root = await createFixture({
      "voyant.ts": `import { runtimePort } from "@voyant-travel/bookings/runtime-port"
export const manifest = { requires: [runtimePort] }
`,
    })

    const result = await runChecker(root, "package:voyant.ts")

    assert.match(result.stdout, /check-deployment-graph-import-cheap: OK/)
  })

  it("rejects transitive route imports from graph declarations", async () => {
    const root = await createFixture({
      "manifest.ts": `import { routes } from "./routes"

export const graph = { routes }
`,
      "routes.ts": `export const routes = []
`,
    })

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /manifest\.ts imports \.\/routes/)
      assert.match(error.stderr, /route graph must stay behind a lazy runtime import/)
      return true
    })
  })

  it("rejects package-root imports from package-owned manifests", async () => {
    const root = await createFixture({
      "voyant.ts": `import { bookingsApiModule } from "@voyant-travel/bookings"
export const manifest = { id: "bookings", bookingsApiModule }
`,
    })

    await assert.rejects(runChecker(root, "package:voyant.ts"), (error) => {
      assert.match(error.stderr, /package manifests may import only project authoring helpers/)
      return true
    })
  })

  it("enforces package manifest imports independently of the export target filename", async () => {
    const root = await createFixture({
      "graph-manifest.ts": `import { bookingsApiModule } from "@voyant-travel/bookings"
export const manifest = { id: "bookings", bookingsApiModule }
`,
    })

    await assert.rejects(runChecker(root, "package:graph-manifest.ts"), (error) => {
      assert.match(error.stderr, /package manifests may import only project authoring helpers/)
      return true
    })
  })

  it("discovers package manifests through nested conditional export arrays", async () => {
    const root = await createFixture({
      "packages/framework/src/deployment-graph.ts": "export {}\n",
      "packages/framework/src/deployment-artifacts.ts": "export {}\n",
      "apps/operator/voyant.config.ts": "export default {}\n",
      "packages/example/package.json": JSON.stringify({
        name: "@acme/example",
        voyant: { manifest: "./voyant" },
        exports: {
          "./voyant": {
            node: { require: "./src/graph-manifest.cjs" },
            import: ["../invalid.js", "./src/graph-manifest.ts"],
          },
        },
      }),
      "packages/example/src/graph-manifest.ts":
        'import { runtime } from "@acme/example"\nexport const manifest = { runtime }\n',
    })

    await assert.rejects(runDefaultChecker(root), (error) => {
      assert.match(error.stderr, /@acme\/example/)
      assert.match(error.stderr, /package manifests may import only project authoring helpers/)
      return true
    })
  })
})
