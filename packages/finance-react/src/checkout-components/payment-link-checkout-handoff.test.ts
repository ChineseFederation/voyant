import { describe, expect, it } from "vitest"
import {
  acceptedCheckoutHandoffsForPage,
  resolveStartCardOutcome,
} from "./payment-link-landing-page.js"

const embedded = {
  kind: "embedded",
  clientSecret: "seti_secret_1",
  publishableKey: "pk_test_1",
} as const

describe("acceptedCheckoutHandoffsForPage", () => {
  it("asks for the embedded arm only when the page can mount a form", () => {
    expect(acceptedCheckoutHandoffsForPage(true)).toEqual(["embedded", "redirect"])
  })

  it("sends nothing at all when it cannot, so the server reads redirect-only", () => {
    // Not `[]` — an absent field is what every client built before in-page
    // checkout sends, and the server's default has to keep matching it.
    expect(acceptedCheckoutHandoffsForPage(false)).toBeUndefined()
  })
})

describe("resolveStartCardOutcome", () => {
  it("mounts the form when an embedded arm comes back to a capable page", () => {
    expect(resolveStartCardOutcome({ redirectUrl: null, checkout: embedded }, true)).toEqual({
      kind: "embedded",
      checkout: embedded,
    })
  })

  it("ignores an embedded arm a page cannot render", () => {
    // The server should not have sent one. If it does anyway, the page must not
    // pretend it can mount it.
    expect(
      resolveStartCardOutcome(
        { redirectUrl: "https://pay.example/continue", checkout: embedded },
        false,
      ),
    ).toEqual({ kind: "redirect", url: "https://pay.example/continue" })
  })

  it("errors rather than stranding the payer when the only arm is unusable", () => {
    expect(resolveStartCardOutcome({ redirectUrl: null, checkout: embedded }, false)).toEqual({
      kind: "error",
    })
  })

  it("redirects when the processor chose the redirect arm", () => {
    expect(
      resolveStartCardOutcome(
        {
          redirectUrl: "https://pay.example/checkout",
          checkout: { kind: "hosted_checkout", url: "https://pay.example/checkout" },
        },
        true,
      ),
    ).toEqual({ kind: "redirect", url: "https://pay.example/checkout" })
  })

  it("errors on an empty response body", () => {
    expect(resolveStartCardOutcome(undefined, true)).toEqual({ kind: "error" })
    expect(resolveStartCardOutcome({ redirectUrl: null }, true)).toEqual({ kind: "error" })
  })
})
