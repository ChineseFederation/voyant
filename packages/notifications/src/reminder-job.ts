import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { durableNotificationProviderPort } from "./durable-provider-port.js"
import { notificationsReminderJobRuntimePort } from "./reminder-job-runtime-port.js"
import {
  drainDurableNotificationSends,
  hasRecoverableNotificationSends,
} from "./service-durable-send.js"
import { sendDueNotificationReminders } from "./tasks/send-due-reminders.js"

export { notificationsReminderJobRuntimePort } from "./reminder-job-runtime-port.js"

/** Sweep and deliver reminders whose durable run records are due. */
export async function runDueNotificationRemindersJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(notificationsReminderJobRuntimePort)
  const [db, env] = await Promise.all([runtime.resolveDb(), runtime.resolveEnv()])
  await sendDueNotificationReminders(db, env, {}, await runtime.resolveRuntimeOptions(env))
}

/** Reconcile and deliver package-owned durable notification send operations. */
export async function runDueNotificationSendsJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(notificationsReminderJobRuntimePort)
  const db = await runtime.resolveDb()
  if (!context.hasPort(durableNotificationProviderPort)) {
    if (await hasRecoverableNotificationSends(db)) {
      throw new Error(
        "Recoverable notification sends exist but the exact durable provider is unavailable",
      )
    }
    return
  }
  const selectedRuntime = await context.getPort(durableNotificationProviderPort)
  await drainDurableNotificationSends(db, selectedRuntime.providers)
}
