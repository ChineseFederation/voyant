import { bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { ACTIVE_BOOKING_STATUSES } from "@voyant-travel/bookings/status"
import { bookingPaymentSchedules, invoices, paymentSessions } from "@voyant-travel/finance/schema"
import { and, asc, desc, eq, gt, isNull, or } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type BookingDocumentAttachmentResolver,
  bookingDocumentNotificationsService,
  createDefaultBookingDocumentAttachment,
} from "./service-booking-documents.js"
import { buildNotificationPortalContext } from "./service-portal-context.js"
import type { BookingDocumentBundleItem, BookingPaymentScheduleRow } from "./service-shared.js"
import { listBookingNotificationItems, resolveReminderRecipient } from "./service-shared.js"
import type { NotificationAttachment } from "./types.js"

/**
 * Bookings a reminder may still chase. Same set as the shared
 * `ACTIVE_BOOKING_STATUSES` — a cancelled booking is owed nothing — kept under
 * the reminder vocabulary's own name and no longer restated here.
 */
export const PAYABLE_BOOKING_STATUSES = new Set<string>(ACTIVE_BOOKING_STATUSES)
export const OPEN_PAYMENT_SCHEDULE_STATUSES = new Set(["pending", "due"])

export interface BookingEventReminderRuntimeOptions {
  documentAttachmentResolver?: BookingDocumentAttachmentResolver
}

export function paymentScheduleStatusSkipReason(status: string) {
  return `payment_schedule_status_${status}`
}

export function bookingStatusSkipReason(status: string) {
  return `booking_status_${status}`
}

export async function getPaymentReminderBookingStatusSkipReason(
  db: PostgresJsDatabase,
  bookingId: string,
) {
  const [booking] = await db
    .select({ status: bookings.status })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)

  if (!booking) {
    return "booking_not_found"
  }

  return PAYABLE_BOOKING_STATUSES.has(booking.status)
    ? null
    : bookingStatusSkipReason(booking.status)
}

export async function getBookingPaymentNotificationContext(
  db: PostgresJsDatabase,
  bookingId: string,
  bookingPaymentScheduleId?: string | null,
) {
  const paymentSessionPromise = (async () => {
    if (bookingPaymentScheduleId) {
      const [schedulePaymentSession] = await db
        .select({
          id: paymentSessions.id,
          status: paymentSessions.status,
          provider: paymentSessions.provider,
          currency: paymentSessions.currency,
          amountCents: paymentSessions.amountCents,
          redirectUrl: paymentSessions.redirectUrl,
          returnUrl: paymentSessions.returnUrl,
          cancelUrl: paymentSessions.cancelUrl,
          expiresAt: paymentSessions.expiresAt,
          paymentMethod: paymentSessions.paymentMethod,
          externalReference: paymentSessions.externalReference,
        })
        .from(paymentSessions)
        .where(eq(paymentSessions.bookingPaymentScheduleId, bookingPaymentScheduleId))
        .orderBy(desc(paymentSessions.createdAt))
        .limit(1)

      if (schedulePaymentSession) {
        return schedulePaymentSession
      }
    }

    const [bookingPaymentSession] = await db
      .select({
        id: paymentSessions.id,
        status: paymentSessions.status,
        provider: paymentSessions.provider,
        currency: paymentSessions.currency,
        amountCents: paymentSessions.amountCents,
        redirectUrl: paymentSessions.redirectUrl,
        returnUrl: paymentSessions.returnUrl,
        cancelUrl: paymentSessions.cancelUrl,
        expiresAt: paymentSessions.expiresAt,
        paymentMethod: paymentSessions.paymentMethod,
        externalReference: paymentSessions.externalReference,
      })
      .from(paymentSessions)
      .where(
        and(
          eq(paymentSessions.bookingId, bookingId),
          eq(paymentSessions.targetType, "booking"),
          isNull(paymentSessions.bookingPaymentScheduleId),
        ),
      )
      .orderBy(desc(paymentSessions.createdAt))
      .limit(1)

    return bookingPaymentSession ?? null
  })()

  const [[paymentSchedule], [invoice], paymentSession] = await Promise.all([
    db
      .select({
        id: bookingPaymentSchedules.id,
        bookingId: bookingPaymentSchedules.bookingId,
        scheduleType: bookingPaymentSchedules.scheduleType,
        status: bookingPaymentSchedules.status,
        dueDate: bookingPaymentSchedules.dueDate,
        currency: bookingPaymentSchedules.currency,
        amountCents: bookingPaymentSchedules.amountCents,
        createdAt: bookingPaymentSchedules.createdAt,
      })
      .from(bookingPaymentSchedules)
      .where(
        and(
          eq(bookingPaymentSchedules.bookingId, bookingId),
          or(
            eq(bookingPaymentSchedules.status, "pending"),
            eq(bookingPaymentSchedules.status, "due"),
          ),
        ),
      )
      .orderBy(asc(bookingPaymentSchedules.dueDate), asc(bookingPaymentSchedules.createdAt))
      .limit(1),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceType: invoices.invoiceType,
        status: invoices.status,
        currency: invoices.currency,
        subtotalCents: invoices.subtotalCents,
        taxCents: invoices.taxCents,
        totalCents: invoices.totalCents,
        paidCents: invoices.paidCents,
        balanceDueCents: invoices.balanceDueCents,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(eq(invoices.bookingId, bookingId))
      .orderBy(desc(invoices.createdAt))
      .limit(1),
    paymentSessionPromise,
  ])

  return {
    paymentSchedule: paymentSchedule ?? null,
    invoice: invoice ?? null,
    paymentSession: paymentSession ?? null,
  }
}

