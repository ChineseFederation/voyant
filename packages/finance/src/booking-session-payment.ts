import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { paymentAuthorizations } from "./schema/payment-processing.js"
import { paymentSessions } from "./schema/payment-sessions.js"
import { financePaymentSessionService } from "./service-payment-sessions.js"
import type { FinanceServiceRuntime } from "./service-shared.js"

export type BookingSessionPaymentState =
  | "pending"
  | "requires_redirect"
  | "processing"
  | "authorized"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"

export interface CreateBookingSessionPaymentInput {
  bookingSessionId: string
  commitIdempotencyKey: string
  amountCents: number
  currency: string
  payerPersonId?: string | null
  payerOrganizationId?: string | null
  payerEmail?: string | null
  payerName?: string | null
  returnUrl?: string | null
  cancelUrl?: string | null
  expiresAt?: Date | null
  metadata?: Record<string, unknown>
}

export class BookingSessionPaymentIdempotencyConflictError extends Error {
  constructor() {
    super("booking_session_payment_idempotency_conflict")
    this.name = "BookingSessionPaymentIdempotencyConflictError"
  }
}

export function bookingSessionPaymentIdempotencyKey(input: {
  bookingSessionId: string
  commitIdempotencyKey: string
}): string {
  return `booking-session:${input.bookingSessionId}:${input.commitIdempotencyKey}`
}

export async function createOrReuseBookingSessionPayment(
  db: PostgresJsDatabase,
  input: CreateBookingSessionPaymentInput,
  runtime: FinanceServiceRuntime = {},
) {
  const [existing] = await db
    .select()
    .from(paymentSessions)
    .where(
      and(
        eq(paymentSessions.targetType, "booking_session"),
        eq(paymentSessions.targetId, input.bookingSessionId),
        sql`${paymentSessions.metadata}->>'commitIdempotencyKey' = ${input.commitIdempotencyKey}`,
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.amountCents !== input.amountCents || existing.currency !== input.currency) {
      throw new BookingSessionPaymentIdempotencyConflictError()
    }
    return existing
  }

  return financePaymentSessionService.createPaymentSession(
    db,
    {
      target: { type: "booking_session", bookingSessionId: input.bookingSessionId },
      provenance: {
        source: "storefront",
        idempotencyKey: input.commitIdempotencyKey,
      },
      targetType: "booking_session",
      targetId: input.bookingSessionId,
      status: "pending",
      currency: input.currency,
      amountCents: input.amountCents,
      paymentMethod: "credit_card",
      payerPersonId: input.payerPersonId,
      payerOrganizationId: input.payerOrganizationId,
      payerEmail: input.payerEmail,
      payerName: input.payerName,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: input.expiresAt?.toISOString() ?? null,
      idempotencyKey: bookingSessionPaymentIdempotencyKey(input),
      clientReference: input.bookingSessionId,
      metadata: {
        ...(input.metadata ?? {}),
        bookingSessionId: input.bookingSessionId,
        commitIdempotencyKey: input.commitIdempotencyKey,
      },
    },
    runtime,
  )
}

export async function findEstablishedBookingSessionPayment(
  db: PostgresJsDatabase,
  bookingSessionId: string,
  input: { amountCents: number; currency: string },
) {
  const [session] = await db
    .select()
    .from(paymentSessions)
    .where(
      and(
        eq(paymentSessions.targetType, "booking_session"),
        eq(paymentSessions.targetId, bookingSessionId),
        eq(paymentSessions.amountCents, input.amountCents),
        eq(paymentSessions.currency, input.currency),
        inArray(paymentSessions.status, ["authorized", "paid"]),
      ),
    )
    .orderBy(paymentSessions.createdAt)
    .limit(1)
  return session ?? null
}

/**
 * Money that is settled. The processor has it, and no clock releases the
 * Session from that — only committing it or refunding does.
 */
const SETTLED_BOOKING_SESSION_PAYMENT_STATES = ["authorized", "paid"] as const

/**
 * A handoff the shopper may still be standing in front of: a checkout page
 * open, or a capture the processor has not answered yet.
 *
 * `pending` is deliberately absent — a payment session exists from the moment
 * the Commit asks for one, before the shopper has been handed anywhere, so
 * counting it would freeze a Session nobody has paid against.
 */
const HANDED_OFF_BOOKING_SESSION_PAYMENT_STATES = ["requires_redirect", "processing"] as const

