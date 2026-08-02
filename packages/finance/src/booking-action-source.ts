import type { BookingActionSourceRuntime } from "@voyant-travel/bookings/runtime-port"
import type { BookingActionSourceSnapshot } from "@voyant-travel/bookings-contracts/booking-actions"
import { gt } from "drizzle-orm"

import { bookingPaymentSchedules } from "./schema/booking-billing.js"

function actionKind(type: (typeof bookingPaymentSchedules.$inferSelect)["scheduleType"]) {
  if (type === "deposit" || type === "hold") return "deposit_due" as const
  if (type === "balance") return "balance_due" as const
  return "installment_due" as const
}

/** Finance-owned authoritative customer payment obligations. */
export const financeBookingActionSource: BookingActionSourceRuntime = {
  id: "finance.booking-payment-obligations.v1",
  sourceModule: "finance",
  async read(db, { changedAfter }) {
    const rows = await db
      .select()
      .from(bookingPaymentSchedules)
      .where(changedAfter ? gt(bookingPaymentSchedules.updatedAt, changedAfter) : undefined)

    return rows.map((row): BookingActionSourceSnapshot => {
      const satisfied = row.status === "paid" || row.status === "waived"
      const cancelled = row.status === "cancelled" || row.status === "expired"
      const sourceState = satisfied ? "satisfied" : cancelled ? "cancelled" : "open"
      return {
        sourceModule: "finance",
        sourceType: "booking_payment_schedule",
        sourceId: row.id,
        sourceUpdatedAt: row.updatedAt.toISOString(),
        kind: actionKind(row.scheduleType),
        bookingId: row.bookingId,
        bookingSessionId: null,
        deadline: {
          semantics: "local_date_end",
          localDate: row.dueDate,
          timeZone: row.dueTimeZone,
        },
        sourceState,
        satisfiedAt: satisfied ? row.updatedAt.toISOString() : null,
        escalationPolicy: { dueWindowSeconds: 24 * 60 * 60, escalateAfterSeconds: 72 * 60 * 60 },
        operatorNextAction: sourceState === "open" ? "collect_payment" : "none",
        customerVisible: sourceState === "open" || sourceState === "satisfied",
        customerNextAction: sourceState === "open" ? "make_payment" : "none",
        safeMetadata: {
          amountCents: row.amountCents,
          currency: row.currency,
          scheduleType: row.scheduleType,
        },
      }
    })
  },
}
