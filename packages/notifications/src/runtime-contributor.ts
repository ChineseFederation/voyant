import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type FinanceNotificationsRuntime,
  financeNotificationsRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import {
  type QuotesNotificationsRuntime,
  quotesNotificationsRuntimePort,
} from "@voyant-travel/quotes/runtime-port"
import { storefrontVerificationRuntimePort } from "@voyant-travel/storefront"
import type { StorefrontVerificationRoutesOptions } from "@voyant-travel/storefront/verification"
import {
  type DurableNotificationProviderRuntime,
  durableNotificationProviderPort,
} from "./durable-provider-port.js"
import { createFinanceNotificationsRuntime } from "./finance-runtime.js"
import { createQuotesNotificationsRuntime } from "./quotes-runtime.js"
import { notificationsReminderJobRuntimePort } from "./reminder-job-runtime-port.js"
import { createNotificationsRuntime } from "./runtime.js"
import { notificationsRuntimePort } from "./runtime-port.js"

export interface NotificationsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  hasRuntimePort?(port: Pick<VoyantPort<unknown>, "id">): boolean
  getRuntimePort<T>(port: Pick<VoyantPort<T>, "id">): T | Promise<T>
}

/** Contribute Notifications and its narrow Finance integration. */
export function createNotificationsRuntimePortContribution(
  host: NotificationsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  const runtime = createNotificationsRuntime(host.primitives)
  const verification = {
    resolveProviders(bindings: Record<string, unknown>) {
      const resolver = host.primitives.config.read(bindings, "notificationProviders")
      return typeof resolver === "function" ? resolver(host.primitives.env(bindings)) : []
    },
    email: { subject: "Your verification code" },
  } satisfies StorefrontVerificationRoutesOptions
  const contribution: Record<string, unknown> = {
    [notificationsRuntimePort.id]: runtime,
    [notificationsReminderJobRuntimePort.id]: runtime.resolveReminderJobRuntime(undefined),
    [storefrontVerificationRuntimePort.id]: verification,
    [financeNotificationsRuntimePort.id]: createFinanceNotificationsRuntime(
      host.primitives,
    ) satisfies FinanceNotificationsRuntime,
  }
  if (host.hasRuntimePort?.(durableNotificationProviderPort)) {
    contribution[quotesNotificationsRuntimePort.id] = Promise.resolve(
      host.getRuntimePort<DurableNotificationProviderRuntime>(durableNotificationProviderPort),
    ).then(
      (selectedRuntime) =>
        createQuotesNotificationsRuntime(selectedRuntime) satisfies QuotesNotificationsRuntime,
    )
  }
  return contribution
}