export async function getBookingEventDocumentContext(
  db: PostgresJsDatabase,
  bookingId: string,
  attachmentResolver?: BookingDocumentAttachmentResolver,
): Promise<{
  documents: BookingDocumentBundleItem[]
  attachments: NotificationAttachment[]
}> {
  const bundle = await bookingDocumentNotificationsService.listBookingDocumentBundle(db, bookingId)
  const documents = bundle?.documents ?? []
  if (documents.length === 0) {
    return { documents, attachments: [] }
  }

  const resolver =
    attachmentResolver ??
    (async (document: BookingDocumentBundleItem) =>
      createDefaultBookingDocumentAttachment(document))
  const attachments = (await Promise.all(documents.map((document) => resolver(document)))).filter(
    (attachment): attachment is NotificationAttachment => Boolean(attachment),
  )

  return { documents, attachments }
}

function amountFromCents(value: number | null | undefined) {
  return typeof value === "number" ? value / 100 : null
}

function serializeReminderTraveler(
  traveler: {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    participantType?: string | null
    isPrimary?: boolean | null
  } | null,
  email: string | null,
) {
  return traveler
    ? {
        firstName: traveler.firstName ?? "",
        lastName: traveler.lastName ?? "",
        email,
        participantType: traveler.participantType ?? "traveler",
        isPrimary: traveler.isPrimary ?? false,
      }
    : null
}

function serializeReminderBooking(booking: {
  id: string
  bookingNumber: string
  status: string
  startDate: string | Date | null
  endDate: string | Date | null
  sellCurrency: string
  sellAmountCents: number | null
}) {
  const totalAmount = amountFromCents(booking.sellAmountCents)

  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    reference: booking.bookingNumber,
    code: booking.bookingNumber,
    number: booking.bookingNumber,
    status: booking.status,
    startDate: booking.startDate,
    endDate: booking.endDate,
    sellCurrency: booking.sellCurrency,
    currency: booking.sellCurrency,
    sellAmountCents: booking.sellAmountCents,
    totalAmountCents: booking.sellAmountCents,
    totalAmount,
    total: totalAmount,
    totalPrice: totalAmount,
  }
}

export function serializeBookingPaymentContext(
  context: Awaited<ReturnType<typeof getBookingPaymentNotificationContext>>,
  paymentScheduleOverride?: BookingPaymentScheduleRow | null,
  bookingReference?: string | null,
) {
  const schedule = paymentScheduleOverride ?? context.paymentSchedule
  const amountDue = amountFromCents(schedule?.amountCents)
  const invoiceBalanceDue = amountFromCents(context.invoice?.balanceDueCents)
  const invoicePaidAmount = amountFromCents(context.invoice?.paidCents)
  const paymentSessionAmount = amountFromCents(context.paymentSession?.amountCents)

  return {
    invoice: context.invoice
      ? {
          id: context.invoice.id,
          invoiceNumber: context.invoice.invoiceNumber,
          invoiceType: context.invoice.invoiceType,
          status: context.invoice.status,
          currency: context.invoice.currency,
          subtotalCents: context.invoice.subtotalCents,
          taxCents: context.invoice.taxCents,
          totalCents: context.invoice.totalCents,
          paidCents: context.invoice.paidCents,
          balanceDueCents: context.invoice.balanceDueCents,
          issueDate: context.invoice.issueDate,
          dueDate: context.invoice.dueDate,
        }
      : null,
    paymentSession: context.paymentSession
      ? {
          id: context.paymentSession.id,
          status: context.paymentSession.status,
          provider: context.paymentSession.provider,
          currency: context.paymentSession.currency,
          amountCents: context.paymentSession.amountCents,
          redirectUrl: context.paymentSession.redirectUrl,
          returnUrl: context.paymentSession.returnUrl,
          cancelUrl: context.paymentSession.cancelUrl,
          expiresAt: context.paymentSession.expiresAt,
          paymentMethod: context.paymentSession.paymentMethod,
          externalReference: context.paymentSession.externalReference,
        }
      : null,
    paymentSchedule: schedule
      ? {
          id: schedule.id,
          dueDate: schedule.dueDate,
          amountCents: schedule.amountCents,
          amountDue,
          currency: schedule.currency,
          scheduleType: schedule.scheduleType,
          type: schedule.scheduleType,
          status: schedule.status,
        }
      : null,
    payment: schedule
      ? {
          amount: amountDue,
          amountCents: schedule.amountCents,
          currency:
            schedule.currency ??
            context.invoice?.currency ??
            context.paymentSession?.currency ??
            null,
          dueDate: schedule.dueDate,
          reference: bookingReference ?? context.invoice?.invoiceNumber ?? null,
          method: context.paymentSession?.paymentMethod ?? context.paymentSession?.provider ?? null,
          link: context.paymentSession?.redirectUrl ?? null,
          payMode: schedule.scheduleType,
          paidAmount: invoicePaidAmount,
          balanceDue: invoiceBalanceDue ?? amountDue,
          isPaidInFull: context.invoice ? context.invoice.balanceDueCents === 0 : false,
        }
      : context.paymentSession
        ? {
            amount: paymentSessionAmount,
            amountCents: context.paymentSession.amountCents,
            currency: context.paymentSession.currency,
            dueDate: null,
            reference: context.paymentSession.externalReference ?? null,
            method: context.paymentSession.paymentMethod ?? context.paymentSession.provider ?? null,
            link: context.paymentSession.redirectUrl ?? null,
            payMode: null,
            paidAmount: null,
            balanceDue: invoiceBalanceDue,
            isPaidInFull: context.invoice ? context.invoice.balanceDueCents === 0 : false,
          }
        : null,
  }
}

