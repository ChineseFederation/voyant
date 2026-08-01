"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalMediaListResponse } from "../schemas.js"

export interface UseProposalMediaOptions {
  enabled?: boolean
}

/** Lists a proposal's media (images / videos / documents shown on the proposal). */
export function useProposalMedia(
  proposalId: string | undefined,
  options: UseProposalMediaOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalMedia(proposalId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/media`,
        proposalMediaListResponse,
        {
          baseUrl,
          fetcher,
        },
      ),
    enabled: enabled && Boolean(proposalId),
  })
}
