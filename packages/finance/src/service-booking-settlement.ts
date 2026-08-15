import { and, asc, desc, eq, ne } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookingPaymentSchedules, invoices, payments } from "./schema.js"

type PaymentRow = typeof payments.$inferSelect
type InvoiceRow = typeof invoices.$inferSelect
type ScheduleRow = typeof bookingPaymentSchedules.$inferSelect

/** The most recent completed customer payment recorded against a booking. */
export interface BookingSettlementPayment {
  method: PaymentRow["paymentMethod"]
  /** Calendar date the payment was recorded on (`YYYY-MM-DD`). */
  date: string
  amountCents: number
  currency: string
}

/**
 * A scheduled installment that still stands. `cancelled`, `waived` and
 * `expired` rows are excluded — an obligation the operator withdrew is not
 * something a document may present as owed.
 */
export interface BookingSettlementInstallment {
  type: ScheduleRow["scheduleType"]
  status: ScheduleRow["status"]
  amountCents: number
  currency: string
  dueDate: string
}

/**
 * What a booking currently owes and has paid.
 *
 * Two different amounts sit close together here and mean opposite things:
 * `balanceDueCents` is payment-aware and drops to 0 once the booking is
 * settled, while `balanceAmountCents` is the GROSS scheduled balance
 * installment and never moves. Renderers that confuse the two tell the
 * customer they owe money they already paid.
 */
export interface BookingSettlement {
  /** Currency every amount below is expressed in. */
  currency: string
  /**
   * Completed payments against the booking's non-void invoices, net of money
   * moved back out against a credit note.
   */
  paidAmountCents: number
  /**
   * Net receivable across the booking's non-void invoices — credit notes
   * subtract — or `null` when the booking has no invoice at all. An absent
   * invoice is not a zero balance, and callers that flatten it to one report
   * settled bookings that were never billed.
   */
  balanceDueCents: number | null
  /** Amount still owed: the invoice balance, or the total less payments. */
  amountDueCents: number
  isPaidInFull: boolean
  /** Most recent customer payment. Never a credit-note refund. */
  latestCompletedPayment: BookingSettlementPayment | null
  /** Installments that still stand, oldest due date first. */
  installments: BookingSettlementInstallment[]
  /** Gross scheduled deposit installment. Not reduced by payments. */
  depositAmountCents: number
  depositDueDate: string | null
  /** Gross scheduled balance installment. Not the remaining amount owed. */
  balanceAmountCents: number
  balanceDueDate: string | null
}

export interface GetBookingSettlementOptions {
  /**
   * Currency to express amounts in. Defaults to the first non-void invoice's
   * currency. Rows in another currency contribute their base-currency amount
   * when that matches, and nothing otherwise.
   */
  currency?: string
  /**
   * Booking sell total. Used only to derive `amountDueCents` when the booking
   * has no invoice yet, where there is no balance to read.
   */
  bookingTotalCents?: number
}

/** Schedule rows a document may still present as an obligation. */
const STANDING_SCHEDULE_STATUSES = new Set<ScheduleRow["status"]>(["pending", "due", "paid"])

