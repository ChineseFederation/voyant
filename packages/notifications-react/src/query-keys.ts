export interface NotificationTemplatesListFilters {
  search?: string | undefined
  channel?: "email" | "sms" | undefined
  provider?: string | undefined
  status?: "draft" | "active" | "archived" | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface NotificationReminderRulesListFilters {
  search?: string | undefined
  targetType?:
    | "booking_confirmed"
    | "booking_payment_schedule"
    | "payment_complete"
    | "booking_cancelled_non_payment"
    | "invoice"
    | undefined
  channel?: "email" | "sms" | undefined
  status?: "draft" | "active" | "archived" | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface NotificationDeliveriesListFilters {
  channel?: "email" | "sms" | undefined
  provider?: string | undefined
  status?: "pending" | "sent" | "failed" | "cancelled" | undefined
  templateSlug?: string | undefined
  targetType?:
    | "booking"
    | "booking_payment_schedule"
    | "booking_guarantee"
    | "invoice"
    | "payment_session"
    | "person"
    | "organization"
    | "other"
    | undefined
  targetId?: string | undefined
  bookingId?: string | undefined
  invoiceId?: string | undefined
  paymentSessionId?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface NotificationReminderRunsListFilters {
  reminderRuleId?: string | undefined
  targetType?:
    | "booking_confirmed"
    | "booking_payment_schedule"
    | "payment_complete"
    | "booking_cancelled_non_payment"
    | "invoice"
    | undefined
  targetId?: string | undefined
  scheduleId?: string | undefined
  invoiceId?: string | undefined
  bookingId?: string | undefined
  paymentSessionId?: string | undefined
  notificationDeliveryId?: string | undefined
  personId?: string | undefined
  organizationId?: string | undefined
  recipient?: string | undefined
  status?: "queued" | "processing" | "sent" | "skipped" | "failed" | undefined
  limit?: number | undefined
  offset?: number | undefined
}

export interface RemindersPreviewFilters {
  date?: string | undefined
  ruleId?: string | undefined
  targetId?: string | undefined
}

export const notificationsQueryKeys = {
  all: ["notifications"] as const,
  templates: () => [...notificationsQueryKeys.all, "templates"] as const,
  templatesList: (filters: NotificationTemplatesListFilters) =>
    [...notificationsQueryKeys.templates(), filters] as const,
  template: (id: string) => [...notificationsQueryKeys.templates(), id] as const,
  deliveries: () => [...notificationsQueryKeys.all, "deliveries"] as const,
  deliveriesList: (filters: NotificationDeliveriesListFilters) =>
    [...notificationsQueryKeys.deliveries(), filters] as const,
  delivery: (id: string) => [...notificationsQueryKeys.deliveries(), id] as const,
  reminderRules: () => [...notificationsQueryKeys.all, "reminder-rules"] as const,
  reminderRulesList: (filters: NotificationReminderRulesListFilters) =>
    [...notificationsQueryKeys.reminderRules(), filters] as const,
  reminderRule: (id: string) => [...notificationsQueryKeys.reminderRules(), id] as const,
  reminderRuleStages: (reminderRuleId: string) =>
    [...notificationsQueryKeys.reminderRule(reminderRuleId), "stages"] as const,
  reminderStageChannels: (stageId: string) =>
    [...notificationsQueryKeys.all, "stage-channels", stageId] as const,
  reminderRuns: () => [...notificationsQueryKeys.all, "reminder-runs"] as const,
  reminderRunsList: (filters: NotificationReminderRunsListFilters) =>
    [...notificationsQueryKeys.reminderRuns(), filters] as const,
  reminderRun: (id: string) => [...notificationsQueryKeys.reminderRuns(), id] as const,
  remindersPreview: (filters: RemindersPreviewFilters) =>
    [...notificationsQueryKeys.all, "preview", filters] as const,
  notificationSettings: () => [...notificationsQueryKeys.all, "settings"] as const,
  staffAlerts: () => [...notificationsQueryKeys.all, "staff-alerts"] as const,
  staffAlertPreferences: () => [...notificationsQueryKeys.all, "staff-alert-preferences"] as const,
}
