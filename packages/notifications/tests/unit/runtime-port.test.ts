import { createContainer, createEventBus } from "@voyant-travel/core"
import { assertPortConforms } from "@voyant-travel/core/project"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"
import { durableNotificationProviderPort } from "../../src/durable-provider-port.js"
import {
  createNotificationsSubscribersVoyantRuntime,
  createNotificationsVoyantRuntime,
} from "../../src/index.js"
import { NOTIFICATION_REMINDER_JOB_RUNTIME_KEY } from "../../src/job-runtime.js"
import {
  type NotificationsRuntimeProvider,
  notificationsRuntimePort,
} from "../../src/runtime-port.js"
import { NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY } from "../../src/subscriber-runtime.js"

const jobRuntime = {
  resolveDb: () => ({}) as PostgresJsDatabase,
  resolveEnv: () => ({}),
  resolveRuntimeOptions: () => ({ providers: [] }),
}

function provider(): NotificationsRuntimeProvider {
  return {
    resolveDb: () => ({}) as PostgresJsDatabase,
    resolveProviders: () => [],
    resolveReminderJobRuntime: () => jobRuntime,
  }
}

function runtimeFactoryContext(value = provider()) {
  return {
    unitId: "@voyant-travel/notifications",
    getUnitProjectConfig: () => undefined,
    hostOptions: {},
    hasPort: (port: { id: string }) => port.id === notificationsRuntimePort.id,
    getPort: async () => value,
  } as never
}

describe("Notifications runtime port", () => {
  it("validates the complete Node host contract", async () => {
    await expect(assertPortConforms(notificationsRuntimePort, provider())).resolves.toBeUndefined()
    await expect(
      assertPortConforms(notificationsRuntimePort, {
        resolveDb: vi.fn(),
        resolveProviders: vi.fn(),
      } as never),
    ).rejects.toThrow(/resolveReminderJobRuntime/)
  })

  it("attests only a selected provider with behavioral restart evidence", async () => {
    const accepted = new Map<
      string,
      { fingerprint: string; result: { provider: string; id: string } }
    >()
    const providerForProcess = () => ({
      name: "durable-test",
      channels: ["email"],
      durableDelivery: {
        protocol: "notification-provider-idempotency-v1" as const,
        async send(payload: unknown, { idempotencyKey }: { idempotencyKey: string }) {
          const fingerprint = JSON.stringify(payload)
          const previous = accepted.get(idempotencyKey)
          if (previous) {
            if (previous.fingerprint !== fingerprint) throw new Error("payload drift")
            return previous.result
          }
          const result = { provider: "durable-test", id: `accepted_${accepted.size + 1}` }
          accepted.set(idempotencyKey, { fingerprint, result })
          return result
        },
      },
    })
    const selected = providerForProcess()
    await expect(
      assertPortConforms(durableNotificationProviderPort, {
        providers: [selected],
        createIsolatedProbe: async () => ({
          providers: [providerForProcess()],
          restart: async () => [providerForProcess()],
          acceptedCount: (_providerName: string, key: string) => (accepted.has(key) ? 1 : 0),
        }),
      }),
    ).resolves.toBeUndefined()

    let lieCount = 0
    const liar = () => ({
      ...selected,
      durableDelivery: {
        ...selected.durableDelivery,
        async send() {
          lieCount += 1
          return { provider: "durable-test", id: `new_${lieCount}` }
        },
      },
    })
    await expect(
      assertPortConforms(durableNotificationProviderPort, {
        providers: [selected],
        createIsolatedProbe: async () => ({
          providers: [liar()],
          restart: async () => [liar()],
          acceptedCount: () => 1,
        }),
      }),
    ).rejects.toThrow(/failed replay conformance/)

    const swappedRuntime = {
      providers: [selected],
      async createIsolatedProbe() {
        this.providers = [providerForProcess()]
        return {
          providers: [providerForProcess()],
          restart: async () => [providerForProcess()],
          acceptedCount: (_providerName: string, key: string) => (accepted.has(key) ? 1 : 0),
        }
      },
    }
    await expect(
      assertPortConforms(durableNotificationProviderPort, swappedRuntime),
    ).rejects.toThrow(/backend changed during conformance/)

    await expect(
      assertPortConforms(durableNotificationProviderPort, {
        providers: [
          {
            name: "malformed-provider",
            channels: ["email"],
            durableDelivery: {
              supported: false,
              reason: "not durable",
            },
          },
        ],
        createIsolatedProbe: async () => {
          throw new Error("malformed probe must not run")
        },
      } as never),
    ).rejects.toThrow(/crash-safe idempotent send/)
  })

  it("rejects a probe that does not exercise the exact selected provider set", async () => {
    const selected = {
      name: "selected-email",
      channels: ["email"],
      durableDelivery: {
        protocol: "notification-provider-idempotency-v1" as const,
        async send() {
          return { provider: "selected-email", id: "selected_1" }
        },
      },
    }
    await expect(
      assertPortConforms(durableNotificationProviderPort, {
        providers: [selected],
        createIsolatedProbe: async () => ({
          providers: [{ ...selected, name: "different-email" }],
          restart: async () => [{ ...selected, name: "different-email" }],
          acceptedCount: () => 1,
        }),
      }),
    ).rejects.toThrow(/does not match the exact selected provider set/)
  })

  it("keeps module and selected subscriber services in their owning factories", async () => {
    const container = createContainer()
    const context = { bindings: {}, container, eventBus: createEventBus() }
    const module = await createNotificationsVoyantRuntime(runtimeFactoryContext())
    const extension = await createNotificationsSubscribersVoyantRuntime(runtimeFactoryContext())

    await module.module.bootstrap?.(context)
    expect(container.has(NOTIFICATION_REMINDER_JOB_RUNTIME_KEY)).toBe(false)
    expect(container.has(NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY)).toBe(false)

    await extension.extension.bootstrap?.(context)
    expect(container.has(NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY)).toBe(true)
  })
})
