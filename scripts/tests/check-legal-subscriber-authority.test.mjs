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
const checker = path.join(repoRoot, "scripts/check-legal-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-legal-subscriber-authority-"))
  const files = {
    "packages/legal/src/voyant.ts": `
runtimePorts: [
  requirePort(legalRuntimePort),
  requirePort(documentRendererPort, { optional: true }),
]
`,
    "packages/legal/src/index.ts": "export function createLegalApiModule() {}\n",
    "packages/legal/src/runtime-contributor.ts": `
const ports = {
  [legalRuntimePort.id]: {},
}
`,
    "packages/operator-standard/src/index.ts": "const extensions = []\n",
    "packages/runtime/src/deployment-resources.ts": "const ports = {}\n",
    "starters/operator/voyant.config.ts": "export default defineConfig({})\n",
    ...overrides,
  }
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, source)
  }
  return root
}

async function runChecker(root) {
  return execFileAsync(process.execPath, [checker, "--root", root])
}

describe("Legal subscriber authority checker", () => {
  it("accepts selected graph ownership with port-bound Node providers", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /Legal subscriber authority: OK/)
  })

  it("rejects a restored Legal booking-contract extension", async () => {
    const root = await createFixture({
      "packages/operator-standard/src/index.ts":
        'const extensions = [{ resolve: "@voyant-travel/legal/booking-contract-extension" }]\n',
    })
    await assert.rejects(runChecker(root), /must not select the retired Legal booking-contract/)
  })

  it("rejects redundant Legal selection in authored Operator config", async () => {
    const root = await createFixture({
      "starters/operator/voyant.config.ts": `
export default defineConfig({
  extensions: [{ resolve: "@voyant-travel/legal/booking-contract-extension" }],
})
`,
    })
    await assert.rejects(runChecker(root), /must not repeat the standard Legal booking-contract/)
  })

  it("rejects Legal API compatibility subscriber registration", async () => {
    const root = await createFixture({
      "packages/legal/src/index.ts": `
legalBookingContractConfirmedSubscriber.register(context)
`,
    })
    await assert.rejects(runChecker(root), /must leave subscriber registration to selected-graph/)
  })

  it("rejects a package-id-specific Operator Legal binding", async () => {
    const root = await createFixture({
      "packages/runtime/src/deployment-resources.ts": `
const ports = {}
const bindings = { "@voyant-travel/legal": createLegalApiModule }
`,
    })
    await assert.rejects(runChecker(root), /must not bind Legal by package id/)
  })
})
