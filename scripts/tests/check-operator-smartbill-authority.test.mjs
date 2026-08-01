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
const checkerPath = path.join(repoRoot, "scripts/check-operator-smartbill-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-smartbill-authority-"))
  const files = {
    "apps/operator/package.json": JSON.stringify({ dependencies: {} }),
    "apps/operator/voyant.config.ts":
      'export default { plugins: [{ resolve: "@voyant-travel/plugin-netopia" }] }\n',
    "packages/runtime/src/deployment-resources.ts":
      "return options.createRuntimePorts({ primitives })\n",
    "packages/finance/src/voyant.ts":
      'runtimePorts: [requirePort(financeInvoiceSettlementPollerRuntimePort, { optional: true, cardinality: "many" })]\n',
    "packages/finance/src/runtime-port.ts":
      'export interface FinanceInvoiceSettlementPollerProvider {}\nid: "finance.invoice-settlement-poller"\n',
    "packages/finance/src/runtime.ts":
      "aggregateFinanceInvoiceSettlementPollers(providers)\nObject.hasOwn(pollers, provider.provider)\n",
    "packages/finance/src/index.ts": "await getPorts(financeInvoiceSettlementPollerRuntimePort)\n",
    "packages/core/src/project.ts": "getPorts<TProvider>(port: VoyantPort<TProvider>)\n",
    "packages/framework/src/deployment-artifacts.ts":
      "GENERATED_GRAPH_RUNTIME_MANY_PORT_IDS\nvalues.push(value)\nhas multiple static contributors\n",
    ...overrides,
  }
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
    [checkerPath, "--root", root, "--operator-root", path.join(root, "apps/operator")],
    { cwd: root },
  )
}

describe("check-operator-smartbill-authority", () => {
  it("accepts a static optional many-valued Finance provider without a application bridge", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /check-operator-smartbill-authority: OK/)
  })

  it("accepts provider-neutral graph ports in the generic runtime host", async () => {
    const root = await createFixture({
      "packages/runtime/src/deployment-resources.ts": `
        providerPorts?: VoyantGraphRuntimePorts
        return options.createRuntimePorts({
          primitives,
          ...(options.providerPorts ? { runtimePorts: options.providerPorts } : {}),
        })
      `,
    })
    const result = await runChecker(root)
    assert.match(result.stdout, /check-operator-smartbill-authority: OK/)
  })

  it("rejects selecting SmartBill in the default project", async () => {
    const root = await createFixture({
      "apps/operator/voyant.config.ts":
        'export default { plugins: [{ resolve: "@voyant-travel/plugin-smartbill" }] }\n',
    })
    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /default voyant\.config\.ts must not select/)
      return true
    })
  })

  it("rejects application-owned SmartBill bridges and config injection", async () => {
    const root = await createFixture({
      "packages/runtime/src/deployment-resources.ts":
        'createGeneratedGraphRuntimePorts({ capabilities, primitives, host: operatorSmartbillRuntimeHost })\ninvoiceSettlementPollers\nimport "@voyant-travel/plugin-smartbill"\nresolveOperatorSmartbillConfig\n',
    })
    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /must not retain SmartBill bridge token/)
      assert.match(error.stderr, /only generic primitives/)
      return true
    })
  })

  it("rejects duplicate-overwriting Finance aggregation", async () => {
    const root = await createFixture({
      "packages/finance/src/runtime.ts":
        "aggregateFinanceInvoiceSettlementPollers(providers)\npollers[provider.provider] = provider.poller\n",
    })
    await assert.rejects(runChecker(root), /must reject duplicate invoicing provider names/)
  })
})
