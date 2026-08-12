import { bookings, bookingTravelers } from "@voyant-travel/bookings/schema"
import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  notificationReminderRules,
  notificationReminderRuns,
  notificationTemplates,
} from "./schema.js"
import { enqueueNotification } from "./service-durable-send.js"
import {
  type BookingEventReminderRuntimeOptions,
  getBookingEventDocumentContext,
  getBookingPaymentNotificationContext,
  hasOutstandingBookingBalance,
  serializeBookingPaymentContext,
} from "./service-reminder-booking-context.js"
import { markReminderRunFailed, markReminderRunSkipped } from "./service-reminder-run-state.js"
import type {
  BookingDocumentBundleItem,
  NotificationReminderRuleRow,
  NotificationService,
} from "./service-shared.js"
import {
  buildReminderDedupeKey,
  listBookingNotificationItems,
  resolveReminderRecipient,
} from "./service-shared.js"

type ReminderTargetType = NotificationReminderRuleRow["targetType"]
type BookingEventReminderTargetType = Extract<
  ReminderTargetType,
  "booking_confirmed" | "payment_complete" | "booking_cancelled_non_payment"
>

const BOOKING_DOCUMENT_TYPES = new Set(["contract", "invoice", "proforma", "brochure"])

function configuredAttachmentTypes(metadata: Record<string, unknown> | null) {
  const configured = metadata?.attachments
  if (!Array.isArray(configured)) return []
  return configured.filter(
    (value): value is "contract" | "invoice" | "proforma" | "brochure" =>
      typeof value === "string" && BOOKING_DOCUMENT_TYPES.has(value),
  )
}

export async function requiredAttachmentTypes(
  db: PostgresJsDatabase,
  rule: NotificationReminderRuleRow,
) {
  const [template] = rule.templateId
    ? await db
        .select({ metadata: notificationTemplates.metadata })
        .from(notificationTemplates)
        .where(eq(notificationTemplates.id, rule.templateId))
        .limit(1)
    : rule.templateSlug
      ? await db
          .select({ metadata: notificationTemplates.metadata })
          .from(notificationTemplates)
          .where(eq(notificationTemplates.slug, rule.templateSlug))
          .limit(1)
      : []
  return configuredAttachmentTypes(template?.metadata ?? null)
}

export function shouldResolveBookingEventDocuments(
  targetType: BookingEventReminderTargetType,
  channel: NotificationReminderRuleRow["channel"],
  requiredDocumentTypes: ReadonlyArray<BookingDocumentBundleItem["documentType"]>,
) {
  return (
    channel === "email" &&
    (targetType === "booking_confirmed" ||
      (targetType === "payment_complete" && requiredDocumentTypes.length > 0))
  )
}

export function missingRequiredAttachmentTypes(
  requiredDocumentTypes: ReadonlyArray<BookingDocumentBundleItem["documentType"]>,
  documents: ReadonlyArray<BookingDocumentBundleItem>,
  bookedProductIds: ReadonlyArray<string>,
) {
  const readyTypes = new Set(documents.map(({ documentType }) => documentType))
  const missingTypes = requiredDocumentTypes.filter((type) => !readyTypes.has(type))

  if (requiredDocumentTypes.includes("brochure")) {
    const brochureProductIds = new Set(
      documents
        .filter(({ documentType }) => documentType === "brochure")
        .map(({ metadata }) => metadata?.productId)
        .filter((productId): productId is string => typeof productId === "string"),
    )
    if (
      bookedProductIds.some((productId) => !brochureProductIds.has(productId)) &&
      !missingTypes.includes("brochure")
    ) {
      missingTypes.push("brochure")
    }
  }

  return missingTypes
}

