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
const checkerPath = path.join(repoRoot, "scripts/check-flights-runtime-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-flights-authority-"))
  const files = {
    "flights/package.json": JSON.stringify({
      dependencies: { "@voyant-travel/finance": "workspace:^" },
      exports: {
        "./runtime-contributor": "./src/runtime-contributor.ts",
      },
      voyant: {
        requiresSchemas: ["@voyant-travel/finance"],
        runtime: { export: "createFlightsRuntimePortContribution" },
      },
    }),
    "flights/src/voyant.ts":
      'runtimePorts: [\nrequirePort(flightsRuntimePort),\nrequirePort(durableFlightActionRuntimePort, { optional: true }),\n]\nrequires: { capabilities: ["finance.payment-sessions"] }\nexport: "createFlightsVoyantRuntime"\n',
    "flights/src/api-runtime.ts":
      'defineGraphRuntimeFactory(({ getPort }) => getPort(flightsRuntimePort))\ncreateOrderPaymentSessions({ targetType: "flight_order" })\n',
    "flights/src/runtime-port.ts": '["resolveAdapter", "startCardPayment"]\n',
    "flights/src/runtime-contributor.ts":
      "primitives: VoyantRuntimeHostPrimitives\ncreateFlightsRuntime(host.primitives)\n",
    "flights/src/runtime.ts":
      'resolveAdapter() {}\nstartCardPayment() {}\nthrow new Error("Flight connector is not configured")\n',
    "runtime/src/deployment-resources.ts":
      "function createDeploymentPortResources() { return options.createRuntimePorts({ primitives }) }\n",
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
    [
      checkerPath,
      "--flights-root",
      path.join(root, "flights"),
      "--retired-flights-node-root",
      path.join(root, "flights-node"),
      "--composition",
      path.join(root, "runtime/src/deployment-resources.ts"),
      "--retired-adapter",
      path.join(root, "operator/src/api/runtime/runtime-adapter.ts"),
    ],
    { cwd: root },
  )
}

describe("check-flights-runtime-authority", () => {
  it("accepts package runtime authority with Node-host port wiring", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /Flights-owned standard Node runtime authority/)
  })

  it("rejects package-id bindings and compatibility route loaders", async () => {
    const root = await createFixture({
      "runtime/src/deployment-resources.ts":
        'function createDeploymentPortResources() { return {} }\nexport const operatorGraphRuntimeBindings = { "@voyant-travel/flights": legacy }\nconst loadFlightAdminRoutes = legacy\nconst loadFlightsRuntime = () => import("./flights-runtime")\n',
    })

    await assert.rejects(runChecker(root), (error) => {
      assert.match(error.stderr, /compatibility runtime bindings must stay deleted/)
      assert.match(error.stderr, /must not retain the Flights compatibility route loader/)
      assert.match(error.stderr, /must not retain a Flights runtime loader or facade/)
      return true
    })
  })
})
