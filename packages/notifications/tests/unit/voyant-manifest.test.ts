import { financeNotificationsRuntimePort } from "@voyant-travel/finance/runtime-port"
import { quotesNotificationsRuntimePort } from "@voyant-travel/quotes/runtime-port"
import { storefrontVerificationRuntimePort } from "@voyant-travel/storefront/runtime-port"
import { describe, expect, it } from "vitest"
import { durableNotificationProviderPort } from "../../src/durable-provider-port.js"
import { notificationsReminderSubscriberRuntimeDescriptors } from "../../src/subscriber-runtime.js"
import {
  notificationsReminderSubscribersVoyantPlugin,
  notificationsVoyantModule,
} from "../../src/voyant.js"

describe("notifications deployment manifest", () => {
  it("owns the package deployment surfaces", () => {
    expect(notificationsVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/notifications",
      packageName: "@voyant-travel/notifications",
      provides: {
        capabilities: ["notifications.delivery"],
        ports: [
          { id: storefrontVerificationRuntimePort.id },
          { id: financeNotificationsRuntimePort.id },
          { id: "notifications.runtime" },
          { id: "notifications.reminder-job" },
          { id: quotesNotificationsRuntimePort.id },
        ],
      },
      runtimePorts: [
        { id: "notifications.runtime" },
        { id: "notifications.reminder-job" },
        {
          id: durableNotificationProviderPort.id,
          optional: true,
          conformance: expect.any(Object),
        },
      ],
      api: [
        {
          id: "@voyant-travel/notifications#api.admin",
          surface: "admin",
          openapi: { document: "notifications" },
          transactional: true,
          runtime: {
            entry: "@voyant-travel/notifications",
            export: "createNotificationsVoyantRuntime",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/notifications#schema" }],
      migrations: [{ id: "@voyant-travel/notifications#migrations" }],
      jobs: [
        {
          id: "notifications.deliver-durable-sends",
          schedule: { cron: "* * * * *", overlap: "skip" },
          scheduling: {
            required: true,
            profiles: {
              eager: { cron: "* * * * *", overlap: "skip" },
              economical: { cron: "*/5 * * * *", overlap: "skip" },
              "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
            },
          },
          wakeup: true,
          runtime: {
            entry: "@voyant-travel/notifications/reminder-job",
            export: "runDueNotificationSendsJob",
          },
        },
        {
          id: "notifications.send-due-reminders",
          schedule: { cron: "0 * * * *", overlap: "skip" },
          scheduling: {
            required: true,
            profiles: {
              eager: { cron: "*/15 * * * *", overlap: "skip" },
              economical: { cron: "0 */6 * * *", overlap: "skip" },
              "scale-to-zero": { cron: "0 */6 * * *", overlap: "skip" },
            },
          },
          runtime: {
            entry: "@voyant-travel/notifications/reminder-job",
            export: "runDueNotificationRemindersJob",
          },
        },
      ],
    })
    expect(notificationsVoyantModule.links?.map((link) => link.id)).toEqual([
      "@voyant-travel/notifications#linkable.notification-template",
      "@voyant-travel/notifications#linkable.notification-delivery",
      "@voyant-travel/notifications#linkable.notification-reminder-rule",
      "@voyant-travel/notifications#linkable.notification-reminder-run",
      "@voyant-travel/notifications#linkable.notification-reminder-rule-stage",
      "@voyant-travel/notifications#linkable.notification-reminder-stage-channel",
      "@voyant-travel/notifications#linkable.notification-settings",
    ])
    expect(notificationsVoyantModule.links?.map((link) => link.export)).toEqual([
      "notificationTemplateLinkable",
      "notificationDeliveryLinkable",
      "notificationReminderRuleLinkable",
      "notificationReminderRunLinkable",
      "notificationReminderRuleStageLinkable",
      "notificationReminderStageChannelLinkable",
      "notificationSettingsLinkable",
    ])
    expect(notificationsVoyantModule.tools?.map((tool) => [tool.name, tool.risk])).toEqual([
      ["list_notification_deliveries", "low"],
      ["get_notification_delivery", "low"],
      ["list_notification_templates", "low"],
      ["get_notification_template", "low"],
      ["send_notification", "high"],
    ])
    expect(notificationsVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/notifications#action.send-notification",
        version: "v2",
        availability: {
          status: "unavailable",
          reasonCode: "provider-idempotency-unavailable",
          enableWhen: {
            selectedProviderPorts: {
              mode: "all",
              ports: [durableNotificationProviderPort.id],
            },
          },
        },
      }),
    )
  })

  it("declares concrete payloads for notification-owned events", () => {
    const events = new Map(
      notificationsVoyantModule.events?.map(({ eventType, payloadSchema }) => [
        eventType,
        payloadSchema,
      ]),
    )

    expect(events.get("booking.documents.sent")).toMatchObject({
      required: ["bookingId", "recipient", "deliveryId", "provider", "documentKeys"],
      properties: {
        provider: { anyOf: [{ type: "string" }, { type: "null" }] },
        documentKeys: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    })
  })

  it("scopes admin routes and binds nav to package-owned copy", () => {
    const routes = notificationsVoyantModule.admin?.routes ?? []
    expect(routes).toHaveLength(9)
    expect(
      routes.every(({ requiredScopes }) => requiredScopes?.includes("notifications:read")),
    ).toBe(true)
    expect(notificationsVoyantModule.admin?.nav).toEqual([
      {
        id: "@voyant-travel/notifications#admin.nav.templates",
        routeId: "@voyant-travel/notifications#admin.route.templates-index",
        label: { namespace: "notifications.admin", key: "admin.templatesPage.title" },
      },
      {
        id: "@voyant-travel/notifications#admin.nav.reminder-rules",
        routeId: "@voyant-travel/notifications#admin.route.reminder-rules-index",
        label: { namespace: "notifications.admin", key: "admin.reminderRulesPage.title" },
      },
      {
        id: "@voyant-travel/notifications#admin.nav.deliveries",
        routeId: "@voyant-travel/notifications#admin.route.deliveries",
        label: { namespace: "notifications.admin", key: "admin.deliveriesPage.title" },
      },
      {
        id: "@voyant-travel/notifications#admin.nav.reminder-runs",
        routeId: "@voyant-travel/notifications#admin.route.reminder-runs",
        label: { namespace: "notifications.admin", key: "admin.reminderRunsPage.title" },
      },
      {
        id: "@voyant-travel/notifications#admin.nav.preview",
        routeId: "@voyant-travel/notifications#admin.route.preview",
        label: { namespace: "notifications.admin", key: "admin.previewPage.title" },
      },
      {
        id: "@voyant-travel/notifications#admin.nav.settings",
        routeId: "@voyant-travel/notifications#admin.route.settings",
        label: { namespace: "notifications.admin", key: "settings.heading" },
      },
    ])
  })

  it("publishes ordered confirmation and reminder subscriber runtime references", () => {
    const declarations = notificationsReminderSubscribersVoyantPlugin.subscribers ?? []

    expect(notificationsReminderSubscribersVoyantPlugin).toMatchObject({
      runtime: {
        entry: "@voyant-travel/notifications",
        export: "createNotificationsSubscribersVoyantRuntime",
      },
      runtimePorts: [{ id: "notifications.runtime" }],
    })
    expect(declarations.map(({ id, eventType }) => ({ id, eventType }))).toEqual(
      notificationsReminderSubscriberRuntimeDescriptors.map(({ id, eventType }) => ({
        id,
        eventType,
      })),
    )
    expect(declarations.map((subscriber) => subscriber.runtime?.export)).toEqual([
      "notificationsBookingConfirmedReminderSubscriber",
      "notificationsPaymentCompletedReminderSubscriber",
      "notificationsBookingCancelledReminderSubscriber",
      "notificationsBookingExpiredReminderSubscriber",
    ])
  })
})
