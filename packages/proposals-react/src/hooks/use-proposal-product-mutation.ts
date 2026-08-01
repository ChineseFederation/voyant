"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalProductSingleResponse, successEnvelope } from "../schemas.js"

export interface CreateProposalProductInput {
  nameSnapshot: string
  quantity?: number
  unitPriceAmountCents?: number | null
  currency?: string | null
  description?: string | null
  productId?: string | null
  supplierServiceId?: string | null
  costAmountCents?: number | null
  discountAmountCents?: number | null
}

export type UpdateProposalProductInput = Partial<CreateProposalProductInput>

/** Create / update / remove a proposal's line-item products. */
export function useProposalProductMutation() {
  const { baseUrl, fetcher } = useVoyantContext()
  const queryClient = useQueryClient()

  const invalidate = (proposalId: string) => {
    void queryClient.invalidateQueries({
      queryKey: proposalsQueryKeys.proposalProducts(proposalId),
    })
    void queryClient.invalidateQueries({ queryKey: proposalsQueryKeys.proposal(proposalId) })
  }

  const create = useMutation({
    mutationFn: async ({
      proposalId,
      input,
    }: {
      proposalId: string
      input: CreateProposalProductInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/products`,
        proposalProductSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  const update = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      proposalId: string
      input: UpdateProposalProductInput
    }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/proposals/proposal-products/${id}`,
        proposalProductSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  const remove = useMutation({
    mutationFn: async ({ id }: { id: string; proposalId: string }) => {
      await fetchWithValidation(
        `/v1/admin/proposals/proposal-products/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        { method: "DELETE" },
      )
    },
    onSuccess: (_data, vars) => invalidate(vars.proposalId),
  })

  return { create, update, remove }
}
