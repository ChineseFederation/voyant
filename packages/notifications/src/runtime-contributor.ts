import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import type { VoyantPort } from "@voyant-travel/core/project"
import {
  type FinanceNotificationsRuntime,
  financeNotificationsRuntimePort,
} from "@voyant-travel/finance/runtime-port"
import { customerVerificationRuntimePort } from "@voyant-travel/identity/runtime-port"
import type { CustomerVerificationRoutesOptions } from "@voyant-travel/identity/verification"
import {
  type ProposalsNotificationsRuntime,
  proposalsNotificationsRuntimePort,
} from "@voyant-travel/proposals/runtime-port"
import { relationshipsPersonNotificationsRuntimePort } from "@voyant-travel/relationships/runtime-port"
import { toCustomerVerificationNotificationProviders } from "./customer-verification-runtime.js"
import {
  type DurableNotificationProviderRuntime,
  durableNotificationProviderPort,
} from "./durable-provider-port.js"
import { createFinanceNotificationsRuntime } from "./finance-runtime.js"
import { createPersonCommunicationsRuntime } from "./person-communications-runtime.js"
import { createProposalsNotificationsRuntime } from "./proposals-runtime.js"
import { notificationsReminderJobRuntimePort } from "./reminder-job-runtime-port.js"
import { createNotificationsRuntime } from "./runtime.js"
import { notificationsRuntimePort } from "./runtime-port.js"
import type { NotificationProvider } from "./types.js"

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
      return toCustomerVerificationNotificationProviders(
        configuredNotificationProviders(host, bindings),
      )
    },
    email: { subject: "Your verification code" },
  } satisfies CustomerVerificationRoutesOptions
  const contribution: Record<string, unknown> = {
    [notificationsRuntimePort.id]: runtime,
    [notificationsReminderJobRuntimePort.id]: runtime.resolveReminderJobRuntime(undefined),
    [customerVerificationRuntimePort.id]: verification,
    [financeNotificationsRuntimePort.id]: createFinanceNotificationsRuntime(
      host.primitives,
    ) satisfies FinanceNotificationsRuntime,
    [relationshipsPersonNotificationsRuntimePort.id]: createPersonCommunicationsRuntime(),
  }
  if (host.hasRuntimePort?.(durableNotificationProviderPort)) {
    contribution[proposalsNotificationsRuntimePort.id] = Promise.resolve(
      host.getRuntimePort<DurableNotificationProviderRuntime>(durableNotificationProviderPort),
    ).then(
      (selectedRuntime) =>
        createProposalsNotificationsRuntime(
          selectedRuntime,
        ) satisfies ProposalsNotificationsRuntime,
    )
  }
  return contribution
}

/**
 * Read the app's configured provider set. The host config primitive is untyped,
 * so the narrowing happens here once and callers work against
 * `NotificationProvider` instead of `any` — the `any` is what let a durable
 * provider reach Storefront's `send`-shaped contract unchallenged (voyant#3923).
 */
function configuredNotificationProviders(
  host: NotificationsRuntimeContributorHost,
  bindings: Record<string, unknown>,
): ReadonlyArray<NotificationProvider> {
  const resolver = host.primitives.config.read(bindings, "notificationProviders")
  return typeof resolver === "function"
    ? (resolver(host.primitives.env(bindings)) as ReadonlyArray<NotificationProvider>)
    : []
}
