import { bookings } from "@voyant-travel/bookings/schema"
import { invoices, paymentSessions } from "@voyant-travel/finance/schema"
import { desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { type notificationChannelEnum, notificationDeliveries } from "./schema.js"
import {
  attachmentsFromMetadata,
  metadataWithoutFailureLog,
  resolveNotificationPaymentUrl,
} from "./service-delivery-metadata.js"
import { enqueueNotification } from "./service-durable-send.js"
import type {
  NotificationDeliveryListQuery,
  NotificationService,
  SendInvoiceNotificationInput,
  SendPaymentSessionNotificationInput,
} from "./service-shared.js"
import {
  buildWhereClause,
  listBookingNotificationItems,
  listBookingNotificationParticipants,
  NotificationError,
  paginate,
  resolveReminderRecipient,
} from "./service-shared.js"
import type { NotificationAttachment } from "./types.js"

export { resolveNotificationPaymentUrl } from "./service-delivery-metadata.js"

interface InternalDomainNotificationInput {
  idempotencyKey: string
  templateId?: string | null
  templateSlug?: string | null
  channel?: (typeof notificationChannelEnum.enumValues)[number]
  provider?: string | null
  to?: string | null
  from?: string | null
  subject?: string | null
  html?: string | null
  text?: string | null
  attachments?: ReadonlyArray<NotificationAttachment> | null
  data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  reminderRunId?: string | null
  scheduledFor?: string | null
  paymentLinkBaseUrl?: string | null
}

export interface SendInvoiceReminderNotificationInput {
  idempotencyKey: string
  templateId?: string | null
  templateSlug?: string | null
  channel: (typeof notificationChannelEnum.enumValues)[number]
  provider?: string | null
  to: string
  data?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  reminderRunId: string
  scheduledFor: string
}

export async function listDeliveries(db: PostgresJsDatabase, query: NotificationDeliveryListQuery) {
  const conditions = []
  if (query.channel) conditions.push(eq(notificationDeliveries.channel, query.channel))
  if (query.provider) conditions.push(eq(notificationDeliveries.provider, query.provider))
  if (query.status) conditions.push(eq(notificationDeliveries.status, query.status))
  if (query.templateSlug)
    conditions.push(eq(notificationDeliveries.templateSlug, query.templateSlug))
  if (query.targetType) conditions.push(eq(notificationDeliveries.targetType, query.targetType))
  if (query.targetId) conditions.push(eq(notificationDeliveries.targetId, query.targetId))
  if (query.bookingId) conditions.push(eq(notificationDeliveries.bookingId, query.bookingId))
  if (query.invoiceId) conditions.push(eq(notificationDeliveries.invoiceId, query.invoiceId))
  if (query.paymentSessionId) {
    conditions.push(eq(notificationDeliveries.paymentSessionId, query.paymentSessionId))
  }
  if (query.personId) conditions.push(eq(notificationDeliveries.personId, query.personId))
  if (query.organizationId) {
    conditions.push(eq(notificationDeliveries.organizationId, query.organizationId))
  }

  const where = buildWhereClause(conditions)
  return paginate(
    db
      .select()
      .from(notificationDeliveries)
      .where(where)
      .limit(query.limit)
      .offset(query.offset)
      .orderBy(desc(notificationDeliveries.createdAt)),
    db.select({ count: sql<number>`count(*)::int` }).from(notificationDeliveries).where(where),
    query.limit,
    query.offset,
  )
}

export async function getDeliveryById(db: PostgresJsDatabase, id: string) {
  const [row] = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.id, id))
    .limit(1)
  return row ?? null
}

