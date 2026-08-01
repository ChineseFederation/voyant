import { and, eq, inArray, sql } from "drizzle-orm"
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
