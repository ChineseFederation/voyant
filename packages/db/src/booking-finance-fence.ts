import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export class BookingFinanceInsertionClosedError extends Error {
  constructor(readonly bookingId: string) {
    super(`Booking ${bookingId} no longer accepts new financial consequences`)
    this.name = "BookingFinanceInsertionClosedError"
  }
}

/**
 * Transaction-scoped fence shared by booking cancellation and Finance writers.
 * Every invoice/payment-schedule insert for a booking must acquire this lock in
 * the same transaction as the insert.
 */
export async function lockBookingFinanceInsertionFence(
  db: Pick<PostgresJsDatabase, "execute">,
  bookingId: string,
) {
  await db.execute(sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${"voyant.booking-finance-insert:"} || ${bookingId}, 0)
    )
  `)
}

export async function withBookingFinanceInsertionFence<T>(
  db: PostgresJsDatabase,
  bookingId: string,
  write: (tx: PostgresJsDatabase) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await lockBookingFinanceInsertionFence(tx, bookingId)
    await assertBookingFinanceInsertionAllowed(tx, bookingId)
    return write(tx as PostgresJsDatabase)
  })
}

export async function assertBookingFinanceInsertionAllowed(
  db: Pick<PostgresJsDatabase, "execute">,
  bookingId: string,
) {
  const result = await db.execute(sql`
    SELECT status::text AS status
    FROM bookings
    WHERE id = ${bookingId}
  `)
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
  const status = (rows[0] as { status?: string } | undefined)?.status
  if (status === "cancelled") {
    throw new BookingFinanceInsertionClosedError(bookingId)
  }
}
