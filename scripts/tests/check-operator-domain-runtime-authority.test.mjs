import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const checker = path.resolve(
  fileURLToPath(import.meta.url),
  "../../check-operator-domain-runtime-authority.mjs",
)

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-domain-runtime-"))
  const files = {
    "packages/trips/src/route-runtime.ts": "runtime",
    "packages/trips/src/runtime.ts":
      "createTripsRouteRuntime createCatalogComponentAdapter VoyantRuntimeHostPrimitives",
    "packages/trips/src/checkout/voyant-fx.ts": "runtime",
    "packages/distribution/src/channel-push/jobs.ts": "runtime",
    "packages/inventory/src/brochure-runtime.ts": "runtime",
    "packages/inventory/src/booking-payment-policy-runtime.ts": "runtime",
    "packages/accommodations/src/payment-policy-runtime.ts": "runtime",
    "packages/cruises/src/payment-policy-runtime.ts": "runtime",
    "packages/distribution/src/payment-policy-runtime.ts": "runtime",
    ...overrides,
  }
  for (const [relative, source] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, source)
  }
  return root
}

describe("operator domain runtime authority", () => {
  it("accepts package-owned domain behavior", async () => {
    const result = await execFileAsync(process.execPath, [checker, "--root", await fixture()])
    assert.match(result.stdout, /authority: OK/)
  })

  it("rejects a restored application Trips implementation", async () => {
    const root = await fixture({
      "apps/operator/src/api/runtime/trips-runtime.ts": "implementation",
    })
    await assert.rejects(execFileAsync(process.execPath, [checker, "--root", root]), (error) =>
      error.stderr.includes("Trips deployment adapter must stay deleted"),
    )
  })

  it("rejects a restored application payment-policy facade", async () => {
    const facade = "apps/operator/src/api/runtime/booking-payment-policy-runtime.ts"
    const root = await fixture({ [facade]: "package composition" })
    await assert.rejects(execFileAsync(process.execPath, [checker, "--root", root]), (error) =>
      error.stderr.includes(`${facade} must stay deleted`),
    )
  })

  it("rejects a restored application workflow-service catalog", async () => {
    const facade = "apps/operator/src/api/runtime/operator-workflow-services.ts"
    const root = await fixture({ [facade]: "package workflow services" })
    await assert.rejects(execFileAsync(process.execPath, [checker, "--root", root]), (error) =>
      error.stderr.includes(`${facade} must stay deleted`),
    )
  })
})
