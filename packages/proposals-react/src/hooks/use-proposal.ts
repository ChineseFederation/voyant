"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalSingleResponse } from "../schemas.js"

export interface UseProposalOptions {
  enabled?: boolean
}

export function useProposal(id: string | undefined, options: UseProposalOptions = {}) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposal(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("useProposal requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${id}`,
        proposalSingleResponse,
        {
          baseUrl,
          fetcher,
        },
      )
      return data
    },
    enabled: enabled && Boolean(id),
  })
}
