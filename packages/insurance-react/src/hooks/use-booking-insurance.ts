"use client"

import { useQuery } from "@tanstack/react-query"

import { type InsuranceClientOptions, resolveInsuranceClient } from "../client.js"
import { getBookingInsuranceQueryOptions } from "../query-options.js"

export interface UseBookingInsuranceOptions extends InsuranceClientOptions {
  enabled?: boolean
}

/**
 * Everything insurance-related on one booking: the applications opened with
 * each insurer and the policies that came out of them.
 *
 * Both halves are fetched together because they are read together — a policy in
 * `issue_failed` is only interpretable next to the application it failed for.
 */
export function useBookingInsurance(
  bookingId: string | null | undefined,
  options: UseBookingInsuranceOptions,
) {
  const { enabled = true, ...clientOptions } = options
  return useQuery({
    ...getBookingInsuranceQueryOptions(resolveInsuranceClient(clientOptions), bookingId ?? ""),
    enabled: enabled && Boolean(bookingId),
  })
}
