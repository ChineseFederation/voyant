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
const checker = path.join(repoRoot, "scripts/check-realtime-runtime-authority.mjs")

const runtime = `
export const realtimeInvalidationRoutes = {
  "product.created": (event) => adminHint("product", firstId(event, "id")),
}
const bookingHint = (event) => ({ channels: ["admin", \`booking:\${bookingId}\`] })
const availabilityHint = { channels: ["admin", \`product:\${productId}\`] }
const invalidationSubscriber = () => descriptor
export const realtimeProductCreatedInvalidationSubscriber = invalidationSubscriber("product.created")
export function createRealtimeRuntime(provider) {
  return { resolveProviders: () => (provider ? [provider] : []) }
}
`
const manifest = `
providers: [
  {
    selection: { role: "realtime", value: "local" },
    runtime: { export: "createLocalGraphRealtimeProvider" },
  },
  {
    selection: { role: "realtime", value: "voyant-cloud" },
    uses: { secrets: ["@voyant-travel/realtime#secret.voyant-cloud-api-key"] },
    runtime: { export: "createVoyantCloudGraphRealtimeProvider" },
  },
],
subscribers: [
  [
    "product.created",
    "realtimeProductCreatedInvalidationSubscriber",
  ],
].map(([eventType, exportName]) => ({
  eventType,
  source: "@voyant-travel/realtime/runtime",
  runtime: { export: exportName },
}))
`

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-realtime-authority-"))
  const files = {
    "packages/runtime/src/deployment-resources.ts": "const primitives = {}\n",
    "packages/realtime/src/runtime-contributor.ts": `
const transport = host.getRuntimePort<RealtimeProvider>(realtimeTransportRuntimePort)
createRealtimeRuntime(transport)
`,
    "packages/realtime/src/runtime.ts": runtime,
    "packages/realtime/src/voyant.ts": manifest,
    "packages/realtime/src/providers/local.ts": `
export function createLocalGraphRealtimeProvider() { return createLocalRealtimeProvider() }
`,
    "packages/realtime/src/providers/voyant-cloud.ts": `
export function createVoyantCloudGraphRealtimeProvider(context) {
  context.getSecret(REALTIME_VOYANT_CLOUD_API_KEY_SECRET_ID)
  context.getConfig(REALTIME_VOYANT_CLOUD_BASE_URL_CONFIG_ID)
  context.getConfig(REALTIME_VOYANT_CLOUD_USER_AGENT_CONFIG_ID)
  return createVoyantCloudClient()
}
`,
    "scripts/fixtures/realtime-route-policy.json": JSON.stringify({
      "product.created": { entity: "product", idKeys: ["id"], kind: "admin" },
    }),
    "packages/realtime/package.json": JSON.stringify({
      exports: { "./runtime": "./src/runtime.ts" },
      dependencies: { "@voyant-travel/cloud-sdk": "^0.11.0" },
    }),
    ...overrides,
  }
  for (const [relativePath, source] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  return root
}

const runChecker = (root) => execFileAsync(process.execPath, [checker, "--root", root])

describe("Realtime runtime authority checker", () => {
  it("accepts package-owned provider and route authority", async () => {
    const result = await runChecker(await fixture())
    assert.match(result.stdout, /1 package-owned routes and selected descriptors/)
  })

  it("rejects an Operator package-specific loader", async () => {
    const root = await fixture({
      "packages/runtime/src/deployment-resources.ts": "loadRealtimeRuntime()\n",
    })
    await assert.rejects(runChecker(root), /must not load package-specific Realtime runtime/)
  })

  it("rejects a route without a selected descriptor", async () => {
    const root = await fixture({
      "packages/realtime/src/voyant.ts": manifest.replace(
        `[
    "product.created",
    "realtimeProductCreatedInvalidationSubscriber",
  ],`,
        "",
      ),
    })
    await assert.rejects(runChecker(root), /must be selected by the package manifest/)
  })

  it("rejects event-to-channel behavior drift", async () => {
    const root = await fixture({
      "packages/realtime/src/runtime.ts": runtime.replace(
        'adminHint("product", firstId(event, "id"))',
        'adminHint("inventory", firstId(event, "id"))',
      ),
    })
    await assert.rejects(runChecker(root), /must match the preserved policy fixture/)
  })

  it("rejects a contributor that bypasses the selected transport port", async () => {
    const root = await fixture({
      "packages/realtime/src/runtime-contributor.ts": `
createRealtimeRuntime(resolveRealtimeProviders(host.primitives.env(bindings)))
`,
    })
    await assert.rejects(runChecker(root), /must consume only the graph-selected transport port/)
  })
})
