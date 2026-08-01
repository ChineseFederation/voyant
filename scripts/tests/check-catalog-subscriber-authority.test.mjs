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
const checker = path.join(repoRoot, "scripts/check-catalog-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-catalog-authority-"))
  const files = {
    "packages/catalog/src/voyant.ts": `
runtimePorts: [requirePort(catalogProjectionRuntimePort), requirePort(catalogBookingSnapshotRuntimePort)],
subscribers: catalogIndexSubscriberDeclarations.map((subscriber) => ({
  runtime: { export: catalogIndexSubscriberRuntimeExports[subscriber.eventType] },
})),
export: "createCatalogBookingSnapshotSubscriberGraphRuntime",
`,
    "packages/catalog/src/runtime-contributor.ts": `
interface CatalogRuntimePortContribution {
  projection: RuntimePortValue<CatalogProjectionRuntimeProvider>
  bookingSnapshot: RuntimePortValue<CatalogBookingSnapshotRuntimeProvider>
}
const ports = {
  [catalogProjectionRuntimePort.id]: projection,
  [catalogBookingSnapshotRuntimePort.id]: bookingSnapshot,
}
`,
    "packages/catalog/src/index-subscriber-runtime.ts": `
const factory = defineGraphRuntimeFactory(async ({ getPort }) => {
  const provider = await getPort(catalogProjectionRuntimePort)
  return { register: async (context) => {
    context.container.register(KEY, await provider.createRuntime(context.bindings))
    await descriptor.register(context)
  }}
})
`,
    "packages/catalog/src/booking-snapshot-subscriber-runtime.ts": `
const factory = defineGraphRuntimeFactory(async ({ getPort }) => {
  const provider = await getPort(catalogBookingSnapshotRuntimePort)
  return { register: async (context) => {
    context.container.register(KEY, await provider.createRuntime(context.bindings))
    await catalogBookingConfirmedSnapshotSubscriber.register(context)
  }}
})
`,
    "packages/runtime/src/deployment-resources.ts": "const ports = {}\n",
    ...overrides,
  }
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(root, relativePath)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, source)
  }
  return root
}

const runChecker = (root) => execFileAsync(process.execPath, [checker, "--root", root])

describe("Catalog subscriber authority checker", () => {
  it("accepts package-owned graph runtimes with typed host ports", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /Catalog subscriber authority: OK/)
  })

  // The "restored application app" case moved: that path is declared in
  // scripts/checks/regression/retired-paths.json and asserted by
  // verify:retired-surfaces, which covers every retired path in one place.

  it("rejects a retained legacy bridge file", async () => {
    const root = await createFixture({
      "apps/operator/src/api/subscribers/catalog-bridge.ts": "eventBus.subscribe()\n",
    })
    await assert.rejects(runChecker(root), /Obsolete Operator Catalog bridge file remains/)
  })

  it("rejects missing selected-runtime registration ordering", async () => {
    const root = await createFixture({
      "packages/catalog/src/index-subscriber-runtime.ts": `
const provider = await getPort(catalogProjectionRuntimePort)
await descriptor.register(context)
context.container.register(KEY, provider)
`,
    })
    await assert.rejects(runChecker(root), /register the selected projection port before/)
  })
})
