/**
 * Canonical booking-reference minting.
 *
 * `bookingNumber` is the immutable idempotency anchor of the durable
 * `create_booking` command, so it has to be stable *before* the command runs —
 * minting it inside the create would hand a retry a fresh reference and duplicate
 * the booking. Callers therefore allocate a reference first and pass the same
 * value on every retry.
 *
 * Before this module every caller invented its own reference, which is how
 * agent-authored bookings ended up with values derived from the traveller's
 * name. `allocateBookingNumber` is the one sanctioned source.
 */
import { bookings } from "@voyant-travel/bookings/schema"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/** `BK-YYMM-NNNNNN` — the shape the storefront and admin already emit. */
export const BOOKING_NUMBER_PATTERN = /^BK-\d{4}-\d{6}$/

const SEQUENCE_MAX = 999_999
const MAX_ATTEMPTS = 25

export function formatBookingNumber(now: Date, sequence: number): string {
  const year = now.getUTCFullYear().toString().slice(-2)
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `BK-${year}${month}-${String(sequence).padStart(6, "0")}`
}

function randomSequence(): number {
  const buffer = new Uint32Array(1)
  crypto.getRandomValues(buffer)
  return ((buffer[0] ?? 0) % SEQUENCE_MAX) + 1
}

export interface AllocateBookingNumberOptions {
  now?: Date
  /** Injected in tests to make the candidate stream deterministic. */
  nextSequence?: () => number
}

/**
 * Allocate a booking reference that is free at allocation time.
 *
 * `bookings.booking_number` carries a unique constraint, so a create racing
 * another allocation still fails closed at the database rather than silently
 * reusing a reference; the probe here keeps that from being the common path.
 */
export async function allocateBookingNumber(
  db: PostgresJsDatabase,
  options: AllocateBookingNumberOptions = {},
): Promise<string> {
  const now = options.now ?? new Date()
  const nextSequence = options.nextSequence ?? randomSequence

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = formatBookingNumber(now, nextSequence())
    const existing = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(eq(bookings.bookingNumber, candidate))
      .limit(1)
    if (existing.length === 0) return candidate
  }

  throw new Error(
    `Could not allocate a free booking reference after ${MAX_ATTEMPTS} attempts. The current period's reference space is exhausted.`,
  )
}
