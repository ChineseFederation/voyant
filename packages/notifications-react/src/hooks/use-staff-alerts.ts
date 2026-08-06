"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantNotificationsContext } from "../provider.js"
import { notificationsQueryKeys } from "../query-keys.js"
import {
  getStaffAlertPreferencesQueryOptions,
  getStaffAlertSettingsQueryOptions,
} from "../query-options.js"
import {
  staffAlertPreferencesResponse,
  staffAlertSettingResponse,
  staffAlertTestResponse,
} from "../schemas.js"

export interface UpdateStaffAlertSettingInput {
  eventKey: string
  enabled?: boolean
  routeToAssignee?: boolean
  routeToRoles?: string[]
  extraAddresses?: string[]
}

/** Deployment-wide staff alert configuration. Admin surface. */
export function useStaffAlertSettings() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()
  return useQuery(getStaffAlertSettingsQueryOptions({ baseUrl, fetcher }))
}

export function useStaffAlertSettingMutation() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventKey, ...body }: UpdateStaffAlertSettingInput) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/staff-alerts/${encodeURIComponent(eventKey)}`,
        staffAlertSettingResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(body) },
      )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.staffAlerts() })
      // A deployment default gates every user's effective state, so the
      // per-user view is stale the moment this lands.
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.staffAlertPreferences(),
      })
    },
  })
}

/**
 * Send a sample of one alert to the signed-in user.
 *
 * Not invalidating anything on success is deliberate — a test send changes no
 * configuration, only the deliveries ledger.
 */
export function useStaffAlertTestMutation() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()

  return useMutation({
    mutationFn: async (eventKey: string) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/notifications/staff-alerts/${encodeURIComponent(eventKey)}/test`,
        staffAlertTestResponse,
        { baseUrl, fetcher },
        { method: "POST" },
      )
      return data
    },
  })
}

/** The signed-in user's own alert preferences. */
export function useStaffAlertPreferences() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()
  return useQuery(getStaffAlertPreferencesQueryOptions({ baseUrl, fetcher }))
}

export function useStaffAlertPreferenceMutation() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ eventKey, enabled }: { eventKey: string; enabled: boolean | null }) => {
      const path = `/v1/admin/notifications/staff-alert-preferences/${encodeURIComponent(eventKey)}`
      // `null` means "stop overriding" — a DELETE, not a PUT of some third
      // value. Modelling inherit as an explicit stored value would lose the
      // distinction between "I chose on" and "I never chose".
      const { data } =
        enabled === null
          ? await fetchWithValidation(
              path,
              staffAlertPreferencesResponse,
              { baseUrl, fetcher },
              {
                method: "DELETE",
              },
            )
          : await fetchWithValidation(
              path,
              staffAlertPreferencesResponse,
              { baseUrl, fetcher },
              {
                method: "PUT",
                body: JSON.stringify({ enabled }),
              },
            )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.staffAlertPreferences(),
      })
    },
  })
}
