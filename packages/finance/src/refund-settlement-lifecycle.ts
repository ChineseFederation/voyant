/**
 * The refund settlement lifecycle, as a pure function of the two statuses
 * (voyant#4303).
 *
 * Terminal statuses are absorbing. A refund that failed and is then attempted
 * again is a *new* settlement with its own amount and its own reference — not a
 * revival of the row that failed — so a replayed or out-of-order processor
 * callback can never walk a settled refund backwards, and never resurrects the
 * amount a failed one released.
 */

export const REFUND_SETTLEMENT_STATUSES = ["pending", "settled", "failed"] as const
export type RefundSettlementStatus = (typeof REFUND_SETTLEMENT_STATUSES)[number]

export const REFUND_SETTLEMENT_METHODS = [
  "processor_reversal",
  "bank_transfer",
  "cash",
  "cheque",
  "travel_credit",
  "voucher",
  "counterparty_offset",
  "other",
] as const
export type RefundSettlementMethod = (typeof REFUND_SETTLEMENT_METHODS)[number]

const REFUND_SETTLEMENT_TRANSITIONS: Record<
  RefundSettlementStatus,
  readonly RefundSettlementStatus[]
> = {
  pending: ["pending", "settled", "failed"],
  settled: ["settled"],
  failed: ["failed"],
}

/** Whether a settlement in `from` may be advanced to `to`. Same-status is a no-op. */
export function canAdvanceRefundSettlement(
  from: RefundSettlementStatus,
  to: RefundSettlementStatus,
) {
  return REFUND_SETTLEMENT_TRANSITIONS[from].includes(to)
}

/**
 * The statuses whose amount is still committed to the customer.
 *
 * This is the invariant the whole record exists to hold. `pending` counts:
 * a processor refund that came back indeterminate — a timeout on a refund the
 * processor may well have accepted — must keep its amount held, or a retry
 * returns the same money twice. That is the one error here that trying again
 * cannot undo, so the refundable remainder is deliberately pessimistic and only
 * `failed` gives an amount back.
 */
export const HELD_REFUND_SETTLEMENT_STATUSES = ["pending", "settled"] as const

export function holdsRefundedFunds(status: RefundSettlementStatus) {
  return (HELD_REFUND_SETTLEMENT_STATUSES as readonly string[]).includes(status)
}

/** A refund that is owed and has not been paid yet. */
export function isOwedRefundSettlement(status: RefundSettlementStatus) {
  return status === "pending"
}

/**
 * The methods that go back through the payment adapter.
 *
 * Every other method is money the operator moves itself, and no adapter is
 * consulted for any of them — which is the point of the record: a self-hosted
 * deployment with no card processor at all can still say a refund was paid.
 */
export function isAdapterBackedRefundMethod(method: RefundSettlementMethod) {
  return method === "processor_reversal"
}

/**
 * Whether a method settles by handing over an instrument rather than money.
 *
 * Both are travel-credit rows; they differ in who may spend them. A
 * `travel_credit` is bound to the person refunded, a `voucher` is transferable
 * and may be worth more than the cash it replaces.
 */
export function isInstrumentRefundMethod(method: RefundSettlementMethod) {
  return method === "travel_credit" || method === "voucher"
}
