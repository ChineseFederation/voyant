import { createContainer, createEventBus } from "@voyant-travel/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildPublicApiVerificationSenderBundle,
  createPublicApiVerificationApiModule,
  createPublicApiVerificationSendersFromProviders,
  PublicApiVerificationError,
  resolvePublicApiVerificationChannelCoverage,
} from "../../../src/verification/index.js"

function emailOnlyProvider() {
  return {
    name: "voyant-cloud",
    channels: ["email"] as const,
    send: vi.fn(async () => ({ id: "ntf_1", provider: "voyant-cloud" })),
  }
}

async function bootstrap(options: Parameters<typeof createPublicApiVerificationApiModule>[0]) {
  const module = createPublicApiVerificationApiModule(options)
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
      resolvePublicApiVerificationChannelCoverage({}, { providers: [emailOnlyProvider()] }),
    ).toEqual({ supported: ["email"], unsupported: ["sms"] })
  })

  it("counts an explicitly injected sender as coverage", () => {
    expect(
      resolvePublicApiVerificationChannelCoverage(
        {},
        { providers: [emailOnlyProvider()], sendSmsChallenge: async () => ({}) },
      ),
    ).toEqual({ supported: ["email", "sms"], unsupported: [] })
  })

  it("reports both channels unsupported when nothing is configured", () => {
    expect(resolvePublicApiVerificationChannelCoverage({}, {})).toEqual({
      supported: [],
      unsupported: ["email", "sms"],
    })
  })

  it("resolves providers from bindings", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const coverage = resolvePublicApiVerificationChannelCoverage(
      { DEPLOYMENT: "managed" },
      { resolveProviders },
    )
    expect(resolveProviders).toHaveBeenCalledWith({ DEPLOYMENT: "managed" })
    expect(coverage.unsupported).toEqual(["sms"])
  })

  it("resolves the app's provider set once for senders and coverage together", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const { senders, coverage } = buildPublicApiVerificationSenderBundle({}, { resolveProviders })

    expect(resolveProviders).toHaveBeenCalledOnce()
    expect(senders.sendEmailChallenge).toBeTypeOf("function")
    expect(coverage.unsupported).toEqual(["sms"])
  })

  it("never resolves providers when every channel has an injected sender", () => {
    const resolveProviders = vi.fn(() => [emailOnlyProvider()])
    const { coverage } = buildPublicApiVerificationSenderBundle(
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
    const senders = createPublicApiVerificationSendersFromProviders([emailOnlyProvider()])

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
    const senders = createPublicApiVerificationSendersFromProviders([])

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
    const senders = createPublicApiVerificationSendersFromProviders([emailOnlyProvider()])

    await expect(
      senders.sendSmsChallenge?.({
        phone: "+40700000000",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "PublicApiVerificationError",
      code: "sender_not_configured",
    })
    await expect(
      senders.sendSmsChallenge?.({
        phone: "+40700000000",
        code: "123456",
        purpose: "booking_create",
        expiresAt: new Date("2026-01-01T00:10:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(PublicApiVerificationError)
  })

  it("names the provider when an unknown one was requested explicitly", async () => {
    const senders = createPublicApiVerificationSendersFromProviders([emailOnlyProvider()], {
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
