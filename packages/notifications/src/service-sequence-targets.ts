import { bookings } from "@voyant-travel/bookings/schema"
import { ACTIVE_BOOKING_STATUSES } from "@voyant-travel/bookings/status"
import { bookingPaymentSchedules, invoices } from "@voyant-travel/finance/schema"
import { and, eq, gt, gte, inArray, lte, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { NotificationReminderRule, NotificationReminderRuleStage } from "./schema.js"
import type { ReminderTargetSnapshot } from "./service-sequence.js"
import { addUtcDays, startOfUtcDay } from "./service-shared.js"
import type { BookingActionDeadlineResolver } from "./task-runtime.js"

/**
 * Computes the date range a target's `due_date` (or `issue_date`) needs to
 * fall in for any of the rule's stages to be inside their eligibility window
 * today.
 *
 * From `inWindow`: today must satisfy
 *   anchor + windowStartDays ≤ today ≤ anchor + windowEndDays
 * Solving for anchor:
 *   today − windowEndDays ≤ anchor ≤ today − windowStartDays
 *
 * Across all stages with anchor=`due_date`, we union the [start, end] ranges
 * and use the resulting envelope as a SQL `BETWEEN` filter. Returns null when
 * no stage is anchored on the requested column (e.g. all stages anchor on
 * `departure_date`) — caller should skip the pushdown in that case.
 */
export function computeAnchorDateEnvelope(
  stages: NotificationReminderRuleStage[],
  today: Date,
  anchor: NotificationReminderRuleStage["anchor"],
): { from: string; to: string } | null {
  const matching = stages.filter((s) => s.anchor === anchor)
  if (matching.length === 0) return null
  const todayStart = startOfUtcDay(today)
  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (const stage of matching) {
    const fromDays = -stage.windowEndDays
    const toDays = -stage.windowStartDays
    if (fromDays < from) from = fromDays
    if (toDays > to) to = toDays
  }
  return {
    from: addUtcDays(todayStart, from).toISOString().slice(0, 10),
    to: addUtcDays(todayStart, to).toISOString().slice(0, 10),
  }
}

type DateEnvelopes = {
  /** When set, only fetch payment schedules whose `due_date` falls in this range. */
  paymentScheduleDueDate?: { from: string; to: string }
  /** When set, only fetch invoices whose `due_date` falls in this range. */
  invoiceDueDate?: { from: string; to: string }
  /** When set, only fetch invoices whose `issue_date` falls in this range. */
  invoiceIssueDate?: { from: string; to: string }
}

async function fetchOpenPaymentScheduleTargets(
  db: PostgresJsDatabase,
  envelopes: DateEnvelopes = {},
  resolveBookingActionDeadline?: BookingActionDeadlineResolver,
): Promise<ReminderTargetSnapshot[]> {
  const conditions = [
    or(eq(bookingPaymentSchedules.status, "pending"), eq(bookingPaymentSchedules.status, "due")),
    inArray(bookings.status, ACTIVE_BOOKING_STATUSES),
  ]
  if (envelopes.paymentScheduleDueDate) {
    conditions.push(
      gte(bookingPaymentSchedules.dueDate, envelopes.paymentScheduleDueDate.from),
      lte(bookingPaymentSchedules.dueDate, envelopes.paymentScheduleDueDate.to),
    )
  }
  const rows = await db
    .select({
      id: bookingPaymentSchedules.id,
      bookingId: bookingPaymentSchedules.bookingId,
      dueDate: bookingPaymentSchedules.dueDate,
      status: bookingPaymentSchedules.status,
      bookingCreatedAt: bookings.createdAt,
      departureDate: bookings.startDate,
    })
    .from(bookingPaymentSchedules)
    .leftJoin(bookings, eq(bookings.id, bookingPaymentSchedules.bookingId))
    .where(and(...conditions))
  const projectedDeadlines = resolveBookingActionDeadline
    ? await resolveBookingActionDeadline({
        sourceModule: "finance",
        sourceType: "booking_payment_schedule",
        sourceIds: rows.map(({ id }) => id),
      })
    : new Map<string, string>()
  return rows.map((row) => ({
    id: row.id,
    bookingId: row.bookingId,
    dueDate: row.dueDate,
    dueAt: projectedDeadlines.get(row.id) ?? null,
    issuedAt: null,
    departureDate: row.departureDate,
    bookingCreatedAt: row.bookingCreatedAt ? row.bookingCreatedAt.toISOString() : null,
    status: row.status,
    isTerminal: row.status !== "pending" && row.status !== "due",
  }))
}

async function fetchOpenInvoiceTargets(
  db: PostgresJsDatabase,
  envelopes: DateEnvelopes = {},
): Promise<ReminderTargetSnapshot[]> {
  const conditions = [
    gt(invoices.balanceDueCents, 0),
    or(eq(invoices.invoiceType, "invoice"), eq(invoices.invoiceType, "proforma")),
    or(
      eq(invoices.status, "issued"),
      eq(invoices.status, "partially_paid"),
      eq(invoices.status, "overdue"),
    ),
  ]
  if (envelopes.invoiceDueDate) {
    conditions.push(
      gte(invoices.dueDate, envelopes.invoiceDueDate.from),
      lte(invoices.dueDate, envelopes.invoiceDueDate.to),
    )
  }
  if (envelopes.invoiceIssueDate) {
    conditions.push(
      gte(invoices.issueDate, envelopes.invoiceIssueDate.from),
      lte(invoices.issueDate, envelopes.invoiceIssueDate.to),
    )
  }
  const rows = await db
    .select({
      id: invoices.id,
      bookingId: invoices.bookingId,
      dueDate: invoices.dueDate,
      issueDate: invoices.issueDate,
      balanceDueCents: invoices.balanceDueCents,
      invoiceType: invoices.invoiceType,
      status: invoices.status,
      bookingCreatedAt: bookings.createdAt,
      departureDate: bookings.startDate,
    })
    .from(invoices)
    .leftJoin(bookings, eq(bookings.id, invoices.bookingId))
    .where(and(...conditions))
  return rows.map((row) => ({
    id: row.id,
    bookingId: row.bookingId,
    dueDate: row.dueDate,
    dueAt: null,
    issuedAt: row.issueDate,
    departureDate: row.departureDate,
    bookingCreatedAt: row.bookingCreatedAt ? row.bookingCreatedAt.toISOString() : null,
    status: row.status,
    isTerminal: row.balanceDueCents <= 0,
  }))
}

/**
 * Per-rule target fetch that pushes a date envelope into the WHERE when all
 * relevant stages share an anchor we can SQL-filter on (`due_date` for both
 * target types, `invoice_issued_at` for invoices). Other anchors fall through
 * to the unfiltered fetch — they're expected to be rare and the in-app
 * window check still rejects misses.
 */
export async function fetchTargetsForRule(
  db: PostgresJsDatabase,
  rule: NotificationReminderRule,
  stages: NotificationReminderRuleStage[] = [],
  today: Date = new Date(),
  resolveBookingActionDeadline?: BookingActionDeadlineResolver,
): Promise<ReminderTargetSnapshot[]> {
  if (rule.targetType === "booking_payment_schedule") {
    const dueEnv = computeAnchorDateEnvelope(stages, today, "due_date")
    return fetchOpenPaymentScheduleTargets(
      db,
      // A local business date cannot be safely pushed down against a UTC
      // envelope. When the authoritative projection is selected, fetch the
      // open set and let the exact projected instant drive the stage window.
      !resolveBookingActionDeadline && dueEnv ? { paymentScheduleDueDate: dueEnv } : {},
      resolveBookingActionDeadline,
    )
  }
  if (rule.targetType === "invoice") {
    const dueEnv = computeAnchorDateEnvelope(stages, today, "due_date")
    const issueEnv = computeAnchorDateEnvelope(stages, today, "invoice_issued_at")
    return fetchOpenInvoiceTargets(db, {
      invoiceDueDate: dueEnv ?? undefined,
      invoiceIssueDate: issueEnv ?? undefined,
    })
  }
  return []
}
