import { describe, expect, it } from "vitest"

import {
  promotionCodeStatusMessage,
  resolveManualBookingPromotionState,
} from "../../src/components/manual-booking-create-form.js"
import { bookingsUiEn } from "../../src/i18n/en.js"

const copy = bookingsUiEn.manualBookingCreate.promotion

function state(overrides: Partial<Parameters<typeof resolveManualBookingPromotionState>[0]> = {}) {
  return resolveManualBookingPromotionState({
    promotionCode: "GREEK15",
    isSettling: false,
    hasError: false,
    hasPricing: true,
    status: { kind: "code_valid" },
    ...overrides,
  })
}

describe("resolveManualBookingPromotionState", () => {
  it("lets a valid code through instead of blocking every code", () => {
    // voyant#4615: `submitBlocked` included a bare `hasPromotionCode`, so
    // Create booking was dead for any non-empty code and the form offered an
    // input whose only outcome was a blocked submit.
    expect(state()).toEqual({ hasCode: true, rejected: false, ready: true })
  })

  it("blocks a code the quote rejected", () => {
    expect(state({ status: { kind: "code_expired" } })).toEqual({
      hasCode: true,
      rejected: true,
      ready: false,
    })
  })

  it("does not blame the code while the quote is still settling", () => {
    expect(state({ isSettling: true, hasPricing: false, status: null })).toEqual({
      hasCode: true,
      rejected: false,
      ready: false,
    })
  })

  it("does not blame the code for a quote that could not be priced", () => {
    // The old form read `available === false` as "invalid promotion code",
    // which is what made a departure with 13 places left report the operator's
    // code as invalid. An unpriceable quote is not the code's fault.
    expect(state({ hasPricing: false, status: null })).toEqual({
      hasCode: true,
      rejected: false,
      ready: false,
    })
  })

  it("is ready with no code at all, whatever the quote says", () => {
    expect(
      state({ promotionCode: "   ", hasPricing: false, hasError: true, status: null }),
    ).toEqual({ hasCode: false, rejected: false, ready: true })
  })
})

describe("promotionCodeStatusMessage", () => {
  it("names what is wrong with the code", () => {
    expect(promotionCodeStatusMessage({ kind: "code_not_found" }, copy)).toBe(copy.notFound)
    expect(promotionCodeStatusMessage({ kind: "code_expired" }, copy)).toBe(copy.expired)
    expect(promotionCodeStatusMessage({ kind: "code_not_yet_valid" }, copy)).toBe(copy.notYetValid)
    expect(promotionCodeStatusMessage({ kind: "code_not_applicable", reason: "scope" }, copy)).toBe(
      copy.notApplicable,
    )
  })

  it("falls back to the generic string for a status this build does not know", () => {
    expect(
      promotionCodeStatusMessage(
        { kind: "code_valid" } as Parameters<typeof promotionCodeStatusMessage>[0],
        copy,
      ),
    ).toBe(copy.invalid)
  })
})
