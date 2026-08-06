import {
  type AdminExtension,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import { Mail } from "lucide-react"

/**
 * Semantic destinations the notifications admin surfaces navigate to
 * (packaged-admin RFC §4.7): the templates list/detail pair (list rows and
 * the detail page's back link) and the reminder rules list/detail pair
 * (the per-rule "Manage stages" link and the stage editor's back link).
 * All shapes are closed, so they are declared here directly.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The notification templates list page. */
    "notificationTemplate.list": Record<string, never>
    /** A notification template's detail page. */
    "notificationTemplate.detail": { templateId: string }
    /** The reminder rules list page. */
    "notificationReminderRule.list": Record<string, never>
    /** A reminder rule's detail page (stage sequence editor). */
    "notificationReminderRule.detail": { ruleId: string }
  }
}

// Packaged admin hosts (packaged-admin RFC Phase 3): the operator-grade
// notifications pages bound to their data wiring + semantic-destination
// navigation. Host route files only bind route params onto these.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page,
// host or dialog component values — it is evaluated with the workspace
// chrome, so a static re-export would pin the heavy notifications modules
// into the entry chunk. Consumers import them from their specific modules;
// only their TYPES re-export here.
export type { NotificationReminderRuleDetailHostProps } from "./notification-reminder-rule-detail-host.js"
export type { NotificationTemplateDetailHostProps } from "./notification-template-detail-host.js"

export interface CreateNotificationsAdminExtensionOptions {
  /** Mount path of the notifications pages inside the admin workspace. Default `/notifications`. */
  basePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    templates?: string
    reminderRules?: string
    deliveries?: string
    reminderRuns?: string
    preview?: string
    settings?: string
    staffAlerts?: string
    myNotifications?: string
  }
}

/**
 * The notifications admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Notifications group.
 *
 * ROUTES: full implementations (packaged-admin RFC §4.8 endgame) — each
 * contribution carries a lazy `page` module loader, so hosts bind them
 * through their code-assembled admin route tree with no per-route files.
 * The notifications pages keep their filter state component-local and fetch
 * client-side, so contributions carry no loader, no search contract and no
 * SSR override. {@link NotificationTemplatesHost},
 * {@link NotificationReminderRulesHost}, {@link NotificationDeliveriesHost},
 * {@link NotificationReminderRunsHost}, {@link RemindersPreviewHost} and
 * {@link NotificationSettingsHost} are zero-prop; the detail contributions
 * resolve wrapper pages (`./pages/*`) that bind the matched `$id` param onto
 * {@link NotificationTemplateDetailHost} and
 * {@link NotificationReminderRuleDetailHost}. Pages stay code-split because
 * every `page` is a dynamic import of the specific host module, never a
 * static reference from this factory.
 *
 * WIDGETS: none today. No cross-domain notifications card is slot-mounted —
 * deliveries shown on other domains' detail pages are those hosts' concern.
 */
