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
const checker = path.join(repoRoot, "scripts/check-trips-subscriber-authority.mjs")

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-trips-subscriber-authority-"))
  const files = {
    "packages/trips/src/voyant.ts": `subscribers: [{ runtime: { entry: "@voyant-travel/trips/payment-subscribers", export: "tripsPaymentCompletedSubscriber" } }]`,
    "packages/trips/src/index.ts": `
const runtime = { withDb: (operation) => databaseRuntime.withDb(context.bindings, operation) }
container.register(TRIPS_PAYMENT_SUBSCRIBER_RUNTIME_KEY, runtime)
`,
    "packages/trips/src/runtime.ts": "VoyantRuntimeHostPrimitives\n",
    "packages/runtime/src/deployment-resources.ts": `
options.createRuntimePorts({ primitives })
`,
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

describe("Trips subscriber authority checker", () => {
  it("accepts graph-owned subscriber registration with only a DB service adapter", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /Trips subscriber authority: OK/)
  })

  it("rejects a restored starter app", async () => {
    const root = await createFixture({
      "starters/operator/src/api/app.ts": "plugins: [tripsPaymentBundle]\n",
    })
    await assert.rejects(
      runChecker(root),
      /starters\/operator\/src\/api\/app\.ts must stay deleted/,
    )
  })

  // The "restored Operator Trips runtime" case moved: that path is declared in
  // scripts/checks/regression/retired-paths.json and asserted by
  // verify:retired-surfaces, which covers every retired path in one place.

  it("rejects manual descriptor registration in composition", async () => {
    const root = await createFixture({
      "packages/runtime/src/deployment-resources.ts": `
const ports = {
  [tripsDatabaseRuntimePort.id]: {
    withDb: <T>(bindings: unknown, operation: (db: AnyDrizzleDb) => Promise<T>) =>
      withDbFromEnv(operatorBindings(bindings), (db) => operation(operatorPostgresDb(db))),
  } satisfies TripsDatabaseRuntime,
}
options.createRuntimePorts({ primitives })
tripsPaymentCompletedSubscriber.register(context)
`,
    })
    await assert.rejects(runChecker(root), /must leave subscriber registration to selected-graph/)
  })
})
