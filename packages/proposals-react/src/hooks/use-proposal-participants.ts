"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalParticipantListResponse } from "../schemas.js"

export interface UseProposalParticipantsOptions {
  enabled?: boolean
}

/** Lists a proposal's participants (the travelers / PAX). */
export function useProposalParticipants(
  proposalId: string | undefined,
  options: UseProposalParticipantsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalParticipants(proposalId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/participants`,
        proposalParticipantListResponse,
        { baseUrl, fetcher },
      ),
    enabled: enabled && Boolean(proposalId),
  })
}
