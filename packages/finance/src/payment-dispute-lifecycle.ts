/**
 * The dispute lifecycle, as a pure function of the two statuses (voyant#4289).
 *
 * Terminal statuses are absorbing. A processor that re-opens a contest issues a
 * new dispute with a new reference rather than reviving a resolved one, so an
 * out-of-order or replayed callback can never walk a resolved dispute
 * backwards.
 */

import {
  type PaymentDisputeResolution,
  type PaymentDisputeStatus,
  paymentDisputeResolution,
} from "@voyant-travel/payments"

const PAYMENT_DISPUTE_TRANSITIONS: Record<PaymentDisputeStatus, readonly PaymentDisputeStatus[]> = {
  opened: ["opened", "under_review", "won", "lost", "withdrawn"],
  under_review: ["under_review", "won", "lost", "withdrawn"],
  won: ["won"],
  lost: ["lost"],
  withdrawn: ["withdrawn"],
}

/** Whether a dispute in `from` may be advanced to `to`. Same-status is a no-op. */
export function canAdvancePaymentDispute(from: PaymentDisputeStatus, to: PaymentDisputeStatus) {
  return PAYMENT_DISPUTE_TRANSITIONS[from].includes(to)
}

/** The statuses that still hold money away from the operator. */
export const OPEN_PAYMENT_DISPUTE_STATUSES = ["opened", "under_review"] as const

export function isOpenPaymentDisputeStatus(status: PaymentDisputeStatus) {
  return (OPEN_PAYMENT_DISPUTE_STATUSES as readonly string[]).includes(status)
}

export type { PaymentDisputeResolution, PaymentDisputeStatus }
export { paymentDisputeResolution }
