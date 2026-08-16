import { describe, expect, it, vi } from "vitest"
import {
  createPublicApiVerificationSendersFromProviders,
  type PublicApiVerificationNotificationProvider,
} from "../../../src/verification/service.js"

function fakeProvider(name: string, channels: string[]): PublicApiVerificationNotificationProvider {
  return {
    name,
    channels,
    send: vi.fn(async () => ({ id: `${name}_1`, provider: name })),
  }
}

describe("createPublicApiVerificationSendersFromProviders", () => {
  it("routes email and sms challenges through matching providers", async () => {
    const email = fakeProvider("resend", ["email"])
    const sms = fakeProvider("twilio", ["sms"])
    const senders = createPublicApiVerificationSendersFromProviders([email, sms], {
      email: { template: "verify-email", subject: "Verify your email" },
      sms: { template: "verify-sms" },
    })

    await senders.sendEmailChallenge?.({
      email: "traveler@example.com",
      code: "123456",
      purpose: "contact_confirmation",
      expiresAt: new Date("2026-04-13T10:00:00.000Z"),
      metadata: null,
    })
    await senders.sendSmsChallenge?.({
      phone: "+40123456789",
      code: "654321",
      purpose: "contact_confirmation",
      expiresAt: new Date("2026-04-13T10:00:00.000Z"),
      metadata: null,
    })

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        template: "verify-email",
        subject: "Verify your email",
        to: "traveler@example.com",
      }),
    )
    expect(sms.send).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "sms",
        template: "verify-sms",
        to: "+40123456789",
      }),
    )
  })
})
