import { describe, expect, it, vi } from "vitest"

const settings = vi.hoisted(() => ({
  getOperatorPaymentDefaults: vi.fn(),
}))

vi.mock("@voyant-travel/operator-settings", () => ({
  getOperatorPaymentDefaults: settings.getOperatorPaymentDefaults,
  getOperatorPaymentInstructions: vi.fn(async () => null),
  getOperatorProfile: vi.fn(async () => null),
}))

import { createStandardPaymentLinkRouteOptions } from "../src/public-api-payment-link-runtime.js"

function context(defaultTemplate: string) {
  return {
    env: { PUBLIC_PAYMENT_LINK_URL_TEMPLATE: defaultTemplate },
    get: () => ({}),
  } as never
}

describe("managed payment-link template resolution", () => {
  it("reads and prefers the existing organization setting", async () => {
    settings.getOperatorPaymentDefaults.mockResolvedValue({
      invoicePayUrlTemplate: "https://brand.example/pay/{sessionId}",
    })
    const options = createStandardPaymentLinkRouteOptions()

    await expect(
      options.resolvePaymentLinkUrlTemplate?.(
        context("https://book.example/pay?session={sessionId}"),
      ),
    ).resolves.toBe("https://brand.example/pay/{sessionId}")
    expect(settings.getOperatorPaymentDefaults).toHaveBeenCalledOnce()
  })

  it("uses the Cloud default only when the organization setting is empty", async () => {
    settings.getOperatorPaymentDefaults.mockResolvedValue({
      invoicePayUrlTemplate: null,
    })
    const options = createStandardPaymentLinkRouteOptions()

    await expect(
      options.resolvePaymentLinkUrlTemplate?.(
        context("https://book.example/pay?session={sessionId}"),
      ),
    ).resolves.toBe("https://book.example/pay?session={sessionId}")
  })
})