export function createNotificationsAdminExtension(
  options: CreateNotificationsAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/notifications", labels = {} } = options
  const {
    templates = "Templates",
    reminderRules = "Reminder Rules",
    deliveries = "Deliveries",
    reminderRuns = "Reminder Runs",
    preview = "Preview",
    settings = "Settings",
    staffAlerts = "Staff alerts",
    myNotifications = "My notifications",
  } = labels

  return defineAdminExtension({
    id: "notifications",
    routes: [
      {
        // Index redirect (formerly the host's `notifications/index.tsx`
        // file route): `/notifications` lands on the templates page.
        id: "notifications-index",
        path: basePath,
        title: templates,
        redirectTo: `${basePath}/templates`,
      },
      {
        id: "notifications-templates-index",
        path: `${basePath}/templates`,
        title: templates,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`).
        destination: "notificationTemplate.list",
        page: () =>
          import("./notification-templates-host.js").then((module) =>
            adminRoutePageModule(module.NotificationTemplatesHost),
          ),
      },
      {
        id: "notifications-templates-detail",
        path: `${basePath}/templates/$id`,
        title: templates,
        destination: "notificationTemplate.detail",
        destinationParams: { id: "templateId" },
        page: () => import("./pages/notification-template-detail-page.js"),
      },
      {
        id: "notifications-reminder-rules-index",
        path: `${basePath}/reminder-rules`,
        title: reminderRules,
        destination: "notificationReminderRule.list",
        page: () =>
          import("./notification-reminder-rules-host.js").then((module) =>
            adminRoutePageModule(module.NotificationReminderRulesHost),
          ),
      },
      {
        id: "notifications-reminder-rules-detail",
        path: `${basePath}/reminder-rules/$id`,
        title: reminderRules,
        destination: "notificationReminderRule.detail",
        destinationParams: { id: "ruleId" },
        page: () => import("./pages/notification-reminder-rule-detail-page.js"),
      },
      {
        id: "notifications-deliveries",
        path: `${basePath}/deliveries`,
        title: deliveries,
        page: () =>
          import("./notification-deliveries-host.js").then((module) =>
            adminRoutePageModule(module.NotificationDeliveriesHost),
          ),
      },
      {
        id: "notifications-reminder-runs",
        path: `${basePath}/reminder-runs`,
        title: reminderRuns,
        page: () =>
          import("./notification-reminder-runs-host.js").then((module) =>
            adminRoutePageModule(module.NotificationReminderRunsHost),
          ),
      },
      {
        id: "notifications-preview",
        path: `${basePath}/preview`,
        title: preview,
        page: () =>
          import("./reminders-preview-host.js").then((module) =>
            adminRoutePageModule(module.RemindersPreviewHost),
          ),
      },
      {
        id: "notifications-settings",
        path: `${basePath}/settings`,
        title: settings,
        page: () =>
          import("./notification-settings-host.js").then((module) =>
            adminRoutePageModule(module.NotificationSettingsHost),
          ),
      },
      {
        id: "notifications-staff-alerts",
        path: `${basePath}/staff-alerts`,
        title: staffAlerts,
        page: () =>
          import("./staff-alerts-host.js").then((module) =>
            adminRoutePageModule(module.StaffAlertsHost),
          ),
      },
      {
        id: "notifications-my-notifications",
        path: `${basePath}/my-notifications`,
        title: myNotifications,
        page: () =>
          import("./my-notifications-host.js").then((module) =>
            adminRoutePageModule(module.MyNotificationsHost),
          ),
      },
    ],
  })
}

export function createSelectedNotificationsAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    notifications: navMessages.notifications ?? "Notifications",
    templates: navMessages.notificationTemplates ?? "Templates",
    reminderRules: navMessages.notificationReminderRules ?? "Reminder rules",
    deliveries: navMessages.notificationDeliveries ?? "Deliveries",
    reminderRuns: navMessages.notificationReminderRuns ?? "Reminder runs",
    preview: navMessages.notificationPreview ?? "Preview",
    settings: navMessages.notificationSettings ?? "Settings",
    staffAlerts: navMessages.notificationStaffAlerts ?? "Staff alerts",
    myNotifications: navMessages.notificationMyNotifications ?? "My notifications",
  }
  const extension = withAdminRouteMessagesProvider(
    createNotificationsAdminExtension({
      labels,
    }),
    () =>
      import("../i18n/index.js").then((module) => ({
        default: module.NotificationsUiMessagesProvider,
      })),
  )

  return {
    ...extension,
    navigation: [
      {
        order: -90,
        items: [
          {
            id: "notifications",
            title: labels.notifications,
            url: "/notifications/templates",
            icon: Mail,
            items: [
              {
                id: "notification-templates",
                title: labels.templates,
                url: "/notifications/templates",
              },
              {
                id: "notification-reminder-rules",
                title: labels.reminderRules,
                url: "/notifications/reminder-rules",
              },
              {
                id: "notification-deliveries",
                title: labels.deliveries,
                url: "/notifications/deliveries",
              },
              {
                id: "notification-reminder-runs",
                title: labels.reminderRuns,
                url: "/notifications/reminder-runs",
              },
              {
                id: "notification-preview",
                title: labels.preview,
                url: "/notifications/preview",
              },
              {
                id: "notification-settings",
                title: labels.settings,
                url: "/notifications/settings",
              },
              {
                id: "notification-staff-alerts",
                title: labels.staffAlerts,
                url: "/notifications/staff-alerts",
              },
              {
                id: "notification-my-notifications",
                title: labels.myNotifications,
                url: "/notifications/my-notifications",
              },
            ],
          },
        ],
      },
    ],
  }
}
