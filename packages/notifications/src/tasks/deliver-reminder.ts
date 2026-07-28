import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { createNotificationService } from "../service.js"
import { deliverReminderRun } from "../service-reminders.js"
import {
  buildNotificationTaskRuntime,
  type NotificationTaskEnv,
  type NotificationTaskRuntimeOptions,
} from "../task-runtime.js"

export async function deliverQueuedNotificationReminder(
  db: PostgresJsDatabase,
  env: NotificationTaskEnv,
  input: { reminderRunId: string },
  options: NotificationTaskRuntimeOptions = {},
) {
  const runtime = buildNotificationTaskRuntime(env, options)
  const dispatcher = createNotificationService(runtime.providers)
  const result = await deliverReminderRun(db, dispatcher, input, {
    publicCustomerPortalBaseUrl: runtime.publicCustomerPortalBaseUrl,
  })

  return {
    reminderRunId: input.reminderRunId,
    status: result?.status ?? null,
  }
}
