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
const checker = path.join(repoRoot, "scripts/check-notifications-subscriber-authority.mjs")

const manifest = `
eventType: "booking.confirmed"
export: "notificationsBookingConfirmedReminderSubscriber"
eventType: "payment.completed"
export: "notificationsPaymentCompletedReminderSubscriber"
eventType: "booking.cancelled"
export: "notificationsBookingCancelledReminderSubscriber"
`

const subscriberRuntime = `
export const notificationsBookingConfirmedReminderSubscriber = factory()
export const notificationsPaymentCompletedReminderSubscriber = factory()
export const notificationsBookingCancelledReminderSubscriber = factory()
eventBus.subscribe("booking.confirmed", handler)
eventBus.subscribe("payment.completed", handler)
`

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-notifications-authority-"))
  const files = {
    "packages/notifications/src/voyant.ts": manifest,
    "packages/notifications/src/index.ts": "const runtime = {}\n",
    "packages/notifications/src/subscriber-runtime.ts": subscriberRuntime,
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

describe("Notifications subscriber authority checker", () => {
  it("accepts package-owned reminder subscriber authority", async () => {
    const result = await runChecker(await createFixture())
    assert.match(result.stdout, /0 hidden bootstrap subscriptions/)
    assert.match(result.stdout, /0 legacy document lifecycle orchestration/)
  })

  it("rejects hidden module bootstrap subscriptions", async () => {
    const root = await createFixture({
      "packages/notifications/src/index.ts": `
eventBus.subscribe("booking.confirmed", handler)
`,
    })
    await assert.rejects(runChecker(root), /must not hide eventBus subscriptions/)
  })

  it("rejects an activated subscriber missing from the manifest", async () => {
    const root = await createFixture({
      "packages/notifications/src/voyant.ts": manifest.replace(
        'export: "notificationsPaymentCompletedReminderSubscriber"',
        "",
      ),
    })
    await assert.rejects(runChecker(root), /must activate.*exactly once/)
  })

  it("rejects the legacy document lifecycle escape hatch", async () => {
    const root = await createFixture({
      "packages/notifications/src/index.ts":
        "const runtime = { documentBundleLifecycle: provider.documentBundleLifecycle }\n",
    })
    await assert.rejects(runChecker(root), /must not expose legacy document lifecycle/)
  })

  it("rejects duplicate lifecycle subscriptions", async () => {
    const root = await createFixture({
      "packages/notifications/src/subscriber-runtime.ts": `${subscriberRuntime}
eventBus.subscribe("payment.completed", duplicateHandler)
`,
    })
    await assert.rejects(runChecker(root), /payment.completed exactly once \(found 2\)/)
  })
})
