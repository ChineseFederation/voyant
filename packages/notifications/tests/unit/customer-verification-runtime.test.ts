import { customerVerificationRuntimePort } from "@voyant-travel/identity/runtime-port"
import {
  buildCustomerVerificationSenders,
  type CustomerVerificationRoutesOptions,
} from "@voyant-travel/identity/verification"
import { describe, expect, it, vi } from "vitest"
import { toCustomerVerificationNotificationProvider } from "../../src/customer-verification-runtime.js"
import { createNotificationsRuntimePortContribution } from "../../src/runtime-contributor.js"
import type { NotificationProvider } from "../../src/types.js"

function durableProvider(
  name: string,
  channels: ReadonlyArray<string>,
  send = vi.fn(async () => ({ id: `ntf_${name}`, provider: name })),
): NotificationProvider {
  return {
    name,
    channels,
    durableDelivery: { protocol: "notification-provider-idempotency-v1", send },
  }
}

function contributionOptions(
  providers: ReadonlyArray<NotificationProvider>,
): CustomerVerificationRoutesOptions {
  const contribution = createNotificationsRuntimePortContribution({
    primitives: {
      env: (bindings: unknown) => (bindings as Record<string, unknown> | undefined) ?? {},
      database: { resolve: vi.fn(), fromContext: vi.fn(), transaction: vi.fn() },
      storage: { resolve: vi.fn(), read: vi.fn(), downloadUrl: vi.fn() },
      events: { deliver: vi.fn() },
      config: {
        read: (_bindings: unknown, key: string) =>
          key === "notificationProviders" ? () => providers : undefined,
      },
    },
    hasRuntimePort: () => false,
    getRuntimePort: async () => {
      throw new Error("unselected port must not be read")
    },
  } as never)
  return contribution[customerVerificationRuntimePort.id] as CustomerVerificationRoutesOptions
}

describe("customer verification notification providers", () => {
  it("delivers an email challenge through durable delivery (voyant#3923)", async () => {
    const send = vi.fn(async () => ({ id: "ntf_1", provider: "voyant-cloud" }))
    const senders = buildCustomerVerificationSenders(
      {},
      contributionOptions([durableProvider("voyant-cloud", ["email"], send)]),
    )

    const result = await senders.sendEmailChallenge?.({
      email: "shopper@example.com",
      code: "123456",
      purpose: "booking.create",
      locale: "en",
      expiresAt: new Date("2026-01-01T00:10:00.000Z"),
    })

    expect(result).toEqual({ id: "ntf_1", provider: "voyant-cloud" })
    expect(send).toHaveBeenCalledOnce()
    const [payload, context] = send.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ]
    expect(payload).toMatchObject({
      to: "shopper@example.com",
      channel: "email",
      template: "storefront-verification-email",
      subject: "Your verification code",
      data: expect.objectContaining({ code: "123456", purpose: "booking.create" }),
    })
    expect(context.idempotencyKey).toMatch(/^voyant:storefront-verification:[0-9a-f]{64}$/)
  })

  it("delivers an SMS challenge through the sms-capable provider", async () => {
    const email = vi.fn(async () => ({ id: "ntf_email", provider: "email-provider" }))
    const sms = vi.fn(async () => ({ id: "ntf_sms", provider: "sms-provider" }))
    const senders = buildCustomerVerificationSenders(
      {},
      contributionOptions([
        durableProvider("email-provider", ["email"], email),
        durableProvider("sms-provider", ["sms"], sms),
      ]),
    )

    const result = await senders.sendSmsChallenge?.({
      phone: "+40700000000",
      code: "654321",
      purpose: "booking.create",
      expiresAt: new Date("2026-01-01T00:10:00.000Z"),
    })

    expect(result).toEqual({ id: "ntf_sms", provider: "sms-provider" })
    expect(email).not.toHaveBeenCalled()
    expect(sms).toHaveBeenCalledOnce()
  })

  it("keys deliveries by payload so a replay dedupes and a fresh code does not", async () => {
    const send = vi.fn(async () => ({ id: "ntf_1", provider: "voyant-cloud" }))
    const provider = toCustomerVerificationNotificationProvider(
      durableProvider("voyant-cloud", ["email"], send),
    )
    const payload = {
      to: "shopper@example.com",
      channel: "email" as const,
      template: "storefront-verification-email",
      data: { code: "123456" },
    }

    await provider.send(payload)
    await provider.send(payload)
    await provider.send({ ...payload, data: { code: "999999" } })

    const keys = send.mock.calls.map(
      ([, context]) => (context as unknown as { idempotencyKey: string }).idempotencyKey,
    )
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it("fails closed with a named provider when durable delivery is missing", async () => {
    const provider = toCustomerVerificationNotificationProvider({
      name: "legacy",
      channels: ["email"],
    } as unknown as NotificationProvider)

    await expect(
      provider.send({
        to: "shopper@example.com",
        channel: "email",
        template: "storefront-verification-email",
      }),
    ).rejects.toThrow(/"legacy" does not expose durable delivery/)
  })

  it("resolves no providers when the app configures no resolver", () => {
    const contribution = createNotificationsRuntimePortContribution({
      primitives: {
        env: () => ({}),
        database: { resolve: vi.fn(), fromContext: vi.fn(), transaction: vi.fn() },
        storage: { resolve: vi.fn(), read: vi.fn(), downloadUrl: vi.fn() },
        events: { deliver: vi.fn() },
        config: { read: () => undefined },
      },
      hasRuntimePort: () => false,
      getRuntimePort: async () => {
        throw new Error("unselected port must not be read")
      },
    } as never)
    const options = contribution[
      customerVerificationRuntimePort.id
    ] as CustomerVerificationRoutesOptions

    expect(options.resolveProviders?.({})).toEqual([])
  })
})
