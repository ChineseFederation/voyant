import { describe, expect, it } from "vitest"

import {
  createNotificationsAdminExtension,
  createSelectedNotificationsAdminExtension,
} from "./index.js"
import { NotificationDeliveriesHost } from "./notification-deliveries-host.js"
import { NotificationDeliveryDetailDialog } from "./notification-delivery-detail-dialog.js"
import { NotificationReminderRuleDetailHost } from "./notification-reminder-rule-detail-host.js"
import { NotificationReminderRuleDialog } from "./notification-reminder-rule-dialog.js"
import { NotificationReminderRulesHost } from "./notification-reminder-rules-host.js"
import { NotificationReminderRunsHost } from "./notification-reminder-runs-host.js"
import { NotificationSettingsHost } from "./notification-settings-host.js"
import { NotificationTemplateDetailHost } from "./notification-template-detail-host.js"
import { NotificationTemplateDialog } from "./notification-template-dialog.js"
import { NotificationTemplatesHost } from "./notification-templates-host.js"
import { RemindersPreviewHost } from "./reminders-preview-host.js"

describe("createNotificationsAdminExtension", () => {
  it("adds localized standard navigation only through the selected factory", () => {
    const extension = createNotificationsAdminExtension()
    expect(extension.id).toBe("notifications")
    expect(extension.navigation).toBeUndefined()

    const selected = createSelectedNotificationsAdminExtension({
      navMessages: {
        notifications: "Notificari",
        notificationTemplates: "Sabloane",
        notificationReminderRules: "Reguli",
        notificationDeliveries: "Livrari",
        notificationReminderRuns: "Rulari",
        notificationPreview: "Previzualizare",
        notificationSettings: "Setari",
        notificationStaffAlerts: "Alerte echipa",
        notificationMyNotifications: "Notificarile mele",
      },
    })
    expect(selected.navigation?.[0]).toMatchObject({
      order: -90,
      items: [
        {
          id: "notifications",
          title: "Notificari",
          url: "/notifications/templates",
          items: [
            { id: "notification-templates", title: "Sabloane", url: "/notifications/templates" },
            {
              id: "notification-reminder-rules",
              title: "Reguli",
              url: "/notifications/reminder-rules",
            },
            { id: "notification-deliveries", title: "Livrari", url: "/notifications/deliveries" },
            {
              id: "notification-reminder-runs",
              title: "Rulari",
              url: "/notifications/reminder-runs",
            },
            { id: "notification-preview", title: "Previzualizare", url: "/notifications/preview" },
            { id: "notification-settings", title: "Setari", url: "/notifications/settings" },
            {
              id: "notification-staff-alerts",
              title: "Alerte echipa",
              url: "/notifications/staff-alerts",
            },
            {
              id: "notification-my-notifications",
              title: "Notificarile mele",
              url: "/notifications/my-notifications",
            },
          ],
        },
      ],
    })
    expect(selected.navigation?.[0]?.items[0]?.icon).toBeDefined()
  })

  it("falls back to stable English selected navigation copy", () => {
    const extension = createSelectedNotificationsAdminExtension({ navMessages: {} })
    expect(extension.navigation?.[0]?.items[0]).toMatchObject({
      title: "Notifications",
      items: [
        { title: "Templates" },
        { title: "Reminder rules" },
        { title: "Deliveries" },
        { title: "Reminder runs" },
        { title: "Preview" },
        { title: "Settings" },
        { title: "Staff alerts" },
        { title: "My notifications" },
      ],
    })
  })

  it("describes the notifications routes with unique ids and paths", () => {
    const extension = createNotificationsAdminExtension()
    const routes = extension.routes ?? []
    expect(routes).toHaveLength(11)
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length)
    expect(routes.map((route) => route.path)).toEqual([
      "/notifications",
      "/notifications/templates",
      "/notifications/templates/$id",
      "/notifications/reminder-rules",
      "/notifications/reminder-rules/$id",
      "/notifications/deliveries",
      "/notifications/reminder-runs",
      "/notifications/preview",
      "/notifications/settings",
      "/notifications/staff-alerts",
      "/notifications/my-notifications",
    ])
  })

  it("redirects the notifications index to the templates page", () => {
    const extension = createNotificationsAdminExtension()
    const index = extension.routes?.find((route) => route.id === "notifications-index")
    expect(index?.path).toBe("/notifications")
    expect(index?.redirectTo).toBe("/notifications/templates")
    expect(index?.page).toBeUndefined()
  })

  it("honors basePath and labels", () => {
    const extension = createNotificationsAdminExtension({
      basePath: "/notificari",
      labels: { templates: "Sabloane", reminderRules: "Reguli reminder" },
    })
    const templatesIndex = extension.routes?.find(
      (route) => route.id === "notifications-templates-index",
    )
    expect(templatesIndex?.path).toBe("/notificari/templates")
    expect(templatesIndex?.title).toBe("Sabloane")
    const rulesDetail = extension.routes?.find(
      (route) => route.id === "notifications-reminder-rules-detail",
    )
    expect(rulesDetail?.path).toBe("/notificari/reminder-rules/$id")
    expect(rulesDetail?.title).toBe("Reguli reminder")
  })

  it("carries lazy pages only (no loader, no SSR override, no eager component)", () => {
    // RFC §4.8 endgame: contributions ship the implementation, hosts bind
    // them into their code-assembled route tree. The notifications pages
    // fetch client-side with component-local filter state, so contributions
    // carry a lazy `page` module loader and nothing else.
    const extension = createNotificationsAdminExtension()
    const routes = (extension.routes ?? []).filter((route) => !route.redirectTo)
    expect(routes).toHaveLength(10)
    for (const route of routes) {
      expect(route.component).toBeUndefined()
      expect(typeof route.page).toBe("function")
      expect(route.loader).toBeUndefined()
      expect(route.ssr).toBeUndefined()
    }
  })

  it("resolves every lazy page to a module with a default component", async () => {
    const extension = createNotificationsAdminExtension()
    for (const route of extension.routes ?? []) {
      if (route.redirectTo) continue
      const module = await route.page?.()
      expect(typeof module?.default).toBe("function")
    }
  })

  it("contributes no widgets (no cross-domain notifications card is slot-mounted today)", () => {
    const extension = createNotificationsAdminExtension()
    expect(extension.widgets).toBeUndefined()
  })
})

describe("packaged notifications admin hosts", () => {
  // Importable + renderable component types — the operator's thin route
  // hosts bind these directly, so a broken import surface fails here, not
  // in an app build. (Behavioral rendering needs the workspace provider
  // stack and lives with the host apps.)
  it("exports the page hosts and dialogs as components from the admin entrypoint", () => {
    for (const host of [
      NotificationDeliveriesHost,
      NotificationDeliveryDetailDialog,
      NotificationReminderRuleDetailHost,
      NotificationReminderRuleDialog,
      NotificationReminderRulesHost,
      NotificationReminderRunsHost,
      NotificationSettingsHost,
      NotificationTemplateDetailHost,
      NotificationTemplateDialog,
      NotificationTemplatesHost,
      RemindersPreviewHost,
    ]) {
      expect(typeof host).toBe("function")
    }
  })
})
