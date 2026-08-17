import type { PaymentHostedCheckout } from "@voyant-travel/payments"
import { describe, expect, it } from "vitest"
import { reusableStoredHandoff } from "../../src/payment-link-routes.js"

const embedded: PaymentHostedCheckout = {
  kind: "embedded",
  clientSecret: "seti_secret_1",
  publishableKey: "pk_test_1",
}
const hosted: PaymentHostedCheckout = {
  kind: "hosted_checkout",
  url: "https://pay.example/checkout",
}

function session(overrides: Partial<Parameters<typeof reusableStoredHandoff>[0]> = {}) {
  return {
    status: "requires_redirect",
    redirectUrl: null,
    checkout: null,
    ...overrides,
  }
}

describe("reusableStoredHandoff", () => {
  it("reuses a stored redirect rather than starting a second payment", () => {
    expect(
      reusableStoredHandoff(
        session({ redirectUrl: "https://pay.example/checkout", checkout: hosted }),
        ["redirect"],
      ),
    ).toEqual({ redirectUrl: "https://pay.example/checkout", checkout: hosted })
  })

  it("reuses a stored embedded handoff for a page that can mount one", () => {
    expect(
      reusableStoredHandoff(session({ checkout: embedded }), ["embedded", "redirect"]),
    ).toEqual({ redirectUrl: null, checkout: embedded })
  })

  it("does not hand a stored embedded handoff to a redirect-only caller", () => {
    // Returning it would strand them: there is no URL on that arm, so the page
    // would have nowhere to send the payer. Falling through starts fresh.
    expect(reusableStoredHandoff(session({ checkout: embedded }), ["redirect"])).toBeNull()
  })

  it("falls through when a session in a continuation status stored no handoff", () => {
    expect(reusableStoredHandoff(session(), ["redirect"])).toBeNull()
  })

  it("never reuses a handoff from a session that is not continuable", () => {
    for (const status of ["pending", "failed", "cancelled", "expired"]) {
      expect(
        reusableStoredHandoff(
          session({ status, redirectUrl: "https://pay.example/checkout", checkout: hosted }),
          ["redirect"],
        ),
      ).toBeNull()
    }
  })
})
