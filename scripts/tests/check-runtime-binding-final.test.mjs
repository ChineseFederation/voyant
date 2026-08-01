import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..")
const checker = path.join(repoRoot, "scripts/check-runtime-binding-final.mjs")
const contributors = {
  bookings: "actionLedgerBookingDriftRuntimePort",
  catalog: "createCatalogRuntime",
  commerce: "createCommerceRuntime",
  distribution: "createDistributionRuntime",
  finance: "financeHostRuntimePort",
  flights: "createFlightsRuntime",
  inventory: "createInventoryRuntime(host.primitives)",
  legal: "createLegalRuntime",
  notifications: "createNotificationsRuntime",
  proposals: "createProposalsRuntime",
}

async function fixture(generatedArguments) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-runtime-binding-final-"))
  const files = {
    "packages/runtime/src/deployment-resources.ts": `
return options.createRuntimePorts({
${generatedArguments}
})
`,
    ...Object.fromEntries(
      Object.entries(contributors).map(([packageName, source]) => [
        `packages/${packageName}/src/runtime-contributor.ts`,
        source,
      ]),
    ),
  }
  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const target = path.join(root, relativePath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, contents)
    }),
  )
  return root
}

it("accepts package-owned defaults and generic primitives", async () => {
  const root = await fixture("    primitives,")
  const result = await execFileAsync(process.execPath, [checker, "--root", root])
  assert.match(result.stdout, /10 package-owned runtime families/)
})

it("accepts optional provider-neutral graph ports", async () => {
  const root = await fixture(`
    primitives,
    ...(options.providerPorts ? { runtimePorts: options.providerPorts } : {}),
  `)
  const result = await execFileAsync(process.execPath, [checker, "--root", root])
  assert.match(result.stdout, /10 package-owned runtime families/)
})

it("rejects a package-specific generated runtime argument", async () => {
  const root = await fixture(
    "    primitives,\n    finance: loadFinanceRuntime(),\n    host: operatorSmartbillRuntimeHost,",
  )
  await assert.rejects(
    execFileAsync(process.execPath, [checker, "--root", root]),
    /arguments must be generic primitives/,
  )
})
