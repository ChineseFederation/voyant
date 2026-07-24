import { describe, expect, it, vi } from "vitest"

import { buildNotificationTaskRuntime } from "../../src/task-runtime.js"

describe("buildNotificationTaskRuntime", () => {
  it("registers resolved providers once", () => {
    const resolveProviders = vi.fn(() => [
      {
        name: "email-provider",
        channels: ["email"],
        durableDelivery: {
          protocol: "notification-provider-idempotency-v1" as const,
          async send() {
            return { provider: "email-provider" }
          },
        },
      },
    ])

    const runtime = buildNotificationTaskRuntime(
      { VOYANT_CLOUD_API_KEY: "k_test" },
      { resolveProviders },
    )

    expect(resolveProviders).toHaveBeenCalledOnce()
    expect(runtime.providers).toHaveLength(1)
    expect(runtime.providers[0]?.name).toBe("email-provider")
  })

  it("preserves the reminder sweep lock manager", () => {
    const reminderSweepLockManager = {
      runExclusive: vi.fn(),
    }

    const runtime = buildNotificationTaskRuntime(
      { VOYANT_CLOUD_API_KEY: "k_test" },
      { providers: [], reminderSweepLockManager },
    )

    expect(runtime.reminderSweepLockManager).toBe(reminderSweepLockManager)
  })

  it("throws when neither providers nor resolveProviders is supplied", () => {
    expect(() => buildNotificationTaskRuntime({}, {})).toThrow(/requires `providers`/)
  })
})
