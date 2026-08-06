"use client"

import type { RefundSettlementRecord } from "../../schemas.js"

export type RefundSettlementMethod = RefundSettlementRecord["method"]
export type RefundSettlementStatus = RefundSettlementRecord["status"]

/** The only method that goes through the payment adapter (voyant#4303). */
export function isAdapterBackedMethod(method: RefundSettlementMethod) {
  return method === "processor_reversal"
}

export function isInstrumentMethod(method: RefundSettlementMethod) {
  return method === "travel_credit" || method === "voucher"
}

/**
 * Sum by currency. Mixing currencies in one total would be a lie, so every
 * caller renders one figure per currency rather than adding them up.
 */
export function totalByCurrency(
  settlements: readonly RefundSettlementRecord[],
  predicate: (settlement: RefundSettlementRecord) => boolean,
) {
  const totals: Record<string, number> = {}
  for (const settlement of settlements) {
    if (!predicate(settlement)) continue
    totals[settlement.currency] = (totals[settlement.currency] ?? 0) + settlement.amountCents
  }
  return totals
}

export function isOwed(settlement: RefundSettlementRecord) {
  return settlement.status === "pending"
}

export function isPaidBack(settlement: RefundSettlementRecord) {
  return settlement.status === "settled"
}
