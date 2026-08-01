"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalSingleResponse } from "../schemas.js"

export interface CreateProposalInput {
  title: string
  pipelineId: string
  stageId: string
  personId?: string | null
  organizationId?: string | null
  ownerId?: string | null
  status?: string
  acceptedVersionId?: string | null
  valueAmountCents?: number | null
  valueCurrency?: string | null
  expectedCloseDate?: string | null
  source?: string | null
  sourceRef?: string | null
  lostReason?: string | null
  tags?: string[]
  [key: string]: unknown
}

export type UpdateProposalInput = Partial<CreateProposalInput>

const deleteResponseSchema = z.object({ success: z.boolean() })

export function useProposalMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: async (input: CreateProposalInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/proposals/proposals",
        proposalSingleResponse,
        {
          baseUrl,
          fetcher,
        },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposals() })
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateProposalInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${id}`,
        proposalSingleResponse,
        {
          baseUrl,
          fetcher,
        },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposals() })
      queryClient.setQueryData(proposalsQueryKeys.proposal(data.id), data)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      return fetchWithValidation(
        `/v1/admin/proposals/proposals/${id}`,
        deleteResponseSchema,
        {
          baseUrl,
          fetcher,
        },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposals() })
      queryClient.removeQueries({ queryKey: proposalsQueryKeys.proposal(id) })
    },
  })

  return { create, update, remove }
}
