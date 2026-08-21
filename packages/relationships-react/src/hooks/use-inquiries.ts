"use client"

import { useQuery } from "@tanstack/react-query"
import { useVoyantContext } from "../provider.js"
import type { InquiriesListFilters } from "../query-keys.js"
import { getInquiriesQueryOptions } from "../query-options.js"

export interface UseInquiriesOptions extends InquiriesListFilters {
  enabled?: boolean
}

export function useInquiries(options: UseInquiriesOptions = {}) {
  const client = useVoyantContext()
  const { enabled = true, ...filters } = options
  return useQuery({ ...getInquiriesQueryOptions(client, filters), enabled })
}
