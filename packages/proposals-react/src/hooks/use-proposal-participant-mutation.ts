"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalParticipantSingleResponse, successEnvelope } from "../schemas.js"

export interface CreateProposalParticipantInput {
  personId: string
  role?: "traveler" | "booker" | "decision_maker" | "finance" | "other"
  isPrimary?: boolean
}

/** Add / remove travelers (participants / PAX) on a proposal. */
export function useProposalParticipantMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const invalidate = (proposalId: string) => {
    void queryClient.invalidateQueries({
      queryKey: proposalsQueryKeys.proposalParticipants(proposalId),
    })
  }

  const create = useMutation({
    mutationFn: async ({
      proposalId,
      input,
    }: {
      proposalId: string
      input: CreateProposalParticipantInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/participants`,
        proposalParticipantSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; proposalId: string }) => {
      await fetchWithValidation(
        `/v1/admin/proposals/proposal-participants/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  return { create, remove }
}
