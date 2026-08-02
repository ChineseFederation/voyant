import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createNotificationService } from "../service.js"
import { queueDueReminders, runDueReminders } from "../service-reminders.js"
import type { ReminderQueueResult, ReminderSweepResult } from "../service-shared.js"
import {
  buildNotificationTaskRuntime,
  type NotificationTaskEnv,
  type NotificationTaskRuntimeOptions,
} from "../task-runtime.js"

export async function sendDueNotificationReminders(
  db: PostgresJsDatabase,
  env: NotificationTaskEnv,
  input: { now?: string | null } = {},
  options: NotificationTaskRuntimeOptions = {},
) {
  const runtime = buildNotificationTaskRuntime(env, options)
  const dispatcher = createNotificationService(runtime.providers)
  const projectionOptions = runtime.resolveBookingActionDeadline
    ? { resolveBookingActionDeadline: runtime.resolveBookingActionDeadline }
    : undefined
  const runSweep: () => Promise<ReminderQueueResult | ReminderSweepResult> = () =>
    runtime.enqueueReminderDelivery
      ? projectionOptions
        ? queueDueReminders(db, input, runtime.enqueueReminderDelivery, projectionOptions)
        : queueDueReminders(db, input, runtime.enqueueReminderDelivery)
      : runDueReminders(db, dispatcher, input, {
          publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
          resolveBookingActionDeadline: runtime.resolveBookingActionDeadline,
        })

  if (!runtime.reminderSweepLockManager) {
    return runSweep()
  }

  const result = await runtime.reminderSweepLockManager.runExclusive(
    "notifications:due-reminders",
    runSweep,
  )

  if (result.executed) {
    return result.value
  }

  if (!runtime.enqueueReminderDelivery) {
    return {
      processed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    }
  }

  return {
    processed: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
  }
}
