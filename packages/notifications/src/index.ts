// agent-quality: file-size exception -- owner: notifications; existing module stays co-located until a dedicated split preserves behavior and tests.
import type { BootstrapContext, Module } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { durableNotificationProviderPort } from "./durable-provider-port.js"
import {
  buildNotificationsRouteRuntime,
  createNotificationsRoutes,
  NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY,
  type NotificationsRoutesOptions,
} from "./routes.js"
import { notificationsRuntimePort } from "./runtime-port.js"
import { notificationsModule } from "./schema.js"
import { createNotificationService } from "./service.js"
import { STAFF_ALERT_RUNTIME_KEY } from "./service-staff-alert-dispatch.js"
import {
  createStaffAlertBrandResolver,
  staffAlertContextResolvers,
} from "./staff-alert-resolvers.js"
import type { StaffAlertSubscriberRuntime } from "./staff-alert-subscriber.js"
import {
  NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY,
  type NotificationsSubscriberRuntime,
} from "./subscriber-runtime.js"

export {
  type DurableNotificationProviderProbe,
  type DurableNotificationProviderRuntime,
  durableNotificationProviderPort,
} from "./durable-provider-port.js"
export {
  type DeliverReminderJobInput,
  type DeliverReminderJobOutput,
  NOTIFICATION_REMINDER_JOB_RUNTIME_KEY,
  type NotificationReminderJobRuntime,
  type SendDueRemindersJobInput,
} from "./job-runtime.js"
export {
  notificationLiquidEngine,
  renderLiquidTemplate,
} from "./liquid.js"
export type { NotificationsRouteRuntime, NotificationsRoutesOptions } from "./routes.js"
export {
  buildNotificationsRouteRuntime,
  createNotificationsRoutes,
  NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY,
} from "./routes.js"
export type { NotificationsRuntimeProvider } from "./runtime-port.js"
export { notificationsRuntimePort } from "./runtime-port.js"
export type {
  NewNotificationDelivery,
  NewNotificationReminderRule,
  NewNotificationReminderRun,
  NewNotificationSendOperation,
  NewNotificationTemplate,
  NewStaffAlertPreference,
  NewStaffAlertSettings,
  NotificationDelivery,
  NotificationReminderRule,
  NotificationReminderRun,
  NotificationSendOperation,
  NotificationsApiModule,
  NotificationTemplate,
  StaffAlertPreference,
  StaffAlertRoleRouting,
  StaffAlertSettings,
} from "./schema.js"
export {
  notificationChannelEnum,
  notificationDeliveries,
  notificationDeliveryStatusEnum,
  notificationReminderRules,
  notificationReminderRunStatusEnum,
  notificationReminderRuns,
  notificationReminderStatusEnum,
  notificationReminderTargetTypeEnum,
  notificationSendOperationStatusEnum,
  notificationSendOperations,
  notificationsModule,
  notificationTargetTypeEnum,
  notificationTemplateStatusEnum,
  notificationTemplates,
  staffAlertPreferences,
  staffAlertSettings,
} from "./schema.js"
export {
  createDefaultBookingDocumentAttachment,
  NotificationError,
  NotificationIdempotencyConflictError,
  previewNotificationTemplate,
  renderNotificationTemplate,
} from "./service.js"
export type {
  BookingDocumentAttachmentResolver,
  BookingDocumentsSentEvent,
  SendBookingDocumentsRuntimeOptions,
} from "./service-booking-documents.js"
export type {
  DispatchStaffAlertInput,
  DispatchStaffAlertResult,
  StaffAlertRuntime,
} from "./service-staff-alert-dispatch.js"
export {
  dispatchStaffAlert,
  STAFF_ALERT_RUNTIME_KEY,
} from "./service-staff-alert-dispatch.js"
export type {
  ResolveStaffAlertRecipientsInput,
  StaffAlertRecipient,
} from "./service-staff-alert-recipients.js"
export {
  findStaffUserEmail,
  resolveStaffAlertRecipients,
} from "./service-staff-alert-recipients.js"
export type {
  ResolvedStaffAlertSetting,
  StaffAlertPreferenceView,
  UpdateStaffAlertSettingInput,
} from "./service-staff-alerts.js"
export {
  clearStaffAlertPreference,
  getStaffAlertSetting,
  listStaffAlertOptOutsForKeys,
  listStaffAlertOptOutUserIds,
  listStaffAlertPreferences,
  listStaffAlertSettings,
  StaffAlertError,
  upsertStaffAlertPreference,
  upsertStaffAlertSetting,
} from "./service-staff-alerts.js"
export type {
  StaffAlertContext,
  StaffAlertContextMap,
  StaffAlertContextResolver,
  StaffAlertContextResolverRegistry,
  StaffAlertDefinition,
  StaffAlertEventKey,
  StaffAlertGroup,
  StaffAlertMoney,
  StaffAlertParty,
  StaffBookingCancelledContext,
  StaffBookingConfirmedContext,
  StaffContractSignedContext,
  StaffCustomerSignalCreatedContext,
  StaffInvoiceSettledContext,
  StaffPaymentCompletedContext,
} from "./staff-alert-registry.js"
export {
  getStaffAlertDefinition,
  isStaffAlertEventKey,
  STAFF_ALERT_CONTEXT_RESOLVERS_KEY,
  STAFF_ALERT_DEFINITIONS,
  STAFF_ALERT_EVENT_KEYS,
} from "./staff-alert-registry.js"
export {
  createStaffAlertBrandResolver,
  staffAlertContextResolvers,
} from "./staff-alert-resolvers.js"
export type {
  StaffAlertSubscriberDependencies,
  StaffAlertSubscriberRuntime,
} from "./staff-alert-subscriber.js"
export {
  createStaffAlertSubscriberRuntime,
  staffAlertSubscriberId,
  staffAlertSubscriberRuntimeDescriptors,
} from "./staff-alert-subscriber.js"
/**
 * Auto-dispatch policy for the `booking.confirmed` subscriber. Set `enabled:
 * false` (or leave the option off entirely) to opt out.
 */
