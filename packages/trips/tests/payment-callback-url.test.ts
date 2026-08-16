import { describe, expect, it } from "vitest"

import { resolvePaymentCallbackUrl } from "../src/public-api-payment-link-runtime.js"

describe("payment callback URL", () => {
  it("uses the dedicated callback origin", () => {
    expect(
      resolvePaymentCallbackUrl({
        PAYMENT_CALLBACK_BASE_URL: " https://operator.example.com/ ",
        PUBLIC_CHECKOUT_BASE_URL: "https://www.example.com/pay",
      }),
    ).toBe("https://operator.example.com/api/v1/public/payment-link/callback")
  })

  it("temporarily falls back to the operator dashboard or API origin", () => {
    expect(resolvePaymentCallbackUrl({ DASH_BASE_URL: "http://localhost:3300" })).toBe(
      "http://localhost:3300/api/v1/public/payment-link/callback",
    )
    expect(resolvePaymentCallbackUrl({ APP_URL: "https://operator.example.com/api" })).toBe(
      "https://operator.example.com/api/v1/public/payment-link/callback",
    )
  })

  it("never treats the customer-facing checkout URL as a callback origin", () => {
    expect(
      resolvePaymentCallbackUrl({ PUBLIC_CHECKOUT_BASE_URL: "https://www.example.com/pay" }),
    ).toBeUndefined()
  })

  it.each([
    "operator.example.com",
    "ftp://operator.example.com",
    "https://user:password@operator.example.com",
    "https://operator.example.com/pay",
    "https://operator.example.com?tenant=one",
    "https://operator.example.com#callback",
  ])("rejects a callback base that is not an HTTP(S) origin: %s", (value) => {
    expect(() => resolvePaymentCallbackUrl({ PAYMENT_CALLBACK_BASE_URL: value })).toThrow(
      /PAYMENT_CALLBACK_BASE_URL must be an absolute HTTP\(S\) origin/,
    )
  })
})
