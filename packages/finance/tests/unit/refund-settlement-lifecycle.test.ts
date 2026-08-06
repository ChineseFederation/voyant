import { describe, expect, it } from "vitest"

import {
  canAdvanceRefundSettlement,
  HELD_REFUND_SETTLEMENT_STATUSES,
  holdsRefundedFunds,
  isAdapterBackedRefundMethod,
  isInstrumentRefundMethod,
  isOwedRefundSettlement,
  REFUND_SETTLEMENT_METHODS,
  REFUND_SETTLEMENT_STATUSES,
} from "../../src/refund-settlement-lifecycle.js"

describe("refund settlement lifecycle", () => {
  it("lets a pending settlement reach every status", () => {
    for (const status of REFUND_SETTLEMENT_STATUSES) {
      expect(canAdvanceRefundSettlement("pending", status)).toBe(true)
    }
  })

  it("treats settled and failed as absorbing", () => {
    for (const terminal of ["settled", "failed"] as const) {
      for (const status of REFUND_SETTLEMENT_STATUSES) {
        expect(canAdvanceRefundSettlement(terminal, status)).toBe(status === terminal)
      }
    }
  })

  it("holds the amount for everything except a positive failure", () => {
    expect(holdsRefundedFunds("pending")).toBe(true)
    expect(holdsRefundedFunds("settled")).toBe(true)
    expect(holdsRefundedFunds("failed")).toBe(false)
    expect([...HELD_REFUND_SETTLEMENT_STATUSES]).toEqual(["pending", "settled"])
  })

  it("counts only pending as still owed", () => {
    expect(isOwedRefundSettlement("pending")).toBe(true)
    expect(isOwedRefundSettlement("settled")).toBe(false)
    expect(isOwedRefundSettlement("failed")).toBe(false)
  })

  it("routes only a processor reversal through the adapter", () => {
    for (const method of REFUND_SETTLEMENT_METHODS) {
      expect(isAdapterBackedRefundMethod(method)).toBe(method === "processor_reversal")
    }
  })

  it("keeps credit and voucher as separate instrument methods", () => {
    expect(isInstrumentRefundMethod("travel_credit")).toBe(true)
    expect(isInstrumentRefundMethod("voucher")).toBe(true)
    // A voucher is transferable and a travel credit is not, so they are two
    // values rather than one with a flag — and neither is a card.
    expect(REFUND_SETTLEMENT_METHODS).toContain("travel_credit")
    expect(REFUND_SETTLEMENT_METHODS).toContain("voucher")
    expect(isInstrumentRefundMethod("cash")).toBe(false)
    expect(isInstrumentRefundMethod("counterparty_offset")).toBe(false)
  })
})
