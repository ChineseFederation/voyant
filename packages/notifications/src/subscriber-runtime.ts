import type { ModuleContainer, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  bookingItemsRef,
  contractsRef,
  invoicesRef,
  paymentSessionsRef,
} from "./payment-bundle-refs.js"
import { notificationReminderRuns } from "./schema.js"
import type { NotificationService } from "./service.js"
import type { BookingDocumentAttachmentResolver } from "./service-booking-documents.js"
import {
  bookingIsPaidInFullForNotification,
  bookingNotificationsSuppressedForNotification,
  dispatchReminderEventRules,
} from "./service-reminders.js"

export const NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY = "notifications.subscriberRuntime"

export const NOTIFICATIONS_BOOKING_CONFIRMED_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-booking-confirmed"
export const NOTIFICATIONS_PAYMENT_COMPLETED_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-payment-completed"
export const NOTIFICATIONS_CHECKOUT_FINALIZED_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-checkout-finalized"
export const NOTIFICATIONS_INVOICE_RENDERED_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-invoice-rendered"
export const NOTIFICATIONS_CONTRACT_DOCUMENT_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-contract-document-generated"
export const NOTIFICATIONS_PRODUCT_CONTENT_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-product-content-changed"
export const NOTIFICATIONS_BOOKING_CANCELLED_REMINDER_SUBSCRIBER_ID =
  "@voyant-travel/notifications#subscriber.reminder-booking-cancelled"
/** Deployment-owned services required by package-owned Notifications subscribers. */
export interface NotificationsSubscriberRuntime {
  resolveDb(bindings: unknown): PostgresJsDatabase
  dispatcher: NotificationService
  documentAttachmentResolver?: BookingDocumentAttachmentResolver
}

export interface NotificationsSubscriberDependencies {
  dispatchReminderRules?: typeof dispatchReminderEventRules
  isPaidInFull?: typeof bookingIsPaidInFullForNotification
  isNotificationsSuppressed?: typeof bookingNotificationsSuppressedForNotification
  logger?: Pick<Console, "error">
}

interface BookingConfirmedPayload extends Record<string, unknown> {
  bookingId: string
  bookingNumber: string
  actorId: string | null
  suppressNotifications?: boolean
}

interface PaymentCompletedPayload extends Record<string, unknown> {
  paymentSessionId: string
  bookingId?: string | null
  orderId?: string | null
  invoiceId?: string | null
  amountCents: number
  currency: string
  provider: string
}

interface CheckoutFinalizedPayload extends Record<string, unknown> {
  bookingId: string
  paymentSessionId: string
}

interface InvoiceRenderedPayload extends Record<string, unknown> {
  invoiceId: string
}

interface ContractDocumentGeneratedPayload extends Record<string, unknown> {
  contractId: string
}

interface ProductContentChangedPayload extends Record<string, unknown> {
  id: string
  axis?: string
}

interface BookingCancelledPayload extends Record<string, unknown> {
  bookingId: string
  bookingNumber: string
  previousStatus: "confirmed" | "in_progress"
  actorId: string | null
  suppressNotifications?: boolean
}

