import type { BookingFinancialLifecycle } from "@voyant-travel/bookings"
import { and, eq, gt, inArray, ne } from "drizzle-orm"

import { bookingPaymentSchedules, financeNotes, invoices } from "./schema.js"

export interface BookingCancellationSettlementInput {
  bookingId: string
  bookingNumber: string
  previousStatus: "confirmed" | "in_progress"
  reason: string | null
  actorId: string
  cancellationPolicyEntitlement?: Parameters<
    BookingFinancialLifecycle["recordCancellationFinancialSettlement"]
  >[1]["cancellationPolicyEntitlement"]
}

interface PaidInvoice {
  id: string
  invoiceNumber: string
  currency: string
  paidCents: number
  status: string
}

export const financeBookingLifecycle: BookingFinancialLifecycle = {
  closePaymentSchedulesForBooking: closeTerminalBookingPaymentSchedules,
  recordCancellationFinancialSettlement: recordPaidBookingCancellationSettlement,
}

export async function closeTerminalBookingPaymentSchedules(
  db: Parameters<BookingFinancialLifecycle["closePaymentSchedulesForBooking"]>[0],
  bookingId: string,
  status: "cancelled",
): Promise<void> {
  await db
    .update(bookingPaymentSchedules)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(bookingPaymentSchedules.bookingId, bookingId),
        inArray(bookingPaymentSchedules.status, ["pending", "due"]),
      ),
    )
}

export async function recordPaidBookingCancellationSettlement(
  db: Parameters<BookingFinancialLifecycle["recordCancellationFinancialSettlement"]>[0],
  input: BookingCancellationSettlementInput,
): Promise<Record<string, unknown> | null> {
  const paidInvoices = (await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      currency: invoices.currency,
      paidCents: invoices.paidCents,
      status: invoices.status,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, input.bookingId),
        gt(invoices.paidCents, 0),
        ne(invoices.status, "void"),
      ),
    )) as PaidInvoice[]

  if (paidInvoices.length === 0) return null

  const noteIds: string[] = []
  const content = buildPaidBookingCancellationSettlementNote(input)
  for (const invoice of paidInvoices) {
    const [note] = await db
      .insert(financeNotes)
      .values({
        invoiceId: invoice.id,
        authorId: input.actorId,
        content: `${content}\n\nInvoice paid amount: ${invoice.paidCents} ${invoice.currency} cents.`,
      })
      .returning({ id: financeNotes.id })
    if (note?.id) noteIds.push(note.id)
  }

  return {
    status: "action_required",
    kind: "paid_booking_cancellation",
    invoiceIds: paidInvoices.map((invoice) => invoice.id),
    invoiceNumbers: paidInvoices.map((invoice) => invoice.invoiceNumber),
    financeNoteIds: noteIds,
    paidByCurrency: summarizePaidByCurrency(paidInvoices),
    ...(input.cancellationPolicyEntitlement
      ? { cancellationPolicyEntitlement: input.cancellationPolicyEntitlement }
      : {}),
    message: "Paid booking cancelled; review refund, credit-note, or no-refund settlement.",
  }
}

export function buildPaidBookingCancellationSettlementNote(
  input: BookingCancellationSettlementInput,
): string {
  const parts = [
    `Booking ${input.bookingNumber} was cancelled from ${input.previousStatus}.`,
    "The customer-facing invoice remains paid until an operator records a refund, credit note, or no-refund decision.",
  ]
  if (input.reason) parts.push(`Cancellation reason: ${input.reason}`)
  return parts.join("\n")
}

function summarizePaidByCurrency(rows: PaidInvoice[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of rows) totals[row.currency] = (totals[row.currency] ?? 0) + row.paidCents
  return totals
}
