import type { ExecutionLockManager } from "@voyant-travel/core"

import type { NotificationProvider } from "./types.js"

export type NotificationTaskEnv = Record<string, unknown>

export type ReminderDeliveryJob = {
  reminderRunId: string
}

export type BookingActionDeadlineResolver = (input: {
  sourceModule: "finance"
  sourceType: "booking_payment_schedule"
  sourceIds: ReadonlyArray<string>
}) => Promise<ReadonlyMap<string, string>>

export type NotificationTaskRuntime = {
  providers: ReadonlyArray<NotificationProvider>
  publicCustomerPortalBaseUrl?: string | null
  reminderSweepLockManager?: ExecutionLockManager
  enqueueReminderDelivery?: (job: ReminderDeliveryJob) => Promise<void>
  resolveBookingActionDeadline?: BookingActionDeadlineResolver
}

export type NotificationTaskRuntimeOptions = {
  providers?: ReadonlyArray<NotificationProvider>
  publicCustomerPortalBaseUrl?: string | null
  reminderSweepLockManager?: ExecutionLockManager
  enqueueReminderDelivery?: (job: ReminderDeliveryJob) => Promise<void>
  resolveProviders?: (env: NotificationTaskEnv) => ReadonlyArray<NotificationProvider>
  resolveBookingActionDeadline?: BookingActionDeadlineResolver
}

export function buildNotificationTaskRuntime(
  env: NotificationTaskEnv,
  options: NotificationTaskRuntimeOptions = {},
): NotificationTaskRuntime {
  const providers = options.resolveProviders?.(env) ?? options.providers
  if (!providers) {
    throw new Error(
      "buildNotificationTaskRuntime requires `providers` or `resolveProviders` — there are no default providers.",
    )
  }

  return {
    providers,
    publicCustomerPortalBaseUrl: options.publicCustomerPortalBaseUrl ?? null,
    reminderSweepLockManager: options.reminderSweepLockManager,
    enqueueReminderDelivery: options.enqueueReminderDelivery,
    resolveBookingActionDeadline: options.resolveBookingActionDeadline,
  }
}
