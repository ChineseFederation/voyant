/**
 * Driving a recorded refund through the payment adapter (voyant#4303).
 *
 * `finance:refund` used to stop at the credit note: the capability, the approval
 * and the accounting document all existed, and nothing connected an authorized
 * refund to `adapter.refund()`. A deployment with a working card processor could
 * not return money through it.
 *
 * This is that connection, and it is deliberately the *second* step. The
 * settlement row is written first, `pending`, holding its amount — so an
 * adapter call that times out on a refund the processor accepted leaves a record
 * behind rather than nothing. Which is the whole point:
 *
 * > an indeterminate outcome deliberately leaves the refund row live rather than
 * > retiring it.
 *
 * `accepted` settles it, `pending` leaves it owed, `declined` and `failed` fail
 * it and release the amount. A thrown error resolves nothing: the row stays
 * `pending`, its amount stays held, and the note says the outcome is unknown.
 * Recording that as a failure would free the amount and invite a retry that
 * refunds the customer twice.
 */

import type { PaymentAdapter, PaymentAdapterRuntimeContext } from "@voyant-travel/payments"

import { isAdapterBackedRefundMethod } from "./refund-settlement-lifecycle.js"
import { financeRefundSettlementService } from "./service-refund-settlements.js"
import type { FinanceServiceRuntime, PostgresJsDatabase } from "./service-shared.js"
import { eq, paymentSessions, type refundSettlements } from "./service-shared.js"

/** Where the indeterminate-outcome marker lives on the settlement's metadata. */
export const REFUND_SETTLEMENT_OUTCOME_KEY = "refundAdapterOutcome"

export type RefundSettlementExecutionOutcome =
  | "settled"
  | "pending"
  | "failed"
  | "indeterminate"
  | "not_applicable"

export interface RefundSettlementExecutionResult {
  outcome: RefundSettlementExecutionOutcome
  settlement: typeof refundSettlements.$inferSelect | null
  /** Why nothing was attempted, for the two `not_applicable` cases. */
  reason?: "method_not_adapter_backed" | "adapter_cannot_refund" | "settlement_not_pending"
}

export interface RefundSettlementExecution {
  context: PaymentAdapterRuntimeContext
  runtime?: FinanceServiceRuntime
  now?: Date
  /** Passed to the processor as the refund's idempotency key. */
  idempotencyKey?: string
  reason?: string
}

export async function executeAdapterRefundSettlement(
  adapter: PaymentAdapter,
  db: PostgresJsDatabase,
  refundSettlementId: string,
  execution: RefundSettlementExecution,
): Promise<RefundSettlementExecutionResult> {
  const settlement = await financeRefundSettlementService.getRefundSettlementById(
    db,
    refundSettlementId,
  )
  if (!settlement) return { outcome: "not_applicable", settlement: null }

  if (!isAdapterBackedRefundMethod(settlement.method)) {
    return {
      outcome: "not_applicable",
      settlement,
      reason: "method_not_adapter_backed",
    }
  }
  // Only a live refund is driven. A settled or failed one is terminal, and
  // re-driving it would ask the processor to return the money a second time.
  if (settlement.status !== "pending") {
    return { outcome: "not_applicable", settlement, reason: "settlement_not_pending" }
  }
  if (!adapter.capabilities.refund || typeof adapter.refund !== "function") {
    return { outcome: "not_applicable", settlement, reason: "adapter_cannot_refund" }
  }
  if (!settlement.paymentSessionId) {
    return { outcome: "not_applicable", settlement, reason: "method_not_adapter_backed" }
  }

  const [session] = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, settlement.paymentSessionId))
    .limit(1)
  if (!session) return { outcome: "not_applicable", settlement, reason: "adapter_cannot_refund" }

  // Historical processor identity comes from the session, never from a caller —
  // the same rule the status refresh follows. `managed` rows deliberately carry
  // no identity so the control plane resolves it.
  const processorIdentity =
    session.provider && session.provider !== "managed" && session.providerConnectionId
      ? { providerId: session.provider, connectionId: session.providerConnectionId }
      : undefined

  const idempotencyKey =
    execution.idempotencyKey ?? settlement.idempotencyKey ?? `refund:${settlement.id}`

  try {
    const result = await adapter.refund(execution.context, {
      paymentSessionId: session.id,
      processorSessionId: session.providerSessionId,
      processorPaymentId: session.providerPaymentId,
      processorIdentity,
      money: { amountMinor: settlement.amountCents, currency: settlement.currency },
      reason: execution.reason ?? undefined,
      idempotencyKey,
    })

    const processorReference = result.processorReference ?? settlement.processorReference ?? null
    const providerPayload =
      result.raw && typeof result.raw === "object" && !Array.isArray(result.raw)
        ? (result.raw as Record<string, unknown>)
        : (settlement.providerPayload ?? null)

    if (result.status === "accepted") {
      const updated = await financeRefundSettlementService.updateRefundSettlement(
        db,
        settlement.id,
        {
          status: "settled",
          processorReference,
          providerPayload,
          metadata: withOutcome(settlement.metadata, "settled"),
        },
        execution.runtime,
        { now: execution.now },
      )
      return { outcome: "settled", settlement: updated }
    }

    if (result.status === "pending") {
      // Still owed. The row keeps its amount held, which is what stops a retry
      // from returning the same money while the processor is still deciding.
      const updated = await financeRefundSettlementService.updateRefundSettlement(
        db,
        settlement.id,
        {
          processorReference,
          providerPayload,
          metadata: withOutcome(settlement.metadata, "pending"),
        },
        execution.runtime,
        { now: execution.now },
      )
      return { outcome: "pending", settlement: updated }
    }

    const updated = await financeRefundSettlementService.updateRefundSettlement(
      db,
      settlement.id,
      {
        status: "failed",
        processorReference,
        providerPayload,
        failureReason: `Processor ${result.status} the refund`,
        metadata: withOutcome(settlement.metadata, result.status),
      },
      execution.runtime,
      { now: execution.now },
    )
    return { outcome: "failed", settlement: updated }
  } catch (error) {
    // The refund may well have gone through. Leave the row `pending` — its
    // amount stays held and an operator can settle or fail it once the
    // processor console says which happened.
    const updated = await financeRefundSettlementService.updateRefundSettlement(
      db,
      settlement.id,
      {
        failureReason: `Refund outcome unknown: ${
          error instanceof Error ? error.message : String(error)
        }`,
        metadata: withOutcome(settlement.metadata, "indeterminate"),
      },
      execution.runtime,
      { now: execution.now },
    )
    return { outcome: "indeterminate", settlement: updated }
  }
}

function withOutcome(metadata: Record<string, unknown> | null, outcome: string) {
  return { ...(metadata ?? {}), [REFUND_SETTLEMENT_OUTCOME_KEY]: outcome }
}
