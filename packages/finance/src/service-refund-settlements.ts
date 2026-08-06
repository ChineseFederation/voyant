/**
 * The money leg of a refund (voyant#4303).
 *
 * A credit note records that a refund is owed. Everything here records that it
 * was paid — by what method, whether it arrived, and what is still owed.
 *
 * The bound is enforced transactionally under a lock on the payment row, not
 * read-then-write, because two concurrent refunds against one payment is exactly
 * the case that must not both pass. And the bound counts `pending` as spent: a
 * processor refund whose outcome is unknown keeps holding its amount until it is
 * positively known to have failed. Freeing it early would let a retry return the
 * same money twice, which is the one error here that trying again cannot undo.
 */

import {
  canAdvanceRefundSettlement,
  HELD_REFUND_SETTLEMENT_STATUSES,
  isOwedRefundSettlement,
  type RefundSettlementStatus,
} from "./refund-settlement-lifecycle.js"
import {
  buildRefundSettlementRecordActionLedgerInput,
  buildRefundSettlementUpdateActionLedgerInput,
} from "./service-action-ledger-refund-settlements.js"
import type { FinanceServiceRuntime, PostgresJsDatabase } from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  creditNotes,
  desc,
  eq,
  inArray,
  invoices,
  PaymentValidationError,
  paginate,
  paymentSessions,
  payments,
  refundSettlements,
  sql,
  toTimestamp,
  touchLinkedBookingUpdatedAt,
} from "./service-shared.js"
import type {
  BookingRefundSettlements,
  PaymentRefundableRemainder,
  RecordRefundSettlementInput,
  RefundSettlementListQuery,
  UpdateRefundSettlementInput,
} from "./validation.js"

type RefundSettlementRow = typeof refundSettlements.$inferSelect

const OWED_STATUSES: readonly RefundSettlementStatus[] = ["pending"]
const NOT_OWED_STATUSES: readonly RefundSettlementStatus[] = ["settled", "failed"]

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase()
}

function resolveStatusTimestamps(
  status: RefundSettlementStatus,
  supplied: { settledAt?: string | null; failedAt?: string | null },
  existing: { settledAt: Date | null; failedAt: Date | null },
  now: Date,
) {
  return {
    settledAt:
      status === "settled" ? (toTimestamp(supplied.settledAt) ?? existing.settledAt ?? now) : null,
    failedAt:
      status === "failed" ? (toTimestamp(supplied.failedAt) ?? existing.failedAt ?? now) : null,
  }
}

/**
 * What the settlements against one payment already hold, split by whether the
 * amount is still committed.
 *
 * Currency-matched only. A settlement paid in a different currency than the
 * payment cannot be netted against it without an FX opinion this record does not
 * hold, so it is deliberately excluded from the bound rather than converted at
 * a rate nobody chose.
 */
async function settlementTotalsForPayment(
  db: PostgresJsDatabase,
  paymentId: string,
  currency: string,
  excludeSettlementId: string | null,
) {
  const rows = await db
    .select({
      id: refundSettlements.id,
      status: refundSettlements.status,
      amountCents: refundSettlements.amountCents,
    })
    .from(refundSettlements)
    .where(
      and(eq(refundSettlements.paymentId, paymentId), eq(refundSettlements.currency, currency)),
    )

  let settledCents = 0
  let pendingCents = 0
  let failedCents = 0
  for (const row of rows) {
    if (row.id === excludeSettlementId) continue
    if (row.status === "settled") settledCents += row.amountCents
    else if (row.status === "pending") pendingCents += row.amountCents
    else failedCents += row.amountCents
  }
  return { settledCents, pendingCents, failedCents }
}

/** The same totals against a credit note, for settlements with no payment. */
async function heldTotalForCreditNote(
  db: PostgresJsDatabase,
  creditNoteId: string,
  currency: string,
  excludeSettlementId: string | null,
) {
  const rows = await db
    .select({ id: refundSettlements.id, amountCents: refundSettlements.amountCents })
    .from(refundSettlements)
    .where(
      and(
        eq(refundSettlements.creditNoteId, creditNoteId),
        eq(refundSettlements.currency, currency),
        inArray(refundSettlements.status, [...HELD_REFUND_SETTLEMENT_STATUSES]),
      ),
    )
  return rows
    .filter((row) => row.id !== excludeSettlementId)
    .reduce((total, row) => total + row.amountCents, 0)
}