export async function buildBookingPaymentReminderTemplateData(
  db: PostgresJsDatabase,
  schedule: BookingPaymentScheduleRow,
  recipientEmail?: string | null,
  extraData: Record<string, unknown> = {},
  options: { publicCustomerPortalBaseUrl?: string | null } = {},
) {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingNumber: bookings.bookingNumber,
      status: bookings.status,
      personId: bookings.personId,
      organizationId: bookings.organizationId,
      contactFirstName: bookings.contactFirstName,
      contactLastName: bookings.contactLastName,
      contactEmail: bookings.contactEmail,
      contactPhone: bookings.contactPhone,
      contactPreferredLanguage: bookings.contactPreferredLanguage,
      notificationsSuppressed: bookings.notificationsSuppressed,
      sellCurrency: bookings.sellCurrency,
      sellAmountCents: bookings.sellAmountCents,
      startDate: bookings.startDate,
      endDate: bookings.endDate,
    })
    .from(bookings)
    .where(eq(bookings.id, schedule.bookingId))
    .limit(1)

  if (!booking) {
    return null
  }

  const [participants, items, paymentContext] = await Promise.all([
    db
      .select({
        id: bookingTravelers.id,
        firstName: bookingTravelers.firstName,
        lastName: bookingTravelers.lastName,
        email: bookingTravelers.email,
        participantType: bookingTravelers.participantType,
        isPrimary: bookingTravelers.isPrimary,
      })
      .from(bookingTravelers)
      .where(eq(bookingTravelers.bookingId, booking.id))
      .orderBy(desc(bookingTravelers.isPrimary), bookingTravelers.createdAt),
    listBookingNotificationItems(db, booking.id),
    getBookingPaymentNotificationContext(db, booking.id, schedule.id),
  ])

  const fallbackRecipient = resolveReminderRecipient(booking, participants)
  const traveler =
    participants.find((entry) => entry.email === recipientEmail) ??
    (fallbackRecipient?.email === recipientEmail ? fallbackRecipient : fallbackRecipient) ??
    null
  const resolvedRecipientEmail = recipientEmail ?? traveler?.email ?? null

  return {
    booking,
    participants,
    items,
    traveler,
    recipientEmail: resolvedRecipientEmail,
    data: {
      ...extraData,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      dueDate: schedule.dueDate,
      amountCents: schedule.amountCents,
      currency: schedule.currency,
      scheduleType: schedule.scheduleType,
      traveler: serializeReminderTraveler(traveler, resolvedRecipientEmail),
      travelers: participants,
      booking: serializeReminderBooking(booking),
      ...serializeBookingPaymentContext(paymentContext, schedule, booking.bookingNumber),
      items,
      portal: buildNotificationPortalContext(options.publicCustomerPortalBaseUrl, booking.id),
    },
  }
}

export async function hasOutstandingBookingBalance(db: PostgresJsDatabase, bookingId: string) {
  const [openSchedule] = await db
    .select({ id: bookingPaymentSchedules.id })
    .from(bookingPaymentSchedules)
    .where(
      and(
        eq(bookingPaymentSchedules.bookingId, bookingId),
        or(
          eq(bookingPaymentSchedules.status, "pending"),
          eq(bookingPaymentSchedules.status, "due"),
        ),
      ),
    )
    .limit(1)

  if (openSchedule) {
    return true
  }

  const [openInvoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.bookingId, bookingId),
        gt(invoices.balanceDueCents, 0),
        or(
          eq(invoices.status, "issued"),
          eq(invoices.status, "partially_paid"),
          eq(invoices.status, "overdue"),
        ),
      ),
    )
    .limit(1)

  return Boolean(openInvoice)
}
