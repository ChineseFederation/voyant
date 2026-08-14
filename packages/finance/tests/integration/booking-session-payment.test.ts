import { bookings } from "@voyant-travel/bookings/schema"
import { newId } from "@voyant-travel/db/lib/typeid"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  BookingSessionPaymentIdempotencyConflictError,
  createOrReuseBookingSessionPayment,
  expirePendingBookingSessionPayments,
  hasInFlightBookingSessionPayment,
  transferBookingSessionPaymentToBooking,
} from "../../src/booking-session-payment.js"
import { applyPaymentAdapterCallbackEvent } from "../../src/payment-adapter-events.js"
import { paymentAuthorizations, paymentCaptures, paymentSessions } from "../../src/schema.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

describe.skipIf(!DB_AVAILABLE)("Booking Session payment continuity", () => {
  let db: ReturnType<typeof import("@voyant-travel/db/test-utils").createTestDb>

  beforeAll(async () => {
    const { createTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
  })

  afterAll(async () => {
    const { closeTestDb } = await import("@voyant-travel/db/test-utils")
    await closeTestDb()
  })

  it("converges concurrent Commit retries on one pre-Booking payment session", async () => {
    const input = {
      bookingSessionId: "bses_concurrent_payment",
      commitIdempotencyKey: "commit_concurrent_payment",
      amountCents: 5_000,
      currency: "EUR",
    }

    const [first, retry] = await Promise.all([
      createOrReuseBookingSessionPayment(db, input),
      createOrReuseBookingSessionPayment(db, input),
    ])

    expect(first?.id).toBe(retry?.id)
    await expect(db.select().from(paymentSessions)).resolves.toHaveLength(1)
  })

  it("reports a Session's money as in flight only while it can still arrive", async () => {
    // voyant#4636: while a processor holds the shopper's money, nothing may
    // release the Hold it was collected against — but a handoff the shopper
    // walked away from must stop freezing the Session, or the same guard locks
    // them out of their own checkout with nothing to wait for.
    const base = {
      bookingSessionId: "bses_in_flight_probe",
      amountCents: 5_000,
      currency: "EUR",
    }
    const now = new Date("2026-08-14T12:00:00.000Z")
    const past = new Date("2026-08-14T11:00:00.000Z")
    const future = new Date("2026-08-14T13:00:00.000Z")

    const created = await createOrReuseBookingSessionPayment(db, {
      ...base,
      commitIdempotencyKey: "commit_in_flight_probe",
      expiresAt: future,
    })
    if (!created) throw new Error("payment session not created")

    // `pending` is not a handoff — nobody has been sent anywhere yet.
    await expect(hasInFlightBookingSessionPayment(db, base.bookingSessionId, now)).resolves.toBe(
      false,
    )

    const setStatus = async (status: string, expiresAt: Date | null) => {
      await db
        .update(paymentSessions)
        .set({ status: status as never, expiresAt })
        .where(eq(paymentSessions.id, created.id))
    }

    await setStatus("requires_redirect", future)
    await expect(hasInFlightBookingSessionPayment(db, base.bookingSessionId, now)).resolves.toBe(
      true,
    )

    // The shopper opened the checkout page and never came back.
    await setStatus("requires_redirect", past)
    await expect(hasInFlightBookingSessionPayment(db, base.bookingSessionId, now)).resolves.toBe(
      false,
    )

    // Settled money does not lapse on a clock.
    await setStatus("paid", past)
    await expect(hasInFlightBookingSessionPayment(db, base.bookingSessionId, now)).resolves.toBe(
      true,
    )

    await setStatus("failed", null)
    await expect(hasInFlightBookingSessionPayment(db, base.bookingSessionId, now)).resolves.toBe(
      false,
    )
  })

  it("rejects a reused Commit key when the required amount or currency changed", async () => {
    const original = {
      bookingSessionId: "bses_changed_payment_requirement",
      commitIdempotencyKey: "commit_changed_payment_requirement",
      amountCents: 5_000,
      currency: "EUR",
    }
    await createOrReuseBookingSessionPayment(db, original)

    await expect(
      createOrReuseBookingSessionPayment(db, { ...original, amountCents: 7_500 }),
    ).rejects.toBeInstanceOf(BookingSessionPaymentIdempotencyConflictError)
    await expect(
      createOrReuseBookingSessionPayment(db, { ...original, currency: "GBP" }),
    ).rejects.toBeInstanceOf(BookingSessionPaymentIdempotencyConflictError)
    await expect(db.select().from(paymentSessions)).resolves.toHaveLength(1)
  })

  it("makes provider success versus Session expiry a terminal, duplicate-safe race", async () => {
    const session = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_expiry_race",
      commitIdempotencyKey: "commit_expiry_race",
      amountCents: 7_500,
      currency: "EUR",
    })
    if (!session) throw new Error("Payment Session was not created")

    await Promise.all([
      expirePendingBookingSessionPayments(db, "bses_expiry_race"),
      applyPaymentAdapterCallbackEvent(db, {
        eventId: "evt_booking_session_expiry_race",
        paymentSessionId: session.id,
        nextState: "paid",
        occurredAt: "2026-08-01T12:00:00.000Z",
        processorSessionId: "processor_session_expiry_race",
        processorPaymentId: "processor_payment_expiry_race",
        idempotencyKey: "callback_expiry_race",
      }),
    ])
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_booking_session_expiry_race_duplicate",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-01T12:00:01.000Z",
      processorSessionId: "processor_session_expiry_race",
      processorPaymentId: "processor_payment_expiry_race",
      idempotencyKey: "callback_expiry_race_duplicate",
    })

    const [resolved] = await db
      .select()
      .from(paymentSessions)
      .where(eq(paymentSessions.id, session.id))
    expect(["expired", "paid"]).toContain(resolved?.status)
    const authorizations = await db.select().from(paymentAuthorizations)
    const captures = await db.select().from(paymentCaptures)
    expect(authorizations).toHaveLength(resolved?.status === "paid" ? 1 : 0)
    expect(captures).toHaveLength(resolved?.status === "paid" ? 1 : 0)
  })

  it("keeps a declined attempt immutable and lets the customer start a new retry", async () => {
    const declined = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_declined_retry",
      commitIdempotencyKey: "commit_declined_attempt",
      amountCents: 8_000,
      currency: "EUR",
    })
    if (!declined) throw new Error("Payment Session was not created")
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_booking_session_declined",
      paymentSessionId: declined.id,
      nextState: "failed",
      occurredAt: "2026-08-01T12:00:00.000Z",
      processorSessionId: "processor_session_declined",
      processorPaymentId: "processor_payment_declined",
      idempotencyKey: "callback_declined",
    })

    const sameCommitRetry = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_declined_retry",
      commitIdempotencyKey: "commit_declined_attempt",
      amountCents: 8_000,
      currency: "EUR",
    })

    const retry = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_declined_retry",
      commitIdempotencyKey: "commit_customer_retry",
      amountCents: 8_000,
      currency: "EUR",
    })

    expect(sameCommitRetry?.id).toBe(declined.id)
    expect(retry?.id).not.toBe(declined.id)
    await expect(db.select().from(paymentSessions)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: declined.id, status: "failed" }),
        expect.objectContaining({ id: retry?.id, status: "pending" }),
      ]),
    )
  })

  it("transfers paid Session money and its authorization atomically to the Booking", async () => {
    const session = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_transfer_payment",
      commitIdempotencyKey: "commit_transfer_payment",
      amountCents: 9_000,
      currency: "EUR",
    })
    if (!session) throw new Error("Payment Session was not created")
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_booking_session_paid",
      paymentSessionId: session.id,
      nextState: "paid",
      occurredAt: "2026-08-01T12:00:00.000Z",
      processorSessionId: "processor_session_paid",
      processorPaymentId: "processor_payment_paid",
      idempotencyKey: "callback_paid",
    })
    const bookingId = newId("bookings")
    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: `PAY-${bookingId}`,
      status: "confirmed",
      sellCurrency: "EUR",
    })

    await db.transaction((tx) =>
      transferBookingSessionPaymentToBooking(tx, {
        paymentSessionId: session.id,
        bookingSessionId: "bses_transfer_payment",
        bookingId,
      }),
    )

    await expect(
      db.select().from(paymentSessions).where(eq(paymentSessions.id, session.id)),
    ).resolves.toEqual([
      expect.objectContaining({ targetType: "booking", targetId: bookingId, bookingId }),
    ])
    await expect(db.select().from(paymentAuthorizations)).resolves.toEqual([
      expect.objectContaining({ bookingId }),
    ])
  })

  it("rolls the payment transfer back when Booking Commit fails", async () => {
    const session = await createOrReuseBookingSessionPayment(db, {
      bookingSessionId: "bses_transfer_rollback",
      commitIdempotencyKey: "commit_transfer_rollback",
      amountCents: 9_500,
      currency: "EUR",
    })
    if (!session) throw new Error("Payment Session was not created")
    await applyPaymentAdapterCallbackEvent(db, {
      eventId: "evt_booking_session_authorized",
      paymentSessionId: session.id,
      nextState: "authorized",
      occurredAt: "2026-08-01T12:00:00.000Z",
      processorSessionId: "processor_session_authorized",
      processorPaymentId: "processor_payment_authorized",
      idempotencyKey: "callback_authorized",
    })
    const bookingId = newId("bookings")
    await db.insert(bookings).values({
      id: bookingId,
      bookingNumber: `ROLLBACK-${bookingId}`,
      status: "confirmed",
      sellCurrency: "EUR",
    })

    await expect(
      db.transaction(async (tx) => {
        await transferBookingSessionPaymentToBooking(tx, {
          paymentSessionId: session.id,
          bookingSessionId: "bses_transfer_rollback",
          bookingId,
        })
        throw new Error("injected_booking_commit_failure")
      }),
    ).rejects.toThrow("injected_booking_commit_failure")

    await expect(
      db.select().from(paymentSessions).where(eq(paymentSessions.id, session.id)),
    ).resolves.toEqual([
      expect.objectContaining({
        targetType: "booking_session",
        targetId: "bses_transfer_rollback",
      }),
    ])
    await expect(db.select().from(paymentAuthorizations)).resolves.toEqual([
      expect.objectContaining({ bookingId: null }),
    ])
  })
})
