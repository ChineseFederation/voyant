import { assertPortConforms } from "@voyant-travel/core/project"
import { proposalsNotificationsRuntimePort } from "@voyant-travel/proposals/runtime-port"
import { describe, expect, it, vi } from "vitest"

import type { DurableNotificationProviderRuntime } from "../../src/durable-provider-port.js"
import { durableNotificationProviderPort } from "../../src/durable-provider-port.js"
import { createNotificationsRuntimePortContribution } from "../../src/runtime-contributor.js"

const primitives = {
  env: () => ({}),
  database: {
    resolve: vi.fn(),
    fromContext: vi.fn(),
    transaction: vi.fn(),
  },
  storage: {
    resolve: vi.fn(),
    read: vi.fn(),
    downloadUrl: vi.fn(),
  },
  events: { deliver: vi.fn() },
  config: { read: vi.fn() },
}

describe("Proposals Notifications runtime", () => {
  it("omits the adapter when no durable provider is selected", () => {
    const contribution = createNotificationsRuntimePortContribution({
      primitives,
      hasRuntimePort: () => false,
      getRuntimePort: async () => {
        throw new Error("unselected port must not be read")
      },
    } as never)
    expect(contribution).not.toHaveProperty(proposalsNotificationsRuntimePort.id)
  })

  it("closes over the exact selected durable provider set", async () => {
    const selected: DurableNotificationProviderRuntime = {
      providers: [
        {
          name: "durable-email:v1",
          channels: ["email"],
          durableDelivery: {
            protocol: "notification-provider-idempotency-v1",
            async send() {
              return { provider: "durable-email:v1", id: "message_1" }
            },
          },
        },
      ],
      createIsolatedProbe: async () => {
        throw new Error("provider port conformance owns the behavioral probe")
      },
    }
    const contribution = createNotificationsRuntimePortContribution({
      primitives,
      hasRuntimePort: (port: { id: string }) => port.id === durableNotificationProviderPort.id,
      getRuntimePort: async () => selected,
    } as never)
    const adapter = await Promise.resolve(contribution[proposalsNotificationsRuntimePort.id])
    await expect(
      assertPortConforms(proposalsNotificationsRuntimePort, adapter as never),
    ).resolves.toBeUndefined()
    expect(adapter).toMatchObject({ providerNames: ["durable-email:v1"] })
  })
})
