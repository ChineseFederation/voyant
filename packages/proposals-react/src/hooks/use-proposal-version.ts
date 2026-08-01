"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalVersionLineListResponse, proposalVersionSingleResponse } from "../schemas.js"

export interface UseProposalVersionOptions {
  enabled?: boolean
}

export function useProposalVersion(
  id: string | undefined,
  options: UseProposalVersionOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalVersion(id ?? ""),
    queryFn: async () => {
      if (!id) throw new Error("useProposalVersion requires an id")
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${id}`,
        proposalVersionSingleResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: enabled && Boolean(id),
  })
}

export function useProposalVersionLines(
  proposalVersionId: string | undefined,
  options: UseProposalVersionOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalVersionLines(proposalVersionId ?? ""),
    queryFn: async () => {
      if (!proposalVersionId)
        throw new Error("useProposalVersionLines requires a proposalVersionId")
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-versions/${proposalVersionId}/lines`,
        proposalVersionLineListResponse,
        { baseUrl, fetcher },
      )
      return data
    },
    enabled: enabled && Boolean(proposalVersionId),
  })
}