function resolveRuntime(container: ModuleContainer): NotificationsSubscriberRuntime {
  if (!container.has(NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY)) {
    throw new Error(
      `Notifications subscriber runtime is not registered at "${NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY}".`,
    )
  }
  return container.resolve<NotificationsSubscriberRuntime>(NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function dispatchPaymentCompleteForBooking(
  db: PostgresJsDatabase,
  runtime: NotificationsSubscriberRuntime,
  dependencies: NotificationsSubscriberDependencies,
  bookingId: string,
  paymentSessionId: string | null,
  eventData: Record<string, unknown>,
) {
  const isPaidInFull = dependencies.isPaidInFull ?? bookingIsPaidInFullForNotification
  const isNotificationsSuppressed =
    dependencies.isNotificationsSuppressed ?? bookingNotificationsSuppressedForNotification
  if (await isNotificationsSuppressed(db, bookingId)) return
  if (!(await isPaidInFull(db, bookingId))) return
  await (dependencies.dispatchReminderRules ?? dispatchReminderEventRules)(
    db,
    runtime.dispatcher,
    { targetType: "payment_complete", bookingId, paymentSessionId, eventData },
    { documentAttachmentResolver: runtime.documentAttachmentResolver },
  )
}

export function createBookingConfirmedReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const dispatchReminderRules = dependencies.dispatchReminderRules ?? dispatchReminderEventRules
  const isNotificationsSuppressed =
    dependencies.isNotificationsSuppressed ?? bookingNotificationsSuppressedForNotification
  const logger = dependencies.logger ?? console

  return {
    id: NOTIFICATIONS_BOOKING_CONFIRMED_REMINDER_SUBSCRIBER_ID,
    eventType: "booking.confirmed",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", async ({ data }) => {
        if (data.suppressNotifications === true) return
        try {
          const runtime = resolveRuntime(container)
          const db = runtime.resolveDb(bindings)
          if (await isNotificationsSuppressed(db, data.bookingId)) return
          await dispatchReminderRules(
            db,
            runtime.dispatcher,
            { targetType: "booking_confirmed", bookingId: data.bookingId, eventData: data },
            { documentAttachmentResolver: runtime.documentAttachmentResolver },
          )
        } catch (error) {
          logger.error(
            `[notifications] booking_confirmed reminder rules failed for booking ${data.bookingId}: ${errorMessage(error)}`,
          )
        }
      })
    },
  }
}

export function createPaymentCompletedReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const dispatchReminderRules = dependencies.dispatchReminderRules ?? dispatchReminderEventRules
  const isPaidInFull = dependencies.isPaidInFull ?? bookingIsPaidInFullForNotification
  const isNotificationsSuppressed =
    dependencies.isNotificationsSuppressed ?? bookingNotificationsSuppressedForNotification
  const logger = dependencies.logger ?? console

  return {
    id: NOTIFICATIONS_PAYMENT_COMPLETED_REMINDER_SUBSCRIBER_ID,
    eventType: "payment.completed",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<PaymentCompletedPayload>("payment.completed", async ({ data }) => {
        if (!data.bookingId) return

        try {
          const runtime = resolveRuntime(container)
          const db = runtime.resolveDb(bindings)
          await dispatchPaymentCompleteForBooking(
            db,
            runtime,
            { dispatchReminderRules, isPaidInFull, isNotificationsSuppressed },
            data.bookingId,
            data.paymentSessionId,
            data,
          )
        } catch (error) {
          logger.error(
            `[notifications] payment_complete reminder rules failed for booking ${data.bookingId}: ${errorMessage(error)}`,
          )
        }
      })
    },
  }
}

export function createCheckoutFinalizedReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const logger = dependencies.logger ?? console
  return {
    id: NOTIFICATIONS_CHECKOUT_FINALIZED_REMINDER_SUBSCRIBER_ID,
    eventType: "checkout.finalized",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<CheckoutFinalizedPayload>("checkout.finalized", async ({ data }) => {
        try {
          const runtime = resolveRuntime(container)
          await dispatchPaymentCompleteForBooking(
            runtime.resolveDb(bindings),
            runtime,
            dependencies,
            data.bookingId,
            data.paymentSessionId,
            data,
          )
        } catch (error) {
          logger.error(
            `[notifications] checkout_finalized bundle delivery failed for booking ${data.bookingId}: ${errorMessage(error)}`,
          )
        }
      })
    },
  }
}

/**
 * A document a booking email was waiting on has arrived — re-drive the emails
 * that deferred for it.
 *
 * Both booking events can defer, so both get retried, and the two have
 * different preconditions:
 *
 * - `booking_confirmed` fires on confirmation and has none. It is retried for
 *   every booking, because voyant#4653 made it defer on a template that
 *   declares an attachment, and a booking that was never paid through a
 *   session still owes its customer that email.
 * - `payment_complete` needs a paid session and a paid-in-full booking, so it
 *   is only retried once one exists.
 *
 * A run that already delivered is left alone by `sendBookingEventReminder`'s
 * dedupe, so retrying an event that never deferred costs a lookup and stops.
 */