export async function resendDelivery(
  db: PostgresJsDatabase,
  registry: NotificationService,
  id: string,
  idempotencyKey: string,
) {
  const original = await getDeliveryById(db, id)
  if (!original) return null

  const previousMetadata = metadataWithoutFailureLog(original.metadata)
  return enqueueNotification({
    db,
    registry,
    input: {
      idempotencyKey,
      templateId: original.templateId,
      templateSlug: original.templateSlug,
      channel: original.channel,
      provider: original.provider,
      to: original.toAddress,
      from: original.fromAddress,
      subject: original.subject,
      html: original.htmlBody,
      text: original.textBody,
      attachments: attachmentsFromMetadata(original.metadata),
      data: original.payloadData,
      targetType: original.targetType,
      targetId: original.targetId,
      bookingId: original.bookingId,
      invoiceId: original.invoiceId,
      paymentSessionId: original.paymentSessionId,
      personId: original.personId,
      organizationId: original.organizationId,
      metadata: {
        ...(previousMetadata ?? {}),
        resendOfDeliveryId: original.id,
        previousStatus: original.status,
      },
      scheduledFor: null,
    },
  })
}

export async function sendPaymentSessionNotification(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  sessionId: string,
  input: SendPaymentSessionNotificationInput,
  options: { paymentLinkBaseUrl?: string | null } = {},
) {
  const request: InternalDomainNotificationInput = { ...input, ...options }
  const [session] = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.id, sessionId))
    .limit(1)
  if (!session) {
    return null
  }

  const booking = session.bookingId
    ? ((await db.select().from(bookings).where(eq(bookings.id, session.bookingId)).limit(1))[0] ??
      null)
    : null
  const invoice = session.invoiceId
    ? ((await db.select().from(invoices).where(eq(invoices.id, session.invoiceId)).limit(1))[0] ??
      null)
    : null

  const [participants, items] = booking
    ? await Promise.all([
        listBookingNotificationParticipants(db, booking.id),
        listBookingNotificationItems(db, booking.id),
      ])
    : [[], []]
  const recipient = resolveReminderRecipient(booking ?? null, participants)
  const to = request.to ?? session.payerEmail ?? recipient?.email ?? null

  if (!to) {
    throw new NotificationError("No recipient available for payment session notification")
  }

  return enqueueNotification({
    db,
    registry: dispatcher,
    input: {
      idempotencyKey: request.idempotencyKey,
      templateId: request.templateId ?? null,
      templateSlug: request.templateSlug ?? null,
      channel: request.channel,
      provider: request.provider ?? null,
      to,
      from: request.from ?? null,
      subject: request.subject ?? null,
      html: request.html ?? null,
      text: request.text ?? null,
      data: {
        paymentSession: {
          id: session.id,
          status: session.status,
          provider: session.provider,
          currency: session.currency,
          amountCents: session.amountCents,
          paymentUrl: resolveNotificationPaymentUrl(session.id, {
            paymentLinkBaseUrl: request.paymentLinkBaseUrl,
            redirectUrl: session.redirectUrl,
          }),
          redirectUrl: session.redirectUrl,
          returnUrl: session.returnUrl,
          cancelUrl: session.cancelUrl,
          expiresAt: session.expiresAt,
          paymentMethod: session.paymentMethod,
          externalReference: session.externalReference,
        },
        booking: booking
          ? {
              id: booking.id,
              bookingNumber: booking.bookingNumber,
              startDate: booking.startDate,
              endDate: booking.endDate,
              sellCurrency: booking.sellCurrency,
              sellAmountCents: booking.sellAmountCents,
            }
          : null,
        invoice: invoice
          ? {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              invoiceType: invoice.invoiceType,
              status: invoice.status,
              currency: invoice.currency,
              totalCents: invoice.totalCents,
              balanceDueCents: invoice.balanceDueCents,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
            }
          : null,
        traveler: recipient
          ? {
              firstName: recipient.firstName,
              lastName: recipient.lastName,
              email: recipient.email,
              participantType: recipient.participantType,
              isPrimary: recipient.isPrimary,
            }
          : null,
        travelers: participants,
        items,
        ...(request.data ?? {}),
      },
      targetType: "payment_session",
      targetId: session.id,
      bookingId: session.bookingId ?? null,
      invoiceId: session.invoiceId ?? null,
      paymentSessionId: session.id,
      reminderRunId: request.reminderRunId ?? null,
      personId: session.payerPersonId ?? booking?.personId ?? null,
      organizationId: session.payerOrganizationId ?? booking?.organizationId ?? null,
      metadata: request.metadata ?? null,
      scheduledFor: request.scheduledFor ?? null,
    },
  })
}

