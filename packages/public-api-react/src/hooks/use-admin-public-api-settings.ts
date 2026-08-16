"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { updateAdminPublicApiSettings } from "../operations.js"
import { useVoyantPublicApiContext } from "../provider.js"
import { publicApiQueryKeys } from "../query-keys.js"
import { getAdminPublicApiSettingsQueryOptions } from "../query-options.js"
import type { PublicApiSettingsPatchInput } from "../schemas.js"

export interface UseAdminPublicApiSettingsOptions {
  enabled?: boolean
}

export function useAdminPublicApiSettings(options: UseAdminPublicApiSettingsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const { enabled = true } = options

  return useQuery({
    ...getAdminPublicApiSettingsQueryOptions({ baseUrl, fetcher }),
    enabled,
  })
}

export function useAdminPublicApiSettingsMutation() {
  const { baseUrl, fetcher } = useVoyantPublicApiContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: PublicApiSettingsPatchInput) => {
      const { data } = await updateAdminPublicApiSettings({ baseUrl, fetcher }, input)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(publicApiQueryKeys.adminSettings(), { data })
      void queryClient.invalidateQueries({ queryKey: publicApiQueryKeys.adminSettings() })
      void queryClient.invalidateQueries({ queryKey: publicApiQueryKeys.settings() })
    },
  })
}