export const financeRefundSettlementService = {
  async listRefundSettlements(db: PostgresJsDatabase, query: RefundSettlementListQuery) {
    const conditions = []
    if (query.bookingId) conditions.push(eq(refundSettlements.bookingId, query.bookingId))
    if (query.creditNoteId) conditions.push(eq(refundSettlements.creditNoteId, query.creditNoteId))
    if (query.paymentId) conditions.push(eq(refundSettlements.paymentId, query.paymentId))
    if (query.invoiceId) conditions.push(eq(refundSettlements.invoiceId, query.invoiceId))
    if (query.paymentSessionId) {
      conditions.push(eq(refundSettlements.paymentSessionId, query.paymentSessionId))
    }
    if (query.method) conditions.push(eq(refundSettlements.method, query.method))
    if (query.status) conditions.push(eq(refundSettlements.status, query.status))
    if (query.owed !== undefined) {
      conditions.push(
        inArray(refundSettlements.status, [...(query.owed ? OWED_STATUSES : NOT_OWED_STATUSES)]),
      )
    }

    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(refundSettlements)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(refundSettlements.initiatedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(refundSettlements).where(where),
      query.limit,
      query.offset,
    )
  },

  async getRefundSettlementById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(refundSettlements)
      .where(eq(refundSettlements.id, id))
      .limit(1)
    return row ?? null
  },

  /**
   * How much of a payment may still be refunded.
   *
   * `pendingCents` is subtracted alongside `settledCents`. See the module note:
   * a refund of unknown outcome holds its amount rather than freeing it.
   */
  async getPaymentRefundableRemainder(
    db: PostgresJsDatabase,
    paymentId: string,
  ): Promise<PaymentRefundableRemainder | null> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    if (!payment) return null

    const currency = normalizeCurrency(payment.currency)
    const totals = await settlementTotalsForPayment(db, paymentId, currency, null)
    return {
      paymentId,
      currency,
      paidAmountCents: payment.amountCents,
      settledCents: totals.settledCents,
      pendingCents: totals.pendingCents,
      failedCents: totals.failedCents,
      refundableRemainderCents: Math.max(
        0,
        payment.amountCents - totals.settledCents - totals.pendingCents,
      ),
    }
  },

  /**
   * What a booking's payments cannot say on their own: whether the refunds it
   * owes have actually been paid. An issued credit note reads the same either
   * way.
   */
  async getBookingRefundSettlements(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<BookingRefundSettlements> {
    const settlements = await db
      .select()
      .from(refundSettlements)
      .where(eq(refundSettlements.bookingId, bookingId))
      .orderBy(desc(refundSettlements.initiatedAt))

    const owedAmountsByCurrency: Record<string, number> = {}
    const settledAmountsByCurrency: Record<string, number> = {}
    for (const settlement of settlements) {
      if (isOwedRefundSettlement(settlement.status)) {
        owedAmountsByCurrency[settlement.currency] =
          (owedAmountsByCurrency[settlement.currency] ?? 0) + settlement.amountCents
      } else if (settlement.status === "settled") {
        settledAmountsByCurrency[settlement.currency] =
          (settledAmountsByCurrency[settlement.currency] ?? 0) + settlement.amountCents
      }
    }

    return {
      bookingId,
      settlements: settlements as unknown as BookingRefundSettlements["settlements"],
      hasOwedRefund: Object.keys(owedAmountsByCurrency).length > 0,
      owedAmountsByCurrency,
      settledAmountsByCurrency,
    }
  },

  /**
   * Record that a refund was paid — or that paying it has started.
   *
   * Returns `null` when nothing it claims to reverse exists; the caller decides
   * whether that is a 404. Throws `409 refund_settlement_exceeds_refundable`
   * when the amount would take back more than the payment holds.
   *
   * The refundable bound is re-read inside the transaction under
   * `SELECT … FOR UPDATE` on the payment, so two concurrent refunds against one
   * payment cannot both see the same remainder and both pass.
   */
  async recordRefundSettlement(
    db: PostgresJsDatabase,
    input: RecordRefundSettlementInput,
    runtime: FinanceServiceRuntime = {},
    options: { now?: Date } = {},
  ): Promise<RefundSettlementRow | null> {
    const now = options.now ?? new Date()

    return db.transaction(async (tx) => {
      const [payment] = input.paymentId
        ? await tx
            .select()
            .from(payments)
            .where(eq(payments.id, input.paymentId))
            .for("update")
            .limit(1)
        : []
      if (input.paymentId && !payment) return null

      const [creditNote] = input.creditNoteId
        ? await tx.select().from(creditNotes).where(eq(creditNotes.id, input.creditNoteId)).limit(1)
        : []
      if (input.creditNoteId && !creditNote) return null

      // An earlier request carrying the same key already paid this. Hand back
      // what it produced rather than paying a second time.
      if (input.idempotencyKey && input.paymentId) {
        const [existing] = await tx
          .select()
          .from(refundSettlements)
          .where(
            and(
              eq(refundSettlements.paymentId, input.paymentId),
              eq(refundSettlements.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1)
        if (existing) return existing
      }

      const currency = normalizeCurrency(
        input.currency ?? payment?.currency ?? creditNote?.currency ?? "",
      )
      if (!currency) {
        throw new PaymentValidationError(
          "A refund settlement needs a currency it cannot infer from what it reverses",
          { creditNoteId: input.creditNoteId, paymentId: input.paymentId },
          { status: 400, code: "refund_settlement_currency_required" },
        )
      }

      if (payment && currency === normalizeCurrency(payment.currency)) {
        const totals = await settlementTotalsForPayment(tx, payment.id, currency, null)
        const held = totals.settledCents + totals.pendingCents
        if (held + input.amountCents > payment.amountCents) {
          throw new PaymentValidationError(
            "Refund settlements cannot exceed the payment being reversed",
            {
              paymentId: payment.id,
              paymentAmountCents: payment.amountCents,
              alreadyRefundedCents: totals.settledCents,
              // Named separately because it is the surprising half: an
              // in-flight refund holds its amount, so the remainder is smaller
              // than the settled total suggests.
              pendingRefundCents: totals.pendingCents,
              requestedAmountCents: input.amountCents,
              currency,
            },
            { status: 409, code: "refund_settlement_exceeds_refundable" },
          )
        }
      } else if (creditNote && currency === normalizeCurrency(creditNote.currency)) {
        const held = await heldTotalForCreditNote(tx, creditNote.id, currency, null)
        if (held + input.amountCents > creditNote.amountCents) {
          throw new PaymentValidationError(
            "Refund settlements cannot exceed the credit note being settled",
            {
              creditNoteId: creditNote.id,
              creditNoteAmountCents: creditNote.amountCents,
              alreadySettledCents: held,
              requestedAmountCents: input.amountCents,
              currency,
            },
            { status: 409, code: "refund_settlement_exceeds_credit_note" },
          )
        }
      }

      const [session] = input.paymentSessionId
        ? await tx
            .select()
            .from(paymentSessions)
            .where(eq(paymentSessions.id, input.paymentSessionId))
            .limit(1)
        : []
      if (input.paymentSessionId && !session) return null

      const invoiceId = input.invoiceId ?? creditNote?.invoiceId ?? payment?.invoiceId ?? null
      const bookingId =
        session?.bookingId ??
        (invoiceId
          ? ((
              await tx
                .select({ bookingId: invoices.bookingId })
                .from(invoices)
                .where(eq(invoices.id, invoiceId))
                .limit(1)
            )[0]?.bookingId ?? null)
          : null)

      const { settledAt, failedAt } = resolveStatusTimestamps(
        input.status,
        input,
        { settledAt: null, failedAt: null },
        now,
      )

      const [row] = await tx
        .insert(refundSettlements)
        .values({
          creditNoteId: input.creditNoteId ?? null,
          paymentId: input.paymentId ?? null,
          invoiceId,
          paymentSessionId: input.paymentSessionId ?? null,
          bookingId,
          method: input.method,
          status: input.status,
          amountCents: input.amountCents,
          currency,
          instrumentAmountCents: input.instrumentAmountCents ?? null,
          instrumentCurrency: input.instrumentCurrency
            ? normalizeCurrency(input.instrumentCurrency)
            : null,
          travelCreditId: input.travelCreditId ?? null,
          counterpartyOrganizationId: input.counterpartyOrganizationId ?? null,
          counterpartyPersonId: input.counterpartyPersonId ?? null,
          externalReference: input.externalReference ?? null,
          provider: input.provider ?? session?.provider ?? null,
          providerConnectionId: input.providerConnectionId ?? session?.providerConnectionId ?? null,
          processorReference: input.processorReference ?? null,
          authorizedByUserId: input.authorizedByUserId ?? null,
          approvalId: input.approvalId ?? null,
          requestedActionId: input.requestedActionId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          initiatedAt: toTimestamp(input.initiatedAt) ?? now,
          settledAt,
          failedAt,
          failureReason: input.failureReason ?? null,
          notes: input.notes ?? null,
          providerPayload: input.providerPayload ?? null,
          metadata: input.metadata ?? null,
          updatedAt: now,
        })
        .returning()
      if (!row) return null

      await touchLinkedBookingUpdatedAt(tx, row.bookingId, now)

      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildRefundSettlementRecordActionLedgerInput(
            actionLedgerContext,
            { settlement: row, replayed: false },
            {
              authorizationSource: runtime.actionLedgerAuthorizationSource,
              actionName: runtime.actionLedgerActionName,
              routeOrToolName: runtime.actionLedgerRouteOrToolName,
              targetType: runtime.actionLedgerTargetType,
              targetId: runtime.actionLedgerTargetId,
              capabilityId: runtime.actionLedgerCapabilityId,
              capabilityVersion: runtime.actionLedgerCapabilityVersion,
              evaluatedRisk: runtime.actionLedgerEvaluatedRisk,
              causationActionId: runtime.actionLedgerCausationActionId,
              approvalId: runtime.actionLedgerApprovalId,
              idempotencyScope: runtime.actionLedgerIdempotencyScope,
              idempotencyKey: runtime.actionLedgerIdempotencyKey,
              idempotencyFingerprint: runtime.actionLedgerIdempotencyFingerprint,
            },
          ),
        )
      }

      return row
    })
  },

  /**
   * Advance a settlement already on record — the transfer landed, or the
   * processor came back and declined.
   *
   * Fails on an illegal transition. `settled` and `failed` are terminal: a
   * refund that failed is retried by recording a new settlement, not by reviving
   * the one that failed, so nothing can walk a paid refund backwards.
   */
  async updateRefundSettlement(
    db: PostgresJsDatabase,
    id: string,
    input: UpdateRefundSettlementInput,
    runtime: FinanceServiceRuntime = {},
    options: { now?: Date } = {},
  ): Promise<RefundSettlementRow | null> {
    const now = options.now ?? new Date()

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(refundSettlements)
        .where(eq(refundSettlements.id, id))
        .for("update")
        .limit(1)
      if (!existing) return null

      const nextStatus = input.status ?? existing.status
      if (!canAdvanceRefundSettlement(existing.status, nextStatus)) {
        throw new PaymentValidationError(
          "Refund settlement cannot move to that status",
          {
            refundSettlementId: id,
            currentStatus: existing.status,
            requestedStatus: nextStatus,
          },
          { status: 409, code: "refund_settlement_invalid_transition" },
        )
      }

      const { settledAt, failedAt } = resolveStatusTimestamps(nextStatus, input, existing, now)

      const [row] = await tx
        .update(refundSettlements)
        .set({
          status: nextStatus,
          externalReference:
            input.externalReference === undefined ? undefined : input.externalReference,
          processorReference:
            input.processorReference === undefined ? undefined : input.processorReference,
          settledAt,
          failedAt,
          failureReason: input.failureReason === undefined ? undefined : input.failureReason,
          notes: input.notes === undefined ? undefined : input.notes,
          providerPayload: input.providerPayload === undefined ? undefined : input.providerPayload,
          metadata: input.metadata === undefined ? undefined : input.metadata,
          updatedAt: now,
        })
        .where(eq(refundSettlements.id, id))
        .returning()
      if (!row) return null

      await touchLinkedBookingUpdatedAt(tx, row.bookingId, now)

      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildRefundSettlementUpdateActionLedgerInput(
            actionLedgerContext,
            { settlement: row, changes: input },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return row
    })
  },
}