export async function sendInvoiceNotification(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  invoiceId: string,
  input: SendInvoiceNotificationInput,
  options: { paymentLinkBaseUrl?: string | null } = {},
) {
  return sendInvoiceNotificationInternal(db, dispatcher, invoiceId, { ...input, ...options })
}

export async function sendInvoiceReminderNotification(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  invoiceId: string,
  input: SendInvoiceReminderNotificationInput,
) {
  return sendInvoiceNotificationInternal(db, dispatcher, invoiceId, input)
}

async function sendInvoiceNotificationInternal(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  invoiceId: string,
  input: InternalDomainNotificationInput,
) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!invoice) {
    return null
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, invoice.bookingId))
    .limit(1)
  const [participants, items] = booking
    ? await Promise.all([
        listBookingNotificationParticipants(db, booking.id),
        listBookingNotificationItems(db, booking.id),
      ])
    : [[], []]
  const recipient = resolveReminderRecipient(booking ?? null, participants)

  const [latestSession] = await db
    .select()
    .from(paymentSessions)
    .where(eq(paymentSessions.invoiceId, invoice.id))
    .orderBy(desc(paymentSessions.createdAt))
    .limit(1)

  const to = input.to ?? latestSession?.payerEmail ?? recipient?.email ?? null
  if (!to) {
    throw new NotificationError("No recipient available for invoice notification")
  }

  return enqueueNotification({
    db,
    registry: dispatcher,
    input: {
      idempotencyKey: input.idempotencyKey,
      templateId: input.templateId ?? null,
      templateSlug: input.templateSlug ?? null,
      channel: input.channel,
      provider: input.provider ?? null,
      to,
      from: input.from ?? null,
      subject: input.subject ?? null,
      html: input.html ?? null,
      text: input.text ?? null,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceType: invoice.invoiceType,
          status: invoice.status,
          currency: invoice.currency,
          subtotalCents: invoice.subtotalCents,
          taxCents: invoice.taxCents,
          totalCents: invoice.totalCents,
          paidCents: invoice.paidCents,
          balanceDueCents: invoice.balanceDueCents,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
        },
        booking: booking
          ? {
              id: booking.id,
              bookingNumber: booking.bookingNumber,
              startDate: booking.startDate,
              endDate: booking.endDate,
              sellCurrency: booking.sellCurrency,
              sellAmountCents: booking.sellAmountCents,
            }
          : null,
        paymentSession: latestSession
          ? {
              id: latestSession.id,
              status: latestSession.status,
              provider: latestSession.provider,
              paymentUrl: resolveNotificationPaymentUrl(latestSession.id, {
                paymentLinkBaseUrl: input.paymentLinkBaseUrl,
                redirectUrl: latestSession.redirectUrl,
              }),
              redirectUrl: latestSession.redirectUrl,
              expiresAt: latestSession.expiresAt,
              amountCents: latestSession.amountCents,
              currency: latestSession.currency,
            }
          : null,
        traveler: recipient
          ? {
              firstName: recipient.firstName,
              lastName: recipient.lastName,
              email: recipient.email,
              participantType: recipient.participantType,
              isPrimary: recipient.isPrimary,
            }
          : null,
        travelers: participants,
        items,
        ...(input.data ?? {}),
      },
      targetType: "invoice",
      targetId: invoice.id,
      bookingId: invoice.bookingId,
      invoiceId: invoice.id,
      paymentSessionId: latestSession?.id ?? null,
      reminderRunId: input.reminderRunId ?? null,
      personId: invoice.personId ?? booking?.personId ?? null,
      organizationId: invoice.organizationId ?? booking?.organizationId ?? null,
      metadata: input.metadata ?? null,
      scheduledFor: input.scheduledFor ?? null,
    },
  })
}
