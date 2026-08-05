import { PAYMENT_DISPUTE_STATUSES, paymentDisputeResolution } from "@voyant-travel/payments"
import { describe, expect, it } from "vitest"

import {
  canAdvancePaymentDispute,
  isOpenPaymentDisputeStatus,
} from "../../src/payment-dispute-lifecycle.js"

describe("payment dispute lifecycle", () => {
  it("lets an opened dispute reach every other status", () => {
    for (const status of PAYMENT_DISPUTE_STATUSES) {
      expect(canAdvancePaymentDispute("opened", status)).toBe(true)
    }
  })

  it("does not walk a dispute back from review to opened", () => {
    expect(canAdvancePaymentDispute("under_review", "opened")).toBe(false)
    expect(canAdvancePaymentDispute("under_review", "under_review")).toBe(true)
    expect(canAdvancePaymentDispute("under_review", "lost")).toBe(true)
  })

  it("treats a resolution as absorbing", () => {
    for (const resolved of ["won", "lost", "withdrawn"] as const) {
      for (const status of PAYMENT_DISPUTE_STATUSES) {
        expect(canAdvancePaymentDispute(resolved, status)).toBe(status === resolved)
      }
    }
  })

  it("names the resolution of a terminal status and nothing else", () => {
    expect(paymentDisputeResolution("opened")).toBeNull()
    expect(paymentDisputeResolution("under_review")).toBeNull()
    expect(paymentDisputeResolution("won")).toBe("won")
    expect(paymentDisputeResolution("lost")).toBe("lost")
    expect(paymentDisputeResolution("withdrawn")).toBe("withdrawn")
  })

  it("counts only unresolved statuses as still holding money", () => {
    expect(isOpenPaymentDisputeStatus("opened")).toBe(true)
    expect(isOpenPaymentDisputeStatus("under_review")).toBe(true)
    expect(isOpenPaymentDisputeStatus("won")).toBe(false)
    expect(isOpenPaymentDisputeStatus("lost")).toBe(false)
    expect(isOpenPaymentDisputeStatus("withdrawn")).toBe(false)
  })
})
