// agent-quality: file-size exception -- owner: commerce; checkout finalization
// (confirm booking, issue invoice, and link payments) is one cohesive
// domain operation.
import { bookingsService } from "@voyant-travel/bookings"
import { bookings } from "@voyant-travel/bookings/schema"
import {
  type CheckoutFinalizeDeps,
  type CheckoutFinalizeInput,
  runCheckoutFinalize,
} from "@voyant-travel/catalog/booking-engine"
import type { EventBus } from "@voyant-travel/core"
import {
  convertProformaToInvoice,
  issueInvoiceFromBooking,
  settleCoveredBookingPaymentSchedules,
} from "@voyant-travel/finance"
import { and, desc, eq, isNull, ne } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type CheckoutFinalizationIdentity,
  ensureCheckoutFinalization,
  getCheckoutFinalization,
  getCheckoutFinalizationDelivery,
  updateCheckoutFinalization,
  updateCheckoutFinalizationDelivery,
  withCheckoutFinalizationLock,
} from "./finalization-store.js"

export function buildCheckoutFinalizeDeps(
  db: PostgresJsDatabase,
  eventBus: EventBus,
  identity: CheckoutFinalizationIdentity,
  monthlyBookingLimit?: number | null,
): CheckoutFinalizeDeps {
  return {
    db,
    eventBus,
    confirmBooking: async (bookingId) => {
      const checkpoint = await getCheckoutFinalization(db, identity.bookingId)
      if (checkpoint?.confirmedAt) return

      const [booking] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)
      if (
        booking?.status === "confirmed" ||
        booking?.status === "in_progress" ||
        booking?.status === "completed"
      ) {
        await markBookingConfirmed(db, identity)
        return
      }

      const result = await bookingsService.confirmBooking(db, bookingId, {}, undefined, {
        eventBus,
        monthlyBookingLimit,
      })
      if (result.status === "ok") {
        await markBookingConfirmed(db, identity)
        return
      }

      if (result.status === "monthly_booking_limit_reached" && "message" in result) {
        throw new Error(`checkout-finalize: ${result.message}`)
      }

      if (result.status === "hold_expired") {
        const recovered = await bookingsService.recoverExpiredPaidBooking(
          db,
          bookingId,
          { note: "Recovered after late payment completion" },
          undefined,
          { eventBus, monthlyBookingLimit },
        )
        if (recovered.status === "ok") {
          await markBookingConfirmed(db, identity)
          return
        }
        throw new Error(`checkout-finalize: late payment recovery failed (${recovered.status})`)
      }

      if (result.status === "invalid_transition") {
        const [current] = await db
          .select({ status: bookings.status })
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1)
        if (
          current?.status === "confirmed" ||
          current?.status === "in_progress" ||
          current?.status === "completed"
        ) {
          await markBookingConfirmed(db, identity)
          return
        }
      }

      throw new Error(`checkout-finalize: booking confirmation failed (${result.status})`)
    },
    issueInvoice: async ({ bookingId, convertedFromInvoiceId }) => {
      return withCheckoutFinalizationLock(db, identity, async (tx, state) => {
        if (state.invoiceId) return { invoiceId: state.invoiceId }

        let invoiceId: string | null = null
        // The payment event's proforma path takes precedence. Never infer a
        // checkpoint from an arbitrary invoice already attached to the booking.
        if (convertedFromInvoiceId) {
          const result = await convertProformaToInvoice(
            tx,
            convertedFromInvoiceId,
            {},
            { eventBus },
          )
          if (result.status === "ok") invoiceId = result.invoice.id
          else if (result.status === "already_converted" && result.invoice) {
            invoiceId = result.invoice.id
          } else {
            throw new Error(`checkout-finalize: proforma conversion failed (${result.status})`)
          }
        } else {
          invoiceId =
            (await findPaymentSessionFinalInvoice(tx, identity)) ??
            (await issueDirectInvoice(tx, eventBus, bookingId))
        }

        if (!invoiceId) return null
        await updateCheckoutFinalization(tx, identity, state.revision, { invoiceId })
        return { invoiceId }
      })
    },
    findProformaForBooking: async (bookingId) => {
      const { invoices } = await import("@voyant-travel/finance")
      const [proforma] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.bookingId, bookingId),
            eq(invoices.invoiceType, "proforma"),
            eq(invoices.status, "paid"),
          ),
        )
        .orderBy(desc(invoices.createdAt))
        .limit(1)
      return proforma ? { invoiceId: proforma.id } : null
    },
    linkPaymentToInvoice: async ({ bookingId, invoiceId, paymentSessionId }) => {
      return withCheckoutFinalizationLock(db, identity, async (tx, state) => {
        if (!state.invoiceId) {
          throw new Error("checkout-finalize: payment linkage preceded invoice checkpoint")
        }
        if (state.invoiceId !== invoiceId) {
          throw new Error(
            "checkout-finalize: saga invoice differs from its finalization checkpoint",
          )
        }
        const delivery = await getCheckoutFinalizationDelivery(tx, identity.paymentSessionId)
        if (delivery?.paymentLinkedAt) {
          return { paymentId: state.paymentId, sessionsLinked: 0 }
        }

        const linked = await linkPaidSessions(
          tx,
          eventBus,
          bookingId,
          state.invoiceId,
          paymentSessionId,
        )
        const paymentRevision =
          linked.sessionsLinked > 0 ? state.paymentRevision + 1 : Math.max(1, state.paymentRevision)
        await updateCheckoutFinalization(tx, identity, state.revision, {
          paymentId: linked.paymentId ?? state.paymentId,
          paymentRevision,
        })
        await updateCheckoutFinalizationDelivery(tx, identity, { paymentLinkedAt: new Date() })
        return linked
      })
    },
  }
}