export type {
  NotificationsSubscriberDependencies,
  NotificationsSubscriberRuntime,
} from "./subscriber-runtime.js"
export {
  createBookingCancelledReminderSubscriberRuntime,
  createBookingConfirmedReminderSubscriberRuntime,
  createPaymentCompletedReminderSubscriberRuntime,
  NOTIFICATIONS_BOOKING_CANCELLED_REMINDER_SUBSCRIBER_ID,
  NOTIFICATIONS_BOOKING_CONFIRMED_REMINDER_SUBSCRIBER_ID,
  NOTIFICATIONS_PAYMENT_COMPLETED_REMINDER_SUBSCRIBER_ID,
  NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY,
  notificationsBookingCancelledReminderSubscriber,
  notificationsBookingConfirmedReminderSubscriber,
  notificationsPaymentCompletedReminderSubscriber,
  notificationsReminderSubscriberRuntimeDescriptors,
} from "./subscriber-runtime.js"
export type {
  NotificationTaskEnv,
  NotificationTaskRuntime,
  NotificationTaskRuntimeOptions,
  ReminderDeliveryJob,
} from "./task-runtime.js"
export { buildNotificationTaskRuntime } from "./task-runtime.js"
export { deliverQueuedNotificationReminder, sendDueNotificationReminders } from "./tasks/index.js"
export type {
  NotificationLiquidSnippet,
  NotificationTemplateVariableCategory,
  NotificationTemplateVariableDefinition,
  NotificationTemplateVariableType,
} from "./template-authoring.js"
export {
  notificationLiquidSnippets,
  notificationTemplateVariableCatalog,
} from "./template-authoring.js"
export type {
  DurableNotificationDeliveryCapability,
  DurableNotificationDeliveryContext,
  NotificationAttachment,
  NotificationChannel,
  NotificationPayload,
  NotificationProvider,
  NotificationResult,
} from "./types.js"
export {
  bookingDocumentBundleItemSchema,
  bookingDocumentBundleSchema,
  insertNotificationReminderRuleSchema,
  insertNotificationReminderRuleStageSchema,
  insertNotificationReminderStageChannelSchema,
  insertNotificationTemplateSchema,
  notificationAttachmentSchema,
  notificationChannelSchema,
  notificationDeliveryListQuerySchema,
  notificationDeliveryStatusSchema,
  notificationDocumentSourceSchema,
  notificationDocumentTypeSchema,
  notificationReminderRuleListQuerySchema,
  notificationReminderRunDeliverySummarySchema,
  notificationReminderRunLinksSchema,
  notificationReminderRunListQuerySchema,
  notificationReminderRunListResponseSchema,
  notificationReminderRunRecordSchema,
  notificationReminderRunRuleSummarySchema,
  notificationReminderRunStatusSchema,
  notificationReminderStageAnchorSchema,
  notificationReminderStageCadenceIntervalSchema,
  notificationReminderStageCadenceKindSchema,
  notificationReminderStatusSchema,
  notificationReminderTargetTypeSchema,
  notificationStageRecipientKindSchema,
  notificationTargetTypeSchema,
  notificationTemplateListQuerySchema,
  notificationTemplateStatusSchema,
  previewNotificationTemplateResultSchema,
  previewNotificationTemplateSchema,
  previewRemindersQuerySchema,
  reorderReminderRuleStagesSchema,
  runDueRemindersSchema,
  updateNotificationReminderRuleSchema,
  updateNotificationReminderRuleStageSchema,
  updateNotificationReminderStageChannelSchema,
  updateNotificationSettingsSchema,
  updateNotificationTemplateSchema,
} from "./validation.js"

