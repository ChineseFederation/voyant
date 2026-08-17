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
const checker = path.join(repoRoot, "scripts/check-public-api-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-storefront-authority-"))
  const files = {
    "packages/public-api/src/voyant.ts": `
runtime: { entry: "@voyant-travel/public-api", export: "createPublicApiVoyantRuntime" },
runtimePorts: [
  requirePort(publicApiOffersRuntimePort),
  requirePort(publicApiIntakeRuntimePort),
],
`,
    "packages/public-api/src/index.ts":
      "export const createPublicApiVoyantRuntime = () => undefined\n",
    "packages/runtime/src/deployment-resources.ts": "export const resources = {}\n",
    "packages/public-api/src/runtime-contributor.ts": `
[publicApiOffersRuntimePort.id]: createCommercePublicApiOfferResolvers()
[publicApiCustomerPortalRuntimePort.id]: customerPortal
`,
    "packages/relationships/src/runtime-contributor.ts":
      "[publicApiIntakeRuntimePortReference.id]: createPublicApiIntakePersistence()\n",
    "packages/notifications/src/runtime-contributor.ts":
      "[customerVerificationRuntimePort.id]: verification\n",
    "packages/trips/src/runtime-contributor.ts":
      "[financePaymentLinkRuntimePort.id]: createStandardPaymentLinkRouteOptions()\n",
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

describe("check-public-api-subscriber-authority", () => {
  it("accepts the retained Storefront runtime without booking bootstrap authority", async () => {
    const root = await createFixture()
    const { stdout } = await runChecker(root)
    assert.match(stdout, /Storefront authority: OK/)
  })

  it("rejects a restored booking-intents runtime port", async () => {
    const root = await createFixture({
      "packages/public-api/src/voyant.ts": `
runtime: { entry: "@voyant-travel/public-api", export: "createPublicApiVoyantRuntime" },
runtimePorts: [
  requirePort(publicApiOffersRuntimePort),
  requirePort(storefrontBookingIntentsRuntimePort),
  requirePort(publicApiIntakeRuntimePort),
],
`,
    })
    await assert.rejects(runChecker(root), /must not restore the retired Storefront/)
  })

  it("rejects a restored booking-bootstrap registration", async () => {
    const root = await createFixture({
      "packages/public-api/src/index.ts":
        "registerStorefrontBookingBootstrapRuntime(container, runtime)\n",
    })
    await assert.rejects(runChecker(root), /must not restore the retired Storefront/)
  })
})