async function findPaymentSessionFinalInvoice(
  db: PostgresJsDatabase,
  identity: CheckoutFinalizationIdentity,
): Promise<string | null> {
  const { invoices } = await import("@voyant-travel/finance")
  const { paymentSessions } = await import("@voyant-travel/finance/schema")
  const [session] = await db
    .select({ invoiceId: paymentSessions.invoiceId })
    .from(paymentSessions)
    .where(
      and(
        eq(paymentSessions.id, identity.paymentSessionId),
        eq(paymentSessions.bookingId, identity.bookingId),
      ),
    )
    .limit(1)
  if (!session?.invoiceId) return null

  const [invoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.id, session.invoiceId),
        eq(invoices.bookingId, identity.bookingId),
        eq(invoices.invoiceType, "invoice"),
        ne(invoices.status, "void"),
      ),
    )
    .limit(1)
  return invoice?.id ?? null
}

async function issueDirectInvoice(
  db: PostgresJsDatabase,
  eventBus: EventBus,
  bookingId: string,
): Promise<string | null> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1)
  if (!booking) return null

  const { bookingItems } = await import("@voyant-travel/bookings/schema")
  const items = await db.select().from(bookingItems).where(eq(bookingItems.bookingId, bookingId))
  const today = new Date().toISOString().slice(0, 10)
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const invoice = await issueInvoiceFromBooking(
    db,
    { bookingId, issueDate: today, dueDate, invoiceType: "invoice" },
    {
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        personId: booking.personId,
        organizationId: booking.organizationId,
        sellCurrency: booking.sellCurrency,
        baseCurrency: booking.baseCurrency,
        fxRateSetId: null,
        sellAmountCents: booking.sellAmountCents,
        baseSellAmountCents: booking.baseSellAmountCents,
      },
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unitSellAmountCents: item.unitSellAmountCents,
        totalSellAmountCents: item.totalSellAmountCents,
      })),
    },
    { eventBus },
  )
  return invoice?.id ?? null
}

