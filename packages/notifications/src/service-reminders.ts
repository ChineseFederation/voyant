import { bookings } from "@voyant-travel/bookings/schema"
import { bookingPaymentSchedules, invoices } from "@voyant-travel/finance/schema"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { sendInvoiceReminderNotification } from "./service-deliveries.js"
import { enqueueNotification } from "./service-durable-send.js"
import type { NotificationPortalContextOptions } from "./service-portal-context.js"
import {
  bookingStatusSkipReason,
  buildBookingPaymentReminderTemplateData,
  OPEN_PAYMENT_SCHEDULE_STATUSES,
  PAYABLE_BOOKING_STATUSES,
  paymentScheduleStatusSkipReason,
} from "./service-reminder-booking-context.js"
import {
  type ChannelOverride,
  getReminderRuleById,
  getReminderRunById,
  markReminderRunFailed,
  markReminderRunSkipped,
  type NotificationReminderRunRow,
  type ReminderDeliveryEnqueuer,
  resolveChannelOverride,
} from "./service-reminder-run-state.js"
import {
  queueStageBasedDueReminders,
  runStageBasedDueReminders,
} from "./service-reminder-stage-runs.js"
import type {
  NotificationReminderRuleRow,
  NotificationService,
  RunDueRemindersInput,
} from "./service-shared.js"
import type { BookingActionDeadlineResolver } from "./task-runtime.js"

export type NotificationReminderDeliveryOptions = NotificationPortalContextOptions & {
  resolveBookingActionDeadline?: BookingActionDeadlineResolver
}

export {
  bookingIsPaidInFullForNotification,
  bookingNotificationsSuppressedForNotification,
  dispatchReminderEventRules,
} from "./service-reminder-events.js"

async function sendQueuedBookingPaymentScheduleReminder(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  run: NotificationReminderRunRow,
  rule: NotificationReminderRuleRow,
  now: Date,
  channelOverride: ChannelOverride,
  options: NotificationReminderDeliveryOptions = {},
) {
  const [schedule] = await db
    .select()
    .from(bookingPaymentSchedules)
    .where(eq(bookingPaymentSchedules.id, run.targetId))
    .limit(1)

  if (!schedule) {
    return markReminderRunSkipped(
      db,
      run.id,
      now,
      "Booking payment schedule not found for reminder run",
    )
  }
  if (!OPEN_PAYMENT_SCHEDULE_STATUSES.has(schedule.status)) {
    return markReminderRunSkipped(db, run.id, now, paymentScheduleStatusSkipReason(schedule.status))
  }

  const context = await buildBookingPaymentReminderTemplateData(
    db,
    schedule,
    run.recipient,
    {},
    options,
  )

  if (!context) {
    return markReminderRunSkipped(db, run.id, now, "Booking not found for payment schedule")
  }
  if (!PAYABLE_BOOKING_STATUSES.has(context.booking.status)) {
    return markReminderRunSkipped(db, run.id, now, bookingStatusSkipReason(context.booking.status))
  }
  if (context.booking.notificationsSuppressed) {
    return markReminderRunSkipped(db, run.id, now, "Booking notifications are suppressed")
  }

  const recipientEmail = context.recipientEmail

  if (!recipientEmail) {
    return markReminderRunSkipped(
      db,
      run.id,
      now,
      "No traveler email available for booking payment reminder",
    )
  }

  try {
    await enqueueNotification({
      db,
      registry: dispatcher,
      input: {
        idempotencyKey: `reminder:${run.dedupeKey}`,
        templateId: channelOverride.templateId,
        templateSlug: channelOverride.templateSlug,
        channel: channelOverride.channel,
        provider: channelOverride.provider,
        to: recipientEmail,
        data: context.data,
        targetType: "booking_payment_schedule",
        targetId: schedule.id,
        bookingId: context.booking.id,
        personId: context.booking.personId ?? null,
        organizationId: context.booking.organizationId ?? null,
        metadata: {
          reminderRuleId: rule.id,
          reminderRunId: run.id,
        },
        reminderRunId: run.id,
        scheduledFor: run.scheduledFor.toISOString(),
      },
    })

    return run
  } catch (error) {
    const message = error instanceof Error ? error.message : "Notification reminder failed"
    return markReminderRunFailed(db, run.id, new Date(), message)
  }
}

