"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { type InsuranceClientOptions, resolveInsuranceClient } from "../client.js"
import { insuranceQueryKeys } from "../query-keys.js"
import {
  cancelInsurancePolicyRequest,
  getInsurancePolicyQueryOptions,
  retryInsuranceIssueRequest,
} from "../query-options.js"

export interface UseInsurancePolicyOptions extends InsuranceClientOptions {
  enabled?: boolean
}

export function useInsurancePolicy(
  policyId: string | null | undefined,
  options: UseInsurancePolicyOptions,
) {
  const { enabled = true, ...clientOptions } = options
  return useQuery({
    ...getInsurancePolicyQueryOptions(resolveInsuranceClient(clientOptions), policyId ?? ""),
    enabled: enabled && Boolean(policyId),
  })
}

/**
 * Ask the insurer to issue again.
 *
 * Invalidates the booking overview as well as the policy: the two are rendered
 * side by side, and a fresh policy next to a stale "issue failed" banner is
 * worse than showing neither.
 */
export function useRetryInsuranceIssue(options: InsuranceClientOptions) {
  const client = resolveInsuranceClient(options)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { policyId: string; reason?: string }) =>
      retryInsuranceIssueRequest(client, input),
    onSuccess: async (policy) => {
      await queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.policy(policy.id) })
      if (policy.bookingId) {
        await queryClient.invalidateQueries({
          queryKey: insuranceQueryKeys.booking(policy.bookingId),
        })
      }
    },
  })
}

export function useCancelInsurancePolicy(options: InsuranceClientOptions) {
  const client = resolveInsuranceClient(options)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { policyId: string; reason: string }) =>
      cancelInsurancePolicyRequest(client, input),
    onSuccess: async (policy) => {
      await queryClient.invalidateQueries({ queryKey: insuranceQueryKeys.policy(policy.id) })
      if (policy.bookingId) {
        await queryClient.invalidateQueries({
          queryKey: insuranceQueryKeys.booking(policy.bookingId),
        })
      }
    },
  })
}
