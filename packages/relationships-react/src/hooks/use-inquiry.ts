"use client"

import { useQuery } from "@tanstack/react-query"
import { useVoyantContext } from "../provider.js"
import { getInquiryQueryOptions } from "../query-options.js"

export function useInquiry(id: string, options: { enabled?: boolean } = {}) {
  const client = useVoyantContext()
  return useQuery({
    ...getInquiryQueryOptions(client, id),
    enabled: (options.enabled ?? true) && Boolean(id),
  })
}
