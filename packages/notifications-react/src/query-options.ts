"use client"

import { queryOptions } from "@tanstack/react-query"

import { type FetchWithValidationOptions, fetchWithValidation } from "./client.js"
import type {
  UseNotificationDeliveriesOptions,
  UseNotificationReminderRulesOptions,
  UseNotificationReminderRunsOptions,
  UseNotificationTemplateOptions,
  UseNotificationTemplatesOptions,
} from "./hooks/index.js"
import { notificationsQueryKeys, type RemindersPreviewFilters } from "./query-keys.js"
import {
  notificationDeliveryListResponse,
  notificationDeliverySingleResponse,
  notificationReminderRuleListResponse,
  notificationReminderRuleSingleResponse,
  notificationReminderRunListResponse,
  notificationReminderRunSingleResponse,
  notificationSettingsResponse,
  notificationTemplateListResponse,
  notificationTemplateSingleResponse,
  reminderRuleStagesListResponse,
  reminderStageChannelsListResponse,
  remindersPreviewResponse,
  staffAlertPreferencesResponse,
  staffAlertSettingsResponse,
} from "./schemas.js"

function toQueryString(filters: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === "all") continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

export function getNotificationTemplatesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseNotificationTemplatesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: notificationsQueryKeys.templatesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/notifications/templates${toQueryString(filters)}`,
        notificationTemplateListResponse,
        client,
      ),
  })
}

export function getNotificationTemplateQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
  _options: UseNotificationTemplateOptions = {},
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.template(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/templates/${id}`,
        notificationTemplateSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getNotificationDeliveriesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseNotificationDeliveriesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: notificationsQueryKeys.deliveriesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/notifications/deliveries${toQueryString(filters)}`,
        notificationDeliveryListResponse,
        client,
      ),
  })
}

export function getNotificationDeliveryQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.delivery(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/deliveries/${id}`,
        notificationDeliverySingleResponse,
        client,
      )
      return data
    },
  })
}

export function getNotificationReminderRulesQueryOptions(
  client: FetchWithValidationOptions,
  options: UseNotificationReminderRulesOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderRulesList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/notifications/reminder-rules${toQueryString(filters)}`,
        notificationReminderRuleListResponse,
        client,
      ),
  })
}

export function getNotificationReminderRuleQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderRule(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/reminder-rules/${id}`,
        notificationReminderRuleSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getNotificationReminderRunsQueryOptions(
  client: FetchWithValidationOptions,
  options: UseNotificationReminderRunsOptions = {},
) {
  const { enabled: _enabled = true, ...filters } = options
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderRunsList(filters),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/notifications/reminder-runs${toQueryString(filters)}`,
        notificationReminderRunListResponse,
        client,
      ),
  })
}

export function getNotificationReminderRunQueryOptions(
  client: FetchWithValidationOptions,
  id: string,
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderRun(id),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/reminder-runs/${id}`,
        notificationReminderRunSingleResponse,
        client,
      )
      return data
    },
  })
}

export function getReminderRuleStagesQueryOptions(
  client: FetchWithValidationOptions,
  reminderRuleId: string,
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderRuleStages(reminderRuleId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/reminder-rules/${reminderRuleId}/stages`,
        reminderRuleStagesListResponse,
        client,
      )
      return data
    },
  })
}

export function getReminderStageChannelsQueryOptions(
  client: FetchWithValidationOptions,
  reminderRuleId: string,
  stageId: string,
) {
  return queryOptions({
    queryKey: notificationsQueryKeys.reminderStageChannels(stageId),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/reminder-rules/${reminderRuleId}/stages/${stageId}/channels`,
        reminderStageChannelsListResponse,
        client,
      )
      return data
    },
  })
}

export function getNotificationSettingsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: notificationsQueryKeys.notificationSettings(),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/notification-settings`,
        notificationSettingsResponse,
        client,
      )
      return data
    },
  })
}

export function getRemindersPreviewQueryOptions(
  client: FetchWithValidationOptions,
  filters: RemindersPreviewFilters = {},
) {
  const queryParams: Record<string, string | undefined> = {
    date: filters.date,
    ruleId: filters.ruleId,
    targetId: filters.targetId,
  }
  return queryOptions({
    queryKey: notificationsQueryKeys.remindersPreview(filters),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/reminders/preview${toQueryString(queryParams)}`,
        remindersPreviewResponse,
        client,
      )
      return data
    },
  })
}

export function getStaffAlertSettingsQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: notificationsQueryKeys.staffAlerts(),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/staff-alerts`,
        staffAlertSettingsResponse,
        client,
      )
      return data
    },
  })
}

export function getStaffAlertPreferencesQueryOptions(client: FetchWithValidationOptions) {
  return queryOptions({
    queryKey: notificationsQueryKeys.staffAlertPreferences(),
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/staff-alert-preferences`,
        staffAlertPreferencesResponse,
        client,
      )
      return data
    },
  })
}
