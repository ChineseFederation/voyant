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
const checker = path.join(repoRoot, "scripts/check-storefront-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-storefront-authority-"))
  const files = {
    "packages/storefront/src/voyant.ts": `
runtime: { entry: "@voyant-travel/storefront", export: "createStorefrontVoyantRuntime" },
runtimePorts: [
  requirePort(storefrontOffersRuntimePort),
  requirePort(storefrontIntakeRuntimePort),
],
`,
    "packages/storefront/src/index.ts":
      "export const createStorefrontVoyantRuntime = () => undefined\n",
    "packages/runtime/src/deployment-resources.ts": "export const resources = {}\n",
    "packages/storefront/src/runtime-contributor.ts": `
[storefrontOffersRuntimePort.id]: createCommerceStorefrontOfferResolvers()
[storefrontCustomerPortalRuntimePort.id]: customerPortal
`,
    "packages/relationships/src/runtime-contributor.ts":
      "[storefrontIntakeRuntimePortReference.id]: createStorefrontIntakePersistence()\n",
    "packages/notifications/src/runtime-contributor.ts":
      "[storefrontVerificationRuntimePort.id]: verification\n",
    "packages/trips/src/runtime-contributor.ts":
      "[storefrontPaymentLinkRuntimePort.id]: createStandardPaymentLinkRouteOptions()\n",
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

describe("check-storefront-subscriber-authority", () => {
  it("accepts the retained Storefront runtime without booking bootstrap authority", async () => {
    const root = await createFixture()
    const { stdout } = await runChecker(root)
    assert.match(stdout, /Storefront authority: OK/)
  })

  it("rejects a restored booking-intents runtime port", async () => {
    const root = await createFixture({
      "packages/storefront/src/voyant.ts": `
runtime: { entry: "@voyant-travel/storefront", export: "createStorefrontVoyantRuntime" },
runtimePorts: [
  requirePort(storefrontOffersRuntimePort),
  requirePort(storefrontBookingIntentsRuntimePort),
  requirePort(storefrontIntakeRuntimePort),
],
`,
    })
    await assert.rejects(runChecker(root), /must not restore the retired Storefront/)
  })

  it("rejects a restored booking-bootstrap registration", async () => {
    const root = await createFixture({
      "packages/storefront/src/index.ts":
        "registerStorefrontBookingBootstrapRuntime(container, runtime)\n",
    })
    await assert.rejects(runChecker(root), /must not restore the retired Storefront/)
  })
})
