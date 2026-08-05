import { describe, expect, it } from "vitest"
import {
  acceptedPaymentCheckoutHandoffs,
  isEmbeddedPaymentCheckout,
  isRedirectPaymentCheckout,
  negotiatePaymentCheckoutHandoff,
  type PaymentAdapterCapabilities,
  type PaymentEmbeddedCheckout,
  type PaymentRedirectCheckout,
  paymentCheckoutHandoff,
  paymentCheckoutRedirectUrl,
  supportedPaymentCheckoutHandoffs,
} from "./index.js"

const redirect: PaymentRedirectCheckout = {
  kind: "redirect",
  url: "https://payments.example/continue",
}
const hosted: PaymentRedirectCheckout = {
  kind: "hosted_checkout",
  url: "https://payments.example/checkout",
}
const embedded: PaymentEmbeddedCheckout = {
  kind: "embedded",
  clientSecret: "session-secret-1",
  publishableKey: "pk-test-1",
}

const capabilities = (overrides: Partial<PaymentAdapterCapabilities>) =>
  ({
    hostedCheckout: false,
    redirectCheckout: false,
    authorize: false,
    capture: false,
    void: false,
    refund: false,
    status: false,
    callbackSignatureVerification: true,
    idempotencyKeys: true,
    retrySafeInitiation: true,
    ...overrides,
  }) satisfies PaymentAdapterCapabilities

describe("checkout handoff arms", () => {
  it("narrows both redirect kinds and the embedded kind", () => {
    expect(isRedirectPaymentCheckout(redirect)).toBe(true)
    expect(isRedirectPaymentCheckout(hosted)).toBe(true)
    expect(isRedirectPaymentCheckout(embedded)).toBe(false)
    expect(isEmbeddedPaymentCheckout(embedded)).toBe(true)
  })

  it("collapses both redirect kinds into the redirect handoff", () => {
    expect(paymentCheckoutHandoff(redirect)).toBe("redirect")
    expect(paymentCheckoutHandoff(hosted)).toBe("redirect")
    expect(paymentCheckoutHandoff(embedded)).toBe("embedded")
  })

  it("yields a url only for an arm that has one", () => {
    expect(paymentCheckoutRedirectUrl(hosted)).toBe("https://payments.example/checkout")
    expect(paymentCheckoutRedirectUrl(embedded)).toBeNull()
    expect(paymentCheckoutRedirectUrl(null)).toBeNull()
    expect(paymentCheckoutRedirectUrl(undefined)).toBeNull()
  })
})

describe("checkout handoff negotiation", () => {
  it("defaults an unstated caller to redirect only", () => {
    expect(acceptedPaymentCheckoutHandoffs({})).toEqual(["redirect"])
    expect(acceptedPaymentCheckoutHandoffs({ acceptedCheckoutHandoffs: [] })).toEqual(["redirect"])
  })

  it("preserves caller preference order and drops repeats", () => {
    expect(
      acceptedPaymentCheckoutHandoffs({
        acceptedCheckoutHandoffs: ["embedded", "redirect", "embedded"],
      }),
    ).toEqual(["embedded", "redirect"])
  })

  it("reads the arms an adapter's capabilities can produce", () => {
    expect(supportedPaymentCheckoutHandoffs(capabilities({ redirectCheckout: true }))).toEqual([
      "redirect",
    ])
    expect(supportedPaymentCheckoutHandoffs(capabilities({ hostedCheckout: true }))).toEqual([
      "redirect",
    ])
    expect(
      supportedPaymentCheckoutHandoffs(
        capabilities({ hostedCheckout: true, embeddedCheckout: true }),
      ),
    ).toEqual(["redirect", "embedded"])
    expect(supportedPaymentCheckoutHandoffs(capabilities({}))).toEqual([])
  })

  it("serves the caller's first preference the adapter supports", () => {
    const both = capabilities({ hostedCheckout: true, embeddedCheckout: true })

    expect(
      negotiatePaymentCheckoutHandoff(both, { acceptedCheckoutHandoffs: ["embedded", "redirect"] }),
    ).toBe("embedded")
    expect(negotiatePaymentCheckoutHandoff(both, {})).toBe("redirect")
  })

  it("downgrades to redirect for a caller that cannot mount a form", () => {
    const both = capabilities({ hostedCheckout: true, embeddedCheckout: true })

    expect(negotiatePaymentCheckoutHandoff(both, { acceptedCheckoutHandoffs: ["redirect"] })).toBe(
      "redirect",
    )
  })

  it("returns null when caller and adapter cannot agree", () => {
    expect(
      negotiatePaymentCheckoutHandoff(capabilities({ redirectCheckout: true }), {
        acceptedCheckoutHandoffs: ["embedded"],
      }),
    ).toBeNull()
    expect(negotiatePaymentCheckoutHandoff(capabilities({}), {})).toBeNull()
  })
})