async function linkPaidSessions(
  db: PostgresJsDatabase,
  eventBus: EventBus,
  bookingId: string,
  invoiceId: string,
  paymentSessionId?: string,
): Promise<{ paymentId: string | null; sessionsLinked: number }> {
  const { paymentSessions } = await import("@voyant-travel/finance/schema")
  const { financeService } = await import("@voyant-travel/finance")
  const paidSessions = await db
    .select()
    .from(paymentSessions)
    .where(and(eq(paymentSessions.bookingId, bookingId), eq(paymentSessions.status, "paid")))

  let firstPaymentId: string | null = null
  let sessionsLinked = 0

  for (const session of paidSessions) {
    if (session.paymentId) continue
    if (session.invoiceId && session.invoiceId !== invoiceId) {
      throw new Error(`checkout-finalize: paid session ${session.id} is linked to another invoice`)
    }

    if (!session.invoiceId) {
      await db
        .update(paymentSessions)
        .set({ invoiceId, updatedAt: new Date() })
        .where(and(eq(paymentSessions.id, session.id), isNull(paymentSessions.invoiceId)))
    }

    // Finance owns the atomic payment + session checkpoint. If delivery
    // stops after the invoice pointer is written, a retry enters here
    // again; if this call committed, paymentId makes the retry a no-op.
    const completed = await financeService.completePaymentSession(
      db,
      session.id,
      {
        status: "paid",
        captureMode: "manual",
        providerSessionId: session.providerSessionId,
        providerPaymentId: session.providerPaymentId,
        externalReference: session.externalReference,
        paymentMethod: session.paymentMethod ?? "credit_card",
        paymentInstrumentId: session.paymentInstrumentId ?? null,
        referenceNumber:
          session.providerPaymentId ??
          session.externalReference ??
          session.providerSessionId ??
          session.id,
        paymentDate: (session.completedAt ?? new Date()).toISOString().slice(0, 10),
        notes:
          `Checkout-finalize linkage from session ${session.id}` +
          (paymentSessionId && session.id !== paymentSessionId
            ? ` (command input session: ${paymentSessionId})`
            : ""),
      },
      { eventBus },
    )
    if (!completed?.paymentId) {
      throw new Error(`checkout-finalize: paid session ${session.id} was not reconciled`)
    }

    if (!firstPaymentId) firstPaymentId = completed.paymentId
    sessionsLinked++
  }

  await settleCoveredBookingPaymentSchedules(db, bookingId)
  return { paymentId: firstPaymentId, sessionsLinked }
}

async function markBookingConfirmed(
  db: PostgresJsDatabase,
  identity: CheckoutFinalizationIdentity,
): Promise<void> {
  await withCheckoutFinalizationLock(db, identity, async (tx, state) => {
    if (state.confirmedAt) return
    await updateCheckoutFinalization(tx, identity, state.revision, { confirmedAt: new Date() })
  })
}

export interface FinalizeCheckoutParams {
  db: PostgresJsDatabase
  eventBus: EventBus
  input: CheckoutFinalizeInput
  monthlyBookingLimit?: number | null
}

/**
 * Finalize a paid checkout as an idempotent domain operation. The payment
 * subscriber owns delivery; durable event-outbox retry is the recovery path.
 * There is no customer-authored execution definition or run record.
 */
export async function finalizeCheckout(params: FinalizeCheckoutParams): Promise<void> {
  const paymentSessionId = params.input.paymentSessionId
  if (!paymentSessionId) {
    throw new Error("checkout-finalize: paymentSessionId is required for durable finalization")
  }
  const identity = { paymentSessionId, bookingId: params.input.bookingId }
  await ensureCheckoutFinalization(params.db, identity)
  const delivery = await getCheckoutFinalizationDelivery(params.db, paymentSessionId)
  if (delivery?.completedAt) return

  const deps = buildCheckoutFinalizeDeps(
    params.db,
    params.eventBus,
    identity,
    params.monthlyBookingLimit,
  )
  await runCheckoutFinalize(params.input, deps)
  await withCheckoutFinalizationLock(params.db, identity, async (tx) => {
    const current = await getCheckoutFinalizationDelivery(tx, paymentSessionId)
    if (current?.completedAt) return
    await updateCheckoutFinalizationDelivery(tx, identity, { completedAt: new Date() })
  })
}
