import { describe, expect, it } from "vitest"
import {
  negotiatePaymentInstrumentStorage,
  type PaymentAdapterCapabilities,
  type PaymentStoredInstrument,
  paymentInstrumentAllows,
} from "./index.js"

const capabilities = (overrides: Partial<PaymentAdapterCapabilities>) =>
  ({
    hostedCheckout: true,
    redirectCheckout: true,
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

const instrument = (overrides: Partial<PaymentStoredInstrument> = {}): PaymentStoredInstrument => ({
  token: "instrument-1",
  authorizedReuses: ["merchant_initiated"],
  ...overrides,
})

describe("stored instrument reuse", () => {
  it("allows only the reuses that were authorized", () => {
    const stored = instrument()
    expect(paymentInstrumentAllows(stored, "merchant_initiated")).toBe(true)
    expect(paymentInstrumentAllows(stored, "shopper_reselect")).toBe(false)
  })

  it("treats an unstated status as usable", () => {
    expect(paymentInstrumentAllows(instrument(), "merchant_initiated")).toBe(true)
    expect(paymentInstrumentAllows(instrument({ status: "usable" }), "merchant_initiated")).toBe(
      true,
    )
  })

  // A reissued card keeps its authorization on paper and loses it in fact: the
  // agreement the shopper gave covered the instrument that was replaced.
  it("refuses every reuse once the agreement no longer covers the instrument", () => {
    const reissued = instrument({
      authorizedReuses: ["merchant_initiated", "shopper_reselect"],
      status: "requires_new_agreement",
    })
    expect(paymentInstrumentAllows(reissued, "merchant_initiated")).toBe(false)
    expect(paymentInstrumentAllows(reissued, "shopper_reselect")).toBe(false)
  })

  it("refuses expired and revoked instruments", () => {
    expect(paymentInstrumentAllows(instrument({ status: "expired" }), "merchant_initiated")).toBe(
      false,
    )
    expect(paymentInstrumentAllows(instrument({ status: "revoked" }), "merchant_initiated")).toBe(
      false,
    )
  })

  it("allows nothing when an instrument was stored with no authorized reuse", () => {
    const recordsOnly = instrument({ authorizedReuses: [] })
    expect(paymentInstrumentAllows(recordsOnly, "merchant_initiated")).toBe(false)
    expect(paymentInstrumentAllows(recordsOnly, "shopper_reselect")).toBe(false)
  })
})

describe("instrument storage negotiation", () => {
  it("stores nothing when the caller asked for nothing", () => {
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: true }), {}),
    ).toBeNull()
  })

  it("stores nothing when the adapter cannot store instruments", () => {
    expect(
      negotiatePaymentInstrumentStorage(capabilities({}), {
        storeInstrument: { merchantInitiated: true },
      }),
    ).toBeNull()
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: false }), {
        storeInstrument: { merchantInitiated: true },
      }),
    ).toBeNull()
  })

  // Keeping an instrument that authorizes nothing and may not be offered is a
  // liability with no use, so it collapses to the same answer as "don't".
  it("stores nothing when the intent authorizes no reuse and permits no ask", () => {
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: true }), {
        storeInstrument: { merchantInitiated: false },
      }),
    ).toBeNull()
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: true }), {
        storeInstrument: { merchantInitiated: false, offerShopperReselect: false },
      }),
    ).toBeNull()
  })

  it("carries an intent authorized by terms alone", () => {
    const intent = { merchantInitiated: true, agreementReference: "terms-v3:accepted" }
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: true }), {
        storeInstrument: intent,
      }),
    ).toEqual(intent)
  })

  // Permission to ask is enough on its own: the shopper may consent to being
  // shown the card again even where no terms authorize charging it away.
  it("carries an intent that only permits asking the shopper", () => {
    const intent = { merchantInitiated: false, offerShopperReselect: true }
    expect(
      negotiatePaymentInstrumentStorage(capabilities({ storeInstrument: true }), {
        storeInstrument: intent,
      }),
    ).toEqual(intent)
  })
})
