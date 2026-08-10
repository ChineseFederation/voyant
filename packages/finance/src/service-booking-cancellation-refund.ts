import type { ActionLedgerRequestContextValues } from "@voyant-travel/action-ledger"
import { ToolError } from "@voyant-travel/tools"
import { and, desc, eq, gt, ne, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { z } from "zod"

import {
  bookingCancellationActivityRef,
  bookingCancellationRef,
} from "./booking-cancellation-ref.js"
import { creditNotes, invoices, payments, refundSettlements } from "./schema.js"
import { financeInvoiceCreditNoteService } from "./service-invoice-credit-notes.js"
import { financeRefundSettlementService } from "./service-refund-settlements.js"

export interface BookingCancellationRefundConsequence {
  bookingId: string
  bookingNumber: string
  cancellationActivityId: string
  cancellationAsOf: string
  invoiceId: string
  invoiceNumber: string
  paymentId: string
  amountCents: number
  currency: string
  refundableRemainderCents: number
  creditNoteNumber: string
}

export interface ExecuteBookingCancellationRefundRuntime {
  actionLedgerContext: ActionLedgerRequestContextValues
  authorizationSource: string
  causationActionId: string
  approvalId: string
  requestedActionId: string
  idempotencyScope: string
  idempotencyKey: string
  idempotencyFingerprint: string
}

export async function executeBookingCancellationRefund(
  db: PostgresJsDatabase,
  command: BookingCancellationRefundConsequence & {
    method: "bank_transfer" | "cash" | "cheque" | "other"
    reference: string | null
  },
  runtime: ExecuteBookingCancellationRefundRuntime,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM bookings WHERE id = ${command.bookingId} FOR UPDATE
    `)
    await tx.execute(sql`
      SELECT id FROM booking_activity_log WHERE id = ${command.cancellationActivityId} FOR UPDATE
    `)
    await tx.execute(sql`
      SELECT id FROM invoices WHERE id = ${command.invoiceId} FOR UPDATE
    `)
    await tx.execute(sql`
      SELECT id FROM payments WHERE id = ${command.paymentId} FOR UPDATE
    `)

    const current = await resolveBookingCancellationRefund(tx, command.bookingId)
    assertApprovedConsequenceUnchanged(command, current)

    const creditNote = await financeInvoiceCreditNoteService.createCreditNote(
      tx,
      current.invoiceId,
      {
        creditNoteNumber: current.creditNoteNumber,
        status: "issued",
        amountCents: current.amountCents,
        currency: current.currency,
        reason: `Cancellation of booking ${current.bookingNumber}`,
        notes: `Contractual cancellation entitlement recorded by activity ${current.cancellationActivityId}.`,
      },
      {
        actionLedgerContext: runtime.actionLedgerContext,
        actionLedgerAuthorizationSource: runtime.authorizationSource,
        actionLedgerActionName: "finance.booking.refund_cancellation",
        actionLedgerRouteOrToolName: "finance.refund_cancelled_booking",
        actionLedgerTargetType: "booking",
        actionLedgerTargetId: current.bookingId,
        actionLedgerCapabilityId: "finance:booking-cancellation-refund",
        actionLedgerCapabilityVersion: "v1",
        actionLedgerEvaluatedRisk: "critical",
        actionLedgerCausationActionId: runtime.causationActionId,
        actionLedgerApprovalId: runtime.approvalId,
        actionLedgerIdempotencyScope: runtime.idempotencyScope,
        actionLedgerIdempotencyKey: runtime.idempotencyKey,
        actionLedgerIdempotencyFingerprint: runtime.idempotencyFingerprint,
      },
    )
    if (!creditNote) {
      throw new ToolError("The approved invoice was not found.", "NOT_FOUND", {
        invoiceId: current.invoiceId,
      })
    }

    const settlement = await financeRefundSettlementService.recordRefundSettlement(tx, {
      creditNoteId: creditNote.id,
      paymentId: current.paymentId,
      invoiceId: current.invoiceId,
      method: command.method,
      status: "settled",
      amountCents: current.amountCents,
      currency: current.currency,
      externalReference: command.reference,
      approvalId: runtime.approvalId,
      requestedActionId: runtime.requestedActionId,
      idempotencyKey: `${runtime.idempotencyKey}:settlement`,
      metadata: {
        bookingId: current.bookingId,
        cancellationActivityId: current.cancellationActivityId,
        cancellationAsOf: current.cancellationAsOf,
      },
    })
    if (!settlement) {
      throw new ToolError("The approved original payment was not found.", "NOT_FOUND", {
        paymentId: current.paymentId,
      })
    }
    return { creditNote, settlement }
  })
}

export async function getBookingCancellationRefundByCreditNote(
  db: PostgresJsDatabase,
  creditNoteId: string,
) {
  const [row] = await db
    .select({ creditNote: creditNotes, settlement: refundSettlements })
    .from(creditNotes)
    .innerJoin(refundSettlements, eq(refundSettlements.creditNoteId, creditNotes.id))
    .where(eq(creditNotes.id, creditNoteId))
    .limit(1)
  return row ?? null
}

export async function resolveBookingCancellationRefund(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingCancellationRefundConsequence> {
  const [booking] = await db
    .select({
      id: bookingCancellationRef.id,
      bookingNumber: bookingCancellationRef.bookingNumber,
      status: bookingCancellationRef.status,
    })
    .from(bookingCancellationRef)
    .where(eq(bookingCancellationRef.id, bookingId))
    .limit(1)
  if (!booking) {
    throw new ToolError("Booking was not found.", "NOT_FOUND", { bookingId })
  }
  if (booking.status !== "cancelled") {
    throw manualReview("The booking is not cancelled.", bookingId, "booking_not_cancelled")
  }

  const activities = await db
    .select({
      id: bookingCancellationActivityRef.id,
      metadata: bookingCancellationActivityRef.metadata,
      createdAt: bookingCancellationActivityRef.createdAt,
    })
    .from(bookingCancellationActivityRef)
    .where(
      and(
        eq(bookingCancellationActivityRef.bookingId, bookingId),
        eq(bookingCancellationActivityRef.activityType, "status_change"),
      ),
    )
    .orderBy(desc(bookingCancellationActivityRef.createdAt))

  const cancellationActivities = activities.flatMap((activity) => {
    const parsed = cancellationActivityMetadataSchema.safeParse(activity.metadata)
    return parsed.success && parsed.data.newStatus === "cancelled"
      ? [{ ...activity, entitlement: parsed.data.cancellationPolicyEntitlement }]
      : []
  })
  if (cancellationActivities.length !== 1) {
    throw manualReview(
      cancellationActivities.length === 0
        ? "No durable cancellation entitlement was recorded for this booking."
        : "More than one cancellation entitlement exists for this booking.",
      bookingId,
      cancellationActivities.length === 0
        ? "cancellation_entitlement_missing"
        : "cancellation_entitlement_ambiguous",
    )
  }
  const cancellation = cancellationActivities[0]
  if (!cancellation) throw new Error("Cancellation activity resolution failed")
  const entitlement = cancellation.entitlement
  if (entitlement.status !== "evaluated") {
    throw manualReview(
      "The recorded cancellation entitlement requires manual review.",
      bookingId,
      "cancellation_entitlement_unknown",
    )
  }
  if (!cashCapableRefundTypes.has(entitlement.refundType) || entitlement.refundCents <= 0) {
    throw manualReview(
      "The recorded cancellation entitlement does not authorize a cash refund.",
      bookingId,
      "cash_refund_not_entitled",
    )
  }

  const paidInvoices = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      currency: invoices.currency,
      paidCents: invoices.paidCents,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        gt(invoices.paidCents, 0),
        ne(invoices.status, "void"),
      ),
    )
  const eligibleInvoices = paidInvoices.filter(
    (invoice) =>
      normalizeCurrency(invoice.currency) === normalizeCurrency(entitlement.currency) &&
      invoice.paidCents >= entitlement.refundCents,
  )
  if (eligibleInvoices.length !== 1) {
    throw manualReview(
      "The contractual refund cannot be mapped unambiguously to one paid invoice.",
      bookingId,
      eligibleInvoices.length === 0 ? "paid_invoice_missing" : "paid_invoice_ambiguous",
    )
  }
  const invoice = eligibleInvoices[0]
  if (!invoice) throw new Error("Paid invoice resolution failed")

  const completedPayments = await db
    .select({ id: payments.id, currency: payments.currency })
    .from(payments)
    .where(and(eq(payments.invoiceId, invoice.id), eq(payments.status, "completed")))
  const eligiblePayments = []
  for (const payment of completedPayments) {
    if (normalizeCurrency(payment.currency) !== normalizeCurrency(entitlement.currency)) continue
    const remainder = await financeRefundSettlementService.getPaymentRefundableRemainder(
      db,
      payment.id,
    )
    if (remainder && remainder.refundableRemainderCents >= entitlement.refundCents) {
      eligiblePayments.push({ payment, remainder })
    }
  }
  if (eligiblePayments.length !== 1) {
    throw manualReview(
      "The contractual refund cannot be mapped unambiguously to one original payment.",
      bookingId,
      eligiblePayments.length === 0 ? "refundable_payment_missing" : "refundable_payment_ambiguous",
    )
  }
  const selected = eligiblePayments[0]
  if (!selected) throw new Error("Refundable payment resolution failed")

  return {
    bookingId,
    bookingNumber: booking.bookingNumber,
    cancellationActivityId: cancellation.id,
    cancellationAsOf: entitlement.asOf,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentId: selected.payment.id,
    amountCents: entitlement.refundCents,
    currency: normalizeCurrency(entitlement.currency),
    refundableRemainderCents: selected.remainder.refundableRemainderCents,
    creditNoteNumber: `CN-${booking.bookingNumber}-${cancellation.id}`,
  }
}

const evaluatedEntitlementSchema = z.object({
  status: z.literal("evaluated"),
  asOf: z.string().datetime(),
  currency: z.string().min(1),
  refundCents: z.number().int().nonnegative(),
  refundType: z.enum(["cash", "credit", "cash_or_credit", "none", "mixed", "unknown"]),
})

const cancellationActivityMetadataSchema = z.object({
  newStatus: z.string(),
  cancellationPolicyEntitlement: z.union([
    evaluatedEntitlementSchema,
    z.object({ status: z.literal("manual_review") }),
  ]),
})

const cashCapableRefundTypes = new Set(["cash", "cash_or_credit"])

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase()
}

function manualReview(message: string, bookingId: string, reason: string) {
  return new ToolError(message, "INVALID_INPUT", {
    bookingId,
    reason,
    manualReviewRequired: true,
  })
}

function assertApprovedConsequenceUnchanged(
  approved: BookingCancellationRefundConsequence,
  current: BookingCancellationRefundConsequence,
) {
  const fields = [
    "bookingNumber",
    "cancellationActivityId",
    "cancellationAsOf",
    "invoiceId",
    "invoiceNumber",
    "paymentId",
    "amountCents",
    "currency",
    "refundableRemainderCents",
    "creditNoteNumber",
  ] as const
  const changed = fields.filter((field) => approved[field] !== current[field])
  if (changed.length === 0) return
  throw new ToolError(
    "The cancellation entitlement or its refundable payment changed after approval; no refund was recorded.",
    "INVALID_INPUT",
    { reason: "booking_cancellation_refund_changed", changedFields: changed },
  )
}
