"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchWithValidation } from "../client.js"
import { useVoyantContext } from "../provider.js"
import { proposalsQueryKeys } from "../query-keys.js"
import { proposalProductListResponse } from "../schemas.js"

export interface UseProposalProductsOptions {
  enabled?: boolean
}

/** Lists a proposal's products — the line items (flights, stays, experiences, …). */
export function useProposalProducts(
  proposalId: string | undefined,
  options: UseProposalProductsOptions = {},
) {
  const { baseUrl, fetcher } = useVoyantContext()
  const { enabled = true } = options

  return useQuery({
    queryKey: proposalsQueryKeys.proposalProducts(proposalId ?? ""),
    queryFn: () =>
      fetchWithValidation(
        `/v1/admin/proposals/proposals/${proposalId}/products`,
        proposalProductListResponse,
        {
          baseUrl,
          fetcher,
        },
      ),
    enabled: enabled && Boolean(proposalId),
  })
}
