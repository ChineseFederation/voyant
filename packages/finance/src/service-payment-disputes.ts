/**
 * Card disputes — recording a chargeback against the payment it contests
 * (voyant#4289).
 *
 * Two entry points, deliberately different in temperament:
 *
 * - `recordPaymentDispute` is the ingest path, used by a verified adapter
 *   callback and by an operator recording a dispute by hand. It is idempotent
 *   on `(paymentSessionId, processorReference)` and tolerates a stale report
 *   rather than failing, because a webhook that 500s gets retried forever.
 * - `updatePaymentDispute` is the deliberate path. An illegal transition there
 *   is a mistake worth surfacing, so it fails.
 *
 * Nothing here interprets a processor. `provider`, `processorReference` and
 * `reasonCode` are stored and handed back verbatim.
 */

import type { PaymentDisputeStatus } from "@voyant-travel/payments"
import {
  canAdvancePaymentDispute,
  isOpenPaymentDisputeStatus,
  paymentDisputeResolution,
} from "./payment-dispute-lifecycle.js"
import {
  buildPaymentDisputeRecordActionLedgerInput,
  buildPaymentDisputeUpdateActionLedgerInput,
} from "./service-action-ledger-payment-disputes.js"

import type { FinanceServiceRuntime, PostgresJsDatabase } from "./service-shared.js"
import {
  and,
  appendActionLedgerMutation,
  desc,
  eq,
  inArray,
  PaymentValidationError,
  paginate,
  paymentDisputes,
  paymentSessions,
  sql,
  toTimestamp,
  touchLinkedBookingUpdatedAt,
} from "./service-shared.js"
import type {
  PaymentDisputeListQuery,
  RecordPaymentDisputeInput,
  UpdatePaymentDisputeInput,
} from "./validation.js"

type PaymentDisputeRow = typeof paymentDisputes.$inferSelect

const OPEN_STATUSES: readonly PaymentDisputeStatus[] = ["opened", "under_review"]
const RESOLVED_STATUSES: readonly PaymentDisputeStatus[] = ["won", "lost", "withdrawn"]

/**
 * A booking-level view of what is contested.
 *
 * This is the answer to "is this booking cleanly paid?" — a caller that only
 * looks at payments and sessions cannot tell, because a chargeback leaves both
 * of them saying `paid`.
 */
export interface BookingPaymentDisputeSummary {
  bookingId: string
  disputes: PaymentDisputeRow[]
  /** Any dispute still unresolved. */
  hasOpenDispute: boolean
  /** Minor units still contested, by currency — resolved disputes excluded. */
  openContestedAmountsByCurrency: Record<string, number>
  /** The soonest response deadline across open disputes, if any. */
  nextRespondBy: string | null
}

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase()
}

function resolveResolutionTimestamps(
  status: PaymentDisputeStatus,
  suppliedResolvedAt: string | null | undefined,
  existingResolvedAt: Date | null,
  now: Date,
) {
  if (!paymentDisputeResolution(status)) return { resolvedAt: null }
  return { resolvedAt: toTimestamp(suppliedResolvedAt) ?? existingResolvedAt ?? now }
}

/**
 * The unresolved contested total in the session's own currency, excluding one
 * dispute row (the one being written).
 */
async function openContestedAmountCents(
  db: PostgresJsDatabase,
  paymentSessionId: string,
  currency: string,
  excludeDisputeId: string | null,
) {
  const rows = await db
    .select({ id: paymentDisputes.id, amountCents: paymentDisputes.amountCents })
    .from(paymentDisputes)
    .where(
      and(
        eq(paymentDisputes.paymentSessionId, paymentSessionId),
        eq(paymentDisputes.currency, currency),
        inArray(paymentDisputes.status, [...OPEN_STATUSES]),
      ),
    )
  return rows
    .filter((row) => row.id !== excludeDisputeId)
    .reduce((total, row) => total + row.amountCents, 0)
}

