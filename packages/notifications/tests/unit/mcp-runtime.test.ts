import { describe, expect, it } from "vitest"

import { durableNotificationProviderPort } from "../../src/durable-provider-port.js"
import { voyantToolContextContribution } from "../../src/mcp-runtime.js"

const request = {
  env: {},
  var: { db: {} },
  req: { header: () => undefined },
} as never

describe("notifications MCP runtime authority", () => {
  it("keeps reads available but fails closed on send without the durable provider port", async () => {
    const contribution = await voyantToolContextContribution.contribute({
      request,
      context: {} as never,
      resources: {
        "notifications.runtime": {
          resolveProviders: () => [],
        },
      },
    })
    expect(contribution.notifications).toMatchObject({
      listDeliveries: expect.any(Function),
      getDeliveryById: expect.any(Function),
      sendTemplated: expect.any(Function),
    })
    await expect(
      contribution.notifications.sendTemplated(
        { templateSlug: "test", to: "test@example.com" },
        {} as never,
      ),
    ).rejects.toMatchObject({
      code: "MISSING_SERVICE",
      message: expect.stringContaining(durableNotificationProviderPort.id),
    })
  })

  it("uses the exact selected provider instance from the attested port resource", async () => {
    const provider = {
      name: "attested",
      channels: ["email"],
      durableDelivery: {
        protocol: "notification-provider-idempotency-v1" as const,
        send: async () => ({ provider: "attested" }),
      },
    }
    const contribution = await voyantToolContextContribution.contribute({
      request,
      context: {} as never,
      resources: {
        [durableNotificationProviderPort.id]: {
          providers: [provider],
          createIsolatedProbe: async () => {
            throw new Error("conformance already ran before MCP composition")
          },
        },
      },
    })
    expect(contribution.notifications).toMatchObject({
      listDeliveries: expect.any(Function),
      getDeliveryById: expect.any(Function),
      sendTemplated: expect.any(Function),
    })
  })
})
