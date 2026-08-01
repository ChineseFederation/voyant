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
const checker = path.join(repoRoot, "scripts/check-commerce-promotion-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-commerce-promotion-authority-"))
  const files = {
    "packages/commerce/src/voyant.ts": `
runtimePorts: [
  requirePort(promotionRedemptionDatabaseRuntimePort),
  requirePort(promotionsBulkReindexRuntimePort),
]
runtime: {
  entry: "@voyant-travel/commerce/promotion-redemption-subscriber",
  export: "createPromotionRedemptionSubscriberGraphRuntime",
}
`,
    "packages/commerce/src/promotions/subscriber-runtime.ts": `
const database = await getPort(promotionRedemptionDatabaseRuntimePort)
const bulkReindex = await getPort(promotionsBulkReindexRuntimePort)
const descriptor = {
  register: ({ eventBus }) => eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", handler)
}
register: async (context) => {
  context.container.register(BULK_REINDEX_SERVICE_KEY, await bulkReindex.createService(bindings))
  await descriptor.register(context)
}
`,
    "apps/operator/src/api/subscribers/catalog-bridge.ts":
      'eventBus.subscribe<BookingConfirmedEventPayload>("booking.confirmed", captureSnapshot)\n',
    "packages/commerce/src/runtime-contributor.ts": `
[promotionRedemptionDatabaseRuntimePort.id]: {
},
[promotionsBulkReindexRuntimePort.id]: {
},
`,
    "packages/commerce/src/runtime.ts": `
promotionRedemptionDatabase: {
  withDb: (bindings, operation) => primitives.database.transaction(bindings, operation),
},
promotionsBulkReindex: {
  createService: (bindings) => {
    primitives.database.transaction(bindings, operation)
    catalog.createProductsDocumentBuilder(db, context)
  },
},
`,
    "packages/runtime/src/deployment-resources.ts": "",
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

describe("Commerce promotion subscriber authority checker", () => {
  it("accepts selected-graph authority with typed host ports", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /Commerce promotion subscriber authority: OK/)
  })

  it("rejects an inert manifest subscriber", async () => {
    const root = await createFixture({
      "packages/commerce/src/voyant.ts": "subscribers: []\n",
    })
    await assert.rejects(runChecker(root), /manifest must own the promotion-redemption subscriber/)
  })

  it("rejects a restored application app", async () => {
    const root = await createFixture({
      "apps/operator/src/api/app.ts": 'plugins: [{ name: "operator-promotions-runtime" }]\n',
    })
    await assert.rejects(runChecker(root), /apps\/operator\/src\/api\/app\.ts must stay deleted/)
  })

  it("rejects catalog-bridge redemption authority", async () => {
    const root = await createFixture({
      "apps/operator/src/api/subscribers/catalog-bridge.ts":
        "await recordPromotionRedemptionsForBooking(db, bookingId)\n",
    })
    await assert.rejects(runChecker(root), /must not retain promotion-redemption subscriber/)
  })

  it("rejects missing bulk-reindex service ordering", async () => {
    const root = await createFixture({
      "packages/commerce/src/promotions/subscriber-runtime.ts": `
const database = await getPort(promotionRedemptionDatabaseRuntimePort)
const bulkReindex = await getPort(promotionsBulkReindexRuntimePort)
const descriptor = {
  register: ({ eventBus }) => eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", handler)
}
await descriptor.register(context)
context.container.register(BULK_REINDEX_SERVICE_KEY, service)
`,
    })
    await assert.rejects(runChecker(root), /register the bulk-reindex service before/)
  })
})