async function sendBookingEventReminder(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  rule: NotificationReminderRuleRow,
  input: {
    targetType: BookingEventReminderTargetType
    bookingId: string
    paymentSessionId?: string | null
    eventData?: Record<string, unknown>
  },
  runtime: BookingEventReminderRuntimeOptions = {},
) {
  const now = new Date()
  const dedupeKey = buildReminderDedupeKey(rule.id, input.bookingId, input.targetType)

  const [existingRun] = await db
    .select()
    .from(notificationReminderRuns)
    .where(eq(notificationReminderRuns.dedupeKey, dedupeKey))
    .limit(1)
  const retryingPendingBundle =
    existingRun?.status === "failed" &&
    existingRun.notificationDeliveryId === null &&
    existingRun.errorMessage?.startsWith("payment_document_bundle_not_ready:")
  if (existingRun && !retryingPendingBundle) {
    return null
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1)
  if (!booking) {
    const [run] = await db
      .insert(notificationReminderRuns)
      .values({
        reminderRuleId: rule.id,
        targetType: input.targetType,
        targetId: input.bookingId,
        dedupeKey,
        bookingId: input.bookingId,
        personId: null,
        organizationId: null,
        paymentSessionId: input.paymentSessionId ?? null,
        notificationDeliveryId: null,
        status: "skipped",
        recipient: null,
        scheduledFor: now,
        processedAt: now,
        errorMessage: "Booking not found for notification event",
        metadata: {
          eventTargetType: input.targetType,
          ...(input.eventData ?? {}),
        },
      })
      .returning()
    return run ?? null
  }

  const requiredDocumentTypes =
    rule.channel === "email" ? await requiredAttachmentTypes(db, rule) : []
  const shouldResolveDocuments = shouldResolveBookingEventDocuments(
    input.targetType,
    rule.channel,
    requiredDocumentTypes,
  )
  const [participants, items, paymentContext, unfilteredDocumentContext] = await Promise.all([
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
    getBookingPaymentNotificationContext(db, booking.id),
    shouldResolveDocuments
      ? getBookingEventDocumentContext(
          db,
          booking.id,
          runtime.documentAttachmentResolver,
          input.targetType === "payment_complete" ? requiredDocumentTypes : undefined,
        )
      : Promise.resolve({ documents: [], attachments: [] }),
  ])
  const documentContext = unfilteredDocumentContext

  if (input.targetType === "payment_complete" && requiredDocumentTypes.length > 0) {
    const bookedProductIds = [
      ...new Set(
        items
          .map((item) => item.productId)
          .filter((productId): productId is string => typeof productId === "string"),
      ),
    ]
    const missingTypes = missingRequiredAttachmentTypes(
      requiredDocumentTypes,
      documentContext.documents,
      bookedProductIds,
    )
    if (
      missingTypes.length > 0 ||
      documentContext.attachments.length !== documentContext.documents.length
    ) {
      const unresolved =
        documentContext.attachments.length !== documentContext.documents.length
          ? ["unresolvable_attachment"]
          : []
      const errorMessage = `payment_document_bundle_not_ready:${[
        ...missingTypes,
        ...unresolved,
      ].join(",")}`
      if (existingRun) {
        const [pendingRun] = await db
          .update(notificationReminderRuns)
          .set({
            paymentSessionId: input.paymentSessionId ?? existingRun.paymentSessionId,
            processedAt: now,
            errorMessage,
            metadata: {
              ...(existingRun.metadata ?? {}),
              eventTargetType: input.targetType,
              bookingNumber: booking.bookingNumber,
              requiredDocumentTypes,
              ...(input.eventData ?? {}),
            },
            updatedAt: now,
          })
          .where(eq(notificationReminderRuns.id, existingRun.id))
          .returning()
        return pendingRun ?? null
      }
      const [pendingRun] = await db
        .insert(notificationReminderRuns)
        .values({
          reminderRuleId: rule.id,
          targetType: input.targetType,
          targetId: booking.id,
          dedupeKey,
          bookingId: booking.id,
          personId: booking.personId ?? null,
          organizationId: booking.organizationId ?? null,
          paymentSessionId: input.paymentSessionId ?? null,
          notificationDeliveryId: null,
          status: "failed",
          recipient: null,
          scheduledFor: now,
          processedAt: now,
          errorMessage,
          metadata: {
            eventTargetType: input.targetType,
            bookingNumber: booking.bookingNumber,
            requiredDocumentTypes,
            ...(input.eventData ?? {}),
          },
        })
        .onConflictDoNothing({ target: notificationReminderRuns.dedupeKey })
        .returning()
      return pendingRun ?? null
    }
  }

  const recipient = resolveReminderRecipient(booking, participants)
  const [processingRun] = existingRun
    ? await db
        .update(notificationReminderRuns)
        .set({
          paymentSessionId: input.paymentSessionId ?? existingRun.paymentSessionId,
          status: "queued",
          recipient: recipient?.email ?? null,
          processedAt: now,
          errorMessage: null,
          metadata: {
            ...(existingRun.metadata ?? {}),
            eventTargetType: input.targetType,
            bookingNumber: booking.bookingNumber,
            ...(input.eventData ?? {}),
          },
          updatedAt: now,
        })
        .where(eq(notificationReminderRuns.id, existingRun.id))
        .returning()
    : await db
        .insert(notificationReminderRuns)
        .values({
          reminderRuleId: rule.id,
          targetType: input.targetType,
          targetId: booking.id,
          dedupeKey,
          bookingId: booking.id,
          personId: booking.personId ?? null,
          organizationId: booking.organizationId ?? null,
          paymentSessionId: input.paymentSessionId ?? null,
          notificationDeliveryId: null,
          status: "queued",
          recipient: recipient?.email ?? null,
          scheduledFor: now,
          processedAt: now,
          errorMessage: null,
          metadata: {
            eventTargetType: input.targetType,
            bookingNumber: booking.bookingNumber,
            ...(input.eventData ?? {}),
          },
        })
        .onConflictDoNothing({ target: notificationReminderRuns.dedupeKey })
        .returning()

  if (!processingRun) {
    return null
  }

  if (!recipient?.email) {
    return markReminderRunSkipped(
      db,
      processingRun.id,
      now,
      "No traveler email available for booking notification event",
    )
  }

  try {
    await enqueueNotification({
      db,
      registry: dispatcher,
      input: {
        idempotencyKey: `reminder:${processingRun.dedupeKey}`,
        templateId: rule.templateId ?? null,
        templateSlug: rule.templateSlug ?? null,
        channel: rule.channel,
        provider: rule.provider ?? null,
        to: recipient.email,
        data: {
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
          trigger: input.targetType,
          event: input.eventData ?? {},
          traveler: {
            firstName: recipient.firstName,
            lastName: recipient.lastName,
            email: recipient.email,
            participantType: recipient.participantType,
            isPrimary: recipient.isPrimary,
          },
          travelers: participants,
          booking: {
            id: booking.id,
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            startDate: booking.startDate,
            endDate: booking.endDate,
            sellCurrency: booking.sellCurrency,
            sellAmountCents: booking.sellAmountCents,
          },
          ...serializeBookingPaymentContext(paymentContext),
          payment:
            input.targetType === "payment_complete"
              ? {
                  isPaidInFull: true,
                  paymentSessionId: input.paymentSessionId ?? null,
                }
              : null,
          documents: documentContext.documents,
          items,
        },
        attachments: documentContext.attachments.length > 0 ? documentContext.attachments : null,
        targetType: input.targetType === "payment_complete" ? "payment_session" : "booking",
        targetId:
          input.targetType === "payment_complete"
            ? (input.paymentSessionId ?? booking.id)
            : booking.id,
        bookingId: booking.id,
        paymentSessionId: input.paymentSessionId ?? null,
        personId: booking.personId ?? null,
        organizationId: booking.organizationId ?? null,
        metadata: {
          reminderRuleId: rule.id,
          reminderRunId: processingRun.id,
          eventTargetType: input.targetType,
          bookingDocumentKeys: documentContext.documents.map((document) => document.key),
        },
        reminderRunId: processingRun.id,
        scheduledFor: now.toISOString(),
      },
    })

    return processingRun
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification event delivery failed"
    return markReminderRunFailed(db, processingRun.id, new Date(), message)
  }
}

export async function dispatchReminderEventRules(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  input: {
    targetType: BookingEventReminderTargetType
    bookingId: string
    paymentSessionId?: string | null
    eventData?: Record<string, unknown>
  },
  runtime: BookingEventReminderRuntimeOptions = {},
) {
  const rules = await db
    .select()
    .from(notificationReminderRules)
    .where(
      and(
        eq(notificationReminderRules.status, "active"),
        eq(notificationReminderRules.targetType, input.targetType),
      ),
    )
    .orderBy(notificationReminderRules.createdAt)

  const results = []
  for (const rule of rules) {
    results.push(await sendBookingEventReminder(db, dispatcher, rule, input, runtime))
  }

  return results
}

export async function bookingIsPaidInFullForNotification(
  db: PostgresJsDatabase,
  bookingId: string,
) {
  return !(await hasOutstandingBookingBalance(db, bookingId))
}

export async function bookingNotificationsSuppressedForNotification(
  db: PostgresJsDatabase,
  bookingId: string,
) {
  const [booking] = await db
    .select({ notificationsSuppressed: bookings.notificationsSuppressed })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1)
  return booking?.notificationsSuppressed === true
}

export type { BookingEventReminderRuntimeOptions } from "./service-reminder-booking-context.js"