async function sendQueuedInvoiceReminder(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  run: NotificationReminderRunRow,
  rule: NotificationReminderRuleRow,
  now: Date,
  channelOverride: ChannelOverride,
  options: NotificationReminderDeliveryOptions = {},
) {
  if (!run.recipient) {
    return markReminderRunSkipped(db, run.id, now, "No recipient available for invoice reminder")
  }
  const [invoiceBooking] = await db
    .select({ notificationsSuppressed: bookings.notificationsSuppressed })
    .from(invoices)
    .innerJoin(bookings, eq(bookings.id, invoices.bookingId))
    .where(eq(invoices.id, run.targetId))
    .limit(1)
  if (invoiceBooking?.notificationsSuppressed) {
    return markReminderRunSkipped(db, run.id, now, "Booking notifications are suppressed")
  }
  const delivery = await sendInvoiceReminderNotification(db, dispatcher, run.targetId, {
    idempotencyKey: `reminder:${run.dedupeKey}`,
    templateId: channelOverride.templateId,
    templateSlug: channelOverride.templateSlug,
    channel: channelOverride.channel,
    provider: channelOverride.provider,
    to: run.recipient,
    data: {
      reminderRunId: run.id,
    },
    metadata: {
      reminderRuleId: rule.id,
      reminderRunId: run.id,
    },
    reminderRunId: run.id,
    scheduledFor: run.scheduledFor.toISOString(),
    publicCustomerPortalBaseUrl: options.publicCustomerPortalBaseUrl,
  })

  if (!delivery) {
    return markReminderRunSkipped(db, run.id, now, "Invoice not found for reminder run")
  }

  return run
}

export async function queueDueReminders(
  db: PostgresJsDatabase,
  input: RunDueRemindersInput = {},
  enqueueDelivery: ReminderDeliveryEnqueuer,
  options: { resolveBookingActionDeadline?: BookingActionDeadlineResolver } = {},
) {
  return queueStageBasedDueReminders(db, enqueueDelivery, input, options)
}

export async function deliverReminderRun(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  input: { reminderRunId: string },
  options: NotificationReminderDeliveryOptions = {},
) {
  const now = new Date()
  const run = await getReminderRunById(db, input.reminderRunId)
  if (!run) {
    return null
  }

  if (run.status !== "queued" || run.notificationDeliveryId) {
    return run
  }

  const rule = await getReminderRuleById(db, run.reminderRuleId)
  if (!rule) {
    return markReminderRunFailed(db, run.id, new Date(), "Reminder rule not found")
  }

  const channelOverride = await resolveChannelOverride(db, run, rule)

  try {
    if (run.targetType === "booking_payment_schedule") {
      return await sendQueuedBookingPaymentScheduleReminder(
        db,
        dispatcher,
        run,
        rule,
        now,
        channelOverride,
        options,
      )
    }

    if (run.targetType === "invoice") {
      return await sendQueuedInvoiceReminder(
        db,
        dispatcher,
        run,
        rule,
        now,
        channelOverride,
        options,
      )
    }

    return markReminderRunSkipped(db, run.id, now, "Unsupported reminder target type")
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reminder delivery failed"
    return markReminderRunFailed(db, run.id, new Date(), message)
  }
}

export async function runDueReminders(
  db: PostgresJsDatabase,
  dispatcher: NotificationService,
  input: RunDueRemindersInput = {},
  options: NotificationReminderDeliveryOptions = {},
) {
  return runStageBasedDueReminders(db, dispatcher, input, options)
}