async function retryBookingDocumentBundleForBooking(
  db: PostgresJsDatabase,
  runtime: NotificationsSubscriberRuntime,
  dependencies: NotificationsSubscriberDependencies,
  bookingId: string,
  eventData: Record<string, unknown>,
) {
  const isNotificationsSuppressed =
    dependencies.isNotificationsSuppressed ?? bookingNotificationsSuppressedForNotification
  if (await isNotificationsSuppressed(db, bookingId)) return

  await (dependencies.dispatchReminderRules ?? dispatchReminderEventRules)(
    db,
    runtime.dispatcher,
    { targetType: "booking_confirmed", bookingId, eventData },
    { documentAttachmentResolver: runtime.documentAttachmentResolver },
  )

  const [session] = await db
    .select({ id: paymentSessionsRef.id })
    .from(paymentSessionsRef)
    .where(and(eq(paymentSessionsRef.bookingId, bookingId), eq(paymentSessionsRef.status, "paid")))
    .orderBy(desc(paymentSessionsRef.completedAt), desc(paymentSessionsRef.updatedAt))
    .limit(1)
  if (!session) return
  await dispatchPaymentCompleteForBooking(
    db,
    runtime,
    dependencies,
    bookingId,
    session.id,
    eventData,
  )
}

export function createInvoiceRenderedReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const logger = dependencies.logger ?? console
  return {
    id: NOTIFICATIONS_INVOICE_RENDERED_REMINDER_SUBSCRIBER_ID,
    eventType: "invoice.rendered",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<InvoiceRenderedPayload>("invoice.rendered", async ({ data }) => {
        try {
          const runtime = resolveRuntime(container)
          const db = runtime.resolveDb(bindings)
          const [invoice] = await db
            .select({ bookingId: invoicesRef.bookingId })
            .from(invoicesRef)
            .where(eq(invoicesRef.id, data.invoiceId))
            .limit(1)
          if (!invoice) return
          await retryBookingDocumentBundleForBooking(
            db,
            runtime,
            dependencies,
            invoice.bookingId,
            data,
          )
        } catch (error) {
          logger.error(
            `[notifications] invoice_rendered bundle retry failed for invoice ${data.invoiceId}: ${errorMessage(error)}`,
          )
        }
      })
    },
  }
}

export function createContractDocumentReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const logger = dependencies.logger ?? console
  return {
    id: NOTIFICATIONS_CONTRACT_DOCUMENT_REMINDER_SUBSCRIBER_ID,
    eventType: "contract.document.generated",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<ContractDocumentGeneratedPayload>(
        "contract.document.generated",
        async ({ data }) => {
          try {
            const runtime = resolveRuntime(container)
            const db = runtime.resolveDb(bindings)
            const [contract] = await db
              .select({ bookingId: contractsRef.bookingId })
              .from(contractsRef)
              .where(eq(contractsRef.id, data.contractId))
              .limit(1)
            if (!contract?.bookingId) return
            await retryBookingDocumentBundleForBooking(
              db,
              runtime,
              dependencies,
              contract.bookingId,
              data,
            )
          } catch (error) {
            logger.error(
              `[notifications] contract_document_generated bundle retry failed for contract ${data.contractId}: ${errorMessage(error)}`,
            )
          }
        },
      )
    },
  }
}