export const financeBookingSettlementService = {
  /**
   * Resolve a booking's settlement state — what has been paid, what is still
   * owed, and the installments behind it.
   *
   * This is the single answer for every surface that states settlement to a
   * customer (contracts, notifications, the portal). Recomputing it per caller
   * is how one document came to say "you owe -" on a booking paid in full
   * (voyant#4690).
   */
  async getBookingSettlement(
    db: PostgresJsDatabase,
    bookingId: string,
    options: GetBookingSettlementOptions = {},
  ): Promise<BookingSettlement> {
    const [invoiceRows, scheduleRows] = await Promise.all([
      db
        .select({
          invoiceType: invoices.invoiceType,
          currency: invoices.currency,
          baseCurrency: invoices.baseCurrency,
          balanceDueCents: invoices.balanceDueCents,
          baseBalanceDueCents: invoices.baseBalanceDueCents,
        })
        .from(invoices)
        .where(and(eq(invoices.bookingId, bookingId), ne(invoices.status, "void"))),
      db
        .select()
        .from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.bookingId, bookingId))
        .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt)),
    ])

    const currency = options.currency || invoiceRows[0]?.currency || ""

    const completedPayments = await db
      .select({
        invoiceType: invoices.invoiceType,
        amountCents: payments.amountCents,
        currency: payments.currency,
        baseCurrency: payments.baseCurrency,
        baseAmountCents: payments.baseAmountCents,
        paymentMethod: payments.paymentMethod,
        paymentDate: payments.paymentDate,
      })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.bookingId, bookingId),
          ne(invoices.status, "void"),
          eq(payments.status, "completed"),
        ),
      )
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt))

    const paidAmountCents = Math.max(
      0,
      completedPayments.reduce(
        (sum, payment) =>
          sum + receivableSign(payment.invoiceType) * paymentAmountInCurrency(payment, currency),
        0,
      ),
    )
    const balanceDueCents =
      invoiceRows.length > 0
        ? invoiceRows.reduce(
            (sum, invoice) =>
              sum +
              receivableSign(invoice.invoiceType) * invoiceBalanceInCurrency(invoice, currency),
            0,
          )
        : null
    const bookingTotalCents = options.bookingTotalCents ?? 0
    // An invoice is the authority on what is owed. Without one, fall back to
    // the booking's own total less what has been paid — an overpayment or a
    // credit note must not surface as a negative amount owed.
    const amountDueCents =
      balanceDueCents != null
        ? Math.max(0, balanceDueCents)
        : Math.max(0, bookingTotalCents - paidAmountCents)
    const isPaidInFull = amountDueCents <= 0

    const standing = scheduleRows.filter((row) => STANDING_SCHEDULE_STATUSES.has(row.status))
    const deposit = standing.find((row) => row.scheduleType === "deposit")
    const balance = standing.find((row) => row.scheduleType === "balance")
    const latest = completedPayments.find((payment) => receivableSign(payment.invoiceType) === 1)

    return {
      currency,
      paidAmountCents,
      balanceDueCents,
      amountDueCents,
      isPaidInFull,
      latestCompletedPayment: latest
        ? {
            method: latest.paymentMethod,
            date: latest.paymentDate,
            amountCents: latest.amountCents,
            currency: latest.currency,
          }
        : null,
      installments: standing.map((row) => ({
        type: row.scheduleType,
        status: row.status,
        amountCents: row.amountCents,
        currency: row.currency,
        dueDate: row.dueDate,
      })),
      depositAmountCents: deposit?.amountCents ?? 0,
      depositDueDate: deposit?.dueDate ?? null,
      balanceAmountCents: balance?.amountCents ?? 0,
      balanceDueDate: balance?.dueDate ?? null,
    }
  },
}

type SettlementPaymentRow = Pick<
  PaymentRow,
  "amountCents" | "currency" | "baseCurrency" | "baseAmountCents"
>

type SettlementInvoiceRow = Pick<
  InvoiceRow,
  "currency" | "baseCurrency" | "balanceDueCents" | "baseBalanceDueCents"
>

/**
 * Which way a document moves the receivable. A credit note is a negative
 * receivable — `service-profitability` applies the same sign to its totals —
 * so summing its balance as debt would tell a customer whose invoice was
 * credited that they still owe the credited amount.
 */
function receivableSign(invoiceType: InvoiceRow["invoiceType"]): 1 | -1 {
  return invoiceType === "credit_note" ? -1 : 1
}

function paymentAmountInCurrency(payment: SettlementPaymentRow, currency: string): number {
  if (!currency || payment.currency === currency) return payment.amountCents
  if (payment.baseCurrency === currency) return payment.baseAmountCents ?? 0
  return 0
}

function invoiceBalanceInCurrency(invoice: SettlementInvoiceRow, currency: string): number {
  if (!currency || invoice.currency === currency) return invoice.balanceDueCents
  if (invoice.baseCurrency === currency) return invoice.baseBalanceDueCents ?? 0
  return 0
}
