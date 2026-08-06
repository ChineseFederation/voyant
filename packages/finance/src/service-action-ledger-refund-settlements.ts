/**
 * Action-ledger entries for the money leg of a refund (voyant#4303).
 *
 * Paying a customer back moves real money, so it is ledgered like every other
 * finance mutation. The target is the booking where there is one — that is where
 * an operator goes looking — and the settlement itself otherwise.
 */

import type {
  ActionLedgerRequestContextValues,
  BuildActionLedgerMutationInput,
} from "@voyant-travel/action-ledger"

import type { refundSettlements } from "./schema.js"
import type { UpdateRefundSettlementInput } from "./validation.js"

type RefundSettlementRow = typeof refundSettlements.$inferSelect

function settlementTarget(settlement: RefundSettlementRow) {
  if (settlement.bookingId) return { type: "booking", id: settlement.bookingId }
  return { type: "refund_settlement", id: settlement.id }
}

function reversedRef(settlement: RefundSettlementRow) {
  if (settlement.creditNoteId) return `credit_note:${settlement.creditNoteId}`
  if (settlement.paymentId) return `payment:${settlement.paymentId}`
  return `refund_settlement:${settlement.id}`
}

export function buildRefundSettlementRecordActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: { settlement: RefundSettlementRow; replayed: boolean },
  options: {
    authorizationSource?: string | null
    actionName?: string | null
    routeOrToolName?: string | null
    targetType?: string | null
    targetId?: string | null
    capabilityId?: string | null
    capabilityVersion?: string | null
    evaluatedRisk?: BuildActionLedgerMutationInput["evaluatedRisk"] | null
    causationActionId?: string | null
    approvalId?: string | null
    idempotencyScope?: string | null
    idempotencyKey?: string | null
    idempotencyFingerprint?: string | null
  } = {},
): BuildActionLedgerMutationInput {
  const target = settlementTarget(input.settlement)
  const actionName = options.actionName ?? "finance.refund_settlement.record"

  return {
    context,
    actionName,
    actionVersion: options.capabilityVersion ?? "v1",
    actionKind: "create",
    status: "succeeded",
    // `critical`, matching `finance:refund`: this is the entry that says money
    // left the operator's account, and it is not reversible by writing another.
    evaluatedRisk: options.evaluatedRisk ?? "critical",
    targetType: options.targetType ?? target.type,
    targetId: options.targetId ?? target.id,
    routeOrToolName: options.routeOrToolName ?? actionName,
    capabilityId: options.capabilityId ?? null,
    capabilityVersion: options.capabilityVersion ?? null,
    causationActionId: options.causationActionId ?? null,
    approvalId: options.approvalId ?? input.settlement.approvalId ?? null,
    authorizationSource: options.authorizationSource ?? "finance.refund_settlement.route",
    idempotencyScope:
      options.idempotencyScope ??
      (input.settlement.paymentId ? `${actionName}:${input.settlement.paymentId}` : null),
    idempotencyKey: options.idempotencyKey ?? input.settlement.idempotencyKey ?? null,
    idempotencyFingerprint: options.idempotencyFingerprint ?? null,
    mutationDetail: {
      commandInputRef: `${reversedRef(input.settlement)}:refund_settlement`,
      commandResultRef: `refund_settlement:${input.settlement.id}`,
      summary: `${input.replayed ? "Refund settlement replayed" : "Refund settled"} by ${
        input.settlement.method
      } for ${input.settlement.amountCents} ${input.settlement.currency} (${
        input.settlement.status
      })`,
      reversalKind: "none",
    },
  }
}

export function buildRefundSettlementUpdateActionLedgerInput(
  context: ActionLedgerRequestContextValues,
  input: { settlement: RefundSettlementRow; changes: UpdateRefundSettlementInput },
  options: { authorizationSource?: string | null } = {},
): BuildActionLedgerMutationInput {
  const target = settlementTarget(input.settlement)
  const changedFields = Object.keys(input.changes).sort()
  const changeSummary = changedFields.length > 0 ? changedFields.join(", ") : "no fields"

  return {
    context,
    actionName: "finance.refund_settlement.update",
    actionVersion: "v1",
    actionKind: "update",
    status: "succeeded",
    evaluatedRisk: "high",
    targetType: target.type,
    targetId: target.id,
    routeOrToolName: "finance.refund_settlement.update",
    authorizationSource: options.authorizationSource ?? "finance.refund_settlement.route",
    idempotencyScope: null,
    idempotencyKey: null,
    idempotencyFingerprint: null,
    mutationDetail: {
      commandInputRef: `refund_settlement:${input.settlement.id}:update`,
      commandResultRef: `refund_settlement:${input.settlement.id}`,
      summary: `Refund settlement ${input.settlement.id} updated (${changeSummary}) — now ${input.settlement.status}`,
      reversalKind: "none",
    },
  }
}
