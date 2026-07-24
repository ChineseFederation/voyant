import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { CheckoutNotificationDelivery } from "@voyant-travel/finance/checkout"
import type { CheckoutReminderRunRecord } from "@voyant-travel/finance/checkout-validation"
import type { FinanceNotificationsRuntime } from "@voyant-travel/finance/runtime-port"
import { notificationsService } from "./service.js"
import { createNotificationService } from "./service-shared.js"
import type { NotificationProvider } from "./types.js"

/** Adapt Notifications services to Finance's narrow notification contract. */
export function createFinanceNotificationsRuntime(
  primitives: VoyantRuntimeHostPrimitives,
): FinanceNotificationsRuntime {
  return {
    resolveNotificationDispatcher: (bindings) => {
      const providers = resolveNotificationProviders(primitives, bindings)
      if (providers.length === 0) return null
      const dispatcher = createNotificationService(providers)
      return {
        sendInvoiceNotification: async (db, invoiceId, input, options) =>
          toCheckoutNotificationDelivery(
            await notificationsService.sendInvoiceNotification(
              db,
              dispatcher,
              invoiceId,
              input,
              options,
            ),
          ),
        sendPaymentSessionNotification: async (db, paymentSessionId, input, options) =>
          toCheckoutNotificationDelivery(
            await notificationsService.sendPaymentSessionNotification(
              db,
              dispatcher,
              paymentSessionId,
              input,
              options,
            ),
          ),
      }
    },
    listBookingReminderRuns: async (db, bookingId, query) => {
      const result = await notificationsService.listReminderRuns(db, {
        bookingId,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      })
      return {
        data: result.data.map(toCheckoutReminderRun),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      }
    },
  }
}

function resolveNotificationProviders(
  primitives: VoyantRuntimeHostPrimitives,
  bindings: Record<string, unknown>,
): ReadonlyArray<NotificationProvider> {
  const resolver = primitives.config.read(bindings, "notificationProviders")
  return typeof resolver === "function" ? resolver(primitives.env(bindings)) : []
}

type NotificationDeliveryLike = {
  id: string
  templateSlug: string | null
  channel: "email" | "sms"
  provider: string
  status: "pending" | "sent" | "failed" | "cancelled"
  toAddress: string
  subject: string | null
  sentAt: Date | string | null
  failedAt: Date | string | null
  errorMessage: string | null
}

function optionalDateTime(value: Date | string | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function toCheckoutNotificationDelivery(
  delivery: NotificationDeliveryLike | null,
): CheckoutNotificationDelivery | null {
  if (!delivery) return null
  return {
    ...delivery,
    sentAt: optionalDateTime(delivery.sentAt),
    failedAt: optionalDateTime(delivery.failedAt),
  }
}

function toCheckoutReminderRun(run: {
  id: string
  reminderRuleId: string
  reminderRule: { slug: string; name: string; channel: "email" | "sms"; provider: string | null }
  targetType: CheckoutReminderRunRecord["targetType"]
  targetId: string
  links: {
    bookingId: string | null
    paymentSessionId: string | null
    notificationDeliveryId: string | null
  }
  status: CheckoutReminderRunRecord["status"]
  delivery?: {
    status: CheckoutReminderRunRecord["deliveryStatus"]
    channel: "email" | "sms"
    provider: string | null
  } | null
  recipient: string | null
  scheduledFor: Date | string
  processedAt: Date | string | null
  errorMessage: string | null
  createdAt: Date | string
}): CheckoutReminderRunRecord {
  return {
    id: run.id,
    reminderRuleId: run.reminderRuleId,
    reminderRuleSlug: run.reminderRule.slug,
    reminderRuleName: run.reminderRule.name,
    targetType: run.targetType,
    targetId: run.targetId,
    bookingId: run.links.bookingId,
    paymentSessionId: run.links.paymentSessionId,
    notificationDeliveryId: run.links.notificationDeliveryId,
    status: run.status,
    deliveryStatus: run.delivery?.status ?? null,
    channel: run.delivery?.channel ?? run.reminderRule.channel,
    provider: run.delivery?.provider ?? run.reminderRule.provider ?? null,
    recipient: run.recipient,
    scheduledFor: optionalDateTime(run.scheduledFor) ?? "",
    processedAt: optionalDateTime(run.processedAt) ?? "",
    errorMessage: run.errorMessage,
    relativeDaysFromDueDate: null,
    createdAt: optionalDateTime(run.createdAt) ?? "",
  }
}