/**
 * Whether this Booking Session has money with a processor right now.
 *
 * The Booking Session's Quote and Hold are what the shopper is being charged
 * for, so anything that would tear them down has to know this first: while a
 * payment is in flight the shopper is no longer shopping, and a re-quote that
 * releases the Hold gives away the seat the money was collected for
 * (voyant#4636).
 *
 * A handoff only counts until it expires. Otherwise a shopper who opened the
 * checkout page and changed their mind would be locked out of their own Session
 * for its whole lifetime, unable to re-quote or reselect, with nothing to wait
 * for — freezing a Session against a payment that is never coming is the same
 * class of bug in the other direction. The expiry is the earliest of the
 * Session, Quote and Hold, so it lapses on the same clock as the seat it is
 * protecting. Settled money has no such escape: it is real until somebody
 * commits or refunds it.
 */
/**
 * The live payment this Session already has, and what it is collecting.
 *
 * {@link hasInFlightBookingSessionPayment} answers *whether* money is with a
 * processor. This answers *how much*, which is the question a Commit that wants
 * to collect a different amount has to ask before opening a second checkout
 * (voyant#4742).
 *
 * Same predicate as that one, so the two cannot disagree about what "live"
 * means: settled money, plus a handoff the shopper may still be standing in
 * front of and whose clock has not run out.
 *
 * Oldest first, because the first live payment is the one the Session is
 * already committed to — a later one is the thing being guarded against, not
 * the thing to compare with.
 */
export async function findLiveBookingSessionPayment(
  db: PostgresJsDatabase,
  bookingSessionId: string,
  now = new Date(),
) {
  const [session] = await db
    .select()
    .from(paymentSessions)
    .where(and(eq(paymentSessions.targetId, bookingSessionId), liveBookingSessionPayment(now)))
    .orderBy(paymentSessions.createdAt)
    .limit(1)
  return session ?? null
}

export async function hasInFlightBookingSessionPayment(
  db: PostgresJsDatabase,
  bookingSessionId: string,
  now = new Date(),
): Promise<boolean> {
  const [session] = await db
    .select({ id: paymentSessions.id })
    .from(paymentSessions)
    .where(and(eq(paymentSessions.targetId, bookingSessionId), liveBookingSessionPayment(now)))
    .limit(1)
  return session !== undefined
}

/**
 * What both live-payment questions mean by "live", written once.
 *
 * The two readers ask different things — whether, and how much — and a Session
 * that is frozen against re-quoting while being told it may open a second
 * checkout is worse than either answer alone.
 */
function liveBookingSessionPayment(now: Date) {
  return and(
    eq(paymentSessions.targetType, "booking_session"),
    or(
      inArray(paymentSessions.status, [...SETTLED_BOOKING_SESSION_PAYMENT_STATES]),
      and(
        inArray(paymentSessions.status, [...HANDED_OFF_BOOKING_SESSION_PAYMENT_STATES]),
        or(isNull(paymentSessions.expiresAt), gt(paymentSessions.expiresAt, now)),
      ),
    ),
  )
}

/** Must run inside the root Booking transaction. */
export async function transferBookingSessionPaymentToBooking(
  tx: PostgresJsDatabase,
  input: { paymentSessionId: string; bookingSessionId: string; bookingId: string },
) {
  const [session] = await tx
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, input.paymentSessionId))
    .for("update")
    .limit(1)
  if (!session) throw new Error("booking_session_payment_not_found")
  if (session.bookingId === input.bookingId && session.targetType === "booking") return session
  if (
    session.targetType !== "booking_session" ||
    session.targetId !== input.bookingSessionId ||
    (session.status !== "authorized" && session.status !== "paid")
  ) {
    throw new Error("booking_session_payment_not_transferable")
  }
  const [transferred] = await tx
    .update(paymentSessions)
    .set({
      targetType: "booking",
      targetId: input.bookingId,
      bookingId: input.bookingId,
      metadata: sql`coalesce(${paymentSessions.metadata}, '{}'::jsonb) || ${JSON.stringify({
        originatingBookingSessionId: input.bookingSessionId,
      })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(paymentSessions.id, input.paymentSessionId))
    .returning()
  if (!transferred) throw new Error("booking_session_payment_transfer_failed")
  if (transferred.paymentAuthorizationId) {
    await tx
      .update(paymentAuthorizations)
      .set({ bookingId: input.bookingId, updatedAt: new Date() })
      .where(eq(paymentAuthorizations.id, transferred.paymentAuthorizationId))
  }
  return transferred
}

export async function expirePendingBookingSessionPayments(
  db: PostgresJsDatabase,
  bookingSessionId: string,
  at = new Date(),
): Promise<number> {
  const rows = await db
    .update(paymentSessions)
    .set({ status: "expired", expiredAt: at, expiresAt: at, updatedAt: at })
    .where(
      and(
        eq(paymentSessions.targetType, "booking_session"),
        eq(paymentSessions.targetId, bookingSessionId),
        inArray(paymentSessions.status, ["pending", "requires_redirect", "processing"]),
      ),
    )
    .returning({ id: paymentSessions.id })
  return rows.length
}