export interface CreateNotificationsApiModuleOptions extends NotificationsRoutesOptions {
  /** Resolve the deployment database for package-owned subscriber and job runtimes. */
  resolveDb?: (bindings: Record<string, unknown>) => AnyDrizzleDb
}

export function createNotificationsApiModule(
  options?: CreateNotificationsApiModuleOptions,
): ApiModule {
  const routes = createNotificationsRoutes(options)

  const module: Module = {
    ...notificationsModule,
    bootstrap: ({ bindings, container }) => {
      container.register(
        NOTIFICATIONS_ROUTE_RUNTIME_CONTAINER_KEY,
        buildNotificationsRouteRuntime(bindings as Record<string, unknown>, options),
      )
    },
  }

  return {
    module,
    adminRoutes: routes,
  }
}

/** Package-owned adapter from the selected graph's typed Node host port. */
export const createNotificationsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => {
    const hostProvider = await getPort(notificationsRuntimePort)
    const durableRuntime = hasPort(durableNotificationProviderPort)
      ? await getPort(durableNotificationProviderPort)
      : null
    const provider = durableRuntime
      ? {
          ...hostProvider,
          resolveProviders: () => durableRuntime.providers,
          resolveReminderJobRuntime: (bindings?: Record<string, unknown>) => {
            const jobs = hostProvider.resolveReminderJobRuntime(bindings)
            return {
              ...jobs,
              resolveRuntimeOptions: async (env: Record<string, unknown>) => ({
                ...(await jobs.resolveRuntimeOptions(env)),
                providers: durableRuntime.providers,
                resolveProviders: undefined,
              }),
            }
          },
        }
      : hostProvider
    const configured = createNotificationsApiModule(provider)
    const bootstrap = configured.module.bootstrap

    return {
      ...configured,
      module: {
        ...configured.module,
        bootstrap: async (context: BootstrapContext) => {
          await bootstrap?.(context)
        },
      },
    }
  },
)

/** Selected-extension adapter that gates subscriber services with subscriber selection. */
export const createNotificationsSubscribersVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort }) => {
    const provider = await getPort(notificationsRuntimePort)
    return {
      extension: {
        name: "notifications-reminder-subscribers",
        module: "notifications",
        bootstrap: ({ bindings, container }: BootstrapContext) => {
          const runtimeBindings = bindings as Record<string, unknown>
          container.register(
            NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY,
            createNotificationsSubscriberRuntime(runtimeBindings, provider),
          )
          container.register(
            STAFF_ALERT_RUNTIME_KEY,
            createStaffAlertSubscriberRuntimeFor(runtimeBindings, provider),
          )
        },
      },
    }
  },
)

function createNotificationsSubscriberRuntime(
  bindings: Record<string, unknown>,
  provider: import("./runtime-port.js").NotificationsRuntimeProvider,
): NotificationsSubscriberRuntime {
  const runtime = buildNotificationsRouteRuntime(bindings, provider)
  return {
    resolveDb: (runtimeBindings) =>
      provider.resolveDb(runtimeBindings as Record<string, unknown>) as PostgresJsDatabase,
    dispatcher: createNotificationService(runtime.providers),
    documentAttachmentResolver: runtime.documentAttachmentResolver,
  }
}

/**
 * Staff alert wiring, registered alongside the reminder subscriber runtime.
 *
 * Both are activated by the same extension because both are "this deployment
 * delivers notifications from events" — splitting them would let a deployment
 * end up with staff subscribers registered and no runtime to serve them.
 *
 * `adminBaseUrl` comes from host config. Without it the deep link in every
 * alert would be relative and dead from an inbox, so a deployment that has not
 * set it gets a resolver that still renders — just with links to the
 * deployment's own origin, if the host supplied one.
 */
function createStaffAlertSubscriberRuntimeFor(
  bindings: Record<string, unknown>,
  provider: import("./runtime-port.js").NotificationsRuntimeProvider,
): StaffAlertSubscriberRuntime {
  const runtime = buildNotificationsRouteRuntime(bindings, provider)
  const adminBaseUrl = resolveAdminBaseUrl(bindings)
  return {
    resolveDb: (runtimeBindings) =>
      provider.resolveDb(runtimeBindings as Record<string, unknown>) as PostgresJsDatabase,
    dispatcher: createNotificationService(runtime.providers),
    resolvers: staffAlertContextResolvers,
    resolveBrand: createStaffAlertBrandResolver({ adminBaseUrl }),
  }
}

function resolveAdminBaseUrl(bindings: Record<string, unknown>): string {
  const candidate =
    bindings.ADMIN_BASE_URL ??
    bindings.APP_BASE_URL ??
    bindings.PUBLIC_BASE_URL ??
    bindings.BASE_URL
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : ""
}
