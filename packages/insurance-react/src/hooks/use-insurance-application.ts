"use client"

import { useQuery } from "@tanstack/react-query"

import { type InsuranceClientOptions, resolveInsuranceClient } from "../client.js"
import { getInsuranceApplicationQueryOptions } from "../query-options.js"

export interface UseInsuranceApplicationOptions extends InsuranceClientOptions {
  enabled?: boolean
}

/**
 * One application, including its insured persons.
 *
 * Whether the insured persons come back identified depends on the caller's
 * `insurance-pii:read` grant, and the answer travels on each person as
 * `identityVisibility`. Read that rather than testing whether `identity` is
 * null: a redacted identity is not an absent one.
 */
export function useInsuranceApplication(
  applicationId: string | null | undefined,
  options: UseInsuranceApplicationOptions,
) {
  const { enabled = true, ...clientOptions } = options
  return useQuery({
    ...getInsuranceApplicationQueryOptions(
      resolveInsuranceClient(clientOptions),
      applicationId ?? "",
    ),
    enabled: enabled && Boolean(applicationId),
  })
}
