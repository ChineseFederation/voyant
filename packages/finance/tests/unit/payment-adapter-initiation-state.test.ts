import type { PaymentInitiationResult } from "@voyant-travel/payments"
import { describe, expect, it } from "vitest"

import { initiationNextState } from "../../src/payment-adapter-events.js"

/**
 * `requires_redirect` asserts there is somewhere to send the shopper. The
 * embedded arm has nowhere — `redirectUrl` is null for it — so an adapter that
 * reports both leaves the row self-contradictory and every reader keyed on that
 * state waiting for a return trip nobody was sent on. The framework owns
 * `PaymentSessionState`, so the framework settles it (voyant#4346).
 */
describe("initiation state for a negotiated checkout handoff", () => {
  it("records an embedded handoff as pending, not requires_redirect", () => {
    expect(
      initiationNextState(
        result({
          nextState: "requires_redirect",
          checkout: {
            kind: "embedded",
            clientSecret: "cs_test_secret",
            publishableKey: "pk_test_key",
          },
        }),
      ),
    ).toBe("pending")
  })

  it("leaves a redirect handoff alone", () => {
    expect(
      initiationNextState(
        result({
          nextState: "requires_redirect",
          checkout: { kind: "redirect", url: "https://pay.example.test/session" },
        }),
      ),
    ).toBe("requires_redirect")
    expect(
      initiationNextState(
        result({
          nextState: "requires_redirect",
          checkout: { kind: "hosted_checkout", url: "https://pay.example.test/session" },
        }),
      ),
    ).toBe("requires_redirect")
  })

  it("leaves requires_redirect alone when no handoff was produced", () => {
    // Nothing to contradict. A processor that means "go somewhere" and has not
    // said where yet is a separate problem, and not one to paper over here.
    expect(initiationNextState(result({ nextState: "requires_redirect", checkout: null }))).toBe(
      "requires_redirect",
    )
  })

  it("never rewrites a state that is not requires_redirect", () => {
    for (const nextState of ["pending", "processing", "authorized", "paid"] as const) {
      expect(
        initiationNextState(
          result({
            nextState,
            checkout: {
              kind: "embedded",
              clientSecret: "cs_test_secret",
              publishableKey: "pk_test_key",
            },
          }),
        ),
      ).toBe(nextState)
    }
  })
})

function result(
  input: Pick<PaymentInitiationResult, "nextState" | "checkout">,
): PaymentInitiationResult {
  return {
    nextState: input.nextState,
    checkout: input.checkout,
    idempotencyKey: "init-1",
    processorIdentity: { providerId: "fake-pay", connectionId: "connection-1" },
  }
}
