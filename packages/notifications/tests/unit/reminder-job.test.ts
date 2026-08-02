import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  drainDurableNotificationSends,
  hasRecoverableNotificationSends,
  sendDueNotificationReminders,
} = vi.hoisted(() => ({
  drainDurableNotificationSends: vi.fn(async () => ({
    claimed: 0,
    sent: 0,
    retried: 0,
    deadLettered: 0,
  })),
  hasRecoverableNotificationSends: vi.fn(async () => false),
  sendDueNotificationReminders: vi.fn(async () => ({
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  })),
}))
vi.mock("../../src/tasks/send-due-reminders.js", () => ({ sendDueNotificationReminders }))
vi.mock("../../src/service-durable-send.js", () => ({
  drainDurableNotificationSends,
  hasRecoverableNotificationSends,
}))

import {
  runDueNotificationRemindersJob,
  runDueNotificationSendsJob,
} from "../../src/reminder-job.js"

describe("due reminders job", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasRecoverableNotificationSends.mockResolvedValue(false)
  })

  it("polls durable reminder state without accepting a run payload", async () => {
    const db = {}
    const env = { DATABASE_URL: "postgres://test" }
    const options = {}
    await runDueNotificationRemindersJob({
      hasPort: () => false,
      getPort: async () => ({
        resolveDb: async () => db,
        resolveEnv: async () => env,
        resolveRuntimeOptions: async () => options,
      }),
    } as never)
    expect(sendDueNotificationReminders).toHaveBeenCalledWith(db, env, {}, options)
  })

  it("exports a fixed durable-send job that uses the exact selected provider port", async () => {
    const db = {}
    const providers = [{ name: "durable-provider" }]
    await runDueNotificationSendsJob({
      hasPort: () => true,
      getPort: async (port: { id: string }) =>
        port.id === "notifications.durable-provider"
          ? { providers }
          : {
              resolveDb: async () => db,
            },
    } as never)
    expect(drainDurableNotificationSends).toHaveBeenCalledWith(db, providers)
  })

  it("fails closed when recoverable sends lose their selected provider", async () => {
    const db = {}
    hasRecoverableNotificationSends.mockResolvedValueOnce(true)
    await expect(
      runDueNotificationSendsJob({
        hasPort: () => false,
        getPort: async () => ({ resolveDb: async () => db }),
      } as never),
    ).rejects.toThrow(/exact durable provider is unavailable/)
    expect(drainDurableNotificationSends).not.toHaveBeenCalled()
  })
})
