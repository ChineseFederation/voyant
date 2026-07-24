"use client"

import { useMutation } from "@tanstack/react-query"
import type { previewNotificationTemplateSchema } from "@voyant-travel/notifications/validation"
import type { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantNotificationsContext } from "../provider.js"
import { notificationTemplatePreviewResponse } from "../schemas.js"

export type PreviewNotificationTemplateInput = z.input<typeof previewNotificationTemplateSchema>

export function useNotificationTemplatePreview() {
  const { baseUrl, fetcher } = useVoyantNotificationsContext()

  return useMutation({
    mutationFn: async (input: PreviewNotificationTemplateInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/notifications/preview",
        notificationTemplatePreviewResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
  })
}
