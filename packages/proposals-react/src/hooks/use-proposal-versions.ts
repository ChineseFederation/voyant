"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { type ProposalVersionsListFilters, proposalsQueryKeys } from "../query-keys.js"
import { proposalVersionListResponse } from "../schemas.js"

export interface UseProposalVersionsOptions extends ProposalVersionsListFilters {
  enabled?: boolean
}

export function useProposalVersions(options: UseProposalVersionsOptions = {}) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true, ...filters } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalVersionsList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.proposalId) params.set("proposalId", filters.proposalId)
      if (filters.status) params.set("status", filters.status)
      if (filters.limit !== undefined) params.set("limit", String(filters.limit))
      if (filters.offset !== undefined) params.set("offset", String(filters.offset))
      const qs = params.toString()
      return fetchWithValidation(
        `/v1/admin/proposals/proposal-versions${qs ? `?${qs}` : ""}`,
        proposalVersionListResponse,
        { baseUrl, fetcher },
      )
    },
    enabled,
  })
}
