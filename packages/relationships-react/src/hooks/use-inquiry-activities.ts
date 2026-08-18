"use client"

import { useQuery } from "@tanstack/react-query"
import { inquiryActivityListResponseSchema } from "@voyant-travel/relationships-contracts"
import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { relationshipsQueryKeys } from "../query-keys.js"

export function useInquiryActivities(id: string, options: { enabled?: boolean } = {}) {
  const client = useVoyantContext()
  return useQuery({
    queryKey: relationshipsQueryKeys.inquiryActivities(id),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/relationships/inquiries/${id}/activities?limit=200&offset=0`,
        inquiryActivityListResponseSchema,
        client,
      ),
    enabled: (options.enabled ?? true) && Boolean(id),
  })
}
