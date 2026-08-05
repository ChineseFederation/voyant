/**
 * Action-ledger entries for card disputes (voyant#4289).
 *
 * A chargeback moves money and changes what a booking is worth, so it is
 * ledgered like every other finance mutation. The target is the booking where
 * there is one — that is where an operator goes looking — and the dispute
 * itself otherwise.
 */

import type {
  ActionLedgerRequestContextValues,
  BuildActionLedgerMutationInput,
} from "@voyant-travel/action-ledger"

import type { paymentDisputes } from "./schema.js"
import type { UpdatePaymentDisputeInput } from "./validation.js"

type PaymentDisputeRecord = typeof paymentDisputes.$inferSelect

function disputeTarget(dispute: PaymentDisputeRecord) {
  if (dispute.bookingId) return { type: "booking", id: dispute.bookingId }
  return { type: "payment_dispute", id: dispute.id }
}

export function buildPaymentDisputeRecordActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: { dispute: PaymentDisputeRecord; opened: boolean },
  options: { authorizationSource?: string | null } = {},
): BuildActionLedgerMutationInput {
  const target = disputeTarget(input.dispute)
  const actionName = input.opened
    ? "finance.payment_dispute.open"
    : "finance.payment_dispute.report"

  return {
    context,
    actionName,
    actionVersion: "v1",
    actionKind: input.opened ? "create" : "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: actionName,
    authorizationSource: options.authorizationSource ?? "finance.payment_dispute.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `payment_session:${input.dispute.paymentSessionId}:dispute`,
      commandResultRef: `payment_dispute:${input.dispute.id}`,
      summary: `${input.opened ? "Dispute opened" : "Dispute reported"} on payment session ${
        input.dispute.paymentSessionId
      } for ${input.dispute.amountCents} ${input.dispute.currency} (${input.dispute.status})`,
      reversalKind: "none",
    },
  }
}

export function buildPaymentDisputeUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: { dispute: PaymentDisputeRecord; changes: UpdatePaymentDisputeInput },
  options: { authorizationSource?: string | null } = {},
): BuildActionLedgerMutationInput {
  const target = disputeTarget(input.dispute)
  const changedFields = Object.keys(input.changes).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.payment_dispute.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.payment_dispute.update",
    authorizationSource: options.authorizationSource ?? "finance.payment_dispute.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `payment_dispute:${input.dispute.id}:update`,
      commandResultRef: `payment_dispute:${input.dispute.id}`,
      summary: `Payment dispute ${input.dispute.id} updated (${changeSummary}) — now ${input.dispute.status}`,
      reversalKind: "none",
    },
  }
}
