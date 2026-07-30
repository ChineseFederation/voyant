import { createContainer, createEventBus } from "@voyant-travel/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildStorefrontVerificationSenderBundle,
  createStorefrontVerificationApiModule,
  createStorefrontVerificationSendersFromProviders,
  resolveStorefrontVerificationChannelCoverage,
  StorefrontVerificationError,
} from "../../../src/verification/index.js"

function emailOnlyProvider() {
  return {
    name: "voyant-cloud",
    channels: ["email"] as const,
    send: vi.fn(async () => ({ id: "ntf_1", provider: "voyant-cloud" })),
  }
}

async function bootstrap(options: Parameters<typeof createStorefrontVerificationApiModule>[0]) {
  const module = createStorefrontVerificationApiModule(options)
  await module.module.bootstrap?.({
    bindings: {},
    container: createContainer(),
    eventBus: createEventBus(),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("verification channel coverage (voyant#3948)", () => {
  it("reports sms as unsupported when only an email provider is configured", () => {
    expect(
      resolveStorefrontVerificationChannelCoverage({}, { providers: [emailOnlyProvider()] }),
    ).toEqual({ supported: ["email"], unsupported: ["sms"] })
  })

  it("counts an explicitly injected sender as coverage", () => {
    expect(
      resolveStorefrontVerificationChannelCoverage(
        {},
        { providers: [emailOnlyProvider()], sendSmsChallenge: async () => ({}) },
      ),
    ).toEqual({ supported: ["email", "sms"], unsupported: [] })
  })

  it("reports both channels unsupported when nothing is configured", () => {
    expect(resolveStorefrontVerificationChannelCoverage({}, {})).toEqual({
      supported: [],
      unsupported: ["email", "sms"],
    })
  })

  it("resolves providers from bindings", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const coverage = resolveStorefrontVerificationChannelCoverage(
      { DEPLOYMENT: "managed" },
      { resolveProviders },
    )
    expect(resolveProviders).toHaveBeenCalledWith({ DEPLOYMENT: "managed" })
    expect(coverage.unsupported).toEqual(["sms"])
  })

  it("resolves the app's provider set once for senders and coverage together", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const { senders, coverage } = buildStorefrontVerificationSenderBundle({}, { resolveProviders })

    expect(resolveProviders).toHaveBeenCalledOnce()
    expect(senders.sendEmailChallenge).toBeTypeOf("function")
    expect(coverage.unsupported).toEqual(["sms"])
  })

  it("never resolves providers when every channel has an injected sender", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const { coverage } = buildStorefrontVerificationSenderBundle(
      {},
      {
        resolveProviders,
        sendEmailChallenge: async () => ({}),
        sendSmsChallenge: async () => ({}),
      },
    )

    expect(resolveProviders).not.toHaveBeenCalled()
    expect(coverage).toEqual({ supported: ["email", "sms"], unsupported: [] })
  })

  it("warns at bootstrap naming the gap and what is deliverable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await bootstrap({ providers: [emailOnlyProvider()] })

    expect(warn).toHaveBeenCalledOnce()
    const message = warn.mock.calls[0]?.[0] as string
    expect(message).toContain("[storefront/verification]")
    expect(message).toContain('"sms"')
    expect(message).toContain("501 sender_not_configured")
    expect(message).toContain("Deliverable channels: email")
  })

  it("stays quiet at bootstrap when no channel resolves, so empty bindings do not cry wolf", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await bootstrap({ resolveProviders: () => [] })

    expect(warn).not.toHaveBeenCalled()
  })

  it("stays quiet at bootstrap when every channel is deliverable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await bootstrap({
      providers: [
        emailOnlyProvider(),
        { name: "sms-provider", channels: ["sms"], send: vi.fn(async () => ({ provider: "sms" })) },
      ],
    })

    expect(warn).not.toHaveBeenCalled()
  })
})

describe("sender_not_configured message (voyant#3948)", () => {
  it("names the channels that are covered", async () => {
    const senders = createStorefrontVerificationSendersFromProviders([emailOnlyProvider()])

    await expect(
      senders.sendSmsChallenge?.({
        phone: "+40700000000",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toThrow(
      'No verification notification provider registered for channel "sms". Registered providers cover: email.',
    )
  })

  it("says so plainly when no provider is registered at all", async () => {
    const senders = createStorefrontVerificationSendersFromProviders([])

    await expect(
      senders.sendEmailChallenge?.({
        email: "shopper@example.com",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toThrow(/No verification notification provider is registered/)
  })

  it("keeps the sender_not_configured code so the route still answers 501", async () => {
    const senders = createStorefrontVerificationSendersFromProviders([emailOnlyProvider()])

    await expect(
      senders.sendSmsChallenge?.({
        phone: "+40700000000",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "StorefrontVerificationError",
      code: "sender_not_configured",
    })
    await expect(
      senders.sendSmsChallenge?.({
        phone: "+40700000000",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(StorefrontVerificationError)
  })

  it("names the provider when an unknown one was requested explicitly", async () => {
    const senders = createStorefrontVerificationSendersFromProviders([emailOnlyProvider()], {
      email: { provider: "missing-provider" },
    })

    await expect(
      senders.sendEmailChallenge?.({
        email: "shopper@example.com",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toThrow(
      'No verification notification provider named "missing-provider" is registered',
    )
  })
})