export function createProductContentReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const logger = dependencies.logger ?? console
  return {
    id: NOTIFICATIONS_PRODUCT_CONTENT_REMINDER_SUBSCRIBER_ID,
    eventType: "product.content.changed",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<ProductContentChangedPayload>(
        "product.content.changed",
        async ({ data }) => {
          if (data.axis && data.axis !== "media") return
          try {
            const runtime = resolveRuntime(container)
            const db = runtime.resolveDb(bindings)
            const paidBookings = await db
              .selectDistinct({ bookingId: bookingItemsRef.bookingId })
              .from(bookingItemsRef)
              .innerJoin(
                paymentSessionsRef,
                eq(paymentSessionsRef.bookingId, bookingItemsRef.bookingId),
              )
              .where(
                and(eq(bookingItemsRef.productId, data.id), eq(paymentSessionsRef.status, "paid")),
              )
            for (const { bookingId } of paidBookings) {
              await retryBookingDocumentBundleForBooking(db, runtime, dependencies, bookingId, data)
            }
          } catch (error) {
            logger.error(
              `[notifications] product_content_changed bundle retry failed for product ${data.id}: ${errorMessage(error)}`,
            )
          }
        },
      )
    },
  }
}

export function createBookingCancelledReminderSubscriberRuntime(
  dependencies: NotificationsSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const dispatchReminderRules = dependencies.dispatchReminderRules ?? dispatchReminderEventRules
  const isNotificationsSuppressed =
    dependencies.isNotificationsSuppressed ?? bookingNotificationsSuppressedForNotification
  const logger = dependencies.logger ?? console

  return {
    id: NOTIFICATIONS_BOOKING_CANCELLED_REMINDER_SUBSCRIBER_ID,
    eventType: "booking.cancelled",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<BookingCancelledPayload>("booking.cancelled", async ({ data }) => {
        try {
          const runtime = resolveRuntime(container)
          const db = runtime.resolveDb(bindings)
          await skipQueuedBookingPaymentReminders(db, data.bookingId, "cancelled")
          if (data.suppressNotifications === true) return
          if (await isNotificationsSuppressed(db, data.bookingId)) return
          await dispatchReminderRules(
            db,
            runtime.dispatcher,
            {
              targetType: "booking_cancelled_non_payment",
              bookingId: data.bookingId,
              eventData: data,
            },
            { documentAttachmentResolver: runtime.documentAttachmentResolver },
          )
        } catch (error) {
          logger.error(
            `[notifications] booking_cancelled_non_payment reminder rules failed for booking ${data.bookingId}: ${errorMessage(error)}`,
          )
        }
      })
    },
  }
}

export async function skipQueuedBookingPaymentReminders(
  db: PostgresJsDatabase,
  bookingId: string,
  status: "cancelled",
): Promise<void> {
  const now = new Date()
  await db
    .update(notificationReminderRuns)
    .set({
      status: "skipped",
      errorMessage: `booking_status_${status}`,
      processedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationReminderRuns.bookingId, bookingId),
        eq(notificationReminderRuns.targetType, "booking_payment_schedule"),
        eq(notificationReminderRuns.status, "queued"),
      ),
    )
}

export const notificationsBookingConfirmedReminderSubscriber =
  createBookingConfirmedReminderSubscriberRuntime()
export const notificationsPaymentCompletedReminderSubscriber =
  createPaymentCompletedReminderSubscriberRuntime()
export const notificationsCheckoutFinalizedReminderSubscriber =
  createCheckoutFinalizedReminderSubscriberRuntime()
export const notificationsInvoiceRenderedReminderSubscriber =
  createInvoiceRenderedReminderSubscriberRuntime()
export const notificationsContractDocumentReminderSubscriber =
  createContractDocumentReminderSubscriberRuntime()
export const notificationsProductContentReminderSubscriber =
  createProductContentReminderSubscriberRuntime()
export const notificationsBookingCancelledReminderSubscriber =
  createBookingCancelledReminderSubscriberRuntime()
export const notificationsReminderSubscriberRuntimeDescriptors = [
  notificationsBookingConfirmedReminderSubscriber,
  notificationsPaymentCompletedReminderSubscriber,
  notificationsCheckoutFinalizedReminderSubscriber,
  notificationsInvoiceRenderedReminderSubscriber,
  notificationsContractDocumentReminderSubscriber,
  notificationsProductContentReminderSubscriber,
  notificationsBookingCancelledReminderSubscriber,
] as const