export const financePaymentDisputeService = {
  async listPaymentDisputes(db: PostgresJsDatabase, query: PaymentDisputeListQuery) {
    const conditions = []
    if (query.bookingId) conditions.push(eq(paymentDisputes.bookingId, query.bookingId))
    if (query.paymentSessionId) {
      conditions.push(eq(paymentDisputes.paymentSessionId, query.paymentSessionId))
    }
    if (query.invoiceId) conditions.push(eq(paymentDisputes.invoiceId, query.invoiceId))
    if (query.status) conditions.push(eq(paymentDisputes.status, query.status))
    if (query.provider) conditions.push(eq(paymentDisputes.provider, query.provider))
    if (query.processorReference) {
      conditions.push(eq(paymentDisputes.processorReference, query.processorReference))
    }
    if (query.open !== undefined) {
      conditions.push(
        inArray(paymentDisputes.status, [...(query.open ? OPEN_STATUSES : RESOLVED_STATUSES)]),
      )
    }

    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(paymentDisputes)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(paymentDisputes.openedAt)),
      db.select({ count: sql<number>`count(*)::int` }).from(paymentDisputes).where(where),
      query.limit,
      query.offset,
    )
  },

  async getPaymentDisputeById(db: PostgresJsDatabase, id: string) {
    const [row] = await db.select().from(paymentDisputes).where(eq(paymentDisputes.id, id)).limit(1)
    return row ?? null
  },

  /**
   * What a booking's payments do not say on their own: whether any of the money
   * is contested.
   */
  async getBookingPaymentDisputes(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<BookingPaymentDisputeSummary> {
    const disputes = await db
      .select()
      .from(paymentDisputes)
      .where(eq(paymentDisputes.bookingId, bookingId))
      .orderBy(desc(paymentDisputes.openedAt))

    const open = disputes.filter((dispute) => isOpenPaymentDisputeStatus(dispute.status))
    const openContestedAmountsByCurrency: Record<string, number> = {}
    for (const dispute of open) {
      openContestedAmountsByCurrency[dispute.currency] =
        (openContestedAmountsByCurrency[dispute.currency] ?? 0) + dispute.amountCents
    }
    const deadlines = open
      .map((dispute) => dispute.respondBy)
      .filter((value): value is Date => value != null)
      .sort((left, right) => left.getTime() - right.getTime())

    return {
      bookingId,
      disputes,
      hasOpenDispute: open.length > 0,
      openContestedAmountsByCurrency,
      nextRespondBy: deadlines[0]?.toISOString() ?? null,
    }
  },

  /**
   * Open a dispute, or advance the one this processor reference already opened.
   *
   * Returns `null` when the contested session does not exist — the caller
   * decides whether that is a 404 or a callback to drop.
   */
  async recordPaymentDispute(
    db: PostgresJsDatabase,
    input: RecordPaymentDisputeInput,
    runtime: FinanceServiceRuntime = {},
    options: { now?: Date } = {},
  ): Promise<PaymentDisputeRow | null> {
    const now = options.now ?? new Date()
    const processorReference = input.processorReference ?? null

    const result = await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(paymentSessions)
        .where(eq(paymentSessions.id, input.paymentSessionId))
        .for("update")
        .limit(1)
      if (!session) return null

      const currency = normalizeCurrency(input.currency ?? session.currency)
      const [existing] = processorReference
        ? await tx
            .select()
            .from(paymentDisputes)
            .where(
              and(
                eq(paymentDisputes.paymentSessionId, input.paymentSessionId),
                eq(paymentDisputes.processorReference, processorReference),
              ),
            )
            .limit(1)
        : []

      // A stale or replayed report must not walk a resolved dispute backwards,
      // and must not 500 — the processor would only send it again.
      if (existing && !canAdvancePaymentDispute(existing.status, input.status)) {
        return existing
      }

      if (isOpenPaymentDisputeStatus(input.status) && currency === session.currency) {
        const otherOpen = await openContestedAmountCents(
          tx,
          input.paymentSessionId,
          currency,
          existing?.id ?? null,
        )
        if (otherOpen + input.amountCents > session.amountCents) {
          throw new PaymentValidationError(
            "Contested amount exceeds the payment being disputed",
            {
              paymentSessionId: input.paymentSessionId,
              paymentAmountCents: session.amountCents,
              alreadyContestedAmountCents: otherOpen,
              requestedAmountCents: input.amountCents,
              currency,
            },
            { status: 409, code: "payment_dispute_amount_exceeds_payment" },
          )
        }
      }

      const { resolvedAt } = resolveResolutionTimestamps(
        input.status,
        input.resolvedAt,
        existing?.resolvedAt ?? null,
        now,
      )

      const values = {
        paymentSessionId: input.paymentSessionId,
        bookingId: session.bookingId,
        invoiceId: session.invoiceId,
        paymentId: session.paymentId,
        status: input.status,
        amountCents: input.amountCents,
        currency,
        openedAt: toTimestamp(input.openedAt) ?? existing?.openedAt ?? now,
        respondBy: toTimestamp(input.respondBy) ?? existing?.respondBy ?? null,
        processorReference,
        provider: input.provider ?? session.provider,
        providerConnectionId: input.providerConnectionId ?? session.providerConnectionId,
        reasonCode: input.reasonCode ?? existing?.reasonCode ?? null,
        resolvedAt,
        resolutionNote: input.resolutionNote ?? existing?.resolutionNote ?? null,
        evidenceSubmittedAt:
          toTimestamp(input.evidenceSubmittedAt) ?? existing?.evidenceSubmittedAt ?? null,
        notes: input.notes ?? existing?.notes ?? null,
        providerPayload: input.providerPayload ?? existing?.providerPayload ?? null,
        metadata: input.metadata ?? existing?.metadata ?? null,
        updatedAt: now,
      }

      const [row] = existing
        ? await tx
            .update(paymentDisputes)
            .set(values)
            .where(eq(paymentDisputes.id, existing.id))
            .returning()
        : await tx.insert(paymentDisputes).values(values).returning()

      if (!row) return existing ?? null

      await touchLinkedBookingUpdatedAt(tx, row.bookingId, now)

      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildPaymentDisputeRecordActionLedgerInput(
            actionLedgerContext,
            { dispute: row, opened: !existing },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return row
    })

    return result
  },

  /** Advance a dispute already on record. Fails on an illegal transition. */
  async updatePaymentDispute(
    db: PostgresJsDatabase,
    id: string,
    input: UpdatePaymentDisputeInput,
    runtime: FinanceServiceRuntime = {},
    options: { now?: Date } = {},
  ): Promise<PaymentDisputeRow | null> {
    const now = options.now ?? new Date()

    return db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(paymentDisputes)
        .where(eq(paymentDisputes.id, id))
        .for("update")
        .limit(1)
      if (!existing) return null

      const nextStatus = input.status ?? existing.status
      if (!canAdvancePaymentDispute(existing.status, nextStatus)) {
        throw new PaymentValidationError(
          "Payment dispute cannot move to that status",
          { paymentDisputeId: id, currentStatus: existing.status, requestedStatus: nextStatus },
          { status: 409, code: "payment_dispute_invalid_transition" },
        )
      }

      const { resolvedAt } = resolveResolutionTimestamps(
        nextStatus,
        input.resolvedAt,
        existing.resolvedAt,
        now,
      )

      const [row] = await tx
        .update(paymentDisputes)
        .set({
          status: nextStatus,
          respondBy: input.respondBy === undefined ? undefined : toTimestamp(input.respondBy),
          reasonCode: input.reasonCode === undefined ? undefined : input.reasonCode,
          resolvedAt,
          resolutionNote: input.resolutionNote === undefined ? undefined : input.resolutionNote,
          evidenceSubmittedAt:
            input.evidenceSubmittedAt === undefined
              ? undefined
              : toTimestamp(input.evidenceSubmittedAt),
          notes: input.notes === undefined ? undefined : input.notes,
          metadata: input.metadata === undefined ? undefined : input.metadata,
          updatedAt: now,
        })
        .where(eq(paymentDisputes.id, id))
        .returning()

      if (!row) return null
      await touchLinkedBookingUpdatedAt(tx, row.bookingId, now)

      const actionLedgerContext = runtime.actionLedgerContext
      if (actionLedgerContext) {
        await appendActionLedgerMutation(
          tx,
          buildPaymentDisputeUpdateActionLedgerInput(
            actionLedgerContext,
            { dispute: row, changes: input },
            { authorizationSource: runtime.actionLedgerAuthorizationSource },
          ),
        )
      }

      return row
    })
  },
}
